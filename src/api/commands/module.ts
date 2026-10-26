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
const ngu = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Thử `actor.hold` tối đa bao nhiêu lần sau khi module kết tinh xong. */
const LAN_THU_HOLD = 6;
/** Nghỉ bao lâu giữa hai lần thử (ms) — đủ để nhân vật nói xong một câu ngắn. */
const CHO_HOLD_MS = 450;

const P_MODULE = pEnum('module', 'Module (prop đã kết tinh)', {
  required: true,
  goiY: 'props',
});

export const LENH_MODULE: CommandSpec[] = [
  {
    cmd: 'module.build',
    group: 'module',
    // H1: `module.fallback` — bắn khi `from` không tồn tại và lệnh tự lấy màn
    // hình đầu tiên thay vì chết (xem handler).
    events: ['module.built', 'module.fallback'],
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
    /**
     * H1 — **ví dụ KHÔNG còn `from: 'main'`.**
     *
     * Cửa 2 vòng 28/10 mục 6: *"Gen, dựng module connector Baserow"* → não gọi
     * đúng câu ví dụ này, `module.build { from: 'main' }`, và chết với
     * «Không có màn hình "main"». Sân khấu chưa bao giờ có màn hình tên `main`
     * — `'main'` chỉ là chữ trong ví dụ, mà `stage.bootstrap` đưa ví dụ thẳng
     * cho não. E1 đã sửa SKILL/AGENTS.md nhưng ví dụ trong registry vẫn dạy
     * sai, nên lọt tiếp. Bỏ trống `from` = kết tinh từ màn hình đầu tiên.
     */
    example: {
      cmd: 'module.build',
      args: { id: 'connector-baserow', shape: 'book', label: 'Baserow' },
    },
    handler(a, ctx) {
      const id = s(a.id);
      if (ctx.world.coProp(id)) throw new Error(`Prop "${id}" đã có trên sân khấu`);
      const shape = s(a.shape);
      const label = s(a.label);
      const xin = a.from === undefined || a.from === '' ? undefined : s(a.from);
      /**
       * H1 — **`from` sai thì LẤY MÀN HÌNH ĐẦU TIÊN, không chết.**
       *
       * Chốt ở server chứ không chỉ ở tài liệu: não có thể học `'main'` từ bất
       * cứ bản SKILL/AGENTS cũ nào còn nằm trong `.cache`, trong ngữ cảnh một
       * phiên agy đang ấm, hay trong đầu một LLM khác. Giao kèo "một lệnh
       * không chạy được thì phải nói vì sao" vẫn giữ: cảnh báo đi ra bus
       * (`module.fallback`) và vào nhật ký, nhưng **màn hình nguồn chỉ là chỗ
       * hạt sáng bay ra** — không đáng để cả việc "dựng connector" chết.
       *
       * Vẫn chết khi sân khấu THỰC SỰ không có màn hình nào: lúc đó không có
       * gì để rơi về, và im lặng mới là cái bẫy.
       */
      let from = xin;
      if (from !== undefined && !ctx.world.coScreen(from)) {
        const thay = ctx.world.screenIds()[0];
        if (!thay) {
          throw new Error(
            `Không có màn hình "${from}" để kết tinh từ đó, và sân khấu chưa có màn hình nào`,
          );
        }
        ctx.bus.emit('module.fallback', {
          module: id,
          xin: from,
          dung: thay,
          coSan: ctx.world.screenIds(),
          vi: `Không có màn hình "${from}" — kết tinh từ "${thay}" (màn hình đầu tiên đang sống)`,
        });
        from = thay;
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
        /**
         * E2 (#48 mục 3) — **module PHẢI vào tay**, không "thử một lần rồi
         * thôi".
         *
         * Bản cũ gọi `actor.hold` đúng một lần và nuốt mọi lỗi, nên hễ nhân
         * vật còn đang nói/đi (rất hay xảy ra: não vừa cho Gen nói xong câu
         * "em dựng xong rồi" thì module mới kết tinh tới) là `holding` ở lại
         * `null` vĩnh viễn trong khi màn hình vẫn báo "built" — đúng cái
         * reviewer đo được. Giờ thử lại tới `LAN_THU_HOLD` lần, cách nhau
         * `CHO_HOLD_MS`, và báo lý do thật lên sự kiện `module.built` để Boss
         * đọc nhật ký biết ngay module nằm ở đâu.
         */
        let heldBy: string | null = null;
        let loiHold: string | null = null;
        if (actorId) {
          for (let lan = 0; lan < LAN_THU_HOLD; lan += 1) {
            if (!ctx.world.coProp(id)) break; // bị xoá giữa đường
            if (ctx.world.describe().actors.find((x) => x.id === actorId)?.holding === id) break;
            try {
              const kq = await ctx.run('actor.hold', { actor: actorId, prop: id, hand: 'right' });
              if (kq.ok) {
                heldBy = actorId;
                loiHold = null;
                break;
              }
              loiHold = kq.error;
            } catch (e) {
              loiHold = e instanceof Error ? e.message : String(e);
            }
            await ngu(CHO_HOLD_MS);
          }
          if (heldBy === null) {
            heldBy =
              ctx.world.describe().props.find((p) => p.id === id)?.state.heldBy as string | null ??
              null;
            if (heldBy !== null) loiHold = null;
          }
        }
        ctx.bus.emit('module.built', { module: id, shape, label, heldBy, error: loiHold });
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
