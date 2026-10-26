/**
 * phong.ts — dựng CĂN NHÀ ẤM (D1, Issue #43, thay lab viễn tưởng A3).
 *
 * Boss 26/10: "nhân vật phát sáng chói mắt, nội thất lộn xộn — đổi qua phong
 * cách này, làm không gian thành căn nhà đầy đủ nội thất vật dụng" (ảnh tham
 * chiếu: chibi stylized, ánh sáng tự nhiên ấm, không neon, vật liệu gỗ/vải).
 *
 * Nhà 1 tầng 14 × 10 m (`bo-cuc.ts`): phòng khách / góc làm việc / bếp + hành
 * lang trung tâm nối cửa ↔ cửa sổ lớn tường nam. Nội thất Kenney **Furniture
 * Kit** (CC0, `public/kenney/`) chuẩn hoá theo mét (kẹp cả hai chiều — bài học
 * 25/10 vẫn đúng: một hệ số scale chung làm đồ phình to); không tải được thì
 * tự dựng fallback geometry gỗ/vải, KHÔNG emissive (khác bản lab cũ).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { datSeatY } from './noi-dung';
import { batSang } from './bloom-layer';
import { CUA_SO, KHOI_CANH, ROOM_D, ROOM_W, type KhoiCanh } from './bo-cuc';

/** Bề ngang / bề sâu nhà (m) — phải khớp `bo-cuc.ts`. */
export const KICH_THUOC_PHONG = ROOM_W;
export const KICH_THUOC_SAU = ROOM_D;
/** Trần cao 2,8 m — nhà ở bình thường, không phải lab cao 5,6 m. */
export const CAO_TUONG = 2.8;

/** Giữ hai tên hằng cũ (world.ts `scene.light` + `module.build` vẫn dùng):
 *  giờ là màu ẤM — vàng nắng nhạt / vàng đồng — không còn neon cam/cyan. */
export const MAU_CAM = 0xf2b26b;
export const MAU_CYAN = 0xf6d9a0;
/** Ánh sáng điểm ấm (đèn sàn) — cam rất nhạt, không cháy da nhân vật. */
export const MAU_DEN_AM = 0xffd9a8;

/* ------------------------------------------------------------------ texture */

/** Sàn gỗ vân nâu ấm — procedural, không cần tải ảnh. */
function textureSanGo(): THREE.Texture {
  const w = 512;
  const h = 512;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#b9895a';
  g.fillRect(0, 0, w, h);

  // ván gỗ: dải ngang, mỗi dải một tông nâu hơi khác + vân dọc mảnh
  const vanBan = 8;
  const caoBan = h / vanBan;
  for (let i = 0; i < vanBan; i++) {
    const lech = (Math.random() - 0.5) * 18;
    g.fillStyle = `rgb(${181 + lech}, ${137 + lech * 0.7}, ${90 + lech * 0.4})`;
    g.fillRect(0, i * caoBan, w, caoBan);
    // đường mạch giữa hai ván
    g.strokeStyle = 'rgba(80,52,28,0.35)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, i * caoBan);
    g.lineTo(w, i * caoBan);
    g.stroke();
    // vài vân gỗ dọc mảnh trong mỗi ván
    for (let k = 0; k < 3; k++) {
      const x = Math.random() * w;
      g.strokeStyle = `rgba(90,58,30,${0.12 + Math.random() * 0.1})`;
      g.lineWidth = 1 + Math.random();
      g.beginPath();
      g.moveTo(x, i * caoBan + 2);
      let xx = x;
      for (let y = i * caoBan + 2; y < (i + 1) * caoBan - 2; y += 10) {
        xx += (Math.random() - 0.5) * 4;
        g.lineTo(xx, y);
      }
      g.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(ROOM_W / 2.6, ROOM_D / 2.6);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Tường sơn kem ấm — gần như phẳng, một chút vân sơn mờ cho khỏi "nhựa". */
function textureTuongKem(): THREE.Texture {
  const w = 256;
  const h = 256;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#efe3cf';
  g.fillRect(0, 0, w, h);
  // noise rất nhẹ cho khỏi phẳng lì
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    g.fillStyle = `rgba(120,100,70,${Math.random() * 0.03})`;
    g.fillRect(x, y, 2, 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(ROOM_W / 4, CAO_TUONG / 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Bầu trời chiều ấm + vài hình cây mờ — cảnh nhìn ra ngoài cửa sổ. */
function textureTroiChieu(): THREE.Texture {
  const w = 512;
  const h = 384;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#ffd9a0');
  grad.addColorStop(0.45, '#ffb37a');
  grad.addColorStop(1, '#ffe4b8');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // vài cây mờ phía xa (bokeh nhẹ — hình tròn mềm chồng lớp)
  for (let i = 0; i < 10; i++) {
    const x = (i / 10) * w + (Math.random() - 0.5) * 40;
    const y = h * 0.62 + Math.random() * 30;
    const r = 34 + Math.random() * 30;
    const gr = g.createRadialGradient(x, y, 2, x, y, r);
    gr.addColorStop(0, 'rgba(70,90,55,0.55)');
    gr.addColorStop(1, 'rgba(70,90,55,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // vài đốm sáng bokeh nhỏ (nắng xuyên lá)
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * w;
    const y = h * 0.55 + Math.random() * h * 0.3;
    const r = 3 + Math.random() * 6;
    g.fillStyle = `rgba(255,236,190,${0.2 + Math.random() * 0.25})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* -------------------------------------------------------------- nội thất tự dựng */

function hop(w: number, h: number, d: number, mau: number, nham = 0.75, kim = 0.05): THREE.Mesh {
  const geo = new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.08);
  const mat = new THREE.MeshStandardMaterial({ color: mau, roughness: nham, metalness: kim });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Ghế đẩu gỗ dự phòng — mặt ghế 0,46 m cho khớp `seatY`. */
function gheTuDung(): THREE.Group {
  const g = new THREE.Group();
  const ngoi = hop(0.42, 0.06, 0.42, 0x8a5a36, 0.8, 0.02);
  ngoi.position.y = 0.43;
  g.add(ngoi);
  const matChan = new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 0.85 });
  for (const [dx, dz] of [
    [0.16, 0.16],
    [-0.16, 0.16],
    [0.16, -0.16],
    [-0.16, -0.16],
  ] as const) {
    const chan = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.43, 8), matChan);
    chan.position.set(dx, 0.215, dz);
    chan.castShadow = true;
    g.add(chan);
  }
  return g;
}

/** Sofa vải dự phòng — khối đệm + 2 tay vịn. */
function sofaTuDung(): THREE.Group {
  const g = new THREE.Group();
  const than = hop(1.9, 0.42, 0.85, 0x7a6a8c, 0.9, 0);
  than.position.y = 0.21;
  g.add(than);
  const dem = hop(1.7, 0.3, 0.7, 0x8a7a9c, 0.92, 0);
  dem.position.set(0, 0.5, -0.02);
  g.add(dem);
  for (const dx of [-0.88, 0.88]) {
    const tay = hop(0.14, 0.55, 0.85, 0x6a5a7c, 0.9, 0);
    tay.position.set(dx, 0.3, 0);
    g.add(tay);
  }
  return g;
}

function tuTuDung(cao: number, rong: number, mau = 0x8a6a44): THREE.Group {
  const g = new THREE.Group();
  const than = hop(rong, cao, 0.42, mau, 0.78, 0.04);
  than.position.y = cao / 2;
  g.add(than);
  return g;
}

function cayTuDung(cao = 1.1): THREE.Group {
  const g = new THREE.Group();
  const chau = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.13, 0.22, 10),
    new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.85 }),
  );
  chau.position.y = 0.11;
  chau.castShadow = true;
  g.add(chau);
  const la = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, cao - 0.22, 7),
    new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.85 }),
  );
  la.position.y = 0.22 + (cao - 0.22) / 2;
  la.castShadow = true;
  g.add(la);
  return g;
}

function denSanTuDung(): THREE.Group {
  const g = new THREE.Group();
  const cot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.025, 1.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.6, metalness: 0.3 }),
  );
  cot.position.y = 0.65;
  g.add(cot);
  const chup = khoiSangNhe(0.26, 0.3, 0.26, MAU_DEN_AM, 0.5);
  chup.position.y = 1.4;
  // D1: NGUỒN BLOOM "rất nhẹ" duy nhất được phép — đèn bàn/sàn ấm.
  g.add(batSang(chup));
  return g;
}

/** Khối phát sáng NHẸ (chỉ dùng cho đèn — không phải nội thất thường). */
function khoiSangNhe(w: number, h: number, d: number, mau: number, cuong = 0.4): THREE.Mesh {
  const geo = new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.4);
  const mat = new THREE.MeshStandardMaterial({
    color: mau,
    emissive: mau,
    emissiveIntensity: cuong,
    roughness: 0.4,
  });
  return new THREE.Mesh(geo, mat);
}

function khungCuaTuDung(): THREE.Group {
  const g = new THREE.Group();
  const matKhung = new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 0.75 });
  for (const [x, y, w, h] of [
    [-0.5, 1.0, 0.08, 2.0],
    [0.5, 1.0, 0.08, 2.0],
    [0, 2.0, 1.08, 0.08],
  ] as const) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), matKhung);
    k.position.set(x, y, 0);
    g.add(k);
  }
  const canh = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 1.9, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x7a5234, roughness: 0.7 }),
  );
  canh.position.set(0, 0.97, 0.03);
  g.add(canh);
  return g;
}

/* ------------------------------------------------------------------ Kenney */

/** Kho model Kenney Furniture Kit. Chuẩn hoá theo MÉT thật (kẹp cả 2 chiều). */
type KhoNoiThat = {
  co: boolean;
  layCao(ten: string, caoM: number): THREE.Object3D | null;
  layRong(ten: string, rongM: number): THREE.Object3D | null;
};

/** Mọi tên model Furniture Kit dùng trong bảng `bo-cuc.ts` (chính + phụ). */
const TEN_KENNEY: readonly string[] = [
  ...new Set(
    KHOI_CANH.flatMap((k) => [k.kenney, k.kenneyPhu]).filter((t): t is string => !!t),
  ),
];

async function napKenneyNha(loader: GLTFLoader): Promise<KhoNoiThat> {
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

  if (kho.size === 0) {
    return { co: false, layCao: () => null, layRong: () => null };
  }

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
    boc.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
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
  nhom.name = 'CanNhaAm';
  scene.add(nhom);

  const nuaX = KICH_THUOC_PHONG / 2;
  const nuaZ = KICH_THUOC_SAU / 2;

  /* --- sàn gỗ --- */
  const san = new THREE.Mesh(
    new THREE.PlaneGeometry(KICH_THUOC_PHONG, KICH_THUOC_SAU),
    new THREE.MeshStandardMaterial({ map: textureSanGo(), roughness: 0.65, metalness: 0 }),
  );
  san.rotation.x = -Math.PI / 2;
  san.receiveShadow = true;
  nhom.add(san);

  /* --- 4 tường kem ấm (tường nam khoét cửa sổ lớn) --- */
  const matTuong = new THREE.MeshStandardMaterial({
    map: textureTuongKem(),
    roughness: 0.85,
    metalness: 0,
  });
  const tuongBac = new THREE.Mesh(new THREE.PlaneGeometry(KICH_THUOC_PHONG, CAO_TUONG), matTuong);
  tuongBac.position.set(0, CAO_TUONG / 2, -nuaZ);
  tuongBac.receiveShadow = true;
  nhom.add(tuongBac);

  const tuongTay = new THREE.Mesh(new THREE.PlaneGeometry(KICH_THUOC_SAU, CAO_TUONG), matTuong);
  tuongTay.position.set(-nuaX, CAO_TUONG / 2, 0);
  tuongTay.rotation.y = Math.PI / 2;
  tuongTay.receiveShadow = true;
  nhom.add(tuongTay);

  const tuongDong = new THREE.Mesh(new THREE.PlaneGeometry(KICH_THUOC_SAU, CAO_TUONG), matTuong);
  tuongDong.position.set(nuaX, CAO_TUONG / 2, 0);
  tuongDong.rotation.y = -Math.PI / 2;
  tuongDong.receiveShadow = true;
  nhom.add(tuongDong);

  // tường nam: 2 mảnh trái/phải quanh khoảng trống cửa sổ + 1 mảnh trên đầu
  const nuaCuaSo = CUA_SO.rong / 2;
  const traiRong = nuaX + CUA_SO.tai[0] - nuaCuaSo;
  if (traiRong > 0.05) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(traiRong, CAO_TUONG), matTuong);
    t.position.set(-nuaX + traiRong / 2, CAO_TUONG / 2, nuaZ);
    t.rotation.y = Math.PI;
    t.receiveShadow = true;
    nhom.add(t);
  }
  const phaiRong = nuaX - (CUA_SO.tai[0] + nuaCuaSo);
  if (phaiRong > 0.05) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(phaiRong, CAO_TUONG), matTuong);
    t.position.set(nuaX - phaiRong / 2, CAO_TUONG / 2, nuaZ);
    t.rotation.y = Math.PI;
    t.receiveShadow = true;
    nhom.add(t);
  }
  const caoTren = CAO_TUONG - CUA_SO.duoiSan - CUA_SO.cao;
  if (caoTren > 0.03) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(CUA_SO.rong, caoTren), matTuong);
    t.position.set(CUA_SO.tai[0], CUA_SO.duoiSan + CUA_SO.cao + caoTren / 2, nuaZ);
    t.rotation.y = Math.PI;
    t.receiveShadow = true;
    nhom.add(t);
  }
  if (CUA_SO.duoiSan > 0.03) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(CUA_SO.rong, CUA_SO.duoiSan), matTuong);
    t.position.set(CUA_SO.tai[0], CUA_SO.duoiSan / 2, nuaZ);
    t.rotation.y = Math.PI;
    t.receiveShadow = true;
    nhom.add(t);
  }

  /* --- cửa sổ lớn: kính trong + khung gỗ + cảnh ngoài trời chiều --- */
  {
    const troi = textureTroiChieu();
    const canh = new THREE.Mesh(
      new THREE.PlaneGeometry(CUA_SO.rong - 0.1, CUA_SO.cao - 0.1),
      new THREE.MeshBasicMaterial({ map: troi, toneMapped: false }),
    );
    canh.position.set(CUA_SO.tai[0], CUA_SO.duoiSan + CUA_SO.cao / 2, nuaZ - 0.03);
    nhom.add(canh);
    const kinh = new THREE.Mesh(
      new THREE.PlaneGeometry(CUA_SO.rong - 0.1, CUA_SO.cao - 0.1),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.08,
        roughness: 0.05,
        metalness: 0,
      }),
    );
    kinh.position.set(CUA_SO.tai[0], CUA_SO.duoiSan + CUA_SO.cao / 2, nuaZ - 0.02);
    nhom.add(kinh);
    // khung gỗ viền cửa sổ + 1 thanh chia giữa
    const matKhung = new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 0.75 });
    const khungY = CUA_SO.duoiSan + CUA_SO.cao / 2;
    for (const [dx, dz, w, h] of [
      [-CUA_SO.rong / 2, 0, 0.08, CUA_SO.cao],
      [CUA_SO.rong / 2, 0, 0.08, CUA_SO.cao],
      [0, CUA_SO.cao / 2, CUA_SO.rong, 0.08],
      [0, -CUA_SO.cao / 2, CUA_SO.rong, 0.08],
      [0, 0, 0.06, CUA_SO.cao],
    ] as const) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), matKhung);
      k.position.set(CUA_SO.tai[0] + dx, khungY + dz, nuaZ - 0.04);
      k.castShadow = true;
      nhom.add(k);
    }
  }

  /* --- trần trắng + chân tường --- */
  const tran = new THREE.Mesh(
    new THREE.PlaneGeometry(KICH_THUOC_PHONG, KICH_THUOC_SAU),
    new THREE.MeshStandardMaterial({ color: 0xfaf7ef, roughness: 0.92 }),
  );
  tran.rotation.x = Math.PI / 2;
  tran.position.y = CAO_TUONG;
  nhom.add(tran);

  const matChanTuong = new THREE.MeshStandardMaterial({ color: 0xe4d8bd, roughness: 0.7 });
  const caoChanTuong = 0.1;
  for (const [x, z, rx, ry] of [
    [0, -nuaZ + 0.01, KICH_THUOC_PHONG, 0],
    [0, nuaZ - 0.01, KICH_THUOC_PHONG, Math.PI],
    [-nuaX + 0.01, 0, KICH_THUOC_SAU, Math.PI / 2],
    [nuaX - 0.01, 0, KICH_THUOC_SAU, -Math.PI / 2],
  ] as const) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(rx, caoChanTuong), matChanTuong);
    c.position.set(x, caoChanTuong / 2, z);
    c.rotation.y = ry;
    nhom.add(c);
  }

  /* ------------------------------------------------------------------------
   * NỘI THẤT — ĐẶT THEO BẢNG BỐ CỤC (`bo-cuc.ts`), không toạ độ viết tay.
   * ---------------------------------------------------------------------- */
  const loader = new GLTFLoader();
  const kho = await napKenneyNha(loader);

  const DU_PHONG: Record<string, () => THREE.Object3D> = {
    sofa: sofaTuDung,
    'ke-tivi': () => tuTuDung(0.55, 1.4, 0x5c3d24),
    'ban-tra': () => tuTuDung(0.38, 1.0, 0x6a4a2e),
    'cay-1': () => cayTuDung(1.1),
    'cay-2': () => cayTuDung(1.0),
    'den-san': denSanTuDung,
    'ban-dieu-khien': () => tuTuDung(0.75, 1.3, 0x8a6a44),
    'ghe-1': gheTuDung,
    'ghe-2': gheTuDung,
    'ban-an-ghe-2': gheTuDung,
    'ban-an-ghe-3': gheTuDung,
    'ban-an-ghe-4': gheTuDung,
    'ke-module': () => tuTuDung(1.9, 1.4, 0x6a4a2e),
    'tu-bep': () => tuTuDung(1.0, 1.2, 0xd8d2c4),
    'bep-nau': () => tuTuDung(0.95, 1.1, 0x3a3a3a),
    'tu-lanh': () => tuTuDung(1.8, 1.1, 0xe8e8e8),
    'ban-an': () => tuTuDung(0.75, 1.3, 0x8a6a44),
    tham: () => new THREE.Group(),
    cua: khungCuaTuDung,
  };

  /** Dựng một khối theo đúng dòng trong bảng (hoặc fallback tự dựng). */
  function dungKhoi(k: KhoiCanh): THREE.Object3D {
    let obj: THREE.Object3D | null = null;
    if (kho.co && k.kenney) {
      if (k.cao !== undefined) {
        obj = kho.layCao(k.kenney, k.cao) ?? (k.kenneyPhu ? kho.layCao(k.kenneyPhu, k.cao) : null);
      } else if (k.rong !== undefined) {
        obj = kho.layRong(k.kenney, k.rong) ?? (k.kenneyPhu ? kho.layRong(k.kenneyPhu, k.rong) : null);
      }
    }
    const duPhong = DU_PHONG[k.id] ?? (() => hop(0.6, 0.6, 0.6, 0x8a6a44));
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

  for (const k of KHOI_CANH) {
    const g = dungKhoi(k);
    // Ghế: `actor.sit` cần hình học THẬT — đo cao độ mặt ghế trên chính model
    // vừa dựng rồi ghi vào `noi-dung.ts` (chỉ cho 2 place được theo dõi).
    if (k.id === 'ghe-1' || k.id === 'ghe-2' || k.id === 'sofa') {
      g.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(g);
      const matGhe = bb.max.y - bb.min.y > 0.01 ? Math.min(bb.max.y, 0.55) : 0;
      if (matGhe > 0) datSeatY(k.id, matGhe);
    }
  }

  return { nhom, dungKenney: kho.co };
}

/** PointLight dựng gọn một dòng (bảng bố cục không quản ánh sáng). */
export function denDiem(
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

/**
 * Sương/bokeh nhẹ trong không khí — thay "hai sương bục" của lab. Rải khắp
 * phòng khách gần cửa sổ, nơi nắng chiều xuyên qua hay thấy hạt bụi lấp lánh.
 */
export function haiSuongBuc(scene: THREE.Scene): void {
  const soHat = 70;
  const pos = new Float32Array(soHat * 3);
  for (let i = 0; i < soHat; i++) {
    pos[i * 3] = -3 + Math.random() * 3.5; // quanh cửa sổ + hành lang
    pos[i * 3 + 1] = 0.6 + Math.random() * 1.6;
    pos[i * 3 + 2] = 1.5 + Math.random() * 3.3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xfff1d6,
    size: 0.028,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const diem = new THREE.Points(geo, mat);
  diem.name = 'bokehNang';
  scene.add(diem);
}
