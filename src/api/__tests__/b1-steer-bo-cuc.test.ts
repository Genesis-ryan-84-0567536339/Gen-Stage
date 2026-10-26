/**
 * b1-steer-bo-cuc.test.ts — B1 (Issue #18): `actor.steer` + bảng bố cục.
 *
 * Ba giao kèo phải giữ, kiểm bằng số chứ không bằng mắt:
 *  1. `actor.steer` **không xếp hàng** — steer mới thay steer cũ, và gửi steer
 *     lúc actor đang bận cũng không bị đẩy vào hàng đợi.
 *  2. Kẹp trong phòng + không đi xuyên bàn/kệ (`bo-cuc.truotVaCham`).
 *  3. Đang steer thì `at` luôn `null` (giao kèo A1 không được phá), còn
 *     `nearest` vẫn luôn có.
 * Cộng thêm: bảng bố cục thẳng lưới, hành lang ≥ 2 m, `controlledBy`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { EventBus } from '../../events';
import { SanKhauGia, NHIP_MS } from './san-khau-gia';
import type { StageEvent, StageState } from '../types';
import {
  DAY_BEP,
  HANH_LANG,
  KHOI_CANH,
  LOI_DI,
  NUA_HANH_LANG,
  NUA_RONG,
  NUA_SAU,
  SAT_TUONG,
  biChan,
  cumCua,
  hopChan,
  kepTrongPhong,
  kiemCum,
  kiemHanhLang,
  kiemLoiDi,
  kiemLuoi,
  truotVaCham,
} from '../../stage/bo-cuc';
import { PLACES, timPlace } from '../../stage/noi-dung';

let world: SanKhauGia;
let bus: EventBus;
let d: Dispatcher;

beforeEach(() => {
  world = new SanKhauGia(['owner', 'gen']);
  bus = new EventBus();
  d = new Dispatcher({ registry: taoRegistry(), world, bus });
});

const cho = (ms: number) => new Promise((r) => setTimeout(r, ms));

function actor(st: StageState, id: string) {
  const a = st.actors.find((x) => x.id === id);
  if (!a) throw new Error(`không thấy actor ${id}`);
  return a;
}

async function dc(): Promise<StageState> {
  const kq = await d.run('stage.describe');
  if (!kq.ok) throw new Error(kq.error);
  return kq.result as StageState;
}

describe('actor.steer — lái bằng vận tốc', () => {
  it('nhận vx/vz/ms, trả durationMs đúng ms đã yêu cầu', async () => {
    const kq = await d.run('actor.steer', { actor: 'owner', vx: 0, vz: -1.6, ms: 150 });
    expect(kq.ok).toBe(true);
    if (!kq.ok) return;
    expect((kq.result as { durationMs: number }).durationMs).toBe(NHIP_MS);
    expect((kq.result as { vz: number }).vz).toBe(-1.6);
  });

  it('KHÔNG xếp hàng: gửi liên tiếp 5 lệnh, không lệnh nào bị queue', async () => {
    const queued: StageEvent[] = [];
    bus.on('cmd.queued', (e) => queued.push(e));
    for (let i = 0; i < 5; i++) {
      const kq = await d.run('actor.steer', { actor: 'owner', vx: 0, vz: -1.6, ms: 120 });
      expect(kq.ok).toBe(true);
    }
    expect(queued).toEqual([]);
    expect(d.soCho('owner')).toBe(0);
  });

  it('KHÔNG xếp hàng sau lưng một lệnh đang chiếm thân (moveTo)', async () => {
    const queued: StageEvent[] = [];
    bus.on('cmd.queued', (e) => queued.push(e));
    void d.run('actor.moveTo', { actor: 'owner', to: 'ban-1' });
    const kq = await d.run('actor.steer', { actor: 'owner', vx: 1.6, vz: 0, ms: 120 });
    expect(kq.ok).toBe(true);
    // `actor.play` thì NGƯỢC LẠI: vẫn phải xếp hàng (giao kèo A1 còn nguyên)
    void d.run('actor.play', { actor: 'gen', clip: 'wave' });
    void d.run('actor.play', { actor: 'gen', clip: 'nod' });
    await cho(NHIP_MS * 4);
    expect(queued.map((e) => e.data.cmd)).toEqual(['actor.play']);
  });

  it('steer mới THAY steer cũ (không cộng dồn hai vận tốc)', async () => {
    await d.run('actor.steer', { actor: 'owner', vx: 1.6, vz: 0, ms: 1000 });
    await d.run('actor.steer', { actor: 'owner', vx: -1.6, vz: 0, ms: 1000 });
    const lanSteer = world.lichSu.filter((x) => x.startsWith('steer:owner'));
    expect(lanSteer).toEqual(['steer:owner:1.60,0.00', 'steer:owner:-1.60,0.00']);
    // chỉ MỘT hành động đang chiếm thân
    expect(actor(await dc(), 'owner').state).toBe('walking');
  });

  it('vận tốc bị kẹp ở 1,6 m/s dù agent gửi lớn hơn', async () => {
    await d.run('actor.steer', { actor: 'owner', vx: 4, vz: 0, ms: 50 });
    expect(world.lichSu.filter((x) => x.startsWith('steer:owner'))).toEqual([
      'steer:owner:1.60,0.00',
    ]);
  });

  it('đang steer thì state = walking và `at` = null, `nearest` vẫn có', async () => {
    await d.run('actor.steer', { actor: 'owner', vx: 0, vz: -1.6, ms: 400 });
    const a = actor(await dc(), 'owner');
    expect(a.state).toBe('walking');
    expect(a.at).toBeNull();
    expect(a.nearest.place).not.toBeNull();
    expect(a.nearest.distance).toBeGreaterThanOrEqual(0);
  });

  it('steer vận tốc 0 = dừng: về idle và `at` trở lại', async () => {
    await d.run('actor.steer', { actor: 'owner', vx: 0, vz: -1.6, ms: 200 });
    await d.run('actor.steer', { actor: 'owner', vx: 0, vz: 0, ms: 120 });
    const a = actor(await dc(), 'owner');
    expect(a.state).toBe('idle');
    expect(a.at).toBe('buc-trung-tam');
  });

  it('actor không có → lỗi rõ ràng, không nổ', async () => {
    const kq = await d.run('actor.steer', { actor: 'khong-co', vx: 1, vz: 0, ms: 100 });
    expect(kq.ok).toBe(false);
    if (!kq.ok) expect(kq.error).toContain('khong-co');
  });

  it('có trong stage.bootstrap kèm tham số + ví dụ (agent tự học được)', async () => {
    const kq = await d.run('stage.bootstrap');
    expect(kq.ok).toBe(true);
    if (!kq.ok) return;
    const boot = kq.result as {
      commands: Array<{ cmd: string; params: Array<{ name: string }>; example: unknown }>;
      events: string[];
    };
    const sp = boot.commands.find((c) => c.cmd === 'actor.steer');
    expect(sp).toBeDefined();
    expect(sp!.params.map((p) => p.name)).toEqual(['actor', 'vx', 'vz', 'ms']);
    // KHÔNG có `interrupt`: lệnh không chiếm hàng đợi nên không cần cắt ngang
    expect(sp!.params.map((p) => p.name)).not.toContain('interrupt');
    expect(boot.events).toContain('actor.steerDone');
  });
});

describe('kẹp phòng + va chạm (bo-cuc.ts, D1 — căn nhà 14×10 m)', () => {
  it('kẹp trong phòng: đi ra ngoài tường thì dừng ở lề', () => {
    expect(kepTrongPhong(99, 0)[0]).toBeCloseTo(NUA_RONG - 0.5, 5);
    expect(kepTrongPhong(0, -99)[1]).toBeCloseTo(-(NUA_SAU - 0.5), 5);
    const [x, z] = truotVaCham(0, 0, 50, 50);
    expect(Math.abs(x)).toBeLessThanOrEqual(NUA_RONG - 0.5 + 1e-9);
    expect(Math.abs(z)).toBeLessThanOrEqual(NUA_SAU - 0.5 + 1e-9);
  });

  it('không đi xuyên bàn làm việc: tâm bàn bị chặn, trước bàn thì không', () => {
    const ban = KHOI_CANH.find((k) => k.id === 'ban-dieu-khien')!;
    expect(biChan(ban.tai[0], ban.tai[1])).toBe('ban-dieu-khien');
    const dung = timPlace('ban-dieu-khien')!.standAt!;
    expect(biChan(dung[0], dung[2])).toBeNull();
  });

  it('không đi xuyên kệ sách, nhưng chỗ đứng trước kệ vẫn đi được', () => {
    const ke = timPlace('ke-module')!;
    expect(biChan(ke.pos[0], ke.pos[2])).toBe('ke-module');
    expect(biChan(ke.standAt![0], ke.standAt![2])).toBeNull();
  });

  it('đi thẳng vào sofa thì dừng trước sofa, không lọt vào trong', () => {
    const sofa = KHOI_CANH.find((k) => k.id === 'sofa')!;
    const [x, z] = truotVaCham(-4.5, -3, sofa.tai[0], sofa.tai[1]);
    expect(biChan(x, z)).toBeNull();
    expect(z).toBeLessThan(sofa.tai[1]);
  });

  it('TRƯỢT dọc vật cản: đi chéo vào mép bàn ăn vẫn nhích được theo trục còn lại', () => {
    // bàn ăn ở [3.5, 2.5], chan [0.6,0.6] → mép x = 2.9. Từ phía -x đẩy chéo vào.
    const z0 = 2.5;
    const [x, z] = truotVaCham(2.2, z0, 3.2, z0 + 0.3);
    expect(x).toBeCloseTo(2.2, 5); // trục X bị bàn chặn
    expect(z).toBeGreaterThan(z0); // trục Z vẫn đi được → men theo mép
  });

  it('bị chặn cả hai trục thì đứng yên, không bị đẩy xuyên', () => {
    const [x, z] = truotVaCham(2.2, 2.5, 3.6, 2.5);
    expect([x, z]).toEqual([2.2, 2.5]);
  });
});

describe('bảng bố cục căn nhà (Issue #43 — D1)', () => {
  it('mọi toạ độ nằm trên lưới nửa ô (0,5 m)', () => {
    expect(kiemLuoi()).toEqual([]);
  });

  it(`hành lang trung tâm thoáng ≥ ${HANH_LANG} m`, () => {
    expect(kiemHanhLang()).toEqual([]);
    for (const h of hopChan()) {
      // không hộp nào lấn vào dải hành lang |x| < NUA_HANH_LANG
      expect(h.x0 >= NUA_HANH_LANG || h.x1 <= -NUA_HANH_LANG).toBe(true);
    }
  });

  it('đủ 3 khu chức năng, và không khối nào đứng trong hành lang', () => {
    const vung = new Set(KHOI_CANH.map((k) => k.vung));
    expect(vung.has('phong-khach')).toBe(true);
    expect(vung.has('ban-lam-viec')).toBe(true);
    expect(vung.has('bep')).toBe(true);
    for (const k of KHOI_CANH) {
      if (k.id === 'cua') continue; // cửa đứng giữa hành lang, không có `chan`
      expect(Math.abs(k.tai[0])).toBeGreaterThan(NUA_HANH_LANG);
    }
  });

  it('place `ban-dieu-khien` khớp đúng bảng bố cục', () => {
    const p = timPlace('ban-dieu-khien')!;
    const ban = KHOI_CANH.find((k) => k.id === 'ban-dieu-khien')!;
    expect([p.pos[0], p.pos[2]]).toEqual([ban.tai[0], ban.tai[1]]);
  });

  it('mọi chỗ đứng của place đều đi tới được (không nằm trong vật cản)', () => {
    for (const p of PLACES) {
      const d2 = p.standAt ?? p.pos;
      if (p.kind === 'shelf' || p.kind === 'desk' || p.kind === 'door') {
        expect(biChan(d2[0], d2[2]), `chỗ đứng của ${p.id}`).toBeNull();
      }
    }
  });
});

describe('bảng bố cục D1b — nhà đầy đặn (Issue #48)', () => {
  it('KHÔNG hộp chắn nào chồng lên hộp chắn khác', () => {
    const hs = hopChan();
    const chong: string[] = [];
    for (let i = 0; i < hs.length; i++) {
      for (let j = i + 1; j < hs.length; j++) {
        const a = hs[i]!;
        const b = hs[j]!;
        if (a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0) {
          chong.push(`${a.id} ✕ ${b.id}`);
        }
      }
    }
    expect(chong).toEqual([]);
  });

  it('mọi hộp chắn nằm TRONG nhà (không khối nào lòi ra ngoài tường)', () => {
    for (const h of hopChan()) {
      expect(h.x0, h.id).toBeGreaterThanOrEqual(-NUA_RONG);
      expect(h.x1, h.id).toBeLessThanOrEqual(NUA_RONG);
      expect(h.z0, h.id).toBeGreaterThanOrEqual(-NUA_SAU);
      expect(h.z1, h.id).toBeLessThanOrEqual(NUA_SAU);
    }
  });

  it('`tren` chỉ trỏ tới khối có thật và đứng TRƯỚC trong bảng (dựng xong mới đo được nóc)', () => {
    const daGap = new Set<string>();
    for (const k of KHOI_CANH) {
      if (k.tren !== undefined) {
        expect(daGap.has(k.tren), `${k.id} đặt trên ${k.tren}`).toBe(true);
      }
      daGap.add(k.id);
    }
  });

  it('đồ bày trên bàn có `tren` hoặc `datY`, không món nào lơ lửng vô cớ', () => {
    for (const k of KHOI_CANH) {
      if (k.lech) expect(k.tren !== undefined || k.datY !== undefined, k.id).toBe(true);
      if (k.datY !== undefined) expect(k.datY, k.id).toBeGreaterThan(0);
    }
  });

  it('đủ đồ cho "nhà có người ở": ≥ 2 ghế đơn, 3 cây, 3 tranh, bàn trà có đồ', () => {
    const id = new Set(KHOI_CANH.map((k) => k.id));
    expect(id.has('ghe-don-1') && id.has('ghe-don-2')).toBe(true);
    expect(KHOI_CANH.filter((k) => /^cay-/.test(k.id)).length).toBeGreaterThanOrEqual(3);
    expect(KHOI_CANH.filter((k) => /^tranh-/.test(k.id)).length).toBeGreaterThanOrEqual(3);
    const tranBanTra = KHOI_CANH.filter((k) => k.tren === 'ban-tra').map((k) => k.id);
    expect(tranBanTra).toContain('sach-ban-tra');
    expect(tranBanTra).toContain('coc-tra');
    // bàn làm việc: máy tính + đèn + sách + cốc + bảng ghim
    const tranBan = KHOI_CANH.filter((k) => k.tren === 'ban-dieu-khien').map((k) => k.id);
    expect(tranBan.length).toBeGreaterThanOrEqual(4);
    expect(id.has('bang-ghim')).toBe(true);
    // bếp: tủ trên + tủ dưới + bàn ăn có trái cây/bình hoa
    expect(id.has('tu-tren-1') && id.has('tu-duoi-1')).toBe(true);
    expect(KHOI_CANH.filter((k) => k.tren === 'ban-an').length).toBeGreaterThanOrEqual(2);
    // hành lang: kệ giày + móc áo + thảm
    expect(id.has('ke-giay') && id.has('moc-ao') && id.has('tham-cua')).toBe(true);
  });

  it('chỗ đứng của MỌI place vẫn đi tới được sau khi thêm đồ', () => {
    for (const p of PLACES) {
      const d2 = p.standAt ?? p.pos;
      if (p.kind === 'seat') continue; // ghế thì đứng chồng là đúng (ngồi xuống)
      expect(biChan(d2[0], d2[2]), `chỗ đứng của ${p.id}`).toBeNull();
    }
  });
});

describe('controlledBy (Issue #18 mục 3)', () => {
  it('stage.describe trả controlledBy cho mọi actor', async () => {
    const st = await dc();
    expect(actor(st, 'owner').controlledBy).toBe('owner');
    expect(actor(st, 'gen').controlledBy).toBe('agent');
  });

  it('actor.spawn nhận controlledBy, mặc định là agent', async () => {
    await d.run('actor.spawn', { id: 'phu', at: 'ban-2' });
    expect(actor(await dc(), 'phu').controlledBy).toBe('agent');
    await d.run('actor.spawn', { id: 'chu2', at: 'ban-1', controlledBy: 'owner' });
    expect(actor(await dc(), 'chu2').controlledBy).toBe('owner');
  });

  it('camera.preset có `theo-owner`', async () => {
    const kq = await d.run('camera.preset', { name: 'theo-owner' });
    expect(kq.ok).toBe(true);
    expect(world.may).toBe('theo-owner');
  });
});

/* ===================================================================== F1 */

/**
 * F1 (Issue #56 mục 1) — Boss xem bản D1b trên Firefox: *"nội thất đồ đạc tùm
 * lum, thiết kế kỳ"*. Bản vẽ 2D + chẩn đoán ở `docs/f1/so-do.md`. Những điều
 * dưới đây là ba nguyên tắc của bản vẽ đó, kiểm bằng SỐ chứ không bằng mắt —
 * để lần sau ai thêm một món đồ vào bảng mà đặt lẻ giữa sàn là test đỏ ngay.
 */
describe('F1 (#56) — bố cục nhà như nhà thật', () => {
  it('nguyên tắc 1: KHÔNG món nào đứng lẻ giữa sàn (sát tường hoặc thuộc cụm)', () => {
    expect(kiemCum()).toEqual([]);
  });

  it(`nguyên tắc 2: lối đi giữa hai cụm ≥ ${LOI_DI} m`, () => {
    expect(kiemLoiDi()).toEqual([]);
  });

  it('nguyên tắc 2b: hành lang trung tâm vẫn tròn 2 m sau khi dời kệ sách về x = 1,5', () => {
    expect(kiemHanhLang()).toEqual([]);
    const ke = hopChan().find((h) => h.id === 'ke-module')!;
    expect(ke.x0).toBeGreaterThanOrEqual(NUA_HANH_LANG);
    const giay = hopChan().find((h) => h.id === 'ke-giay')!;
    expect(giay.x1).toBeLessThanOrEqual(-NUA_HANH_LANG);
  });

  it('sofa và kệ TV NHÌN NHAU (lỗi số 1 của D1b: hai món vuông góc)', () => {
    const tv = KHOI_CANH.find((k) => k.id === 'ke-tivi')!;
    const sofa = KHOI_CANH.find((k) => k.id === 'sofa')!;
    // cùng một trục z → đối diện nhau, không lệch chéo
    expect(sofa.tai[1]).toBe(tv.tai[1]);
    // hai mặt quay ngược nhau đúng 180°
    expect(Math.abs(((sofa.quay - tv.quay) % 360) - 180)).toBeLessThan(1);
    // khoảng nhìn TV thật: 2,5…4 m
    const xa = Math.abs(sofa.tai[0] - tv.tai[0]);
    expect(xa).toBeGreaterThanOrEqual(2.5);
    expect(xa).toBeLessThanOrEqual(4);
    // kệ TV SÁT tường tây
    expect(hopChan().find((h) => h.id === 'ke-tivi')!.x0 + NUA_RONG).toBeLessThanOrEqual(SAT_TUONG);
  });

  it('THẢM phủ cả cụm phòng khách: chân sofa, bàn trà và 2 ghế đơn đều trên thảm', () => {
    const tham = KHOI_CANH.find((k) => k.id === 'tham')!;
    const canh = tham.rong!;
    const t = {
      x0: tham.tai[0] - canh / 2,
      x1: tham.tai[0] + canh / 2,
      z0: tham.tai[1] - (canh * 0.72) / 2,
      z1: tham.tai[1] + (canh * 0.72) / 2,
    };
    for (const id of ['sofa', 'ban-tra', 'ghe-don-1', 'ghe-don-2']) {
      const h = hopChan().find((x) => x.id === id)!;
      expect(h.x0 < t.x1 && h.x1 > t.x0 && h.z0 < t.z1 && h.z1 > t.z0, `${id} trên thảm`).toBe(
        true,
      );
    }
  });

  it('BẾP CHỮ L: hai nhánh, khe giữa các cục ≤ 0,12 m, tủ lạnh ở ĐẦU nhánh đông', () => {
    const bep = ['tu-bep', 'tu-bep-goc', 'tu-duoi-1', 'bep-nau', 'tu-duoi-2', 'tu-lanh'];
    const hs = hopChan().filter((h) => bep.includes(h.id));
    expect(hs.length).toBe(bep.length);
    // mỗi cục phải có một cục anh em cách ≤ 0,12 m → dãy liền mạch
    for (const a of hs) {
      const gan = hs
        .filter((b) => b.id !== a.id)
        .reduce((m, b) => {
          const dx = Math.max(0, Math.max(a.x0 - b.x1, b.x0 - a.x1));
          const dz = Math.max(0, Math.max(a.z0 - b.z1, b.z0 - a.z1));
          return Math.min(m, Math.hypot(dx, dz));
        }, Infinity);
      expect(gan, `${a.id} liền dãy`).toBeLessThanOrEqual(0.12);
    }
    // hai nhánh thật: có cục áp tường bắc VÀ cục áp tường đông
    expect(hs.some((h) => h.z0 + NUA_SAU <= SAT_TUONG)).toBe(true);
    expect(hs.some((h) => NUA_RONG - h.x1 <= SAT_TUONG)).toBe(true);
    // tủ lạnh ở đầu nhánh đông = cục có z lớn nhất trong dãy
    const lanh = hs.find((h) => h.id === 'tu-lanh')!;
    expect(Math.max(...hs.map((h) => h.z1))).toBe(lanh.z1);
    // DAY_BEP (mặt bếp + backsplash liền) phủ đúng hai nhánh
    expect(DAY_BEP.nhanh.map((n) => n.tuong).sort()).toEqual(['bac', 'dong']);
  });

  it('bàn ăn là CỤM RIÊNG và cách dãy bếp ≥ 1,2 m', () => {
    expect(cumCua(KHOI_CANH.find((k) => k.id === 'ban-an')!)).toBe('ban-an');
    expect(cumCua(KHOI_CANH.find((k) => k.id === 'bep-nau')!)).toBe('bep');
    const an = hopChan().find((h) => h.id === 'ban-an')!;
    const lanh = hopChan().find((h) => h.id === 'tu-lanh')!;
    expect(an.z0 - lanh.z1).toBeGreaterThanOrEqual(LOI_DI);
    // 4 ghế quanh bàn, không ghế nào có hộp chắn (phải kéo ra được)
    const ghe = ['ghe-1', 'ban-an-ghe-2', 'ban-an-ghe-3', 'ban-an-ghe-4'];
    for (const id of ghe) {
      const k = KHOI_CANH.find((x) => x.id === id)!;
      expect(k.chan, id).toBeUndefined();
      expect(Math.hypot(k.tai[0] - 4, k.tai[1] - 2)).toBeCloseTo(1, 5);
    }
  });

  it('MỘT TÔNG: không `mauVai` nào là xanh dương, không dùng model `pillowBlue`', () => {
    for (const k of KHOI_CANH) {
      if (k.mauVai === undefined) continue;
      const r = (k.mauVai >> 16) & 255;
      const g = (k.mauVai >> 8) & 255;
      const b = k.mauVai & 255;
      // tông ấm: thành phần ĐỎ luôn ≥ XANH DƯƠNG (lạnh thì ngược lại)
      expect(r, `mauVai của ${k.id}`).toBeGreaterThanOrEqual(b);
      expect(g, `mauVai của ${k.id}`).toBeGreaterThanOrEqual(b - 8);
    }
    const ten = KHOI_CANH.flatMap((k) => [k.kenney, k.kenneyPhu]).filter(Boolean) as string[];
    expect(ten.filter((t) => /Blue/i.test(t))).toEqual([]);
  });

  it('CỤM VÀO NHÀ: kệ giày + móc áo + thảm chùi chân sát tường bắc, cạnh cửa', () => {
    const cua = KHOI_CANH.find((k) => k.id === 'cua')!;
    for (const id of ['ke-giay', 'moc-ao', 'tham-cua']) {
      const k = KHOI_CANH.find((x) => x.id === id)!;
      expect(Math.abs(k.tai[1] - cua.tai[1]), id).toBeLessThanOrEqual(1.2);
      expect(Math.abs(k.tai[0] - cua.tai[0]), id).toBeLessThanOrEqual(3.2);
    }
    // cửa vẫn đi qua được
    expect(cua.chan).toBeUndefined();
    expect(biChan(0, -4.6)).toBeNull();
  });

  it('place giữ ĐỦ id cũ (hợp đồng agent/MCP không đổi)', () => {
    const can = [
      'ban-dieu-khien',
      'ban-1',
      'ban-2',
      'ghe-1',
      'ghe-2',
      'buc-trung-tam',
      'cua',
      'ke-module',
      'sofa',
      'ban-an',
      'bep',
      'cua-so',
    ];
    const co = new Set(PLACES.map((p) => p.id));
    for (const id of can) expect(co.has(id), id).toBe(true);
    // và vẫn khớp bảng bố cục ở những place gắn vào nội thất
    for (const id of ['ban-dieu-khien', 'ke-module', 'sofa', 'ban-an']) {
      const p = timPlace(id)!;
      const k = KHOI_CANH.find((x) => x.id === id)!;
      expect([p.pos[0], p.pos[2]], id).toEqual([k.tai[0], k.tai[1]]);
    }
  });
});
