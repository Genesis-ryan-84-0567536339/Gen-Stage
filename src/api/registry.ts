/**
 * registry.ts — sổ đăng ký lệnh.
 *
 * Mỗi lệnh khai báo một lần: tên, nhóm, mô tả, danh sách tham số kèm kiểu, và
 * một ví dụ chạy được. Từ đó:
 *  - `stage.bootstrap` tự sinh sách hướng dẫn cho agent,
 *  - bảng lệnh trên UI tự sinh form (không viết tay nút nào, theo spec mục 4),
 *  - dispatcher kiểm tra tham số trước khi chạm vào sân khấu.
 */
import type {
  CommandSpec,
  NguonGoiY,
  ParamSpec,
  RegistryLike,
  StageWorld,
} from './types';

export class Registry implements RegistryLike {
  private ds = new Map<string, CommandSpec>();

  dangKy(...specs: CommandSpec[]): this {
    for (const s of specs) {
      if (this.ds.has(s.cmd)) {
        throw new Error(`Lệnh "${s.cmd}" đã đăng ký rồi`);
      }
      this.ds.set(s.cmd, s);
    }
    return this;
  }

  get(cmd: string): CommandSpec | undefined {
    return this.ds.get(cmd);
  }

  all(): CommandSpec[] {
    return [...this.ds.values()];
  }

  groups(): string[] {
    const g: string[] = [];
    for (const s of this.ds.values()) if (!g.includes(s.group)) g.push(s.group);
    return g;
  }

  /** Lệnh theo nhóm, giữ đúng thứ tự đăng ký. */
  theoNhom(group: string): CommandSpec[] {
    return this.all().filter((s) => s.group === group);
  }
}

/* ---------------------------------------------------- tham số của một lệnh */

/** Tham số ngầm có ở mọi lệnh chiếm actor (spec mục 1b: `{ interrupt: true }`). */
export const THAM_SO_INTERRUPT: ParamSpec = {
  name: 'interrupt',
  type: 'boolean',
  desc: 'Cắt hành động đang chạy thay vì xếp hàng chờ',
  default: false,
};

/** Danh sách tham số đầy đủ (kèm `interrupt` nếu lệnh chiếm actor). */
export function danhSachThamSo(spec: CommandSpec): ParamSpec[] {
  const ds = [...spec.params];
  if (spec.chiemActor && !ds.some((p) => p.name === 'interrupt')) {
    ds.push(THAM_SO_INTERRUPT);
  }
  return ds;
}

/* ------------------------------------------------- danh sách gợi ý lúc chạy */

/** Lấy danh sách giá trị cho một `goiY` từ sân khấu hiện tại. */
export function danhSachGoiY(nguon: NguonGoiY, world: StageWorld): string[] {
  switch (nguon) {
    case 'actors':
      return world.actorIds();
    case 'places':
      return world.placeIds();
    case 'props':
      return world.propIds();
    case 'screens':
      return world.screenIds();
    case 'clips':
      return world.clips();
    case 'expressions':
      return world.expressions();
    case 'emotes':
      return world.emotes();
    case 'targets':
      return [
        'camera',
        'cursor',
        ...world.actorIds(),
        ...world.placeIds(),
        ...world.propIds(),
        ...world.screenIds(),
      ];
  }
}

/* ------------------------------------------------------ mô tả cho bootstrap */

export interface MoTaThamSo {
  name: string;
  type: string;
  desc: string;
  required: boolean;
  values?: string[];
  /** Có `values` nhưng vẫn cho gõ giá trị khác (vd toạ độ thay cho place). */
  tuDo?: boolean;
  default?: unknown;
}

export interface MoTaLenh {
  cmd: string;
  group: string;
  desc: string;
  params: MoTaThamSo[];
  example: unknown;
  /** Có thì nghĩa là lệnh chưa chạy ở A1, để dành cho đợt ghi trong đó. */
  chuaLam?: 'A2' | 'A3';
}

/** Dựng mô tả một lệnh, giá trị gợi ý lấy theo sân khấu lúc gọi. */
export function moTaLenh(spec: CommandSpec, world: StageWorld): MoTaLenh {
  return {
    cmd: spec.cmd,
    group: spec.group,
    desc: spec.desc,
    params: danhSachThamSo(spec).map((p) => moTaThamSo(p, world)),
    example: spec.example,
    ...(spec.stub ? { chuaLam: spec.stub } : {}),
  };
}

function moTaThamSo(p: ParamSpec, world: StageWorld): MoTaThamSo {
  const values = p.values
    ? [...p.values]
    : p.goiY
      ? danhSachGoiY(p.goiY, world)
      : undefined;
  return {
    name: p.name,
    type: p.type,
    desc: p.desc,
    required: p.required === true,
    ...(values && values.length ? { values } : {}),
    ...(p.tuDo ? { tuDo: true } : {}),
    ...(p.default === undefined ? {} : { default: p.default }),
  };
}
