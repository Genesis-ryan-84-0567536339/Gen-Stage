/**
 * cu-chi.ts — **lớp cử chỉ thủ tục** trộn chồng lên clip chuyển động thật.
 *
 * Nền chuyển động là file CC0 retarget sang VRM (`chuyen-dong.ts`). Thư viện
 * CC0 không có mấy cử chỉ spec cần (vẫy tay, vỗ tay, gật, lắc, chống cằm, che
 * miệng, gãi đầu, chỉ tay, giơ ngón cái…) nên những cái đó làm ở đây và
 * **trộn** lên dáng nền — đúng ghi chú spec mục 3.2b ("chuyển động nhỏ làm
 * thủ tục bằng code, trộn chồng lên clip chính").
 *
 * ## Hướng tay — chốt một lần cho cả dự án, không đoán dấu euler nữa
 *
 * Bộ xương `vrm.humanoid` **normalized** có tư thế gốc T-pose và mọi xương ở
 * rotation 0: tay TRÁI chìa ra **+X**, tay PHẢI chìa ra **−X**, mặt hướng
 * **+Z**, trên là **+Y** (VRM 1.0; model VRM 0.x đã được `VRMUtils.rotateVRM0`
 * quay 180° trước nên dùng chung quy ước).
 *
 * Vòng 1 đặt thẳng `rotation.z = ±1.9` tưởng là "giơ cao" nhưng thật ra ép tay
 * lún vào hông (review PR #10 mục 1.1), và `rotation.x` trên tay NGANG thì
 * không có tác dụng gì (xoay quanh chính trục của xương = xoắn tay). Nên ở đây
 * **không ai viết số euler cho tay nữa**: khai báo bằng HƯỚNG hình học
 *
 *     doCao   0 = tay buông thẳng xuống · 0.5 = ngang vai · 1 = thẳng đứng quá đầu
 *     raTruoc 0 = chìa ngang ra bên · 1 = chỉ thẳng ra trước mặt
 *
 * rồi `huongTay()` dựng vector hướng, `datHuong()` quay xương tối thiểu từ tư
 * thế gốc sang hướng đó. Kiểm được bằng số: `doCao` tăng ⇒ `huongTay().y`
 * tăng (test `a2-vong2.test.ts`) ⇒ bàn tay thật cao hơn vai (đo trên app thật
 * trong `scripts/kiem-a2.mjs`).
 */
import * as THREE from 'three';

export type Ben = 'trai' | 'phai';

/**
 * **Hướng gốc của xương tay đo trực tiếp trên model**, không đoán.
 *
 * Bộ xương normalized có mọi rotation = 0, nên `position` của xương con CHÍNH
 * LÀ hướng của xương cha trong hệ của nó. Vì vậy hướng gốc của `upperArm` =
 * `normalize(lowerArm.position)` và của `lowerArm` = `normalize(hand.position)`.
 * Đo như thế thì model T-pose hay A-pose đều đúng — vòng 1 giả định T-pose rồi
 * cộng thêm 1.26 rad nên tay lún vào hông (review PR #10 mục 1.1).
 */
export function doHuongGoc(xuong: THREE.Object3D | null, con: THREE.Object3D | null): THREE.Vector3 {
  if (con && con.position.lengthSq() > 1e-8) return con.position.clone().normalize();
  // không đo được (thiếu xương) → T-pose theo quy ước VRM: trái +X, phải −X
  const dau = xuong?.name.toLowerCase() ?? '';
  return new THREE.Vector3(dau.includes('right') ? -1 : 1, 0, 0);
}

/** Trục "ra bên" của một bên người theo quy ước VRM: trái +X, phải −X. */
export function trucBen(ben: Ben): THREE.Vector3 {
  return new THREE.Vector3(ben === 'trai' ? 1 : -1, 0, 0);
}

/**
 * Hướng **tuyệt đối** mong muốn của cánh tay trên.
 *
 * @param doCao 0 = buông thẳng xuống (−Y), 0.5 = ngang vai, 1 = thẳng đứng quá đầu (+Y)
 * @param raTruoc 0 = chìa ngang ra bên, 1 = chỉ thẳng ra trước mặt (+Z)
 *
 * Tính chất kiểm được bằng số (test `a2-vong2.test.ts`): `doCao` tăng ⇒ `.y`
 * tăng đơn điệu; `doCao > 0.5` ⇒ `.y > 0` ⇒ bàn tay cao hơn vai.
 */
export function huongTay(ben: Ben, doCao: number, raTruoc = 0): THREE.Vector3 {
  const e = (THREE.MathUtils.clamp(doCao, 0, 1) - 0.5) * Math.PI; // −π/2 … +π/2
  const f = THREE.MathUtils.clamp(raTruoc, 0, 1);
  const ngang = trucBen(ben)
    .multiplyScalar(1 - f)
    .add(new THREE.Vector3(0, 0, f))
    .normalize();
  return ngang.multiplyScalar(Math.cos(e)).add(new THREE.Vector3(0, Math.sin(e), 0)).normalize();
}

/**
 * Hướng mong muốn của cẳng tay **trong hệ của cánh tay trên**: gập khuỷu từ
 * hướng gốc `goc` về phía trước (+Z vuông góc với `goc`) một góc `gap`×2.1 rad.
 * `gap` 0 = tay thẳng, 1 = gập hết (bàn tay về phía mặt/vai).
 */
export function huongCanhTay(gap: number, goc: THREE.Vector3): THREE.Vector3 {
  const a = THREE.MathUtils.clamp(gap, 0, 1) * 2.1;
  const truoc = new THREE.Vector3(0, 0, 1);
  const vuong = truoc.clone().addScaledVector(goc, -truoc.dot(goc));
  if (vuong.lengthSq() < 1e-6) vuong.set(0, 0, 1);
  vuong.normalize();
  return goc.clone().multiplyScalar(Math.cos(a)).addScaledVector(vuong, Math.sin(a)).normalize();
}

const qTam = new THREE.Quaternion();

/**
 * Quay `b` tối thiểu từ hướng gốc `goc` sang hướng `dich`, trộn với trọng số
 * `w` (0 = giữ nguyên dáng nền, 1 = lấy hẳn hướng đích). `w` đi từ 0 nên vào
 * và ra cử chỉ đều mượt — **crossfade thật**, không "pop" như vòng 1
 * (review mục 2.1).
 */
export function datHuong(
  b: THREE.Object3D | null,
  goc: THREE.Vector3,
  dich: THREE.Vector3,
  w: number,
): void {
  if (!b || w <= 0) return;
  qTam.setFromUnitVectors(goc, dich);
  b.quaternion.slerp(qTam, Math.min(1, w));
}

/* ------------------------------------------------------------ trộn tư thế */

export interface BoXuong {
  spine: THREE.Object3D | null;
  chest: THREE.Object3D | null;
  neck: THREE.Object3D | null;
  head: THREE.Object3D | null;
  chanT: THREE.Object3D | null;
  chanP: THREE.Object3D | null;
  ongT: THREE.Object3D | null;
  ongP: THREE.Object3D | null;
  canhT: THREE.Object3D | null;
  canhP: THREE.Object3D | null;
  tayT: THREE.Object3D | null;
  tayP: THREE.Object3D | null;
  banTayT: THREE.Object3D | null;
  banTayP: THREE.Object3D | null;
  /** Hướng gốc đo trên model (do `NhanVat` tính 1 lần lúc nạp). */
  gocTayT: THREE.Vector3;
  gocTayP: THREE.Vector3;
  gocCanhT: THREE.Vector3;
  gocCanhP: THREE.Vector3;
  /** Gốc nhân vật — mốc để đổi "hướng theo thân người" sang hệ của xương. */
  goc: THREE.Object3D;
}

/** Cộng thêm (additive) — gật/lắc/nghiêng nhỏ, không đè dáng nền. */
function them(b: THREE.Object3D | null, x = 0, y = 0, z = 0): void {
  if (!b) return;
  b.rotation.x += x;
  b.rotation.y += y;
  b.rotation.z += z;
}

const qChuoi = new THREE.Quaternion();
const qTamHai = new THREE.Quaternion();

/**
 * Quay tích luỹ của chuỗi xương cha, tính tới (không gồm) gốc nhân vật.
 * Dùng để đổi một hướng cho theo **thân người** sang hệ cục bộ của xương —
 * không cần `updateMatrixWorld`, nên gọi được giữa khung hình.
 */
function quayCha(b: THREE.Object3D, goc: THREE.Object3D): THREE.Quaternion {
  const chuoi: THREE.Object3D[] = [];
  let p = b.parent;
  while (p && p !== goc) {
    chuoi.push(p);
    p = p.parent;
  }
  qChuoi.identity();
  for (let i = chuoi.length - 1; i >= 0; i--) qChuoi.multiply(chuoi[i]!.quaternion);
  return qChuoi;
}

/**
 * Đặt một cánh tay. **Mọi cử chỉ dùng tay trong dự án đều đi qua đây** —
 * không ai viết số euler cho xương tay nữa.
 *
 * @param doCao/`raTruoc` hướng cánh tay trên (xem `huongTay`)
 * @param gap gập khuỷu "ra trước" theo hệ của cánh tay trên (cử chỉ đơn giản)
 * @param canhThe hướng cẳng tay cho theo **thân người** (+Y lên, +Z ra trước,
 *   +X sang trái) — dùng cho cử chỉ cần bàn tay tới đúng chỗ: che miệng, chống
 *   cằm, gãi đầu, ôm đầu, vẫy. Có `canhThe` thì bỏ qua `gap`.
 */
function tay(
  x: BoXuong,
  ben: Ben,
  w: number,
  doCao: number,
  gap = 0,
  raTruoc = 0,
  canhThe?: THREE.Vector3,
): void {
  const tren = ben === 'trai' ? x.tayT : x.tayP;
  const canh = ben === 'trai' ? x.canhT : x.canhP;
  const gocTren = ben === 'trai' ? x.gocTayT : x.gocTayP;
  const gocCanh = ben === 'trai' ? x.gocCanhT : x.gocCanhP;
  datHuong(tren, gocTren, huongTay(ben, doCao, raTruoc), w);
  if (canhThe && tren && canh) {
    qTamHai.copy(quayCha(tren, x.goc)).multiply(tren.quaternion).invert();
    const cucBo = canhThe.clone().normalize().applyQuaternion(qTamHai);
    datHuong(canh, gocCanh, cucBo, w);
  } else {
    datHuong(canh, gocCanh, huongCanhTay(gap, gocCanh), w);
  }
}

/** Hướng theo thân người, viết gọn: lên/trước/vào trong. */
function the(len: number, truoc: number, vao: number, ben: Ben): THREE.Vector3 {
  // "vào trong" = về phía trục giữa: tay trái đi về −X, tay phải đi về +X
  return new THREE.Vector3((ben === 'trai' ? -1 : 1) * vao, len, truoc).normalize();
}

/** Dáng tay buông tự nhiên — dùng khi KHÔNG có clip thật làm nền. */
export function tayBuong(x: BoXuong, w = 1): void {
  tay(x, 'trai', w, 0.1, 0.1);
  tay(x, 'phai', w, 0.1, 0.1);
}

/**
 * Trọng số vào/ra của cử chỉ theo tiến độ clip `u` (0→1): lên từ 0 trong
 * `vao` đầu, xuống về 0 trong `ra` cuối. Clip lặp thì giữ 1.
 */
export function trongSoCuChi(u: number, lap = false, vao = 0.18, ra = 0.22): number {
  if (lap) return 1;
  const t = THREE.MathUtils.clamp(u, 0, 1);
  if (t < vao) return muot(t / vao);
  if (t > 1 - ra) return muot((1 - t) / ra);
  return 1;
}

function muot(u: number): number {
  const v = THREE.MathUtils.clamp(u, 0, 1);
  return v * v * (3 - 2 * v);
}

export interface NgoCanh {
  /** Tiến độ clip 0→1. */
  u: number;
  /** Giây đã chạy (cho dao động). */
  t: number;
  /** Trọng số vào/ra × intensity. */
  w: number;
}

type HamCuChi = (x: BoXuong, c: NgoCanh) => void;

/* ------------------------------------------------- cử chỉ cho từng clip spec */

/**
 * Cử chỉ bù cho clip spec. `idle`, `walk`, `sit`, `stand` KHÔNG có mục ở đây —
 * thư viện CC0 diễn đủ, dáng nền lo hết.
 */
export const CU_CHI_CLIP: Record<string, HamCuChi> = {
  wave: (x, { t, w }) => {
    const v = Math.sin(t * 10);
    // cẳng tay dựng thẳng lên, hơi ra ngoài → bàn tay ngang đầu, vẫy qua lại
    tay(x, 'trai', w, 0.7, 0, 0.1, the(1, 0.15 + v * 0.1, -0.25, 'trai'));
    them(x.banTayT, 0, 0, v * 0.45 * w);
    them(x.head, 0, 0.06 * w, 0);
  },
  clap: (x, { t, w }) => {
    const v = Math.abs(Math.sin(t * 8));
    // hai cẳng tay chụm vào giữa ngực, chạm nhau theo nhịp
    tay(x, 'trai', w, 0.3, 0, 0.3, the(0.45, 0.5 + v * 0.1, 0.75 - v * 0.1, 'trai'));
    tay(x, 'phai', w, 0.3, 0, 0.3, the(0.45, 0.5 + v * 0.1, 0.75 - v * 0.1, 'phai'));
    them(x.spine, -0.03 * w);
  },
  nod: (x, { t, w }) => {
    const v = Math.sin(t * 6.2);
    them(x.head, v * 0.3 * w);
    them(x.neck, v * 0.12 * w);
  },
  shake: (x, { t, w }) => {
    const v = Math.sin(t * 7.5);
    them(x.head, 0, v * 0.38 * w);
    them(x.neck, 0, v * 0.14 * w);
  },
  think: (x, { t, w }) => {
    // chống cằm: khuỷu thấp, cẳng tay dựng lên vào trong → bàn tay tới cằm
    tay(x, 'phai', w, 0.24, 0, 0.3, the(1, 0.3, 0.45, 'phai'));
    them(x.head, -0.18 * w, Math.sin(t * 1.5) * 0.1 * w, 0.06 * w);
  },
  point: (x, { w }) => {
    tay(x, 'phai', w, 0.55, 0.06, 0.95);
    them(x.head, 0, -0.1 * w);
    them(x.spine, -0.04 * w);
  },
  celebrate: (x, { t, w }) => {
    const v = Math.sin(t * 9) * 0.03;
    tay(x, 'trai', w, 0.95 + v, 0, 0.1, the(1, 0.1, -0.1, 'trai'));
    tay(x, 'phai', w, 0.95 - v, 0, 0.1, the(1, 0.1, -0.1, 'phai'));
    them(x.spine, -0.08 * w);
    them(x.head, -0.1 * w, Math.sin(t * 5) * 0.14 * w);
  },
  type: (x, { t, w }) => {
    const v = Math.sin(t * 15);
    them(x.banTayT, (0.2 + v * 0.22) * w);
    them(x.banTayP, (0.2 - v * 0.22) * w);
    them(x.head, 0.12 * w);
  },
  sleep: (x, { t, w }) => {
    them(x.head, 0.2 * w, 0, 0.3 * w);
    them(x.neck, 0.14 * w);
    them(x.spine, 0.1 * w + Math.sin(t * 0.6) * 0.03 * w);
  },
};

/* --------------------------------------------------- cử chỉ cho từng emote */

/**
 * Cử chỉ bù cho 15 emote. Sáu emote giơ tay (`rat-vui`, `thanh-cong`,
 * `ngac-nhien`, `boi-roi`, `chao`, `dong-y`) đều có `doCao > 0.6` ⇒ bàn tay
 * phải cao hơn vai; đo bằng số trong `scripts/kiem-a2.mjs`.
 */
export const CU_CHI_EMOTE: Record<string, HamCuChi> = {
  vui: (x, { t, w }) => {
    const v = Math.sin(t * 9) * 0.04;
    tay(x, 'trai', w, 0.44 + v, 0.38, 0.45);
    tay(x, 'phai', w, 0.44 - v, 0.38, 0.45);
    them(x.spine, -0.05 * w);
  },
  'rat-vui': (x, { t, w }) => {
    const v = Math.sin(t * 12) * 0.05;
    tay(x, 'trai', w, 0.95 + v, 0, 0.08, the(1, 0.08, -0.12, 'trai'));
    tay(x, 'phai', w, 0.95 - v, 0, 0.08, the(1, 0.08, -0.12, 'phai'));
    them(x.spine, -0.1 * w);
    them(x.head, -0.12 * w, Math.sin(t * 6) * 0.2 * w);
  },
  buon: (x, { w }) => {
    them(x.spine, 0.2 * w);
    them(x.chest, 0.1 * w);
    them(x.neck, 0.18 * w);
    them(x.head, 0.18 * w);
    tay(x, 'trai', w * 0.7, 0.03, 0.14, 0.1);
    tay(x, 'phai', w * 0.7, 0.03, 0.14, 0.1);
  },
  'ngac-nhien': (x, { w }) => {
    // tay phải đưa lên che miệng: khuỷu đưa ra trước, cẳng tay dựng vào giữa
    tay(x, 'phai', w, 0.62, 0, 0.45, the(1, 0.25, 0.6, 'phai'));
    them(x.spine, -0.12 * w);
    them(x.head, -0.08 * w);
  },
  gian: (x, { t, w }) => {
    // nền là Punch_Cross (clip thật) — chỉ thêm lắc đầu + dậm chân
    them(x.head, 0, Math.sin(t * 7) * 0.16 * w);
    them(x.chanP, -(Math.max(0, Math.sin(t * 6)) ** 4) * 0.12 * w);
  },
  'suy-nghi': (x, { t, w }) => {
    tay(x, 'phai', w, 0.24, 0, 0.3, the(1, 0.3, 0.45, 'phai'));
    them(x.head, -0.18 * w, Math.sin(t * 1.4) * 0.12 * w);
  },
  'dong-y': (x, { u, w }) => {
    const v = Math.sin(Math.min(1, u) * Math.PI * 4);
    them(x.head, v * 0.3 * w);
    them(x.neck, v * 0.1 * w);
    // giơ ngón cái: bàn tay cao hơn vai, khuỷu gập, hướng ra trước
    // giơ ngón cái: khuỷu sát sườn, cẳng tay dựng thẳng lên trước ngực
    tay(x, 'phai', w, 0.62, 0, 0.3, the(1, 0.3, 0.1, 'phai'));
    them(x.banTayP, -0.3 * w, 0, -0.4 * w);
  },
  'tu-choi': (x, { t, w }) => {
    const v = Math.sin(t * 7);
    them(x.head, 0, v * 0.3 * w);
    // xua tay: bàn tay ngang mặt, lắc qua lại
    tay(x, 'trai', w, 0.5, 0, 0.4, the(0.9, 0.4, -0.1 + v * 0.25, 'trai'));
    them(x.banTayT, 0, v * 0.3 * w, 0);
  },
  chao: (x, { t, w }) => {
    const v = Math.sin(t * 9);
    tay(x, 'trai', w, 0.72, 0, 0.12, the(1, 0.2 + v * 0.1, -0.2, 'trai'));
    them(x.banTayT, 0, 0, v * 0.4 * w);
    them(x.spine, 0.1 * w);
    them(x.neck, 0.07 * w);
  },
  'ra-lenh': (x, { w }) => {
    tay(x, 'phai', w, 0.56, 0.04, 0.98);
    them(x.spine, -0.05 * w);
    them(x.head, -0.05 * w);
  },
  'thanh-cong': (x, { t, w }) => {
    const v = Math.max(0, Math.sin(t * 8));
    tay(x, 'phai', w, 0.92 + v * 0.06, 0, 0.08, the(1, 0.06, -0.05, 'phai'));
    them(x.spine, -0.1 * w - v * 0.04 * w);
    them(x.head, -0.14 * w);
  },
  'that-bai': (x, { w }) => {
    // nền là Crouch_Idle_Loop (ngồi thụp thật) — thêm ôm đầu bằng hai tay
    tay(x, 'trai', w, 0.68, 0, 0.3, the(1, 0.05, 0.55, 'trai'));
    tay(x, 'phai', w, 0.68, 0, 0.3, the(1, 0.05, 0.55, 'phai'));
    them(x.spine, 0.16 * w);
    them(x.head, 0.14 * w);
  },
  'boi-roi': (x, { t, w }) => {
    // gãi đầu: khuỷu hất ra ngoài, cẳng tay dựng lên vào trong → tay chạm đầu
    tay(x, 'phai', w, 0.75, 0, 0.1, the(1, -0.1, 0.5, 'phai'));
    them(x.banTayP, Math.sin(t * 9) * 0.3 * w);
    them(x.head, 0.05 * w, Math.sin(t * 2.4) * 0.2 * w, -0.08 * w);
  },
  met: (x, { u, w }) => {
    const vuon = Math.sin(Math.min(1, u) * Math.PI);
    tay(x, 'trai', w * vuon, 0.88, 0, 0.05, the(1, 0.05, -0.1, 'trai'));
    tay(x, 'phai', w * vuon, 0.88, 0, 0.05, the(1, 0.05, -0.1, 'phai'));
    them(x.head, -0.26 * w * Math.sin(Math.min(1, u * 1.4) * Math.PI));
    them(x.spine, -0.08 * w * vuon);
  },
  'cham-chu': (x, { t, w }) => {
    // nền là Driving_Loop (hai tay đưa ra trước như trên bàn) — thêm gõ nhịp
    them(x.banTayP, (0.1 + Math.sin(t * 7) * 0.3) * w);
    them(x.head, 0.12 * w);
  },
};

/* ------------------------------------------- cử chỉ nhịp khi nói (actor.say) */

/** Nhóm cử chỉ khi nói — spec 3.2b: "tay làm cử chỉ nhịp hợp với cảm xúc". */
export const NHOM_NOI = ['vui', 'buon', 'gian', 'ngac-nhien', 'binh-thuong'] as const;
export type NhomNoi = (typeof NHOM_NOI)[number];

/** Cảm xúc (tên emote) → nhóm cử chỉ khi nói. */
export function nhomNoiTuCamXuc(camXuc?: string): NhomNoi {
  switch (camXuc) {
    case 'vui':
    case 'rat-vui':
    case 'thanh-cong':
    case 'dong-y':
    case 'chao':
      return 'vui';
    case 'buon':
    case 'that-bai':
    case 'tu-choi':
    case 'met':
      return 'buon';
    case 'gian':
    case 'ra-lenh':
      return 'gian';
    case 'ngac-nhien':
    case 'boi-roi':
      return 'ngac-nhien';
    default:
      return 'binh-thuong';
  }
}

/**
 * Cử chỉ nhịp khi nói, **khác nhau theo nhóm cảm xúc** (vòng 1 chạy y hệt
 * nhau cho mọi cảm xúc — review mục 2.3):
 *
 * | nhóm | đầu | tay |
 * | --- | --- | --- |
 * | `vui` | gật nhanh, nghiêng nhiều | hai tay mở ra trước, nhịp nhanh biên độ lớn |
 * | `buon` | cúi, gật chậm yếu | tay gần như buông, nhịp rất nhỏ |
 * | `gian` | hất lên, lắc ngang | một tay chặt xuống dứt khoát theo nhịp |
 * | `ngac-nhien` | ngửa ra, ngẩng | hai tay nâng ngang vai, giữ im nhiều hơn |
 * | `binh-thuong` | gật nhẹ | nhịp tay luân phiên vừa phải (như A1) |
 */
export function cuChiNoi(x: BoXuong, nhom: NhomNoi, t: number, w = 1): void {
  const nhip = Math.max(0, Math.sin(t * 3.1)) ** 3;
  switch (nhom) {
    case 'vui': {
      them(x.head, Math.sin(t * 6.2) * 0.07 * w, 0, Math.sin(t * 1.1) * 0.06 * w);
      const k = w * (0.4 + nhip * 0.45);
      tay(x, 'trai', k, 0.46, 0.42, 0.5);
      tay(x, 'phai', k, 0.46, 0.42, 0.5);
      them(x.spine, -0.03 * w);
      break;
    }
    case 'buon': {
      them(x.head, 0.12 * w + Math.sin(t * 2.2) * 0.03 * w, 0, Math.sin(t * 0.7) * 0.05 * w);
      them(x.neck, 0.1 * w);
      them(x.spine, 0.14 * w);
      tay(x, 'trai', w * 0.3 * nhip, 0.12, 0.2, 0.25);
      break;
    }
    case 'gian': {
      them(x.head, -0.08 * w, Math.sin(t * 4.4) * 0.14 * w);
      tay(x, 'phai', w * (0.5 + nhip * 0.45), 0.58 - nhip * 0.25, 0.45, 0.6);
      them(x.spine, -0.05 * w);
      break;
    }
    case 'ngac-nhien': {
      them(x.head, -0.16 * w, Math.sin(t * 2.6) * 0.1 * w);
      tay(x, 'trai', w * 0.75, 0.6, 0.55, 0.4);
      tay(x, 'phai', w * 0.75, 0.6, 0.55, 0.4);
      break;
    }
    default: {
      them(x.head, Math.sin(t * 5.1) * 0.045 * w, 0, Math.sin(t * 0.85) * 0.035 * w);
      if (Math.sin(t * 0.37) > 0) {
        tay(x, 'phai', w * nhip * 0.5, 0.3, 0.45, 0.5);
      } else {
        tay(x, 'trai', w * nhip * 0.5, 0.3, 0.45, 0.5);
      }
      break;
    }
  }
}
