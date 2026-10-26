/**
 * bo-cuc.ts — **BẢNG BỐ CỤC** của CĂN NHÀ (D1, Issue #43): cái gì đặt ở đâu,
 * theo lưới 0,5 m. Boss 26/10: "nhân vật phát sáng chói mắt, nội thất lộn
 * xộn — đổi qua phong cách căn nhà ấm, đầy đủ nội thất".
 *
 * Bản D1 thay LAB VIỄN TƯỞNG (16×16 m, 3 vùng điều khiển/kho/trình diễn)
 * bằng MỘT CĂN NHÀ 1 TẦNG 14 × 10 m, 3 khu chức năng + hành lang:
 *   · `phong-khach` (x < -1): sofa, bàn trà, kệ TV, thảm, 2 cây chậu, đèn sàn.
 *   · `ban-lam-viec` (x > 1, z < -0,5): bàn làm việc, ghế, màn hình, kệ sách.
 *   · `bep` (x > 1, z > 0,5): tủ bếp, bếp, tủ lạnh, bàn ăn + ghế.
 *   · hành lang trung tâm `|x| ≤ 1` (rộng 2 m, đúng `HANH_LANG`) nối cửa ra
 *     vào (tường bắc, z = -5) với cửa sổ lớn (tường nam, z = +5).
 *
 * Giữ nguyên cơ chế cũ (B1, Issue #18): file này là DỮ LIỆU THUẦN, không
 * `import three`; `phong.ts` chỉ đọc bảng rồi dựng; `hopChan`/`truotVaCham`
 * phục vụ `actor.steer`/`nhanvat.ts` không đổi API.
 */

/** Bề ngang nhà theo trục X (m). */
export const ROOM_W = 14;
/** Bề sâu nhà theo trục Z (m). */
export const ROOM_D = 10;
/** Nửa bề ngang / nửa bề sâu (m) — tiện tính lề tường. */
export const NUA_RONG = ROOM_W / 2;
export const NUA_SAU = ROOM_D / 2;
/** Giữ tên cũ cho chỗ nào còn kiểm theo cạnh vuông (test B1 cũ dùng `NUA_PHONG`). */
export const NUA_PHONG = Math.max(NUA_RONG, NUA_SAU);
/** Ô lưới căn đồ (m). Mọi toạ độ trong bảng là bội số của `O_LUOI / 2`. */
export const O_LUOI = 1;
/** Lề tường: actor không đi sát mặt tường hơn số này (m). */
export const LE_TUONG = 0.5;
/** Hành lang trung tâm rộng bao nhiêu (m) — nối cửa ↔ cửa sổ, Issue #43. */
export const HANH_LANG = 2;
/** Nửa bề rộng hành lang (|x| ≤ số này thì coi là hành lang, phải luôn trống). */
export const NUA_HANH_LANG = HANH_LANG / 2;

export type TenVung = 'phong-khach' | 'ban-lam-viec' | 'bep' | 'hanh-lang';

/** Toạ độ mặt phẳng (m): `[x, z]`. `y` luôn là sàn (0) trong bảng này. */
export type Diem2 = readonly [number, number];

/**
 * Một khối nội thất trong cảnh.
 *
 * `kenney` + `cao`/`rong` nói cho `phong.ts` biết nạp model Kenney Furniture
 * Kit nào và chuẩn hoá về bao nhiêu MÉT (bài học 25/10, vẫn đúng ở D1: một
 * hệ số scale chung làm đồ phình to chắn khung hình). `chan` = có chắn đường
 * đi hay không (dựng hộp AABB cho `actor.steer`).
 */
export interface KhoiCanh {
  id: string;
  vung: TenVung;
  /** Tâm khối trên sàn (m). */
  tai: Diem2;
  /** Góc quay quanh trục đứng (độ, 0 = mặt khối hướng +Z). */
  quay: number;
  /** Tên model Kenney Furniture Kit (không có thì `phong.ts` tự dựng fallback). */
  kenney?: string;
  /** Model dự phòng nếu `kenney` không có trong kho đã tải. */
  kenneyPhu?: string;
  /** Chuẩn hoá theo chiều cao (m) — vật đứng: kệ, tủ, tủ lạnh, cây. */
  cao?: number;
  /** Chuẩn hoá theo bề ngang (m) — vật bè ngang: bàn, sofa, giường. */
  rong?: number;
  /** Trần bề ngang (m) sau khi đã chuẩn hoá theo `cao` — kẹp cả hai chiều. */
  rongToiDa?: number;
  /**
   * Hộp chắn đường: `[nửa bề ngang theo X cục bộ, nửa bề sâu theo Z cục bộ]`
   * tính bằng mét — `hopChan()` tự đổi trục khi `quay` là 90/270. Không khai =
   * đi qua được (ghế, cửa, thảm, đèn sàn — không chắn lối).
   */
  chan?: readonly [number, number];

  /* ------------------------------------------------- D1b (Issue #48) thêm */

  /**
   * Cao độ CHÂN khối so với sàn (m) — đồ treo tường (tranh, tủ bếp trên, bảng
   * ghim, máy hút mùi) và gối trên mặt sofa. Không khai = đứng trên sàn.
   */
  datY?: number;
  /**
   * Đặt **lên nóc** khối khác (id trong bảng này): `phong.ts` đo mặt trên THẬT
   * của khối kia rồi đặt lên đó. Đo thật, không viết số tay — mặt bàn Kenney
   * mỗi model một cao độ khác nhau. Khối đỡ phải đứng TRƯỚC trong bảng.
   */
  tren?: string;
  /**
   * Lệch khỏi tâm ô lưới (m, `[dx, dz]` theo trục thế giới). Chỉ dành cho ĐỒ
   * NHỎ bày trên mặt bàn/kệ — `kiemLuoi()` vẫn soi `tai`, nên lưới 0,5 m của
   * nội thất lớn không bị phá, mà cốc/sách/chuột vẫn bày được tự nhiên.
   */
  lech?: Diem2;
  /** Nhóm chất liệu phủ lên model (xem `chat-lieu.ts`). Không khai = gỗ. */
  chat?: 'go' | 'vai' | 'kim-loai' | 'tham' | 'nham';
  /** Nhuộm riêng phần VẢI của model sang màu này (đất/olive) — `nhuomVai()`. */
  mauVai?: number;
}

/**
 * Cửa sổ lớn tường NAM (z = +5) — không phải `KhoiCanh` (không chắn đường,
 * không phải nội thất rời): `phong.ts` đọc thẳng hằng số này để khoét tường +
 * dựng khung kính. Rộng 4 m, đủ cho nắng chiều tràn vào cả hành lang lẫn góc
 * phòng khách sát cửa sổ.
 */
export const CUA_SO = {
  tai: [-1, NUA_SAU] as Diem2,
  rong: 4,
  cao: 1.7,
  duoiSan: 0.55,
} as const;

/**
 * BẢNG KHỐI CẢNH — nguồn sự thật duy nhất cho `phong.ts`.
 *
 * Quy tắc tự áp: mọi khối phải thuộc một khu, và KHÔNG khối nào có
 * |x| < `NUA_HANH_LANG` (hành lang trung tâm phải luôn trống, nối cửa ↔ cửa
 * sổ) — trừ khối `cua` (đứng sát tường, không có `chan`).
 */
export const KHOI_CANH: readonly KhoiCanh[] = [
  /* ============================= PHÒNG KHÁCH (x < -1) ============================= */
  // kệ TV áp tường trái (tây), quay mặt vào phòng (+X) — Kenney không có
  // "tvStand" riêng, `cabinetTelevision` đúng là tủ kệ TV có khe màn hình.
  { id: 'ke-tivi', vung: 'phong-khach', tai: [-6.5, -0.5], quay: 90, kenney: 'cabinetTelevision', kenneyPhu: 'cabinetTelevisionDoors', cao: 0.55, rongToiDa: 1.4, chan: [0.7, 0.35] },
  // sofa 2-3 chỗ, quay mặt về kệ TV (-Z)
  { id: 'sofa', vung: 'phong-khach', tai: [-4.5, 1.5], quay: 180, kenney: 'loungeDesignSofa', kenneyPhu: 'loungeSofa', rong: 1.9, rongToiDa: 2.1, chan: [0.95, 0.5], chat: 'vai', mauVai: 0x7d7247 },
  // thảm trải dài từ bàn trà qua sofa — place `buc-trung-tam` đứng ở mép nam
  // (z 2,6, xem noi-dung.ts), KHÔNG chắn đường, không chạm hộp sofa (z ≤ 2,0).
  { id: 'tham', vung: 'phong-khach', tai: [-4.5, 1.5], quay: 0, kenney: 'rugRounded', kenneyPhu: 'rugRound', rong: 2.6, chat: 'tham' },
  // bàn trà giữa sofa và kệ TV
  { id: 'ban-tra', vung: 'phong-khach', tai: [-4.5, 0.5], quay: 0, kenney: 'tableCoffee', kenneyPhu: 'tableCoffeeGlass', cao: 0.38, rongToiDa: 1.1, chan: [0.55, 0.4], mauVai: 0x6b4a2f },
  // 2 cây chậu trang trí, không chắn đường
  { id: 'cay-1', vung: 'phong-khach', tai: [-6, 4], quay: 0, kenney: 'plantSmall1', kenneyPhu: 'plantSmall2', cao: 1.1 },
  { id: 'cay-2', vung: 'phong-khach', tai: [-2, 4], quay: 0, kenney: 'plantSmall2', kenneyPhu: 'plantSmall1', cao: 1.0 },
  // đèn sàn cạnh cửa sổ — NGUỒN BLOOM "rất nhẹ" DUY NHẤT được phép ở D1
  { id: 'den-san', vung: 'phong-khach', tai: [-1.5, 1.0], quay: 0, kenney: 'lampRoundFloor', kenneyPhu: 'lampSquareFloor', cao: 1.5 },

  /* ============================ GÓC LÀM VIỆC (x > 1, z < -0,5) ============================ */
  // bàn làm việc áp tường bắc, mặt bàn hướng vào phòng (+Z) — place `ban-dieu-khien`
  { id: 'ban-dieu-khien', vung: 'ban-lam-viec', tai: [4, -4.5], quay: 0, kenney: 'tableCross', kenneyPhu: 'desk', rong: 1.3, rongToiDa: 1.5, chan: [0.65, 0.35] },
  // ghế làm việc, quay mặt vào bàn (-Z)
  { id: 'ghe-2', vung: 'ban-lam-viec', tai: [4, -3.5], quay: 180, kenney: 'chairModernFrameCushion', kenneyPhu: 'chairDesk', cao: 0.9, chat: 'vai', mauVai: 0x7d7247 },
  // kệ sách áp tường đông — place `ke-module`
  { id: 'ke-module', vung: 'ban-lam-viec', tai: [6.5, -4], quay: 270, kenney: 'bookcaseOpen', kenneyPhu: 'bookcaseClosedWide', cao: 1.9, rongToiDa: 1.4, chan: [0.7, 0.35] },

  /* ================================= BẾP (x > 1, z > 0,5) ================================= */
  { id: 'tu-bep', vung: 'bep', tai: [6.5, 0.5], quay: 270, kenney: 'kitchenCabinet', kenneyPhu: 'kitchenCabinetDrawer', cao: 0.95, rongToiDa: 1.2, chan: [0.6, 0.35] },
  { id: 'bep-nau', vung: 'bep', tai: [6.5, 2.0], quay: 270, kenney: 'kitchenStove', kenneyPhu: 'kitchenStoveElectric', cao: 0.95, rongToiDa: 1.1, chan: [0.55, 0.35], chat: 'kim-loai' },
  { id: 'tu-lanh', vung: 'bep', tai: [6.5, 4.0], quay: 270, kenney: 'kitchenFridgeLarge', kenneyPhu: 'kitchenFridge', cao: 1.8, rongToiDa: 1.1, chan: [0.55, 0.4], chat: 'kim-loai' },
  // bàn ăn giữa khu bếp + 4 ghế quanh bàn (`ghe-1` là mốc đo seatY)
  { id: 'ban-an', vung: 'bep', tai: [3.5, 2.5], quay: 0, kenney: 'tableRound', kenneyPhu: 'table', rong: 1.2, rongToiDa: 1.3, chan: [0.6, 0.6] },
  { id: 'ghe-1', vung: 'bep', tai: [3.5, 1.5], quay: 0, kenney: 'chairModernCushion', kenneyPhu: 'chairDesk', cao: 0.88, chat: 'vai', mauVai: 0x8a6a42 },
  { id: 'ban-an-ghe-2', vung: 'bep', tai: [3.5, 3.5], quay: 180, kenney: 'chairModernCushion', kenneyPhu: 'chairDesk', cao: 0.88, chat: 'vai', mauVai: 0x8a6a42 },
  { id: 'ban-an-ghe-3', vung: 'bep', tai: [2.5, 2.5], quay: 90, kenney: 'chairModernCushion', kenneyPhu: 'chairDesk', cao: 0.88, chat: 'vai', mauVai: 0x8a6a42 },
  { id: 'ban-an-ghe-4', vung: 'bep', tai: [4.5, 2.5], quay: 270, kenney: 'chairModernCushion', kenneyPhu: 'chairDesk', cao: 0.88, chat: 'vai', mauVai: 0x8a6a42 },


  /* =================== D1b (Issue #48) — ĐỒ ĐẠC CHO NHÀ CÓ NGƯỜI Ở =================== */
  // Boss: "nhà thật đang có người ở, ấm, gọn mà đầy đặn". Mọi khối thêm vào
  // đều NGOÀI hành lang (|x| > 1) và không chồng hộp chắn nào đã có.

  /* --- phòng khách: 2 ghế đơn, bàn cạnh sofa + đèn bàn, gối, sách/cốc, cây, tranh --- */
  { id: 'ghe-don-1', vung: 'phong-khach', tai: [-6.5, 2.5], quay: 55, kenney: 'loungeChair', kenneyPhu: 'chairCushion', cao: 0.78, rongToiDa: 0.85, chan: [0.4, 0.4], chat: 'vai', mauVai: 0x8a6a42 },
  { id: 'ghe-don-2', vung: 'phong-khach', tai: [-3, 3], quay: 200, kenney: 'loungeDesignChair', kenneyPhu: 'loungeChair', cao: 0.78, rongToiDa: 0.85, chan: [0.4, 0.4], chat: 'vai', mauVai: 0x7d7247 },
  { id: 'ban-canh-sofa', vung: 'phong-khach', tai: [-6.5, 1], quay: 0, kenney: 'sideTable', kenneyPhu: 'sideTableDrawers', cao: 0.5, rongToiDa: 0.55, chan: [0.28, 0.28], mauVai: 0x6b4a2f },
  { id: 'den-ban-sofa', vung: 'phong-khach', tai: [-6.5, 1], tren: 'ban-canh-sofa', quay: 0, kenney: 'lampRoundTable', kenneyPhu: 'lampSquareTable', cao: 0.42 },
  // gối tựa: đặt theo cao độ mặt ngồi đo được của sofa (0,42 m), lệch khỏi tâm
  { id: 'goi-1', vung: 'phong-khach', tai: [-5, 1.5], lech: [0, -0.16], datY: 0.42, quay: 14, kenney: 'pillow', rong: 0.44, chat: 'vai', mauVai: 0xb08a4e },
  { id: 'goi-2', vung: 'phong-khach', tai: [-4, 1.5], lech: [0, -0.16], datY: 0.42, quay: -16, kenney: 'pillowBlue', kenneyPhu: 'pillow', rong: 0.44, chat: 'vai', mauVai: 0x6d7a52 },
  { id: 'sach-ban-tra', vung: 'phong-khach', tai: [-4.5, 0.5], lech: [-0.2, 0.02], tren: 'ban-tra', quay: 18, kenney: 'books', rong: 0.28, chat: 'nham' },
  { id: 'coc-tra', vung: 'phong-khach', tai: [-4.5, 0.5], lech: [0.2, -0.1], tren: 'ban-tra', quay: 0, rong: 0.1, chat: 'nham' },
  { id: 'cay-3', vung: 'phong-khach', tai: [-6.5, -3.5], quay: 0, kenney: 'pottedPlant', kenneyPhu: 'plantSmall3', cao: 1.35 },
  { id: 'tranh-1', vung: 'phong-khach', tai: [-7, 1], datY: 1.45, quay: 90 },
  { id: 'tranh-2', vung: 'phong-khach', tai: [-7, 2.5], datY: 1.45, quay: 90 },
  { id: 'tranh-3', vung: 'phong-khach', tai: [-3, -5], datY: 1.45, quay: 0 },

  /* --- bàn làm việc: máy tính, đèn bàn, sách, cốc, bảng ghim --- */
  { id: 'ban-phim', vung: 'ban-lam-viec', tai: [4, -4.5], lech: [0, 0.2], tren: 'ban-dieu-khien', quay: 0, kenney: 'computerKeyboard', rong: 0.42, chat: 'nham' },
  { id: 'chuot', vung: 'ban-lam-viec', tai: [4, -4.5], lech: [0.34, 0.2], tren: 'ban-dieu-khien', quay: 0, kenney: 'computerMouse', rong: 0.1, chat: 'nham' },
  { id: 'den-ban', vung: 'ban-lam-viec', tai: [4, -4.5], lech: [-0.52, -0.04], tren: 'ban-dieu-khien', quay: 20, kenney: 'lampSquareTable', kenneyPhu: 'lampRoundTable', cao: 0.42 },
  { id: 'sach-ban', vung: 'ban-lam-viec', tai: [4, -4.5], lech: [0.52, -0.06], tren: 'ban-dieu-khien', quay: -12, kenney: 'books', rong: 0.26, chat: 'nham' },
  { id: 'coc-ban', vung: 'ban-lam-viec', tai: [4, -4.5], lech: [0.3, -0.08], tren: 'ban-dieu-khien', quay: 0, rong: 0.1, chat: 'nham' },
  { id: 'bang-ghim', vung: 'ban-lam-viec', tai: [4, -5], datY: 1.3, quay: 0 },

  // sách XẾP TRÊN KỆ (kệ đổi sang `bookcaseOpen` để nhìn thấy ruột kệ)
  { id: 'sach-ke-1', vung: 'ban-lam-viec', tai: [6.5, -4], lech: [-0.08, -0.38], datY: 1.24, quay: 270, kenney: 'books', rong: 0.3, chat: 'nham' },
  { id: 'sach-ke-2', vung: 'ban-lam-viec', tai: [6.5, -4], lech: [-0.08, 0.36], datY: 0.82, quay: 262, kenney: 'books', rong: 0.3, chat: 'nham' },

  /* --- bếp: tủ dưới + bồn rửa, 2 tủ trên, máy hút mùi, lò vi sóng, cà phê --- */
  { id: 'tu-duoi-1', vung: 'bep', tai: [6.5, -1], quay: 270, kenney: 'kitchenSink', kenneyPhu: 'kitchenCabinetDrawer', cao: 0.95, rongToiDa: 1.0, chan: [0.5, 0.35] },
  { id: 'tu-tren-1', vung: 'bep', tai: [6.5, 0.5], datY: 1.5, quay: 270, kenney: 'kitchenCabinetUpper', kenneyPhu: 'kitchenCabinetUpperLow', cao: 0.7, rongToiDa: 1.0 },
  { id: 'tu-tren-2', vung: 'bep', tai: [6.5, -1], datY: 1.5, quay: 270, kenney: 'kitchenCabinetUpperDouble', kenneyPhu: 'kitchenCabinetUpper', cao: 0.7, rongToiDa: 1.0 },
  { id: 'hut-mui', vung: 'bep', tai: [6.5, 2], datY: 1.55, quay: 270, kenney: 'hoodModern', kenneyPhu: 'hoodLarge', cao: 0.55, rongToiDa: 1.0, chat: 'kim-loai' },
  { id: 'lo-vi-song', vung: 'bep', tai: [6.5, 0.5], lech: [-0.1, 0.28], tren: 'tu-bep', quay: 270, kenney: 'kitchenMicrowave', rong: 0.45, chat: 'kim-loai' },
  { id: 'may-ca-phe', vung: 'bep', tai: [6.5, -1], lech: [-0.1, 0.3], tren: 'tu-duoi-1', quay: 270, kenney: 'kitchenCoffeeMachine', cao: 0.3, chat: 'kim-loai' },
  { id: 'binh-hoa', vung: 'bep', tai: [3.5, 2.5], lech: [0, 0.16], tren: 'ban-an', quay: 0, kenney: 'plantSmall3', kenneyPhu: 'plantSmall1', cao: 0.34 },
  { id: 'trai-cay', vung: 'bep', tai: [3.5, 2.5], lech: [-0.26, -0.12], tren: 'ban-an', quay: 0, rong: 0.26, chat: 'nham' },

  /* --- hành lang: kệ giày (ghế băng), móc áo, thảm chùi chân --- */
  { id: 'ke-giay', vung: 'hanh-lang', tai: [2, -4.5], quay: 0, kenney: 'benchCushionLow', kenneyPhu: 'bench', rong: 1.0, rongToiDa: 1.1, chan: [0.5, 0.22], chat: 'vai', mauVai: 0x8a6a42 },
  { id: 'moc-ao', vung: 'hanh-lang', tai: [-2, -4.5], quay: 0, kenney: 'coatRackStanding', kenneyPhu: 'coatRack', cao: 1.72 },
  { id: 'tham-cua', vung: 'hanh-lang', tai: [1.5, -4], quay: 0, kenney: 'rugDoormat', rong: 0.95, chat: 'vai', mauVai: 0x6b5a3a },

  /* ================================ CỬA RA VÀO (tường bắc) ================================ */
  // place `cua` — KHÔNG có `chan`: cửa phải đi qua được.
  { id: 'cua', vung: 'hanh-lang', tai: [0, -5], quay: 0, kenney: 'doorway', kenneyPhu: 'wallDoorway', cao: 2.05, rongToiDa: 1.1 },
] as const;

/* ----------------------------------------------------------- hộp chắn đường */

/** Hộp chắn đường trên mặt sàn (m). */
export interface HopChan {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Mọi hộp chắn đường của cảnh — sinh từ `KHOI_CANH`. */
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
  return ra;
}

const HOP = /* @__PURE__ */ hopChan();

/** Trong phòng (đã trừ lề tường) thì giữ nguyên, ngoài thì kẹp vào — chữ nhật, không vuông. */
export function kepTrongPhong(x: number, z: number): [number, number] {
  const ghX = NUA_RONG - LE_TUONG;
  const ghZ = NUA_SAU - LE_TUONG;
  return [Math.max(-ghX, Math.min(ghX, x)), Math.max(-ghZ, Math.min(ghZ, z))];
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
 * thay vì dính cứng khi đi chéo vào góc — đúng cảm giác điều khiển mượt, và
 * không cần thư viện vật lý nào. (Giữ nguyên từ B1, Issue #18.)
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
  xem('cua-so', CUA_SO.tai);
  return lech;
}

/**
 * Hành lang trung tâm phải thoáng ≥ `HANH_LANG` m suốt chiều sâu nhà: không
 * hộp chắn nào được lấn vào dải `|x| < NUA_HANH_LANG`.
 */
export function kiemHanhLang(): string[] {
  const loi: string[] = [];
  for (const h of HOP) {
    if (h.x0 < NUA_HANH_LANG && h.x1 > -NUA_HANH_LANG) {
      loi.push(`${h.id} lấn hành lang (x ${h.x0}…${h.x1})`);
    }
  }
  return loi;
}
