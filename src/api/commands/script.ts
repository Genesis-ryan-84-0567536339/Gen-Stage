/**
 * script.ts — nhóm lệnh kịch bản (spec mục 3.4).
 *
 * Một bước (`Step`) là **bất kỳ lệnh nào** trong registry, cộng hai từ khoá:
 *  - `{ "wait": 500 }`            — nghỉ 500 ms
 *  - `{ "waitFor": "actor.arrived" }` — chờ một sự kiện sân khấu
 *
 * `mode: "sequential"` (mặc định) chạy lần lượt; `"parallel"` bắn hết cùng lúc.
 * `script.run` trả về ngay kèm `durationMs` ước lượng, bắn `script.step` từng
 * bước và `script.done` khi hết.
 *
 * **`waitFor` nhìn cả quá khứ gần.** Lệnh có thời lượng 0 ms (đi tới chỗ đang
 * đứng, xoay về hướng đang quay, đứng lên khi đang đứng) bắn sự kiện xong ngay
 * trong cùng nhịp với lệnh — nếu `waitFor` chỉ nghe tương lai thì nó ngồi chờ
 * một sự kiện đã trôi qua rồi hết hạn. Vì vậy mỗi phiên kịch bản giữ một bộ đệm
 * sự kiện, và `waitFor` soi lại bộ đệm kể từ lúc **bước trước bắt đầu** trước
 * khi quyết định chờ.
 */
import type { CommandCtx, CommandSpec, HuyDangKy, StageEvent } from '../types';
import { DAI_CLIP } from '../../stage/noi-dung';
import { ngay } from './tien-ich';

export interface Step {
  cmd?: string;
  args?: Record<string, unknown>;
  wait?: number;
  waitFor?: string;
  /** Hạn chờ cho `waitFor` (ms), hết hạn thì ghi lỗi bước và đi tiếp. */
  timeoutMs?: number;
}

/** Hạn chờ mặc định của `waitFor`. */
const HAN_CHO_MS = 15000;
/** Số sự kiện gần nhất một phiên kịch bản giữ lại để `waitFor` soi ngược. */
const DEM_TOI_DA = 200;

interface SuKienDaGhi {
  event: string;
  seq: number;
}

interface PhienKichBan {
  dung: boolean;
  huy: Set<() => void>;
  /** Số thứ tự sự kiện, tăng dần — chắc chắn hơn mốc thời gian ms. */
  dem: number;
  bo: SuKienDaGhi[];
  boNghe: HuyDangKy | null;
  /** Actor mà kịch bản đã ra lệnh, để `script.stop` cắt hành động đang diễn. */
  chamActor: Set<string>;
}

/** Chỉ một kịch bản chạy một lúc — chạy cái mới thì cái cũ bị dừng. */
let phien: PhienKichBan | null = null;

export const LENH_SCRIPT: CommandSpec[] = [
  {
    cmd: 'script.run',
    group: 'script',
    desc:
      'Chạy một chuỗi bước. Mỗi bước là một lệnh, hoặc {"wait":ms} / {"waitFor":"tên sự kiện"}. ' +
      'Ghi chú: "parallel" bắn cùng lúc, nhưng nhiều bước trên CÙNG một actor vẫn tuần tự vì xếp hàng theo actor.',
    events: ['script.step', 'script.stepError', 'script.done', 'script.stopped'],
    params: [
      {
        name: 'steps',
        type: 'json',
        desc: 'Mảng JSON các bước',
        required: true,
        default:
          '[{"cmd":"actor.moveTo","args":{"actor":"lan","to":"ban-2"}},{"waitFor":"actor.arrived"},{"cmd":"actor.say","args":{"actor":"lan","text":"Tới rồi Sếp!"}}]',
      },
      {
        name: 'mode',
        type: 'enum',
        desc: 'Chạy lần lượt hay cùng lúc',
        values: ['sequential', 'parallel'],
        default: 'sequential',
      },
    ],
    example: {
      cmd: 'script.run',
      args: {
        steps: [
          { cmd: 'actor.moveTo', args: { actor: 'lan', to: 'ban-2' } },
          { waitFor: 'actor.arrived' },
          { cmd: 'actor.express', args: { actor: 'lan', expression: 'happy' } },
          { cmd: 'actor.say', args: { actor: 'lan', text: 'Sếp ơi, test xanh rồi!' } },
        ],
        mode: 'sequential',
      },
    },
    handler(a, ctx) {
      const steps = docSteps(a.steps);
      const mode = a.mode === 'parallel' ? 'parallel' : 'sequential';

      if (phien) dungPhien(ctx, 'bị kịch bản mới thay thế');

      const p: PhienKichBan = {
        dung: false,
        huy: new Set(),
        dem: 0,
        bo: [],
        boNghe: null,
        chamActor: new Set(),
      };
      p.boNghe = ctx.bus.on('*', (e: StageEvent) => {
        p.bo.push({ event: e.event, seq: ++p.dem });
        if (p.bo.length > DEM_TOI_DA) p.bo.shift();
      });
      phien = p;

      void chayKichBan(p, steps, mode, ctx);

      return {
        result: { steps: steps.length, mode, running: true },
        durationMs: uocLuong(steps, mode),
      };
    },
  },

  {
    cmd: 'script.stop',
    group: 'script',
    desc: 'Dừng kịch bản đang chạy và cắt luôn hành động đang diễn của các nhân vật kịch bản đã chạm',
    events: ['script.stopped'],
    params: [],
    example: { cmd: 'script.stop' },
    handler(_a, ctx) {
      const dangChay = phien !== null;
      if (dangChay) dungPhien(ctx, 'Boss bấm dừng', true);
      return ngay({ stopped: dangChay });
    },
  },
];

/* ------------------------------------------------------------------ ruột */

function dungPhien(ctx: CommandCtx, vi: string, catActor = false): void {
  const p = phien;
  if (!p) return;
  p.dung = true;
  for (const h of p.huy) h();
  p.huy.clear();
  p.boNghe?.();
  p.boNghe = null;
  phien = null;
  // Boss bấm "Dừng" mà nhân vật vẫn đi tiếp thì khó hiểu → cắt luôn
  if (catActor) for (const id of p.chamActor) ctx.catNgang(id);
  ctx.bus.emit('script.stopped', { vi, actors: [...p.chamActor] });
}

/**
 * Ước lượng thời lượng kịch bản để trả ngay theo quy ước mục 1.
 * Chỉ cộng được phần biết trước: `wait`, độ dài clip, độ dài câu nói.
 * `moveTo`/`waitFor` phụ thuộc trạng thái lúc chạy nên tính 0 — `script.done`
 * mới mang con số thật.
 */
export function uocLuong(steps: Step[], mode: 'sequential' | 'parallel'): number {
  const ms = steps.map((st) => {
    if (st.wait !== undefined) return st.wait;
    if (st.waitFor !== undefined) return 0;
    const a = st.args ?? {};
    if (st.cmd === 'actor.play' && typeof a.clip === 'string') {
      return (DAI_CLIP[a.clip] ?? 0) / (typeof a.speed === 'number' ? a.speed : 1);
    }
    if (st.cmd === 'actor.bubble' && typeof a.durationMs === 'number') return a.durationMs;
    if (
      (st.cmd === 'actor.say' || st.cmd === 'actor.bubble') &&
      typeof a.text === 'string'
    ) {
      // cùng công thức với uocThoiLuongNoi trong stage/nhanvat.ts
      return Math.round(Math.min(9000, Math.max(900, 600 + (a.text.trim().length / 13) * 1000)));
    }
    return 0;
  });
  const tong = mode === 'parallel' ? Math.max(0, ...ms) : ms.reduce((x, y) => x + y, 0);
  return Math.round(tong);
}

export function docSteps(tho: unknown): Step[] {
  const mang = Array.isArray(tho)
    ? tho
    : tho && typeof tho === 'object' && Array.isArray((tho as { steps?: unknown }).steps)
      ? ((tho as { steps: unknown[] }).steps)
      : null;
  if (!mang) throw new Error('"steps" phải là một mảng JSON các bước');
  if (mang.length === 0) throw new Error('"steps" rỗng, không có gì chạy');

  return mang.map((x, i) => {
    if (!x || typeof x !== 'object') {
      throw new Error(`bước ${i + 1} không phải object`);
    }
    const o = x as Record<string, unknown>;
    if (typeof o.wait === 'number' || typeof o.wait === 'string') {
      const ms = Number(o.wait);
      if (!Number.isFinite(ms) || ms < 0) throw new Error(`bước ${i + 1}: wait phải là số ms`);
      return { wait: ms };
    }
    if (typeof o.waitFor === 'string') {
      return {
        waitFor: o.waitFor,
        timeoutMs: typeof o.timeoutMs === 'number' ? o.timeoutMs : HAN_CHO_MS,
      };
    }
    if (typeof o.cmd === 'string') {
      return {
        cmd: o.cmd,
        args:
          o.args && typeof o.args === 'object' && !Array.isArray(o.args)
            ? (o.args as Record<string, unknown>)
            : {},
      };
    }
    throw new Error(`bước ${i + 1} phải có "cmd", "wait" hoặc "waitFor"`);
  });
}

async function chayKichBan(
  p: PhienKichBan,
  steps: Step[],
  mode: 'sequential' | 'parallel',
  ctx: CommandCtx,
): Promise<void> {
  const batDau = Date.now();
  let loi = 0;

  if (mode === 'parallel') {
    // chạy cùng lúc: `waitFor` soi lại từ đầu phiên (seq 0)
    await Promise.all(
      steps.map((st, i) => chayBuoc(p, st, i, ctx, 0).catch(() => void loi++)),
    );
  } else {
    let mocTruoc = 0;
    for (let i = 0; i < steps.length; i++) {
      if (p.dung) break;
      const mocNay = p.dem;
      try {
        await chayBuoc(p, steps[i]!, i, ctx, mocTruoc);
      } catch (e) {
        loi++;
        ctx.bus.emit('script.stepError', {
          index: i,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      mocTruoc = mocNay;
    }
  }

  if (p.dung) return;
  if (phien === p) {
    p.boNghe?.();
    p.boNghe = null;
    phien = null;
  }
  ctx.bus.emit('script.done', {
    steps: steps.length,
    mode,
    errors: loi,
    durationMs: Date.now() - batDau,
  });
}

async function chayBuoc(
  p: PhienKichBan,
  st: Step,
  i: number,
  ctx: CommandCtx,
  mocTruoc: number,
): Promise<void> {
  if (p.dung) return;
  ctx.bus.emit('script.step', { index: i, step: st as unknown as Record<string, unknown> });

  if (st.wait !== undefined) {
    await nghi(p, st.wait);
    return;
  }

  if (st.waitFor !== undefined) {
    // 1) sự kiện đã bắn từ lúc bước trước bắt đầu? dùng luôn, khỏi chờ
    const j = p.bo.findIndex((e) => e.event === st.waitFor && e.seq > mocTruoc);
    if (j >= 0) {
      p.bo.splice(j, 1); // tiêu thụ, để hai `waitFor` liền nhau không ăn chung một lần
      return;
    }
    const xong = await choSuKien(p, ctx, st.waitFor, st.timeoutMs ?? HAN_CHO_MS);
    if (!xong && !p.dung) {
      throw new Error(`chờ sự kiện "${st.waitFor}" quá ${st.timeoutMs ?? HAN_CHO_MS} ms`);
    }
    return;
  }

  const actor = st.args?.actor;
  if (typeof actor === 'string') p.chamActor.add(actor);

  const kq = await ctx.run(st.cmd!, st.args ?? {});
  if (!kq.ok) throw new Error(kq.error);
}

function nghi(p: PhienKichBan, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const h = setTimeout(() => {
      p.huy.delete(bo);
      resolve();
    }, ms);
    const bo = () => {
      clearTimeout(h);
      resolve();
    };
    p.huy.add(bo);
  });
}

/** Chờ sự kiện; trả `false` nếu quá hạn. */
function choSuKien(
  p: PhienKichBan,
  ctx: CommandCtx,
  event: string,
  hanMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let xong = false;
    const ket = (kq: boolean) => {
      if (xong) return;
      xong = true;
      boNghe();
      clearTimeout(hen);
      p.huy.delete(bo); // gỡ khỏi danh sách huỷ, kịch bản dài khỏi tích closure
      resolve(kq);
    };
    const boNghe = ctx.bus.on(event, (_e: StageEvent) => ket(true));
    const hen = setTimeout(() => ket(false), hanMs);
    const bo = () => ket(true);
    p.huy.add(bo);
  });
}

/** Cho test: xoá phiên kịch bản đang treo. */
export function datLaiKichBan(): void {
  phien?.boNghe?.();
  phien = null;
}
