/**
 * mic.ts — GIỮ PHÍM V ĐỂ NÓI (C1, Issue #31; sửa trên Firefox F3, Issue #56).
 *
 *     bấm "🔊 Bật tiếng" ──► XIN QUYỀN MIC luôn (một cử chỉ người dùng)
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
 *    đang mở" để quên, và không bao giờ nghe lén — khi không ghi thì các track
 *    bị `enabled = false`, trình duyệt gửi im lặng, không mẩu âm nào vào mã này.
 *
 * ---
 *
 * **F3 (#56 mục 3) — vì sao "voice chat không nghe" trên Firefox của Boss.**
 *
 * Bản C1 được chứng minh trên Chromium với `--use-fake-ui-for-media-stream`:
 * cờ đó CHO QUYỀN NGAY, không hỏi. Firefox thật thì khác hẳn, và đo được:
 *
 *     navigator.permissions.query({name:'microphone'}) → "prompt"
 *     giữ V → getUserMedia() gọi lúc t=18618 ms … KHÔNG BAO GIỜ trả lời
 *     nút 🎤 không đổi màu · 0 mẫu RMS · 0 byte gửi · ô chat trống
 *     KHÔNG toast, KHÔNG lỗi console — chết lặng hoàn toàn
 *
 * Vì sao chết lặng: `getUserMedia` treo ở hộp hỏi quyền của Firefox. Đẩy-để-nói
 * thì Boss **nhả phím trước khi** kịp bấm "Cho phép", nên bản cũ gặp
 * `batLuc === 0`, đóng stream và `return` — không một dòng nào nói ra. Và
 * Firefox trên `http://localhost` **không nhớ quyền**, nên lượt sau lại hỏi.
 *
 * Ba thay đổi chữa đúng chỗ đó:
 *
 * a. **Xin quyền ở một cú bấm khác**: nút "🔊 Bật tiếng" (`nut-tieng.ts`) gọi
 *    `xinQuyenMic()`. Boss bấm một lần, hộp hỏi quyền hiện lúc Boss đang rảnh
 *    tay chứ không phải lúc đang giữ phím V.
 * b. **Firefox không nhớ quyền → GIỮ SẴN stream** (track tắt tiếng) cho hết
 *    phiên. Lượt nói sau không có hộp hỏi quyền nào, không trễ, không treo.
 *    Nếu Firefox có nhớ (Boss tick "Ghi nhớ quyết định") thì đóng stream lại,
 *    mở lại mỗi lượt chỉ mất ~30 ms (đo thật trên Firefox 147).
 * c. **Không còn đường chết lặng**: mọi bước ghi `console.info('[mic]', …)` và
 *    vào `thongKe().buoc`; nhả phím giữa lúc hỏi quyền thì giữ mic lại và nói
 *    "bấm lần nữa để nói" chứ không im.
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
/** Giữ bấy nhiêu dòng log gần nhất trong `thongKe()` (bằng chứng F3). */
const SO_DONG_LOG = 40;
/**
 * Ba cờ này là của trình duyệt, miễn phí, và bù đúng cái mic phòng Boss thiếu:
 * vọng loa, ồn quạt máy, giọng xa mic.
 */
const RANG_BUOC: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

export interface OChatLike {
  /** Gửi câu đi (đúng hàm ô chat dùng khi Boss bấm Enter). */
  gui(chu: string): Promise<boolean>;
  /** Đổ chữ vào ô nhập cho Boss xem/sửa; trả hàm huỷ chờ. */
  datNhap(chu: string, tuGuiSauMs: number | null): void;
  /** Có đang gõ trong ô chat không (thì V là chữ "v", không phải mic). */
  dangGoChu(): boolean;
  /**
   * F3 (#56) — một dòng trạng thái mic ngay trên ô chat: "🎤 đang nghe…",
   * "⏳ đang nhận dạng…", "nghe được: «…»". `null` = xoá dòng.
   *
   * Boss nhìn ô chat chứ không nhìn console: không có dòng này thì mic hỏng
   * hay mic chậm đều giống nhau — đều là "không nghe".
   */
  trangThai(chu: string | null): void;
}

/** Kết quả xin quyền mic — `nut-tieng.ts` dùng để chọn câu báo cho Boss. */
export type KetQuaQuyen = 'duoc' | 'tu-choi' | 'khong-co-mic' | 'loi';

export interface Mic {
  /** Có dùng được không (bridge có STT + trình duyệt có mic). */
  dung(): boolean;
  /**
   * F3 — xin quyền mic NGAY trong cú bấm của Boss. Gọi từ handler `click`
   * (nút "🔊 Bật tiếng"), KHÔNG gọi lúc nạp trang: hộp hỏi quyền bật ra khi
   * Boss không chờ đợi gì là Boss bấm "Chặn".
   */
  xinQuyen(): Promise<KetQuaQuyen>;
  /** Quyền mic đang ở trạng thái nào (theo lần đo gần nhất). */
  quyen(): TrangThaiQuyen;
  /** Bắt đầu / kết thúc bằng tay (script bằng chứng và nút 🎤 dùng). */
  batGhi(): Promise<void>;
  ketGhi(): Promise<void>;
  /** Đang ghi không. */
  dangGhi(): boolean;
  /** Số đo lượt gần nhất (bằng chứng `scripts/kiem-c1.mjs`). */
  thongKe(): ThongKeMic;
  thao(): void;
}

/** `cho` = Firefox sẽ hỏi; `duoc` = đã cho; `tu-choi` = Boss/Firefox đã chặn. */
export type TrangThaiQuyen = 'chua-biet' | 'cho' | 'duoc' | 'tu-choi';

export interface ThongKeMic {
  soMauRms: number;
  dinhRms: number;
  coTieng: boolean;
  byteGui: number;
  /** Dạng MediaRecorder thật sinh ra (Firefox: `audio/ogg; codecs=opus`). */
  dangBlob: string;
  text: string;
  confidence: number;
  /** Trễ đo từ lúc nhả phím tới lúc có chữ (ms) — số Boss cảm nhận. */
  treMs: number;
  loi: string;
  /* ------------------------------------------------- F3 (#56): bằng chứng */
  /** Quyền mic lần đo gần nhất. */
  quyen: TrangThaiQuyen;
  /** Firefox có nhớ quyền không (false = phải giữ stream sẵn cả phiên). */
  nhoQuyen: boolean;
  /** Đang giữ sẵn một stream cho phiên này. */
  giuStream: boolean;
  /** Từng bước đã chạy, để Boss/Issue đọc khi mic lại "không nghe". */
  buoc: string[];
}

export interface CauHinhMic {
  /** Gốc HTTP của bridge STT, vd `http://127.0.0.1:8790`. */
  urlStt: string;
  oChat: OChatLike;
  toast: (chu: string) => void;
}

const TRONG: Omit<ThongKeMic, 'quyen' | 'nhoQuyen' | 'giuStream' | 'buoc'> = {
  soMauRms: 0,
  dinhRms: 0,
  coTieng: false,
  byteGui: 0,
  dangBlob: '',
  text: '',
  confidence: 0,
  treMs: 0,
  loi: '',
};

/**
 * Cầu nối sang `nut-tieng.ts` mà KHÔNG phải sửa `main.ts`.
 *
 * `batMic()` đăng ký mình vào đây; nút "🔊 Bật tiếng" gọi `xinQuyenMic()` trong
 * chính handler `click` của nó. Hai file không import vòng nhau, và thứ tự lắp
 * trong `main.ts` (mic trước, nút tiếng sau) giữ nguyên.
 */
let micDangChay: Mic | null = null;

/** Xin quyền mic từ một cú bấm bất kỳ. `false` = chưa có lớp mic nào chạy. */
export async function xinQuyenMic(): Promise<KetQuaQuyen | false> {
  return micDangChay ? await micDangChay.xinQuyen() : false;
}

/** Quyền mic hiện tại (nút "🔊 Bật tiếng" đọc để chọn chữ trên nút). */
export function quyenMicHienTai(): TrangThaiQuyen {
  return micDangChay?.quyen() ?? 'chua-biet';
}

/**
 * Bật mic. Gọi được cả khi bridge chưa có STT: `dung()` trả `false`, nút 🎤
 * mờ đi, phím V không làm gì — không toast lỗi mỗi lần Boss gõ chữ "v".
 */
export function batMic(ch: CauHinhMic): Mic {
  let coStt = false;
  let ghi: MediaRecorder | null = null;
  /** Stream đang ghi lượt này (có thể chính là `streamSan`). */
  let stream: MediaStream | null = null;
  /**
   * Stream giữ sẵn cả phiên — CHỈ khi Firefox không nhớ quyền. Track luôn
   * `enabled = false` ngoài lúc ghi, nên trình duyệt gửi im lặng.
   */
  let streamSan: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let hen = 0;
  let soDo: SoDoAm | null = null;
  let batLuc = 0;
  let nhaLuc = 0;
  let quyen: TrangThaiQuyen = 'chua-biet';
  let nhoQuyen = false;
  /** Đang trong `batGhi()` (chặn pointer + touch bắn hai lần). */
  let dangMo = false;
  const buoc: string[] = [];
  let tk: ThongKeMic = moiThongKe();
  /** Khối audio đã ghi — nhả phím mới biết hết. */
  let manh: Blob[] = [];
  /** Dạng MediaRecorder báo lúc `start()` (sau `stop()` Firefox trả rỗng). */
  let dangMime = '';
  let dangDoi: Promise<void> | null = null;
  /** Một lần xin quyền đang bay — đừng gọi `getUserMedia` hai lần song song. */
  let dangXin: Promise<KetQuaQuyen> | null = null;

  function moiThongKe(): ThongKeMic {
    return { ...TRONG, quyen, nhoQuyen, giuStream: conSong(streamSan), buoc: [...buoc] };
  }

  /** Mọi bước đều ghi ra — "không nghe" phải để lại dấu vết đọc được. */
  function ghiBuoc(...x: unknown[]): void {
    const dong = x.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ');
    buoc.push(`${new Date().toISOString().slice(11, 23)} ${dong}`);
    if (buoc.length > SO_DONG_LOG) buoc.shift();
    console.info('[mic]', dong);
  }

  /* -------------------------------------------------------- nút 🎤 (mobile) */

  const nut = taoNut();

  /* ------------------------------------------------ hỏi bridge có STT chưa */
  void fetch(`${ch.urlStt}/stt/khoe`)
    .then((r) => (r.ok ? r.json() : null))
    .then((g: { daCai?: boolean } | null) => {
      coStt = g?.daCai === true;
      nut?.classList.toggle('tat', !coStt);
      ghiBuoc(`bridge STT ${coStt ? 'sẵn' : 'CHƯA CÀI'} tại ${ch.urlStt}`);
      if (!coStt)
        console.info(
          '[Gen-Stage] Chưa cài nhận dạng giọng. Chạy: bash scripts/fetch-stt.sh',
        );
    })
    .catch((e: Error) => {
      coStt = false;
      nut?.classList.toggle('tat', true);
      ghiBuoc(`không hỏi được ${ch.urlStt}/stt/khoe — ${e.message}`);
    });

  /* ----------------------------------------------------------- quyền mic */

  function conSong(s: MediaStream | null): s is MediaStream {
    return s !== null && s.getAudioTracks().some((t) => t.readyState === 'live');
  }

  /**
   * Đọc quyền qua Permissions API. Firefox có hỗ trợ `microphone` (đo thật:
   * trả `"prompt"`), Safari thì không — không đọc được thì trả `chua-biet`
   * chứ không đoán, vì đoán sai là lại hỏi quyền giữa lúc Boss giữ phím.
   */
  async function doQuyen(): Promise<TrangThaiQuyen> {
    try {
      const t = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      return t.state === 'granted' ? 'duoc' : t.state === 'denied' ? 'tu-choi' : 'cho';
    } catch {
      return 'chua-biet';
    }
  }

  function tatTieng(s: MediaStream, bat: boolean): void {
    for (const t of s.getAudioTracks()) t.enabled = bat;
  }

  function dongStreamRoi(s: MediaStream | null): void {
    for (const t of s?.getTracks() ?? []) t.stop();
  }

  /**
   * Mở mic. Đây là chỗ DUY NHẤT gọi `getUserMedia`, nên mọi đường (nút Bật
   * tiếng, phím V, nút 🎤) đều đi qua cùng một lần hỏi quyền và cùng một log.
   */
  async function xinQuyen(): Promise<KetQuaQuyen> {
    if (conSong(streamSan)) {
      ghiBuoc('đã có mic giữ sẵn — không cần hỏi quyền');
      return 'duoc';
    }
    if (dangXin) return await dangXin;

    dangXin = (async (): Promise<KetQuaQuyen> => {
      quyen = await doQuyen();
      ghiBuoc(`xin quyền mic (trước khi hỏi: ${quyen})`);
      const t0 = Date.now();
      let s: MediaStream;
      try {
        s = await navigator.mediaDevices.getUserMedia(RANG_BUOC);
      } catch (e) {
        const er = e as DOMException;
        tk.loi = er.message;
        quyen = er.name === 'NotAllowedError' ? 'tu-choi' : quyen;
        ghiBuoc(`KHÔNG mở được mic sau ${Date.now() - t0} ms — ${er.name}: ${er.message}`);
        if (er.name === 'NotAllowedError') {
          // Một dòng, đúng việc Boss phải làm, không giải thích kỹ thuật.
          ch.toast('🎤 Mic bị chặn — bấm biểu tượng 🎤 bên trái thanh địa chỉ → "Cho phép", rồi bấm "Bật tiếng" lại');
          return 'tu-choi';
        }
        if (er.name === 'NotFoundError' || er.name === 'OverconstrainedError') {
          ch.toast('🎤 Máy không thấy mic nào — cắm mic/tai nghe rồi bấm "Bật tiếng" lại');
          return 'khong-co-mic';
        }
        ch.toast(`🎤 Không mở được mic (${er.name})`);
        return 'loi';
      }

      quyen = 'duoc';
      nhoQuyen = (await doQuyen()) === 'duoc';
      ghiBuoc(
        `mic MỞ sau ${Date.now() - t0} ms · track "${s.getAudioTracks()[0]?.label ?? '?'}" · ` +
          `Firefox ${nhoQuyen ? 'NHỚ' : 'KHÔNG nhớ'} quyền`,
      );
      if (nhoQuyen) {
        // Nhớ rồi thì không giữ mic mở: mở lại mỗi lượt mất ~30 ms, và đèn mic
        // của máy không sáng khi Boss không nói.
        dongStreamRoi(s);
        ch.toast('🎤 Đã cho quyền mic — giữ phím V (hoặc bấm 🎤) để nói');
      } else {
        streamSan = s;
        tatTieng(s, false);
        // Một dòng hướng dẫn, vì đây là cái Boss phải biết: trên
        // `http://localhost` Firefox không cho tick "Ghi nhớ quyết định", nên
        // mic phải để sẵn cả phiên và đèn mic sẽ sáng.
        ch.toast('🎤 Mic mở cho phiên này (Firefox không nhớ quyền trên localhost) — giữ V để nói');
      }
      return 'duoc';
    })().finally(() => {
      dangXin = null;
    });
    return await dangXin;
  }

  /* ------------------------------------------------------------- ghi tiếng */

  async function batGhi(): Promise<void> {
    if (ghi || dangMo) return;
    if (!coStt) {
      ghiBuoc('bỏ qua lượt nói: bridge chưa có STT');
      return;
    }
    dangMo = true;
    batLuc = Date.now();
    tk = moiThongKe();
    manh = [];
    try {
      const s = conSong(streamSan) ? streamSan : null;
      if (s) {
        stream = s;
        tatTieng(s, true);
        ghiBuoc('dùng mic giữ sẵn — 0 ms, không hỏi quyền');
      } else {
        /*
         * Quyền đã có VÀ Firefox nhớ nó → mở lại thẳng, không qua `xinQuyen`:
         * đi qua đó là mở → đóng (vì "đã nhớ") → mở lại, ba lần `getUserMedia`
         * cho một lượt nói. Còn lại thì `xinQuyen` lo (nó mới là chỗ quyết
         * định giữ stream hay không, và chỗ toast đúng câu cho từng ca).
         */
        if (!(quyen === 'duoc' && nhoQuyen) && (await xinQuyen()) !== 'duoc') {
          batLuc = 0;
          return;
        }
        if (conSong(streamSan)) {
          stream = streamSan;
          tatTieng(streamSan, true);
        } else {
          try {
            stream = await navigator.mediaDevices.getUserMedia(RANG_BUOC);
            ghiBuoc('mở mic bằng quyền đã nhớ');
          } catch (e) {
            tk.loi = (e as Error).message;
            ghiBuoc(`mở lại mic thất bại — ${(e as Error).message}`);
            ch.toast('🎤 Không mở được mic — bấm "Bật tiếng" lại');
            batLuc = 0;
            return;
          }
        }
      }

      /*
       * Boss nhả phím trong lúc Firefox còn hỏi quyền — ĐÚNG ca Boss gặp.
       *
       * Bản cũ đóng mic và `return` lặng lẽ, nên Boss bấm "Cho phép" rồi vẫn
       * thấy "không nghe" mãi. Giờ mic đã mở và được giữ lại (xem `xinQuyen`),
       * nên chỉ cần nói Boss bấm lần nữa là lượt sau chạy ngay.
       */
      if (batLuc === 0) {
        if (stream !== streamSan) dongStreamRoi(stream);
        else tatTieng(streamSan, false);
        stream = null;
        ghiBuoc('nhả phím trước khi có quyền — mic đã mở, chờ lượt sau');
        ch.toast('🎤 Mic đã mở — giữ phím V (hoặc bấm 🎤) lần nữa để nói');
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
      /*
       * Đọc `mimeType` NGAY sau `start()`, không đợi `stop()`.
       *
       * Đo thật trên Firefox 147: sau `stop()` thuộc tính này trả **chuỗi
       * rỗng**, nên bản đầu gửi `Content-Type: application/octet-stream` và
       * `thongKe().dangBlob` trống — không đọc ra được Firefox mã hoá bằng gì
       * khi sau này lại "không nghe".
       */
      ghi.addEventListener('dataavailable', (e) => {
        if (e.data.size > 0) manh.push(e.data);
      });
      ghi.start();
      dangMime = ghi.mimeType || 'audio/ogg; codecs=opus';
      nut?.classList.add('dang-ghi');
      ghiBuoc(`đang ghi · dạng "${dangMime}"`);
      ch.oChat.trangThai('🎤 đang nghe…');
    } finally {
      dangMo = false;
    }
  }

  /** Đóng vòng ghi: stream giữ sẵn thì chỉ tắt tiếng, không stop track. */
  function dongStream(): void {
    if (hen) {
      clearInterval(hen);
      hen = 0;
    }
    if (stream && stream === streamSan) tatTieng(stream, false);
    else dongStreamRoi(stream);
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
      r.addEventListener('stop', () => giai(new Blob(manh, { type: dangMime })));
    });
    r.stop();
    const khoi = await xong;
    const dai2 = soDo ? soDo.ket() : null;
    tk.soMauRms = soDo?.soMau ?? 0;
    tk.dinhRms = dai2?.dinh ?? 0;
    tk.coTieng = dai2?.coTieng ?? false;
    tk.dangBlob = khoi.type;
    dongStream();
    soDo = null;
    ghiBuoc(
      `nhả · ${tk.soMauRms} mẫu RMS · đỉnh ${tk.dinhRms.toFixed(4)} · ` +
        `coTieng ${tk.coTieng} · ${khoi.size} byte "${khoi.type}"`,
    );

    if (tk.soMauRms * BUOC_RMS_MS < GIU_TOI_THIEU_MS) {
      ch.oChat.trangThai(null);
      ghiBuoc('bấm lỡ (giữ < 250 ms) — bỏ qua');
      return;
    }
    if (!dai2?.coTieng) {
      ch.oChat.trangThai(null);
      ch.toast('🎤 Không nghe thấy gì — giữ V rồi nói gần mic hơn');
      return;
    }
    if (khoi.size === 0) {
      // Không bao giờ thấy trên Firefox 147, nhưng nếu có thì phải nói ra chứ
      // không gửi 0 byte cho bridge rồi báo "bridge trả gói lạ".
      ch.oChat.trangThai(null);
      ch.toast('🎤 MediaRecorder không ghi được byte nào — tải lại trang');
      ghiBuoc('blob 0 byte');
      return;
    }
    dangDoi = gui(khoi, dai2.tuMs, dai2.denMs);
    await dangDoi;
  }

  /* ---------------------------------------------------- gửi lên bridge STT */

  async function gui(khoi: Blob, tuMs: number, denMs: number): Promise<void> {
    tk.byteGui = khoi.size;
    const t0 = Date.now();
    ch.oChat.trangThai('⏳ đang nhận dạng…');
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
      ghiBuoc(`POST ${u} lỗi — ${tk.loi}`);
      ch.oChat.trangThai(null);
      ch.toast('🎤 Bridge không trả lời — `pnpm bridge` còn chạy không?');
      return;
    }
    tk.treMs = Date.now() - t0;
    if (!g || typeof g.text !== 'string') {
      tk.loi = g?.error ?? 'bridge trả gói lạ';
      ghiBuoc(`bridge trả lỗi — ${tk.loi}`);
      ch.oChat.trangThai(null);
      ch.toast(`🎤 ${tk.loi}`);
      return;
    }
    tk.text = g.text;
    tk.confidence = Number(g.confidence ?? 0);
    ghiBuoc(`nghe được sau ${tk.treMs} ms · tin ${tk.confidence} · "${tk.text.slice(0, 60)}"`);
    if (!tk.text) {
      ch.oChat.trangThai(null);
      ch.toast('🎤 Nghe không ra chữ nào — nói lại chậm hơn');
      return;
    }

    ch.oChat.trangThai(`nghe được: «${tk.text}»`);
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
    /*
     * F3 (#56) — thêm `touchstart/touchend` cho trình duyệt không có Pointer
     * Events (Firefox cũ trên Android, WebView trong app). `dangMo`/`ghi` chặn
     * bắn hai lần khi trình duyệt có CẢ hai họ sự kiện, nên không sợ chồng.
     */
    b.addEventListener('touchstart', (ev) => {
      ev.preventDefault();
      void batGhi();
    });
    for (const t of ['touchend', 'touchcancel'] as const)
      b.addEventListener(t, (ev) => {
        ev.preventDefault();
        void ketGhi();
      });
    o.insertBefore(b, o.querySelector('button[type="submit"]'));
    return b;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // Mất focus giữa lúc giữ phím: đóng mic, đừng ghi tiếp sau lưng Boss.
  window.addEventListener('blur', () => void ketGhi());

  const api: Mic = {
    dung: () => coStt,
    xinQuyen,
    quyen: () => quyen,
    batGhi,
    ketGhi: async () => {
      await ketGhi();
      await dangDoi;
    },
    dangGhi: () => ghi !== null,
    thongKe: () => ({ ...tk, quyen, nhoQuyen, giuStream: conSong(streamSan), buoc: [...buoc] }),
    thao() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      dongStream();
      dongStreamRoi(streamSan);
      streamSan = null;
      nut?.remove();
      if (micDangChay === api) micDangChay = null;
    },
  };
  micDangChay = api;
  // Đọc quyền sẵn một lần để nút "🔊 Bật tiếng" biết có cần xin mic không.
  void doQuyen().then((t) => {
    quyen = t;
    ghiBuoc(`quyền mic lúc nạp trang: ${t}`);
  });
  return api;
}
