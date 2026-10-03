/**
 * script.test.ts — kịch bản: chạy lần lượt, chạy cùng lúc, `wait`, `waitFor`,
 * `script.stop`, và dạng ngắn `lan moveTo ban-2`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { datLaiKichBan } from '../commands/script';
import { EventBus } from '../../events';
import { NHIP_MS, SanKhauGia } from './san-khau-gia';
import { phanTichDangNgan } from '../../ui/script-box';

let world: SanKhauGia;
let bus: EventBus;
let d: Dispatcher;

beforeEach(() => {
  datLaiKichBan();
  world = new SanKhauGia(['lan']);
  bus = new EventBus();
  d = new Dispatcher({ registry: taoRegistry(), world, bus });
});

const xongKichBan = () => bus.once('script.done');

describe('script.run', () => {
  it('chạy lần lượt đúng thứ tự', async () => {
    const r = await d.run('script.run', {
      steps: [
        { cmd: 'actor.moveTo', args: { actor: 'lan', to: 'ban-2' } },
        { cmd: 'actor.express', args: { actor: 'lan', expression: 'happy' } },
        { cmd: 'actor.say', args: { actor: 'lan', text: 'Tới rồi Sếp' } },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toMatchObject({ steps: 3, mode: 'sequential', running: true });

    const e = await xongKichBan();
    expect(e.data).toMatchObject({ steps: 3, errors: 0 });
    expect(world.lichSu).toEqual([
      'moveTo:lan',
      'express:happy',
      'say:Tới rồi Sếp',
      'say:lan',
    ]);
  });

  it('waitFor chờ đúng sự kiện sân khấu rồi mới đi tiếp', async () => {
    const moc: string[] = [];
    bus.on('actor.arrived', () => moc.push('arrived'));
    bus.on('script.step', (e) => {
      const st = e.data.step as { cmd?: string };
      if (st.cmd === 'actor.express') moc.push('express');
    });

    await d.run('script.run', {
      steps: [
        { cmd: 'actor.moveTo', args: { actor: 'lan', to: 'ban-2' } },
        { waitFor: 'actor.arrived' },
        { cmd: 'actor.express', args: { actor: 'lan', expression: 'happy' } },
      ],
    });
    await xongKichBan();
    expect(moc).toEqual(['arrived', 'express']);
  });

  it('waitFor sự kiện không bao giờ tới → báo lỗi bước, kịch bản vẫn xong', async () => {
    await d.run('script.run', {
      steps: [{ waitFor: 'khong-bao-gio', timeoutMs: 30 }, { wait: 1 }],
    });
    const loi: string[] = [];
    bus.on('script.stepError', (e) => loi.push(String(e.data.error)));
    const e = await xongKichBan();
    expect(e.data).toMatchObject({ errors: 1 });
    expect(loi[0]).toContain('khong-bao-gio');
  });

  it('wait nghỉ đúng khoảng thời gian', async () => {
    const t0 = Date.now();
    await d.run('script.run', { steps: [{ wait: 120 }] });
    await xongKichBan();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(110);
  });

  it('mode parallel bắn mọi bước cùng lúc', async () => {
    await d.run('actor.spawn', { id: 'minh', at: 'ban-2' });
    const t0 = Date.now();
    await d.run('script.run', {
      mode: 'parallel',
      steps: [
        { cmd: 'actor.play', args: { actor: 'lan', clip: 'wave' } },
        { cmd: 'actor.play', args: { actor: 'minh', clip: 'wave' } },
        { wait: 40 },
      ],
    });
    const e = await xongKichBan();
    expect(e.data).toMatchObject({ mode: 'parallel', errors: 0 });
    // cùng lúc: tổng thời gian ≈ bước dài nhất, không phải tổng các bước
    expect(Date.now() - t0).toBeLessThan(NHIP_MS * 2 + 120);
  });

  it('bước lỗi được ghi lại nhưng kịch bản chạy hết', async () => {
    await d.run('script.run', {
      steps: [
        { cmd: 'actor.play', args: { actor: 'lan', clip: 'khong-co' } },
        { cmd: 'actor.express', args: { actor: 'lan', expression: 'happy' } },
      ],
    });
    const e = await xongKichBan();
    expect(e.data).toMatchObject({ errors: 1 });
    expect(world.lichSu).toContain('express:happy');
  });

  it('script.stop dừng giữa kịch bản', async () => {
    await d.run('script.run', {
      steps: [{ wait: 20 }, { wait: 400 }, { cmd: 'actor.express', args: { actor: 'lan', expression: 'happy' } }],
    });
    const dung = bus.once('script.stopped');
    await new Promise((r) => setTimeout(r, 40));
    const r = await d.run('script.stop');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toMatchObject({ stopped: true });
    await dung;
    expect(world.lichSu).not.toContain('express:happy');
  });

  it('steps rỗng hoặc sai khuôn → lỗi rõ ràng', async () => {
    const a = await d.run('script.run', { steps: [] });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.error).toContain('rỗng');

    const b = await d.run('script.run', { steps: [{ abc: 1 }] });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error).toContain('"cmd"');
  });

  it('kịch bản mẫu của spec (bỏ phần A3) chạy trọn, không lỗi bước nào', async () => {
    await d.run('script.run', {
      steps: [
        { cmd: 'actor.moveTo', args: { actor: 'lan', to: 'ban-2' } },
        { waitFor: 'actor.arrived' },
        { cmd: 'actor.express', args: { actor: 'lan', expression: 'happy' } },
        { cmd: 'actor.say', args: { actor: 'lan', text: 'Sếp ơi, test xanh rồi!' } },
        { cmd: 'actor.play', args: { actor: 'lan', clip: 'celebrate' } },
      ],
    });
    const e = await xongKichBan();
    expect(e.data).toMatchObject({ steps: 5, errors: 0 });
  });
});

describe('dạng ngắn trong ô kịch bản', () => {
  it('"lan moveTo ban-2" thành actor.moveTo đủ tham số', () => {
    const steps = phanTichDangNgan('lan moveTo ban-2', d);
    expect(steps).toEqual([{ cmd: 'actor.moveTo', args: { actor: 'lan', to: 'ban-2' } }]);
  });

  it('wait / waitFor / ghi chú', () => {
    const steps = phanTichDangNgan(
      '# thử\nwait 500\nwaitFor actor.arrived\n\n// hết',
      d,
    );
    expect(steps[0]).toEqual({ wait: 500 });
    expect(steps[1]).toMatchObject({ waitFor: 'actor.arrived' });
    expect(steps.length).toBe(2);
  });

  it('tham số chữ lấy hết phần còn lại của dòng', () => {
    const steps = phanTichDangNgan('lan say Sếp ơi, test xanh rồi!', d);
    expect(steps[0]).toEqual({
      cmd: 'actor.say',
      args: { actor: 'lan', text: 'Sếp ơi, test xanh rồi!' },
    });
  });

  it('dạng key=value', () => {
    const steps = phanTichDangNgan('actor.moveTo actor=lan to=ban-2 speed=1.4', d);
    expect(steps[0]!.args).toEqual({ actor: 'lan', to: 'ban-2', speed: '1.4' });
  });

  it('gõ sai tên lệnh → báo đúng số dòng', () => {
    expect(() => phanTichDangNgan('lan bay ban-2', d)).toThrow(/Dòng 1/);
  });

  it('thừa tham số → báo lỗi, không âm thầm bỏ', () => {
    expect(() => phanTichDangNgan('lan moveTo ban-2 1 2 3 4', d)).toThrow(/thừa/);
  });

  it('kịch bản dạng ngắn nhiều dòng chạy được thật qua dispatcher', async () => {
    const steps = phanTichDangNgan(
      ['lan moveTo ban-2', 'waitFor actor.arrived', 'lan play wave'].join('\n'),
      d,
    );
    await d.run('script.run', { steps });
    const e = await xongKichBan();
    expect(e.data).toMatchObject({ errors: 0 });
    expect(world.lichSu).toEqual(['moveTo:lan', 'play.wave:lan']);
  });
});
