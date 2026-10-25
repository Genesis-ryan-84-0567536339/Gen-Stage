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

/** Bàn điều khiển cong tự dựng (fallback): dãy mô-đun ghép vòng cung, cỡ phòng mới. */
function banDieuKhienTuDung(): THREE.Group {
  const g = new THREE.Group();
  const soManh = 7;
  const banKinh = 2.6;
  const goc = Math.PI * 0.5;
  for (let i = 0; i < soManh; i++) {
    const t = i / (soManh - 1) - 0.5;
    const a = t * goc;
    const than = hop(0.78, CAO_BAN, 0.62, 0x3a4556, 0.6, 0.3);
    than.position.set(Math.sin(a) * banKinh, CAO_BAN / 2, -Math.cos(a) * banKinh + banKinh);
    than.rotation.y = -a;
    g.add(than);

    const mat = khoiSang(0.66, 0.1, 0.42, i % 2 === 0 ? MAU_CYAN : MAU_CAM, 1.1);
    mat.position.set(
      Math.sin(a) * banKinh,
      CAO_BAN + 0.02,
      -Math.cos(a) * banKinh + banKinh - 0.02,
    );
    mat.rotation.y = -a;
    mat.rotation.x = -Math.PI / 2;
    g.add(mat);
  }
  return g;
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
  'desk_computerCorner',
  // ghế đẩu nhỏ: giữ lại DUY NHẤT model ghế (bỏ `desk_chair*` ghế văn phòng
  // cam) vì `actor.sit` của A2 cần hình học ghế thật để đo mặt ghế.
  'desk_chairStool',
  'platform_center',
  'platform_large',
  'platform_small',
  'structure_closed',
  'structure',
  'pipe_supportHigh',
  'rock_crystals',
  'rock_crystalsLargeA',
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

  if (!kho.get('desk_computerCorner')) {
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

  /* --- nội thất Kenney Space Kit (hoặc fallback) --- */
  const loader = new GLTFLoader();
  const kho = await napKenneyLab(loader);

  /**
   * 1. BÀN ĐIỀU KHIỂN CONG — ban-dieu-khien (0,0,-6).
   * Kenney không có sẵn bàn cong, nên ghép 5 khối `desk_computerCorner` (mỗi
   * khối chuẩn hoá cao 0,95 m) thành vòng cung bán kính 3,2 m: đọc ra đúng
   * "bàn điều khiển cong" mà vẫn là asset thật, không bịa.
   */
  if (kho.co) {
    const soManh = 5;
    const banKinh = 3.2;
    for (let i = 0; i < soManh; i++) {
      const t = i / (soManh - 1) - 0.5;
      const g = kho.layCao('desk_computerCorner', CAO_BAN)!;
      const a = t * Math.PI * 0.42;
      g.position.set(Math.sin(a) * banKinh, 0, -6 + banKinh - Math.cos(a) * banKinh);
      g.rotation.y = Math.PI - a;
      nhom.add(g);
    }
  } else {
    const g = banDieuKhienTuDung();
    g.position.set(0, 0, -6);
    g.rotation.y = Math.PI;
    nhom.add(g);
  }

  /**
   * 1b. GHẾ — ghe-1 / ghe-2, dời theo phòng 16 × 16 m (sát rìa, không chắn
   * trục camera ↔ bục). Bàn gỗ + ghế văn phòng cũ đã bỏ theo ý Boss ("gọn"),
   * nhưng `actor.sit` của A2 cần hình học ghế THẬT: đo cao độ mặt ghế trên
   * chính model vừa dựng rồi ghi vào `noi-dung.ts` qua `datSeatY()` — hips đặt
   * theo đúng số đo, không đoán bằng hằng số × tỉ lệ chân (review PR #10 mục
   * 2.1). `desk_chairStool` không có lưng nên `bbox.max.y` ≈ đúng mặt ghế; kẹp
   * trần 0,55 m cho trường hợp rơi về `desk_chair` có lưng cao hơn mặt ngồi.
   */
  for (const [id, x, z] of [
    ['ghe-1', -4.4, -2.4],
    ['ghe-2', 4.4, -2.4],
  ] as const) {
    const ghe = kho.co ? kho.layCao('desk_chairStool', 0.45) ?? kho.layCao('desk_chair', 0.45) : null;
    const g = ghe ?? gheTuDung();
    g.position.set(x, 0, z);
    g.rotation.y = Math.PI;
    nhom.add(g);
    g.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(g);
    const matGheDo = bb.max.y - bb.min.y > 0.01 ? Math.min(bb.max.y, 0.55) : 0;
    if (matGheDo > 0) datSeatY(id, matGheDo);
  }
  // 2 đèn ấm rọi bàn điều khiển (Boss: "điểm sáng ấm ở bàn điều khiển")
  for (const x of [-2.4, 2.4]) {
    const den = new THREE.PointLight(MAU_DEN_AM, 16, 11, 2);
    den.position.set(x, 2.2, -5.0);
    nhom.add(den);
  }

  /**
   * 2. BỤC TRUNG TÂM phát sáng — buc-trung-tam (0,0,0), đúng tâm phòng.
   * Cố tình KHÔNG dùng `platform_center` của Kenney: model đó là tấm vuông
   * phẳng, đặt dưới vòng sáng tròn trông cộc. Bục tự dựng là hình trụ tròn có
   * viền emissive, hợp với vòng sáng và với bục "sân khấu" trong spec 3.4b.
   */
  const bucG = dungBucTuDung();
  bucG.position.set(0, 0, 0);
  nhom.add(bucG);
  // mặt bục cao bao nhiêu thì vòng sáng đặt ngay trên đó — đọc từ bounding box
  // thay vì đoán, vì `platform_center` của Kenney dày mỏng tuỳ bản.
  const caoBuc = new THREE.Box3().setFromObject(bucG).max.y;
  const vongBuc = new THREE.Mesh(
    new THREE.RingGeometry(1.74, 1.92, 64),
    new THREE.MeshStandardMaterial({
      color: MAU_CYAN,
      emissive: MAU_CYAN,
      // 0.45 chứ không 0.9: bloom threshold 0.95 vẫn bắt được viền, nhưng
      // vòng sáng không còn "cháy trắng" nuốt cả chân nhân vật (ảnh 25/10).
      emissiveIntensity: 0.45,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    }),
  );
  vongBuc.rotation.x = -Math.PI / 2;
  vongBuc.position.set(0, caoBuc + 0.015, 0);
  vongBuc.name = 'vongBuc';
  nhom.add(vongBuc);
  const denBuc = new THREE.PointLight(0xbfeaff, 7, 9, 2);
  denBuc.position.set(0, 2.6, 0);
  nhom.add(denBuc);

  /* 3. kệ module — ke-module (-7.3,0,-1), áp tường trái, cao 2,6 m */
  const ke = kho.co
    ? kho.layCao('structure_closed', 2.6) ?? kho.layCao('structure', 2.6)
    : null;
  const keG = ke ?? keModuleTuDung();
  keG.position.set(-nua + 0.8, 0, -1);
  keG.rotation.y = Math.PI / 2;
  nhom.add(keG);
  // đèn ấm rọi kệ (Boss: "điểm sáng ấm ở … kệ")
  const denKe = new THREE.PointLight(MAU_DEN_AM, 13, 10, 2);
  denKe.position.set(-nua + 1.8, 2.1, -1);
  nhom.add(denKe);
  // 3 tinh thể "module" trên kệ
  for (let i = 0; i < 3; i++) {
    const vien = kho.co ? kho.layCao('rock_crystals', 0.34) : null;
    const g = vien ?? khoiSang(0.2, 0.3, 0.2, i % 2 === 0 ? MAU_CYAN : MAU_CAM, 1.0);
    g.position.set(-nua + 0.85, 0.55 + i * 0.72, -1.8 + i * 0.8);
    nhom.add(g);
  }

  /* 4–5. hai máy phát áp tường phải */
  for (const [z, ten, cao] of [
    [-4.6, 'machine_generatorLarge', 2.8],
    [1.6, 'machine_generator', 2.1],
  ] as const) {
    const m = kho.co ? kho.layCao(ten, cao) ?? kho.layCao('machine_generator', cao) : null;
    const g = m ?? mayPhatTuDung();
    g.position.set(nua - 1.0, 0, z);
    g.rotation.y = -Math.PI / 2;
    nhom.add(g);
  }

  /* 6–7. hai cột trụ ở hai góc sau — đóng khung phòng, không chắn ai */
  for (const x of [-nua + 1.2, nua - 1.2]) {
    const cot = kho.co ? kho.layCao('pipe_supportHigh', 4.6) : null;
    const g = cot ?? cotKinhTuDung();
    g.position.set(x, 0, -nua + 1.2);
    nhom.add(g);
  }

  /* 8. cụm tinh thể ở rìa phải phía trước — điểm nhấn, sát tường */
  {
    const tt = kho.co ? kho.layCao('rock_crystalsLargeA', 1.6) : null;
    const g = tt ?? khoiSang(0.8, 1.6, 0.8, MAU_CYAN, 0.8);
    g.position.set(nua - 1.1, 0, 5.2);
    nhom.add(g);
  }

  /* 9. khung cửa — cua (-7.4,0,4.6), áp TƯỜNG TRÁI phía trước (xem noi-dung.ts) */
  const cuaKhung = kho.co ? kho.layCao('gate_simple', 3.4) : null;
  const cuaG = cuaKhung ?? khungCuaTuDung();
  cuaG.position.set(-nua + 0.25, 0, 4.6);
  cuaG.rotation.y = Math.PI / 2;
  nhom.add(cuaG);
  const denCua = khoiSang(0.05, 0.05, 3.0, MAU_CAM, 1.0);
  denCua.position.set(-nua + 0.8, 0.04, 4.6);
  nhom.add(denCua);

  return { nhom, dungKenney: kho.co };
}

function dungBucTuDung(): THREE.Group {
  const g = new THREE.Group();
  const than = new THREE.Mesh(
    new THREE.CylinderGeometry(1.9, 2.1, 0.2, 48),
    new THREE.MeshStandardMaterial({ color: 0x3a4556, roughness: 0.6, metalness: 0.3 }),
  );
  than.position.y = 0.1;
  than.receiveShadow = true;
  g.add(than);
  const mep = new THREE.Mesh(
    new THREE.TorusGeometry(1.9, 0.035, 10, 64),
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
