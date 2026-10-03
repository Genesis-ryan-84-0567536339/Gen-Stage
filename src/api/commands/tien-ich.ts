/**
 * tien-ich.ts — tiện ích dùng chung khi khai báo lệnh.
 */
import type { Action, CommandOutcome, ParamSpec } from '../types';

/** Gói một `Action` của sân khấu thành kết quả lệnh (trả ngay + `done`). */
export function tuHanhDong(
  a: Action,
  them: Record<string, unknown> = {},
): CommandOutcome {
  return {
    result: { ...them, started: true },
    durationMs: Math.round(a.durationMs),
    done: a.done,
    cancel: a.cancel,
  };
}

/** Kết quả tức thì, không có thời lượng. */
export function ngay(result: Record<string, unknown>): CommandOutcome {
  return { result };
}

/** Tham số `actor` (bắt buộc), dùng lại ở hầu hết lệnh nhóm actor. */
export const P_ACTOR: ParamSpec = {
  name: 'actor',
  type: 'enum',
  desc: 'Nhân vật',
  required: true,
  goiY: 'actors',
};

export function pEnum(
  name: string,
  desc: string,
  opt: Partial<ParamSpec> = {},
): ParamSpec {
  return { name, type: 'enum', desc, ...opt };
}

export function pSo(
  name: string,
  desc: string,
  opt: Partial<ParamSpec> = {},
): ParamSpec {
  return { name, type: 'number', desc, ...opt };
}
