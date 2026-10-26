/**
 * bo-cuc.ts — **BẢNG BỐ CỤC** của CĂN NHÀ (D1 #43 → D1b #48 → **F1 #56**),
 * theo lưới 0,5 m. File là DỮ LIỆU THUẦN, không `import three`; `phong.ts`
 * chỉ đọc bảng rồi dựng.
 *
 * F1 (Issue #56 mục 1) — Boss xem bản D1b trên Firefox: **"nội thất đồ đạc
 * tùm lum, thiết kế kỳ"**. Bản vẽ 2D + chẩn đoán 6 lỗi bố cục của D1b nằm ở
 * `docs/f1/so-do.md`; bảng dưới đây là bản vẽ đó viết thành số.
 *
 * BA NGUYÊN TẮC F1 (kiểm được bằng số, xem `kiemCum()`/`kiemLoiDi()`):
 *   1. Mỗi món **hoặc sát tường ≤ 0,35 m, hoặc thuộc một cụm** (nằm trong mép
 *      thảm, đặt trên/dưới món khác, hoặc cách món anh em ≤ 0,8 m). KHÔNG món
 *      nào đứng lẻ giữa sàn — đây đúng là chỗ D1b sai (`ghe-don-2`, `cay-2`,
 *      `den-san` mỗi món một nơi).
 *   2. **Lối đi ≥ 1,2 m** giữa hai cụm; **hành lang trung tâm 2 m** (`|x| ≤ 1`)
 *      trống suốt từ cửa (tường bắc) tới cửa sổ lớn (tường nam).
 *   3. **Một tông**: gỗ óc chó ấm · vải đất/kem · điểm olive nhạt. Không xanh
 *      dương ở đâu (`chat-lieu.ts: donTongAm()` chặn ở gốc).
 *
 * BỐN CỤM + hành lang:
 *   · `phong-khach` (x < −1): kệ TV sát tường tây ↔ sofa 3 chỗ đối diện, bàn
 *     trà chính giữa, 2 ghế đơn vuông góc hai đầu, **thảm 3,4 m phủ cả cụm**.
 *   · `ban-lam-viec` (x 1…3,7, sát tường bắc): kệ sách liền bàn + ghế + màn hình.
 *   · `bep` (góc đông-bắc): **bếp chữ L** hai nhánh liền mạch, tủ lạnh ở đầu;
 *     cụm bàn ăn 4 ghế + tủ bát cách dãy bếp 1,35 m.
 *   · `hanh-lang`: cửa ra vào + kệ giày/móc áo/thảm chùi chân sát tường bắc.
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
   * Cao độ CHÂN khối so với sàn (m) — **chỉ cho đồ treo tường** (tranh, tủ bếp
   * trên, bảng ghim, máy hút mùi, sách trên kệ). Không khai = đứng trên sàn.
   *
   * ĐỪNG dùng `datY` cho đồ bày trên một món khác: số ghi tay là số của món ở
   * cỡ CŨ, hạ món đỡ xuống là đồ treo lơ lửng mà không test nào báo. Gối sofa
   * từng khai `datY: 0.42` (mặt ngồi sofa cao 0,9 m); G1 hạ sofa về `cao: 0.47`
   * ⇒ mặt ngồi 0,2585 m, gối treo **16 cm** trên không khí (review PR #70
   * CHẶN 2). Đồ bày lên món khác phải dùng `tren` (nóc) hoặc `trenGhe` (mặt
   * ngồi) để ĐO thật.
   */
  datY?: number;
  /**
   * Đặt **lên nóc** khối khác (id trong bảng này): `phong.ts` đo mặt trên THẬT
   * của khối kia rồi đặt lên đó. Đo thật, không viết số tay — mặt bàn Kenney
   * mỗi model một cao độ khác nhau. Khối đỡ phải đứng TRƯỚC trong bảng.
   */
  tren?: string;
  /**
   * Đặt lên **MẶT NGỒI** của một ghế/sofa (id trong bảng này) — khác `tren` là
   * nóc (lưng tựa). `phong.ts` đo mặt ngồi thật trên chính model vừa dựng
   * (cùng phép đo `actor.sit` dùng), nên gối/đệm luôn nằm đúng chỗ người ngồi
   * dù ghế đổi cỡ. Khối đỡ phải đứng TRƯỚC trong bảng.
   */
  trenGhe?: string;
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
  /**
   * F1 (#56) — khối này là CÂY/LÁ: `chat-lieu.ts` mới được phép xoay sắc xanh
   * lục của nó về xanh lục DỊU `0x6f8f5a`. Với mọi khối KHÁC, sắc xanh lục
   * (và lam, tím) bị xoay hẳn về màu đất — nếu không thì model `kitchenFridge`
   * của Kenney (vốn xanh ngọc) ra một cái **tủ lạnh xanh lá** giữa bếp gỗ ấm,
   * đúng lỗi thấy ở ảnh thử F1 vòng 1.
   */
  cay?: true;
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
 * DÃY BẾP CHỮ L (F1, Issue #56) — hai nhánh để `phong.ts` dựng **mặt bếp +
 * backsplash LIỀN MẠCH** che hết khe giữa các cục tủ.
 *
 * Bản D1b viết số tay trong `phong.ts` (`zTu = -1.6 … zDen = 2.6`, chỉ nhánh
 * đông) — bếp F1 chuyển sang góc đông-bắc nên số đó lệch hẳn ra giữa phòng.
 * Giờ nguồn sự thật nằm ở đây, `phong.ts` chỉ đọc.
 *
 * `truc: 'z'` = nhánh chạy dọc theo Z, áp tường ĐÔNG (x = +NUA_RONG).
 * `truc: 'x'` = nhánh chạy ngang theo X, áp tường BẮC (z = −NUA_SAU).
 */
export const DAY_BEP = {
  /** Cao độ MẶT bếp (m) — khớp `cao: 0.95` của dãy tủ dưới. */
  caoMat: 0.962,
  /** Bề sâu mặt bếp (m). */
  sau: 0.76,
  /** Chiều cao dải backsplash tính từ mặt bếp lên chân tủ trên (m). */
  caoOp: 0.52,
  nhanh: [
    { truc: 'z', tu: -NUA_SAU, den: 0, tuong: 'dong' },
    { truc: 'x', tu: 4.9, den: NUA_RONG, tuong: 'bac' },
  ] as ReadonlyArray<{
    truc: 'x' | 'z';
    tu: number;
    den: number;
    tuong: 'dong' | 'bac';
  }>,
} as const;

/**
 * BẢNG KHỐI CẢNH — nguồn sự thật duy nhất cho `phong.ts`.
 *
 * Quy tắc tự áp: mọi khối phải thuộc một khu, và KHÔNG khối nào có
 * |x| < `NUA_HANH_LANG` (hành lang trung tâm phải luôn trống, nối cửa ↔ cửa
 * sổ) — trừ khối `cua` (đứng sát tường, không có `chan`).
 */
export const KHOI_CANH: readonly KhoiCanh[] = [
  /* ========================= PHÒNG KHÁCH — MỘT CỤM QUANH THẢM =========================
   * Trục của cụm: kệ TV sát tường tây (x −6,5) ↔ sofa 3 chỗ đối diện (x −3,0),
   * bàn trà đúng giữa (x −4,5), 2 ghế đơn vuông góc hai đầu (z −0,5 / +2,5),
   * thảm 3,4 m phủ hết (x −6,2…−2,8 · z −0,2…+2,2).
   * D1b sai ở đây: sofa quay 180° còn kệ TV quay 90° → hai món vuông góc nhau.
   */
  // kệ TV áp tường tây, mặt quay vào phòng (+X). KHÔNG khai thêm khối "tivi"
  // ở đây: `man-hinh.ts` đã neo sẵn màn hình `tivi` lên `ke-tivi`
  // (`MAC_DINH_MAN_HINH`) — khai nữa là hai cái TV chồng lên nhau (ảnh thử F1).
  { id: 'ke-tivi', vung: 'phong-khach', tai: [-6.5, 1], quay: 90, kenney: 'cabinetTelevision', kenneyPhu: 'cabinetTelevisionDoors', cao: 0.55, rongToiDa: 1.6, chan: [0.8, 0.28] },
  // tranh treo tường tây, HAI BÊN kệ TV (không có tường sau sofa — xem so-do.md mục 4.1)
  { id: 'tranh-1', vung: 'phong-khach', tai: [-7, -0.5], datY: 1.5, quay: 90 },
  { id: 'tranh-2', vung: 'phong-khach', tai: [-7, 2.5], datY: 1.5, quay: 90 },
  // thảm trải TRƯỚC (đứng trước sofa trong bảng cho `gopTinh` xếp liền) — phủ
  // cả cụm nên sofa dù không sát tường vẫn KHÔNG lẻ giữa sàn.
  { id: 'tham', vung: 'phong-khach', tai: [-4.5, 1], quay: 0, kenney: 'rugRectangle', kenneyPhu: 'rugRounded', rong: 3.4, chat: 'tham' },
  // sofa 3 chỗ, mặt quay ĐÚNG về kệ TV (−X), cách 3,2 m — khoảng nhìn TV thật
  { id: 'sofa', vung: 'phong-khach', tai: [-3, 1], quay: 270, kenney: 'loungeSofaLong', kenneyPhu: 'loungeDesignSofa', cao: 0.47, rongToiDa: 1.7, chan: [0.85, 0.34], chat: 'vai', mauVai: 0xd8c6a8 },
  // gối tựa trên mặt ngồi sofa (0,42 m đo được) — 1 kem + 1 olive nhạt làm điểm
  // gối tựa NẰM TRÊN MẶT NGỒI sofa — `trenGhe` đo thật, không ghi số tay
  // (xem ghi chú ở `datY`: số 0,42 cũ là của sofa cao 0,9 m, hạ sofa là gối treo)
  { id: 'goi-1', vung: 'phong-khach', tai: [-3, 0.5], lech: [0.15, 0], trenGhe: 'sofa', quay: 268, kenney: 'pillow', rong: 0.3, chat: 'vai', mauVai: 0xb08a4e },
  { id: 'goi-2', vung: 'phong-khach', tai: [-3, 1.5], lech: [0.15, 0], trenGhe: 'sofa', quay: 274, kenney: 'pillow', rong: 0.3, chat: 'vai', mauVai: 0x7d8a5e },
  // bàn trà CHÍNH GIỮA sofa ↔ TV; mép đông cách mặt sofa 0,45 m (đúng cỡ thật)
  { id: 'ban-tra', vung: 'phong-khach', tai: [-4, 1], quay: 0, kenney: 'tableCoffee', kenneyPhu: 'tableCoffeeGlass', cao: 0.26, rongToiDa: 0.85, chan: [0.43, 0.29], mauVai: 0x6b4a2f },
  { id: 'sach-ban-tra', vung: 'phong-khach', tai: [-4, 1], lech: [-0.2, 0.02], tren: 'ban-tra', quay: 18, kenney: 'books', rong: 0.28, chat: 'nham' },
  { id: 'coc-tra', vung: 'phong-khach', tai: [-4, 1], lech: [0.2, -0.1], tren: 'ban-tra', quay: 0, rong: 0.1, chat: 'nham' },
  // 2 ghế đơn VUÔNG GÓC sofa, hai đầu bàn trà. G1 (#56): nội thất thu về cỡ
  // chibi nên khe sofa↔bàn trà↔ghế đơn nở ra — kéo cả ba vào cho cụm chặt lại
  // (bàn trà −4,5 → −4,0; ghế đơn z ±1,5 → ±1,0 quanh bàn trà).
  { id: 'ghe-don-1', vung: 'phong-khach', tai: [-4, 0], quay: 25, kenney: 'loungeChair', kenneyPhu: 'chairCushion', cao: 0.47, rongToiDa: 0.62, chan: [0.3, 0.3], chat: 'vai', mauVai: 0xa98a66 },
  { id: 'ghe-don-2', vung: 'phong-khach', tai: [-4, 2], quay: 205, kenney: 'loungeDesignChair', kenneyPhu: 'loungeChair', cao: 0.47, rongToiDa: 0.62, chan: [0.3, 0.3], chat: 'vai', mauVai: 0xa98a66 },
  // đèn sàn CẠNH ghế đơn 1 (0,8 m) — đúng chỗ đèn đọc sách, không đứng lẻ
  // G1 (#56): đèn sàn theo ghế đơn 1 về [-5, 0] (ghế vừa kéo vào cụm) và hạ
  // 1,5 → 1,05 m cho vừa người chibi cao ~1,25 m. Đèn điểm ấm trong `world.ts`
  // phải dời theo — chúng là MỘT chụp đèn, không phải hai thứ.
  { id: 'den-san', vung: 'phong-khach', tai: [-5, 0], quay: 0, kenney: 'lampRoundFloor', kenneyPhu: 'lampSquareFloor', cao: 1.05 },
  // bàn cạnh sofa áp SÁT đầu sofa (khe 0,07 m) + đèn bàn trên nóc
  { id: 'ban-canh-sofa', vung: 'phong-khach', tai: [-3, 2.5], quay: 270, kenney: 'sideTable', kenneyPhu: 'sideTableDrawers', cao: 0.34, rongToiDa: 0.38, chan: [0.2, 0.2], mauVai: 0x6b4a2f },
  { id: 'den-ban-sofa', vung: 'phong-khach', tai: [-3, 2.5], tren: 'ban-canh-sofa', quay: 0, kenney: 'lampRoundTable', kenneyPhu: 'lampSquareTable', cao: 0.3 },
  // cây ở HAI GÓC tường tây (D1b để cây giữa sàn ở x −2 / z 4)
  { id: 'cay-1', vung: 'phong-khach', tai: [-6.5, 4], quay: 0, kenney: 'pottedPlant', kenneyPhu: 'plantSmall3', cao: 1.35, cay: true },
  { id: 'cay-2', vung: 'phong-khach', tai: [-6.5, -3.5], quay: 0, kenney: 'plantSmall1', kenneyPhu: 'plantSmall2', cao: 1.1, cay: true },
  { id: 'tranh-3', vung: 'phong-khach', tai: [-5, -5], datY: 1.5, quay: 0 },
  /*
   * G1 (#56): **BỎ đèn trần** (`den-tran-khach`). Boss 26/10: "không cần làm
   * trần nhà vì nhìn rất vướng" — trần đi thì đèn âm trần treo lơ lửng giữa
   * trời. Ánh sáng khu này đã có đèn sàn cạnh ghế đơn (`denAm` trong
   * `world.ts`), không mất chỗ nào tối thêm.
   */

  /* ======================= GÓC LÀM VIỆC — SÁT TƯỜNG BẮC =======================
   * Kệ sách (x 1,5) liền bàn (x 3,0) thành một dãy sát tường bắc, mép tây của
   * kệ đúng rìa hành lang (x = +1,0) nên hành lang vẫn tròn 2 m.
   */
  { id: 'ke-module', vung: 'ban-lam-viec', tai: [1.5, -4.5], quay: 0, kenney: 'bookcaseOpen', kenneyPhu: 'bookcaseClosedWide', cao: 1.9, rongToiDa: 1.0, chan: [0.5, 0.3] },
  { id: 'sach-ke-1', vung: 'ban-lam-viec', tai: [1.5, -4.5], lech: [-0.28, 0.06], datY: 1.24, quay: 4, kenney: 'books', rong: 0.3, chat: 'nham' },
  { id: 'sach-ke-2', vung: 'ban-lam-viec', tai: [1.5, -4.5], lech: [0.26, 0.06], datY: 0.82, quay: -6, kenney: 'books', rong: 0.3, chat: 'nham' },
  { id: 'sach-ke-3', vung: 'ban-lam-viec', tai: [1.5, -4.5], lech: [0.3, 0.06], datY: 1.24, quay: -8, kenney: 'books', rong: 0.26, chat: 'nham' },
  { id: 'sach-ke-4', vung: 'ban-lam-viec', tai: [1.5, -4.5], lech: [-0.26, 0.06], datY: 0.4, quay: 10, kenney: 'books', rong: 0.3, chat: 'nham' },
  { id: 'ban-dieu-khien', vung: 'ban-lam-viec', tai: [3, -4.5], quay: 0, kenney: 'desk', kenneyPhu: 'tableCross', cao: 0.6, rongToiDa: 1.12, chan: [0.56, 0.3] },
  { id: 'man-hinh-ban', vung: 'ban-lam-viec', tai: [3, -4.5], lech: [0, -0.16], tren: 'ban-dieu-khien', quay: 0, kenney: 'computerScreen', cao: 0.3, chat: 'kim-loai' },
  { id: 'ban-phim', vung: 'ban-lam-viec', tai: [3, -4.5], lech: [0, 0.16], tren: 'ban-dieu-khien', quay: 0, kenney: 'computerKeyboard', rong: 0.3, chat: 'nham' },
  { id: 'chuot', vung: 'ban-lam-viec', tai: [3, -4.5], lech: [0.34, 0.16], tren: 'ban-dieu-khien', quay: 0, kenney: 'computerMouse', rong: 0.1, chat: 'nham' },
  { id: 'den-ban', vung: 'ban-lam-viec', tai: [3, -4.5], lech: [-0.5, -0.04], tren: 'ban-dieu-khien', quay: 20, kenney: 'lampSquareTable', kenneyPhu: 'lampRoundTable', cao: 0.3 },
  { id: 'sach-ban', vung: 'ban-lam-viec', tai: [3, -4.5], lech: [0.5, -0.08], tren: 'ban-dieu-khien', quay: -12, kenney: 'books', rong: 0.26, chat: 'nham' },
  { id: 'coc-ban', vung: 'ban-lam-viec', tai: [3, -4.5], lech: [0.28, -0.02], tren: 'ban-dieu-khien', quay: 0, rong: 0.1, chat: 'nham' },
  // ghế làm việc quay mặt vào bàn (−Z). Không có `chan`: ghế phải kéo qua được.
  { id: 'ghe-2', vung: 'ban-lam-viec', tai: [3, -3.5], quay: 180, kenney: 'chairModernFrameCushion', kenneyPhu: 'chairDesk', cao: 0.47, chat: 'vai', mauVai: 0xa98a66 },
  // bảng ghim treo ĐÚNG TRÊN bàn (D1b treo lệch sang x 4)
  { id: 'bang-ghim', vung: 'ban-lam-viec', tai: [3, -5], datY: 1.35, quay: 0 },

  /* ============================ BẾP CHỮ L — GÓC ĐÔNG-BẮC ============================
   * Nhánh BẮC (z −4,5, mặt +Z): tu-bep → tu-bep-goc.
   * Nhánh ĐÔNG (x 6,5, mặt −X): bồn rửa → bếp nấu → tủ dưới → TỦ LẠNH Ở ĐẦU.
   * Khe giữa các cục ≤ 0,1 m (D1b hở 0,55 m nên "3 cái tủ bị bỏ quên").
   * Mặt bếp + backsplash liền mạch do `phong.ts` dựng theo `DAY_BEP` dưới đây.
   */
  { id: 'tu-bep', vung: 'bep', tai: [5.5, -4.5], quay: 0, kenney: 'kitchenCabinet', kenneyPhu: 'kitchenCabinetDrawer', cao: 0.95, rongToiDa: 1.0, chan: [0.5, 0.3] },
  { id: 'tu-bep-goc', vung: 'bep', tai: [6.5, -4.5], quay: 0, kenney: 'kitchenCabinetCornerInner', kenneyPhu: 'kitchenCabinet', cao: 0.95, rongToiDa: 1.1, chan: [0.4, 0.4] },
  { id: 'tu-duoi-1', vung: 'bep', tai: [6.5, -3.5], quay: 270, kenney: 'kitchenSink', kenneyPhu: 'kitchenCabinetDrawer', cao: 0.95, rongToiDa: 1.0, chan: [0.5, 0.3] },
  { id: 'bep-nau', vung: 'bep', tai: [6.5, -2.5], quay: 270, kenney: 'kitchenStove', kenneyPhu: 'kitchenStoveElectric', cao: 0.95, rongToiDa: 1.0, chan: [0.5, 0.3], chat: 'kim-loai' },
  { id: 'tu-duoi-2', vung: 'bep', tai: [6.5, -1.5], quay: 270, kenney: 'kitchenCabinetDrawer', kenneyPhu: 'kitchenCabinet', cao: 0.95, rongToiDa: 1.0, chan: [0.5, 0.3] },
  { id: 'tu-lanh', vung: 'bep', tai: [6.5, -0.5], quay: 270, kenney: 'kitchenFridgeLarge', kenneyPhu: 'kitchenFridge', cao: 1.8, rongToiDa: 1.1, chan: [0.5, 0.35], chat: 'kim-loai' },
  // tủ trên + máy hút mùi: treo tường (`datY`), không có hộp chắn
  { id: 'tu-tren-3', vung: 'bep', tai: [5.5, -4.5], datY: 1.5, quay: 0, kenney: 'kitchenCabinetUpper', kenneyPhu: 'kitchenCabinetUpperLow', cao: 0.7, rongToiDa: 1.0 },
  { id: 'tu-tren-1', vung: 'bep', tai: [6.5, -3.5], datY: 1.5, quay: 270, kenney: 'kitchenCabinetUpper', kenneyPhu: 'kitchenCabinetUpperLow', cao: 0.7, rongToiDa: 1.0 },
  { id: 'tu-tren-2', vung: 'bep', tai: [6.5, -1.5], datY: 1.5, quay: 270, kenney: 'kitchenCabinetUpperDouble', kenneyPhu: 'kitchenCabinetUpper', cao: 0.7, rongToiDa: 1.0 },
  { id: 'hut-mui', vung: 'bep', tai: [6.5, -2.5], datY: 1.55, quay: 270, kenney: 'hoodModern', kenneyPhu: 'hoodLarge', cao: 0.55, rongToiDa: 1.0, chat: 'kim-loai' },
  { id: 'lo-vi-song', vung: 'bep', tai: [5.5, -4.5], lech: [-0.04, 0.1], tren: 'tu-bep', quay: 0, kenney: 'kitchenMicrowave', rong: 0.45, chat: 'kim-loai' },
  { id: 'may-ca-phe', vung: 'bep', tai: [6.5, -1.5], lech: [-0.12, 0.02], tren: 'tu-duoi-2', quay: 270, kenney: 'kitchenCoffeeMachine', cao: 0.3, chat: 'kim-loai' },

  /* ===================== CỤM BÀN ĂN — CÁCH DÃY BẾP 1,35 m =====================
   * Bàn tròn 1,3 m + 4 ghế vòng quanh; tủ bát sát tường nam neo cụm lại, cây
   * ở góc đông-nam. D1b để bàn ăn cách bếp 0,9 m và ghế thứ 4 chen lối đi.
   */
  { id: 'tham-an', vung: 'bep', tai: [4, 2], quay: 0, kenney: 'rugRectangle', kenneyPhu: 'rugRounded', rong: 2.4, chat: 'tham' },
  { id: 'ban-an', vung: 'bep', tai: [4, 2], quay: 0, kenney: 'tableRound', kenneyPhu: 'table', cao: 0.58, rongToiDa: 1.05, chan: [0.5, 0.5] },
  { id: 'ghe-1', vung: 'bep', tai: [4, 1], quay: 0, kenney: 'chairModernCushion', kenneyPhu: 'chairDesk', cao: 0.47, chat: 'vai', mauVai: 0xa98a66 },
  { id: 'ban-an-ghe-2', vung: 'bep', tai: [4, 3], quay: 180, kenney: 'chairModernCushion', kenneyPhu: 'chairDesk', cao: 0.47, chat: 'vai', mauVai: 0xa98a66 },
  { id: 'ban-an-ghe-3', vung: 'bep', tai: [3, 2], quay: 90, kenney: 'chairModernCushion', kenneyPhu: 'chairDesk', cao: 0.47, chat: 'vai', mauVai: 0xa98a66 },
  { id: 'ban-an-ghe-4', vung: 'bep', tai: [5, 2], quay: 270, kenney: 'chairModernCushion', kenneyPhu: 'chairDesk', cao: 0.47, chat: 'vai', mauVai: 0xa98a66 },
  { id: 'binh-hoa', vung: 'bep', tai: [4, 2], lech: [0, 0.14], tren: 'ban-an', quay: 0, kenney: 'plantSmall3', kenneyPhu: 'plantSmall1', cao: 0.34, cay: true },
  { id: 'trai-cay', vung: 'bep', tai: [4, 2], lech: [-0.24, -0.12], tren: 'ban-an', quay: 0, rong: 0.26, chat: 'nham' },
  { id: 'tu-bat-dia', vung: 'bep', tai: [5, 4.5], quay: 180, kenney: 'kitchenCabinetDrawer', kenneyPhu: 'kitchenCabinet', cao: 0.95, rongToiDa: 1.3, chan: [0.65, 0.3] },
  { id: 'binh-hoa-tu', vung: 'bep', tai: [5, 4.5], lech: [0.32, 0], tren: 'tu-bat-dia', quay: 0, kenney: 'plantSmall2', kenneyPhu: 'plantSmall3', cao: 0.32, cay: true },
  // G1 (#56): bỏ `den-tran-an` cùng lý do với `den-tran-khach` — không còn trần.
  { id: 'cay-4', vung: 'bep', tai: [6.5, 4.5], quay: 0, kenney: 'pottedPlant', kenneyPhu: 'plantSmall3', cao: 1.4, cay: true },
  { id: 'tranh-4', vung: 'bep', tai: [6, 5], datY: 1.5, quay: 180 },

  /* ====================== HÀNH LANG — VÀO TỪ CỬA, SÁT TƯỜNG ======================
   * Kệ giày + móc áo liền nhau sát tường bắc, PHÍA TÂY cửa; mép đông của kệ
   * giày đúng x = −1,5 nên không lấn dải hành lang |x| ≤ 1.
   */
  { id: 'ke-giay', vung: 'hanh-lang', tai: [-2, -4.5], quay: 0, kenney: 'benchCushionLow', kenneyPhu: 'bench', rong: 1.0, rongToiDa: 1.1, chan: [0.5, 0.22], chat: 'vai', mauVai: 0xa98a66 },
  { id: 'moc-ao', vung: 'hanh-lang', tai: [-3, -4.5], quay: 0, kenney: 'coatRackStanding', kenneyPhu: 'coatRack', cao: 1.72 },
  { id: 'tham-cua', vung: 'hanh-lang', tai: [-1.5, -4], quay: 0, kenney: 'rugDoormat', rong: 0.95, chat: 'vai', mauVai: 0x8a6a44 },
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

/* ------------------------------------------------- F1 (#56): cụm + lối đi */

/** Mép tường: món cách tường ≤ số này (m) thì coi là "sát tường". */
export const SAT_TUONG = 0.35;
/** Khe tối thiểu giữa hai món cùng một cụm (m) — xa hơn thì coi là đứng lẻ. */
export const KHE_CUM = 0.8;
/** Lối đi tối thiểu giữa hai CỤM khác nhau (m) — đề bài Issue #56. */
export const LOI_DI = 1.2;

/**
 * CỤM của một khối. Mặc định theo `vung`, trừ cụm BÀN ĂN: nó nằm trong vùng
 * `bep` nhưng là một cụm riêng, nên lối đi bàn ăn ↔ dãy bếp phải được đo như
 * lối đi giữa hai cụm (1,35 m thật, yêu cầu 1,2 m).
 */
const CUM_BAN_AN: ReadonlySet<string> = new Set([
  'ban-an',
  'ghe-1',
  'ban-an-ghe-2',
  'ban-an-ghe-3',
  'ban-an-ghe-4',
  'binh-hoa',
  'trai-cay',
  'tu-bat-dia',
  'binh-hoa-tu',
  'cay-4',
  'tranh-4',
]);

export function cumCua(k: KhoiCanh): string {
  return CUM_BAN_AN.has(k.id) ? 'ban-an' : k.vung;
}

/** Vết chân trên sàn của một khối: lấy `chan` nếu có, không thì bán kính 0,3 m. */
function vetChan(k: KhoiCanh): HopChan {
  const [rx, rz] = k.chan ?? [0.3, 0.3];
  const ngang = Math.abs(Math.round(k.quay / 90)) % 2 === 1;
  const ax = k.chan ? (ngang ? rz : rx) : rx;
  const az = k.chan ? (ngang ? rx : rz) : rz;
  const x = k.tai[0] + (k.lech?.[0] ?? 0);
  const z = k.tai[1] + (k.lech?.[1] ?? 0);
  return { id: k.id, x0: x - ax, x1: x + ax, z0: z - az, z1: z + az };
}

/** Khe hở giữa hai vết chân (m) — 0 nghĩa là chạm/chồng nhau. */
function khe(a: HopChan, b: HopChan): number {
  const dx = Math.max(0, Math.max(a.x0 - b.x1, b.x0 - a.x1));
  const dz = Math.max(0, Math.max(a.z0 - b.z1, b.z0 - a.z1));
  return Math.hypot(dx, dz);
}

/** Vết chân cách tường gần nhất bao nhiêu mét. */
function caTuong(h: HopChan): number {
  return Math.min(
    h.x0 + NUA_RONG,
    NUA_RONG - h.x1,
    h.z0 + NUA_SAU,
    NUA_SAU - h.z1,
  );
}

/**
 * NGUYÊN TẮC 1 (F1): mọi món **hoặc sát tường, hoặc thuộc một cụm** — không
 * món nào đứng lẻ giữa sàn. Trả danh sách món vi phạm (rỗng = đạt).
 *
 * "Thuộc một cụm" tính là: đặt trên nóc món khác (`tren`), treo tường
 * (`datY`), nằm chạm mép một tấm thảm, hoặc cách một món khác ≤ `KHE_CUM`.
 */
export function kiemCum(): string[] {
  const loi: string[] = [];
  const vet = KHOI_CANH.map((k) => [k, vetChan(k)] as const);
  const tham = vet.filter(([k]) => k.chat === 'tham');
  for (const [k, h] of vet) {
    if (k.tren !== undefined || k.datY !== undefined) continue;
    if (caTuong(h) <= SAT_TUONG) continue;
    if (tham.some(([t, ht]) => t.id !== k.id && khe(h, ht) === 0)) continue;
    const gan = vet
      .filter(([k2]) => k2.id !== k.id && k2.chat !== 'tham' && k2.tren === undefined)
      .reduce((m, [, h2]) => Math.min(m, khe(h, h2)), Infinity);
    if (gan <= KHE_CUM) continue;
    loi.push(`${k.id} đứng lẻ: cách tường ${caTuong(h).toFixed(2)} m, cách món gần nhất ${gan.toFixed(2)} m`);
  }
  return loi;
}

/**
 * NGUYÊN TẮC 2 (F1): lối đi giữa HAI CỤM khác nhau phải ≥ `LOI_DI`. Chỉ đo
 * trên món CÓ hộp chắn (món chắn đường mới làm hẹp lối đi thật).
 */
export function kiemLoiDi(): string[] {
  const loi: string[] = [];
  const co = KHOI_CANH.filter((k) => !!k.chan);
  for (let i = 0; i < co.length; i++) {
    for (let j = i + 1; j < co.length; j++) {
      const a = co[i]!;
      const b = co[j]!;
      if (cumCua(a) === cumCua(b)) continue;
      const d = khe(vetChan(a), vetChan(b));
      if (d + 1e-9 < LOI_DI) {
        loi.push(`${a.id} (${cumCua(a)}) ↔ ${b.id} (${cumCua(b)}): lối đi ${d.toFixed(2)} m < ${LOI_DI} m`);
      }
    }
  }
  return loi;
}
