/**
 * noi-dung.ts — dữ liệu cảnh v0.1: danh sách place, clip, biểu cảm, emote.
 *
 * Tách riêng khỏi code dựng cảnh để A3 (lab viễn tưởng) chỉ cần thay file này
 * là có bộ place mới, không phải sửa lệnh hay dispatcher.
 *
 * Quy ước đo (spec mục 1b): mét, gốc toạ độ giữa phòng, `facing` độ (0 = hướng
 * camera mặc định, tức nhìn về +Z).
 */
import type { Vec3 } from '../api/types';

export interface DinhNghiaPlace {
  id: string;
  pos: Vec3;
  kind: 'desk' | 'seat' | 'stage' | 'door' | 'shelf';
  /** Chỗ actor đứng khi được gọi tới place này (bàn thì đứng trước bàn). */
  standAt?: Vec3;
  /** Hướng actor quay khi tới (độ). */
  facing?: number;
}

/**
 * Places v0.1 của cảnh văn phòng hiện có (`phong.ts`: phòng 7,2 × 7,2 m,
 * bàn 1 ở (-1,85, 0, -1,75), bàn 2 ở (1,85, 0, -1,75), kệ sách sát tường trái).
 */
export const PLACES: readonly DinhNghiaPlace[] = [
  {
    id: 'ban-1',
    pos: [-1.85, 0, -1.75],
    kind: 'desk',
    standAt: [-1.85, 0, -0.75],
    facing: 180,
  },
  {
    id: 'ban-2',
    pos: [1.85, 0, -1.75],
    kind: 'desk',
    standAt: [1.85, 0, -0.75],
    facing: 180,
  },
  { id: 'ghe-1', pos: [-1.85, 0, -0.97], kind: 'seat', facing: 180 },
  { id: 'ghe-2', pos: [1.85, 0, -0.97], kind: 'seat', facing: 180 },
  { id: 'buc-trung-tam', pos: [0, 0, 0.35], kind: 'stage', facing: 0 },
  { id: 'cua', pos: [0, 0, 3.3], kind: 'door', standAt: [0, 0, 2.6], facing: 0 },
  {
    id: 'ke-module',
    pos: [-3.15, 0, -0.9],
    kind: 'shelf',
    standAt: [-2.45, 0, -0.9],
    facing: 270,
  },
] as const;

/**
 * Clip tạm của A1: dựng bằng hoạt ảnh thủ công (procedural) có sẵn từ đợt 0.
 * A2 thay bằng thư viện chuyển động thật (Quaternius → VRMA) và mở rộng danh
 * sách; tên clip giữ nguyên nên lệnh không phải đổi.
 */
export const CLIPS = [
  'idle',
  'walk',
  'wave',
  'sit',
  'stand',
  'nod',
  'shake',
  'think',
  'clap',
  'point',
  'celebrate',
  'type',
  'sleep',
] as const;

/** Thời lượng clip (ms) — A2 thay bằng độ dài file chuyển động thật. */
export const DAI_CLIP: Record<string, number> = {
  idle: 400,
  walk: 1200,
  wave: 2600,
  sit: 800,
  stand: 800,
  nod: 1200,
  shake: 1200,
  think: 2400,
  clap: 1800,
  point: 2000,
  celebrate: 2600,
  type: 3000,
  sleep: 4000,
};

export const BIEU_CAM = [
  'neutral',
  'happy',
  'angry',
  'sad',
  'relaxed',
  'surprised',
] as const;

/** Thư viện emote v0.1 theo spec mục 3.2b — A2 thi công, A1 chỉ liệt kê. */
export const EMOTES = [
  'vui',
  'rat-vui',
  'buon',
  'ngac-nhien',
  'gian',
  'suy-nghi',
  'dong-y',
  'tu-choi',
  'chao',
  'ra-lenh',
  'thanh-cong',
  'that-bai',
  'boi-roi',
  'met',
  'cham-chu',
] as const;

export const PRESET_DEN = ['sang', 'toi', 'am'] as const;
export const PRESET_MAY = ['toan-canh', 'ban-1', 'ban-2', 'hop'] as const;

export function timPlace(id: string): DinhNghiaPlace | undefined {
  return PLACES.find((p) => p.id === id);
}
