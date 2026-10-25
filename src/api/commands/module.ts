/**
 * module.ts — nhóm lệnh "kết tinh" module (spec mục 3.4b).
 *
 * `module.build` là prop (xem `prop.ts`): sau khi hiệu ứng kết tinh xong, lệnh
 * tự gọi `actor.hold` **qua dispatcher** (`ctx.run`, không đụng thẳng
 * `nhanvat.ts`) để module rơi vào tay nhân vật đầu tiên trên sân khấu, đúng
 * yêu cầu "cần actor.hold cho module.build → gọi qua dispatcher".
 *
 * `module.open`/`module.store` tái dùng lệnh đã có (`screen.*`, `prop.moveTo`)
 * qua `ctx.run` thay vì thêm phương thức `StageWorld` mới — module vẫn là
 * một prop bình thường.
 */
import type { CommandSpec } from '../types';
import { HINH_PROP } from './prop';
import { ngay, pEnum, pSo, tuHanhDong } from './tien-ich';

const s = (v: unknown) => String(v);

const P_MODULE = pEnum('module', 'Module (prop đã kết tinh)', {
  required: true,
  goiY: 'props',
});

export const LENH_MODULE: CommandSpec[] = [
  {
    cmd: 'module.build',
    group: 'module',
    events: ['module.built'],
    desc:
      'Hiệu ứng kết tinh: hạt sáng từ màn hình nguồn tụ thành vật thể rồi rơi vào tay nhân vật',
    params: [
      { name: 'id', type: 'string', desc: 'Mã module', required: true },
      pEnum('shape', 'Hình kết tinh', { required: true, values: HINH_PROP }),
      { name: 'label', type: 'string', desc: 'Nhãn hiện trên module', required: true },
      {
        name: 'from',
        type: 'enum',
        desc: 'Kết tinh từ màn hình nào (bỏ trống thì từ giữa bục)',
        goiY: 'screens',
        tuDo: true,
      },
      pSo('durationMs', 'Thời lượng hiệu ứng (ms)', { min: 200, max: 20000, default: 2600 }),
    ],
    example: {
      cmd: 'module.build',
      args: { id: 'connector-baserow', shape: 'book', label: 'Baserow', from: 'main' },
    },
    handler(a, ctx) {
      const id = s(a.id);
      if (ctx.world.coProp(id)) throw new Error(`Prop "${id}" đã có trên sân khấu`);
      const shape = s(a.shape);
      const label = s(a.label);
      const from = a.from === undefined || a.from === '' ? undefined : s(a.from);
      if (from !== undefined && !ctx.world.coScreen(from)) {
        throw new Error(`Không có màn hình "${from}" để kết tinh từ đó`);
      }

      const hd = ctx.world.moduleBuild({
        id,
        shape,
        label,
        from,
        durationMs: a.durationMs as number | undefined,
      });

      void hd.done.then(async () => {
        /**
         * B3 (#21) — module rơi vào tay **người làm việc**, không phải tay Boss.
         *
         * A3 lấy `actorIds()[0]`, mà từ B1 nhân vật đầu tiên là `owner` (Boss
         * tự lái) → Gen kết tinh module xong thì module nằm trên tay Boss, sai
         * cả tầm nhìn ("module rơi vào tay nhân vật đang làm") lẫn bằng chứng.
         * Ưu tiên actor `controlledBy: "agent"`, không có thì giữ hành vi cũ.
         */
        const dsActor = ctx.world.describe().actors;
        const actorId =
          dsActor.find((x) => x.controlledBy === 'agent')?.id ?? ctx.world.actorIds()[0];
        if (actorId) {
          try {
            await ctx.run('actor.hold', { actor: actorId, prop: id, hand: 'right' });
          } catch {
            // actor có thể đang bận/không tồn tại — module vẫn kết tinh xong,
            // không chặn sự kiện module.built vì đây là phụ, không phải lõi.
          }
        }
        ctx.bus.emit('module.built', { module: id, shape, label });
      });

      return tuHanhDong(hd, { module: id });
    },
  },

  {
    cmd: 'module.open',
    group: 'module',
    events: ['screen.spawned', 'screen.shown'],
    desc: 'Mở module ra thành một màn hình nhỏ hiện nội dung bên trong',
    params: [P_MODULE],
    example: { cmd: 'module.open', args: { module: 'connector-baserow' } },
    async handler(a, ctx) {
      const id = s(a.module);
      if (!ctx.world.coProp(id)) throw new Error(`Không có module "${id}"`);
      const manHinh = `module-open:${id}`;
      const noiDung = ctx.world.describe().props.find((p) => p.id === id)?.state ?? {};
      if (!ctx.world.coScreen(manHinh)) {
        await ctx.run('screen.spawn', { id: manHinh, at: 'buc-trung-tam', size: 1.1 });
      }
      await ctx.run('screen.show', {
        screen: manHinh,
        kind: 'text',
        content: `${String(noiDung.label ?? id)}\n\n${JSON.stringify(noiDung, null, 2)}`,
      });
      await ctx.run('screen.focus', { screen: manHinh });
      return ngay({ module: id, screen: manHinh, opened: true });
    },
  },

  {
    cmd: 'module.store',
    group: 'module',
    events: ['prop.moved'],
    desc: 'Đặt module lên kệ/bàn lưu trữ',
    params: [
      P_MODULE,
      pEnum('to', 'Place lưu trữ', { required: true, goiY: 'places' }),
    ],
    example: { cmd: 'module.store', args: { module: 'connector-baserow', to: 'ke-module' } },
    async handler(a, ctx) {
      const id = s(a.module);
      if (!ctx.world.coProp(id)) throw new Error(`Không có module "${id}"`);
      const kq = await ctx.run('prop.moveTo', { prop: id, to: a.to });
      if (!kq.ok) throw new Error(kq.error);
      return ngay({ module: id, to: a.to, stored: true });
    },
  },
];
