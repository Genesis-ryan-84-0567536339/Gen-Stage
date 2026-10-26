/**
 * phong.ts — dựng CĂN NHÀ ẤM (D1 #43, hoàn thiện mỹ thuật ở D1b #48).
 *
 * Boss 26/10 sau D1: cảnh đúng kết cấu nhưng **trống và thô** — tường trơn,
 * sofa khối phẳng, cửa sổ dẹt, bàn trống. D1b bù đúng ba thứ ảnh tham chiếu
 * có mà bản cũ thiếu: **chất liệu** (vân gỗ/vải/thảm, `chat-lieu.ts`),
 * **đồ đạc nhỏ** (sách, cốc, gối, tranh, bảng ghim, rèm — thêm vào bảng
 * `bo-cuc.ts`, không viết toạ độ tay), và **chiều sâu ngoài cửa sổ** (sân
 * vườn thật: cỏ, hàng rào, bụi cây, trời chiều).
 *
 * Ràng buộc Boss 26/10 (D1b): **đừng đòi GPU lớn**. Không hậu kỳ (không SSAO,
 * không DOF, không bloom), texture procedural ≤ 1024 px và DÙNG CHUNG, đồ nhỏ
 * KHÔNG đổ bóng, và `gopTinh()` gộp mọi mesh tĩnh theo vật liệu để giữ số
 * lượt vẽ ở mức máy yếu chịu được.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { datSeatY } from './noi-dung';
import {
  apChatLieu,
  bangGhim,
  coSanVuon,
  sanVanGo,
  thamHoaVan,
  tranhTuong,
  troiChieu,
  tuongKem,
  type NhomChatLieu,
} from './chat-lieu';
import { CUA_SO, DAY_BEP, KHOI_CANH, ROOM_D, ROOM_W, type KhoiCanh } from './bo-cuc';

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

/* -------------------------------------------------------- nội thất tự dựng */

function hop(w: number, h: number, d: number, mau: number, nham = 0.75, kim = 0.05): THREE.Mesh {
  const geo = new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.08);
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
    const chan = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.43, 6), matChan);
    chan.position.set(dx, 0.215, dz);
    g.add(chan);
  }
  return g;
}

/** Sofa vải dự phòng — khối đệm + 2 tay vịn, màu olive đất như ảnh tham chiếu. */
function sofaTuDung(): THREE.Group {
  const g = new THREE.Group();
  const than = hop(1.9, 0.42, 0.85, 0x6d6540, 0.95, 0);
  than.position.y = 0.21;
  g.add(than);
  const dem = hop(1.7, 0.3, 0.7, 0x7d7247, 0.95, 0);
  dem.position.set(0, 0.5, -0.02);
  g.add(dem);
  for (const dx of [-0.88, 0.88]) {
    const tay = hop(0.14, 0.55, 0.85, 0x5e5736, 0.95, 0);
    tay.position.set(dx, 0.3, 0);
    g.add(tay);
  }
  return g;
}

function tuTuDung(cao: number, rong: number, mau = 0x8a6a44): THREE.Group {
  const g = new THREE.Group();
  const than = hop(rong, cao, 0.42, mau, 0.7, 0.04);
  than.position.y = cao / 2;
  g.add(than);
  return g;
}

function cayTuDung(cao = 1.1): THREE.Group {
  const g = new THREE.Group();
  const chau = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.13, 0.22, 8),
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

/** Khối phát sáng NHẸ (chỉ dùng cho chụp đèn — không phải nội thất thường). */
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

function denSanTuDung(): THREE.Group {
  const g = new THREE.Group();
  const cot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.025, 1.3, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.6, metalness: 0.3 }),
  );
  cot.position.y = 0.65;
  g.add(cot);
  const chup = khoiSangNhe(0.26, 0.3, 0.26, MAU_DEN_AM, 0.5);
  chup.position.y = 1.4;
  g.add(chup);
  return g;
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

/* ----------------------------------------------- đồ nhỏ bày bàn (tự dựng) */

/** Cốc sứ có quai — D1b: "bàn trà có đồ", không để mặt bàn trống trơn. */
function cocTuDung(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xf2e8d8, roughness: 0.45 });
  const than = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.095, 12), mat);
  than.position.y = 0.0475;
  g.add(than);
  const quai = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 5, 10, Math.PI * 1.4), mat);
  quai.position.set(0.05, 0.05, 0);
  quai.rotation.z = -0.4;
  g.add(quai);
  const tra = new THREE.Mesh(
    new THREE.CircleGeometry(0.036, 12),
    new THREE.MeshStandardMaterial({ color: 0x6b4323, roughness: 0.3 }),
  );
  tra.rotation.x = -Math.PI / 2;
  tra.position.y = 0.088;
  g.add(tra);
  return g;
}

/** Đĩa trái cây — mấy quả tròn màu ấm trên đĩa gỗ. */
function traiCayTuDung(): THREE.Group {
  const g = new THREE.Group();
  const dia = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.11, 0.035, 14),
    new THREE.MeshStandardMaterial({ color: 0xa9794b, roughness: 0.6 }),
  );
  dia.position.y = 0.018;
  g.add(dia);
  const quaGeo = new THREE.SphereGeometry(0.042, 8, 6);
  for (const [dx, dz, mau] of [
    [0, 0, 0xd0612f],
    [0.062, 0.03, 0xc8a32a],
    [-0.055, 0.035, 0x9c3f2f],
    [0.01, -0.06, 0x7d9a3a],
  ] as const) {
    const q = new THREE.Mesh(quaGeo, new THREE.MeshStandardMaterial({ color: mau, roughness: 0.55 }));
    q.position.set(dx, 0.06, dz);
    g.add(q);
  }
  return g;
}

/** Tranh treo tường: khung gỗ + mặt tranh procedural (mặt hướng local +Z). */
function tranhTuDung(kieu: number, rong = 0.52, cao = 0.66): THREE.Group {
  const g = new THREE.Group();
  const khung = new THREE.Mesh(
    new THREE.BoxGeometry(rong, cao, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 0.7 }),
  );
  khung.position.z = 0.02;
  g.add(khung);
  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(rong - 0.07, cao - 0.07),
    new THREE.MeshStandardMaterial({ map: tranhTuong(kieu), roughness: 0.85 }),
  );
  mat.position.z = 0.045;
  g.add(mat);
  return g;
}

/** Bảng ghim trên tường bàn làm việc. */
function bangGhimTuDung(): THREE.Group {
  const g = new THREE.Group();
  const khung = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.72, 0.035),
    new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 0.75 }),
  );
  khung.position.z = 0.018;
  g.add(khung);
  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(0.93, 0.65),
    new THREE.MeshStandardMaterial({ map: bangGhim(), roughness: 0.92 }),
  );
  mat.position.z = 0.04;
  g.add(mat);
  return g;
}

/* ------------------------------------------------------------------ Kenney */

type KhoNoiThat = {
  co: boolean;
  layCao(ten: string, caoM: number): THREE.Object3D | null;
  layRong(ten: string, rongM: number): THREE.Object3D | null;
};

/** Mọi tên model Furniture Kit dùng trong bảng `bo-cuc.ts` (chính + phụ). */
const TEN_KENNEY: readonly string[] = [
  ...new Set(KHOI_CANH.flatMap((k) => [k.kenney, k.kenneyPhu]).filter((t): t is string => !!t)),
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

  if (kho.size === 0) return { co: false, layCao: () => null, layRong: () => null };

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
    return boc;
  }

  return {
    co: true,
    layCao: (ten, caoM) => lay(ten, 'cao', caoM),
    layRong: (ten, rongM) => lay(ten, 'rong', rongM),
  };
}

/* ---------------------------------------------------------- gộp mesh tĩnh */

/**
 * Chỉ giữ 4 thuộc tính chuẩn (`position`, `normal`, `uv`, `color`) để
 * `mergeGeometries` không từ chối vì lệch khuôn.
 *
 * `color` là mấu chốt vòng 2: màu phẳng của model Kenney được **nướng vào màu
 * đỉnh**, nhờ đó 119 vật liệu "khác nhau chỉ ở `color`" gộp được về vài bản
 * duy nhất (xem `gopTinh`).
 */
function chuanHoaThuocTinh(
  geo: THREE.BufferGeometry,
  mau: THREE.Color,
): THREE.BufferGeometry | null {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const pos = g.getAttribute('position');
  if (!pos) return null;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  }
  for (const ten of Object.keys(g.attributes)) {
    if (ten !== 'position' && ten !== 'normal' && ten !== 'uv') g.deleteAttribute(ten);
  }
  // màu đỉnh = `material.color` (đang ở không gian LÀM VIỆC, đúng cái three
  // mong đợi ở `vertexColors`), nên `color` × `vertexColor` không nhân hai lần
  // miễn là vật liệu gộp để `color` trắng.
  const mc = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    mc[i * 3] = mau.r;
    mc[i * 3 + 1] = mau.g;
    mc[i * 3 + 2] = mau.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(mc, 3));
  g.clearGroups();
  g.morphAttributes = {};
  return g;
}

/**
 * KHOÁ GỘP: hai vật liệu chỉ gộp được khi mọi thứ ảnh hưởng tới shader/uniform
 * giống nhau — **trừ `color`**, vì `color` đã được nướng vào màu đỉnh.
 *
 * Trả `null` nghĩa là "không gộp cái này" (đã có màu đỉnh riêng thì nướng thêm
 * sẽ sai màu).
 */
function khoaGop(m: THREE.Material, bong: boolean): string | null {
  const s = m as unknown as Record<string, unknown>;
  if (s.vertexColors) return null;
  const t = (x: unknown) => (x && (x as THREE.Texture).uuid ? (x as THREE.Texture).uuid : '-');
  return [
    m.type,
    bong ? 1 : 0,
    t(s.map),
    t(s.roughnessMap),
    t(s.normalMap),
    t(s.aoMap),
    t(s.alphaMap),
    t(s.emissiveMap),
    t(s.metalnessMap),
    t(s.lightMap),
    String(s.roughness ?? '-'),
    String(s.metalness ?? '-'),
    s.emissive ? (s.emissive as THREE.Color).getHexString() : '-',
    String(s.emissiveIntensity ?? '-'),
    m.transparent ? 1 : 0,
    m.opacity,
    m.side,
    m.blending,
    m.depthWrite ? 1 : 0,
    m.alphaTest,
    s.flatShading ? 1 : 0,
    s.toneMapped === false ? 0 : 1,
    // vật liệu có `onBeforeCompile` (vân phủ bằng shader) chỉ gộp với vật liệu
    // dùng ĐÚNG shader đó — `customProgramCacheKey` chính là chữ ký ấy.
    m.customProgramCacheKey ? m.customProgramCacheKey() : '-',
  ].join('|');
}

/**
 * Gộp mọi mesh **tĩnh, không đổ bóng** theo VẬT LIỆU — đây là mấu chốt hiệu
 * năng của D1b: nhà đầy đồ mà máy yếu vẫn chạy.
 *
 * Nhờ `apChatLieu()` dùng chung một bản vật liệu cho mọi mesh cùng gốc, số
 * nhóm vật liệu nhỏ hơn số mesh rất nhiều → gộp xong còn vài chục lượt vẽ.
 * Mesh nào `castShadow` (nội thất lớn) thì KHÔNG gộp: gộp vào một mesh khổng
 * lồ làm khung bóng phải vẽ cả cái, mất cái lợi vừa kiếm được.
 */
export function gopTinh(goc: THREE.Object3D): { truoc: number; sau: number } {
  const theoVatLieu = new Map<
    string,
    { vl: THREE.Material; bong: boolean; geo: THREE.BufferGeometry[]; nhan: THREE.Mesh[] }
  >();
  let truoc = 0;
  goc.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    truoc++;
    if (Array.isArray(m.material) || m.userData.khongGop) return;
    // InstancedMesh (hàng rào, tán cây) đã là MỘT lượt vẽ cho cả trăm bản —
    // gộp nó là phá: `mergeGeometries` chỉ lấy hình gốc ở gốc toạ độ.
    if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    const vl = m.material as THREE.Material;
    if (!vl) return;
    /*
     * Gộp theo (chữ ký vật liệu BỎ MÀU, có đổ bóng hay không). Vòng 1 khoá
     * theo `vl.uuid` nên 119 vật liệu Kenney "khác nhau chỉ ở `color`" không
     * gộp được gì → phần nhà còn ~190 lượt vẽ (kiểm độc lập chặn). Vòng 2
     * nướng `color` vào màu đỉnh, chữ ký còn lại chỉ là (texture, nhám, kim,
     * trong suốt, shader) → gộp cả dãy đồ gỗ thành MỘT mesh.
     *
     * Một mesh gộp chỉ mang được MỘT cờ `castShadow`, nên đồ lớn (vào khung
     * bóng) và đồ nhỏ (không) vẫn phải nằm hai rổ khác nhau.
     */
    const khoa = khoaGop(vl, m.castShadow);
    if (khoa === null) return;
    if (!theoVatLieu.has(khoa)) {
      theoVatLieu.set(khoa, { vl, bong: m.castShadow, geo: [], nhan: [] });
    }
    const o2 = theoVatLieu.get(khoa)!;
    m.updateWorldMatrix(true, false);
    const mau = (vl as THREE.MeshStandardMaterial).color ?? new THREE.Color(0xffffff);
    const g = chuanHoaThuocTinh(m.geometry, mau);
    if (!g) return;
    g.applyMatrix4(m.matrixWorld);
    o2.geo.push(g);
    o2.nhan.push(m);
  });

  for (const { vl, bong, geo, nhan } of theoVatLieu.values()) {
    if (geo.length < 2) continue;
    let gop: THREE.BufferGeometry | null = null;
    try {
      gop = BGU.mergeGeometries(geo, false);
    } catch {
      gop = null;
    }
    if (!gop) continue;
    for (const m of nhan) m.removeFromParent();
    // Vật liệu GỘP: `color` trắng + `vertexColors` — màu từng món nằm trong
    // thuộc tính `color` của hình học, nên không nhân màu hai lần.
    const vlGop = vl.clone();
    const vs = vlGop as THREE.MeshStandardMaterial;
    if (vs.color) vs.color.setRGB(1, 1, 1);
    // `Material.copy()` KHÔNG mang theo `onBeforeCompile`/`customProgramCacheKey`
    // (chúng là thuộc tính riêng do `phuVanLenMap` gắn) — mất là mất sạch vân.
    vlGop.onBeforeCompile = vl.onBeforeCompile;
    vlGop.customProgramCacheKey = vl.customProgramCacheKey;
    vlGop.vertexColors = true;
    vlGop.needsUpdate = true;
    const moi = new THREE.Mesh(gop, vlGop);
    moi.name = 'gop-tinh';
    moi.castShadow = bong;
    moi.receiveShadow = true;
    moi.matrixAutoUpdate = false;
    goc.add(moi);
  }

  let sau = 0;
  goc.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) sau++;
  });
  return { truoc, sau };
}

/* ----------------------------------------------------------- sân vườn */

/**
 * SÂN VƯỜN ngoài cửa sổ (D1b) — bản D1 chỉ dán một tấm ảnh trời lên mặt kính
 * nên cửa sổ nhìn dẹt như tờ lịch. Giờ là hình khối thật: cỏ, hàng rào gỗ,
 * mấy bụi cây, rồi mới tới phông trời chiều ở xa. Có chiều sâu thật thì nắng
 * chiều mới ra cảm giác "nhìn ra vườn".
 *
 * Toàn bộ `castShadow = false`, hàng rào + tán lá dùng `InstancedMesh`: cả
 * khu vườn chỉ tốn vài lượt vẽ.
 */
function sanVuon(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'SanVuon';
  const nuaZ = KICH_THUOC_SAU / 2;

  // cỏ
  const co = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 20),
    new THREE.MeshStandardMaterial({ map: coSanVuon(), roughness: 0.95 }),
  );
  co.rotation.x = -Math.PI / 2;
  co.position.set(0, -0.02, nuaZ + 10);
  g.add(co);

  // phông trời chiều ở xa
  const troi = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 16),
    new THREE.MeshBasicMaterial({ map: troiChieu(), toneMapped: false }),
  );
  troi.position.set(0, 5.5, nuaZ + 19.5);
  troi.rotation.y = Math.PI;
  g.add(troi);

  // hàng rào gỗ: 48 thanh + 2 thanh ngang, một lượt vẽ cho cả hàng
  const matRao = new THREE.MeshStandardMaterial({ color: 0xcdb089, roughness: 0.85 });
  const thanh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.05, 0.04), matRao, 48);
  const tm = new THREE.Object3D();
  for (let i = 0; i < 48; i++) {
    tm.position.set(-11.75 + i * 0.5, 0.5, nuaZ + 5.5);
    tm.rotation.z = ((i % 5) - 2) * 0.006;
    tm.updateMatrix();
    thanh.setMatrixAt(i, tm.matrix);
  }
  thanh.instanceMatrix.needsUpdate = true;
  g.add(thanh);
  for (const y of [0.78, 0.36]) {
    const ngang = new THREE.Mesh(new THREE.BoxGeometry(24, 0.08, 0.03), matRao);
    ngang.position.set(0, y, nuaZ + 5.46);
    g.add(ngang);
  }

  /*
   * NHÀ HÀNG XÓM phía sau rào — kiểm độc lập: "cảnh ngoài cửa sổ phải RA HÌNH
   * (cây/mái nhà) thay vì vệt mờ". Hai khối tường + mái dốc, màu nhạt dần
   * theo khoảng cách để không tranh chấp với trong nhà.
   */
  for (const [x, dz, rong, mauTuong, mauMai] of [
    [-8.5, 12.5, 5.4, 0xe3d2b4, 0x9c5b45],
    [7.5, 14.5, 6.2, 0xd8cbb2, 0x8a6a52],
  ] as const) {
    const z = nuaZ + dz;
    const than = new THREE.Mesh(
      new THREE.BoxGeometry(rong, 2.6, 4),
      new THREE.MeshStandardMaterial({ color: mauTuong, roughness: 0.95 }),
    );
    than.position.set(x, 1.3, z);
    g.add(than);
    // mái dốc: lăng trụ tam giác = hình nón 4 cạnh xoay 45°
    const mai = new THREE.Mesh(
      new THREE.ConeGeometry(rong * 0.78, 1.5, 4),
      new THREE.MeshStandardMaterial({ color: mauMai, roughness: 1 }),
    );
    mai.position.set(x, 3.35, z);
    mai.rotation.y = Math.PI / 4;
    g.add(mai);
    // cửa sổ sáng đèn — một chấm ấm cho ra "nhà có người"
    const cs = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshBasicMaterial({ color: 0xffd9a8 }),
    );
    cs.position.set(x - rong * 0.22, 1.5, z - 2.02);
    cs.rotation.y = Math.PI;
    g.add(cs);
  }

  // bụi cây + tán lá mờ phía sau rào (một InstancedMesh cho mọi tán)
  const matLa = new THREE.MeshStandardMaterial({ color: 0x5d7f46, roughness: 1 });
  const TAN: Array<[number, number, number]> = [
    [-9, 6.8, 2.3],
    [-5.2, 7.6, 1.5],
    [-2.0, 9.2, 2.8],
    [2.6, 7.2, 1.7],
    [5.4, 8.6, 2.5],
    [9.2, 7.0, 2.0],
    [-7.0, 10.5, 3.2],
    [6.8, 11.0, 3.0],
  ];
  const tan = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 9, 7), matLa, TAN.length * 3);
  const matThan = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.95 });
  const than = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 2.2, 6), matThan, TAN.length);
  TAN.forEach(([x, dz, r], i) => {
    const z = nuaZ + dz;
    tm.position.set(x, r * 0.85 + 1.0, z);
    tm.scale.set(r, r * 0.82, r);
    tm.rotation.set(0, i, 0);
    tm.updateMatrix();
    tan.setMatrixAt(i * 3, tm.matrix);
    tm.position.set(x + r * 0.5, r * 0.55 + 1.0, z - 0.45);
    tm.scale.setScalar(r * 0.6);
    tm.updateMatrix();
    tan.setMatrixAt(i * 3 + 1, tm.matrix);
    tm.position.set(x - r * 0.48, r * 0.5 + 1.0, z + 0.4);
    tm.scale.setScalar(r * 0.52);
    tm.updateMatrix();
    tan.setMatrixAt(i * 3 + 2, tm.matrix);
    tm.position.set(x, 1.1, z);
    tm.scale.setScalar(1);
    tm.rotation.set(0, 0, 0);
    tm.updateMatrix();
    than.setMatrixAt(i, tm.matrix);
  });
  tan.instanceMatrix.needsUpdate = true;
  than.instanceMatrix.needsUpdate = true;
  g.add(tan, than);

  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return g;
}

/** Rèm vải hai bên cửa sổ + thanh treo — mép rèm gợn sóng, không phải tấm dẹt. */
function remCuaSo(): THREE.Group {
  const g = new THREE.Group();
  const nuaZ = KICH_THUOC_SAU / 2;
  const topY = CUA_SO.duoiSan + CUA_SO.cao + 0.18;
  const cao = topY - 0.06;
  const matRem = new THREE.MeshStandardMaterial({
    color: 0xe6d3ae,
    roughness: 0.98,
    side: THREE.DoubleSide,
  });
  for (const ben of [-1, 1] as const) {
    const geo = new THREE.PlaneGeometry(0.72, cao, 10, 1);
    const p = geo.getAttribute('position');
    // gợn sóng theo bề ngang: rèm thật không phải mặt phẳng
    for (let i = 0; i < p.count; i++) {
      p.setZ(i, Math.sin((p.getX(i) / 0.72) * Math.PI * 3) * 0.045);
    }
    geo.computeVertexNormals();
    const rem = new THREE.Mesh(geo, matRem);
    rem.position.set(
      CUA_SO.tai[0] + ben * (CUA_SO.rong / 2 + 0.3),
      cao / 2 + 0.03,
      nuaZ - 0.16,
    );
    g.add(rem);
  }
  const thanh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, CUA_SO.rong + 1.3, 6),
    new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.5, metalness: 0.35 }),
  );
  thanh.rotation.z = Math.PI / 2;
  thanh.position.set(CUA_SO.tai[0], topY, nuaZ - 0.16);
  g.add(thanh);
  return g;
}

/**
 * PHÔNG TRỜI ẤM phía trên tường — G1 (#56), thay chỗ tấm trần vừa bỏ.
 *
 * Bỏ trần xong thì mọi góc máy chếch lên nhìn thẳng vào `scene.background`
 * (xám xanh 0xdce6ea): phòng ấm mà "nóc" lạnh ngắt, lộ ngay là cảnh hở. Một
 * ống trụ hở hai đầu bao quanh nhà, dán đúng texture `troiChieu()` của khu
 * vườn (xanh nhạt trên, cam ấm dưới) là đủ: ĐỨNG TỪ TRONG NHÀ nhìn lên chỉ
 * thấy trời chiều liền mạch với trời ngoài cửa sổ.
 *
 * Rẻ như không: 1 lượt vẽ, `MeshBasicMaterial` (không nhận đèn), `fog: false`
 * (không thì sương kéo nó về lại màu xám), không đổ/nhận bóng.
 */
function phongTroi(): THREE.Mesh {
  // MỘT texture dùng chung với sân vườn (xem `troiChieu()`), nên muốn trời lặp
  // 4 vòng quanh ống trụ thì **nhân UV của hình khối**, không đụng
  // `tex.repeat` — đổi `repeat` là đổi luôn tấm trời của sân vườn.
  const tex = troiChieu();
  /*
   * Băng trời phải KÉO XUỐNG DƯỚI CHÂN TƯỜNG, không bắt đầu ở mép tường.
   * Tia nhìn chếch nhẹ lên từ trong nhà vượt qua mép tường 2,8 m rồi đi
   * **gần như ngang** suốt 30 m tới ống trụ, nên nó chạm ống ở cao độ rất
   * thấp: bản thử bắt đầu từ y = 2,6 để lộ một dải nền xám xanh ngay trên
   * mép tường (thấy rõ ở ảnh ngửa máy). Đáy −2 m nằm dưới cả mặt cỏ sân vườn
   * (−0,02 m) nên không còn khe nào; phần dưới bị nhà và sân vườn che hết.
   */
  const cao = 42;
  const day = -2;
  const hinh = new THREE.CylinderGeometry(30, 30, cao, 24, 1, true);
  const uv = hinh.getAttribute('uv');
  for (let i = 0; i < uv.count; i += 1) uv.setX(i, uv.getX(i) * 4);
  uv.needsUpdate = true;
  const m = new THREE.Mesh(
    hinh,
    new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
      toneMapped: false,
      fog: false,
      // hơi ghì lại cho khỏi cháy trắng ở khung `toan-canh` (luma p95 ≤ 235)
      color: 0xe8e2d6,
    }),
  );
  m.name = 'PhongTroi';
  m.position.y = day + cao / 2;
  m.castShadow = false;
  m.receiveShadow = false;
  m.userData.khongGop = true;
  return m;
}

/* --------------------------------------------------------------------- cảnh */

export type Phong = {
  nhom: THREE.Group;
  dungKenney: boolean;
  /**
   * Cao độ MẶT TRÊN của từng khối, đo lúc dựng (m).
   *
   * Phải trả ra ngoài vì `gopTinh()` gộp mesh tĩnh xong thì nhóm
   * `khoi:<id>` rỗng — đo lại bằng `Box3` trên cảnh sẽ ra `null`. Đó chính là
   * lý do màn hình `may-tinh` lơ lửng sau khi G1 hạ bàn về cỡ chibi: E2 đo
   * mặt bàn không ra nên rơi về cao độ ghi cứng 0,97 m của bàn CŨ.
   */
  noc: Map<string, number>;
  /**
   * J1 (#78) — **HỘP BAO THẬT của từng khối, đo NGAY LÚC DỰNG** (m, hệ thế
   * giới). Phải đo ở đây vì `gopTinh()` gộp mesh tĩnh xong thì nhóm
   * `khoi:<id>` rỗng — `Box3.setFromObject` trên cảnh đã dựng trả hộp vô
   * nghĩa (đúng bài học `matTrenKhoi()` của G1). Bảng bằng chứng J1 (`min.y`
   * mọi khối, mép sau cách tường, vùng giữa trống) đọc thẳng sổ này qua
   * `window.stage.doKhoi()`.
   */
  hopKhoi: Map<string, { min: [number, number, number]; max: [number, number, number] }>;
  /** Số mesh trước/sau khi gộp tĩnh — bằng chứng hiệu năng cho PR. */
  gop: { truoc: number; sau: number };
};

export async function dungPhong(scene: THREE.Scene): Promise<Phong> {
  const nhom = new THREE.Group();
  nhom.name = 'CanNhaAm';
  scene.add(nhom);

  const nuaX = KICH_THUOC_PHONG / 2;
  const nuaZ = KICH_THUOC_SAU / 2;

  /* --- sàn ván gỗ 12 cm (map + roughnessMap dùng chung một bộ) --- */
  const go = sanVanGo();
  const san = new THREE.Mesh(
    new THREE.PlaneGeometry(KICH_THUOC_PHONG, KICH_THUOC_SAU),
    new THREE.MeshStandardMaterial({
      map: go.map,
      roughnessMap: go.rough,
      roughness: 0.62,
      metalness: 0,
    }),
  );
  san.rotation.x = -Math.PI / 2;
  san.receiveShadow = true;
  san.userData.khongGop = true;
  nhom.add(san);

  /* --- 4 tường kem ấm (tường nam khoét cửa sổ lớn) --- */
  const matTuong = new THREE.MeshStandardMaterial({
    map: tuongKem(),
    roughness: 0.9,
    metalness: 0,
  });
  const themTuong = (w: number, h: number, x: number, y: number, z: number, ry: number) => {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matTuong);
    t.position.set(x, y, z);
    t.rotation.y = ry;
    t.receiveShadow = true;
    // KHÔNG `khongGop` nữa (PR #51 vòng 2): 7 mảnh tường dùng CHUNG `matTuong`
    // nên `gopTinh()` nhập cả 4 mặt tường + 3 mảnh quanh cửa sổ thành MỘT mesh.
    nhom.add(t);
  };
  themTuong(KICH_THUOC_PHONG, CAO_TUONG, 0, CAO_TUONG / 2, -nuaZ, 0);
  themTuong(KICH_THUOC_SAU, CAO_TUONG, -nuaX, CAO_TUONG / 2, 0, Math.PI / 2);
  themTuong(KICH_THUOC_SAU, CAO_TUONG, nuaX, CAO_TUONG / 2, 0, -Math.PI / 2);

  // tường nam: 2 mảnh trái/phải quanh khoảng trống cửa sổ + mảnh trên/dưới
  const nuaCuaSo = CUA_SO.rong / 2;
  const traiRong = nuaX + CUA_SO.tai[0] - nuaCuaSo;
  if (traiRong > 0.05) {
    themTuong(traiRong, CAO_TUONG, -nuaX + traiRong / 2, CAO_TUONG / 2, nuaZ, Math.PI);
  }
  const phaiRong = nuaX - (CUA_SO.tai[0] + nuaCuaSo);
  if (phaiRong > 0.05) {
    themTuong(phaiRong, CAO_TUONG, nuaX - phaiRong / 2, CAO_TUONG / 2, nuaZ, Math.PI);
  }
  const caoTren = CAO_TUONG - CUA_SO.duoiSan - CUA_SO.cao;
  if (caoTren > 0.03) {
    themTuong(CUA_SO.rong, caoTren, CUA_SO.tai[0], CUA_SO.duoiSan + CUA_SO.cao + caoTren / 2, nuaZ, Math.PI);
  }
  if (CUA_SO.duoiSan > 0.03) {
    themTuong(CUA_SO.rong, CUA_SO.duoiSan, CUA_SO.tai[0], CUA_SO.duoiSan / 2, nuaZ, Math.PI);
  }

  /* --- cửa sổ: khung gỗ + kính + RÈM + SÂN VƯỜN thật phía sau --- */
  nhom.add(sanVuon());
  nhom.add(remCuaSo());
  {
    const kinh = new THREE.Mesh(
      new THREE.PlaneGeometry(CUA_SO.rong - 0.1, CUA_SO.cao - 0.1),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.07,
        roughness: 0.05,
        metalness: 0,
      }),
    );
    kinh.position.set(CUA_SO.tai[0], CUA_SO.duoiSan + CUA_SO.cao / 2, nuaZ - 0.02);
    kinh.rotation.y = Math.PI;
    kinh.userData.khongGop = true;
    nhom.add(kinh);

    const matKhung = new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 0.7 });
    const khungY = CUA_SO.duoiSan + CUA_SO.cao / 2;
    for (const [dx, dz, w, h] of [
      [-CUA_SO.rong / 2, 0, 0.09, CUA_SO.cao + 0.09],
      [CUA_SO.rong / 2, 0, 0.09, CUA_SO.cao + 0.09],
      [0, CUA_SO.cao / 2, CUA_SO.rong + 0.09, 0.09],
      [0, -CUA_SO.cao / 2, CUA_SO.rong + 0.09, 0.09],
      [0, 0, 0.055, CUA_SO.cao],
      [-CUA_SO.rong / 4, 0, 0.045, CUA_SO.cao],
      [CUA_SO.rong / 4, 0, 0.045, CUA_SO.cao],
    ] as const) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), matKhung);
      k.position.set(CUA_SO.tai[0] + dx, khungY + dz, nuaZ - 0.05);
      // ĐỔ BÓNG: nắng chiều qua khung chia ô mới ra vệt sáng có nét trên sàn
      k.castShadow = true;
      nhom.add(k);
    }
    // bệ cửa sổ gỗ — chỗ nắng chiều đổ xuống rõ nhất
    const be = new THREE.Mesh(
      new THREE.BoxGeometry(CUA_SO.rong + 0.3, 0.06, 0.26),
      new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.6 }),
    );
    be.position.set(CUA_SO.tai[0], CUA_SO.duoiSan - 0.03, nuaZ - 0.14);
    be.receiveShadow = true;
    nhom.add(be);
  }

  /*
   * --- chân tường GỖ (KHÔNG còn trần, KHÔNG còn phào viền trần) ---
   *
   * G1 (#56) — Boss 26/10 xem bản main trên Firefox: **"không cần làm trần nhà
   * vì nhìn rất vướng"**. Tấm trần `PlaneGeometry` ở y = 2,8 chiếm hơn một
   * phần ba khung hình ở `toan-canh` và cắt ngang mọi góc máy chếch lên.
   * Theo `level-design` (blockout): khuôn hình một căn phòng bằng **tường +
   * phông nền**, mái che chỉ thêm khi người chơi thật sự cần cảm giác kín.
   *
   * Bỏ trần KHÔNG làm cảnh sáng lên: `HemisphereLight` không bị hình học chặn
   * (nó không đổ bóng), và mặt trời là `DirectionalLight` đặt NGOÀI cửa sổ nam
   * chứ không chiếu qua chỗ trần. Thứ duy nhất đổi là nhìn lên thấy gì — nên
   * phải có `phongTroi()` bên dưới, không thì lộ nền xám của `scene.background`.
   *
   * Tường vẫn cao `CAO_TUONG` = 2,8 m, chân tường gỗ giữ nguyên.
   */
  const matChanTuong = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.55 });
  for (const [dai, x, z, ry] of [
    [KICH_THUOC_PHONG, 0, -nuaZ + 0.03, 0],
    [KICH_THUOC_PHONG, 0, nuaZ - 0.03, 0],
    [KICH_THUOC_SAU, -nuaX + 0.03, 0, Math.PI / 2],
    [KICH_THUOC_SAU, nuaX - 0.03, 0, Math.PI / 2],
  ] as const) {
    const chan = new THREE.Mesh(new THREE.BoxGeometry(dai, 0.13, 0.05), matChanTuong);
    chan.position.set(x, 0.065, z);
    chan.rotation.y = ry;
    nhom.add(chan);
  }

  nhom.add(phongTroi());

  /*
   * DÃY BẾP LIỀN MẠCH THEO CHỮ L (F1 #56; nối tiếp PR #51 vòng 2).
   *
   * Kiểm độc lập PR #51 chấm: "tủ bếp, bếp nấu, bồn rửa đứng rời từng cục có
   * khe hở". Cách chữa rẻ nhất: một **mặt bếp** gỗ + một dải **backsplash**
   * chạy liền suốt dãy, che hết khe giữa các cục tủ.
   *
   * Bản D1b viết toạ độ TAY ngay tại đây (`zTu = -1.6 … zDen = 2.6`, chỉ một
   * nhánh dọc tường đông). F1 chuyển bếp sang **chữ L góc đông-bắc** nên số
   * đó lệch hẳn ra giữa phòng → giờ đọc `DAY_BEP` trong `bo-cuc.ts` và dựng
   * ĐỦ CẢ HAI NHÁNH. Bốn hộp (2 nhánh × mặt + ốp) dùng chung 2 vật liệu nên
   * `gopTinh()` gộp hết, gần như không tốn thêm lượt vẽ.
   */
  {
    const matMatBep = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.5 });
    const matOp = new THREE.MeshStandardMaterial({ color: 0xe9dcc2, roughness: 0.8 });
    for (const nh of DAY_BEP.nhanh) {
      const dai = Math.abs(nh.den - nh.tu);
      if (dai < 0.1) continue;
      const giua = (nh.tu + nh.den) / 2;
      // tâm dãy theo trục áp tường: lùi vào trong nhà nửa bề sâu mặt bếp
      const xTuong = nh.tuong === 'dong' ? nuaX - 0.04 : 0;
      const zTuong = nh.tuong === 'bac' ? -nuaZ + 0.04 : 0;
      const doc = nh.truc === 'z';

      const mat = new THREE.Mesh(
        doc
          ? new THREE.BoxGeometry(DAY_BEP.sau, 0.045, dai)
          : new THREE.BoxGeometry(dai, 0.045, DAY_BEP.sau),
        matMatBep,
      );
      mat.position.set(
        doc ? xTuong - DAY_BEP.sau / 2 : giua,
        DAY_BEP.caoMat,
        doc ? giua : zTuong + DAY_BEP.sau / 2,
      );
      mat.castShadow = true;
      mat.receiveShadow = true;
      nhom.add(mat);

      const op = new THREE.Mesh(
        doc
          ? new THREE.BoxGeometry(0.03, DAY_BEP.caoOp, dai)
          : new THREE.BoxGeometry(dai, DAY_BEP.caoOp, 0.03),
        matOp,
      );
      op.position.set(
        doc ? xTuong - 0.015 : giua,
        DAY_BEP.caoMat + 0.023 + DAY_BEP.caoOp / 2,
        doc ? giua : zTuong + 0.015,
      );
      op.receiveShadow = true;
      nhom.add(op);
    }
  }

  /* ------------------------------------------------------------------------
   * NỘI THẤT — ĐẶT THEO BẢNG BỐ CỤC (`bo-cuc.ts`), không toạ độ viết tay.
   * ---------------------------------------------------------------------- */
  const loader = new GLTFLoader();
  const kho = await napKenneyNha(loader);

  const DU_PHONG: Record<string, () => THREE.Object3D> = {
    sofa: sofaTuDung,
    'ke-tivi': () => tuTuDung(0.55, 1.6, 0x5c3d24),
    // F1 (#56): TV đặt lên nóc kệ + màn hình bàn làm việc — không có model
    // Kenney thì dựng một khối mỏng tối, vẫn đọc ra "cái màn hình".
    'man-hinh-ban': () => hop(0.56, 0.36, 0.05, 0x2b2b2b, 0.4, 0.2),
    'ban-tra': () => tuTuDung(0.38, 1.0, 0x6b4a2f),
    'cay-1': () => cayTuDung(1.1),
    'cay-2': () => cayTuDung(1.0),
    'cay-4': () => cayTuDung(1.4),
    'den-san': denSanTuDung,
    'ban-dieu-khien': () => tuTuDung(0.75, 1.3, 0x6b4a2f),
    'ghe-1': gheTuDung,
    'ghe-2': gheTuDung,
    'ban-an-ghe-2': gheTuDung,
    'ban-an-ghe-3': gheTuDung,
    'ban-an-ghe-4': gheTuDung,
    'ghe-don-1': gheTuDung,
    'ghe-don-2': gheTuDung,
    'ke-module': () => tuTuDung(1.9, 1.4, 0x6b4a2f),
    'tu-bep': () => tuTuDung(0.95, 1.0, 0xd8d2c4),
    'tu-bep-goc': () => tuTuDung(0.95, 1.1, 0xd8d2c4),
    'tu-duoi-1': () => tuTuDung(0.95, 1.0, 0xd8d2c4),
    'tu-duoi-2': () => tuTuDung(0.95, 1.0, 0xd8d2c4),
    'tu-tren-1': () => tuTuDung(0.7, 1.0, 0xe6e0d2),
    'tu-tren-2': () => tuTuDung(0.7, 1.0, 0xe6e0d2),
    'tu-tren-3': () => tuTuDung(0.7, 1.0, 0xe6e0d2),
    'tu-bat-dia': () => tuTuDung(0.95, 1.3, 0x8a6a44),
    'bep-nau': () => tuTuDung(0.95, 1.1, 0x3a3a3a),
    'tu-lanh': () => tuTuDung(1.8, 1.1, 0xe8e8e8),
    'ban-an': () => tuTuDung(0.75, 1.3, 0x6b4a2f),
    'ban-canh-sofa': () => tuTuDung(0.5, 0.5, 0x6b4a2f),
    'ke-giay': () => tuTuDung(0.42, 1.0, 0x8a6a44),
    'coc-tra': cocTuDung,
    'coc-ban': cocTuDung,
    'trai-cay': traiCayTuDung,
    'tranh-1': () => tranhTuDung(0),
    'tranh-2': () => tranhTuDung(1, 0.46, 0.58),
    'tranh-3': () => tranhTuDung(2, 0.58, 0.72),
    'tranh-4': () => tranhTuDung(0, 0.5, 0.62),
    'bang-ghim': bangGhimTuDung,
    tham: () => new THREE.Group(),
    'tham-an': () => new THREE.Group(),
    'tham-cua': () => new THREE.Group(),
    cua: khungCuaTuDung,
  };

  /** Cao độ mặt trên THẬT của từng khối đã dựng — cho `tren` (đo, không đoán). */
  const nocKhoi = new Map<string, number>();
  const hopKhoi = new Map<
    string,
    { min: [number, number, number]; max: [number, number, number] }
  >();

  /** Thảm dùng CHUNG một texture hoa văn (Boss: không mỗi vật một canvas). */
  let matThamChung: THREE.MeshStandardMaterial | null = null;

  /** Dựng một khối theo đúng dòng trong bảng (hoặc fallback tự dựng). */
  function dungKhoi(k: KhoiCanh): THREE.Object3D {
    let obj: THREE.Object3D | null = null;
    if (kho.co && k.kenney) {
      if (k.cao !== undefined) {
        obj = kho.layCao(k.kenney, k.cao) ?? (k.kenneyPhu ? kho.layCao(k.kenneyPhu, k.cao) : null);
      } else if (k.rong !== undefined) {
        obj =
          kho.layRong(k.kenney, k.rong) ?? (k.kenneyPhu ? kho.layRong(k.kenneyPhu, k.rong) : null);
      }
    }
    const duPhong = DU_PHONG[k.id] ?? (() => hop(0.5, 0.5, 0.5, 0x8a6a44));
    const g = obj ?? duPhong();

    if (k.rongToiDa !== undefined) {
      const b = new THREE.Box3().setFromObject(g);
      const rong = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
      if (rong > k.rongToiDa) g.scale.multiplyScalar(k.rongToiDa / rong);
    }

    // chất liệu: vân gỗ/vải/kim loại + nhuộm vải (chat-lieu.ts)
    const nhomChat: NhomChatLieu = k.chat ?? 'go';
    if (nhomChat === 'tham') {
      /*
       * Thảm KHÔNG dùng model Kenney: UV của Kenney là **atlas bảng màu** (mỗi
       * mặt trỏ vào một ô vài pixel), dán hoa văn lên đó chỉ ra một mảng màu
       * trơn — đúng cái thảm phẳng lì ở ảnh thử D1b vòng 1. Dựng thẳng một
       * tấm phẳng UV 0…1 thì hoa văn hiện đúng như vẽ.
       */
      matThamChung ??= new THREE.MeshStandardMaterial({
        map: thamHoaVan(),
        color: 0xffffff,
        roughness: 0.98,
      });
      const canh = k.rong ?? 2;
      const dia = new THREE.Mesh(new THREE.PlaneGeometry(canh, canh * 0.72), matThamChung);
      dia.rotation.x = -Math.PI / 2;
      dia.position.y = 0.006;
      const g2 = new THREE.Group();
      g2.add(dia);
      g.clear();
      g.add(g2);
    } else {
      apChatLieu(g, nhomChat, k.mauVai, k.cay === true);
    }

    // ĐỒ NHỎ KHÔNG ĐỔ BÓNG (Boss: đừng đòi GPU lớn) — chỉ nội thất có hộp
    // chắn đường (đồ lớn) mới vào khung bóng; đồ nhỏ chỉ NHẬN bóng.
    const doLon = !!k.chan || (k.cao ?? 0) >= 0.9;
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = doLon;
      m.receiveShadow = true;
    });

    const lx = k.lech?.[0] ?? 0;
    const lz = k.lech?.[1] ?? 0;
    const y = k.tren !== undefined ? (nocKhoi.get(k.tren) ?? 0) : (k.datY ?? 0);
    g.position.set(k.tai[0] + lx, y, k.tai[1] + lz);
    g.rotation.y = (k.quay * Math.PI) / 180;
    g.name = `khoi:${k.id}`;
    nhom.add(g);

    g.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(g);
    if (Number.isFinite(bb.max.y)) nocKhoi.set(k.id, bb.max.y);
    if (Number.isFinite(bb.min.y)) {
      hopKhoi.set(k.id, {
        min: [bb.min.x, bb.min.y, bb.min.z],
        max: [bb.max.x, bb.max.y, bb.max.z],
      });
    }
    return g;
  }

  for (const k of KHOI_CANH) {
    const g = dungKhoi(k);
    // Ghế: `actor.sit` cần hình học THẬT — đo cao độ mặt ghế trên chính model
    // vừa dựng rồi ghi vào `noi-dung.ts` (chỉ cho 2 place được theo dõi).
    if (k.id === 'ghe-1' || k.id === 'ghe-2' || k.id === 'sofa') {
      /*
       * Mặt ngồi ≈ 55 % chiều cao TOÀN BỘ ghế (ghế tựa thật: cao 0,85–0,9 m,
       * mặt ngồi 0,45–0,48 m), kẹp ≤ 0,52 m. Bản D1 lấy thẳng `min(max.y,
       * 0.55)` — đúng khi ghế bị chuẩn hoá cao 0,46 m (sai cỡ, thấy rõ ở ảnh
       * thử D1b: ghế ăn bé như ghế búp bê), sai khi ghế đúng cỡ.
       */
      const bb = new THREE.Box3().setFromObject(g);
      const caoGhe = bb.max.y - bb.min.y;
      const matGhe = caoGhe > 0.01 ? Math.min(caoGhe * 0.55, 0.52) : 0;
      if (matGhe > 0) datSeatY(k.id, matGhe);
    }
  }

  const gop = gopTinh(nhom);
  return { nhom, dungKenney: kho.co, gop, noc: nocKhoi, hopKhoi };
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

