/**
 * bo-cuc.ts — **BẢNG BỐ CỤC** của lab: cái gì đặt ở đâu, theo lưới 1 m.
 *
 * Boss 25/10 (Issue #18): "không gian và nội thất lộn xộn". Nguyên nhân gốc là
 * `phong.ts` vừa *quyết định* vị trí vừa *dựng hình*: mỗi lần thêm một khối
 * Kenney cho đẹp là một toạ độ mới viết tay ngay giữa code dựng, nên không ai
 * (kể cả máy) kiểm được "phòng có thẳng hàng không, đường đi còn thoáng không".
 *
 * Bản này tách đôi:
 *   · `bo-cuc.ts` (file này) = **dữ liệu thuần**, không `import three`. Mọi
 *     toạ độ nằm trên **lưới 1 m** (cho phép nửa ô 0,5 m cho chỗ đứng trước
 *     bàn/kệ) — có test `kiemLuoi()` canh, lệch lưới là test đỏ.
 *   · `phong.ts` chỉ còn *đặt theo bảng*: đọc `KHOI_CANH`, dựng đúng từng khối.
 *
 * Ba vùng (Issue #18 mục 1):
 *   A — `trinh-dien`: bục trung tâm TRỐNG ở gốc toạ độ + 3 hologram phía sau.
 *   B — `dieu-khien`: bàn điều khiển cong + 2 ghế, **bên phải** (x > 0).
 *   C — `kho`: kệ module + 2 máy phát, **bên trái** (x < 0).
 *   + một DÃY TỦ duy nhất sát tường sau (z = -7,5) — chỗ dồn hết khối Kenney
 *     lẻ của bản cũ. Không còn khối nào rải giữa phòng.
 *
 * Đường đi: hai hành lang dọc hai bên bục, rộng `HANH_LANG` = 3,2 m (mép bục
 * 1,4 m → mép vùng 4,6 m). Nửa phòng phía trước (z > 2) để trống hoàn toàn cho
 * camera toàn cảnh. `kiemHanhLang()` kiểm lại bằng số.
 */

/** Cạnh phòng (m) — phải khớp `KICH_THUOC_PHONG` của `phong.ts`. */
export const CANH_PHONG = 16;
/** Nửa cạnh phòng (m). */
export const NUA_PHONG = CANH_PHONG / 2;
/** Ô lưới căn đồ (m). Mọi toạ độ trong bảng là bội số của `O_LUOI / 2`. */
export const O_LUOI = 1;
/** Lề tường: actor không đi sát mặt tường hơn số này (m). */
export const LE_TUONG = 0.6;
/** Bán kính mặt bục trung tâm (m) — vùng A phải TRỐNG trong bán kính này. */
export const BAN_KINH_BUC = 1.4;
/** Hành lang tối thiểu giữa bục và mép vùng B/C (m) — Issue #18: ≥ 3 m. */
export const HANH_LANG = 3.2;

export type TenVung = 'trinh-dien' | 'dieu-khien' | 'kho';

/** Toạ độ mặt phẳng (m): `[x, z]`. `y` luôn là sàn (0) trong bảng này. */
export type Diem2 = readonly [number, number];

/**
 * Một khối nội thất trong cảnh.
 *
 * `kenney` + `cao`/`rong` nói cho `phong.ts` biết nạp model nào và chuẩn hoá
 * về bao nhiêu MÉT (bài học 25/10: một hệ số scale chung làm kệ phình 6–8 m).
 * `chan` = có chắn đường đi hay không (dựng hộp AABB cho `actor.steer`).
 */
export interface KhoiCanh {
  id: string;
  vung: TenVung | 'tuong-sau';
  /** Tâm khối trên sàn (m). */
  tai: Diem2;
  /** Góc quay quanh trục đứng (độ, 0 = mặt khối hướng +Z). */
  quay: number;
  /** Tên model Kenney Space Kit (không có thì `phong.ts` tự dựng fallback). */
  kenney?: string;
  /** Model dự phòng nếu `kenney` không có trong kho đã tải. */
  kenneyPhu?: string;
  /** Chuẩn hoá theo chiều cao (m) — vật đứng: kệ, máy phát, cột, tủ. */
  cao?: number;
  /** Chuẩn hoá theo bề ngang (m) — vật bè ngang: bàn, bệ. */
  rong?: number;
  /**
   * Trần bề ngang (m) sau khi đã chuẩn hoá theo `cao`.
   *
   * Bài học 25/10 vòng 2: chuẩn hoá theo CHIỀU CAO thôi là chưa đủ. Model
   * Kenney như `structure` bè ngang gấp 3 lần chiều cao, nên "tủ cao 1,3 m"
   * hoá ra rộng gần 4 m — năm cái xếp hàng thành một bức tường chắn nửa
   * phòng (ảnh thử B1). Có `rongToiDa` thì `phong.ts` thu nhỏ thêm cho vừa.
   */
  rongToiDa?: number;
  /**
   * Hộp chắn đường: `[nửa bề ngang theo X cục bộ, nửa bề sâu theo Z cục bộ]`
   * tính bằng mét — `hopChan()` tự đổi trục khi `quay` là 90/270. Không khai =
   * đi qua được (ghế, bục, cửa).
   */
  chan?: readonly [number, number];
}

/**
 * BÀN ĐIỀU KHIỂN CONG (vùng B) — ghép `soManh` khối tự dựng thành vòng cung
 * (Space Kit không có bàn cong; lý do không ghép model Kenney ghi trong
 * `phong.ts`). Bảng chỉ khai **điểm giữa mặt bàn + hướng + bán kính + góc mở**,
 * `phong.ts` tính chỗ từng mảnh: toạ độ từng mảnh không phải quyết định bố
 * cục, nên không nằm trong bảng.
 */
export const BAN_CONG = {
  /** Điểm giữa MẶT BÀN trên sàn (không phải tâm vòng cung). */
  tai: [6, -1] as Diem2,
  /** Mặt bàn hướng −X, tức mở về phía tâm phòng: người vận hành đứng ở −X. */
  quay: 270,
  /** Bán kính vòng cung; tâm cung nằm PHÍA SAU mặt bàn (về +X, sát tường). */
  banKinh: 2.6,
  gocMo: 76,
  soManh: 5,
  cao: 0.92,
  /** Bề ngang mỗi mảnh ghép (m) — 5 mảnh × 0,95 m ≈ phủ kín cung 3,45 m. */
  rongManh: 0.95,
  /** Bề sâu mặt bàn (m) — dùng dựng hộp chắn. */
  day: 0.9,
} as const;

/**
 * Ba hologram của vùng A: treo **phía sau bục**, nhìn từ camera toàn cảnh
 * (camera ở +Z nên "sau" là −Z). `man-hinh.ts` đọc đúng bảng này.
 */
export const HOLOGRAM = [
  { id: 'main', tai: [0, -5] as Diem2, y: 2.4, quay: 0, rong: 3.4 },
  { id: 'left', tai: [-3, -4.5] as Diem2, y: 2.05, quay: 22, rong: 2.4 },
  { id: 'right', tai: [3, -4.5] as Diem2, y: 2.05, quay: -22, rong: 2.4 },
] as const;

/**
 * BẢNG KHỐI CẢNH — nguồn sự thật duy nhất cho `phong.ts`.
 *
 * Quy tắc tự áp: **tối đa 12 khối**, mỗi khối phải thuộc một vùng, và không
 * khối nào có |x| < 2,2 ở phía trước z > -3 (giữ trống trục camera ↔ bục).
 */
export const KHOI_CANH: readonly KhoiCanh[] = [
  /* ---------------- vùng B — điều khiển (bên phải) ---------------- */
  // 2 ghế đẩu trước bàn cong, cách nhau 1 ô lưới × 2
  { id: 'ghe-1', vung: 'dieu-khien', tai: [5, -2.5], quay: 270, kenney: 'desk_chairStool', kenneyPhu: 'desk_chair', cao: 0.45 },
  { id: 'ghe-2', vung: 'dieu-khien', tai: [5, 0.5], quay: 270, kenney: 'desk_chairStool', kenneyPhu: 'desk_chair', cao: 0.45 },
  // cột ống cao ở góc sau phải — đóng khung vùng B, sát tường
  { id: 'cot-phai', vung: 'dieu-khien', tai: [7, -6], quay: 0, kenney: 'pipe_supportHigh', cao: 4.6, rongToiDa: 1, chan: [0.45, 0.45] },

  /* ---------------- vùng C — kho (bên trái) ---------------- */
  { id: 'ke-module', vung: 'kho', tai: [-7, -1], quay: 90, kenney: 'structure_closed', kenneyPhu: 'structure', cao: 2.6, rongToiDa: 2.8, chan: [1.4, 0.5] },
  { id: 'may-phat-lon', vung: 'kho', tai: [-7, -4.5], quay: 90, kenney: 'machine_generatorLarge', kenneyPhu: 'machine_generator', cao: 2.8, rongToiDa: 1.8, chan: [0.9, 0.8] },
  { id: 'may-phat', vung: 'kho', tai: [-7, 2], quay: 90, kenney: 'machine_generator', cao: 2.1, rongToiDa: 1.4, chan: [0.7, 0.7] },
  { id: 'cot-trai', vung: 'kho', tai: [-7, -6], quay: 0, kenney: 'pipe_supportHigh', cao: 4.6, rongToiDa: 1, chan: [0.45, 0.45] },
  // khung cửa áp tường trái phía trước (place `cua`)
  { id: 'cua', vung: 'kho', tai: [-7.5, 5], quay: 90, kenney: 'gate_simple', cao: 3.4, rongToiDa: 3.2 },

  /* ---------------- dãy tủ sát tường sau ---------------- */
  // Chỗ dồn mọi khối Kenney lẻ của bản cũ (tinh thể rải giữa phòng, structure
  // đứng một mình…): một DÃY 5 tủ thấp 1,3 m thẳng hàng trên lưới, z = -7,5.
  { id: 'tu-1', vung: 'tuong-sau', tai: [-4, -7.5], quay: 0, kenney: 'machine_barrel', kenneyPhu: 'machine_wireless', cao: 1.3, rongToiDa: 1.2, chan: [0.6, 0.4] },
  { id: 'tu-2', vung: 'tuong-sau', tai: [-2, -7.5], quay: 0, kenney: 'machine_barrel', kenneyPhu: 'machine_wireless', cao: 1.3, rongToiDa: 1.2, chan: [0.6, 0.4] },
  { id: 'tu-3', vung: 'tuong-sau', tai: [0, -7.5], quay: 0, kenney: 'machine_barrel', kenneyPhu: 'machine_wireless', cao: 1.3, rongToiDa: 1.2, chan: [0.6, 0.4] },
  { id: 'tu-4', vung: 'tuong-sau', tai: [2, -7.5], quay: 0, kenney: 'machine_barrel', kenneyPhu: 'machine_wireless', cao: 1.3, rongToiDa: 1.2, chan: [0.6, 0.4] },
  { id: 'tu-5', vung: 'tuong-sau', tai: [4, -7.5], quay: 0, kenney: 'machine_barrel', kenneyPhu: 'machine_wireless', cao: 1.3, rongToiDa: 1.2, chan: [0.6, 0.4] },
] as const;

/** Cụm tinh thể trang trí ĐẶT TRÊN kệ module (không rải sàn nữa). */
export const TINH_THE_TREN_KE = {
  tai: [-6.95, -1] as Diem2,
  /** Cao độ 3 tầng kệ (m). */
  tang: [0.6, 1.35, 2.1] as const,
  /** Lệch dọc theo mặt kệ (m) để 3 viên không trùng chỗ. */
  lech: [-0.8, 0, 0.8] as const,
  cao: 0.34,
} as const;

/* ----------------------------------------------------------- hộp chắn đường */

/** Hộp chắn đường trên mặt sàn (m). */
export interface HopChan {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * Mọi hộp chắn đường của cảnh — sinh từ `KHOI_CANH` + bàn cong.
 *
 * Bàn cong không có khối nào trong bảng (phong.ts tự ghép 5 mảnh) nên hộp của
 * nó khai tay ở đây, bọc đúng vòng cung: tâm `BAN_CONG.tai`, bán kính 2,6 m,
 * mở 76° về −X.
 */
export function hopChan(): HopChan[] {
  const ra: HopChan[] = [];
  for (const k of KHOI_CANH) {
    if (!k.chan) continue;
    const [rx, rz] = k.chan;
    // `quay` 90/270 thì hộp xoay ngang theo
    const ngang = Math.abs(Math.round(k.quay / 90)) % 2 === 1;
    const ax = ngang ? rz : rx;
    const az = ngang ? rx : rz;
    ra.push({ id: k.id, x0: k.tai[0] - ax, x1: k.tai[0] + ax, z0: k.tai[1] - az, z1: k.tai[1] + az });
  }
  // Bàn điều khiển cong: `tai` là điểm giữa MẶT bàn, cung bè ngang
  // `r·sin(gocMo/2)` về hai bên và dày `day` theo trục hướng mặt bàn.
  const [bx, bz] = BAN_CONG.tai;
  const be = BAN_CONG.banKinh * Math.sin((BAN_CONG.gocMo * Math.PI) / 360) + 0.4;
  const day = BAN_CONG.day;
  ra.push({
    id: 'ban-dieu-khien',
    x0: bx - day / 2,
    x1: bx + day / 2 + 0.5,
    z0: bz - be,
    z1: bz + be,
  });
  return ra;
}

const HOP = /* @__PURE__ */ hopChan();

/** Trong phòng (đã trừ lề tường) thì giữ nguyên, ngoài thì kẹp vào. */
export function kepTrongPhong(x: number, z: number): [number, number] {
  const gh = NUA_PHONG - LE_TUONG;
  return [
    Math.max(-gh, Math.min(gh, x)),
    Math.max(-gh, Math.min(gh, z)),
  ];
}

/** Điểm (x, z) có nằm trong một hộp chắn nào không (nở thêm `banKinh` m). */
export function biChan(x: number, z: number, banKinh = 0.3): string | null {
  for (const h of HOP) {
    if (x > h.x0 - banKinh && x < h.x1 + banKinh && z > h.z0 - banKinh && z < h.z1 + banKinh) {
      return h.id;
    }
  }
  return null;
}

/**
 * Trượt dọc vật cản: thử dời theo trục X trước, rồi trục Z.
 *
 * Giải từng trục (chứ không huỷ cả bước đi) để nhân vật **men theo mép bàn**
 * thay vì dính cứng khi đi chéo vào góc — đúng cảm giác điều khiển mượt mà
 * Issue #18 mục 2 đòi, và không cần thư viện vật lý nào.
 */
export function truotVaCham(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  banKinh = 0.3,
): [number, number] {
  const [cx, cz] = kepTrongPhong(x1, z1);
  let x = x0;
  let z = z0;
  if (!biChan(cx, z, banKinh)) x = cx;
  if (!biChan(x, cz, banKinh)) z = cz;
  // bị chặn cả hai trục: đứng yên tại chỗ cũ (không đẩy xuyên)
  return [x, z];
}

/* -------------------------------------------------------------- tự kiểm tra */

/** Mọi toạ độ trong bảng phải nằm trên lưới nửa ô (0,5 m). Trả danh sách lệch. */
export function kiemLuoi(): string[] {
  const lech: string[] = [];
  const khop = (v: number) => Math.abs(v / (O_LUOI / 2) - Math.round(v / (O_LUOI / 2))) < 1e-9;
  const xem = (ten: string, d: Diem2) => {
    if (!khop(d[0]) || !khop(d[1])) lech.push(`${ten} = [${d[0]}, ${d[1]}]`);
  };
  for (const k of KHOI_CANH) xem(k.id, k.tai);
  for (const h of HOLOGRAM) xem(`hologram:${h.id}`, h.tai);
  xem('ban-dieu-khien', BAN_CONG.tai);
  return lech;
}

/**
 * Hành lang hai bên bục phải thoáng ≥ `HANH_LANG` m: không hộp chắn nào được
 * lấn vào dải |x| < `BAN_KINH_BUC + HANH_LANG` ở khoảng z của bục (−2…+2).
 */
export function kiemHanhLang(): string[] {
  const loi: string[] = [];
  const bien = BAN_KINH_BUC + HANH_LANG;
  for (const h of HOP) {
    const chongZ = h.z1 > -2 && h.z0 < 2;
    if (!chongZ) continue;
    if (h.x0 < bien && h.x1 > -bien) {
      loi.push(`${h.id} lấn hành lang (x ${h.x0}…${h.x1})`);
    }
  }
  return loi;
}
