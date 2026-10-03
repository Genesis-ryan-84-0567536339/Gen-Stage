/**
 * validate.ts — kiểm tra tham số trước khi chạm vào sân khấu.
 *
 * Nguyên tắc: thà trả lỗi rõ ràng bằng tiếng Việt cho agent đọc, hơn là để lệnh
 * nửa vời chạy vào Three.js rồi nổ ở chỗ khác. Hàm này cũng *chuẩn hoá* giá trị
 * (chuỗi `"1, 0, -2"` → `[1, 0, -2]`, `"true"` → `true`) để handler khỏi tự đoán.
 */
import type { CommandSpec, ParamSpec, StageWorld, Vec3 } from './types';
import { danhSachGoiY, danhSachThamSo } from './registry';

export type KetQuaKiem =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string };

export function kiemThamSo(
  spec: CommandSpec,
  thoArgs: Record<string, unknown> | undefined,
  world: StageWorld,
): KetQuaKiem {
  const vao = thoArgs ?? {};
  const params = danhSachThamSo(spec);
  const ra: Record<string, unknown> = {};
  const loi: string[] = [];

  const tenHopLe = new Set(params.map((p) => p.name));
  for (const ten of Object.keys(vao)) {
    if (!tenHopLe.has(ten)) {
      loi.push(
        `tham số lạ "${ten}" (lệnh ${spec.cmd} chỉ nhận: ${
          params.map((p) => p.name).join(', ') || 'không tham số nào'
        })`,
      );
    }
  }

  for (const p of params) {
    const co = Object.prototype.hasOwnProperty.call(vao, p.name);
    const gt = co ? vao[p.name] : undefined;

    if (!co || gt === undefined || gt === '') {
      if (p.required) {
        loi.push(`thiếu "${p.name}" (${p.desc})`);
      } else if (p.default !== undefined) {
        ra[p.name] = p.default;
      }
      continue;
    }

    const kq = doiKieu(p, gt, world);
    if ('error' in kq) loi.push(`"${p.name}": ${kq.error}`);
    else ra[p.name] = kq.value;
  }

  if (loi.length) return { ok: false, error: `${spec.cmd} — ${loi.join('; ')}` };
  return { ok: true, args: ra };
}

type DoiKieu = { value: unknown } | { error: string };

function doiKieu(p: ParamSpec, gt: unknown, world: StageWorld): DoiKieu {
  switch (p.type) {
    case 'string':
    case 'text':
      if (typeof gt !== 'string') return { error: 'phải là chuỗi' };
      return { value: gt };

    case 'number': {
      const n = typeof gt === 'number' ? gt : Number(String(gt).trim());
      if (!Number.isFinite(n)) return { error: `không phải số ("${String(gt)}")` };
      if (p.min !== undefined && n < p.min) return { error: `phải ≥ ${p.min}` };
      if (p.max !== undefined && n > p.max) return { error: `phải ≤ ${p.max}` };
      return { value: n };
    }

    case 'boolean': {
      if (typeof gt === 'boolean') return { value: gt };
      const s = String(gt).trim().toLowerCase();
      if (['true', '1', 'co', 'có', 'yes'].includes(s)) return { value: true };
      if (['false', '0', 'khong', 'không', 'no'].includes(s)) return { value: false };
      return { error: 'phải là true/false' };
    }

    case 'enum': {
      if (typeof gt !== 'string') return { error: 'phải là chuỗi' };
      const choPhep = p.values
        ? [...p.values]
        : p.goiY
          ? danhSachGoiY(p.goiY, world)
          : [];
      if (p.tuDo || choPhep.length === 0) return { value: gt };
      if (!choPhep.includes(gt)) {
        return { error: `"${gt}" không có trong: ${choPhep.join(', ') || '(rỗng)'}` };
      }
      return { value: gt };
    }

    case 'vec3': {
      const v = docVec3(gt);
      if (!v) return { error: 'phải là [x,y,z] hoặc {x,y,z} hoặc "x, y, z"' };
      return { value: v };
    }

    /** `target`: place id / actor id / prop id / `camera` / `cursor` / toạ độ / null. */
    case 'target': {
      if (gt === null || gt === 'null') return { value: null };
      const v = docVec3(gt);
      if (v) return { value: v };
      if (typeof gt !== 'string') return { error: 'phải là tên hoặc toạ độ' };
      return { value: gt };
    }

    case 'json': {
      if (typeof gt !== 'string') return { value: gt };
      try {
        return { value: JSON.parse(gt) };
      } catch {
        return { error: 'không phải JSON hợp lệ' };
      }
    }
  }
}

/** Đọc toạ độ từ mọi dạng người/agent hay gõ. */
export function docVec3(gt: unknown): Vec3 | null {
  if (Array.isArray(gt) && gt.length === 3) {
    const s = gt.map((x) => Number(x));
    return s.every((x) => Number.isFinite(x)) ? [s[0]!, s[1]!, s[2]!] : null;
  }
  if (gt && typeof gt === 'object') {
    const o = gt as Record<string, unknown>;
    if ('x' in o && 'z' in o) {
      const x = Number(o.x);
      const y = Number(o.y ?? 0);
      const z = Number(o.z);
      if ([x, y, z].every((n) => Number.isFinite(n))) return [x, y, z];
    }
    return null;
  }
  if (typeof gt === 'string') {
    const phan = gt.split(',').map((s) => s.trim());
    if (phan.length === 3) {
      const s = phan.map(Number);
      if (s.every((n) => Number.isFinite(n))) return [s[0]!, s[1]!, s[2]!];
    }
  }
  return null;
}
