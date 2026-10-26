/**
 * g3-stt-giong-that.test.ts — THU GIỌNG THẬT + MIC (G3, Issue #62).
 *
 * Boss 28/10: "nhận diện giọng nói tào lao quá". Gốc thứ nhất của vấn đề là
 * **không ai đo được**: bridge chỉ giữ chữ (`.cache/stt/cache/*.json`), không
 * giữ âm — kiểm thật 26/10 có 16 tệp json, **0** tệp audio. Nên mọi số đo của
 * C1 (WER 7,9 %) đều là số trên giọng TTS sạch.
 *
 * Bộ này giữ bốn lời hứa của tầng thu/mic:
 *
 * 1. Bridge lưu **audio thô + kết quả** mỗi lượt, giữ vòng 50 tệp.
 * 2. Nút "✎ Sửa" ghi **cặp (audio, chữ đúng)** vào `mau/` — và chặn mã lượt lạ.
 * 3. `getUserMedia` xin đủ **3 cờ lọc + 16 kHz mono**, KHÔNG dùng `exact`.
 * 4. Chạm nhanh = **bật/tắt**, không bỏ lượt im lặng (skill `input-systems`).
 *
 * Bằng chứng trên Firefox thật: `scripts/kiem-g3.mjs` → `docs/g3/`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const nghi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ============================================ 1-2. sổ thu của bridge ===== */

describe('G3 (#62) — bridge lưu audio thô mỗi lượt (việc 1)', () => {
  let goc = '';
  /**
   * Nạp lại `bridge/stt.ts` với thư mục thu/mẫu riêng của từng test.
   *
   * `vi.resetModules()` chứ không thêm query `?x=…` vào đường import: query
   * làm esbuild của Vite coi phần sau `=` là tên loader rồi nổ
   * ("Invalid loader value"). Module đọc `GEN_STAGE_STT_THU` ở tầng trên cùng
   * nên nạp lại là cách duy nhất đổi được thư mục.
   */
  async function napStt() {
    vi.resetModules();
    return await import('../../../bridge/stt');
  }

  beforeEach(() => {
    goc = mkdtempSync(join(tmpdir(), 'g3-stt-'));
    process.env.GEN_STAGE_STT_THU = join(goc, 'thu');
    process.env.GEN_STAGE_STT_MAU = join(goc, 'mau');
  });

  afterEach(() => {
    delete process.env.GEN_STAGE_STT_THU;
    delete process.env.GEN_STAGE_STT_MAU;
    rmSync(goc, { recursive: true, force: true });
  });

  const KQ = {
    text: 'Gen ơi, qua ghế ngồi đi',
    tho: 'dạ nơi qua ghế ngồi đi',
    confidence: 0.91,
    durationMs: 2571,
    audioMs: 1600,
    goiGen: false,
  };

  it('một lượt nói để lại CẢ audio và kết quả (trước G3: chỉ có json chữ)', async () => {
    const { luuThu } = await napStt();
    const ma = await luuThu(Buffer.from('OggS giả'), 'audio/ogg; codecs=opus', KQ, {
      tuMs: 200,
      denMs: 1800,
    });
    expect(ma).toBeTruthy();
    const ds = readdirSync(join(goc, 'thu'));
    expect(ds).toContain(`${ma}.ogg`);
    expect(ds).toContain(`${ma}.json`);

    const so = JSON.parse(readFileSync(join(goc, 'thu', `${ma}.json`), 'utf8'));
    // Phải có ĐỦ thứ để đo lại: chữ đã sửa, chữ thô, độ tin, dải cắt, model.
    expect(so.text).toBe(KQ.text);
    expect(so.tho).toBe(KQ.tho);
    expect(so.confidence).toBe(0.91);
    expect(so.cat).toEqual({ tuMs: 200, denMs: 1800 });
    expect(typeof so.model).toBe('string');
    expect(so.byte).toBe(Buffer.from('OggS giả').length);
  });

  it('đuôi tệp theo đúng dạng trình duyệt gửi (Firefox ogg · Chrome webm · iOS m4a)', async () => {
    const { duoiTheoDang } = await napStt();
    expect(duoiTheoDang('audio/ogg; codecs=opus')).toBe('.ogg');
    expect(duoiTheoDang('audio/webm;codecs=opus')).toBe('.webm');
    expect(duoiTheoDang('audio/wav')).toBe('.wav');
    expect(duoiTheoDang('audio/mp4')).toBe('.m4a');
    // Không nhận ra dạng gì thì vẫn lưu được, không mất lượt nói.
    expect(duoiTheoDang('application/octet-stream')).toBe('.ogg');
  });

  it('giữ VÒNG 50 lượt — xoá cả cặp của lượt cũ, không để thư mục phình', async () => {
    const { luuThu } = await napStt();
    for (let i = 0; i < 53; i++) {
      await luuThu(Buffer.from(`lượt ${i}`), 'audio/ogg', KQ);
      // mã lượt là mốc ISO tới mili giây — nhịp 2 ms cho mỗi lượt một mã riêng
      await nghi(2);
    }
    const ds = readdirSync(join(goc, 'thu'));
    const ma = [...new Set(ds.map((f) => f.replace(/\.[^.]+$/, '')))];
    expect(ma).toHaveLength(50);
    // mỗi mã còn đủ cặp (ogg + json), không xoá lệch một nửa
    expect(ds).toHaveLength(100);
  });

  it('lỗi ghi đĩa KHÔNG làm Boss mất câu (trả null, không ném)', async () => {
    const { luuThu } = await napStt();
    // thư mục thu trỏ vào một TỆP → mkdir chắc chắn lỗi
    const chan = join(goc, 'chan');
    writeFileSync(chan, 'x');
    process.env.GEN_STAGE_STT_THU = join(chan, 'thu');
    const { luuThu: luu2 } = await napStt();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(luu2(Buffer.from('a'), 'audio/ogg', KQ)).resolves.toBeNull();
    expect(typeof luuThu).toBe('function');
  });
});

describe('G3 (#62) — nút "✎ Sửa" ghi bộ kiểm chuẩn giọng thật (việc 1b)', () => {
  let goc = '';
  async function napStt() {
    vi.resetModules();
    return await import('../../../bridge/stt');
  }

  beforeEach(() => {
    goc = mkdtempSync(join(tmpdir(), 'g3-mau-'));
    process.env.GEN_STAGE_STT_THU = join(goc, 'thu');
    process.env.GEN_STAGE_STT_MAU = join(goc, 'mau');
  });
  afterEach(() => {
    delete process.env.GEN_STAGE_STT_THU;
    delete process.env.GEN_STAGE_STT_MAU;
    rmSync(goc, { recursive: true, force: true });
  });

  const KQ = { text: 'dạ nơi qua ghế ngồi đi', tho: 'dạ nơi qua ghế ngồi đi', confidence: 0.91, durationMs: 2571, audioMs: 1600, goiGen: false };

  it('ghi CẶP (audio, chữ đúng) + giữ cả chữ engine đã nghe sai', async () => {
    const { luuThu, ghiMau } = await napStt();
    const ma = await luuThu(Buffer.from('OggS giả'), 'audio/ogg', KQ);
    expect(ma).not.toBeNull();
    const duong = await ghiMau(ma!, '  Gen ơi, qua ghế ngồi đi  ');
    expect(duong).toContain('mau');

    const ds = readdirSync(join(goc, 'mau'));
    expect(ds).toContain(`${ma}.ogg`);
    expect(ds).toContain(`${ma}.txt`);
    // json của lượt đi theo: đó mới là thứ so được "trước/sau" khi đổi model
    expect(ds).toContain(`${ma}.json`);
    expect(readFileSync(join(goc, 'mau', `${ma}.txt`), 'utf8').trim()).toBe(
      'Gen ơi, qua ghế ngồi đi',
    );
    expect(JSON.parse(readFileSync(join(goc, 'mau', `${ma}.json`), 'utf8')).text).toBe(KQ.text);
  });

  /*
   * `ma` tới từ TRÌNH DUYỆT, nên nó là dữ liệu không tin được: không chặn thì
   * `POST /stt/mau` thành đường đọc/ghi tệp bất kỳ trên máy Boss.
   */
  it('chặn mã lượt lạ — không cho đi ra khỏi thư mục thu', async () => {
    const { ghiMau } = await napStt();
    for (const xau of ['../../etc/passwd', 'a/b', '..', 'x', 'có dấu', 'a'.repeat(99)])
      await expect(ghiMau(xau, 'chữ đúng')).rejects.toThrow(/mã lượt không hợp lệ/);
  });

  it('chữ đúng để trống thì từ chối, không ghi mẫu rỗng vào bộ đo', async () => {
    const { luuThu, ghiMau } = await napStt();
    const ma = await luuThu(Buffer.from('a'), 'audio/ogg', KQ);
    await expect(ghiMau(ma!, '   ')).rejects.toThrow(/để trống/);
  });

  it('audio đã bị vòng 50 đẩy ra ngoài → nói rõ lý do, không ném lỗi lạ', async () => {
    const { ghiMau } = await napStt();
    await expect(ghiMau('2026-10-28T10-00-00-000', 'chữ đúng')).rejects.toThrow(
      /không còn audio/,
    );
  });
});

/* ====================================== 3-4. ràng buộc mic + bật/tắt ===== */

/**
 * Sân khấu giả tối thiểu cho `batMic` (vitest chạy môi trường `node`).
 * Giữ MỎNG: cái cần kiểm là ràng buộc `getUserMedia` và vòng bật/tắt.
 */
function dungMicGia() {
  const toast: string[] = [];
  const tt: Array<{ chu: string | null; coSua: boolean }> = [];
  const nhap: Array<[string, number | null]> = [];
  const rangBuoc: MediaStreamConstraints[] = [];
  const mauDaGui: Array<{ ts: string; text: string }> = [];
  let luuMau: ((chu: string) => void) | null = null;

  const g = globalThis as unknown as Record<string, unknown>;
  const cu: Record<string, unknown> = {};
  const dat = (ten: string, gt: unknown): void => {
    if (!(ten in cu)) cu[ten] = g[ten];
    Object.defineProperty(g, ten, { value: gt, configurable: true, writable: true });
  };

  const nut = {
    type: '', id: '', textContent: '', title: '',
    classList: { lop: new Set<string>(), add(x: string) { this.lop.add(x); }, remove(x: string) { this.lop.delete(x); }, toggle(x: string, c: boolean) { c ? this.lop.add(x) : this.lop.delete(x); }, contains(x: string) { return this.lop.has(x); } },
    setAttribute() {}, addEventListener() {}, remove() {},
  };
  dat('document', {
    getElementById: (id: string) => (id === 'o-chat' ? { insertBefore() {}, querySelector: () => null } : null),
    createElement: () => nut,
  });
  dat('window', {
    addEventListener() {}, removeEventListener() {},
    setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
    clearInterval: (h: number) => clearInterval(h),
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  });
  dat('navigator', {
    permissions: { query: async () => ({ state: 'prompt' as PermissionState }) },
    mediaDevices: {
      async getUserMedia(c: MediaStreamConstraints) {
        rangBuoc.push(JSON.parse(JSON.stringify(c)));
        const t = { kind: 'audio', label: 'Mic trong máy (Analog) — Intel HDA', enabled: false, readyState: 'live', stop() { (t as { readyState: string }).readyState = 'ended'; } };
        return { getAudioTracks: () => [t], getTracks: () => [t] };
      },
    },
  });
  dat('fetch', async (u: string, o?: { body?: string }) => {
    const s = String(u);
    if (s.includes('/stt/khoe')) return { ok: true, json: async () => ({ ok: true, daCai: true }) };
    if (s.includes('/stt/mau')) {
      mauDaGui.push(JSON.parse(o?.body ?? '{}'));
      return { ok: true, json: async () => ({ ok: true, mau: '.cache/stt/mau/x.ogg' }) };
    }
    return {
      ok: true,
      json: async () => ({ text: 'dạ nơi qua ghế ngồi đi', confidence: 0.91, goiGen: false, ts: '2026-10-28T10-00-00-000' }),
    };
  });
  dat('AudioContext', class {
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData(d: Float32Array) { d.fill(0.3); } }; }
    async close() {}
  });
  dat('MediaRecorder', class {
    mimeType = 'audio/ogg; codecs=opus';
    private nghe: Record<string, Array<(e: unknown) => void>> = {};
    addEventListener(t: string, fn: (e: unknown) => void) { (this.nghe[t] ??= []).push(fn); }
    start() {}
    stop() {
      for (const fn of this.nghe.dataavailable ?? []) fn({ data: new Blob([new Uint8Array(2048)], { type: this.mimeType }) });
      for (const fn of this.nghe.stop ?? []) fn({});
    }
  });

  return {
    toast, tt, nhap, rangBuoc, mauDaGui,
    /** Gọi hàm `luu()` của nút "✓ Lưu mẫu" như Boss vừa bấm. */
    bamLuuMau: (chu: string) => luuMau?.(chu),
    oChat: {
      gui: async () => true,
      datNhap: (chu: string, ms: number | null) => nhap.push([chu, ms]),
      dangGoChu: () => false,
      trangThai: (chu: string | null, sua?: { luu(c: string): void }) => {
        tt.push({ chu, coSua: sua !== undefined });
        if (sua) luuMau = (c) => sua.luu(c);
      },
    },
    dongHet() {
      for (const [k, v] of Object.entries(cu))
        Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
    },
  };
}

describe('G3 (#62) — mic xin đúng ràng buộc (việc 4)', () => {
  let sk: ReturnType<typeof dungMicGia>;
  let mic: import('../../audio/mic').Mic;

  beforeEach(async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    sk = dungMicGia();
    const { batMic } = await import('../../audio/mic');
    mic = batMic({ urlStt: 'http://127.0.0.1:8943', oChat: sk.oChat, toast: (c) => sk.toast.push(c) });
    await nghi(20);
  });
  afterEach(() => {
    mic.thao();
    sk.dongHet();
    vi.restoreAllMocks();
  });

  it('bật cả ba cờ lọc của trình duyệt + xin 16 kHz mono', async () => {
    await mic.xinQuyen();
    const a = sk.rangBuoc[0]?.audio as Record<string, unknown>;
    expect(a.echoCancellation).toBe(true);
    expect(a.noiseSuppression).toBe(true);
    expect(a.autoGainControl).toBe(true);
    expect(a.channelCount).toBe(1);
    expect(a.sampleRate).toBe(16000);
  });

  /*
   * `exact` làm mic laptop không chạy nổi 16 kHz ném `OverconstrainedError` →
   * Boss mất hẳn mic. Dạng trần là lời đề nghị, không phải điều kiện.
   */
  it('KHÔNG dùng { exact: … } — mic cũ vẫn mở được', async () => {
    await mic.xinQuyen();
    expect(JSON.stringify(sk.rangBuoc[0])).not.toContain('exact');
  });

  it('toast TÊN THIẾT BỊ mic đúng một lần mỗi phiên', async () => {
    await mic.xinQuyen();
    const ten = sk.toast.filter((t) => t.includes('Đang nghe bằng'));
    expect(ten).toHaveLength(1);
    expect(ten[0]).toContain('Intel HDA');
    expect(mic.thongKe().tenMic).toContain('Intel HDA');

    // hai lượt nói nữa: không nhắc lại, Boss không bị toast mỗi câu
    for (let i = 0; i < 2; i++) {
      await mic.batGhi();
      await nghi(400);
      await mic.ketGhi();
    }
    expect(sk.toast.filter((t) => t.includes('Đang nghe bằng'))).toHaveLength(1);
  });
});

describe('G3 (#62) — chạm nhanh = bật/tắt, không bỏ lượt im lặng', () => {
  let sk: ReturnType<typeof dungMicGia>;
  let mic: import('../../audio/mic').Mic;

  beforeEach(async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    sk = dungMicGia();
    const { batMic } = await import('../../audio/mic');
    mic = batMic({ urlStt: 'http://127.0.0.1:8943', oChat: sk.oChat, toast: (c) => sk.toast.push(c) });
    await nghi(20);
    await mic.xinQuyen();
  });
  afterEach(() => {
    mic.thao();
    sk.dongHet();
    vi.restoreAllMocks();
  });

  it('nhả trong 250 ms → VẪN ĐANG GHI và nói rõ cách chốt câu', async () => {
    await mic.batGhi();
    await nghi(60);
    await mic.ketGhi(); // chạm nhanh
    expect(mic.dangGhi()).toBe(true);
    expect(mic.thongKe().batTat).toBe(true);
    expect(sk.tt.at(-1)?.chu).toContain('lần nữa để chốt');
    // chưa gửi gì cả — câu còn đang được nói
    expect(sk.nhap).toHaveLength(0);
  });

  it('chạm lần thứ hai thì chốt câu và ra chữ', async () => {
    await mic.batGhi();
    await nghi(60);
    await mic.ketGhi();
    await nghi(400); // Boss nói trong lúc chế độ bật/tắt đang ghi
    await mic.ketGhi(); // chạm lần nữa
    expect(mic.dangGhi()).toBe(false);
    expect(sk.nhap[0]?.[0]).toBe('dạ nơi qua ghế ngồi đi');
  });

  it('giữ lâu vẫn là đẩy-để-nói y như cũ (không vào bật/tắt)', async () => {
    await mic.batGhi();
    await nghi(400);
    await mic.ketGhi();
    expect(mic.dangGhi()).toBe(false);
    expect(mic.thongKe().batTat).toBe(false);
    expect(sk.nhap).toHaveLength(1);
  });
});

describe('G3 (#62) — nút Sửa đem mẫu về bridge', () => {
  let sk: ReturnType<typeof dungMicGia>;
  let mic: import('../../audio/mic').Mic;

  beforeEach(async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    sk = dungMicGia();
    const { batMic } = await import('../../audio/mic');
    mic = batMic({ urlStt: 'http://127.0.0.1:8943', oChat: sk.oChat, toast: (c) => sk.toast.push(c) });
    await nghi(20);
    await mic.xinQuyen();
    await mic.batGhi();
    await nghi(400);
    await mic.ketGhi();
  });
  afterEach(() => {
    mic.thao();
    sk.dongHet();
    vi.restoreAllMocks();
  });

  it('dòng "nghe được" mang theo nút Sửa, và mã lượt vào thống kê', () => {
    const dong = sk.tt.find((x) => x.chu?.startsWith('nghe được'));
    expect(dong?.coSua).toBe(true);
    expect(mic.thongKe().ts).toBe('2026-10-28T10-00-00-000');
  });

  it('bấm "✓ Lưu mẫu" → POST /stt/mau đúng cặp (ts, chữ đúng)', async () => {
    sk.bamLuuMau('Gen ơi, qua ghế ngồi đi');
    await nghi(30);
    expect(sk.mauDaGui).toEqual([
      { ts: '2026-10-28T10-00-00-000', text: 'Gen ơi, qua ghế ngồi đi' },
    ]);
    expect(sk.toast.some((t) => t.includes('Đã lưu mẫu'))).toBe(true);
  });

  it('chữ đúng để trống thì KHÔNG gửi gì (không rác vào bộ đo)', async () => {
    sk.bamLuuMau('   ');
    await nghi(30);
    expect(sk.mauDaGui).toHaveLength(0);
  });
});
