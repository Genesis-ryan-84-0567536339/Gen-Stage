/**
 * phong.ts — dựng cảnh văn phòng nhỏ: sàn gỗ sáng, 3 tường pastel,
 * 2 bàn có màn hình, ghế, cây cảnh, cửa sổ phát sáng.
 * Nội thất ưu tiên Kenney Furniture Kit (CC0) trong `public/kenney/`;
 * nếu chưa tải được thì tự dựng bằng RoundedBoxGeometry màu pastel.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const BAN_1 = new THREE.Vector3(-1.85, 0, -1.75);
export const BAN_2 = new THREE.Vector3(1.85, 0, -1.75);
/** Chỗ nhân vật đứng cạnh mỗi bàn. */
export const CHO_DUNG_1 = new THREE.Vector3(-1.85, 0, -0.75);
export const CHO_DUNG_2 = new THREE.Vector3(1.85, 0, -0.75);

const KICH_THUOC_PHONG = 7.2; // phòng vuông 7.2 x 7.2 m
const CAO_TUONG = 5.2;
const CAO_BAN = 0.74;

/* ------------------------------------------------------------------ texture */

/** Sàn gỗ sáng: vẽ bằng canvas, không cần asset ngoài. */
function textureGoSang(): THREE.Texture {
  const w = 512;
  const h = 512;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#e8d2ae';
  g.fillRect(0, 0, w, h);

  const soTam = 8;
  const caoTam = h / soTam;
  for (let i = 0; i < soTam; i++) {
    const sang = 0.93 + Math.random() * 0.12;
    const r = Math.min(255, Math.round(232 * sang));
    const gg = Math.min(255, Math.round(210 * sang));
    const b = Math.min(255, Math.round(174 * sang));
    g.fillStyle = `rgb(${r},${gg},${b})`;
    g.fillRect(0, i * caoTam, w, caoTam - 1);

    // vân gỗ mảnh
    g.strokeStyle = 'rgba(160,122,80,0.16)';
    g.lineWidth = 1;
    for (let k = 0; k < 10; k++) {
      const y = i * caoTam + Math.random() * caoTam;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.33, y + 2, w * 0.66, y - 2, w, y);
      g.stroke();
    }
    // mạch ghép ván
    g.fillStyle = 'rgba(120,88,54,0.22)';
    g.fillRect(0, i * caoTam, w, 1.5);
    const cat = Math.random() * w;
    g.fillRect(cat, i * caoTam, 1.5, caoTam);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* -------------------------------------------------------------- nội thất tự dựng */

function hop(
  w: number,
  h: number,
  d: number,
  mau: number,
  nhamBong = 0.55,
): THREE.Mesh {
  const geo = new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.14);
  const mat = new THREE.MeshStandardMaterial({
    color: mau,
    roughness: nhamBong,
    metalness: 0.02,
  });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Bàn + màn hình + ghế dựng thủ công bằng RoundedBoxGeometry (fallback). */
function banTuDung(mauBan: number, mauGhe: number): THREE.Group {
  const g = new THREE.Group();

  const matBan = hop(1.5, 0.06, 0.78, mauBan, 0.48);
  matBan.position.y = CAO_BAN;
  g.add(matBan);

  for (const [x, z] of [
    [-0.66, -0.3],
    [0.66, -0.3],
    [-0.66, 0.3],
    [0.66, 0.3],
  ]) {
    const chan = hop(0.07, CAO_BAN, 0.07, 0xd9c3a2, 0.6);
    chan.position.set(x, CAO_BAN / 2, z);
    g.add(chan);
  }

  // màn hình
  const de = hop(0.26, 0.03, 0.18, 0x6e6a66, 0.5);
  de.position.set(0, CAO_BAN + 0.045, -0.2);
  g.add(de);
  const tru = hop(0.05, 0.18, 0.05, 0x6e6a66, 0.5);
  tru.position.set(0, CAO_BAN + 0.14, -0.2);
  g.add(tru);
  const khung = hop(0.62, 0.38, 0.03, 0x50504e, 0.45);
  khung.position.set(0, CAO_BAN + 0.42, -0.2);
  g.add(khung);
  const sang = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.32),
    new THREE.MeshStandardMaterial({
      color: 0xbfe4ff,
      emissive: 0x8fd0ff,
      emissiveIntensity: 0.8,
      roughness: 0.9,
    }),
  );
  sang.position.set(0, CAO_BAN + 0.42, -0.182);
  g.add(sang);

  // bàn phím
  const bp = hop(0.42, 0.02, 0.15, 0xf2ece2, 0.65);
  bp.position.set(0, CAO_BAN + 0.04, 0.12);
  g.add(bp);

  // ghế
  const ghe = new THREE.Group();
  const ngoi = hop(0.46, 0.07, 0.46, mauGhe, 0.7);
  ngoi.position.y = 0.44;
  ghe.add(ngoi);
  const tua = hop(0.46, 0.5, 0.07, mauGhe, 0.7);
  tua.position.set(0, 0.72, 0.22);
  ghe.add(tua);
  const cot = hop(0.07, 0.4, 0.07, 0x8a8683, 0.5);
  cot.position.y = 0.22;
  ghe.add(cot);
  const chanGhe = hop(0.42, 0.05, 0.42, 0x8a8683, 0.5);
  chanGhe.position.y = 0.03;
  ghe.add(chanGhe);
  ghe.position.set(0, 0, 0.72);
  ghe.rotation.y = Math.PI;
  g.add(ghe);

  return g;
}

function cayTuDung(): THREE.Group {
  const g = new THREE.Group();
  const chau = hop(0.3, 0.3, 0.3, 0xe6a98a, 0.75);
  chau.position.y = 0.15;
  g.add(chau);
  for (let i = 0; i < 7; i++) {
    const la = new THREE.Mesh(
      new THREE.SphereGeometry(0.17 + Math.random() * 0.1, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0x8fc98a, roughness: 0.85 }),
    );
    la.castShadow = true;
    la.position.set(
      (Math.random() - 0.5) * 0.28,
      0.4 + Math.random() * 0.42,
      (Math.random() - 0.5) * 0.28,
    );
    g.add(la);
  }
  return g;
}

/* ------------------------------------------------------------------ Kenney */

type KhoKenney = {
  co: boolean;
  tyLe: number;
  lay(ten: string): THREE.Object3D | null;
};

const TEN_KENNEY = [
  'desk',
  'chairDesk',
  'computerScreen',
  'computerKeyboard',
  'computerMouse',
  'pottedPlant',
  'plantSmall2',
  'plantSmall3',
  'bookcaseOpen',
  'rugRounded',
  'lampRoundFloor',
  'cabinetTelevisionDrawer',
] as const;

async function napKenney(loader: GLTFLoader): Promise<KhoKenney> {
  const kho = new Map<string, THREE.Object3D>();

  const ketQua = await Promise.all(
    TEN_KENNEY.map(async (ten) => {
      try {
        const gltf = await loader.loadAsync(`kenney/${ten}.glb`);
        return [ten, gltf.scene] as const;
      } catch {
        return [ten, null] as const;
      }
    }),
  );
  for (const [ten, obj] of ketQua) if (obj) kho.set(ten, obj);

  const ban = kho.get('desk');
  if (!ban) return { co: false, tyLe: 1, lay: () => null };

  // Chuẩn hoá: cho chiều cao mặt bàn Kenney đúng bằng CAO_BAN (0.74 m),
  // rồi dùng CÙNG tỷ lệ cho mọi model khác để giữ đúng tương quan.
  const hopBao = new THREE.Box3().setFromObject(ban);
  const caoGoc = hopBao.max.y - hopBao.min.y;
  const tyLe = caoGoc > 0.001 ? CAO_BAN / caoGoc : 1;

  return {
    co: true,
    tyLe,
    lay(ten: string) {
      const goc = kho.get(ten);
      if (!goc) return null;
      // Model Kenney đặt gốc ở GÓC chứ không ở tâm → bọc 1 lớp để căn giữa
      // theo X/Z và đặt đáy đúng mặt sàn.
      const loi = goc.clone(true);
      loi.scale.setScalar(tyLe);
      const bb = new THREE.Box3().setFromObject(loi);
      loi.position.x -= (bb.min.x + bb.max.x) / 2;
      loi.position.z -= (bb.min.z + bb.max.z) / 2;
      loi.position.y -= bb.min.y;
      const ban2 = new THREE.Group();
      ban2.add(loi);
      ban2.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      return ban2;
    },
  };
}

/** Bàn làm việc dùng model Kenney. */
function banKenney(kho: KhoKenney, mauGhe: number): THREE.Group {
  const g = new THREE.Group();

  const ban = kho.lay('desk');
  if (ban) g.add(ban);

  const mh = kho.lay('computerScreen');
  if (mh) {
    mh.position.set(0, CAO_BAN, -0.18);
    mh.rotation.y = Math.PI;
    g.add(mh);
    // thêm tấm phát sáng mô phỏng màn hình đang bật
    const bb = new THREE.Box3().setFromObject(mh);
    const sang = new THREE.Mesh(
      new THREE.PlaneGeometry((bb.max.x - bb.min.x) * 0.78, (bb.max.y - bb.min.y) * 0.5),
      new THREE.MeshStandardMaterial({
        color: 0xcfeaff,
        emissive: 0x7cc8ff,
        emissiveIntensity: 0.9,
        roughness: 0.9,
      }),
    );
    sang.position.set(0, CAO_BAN + (bb.max.y - bb.min.y) * 0.66, -0.12);
    g.add(sang);
  }

  const bp = kho.lay('computerKeyboard');
  if (bp) {
    bp.position.set(-0.04, CAO_BAN, 0.14);
    bp.rotation.y = Math.PI;
    g.add(bp);
  }
  const chuot = kho.lay('computerMouse');
  if (chuot) {
    chuot.position.set(0.32, CAO_BAN, 0.14);
    chuot.rotation.y = Math.PI;
    g.add(chuot);
  }

  const ghe = kho.lay('chairDesk');
  if (ghe) {
    ghe.position.set(0, 0, 0.78);
    ghe.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material) {
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        if (mat.color && mat.color.getHSL({ h: 0, s: 0, l: 0 }).s < 0.18) {
          mat.color.setHex(mauGhe);
        }
        m.material = mat;
      }
    });
    g.add(ghe);
  }

  return g;
}

/* ------------------------------------------------------------------- cảnh */

export type Phong = {
  nhom: THREE.Group;
  dungKenney: boolean;
};

export async function dungPhong(scene: THREE.Scene): Promise<Phong> {
  const nhom = new THREE.Group();
  nhom.name = 'VanPhong';
  scene.add(nhom);

  const nua = KICH_THUOC_PHONG / 2;

  /* --- sàn --- */
  const san = new THREE.Mesh(
    new THREE.PlaneGeometry(KICH_THUOC_PHONG, KICH_THUOC_PHONG),
    new THREE.MeshStandardMaterial({
      map: textureGoSang(),
      roughness: 0.62,
      metalness: 0.0,
    }),
  );
  san.rotation.x = -Math.PI / 2;
  san.receiveShadow = true;
  nhom.add(san);

  // len chân tường
  const matLen = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.8 });
  for (const [x, z, ry] of [
    [0, -nua + 0.03, 0],
    [-nua + 0.03, 0, Math.PI / 2],
    [nua - 0.03, 0, Math.PI / 2],
  ] as const) {
    const len = new THREE.Mesh(new THREE.BoxGeometry(KICH_THUOC_PHONG, 0.1, 0.06), matLen);
    len.position.set(x, 0.05, z);
    len.rotation.y = ry;
    len.receiveShadow = true;
    nhom.add(len);
  }

  /* --- 3 tường pastel --- */
  const tuong = (mau: number) =>
    new THREE.MeshStandardMaterial({ color: mau, roughness: 0.95, side: THREE.FrontSide });

  const sau = new THREE.Mesh(
    new THREE.PlaneGeometry(KICH_THUOC_PHONG, CAO_TUONG),
    tuong(0xd9e9e4), // xanh bạc hà nhạt
  );
  sau.position.set(0, CAO_TUONG / 2, -nua);
  sau.receiveShadow = true;
  nhom.add(sau);

  const trai = new THREE.Mesh(
    new THREE.PlaneGeometry(KICH_THUOC_PHONG, CAO_TUONG),
    tuong(0xf6e2e7), // hồng phấn
  );
  trai.position.set(-nua, CAO_TUONG / 2, 0);
  trai.rotation.y = Math.PI / 2;
  trai.receiveShadow = true;
  nhom.add(trai);

  const phai = new THREE.Mesh(
    new THREE.PlaneGeometry(KICH_THUOC_PHONG, CAO_TUONG),
    tuong(0xf3ecda), // vàng kem
  );
  phai.position.set(nua, CAO_TUONG / 2, 0);
  phai.rotation.y = -Math.PI / 2;
  phai.receiveShadow = true;
  nhom.add(phai);

  /* --- 3 cửa sổ phát sáng: 2 trên tường sau, 1 trên tường phải --- */
  const viTriCuaSo: Array<[THREE.Vector3, number]> = [
    [new THREE.Vector3(-1.85, 2.05, -nua + 0.04), 0],
    [new THREE.Vector3(1.85, 2.05, -nua + 0.04), 0],
    [new THREE.Vector3(nua - 0.04, 1.7, 0.9), -Math.PI / 2],
  ];
  for (const [vt, ry] of viTriCuaSo) {
    const cua = new THREE.Group();
    const kinh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xfff2d2,
        emissiveIntensity: 1.5,
        roughness: 1,
      }),
    );
    cua.add(kinh);
    const matKhung = new THREE.MeshStandardMaterial({ color: 0xfffdf7, roughness: 0.7 });
    for (const [kx, ky, kw, kh] of [
      [0, 0.78, 1.66, 0.09],
      [0, -0.78, 1.66, 0.09],
      [-0.78, 0, 0.09, 1.66],
      [0.78, 0, 0.09, 1.66],
      [0, 0, 1.5, 0.05],
      [0, 0, 0.05, 1.5],
    ] as const) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(kw, kh, 0.06), matKhung);
      k.position.set(kx, ky, 0.02);
      cua.add(k);
    }
    cua.position.copy(vt);
    cua.rotation.y = ry;
    nhom.add(cua);

    // ánh nắng hắt vào từ cửa sổ
    const nang = new THREE.PointLight(0xffe6b8, 2.6, 6.0, 2);
    nang.position.copy(vt);
    nang.position.x += ry === 0 ? 0 : -0.7;
    nang.position.z += ry === 0 ? 0.7 : 0;
    nhom.add(nang);
  }

  /* --- nội thất --- */
  const loader = new GLTFLoader();
  const kho = await napKenney(loader);

  const ban1 = kho.co ? banKenney(kho, 0xa8c8e8) : banTuDung(0xf0dcc0, 0xa8c8e8);
  ban1.position.copy(BAN_1);
  ban1.rotation.y = 0.12;
  nhom.add(ban1);

  const ban2 = kho.co ? banKenney(kho, 0xe8b0b8) : banTuDung(0xf0dcc0, 0xe8b0b8);
  ban2.position.copy(BAN_2);
  ban2.rotation.y = -0.12;
  nhom.add(ban2);

  // cây cảnh
  const viTriCay: Array<[string, THREE.Vector3]> = [
    ['pottedPlant', new THREE.Vector3(-nua + 0.6, 0, -nua + 0.6)],
    ['plantSmall2', new THREE.Vector3(nua - 0.6, 0, -0.6)],
    ['plantSmall3', new THREE.Vector3(0.0, 0, -2.9)],
  ];
  for (const [ten, vt] of viTriCay) {
    const cay = kho.co ? kho.lay(ten) : null;
    const obj = cay ?? cayTuDung();
    obj.position.add(vt);
    obj.rotation.y = Math.random() * Math.PI * 2;
    nhom.add(obj);
  }

  // kệ sách + thảm + đèn sàn + sofa cho cảnh đầy đặn
  const ke = kho.co ? kho.lay('bookcaseOpen') : hop(1.0, 1.6, 0.35, 0xe3d2bb);
  if (ke) {
    ke.position.set(-nua + 0.45, 0, -0.9);
    ke.rotation.y = Math.PI / 2;
    nhom.add(ke);
  }

  const tham = kho.co ? kho.lay('rugRounded') : null;
  if (tham) {
    tham.position.set(0, 0.005, 0.35);
    nhom.add(tham);
  } else {
    const t = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 48),
      new THREE.MeshStandardMaterial({ color: 0xf0d7c4, roughness: 0.95 }),
    );
    t.rotation.x = -Math.PI / 2;
    t.position.set(0, 0.006, 0.35);
    t.receiveShadow = true;
    nhom.add(t);
  }
  const den = kho.co ? kho.lay('lampRoundFloor') : null;
  if (den) {
    den.position.set(nua - 0.55, 0, 2.55);
    nhom.add(den);
    const bongDen = new THREE.PointLight(0xffd9a0, 2.2, 4.5, 2);
    bongDen.position.set(nua - 0.55, 1.5, 2.55);
    nhom.add(bongDen);
  }

  return { nhom, dungKenney: kho.co };
}
