/**
 * a3-screen-module-fx.test.ts — cửa chất lượng cho A3: `screen.*`, `module.*`,
 * `fx.*` (spec mục 3.4b). Chạy qua `SanKhauGia` (không WebGL) như toàn bộ
 * `pnpm test` khác — khẳng định LỆNH không hề phụ thuộc vào ruột Three.js.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { EventBus } from '../../events';
import { NhatKy } from '../../log';
import { SanKhauGia } from './san-khau-gia';

let world: SanKhauGia;
let bus: EventBus;
let d: Dispatcher;

beforeEach(() => {
  world = new SanKhauGia(['lan']);
  bus = new EventBus();
  const nhatKy = new NhatKy();
  nhatKy.theoBus(bus);
  d = new Dispatcher({ registry: taoRegistry(), world, bus, nhatKy });
});

const cho = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('screen.*', () => {
  it('spawn → show → describe thấy đúng nội dung và kind', async () => {
    const spawn = await d.run('screen.spawn', { id: 'main', at: 'buc-trung-tam' });
    expect(spawn.ok).toBe(true);
    expect(world.coScreen('main')).toBe(true);

    const show = await d.run('screen.show', { screen: 'main', kind: 'code', content: 'const a=1;' });
    expect(show.ok).toBe(true);

    const st = await d.run('stage.describe');
    if (!st.ok) throw new Error(st.error);
    const sc = (st.result as { screens: Array<{ id: string; showing: string | null }> }).screens;
    expect(sc.find((s) => s.id === 'main')?.showing).toBe('code');
  });

  it('spawn trùng id → lỗi; màn hình không có → lỗi rõ ràng', async () => {
    await d.run('screen.spawn', { id: 'main' });
    const trung = await d.run('screen.spawn', { id: 'main' });
    expect(trung.ok).toBe(false);

    const khongCo = await d.run('screen.show', { screen: 'khong-ton-tai', kind: 'text', content: 'x' });
    expect(khongCo.ok).toBe(false);
  });

  it('remove bỏ màn hình khỏi danh sách', async () => {
    await d.run('screen.spawn', { id: 'main' });
    const r = await d.run('screen.remove', { screen: 'main' });
    expect(r.ok).toBe(true);
    expect(world.coScreen('main')).toBe(false);
  });

  it('stream với "chunks" chạy dần rồi tự xong, bắn screen.streamDone', async () => {
    await d.run('screen.spawn', { id: 'main' });
    const suKien: string[] = [];
    bus.on('screen.streamDone', () => suKien.push('done'));

    const r = await d.run('screen.stream', {
      screen: 'main',
      kind: 'code',
      chunks: ['const ', 'a ', '= 1;'],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.result as { durationMs: number }).durationMs).toBeGreaterThan(0);

    // chờ hết toàn bộ chunk (ước lượng rộng, tránh flaky)
    await cho(900);
    expect(world.screenContent('main')).toBe('const a = 1;');
    expect(suKien).toContain('done');
  });

  it('stream source "agent" lùi hẹn giờ mỗi lần feed, tự xong khi im lặng', async () => {
    vi.useFakeTimers();
    try {
      await d.run('screen.spawn', { id: 'main' });
      let xong = false;
      bus.on('screen.streamDone', () => (xong = true));

      const p = d.run('screen.stream', { screen: 'main', kind: 'log', source: 'agent' });
      await vi.advanceTimersByTimeAsync(10);

      // feed vài lần, mỗi lần phải lùi hẹn giờ — không được xong sớm
      for (let i = 0; i < 3; i++) {
        world.screenAppend('main', `dòng ${i}\n`);
        bus.emit('screen.fed', { screen: 'main' });
        await vi.advanceTimersByTimeAsync(1000); // < IDLE_MS_AGENT (1800ms)
      }
      expect(xong).toBe(false);

      // im lặng đủ lâu → tự xong
      await vi.advanceTimersByTimeAsync(2000);
      const r = await p;
      expect(r.ok).toBe(true);
      expect(xong).toBe(true);
      expect(world.screenContent('main')).toContain('dòng 2');
    } finally {
      vi.useRealTimers();
    }
  });

  it('focus trả về Action có durationMs > 0', async () => {
    await d.run('screen.spawn', { id: 'main' });
    const r = await d.run('screen.focus', { screen: 'main' });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.result as { durationMs: number }).durationMs).toBeGreaterThan(0);
  });

  it('stage.describe().screens không rỗng khi có màn hình đang sống (C1)', async () => {
    await d.run('screen.spawn', { id: 'main', at: 'buc-trung-tam' });
    await d.run('screen.spawn', { id: 'left' });
    const st = await d.run('stage.describe');
    if (!st.ok) throw new Error(st.error);
    const sc = (st.result as { screens: Array<{ id: string }> }).screens;
    expect(sc.map((s) => s.id).sort()).toEqual(['left', 'main']);
  });

  it('C3: remove giữa lúc stream (chunks) không ném lỗi, không treo, bắn streamDone{cancelled:true}', async () => {
    await d.run('screen.spawn', { id: 'main' });
    const suKien: Array<{ screen: string; cancelled?: boolean }> = [];
    bus.on('screen.streamDone', (e) => suKien.push(e.data as { screen: string; cancelled?: boolean }));

    // chunk đủ dài để còn đang stream khi remove tới
    const chay = d.run('screen.stream', {
      screen: 'main',
      kind: 'log',
      chunks: ['dòng một dài để stream còn chạy khi remove tới', 'dòng hai', 'dòng ba'],
    });
    await cho(30); // chắc chắn đã bắt đầu, chưa xong
    const xoa = await d.run('screen.remove', { screen: 'main' });
    expect(xoa.ok).toBe(true);

    // không ném lỗi ra ngoài, Action của stream phải resolve (không treo)
    const r = await chay;
    expect(r.ok).toBe(true);
    expect(suKien.some((e) => e.screen === 'main' && e.cancelled === true)).toBe(true);
    expect(world.coScreen('main')).toBe(false);
  });

  it('C3: remove giữa lúc stream (source agent) không ném lỗi, không treo', async () => {
    await d.run('screen.spawn', { id: 'main' });
    const suKien: Array<{ screen: string; cancelled?: boolean }> = [];
    bus.on('screen.streamDone', (e) => suKien.push(e.data as { screen: string; cancelled?: boolean }));

    const chay = d.run('screen.stream', { screen: 'main', kind: 'log', source: 'agent' });
    await cho(20);
    world.screenAppend('main', 'đang gõ…');
    bus.emit('screen.fed', { screen: 'main' });

    const xoa = await d.run('screen.remove', { screen: 'main' });
    expect(xoa.ok).toBe(true);

    const r = await chay;
    expect(r.ok).toBe(true);
    expect(suKien.some((e) => e.screen === 'main' && e.cancelled === true)).toBe(true);
  });
});

describe('camera.preset — A1 bất biến (C2)', () => {
  it('"ban-1"/"ban-2" của A1 vẫn chạy được, "ban-dieu-khien" của A3 vẫn còn', async () => {
    for (const name of ['toan-canh', 'ban-dieu-khien', 'ban-1', 'ban-2', 'hop']) {
      const r = await d.run('camera.preset', { name });
      expect(r.ok, `camera.preset ${name} phải chạy được`).toBe(true);
    }
  });
});

describe('module.build / module.open / module.store', () => {
  it('kết tinh xong: prop có thật, actor cầm module, bắn module.built', async () => {
    const suKien: unknown[] = [];
    bus.on('module.built', (e) => suKien.push(e.data));

    const r = await d.run('module.build', {
      id: 'connector-baserow',
      shape: 'book',
      label: 'Baserow',
    });
    expect(r.ok).toBe(true);
    // prop đã có NGAY, dù hiệu ứng (building) chưa xong
    expect(world.coProp('connector-baserow')).toBe(true);
    await cho(80); // NHIP_MS giả rất ngắn, chờ dư cho chắc (kết tinh + actor.hold xong)

    const st = await d.run('stage.describe');
    if (!st.ok) throw new Error(st.error);
    const lan = (st.result as { actors: Array<{ id: string; holding: string | null }> }).actors.find(
      (a) => a.id === 'lan',
    );
    expect(lan?.holding).toBe('connector-baserow');
    expect(suKien.length).toBe(1);
  });

  it('build id đã có → lỗi, không kết tinh chồng', async () => {
    await d.run('module.build', { id: 'm1', shape: 'cube', label: 'X' });
    const r2 = await d.run('module.build', { id: 'm1', shape: 'orb', label: 'Y' });
    expect(r2.ok).toBe(false);
  });

  it('module.open mở màn hình nhỏ, module.store cất lên kệ', async () => {
    await d.run('module.build', { id: 'm2', shape: 'tool', label: 'Công cụ' });
    await cho(80);

    const mo = await d.run('module.open', { module: 'm2' });
    expect(mo.ok).toBe(true);

    const cat = await d.run('module.store', { module: 'm2', to: 'ke-module' });
    expect(cat.ok).toBe(true);
    const st = await d.run('stage.describe');
    if (!st.ok) throw new Error(st.error);
    const prop = (st.result as { props: Array<{ id: string; at: string | null }> }).props.find(
      (p) => p.id === 'm2',
    );
    expect(prop?.at).toBe('ke-module');
  });
});

describe('fx.play', () => {
  it('chạy xong, bắn fx.played, trả durationMs', async () => {
    const suKien: unknown[] = [];
    bus.on('fx.played', (e) => suKien.push(e.data));
    const r = await d.run('fx.play', { name: 'success' });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.result as { durationMs: number }).durationMs).toBeGreaterThan(0);
    await cho(50);
    expect(suKien.length).toBe(1);
  });

  it('tên hiệu ứng ngoài danh sách bị chặn', async () => {
    const r = await d.run('fx.play', { name: 'khong-co' });
    expect(r.ok).toBe(false);
  });
});
