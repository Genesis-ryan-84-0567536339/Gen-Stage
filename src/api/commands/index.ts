/**
 * index.ts — gom mọi nhóm lệnh vào một registry.
 *
 * Thứ tự ở đây = thứ tự bảng lệnh trên UI và trong `stage.bootstrap`.
 */
import { Registry } from '../registry';
import { LENH_STAGE } from './stage';
import { LENH_ACTOR } from './actor';
import { LENH_PROP } from './prop';
import { LENH_SCENE } from './scene';
import { LENH_CAMERA } from './camera';
import { LENH_SCRIPT } from './script';
import { LENH_STUB } from './stubs';
import { LENH_SCREEN } from './screen';
import { LENH_MODULE } from './module';
// E1 (#48) — lệnh gói `module.demo`: cả màn dựng module trong MỘT lệnh.
import { LENH_DEMO } from './demo';
// J2 (#79) — BẢNG HOẠT ĐỘNG: `actor.activity` + `actor.activities`.
import { LENH_HOAT_DONG } from './hoat-dong';
import { LENH_FX } from './fx';

export function taoRegistry(): Registry {
  return new Registry().dangKy(
    ...LENH_STAGE,
    ...LENH_ACTOR,
    ...LENH_HOAT_DONG,
    ...LENH_PROP,
    ...LENH_SCENE,
    ...LENH_CAMERA,
    ...LENH_SCRIPT,
    ...LENH_SCREEN,
    ...LENH_MODULE,
    ...LENH_DEMO,
    ...LENH_FX,
    ...LENH_STUB,
  );
}

/** Tên tiếng Việt của từng nhóm, cho tiêu đề bảng lệnh. */
export const TEN_NHOM: Record<string, string> = {
  stage: 'Sân khấu',
  actor: 'Nhân vật',
  prop: 'Đồ vật',
  scene: 'Ánh sáng',
  camera: 'Máy quay',
  script: 'Kịch bản',
  screen: 'Màn hình hologram (A3)',
  module: 'Module (A3)',
  fx: 'Hiệu ứng (A3)',
};
