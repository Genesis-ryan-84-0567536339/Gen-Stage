/**
 * b3-mcp.test.ts — MCP phải là **ảnh chiếu 1:1 của registry** (B3, Issue #21).
 *
 * Đây là hợp đồng với não: nếu tool sinh thiếu một lệnh, hoặc schema nói sai
 * kiểu tham số, thì agy gọi sai và không ai biết tại sao. Test vì vậy kiểm
 * bằng số (số tool = số lệnh + 1) chứ không kiểm bằng danh sách viết tay.
 *
 * Phần hai kiểm `stage_events`: `since` không được trả lại cái cũ, và long-poll
 * phải **trả sớm** ngay khi có sự kiện mới chứ không ngồi hết `waitMs`.
 */
import { describe, expect, it } from 'vitest';
import {
  BoSuKien,
  HUONG_DAN_AGENT,
  TOOL_SU_KIEN,
  banDoTool,
  schemaThamSo,
  sinhTools,
  tenTool,
  toolTuLenh,
} from '../../../bridge/mcp';
import { taoRegistry } from '../commands/index';
import { danhSachThamSo } from '../registry';
import { Dispatcher } from '../dispatcher';
import { EventBus } from '../../events';
import { SanKhauGia } from './san-khau-gia';
import type { StageEvent } from '../types';

const registry = taoRegistry();

describe('tool sinh tự động từ registry', () => {
  it('số tool = số lệnh + 1 (stage_events)', () => {
    const tools = sinhTools();
    expect(tools.length).toBe(registry.all().length + 1);
    expect(tools.at(-1)!.name).toBe('stage_events');
  });

  it('mỗi lệnh a.b có đúng một tool a_b, không trùng tên', () => {
    const tools = sinhTools();
    const ten = tools.map((t) => t.name);
    expect(new Set(ten).size).toBe(ten.length);
    for (const sp of registry.all()) {
      expect(ten).toContain(tenTool(sp.cmd));
      expect(tenTool(sp.cmd)).not.toContain('.');
    }
    // không có tool nào không ứng với lệnh nào (ngoài stage_events)
    const banDo = banDoTool();
    for (const t of tools) {
      if (t.name === TOOL_SU_KIEN.name) continue;
      expect(banDo.get(t.name)).toBeTruthy();
    }
  });

  it('inputSchema khai đủ tham số, đúng bắt buộc, chặn tham số lạ', () => {
    for (const sp of registry.all()) {
      const t = toolTuLenh(sp);
      const params = danhSachThamSo(sp);
      const props = (t.inputSchema.properties ?? {}) as Record<string, unknown>;
      expect(Object.keys(props).sort()).toEqual(params.map((p) => p.name).sort());
      const batBuoc = params.filter((p) => p.required).map((p) => p.name);
      expect(((t.inputSchema.required as string[]) ?? []).sort()).toEqual(batBuoc.sort());
      // `validate.ts` từ chối tham số lạ → schema phải nói trước điều đó
      expect(t.inputSchema.additionalProperties).toBe(false);
      expect(t.inputSchema.type).toBe('object');
      expect(t.description).toContain(sp.desc.slice(0, 20));
    }
  });

  it('dịch đúng kiểu: enum cố định ra enum, số ra min/max, còn lại ra string', () => {
    expect(schemaThamSo({ name: 'x', type: 'boolean', desc: 'cờ' })).toMatchObject({
      type: 'boolean',
    });
    expect(
      schemaThamSo({ name: 'preset', type: 'enum', desc: 'đèn', values: ['sang', 'toi'] }),
    ).toMatchObject({ type: 'string', enum: ['sang', 'toi'] });
    // `tuDo` = cho gõ giá trị khác → KHÔNG được khoá enum, không thì não bị chặn oan
    expect(
      schemaThamSo({ name: 'emotion', type: 'enum', desc: 'cảm xúc', values: ['vui'], tuDo: true }),
    ).not.toHaveProperty('enum');
    expect(
      schemaThamSo({ name: 'ms', type: 'number', desc: 'thời lượng', min: 10, max: 99 }),
    ).toMatchObject({ type: 'number', minimum: 10, maximum: 99 });
    // toạ độ/đích khai một kiểu duy nhất (chuỗi) — `validate.ts` đọc được "x, y, z"
    expect(schemaThamSo({ name: 'to', type: 'target', desc: 'đích' }).type).toBe('string');
    expect(schemaThamSo({ name: 'steps', type: 'json', desc: 'các bước' }).type).toBe('string');
  });

  it('actor_say có schema đúng và stage_bootstrap mang lời dặn vai diễn', () => {
    const say = sinhTools().find((t) => t.name === 'actor_say')!;
    const props = say.inputSchema.properties as Record<string, { type: string }>;
    expect(props.actor.type).toBe('string');
    expect(props.text.type).toBe('string');
    expect(props.interrupt.type).toBe('boolean');
    expect(say.inputSchema.required).toEqual(expect.arrayContaining(['actor', 'text']));
    // vai diễn: chỉ điều khiển gen, trả lời tiếng Việt, không lái owner
    expect(HUONG_DAN_AGENT).toMatch(/Gen/);
    expect(HUONG_DAN_AGENT).toMatch(/actor_say/);
    expect(HUONG_DAN_AGENT).toMatch(/owner/);
  });

  it('stage_events nhận since + waitMs, không nhận tham số lạ', () => {
    const p = TOOL_SU_KIEN.inputSchema.properties as Record<string, unknown>;
    expect(Object.keys(p).sort()).toEqual(['since', 'waitMs']);
    expect(TOOL_SU_KIEN.inputSchema.additionalProperties).toBe(false);
    expect(TOOL_SU_KIEN.description).toMatch(/user\.text/);
  });
});

describe('stage_events — long-poll + since', () => {
  it('trả ngay sự kiện đã có, seq tăng dần', async () => {
    const bo = new BoSuKien();
    bo.them({ event: 'stage.ready', data: {} });
    bo.them({ event: 'user.text', data: { actor: 'owner', text: 'Chào Gen' } });

    const tra = await bo.doc(0, 0);
    expect(tra.events.map((e) => e.event)).toEqual(['stage.ready', 'user.text']);
    expect(tra.events[0]!.seq).toBe(1);
    expect(tra.latest).toBe(2);
  });

  it('since chỉ lấy cái mới, không trả lại cái đã đọc', async () => {
    const bo = new BoSuKien();
    bo.them({ event: 'a' });
    bo.them({ event: 'b' });
    const lan1 = await bo.doc(0, 0);
    expect(lan1.latest).toBe(2);

    // chưa có gì mới: rỗng, và `latest` không tụt về sau
    const lan2 = await bo.doc(lan1.latest, 0);
    expect(lan2.events).toEqual([]);
    expect(lan2.latest).toBe(2);

    bo.them({ event: 'user.text', data: { text: 'việc mới' } });
    const lan3 = await bo.doc(lan1.latest, 0);
    expect(lan3.events.map((e) => e.event)).toEqual(['user.text']);
    expect(lan3.latest).toBe(3);
  });

  it('waitMs chờ tới khi có sự kiện mới, và trả SỚM ngay lúc đó', async () => {
    const bo = new BoSuKien();
    const t0 = Date.now();
    const cho = bo.doc(0, 5000);
    setTimeout(() => bo.them({ event: 'user.text', data: { text: 'Gen ơi' } }), 120);

    const tra = await cho;
    const mat = Date.now() - t0;
    expect(tra.events).toHaveLength(1);
    expect(tra.events[0]!.event).toBe('user.text');
    expect(mat).toBeLessThan(2000); // không ngồi hết 5 s
    expect(mat).toBeGreaterThanOrEqual(100);
  });

  it('hết waitMs mà không có gì thì trả rỗng, không ném lỗi', async () => {
    const bo = new BoSuKien();
    const t0 = Date.now();
    const tra = await bo.doc(0, 150);
    expect(tra.events).toEqual([]);
    expect(tra.latest).toBe(0);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(140);
  });

  it('nhiều người chờ cùng lúc đều được đánh thức', async () => {
    const bo = new BoSuKien();
    const a = bo.doc(0, 3000);
    const b = bo.doc(0, 3000);
    setTimeout(() => bo.them({ event: 'user.click', data: {} }), 60);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.events).toHaveLength(1);
    expect(rb.events).toHaveLength(1);
  });
});

/* ------------------------------------------------- vòng hội thoại: user.text */

describe('Owner nói → sự kiện user.text (vòng hội thoại B3)', () => {
  it('actor.say lên nhân vật controlledBy owner thì bắn user.text', async () => {
    const world = new SanKhauGia([]);
    const bus = new EventBus();
    const d = new Dispatcher({ registry: taoRegistry(), world, bus });
    await world.actorSpawn({ id: 'owner', controlledBy: 'owner' });
    await world.actorSpawn({ id: 'gen' });

    const thay: StageEvent[] = [];
    bus.on('user.text', (e) => thay.push(e));

    const kq = await d.run('actor.say', { actor: 'owner', text: 'Gen, dựng connector Baserow' });
    expect(kq.ok).toBe(true);
    expect(thay).toHaveLength(1);
    // C0 (#28) — `user.text` mang thêm `to` (nói với ai; mặc định `camera` = Sếp)
    // I1 vòng 2 (#74) — thêm `sePhat`: câu này SẮP phát ra bằng giọng, để phản
    // xạ khỏi chêm câu đệm vào cửa sổ `user.text` → `actor.sayStart`.
    expect(thay[0]!.data).toEqual({
      actor: 'owner',
      text: 'Gen, dựng connector Baserow',
      to: 'camera',
      sePhat: true,
    });
  });

  it('Gen nói thì KHÔNG bắn user.text (không tự nghe lời mình)', async () => {
    const world = new SanKhauGia([]);
    const bus = new EventBus();
    const d = new Dispatcher({ registry: taoRegistry(), world, bus });
    await world.actorSpawn({ id: 'owner', controlledBy: 'owner' });
    await world.actorSpawn({ id: 'gen' });

    const thay: StageEvent[] = [];
    bus.on('user.text', (e) => thay.push(e));

    const kq = await d.run('actor.say', { actor: 'gen', text: 'Dạ em làm ngay ạ.' });
    expect(kq.ok).toBe(true);
    expect(thay).toHaveLength(0);
  });

  it('user.text nằm trong danh sách sự kiện của actor.say (bootstrap thấy được)', () => {
    const say = taoRegistry().get('actor.say')!;
    expect(say.events).toContain('user.text');
    expect(taoRegistry().suKien()).toContain('user.text');
  });
});
