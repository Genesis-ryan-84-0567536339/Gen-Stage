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
import type { CommandCtx, CommandSpec } from '../types';
import {
  BANG_HOAT_DONG,
  TEN_HOAT_DONG,
  datHoatDong,
  huyHoatDong,
  timHoatDong,
  xoaHoatDong,
  type HoatDong,
} from '../../behavior/hoat-dong';
import { DAI_CLIP } from '../../stage/noi-dung';
import { DINH_NGHIA_EMOTE } from '../../behavior/emotes';
import { ngay, pEnum } from './tien-ich';

const s = (v: unknown) => String(v);
/** Bản dùng trong `uocThoiLuong` (tên `s` đã bị biến cục bộ che). */
const s_ = (v: unknown) => String(v);

/** Nhân vật mặc định: actor của agent (Nhi), không có thì người đầu tiên. */
function nguoiDien(ctx: CommandCtx): string | undefined {
  const ds = ctx.world.describe().actors;
  return ds.find((a) => a.controlledBy === 'agent')?.id ?? ds[0]?.id;
}

/** Tốc độ đi mặc định của `actor.moveTo` (m/s) — khớp `World.actorMoveTo`. */
const TOC_DI = 1.2;
/** Phí mỗi bước: nhịp dò chỗ trống (25 ms) + crossfade clip (~0,25 s). */
const PHI_BUOC = 300;

/**
 * Ước thời lượng (ms) — trả cho agent NGAY, nhưng là **ƯỚC LƯỢNG THÔ, KHÔNG
 * phải lời hứa** (nói thẳng trong `desc` của lệnh và trong spec 3.2f).
 *
 * Review PR #83 mục (a) đo lệch tới **2,2 lần** (`don-ban-an` 19 252 ms thật
 * vs 8 700 ms ước) vì bản đầu cộng cứng 2 600 ms cho MỌI `moveTo`. Bản này đo
 * theo **quãng đường thật** giữa các place (`describe().places`), cộng phí mỗi
 * bước. Vẫn không thể thành lời hứa chắc: thời lượng thật còn phụ thuộc đường
 * đi bị nội thất chắn (`truotVaCham`) và việc phản xạ có chêm gì vào khe giữa
 * hai bước hay không — hai thứ chỉ biết được lúc đang chạy.
 */
export function uocThoiLuong(h: HoatDong, ctx?: CommandCtx, actor?: string): number {
  let ms = h.prop ? 400 : 0;
  /** Vị trí ước của nhân vật khi tới từng bước (chỉ dùng để đo quãng đường). */
  let tai: readonly number[] | null = null;
  let place: ReadonlyArray<{ id: string; pos: readonly number[] }> = [];
  if (ctx) {
    const st = ctx.world.describe();
    place = st.places;
    tai = st.actors.find((a) => a.id === actor)?.pos ?? null;
  }
  for (const b of h.buoc) {
    ms += PHI_BUOC;
    switch (b.cmd) {
      case 'actor.moveTo': {
        const p = place.find((x) => x.id === String(b.args?.to));
        if (p && tai) {
          const d = Math.hypot((p.pos[0] ?? 0) - (tai[0] ?? 0), (p.pos[2] ?? 0) - (tai[2] ?? 0));
          // +0,9 s: quay người về hướng đi rồi hãm lại khi tới (đo trên cảnh nhà)
          ms += Math.round(900 + (d / TOC_DI) * 1000);
          tai = p.pos;
        } else {
          ms += 2600; // không biết đứng đâu (chưa có ctx) — số trung bình cũ
          if (p) tai = p.pos;
        }
        break;
      }
      case 'actor.turnTo':
        ms += 600;
        break;
      case 'actor.sit':
      case 'actor.stand':
        ms += 800;
        break;
      case 'actor.play': {
        const dai = DAI_CLIP[s_(b.args?.clip)] ?? 1500;
        const toc = typeof b.args?.speed === 'number' ? b.args.speed : 1;
        ms += Math.round(dai / Math.max(0.1, toc));
        break;
      }
      case 'actor.emote':
        ms += DINH_NGHIA_EMOTE[s_(b.args?.emote)]?.durationMs ?? 1500;
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
    handler(_a, ctx) {
      return ngay({
        activities: BANG_HOAT_DONG.map((h) => ({
          name: h.id,
          label: h.nhan,
          desc: h.mo,
          steps: h.buoc.length,
          prop: h.prop?.id ?? null,
          estimatedMs: uocThoiLuong(h, ctx, nguoiDien(ctx)),
        })),
      });
    },
  },

  {
    cmd: 'actor.activity',
    group: 'actor',
    events: [
      'actor.activityStart',
      'actor.activityDone',
      'actor.activityCancelled',
      'actor.activityCleaned',
    ],
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

      /**
       * Cắt: chặn các bước còn lại + cắt đúng bước đang chạy.
       *
       * `actor.activityCancelled` bắn **NGAY** (đồng bộ), vì lời hứa ≤300 ms
       * của Issue là về việc *dừng lại*. Phần **dọn** (thả đồ, đứng dậy) tốn
       * thêm ~1 s nên nó bắn `actor.activityCleaned` riêng — nhập hai thứ vào
       * một sự kiện là tự phá mốc 300 ms.
       */
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
      const token = datHoatDong(ai, ten, cat);

      const nhuongTick = () => new Promise<void>((r) => setTimeout(r, 0));
      const tinhTrang = () => ctx.world.describe().actors.find((x) => x.id === ai);

      /**
       * Chờ tới khi thân Nhi TRỐNG rồi mới gửi bước kế tiếp.
       *
       * Đây là chỗ bịt mục (c) của review: bản đầu gửi thẳng, nên bước kế
       * **xếp hàng** sau cú chêm của phản xạ — và một lệnh đã vào hàng đợi thì
       * không rút lại được, nên sau `activityCancelled` Nhi vẫn còn đi thêm
       * một chặng `moveTo` (tới 2,6 s). Dò chỗ trống thì **không bước nào của
       * chuỗi còn nằm trong hàng đợi**, cờ `huy` một mình là đủ để dừng, và ta
       * không phải chạm vào hàng đợi của não.
       *
       * Trần 12 s là dây an toàn: não chen một `actor.play { loop: true }` thì
       * thân không bao giờ trống — khi ấy bỏ bước, ghi vào `errors`.
       */
      const choTrong = async (hanMs = 12000): Promise<boolean> => {
        const het = Date.now() + hanMs;
        while (Date.now() < het) {
          if (huy) return false;
          if (!ctx.hangDoi()[ai]?.busy) return true;
          await new Promise<void>((r) => setTimeout(r, 25));
        }
        return false;
      };

      /**
       * Gửi một lệnh **bất kể đã bị cắt hay chưa** — chỉ dành cho `donDep()`.
       *
       * `chay()` mở đầu bằng `if (huy) return false`, nên dùng nó trong phần
       * dọn là tự vô hiệu hoá chính phần dọn: lượt kiểm đầu báo
       * `dropped: true` trong khi `lichSu` không có cú `drop` nào và tay vẫn
       * còn bình tưới. Dọn là việc PHẢI làm *vì* đã bị cắt.
       */
      const chayDon = async (cmd: string, args: Record<string, unknown>) => {
        const kq = await ctx.run(cmd, args);
        if (!kq.ok) {
          loi.push(`${cmd}: ${kq.error}`);
          return false;
        }
        buoc.push(cmd);
        return true;
      };

      const chay = async (cmd: string, args: Record<string, unknown>) => {
        if (huy) return false;
        const kq = await ctx.run(cmd, args);
        if (!kq.ok) {
          // Một bước hỏng KHÔNG được bỏ dở cả hoạt động ở tư thế ngồi/đang
          // cầm đồ: ghi lại rồi chạy tiếp, phần dọn nằm ở `donDep()`.
          loi.push(`${cmd}: ${kq.error}`);
          return true;
        }
        buoc.push(cmd);
        return true;
      };

      /**
       * **DỌN — chạy trên CẢ HAI đường, xong hay bị cắt** (review #83 lỗi 3).
       *
       * Bản đầu chỉ thả đồ ở nhánh `!huy`, nên cắt giữa `tuoi-cay` là Nhi cầm
       * bình tưới đi mãi (đo thật: `holding=binh-tuoi` 2,5 s sau cú cắt), và
       * `World.actorHold` **ném lỗi** khi tay đã có đồ ⇒ hoạt động có prop kế
       * tiếp mất prop. Nhánh nặng hơn: cắt giữa một hoạt động có `actor.sit`
       * thì `actor.stand` không bao giờ chạy ⇒ `state` giữ `sitting` ⇒ nhịp
       * `tu-sinh-hoat` thấy `state !== 'idle'` nên reset đồng hồ rảnh **mãi
       * mãi** ⇒ tự sinh hoạt chết hẳn. Chính đầu file `hoat-dong.ts` hứa điều
       * ngược lại ("để lại một cái dở dang là Nhi ngồi lơ lửng cả buổi").
       */
      const donDep = async (): Promise<{ daTha: boolean; daDung: boolean }> => {
        const ra = { daTha: false, daDung: false };
        // nhường một tick cho dispatcher dọn xong `catNgang` + hàng đợi của nó
        await nhuongTick();
        if (!ctx.world.coActor(ai)) return ra;
        if (hd.prop && tinhTrang()?.holding === hd.prop.id) {
          // `actor.drop` không chiếm thân → chạy ngay, không cần chỗ trống
          ra.daTha = await chayDon('actor.drop', { actor: ai });
          if (ra.daTha && ctx.world.coProp(hd.prop.id)) {
            await chayDon('prop.moveTo', { prop: hd.prop.id, to: hd.prop.at });
          }
        }
        if (tinhTrang()?.state === 'sitting') {
          /*
           * `actor.stand` chiếm thân. CỐ Ý gửi thẳng, không `choTrong()`: nếu
           * não vừa chiếm chỗ thì cú đứng lên xếp hàng sau lệnh của não — vẫn
           * tốt hơn là bỏ, vì ngồi lại là giết hẳn tính năng tự sinh hoạt.
           */
          ra.daDung = await chayDon('actor.stand', { actor: ai });
        }
        return ra;
      };

      const done = (async () => {
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
          /*
           * Tay còn đồ của lượt trước (bị cắt trước khi `donDep` kịp chạy) thì
           * `actor.hold` ném lỗi — thả trước cho chắc, đúng thứ `World` đòi.
           */
          if (tinhTrang()?.holding !== null && tinhTrang()?.holding !== hd.prop.id) {
            await chay('actor.drop', { actor: ai });
          }
          await chay('actor.hold', {
            actor: ai,
            prop: hd.prop.id,
            hand: hd.prop.hand ?? 'right',
          });
        }

        /* 2) chuỗi lệnh trong bảng — mỗi bước chờ thân trống rồi mới gửi */
        for (const b of hd.buoc) {
          if (huy) break;
          if (!(await choTrong())) {
            if (!huy) loi.push(`${b.cmd}: thân không trống sau 12 s, bỏ bước`);
            break;
          }
          if (!(await chay(b.cmd, { ...(b.args ?? {}), actor: ai }))) break;
        }

        /* 3) chờ bước cuối xong thật (xem `choTrong`) rồi dọn */
        if (!huy) await choTrong();
        const don = await donDep();

        if (huy) {
          ctx.bus.emit('actor.activityCleaned', {
            actor: ai,
            activity: ten,
            dropped: don.daTha,
            stood: don.daDung,
            steps: buoc.length,
          });
        }
      })()
        .catch((e: unknown) => {
          loi.push(e instanceof Error ? e.message : String(e));
        })
        .then(() => {
          xoaHoatDong(ai, token);
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
        durationMs: uocThoiLuong(hd, ctx, ai),
        done,
        cancel: cat,
      };
    },
  },
];
