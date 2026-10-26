/**
 * hieu-ung.ts — hiệu ứng ánh sáng ngắn cho `fx.play` (spec mục 3.4b):
 * `scan` (quét tia sáng qua một vùng), `pulse` (nhấp sáng nhanh), `alert`
 * (nháy đỏ cảnh báo), `success` (bùng sáng xanh lá + hạt lấp lánh ngắn).
 *
 * Tách khỏi `world.ts` để nghiệp vụ hiệu ứng không lẫn vào vòng lặp vẽ chính;
 * `world.ts` chỉ gọi `tao()` rồi tự cập nhật mỗi khung hình như các fx khác.
 */
import * as THREE from 'three';

export const DAI_MAC_DINH: Record<string, number> = {
  scan: 1400,
  pulse: 700,
  alert: 1200,
  success: 1800,
};

/**
 * D1 (Issue #43): `fx.*` dịu lại — bỏ cyan/neon, chuyển sang vàng ấm nhạt.
 * `alert` giữ đỏ (ý nghĩa cảnh báo không đổi), `success` giữ xanh lá nhưng
 * nhạt hơn — không còn rực như neon.
 */
export const MAU_FX: Record<string, number> = {
  scan: 0xffd27a,
  pulse: 0xffd27a,
  alert: 0xff6b5c,
  success: 0x9fe0a0,
};

export interface HieuUng {
  /** `true` khi xong — world sẽ dọn khỏi scene. */
  capNhat(): boolean;
  huy(): void;
}

/** `scan`: tấm sáng mỏng quét dọc qua một cột không gian quanh `tam`. */
class HieuUngQuet implements HieuUng {
  private m: THREE.Mesh;
  private scene: THREE.Scene;
  private batDau = Date.now();
  private dai: number;
  private xong = false;

  constructor(scene: THREE.Scene, tam: THREE.Vector3, dai: number) {
    this.scene = scene;
    this.dai = dai;
    const geo = new THREE.PlaneGeometry(3.4, 3.4);
    const mat = new THREE.MeshBasicMaterial({
      color: MAU_FX.scan,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    this.m = new THREE.Mesh(geo, mat);
    this.m.position.copy(tam).setY(1.6);
    this.m.rotation.x = Math.PI / 2;
    // C3 (#40): fx ngắn nằm trong danh sách BLOOM chọn lọc.
    scene.add(this.m);
  }

  capNhat(): boolean {
    if (this.xong) return true;
    const t = (Date.now() - this.batDau) / this.dai;
    if (t >= 1) {
      this.ketThuc();
      return true;
    }
    this.m.position.y = 0.2 + t * 3.0;
    const mat = this.m.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.42 * Math.sin(Math.PI * t);
    return false;
  }

  huy(): void {
    this.ketThuc();
  }

  private ketThuc(): void {
    if (this.xong) return;
    this.xong = true;
    this.scene.remove(this.m);
    this.m.geometry.dispose();
    (this.m.material as THREE.Material).dispose();
  }
}

/** `pulse`/`alert`/`success`: bùng một quầng cầu sáng tại `tam` rồi tan. */
class HieuUngBung implements HieuUng {
  private m: THREE.Mesh;
  private light: THREE.PointLight;
  private scene: THREE.Scene;
  private batDau = Date.now();
  private dai: number;
  private xong = false;
  private nhay: boolean;

  constructor(scene: THREE.Scene, tam: THREE.Vector3, mau: number, dai: number, nhay = false) {
    this.scene = scene;
    this.dai = dai;
    this.nhay = nhay;
    const geo = new THREE.SphereGeometry(0.22, 20, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: mau,
      transparent: true,
      opacity: 0.8,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    this.m = new THREE.Mesh(geo, mat);
    this.m.position.copy(tam);
    scene.add(this.m);

    this.light = new THREE.PointLight(mau, 6, 5, 2);
    this.light.position.copy(tam);
    scene.add(this.light);
  }

  capNhat(): boolean {
    if (this.xong) return true;
    const t = (Date.now() - this.batDau) / this.dai;
    if (t >= 1) {
      this.ketThuc();
      return true;
    }
    const mat = this.m.material as THREE.MeshBasicMaterial;
    if (this.nhay) {
      // alert: nháy 2-3 lần thay vì bùng một lần
      const nhip = (t * 6) % 1;
      this.m.scale.setScalar(1 + nhip * 1.6);
      mat.opacity = 0.75 * (1 - nhip);
      this.light.intensity = 6 * (1 - nhip) * (1 - t);
    } else {
      this.m.scale.setScalar(1 + t * 5);
      mat.opacity = 0.8 * (1 - t);
      this.light.intensity = 6 * (1 - t);
    }
    return false;
  }

  huy(): void {
    this.ketThuc();
  }

  private ketThuc(): void {
    if (this.xong) return;
    this.xong = true;
    this.scene.remove(this.m);
    this.scene.remove(this.light);
    this.m.geometry.dispose();
    (this.m.material as THREE.Material).dispose();
  }
}

export function taoHieuUng(
  scene: THREE.Scene,
  name: string,
  tam: THREE.Vector3,
  durationMs?: number,
): HieuUng {
  const dai = durationMs ?? DAI_MAC_DINH[name] ?? 1000;
  switch (name) {
    case 'scan':
      return new HieuUngQuet(scene, tam, dai);
    case 'alert':
      return new HieuUngBung(scene, tam, MAU_FX.alert!, dai, true);
    case 'success':
      return new HieuUngBung(scene, tam, MAU_FX.success!, dai, false);
    default: // pulse
      return new HieuUngBung(scene, tam, MAU_FX.pulse!, dai, false);
  }
}
