/**
 * f2-dieu-khien-muot.test.ts — F2 (Issue #56 mục 2): điều khiển mượt trên GPU thật.
 *
 * Vì sao có file này: mọi bằng chứng B1/D1b trước đây đo trên Chromium +
 * swiftshader (~1 FPS). Ở `dt` cỡ 1 giây, *mọi* công thức dạng
 * `x += (muc − x) · min(1, dt·k)` đều kẹp về 1, tức **bám tức thì** — nên cả
 * ba tật dưới đây đều vô hình. Boss mở Firefox GPU thật (60 FPS) thì chúng
 * hiện ra thành "điều khiển loạn tùm lum". Test ở đây đo ĐÚNG cái chênh đó:
 * mỗi giao kèo được kiểm ở **nhiều FPS khác nhau** và phải ra cùng kết quả.
 *
 * Bốn giao kèo:
 *  1. `heSoBam`/`lechGoc` — hội tụ độc lập FPS, không nhảy chiều ở mốc π.
 *  2. `buocLoXo` — camera bám tới hạn: không vọt quá, không rung, ổn định ở
 *     mọi `dt`.
 *  3. Bàn phím — giữ phím là MỘT lệnh được gia hạn (không gối lệnh 100 ms);
 *     nhả phím / blur / ẩn tab là dừng NGAY trong cùng tick.
 *  4. `chotFps` — thước FPS không bao giờ bịa số (gốc của "60.0 / NaN").
 *  5. `buocLai` — lái thẳng vào vật cản thì **dừng thật**: không vận tốc ảo,
 *     không "đang đi", pha bước đứng im. Đây là gốc 2 của #56; vòng F2 đầu chỉ
 *     sửa được nửa (hết vận tốc ảo nhưng `state` vẫn `walking` vĩnh viễn) đúng
 *     vì **không có test nào chạm tới nó** — giao kèo chỉ nằm trong lời văn.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { LERP_PHANH, LERP_VAN_TOC, buocLai, heSoBam, lechGoc } from '../../stage/nhanvat';
import { biChan, hopChan, kepTrongPhong } from '../../stage/bo-cuc';
import { OMEGA_MAY, buocLoXo } from '../../stage/world';
import { chotFps } from '../../ui/do-fps';

/* ------------------------------------------------- 1. nội suy độc lập FPS */

describe('F2 mục 1 — hội tụ độc lập FPS', () => {
  /** Chạy `tong` giây với bước `dt`, trả vận tốc cuối. */
  const chay = (dt: number, tong: number, tau: number, v0: number, muc: number) => {
    let v = v0;
    for (let t = 0; t < tong - 1e-9; t += dt) v += (muc - v) * heSoBam(dt, tau);
    return v;
  };

  it('cùng một khoảng thời gian cho cùng kết quả ở 1 / 10 / 60 / 144 FPS', () => {
    const kq = [1, 10, 60, 144].map((fps) => chay(1 / fps, 1, LERP_VAN_TOC, 0, 1.6));
    // sai lệch giữa các FPS < 0,1 % (bản cũ `min(1, dt/τ)` lệch tới 47 %)
    for (const v of kq) expect(Math.abs(v - kq[0]!)).toBeLessThan(0.002);
  });

  it('công thức cũ `min(1, dt/τ)` KHÔNG độc lập FPS — đây là tật đã sửa', () => {
    const cu = (dt: number, tong: number, tau: number) => {
      let v = 0;
      for (let t = 0; t < tong - 1e-9; t += dt) v += (1.6 - v) * Math.min(1, dt / tau);
      return v;
    };
    // sau 0,1 s: ở 10 FPS bản cũ đã vọt lên gần đỉnh, ở 144 FPS thì chưa
    const nhanh = cu(1 / 144, 0.1, LERP_VAN_TOC);
    const cham = cu(1 / 10, 0.1, LERP_VAN_TOC);
    expect(Math.abs(cham - nhanh)).toBeGreaterThan(0.25);
  });

  it('phanh: 1,6 m/s về dưới ngưỡng 0,12 m/s trong ≤ 0,3 s ở mọi FPS', () => {
    for (const fps of [10, 30, 60, 144]) {
      const dt = 1 / fps;
      let v = 1.6;
      let t = 0;
      while (v > 0.12 && t < 2) {
        v += (0 - v) * heSoBam(dt, LERP_PHANH);
        t += dt;
      }
      // +1 khung dung sai: ở 10 FPS một khung đã là 0,1 s, không thể mịn hơn
      expect(t).toBeLessThanOrEqual(0.3 + dt);
    }
  });

  it('lechGoc chọn đường ngắn, và ở đúng mốc π thì XÁC ĐỊNH (không nhảy chiều)', () => {
    expect(lechGoc(0.1, -0.1)).toBeCloseTo(0.2, 6);
    // 350° → 10° phải là +20°, không phải −340°
    expect(lechGoc((10 * Math.PI) / 180, (350 * Math.PI) / 180)).toBeCloseTo(
      (20 * Math.PI) / 180,
      6,
    );
    // đảo chiều đúng 180°: luôn trả +π, hai khung liền nhau không chọn hai chiều
    expect(lechGoc(Math.PI, 0)).toBeCloseTo(Math.PI, 6);
    expect(lechGoc(0, Math.PI)).toBeCloseTo(Math.PI, 6);
  });

  it('heSoBam không bao giờ ra ngoài [0, 1] (dt = 0, dt khổng lồ, τ = 0)', () => {
    for (const [dt, tau] of [
      [0, 0.1],
      [-1, 0.1],
      [1e6, 0.1],
      [0.016, 0],
    ] as Array<[number, number]>) {
      const k = heSoBam(dt, tau);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(1);
    }
  });
});

/* -------------------------------------------- 2. lò xo camera tới hạn */

describe('F2 mục 2 — camera bám tới hạn, không vọt quá, không rung', () => {
  const dich = new THREE.Vector3(5, 0, 0);

  it('không vọt quá mục tiêu ở bất kỳ FPS nào (damping tới hạn)', () => {
    for (const fps of [10, 30, 60, 144]) {
      const v = new THREE.Vector3();
      const vel = new THREE.Vector3();
      let toiDa = 0;
      for (let i = 0; i < fps * 3; i += 1) {
        buocLoXo(v, vel, dich, OMEGA_MAY, 1 / fps);
        toiDa = Math.max(toiDa, v.x);
      }
      expect(v.x).toBeCloseTo(5, 2);
      // vọt quá = có khung nào đi xa hơn mục tiêu → sẽ dội lại = rung
      expect(toiDa).toBeLessThanOrEqual(5 + 1e-6);
    }
  });

  it('ổn định cả khi dt khổng lồ (tab bị ẩn rồi quay lại)', () => {
    const v = new THREE.Vector3();
    const vel = new THREE.Vector3();
    buocLoXo(v, vel, dich, OMEGA_MAY, 5);
    expect(Number.isFinite(v.x)).toBe(true);
    expect(v.x).toBeGreaterThan(0);
    expect(v.x).toBeLessThanOrEqual(5 + 1e-6);
  });

  it('bám sát hơn lerp bậc một cũ khi mục tiêu chạy đều 1,6 m/s', () => {
    const dt = 1 / 60;
    // lò xo mới
    const v = new THREE.Vector3();
    const vel = new THREE.Vector3();
    // lerp cũ `min(1, dt*2,6)`
    let cu = 0;
    let m = 0;
    for (let i = 0; i < 180; i += 1) {
      m += 1.6 * dt;
      buocLoXo(v, vel, new THREE.Vector3(m, 0, 0), OMEGA_MAY, dt);
      cu += (m - cu) * Math.min(1, dt * 2.6);
    }
    const treMoi = m - v.x;
    const treCu = m - cu;
    expect(treMoi).toBeLessThan(treCu);
    /**
     * Trễ xác lập của lò xo tới hạn bám mục tiêu chạy đều = `2v/ω`
     * = 2·1,6/9 = 0,356 m; của lerp bậc một cũ = `v/k_giây` = 1,6/2,6
     * = 0,615 m. Kiểm đúng hai con số đó (±2 cm) — nếu ai đổi ω thì test này
     * hỏng ngay và người đổi phải sửa cả ghi chú trong `world.ts`.
     */
    expect(treMoi).toBeCloseTo((2 * 1.6) / OMEGA_MAY, 2);
    // bản cũ: `v/k_giây` = 0,615 m (rời rạc hoá ở 60 FPS lệch ~3 cm)
    expect(treCu).toBeGreaterThan(0.55);
    expect(treCu).toBeLessThan(0.65);
  });

  it('dt = 0 thì không nhúc nhích (không chia cho 0, không NaN)', () => {
    const v = new THREE.Vector3(1, 2, 3);
    const vel = new THREE.Vector3(9, 9, 9);
    buocLoXo(v, vel, dich, OMEGA_MAY, 0);
    expect(v.toArray()).toEqual([1, 2, 3]);
  });
});

/* ------------------------------------------------------- 4. thước FPS */

describe('F2 mục 4 — thước FPS không bịa số', () => {
  it('một mẫu duy nhất: KHÔNG ra 60.0 và KHÔNG ra NaN (tật Boss báo)', () => {
    const so = chotFps([12000]);
    expect(so.fps).toBeNull();
    expect(so.fpsXau).toBeNull();
    expect(so.soKhung).toBe(1);
    expect(so.giay).toBeCloseTo(12, 1);
  });

  it('mảng rỗng cũng không bịa', () => {
    expect(chotFps([]).fps).toBeNull();
  });

  it('60 FPS đều → đúng 60; 1 FPS đều → đúng 1', () => {
    expect(chotFps(Array(120).fill(1000 / 60)).fps).toBeCloseTo(60, 1);
    expect(chotFps(Array(20).fill(1000)).fps).toBeCloseTo(1, 1);
  });

  it('một khung 2 s lẫn giữa 99 khung 10 ms: FPS trung bình KHÔNG che nó', () => {
    const dt = [...Array(99).fill(10), 2000];
    const so = chotFps(dt);
    // trung bình vẫn "đẹp" (vài chục FPS) — đó là bản chất của trung bình…
    expect(so.fps!).toBeGreaterThan(15);
    // …nên "1 % xấu nhất" phải chỉ ĐÚNG vào khung 2 s. Đây là con số Boss cần
    // để biết mình có thấy giật hay không.
    expect(so.dtDinh).toBeCloseTo(2000, 0);
    expect(so.fpsXau!).toBeCloseTo(0.5, 2);
  });

  it('phân vị 99 lấy đúng khung chậm nhất khi n = 100 (bản cũ lệch 1 bậc)', () => {
    const dt = [...Array(99).fill(16), 500];
    expect(chotFps(dt).dtDinh).toBeCloseTo(500, 0);
  });

  it('warmup cắt theo THỜI GIAN, chỉ khi còn đủ mẫu', () => {
    // khung đầu 3 s (biên dịch shader) + 60 khung 16 ms → phải bỏ khung đầu
    const so = chotFps([3000, ...Array(60).fill(16)]);
    expect(so.fps!).toBeGreaterThan(55);
    expect(so.soKhung).toBe(61);
  });
});

/* ------------------------------------------------- 3. bàn phím (DOM giả) */

/**
 * DOM tối thiểu, viết tay.
 *
 * Không thêm `jsdom` vào `devDependencies` và không sửa `vite.config.ts`
 * (`environment: 'node'`) — hai thứ đó là tài sản chung của repo, đổi là đụng
 * mọi nhánh đang mở. `batPhim` chỉ cần đúng mấy cửa dưới đây.
 */
interface TheGia {
  tagName: string;
  id: string;
  isContentEditable: boolean;
  shadowRoot: null;
  innerHTML: string;
  classList: { toggle: () => void; add: () => void; remove: () => void };
  style: Record<string, unknown>;
  value: string;
  appendChild: (x: unknown) => void;
  remove: () => void;
  querySelector: () => TheGia | null;
  addEventListener: () => void;
  removeEventListener: () => void;
  focus: () => void;
  setAttribute: () => void;
}

function theGia(ten = 'DIV'): TheGia {
  const t: TheGia = {
    tagName: ten,
    id: '',
    isContentEditable: false,
    shadowRoot: null,
    innerHTML: '',
    classList: { toggle: () => undefined, add: () => undefined, remove: () => undefined },
    style: {},
    value: '',
    appendChild: () => undefined,
    remove: () => undefined,
    querySelector: () => theGia('INPUT'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    focus: () => undefined,
    setAttribute: () => undefined,
  };
  return t;
}

type Nghe = (e: unknown) => void;

let docNghe: Map<string, Set<Nghe>>;
let winNghe: Map<string, Set<Nghe>>;
let cu: Record<string, unknown>;

function ban(ai: Map<string, Set<Nghe>>, loai: string, e: Record<string, unknown>): void {
  for (const fn of [...(ai.get(loai) ?? [])]) fn({ preventDefault: () => undefined, ...e });
}

function dungDom(): void {
  docNghe = new Map();
  winNghe = new Map();
  const them = (m: Map<string, Set<Nghe>>) => (loai: string, fn: Nghe) => {
    if (!m.has(loai)) m.set(loai, new Set());
    m.get(loai)!.add(fn);
  };
  const bo = (m: Map<string, Set<Nghe>>) => (loai: string, fn: Nghe) => {
    m.get(loai)?.delete(fn);
  };
  const doc = {
    activeElement: theGia('CANVAS'),
    body: theGia('BODY'),
    visibilityState: 'visible',
    createElement: (ten: string) => theGia(ten.toUpperCase()),
    addEventListener: them(docNghe),
    removeEventListener: bo(docNghe),
  };
  const win = {
    addEventListener: them(winNghe),
    removeEventListener: bo(winNghe),
    setInterval: (fn: () => void, ms: number) => setInterval(fn, ms) as unknown as number,
    clearInterval: (h: number) => clearInterval(h as unknown as NodeJS.Timeout),
  };
  cu = { document: (globalThis as never)['document'], window: (globalThis as never)['window'] };
  Object.assign(globalThis, { document: doc, window: win });
}

function thaoDom(): void {
  Object.assign(globalThis, cu);
}

describe('F2 mục 3 — bàn phím: gia hạn, không gối lệnh; nhả là dừng ngay', () => {
  let lenh: Array<{ cmd: string; args: Record<string, unknown> }>;
  let phim: import('../../ui/phim').BanPhim;

  beforeEach(async () => {
    vi.useFakeTimers();
    dungDom();
    lenh = [];
    const dispatcher = {
      run: async (cmd: string, args: Record<string, unknown>) => {
        lenh.push({ cmd, args });
        if (cmd === 'stage.describe') {
          return {
            ok: true,
            result: { actors: [{ id: 'owner', name: 'Boss', controlledBy: 'owner' }] },
          };
        }
        return { ok: true, result: null };
      },
    };
    const { batPhim } = await import('../../ui/phim');
    phim = batPhim(dispatcher as never, () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    lenh = [];
  });

  afterEach(() => {
    phim.thao();
    thaoDom();
    vi.useRealTimers();
  });

  const steer = () => lenh.filter((l) => l.cmd === 'actor.steer');
  const xuong = (code: string) => ban(winNghe, 'keydown', { code });
  const len = (code: string) => ban(winNghe, 'keyup', { code });

  it('giữ W 3 s: KHÔNG gối lệnh dày — ≤ 20 lệnh, tất cả cùng một vector', async () => {
    xuong('KeyW');
    await vi.advanceTimersByTimeAsync(3000);
    const s = steer();
    // bản B1 (nhịp 100 ms) sẽ ra ~30 lệnh; bản F2 gia hạn 200 ms → ~16
    expect(s.length).toBeLessThanOrEqual(20);
    expect(s.length).toBeGreaterThan(5);
    for (const l of s) {
      expect(l.args.vz).toBeCloseTo(-1.6, 6);
      expect(l.args.vx).toBe(0);
      // hiệu lực phải DƯ xa nhịp gia hạn, không còn 180 ms gối 100 ms
      expect(Number(l.args.ms)).toBeGreaterThanOrEqual(600);
    }
  });

  it('nhả phím là gửi lệnh dừng NGAY trong cùng tick (không chờ nhịp)', async () => {
    xuong('KeyW');
    await vi.advanceTimersByTimeAsync(250);
    const truoc = steer().length;
    len('KeyW');
    // chưa cho đồng hồ chạy thêm chút nào
    await vi.advanceTimersByTimeAsync(0);
    const s = steer();
    expect(s.length).toBe(truoc + 1);
    expect(s.at(-1)!.args).toMatchObject({ vx: 0, vz: 0 });
    expect(phim.doPhim().nhip).toBe(false);
  });

  it('nhả hết rồi thì không gửi thêm lệnh nào nữa (nhịp đã tắt)', async () => {
    xuong('KeyW');
    await vi.advanceTimersByTimeAsync(250);
    len('KeyW');
    await vi.advanceTimersByTimeAsync(0);
    const n = steer().length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(steer().length).toBe(n);
  });

  it('đi chéo W+D không nhanh hơn đi thẳng; nhả D thì vector mới gửi ngay', async () => {
    xuong('KeyW');
    xuong('KeyD');
    await vi.advanceTimersByTimeAsync(0);
    const cheo = steer().at(-1)!.args;
    expect(Math.hypot(Number(cheo.vx), Number(cheo.vz))).toBeCloseTo(1.6, 4);
    len('KeyD');
    await vi.advanceTimersByTimeAsync(0);
    const thang = steer().at(-1)!.args;
    expect(thang).toMatchObject({ vx: 0 });
    expect(Number(thang.vz)).toBeCloseTo(-1.6, 6);
    expect(phim.doPhim().giu).toBe(1);
  });

  it('blur giữa lúc giữ phím → dừng ngay, không đi mãi', async () => {
    xuong('KeyW');
    await vi.advanceTimersByTimeAsync(250);
    ban(winNghe, 'blur', {});
    await vi.advanceTimersByTimeAsync(0);
    expect(steer().at(-1)!.args).toMatchObject({ vx: 0, vz: 0 });
    expect(phim.doPhim().giu).toBe(0);
  });

  it('ẩn tab (visibilitychange) → dừng ngay, không chờ interval bị hạ nhịp', async () => {
    xuong('KeyW');
    await vi.advanceTimersByTimeAsync(250);
    (globalThis as never as { document: { visibilityState: string } }).document.visibilityState =
      'hidden';
    ban(docNghe, 'visibilitychange', {});
    await vi.advanceTimersByTimeAsync(0);
    expect(steer().at(-1)!.args).toMatchObject({ vx: 0, vz: 0 });
  });

  it('đang focus ô chat: WASD KHÔNG thành lệnh lái', async () => {
    const o = theGia('INPUT');
    (globalThis as never as { document: { activeElement: unknown } }).document.activeElement = o;
    xuong('KeyW');
    await vi.advanceTimersByTimeAsync(500);
    expect(steer()).toHaveLength(0);
  });

  it('đang giữ W rồi nhảy vào ô chat → DỪNG (keyup sẽ không về tới đây)', async () => {
    xuong('KeyW');
    await vi.advanceTimersByTimeAsync(250);
    (globalThis as never as { document: { activeElement: unknown } }).document.activeElement =
      theGia('INPUT');
    xuong('KeyA'); // cú gõ đầu tiên trong ô chat
    await vi.advanceTimersByTimeAsync(0);
    expect(steer().at(-1)!.args).toMatchObject({ vx: 0, vz: 0 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(steer().at(-1)!.args).toMatchObject({ vx: 0, vz: 0 });
  });

  it('bộ gõ tiếng Việt đang dựng chữ (isComposing) → không lái', async () => {
    ban(winNghe, 'keydown', { code: 'KeyW', isComposing: true });
    await vi.advanceTimersByTimeAsync(300);
    expect(steer()).toHaveLength(0);
  });
});

/* --------------------------------------- 5. lái vào vật cản (gốc 2 của #56) */

/** Bán kính thân khi kiểm va chạm — khớp `BAN_KINH_THAN` của `nhanvat.ts`. */
const BAN_KINH = 0.34;

/**
 * Tự TÌM một chỗ đâm vào tường trong bảng bố cục hiện hành, thay vì ghi cứng
 * toạ độ sofa.
 *
 * Lần đầu viết các test này tôi ghi cứng `(−4,5; 2,6) → sofa`. Rebase lên main
 * sau khi **F1 (#57) dọn lại bố cục** là cả ba test đỏ — mà giao kèo đang
 * kiểm ("đụng vật cản thì dừng thật") thì chẳng liên quan gì tới việc sofa
 * nằm ở đâu. Hàm này quét lưới để lấy một điểm **thoáng** mà đi thẳng `+X`
 * 1,5 m là **đụng**, và còn ≥ `thoangZ` m thoáng hai bên theo `Z` để test
 * trượt dọc mép chạy được. F1 có dời đồ lần nữa thì test vẫn đúng.
 */
function timChoDamTuong(thoangZ = 0.8): { x: number; z: number } {
  for (let z = -4; z <= 4; z += 0.1) {
    for (let x = -6; x <= 6; x += 0.1) {
      if (biChan(x, z, BAN_KINH)) continue;
      if (!biChan(x + 1.5, z, BAN_KINH)) continue;
      let tot = true;
      // thoáng suốt 1,1 m phía trước (để có đoạn tăng tốc trước khi đụng)…
      for (let d = 0; d <= 1.1; d += 0.1) if (biChan(x + d, z, BAN_KINH)) tot = false;
      // …thoáng dọc −Z ở cột xuất phát (đường trượt), kể cả TƯỜNG PHÒNG:
      // `biChan` chỉ biết đồ đạc, mép phòng nằm ở `kepTrongPhong`. Bỏ sót nó
      // thì "trượt dọc mép bàn" lại hoá ra "đâm vào tường nhà".
      for (let d = 0; d <= thoangZ + 0.3; d += 0.1) {
        if (biChan(x, z - d, BAN_KINH)) tot = false;
        if (kepTrongPhong(x, z - d)[1] !== z - d) tot = false;
      }
      // …MẶT CẢN phải kéo dài suốt đoạn trượt đó, nếu không thì test trượt
      // dọc mép chỉ đang đo nhân vật đi vòng qua mép hộp…
      for (let d = 0; d <= thoangZ; d += 0.1) if (!biChan(x + 1.5, z - d, BAN_KINH)) tot = false;
      // …và **rãnh ngay sát mặt cản** cũng phải thoáng. Nhân vật trượt ở cột
      // `x + 1,1` (áp vào tường) chứ không ở cột xuất phát — lần trước quên
      // chỗ này nên chọn trúng một góc bếp: ép vào tủ xong là kẹt luôn góc.
      for (let d = 0; d <= thoangZ; d += 0.1) {
        if (biChan(x + 1.1, z - d, BAN_KINH)) tot = false;
        if (kepTrongPhong(x + 1.1, z - d)[1] !== z - d) tot = false;
      }
      if (tot) return { x: +x.toFixed(2), z: +z.toFixed(2) };
    }
  }
  throw new Error('bảng bố cục không còn chỗ nào đi thẳng vào tường — xem bo-cuc.ts');
}

describe('F2 mục 5 — lái thẳng vào vật cản: dừng THẬT, không chạy bộ tại chỗ', () => {
  /**
   * Chạy `giay` giây lái với vận tốc mục tiêu không đổi, bắt đầu từ (x, z).
   * Dùng ĐÚNG `buocLai` của sân khấu và ĐÚNG bảng vật cản của `bo-cuc.ts`.
   */
  function lai(
    x: number,
    z: number,
    chang: Array<[number, number, number]>,
    fps = 60,
  ) {
    const dt = 1 / fps;
    let st = { x, z, vx: 0, vz: 0, dangDi: false, tocThat: 0, chanX: false, chanZ: false };
    const so: Array<typeof st & { t: number; pha: number; chang: number }> = [];
    let pha = 0;
    let t = 0;
    chang.forEach(([mx, mz, giay], i) => {
      for (let u = 0; u < giay - 1e-9; u += dt) {
        st = buocLai(st.x, st.z, st.vx, st.vz, mx, mz, dt);
        pha = st.dangDi ? pha + dt * 7.5 : 0;
        t += dt;
        so.push({ ...st, t: +t.toFixed(4), pha, chang: i });
      }
    });
    return { cuoi: st, so, pha };
  }

  const cho = timChoDamTuong();

  it('bảng bố cục thật vẫn có chỗ đi thẳng vào vật cản (nếu không, test dưới vô nghĩa)', () => {
    expect(hopChan().length).toBeGreaterThan(0);
    expect(biChan(cho.x, cho.z, BAN_KINH)).toBeNull(); // chỗ xuất phát: thoáng
    expect(biChan(cho.x + 1.5, cho.z, BAN_KINH)).not.toBeNull(); // 1,5 m nữa: đụng
  });

  it('đi thẳng vào vật cản 2 s: |v| = 0, toạ độ đứng im, KHÔNG "đang đi"', () => {
    const { cuoi, so } = lai(cho.x, cho.z, [[1.6, 0, 2]]);
    expect(cuoi.vx).toBe(0);
    expect(Math.hypot(cuoi.vx, cuoi.vz)).toBe(0);
    expect(cuoi.chanX).toBe(true);
    expect(cuoi.dangDi).toBe(false);
    // Từ 0,3 s SAU khi chạm (hạn phanh) tới hết: không khung nào nhúc nhích,
    // cũng không khung nào "đang đi". Mốc theo lúc chạm chứ không phải "nửa
    // sau của lượt chạy" — quãng tăng tốc dài ngắn tuỳ chỗ tìm được.
    const cham = so.find((r) => r.chanX)!;
    const duoi = so.filter((r) => r.t >= cham.t + 0.3);
    expect(duoi.length).toBeGreaterThan(10);
    for (const r of duoi) {
      expect(r.dangDi).toBe(false);
      expect(r.tocThat).toBe(0);
      expect(r.pha).toBe(0); // pha bước đứng im → thân KHÔNG nhún
    }
    const nhich = Math.max(...duoi.map((r) => Math.abs(r.x - duoi[0]!.x)));
    expect(nhich).toBe(0);
  });

  it('dừng thật trong ≤ 0,3 s kể từ lúc chạm vật cản, ở mọi FPS', () => {
    for (const fps of [10, 30, 60, 144]) {
      const { so } = lai(cho.x, cho.z, [[1.6, 0, 2]], fps);
      const chamTai = so.findIndex((r) => r.chanX);
      const dungTai = so.findIndex((r, i) => i >= chamTai && !r.dangDi);
      expect(chamTai).toBeGreaterThan(0);
      expect(dungTai).toBeGreaterThanOrEqual(chamTai);
      expect(so[dungTai]!.t - so[chamTai]!.t).toBeLessThanOrEqual(0.3);
    }
  });

  it('tật cũ tái dựng: nhân 0,2 cho ra điểm cân bằng |v| ≠ 0 mà toạ độ đứng im', () => {
    // Bản B1: `if (bị chặn) v *= 0.2`. Chạy lại đúng công thức đó để thấy vì
    // sao Boss thấy "chạy bộ tại chỗ" — và để test này hỏng nếu ai đem nó về.
    const dt = 1 / 60;
    let x = cho.x;
    let vx = 0;
    const buoc = () => {
      vx += (1.6 - vx) * Math.min(1, dt / 0.15);
      const moi = biChan(x + vx * dt, cho.z, BAN_KINH) ? x : x + vx * dt;
      if (Math.abs(moi - x) < Math.abs(vx * dt) * 0.5) vx *= 0.2;
      x = moi;
    };
    for (let i = 0; i < 180; i += 1) buoc();
    // Điểm cân bằng bẩn này tỉ lệ với `dt`: ~0,04 m/s ở 60 FPS, và 0,23 m/s
    // như đo thật trên Firefox lúc máy chạy ~10 FPS. Khác 0 là đã sai.
    expect(Math.abs(vx)).toBeGreaterThan(0.02); // vận tốc ảo KHÁC 0…
    const truoc = x;
    for (let i = 0; i < 60; i += 1) buoc();
    expect(x).toBe(truoc); // …mà toạ độ KHÔNG nhích: đúng tật cũ
  });

  it('đụng một trục vẫn TRƯỢT mượt theo trục kia, không mất hết vận tốc', () => {
    // Hai chặng: ép thẳng vào tường trước (1 s) rồi mới lách chéo — phải áp
    // được vào mặt cản thì "trượt dọc mép" mới có nghĩa. Đi chéo ngay từ chỗ
    // xuất phát thì thành phần X chỉ 1,13 m/s, 0,7 s không đủ chạm tường.
    const { so } = lai(cho.x, cho.z, [
      [1.6, 0, 1],
      [1.13, -1.13, 0.7],
    ]);
    const duoi = so.filter((r) => r.chang === 1).slice(-12);
    for (const r of duoi) {
      expect(r.chanX).toBe(true);
      expect(Math.abs(r.vz)).toBeGreaterThan(1.0); // vẫn men theo mép
      expect(r.dangDi).toBe(true);
    }
    // và trượt ĐỀU: không giật theo chu kỳ (bản "xoá hẳn" tụt về 0 rồi dựng lại)
    const vz = duoi.map((r) => Math.abs(r.vz));
    expect(Math.max(...vz) - Math.min(...vz)).toBeLessThan(0.05);
  });

  it('chỗ trống thì không báo chặn oan ở bất kỳ FPS nào (bước nhỏ 0,027 m)', () => {
    for (const fps of [30, 60, 144]) {
      const { so } = lai(cho.x, cho.z, [[-1.6, 0, 0.6]], fps); // quay lưng lại, đi ra chỗ trống
      expect(so.some((r) => r.chanX || r.chanZ)).toBe(false);
    }
  });
});
