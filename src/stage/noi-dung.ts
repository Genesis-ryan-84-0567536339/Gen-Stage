/**
 * noi-dung.ts — dữ liệu cảnh v0.1: danh sách place, clip, biểu cảm, emote.
 *
 * Tách riêng khỏi code dựng cảnh để A3 (lab viễn tưởng) chỉ cần thay file này
 * là có bộ place mới, không phải sửa lệnh hay dispatcher.
 *
 * Quy ước đo (spec mục 1b): mét, gốc toạ độ giữa phòng, `facing` độ (0 = hướng
 * camera mặc định, tức nhìn về +Z).
 */
import type { Vec3 } from '../api/types';

export interface DinhNghiaPlace {
  id: string;
  pos: Vec3;
  kind: 'desk' | 'seat' | 'stage' | 'door' | 'shelf';
  /** Chỗ actor đứng khi được gọi tới place này (bàn thì đứng trước bàn). */
  standAt?: Vec3;
  /** Hướng actor quay khi tới (độ). */
  facing?: number;
  /**
   * Cao độ mặt ghế (m, từ sàn) — CHỈ áp cho `kind: 'seat'`. `actor.sit` đặt
   * hips theo đúng số này (xem `NhanVat.ngoi`, review PR #10 vòng 4: hạ gốc
   * theo hằng số × tỉ lệ chân không biết ghế cao bao nhiêu nên lún xuyên).
   * Giá trị ở đây là FALLBACK khi không đo được hình học ghế thật — ghế dựng
   * bằng Kenney Space Kit (`phong.ts`) tự ghi đè số đo thật qua `datSeatY()`
   * ngay khi ghế được dựng.
   */
  seatY?: number;
}

/** Cao độ mặt ghế đo ĐƯỢC từ hình học thật lúc dựng cảnh (ghi đè `seatY` khai tĩnh ở trên). */
const seatYDoDuoc = new Map<string, number>();

/** `phong.ts` gọi sau khi dựng xong một ghế, truyền cao độ mặt ghế đo trên chính model. */
export function datSeatY(id: string, y: number): void {
  if (Number.isFinite(y) && y > 0) seatYDoDuoc.set(id, y);
}

/** `world.ts`/`NhanVat.ngoi` đọc cao độ mặt ghế: đo thật > khai tĩnh > fallback. */
export function layMatGhe(id: string): number {
  const dat = seatYDoDuoc.get(id);
  if (dat !== undefined) return dat;
  return timPlace(id)?.seatY ?? 0.45;
}

/**
 * Places v0.1 của cảnh LAB VIỄN TƯỞNG (A3, `phong.ts`).
 *
 * 25/10 — Boss xem thật và chốt "không gian quá chật chội": phòng nở từ
 * 7,2 × 7,2 m lên **16 × 16 m**, trần 5,6 m. Toạ độ place dãn ra theo phòng
 * mới nhưng **giữ nguyên id** — `kiem-a1.mjs` và bộ test A1/A3 viết theo *tên*
 * place và theo hình học suy ra từ chính bảng này (`standAt` → `at`), không
 * chôn số, nên đổi toạ độ không phá bằng chứng cũ.
 *
 * Spec mục 3.4b chốt 4 place bắt buộc: `ban-dieu-khien`, `buc-trung-tam`,
 * `ke-module`, `cua`. `ban-1/ban-2/ghe-1/ghe-2` của A1 vẫn còn (đã bỏ khối
 * bàn/ghế văn phòng cũ khỏi cảnh theo ý Boss, nhưng place vẫn là mốc hợp lệ
 * để `actor.moveTo` / `actor.sit` / test A1 dùng).
 */
export const PLACES: readonly DinhNghiaPlace[] = [
  // Vùng B — điều khiển (bên phải). Bàn cong áp tường phải, mặt bàn hướng −X;
  // người vận hành (Gen) đứng ở `standAt` quay mặt về +X, tức nhìn vào bàn.
  {
    id: 'ban-dieu-khien',
    // phải khớp `BAN_CONG.tai` trong `bo-cuc.ts` — có test canh (`b1-*.test.ts`)
    pos: [6, 0, -1],
    kind: 'desk',
    standAt: [4.8, 0, -1],
    facing: 90,
  },
  // `ban-1`/`ban-2` của A1: không còn bàn thật trong cảnh (Boss "gọn"), giữ
  // làm MỐC TEST ở hai bên khoảng trống phía trước — nơi duy nhất còn rộng.
  {
    id: 'ban-1',
    pos: [-3, 0, 3],
    kind: 'desk',
    standAt: [-3, 0, 2],
    facing: 180,
  },
  {
    id: 'ban-2',
    pos: [3, 0, 3],
    kind: 'desk',
    standAt: [3, 0, 2],
    facing: 180,
  },
  // Hai ghế đẩu trước bàn cong (vùng B). `seatY` ở đây chỉ là FALLBACK:
  // `phong.ts` đo mặt ghế thật trên model vừa dựng rồi ghi đè qua `datSeatY()`.
  { id: 'ghe-1', pos: [5, 0, -2.5], kind: 'seat', facing: 90, seatY: 0.45 },
  { id: 'ghe-2', pos: [5, 0, 0.5], kind: 'seat', facing: 90, seatY: 0.45 },
  // Vùng A — bục ở ĐÚNG gốc toạ độ: tâm phòng, và là mốc mặc định của sân
  // khấu giả trong test (`SanKhauGia` đặt actor mới ở [0,0,0]).
  { id: 'buc-trung-tam', pos: [0, 0, 0], kind: 'stage', facing: 0 },
  // Vùng C — cửa áp TƯỜNG TRÁI phía trước (không ở mép trước phòng): máy quay
  // toàn cảnh đứng ngoài mép trước, cửa đặt ở đó thì khung cửa cao 3,4 m chắn
  // ngay tiền cảnh. `facing: 90` = quay mặt về +X, nhìn vào trong phòng.
  { id: 'cua', pos: [-7.5, 0, 5], kind: 'door', standAt: [-6.2, 0, 5], facing: 90 },
  {
    id: 'ke-module',
    pos: [-7, 0, -1],
    kind: 'shelf',
    standAt: [-5.5, 0, -1],
    facing: 270,
  },
] as const;

/**
 * Clip tạm của A1: dựng bằng hoạt ảnh thủ công (procedural) có sẵn từ đợt 0.
 * A2 thay bằng thư viện chuyển động thật (Quaternius → VRMA) và mở rộng danh
 * sách; tên clip giữ nguyên nên lệnh không phải đổi.
 */
export const CLIPS = [
  'idle',
  'walk',
  'wave',
  'sit',
  'stand',
  'nod',
  'shake',
  'think',
  'clap',
  'point',
  'celebrate',
  'type',
  'sleep',
] as const;

/** Thời lượng clip (ms) — A2 thay bằng độ dài file chuyển động thật. */
export const DAI_CLIP: Record<string, number> = {
  idle: 400,
  walk: 1200,
  wave: 2600,
  sit: 800,
  stand: 800,
  nod: 1200,
  shake: 1200,
  think: 2400,
  clap: 1800,
  point: 2000,
  celebrate: 2600,
  type: 3000,
  sleep: 4000,
};

export const BIEU_CAM = [
  'neutral',
  'happy',
  'angry',
  'sad',
  'relaxed',
  'surprised',
] as const;

/** Thư viện emote v0.1 theo spec mục 3.2b — A2 thi công, A1 chỉ liệt kê. */
export const EMOTES = [
  'vui',
  'rat-vui',
  'buon',
  'ngac-nhien',
  'gian',
  'suy-nghi',
  'dong-y',
  'tu-choi',
  'chao',
  'ra-lenh',
  'thanh-cong',
  'that-bai',
  'boi-roi',
  'met',
  'cham-chu',
  // C0 (#28) — phản xạ khi Sếp gọi: ngẩng đầu, hơi nghiêng
  'chu-y',
] as const;

export const PRESET_DEN = ['sang', 'toi', 'am'] as const;
/**
 * Góc máy v0.1 lab (spec 3.3): toàn cảnh · bàn điều khiển · cận (hộp).
 *
 * A3 CHỈ THÊM `ban-dieu-khien` — `ban-1`/`ban-2` của A1 vẫn còn (spec mục 3
 * đầu bài: "thêm thì tăng version, không đổi nghĩa lệnh cũ"); cả hai rơi vào
 * nhánh `cameraFocus` fallthrough ở `world.ts` nên không cần code riêng.
 *
 * `truoc-mat` (A2 vòng 2) là góc **chính diện, thấy TRỌN NGƯỜI** — bắt buộc
 * cho ảnh bằng chứng emote: vòng 1 đóng khung ngang ngực nên che đúng vùng
 * tay đang sai (review PR #10 mục 2.6).
 *
 * `theo-owner` (B1, Issue #18) **bám mượt** theo nhân vật có
 * `controlledBy: "owner"`: giữ nguyên góc 3/4 nhìn xuống, chỉ lerp vị trí theo
 * chủ — khác `camera.focus` (bay một lần rồi đứng im) ở chỗ nó bám LIÊN TỤC
 * mỗi khung hình cho tới khi đổi góc máy khác.
 */
export const PRESET_MAY = [
  'toan-canh',
  'theo-owner',
  'ban-dieu-khien',
  'ban-1',
  'ban-2',
  'hop',
  'truoc-mat',
] as const;

export function timPlace(id: string): DinhNghiaPlace | undefined {
  return PLACES.find((p) => p.id === id);
}

/* ------------------------------------------- C2 (#32) — tên gọi nhân vật */

/**
 * TÊN HIỂN THỊ của nhân vật — Boss 26/10: **nhân vật nam tên Javis**.
 *
 * `id` giữ nguyên `owner` (không đổi) vì cả `controlledBy`, phím WASD, camera
 * `theo-owner`, nguồn `user.text` và MCP đều viết theo id đó — đổi id là phá
 * hợp đồng với agent. Chỉ **tên hiện trên bong bóng chữ và trong
 * `stage.describe().actors[].name`** đổi thành "Javis".
 */
export const TEN_HIEN_THI: Record<string, string> = {
  owner: 'Javis',
  gen: 'Gen',
};

/**
 * Bí danh để GỌI nhân vật bằng giọng (C2 — `src/behavior/hieu-lenh.ts`).
 *
 * Viết sẵn cả những cách STT tiếng Việt hay nghe sai: "Javis" rất dễ ra
 * "Ja-vít", "Gia vis", "Gia vít"; "Gen" ra "Ghen"/"Gien". Máy khớp còn cộng
 * thêm fuzzy ≤2 ký tự nên bảng này chỉ cần những biến thể **khác hẳn** chữ gốc.
 */
export const BI_DANH_NHAN_VAT: Record<string, string[]> = {
  owner: ['javis', 'ja vit', 'javit', 'gia vis', 'gia vit', 'giavis', 'jarvis', 'da vit'],
  gen: ['gen', 'ghen', 'gien', 'jen', 'gel'],
};
