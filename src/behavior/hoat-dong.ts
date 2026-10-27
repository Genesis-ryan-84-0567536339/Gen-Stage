/**
 * hoat-dong.ts — **BẢNG HOẠT ĐỘNG** (J2, Issue #79).
 *
 * Boss 27/10: *"tăng thêm các động tác hành vi của các nhân vật cho phong
 * phú"*. Trước J2, mọi thứ Nhi làm đều là **một lệnh lẻ**: `moveTo`, `sit`,
 * `emote`. Người thật thì không "emote" — người thật **ra bếp pha cà phê rồi
 * mang cốc về bàn**, tức một CHUỖI lệnh có đầu có cuối.
 *
 * File này là chuỗi đó viết thành **dữ liệu thuần**: không `import three`,
 * không gọi dispatcher, không biết sân khấu là gì. Thêm một hoạt động = thêm
 * một dòng vào `BANG_HOAT_DONG`; `actor.activity` đọc bảng rồi chạy từng bước
 * qua `ctx.run` (đúng mẫu `module.demo` của E1), nên hàng đợi, `interrupt`,
 * nhật ký và token y hệt khi Boss bấm tay từng nút.
 *
 * Ba quy ước tự áp, test `j2-hoat-dong.test.ts` soi bằng số:
 *
 *  1. **Mỗi `cmd` phải có thật trong registry, mỗi tham số phải hợp lệ.** Bảng
 *     là dữ liệu nên TypeScript không soi được `{ cmd: 'actor.mveTo' }` — test
 *     chạy đúng `kiemThamSo()` của dispatcher cho từng bước.
 *  2. **Về idle, chân chạm sàn.** Ngồi thì phải `actor.stand`, cầm thì phải
 *     `actor.drop`: hoạt động tự sinh có thể chạy hàng chục lượt khi Boss đi
 *     vắng, để lại một cái dở dang là Nhi ngồi lơ lửng cả buổi.
 *  3. **Vị trí lấy qua PLACE ID, không viết toạ độ.** Bố cục nhà (`bo-cuc.ts`)
 *     còn dời; mọi id place trong bảng này là hợp đồng đã có từ A1/F1 nên dời
 *     đồ không làm hoạt động trỏ vào tường.
 *
 * **Vùng giữa** (nhảy, tập thể dục, đi dạo) tạm dùng `buc-trung-tam` — place
 * `stage` giữa phòng khách. Khi `bo-cuc.ts` có hằng `VUNG_HOAT_DONG` thì đổi
 * đúng một dòng `VUNG_GIUA` dưới đây.
 */

/** Một bước trong hoạt động: đúng tên lệnh + tham số của Actor API. */
export interface BuocHoatDong {
  cmd: string;
  /** `actor` được lệnh `actor.activity` điền vào lúc chạy, không khai ở đây. */
  args?: Readonly<Record<string, unknown>>;
}

/**
 * Prop mà hoạt động cần có trong tay.
 *
 * `actor.hold` kiểm prop phải tồn tại (tham số `enum` + `goiY: 'props'`), nên
 * lệnh `actor.activity` tự `prop.spawn` khi chưa có. Dựng bằng **hình khối
 * đơn giản** của A1 (`HINH_PROP`): bộ Kenney Furniture Kit CC0 đang tải về
 * `public/kenney/` **không có** cốc, bình tưới (`books.glb` thì có nhưng
 * `prop.spawn` chưa nạp model — xem `World.propSpawn`), và asset không được
 * commit (mục "Quy ước" CLAUDE.md) nên thêm file mới chỉ để ba cái prop nhỏ
 * là đổi lấy một bước cài đặt nữa cho Boss.
 */
export interface PropHoatDong {
  /** Mã prop trên sân khấu (giữ nguyên giữa các lượt — dựng một lần, dùng mãi). */
  id: string;
  /** Một trong `HINH_PROP` (`src/api/commands/prop.ts`). */
  shape: string;
  /** Place đặt prop khi vừa dựng / khi thả ra. */
  at: string;
  /** Tay nào cầm. */
  hand?: 'left' | 'right';
}

export interface HoatDong {
  id: string;
  /** Nhãn tiếng Việt ngắn — hiện trên UI, trong nhật ký và `actor.activities`. */
  nhan: string;
  /** Mô tả một câu cho não/agent đọc qua `actor.activities`. */
  mo: string;
  /** Prop cần có (tự dựng nếu thiếu, tự thả ở bước cuối). */
  prop?: PropHoatDong;
  /** Chuỗi lệnh. */
  buoc: readonly BuocHoatDong[];
}

/**
 * Vùng giữa phòng — chỗ đủ trống để nhảy/tập/đi dạo.
 *
 * `buc-trung-tam` là place `stage` ở giữa cụm phòng khách (`noi-dung.ts`), và
 * chỗ đứng của nó đã được F1 (#56) đẩy ra ngoài hộp chắn của cả cụm sofa nên
 * nhân vật không xuyên nội thất khi diễn tại đó.
 */
export const VUNG_GIUA = 'buc-trung-tam';

/** Hai mốc sàn trung tính của A1 — dùng làm chặng cho vòng đi dạo. */
const CHANG_DAO = ['ban-1', VUNG_GIUA, 'ban-2', VUNG_GIUA] as const;

/**
 * 12 hoạt động của Issue #79.
 *
 * Thứ tự trong bảng = thứ tự hiện trên `actor.activities`; máy tự sinh hoạt
 * (`tu-sinh-hoat.ts`) chọn ngẫu nhiên nên thứ tự không ảnh hưởng hành vi.
 */
export const BANG_HOAT_DONG: readonly HoatDong[] = [
  {
    id: 'doc-sach-sofa',
    nhan: 'Đọc sách trên sofa',
    mo: 'Ra sofa, ngồi xuống, lấy sách đọc một lúc rồi đứng lên cất sách.',
    prop: { id: 'sach-doc', shape: 'book', at: 'sofa', hand: 'left' },
    buoc: [
      { cmd: 'actor.moveTo', args: { to: 'sofa' } },
      { cmd: 'actor.sit', args: { seat: 'sofa' } },
      { cmd: 'actor.emote', args: { emote: 'cham-chu', intensity: 0.7 } },
      { cmd: 'actor.play', args: { clip: 'nod', speed: 0.8 } },
      { cmd: 'actor.emote', args: { emote: 'suy-nghi', intensity: 0.5 } },
      { cmd: 'actor.stand' },
    ],
  },
  {
    id: 'pha-ca-phe',
    nhan: 'Pha cà phê rồi mang về bàn',
    mo: 'Ra bếp đứng chờ máy cà phê, cầm cốc đi về bàn làm việc rồi đặt xuống.',
    prop: { id: 'coc-ca-phe', shape: 'orb', at: 'bep', hand: 'right' },
    buoc: [
      { cmd: 'actor.moveTo', args: { to: 'bep' } },
      { cmd: 'actor.turnTo', args: { target: 'bep' } },
      { cmd: 'actor.emote', args: { emote: 'cham-chu', intensity: 0.6 } },
      { cmd: 'actor.moveTo', args: { to: 'ban-dieu-khien' } },
      { cmd: 'actor.emote', args: { emote: 'vui', intensity: 0.6 } },
    ],
  },
  {
    id: 'go-may-tinh',
    nhan: 'Gõ máy tính',
    mo: 'Ngồi ghế làm việc, gõ máy tính một lúc rồi đứng lên.',
    buoc: [
      { cmd: 'actor.moveTo', args: { to: 'ban-dieu-khien' } },
      { cmd: 'actor.sit', args: { seat: 'ghe-2' } },
      { cmd: 'actor.play', args: { clip: 'type' } },
      { cmd: 'actor.emote', args: { emote: 'cham-chu', intensity: 0.8 } },
      { cmd: 'actor.stand' },
    ],
  },
  {
    id: 'vuon-vai',
    nhan: 'Vươn vai',
    /*
     * Hoạt động NGẮN NHẤT và cố ý không di chuyển: máy tự sinh hoạt gọi ngẫu
     * nhiên, nên bảng phải có cả thứ diễn tại chỗ — không thì Boss quay lại
     * lúc nào cũng thấy Nhi đang đi đâu đó giữa phòng.
     */
    mo: 'Vươn vai cho đỡ mỏi, ngay tại chỗ đang đứng.',
    buoc: [
      { cmd: 'actor.emote', args: { emote: 'met', intensity: 0.75 } },
      { cmd: 'actor.express', args: { expression: 'relaxed', weight: 0.6, durationMs: 1800 } },
      { cmd: 'actor.play', args: { clip: 'nod', speed: 0.7 } },
    ],
  },
  {
    id: 'ngam-cua-so',
    nhan: 'Ra cửa sổ ngắm ra ngoài',
    mo: 'Đi ra cửa sổ lớn, đứng ngắm ra ngoài một lúc.',
    buoc: [
      { cmd: 'actor.moveTo', args: { to: 'cua-so' } },
      { cmd: 'actor.turnTo', args: { target: 'cua-so' } },
      { cmd: 'actor.express', args: { expression: 'relaxed', weight: 0.7, durationMs: 3000 } },
      { cmd: 'actor.play', args: { clip: 'think' } },
      { cmd: 'actor.emote', args: { emote: 'suy-nghi', intensity: 0.5 } },
    ],
  },
  {
    id: 'tuoi-cay',
    nhan: 'Tưới cây',
    mo: 'Lấy bình tưới, ra góc cây phòng khách tưới một lượt rồi cất bình.',
    prop: { id: 'binh-tuoi', shape: 'tool', at: 'ke-module', hand: 'right' },
    buoc: [
      { cmd: 'actor.moveTo', args: { to: VUNG_GIUA } },
      { cmd: 'actor.emote', args: { emote: 'cham-chu', intensity: 0.6 } },
      { cmd: 'actor.play', args: { clip: 'point' } },
      { cmd: 'actor.emote', args: { emote: 'dong-y', intensity: 0.6 } },
    ],
  },
  {
    id: 'don-ban-an',
    nhan: 'Dọn bàn ăn',
    mo: 'Ra bàn ăn, dọn lại mặt bàn cho gọn.',
    buoc: [
      { cmd: 'actor.moveTo', args: { to: 'ban-an' } },
      { cmd: 'actor.turnTo', args: { target: 'ban-an' } },
      { cmd: 'actor.emote', args: { emote: 'cham-chu', intensity: 0.7 } },
      { cmd: 'actor.play', args: { clip: 'point' } },
      { cmd: 'actor.emote', args: { emote: 'dong-y', intensity: 0.5 } },
    ],
  },
  {
    id: 'nhay-theo-nhac',
    nhan: 'Nhảy nhẹ theo nhạc',
    mo: 'Ra giữa phòng nhảy nhẹ theo nhạc một đoạn.',
    buoc: [
      { cmd: 'actor.moveTo', args: { to: VUNG_GIUA } },
      { cmd: 'actor.play', args: { clip: 'celebrate' } },
      { cmd: 'actor.emote', args: { emote: 'rat-vui', intensity: 0.8 } },
      { cmd: 'actor.play', args: { clip: 'celebrate', speed: 1.2 } },
    ],
  },
  {
    id: 'tap-the-duc',
    nhan: 'Tập thể dục ngắn',
    mo: 'Ra giữa phòng tập mấy động tác cho giãn người.',
    buoc: [
      { cmd: 'actor.moveTo', args: { to: VUNG_GIUA } },
      { cmd: 'actor.play', args: { clip: 'clap' } },
      { cmd: 'actor.play', args: { clip: 'celebrate', speed: 1.3 } },
      { cmd: 'actor.emote', args: { emote: 'met', intensity: 0.6 } },
    ],
  },
  {
    id: 'di-dao',
    nhan: 'Đi dạo một vòng',
    mo: 'Đi một vòng quanh vùng giữa phòng rồi về chỗ cũ.',
    buoc: CHANG_DAO.map((p) => ({ cmd: 'actor.moveTo', args: { to: p } })),
  },
  {
    id: 'uong-nuoc-ghe-an',
    nhan: 'Ngồi ghế ăn uống nước',
    mo: 'Ra bàn ăn, ngồi xuống uống nước rồi đứng lên.',
    prop: { id: 'coc-nuoc', shape: 'orb', at: 'ban-an', hand: 'right' },
    buoc: [
      { cmd: 'actor.moveTo', args: { to: 'ban-an' } },
      { cmd: 'actor.sit', args: { seat: 'ghe-1' } },
      { cmd: 'actor.emote', args: { emote: 'vui', intensity: 0.5 } },
      { cmd: 'actor.play', args: { clip: 'nod', speed: 0.9 } },
      { cmd: 'actor.stand' },
    ],
  },
  {
    id: 'ngu-gat-sofa',
    nhan: 'Ngủ gật trên sofa',
    mo: 'Ra sofa ngồi, ngả đầu ngủ gật một lúc rồi tỉnh dậy đứng lên.',
    buoc: [
      { cmd: 'actor.moveTo', args: { to: 'sofa' } },
      { cmd: 'actor.sit', args: { seat: 'sofa' } },
      { cmd: 'actor.express', args: { expression: 'relaxed', weight: 0.9, durationMs: 4000 } },
      { cmd: 'actor.play', args: { clip: 'sleep' } },
      { cmd: 'actor.emote', args: { emote: 'met', intensity: 0.5 } },
      { cmd: 'actor.stand' },
    ],
  },
] as const;

/** Tên mọi hoạt động — `actor.activity` dùng làm `values` của tham số `name`. */
export const TEN_HOAT_DONG: readonly string[] = BANG_HOAT_DONG.map((h) => h.id);

export function timHoatDong(id: string): HoatDong | undefined {
  return BANG_HOAT_DONG.find((h) => h.id === id);
}

/* ======================================================= SỔ ĐANG LÀM GÌ */

/**
 * **Sổ "ai đang làm hoạt động gì"** — và cái móc để CẮT nó.
 *
 * Vì sao là một sổ cấp module chứ không phải một trường trong `StageWorld`:
 * hoạt động là một chuỗi **lệnh**, nó sống ở tầng lệnh. Sân khấu không biết
 * "chuỗi" là gì (`world.ts` chỉ biết từng hành động một), nên nhét vào đó là
 * gọi ngược tầng — đúng cái "ba tầng, không được gọi ngược" của CLAUDE.md.
 * Cùng mẫu với `so-nao.ts` (C0) và `so-giong.ts` (C1).
 *
 * **`huy()` là cửa duy nhất để cắt.** Phản xạ / máy tự sinh hoạt /
 * `Dispatcher.catNgang` gọi `huyHoatDong(actor)` chứ KHÔNG tự `catNgang` thêm
 * lần nữa — `catNgang` xoá sạch hàng đợi, tức giết luôn lệnh não vừa xếp hàng
 * (đúng cái ta đang nhường chỗ cho; xem mục C0/I1 trong CLAUDE.md).
 *
 * ## Khoá sổ là TOKEN, không phải tên hoạt động (review PR #83 lỗi 1)
 *
 * Bản đầu `xoaHoatDong(actor, id)` so bằng **tên**. Chuỗi vừa bị cắt vẫn còn
 * một `.then()` đang chạy; nếu lượt mới **trùng tên** kịp `datHoatDong` trước
 * cái `.then()` đó thì nó **xoá mất đăng ký của lượt MỚI**. Reviewer đâm thử
 * `di-dao → huỷ → di-dao` và đo được:
 *
 * ```
 * sổ: null · huyHoatDong trả: null
 * sự kiện: activityStart | activityCancelled | activityStart | activityDone
 * ```
 *
 * tức lượt hai chạy trọn tới cùng trong khi `stage.describe().activity` báo
 * `null` (nói dối với não) và Boss gõ thì **không cắt được gì** — đúng lại lỗi
 * vòng 2, vào bằng một cửa khác. Token tăng dần thì không có hai lượt nào
 * trùng khoá, đúng quy ước sẵn có trong CLAUDE.md: *"nhận diện hành động bằng
 * token, không bằng tên lệnh"* (cùng lý do `Dispatcher.DangChay.token` tồn tại).
 */
interface DangLam {
  /** Mã riêng của LƯỢT CHẠY này — không bao giờ trùng, kể cả cùng tên. */
  token: number;
  id: string;
  huy: () => void;
}

const soDangLam = new Map<string, DangLam>();
let demToken = 0;

/** Ghi lượt chạy mới vào sổ. Trả **token** để sau này xoá đúng lượt của mình. */
export function datHoatDong(actor: string, id: string, huy: () => void): number {
  const token = ++demToken;
  soDangLam.set(actor, { token, id, huy });
  return token;
}

/** Chỉ xoá khi đúng LƯỢT đó còn là lượt hiện tại (so theo token, không theo tên). */
export function xoaHoatDong(actor: string, token: number): void {
  if (soDangLam.get(actor)?.token === token) soDangLam.delete(actor);
}

/** Hoạt động actor đang làm (`null` = không làm gì) — `stage.describe` đọc. */
export function layHoatDong(actor: string): string | null {
  return soDangLam.get(actor)?.id ?? null;
}

/** Token của lượt đang chạy (test/chẩn đoán). */
export function layTokenHoatDong(actor: string): number | null {
  return soDangLam.get(actor)?.token ?? null;
}

/** Cắt hoạt động đang chạy. Trả về id vừa cắt, `null` nếu không có gì để cắt. */
export function huyHoatDong(actor: string): string | null {
  const dl = soDangLam.get(actor);
  if (!dl) return null;
  soDangLam.delete(actor);
  dl.huy();
  return dl.id;
}

/** Dọn sổ (test + `stage.reset`). */
export function donSoHoatDong(): void {
  soDangLam.clear();
}

/* ============================================ ĐIỀU KIỆN "PLACE CÒN RẢNH" */

/**
 * Người khác đứng gần hơn ngần này (m) thì coi như chỗ đó **đã có người**.
 *
 * Issue #79 đòi "điều kiện (place rảnh…)" và review PR #83 mục (b) chỉ đúng
 * chỗ hở: `VUNG_GIUA` (`buc-trung-tam`) chính là nơi Nam spawn, mà
 * `World.choDung()` trả thẳng `standAt` **không né ai** và `World.actorSit`
 * không kiểm ghế có người ngồi chưa. Nên việc chọn phải làm ở tầng trên: một
 * hoạt động đi vào chỗ đang có người thì **đừng chọn nó**, thay vì dựng thêm
 * cơ chế né người trong sân khấu.
 */
export const KHE_NGUOI = 1;

/** Đúng những gì phép kiểm cần — khai tại chỗ để file này không phụ thuộc gì. */
export interface CanhChonHoatDong {
  places: ReadonlyArray<{ id: string; pos: readonly number[]; occupiedBy: string | null }>;
  actors: ReadonlyArray<{ id: string; pos: readonly number[] }>;
  /** Nhân vật sắp diễn — chính nó đứng đó thì không tính là "có người". */
  ai: string;
}

/**
 * Hoạt động này **diễn được** trên sân khấu hiện tại không?
 *
 * Hai điều kiện, cả hai đều đọc từ `stage.describe()`:
 *  - mọi ghế `actor.sit` phải trống (`occupiedBy` rỗng hoặc chính mình),
 *  - mọi chỗ `actor.moveTo` phải không có nhân vật khác đứng trong `KHE_NGUOI`.
 */
export function hoatDongDienDuoc(h: HoatDong, c: CanhChonHoatDong): boolean {
  const place = (id: string) => c.places.find((p) => p.id === id);
  const xa = (a: readonly number[], b: readonly number[]) =>
    Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));
  for (const b of h.buoc) {
    if (b.cmd === 'actor.sit' && typeof b.args?.seat === 'string') {
      const p = place(b.args.seat);
      if (p && p.occupiedBy !== null && p.occupiedBy !== c.ai) return false;
    }
    if (b.cmd === 'actor.moveTo' && typeof b.args?.to === 'string') {
      const p = place(b.args.to);
      if (!p) continue;
      const nguoiKhac = c.actors.filter((a) => a.id !== c.ai);
      if (nguoiKhac.some((a) => xa(a.pos, p.pos) < KHE_NGUOI)) return false;
    }
  }
  return true;
}
