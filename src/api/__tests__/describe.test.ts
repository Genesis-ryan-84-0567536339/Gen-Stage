/**
 * describe.test.ts — `stage.describe` phải đúng khuôn spec mục 1b, vì đây là
 * **mắt của AI**: sai khuôn là não đọc sai thế giới.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { EventBus } from '../../events';
import { PLACES } from '../../stage/noi-dung';
import { NHIP_MS, SanKhauGia } from './san-khau-gia';
import type { StageState } from '../types';

let world: SanKhauGia;
let d: Dispatcher;

beforeEach(() => {
  world = new SanKhauGia(['lan']);
  d = new Dispatcher({ registry: taoRegistry(), world, bus: new EventBus() });
});

async function moTa(): Promise<StageState> {
  const r = await d.run('stage.describe');
  if (!r.ok) throw new Error(r.error);
  return r.result as StageState;
}

describe('khuôn stage.describe', () => {
  it('có đủ khoá version / time / actors / places / screens / props / lastEvents', async () => {
    const st = await moTa();
    expect(Object.keys(st)).toEqual(
      expect.arrayContaining([
        'version',
        'time',
        'actors',
        'places',
        'screens',
        'props',
        'lastEvents',
      ]),
    );
    expect(st.version).toBe('0.1');
    expect(st.time).toMatchObject({
      clock: expect.stringMatching(/^\d{2}:\d{2}$/),
      bossPresent: expect.any(Boolean),
      idleSec: expect.any(Number),
    });
  });

  it('actor là một máy trạng thái đầy đủ theo spec', async () => {
    const st = await moTa();
    const a = st.actors[0]!;
    expect(a).toMatchObject({
      id: 'lan',
      pos: expect.any(Array),
      facing: expect.any(Number),
      state: expect.stringMatching(/^(idle|walking|sitting|playing|speaking|emoting|building)$/),
      busy: expect.any(Boolean),
      mood: expect.any(String),
      expression: expect.any(String),
      distances: expect.any(Object),
    });
    expect(a.pos.length).toBe(3);
    expect('holding' in a && 'lookingAt' in a && 'at' in a).toBe(true);
    expect(a.nearest).toMatchObject({
      place: expect.any(String),
      distance: expect.any(Number),
    });
  });

  it('places v0.1 đủ 7 điểm của cảnh hiện tại, kèm toạ độ mét', async () => {
    const st = await moTa();
    expect(st.places.map((p) => p.id)).toEqual([
      'ban-1',
      'ban-2',
      'ghe-1',
      'ghe-2',
      'buc-trung-tam',
      'cua',
      'ke-module',
    ]);
    for (const p of st.places) {
      expect(p.pos.length).toBe(3);
      expect(p.kind).toBeTruthy();
      expect('occupiedBy' in p).toBe(true);
    }
  });

  it('distances tính sẵn tới MỌI place (để não không phải tự tính)', async () => {
    const st = await moTa();
    const dist = st.actors[0]!.distances;
    for (const p of PLACES) {
      expect(typeof dist[p.id], `thiếu khoảng cách tới ${p.id}`).toBe('number');
    }
  });

  it('prop mới spawn cũng có mặt trong distances', async () => {
    await d.run('prop.spawn', { id: 'so-tay', shape: 'book', at: 'ke-module' });
    const st = await moTa();
    expect(typeof st.actors[0]!.distances['so-tay']).toBe('number');
    expect(st.props.map((p) => p.id)).toEqual(['so-tay']);
  });

  it('moveTo làm pos và distances thay đổi thật', async () => {
    const truoc = await moTa();
    await d.run('actor.moveTo', { actor: 'lan', to: 'ban-2' });
    await new Promise((r) => setTimeout(r, NHIP_MS * 3));
    const sau = await moTa();

    expect(sau.actors[0]!.pos).not.toEqual(truoc.actors[0]!.pos);
    expect(sau.actors[0]!.distances['ban-2']).toBeLessThan(
      truoc.actors[0]!.distances['ban-2']!,
    );
    expect(sau.actors[0]!.at).toBe('ban-2');
  });

  it('state đổi theo máy trạng thái khi đang đi', async () => {
    void d.run('actor.moveTo', { actor: 'lan', to: 'cua' });
    await new Promise((r) => setTimeout(r, 5));
    const st = await moTa();
    expect(st.actors[0]!.state).toBe('walking');
    expect(st.actors[0]!.busy).toBe(true);
    await new Promise((r) => setTimeout(r, NHIP_MS * 3));
    expect((await moTa()).actors[0]!.state).toBe('idle');
  });

  it('`at` chỉ có khi đã đứng yên: đang walking thì luôn null', async () => {
    const dung = await moTa();
    // đứng yên trong bán kính một place → at = chính place gần nhất
    expect(dung.actors[0]!.state).toBe('idle');
    expect(dung.actors[0]!.at).toBe(dung.actors[0]!.nearest.place);

    void d.run('actor.moveTo', { actor: 'lan', to: 'cua' });
    await new Promise((r) => setTimeout(r, 5));
    const dangDi = await moTa();
    expect(dangDi.actors[0]!.state).toBe('walking');
    expect(dangDi.actors[0]!.at, 'đang đi thì at phải null').toBeNull();

    await new Promise((r) => setTimeout(r, NHIP_MS * 3));
    const toiNoi = await moTa();
    expect(toiNoi.actors[0]!.state).toBe('idle');
    expect(toiNoi.actors[0]!.at).toBe('cua');
  });

  it('`nearest` LUÔN có, kể cả khi đang đi hay đứng giữa phòng', async () => {
    void d.run('actor.moveTo', { actor: 'lan', to: 'cua' });
    await new Promise((r) => setTimeout(r, 5));
    const dangDi = await moTa();
    expect(dangDi.actors[0]!.at).toBeNull();
    expect(dangDi.actors[0]!.nearest.place).toBeTruthy();
    expect(typeof dangDi.actors[0]!.nearest.distance).toBe('number');

    await new Promise((r) => setTimeout(r, NHIP_MS * 3));
    // đứng giữa phòng, ngoài bán kính mọi place: at null nhưng nearest vẫn có
    await d.run('actor.moveTo', { actor: 'lan', to: [0, 0, 1.6] });
    await new Promise((r) => setTimeout(r, NHIP_MS * 3));
    const giua = await moTa();
    const a = giua.actors[0]!;
    expect(a.state).toBe('idle');
    // ngoài bán kính mọi place → at null, nhưng nearest vẫn chỉ đúng chỗ gần nhất
    expect(a.nearest.distance).toBeGreaterThan(0.9);
    expect(a.at).toBeNull();
    expect(a.nearest.place).toBeTruthy();
    const gan = Math.min(...PLACES.map((p) => a.distances[p.id]!));
    expect(a.nearest.distance).toBeLessThanOrEqual(gan + 0.01);
  });

  it('place không bị ai "chiếm" khi người đó chỉ đang đi ngang qua', async () => {
    void d.run('actor.moveTo', { actor: 'lan', to: 'cua' });
    await new Promise((r) => setTimeout(r, 5));
    const st = await moTa();
    expect(st.places.every((p) => p.occupiedBy === null)).toBe(true);
    await new Promise((r) => setTimeout(r, NHIP_MS * 3));
    expect((await moTa()).places.find((p) => p.id === 'cua')!.occupiedBy).toBe('lan');
  });

  it('lastEvents là mảng, và bus giữ lại sự kiện gần nhất cho sân khấu thật', async () => {
    const st = await moTa();
    expect(Array.isArray(st.lastEvents)).toBe(true);

    // sân khấu giả trả lastEvents rỗng; chỗ giữ lịch sử thật là EventBus, mà
    // `World.describe()` lấy từ đó — nên kiểm bus là kiểm đúng nguồn dữ liệu
    const bus = new EventBus();
    const d2 = new Dispatcher({ registry: taoRegistry(), world: new SanKhauGia(), bus });
    await d2.run('actor.express', { actor: 'lan', expression: 'happy' });
    await d2.run('prop.spawn', { id: 'so-tay', shape: 'book' });
    const ten = bus.recent(10).map((e) => e.event);
    expect(ten).toContain('prop.spawned');
    expect(bus.recent(10)[0]).toMatchObject({ t: expect.any(Number), data: expect.any(Object) });
  });
});

describe('stage.bootstrap là sách hướng dẫn tự sinh', () => {
  it('mỗi lệnh có mô tả, danh sách tham số và ví dụ chạy được', async () => {
    const r = await d.run('stage.bootstrap');
    if (!r.ok) throw new Error(r.error);
    const boot = r.result as {
      version: string;
      commands: Array<{
        cmd: string;
        desc: string;
        params: Array<{ name: string; type: string; required: boolean }>;
        example: { cmd: string };
      }>;
      places: unknown[];
      clips: string[];
      expressions: string[];
      emotes: string[];
      quyUocDo: Record<string, unknown>;
    };
    expect(boot.version).toBe('0.1');
    expect(boot.places.length).toBe(7);
    expect(boot.clips).toContain('wave');
    expect(boot.expressions).toContain('happy');
    expect(boot.emotes.length).toBe(15);
    expect(boot.quyUocDo).toMatchObject({ donVi: 'mét' });

    for (const c of boot.commands) {
      expect(c.desc.length, `${c.cmd} thiếu mô tả`).toBeGreaterThan(5);
      expect(c.example.cmd, `${c.cmd} ví dụ sai tên lệnh`).toBe(c.cmd);
      for (const p of c.params) {
        expect(p.name).toBeTruthy();
        expect(p.type).toBeTruthy();
        expect(typeof p.required).toBe('boolean');
      }
    }
  });

  it('ô chọn của UI lấy đúng actor/place đang có, không hard-code', async () => {
    await d.run('actor.spawn', { id: 'minh', at: 'ban-2' });
    const r = await d.run('stage.bootstrap');
    if (!r.ok) throw new Error(r.error);
    const boot = r.result as {
      commands: Array<{ cmd: string; params: Array<{ name: string; values?: string[] }> }>;
    };
    const moveTo = boot.commands.find((c) => c.cmd === 'actor.moveTo')!;
    const pActor = moveTo.params.find((p) => p.name === 'actor')!;
    expect(pActor.values).toEqual(['lan', 'minh']);
    const pTo = moveTo.params.find((p) => p.name === 'to')!;
    expect(pTo.values).toContain('ke-module');
  });

  it('lệnh chiếm actor có thêm tham số interrupt trong bootstrap', async () => {
    const r = await d.run('stage.bootstrap');
    if (!r.ok) throw new Error(r.error);
    const boot = r.result as {
      commands: Array<{ cmd: string; params: Array<{ name: string }> }>;
    };
    const moveTo = boot.commands.find((c) => c.cmd === 'actor.moveTo')!;
    expect(moveTo.params.map((p) => p.name)).toContain('interrupt');
    const express = boot.commands.find((c) => c.cmd === 'actor.express')!;
    expect(express.params.map((p) => p.name)).not.toContain('interrupt');
  });

  it('ví dụ trong bootstrap gọi được thật (trừ stub A2/A3)', async () => {
    const r = await d.run('stage.bootstrap');
    if (!r.ok) throw new Error(r.error);
    const boot = r.result as {
      commands: Array<{
        cmd: string;
        chuaLam?: string;
        example: { cmd: string; args?: Record<string, unknown> };
      }>;
    };

    const boQua = new Set([
      'actor.spawn', // id 'minh' trùng nếu chạy hai lần
      'actor.remove',
      'stage.reset',
      'script.run',
      'prop.spawn',
    ]);
    for (const c of boot.commands) {
      if (c.chuaLam || boQua.has(c.cmd)) continue;
      // chuẩn bị prop cho các lệnh cần
      if (c.cmd === 'prop.remove' || c.cmd.startsWith('prop.') || c.cmd === 'actor.hold') {
        await d.run('prop.spawn', { id: 'so-tay', shape: 'book' });
      }
      const kq = await d.run(c.example.cmd, c.example.args);
      expect(kq.ok, `ví dụ của ${c.cmd} chạy lỗi: ${kq.ok ? '' : kq.error}`).toBe(true);
      await d.run('actor.stop', { actor: 'lan' });
    }
  });
});
