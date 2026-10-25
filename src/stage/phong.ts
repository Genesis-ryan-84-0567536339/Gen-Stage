/**
 * phong.ts — dựng cảnh LAB VIỄN TƯỞNG (A3, spec mục 3.4b).
 *
 * 25/10 — Boss xem thật trên Firefox và chốt gu: **"hơi tối, rối, không gian
 * quá chật chội"**. Bản này chỉnh theo đúng ba chữ đó:
 *   · RỘNG — sàn 16 × 16 m (cũ 7,2), trần 5,6 m (cũ 3,5).
 *   · SÁNG — albedo khối lên xám-xanh 0x3a4556–0x4a5566, sàn/tường nhạt hơn,
 *     thêm 3 point light ấm (cam nhạt) ở bàn điều khiển + kệ module.
 *   · GỌN — bỏ hẳn bàn gỗ + ghế văn phòng cũ; tối đa 8 khối Kenney lớn, tất cả
 *     đẩy sát rìa/tường. Giữa phòng chỉ còn bục trung tâm + bàn điều khiển cong
 *     + 3 màn hình hologram (dựng ở `man-hinh.ts`) + kệ module ở tường trái.
 *     Không khối nào nằm giữa camera `toan-canh` và nhân vật.
 *
 * Nội thất ưu tiên Kenney "Space Kit" (CC0) trong `public/kenney-sci-fi/`;
 * không tải được thì tự dựng bằng `RoundedBoxGeometry` + vật liệu emissive —
 * vẫn phải đẹp, không bịa asset.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { datSeatY } from './noi-dung';
import {
  BAN_CONG,
  BAN_KINH_BUC,
  KHOI_CANH,
  TINH_THE_TREN_KE,
  type KhoiCanh,
} from './bo-cuc';

/** Sàn vuông 16 × 16 m (Boss 25/10: phòng cũ 7,2 m quá chật). */
export const KICH_THUOC_PHONG = 16;
/** Trần cao 5,6 m — đủ thoáng cho góc 3/4 nhìn xuống. */
export const CAO_TUONG = 5.6;
const CAO_BAN = 0.92;

export const MAU_CYAN = 0x5fe0ff;
export const MAU_CAM = 0xff9d5f;
/** Ánh sáng điểm ấm: cam nhạt, không cháy da nhân vật. */
export const MAU_DEN_AM = 0xffc08a;

/* ------------------------------------------------------------------ texture */

/**
 * Sàn tối vân mạch cyan — nhạt hơn bản cũ (Boss: "rối"): nền sáng lên
 * #141c24, lưới panel mờ còn 6%, vân mạch còn 28% và ít hơn một nửa.
 */
function textureSanLab(): THREE.Texture {
  const w = 512;
  const h = 512;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#39485a';
  g.fillRect(0, 0, w, h);

  const o = 64;
  g.strokeStyle = 'rgba(120,190,215,0.07)';
  g.lineWidth = 1;
  for (let x = 0; x <= w; x += o) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
  }
  for (let y = 0; y <= h; y += o) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }

  // vân mạch sáng: 6 đường (cũ 14) và nhạt hơn — gợi ý chứ không "rối"
  g.strokeStyle = 'rgba(95,224,255,0.26)';
  g.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    let x = Math.floor(Math.random() * (w / o)) * o;
    let y = Math.floor(Math.random() * (h / o)) * o;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 4 + Math.floor(Math.random() * 3); s++) {
      const di = Math.floor(Math.random() * 4);
      x += di === 0 ? o : di === 1 ? -o : 0;
      y += di === 2 ? o : di === 3 ? -o : 0;
      x = Math.max(0, Math.min(w, x));
      y = Math.max(0, Math.min(h, y));
      g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = 'rgba(150,235,255,0.42)';
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // phòng rộng gấp hơn 2 → lặp nhiều hơn để ô panel giữ đúng cỡ ~1,3 m
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Tường kim loại xám-xanh, lưới panel mờ — sáng hơn bản cũ. */
function textureTuongLab(): THREE.Texture {
  const w = 256;
  const h = 256;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#5a6a80';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(130,175,200,0.3)';
  g.lineWidth = 2;
  for (let x = 0; x <= w; x += 64) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
  }
  for (let y = 0; y <= h; y += 64) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Khung sao ngoài "viewport" tường — cửa sổ lab nhìn ra không gian. */
function textureKhongGian(): THREE.Texture {
  const w = 256;
  const h = 256;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a1326');
  grad.addColorStop(1, '#13204a');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 1.4 + 0.2;
    g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* -------------------------------------------------------------- nội thất tự dựng */

function hop(w: number, h: number, d: number, mau: number, nhamBong = 0.65, kimLoai = 0.25): THREE.Mesh {
  const geo = new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.1);
  const mat = new THREE.MeshStandardMaterial({ color: mau, roughness: nhamBong, metalness: kimLoai });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function khoiSang(w: number, h: number, d: number, mau: number, cuong = 1.4): THREE.Mesh {
  const geo = new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.3);
  const mat = new THREE.MeshStandardMaterial({
    color: mau,
    emissive: mau,
    emissiveIntensity: cuong,
    roughness: 0.3,
    toneMapped: true,
  });
  return new THREE.Mesh(geo, mat);
}

/** Ghế đẩu dự phòng khi không có Kenney: mặt ghế ở 0,45 m cho khớp `seatY`. */
function gheTuDung(): THREE.Group {
  const g = new THREE.Group();
  const ngoi = hop(0.42, 0.06, 0.42, 0x3a4556, 0.65, 0.25);
  ngoi.position.y = 0.42;
  g.add(ngoi);
  const cot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.08, 0.39, 10),
    new THREE.MeshStandardMaterial({ color: 0x2c3844, metalness: 0.7, roughness: 0.3 }),
  );
  cot.position.y = 0.2;
  g.add(cot);
  const vienSang = khoiSang(0.44, 0.012, 0.44, MAU_CYAN, 0.5);
  vienSang.position.y = 0.449;
  g.add(vienSang);
  return g;
}

function keModuleTuDung(): THREE.Group {
  const g = new THREE.Group();
  const than = hop(2.2, 2.6, 0.6, 0x3a4556, 0.65, 0.25);
  than.position.y = 1.3;
  g.add(than);
  for (let tang = 0; tang < 4; tang++) {
    const ke = khoiSang(2.0, 0.02, 0.46, MAU_CYAN, 0.7);
    ke.position.set(0, 0.45 + tang * 0.62, 0.04);
    g.add(ke);
  }
  return g;
}

function cotKinhTuDung(cao = 4.4): THREE.Group {
  const g = new THREE.Group();
  // Vật liệu trong suốt đơn giản (KHÔNG `transmission`): `MeshPhysicalMaterial.transmission`
  // tốn thêm 1 lượt render nền mỗi khung hình cho mỗi vật — quá nặng cho mobile
  // (spec mục 5: FPS ≥30 trên 390×844).
  const than = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.26, cao, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x9be8ff,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  than.position.y = cao / 2;
  g.add(than);
  for (let i = 0; i < 3; i++) {
    const vong = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.02, 8, 24),
      new THREE.MeshStandardMaterial({ color: MAU_CYAN, emissive: MAU_CYAN, emissiveIntensity: 1.2 }),
    );
    vong.rotation.x = Math.PI / 2;
    vong.position.y = 0.4 + i * (cao - 0.8) * 0.5;
    g.add(vong);
  }
  return g;
}

function khungCuaTuDung(): THREE.Group {
  const g = new THREE.Group();
  const matKhung = new THREE.MeshStandardMaterial({ color: 0x3a4556, metalness: 0.3, roughness: 0.6 });
  for (const [x, y, w, h] of [
    [-1.5, 1.8, 0.2, 3.6],
    [1.5, 1.8, 0.2, 3.6],
    [0, 3.5, 3.2, 0.2],
  ] as const) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), matKhung);
    k.position.set(x, y, 0);
    g.add(k);
  }
  const den = khoiSang(2.9, 0.06, 0.04, MAU_CAM, 1.3);
  den.position.set(0, 0.05, 0.12);
  g.add(den);
  return g;
}

function mayPhatTuDung(): THREE.Group {
  const g = new THREE.Group();
  const than = hop(1.5, 2.3, 1.1, 0x3f4b5c, 0.65, 0.28);
  than.position.y = 1.15;
  g.add(than);
  for (let i = 0; i < 3; i++) {
    const soc = khoiSang(0.1, 1.5, 0.03, i === 1 ? MAU_CAM : MAU_CYAN, 0.9);
    soc.position.set(-0.4 + i * 0.4, 1.3, 0.57);
    g.add(soc);
  }
  return g;
}

/* ------------------------------------------------------------------ Kenney */

/**
 * Kho model Kenney. Bài học 25/10: dùng MỘT hệ số tỷ lệ chung cho mọi model
 * (bản cũ: scale theo chiều cao cái bàn) làm `structure_closed`/`pipe_support`
 * phình thành khối cao 6–8 m chắn nửa khung hình. Giờ mỗi model được chuẩn hoá
 * theo **kích thước thật mong muốn, tính bằng mét**: `layCao` cho vật đứng
 * (kệ, máy phát, cột, cửa), `layRong` cho vật bè ngang (bục, bàn).
 */
type KhoSciFi = {
  co: boolean;
  layCao(ten: string, caoM: number): THREE.Object3D | null;
  layRong(ten: string, rongM: number): THREE.Object3D | null;
};

/**
 * Chỉ nạp những model THỰC SỰ còn dùng sau khi gọn cảnh (Boss 25/10): bỏ
 * `desk_chair` (ghế văn phòng cam) và `desk_computer*` phụ khỏi danh sách —
 * chỉ giữ `desk_chairStool` cho hai place ghế (A2 `actor.sit` đo mặt ghế) —
 * tải ít file hơn, khởi động nhanh hơn, và không còn khối nào chắn khung hình.
 */
const TEN_KENNEY_LAB = [
  // dãy tủ sát tường sau (B1): khối máy vuông vức, không phải mảnh vỏ tàu
  'machine_barrel',
  'machine_wireless',
  'desk_computerScreen',
  // ghế đẩu nhỏ: model ghế DUY NHẤT còn dùng (bỏ `desk_chair*` ghế văn phòng
  // cam) vì `actor.sit` của A2 cần hình học ghế thật để đo mặt ghế.
  'desk_chairStool',
  'desk_chair',
  'structure_closed',
  'structure',
  'pipe_supportHigh',
  'rock_crystals',
  'gate_simple',
  'machine_generator',
  'machine_generatorLarge',
] as const;

async function napKenneyLab(loader: GLTFLoader): Promise<KhoSciFi> {
  const kho = new Map<string, THREE.Object3D>();
  const ketQua = await Promise.all(
    TEN_KENNEY_LAB.map(async (ten) => {
      try {
        const gltf = await loader.loadAsync(`kenney-sci-fi/${ten}.glb`);
        return [ten, gltf.scene] as const;
      } catch {
        return [ten, null] as const;
      }
    }),
  );
  for (const [ten, obj] of ketQua) if (obj) kho.set(ten, obj);

  if (!kho.get('desk_chairStool')) {
    return { co: false, layCao: () => null, layRong: () => null };
  }

  // Kenney Space Kit gốc là xám-kem phẳng lì. Bản trước nhuộm về 0x2a3340 →
  // Boss thấy "tối, như xốp". Giờ nâng albedo lên xám-xanh 0x3a4556–0x4a5566,
  // roughness 0.65, metalness 0.25 (đúng gu "phim viễn tưởng sạch"), và viền
  // emissive mảnh hơn (opacity 0.3 thay vì 0.55) để bớt rối.
  // Vật liệu/đường viền dùng CHUNG một instance cho mọi mesh để không nhân
  // bản n lần (n = số lần `lay()` được gọi).
  const matVienKenney = new THREE.LineBasicMaterial({
    color: MAU_CYAN,
    transparent: true,
    opacity: 0.3,
    toneMapped: false,
  });

  /** Lấy model, scale về đúng cỡ mét theo một trục, rồi đặt gốc ở chân + tâm. */
  function lay(ten: string, truc: 'cao' | 'rong', cuM: number): THREE.Object3D | null {
      const goc = kho.get(ten);
      if (!goc) return null;
      const loi = goc.clone(true);
      const bg = new THREE.Box3().setFromObject(loi);
      const cao = bg.max.y - bg.min.y;
      const rong = Math.max(bg.max.x - bg.min.x, bg.max.z - bg.min.z);
      const goc0 = truc === 'cao' ? cao : rong;
      loi.scale.setScalar(goc0 > 0.001 ? cuM / goc0 : 1);
      const b = new THREE.Box3().setFromObject(loi);
      loi.position.x -= (b.min.x + b.max.x) / 2;
      loi.position.z -= (b.min.z + b.max.z) / 2;
      loi.position.y -= b.min.y;
      const boc = new THREE.Group();
      boc.add(loi);
      let i = 0;
      boc.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          // KHÔNG castShadow cho nội thất Kenney (spec mục 5 — hiệu năng):
          // sàn/tường vẫn receiveShadow nên bóng đổ của NHÂN VẬT vẫn rõ.
          m.castShadow = false;
          m.receiveShadow = true;
          // xen kẽ hai tông xám-xanh cho khối đỡ phẳng
          const tone = i++ % 2 === 0 ? 0x3a4556 : 0x4a5566;
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
            const mh = mat as THREE.MeshStandardMaterial;
            if (!mh) continue;
            mh.color?.setHex(tone);
            if ('metalness' in mh) mh.metalness = 0.25;
            if ('roughness' in mh) mh.roughness = 0.65;
            if ('emissiveIntensity' in mh) mh.emissiveIntensity = 0;
          }
          if (m.geometry) {
            const vien = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), matVienKenney);
            m.add(vien);
          }
        }
      });
      return boc;
  }

  return {
    co: true,
    layCao: (ten, caoM) => lay(ten, 'cao', caoM),
    layRong: (ten, rongM) => lay(ten, 'rong', rongM),
  };
}

/* ------------------------------------------------------------------- cảnh */

export type Phong = {
  nhom: THREE.Group;
  dungKenney: boolean;
};

export async function dungPhong(scene: THREE.Scene): Promise<Phong> {
  const nhom = new THREE.Group();
  nhom.name = 'LabVienTuong';
  scene.add(nhom);

  const nua = KICH_THUOC_PHONG / 2;

  /* --- sàn --- */
  const san = new THREE.Mesh(
    new THREE.PlaneGeometry(KICH_THUOC_PHONG, KICH_THUOC_PHONG),
    new THREE.MeshStandardMaterial({ map: textureSanLab(), roughness: 0.6, metalness: 0.2 }),
  );
  san.rotation.x = -Math.PI / 2;
  san.receiveShadow = true;
  nhom.add(san);

  /* --- 3 tường kim loại xám-xanh --- */
  const matTuong = new THREE.MeshStandardMaterial({
    map: textureTuongLab(),
    // KHÔNG nhân thêm `color` tối: `map` đã mang sẵn màu tường. Bản trước nhân
    // map (#36475b) với color (0x414f61) → tường đen kịt dù đèn đã sáng.
    roughness: 0.7,
    metalness: 0.2,
  });

  for (const [x, z, ry] of [
    [0, -nua, 0],
    [-nua, 0, Math.PI / 2],
    [nua, 0, -Math.PI / 2],
  ] as const) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(KICH_THUOC_PHONG, CAO_TUONG), matTuong);
    t.position.set(x, CAO_TUONG / 2, z);
    t.rotation.y = ry;
    t.receiveShadow = true;
    nhom.add(t);
  }

  /* --- trần + đèn dải --- */
  const tran = new THREE.Mesh(
    new THREE.PlaneGeometry(KICH_THUOC_PHONG, KICH_THUOC_PHONG),
    new THREE.MeshStandardMaterial({ color: 0x2a3545, roughness: 0.8, metalness: 0.25 }),
  );
  tran.rotation.x = Math.PI / 2;
  tran.position.y = CAO_TUONG;
  nhom.add(tran);

  // 5 dải sáng dài cho phòng 16 m (geometry emissive, bloom lo phần toả sáng)
  // nhưng chỉ 2 PointLight thật cho cả trần — hiệu năng (spec mục 5).
  for (let i = -2; i <= 2; i++) {
    const strip = khoiSang(0.3, 0.06, 12.5, i % 2 === 0 ? MAU_CYAN : 0xeaf6ff, 0.8);
    strip.position.set(i * 3.0, CAO_TUONG - 0.05, 0);
    nhom.add(strip);
  }
  for (const z of [-4, 3]) {
    const den = new THREE.PointLight(0xdcf2ff, 10, 16, 2);
    den.position.set(0, CAO_TUONG - 0.5, z);
    nhom.add(den);
  }

  /* --- 3 viewport "cửa sổ" nhìn ra không gian, treo cao gần trần --- */
  const texKhongGian = textureKhongGian();
  const viTriCuaSo: Array<[THREE.Vector3, number]> = [
    [new THREE.Vector3(-5.2, 4.1, -nua + 0.04), 0],
    [new THREE.Vector3(5.2, 4.1, -nua + 0.04), 0],
    [new THREE.Vector3(nua - 0.04, 4.1, 2.4), -Math.PI / 2],
  ];
  for (const [vt, ry] of viTriCuaSo) {
    const cuaSo = new THREE.Group();
    const kinh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 2.1),
      new THREE.MeshBasicMaterial({ map: texKhongGian, toneMapped: false }),
    );
    cuaSo.add(kinh);
    const khung = new THREE.Mesh(
      new THREE.RingGeometry(1.06, 1.16, 32),
      new THREE.MeshStandardMaterial({ color: MAU_CYAN, emissive: MAU_CYAN, emissiveIntensity: 0.9 }),
    );
    cuaSo.add(khung);
    cuaSo.position.copy(vt);
    cuaSo.rotation.y = ry;
    nhom.add(cuaSo);
  }

  /* ------------------------------------------------------------------------
   * NỘI THẤT — ĐẶT THEO BẢNG BỐ CỤC (`bo-cuc.ts`), không toạ độ viết tay.
   *
   * Issue #18 mục 1: bố cục phải có chủ ý và kiểm được bằng số. Vòng trước mỗi
   * khối có một toạ độ riêng viết ngay trong code dựng → không ai canh được
   * thẳng hàng hay hành lang. Giờ `phong.ts` chỉ còn *đọc bảng và dựng*.
   * ---------------------------------------------------------------------- */
  const loader = new GLTFLoader();
  const kho = await napKenneyLab(loader);

  /** Dựng một khối theo đúng dòng trong bảng (hoặc fallback tự dựng). */
  function dungKhoi(k: KhoiCanh, duPhong: () => THREE.Object3D): THREE.Object3D {
    let obj: THREE.Object3D | null = null;
    if (kho.co && k.kenney) {
      if (k.cao !== undefined) {
        obj = kho.layCao(k.kenney, k.cao) ?? (k.kenneyPhu ? kho.layCao(k.kenneyPhu, k.cao) : null);
      } else if (k.rong !== undefined) {
        obj = kho.layRong(k.kenney, k.rong) ?? (k.kenneyPhu ? kho.layRong(k.kenneyPhu, k.rong) : null);
      }
    }
    const g = obj ?? duPhong();
    // trần bề ngang: xem `KhoiCanh.rongToiDa`
    if (k.rongToiDa !== undefined) {
      const b = new THREE.Box3().setFromObject(g);
      const rong = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
      if (rong > k.rongToiDa) g.scale.multiplyScalar(k.rongToiDa / rong);
    }
    g.position.set(k.tai[0], 0, k.tai[1]);
    g.rotation.y = (k.quay * Math.PI) / 180;
    g.name = `khoi:${k.id}`;
    nhom.add(g);
    return g;
  }

  /* --- VÙNG A: bục trung tâm TRỐNG, đúng gốc toạ độ --- */
  // Cố tình KHÔNG dùng `platform_center` của Kenney: model đó là tấm vuông
  // phẳng, đặt dưới vòng sáng tròn trông cộc.
  const bucG = dungBucTuDung();
  bucG.position.set(0, 0, 0);
  nhom.add(bucG);
  const caoBuc = new THREE.Box3().setFromObject(bucG).max.y;
  const vongBuc = new THREE.Mesh(
    new THREE.RingGeometry(BAN_KINH_BUC - 0.25, BAN_KINH_BUC - 0.12, 64),
    new THREE.MeshStandardMaterial({
      color: MAU_CYAN,
      emissive: MAU_CYAN,
      // 0.32 chứ không 0.9: bloom threshold 0.95 vẫn bắt được viền, nhưng vòng
      // sáng không "cháy trắng" nuốt cả chân nhân vật (ảnh 25/10).
      emissiveIntensity: 0.32,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    }),
  );
  vongBuc.rotation.x = -Math.PI / 2;
  vongBuc.position.set(0, caoBuc + 0.015, 0);
  vongBuc.name = 'vongBuc';
  nhom.add(vongBuc);
  nhom.add(denDiem(0xbfeaff, 7, 9, 0, 2.6, 0));

  /* --- VÙNG B: bàn điều khiển cong + 2 ghế + 2 đèn ấm --- */
  /**
   * Bàn cong dựng bằng HÌNH HỌC TỰ DỰNG, không phải model Kenney — và đây là
   * một lựa chọn có lý do, không phải vì thiếu asset:
   *
   * Space Kit không có bàn cong. Vòng A3 ghép 5 khối `desk_computerCorner`
   * (bàn góc chữ L) thành vòng cung; chuẩn hoá theo chiều cao thì mỗi mảnh bè
   * ngang 2,3 m, chuẩn hoá theo bề ngang thì mặt bàn tụt còn ~0,35 m — ảnh thử
   * B1 cho ra một đống nêm nằm bẹp dưới sàn, không đọc ra "bàn điều khiển".
   * Khối bo góc + mặt kính phát sáng tự dựng cao đúng 0,92 m, ghép liền mạch
   * theo cung, và vẫn đúng gu "phim viễn tưởng sạch". Kenney vẫn lo ghế, kệ,
   * máy phát, cột, cửa, tủ — những thứ nó có sẵn và đẹp.
   */
  {
    const huong = (BAN_CONG.quay * Math.PI) / 180;
    // vector hướng mặt bàn (quay 0 = +Z)
    const hx = Math.sin(huong);
    const hz = Math.cos(huong);
    // tâm cung = điểm giữa mặt bàn LÙI lại một bán kính theo hướng mặt bàn
    const cx = BAN_CONG.tai[0] - hx * BAN_CONG.banKinh;
    const cz = BAN_CONG.tai[1] - hz * BAN_CONG.banKinh;
    for (let i = 0; i < BAN_CONG.soManh; i++) {
      const t = i / (BAN_CONG.soManh - 1) - 0.5;
      const a = huong + (t * BAN_CONG.gocMo * Math.PI) / 180;
      const g = manhBanTuDung();
      g.position.set(cx + Math.sin(a) * BAN_CONG.banKinh, 0, cz + Math.cos(a) * BAN_CONG.banKinh);
      g.rotation.y = a;
      nhom.add(g);
      // 2 màn hình nhỏ Kenney đặt TRÊN mặt bàn (mảnh 1 và 3): để vùng B đọc ra
      // ngay là "chỗ ngồi làm việc", không phải một quầy trống.
      if (kho.co && (i === 1 || i === 3)) {
        const mh = kho.layCao('desk_computerScreen', 0.42);
        if (mh) {
          mh.position.set(
            cx + Math.sin(a) * (BAN_CONG.banKinh + 0.12),
            BAN_CONG.cao,
            cz + Math.cos(a) * (BAN_CONG.banKinh + 0.12),
          );
          mh.rotation.y = a + Math.PI;
          nhom.add(mh);
        }
      }
    }
  }
  for (const k of KHOI_CANH.filter((q) => q.id.startsWith('ghe-'))) {
    const g = dungKhoi(k, gheTuDung);
    g.updateMatrixWorld(true);
    // `actor.sit` cần hình học ghế THẬT: đo cao độ mặt ghế trên chính model vừa
    // dựng rồi ghi vào `noi-dung.ts` (review PR #10 mục 2.1). `desk_chairStool`
    // không có lưng nên `bbox.max.y` ≈ đúng mặt ghế; kẹp trần 0,55 m cho
    // trường hợp rơi về `desk_chair` có lưng cao hơn mặt ngồi.
    const bb = new THREE.Box3().setFromObject(g);
    const matGhe = bb.max.y - bb.min.y > 0.01 ? Math.min(bb.max.y, 0.55) : 0;
    if (matGhe > 0) datSeatY(k.id, matGhe);
  }
  nhom.add(denDiem(MAU_DEN_AM, 16, 11, BAN_CONG.tai[0] - 1.2, 2.2, BAN_CONG.tai[1] - 1.6));
  nhom.add(denDiem(MAU_DEN_AM, 16, 11, BAN_CONG.tai[0] - 1.2, 2.2, BAN_CONG.tai[1] + 1.6));

  /* --- VÙNG C: kệ module + 2 máy phát + cột + cửa --- */
  for (const k of KHOI_CANH.filter((q) => q.vung === 'kho')) {
    const duPhong =
      k.id === 'ke-module'
        ? keModuleTuDung
        : k.id === 'cua'
          ? khungCuaTuDung
          : k.id.startsWith('may-phat')
            ? mayPhatTuDung
            : cotKinhTuDung;
    dungKhoi(k, duPhong);
  }
  nhom.add(denDiem(MAU_DEN_AM, 13, 10, -nua + 1.8, 2.1, -1));
  // dải sáng dưới chân khung cửa (gợi lối ra)
  {
    const den = khoiSang(0.05, 0.05, 3.0, MAU_CAM, 1.0);
    den.position.set(-nua + 0.8, 0.04, 5);
    nhom.add(den);
  }
  // 3 tinh thể "module" ĐẶT TRÊN KỆ (bản cũ rải xuống sàn giữa phòng)
  for (let i = 0; i < 3; i++) {
    const vien = kho.co ? kho.layCao('rock_crystals', TINH_THE_TREN_KE.cao) : null;
    const g = vien ?? khoiSang(0.2, 0.3, 0.2, i % 2 === 0 ? MAU_CYAN : MAU_CAM, 1.0);
    g.position.set(
      TINH_THE_TREN_KE.tai[0],
      TINH_THE_TREN_KE.tang[i]!,
      TINH_THE_TREN_KE.tai[1] + TINH_THE_TREN_KE.lech[i]!,
    );
    nhom.add(g);
  }

  /* --- DÃY TỦ sát tường sau: chỗ dồn hết khối Kenney lẻ của bản cũ --- */
  for (const k of KHOI_CANH.filter((q) => q.vung === 'tuong-sau')) {
    dungKhoi(k, () => hop(1.2, 1.3, 0.7, 0x3a4556, 0.65, 0.25));
  }

  /* --- 2 cột ống ở hai góc sau (đóng khung phòng, thuộc vùng B/C) --- */
  for (const k of KHOI_CANH.filter((q) => q.id.startsWith('cot-'))) {
    dungKhoi(k, cotKinhTuDung);
  }

  return { nhom, dungKenney: kho.co };
}

/** PointLight dựng gọn một dòng (bảng bố cục không quản ánh sáng). */
function denDiem(
  mau: number,
  cuong: number,
  xa: number,
  x: number,
  y: number,
  z: number,
): THREE.PointLight {
  const d = new THREE.PointLight(mau, cuong, xa, 2);
  d.position.set(x, y, z);
  return d;
}

/** Một mảnh bàn điều khiển tự dựng (khi không có Kenney). */
function manhBanTuDung(): THREE.Group {
  const g = new THREE.Group();
  const than = hop(0.86, CAO_BAN, 0.62, 0x3a4556, 0.6, 0.3);
  than.position.y = CAO_BAN / 2;
  g.add(than);
  const mat = khoiSang(0.72, 0.1, 0.42, MAU_CYAN, 1.1);
  mat.position.set(0, CAO_BAN + 0.02, -0.02);
  mat.rotation.x = -Math.PI / 2;
  g.add(mat);
  return g;
}

function dungBucTuDung(): THREE.Group {
  const g = new THREE.Group();
  const than = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.4, 0.2, 48),
    new THREE.MeshStandardMaterial({ color: 0x4a5566, roughness: 0.6, metalness: 0.3 }),
  );
  than.position.y = 0.1;
  than.receiveShadow = true;
  g.add(than);
  const mep = new THREE.Mesh(
    new THREE.TorusGeometry(1.25, 0.035, 10, 64),
    new THREE.MeshStandardMaterial({ color: MAU_CYAN, emissive: MAU_CYAN, emissiveIntensity: 1.3 }),
  );
  mep.rotation.x = Math.PI / 2;
  mep.position.y = 0.2;
  g.add(mep);
  return g;
}

/** Khí mù nhẹ quanh bục — fog cục bộ dạng hạt, gọi một lần lúc dựng cảnh. */
export function haiSuongBuc(scene: THREE.Scene): void {
  const soHat = 110;
  const pos = new Float32Array(soHat * 3);
  for (let i = 0; i < soHat; i++) {
    const r = Math.random() * 2.1;
    const a = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 0.7;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xcff4ff,
    size: 0.1,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
  });
  const diem = new THREE.Points(geo, mat);
  diem.name = 'suongBuc';
  scene.add(diem);
}
