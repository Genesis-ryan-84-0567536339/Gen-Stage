/**
 * mic.ts — GIỮ PHÍM V ĐỂ NÓI (C1, Issue #31).
 *
 *     giữ V / giữ 🎤 ──► MediaRecorder + đo RMS (src/audio/vad.ts)
 *          nhả      ──► POST /stt (bridge/stt.ts) ──► chữ + độ tin
 *                   ──► đổ vào ô chat, chờ 1,5 s cho Boss sửa
 *                   ──► Enter gửi ngay / hết 1,5 s tự gửi nếu tin cậy cao
 *                   ──► actor.say owner → user.text + user.speech
 *
 * **Bốn quyết định đáng ghi**
 *
 * 1. **Chữ nhận được KHÔNG tự gửi ngay.** Nhận dạng tiếng Việt trên CPU không
 *    bao giờ đúng 100 %; gửi thẳng là Gen làm sai việc mà Boss không kịp thấy
 *    mình nói gì. Chữ hiện vào ô chat (chỗ Boss vẫn gõ) 1,5 s: Enter gửi ngay,
 *    Esc bỏ, sửa chữ thì phiếu giọng bị xoá và câu tính là gõ tay.
 * 2. **Tin cậy thấp thì KHÔNG tự gửi.** Dưới `TIN_DU` thì chữ ở lại ô chat chờ
 *    Boss quyết — thà Boss gõ thêm một nhịp hơn là Gen dựng sai connector.
 * 3. **Đi đúng cửa ô chat, không có đường tắt.** Mic không gọi `dispatcher.run`
 *    mà gọi `oChat.gui()`, nên Boss nói hay gõ đều ra cùng một `actor.say` lên
 *    nhân vật `owner` → cùng `user.text` cho não (spec mục 3.5), cộng thêm
 *    `user.speech` nhờ phiếu trong `so-giong.ts`.
 * 4. **Giữ phím, không bấm bật/tắt.** Đẩy-để-nói: không có trạng thái "mic
 *    đang mở" để quên, và không bao giờ nghe lén — stream mở lúc nhấn, đóng
 *    lúc nhả.
 */
import { SoDoAm, tinhRms } from './vad';
import { datPhieuGiong } from './so-giong';

/** Dưới mức này thì không tự gửi, để Boss tự bấm Enter. */
export const TIN_DU = 0.6;
/** Chờ bấy nhiêu ms cho Boss sửa trước khi tự gửi (Issue #31 chốt 1,5 s). */
export const CHO_SUA_MS = 1500;
/** Nhịp đo RMS — 50 ms, cùng nhịp nhép miệng của B2 cho dễ đọc log. */
const BUOC_RMS_MS = 50;
/** Giữ phím ngắn hơn thế này là bấm lỡ, không phải muốn nói. */
const GIU_TOI_THIEU_MS = 250;
/** Mã phím giữ để nói. */
const PHIM = 'KeyV';

export interface OChatLike {
  /** Gửi câu đi (đúng hàm ô chat dùng khi Boss bấm Enter). */
  gui(chu: string): Promise<boolean>;
  /** Đổ chữ vào ô nhập cho Boss xem/sửa; trả hàm huỷ chờ. */
  datNhap(chu: string, tuGuiSauMs: number | null): void;
  /** Có đang gõ trong ô chat không (thì V là chữ "v", không phải mic). */
  dangGoChu(): boolean;
}

export interface Mic {
  /** Có dùng được không (bridge có STT + trình duyệt có mic). */
  dung(): boolean;
  /** Bắt đầu / kết thúc bằng tay (script bằng chứng và nút 🎤 dùng). */
  batGhi(): Promise<void>;
  ketGhi(): Promise<void>;
  /** Đang ghi không. */
  dangGhi(): boolean;
  /** Số đo lượt gần nhất (bằng chứng `scripts/kiem-c1.mjs`). */
  thongKe(): ThongKeMic;
  thao(): void;
}

export interface ThongKeMic {
  soMauRms: number;
  dinhRms: number;
  coTieng: boolean;
  byteGui: number;
  text: string;
  confidence: number;
  /** Trễ đo từ lúc nhả phím tới lúc có chữ (ms) — số Boss cảm nhận. */
  treMs: number;
  loi: string;
}

export interface CauHinhMic {
  /** Gốc HTTP của bridge STT, vd `http://127.0.0.1:8790`. */
  urlStt: string;
  oChat: OChatLike;
  toast: (chu: string) => void;
}

const TRONG: ThongKeMic = {
  soMauRms: 0,
  dinhRms: 0,
  coTieng: false,
  byteGui: 0,
  text: '',
  confidence: 0,
  treMs: 0,
  loi: '',
};

/**
 * Bật mic. Gọi được cả khi bridge chưa có STT: `dung()` trả `false`, nút 🎤
 * mờ đi, phím V không làm gì — không toast lỗi mỗi lần Boss gõ chữ "v".
 */
export function batMic(ch: CauHinhMic): Mic {
  let coStt = false;
  let ghi: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let hen = 0;
  let soDo: SoDoAm | null = null;
  let batLuc = 0;
  let nhaLuc = 0;
  let tk: ThongKeMic = { ...TRONG };
  /** Khối audio đã ghi — nhả phím mới biết hết. */
  let manh: Blob[] = [];
  let dangDoi: Promise<void> | null = null;

  /* -------------------------------------------------------- nút 🎤 (mobile) */

  const nut = taoNut();

  /* ------------------------------------------------ hỏi bridge có STT chưa */
  void fetch(`${ch.urlStt}/stt/khoe`)
    .then((r) => (r.ok ? r.json() : null))
    .then((g: { daCai?: boolean } | null) => {
      coStt = g?.daCai === true;
      nut?.classList.toggle('tat', !coStt);
      if (!coStt)
        console.info(
          '[Gen-Stage] Chưa cài nhận dạng giọng. Chạy: bash scripts/fetch-stt.sh',
        );
    })
    .catch(() => {
      coStt = false;
      nut?.classList.toggle('tat', true);
    });

  /* ------------------------------------------------------------- ghi tiếng */

  async function batGhi(): Promise<void> {
    if (ghi || !coStt) return;
    batLuc = Date.now();
    tk = { ...TRONG };
    manh = [];
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Ba cờ này là của trình duyệt, miễn phí, và bù đúng cái mic phòng Boss
        // thiếu: vọng loa, ồn quạt máy, giọng xa mic.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      tk.loi = (e as Error).message;
      ch.toast('🎤 Không mở được mic — xem quyền trong trình duyệt');
      return;
    }
    // Boss nhả phím trước khi trình duyệt kịp mở mic → đóng luôn, đừng ghi lén.
    if (batLuc === 0) {
      dongStream();
      return;
    }

    ctx = new AudioContext();
    const nguon = ctx.createMediaStreamSource(stream);
    const doc = ctx.createAnalyser();
    doc.fftSize = 1024;
    nguon.connect(doc);
    const dem = new Float32Array(doc.fftSize);
    soDo = new SoDoAm(BUOC_RMS_MS);
    hen = window.setInterval(() => {
      doc.getFloatTimeDomainData(dem);
      soDo?.them(tinhRms(dem));
    }, BUOC_RMS_MS);

    ghi = new MediaRecorder(stream);
    ghi.addEventListener('dataavailable', (e) => {
      if (e.data.size > 0) manh.push(e.data);
    });
    ghi.start();
    nut?.classList.add('dang-ghi');
  }

  function dongStream(): void {
    if (hen) {
      clearInterval(hen);
      hen = 0;
    }
    for (const t of stream?.getTracks() ?? []) t.stop();
    stream = null;
    void ctx?.close();
    ctx = null;
    nut?.classList.remove('dang-ghi');
  }

  async function ketGhi(): Promise<void> {
    const r = ghi;
    batLuc = 0;
    if (!r) return;
    ghi = null;
    nhaLuc = Date.now();
    void nhaLuc;

    const xong = new Promise<Blob>((giai) => {
      r.addEventListener('stop', () => giai(new Blob(manh, { type: r.mimeType })));
    });
    r.stop();
    const khoi = await xong;
    const dai2 = soDo ? soDo.ket() : null;
    tk.soMauRms = soDo?.soMau ?? 0;
    tk.dinhRms = dai2?.dinh ?? 0;
    tk.coTieng = dai2?.coTieng ?? false;
    dongStream();
    soDo = null;

    if (tk.soMauRms * BUOC_RMS_MS < GIU_TOI_THIEU_MS) return; // bấm lỡ
    if (!dai2?.coTieng) {
      ch.toast('🎤 Không nghe thấy gì — giữ V rồi nói gần mic hơn');
      return;
    }
    dangDoi = gui(khoi, dai2.tuMs, dai2.denMs);
    await dangDoi;
  }

  /* ---------------------------------------------------- gửi lên bridge STT */

  async function gui(khoi: Blob, tuMs: number, denMs: number): Promise<void> {
    tk.byteGui = khoi.size;
    const t0 = Date.now();
    // Cắt im lặng: bridge đưa `tu`/`den` thẳng cho ffmpeg, nên trình duyệt
    // không phải giải mã opus để cắt mẫu (Firefox không có bộ mã hoá wav).
    const u = `${ch.urlStt}/stt?tu=${Math.round(tuMs)}&den=${Math.round(denMs)}`;
    /** Đúng khuôn `KetQuaStt` của `bridge/stt.ts` (phần trình duyệt cần). */
    interface GoiStt {
      text?: string;
      confidence?: number;
      goiGen?: boolean;
      error?: string;
    }
    let g: GoiStt | null = null;
    try {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': khoi.type || 'application/octet-stream' },
        body: khoi,
      });
      g = (await r.json()) as GoiStt;
    } catch (e) {
      tk.loi = (e as Error).message;
      ch.toast('🎤 Bridge không trả lời — `pnpm bridge` còn chạy không?');
      return;
    }
    tk.treMs = Date.now() - t0;
    if (!g || typeof g.text !== 'string') {
      tk.loi = g?.error ?? 'bridge trả gói lạ';
      ch.toast(`🎤 ${tk.loi}`);
      return;
    }
    tk.text = g.text;
    tk.confidence = Number(g.confidence ?? 0);
    if (!tk.text) {
      ch.toast('🎤 Nghe không ra chữ nào — nói lại chậm hơn');
      return;
    }

    // Phiếu giọng để `actor.say` biết câu này đến từ mic → bắn `user.speech`.
    datPhieuGiong({
      text: tk.text,
      confidence: tk.confidence,
      durationMs: tk.treMs,
      goiGen: Boolean(g.goiGen),
    });
    // Tin cậy cao thì tự gửi sau 1,5 s; thấp thì để Boss quyết.
    ch.oChat.datNhap(tk.text, tk.confidence >= TIN_DU ? CHO_SUA_MS : null);
  }

  /* --------------------------------------------------------------- phím V */

  function onKeyDown(e: KeyboardEvent): void {
    if (e.code !== PHIM || e.repeat) return;
    if (ch.oChat.dangGoChu()) return; // đang gõ thì V là chữ "v"
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    void batGhi();
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (e.code !== PHIM) return;
    void ketGhi();
  }

  function taoNut(): HTMLButtonElement | null {
    const o = document.getElementById('o-chat');
    if (!o) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'nut-mic';
    b.textContent = '🎤';
    b.title = 'Giữ để nói (hoặc giữ phím V)';
    b.setAttribute('aria-label', 'Giữ để nói');
    // `pointerdown/up` chứ không `click`: đẩy-để-nói cần giữ, và pointer phủ cả
    // chuột lẫn ngón tay nên điện thoại không cần nhánh riêng.
    b.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      void batGhi();
    });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave'] as const)
      b.addEventListener(t, () => void ketGhi());
    o.insertBefore(b, o.querySelector('button[type="submit"]'));
    return b;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // Mất focus giữa lúc giữ phím: đóng mic, đừng ghi tiếp sau lưng Boss.
  window.addEventListener('blur', () => void ketGhi());

  return {
    dung: () => coStt,
    batGhi,
    ketGhi: async () => {
      await ketGhi();
      await dangDoi;
    },
    dangGhi: () => ghi !== null,
    thongKe: () => ({ ...tk }),
    thao() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      dongStream();
      nut?.remove();
    },
  };
}
