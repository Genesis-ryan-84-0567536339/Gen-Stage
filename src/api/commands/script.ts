/**
 * script.ts — nhóm lệnh kịch bản (spec mục 3.4).
 *
 * Một bước (`Step`) là **bất kỳ lệnh nào** trong registry, cộng hai từ khoá:
 *  - `{ "wait": 500 }`            — nghỉ 500 ms
 *  - `{ "waitFor": "actor.arrived" }` — chờ một sự kiện sân khấu
 *
 * `mode: "sequential"` (mặc định) chạy lần lượt; `"parallel"` bắn hết cùng lúc.
 * `script.run` trả về ngay, bắn `script.step` từng bước và `script.done` khi hết
 * — đúng quy ước "lệnh có hiệu ứng theo thời gian trả ngay kèm durationMs".
 */
import type { CommandCtx, CommandSpec, StageEvent } from '../types';
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

interface PhienKichBan {
  dung: boolean;
  huy: Array<() => void>;
}

/** Chỉ một kịch bản chạy một lúc — chạy cái mới thì cái cũ bị dừng. */
let phien: PhienKichBan | null = null;

export const LENH_SCRIPT: CommandSpec[] = [
  {
    cmd: 'script.run',
    group: 'script',
    desc: 'Chạy một chuỗi bước. Mỗi bước là một lệnh, hoặc {"wait":ms} / {"waitFor":"tên sự kiện"}',
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

      const p: PhienKichBan = { dung: false, huy: [] };
      phien = p;

      void chayKichBan(p, steps, mode, ctx);

      return ngay({ steps: steps.length, mode, running: true });
    },
  },

  {
    cmd: 'script.stop',
    group: 'script',
    desc: 'Dừng kịch bản đang chạy',
    params: [],
    example: { cmd: 'script.stop' },
    handler(_a, ctx) {
      const dangChay = phien !== null;
      if (dangChay) dungPhien(ctx, 'Boss bấm dừng');
      return ngay({ stopped: dangChay });
    },
  },
];

/* ------------------------------------------------------------------ ruột */

function dungPhien(ctx: CommandCtx, vi: string): void {
  if (!phien) return;
  phien.dung = true;
  for (const h of phien.huy) h();
  phien = null;
  ctx.bus.emit('script.stopped', { vi });
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
    await Promise.all(steps.map((st, i) => chayBuoc(p, st, i, ctx).catch(() => void loi++)));
  } else {
    for (let i = 0; i < steps.length; i++) {
      if (p.dung) break;
      try {
        await chayBuoc(p, steps[i]!, i, ctx);
      } catch (e) {
        loi++;
        ctx.bus.emit('script.stepError', {
          index: i,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  if (p.dung) return;
  if (phien === p) phien = null;
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
): Promise<void> {
  if (p.dung) return;
  ctx.bus.emit('script.step', { index: i, step: st as unknown as Record<string, unknown> });

  if (st.wait !== undefined) {
    await nghi(p, st.wait);
    return;
  }

  if (st.waitFor !== undefined) {
    const xong = await choSuKien(p, ctx, st.waitFor, st.timeoutMs ?? HAN_CHO_MS);
    if (!xong && !p.dung) {
      throw new Error(`chờ sự kiện "${st.waitFor}" quá ${st.timeoutMs ?? HAN_CHO_MS} ms`);
    }
    return;
  }

  const kq = await ctx.run(st.cmd!, st.args ?? {});
  if (!kq.ok) throw new Error(kq.error);
}

function nghi(p: PhienKichBan, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const h = setTimeout(resolve, ms);
    p.huy.push(() => {
      clearTimeout(h);
      resolve();
    });
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
      resolve(kq);
    };
    const boNghe = ctx.bus.on(event, (_e: StageEvent) => ket(true));
    const hen = setTimeout(() => ket(false), hanMs);
    p.huy.push(() => ket(true));
  });
}

/** Cho test: xoá phiên kịch bản đang treo. */
export function datLaiKichBan(): void {
  phien = null;
}
