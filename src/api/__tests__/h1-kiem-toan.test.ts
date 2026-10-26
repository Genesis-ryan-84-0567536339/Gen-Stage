/**
 * h1-kiem-toan.test.ts — H1 (Issue #69): làm theo `docs/KIEM-TOAN-SKILL.md`.
 *
 * Năm giao kèo, mỗi giao kèo một số đo (không phải một câu văn trong PR):
 *
 *  1. **Phím lặp không phải lệnh mới** (mục 21) — giữ `1` là ĐÚNG MỘT
 *     `actor.emote`, giữ `C`/`E`/`R` là đúng một lệnh. Trình duyệt bắn
 *     `keydown` ~30 lần/giây khi giữ phím; trước H1 mỗi nhịp là một lệnh.
 *  2. **Một nguồn sự thật cho cường độ đèn** (mục 34) — `dungAnhSang()` và
 *     `sceneLight()` không thể lệch nhau nữa, vì không chỗ nào còn viết số.
 *  3. **`actor.moveTo` không xuyên nội thất** (mục 38 + 39) — lái Nhi thẳng
 *     vào sofa thì dừng/trượt, và không lọt xuyên dù một khung hình dài 2 s.
 *  4. **Camera không ra ngoài tường/trần** (mục 14 + 15) — tay máy bị cắt tại
 *     mặt hộp nhà, ở mọi hướng quét.
 *  5. **Bước cố định** (mục 1–3 + 6) — cùng một khoảng thời gian thật cho
 *     cùng một quỹ đạo camera ở 30 / 60 / 144 FPS.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buocDiToi, TOC_DO_STEER, heSoBam } from '../../stage/nhanvat';
import { biChan, hopChan } from '../../stage/bo-cuc';
import {
  dayTayMay,
  dichCamera,
  hopTamNgam,
  kepTrongHop,
  trongHop,
  type HopNha,
} from '../../stage/may-quay';
import { OMEGA_MAY, buocLoXo } from '../../stage/world';

/* ============================================ 1. phím lặp (DOM giả, như F2) */

/**
 * DOM tối thiểu viết tay — cùng lý lẽ với `f2-dieu-khien-muot.test.ts`: không
 * thêm `jsdom` và không đổi `environment: 'node'` trong `vite.config.ts`, vì
 * đó là tài sản chung của repo, đổi là đụng mọi nhánh đang mở.
 */
function theGia(ten = 'DIV'): Record<string, unknown> {
  const t: Record<string, unknown> = {
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
let winNghe: Map<string, Set<Nghe>>;
let docNghe: Map<string, Set<Nghe>>;
let cu: Record<string, unknown>;

function ban(ai: Map<string, Set<Nghe>>, loai: string, e: Record<string, unknown>): void {
  for (const fn of [...(ai.get(loai) ?? [])]) fn({ preventDefault: () => undefined, ...e });
}

function dungDom(): void {
  winNghe = new Map();
  docNghe = new Map();
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

describe('H1 mục 21 — giữ phím KHÔNG bắn lệnh lặp', () => {
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
    Object.assign(globalThis, cu);
    vi.useRealTimers();
  });

  /** Giữ phím: 1 lần `keydown` thật rồi `n` lần lặp của trình duyệt. */
  const giu = (code: string, n = 30) => {
    ban(winNghe, 'keydown', { code });
    for (let i = 0; i < n; i += 1) ban(winNghe, 'keydown', { code, repeat: true });
  };
  const dem = (cmd: string) => lenh.filter((l) => l.cmd === cmd).length;

  it('giữ phím 1 trong 30 nhịp lặp → ĐÚNG MỘT actor.emote', () => {
    giu('Digit1');
    expect(dem('actor.emote')).toBe(1);
  });

  it('giữ C → đúng một camera.preset (trước H1: 31 lần đổi góc máy)', () => {
    giu('KeyC');
    expect(dem('camera.preset')).toBe(1);
  });

  it('giữ E → đúng một module.build; giữ R → đúng một stage.reset', () => {
    giu('KeyE');
    expect(dem('module.build')).toBe(1);
    lenh = [];
    giu('KeyR');
    expect(dem('stage.reset')).toBe(1);
  });

  it('nhịp lặp của phím HƯỚNG không thêm lệnh nào (gia hạn do nhịp 200 ms lo)', async () => {
    ban(winNghe, 'keydown', { code: 'KeyW' });
    const sau1 = dem('actor.steer');
    expect(sau1).toBe(1);
    // 30 nhịp lặp trong cùng một tick: không được sinh thêm lệnh nào
    for (let i = 0; i < 30; i += 1) ban(winNghe, 'keydown', { code: 'KeyW', repeat: true });
    expect(dem('actor.steer')).toBe(sau1);
    ban(winNghe, 'keyup', { code: 'KeyW' });
    await vi.advanceTimersByTimeAsync(0);
  });

  it('phím lặp vẫn bị chặn sau khi nhả rồi giữ lại (không chỉ lần đầu)', () => {
    giu('Digit2');
    ban(winNghe, 'keyup', { code: 'Digit2' });
    giu('Digit2');
    expect(dem('actor.emote')).toBe(2);
  });
});

/* ====================================== 2. một nguồn sự thật cho đèn */

describe('H1 mục 34 — bảng đèn một nguồn, bấm R không đổi độ sáng', () => {
  const nguon = readFileSync(new URL('../../stage/world.ts', import.meta.url), 'utf8');

  it('PRESET_DEN_SO phủ đủ 3 preset đèn của spec', async () => {
    const { PRESET_DEN_SO } = await import('../../stage/world');
    const { PRESET_DEN } = await import('../../stage/noi-dung');
    for (const p of PRESET_DEN) {
      expect(PRESET_DEN_SO[p], `thiếu số đèn cho "${p}"`).toBeTruthy();
      const so = PRESET_DEN_SO[p]!;
      for (const k of ['troi', 'nang', 'nangMau', 'vien', 'exposure', 'nen'] as const) {
        expect(typeof so[k], `${p}.${k}`).toBe('number');
      }
    }
  });

  /**
   * Đây là test **chống tái phạm**, không phải test giá trị: lỗi "chói" sinh ra
   * vì có người viết một bộ số thứ hai vào `sceneLight`. Nên giao kèo phải là
   * "trong `sceneLight` KHÔNG có số nào", chứ không phải "số trong `sceneLight`
   * khớp số trong `dungAnhSang`" (bộ thứ hai vẫn tồn tại để lệch lần sau).
   */
  it('thân sceneLight() không còn một hằng số cường độ nào', () => {
    const batDau = nguon.indexOf('  sceneLight(preset: string): void {');
    expect(batDau).toBeGreaterThan(0);
    const than = nguon.slice(batDau, nguon.indexOf('\n  }\n', batDau));
    expect(than).not.toMatch(/intensity\s*=\s*[\d.]/);
    expect(than).not.toMatch(/toneMappingExposure\s*=\s*[\d.]/);
    expect(than).not.toMatch(/setHex\(0x/);
    expect(than).toContain('PRESET_DEN_SO[preset]');
  });

  it('dungAnhSang() cũng đọc bảng, không viết số riêng', () => {
    const batDau = nguon.indexOf('  private dungAnhSang(): void {');
    expect(batDau).toBeGreaterThan(0);
    const than = nguon.slice(batDau, nguon.indexOf('\n  }\n', batDau));
    expect(than).toContain('PRESET_DEN_SO.sang');
    expect(than).toContain('so.troi');
    expect(than).toContain('so.nang');
    expect(than).toContain('so.vien');
    expect(than).toContain('so.exposure');
  });
});

/* ================================= 3. actor.moveTo không xuyên nội thất */

describe('H1 mục 38 + 39 — actor.moveTo đi qua va chạm', () => {
  /** Hộp chắn của sofa trong `bo-cuc.ts` (quay 270° nên 0,45 × 1,15 m). */
  const sofa = hopChan().find((h) => h.id === 'sofa')!;
  /**
   * Làn tiếp cận: từ ĐÔNG dọc z = 1,0 (hành lang giữa nhà) đi về tây. Vật cản
   * đầu tiên trên đường đúng là mép đông của sofa.
   *
   * Mọi điểm xuất phát được **kiểm là trống** ngay trong test: vòng đầu chọn
   * x = −6 (nằm sẵn trong hộp kệ TV) và x = −5 (trong hộp bàn trà) nên test đo
   * sai thứ — kẹt từ khung 1 vì lý do khác hẳn cái đang kiểm.
   */
  const X0 = 0;
  const Z = 1;

  it('sofa có thật trong bảng chắn, và làn tiếp cận trống (test vô nghĩa nếu bố cục đổi)', () => {
    expect(sofa).toBeTruthy();
    expect(sofa.x1 - sofa.x0).toBeGreaterThan(0.5);
    expect(biChan(X0, Z, 0.34)).toBeNull();
    expect(biChan(sofa.x1 + 0.36, Z, 0.34)).toBeNull();
  });

  it('lái Nhi moveTo XUYÊN QUA sofa: dừng trước mép, không bao giờ vào trong hộp', () => {
    let x = X0;
    let viPhamTrongHop = 0;
    let xaNhat = x;
    // 180 khung ở 60 FPS = 3 s, tốc độ 1,6 m/s ⇒ đòi đi 4,8 m (qua hẳn sofa)
    for (let i = 1; i <= 180; i += 1) {
      const dich = X0 - Math.min(6, (i / 60) * TOC_DO_STEER);
      const kq = buocDiToi(x, Z, dich, Z);
      x = kq.x;
      xaNhat = Math.min(xaNhat, x);
      if (biChan(x, Z, 0.34)) viPhamTrongHop += 1;
    }
    expect(viPhamTrongHop).toBe(0);
    // dừng ở mép ĐÔNG của sofa trừ bán kính thân, KHÔNG sang được phía tây
    expect(xaNhat).toBeGreaterThan(sofa.x1);
    expect(xaNhat).toBeLessThan(sofa.x1 + 0.5);
  });

  it('báo `chan` và `daDi = 0` khi kẹt hẳn (nguồn để kết thúc hành động sớm)', () => {
    const kq = buocDiToi(sofa.x1 + 0.36, Z, sofa.x1 - 0.2, Z);
    expect(kq.chan).toBe(true);
    expect(kq.daDi).toBeLessThan(1e-9);
    expect(kq.thieu).toBeGreaterThan(0.1);
  });

  it('TRƯỢT dọc mép khi đi chéo vào sofa (không dính cứng)', () => {
    // trục X bị sofa chặn, trục Z trống ⇒ phải men dọc mép sofa về phía bắc
    const kq = buocDiToi(sofa.x1 + 0.36, Z, sofa.x1 - 0.3, Z + 0.6);
    expect(kq.daDi).toBeGreaterThan(0.1);
    expect(Math.abs(kq.z - Z)).toBeGreaterThan(0.1);
    expect(biChan(kq.x, kq.z, 0.34)).toBeNull();
  });

  it('KHÔNG LỌT XUYÊN dù một khung hình dài 2 s (tab vừa hiện lại)', () => {
    // Trước H1: một phép gán `position = lerp(...)` nhảy thẳng 3,2 m qua sofa.
    const kq = buocDiToi(X0, Z, X0 - TOC_DO_STEER * 2, Z);
    expect(biChan(kq.x, Z, 0.34)).toBeNull();
    expect(kq.x).toBeGreaterThan(sofa.x1);
  });

  it('speed của moveTo bị kẹp ≤ TOC_DO_STEER trong diToi()', () => {
    const nguon = readFileSync(new URL('../../stage/nhanvat.ts', import.meta.url), 'utf8');
    const i = nguon.indexOf('  diToi(v: THREE.Vector3, speed?: number): Action {');
    expect(i).toBeGreaterThan(0);
    const than = nguon.slice(i, nguon.indexOf('\n  }\n', i));
    expect(than).toContain('Math.min(speed && speed > 0 ? speed : TOC_DO_DI, TOC_DO_STEER)');
  });

  it('bước/khung ở tốc độ trần nhỏ hơn nửa bề dày vật cản mỏng nhất', () => {
    const mong = Math.min(...hopChan().map((h) => Math.min(h.x1 - h.x0, h.z1 - h.z0)));
    // bước con của `buocDiToi` là 0,15 m — bất biến chống lọt xuyên
    expect(0.15).toBeLessThan(mong / 2);
    expect(TOC_DO_STEER / 60).toBeLessThan(mong / 2);
  });
});

/* ======================================== 4. camera trong nhà (spring arm) */

describe('H1 mục 14 + 15 — tay máy kẹp camera trong nhà', () => {
  /** Đúng hộp mà `world.ts` dùng: nhà 14 × 10 m, trần 2,8 m, lề 0,4/0,3. */
  const hop: HopNha = { hx: 14 / 2 - 0.4, hz: 10 / 2 - 0.4, yMin: 0.4, yMax: 2.8 - 0.3 };

  it('quét 2000 hướng từ 5 tâm ngắm: camera LUÔN nằm trong hộp nhà', () => {
    const tams: Array<[number, number, number]> = [
      [0, 1.1, 0],
      [6, 1.1, 4], // góc đông-nam — chỗ `LECH_THEO_OWNER` từng đẩy máy ra ngoài
      [-6, 1.1, -4],
      [0, 2.4, 0], // sát trần: gốc "trần vướng"
      [6.5, 0.5, 4.5],
    ];
    let soLan = 0;
    for (const t of tams) {
      const tam = kepTrongHop(t[0], t[1], t[2], hop);
      for (let i = 0; i < 400; i += 1) {
        const a = (i / 400) * Math.PI * 2;
        const b = -0.4 + (i % 17) * 0.06;
        const h: [number, number, number] = [
          Math.cos(b) * Math.cos(a),
          Math.sin(b) + 0.35,
          Math.cos(b) * Math.sin(a),
        ];
        const n = Math.hypot(h[0], h[1], h[2]);
        const hu: [number, number, number] = [h[0] / n, h[1] / n, h[2] / n];
        const dai = dayTayMay(tam, hu, 8.6, hop);
        const vt: [number, number, number] = [
          tam[0] + hu[0] * dai,
          tam[1] + hu[1] * dai,
          tam[2] + hu[2] * dai,
        ];
        expect(
          trongHop(vt[0], vt[1], vt[2], hop, 1e-6),
          `ra ngoài nhà: tâm ${tam} hướng ${hu} → ${vt}`,
        ).toBe(true);
        soLan += 1;
      }
    }
    expect(soLan).toBe(2000);
  });

  it('không cắt tay máy khi vị trí mong muốn đã ở trong nhà (giữ nguyên góc)', () => {
    const dai = dayTayMay([0, 1.1, 0], [0, 0.3, 1], 2.5, hop);
    expect(dai).toBeCloseTo(2.5, 6);
  });

  it('camera nhìn thẳng lên bị cắt TRƯỚC trần (gốc "trần vướng")', () => {
    const dai = dayTayMay([0, 1.1, 0], [0, 1, 0], 8.6, hop);
    expect(1.1 + dai).toBeLessThan(hop.yMax);
  });

  it('bám chủ ở góc nhà: tay máy ngắn lại chứ không xuyên tường', () => {
    // lệch cố định LECH_THEO_OWNER = (1.8, 2.0, 2.6) từ chủ ở (6; 4)
    const tam: [number, number, number] = [6, 1.1, 4];
    const muon = [6 + 1.8, 2.0, 4 + 2.6];
    const d = [muon[0] - tam[0], muon[1] - tam[1], muon[2] - tam[2]];
    const n = Math.hypot(d[0], d[1], d[2]);
    const hu: [number, number, number] = [d[0] / n, d[1] / n, d[2] / n];
    const dai = dayTayMay(kepTrongHop(tam[0], tam[1], tam[2], hop), hu, n, hop);
    expect(dai).toBeLessThan(n);
    const vt = [tam[0] + hu[0] * dai, tam[1] + hu[1] * dai, tam[2] + hu[2] * dai];
    expect(trongHop(vt[0], vt[1], vt[2], hop)).toBe(true);
  });

  /* ======== H1 vòng 2 (review PR #72 mục 1) — tay máy KHÔNG co vào người ==== */

  const GAN = 0.6;
  const LE = 0.12;
  const DE_CHIU = 2.6;
  const hopTam = hopTamNgam(hop, GAN + LE);
  /** Đúng `LECH_THEO_OWNER` của `world.ts`: y là độ cao TUYỆT ĐỐI. */
  const LECH: [number, number, number] = [1.8, 2.0, 2.6];
  /** Đích camera cho một nhân vật đứng ở `(x; z)` — đúng phép của `buocMoPhong`. */
  function dich(x: number, z: number): {
    tam: [number, number, number];
    vt: [number, number, number];
    xa: number;
  } {
    const tam = kepTrongHop(x, 1.1, z, hopTam);
    const vt = dichCamera(tam, [LECH[0], LECH[1] - tam[1], LECH[2]], hop, DE_CHIU, LE, GAN);
    return { tam, vt, xa: Math.hypot(vt[0] - x, vt[1] - 1.1, vt[2] - z) };
  }

  it('quét cả sàn nhà (0,25 m): camera→đầu LUÔN ≥ 0,6 m và camera trong nhà', () => {
    let min = Infinity;
    let oDau: [number, number] = [0, 0];
    let soLan = 0;
    for (let x = -6.75; x <= 6.75; x += 0.25) {
      for (let z = -4.75; z <= 4.75; z += 0.25) {
        const { vt, xa } = dich(x, z);
        expect(trongHop(vt[0], vt[1], vt[2], hop, 1e-6), `ra ngoài nhà ở (${x}; ${z})`).toBe(true);
        if (xa < min) {
          min = xa;
          oDau = [x, z];
        }
        soLan += 1;
      }
    }
    expect(soLan).toBe(55 * 39);
    // trước vòng 2: review đo được 0,1265 m ở sát tường nam (khung hình toàn áo)
    expect(min, `gần nhất ở (${oDau[0]}; ${oDau[1]})`).toBeGreaterThanOrEqual(GAN);
  });

  it('4 GÓC nhà: tay máy vẫn ≥ 0,6 m, và camera LEO LÊN chứ không tiến vào người', () => {
    for (const [x, z] of [
      [6.4, 4.4],
      [-6.4, 4.4],
      [6.4, -4.4],
      [-6.4, -4.4],
    ]) {
      const { vt, xa } = dich(x, z);
      expect(xa, `góc (${x}; ${z})`).toBeGreaterThanOrEqual(GAN);
      // bù bằng độ cao: camera cao hơn đầu nhân vật
      expect(vt[1]).toBeGreaterThan(1.6);
      expect(trongHop(vt[0], vt[1], vt[2], hop, 1e-6)).toBe(true);
    }
  });

  it('đích camera LIÊN TỤC theo nhân vật (không nhảy ⇒ lò xo không vọt vận tốc)', () => {
    /*
     * Lò xo tới hạn bám một đích chạy đều `v` thì |vel| xác lập = `v`; đỉnh
     * chỉ sinh ra khi đích NHẢY. Nhân vật đi nhanh nhất 1,6 m/s ⇒ mỗi bước
     * 1/60 s đi 0,027 m; đích được phép dời tối đa `k` lần quãng đó.
     */
    const BUOC = 1.6 / 60;
    let max = 0;
    for (let x = -6.8; x <= 6.8; x += BUOC) {
      for (const z of [-4.6, -2.3, 0, 2.3, 4.6]) {
        const a = dich(x, z).vt;
        const b = dich(x + BUOC, z).vt;
        max = Math.max(max, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
      }
    }
    // k = 1,6: chiếu lên hộp lồi là 1-Lipschitz, bù độ cao THEO PHẦN THIẾU
    // cũng vậy — nên đích đi không nhanh hơn nhân vật quá 1,6 lần
    expect(max).toBeLessThan(BUOC * 1.6);
  });

  it('MÔ PHỎNG cả vòng bám (không có trần vận tốc): |v| ≤ 1,6 m/s và tay máy ≥ 0,6 m', () => {
    /*
     * Chạy đúng vòng của `buocMoPhong`: nhân vật lái vào 4 tường rồi 2 đường
     * chéo vào góc, mỗi bước 1/60 s, hai lò xo `buocLoXo` như `world.ts` —
     * nhưng **không áp `MAY_VEL_TOI_DA`**, để con số nói về hình học chứ không
     * nói về cái trần. Trước vòng 2, cùng lượt này cho |v| xác lập 13,23 m/s
     * (ω·e/(2+ω·dt) với e = sai số không bao giờ giảm) và tay máy 0,126 m.
     */
    const DT = 1 / 60;
    const V = 1.6;
    const duong: Array<[number, number]> = [];
    let cx = 0;
    let cz = 0;
    const lai = (dx: number, dz: number, giay: number) => {
      for (let i = 0; i < giay * 60; i += 1) {
        cx = Math.max(-6.5, Math.min(6.5, cx + dx * V * DT));
        cz = Math.max(-4.5, Math.min(4.5, cz + dz * V * DT));
        duong.push([cx, cz]);
      }
    };
    lai(0, 1, 6);
    lai(1, 0, 6);
    lai(0, -1, 6);
    lai(-1, 0, 6);
    lai(Math.SQRT1_2, Math.SQRT1_2, 8);
    lai(-Math.SQRT1_2, -Math.SQRT1_2, 8);

    const d0 = dich(duong[0][0], duong[0][1]);
    const vt = new THREE.Vector3(...d0.vt);
    const vel = new THREE.Vector3();
    const tamVt = new THREE.Vector3(...d0.tam);
    const tamVel = new THREE.Vector3();
    let vMax = 0;
    let xaMin = Infinity;
    for (const [x, z] of duong) {
      const d = dich(x, z);
      buocLoXo(vt, vel, new THREE.Vector3(...d.vt), OMEGA_MAY, DT);
      buocLoXo(tamVt, tamVel, new THREE.Vector3(...d.tam), OMEGA_MAY, DT);
      vMax = Math.max(vMax, vel.length());
      xaMin = Math.min(xaMin, Math.hypot(vt.x - x, vt.y - 1.1, vt.z - z));
      expect(trongHop(vt.x, vt.y, vt.z, hop, 1e-6)).toBe(true);
    }
    // lò xo tới hạn bám đích chạy đều `v` thì |vel| xác lập = `v`, không hơn
    expect(vMax).toBeLessThanOrEqual(V + 0.01);
    expect(xaMin).toBeGreaterThanOrEqual(GAN);
  });

  it('lò xo có TRẦN vận tốc và kẹp thì TRỪ vận tốc (không tích vào tường)', () => {
    const nguon = readFileSync(new URL('../../stage/world.ts', import.meta.url), 'utf8');
    expect(nguon).toContain('const MAY_VEL_TOI_DA = 2.8');
    expect(nguon).toContain('this.mayVel.setLength(MAY_VEL_TOI_DA)');
    // kẹp tâm ngắm ⇒ bỏ thành phần vận tốc theo trục bị kẹp
    expect(nguon).toContain('this.mayTamVel.x = 0');
    // cắt tay máy ⇒ bỏ thành phần vận tốc theo trục tay máy
    expect(nguon).toContain('this.mayVel.addScaledVector(this.tayMay, -vr)');
    // đích của lò xo đi qua `dichCamera` (khả thi) chứ không còn `đầu + lệch`
    expect(nguon).toContain('const [dcx, dcy, dcz] = dichCamera(');
    expect(nguon).not.toContain("this.mayDich.set(p.x, 0, p.z).add(LECH_THEO_OWNER)");
  });

  it('maxDistance theo kích thước nhà, không còn hằng 26 m của lab', () => {
    const nguon = readFileSync(new URL('../../stage/world.ts', import.meta.url), 'utf8');
    expect(nguon).not.toContain('this.controls.maxDistance = 26');
    expect(nguon).toContain('const MAY_XA_TOI_DA = Math.hypot(KICH_THUOC_PHONG, KICH_THUOC_SAU) / 2');
    expect(Math.hypot(14, 10) / 2).toBeLessThan(9);
  });
});

/* ============================================ 5. vòng lặp bước cố định */

describe('H1 mục 1–3 + 6 — accumulator bước cố định 1/60', () => {
  const BUOC = 1 / 60;
  const TRAN = 5;

  /**
   * Bản sao đúng vòng lặp trong `World.motKhung`: tích `dt` của khung, tiêu
   * từng bước `1/60`, chạm trần thì bỏ dư.
   */
  function chay(nhipKhung: number, giay: number): { vt: THREE.Vector3; buoc: number } {
    const vt = new THREE.Vector3(0, 2, 6);
    const vel = new THREE.Vector3();
    const dich = new THREE.Vector3(1.8, 2, 2.6);
    let du = 0;
    let tong = 0;
    for (let t = 0; t < giay - 1e-9; t += nhipKhung) {
      du += Math.min(nhipKhung, 1 / 20);
      let n = 0;
      while (du >= BUOC && n < TRAN) {
        buocLoXo(vt, vel, dich, OMEGA_MAY, BUOC);
        du -= BUOC;
        n += 1;
        tong += 1;
      }
      if (du >= BUOC) du = 0;
    }
    return { vt, buoc: tong };
  }

  it('30 / 60 / 144 FPS cho CÙNG một quỹ đạo camera (sai số ≤ 1 mm)', () => {
    const a = chay(1 / 30, 2);
    const b = chay(1 / 60, 2);
    const c = chay(1 / 144, 2);
    expect(a.vt.distanceTo(b.vt)).toBeLessThan(0.001);
    expect(b.vt.distanceTo(c.vt)).toBeLessThan(0.001);
    // và cùng số bước mô phỏng (±1 bước làm tròn), không phụ thuộc FPS
    expect(Math.abs(a.buoc - b.buoc)).toBeLessThanOrEqual(2);
    expect(Math.abs(b.buoc - c.buoc)).toBeLessThanOrEqual(2);
  });

  it('5 FPS: bỏ bước dư thay vì dồn (không "spiral of death")', () => {
    // mỗi khung 0,2 s nhưng `dt` kẹp 1/20 ⇒ tối đa 3 bước, không bao giờ > 5
    const { buoc } = chay(1 / 5, 2);
    expect(buoc).toBeLessThanOrEqual(TRAN * 10);
  });

  it('motKhung() kẹp dt đúng MỘT chỗ và chạy accumulator', () => {
    const nguon = readFileSync(new URL('../../stage/world.ts', import.meta.url), 'utf8');
    const i = nguon.indexOf('  private motKhung(): void {');
    const than = nguon.slice(i, nguon.indexOf('\n  }\n', i));
    expect(than).toContain('this.duDt += dt;');
    expect(than).toContain('this.buocMoPhong(BUOC_CO_DINH)');
    expect(than).toContain('soBuoc < BUOC_TOI_DA');
    // chỉ MỘT lần đọc đồng hồ và MỘT phép kẹp dt trong cả thân vòng lặp
    expect(than.match(/this\.dongHo\.getDelta\(\)/g)!.length).toBe(1);
    expect(than.match(/Math\.min\(dtThat, DT_KHUNG_TOI_DA\)/g)!.length).toBe(1);
    // H1 vòng 2: `khungTranBuoc` đếm khung bị BỎ thời gian (mốc cũ không bao
    // giờ tăng vì `dt` đã kẹp 1/20 ⇒ tối đa 3 bước < BUOC_TOI_DA = 5)
    expect(than).toContain('if (dtThat > DT_KHUNG_TOI_DA) this.khungTranBuoc += 1;');
  });

  it('camera BAY dùng heSoBam, không còn min(1, dt*3.2)', () => {
    const nguon = readFileSync(new URL('../../stage/world.ts', import.meta.url), 'utf8');
    expect(nguon).not.toContain('Math.min(1, dt * 3.2)');
    expect(nguon).toContain('heSoBam(dt, TAU_MAY_BAY)');
  });

  it('camera bay: 1 / 10 / 60 / 144 FPS đi được cùng một quãng sau 1 s', () => {
    const TAU = 0.28;
    const chayBay = (dt: number) => {
      let x = 0;
      for (let t = 0; t < 1 - 1e-9; t += dt) x += (10 - x) * heSoBam(dt, TAU);
      return x;
    };
    const moc = chayBay(1 / 60);
    for (const fps of [1, 10, 144]) {
      expect(Math.abs(chayBay(1 / fps) - moc)).toBeLessThan(0.25);
    }
    // và sau 1 s phải đi được phần lớn quãng (τ = 0,28 ⇒ ~97 %)
    expect(moc).toBeGreaterThan(9);
  });
});
