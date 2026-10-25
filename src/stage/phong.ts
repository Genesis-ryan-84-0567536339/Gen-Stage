/**
 * phong.ts — dựng cảnh LAB VIỄN TƯỞNG (A3, spec mục 3.4b): sàn tối vân sáng,
 * bục trung tâm phát sáng, bàn điều khiển cong, kệ module, cột/khung kính,
 * trần đèn dải, tông cyan + điểm cam. Nội thất ưu tiên Kenney "Space Kit"
 * (CC0) trong `public/kenney-sci-fi/`; không tải được thì tự dựng bằng
 * `RoundedBoxGeometry` + vật liệu emissive — vẫn phải đẹp, không bịa asset.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { datSeatY } from './noi-dung';

const KICH_THUOC_PHONG = 7.2; // phòng vuông 7.2 x 7.2 m, giữ đúng A1
const CAO_TUONG = 3.5;
const CAO_BAN = 0.92;

export const MAU_CYAN = 0x5fe0ff;
export const MAU_CAM = 0xff9d5f;

/* ------------------------------------------------------------------ texture */

/** Sàn tối, vân mạch sáng cyan chạy theo lưới lục giác — không cần asset ngoài. */
function textureSanLab(): THREE.Texture {
  const w = 512;
  const h = 512;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#0a0f14';
  g.fillRect(0, 0, w, h);

  // tấm panel sàn, mạch ghép mảnh
  const o = 64;
  g.strokeStyle = 'rgba(95,224,255,0.10)';
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

  // vân mạch sáng chạy ngẫu nhiên, như bảng mạch
  g.strokeStyle = 'rgba(95,224,255,0.55)';
  g.lineWidth = 2;
  for (let k = 0; k < 14; k++) {
    let x = Math.floor(Math.random() * (w / o)) * o;
    let y = Math.floor(Math.random() * (h / o)) * o;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 4 + Math.floor(Math.random() * 4); s++) {
      const di = Math.floor(Math.random() * 4);
      x += di === 0 ? o : di === 1 ? -o : 0;
      y += di === 2 ? o : di === 3 ? -o : 0;
      x = Math.max(0, Math.min(w, x));
      y = Math.max(0, Math.min(h, y));
      g.lineTo(x, y);
    }
    g.stroke();
    // nút sáng ở đầu mạch
    g.fillStyle = 'rgba(140,240,255,0.8)';
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Tường kim loại tối, lưới panel mờ. */
function textureTuongLab(): THREE.Texture {
  const w = 256;
  const h = 256;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#10171f';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(70,110,130,0.35)';
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
  tex.repeat.set(4, 2);
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
  grad.addColorStop(0, '#060a16');
  grad.addColorStop(1, '#0c1430');
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

function hop(w: number, h: number, d: number, mau: number, nhamBong = 0.4, mentalness = 0.55): THREE.Mesh {
  const geo = new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.1);
  const mat = new THREE.MeshStandardMaterial({ color: mau, roughness: nhamBong, metalness: mentalness });
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

/** Bàn điều khiển cong tự dựng (fallback): dãy mô-đun hình thang ghép vòng cung. */
function banDieuKhienTuDung(): THREE.Group {
  const g = new THREE.Group();
  const soManh = 5;
  const banKinh = 1.5;
  const goc = Math.PI * 0.55;
  for (let i = 0; i < soManh; i++) {
    const t = i / (soManh - 1) - 0.5;
    const a = t * goc;
    const than = hop(0.62, CAO_BAN, 0.5, 0x1a222c, 0.35, 0.6);
    than.position.set(Math.sin(a) * banKinh, CAO_BAN / 2, -Math.cos(a) * banKinh + banKinh);
    than.rotation.y = -a;
    g.add(than);

    const mat = khoiSang(0.52, 0.1, 0.34, i % 2 === 0 ? MAU_CYAN : MAU_CAM, 1.1);
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

function gheTuDung(): THREE.Group {
  const g = new THREE.Group();
  const ngoi = hop(0.42, 0.06, 0.42, 0x202a34, 0.4, 0.5);
  ngoi.position.y = 0.5;
  g.add(ngoi);
  const cot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.08, 0.46, 10),
    new THREE.MeshStandardMaterial({ color: 0x2c3844, metalness: 0.7, roughness: 0.3 }),
  );
  cot.position.y = 0.26;
  g.add(cot);
  const vienSang = khoiSang(0.44, 0.015, 0.44, MAU_CYAN, 0.6);
  vienSang.position.y = 0.531;
  g.add(vienSang);
  return g;
}

function keModuleTuDung(): THREE.Group {
  const g = new THREE.Group();
  const than = hop(1.05, 1.7, 0.4, 0x141c24, 0.45, 0.5);
  than.position.y = 0.85;
  g.add(than);
  for (let tang = 0; tang < 3; tang++) {
    const ke = khoiSang(0.92, 0.015, 0.3, MAU_CYAN, 0.7);
    ke.position.set(0, 0.35 + tang * 0.5, 0.02);
    g.add(ke);
  }
  return g;
}

function cotKinhTuDung(cao = 2.8): THREE.Group {
  const g = new THREE.Group();
  // Vật liệu trong suốt đơn giản (KHÔNG `transmission`): `MeshPhysicalMaterial.transmission`
  // tốn thêm 1 lượt render nền mỗi khung hình cho mỗi vật — quá nặng cho mobile
  // (spec mục 5: FPS ≥30 trên 390×844). `MeshBasicMaterial` + alpha vẫn đủ đẹp
  // nhờ bloom bắt sáng viền cyan.
  const than = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.18, cao, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x9be8ff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  than.position.y = cao / 2;
  g.add(than);
  for (let i = 0; i < 3; i++) {
    const vong = new THREE.Mesh(
      new THREE.TorusGeometry(0.19, 0.015, 8, 24),
      new THREE.MeshStandardMaterial({ color: MAU_CYAN, emissive: MAU_CYAN, emissiveIntensity: 1.2 }),
    );
    vong.rotation.x = Math.PI / 2;
    vong.position.y = 0.3 + i * (cao - 0.6) * 0.5;
    g.add(vong);
  }
  return g;
}

function khungCuaTuDung(): THREE.Group {
  const g = new THREE.Group();
  const matKhung = new THREE.MeshStandardMaterial({ color: 0x16202a, metalness: 0.6, roughness: 0.35 });
  for (const [x, y, w, h] of [
    [-0.95, 1.2, 0.14, 2.4],
    [0.95, 1.2, 0.14, 2.4],
    [0, 2.38, 2.0, 0.14],
  ] as const) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), matKhung);
    k.position.set(x, y, 0);
    g.add(k);
  }
  const den = khoiSang(1.85, 0.05, 0.03, MAU_CAM, 1.3);
  den.position.set(0, 0.04, 0.09);
  g.add(den);
  return g;
}

/* ------------------------------------------------------------------ Kenney */

type KhoSciFi = {
  co: boolean;
  tyLe: number;
  lay(ten: string, scaleThem?: number): THREE.Object3D | null;
};

const TEN_KENNEY_LAB = [
  'desk_computerCorner',
  'desk_computer',
  'desk_computerScreen',
  'desk_chairStool',
  'desk_chair',
  'platform_center',
  'platform_large',
  'platform_small',
  'structure_closed',
  'structure',
  'pipe_supportHigh',
  'pipe_ringHigh',
  'rock_crystals',
  'rock_crystalsLargeA',
  'gate_simple',
  'machine_generator',
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

  const banMau = kho.get('desk_computerCorner') ?? kho.get('desk_computer');
  if (!banMau) return { co: false, tyLe: 1, lay: () => null };

  const bb = new THREE.Box3().setFromObject(banMau);
  const caoGoc = bb.max.y - bb.min.y;
  const tyLe = caoGoc > 0.001 ? CAO_BAN / caoGoc : 1;

  // Kenney Space Kit gốc là xám-kem phẳng lì, không ăn neon lab — nhuộm lại
  // về palette lab (xám-xanh đậm) + viền emissive cyan mảnh quanh mép khối
  // (phản hồi review thẩm mỹ: "khối Kenney chắn khung hình, trông như xốp").
  // Vật liệu/đường viền dùng CHUNG một instance cho mọi mesh để không nhân
  // bản n lần (n = số lần `lay()` được gọi) — mutate tại chỗ là đủ, vì mọi
  // bản đều cần tông màu giống nhau.
  const matVienKenney = new THREE.LineBasicMaterial({
    color: MAU_CYAN,
    transparent: true,
    opacity: 0.55,
    toneMapped: false,
  });

  return {
    co: true,
    tyLe,
    lay(ten: string, scaleThem = 1) {
      const goc = kho.get(ten);
      if (!goc) return null;
      const loi = goc.clone(true);
      loi.scale.setScalar(tyLe * scaleThem);
      const b = new THREE.Box3().setFromObject(loi);
      loi.position.x -= (b.min.x + b.max.x) / 2;
      loi.position.z -= (b.min.z + b.max.z) / 2;
      loi.position.y -= b.min.y;
      const boc = new THREE.Group();
      boc.add(loi);
      boc.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          // KHÔNG castShadow cho nội thất Kenney (spec mục 5 — hiệu năng):
          // 16 model × shadow pass thứ hai là phí; sàn/tường vẫn receiveShadow
          // nên bóng đổ của NHÂN VẬT (quan trọng nhất) lên sàn vẫn rõ.
          m.castShadow = false;
          m.receiveShadow = true;
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
            const mh = mat as THREE.MeshStandardMaterial;
            if (!mh) continue;
            mh.color?.setHex(0x2a3340);
            if ('metalness' in mh) mh.metalness = 0.25;
            if ('roughness' in mh) mh.roughness = 0.6;
            if ('emissiveIntensity' in mh) mh.emissiveIntensity = 0;
          }
          if (m.geometry) {
            const vien = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), matVienKenney);
            m.add(vien);
          }
        }
      });
      return boc;
    },
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

  /* --- sàn tối vân sáng --- */
  const san = new THREE.Mesh(
    new THREE.PlaneGeometry(KICH_THUOC_PHONG, KICH_THUOC_PHONG),
    new THREE.MeshStandardMaterial({ map: textureSanLab(), roughness: 0.45, metalness: 0.3 }),
  );
  san.rotation.x = -Math.PI / 2;
  san.receiveShadow = true;
  nhom.add(san);

  /* --- 3 tường kim loại tối --- */
  const matTuong = new THREE.MeshStandardMaterial({
    map: textureTuongLab(),
    color: 0x2a3340,
    roughness: 0.6,
    metalness: 0.3,
  });

  const sau = new THREE.Mesh(new THREE.PlaneGeometry(KICH_THUOC_PHONG, CAO_TUONG), matTuong);
  sau.position.set(0, CAO_TUONG / 2, -nua);
  sau.receiveShadow = true;
  nhom.add(sau);

  const trai = new THREE.Mesh(new THREE.PlaneGeometry(KICH_THUOC_PHONG, CAO_TUONG), matTuong);
  trai.position.set(-nua, CAO_TUONG / 2, 0);
  trai.rotation.y = Math.PI / 2;
  trai.receiveShadow = true;
  nhom.add(trai);

  const phai = new THREE.Mesh(new THREE.PlaneGeometry(KICH_THUOC_PHONG, CAO_TUONG), matTuong);
  phai.position.set(nua, CAO_TUONG / 2, 0);
  phai.rotation.y = -Math.PI / 2;
  phai.receiveShadow = true;
  nhom.add(phai);

  /* --- trần đèn dải --- */
  const tran = new THREE.Mesh(
    new THREE.PlaneGeometry(KICH_THUOC_PHONG, KICH_THUOC_PHONG),
    new THREE.MeshStandardMaterial({ color: 0x0c1218, roughness: 0.7, metalness: 0.4 }),
  );
  tran.rotation.x = Math.PI / 2;
  tran.position.y = CAO_TUONG;
  nhom.add(tran);

  // 5 dải sáng (geometry emissive, bloom lo phần toả sáng) nhưng chỉ 1 PointLight
  // thật cho cả trần — hiệu năng (spec mục 5): mỗi light động cộng dồn chi phí
  // mỗi fragment, 5 light riêng cho 5 dải là phí trên thiết bị yếu.
  for (let i = -2; i <= 2; i++) {
    const strip = khoiSang(0.22, 0.05, 5.6, i % 2 === 0 ? MAU_CYAN : 0xeaf6ff, 0.85);
    strip.position.set(i * 1.2, CAO_TUONG - 0.04, 0);
    nhom.add(strip);
  }
  {
    const den = new THREE.PointLight(MAU_CYAN, 2.2, 7.5, 2);
    den.position.set(0, CAO_TUONG - 0.3, 0);
    nhom.add(den);
  }

  /* --- 3 viewport "cửa sổ" nhìn ra không gian --- */
  const texKhongGian = textureKhongGian();
  // đặt cao gần trần, phía trên 3 màn hình hologram (y ~1.6–1.8) để không
  // chồng hình khi nhìn từ góc máy "ban-dieu-khien"
  const viTriCuaSo: Array<[THREE.Vector3, number]> = [
    [new THREE.Vector3(-2.7, 2.75, -nua + 0.03), 0],
    [new THREE.Vector3(2.7, 2.75, -nua + 0.03), 0],
    [new THREE.Vector3(nua - 0.03, 2.75, 1.6), -Math.PI / 2],
  ];
  for (const [vt, ry] of viTriCuaSo) {
    const cuaSo = new THREE.Group();
    const kinh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.3),
      new THREE.MeshBasicMaterial({ map: texKhongGian, toneMapped: false }),
    );
    cuaSo.add(kinh);
    const khung = new THREE.Mesh(
      new THREE.RingGeometry(0.66, 0.74, 32),
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

  // bàn điều khiển cong — ban-dieu-khien (0,0,-2.6), quay mặt +Z (facing 180 của actor)
  const banChinh = kho.co ? kho.lay('desk_computerCorner', 1.0) ?? kho.lay('desk_computer', 1.0) : null;
  const banChinhG = banChinh ?? banDieuKhienTuDung();
  banChinhG.position.set(0, 0, -2.6);
  banChinhG.rotation.y = Math.PI;
  nhom.add(banChinhG);

  // 2 console phụ — ban-1 / ban-2
  for (const [x, z, ry] of [
    [-1.85, -1.75, 0.12],
    [1.85, -1.75, -0.12],
  ] as const) {
    const consolePhu = kho.co ? kho.lay('desk_computer', 0.95) : null;
    const g = consolePhu ?? banDieuKhienTuDung();
    if (!consolePhu) g.scale.setScalar(0.7);
    g.position.set(x, 0, z);
    g.rotation.y = Math.PI + ry;
    nhom.add(g);
  }

  // ghế — ghe-1 / ghe-2 (vòng 4: đo cao độ mặt ghế THẬT trên chính hình học
  // vừa dựng rồi ghi vào noi-dung.ts qua datSeatY() — actor.sit đặt hips theo
  // đúng số này, không còn đoán bằng hằng số × tỉ lệ chân, review PR #10 mục
  // 2.1). `desk_chairStool` không có lưng ghế nên bbox.max.y ≈ đúng mặt ghế;
  // kẹp trần 0,55 m cho trường hợp rơi về `desk_chair` có lưng cao hơn mặt
  // ngồi, để không đặt hips cao quá đầu ghế.
  for (const [id, x, z] of [
    ['ghe-1', -1.85, -0.97],
    ['ghe-2', 1.85, -0.97],
  ] as const) {
    const ghe = kho.co ? kho.lay('desk_chairStool', 1.2) ?? kho.lay('desk_chair', 1.2) : null;
    const g = ghe ?? gheTuDung();
    g.position.set(x, 0, z);
    g.rotation.y = Math.PI;
    nhom.add(g);
    g.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(g);
    const matGheDo = bb.max.y - bb.min.y > 0.01 ? Math.min(bb.max.y, 0.55) : 0;
    if (matGheDo > 0) datSeatY(id, matGheDo);
  }

  // bục trung tâm phát sáng — buc-trung-tam (0,0,0.35)
  const buc = kho.co ? kho.lay('platform_center', 1.0) ?? kho.lay('platform_small', 1.0) ?? kho.lay('platform_large', 0.5) : null;
  const bucG = buc ?? dungBucTuDung();
  bucG.position.set(0, 0, 0.35);
  nhom.add(bucG);
  const vongBuc = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.15, 48),
    new THREE.MeshStandardMaterial({
      color: MAU_CYAN,
      emissive: MAU_CYAN,
      emissiveIntensity: 0.9,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    }),
  );
  vongBuc.rotation.x = -Math.PI / 2;
  vongBuc.position.set(0, 0.02, 0.35);
  vongBuc.name = 'vongBuc';
  nhom.add(vongBuc);
  const denBuc = new THREE.PointLight(MAU_CYAN, 3.2, 5.5, 2);
  denBuc.position.set(0, 1.4, 0.35);
  nhom.add(denBuc);

  // kệ module — ke-module (-3.15,0,-0.9)
  const ke = kho.co ? kho.lay('structure_closed', 0.55) ?? kho.lay('structure', 0.55) : null;
  const keG = ke ?? keModuleTuDung();
  keG.position.set(-nua + 0.55, 0, -0.9);
  keG.rotation.y = Math.PI / 2;
  nhom.add(keG);
  // tinh thể trang trí trên kệ — gợi "module" lưu trữ
  for (let i = 0; i < 3; i++) {
    const vien = kho.co ? kho.lay('rock_crystals', 0.12) : null;
    const g = vien ?? khoiSang(0.14, 0.2, 0.14, i % 2 === 0 ? MAU_CYAN : MAU_CAM, 1.0);
    g.position.set(-nua + 0.55, 0.42 + i * 0.5, -1.15 + i * 0.22);
    nhom.add(g);
  }

  // cột kính phát sáng ở 2 góc gần bục trung tâm
  for (const [x, z] of [
    [-2.6, 1.9],
    [2.6, 1.9],
  ] as const) {
    const cot = kho.co ? kho.lay('pipe_supportHigh', 1.0) : null;
    const g = cot ?? cotKinhTuDung();
    g.position.set(x, 0, z);
    nhom.add(g);
    const vong = kho.co ? kho.lay('pipe_ringHigh', 1.0) : null;
    if (vong) {
      vong.position.set(x, 0, z);
      nhom.add(vong);
    }
  }

  // khung cửa — cua (0,0,3.3)
  const cuaKhung = kho.co ? kho.lay('gate_simple', 0.65) : null;
  const cuaG = cuaKhung ?? khungCuaTuDung();
  cuaG.position.set(0, 0, 3.4);
  cuaG.rotation.y = Math.PI;
  nhom.add(cuaG);
  const denCua = khoiSang(1.7, 0.04, 0.04, MAU_CAM, 1.0);
  denCua.position.set(0, 0.03, 3.1);
  nhom.add(denCua);

  return { nhom, dungKenney: kho.co };
}

function dungBucTuDung(): THREE.Group {
  const g = new THREE.Group();
  const than = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.35, 0.14, 48),
    new THREE.MeshStandardMaterial({ color: 0x141c24, roughness: 0.4, metalness: 0.55 }),
  );
  than.position.y = 0.07;
  than.receiveShadow = true;
  g.add(than);
  const mep = new THREE.Mesh(
    new THREE.TorusGeometry(1.2, 0.025, 10, 60),
    new THREE.MeshStandardMaterial({ color: MAU_CYAN, emissive: MAU_CYAN, emissiveIntensity: 1.3 }),
  );
  mep.rotation.x = Math.PI / 2;
  mep.position.y = 0.14;
  g.add(mep);
  return g;
}

/** Khí mù nhẹ quanh bục — fog cục bộ dạng hạt, gọi một lần lúc dựng cảnh. */
export function haiSuongBuc(scene: THREE.Scene): void {
  const soHat = 90;
  const pos = new Float32Array(soHat * 3);
  for (let i = 0; i < soHat; i++) {
    const r = Math.random() * 1.3;
    const a = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 0.5;
    pos[i * 3 + 2] = Math.sin(a) * r + 0.35;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xbfeeff,
    size: 0.08,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
  });
  const diem = new THREE.Points(geo, mat);
  diem.name = 'suongBuc';
  scene.add(diem);
}
