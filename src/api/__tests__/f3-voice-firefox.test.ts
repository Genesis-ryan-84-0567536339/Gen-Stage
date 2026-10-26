/**
 * f3-voice-firefox.test.ts — VOICE CHAT TRÊN FIREFOX (F3, Issue #56 mục 3).
 *
 * Boss trên Firefox + GPU thật: **"voice chat không nghe"**. Tái hiện bằng
 * Playwright Firefox thật (`scripts/kiem-f3.mjs`) cho ra đúng một nguyên nhân,
 * và nó không phải mic, không phải ffmpeg, không phải CORS:
 *
 *     navigator.permissions.query({name:'microphone'}) → "prompt"
 *     giữ V → getUserMedia() gọi lúc t=18618 ms … KHÔNG BAO GIỜ trả lời
 *     0 mẫu RMS · 0 byte gửi · ô chat trống · KHÔNG toast · KHÔNG lỗi console
 *
 * `getUserMedia` treo ở hộp hỏi quyền của Firefox. Mic là **đẩy-để-nói**, nên
 * Boss nhả phím V trước khi kịp bấm "Cho phép"; bản cũ gặp `batLuc === 0` thì
 * đóng mic và `return` **lặng lẽ**. Và Firefox trên `http://localhost` không
 * nhớ quyền, nên lượt sau lại hỏi lại y thế — vòng lặp không bao giờ ra chữ.
 *
 * Bốn lời hứa của bản sửa, mỗi cái một test:
 *
 * 1. Firefox KHÔNG nhớ quyền → mic được **giữ sẵn** cả phiên, lượt nói sau
 *    **không gọi `getUserMedia` lần nữa** (không hộp hỏi quyền, không trễ).
 * 2. Nhả phím giữa lúc đang hỏi quyền → **có toast** nói Boss bấm lần nữa, và
 *    lượt ngay sau đó **ra chữ** (không còn đường chết lặng).
 * 3. Boss/Firefox chặn mic → **một dòng** hướng dẫn đúng việc phải làm.
 * 4. Vòng đủ: ô chat đi qua "🎤 đang nghe…" → "⏳ đang nhận dạng…" →
 *    "nghe được: «…»", rồi chữ vào ô nhập với hẹn tự gửi 1,5 s.
 *
 * Cộng một test cho `bridge/stt.ts`: preflight CORS từ cổng Vite phải trả đủ
 * `Allow-Origin` + `Allow-Methods` + `Max-Age`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHO_SUA_MS, batMic, type Mic, type OChatLike } from '../../audio/mic';
import { batStt } from '../../../bridge/stt';

/* ========================================================== DOM/mic giả ===
 *
 * `vitest` chạy môi trường `node` (xem `vite.config.ts`), nên mọi thứ trình
 * duyệt phải dựng tay. Dựng **mỏng nhất đủ dùng**: cái cần kiểm là luồng
 * quyền mic, không phải DOM.
 */

/** Ngưỡng RMS giả — cao hơn `nguongSan` của `vad.ts` nên VAD thấy "có tiếng". */
const RMS_GIA = 0.3;

interface MicGia {
  /** Số lần `getUserMedia` được gọi — mấu chốt của lời hứa 1. */
  soLanGoi: number;
  /** Số track còn `live` (stream giữ sẵn thì luôn còn 1). */
  soTrackSong(): number;
  /** Các track đang bật tiếng (ngoài lúc ghi phải là 0 — không nghe lén). */
  soTrackBat(): number;
}

interface SanKhauGia {
  mic: MicGia;
  toast: string[];
  oChat: OChatLike & { nhap: Array<[string, number | null]>; tt: Array<string | null> };
  /** Quyền Firefox trả về cho `permissions.query` (đổi được giữa test). */
  datQuyen(t: PermissionState): void;
  /** `getUserMedia` chờ bấy nhiêu ms mới trả lời (mô phỏng hộp hỏi quyền). */
  datTreQuyen(ms: number): void;
  /** `getUserMedia` ném lỗi tên này thay vì trả stream. */
  datLoiQuyen(ten: string | null): void;
  /** Gói `/stt` bridge trả về. */
  datKetQuaStt(g: Record<string, unknown>): void;
  dongHet(): void;
}

function dungSanKhau(): SanKhauGia {
  const toast: string[] = [];
  const nhap: Array<[string, number | null]> = [];
  const tt: Array<string | null> = [];

  let quyen: PermissionState = 'prompt';
  let treQuyen = 0;
  let loiQuyen: string | null = null;
  let ketQuaStt: Record<string, unknown> = {
    text: 'Gen ơi chào Sếp',
    confidence: 0.98,
    goiGen: true,
  };

  /* ------------------------------------------------------------ track/stream */
  const moiTrack = () => {
    let song = true;
    return {
      kind: 'audio',
      label: 'Mic giả F3',
      enabled: false,
      get readyState(): string {
        return song ? 'live' : 'ended';
      },
      stop() {
        song = false;
      },
    };
  };
  const tatCaTrack: Array<ReturnType<typeof moiTrack>> = [];
  const mic: MicGia = {
    soLanGoi: 0,
    soTrackSong: () => tatCaTrack.filter((t) => t.readyState === 'live').length,
    soTrackBat: () =>
      tatCaTrack.filter((t) => t.readyState === 'live' && t.enabled).length,
  };

  /* ------------------------------------------------------------------- DOM */
  const nutGia = {
    type: '',
    id: '',
    textContent: '',
    title: '',
    classList: {
      lop: new Set<string>(),
      add(x: string) {
        this.lop.add(x);
      },
      remove(x: string) {
        this.lop.delete(x);
      },
      toggle(x: string, co: boolean) {
        if (co) this.lop.add(x);
        else this.lop.delete(x);
      },
      contains(x: string) {
        return this.lop.has(x);
      },
    },
    setAttribute() {},
    addEventListener() {},
    remove() {},
  };
  const oChatEl = { insertBefore() {}, querySelector: () => null };
  const g = globalThis as unknown as Record<string, unknown>;
  const cuDocument = g.document;
  const cuWindow = g.window;
  const cuNavigator = g.navigator;
  const cuFetch = g.fetch;
  const cuAudioContext = g.AudioContext;
  const cuMediaRecorder = g.MediaRecorder;

  /**
   * `navigator` của Node 22 là **getter không ghi được** (`globalThis.navigator
   * = …` ném `TypeError`), nên mọi global giả đều đặt bằng `defineProperty`.
   */
  const dat = (ten: string, gt: unknown): void => {
    Object.defineProperty(g, ten, { value: gt, configurable: true, writable: true });
  };

  dat('document', {
    getElementById: (id: string) => (id === 'o-chat' ? oChatEl : null),
    createElement: () => nutGia,
  });
  dat('window', {
    addEventListener() {},
    removeEventListener() {},
    setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
    clearInterval: (h: number) => clearInterval(h),
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  });
  dat('navigator', {
    permissions: { query: async () => ({ state: quyen }) },
    mediaDevices: {
      async getUserMedia() {
        mic.soLanGoi += 1;
        if (treQuyen > 0) await new Promise((r) => setTimeout(r, treQuyen));
        if (loiQuyen) {
          const e = new Error(`mô phỏng ${loiQuyen}`);
          e.name = loiQuyen;
          throw e;
        }
        const t = moiTrack();
        tatCaTrack.push(t);
        return {
          getAudioTracks: () => [t],
          getTracks: () => [t],
        };
      },
    },
  });
  dat('fetch', async (u: string) => {
    if (String(u).includes('/stt/khoe'))
      return { ok: true, json: async () => ({ ok: true, daCai: true }) };
    return { ok: true, json: async () => ketQuaStt };
  });
  dat('AudioContext', class {
    createMediaStreamSource() {
      return { connect() {} };
    }
    createAnalyser() {
      return {
        fftSize: 1024,
        getFloatTimeDomainData(d: Float32Array) {
          d.fill(RMS_GIA);
        },
      };
    }
    async close() {}
  });
  /** MediaRecorder giả — dạng của Firefox, nhả một khối lúc `stop()`. */
  dat('MediaRecorder', class {
    mimeType = 'audio/ogg; codecs=opus';
    private nghe: Record<string, Array<(e: unknown) => void>> = {};
    addEventListener(ten: string, fn: (e: unknown) => void) {
      (this.nghe[ten] ??= []).push(fn);
    }
    start() {}
    stop() {
      for (const fn of this.nghe.dataavailable ?? [])
        fn({ data: new Blob([new Uint8Array(4096)], { type: this.mimeType }) });
      for (const fn of this.nghe.stop ?? []) fn({});
    }
  });

  return {
    mic,
    toast,
    oChat: {
      nhap,
      tt,
      gui: async () => true,
      datNhap: (chu, ms) => nhap.push([chu, ms]),
      dangGoChu: () => false,
      trangThai: (chu) => tt.push(chu),
    },
    datQuyen: (t) => (quyen = t),
    datTreQuyen: (ms) => (treQuyen = ms),
    datLoiQuyen: (ten) => (loiQuyen = ten),
    datKetQuaStt: (gg) => (ketQuaStt = gg),
    dongHet() {
      dat('document', cuDocument);
      dat('window', cuWindow);
      dat('navigator', cuNavigator);
      dat('fetch', cuFetch);
      dat('AudioContext', cuAudioContext);
      dat('MediaRecorder', cuMediaRecorder);
    },
  };
}

const nghi = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('F3 (#56 mục 3) — quyền mic trên Firefox', () => {
  let sk: SanKhauGia;
  let mic: Mic;

  beforeEach(async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    sk = dungSanKhau();
    mic = batMic({
      urlStt: 'http://127.0.0.1:8790',
      oChat: sk.oChat,
      toast: (c) => sk.toast.push(c),
    });
    // chờ `/stt/khoe` + lần đọc quyền lúc nạp trang
    await nghi(20);
  });

  afterEach(() => {
    mic.thao();
    sk.dongHet();
    vi.restoreAllMocks();
  });

  /* ------------------------------------------------------------ lời hứa 1 */

  it('Firefox không nhớ quyền → giữ mic sẵn, lượt nói sau KHÔNG hỏi quyền lại', async () => {
    // `permissions.query` vẫn trả "prompt" sau khi Boss bấm Cho phép — đúng
    // hành vi đo được của Firefox trên http://localhost.
    expect(await mic.xinQuyen()).toBe('duoc');
    expect(mic.quyen()).toBe('duoc');
    expect(mic.thongKe().nhoQuyen).toBe(false);
    expect(mic.thongKe().giuStream).toBe(true);
    expect(sk.mic.soLanGoi).toBe(1);
    // Giữ sẵn nhưng TẮT TIẾNG: không nghe lén giữa hai lượt nói.
    expect(sk.mic.soTrackBat()).toBe(0);

    // Hai lượt nói liền — vẫn đúng một lần `getUserMedia` của cú bấm ban đầu.
    for (let i = 0; i < 2; i++) {
      await mic.batGhi();
      expect(sk.mic.soTrackBat()).toBe(1); // đang ghi thì mới bật tiếng
      await nghi(400);
      await mic.ketGhi();
      expect(sk.mic.soTrackBat()).toBe(0);
    }
    expect(sk.mic.soLanGoi).toBe(1);
    expect(sk.oChat.nhap).toHaveLength(2);
  });

  it('Firefox NHỚ quyền → không giữ mic mở, mở lại mỗi lượt', async () => {
    sk.datQuyen('granted');
    expect(await mic.xinQuyen()).toBe('duoc');
    expect(mic.thongKe().nhoQuyen).toBe(true);
    expect(mic.thongKe().giuStream).toBe(false);
    expect(sk.mic.soTrackSong()).toBe(0); // đã đóng, đèn mic của máy tắt

    await mic.batGhi();
    await nghi(400);
    await mic.ketGhi();
    expect(sk.mic.soLanGoi).toBe(2); // một lần xin quyền + một lần cho lượt nói
    expect(sk.mic.soTrackSong()).toBe(0);
  });

  /* ------------------------------------------------------------ lời hứa 2 */

  it('CA CỦA BOSS: nhả phím trong lúc Firefox hỏi quyền → có toast, lượt sau ra chữ', async () => {
    // Hộp hỏi quyền đứng 300 ms — Boss nhả phím V trước khi kịp bấm.
    sk.datTreQuyen(300);
    const dangBat = mic.batGhi();
    await nghi(50);
    await mic.ketGhi(); // nhả V sớm
    await dangBat;

    // Bản cũ: không toast, không log, không gì. Bản mới phải NÓI RA.
    expect(sk.toast.some((t) => t.includes('lần nữa để nói'))).toBe(true);
    expect(mic.thongKe().buoc.some((d) => d.includes('nhả phím trước khi có quyền'))).toBe(
      true,
    );
    // Và mic đã mở thật, được giữ lại — nên lượt ngay sau đó phải ra chữ.
    expect(mic.thongKe().giuStream).toBe(true);

    sk.datTreQuyen(0);
    await mic.batGhi();
    await nghi(400);
    await mic.ketGhi();
    expect(sk.oChat.nhap[0]).toEqual(['Gen ơi chào Sếp', CHO_SUA_MS]);
    expect(sk.mic.soLanGoi).toBe(1); // không hỏi quyền lần thứ hai
  });

  /* ------------------------------------------------------------ lời hứa 3 */

  it('Boss từ chối quyền → đúng MỘT dòng hướng dẫn, không chết lặng', async () => {
    sk.datLoiQuyen('NotAllowedError');
    expect(await mic.xinQuyen()).toBe('tu-choi');
    expect(mic.quyen()).toBe('tu-choi');
    expect(sk.toast).toHaveLength(1);
    expect(sk.toast[0]).toContain('Mic bị chặn');
    expect(sk.toast[0]).toContain('thanh địa chỉ');

    // Giữ V sau đó cũng không được ghi gì, nhưng phải để lại dấu vết đọc được.
    await mic.batGhi();
    expect(mic.dangGhi()).toBe(false);
    expect(mic.thongKe().buoc.some((d) => d.includes('NotAllowedError'))).toBe(true);
  });

  it('máy không có mic nào → câu khác, đúng việc Boss phải làm', async () => {
    sk.datLoiQuyen('NotFoundError');
    expect(await mic.xinQuyen()).toBe('khong-co-mic');
    expect(sk.toast[0]).toContain('không thấy mic nào');
  });

  /* ------------------------------------------------------------ lời hứa 4 */

  it('vòng đủ: ô chat hiện "đang nghe" → "đang nhận dạng" → "nghe được"', async () => {
    await mic.xinQuyen();
    await mic.batGhi();
    expect(sk.oChat.tt.at(-1)).toBe('🎤 đang nghe…');
    await nghi(400);
    await mic.ketGhi();
    expect(sk.oChat.tt).toContain('⏳ đang nhận dạng…');
    expect(sk.oChat.tt.at(-1)).toBe('nghe được: «Gen ơi chào Sếp»');
    // Dạng blob của Firefox phải đi tới bridge đúng như nó sinh ra.
    expect(mic.thongKe().dangBlob).toBe('audio/ogg; codecs=opus');
    expect(mic.thongKe().byteGui).toBeGreaterThan(0);
  });

  it('tin cậy thấp thì KHÔNG hẹn tự gửi (giữ nguyên lời hứa C1)', async () => {
    sk.datKetQuaStt({ text: 'dựng connector gì đó', confidence: 0.31, goiGen: false });
    await mic.xinQuyen();
    await mic.batGhi();
    await nghi(400);
    await mic.ketGhi();
    expect(sk.oChat.nhap[0]).toEqual(['dựng connector gì đó', null]);
  });

  it('nghe không ra chữ → xoá dòng trạng thái, không để "đang nhận dạng" treo mãi', async () => {
    sk.datKetQuaStt({ text: '', confidence: 0 });
    await mic.xinQuyen();
    await mic.batGhi();
    await nghi(400);
    await mic.ketGhi();
    expect(sk.oChat.tt.at(-1)).toBe(null);
    expect(sk.toast.some((t) => t.includes('Nghe không ra chữ nào'))).toBe(true);
  });

  it('bấm lỡ (giữ < 250 ms) thì im lặng, không toast mắng Boss', async () => {
    await mic.xinQuyen();
    const truoc = sk.toast.length;
    await mic.batGhi();
    await nghi(60);
    await mic.ketGhi();
    expect(sk.toast).toHaveLength(truoc);
    expect(sk.oChat.nhap).toHaveLength(0);
  });

  it('thao() đóng cả mic giữ sẵn — không để đèn mic sáng sau khi tháo', async () => {
    await mic.xinQuyen();
    expect(sk.mic.soTrackSong()).toBe(1);
    mic.thao();
    expect(sk.mic.soTrackSong()).toBe(0);
  });
});

/* ====================================================== CORS cổng 8790 === */

describe('F3 — preflight CORS của /stt (Vite 5173 → bridge 8790)', () => {
  it('OPTIONS trả đủ Allow-Origin + Allow-Methods + Max-Age', async () => {
    // Cổng 0 = hệ điều hành chọn cổng rỗi → không bao giờ đụng cổng của Boss.
    const sv = batStt('127.0.0.1', 0);
    await new Promise((r) => sv.once('listening', r));
    const cong = (sv.address() as { port: number }).port;
    try {
      const r = await fetch(`http://127.0.0.1:${cong}/stt`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          // Dạng MediaRecorder của Firefox — KHÔNG an toàn theo CORS nên mỗi
          // lượt nói đều phải qua preflight này.
          'Access-Control-Request-Headers': 'content-type',
        },
      });
      expect(r.status).toBe(204);
      expect(r.headers.get('access-control-allow-origin')).toBe('*');
      expect(r.headers.get('access-control-allow-methods')).toContain('POST');
      expect(r.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
        'content-type',
      );
      expect(Number(r.headers.get('access-control-max-age'))).toBeGreaterThan(0);
    } finally {
      sv.close();
    }
  });
});
