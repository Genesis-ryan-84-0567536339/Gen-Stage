/**
 * hoat-dong.ts — lệnh **`actor.activity`** + **`actor.activities`** (J2, #79).
 *
 * Bảng dữ liệu nằm ở `src/behavior/hoat-dong.ts`; file này chỉ là cái cửa cho
 * agent/Boss gọi vào. Đúng mẫu `module.demo` của E1: lệnh **không thi công gì
 * mới**, nó gọi lại những lệnh đã có qua `ctx.run`, nên hàng đợi, `interrupt`,
 * token và nhật ký y hệt khi Boss bấm tay từng nút — và không thêm phương
 * thức nào vào `StageWorld` (tức không phải sửa cả `san-khau-gia.ts`).
 *
 * ## Vì sao KHÔNG khai `chiemActor`
 *
 * Nhìn thì `actor.activity` đúng là "chiếm thân": nó dài hàng chục giây và
 * phải huỷ được. Nhưng khai `chiemActor: 'actor'` ở đây là **tự khoá chết**:
 * dispatcher đánh dấu actor bận TRƯỚC khi gọi handler, nên bước đầu tiên
 * (`ctx.run('actor.moveTo')`) thấy actor bận → **xếp hàng** → chờ chính lệnh
 * đang gọi nó xong. Deadlock, và `pnpm test` treo chứ không đỏ.
 *
 * Thân vẫn bị chiếm **thật**, chỉ là chiếm theo từng bước: mỗi `actor.moveTo`
 * / `sit` / `play` / `emote` đều `chiemActor`, nên `describe().busy` bật suốt
 * hoạt động và một lệnh của não gửi tới giữa chừng vẫn **xếp hàng đúng chỗ**
 * thay vì chen ngang. Cái khác duy nhất so với `chiemActor` thật: khe vài
 * microtask giữa hai bước — đúng chỗ để lệnh não đã xếp hàng chạy ngay sau
 * khi ta cắt. Mẫu này giống `module.demo` (cũng 5 bước, cũng không khai).
 *
 * ## Cắt giữa đường
 *
 * Hai đường, và cả hai đều KHÔNG được dùng `dispatcher.catNgang`:
 *  - `cancel` của chính lệnh (dispatcher gọi khi có `interrupt: true` /
 *    `actor.stop`),
 *  - `huyHoatDong(actor)` trong sổ (`behavior/hoat-dong.ts`) — cửa cho máy tự
 *    sinh hoạt và phản xạ: Boss gõ/nói là cắt NGAY, trong cùng tick của sự
 *    kiện, không chờ nhịp quét nào.
 * Cờ `huy` làm các bước còn lại không chạy nữa, `world.actorInterrupt` cắt
 * bước đang chạy, và dispatcher thấy `done` của bước đó thì tự xả hàng đợi →
 * lệnh của não chạy ngay sau đúng một microtask.
 */
import type { CommandCtx, CommandSpec, Result } from '../types';
import {
  BANG_HOAT_DONG,
  TEN_HOAT_DONG,
  batGuiBuoc,
  datHoatDong,
  huyHoatDong,
  tatGuiBuoc,
  timHoatDong,
  xoaHoatDong,
  type HoatDong,
} from '../../behavior/hoat-dong';
import { DAI_CLIP } from '../../stage/noi-dung';
import { DINH_NGHIA_EMOTE } from '../../behavior/emotes';
import { ngay, pEnum } from './tien-ich';

const s = (v: unknown) => String(v);

/** Nhân vật mặc định: actor của agent (Nhi), không có thì người đầu tiên. */
function nguoiDien(ctx: CommandCtx): string | undefined {
  const ds = ctx.world.describe().actors;
  return ds.find((a) => a.controlledBy === 'agent')?.id ?? ds[0]?.id;
}

/**
 * Ước thời lượng (ms) — trả cho agent NGAY theo quy ước "thời gian là lời
 * hứa" của CLAUDE.md.
 *
 * Cố ý là **ước lượng**, không phải số đo: `actor.moveTo` dài bao lâu thì phụ
 * thuộc nhân vật đang đứng đâu, mà lệnh phải trả lời trước khi bước đầu chạy.
 * Mốc đi 2,6 s/chặng là trung bình đo trên căn nhà 14 × 10 m.
 */
export function uocThoiLuong(h: HoatDong): number {
  let ms = h.prop ? 400 : 0;
  for (const b of h.buoc) {
    switch (b.cmd) {
      case 'actor.moveTo':
        ms += 2600;
        break;
      case 'actor.turnTo':
        ms += 600;
        break;
      case 'actor.sit':
      case 'actor.stand':
        ms += 800;
        break;
      case 'actor.play': {
        const dai = DAI_CLIP[s(b.args?.clip)] ?? 1500;
        const toc = typeof b.args?.speed === 'number' ? b.args.speed : 1;
        ms += Math.round(dai / Math.max(0.1, toc));
        break;
      }
      case 'actor.emote':
        ms += DINH_NGHIA_EMOTE[s(b.args?.emote)]?.durationMs ?? 1500;
        break;
      default:
        // `actor.express`, `actor.lookAt`, `actor.faceTo`… không chiếm thân
        break;
    }
  }
  return ms;
}

export const LENH_HOAT_DONG: CommandSpec[] = [
  {
    cmd: 'actor.activities',
    group: 'actor',
    desc:
      'Liệt kê BẢNG HOẠT ĐỘNG: mỗi hoạt động là một chuỗi lệnh có đầu có cuối ' +
      '(ra bếp pha cà phê, ngồi sofa đọc sách…) gọi được bằng actor.activity',
    params: [],
    example: { cmd: 'actor.activities' },
    handler(_a, _ctx) {
      return ngay({
        activities: BANG_HOAT_DONG.map((h) => ({
          name: h.id,
          label: h.nhan,
          desc: h.mo,
          steps: h.buoc.length,
          prop: h.prop?.id ?? null,
          estimatedMs: uocThoiLuong(h),
        })),
      });
    },
  },

  {
    cmd: 'actor.activity',
    group: 'actor',
    events: ['actor.activityStart', 'actor.activityDone', 'actor.activityCancelled'],
    desc:
      'Làm MỘT HOẠT ĐỘNG trọn gói (chuỗi lệnh: đi tới chỗ, ngồi, diễn, cầm đồ, về idle). ' +
      'Xem danh sách bằng actor.activities. Huỷ được giữa đường; Boss gõ/nói là cắt ngay',
    /**
     * KHÔNG `chiemActor` — xem phần "Vì sao KHÔNG khai `chiemActor`" đầu file.
     * Thân vẫn bị chiếm theo từng bước, nên `busy` của `stage.describe` vẫn
     * bật suốt hoạt động.
     */
    params: [
      // Không dùng `P_ACTOR` (bắt buộc): bỏ trống thì lệnh tự chọn nhân vật
      // của agent — não gọi một tham số là xong, không phải nhớ id.
      pEnum('actor', 'Nhân vật (bỏ trống = nhân vật của agent)', { goiY: 'actors' }),
      pEnum('name', 'Tên hoạt động', { required: true, values: TEN_HOAT_DONG }),
    ],
    example: { cmd: 'actor.activity', args: { actor: 'gen', name: 'pha-ca-phe' } },
    handler(a, ctx) {
      const ai = a.actor === undefined || a.actor === '' ? nguoiDien(ctx) : s(a.actor);
      if (!ai) throw new Error('Sân khấu chưa có nhân vật nào để diễn');
      if (!ctx.world.coActor(ai)) {
        throw new Error(
          `Không có actor "${ai}". Đang có: ${ctx.world.actorIds().join(', ') || '(chưa có ai)'}`,
        );
      }
      const ten = s(a.name);
      const hd = timHoatDong(ten);
      if (!hd) {
        throw new Error(
          `Không có hoạt động "${ten}". Đang có: ${TEN_HOAT_DONG.join(', ')}`,
        );
      }
      /*
       * Một nhân vật chỉ làm MỘT hoạt động. Gọi cái mới thì cắt cái cũ — không
       * trả lỗi: nếu trả lỗi thì máy tự sinh hoạt và não phải tự đồng bộ với
       * nhau, mà "lệnh sau thắng" là đúng cái Boss trông đợi.
       */
      huyHoatDong(ai);

      let huy = false;
      const buoc: string[] = [];
      const loi: string[] = [];

      /** Cắt: chặn các bước còn lại + cắt đúng bước đang chạy. */
      const cat = () => {
        if (huy) return;
        huy = true;
        try {
          ctx.world.actorInterrupt(ai);
        } catch {
          // actor vừa bị xoá khỏi sân khấu — không có gì để cắt nữa
        }
        ctx.bus.emit('actor.activityCancelled', {
          actor: ai,
          activity: ten,
          steps: buoc.length,
        });
      };
      datHoatDong(ai, ten, cat);

      /**
       * Chờ bước CUỐI chạy xong thật.
       *
       * `ctx.run` trả lời **ngay khi hành động bắt đầu** (quy ước "thời gian
       * là lời hứa": lệnh trả `durationMs` + `done`, không chờ), nên chuỗi
       * `await` chỉ nối đúng được các bước GIỮA — bước 2 xếp hàng sau bước 1
       * nên nó chờ thật. Bước cuối thì không có ai xếp hàng sau, và nếu bắn
       * `actor.activityDone` ngay lúc đó thì sự kiện nói dối: đo thật trên
       * sân khấu giả, `state` còn là `playing`/`sitting` khi `Done` tới.
       *
       * `ctx.hangDoi()` là **đúng nguồn sự thật** cho "thân còn bị chiếm
       * không" (`Dispatcher.dangChay`, xem mục "một nguồn sự thật" trong
       * CLAUDE.md) và là thứ duy nhất handler với tới được mà không phải thêm
       * API mới. Trần 12 s là dây an toàn: một `actor.play { loop: true }` do
       * não chen vào sẽ không bao giờ rảnh.
       */
      const choRanh = async () => {
        for (let i = 0; i < 400; i++) {
          if (huy) return;
          if (!ctx.hangDoi()[ai]?.busy) return;
          await new Promise<void>((r) => setTimeout(r, 30));
        }
      };

      const done = (async () => {
        const chay = async (cmd: string, args: Record<string, unknown>) => {
          if (huy) return false;
          /*
           * Cờ hẹp quanh ĐÚNG lời gọi: `cmd.queued` bắn đồng bộ bên trong
           * `ctx.run` (nhánh xếp hàng của dispatcher), nên máy tự sinh hoạt
           * phân biệt được "bước của hoạt động xếp hàng" với "não xen vào".
           */
          batGuiBuoc(ai);
          let p: Promise<Result>;
          try {
            p = ctx.run(cmd, args);
          } finally {
            tatGuiBuoc(ai);
          }
          const kq = await p;
          if (!kq.ok) {
            // Một bước hỏng KHÔNG được bỏ dở cả hoạt động ở tư thế ngồi/đang
            // cầm đồ: ghi lại rồi chạy tiếp, phần dọn (`stand`/`drop`) nằm ở
            // cuối chuỗi. `actor.activityDone` mang `errors` để não biết.
            loi.push(`${cmd}: ${kq.error}`);
            return true;
          }
          buoc.push(cmd);
          return true;
        };

        /* 1) prop: dựng một lần, dùng mãi (`prop.spawn` lỗi nếu đã có) */
        if (hd.prop) {
          if (!ctx.world.coProp(hd.prop.id)) {
            await chay('prop.spawn', {
              id: hd.prop.id,
              shape: hd.prop.shape,
              kind: 'hoat-dong',
              at: hd.prop.at,
            });
          }
          await chay('actor.hold', {
            actor: ai,
            prop: hd.prop.id,
            hand: hd.prop.hand ?? 'right',
          });
        }

        /* 2) chuỗi lệnh trong bảng */
        for (const b of hd.buoc) {
          if (!(await chay(b.cmd, { ...(b.args ?? {}), actor: ai }))) return;
        }

        /* 3) chờ bước cuối xong thật rồi mới dọn + báo xong */
        await choRanh();

        /* 4) dọn: thả đồ về chỗ cũ, để lượt sau cầm lại được */
        if (hd.prop && !huy) {
          await chay('actor.drop', { actor: ai });
          if (ctx.world.coProp(hd.prop.id)) {
            await chay('prop.moveTo', { prop: hd.prop.id, to: hd.prop.at });
          }
        }
      })()
        .catch((e: unknown) => {
          loi.push(e instanceof Error ? e.message : String(e));
        })
        .then(() => {
          xoaHoatDong(ai, ten);
          // Bị cắt thì `actor.activityCancelled` đã bắn ở `cat()` — bắn thêm
          // `Done` nữa là nói dối "chạy trọn" (bài học review PR #10 mục 1.3).
          if (huy) return;
          ctx.bus.emit('actor.activityDone', {
            actor: ai,
            activity: ten,
            steps: buoc.length,
            ...(loi.length ? { errors: loi } : {}),
          });
        });

      ctx.bus.emit('actor.activityStart', { actor: ai, activity: ten, label: hd.nhan });
      return {
        result: { actor: ai, activity: ten, label: hd.nhan, steps: hd.buoc.length },
        durationMs: uocThoiLuong(hd),
        done,
        cancel: cat,
      };
    },
  },
];
