/**
 * dispatcher.test.ts — cửa chất lượng của lõi điều khiển:
 * kiểm tham số, hàng đợi khi actor bận, `interrupt`, và lỗi rõ ràng.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { EventBus } from '../../events';
import { NhatKy } from '../../log';
import { NHIP_MS, SanKhauGia } from './san-khau-gia';

let world: SanKhauGia;
let bus: EventBus;
let nhatKy: NhatKy;
let d: Dispatcher;

beforeEach(() => {
  world = new SanKhauGia(['lan']);
  bus = new EventBus();
  nhatKy = new NhatKy();
  nhatKy.theoBus(bus);
  d = new Dispatcher({ registry: taoRegistry(), world, bus, nhatKy });
});

const cho = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('tìm lệnh', () => {
  it('lệnh không có → lỗi kèm gợi ý và chỉ sang stage.bootstrap', async () => {
    const r = await d.run('actor.moveto');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('actor.moveTo');
    expect(r.error).toContain('stage.bootstrap');
  });

  it('mọi lệnh trong spec v0.1 đều đã đăng ký', async () => {
    const r = await d.run('stage.bootstrap');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ten = (r.result as { commands: { cmd: string }[] }).commands.map((c) => c.cmd);
    for (const c of [
      'stage.bootstrap',
      'stage.describe',
      'stage.reset',
      'actor.spawn',
      'actor.remove',
      'actor.list',
      'actor.moveTo',
      'actor.lookAt',
      'actor.turnTo',
      'actor.sit',
      'actor.stand',
      'actor.play',
      'actor.stop',
      'actor.express',
      'actor.say',
      'actor.bubble',
      'actor.hold',
      'actor.drop',
      'actor.emote',
      'actor.idleStyle',
      'prop.spawn',
      'prop.remove',
      'prop.list',
      'prop.moveTo',
      'prop.set',
      'scene.light',
      'camera.focus',
      'camera.preset',
      'script.run',
      'script.stop',
      'screen.spawn',
      'screen.show',
      'screen.stream',
      'screen.clear',
      'screen.focus',
      'screen.remove',
      'module.build',
      'module.open',
      'module.store',
      'fx.play',
    ]) {
      expect(ten, `thiếu lệnh ${c}`).toContain(c);
    }
  });

  it('lệnh A2/A3 chỉ là stub, trả ok:false nói rõ đợt nào', async () => {
    const r = await d.run('actor.emote', { actor: 'lan', emote: 'vui' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/^A2:/);
    const r2 = await d.run('module.build', {
      id: 'm1',
      shape: 'book',
      label: 'Baserow',
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/^A3:/);
  });
});

describe('kiểm tham số', () => {
  it('thiếu tham số bắt buộc → nói rõ thiếu cái gì', async () => {
    const r = await d.run('actor.moveTo', { actor: 'lan' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('thiếu "to"');
  });

  it('tham số lạ bị chặn, kèm danh sách tham số nhận được', async () => {
    const r = await d.run('actor.moveTo', { actor: 'lan', to: 'ban-2', toc: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('tham số lạ "toc"');
      expect(r.error).toContain('speed');
    }
  });

  it('giá trị ngoài danh sách enum bị chặn', async () => {
    const r = await d.run('actor.play', { actor: 'lan', clip: 'bay-len-troi' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('không có trong');
  });

  it('số ngoài khoảng bị chặn', async () => {
    const r = await d.run('actor.moveTo', { actor: 'lan', to: 'ban-2', speed: 99 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('phải ≤ 4');
  });

  it('chuẩn hoá: "1, 0, -2" và "true" thành đúng kiểu', async () => {
    const r = await d.run('actor.moveTo', { actor: 'lan', to: '1, 0, -2' });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.result as { to: unknown }).to).toEqual([1, 0, -2]);
    await cho(NHIP_MS * 2);
    const r2 = await d.run('actor.play', { actor: 'lan', clip: 'wave', loop: 'true' });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect((r2.result as { loop: boolean }).loop).toBe(true);
  });

  it('actor không có → lỗi kèm danh sách actor đang có', async () => {
    const r = await d.run('actor.moveTo', { actor: 'khong-ton-tai', to: 'ban-2' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('khong-ton-tai');
      // thông báo luôn kèm danh sách actor thật để agent tự sửa
      expect(r.error).toContain('lan');
    }
  });

  it('ngồi vào thứ không phải ghế → lỗi, có gợi ý ghế đang có', async () => {
    const r = await d.run('actor.sit', { actor: 'lan', seat: 'ban-1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('không phải ghế');
  });
});

describe('trả lời ngay kèm durationMs', () => {
  it('lệnh có thời lượng trả về durationMs > 0 ngay lập tức', async () => {
    const r = await d.run('actor.say', { actor: 'lan', text: 'Xin chào Sếp' });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.result as { durationMs: number }).durationMs).toBeGreaterThan(0);
  });

  it('nhật ký ghi đủ {t, cmd, args, ok, durationMs}', async () => {
    await d.run('actor.express', { actor: 'lan', expression: 'happy' });
    const ds = nhatKy.tatCa().filter((b) => b.loai === 'lenh');
    expect(ds.length).toBe(1);
    const b = ds[0]!;
    if (b.loai !== 'lenh') return;
    expect(b.cmd).toBe('actor.express');
    expect(b.ok).toBe(true);
    expect(typeof b.durationMs).toBe('number');
    expect(b.args).toMatchObject({ actor: 'lan', expression: 'happy' });
    expect(typeof b.t).toBe('number');
  });

  it('sự kiện cũng vào nhật ký (để xuất JSON làm bằng chứng)', async () => {
    await d.run('actor.express', { actor: 'lan', expression: 'happy' });
    expect(JSON.parse(nhatKy.toJSON()).banGhi.length).toBeGreaterThan(0);
  });
});

describe('hàng đợi khi actor bận', () => {
  it('lệnh thứ hai chờ lệnh thứ nhất xong rồi mới chạy', async () => {
    const xong: string[] = [];
    const p1 = d.run('actor.moveTo', { actor: 'lan', to: 'ban-2' }).then(() => xong.push('1'));
    const p2 = d.run('actor.play', { actor: 'lan', clip: 'wave' }).then(() => xong.push('2'));

    // ngay sau khi gửi: lệnh 1 đã chạy, lệnh 2 còn xếp hàng
    await cho(5);
    expect(d.dangBan('lan')).toBe(true);
    expect(d.soCho('lan')).toBe(1);

    await Promise.all([p1, p2]);
    expect(xong).toEqual(['1', '2']);
    expect(world.lichSu).toEqual(['moveTo:lan', 'play.wave:lan']);
  });

  it('stage.describe báo đúng busy và queued', async () => {
    void d.run('actor.moveTo', { actor: 'lan', to: 'ban-2' });
    void d.run('actor.play', { actor: 'lan', clip: 'wave' });
    await cho(5);

    const r = await d.run('stage.describe');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = (r.result as { actors: { busy: boolean; queued: number }[] }).actors[0]!;
    expect(a.busy).toBe(true);
    expect(a.queued).toBe(1);
    await cho(NHIP_MS * 4);
  });

  it('phát sự kiện cmd.queued kèm vị trí trong hàng', async () => {
    const thay: Array<Record<string, unknown>> = [];
    bus.on('cmd.queued', (e) => thay.push(e.data));
    void d.run('actor.moveTo', { actor: 'lan', to: 'ban-2' });
    void d.run('actor.play', { actor: 'lan', clip: 'wave' });
    void d.run('actor.play', { actor: 'lan', clip: 'nod' });
    await cho(NHIP_MS * 6);
    expect(thay.length).toBe(2);
    expect(thay[0]).toMatchObject({ actor: 'lan', position: 1, dangChay: 'actor.moveTo' });
    expect(thay[1]).toMatchObject({ position: 2 });
  });

  it('hai actor khác nhau chạy song song, không chặn nhau', async () => {
    await d.run('actor.spawn', { id: 'minh', at: 'ban-2' });
    const t0 = Date.now();
    await Promise.all([
      d.run('actor.play', { actor: 'lan', clip: 'wave' }),
      d.run('actor.play', { actor: 'minh', clip: 'wave' }),
    ]);
    expect(Date.now() - t0).toBeLessThan(NHIP_MS * 8);
    expect(d.soCho('lan')).toBe(0);
    expect(d.soCho('minh')).toBe(0);
  });

  it('lệnh tức thì (express, lookAt) không bị xếp hàng dù actor đang bận', async () => {
    void d.run('actor.moveTo', { actor: 'lan', to: 'ban-2' });
    await cho(5);
    const r = await d.run('actor.express', { actor: 'lan', expression: 'happy' });
    expect(r.ok).toBe(true);
    expect(d.soCho('lan')).toBe(0);
    await cho(NHIP_MS * 4);
  });
});

describe('interrupt', () => {
  it('interrupt:true cắt hành động đang chạy và xoá hàng đợi', async () => {
    const kqCho: string[] = [];
    void d.run('actor.moveTo', { actor: 'lan', to: 'ban-2' });
    void d
      .run('actor.play', { actor: 'lan', clip: 'wave' })
      .then((r) => kqCho.push(r.ok ? 'ok' : r.error));
    await cho(5);
    expect(d.soCho('lan')).toBe(1);

    const r = await d.run('actor.play', {
      actor: 'lan',
      clip: 'nod',
      interrupt: true,
    });
    expect(r.ok).toBe(true);
    expect(world.lichSu).toContain('interrupt:lan');
    expect(kqCho[0]).toContain('Bị cắt bởi interrupt');
    await cho(NHIP_MS * 4);
  });

  it('actor.stop dừng việc đang làm, báo số lệnh đã bỏ khỏi hàng đợi', async () => {
    void d.run('actor.moveTo', { actor: 'lan', to: 'ban-2' });
    void d.run('actor.play', { actor: 'lan', clip: 'wave' });
    void d.run('actor.play', { actor: 'lan', clip: 'nod' });
    await cho(5);

    const r = await d.run('actor.stop', { actor: 'lan' });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.result as { boHangDoi: number }).boHangDoi).toBe(2);
    expect(d.dangBan('lan')).toBe(false);
    expect(d.soCho('lan')).toBe(0);
  });

  it('không có interrupt thì lệnh mới KHÔNG cắt lệnh cũ', async () => {
    void d.run('actor.moveTo', { actor: 'lan', to: 'ban-2' });
    await cho(5);
    void d.run('actor.play', { actor: 'lan', clip: 'wave' });
    await cho(NHIP_MS * 5);
    expect(world.lichSu).not.toContain('interrupt:lan');
    expect(world.lichSu).toEqual(['moveTo:lan', 'play.wave:lan']);
  });
});

describe('lỗi từ sân khấu', () => {
  it('sân khấu ném lỗi → dispatcher trả ok:false, không nổ ra ngoài', async () => {
    const r = await d.run('actor.spawn', { id: 'lan' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('đã có trên sân khấu');
  });

  it('lệnh lỗi bắn sự kiện cmd.error để agent biết', async () => {
    const thay: Array<Record<string, unknown>> = [];
    bus.on('cmd.error', (e) => thay.push(e.data));
    await d.run('actor.spawn', { id: 'lan' });
    expect(thay.length).toBe(1);
    expect(thay[0]!.cmd).toBe('actor.spawn');
  });

  it('actor bận mà lệnh sau lỗi thì hàng đợi vẫn chạy tiếp, không treo', async () => {
    void d.run('actor.moveTo', { actor: 'lan', to: 'ban-2' });
    // "cua" là place hợp lệ nên qua được bước kiểm tham số, nhưng sân khấu từ
    // chối vì không phải ghế → lỗi xảy ra lúc đã nằm trong hàng đợi
    const pLoi = d.run('actor.sit', { actor: 'lan', seat: 'cua' });
    const pSau = d.run('actor.play', { actor: 'lan', clip: 'wave' });
    const [a, b] = await Promise.all([pLoi, pSau]);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.error).toContain('không phải ghế');
    expect(b.ok).toBe(true);
    await cho(NHIP_MS * 3);
    expect(d.dangBan('lan')).toBe(false);
    expect(d.soCho('lan')).toBe(0);
  });
});

describe('vòng đời actor và prop', () => {
  it('spawn → list → remove chạy thật', async () => {
    await d.run('actor.spawn', { id: 'minh', name: 'Minh', at: 'ban-2' });
    const ds = await d.run('actor.list');
    expect(ds.ok).toBe(true);
    if (ds.ok) {
      expect((ds.result as { actors: { id: string }[] }).actors.map((a) => a.id)).toEqual([
        'lan',
        'minh',
      ]);
    }
    expect((await d.run('actor.remove', { actor: 'minh' })).ok).toBe(true);
    expect(world.actorIds()).toEqual(['lan']);
  });

  it('prop: spawn → hold → drop → set → remove', async () => {
    expect((await d.run('prop.spawn', { id: 'so-tay', shape: 'book' })).ok).toBe(true);
    expect((await d.run('actor.hold', { actor: 'lan', prop: 'so-tay' })).ok).toBe(true);
    const drop = await d.run('actor.drop', { actor: 'lan' });
    if (drop.ok) expect((drop.result as { prop: string }).prop).toBe('so-tay');

    const set = await d.run('prop.set', {
      prop: 'so-tay',
      state: { screen: 'on', text: 'Đang chạy test…' },
    });
    expect(set.ok).toBe(true);
    expect((await d.run('prop.remove', { prop: 'so-tay' })).ok).toBe(true);
  });

  it('stage.reset dọn hàng đợi và về trạng thái đầu', async () => {
    await d.run('actor.spawn', { id: 'minh', at: 'ban-2' });
    void d.run('actor.moveTo', { actor: 'lan', to: 'ban-2' });
    void d.run('actor.play', { actor: 'lan', clip: 'wave' });
    await cho(5);

    const r = await d.run('stage.reset');
    expect(r.ok).toBe(true);
    expect(world.actorIds()).toEqual(['lan']);
    expect(d.soCho('lan')).toBe(0);
    expect(d.dangBan('lan')).toBe(false);
  });
});
