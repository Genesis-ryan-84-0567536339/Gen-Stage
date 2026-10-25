/**
 * a2-hanh-vi.test.ts — cửa chất lượng A2: `actor.emote`, `actor.idleStyle`,
 * `actor.say` kèm `emotion`. Dùng sân khấu giả (`SanKhauGia`) như dispatcher
 * test — xác nhận HỢP ĐỒNG lệnh (tham số, hàng đợi, sự kiện), không xác nhận
 * dáng đi có "sống" không (cái đó `scripts/kiem-a2.mjs` làm trên app thật).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { EventBus } from '../../events';
import { NhatKy } from '../../log';
import { NHIP_MS, SanKhauGia } from './san-khau-gia';
import { EMOTES } from '../../stage/noi-dung';
import { IDLE_STYLES } from '../../behavior/idle-styles';
import { DINH_NGHIA_EMOTE } from '../../behavior/emotes';

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

describe('actor.emote', () => {
  it('chạy thật (không còn là stub A2), chiếm actor, bắn actor.emoteDone khi xong', async () => {
    const su: string[] = [];
    bus.on('actor.emoteDone', (e) => su.push(JSON.stringify(e.data)));

    const r = await d.run('actor.emote', { actor: 'lan', emote: 'vui' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.result as { durationMs: number }).durationMs).toBeGreaterThan(0);

    const giua = await d.run('stage.describe');
    if (giua.ok) {
      const lan = (giua.result as { actors: { id: string; busy: boolean; state: string }[] }).actors.find(
        (a) => a.id === 'lan',
      );
      expect(lan?.busy).toBe(true);
      expect(lan?.state).toBe('emoting');
    }

    await cho(NHIP_MS + 20);
    expect(su.length).toBe(1);
    expect(su[0]).toContain('"emote":"vui"');
  });

  it('mọi emote trong spec (EMOTES) đều có cấu hình và đều chạy được', async () => {
    for (const ten of EMOTES) {
      expect(DINH_NGHIA_EMOTE[ten], `thiếu cấu hình cho "${ten}"`).toBeTruthy();
      const r = await d.run('actor.emote', { actor: 'lan', emote: ten, interrupt: true });
      expect(r.ok, `"${ten}" phải chạy được`).toBe(true);
    }
  });

  it('emote không có trong danh sách → lỗi rõ ràng, không rơi vào stub A2', async () => {
    const r = await d.run('actor.emote', { actor: 'lan', emote: 'khong-ton-tai' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).not.toMatch(/^A2:/);
  });

  it('nhận `say` kèm — không phải chờ thêm lệnh actor.say riêng', async () => {
    const r = await d.run('actor.emote', {
      actor: 'lan',
      emote: 'chao',
      say: 'Chào Sếp!',
    });
    expect(r.ok).toBe(true);
  });

  it('intensity ngoài 0–1 bị chặn như mọi tham số number khác', async () => {
    const r = await d.run('actor.emote', { actor: 'lan', emote: 'vui', intensity: 2 });
    expect(r.ok).toBe(false);
  });

  it('actor đang bận emote khác thì lệnh mới vào hàng đợi, không chen ngang', async () => {
    // KHÔNG await: muốn bắt đúng lúc lệnh 1 còn đang chạy để thấy lệnh 2 xếp
    // hàng — await ngay thì lệnh 1 (dài NHIP_MS) coi như đã xong lúc hỏi.
    void d.run('actor.emote', { actor: 'lan', emote: 'buon' });
    void d.run('actor.emote', { actor: 'lan', emote: 'vui' });
    await cho(5);

    const giua = await d.run('stage.describe');
    expect(giua.ok).toBe(true);
    if (!giua.ok) return;
    const lan = (giua.result as { actors: { id: string; busy: boolean; queued: number }[] }).actors.find(
      (a) => a.id === 'lan',
    );
    expect(lan?.busy).toBe(true);
    expect(lan?.queued).toBe(1);
    await cho(NHIP_MS * 4);
  });
});

describe('actor.idleStyle', () => {
  it('đổi dáng chờ ngay (lệnh tức thì, không chiếm actor)', async () => {
    const r = await d.run('actor.idleStyle', { actor: 'lan', style: 'hao-hung' });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.result as { durationMs?: number }).durationMs).toBeUndefined();
  });

  it('mọi kiểu trong IDLE_STYLES đều hợp lệ', async () => {
    for (const kieu of IDLE_STYLES) {
      const r = await d.run('actor.idleStyle', { actor: 'lan', style: kieu });
      expect(r.ok, `kiểu "${kieu}" phải hợp lệ`).toBe(true);
    }
  });

  it('kiểu không có trong danh sách → lỗi', async () => {
    const r = await d.run('actor.idleStyle', { actor: 'lan', style: 'vui-ve' });
    expect(r.ok).toBe(false);
  });

  it('idleStyle không chiếm actor — actor.moveTo chạy ngay sau, không xếp hàng', async () => {
    await d.run('actor.idleStyle', { actor: 'lan', style: 'met' });
    const r = await d.run('actor.moveTo', { actor: 'lan', to: 'ban-2' });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.result as { queued?: number }).queued).toBeFalsy();
  });
});

describe('actor.say kèm emotion (A2: cử chỉ theo cảm xúc)', () => {
  it('vẫn chạy khi không có emotion (hành vi A1 giữ nguyên)', async () => {
    const r = await d.run('actor.say', { actor: 'lan', text: 'Xin chào' });
    expect(r.ok).toBe(true);
  });

  it('nhận emotion hợp lệ — không bắt buộc phải khớp BIEU_CAM, khớp tên emote cũng được', async () => {
    const r = await d.run('actor.say', {
      actor: 'lan',
      text: 'Sếp ơi, xong rồi!',
      emotion: 'vui',
    });
    expect(r.ok).toBe(true);
  });
});
