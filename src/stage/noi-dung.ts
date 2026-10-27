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
 * Places của cảnh CĂN NHÀ ẤM (D1 #43 → **F1 #56**, `phong.ts` + `bo-cuc.ts`).
 *
 * F1 (#56 mục 1) — bố cục nhà dựng lại theo 4 cụm chặt (`docs/f1/so-do.md`):
 * **mọi `id` place giữ nguyên** (hợp đồng với agent/MCP/test không đổi), chỉ
 * TOẠ ĐỘ đi theo sơ đồ mới. Dời nhiều nhất: `ke-module` (tường đông →
 * x = 1,5 sát tường bắc, nhường góc đông-bắc cho bếp chữ L), `ban-an`
 * (3,5;2,5 → 4;2), `bep` (6,5;2 → 6,5;−2,5), `buc-trung-tam` (−4,5;2,6 →
 * −4,5;3,5 vì cụm sofa–thảm giãn ra).
 *
 * 26/10 — Boss: "nhân vật phát sáng chói mắt, nội thất lộn xộn" → đổi lab
 * viễn tưởng thành một căn nhà 1 tầng 14×10 m đầy đủ nội thất, ánh sáng tự
 * nhiên. **Giữ nguyên id place cũ** (hợp đồng với agent/test không đổi),
 * chỉ đổi Ý NGHĨA + toạ độ theo đúng bảng `bo-cuc.ts`:
 *   · `buc-trung-tam` → giữa thảm phòng khách (place `tham` trong bo-cuc).
 *   · `ban-dieu-khien` → bàn làm việc góc văn phòng.
 *   · `ke-module` → kệ sách.
 *   · `cua` → cửa ra vào (tường bắc).
 *   · `ghe-1`/`ghe-2` → ghế ăn / ghế làm việc (seatY đo thật từ model).
 *   · `ban-1`/`ban-2` giữ làm MỐC TEST trung tính (không gắn nội thất riêng).
 * Thêm mới: `sofa`, `ban-an`, `bep`, `cua-so`.
 */
export const PLACES: readonly DinhNghiaPlace[] = [
  // Góc làm việc (F1 #56): bàn áp tường bắc ở x = 3, liền kệ sách — mặt bàn
  // hướng +Z nên `standAt` ở phía +Z, quay mặt về −Z (180°) tức nhìn vào bàn.
  // Phải khớp `KHOI_CANH['ban-dieu-khien'].tai` (test b1 kiểm bằng số).
  {
    id: 'ban-dieu-khien',
    pos: [3, 0, -4.5],
    kind: 'desk',
    // cách ghế làm việc (`ghe-2`, z = −3,5) 0,9 m — đứng gần quá thì chân lún
    // vào mẫu ghế (ảnh thử D1).
    standAt: [3, 0, -2.6],
    facing: 180,
  },
  // Mốc test trung tính (A1), đặt ở hai khoảng sàn trống không chạm nội thất:
  // rìa tây hành lang, bắc và nam.
  { id: 'ban-1', pos: [-1, 0, -2], kind: 'desk', standAt: [-1, 0, -1], facing: 180 },
  { id: 'ban-2', pos: [-1, 0, 2.5], kind: 'desk', standAt: [-1, 0, 3.5], facing: 0 },
  // `ghe-1` = ghế ăn phía bắc bàn ăn, `ghe-2` = ghế làm việc. `seatY` ở đây
  // chỉ là FALLBACK: `phong.ts` đo mặt ghế thật trên model rồi ghi đè `datSeatY()`.
  // G1 (#56): nội thất hạ về cỡ chibi (`cao: 0.47` trong `bo-cuc.ts`, ra mặt
  // ngồi 0,2585 m) nên FALLBACK cũng phải
  // là mặt ngồi chibi ~0,30 m, không còn 0,46 m của ghế người lớn.
  { id: 'ghe-1', pos: [4, 0, 1], kind: 'seat', facing: 0, seatY: 0.3 },
  { id: 'ghe-2', pos: [3, 0, -3.5], kind: 'seat', facing: 180, seatY: 0.3 },
  // Trong phòng khách, phía NAM cụm sofa–thảm (F1: cụm chiếm z −1…+2,9 nên
  // chỗ đứng phải ở z ≥ 3,2 mới ra ngoài hộp chắn của `ghe-don-2`). Quay mặt
  // 180° = nhìn vào cả cụm sofa + kệ TV. Mốc mặc định của sân khấu giả trong test.
  { id: 'buc-trung-tam', pos: [-4.5, 0, 3.5], kind: 'stage', facing: 180 },
  // Cửa ra vào, tường bắc — `facing: 0` = quay mặt vào trong nhà (+Z).
  { id: 'cua', pos: [0, 0, -5], kind: 'door', standAt: [0, 0, -3.8], facing: 0 },
  // Kệ sách, đầu TÂY của dãy làm việc sát tường bắc (F1: dời từ tường đông về
  // x = 1,5 để bếp chữ L lấy trọn góc đông-bắc).
  { id: 'ke-module', pos: [1.5, 0, -4.5], kind: 'shelf', standAt: [1.5, 0, -3.4], facing: 180 },
  // Sofa 3 chỗ phòng khách, mặt quay về kệ TV (−X) → chỗ đứng ở phía bắc đầu sofa.
  { id: 'sofa', pos: [-3, 0, 1], kind: 'seat', standAt: [-3, 0, -0.7], facing: 270, seatY: 0.3 },
  // Bàn ăn tròn giữa cụm ăn; chỗ đứng ở phía bắc bàn (khoảng trống 1,35 m tới dãy bếp).
  { id: 'ban-an', pos: [4, 0, 2], kind: 'desk', standAt: [4, 0, 0.4], facing: 0 },
  // Bếp: đứng trước bếp nấu trên nhánh đông của chữ L.
  { id: 'bep', pos: [6.5, 0, -2.5], kind: 'desk', standAt: [5.3, 0, -2.5], facing: 90 },
  { id: 'cua-so', pos: [-1, 0, 5], kind: 'door', standAt: [-1, 0, 3.8], facing: 0 },
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
  // D1 (Issue #43): 4 góc máy căn nhà — khai tay trong `world.cameraPreset`
  // (không rơi vào `cameraFocus` chung) để không bị offset chéo cố định đẩy
  // camera xuyên tường khi mục tiêu nằm sát cửa sổ/tường.
  'phong-khach',
  'ban-lam-viec',
  'bep',
  'cua-so',
] as const;

export function timPlace(id: string): DinhNghiaPlace | undefined {
  return PLACES.find((p) => p.id === id);
}

/* ------------------------------------------- C2 (#32) — tên gọi nhân vật */

/**
 * TÊN HIỂN THỊ của nhân vật — Boss 28/10: **đổi Gen → "Nhi", Javis → "Nam"**
 * cho dễ gọi/nhận diện (trước đó 26/10 là "Javis").
 *
 * `id` giữ nguyên `owner`/`gen` (KHÔNG đổi) vì cả `controlledBy`, phím WASD,
 * camera `theo-owner`, nguồn `user.text` và MCP đều viết theo id đó — đổi id
 * là phá hợp đồng với agent. Chỉ **tên hiện trên bong bóng chữ và trong
 * `stage.describe().actors[].name`** đổi thành "Nam"/"Nhi".
 */
export const TEN_HIEN_THI: Record<string, string> = {
  owner: 'Nam',
  gen: 'Nhi',
};

/**
 * Bí danh để GỌI nhân vật bằng giọng (C2 — `src/behavior/hieu-lenh.ts`).
 *
 * Viết sẵn cả những cách STT tiếng Việt hay nghe sai: "Javis" rất dễ ra
 * "Ja-vít", "Gia vis", "Gia vít"; "Gen" ra "Ghen"/"Gien". Máy khớp còn cộng
 * thêm fuzzy ≤2 ký tự nên bảng này chỉ cần những biến thể **khác hẳn** chữ gốc.
 *
 * GIỮ nguyên mọi bí danh cũ (`javis`, `gen`, `david`…) — đổi tên hiển thị
 * không được phá câu Sếp quen gọi theo tên cũ.
 *
 * **"Nam"/"Nhi" là từ tiếng Việt thường** ("phía nam", "nam châm", "nhí
 * nhảnh", và cả số đếm — xem `SO_CHU` trong `ngu-phap.ts`: `nhi` = 2, `nam` =
 * 5) nên KHÔNG khai bừa làm bí danh trần một từ: máy khớp (`timCum` trong
 * `hieu-lenh.ts`) tìm cụm ở BẤT KỲ đâu trong câu, khai "nam" trần là "cục nam
 * châm" cũng bị hiểu thành gọi tên. Chỉ khai **cụm có tín hiệu gọi tên rõ**
 * (kèm "ơi"/"à", hoặc "anh"/"em" đứng trước) — những cụm này gần như không
 * bao giờ xuất hiện tình cờ trong câu thường. Trường hợp gọi trần ở **đầu câu
 * kèm dấu phẩy** ("Nam, mở đèn") được xử lý RIÊNG, có ràng buộc vị trí, ngay
 * trong `tachNguoiNhan()` — xem chú thích ở đó.
 */
export const BI_DANH_NHAN_VAT: Record<string, string[]> = {
  /**
   * E1 (#48) việc 6 — **cùng bộ đồng âm với `bridge/so-tu.ts`**.
   *
   * Hai lớp phải khớp nhau: `so-tu.ts` sửa chữ engine nghe được thành "Javis",
   * còn bảng này tách người nhận ra khỏi câu. Engine nghe `david` mà bảng này
   * không biết `david` thì câu vẫn chạy sang Gen — đúng lỗi đo được 26/10
   * (*"Javis, chào"* → Gen chào). Thêm cách nghe mới thì sửa **cả hai chỗ**.
   *
   * `hieu-lenh.ts` chạy `boDau()` trước khi so, nên khai có dấu hay không đều
   * khớp; giữ cả hai dạng cho người đọc dễ soi.
   */
  owner: [
    'javis',
    'ja vit',
    'ja vít',
    'javit',
    'gia vis',
    'gia vit',
    'gia vít',
    'gia viet',
    'gia viết',
    'gia việt',
    'giavis',
    'jarvis',
    'ja vis',
    'da vit',
    'đa vít',
    'david',
    'davids',
    // G2 (28/10) — "Nam" dễ trùng từ thường, chỉ khai cụm có tín hiệu gọi rõ.
    'nam oi',
    'nam ơi',
    'nam a',
    'nam à',
    'anh nam',
    'a nam',
  ],
  gen: [
    'gen',
    'ghen',
    /*
     * G3 (#67) — BỎ `gien`. Máy khớp cộng fuzzy ≤1 ký tự cho từ 4 ký tự
     * (`nguong()` trong `ngu-phap.ts`), nên `gien` bắt luôn **`mien`**: đo thật
     * trên bộ TTS bẩn thấy "**miền nam** …" bị hiểu thành gọi Nhi. "Gien" vốn
     * chỉ là một cách viết của "Gen" mà `gen` + fuzzy đã phủ gần hết.
     */
    'jen',
    'gel',
    // G2 (28/10) — "Nhi" dễ trùng từ thường ("nhí", số đếm), chỉ khai cụm có
    // tín hiệu gọi rõ.
    'nhi oi',
    'nhi ơi',
    'nhi a',
    'nhi à',
    'em nhi',
  ],
};
