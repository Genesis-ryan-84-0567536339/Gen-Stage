/**
 * b1-steer-bo-cuc.test.ts — B1 (Issue #18): `actor.steer` + bảng bố cục.
 *
 * Ba giao kèo phải giữ, kiểm bằng số chứ không bằng mắt:
 *  1. `actor.steer` **không xếp hàng** — steer mới thay steer cũ, và gửi steer
 *     lúc actor đang bận cũng không bị đẩy vào hàng đợi.
 *  2. Kẹp trong phòng + không đi xuyên bàn/kệ (`bo-cuc.truotVaCham`).
 *  3. Đang steer thì `at` luôn `null` (giao kèo A1 không được phá), còn
 *     `nearest` vẫn luôn có.
 * Cộng thêm: bảng bố cục thẳng lưới, hành lang ≥ 3 m, `controlledBy`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { EventBus } from '../../events';
import { SanKhauGia, NHIP_MS } from './san-khau-gia';
import type { StageEvent, StageState } from '../types';
import {
  BAN_CONG,
  BAN_KINH_BUC,
  HANH_LANG,
  KHOI_CANH,
  NUA_PHONG,
  biChan,
  hopChan,
  kepTrongPhong,
  kiemHanhLang,
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

describe('kẹp phòng + va chạm (bo-cuc.ts)', () => {
  it('kẹp trong phòng: đi ra ngoài tường thì dừng ở lề', () => {
    expect(kepTrongPhong(99, 0)[0]).toBeCloseTo(NUA_PHONG - 0.6, 5);
    expect(kepTrongPhong(0, -99)[1]).toBeCloseTo(-(NUA_PHONG - 0.6), 5);
    const [x, z] = truotVaCham(0, 0, 50, 50);
    expect(Math.abs(x)).toBeLessThanOrEqual(NUA_PHONG - 0.6 + 1e-9);
    expect(Math.abs(z)).toBeLessThanOrEqual(NUA_PHONG - 0.6 + 1e-9);
  });

  it('không đi xuyên bàn điều khiển: tâm bàn bị chặn, trước bàn thì không', () => {
    expect(biChan(BAN_CONG.tai[0], BAN_CONG.tai[1])).toBe('ban-dieu-khien');
    const dung = timPlace('ban-dieu-khien')!.standAt!;
    expect(biChan(dung[0], dung[2])).toBeNull();
  });

  it('không đi xuyên kệ module, nhưng chỗ đứng trước kệ vẫn đi được', () => {
    const ke = timPlace('ke-module')!;
    expect(biChan(ke.pos[0], ke.pos[2])).toBe('ke-module');
    expect(biChan(ke.standAt![0], ke.standAt![2])).toBeNull();
  });

  it('đi thẳng vào bàn thì dừng trước bàn, không lọt vào trong', () => {
    const [x, z] = truotVaCham(3, -1, BAN_CONG.tai[0], -1);
    expect(biChan(x, z)).toBeNull();
    expect(x).toBeLessThan(BAN_CONG.tai[0]);
  });

  it('TRƯỢT dọc vật cản: đi chéo vào mép bàn vẫn nhích được theo trục còn lại', () => {
    // từ trước bàn, đẩy chéo (+x vào bàn, +z men theo mép)
    const z0 = -1;
    const [x, z] = truotVaCham(5.2, z0, 5.9, z0 + 0.3);
    expect(x).toBeCloseTo(5.2, 5); // trục X bị bàn chặn
    expect(z).toBeGreaterThan(z0); // trục Z vẫn đi được → men theo mép
  });

  it('bị chặn cả hai trục thì đứng yên, không bị đẩy xuyên', () => {
    const [x, z] = truotVaCham(5.2, -1, 6.2, -1);
    expect([x, z]).toEqual([5.2, -1]);
  });
});

describe('bảng bố cục 3 vùng (Issue #18 mục 1)', () => {
  it('mọi toạ độ nằm trên lưới nửa ô (0,5 m)', () => {
    expect(kiemLuoi()).toEqual([]);
  });

  it(`hành lang hai bên bục thoáng ≥ ${HANH_LANG} m`, () => {
    expect(kiemHanhLang()).toEqual([]);
    for (const h of hopChan()) {
      // không hộp nào đè lên mặt bục
      const gan = Math.hypot(
        Math.max(h.x0, Math.min(0, h.x1)),
        Math.max(h.z0, Math.min(0, h.z1)),
      );
      expect(gan).toBeGreaterThan(BAN_KINH_BUC);
    }
  });

  it('đủ 3 vùng, và không khối nào đứng giữa phòng phía trước', () => {
    const vung = new Set(KHOI_CANH.map((k) => k.vung));
    expect(vung.has('dieu-khien')).toBe(true);
    expect(vung.has('kho')).toBe(true);
    expect(vung.has('tuong-sau')).toBe(true);
    for (const k of KHOI_CANH) {
      if (k.tai[1] > -3) expect(Math.abs(k.tai[0])).toBeGreaterThan(2.2);
    }
  });

  it('place `ban-dieu-khien` khớp đúng bảng bố cục', () => {
    const p = timPlace('ban-dieu-khien')!;
    expect([p.pos[0], p.pos[2]]).toEqual([BAN_CONG.tai[0], BAN_CONG.tai[1]]);
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
