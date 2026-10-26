/**
 * tts-client.ts — giọng tiếng Việt thật trong trình duyệt (B2, Issue #20).
 *
 *     actor.say ──► chuanBi(): fetch /tts → decode → đo durationMs THẬT
 *                     │                      (bridge: bridge/tts.ts)
 *                     └─► phat(): AudioBufferSource + nhép miệng theo RMS
 *
 * Bốn quyết định đáng ghi:
 *
 * 1. **Tải và giải mã TRƯỚC khi sân khấu bắt đầu nói.** `actor.say` phải trả
 *    `durationMs` đúng bằng độ dài audio, nên lớp này đo xong rồi mới cho
 *    nhân vật mở miệng. Thời lượng được báo vào `so-tieng.ts` để
 *    `uocThoiLuongNoi` (bong bóng chữ, hẹn giờ hành động) dùng đúng số đó.
 *
 * 2. **Biên độ tính sẵn từ AudioBuffer, không đọc `AnalyserNode`.** Nhép miệng
 *    phải đúng cả khi máy không có thiết bị âm thanh (Playwright headless, máy
 *    chủ không loa): envelope RMS mỗi 50 ms lấy thẳng từ mẫu PCM đã giải mã,
 *    rồi phát theo đồng hồ `AudioContext` — luôn có mẫu > 0, không phụ thuộc
 *    sound card.
 *
 * 3. **Bridge tắt thì không báo lỗi, chỉ nhường chỗ.** `chuanBi` trả `null`,
 *    cờ chặn Web Speech hạ xuống, nên `NhanVat.noi` lại dùng Web Speech
 *    `vi-VN` như A1 (không có giọng Việt thì nhép theo độ dài chữ như cũ).
 *    Toast nhắc `pnpm bridge` hiện **một lần mỗi phiên**.
 *
 * 4. **Hàng đợi theo actor.** Hai câu cho cùng một nhân vật không chồng tiếng;
 *    `huy(actor)` (gọi từ `actor.stop` / `actor.emote`) cắt cả câu đang phát
 *    lẫn câu đang đợi.
 */
import {
  datChanWebSpeech,
  datDoThoiLuongThat,
  timMiengNhep,
  type MiengNhep,
} from './so-tieng';

/** Bridge TTS mặc định (xem `bridge/tts.ts`). */
export const URL_MAC_DINH = 'http://127.0.0.1:8788';

/** Lấy mẫu biên độ mỗi 50 ms — đủ mượt cho miệng, nhẹ cho CPU. */
export const BUOC_RMS_MS = 50;

export interface ThamSoNoi {
  /** `"nu"` | `"nam"` | tên giọng Edge đầy đủ. */
  voice?: string;
  /** Cảm xúc (`actor.say`) — hiện chỉ đổi tốc độ/cao độ rất nhẹ. */
  emotion?: string;
}

export interface CauDaTai {
  /** Thời lượng audio THẬT (ms). */
  durationMs: number;
  /** Bắt đầu phát + nhép miệng. Gọi nhiều lần cũng chỉ phát một lần. */
  phat(): void;
  /** Cắt ngay (im tiếng, miệng về nhép mặc định). */
  huy(): void;
}

/**
 * Giọng mặc định theo nhân vật: `owner` là Sếp → giọng **nam**, còn lại (gen,
 * lan…) → giọng **nữ**. `voice` truyền tay luôn thắng.
 */
export function giongTheoActor(actorId: string, voice?: string): string {
  if (voice && voice.trim()) return voice.trim();
  return actorId.toLowerCase() === 'owner' ? 'nam' : 'nu';
}

/** Cảm xúc → tốc độ/cao độ (nhẹ tay: giọng Việt sai nhịp là nghe rất giả). */
function theoCamXuc(emotion?: string): { rate: number; pitch: number } {
  // Boss 26/10: "giọng TTS sao kỳ" — đổi cao độ theo cảm xúc làm giọng neural
  // nghe méo/robot. Giữ cao độ gốc (pitch 0), chỉ đổi tốc độ rất nhẹ.
  switch (emotion) {
    case 'vui':
    case 'rat-vui':
    case 'thanh-cong':
      return { rate: 4, pitch: 0 };
    case 'buon':
    case 'that-bai':
    case 'met':
      return { rate: -6, pitch: 0 };
    case 'ngac-nhien':
      return { rate: 3, pitch: 0 };
    default:
      return { rate: 0, pitch: 0 };
  }
}

/* --------------------------------------------------------------- biên độ */

/**
 * Envelope RMS mỗi `BUOC_RMS_MS` ms, chuẩn hoá theo đỉnh (0–1).
 *
 * Chuẩn hoá vì mp3 của edge-tts khá nhỏ tiếng: lấy RMS thô thì miệng chỉ hé
 * ~0,15. Lấy kênh 0 là đủ (giọng mono 24 kHz).
 */
export function doEnvelope(
  mau: Float32Array,
  sampleRate: number,
  buocMs = BUOC_RMS_MS,
): Float32Array {
  const buoc = Math.max(1, Math.round((sampleRate * buocMs) / 1000));
  const n = Math.max(1, Math.ceil(mau.length / buoc));
  const ra = new Float32Array(n);
  let dinh = 0;
  for (let i = 0; i < n; i++) {
    const tu = i * buoc;
    const den = Math.min(mau.length, tu + buoc);
    let tong = 0;
    for (let j = tu; j < den; j++) tong += mau[j]! * mau[j]!;
    const rms = Math.sqrt(tong / Math.max(1, den - tu));
    ra[i] = rms;
    if (rms > dinh) dinh = rms;
  }
  if (dinh > 0) for (let i = 0; i < n; i++) ra[i] = Math.min(1, ra[i]! / dinh);
  return ra;
}

/* ----------------------------------------------------------- khoá cache */

/**
 * Khoá nhận dạng câu phía trình duyệt. Chỉ để gộp yêu cầu trùng trong một
 * phiên — cache thật nằm ở đĩa của bridge (`bamCache` trong `bridge/tts.ts`).
 */
export function khoaCau(text: string, ts: ThamSoNoi = {}): string {
  const { rate, pitch } = theoCamXuc(ts.emotion);
  return `${ts.voice ?? ''}|${rate}|${pitch}|${text}`;
}

/* ------------------------------------------------------------ lớp tiếng */

interface CauDangPhat {
  nguon: AudioBufferSourceNode | null;
  hen: number;
  mieng: MiengNhep | null;
}

export interface CauHinhTieng {
  /** Gốc bridge TTS. */
  url?: string;
  /** Hiện toast cho Boss (main.ts truyền vào). */
  toast?: (chu: string) => void;
  /** Thay `fetch` (test). */
  fetchFn?: typeof fetch;
  /** Thay chỗ tạo AudioContext (test). */
  taoCtx?: () => AudioContext | null;
}

export class LopTieng {
  private url: string;
  private toast?: (chu: string) => void;
  private fetchFn: typeof fetch;
  private taoCtxFn: () => AudioContext | null;

  private ctx: AudioContext | null = null;
  /** `true` sau khi Boss bấm "Bật tiếng" (hoặc ctx tự chạy được). */
  private daBat = false;
  /** Bridge im lặng → không thử lại dồn dập, và chỉ nhắc một lần. */
  private daNhac = false;
  private bridgeHong = false;

  /** Thời lượng thật đã đo, theo nguyên văn câu (cho `uocThoiLuongNoi`). */
  private daiTheoCau = new Map<string, number>();
  /** Buffer đã giải mã, theo `khoaCau` — nói lại câu cũ không tải lại. */
  private buffer = new Map<string, AudioBuffer>();
  /** Đang phát, theo actor. */
  private dangPhat = new Map<string, CauDangPhat>();
  /** Đuôi hàng đợi theo actor. */
  private hangDoi = new Map<string, Promise<void>>();
  /** Số đo cho script bằng chứng: đã gửi bao nhiêu mẫu RMS, đỉnh bao nhiêu. */
  private thongKeMieng = new Map<string, { soMau: number; soMauDuong: number; dinh: number }>();

  constructor(cfg: CauHinhTieng = {}) {
    this.url = (cfg.url ?? urlTuQuery()).replace(/\/+$/, '');
    this.toast = cfg.toast;
    this.fetchFn = cfg.fetchFn ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
    this.taoCtxFn = cfg.taoCtx ?? taoCtxMacDinh;
    // Báo thời lượng thật cho sân khấu (`uocThoiLuongNoi` trong nhanvat.ts).
    datDoThoiLuongThat((chu) => this.daiTheoCau.get(chu) ?? null);
  }

  /** Nhận cấu hình muộn (main.ts biết `toast` sau khi dựng giao diện). */
  capHinh(cfg: CauHinhTieng): void {
    if (cfg.url) this.url = cfg.url.replace(/\/+$/, '');
    if (cfg.toast) this.toast = cfg.toast;
  }

  /** Có đang dùng được giọng edge-tts không (đã tải được ít nhất một câu). */
  coGiong(): boolean {
    return !this.bridgeHong;
  }

  /** Boss đã cho phát tiếng chưa (chính sách autoplay). */
  daBatTieng(): boolean {
    return this.daBat;
  }

  /**
   * Mở khoá autoplay: phải gọi trong một cú bấm/gõ thật của người dùng.
   * Trả `true` khi `AudioContext` đã `running`.
   */
  async batTieng(): Promise<boolean> {
    const a = this.layCtx();
    if (!a) return false;
    try {
      if (a.state === 'suspended') await a.resume();
    } catch {
      /* trình duyệt từ chối — coi như chưa bật */
    }
    this.daBat = a.state === 'running';
    return this.daBat;
  }

  private layCtx(): AudioContext | null {
    if (!this.ctx) this.ctx = this.taoCtxFn();
    return this.ctx;
  }

  /**
   * Tải + giải mã một câu. `null` = không có giọng edge-tts (bridge tắt, trình
   * duyệt không có Web Audio…) → bên gọi cứ để sân khấu nói như cũ.
   *
   * Luôn đặt cờ chặn Web Speech **trước khi trả về**, để `NhanVat.noi` biết có
   * nên tự đọc hay không.
   */
  async chuanBi(actorId: string, text: string, ts: ThamSoNoi = {}): Promise<CauDaTai | null> {
    const cau = text.trim();
    if (!cau) return this.khongCoGiong();
    const a = this.layCtx();
    if (!a) return this.khongCoGiong();

    const voice = giongTheoActor(actorId, ts.voice);
    const khoa = khoaCau(cau, { ...ts, voice });
    let buf = this.buffer.get(khoa);

    if (!buf) {
      if (this.bridgeHong) return this.khongCoGiong();
      const { rate, pitch } = theoCamXuc(ts.emotion);
      const q = new URLSearchParams({
        text: cau,
        voice,
        rate: String(rate),
        pitch: String(pitch),
      });
      let r: Response;
      try {
        r = await this.fetchFn(`${this.url}/tts?${q}`);
      } catch {
        // Lỗi MẠNG (bridge tắt) → chốt cờ, nhưng tự gỡ sau 15 s để bật bridge là có giọng lại.
        this.bridgeHong = true;
        setTimeout(() => (this.bridgeHong = false), 15_000);
        return this.khongCoGiong();
      }
      try {
        if (!r.ok) throw new Error(`bridge trả ${r.status}`);
        const tho = await r.arrayBuffer();
        if (tho.byteLength === 0) throw new Error('bridge trả 0 byte');
        buf = await a.decodeAudioData(tho);
        this.buffer.set(khoa, buf);
      } catch (e) {
        // Lỗi của RIÊNG câu này (voice sai, text hỏng…) → không chốt cờ, câu sau vẫn có giọng.
        console.warn('[tts] câu này không có giọng:', (e as Error).message);
        return this.khongCoGiong();
      }
    }

    const durationMs = Math.round(buf.duration * 1000);
    this.daiTheoCau.set(cau, durationMs);
    this.bridgeHong = false;
    // Có giọng thật rồi → Web Speech phải im, không thì nói chồng hai tiếng.
    datChanWebSpeech(true);

    const envelope = doEnvelope(buf.getChannelData(0), buf.sampleRate);
    let daPhat = false;
    const cauNay: CauDaTai = {
      durationMs,
      phat: () => {
        if (daPhat) return;
        daPhat = true;
        void this.vaoHangDoi(actorId, () => this.phatNgay(actorId, buf!, envelope));
      },
      huy: () => this.huy(actorId),
    };
    return cauNay;
  }

  private khongCoGiong(): null {
    datChanWebSpeech(false);
    if (!this.daNhac && this.bridgeHong) {
      this.daNhac = true;
      this.toast?.('Chưa có giọng: bật `pnpm bridge`');
    }
    return null;
  }

  /** Nối vào đuôi hàng đợi của actor (không chồng tiếng cùng một người). */
  private vaoHangDoi(actorId: string, viec: () => Promise<void>): Promise<void> {
    const truoc = this.hangDoi.get(actorId) ?? Promise.resolve();
    const sau = truoc.then(viec, viec);
    this.hangDoi.set(actorId, sau);
    return sau;
  }

  private async phatNgay(
    actorId: string,
    buf: AudioBuffer,
    envelope: Float32Array,
  ): Promise<void> {
    const a = this.layCtx();
    if (!a) return;
    // Chưa ai bấm "Bật tiếng" → vẫn nhép miệng đúng nhịp, chỉ là không ra tiếng.
    if (a.state === 'suspended') {
      try {
        await a.resume();
      } catch {
        /* vẫn chạy phần nhép miệng */
      }
      this.daBat = dangChay(a);
    }

    this.dungCauCua(actorId);
    const mieng = timMiengNhep(actorId);
    let nguon: AudioBufferSourceNode | null = null;
    try {
      nguon = a.createBufferSource();
      nguon.buffer = buf;
      nguon.connect(a.destination);
      nguon.start();
    } catch {
      nguon = null; // không phát được tiếng — vẫn nhép miệng cho khớp bong bóng
    }

    const batDau = Date.now();
    const dai = buf.duration * 1000;
    const dangPhat: CauDangPhat = { nguon, hen: 0, mieng };
    this.dangPhat.set(actorId, dangPhat);

    await new Promise<void>((xong) => {
      const nhip = () => {
        const troi = Date.now() - batDau;
        if (troi >= dai || this.dangPhat.get(actorId) !== dangPhat) {
          mieng?.nhepMiengTheoBienDo(0);
          if (this.dangPhat.get(actorId) === dangPhat) this.dangPhat.delete(actorId);
          xong();
          return;
        }
        const i = Math.min(envelope.length - 1, Math.floor(troi / BUOC_RMS_MS));
        const rms = envelope[i] ?? 0;
        this.demMau(actorId, rms);
        mieng?.nhepMiengTheoBienDo(rms);
        dangPhat.hen = setTimeoutDung(nhip, BUOC_RMS_MS);
      };
      nhip();
    });
  }

  private demMau(actorId: string, rms: number): void {
    const tk = this.thongKeMieng.get(actorId) ?? { soMau: 0, soMauDuong: 0, dinh: 0 };
    tk.soMau++;
    if (rms > 0) tk.soMauDuong++;
    if (rms > tk.dinh) tk.dinh = rms;
    this.thongKeMieng.set(actorId, tk);
  }

  private dungCauCua(actorId: string): void {
    const d = this.dangPhat.get(actorId);
    if (!d) return;
    this.dangPhat.delete(actorId);
    if (d.hen) clearTimeout(d.hen);
    try {
      d.nguon?.stop();
    } catch {
      /* đã dừng rồi */
    }
    d.mieng?.nhepMiengTheoBienDo(0);
  }

  /** Cắt tiếng của một actor (từ `actor.stop`, `actor.emote`, `stage.reset`). */
  huy(actorId: string): void {
    this.dungCauCua(actorId);
    this.hangDoi.delete(actorId);
  }

  /**
   * Số đo nhép miệng của một actor (bằng chứng B2: `scripts/kiem-b2.mjs`).
   * `soMauDuong` = số mẫu RMS > 0 đã đẩy vào `nhepMiengTheoBienDo`.
   */
  thongKe(actorId: string): { soMau: number; soMauDuong: number; dinh: number } {
    return this.thongKeMieng.get(actorId) ?? { soMau: 0, soMauDuong: 0, dinh: 0 };
  }

  /** Cắt tiếng của mọi actor. */
  huyHet(): void {
    for (const id of [...this.dangPhat.keys()]) this.dungCauCua(id);
    this.hangDoi.clear();
  }
}

/** Đọc qua hàm để TypeScript không thu hẹp kiểu `state` sau `resume()`. */
function dangChay(a: AudioContext): boolean {
  return a.state === 'running';
}

function setTimeoutDung(fn: () => void, ms: number): number {
  return setTimeout(fn, ms) as unknown as number;
}

function taoCtxMacDinh(): AudioContext | null {
  try {
    const g = globalThis as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const C = g.AudioContext ?? g.webkitAudioContext;
    return C ? new C() : null;
  } catch {
    return null;
  }
}

function urlTuQuery(): string {
  try {
    const q = new URLSearchParams(location.search).get('ttsUrl');
    return q ?? URL_MAC_DINH;
  } catch {
    return URL_MAC_DINH;
  }
}

/* --------------------------------------------------------------- số ít */

let chung: LopTieng | null = null;

/**
 * Lớp tiếng dùng chung. Trả `null` ngoài trình duyệt (test Node, SSR) để
 * `commands/actor.ts` nạp được mà không cần Web Audio.
 */
export function lopTieng(): LopTieng | null {
  if (typeof window === 'undefined') return null;
  if (!chung) chung = new LopTieng();
  return chung;
}
