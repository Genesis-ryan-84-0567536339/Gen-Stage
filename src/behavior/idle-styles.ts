/**
 * idle-styles.ts — 4 kiểu đứng chờ (`actor.idleStyle`, spec mục 3.2b).
 *
 * Mỗi kiểu chỉ là vài số nhân vào lớp hành vi nhỏ trong `nhanvat.ts` (thở,
 * đổi chân, nhìn quanh, chớp mắt) — không có dáng riêng, nên không bao giờ
 * "đứng hình": kiểu nào cũng là idle gốc, chỉ nhanh/chậm/rộng/hẹp khác nhau.
 */

export interface ThongSoIdle {
  /** Nhân tốc độ thở (1 = bình thường). */
  tho: number;
  /** Nhân biên độ đung đưa thân khi đứng. */
  dungDua: number;
  /** Giây giữa hai lần đổi trọng tâm chân (trung bình). */
  doiChan: number;
  /** Giây giữa hai lần nhìn quanh (trung bình). */
  nhinQuanh: number;
  /** Nhân tốc độ chớp mắt (nhỏ hơn = chớp dày hơn). */
  chop: number;
  /** Vai hạ xuống (âm) hay nhô lên (dương), radian cộng vào spine/chest. */
  gapVai: number;
  /** Đầu cúi thêm (dương = cúi), radian. */
  cuiDau: number;
}

export const IDLE_STYLES = [
  'binh-thuong',
  'hao-hung',
  'met',
  'cang-thang',
] as const;

export type IdleStyle = (typeof IDLE_STYLES)[number];

export const THONG_SO_IDLE: Record<IdleStyle, ThongSoIdle> = {
  'binh-thuong': { tho: 1, dungDua: 1, doiChan: 5.5, nhinQuanh: 7, chop: 1, gapVai: 0, cuiDau: 0 },
  'hao-hung': { tho: 1.5, dungDua: 1.8, doiChan: 3, nhinQuanh: 3.2, chop: 0.8, gapVai: 0.03, cuiDau: -0.03 },
  met: { tho: 0.65, dungDua: 0.5, doiChan: 8.5, nhinQuanh: 11, chop: 1.8, gapVai: -0.09, cuiDau: 0.1 },
  'cang-thang': { tho: 1.25, dungDua: 0.7, doiChan: 2.4, nhinQuanh: 2.1, chop: 0.55, gapVai: 0.07, cuiDau: 0.02 },
};
