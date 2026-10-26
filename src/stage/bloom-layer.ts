/**
 * bloom-layer.ts — C3 (#40): layer bit dùng cho BLOOM CHỌN LỌC.
 *
 * Boss 26/10: "nhân vật nam thấy ghê" — mặt/áo cháy trắng vì `UnrealBloomPass`
 * bắt luôn MToon sáng gần 1.0 của nhân vật. Đổi sang kỹ thuật selective bloom
 * chuẩn three.js: pass bloom chỉ render vật có bit layer này (`world.ts` darken
 * mọi vật KHÔNG có bit trước khi render pass bloom), rồi cộng lên render
 * thường. Nhân vật/khối/sàn/tường/bàn/kệ KHÔNG BAO GIỜ gọi `batSang`.
 *
 * Danh sách được bật (đúng spec Issue #40): dải đèn trần, vòng/mép bục, viền +
 * nội dung hologram, hạt kết tinh, fx ngắn (`fx.play`).
 */
import * as THREE from 'three';

/** Bit layer riêng cho bloom (layer 0 mặc định vẫn giữ — vật phải hiện trong
 *  render thường, bit này chỉ thêm việc "góp sáng vào pass bloom"). */
export const LOP_BLOOM = 1;

/** Gắn một Object3D (và mọi object con) vào layer bloom. */
export function batSang<T extends THREE.Object3D>(obj: T): T {
  obj.traverse((o) => o.layers.enable(LOP_BLOOM));
  return obj;
}
