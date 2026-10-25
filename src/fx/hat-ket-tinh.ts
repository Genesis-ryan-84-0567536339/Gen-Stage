/**
 * hat-ket-tinh.ts — hiệu ứng "kết tinh" cho `module.build` (spec mục 3.4b).
 *
 * Một hệ hạt (`THREE.Points`) sinh ra ở vị trí màn hình nguồn (hoặc giữa
 * phòng), bay tụ dần về bề mặt hình khối đích theo đồng hồ THẬT (không cộng
 * dồn `dt`, theo quy ước "Thời gian là lời hứa" của dự án) rồi tan biến,
 * nhường chỗ cho prop thật đã dựng sẵn (ẩn, chỉ `scale` dần lên).
 *
 * Giới hạn hiệu năng: tối đa `SO_HAT_TOI_DA` hạt/lần kết tinh — vài module
 * kết tinh cùng lúc vẫn không vượt tổng ngân sách hạt của cảnh (≤ 20k, xem
 * `world.ts`).
 */
import * as THREE from 'three';

export const SO_HAT_TOI_DA = 700;

export interface TuyChonKetTinh {
  scene: THREE.Scene;
  tu: THREE.Vector3;
  mauChinh: number;
  /** Điểm bề mặt hình đích (lấy mẫu thô từ geometry) actors bay tới. */
  diemDich: THREE.Vector3[];
  tamDich: THREE.Vector3;
  durationMs: number;
  /** Gọi khi hiệu ứng xong thật (không bị huỷ) — world dùng để hiện prop thật. */
  khiXong: () => void;
}

export class KetTinh {
  private diem: THREE.Points;
  private goc: Float32Array;
  private dich: Float32Array;
  private pha: Float32Array;
  private scene: THREE.Scene;
  private batDau = Date.now();
  private durationMs: number;
  private xong = false;
  private biHuy = false;
  private khiXong: () => void;

  constructor(o: TuyChonKetTinh) {
    this.scene = o.scene;
    this.durationMs = Math.max(200, o.durationMs);
    this.khiXong = o.khiXong;

    const soHat = Math.min(SO_HAT_TOI_DA, Math.max(80, o.diemDich.length * 6));
    this.goc = new Float32Array(soHat * 3);
    this.dich = new Float32Array(soHat * 3);
    this.pha = new Float32Array(soHat); // lệch thời gian nhỏ để không tụ cùng lúc, nhìn tự nhiên

    for (let i = 0; i < soHat; i++) {
      // xuất phát: quầng cầu ngẫu nhiên quanh màn hình nguồn
      const r = 0.25 + Math.random() * 0.55;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      this.goc[i * 3] = o.tu.x + r * Math.sin(ph) * Math.cos(th);
      this.goc[i * 3 + 1] = o.tu.y + r * Math.sin(ph) * Math.sin(th) * 0.6;
      this.goc[i * 3 + 2] = o.tu.z + r * Math.cos(ph);

      const dd = o.diemDich[i % o.diemDich.length]!;
      // rải nhẹ quanh điểm bề mặt để trông như bụi sáng, không phải lưới cứng
      this.dich[i * 3] = dd.x + o.tamDich.x + (Math.random() - 0.5) * 0.015;
      this.dich[i * 3 + 1] = dd.y + o.tamDich.y + (Math.random() - 0.5) * 0.015;
      this.dich[i * 3 + 2] = dd.z + o.tamDich.z + (Math.random() - 0.5) * 0.015;

      this.pha[i] = Math.random() * 0.4;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.goc.slice(), 3));
    const mat = new THREE.PointsMaterial({
      color: o.mauChinh,
      size: 0.028,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.diem = new THREE.Points(geo, mat);
    this.scene.add(this.diem);
  }

  /** Gọi mỗi khung hình; trả `true` khi hiệu ứng xong và đã dọn dẹp. */
  capNhat(): boolean {
    if (this.xong) return true;
    const trai = Date.now() - this.batDau;
    const pos = this.diem.geometry.getAttribute('position') as THREE.BufferAttribute;
    const mat = this.diem.material as THREE.PointsMaterial;

    let tMax = 0;
    for (let i = 0; i < pos.count; i++) {
      const tRieng = THREE.MathUtils.clamp(
        (trai / this.durationMs - this.pha[i]!) / (1 - this.pha[i]!),
        0,
        1,
      );
      const e = easeOutCubic(tRieng);
      pos.array[i * 3] = THREE.MathUtils.lerp(this.goc[i * 3]!, this.dich[i * 3]!, e);
      pos.array[i * 3 + 1] = THREE.MathUtils.lerp(this.goc[i * 3 + 1]!, this.dich[i * 3 + 1]!, e);
      pos.array[i * 3 + 2] = THREE.MathUtils.lerp(this.goc[i * 3 + 2]!, this.dich[i * 3 + 2]!, e);
      if (tRieng > tMax) tMax = tRieng;
    }
    pos.needsUpdate = true;

    const tToanCuc = THREE.MathUtils.clamp(trai / this.durationMs, 0, 1);
    // mờ dần ở 20% cuối, nhường chỗ cho prop thật
    mat.opacity = tToanCuc > 0.8 ? 0.95 * (1 - (tToanCuc - 0.8) / 0.2) : 0.95;

    if (tMax >= 1 && tToanCuc >= 1) {
      this.ketThuc(false);
      return true;
    }
    return false;
  }

  huy(): void {
    this.ketThuc(true);
  }

  private ketThuc(biHuy: boolean): void {
    if (this.xong) return;
    this.xong = true;
    this.biHuy = biHuy;
    this.scene.remove(this.diem);
    this.diem.geometry.dispose();
    (this.diem.material as THREE.Material).dispose();
    if (!biHuy) this.khiXong();
  }

  get daHuy(): boolean {
    return this.biHuy;
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Lấy mẫu N điểm bề mặt thô từ một geometry (dùng làm điểm hội tụ của hạt). */
export function maySurfacePoints(geo: THREE.BufferGeometry, n: number): THREE.Vector3[] {
  const pos = geo.getAttribute('position');
  const ra: THREE.Vector3[] = [];
  if (!pos || pos.count === 0) {
    ra.push(new THREE.Vector3());
    return ra;
  }
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * pos.count);
    ra.push(new THREE.Vector3(pos.getX(idx), pos.getY(idx), pos.getZ(idx)));
  }
  return ra;
}
