/**
 * prop.ts — nhóm lệnh đồ vật (spec mục 3.3).
 *
 * A1 dựng prop bằng khối hình học đơn giản (hộp / cầu / sách / tinh thể) để
 * lệnh chạy thật và `stage.describe` có số liệu; A3 thay bằng model + hiệu ứng
 * kết tinh, giữ nguyên tên lệnh.
 */
import type { CommandSpec, Vec3 } from '../types';
import { ngay, pEnum } from './tien-ich';

const s = (v: unknown) => String(v);

export const HINH_PROP = ['book', 'cube', 'tool', 'crystal', 'orb'] as const;

export const LENH_PROP: CommandSpec[] = [
  {
    cmd: 'prop.spawn',
    group: 'prop',
    events: ['prop.spawned'],
    desc: 'Thêm một đồ vật vào sân khấu',
    params: [
      { name: 'id', type: 'string', desc: 'Mã đồ vật', required: true },
      pEnum('shape', 'Hình dạng', { values: HINH_PROP, default: 'cube' }),
      { name: 'kind', type: 'string', desc: 'Loại, vd "module"', default: 'prop' },
      { name: 'model', type: 'string', desc: 'File model (A3 dùng)' },
      {
        name: 'at',
        type: 'target',
        desc: 'Place hoặc toạ độ',
        goiY: 'places',
        tuDo: true,
        default: 'ban-1',
      },
    ],
    example: {
      cmd: 'prop.spawn',
      args: { id: 'so-tay', shape: 'book', kind: 'module', at: 'ban-1' },
    },
    async handler(a, ctx) {
      const snap = await ctx.world.propSpawn({
        id: s(a.id),
        shape: a.shape === undefined ? undefined : s(a.shape),
        kind: a.kind === undefined ? undefined : s(a.kind),
        model: a.model === undefined ? undefined : s(a.model),
        at: a.at as string | Vec3 | undefined,
      });
      ctx.bus.emit('prop.spawned', { prop: snap.id, at: snap.at, pos: snap.pos });
      return ngay({ prop: snap });
    },
  },

  {
    cmd: 'prop.remove',
    group: 'prop',
    events: ['prop.removed'],
    desc: 'Bỏ đồ vật khỏi sân khấu',
    params: [pEnum('prop', 'Đồ vật', { required: true, goiY: 'props' })],
    example: { cmd: 'prop.remove', args: { prop: 'so-tay' } },
    handler(a, ctx) {
      const id = s(a.prop);
      if (!ctx.world.coProp(id)) throw new Error(`Không có prop "${id}"`);
      ctx.world.propRemove(id);
      ctx.bus.emit('prop.removed', { prop: id });
      return ngay({ prop: id, removed: true });
    },
  },

  {
    cmd: 'prop.list',
    group: 'prop',
    desc: 'Liệt kê đồ vật đang có',
    params: [],
    example: { cmd: 'prop.list' },
    handler(_a, ctx) {
      return ngay({ props: ctx.world.describe().props });
    },
  },

  {
    cmd: 'prop.moveTo',
    group: 'prop',
    events: ['prop.moved'],
    desc: 'Chuyển đồ vật sang place hoặc toạ độ khác',
    params: [
      pEnum('prop', 'Đồ vật', { required: true, goiY: 'props' }),
      {
        name: 'to',
        type: 'target',
        desc: 'Place hoặc toạ độ',
        required: true,
        goiY: 'places',
        tuDo: true,
      },
    ],
    example: { cmd: 'prop.moveTo', args: { prop: 'so-tay', to: 'ke-module' } },
    handler(a, ctx) {
      const id = s(a.prop);
      if (!ctx.world.coProp(id)) throw new Error(`Không có prop "${id}"`);
      ctx.world.propMoveTo(id, a.to as string | Vec3);
      ctx.bus.emit('prop.moved', { prop: id, to: a.to });
      return ngay({ prop: id, to: a.to });
    },
  },

  {
    cmd: 'prop.set',
    group: 'prop',
    events: ['prop.set'],
    desc: 'Đổi trạng thái đồ vật, vd {"screen":"on","text":"Đang chạy test…"}',
    params: [
      pEnum('prop', 'Đồ vật', { required: true, goiY: 'props' }),
      {
        name: 'state',
        type: 'json',
        desc: 'JSON trạng thái',
        required: true,
        default: '{"screen":"on"}',
      },
    ],
    example: {
      cmd: 'prop.set',
      args: { prop: 'so-tay', state: { screen: 'on', text: 'Đang chạy test…' } },
    },
    handler(a, ctx) {
      const id = s(a.prop);
      if (!ctx.world.coProp(id)) throw new Error(`Không có prop "${id}"`);
      if (typeof a.state !== 'object' || a.state === null || Array.isArray(a.state)) {
        throw new Error('"state" phải là một object JSON');
      }
      const snap = ctx.world.propSet(id, a.state as Record<string, unknown>);
      ctx.bus.emit('prop.set', { prop: id, state: snap.state });
      return ngay({ prop: snap });
    },
  },
];
