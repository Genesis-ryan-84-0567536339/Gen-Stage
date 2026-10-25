/**
 * emotes.ts — cấu hình 15 emote (spec mục 3.2b): mặt + chuỗi chuyển động cơ
 * thể + âm ngắn, dạng dữ liệu để thêm emote mới = thêm 1 dòng, không sửa code
 * lõi (`nhanvat.ts` chỉ đọc `body` để biết tư thế nào, và `am` để phát tiếng).
 *
 * `body` khớp với một case trong `apDungEmote` (`src/stage/nhanvat.ts`) —
 * thêm emote mới nhớ thêm cả case tương ứng, không thì rơi về tư thế rỗng.
 */

/** Một nốt trong tiếng ngắn tổng hợp bằng Web Audio (không cần file âm). */
export interface NotNgan {
  /** Tần số Hz. */
  f: number;
  /** Thời lượng nốt (ms). */
  ms: number;
  type?: OscillatorType;
  /** Biên độ 0–1. */
  gain?: number;
}

export interface DinhNghiaEmote {
  id: string;
  /** Biểu cảm VRM áp trong lúc emote. */
  expression: string;
  /** Độ mạnh mặt ở intensity=1 (0–1). */
  weightMat: number;
  /** Khoá tư thế cơ thể — khớp case trong `apDungEmote`. */
  body: string;
  /** Thời lượng trọn gói ở intensity=1 (ms). */
  durationMs: number;
  /** Nhãn tiếng Việt ngắn, cho UI/nhật ký. */
  nhan: string;
  /** Âm ngắn tổng hợp — rỗng thì im lặng (vd `tu-choi`, `cham-chu`). */
  am: NotNgan[];
}

const vang = (f: number, ms = 140, gain = 0.5): NotNgan => ({ f, ms, gain, type: 'sine' });

/**
 * Thư viện emote v0.1 (spec mục 3.2b) — mỗi dòng là TRỌN GÓI mặt + cơ thể + âm.
 * `durationMs` đã kể cả thời gian mềm vào/ra của tư thế.
 */
export const DINH_NGHIA_EMOTE: Record<string, DinhNghiaEmote> = {
  vui: {
    id: 'vui',
    expression: 'happy',
    weightMat: 0.9,
    body: 'vui',
    durationMs: 1800,
    nhan: 'Vui',
    am: [vang(660, 110), vang(880, 160)],
  },
  'rat-vui': {
    id: 'rat-vui',
    expression: 'happy',
    weightMat: 1,
    body: 'rat-vui',
    durationMs: 2200,
    nhan: 'Rất vui',
    am: [vang(660, 90), vang(880, 90), vang(1046, 200)],
  },
  buon: {
    id: 'buon',
    expression: 'sad',
    weightMat: 0.85,
    body: 'buon',
    durationMs: 2200,
    nhan: 'Buồn',
    am: [vang(330, 420, 0.3)],
  },
  'ngac-nhien': {
    id: 'ngac-nhien',
    expression: 'surprised',
    weightMat: 1,
    body: 'ngac-nhien',
    durationMs: 1400,
    nhan: 'Ngạc nhiên',
    am: [vang(520, 90, 0.45), vang(740, 140, 0.4)],
  },
  gian: {
    id: 'gian',
    expression: 'angry',
    weightMat: 0.9,
    body: 'gian',
    durationMs: 1900,
    nhan: 'Giận',
    am: [vang(220, 160, 0.4), vang(180, 160, 0.4)],
  },
  'suy-nghi': {
    // spec ghi "neutral + nheo mắt": dùng neutral, phần nheo mắt do `blink`
    // nhẹ + đầu nghiêng trong cử chỉ lo (review PR #10 mục 2.5)
    id: 'suy-nghi',
    expression: 'neutral',
    weightMat: 0.2,
    body: 'suy-nghi',
    durationMs: 2600,
    nhan: 'Suy nghĩ',
    am: [vang(440, 260, 0.25)],
  },
  'dong-y': {
    id: 'dong-y',
    expression: 'happy',
    weightMat: 0.55,
    body: 'dong-y',
    durationMs: 1300,
    nhan: 'Đồng ý',
    am: [vang(523, 110, 0.4)],
  },
  'tu-choi': {
    id: 'tu-choi',
    expression: 'sad',
    weightMat: 0.4,
    body: 'tu-choi',
    durationMs: 1300,
    nhan: 'Từ chối',
    am: [],
  },
  chao: {
    id: 'chao',
    expression: 'happy',
    weightMat: 0.8,
    body: 'chao',
    durationMs: 2000,
    nhan: 'Chào',
    am: [vang(587, 130, 0.4)],
  },
  'ra-lenh': {
    id: 'ra-lenh',
    expression: 'neutral',
    weightMat: 0.3,
    body: 'ra-lenh',
    durationMs: 1600,
    nhan: 'Ra lệnh',
    am: [vang(392, 70, 0.3), vang(392, 70, 0.3)],
  },
  'thanh-cong': {
    id: 'thanh-cong',
    expression: 'happy',
    weightMat: 1,
    body: 'thanh-cong',
    durationMs: 2000,
    nhan: 'Thành công',
    am: [vang(523, 100), vang(659, 100), vang(784, 220)],
  },
  'that-bai': {
    id: 'that-bai',
    expression: 'sad',
    weightMat: 0.9,
    body: 'that-bai',
    durationMs: 2000,
    nhan: 'Thất bại',
    am: [vang(392, 160, 0.35), vang(294, 260, 0.35)],
  },
  'boi-roi': {
    id: 'boi-roi',
    expression: 'surprised',
    weightMat: 0.5,
    body: 'boi-roi',
    durationMs: 1800,
    nhan: 'Bối rối',
    am: [],
  },
  met: {
    id: 'met',
    expression: 'relaxed',
    weightMat: 0.7,
    body: 'met',
    durationMs: 2400,
    nhan: 'Mệt',
    am: [{ ...vang(300, 500, 0.25), type: 'triangle' as const }],
  },
  'cham-chu': {
    id: 'cham-chu',
    expression: 'neutral',
    weightMat: 0.25,
    body: 'cham-chu',
    durationMs: 2200,
    nhan: 'Chăm chú',
    am: [],
  },
};

import { EMOTES } from '../stage/noi-dung';

// Mỗi emote trong spec (`noi-dung.ts`) phải có đúng 1 dòng cấu hình — thiếu là
// lỗi cấu hình, lộ ngay lúc chạy thay vì rơi vào tư thế rỗng im lặng.
for (const ten of EMOTES) {
  if (!DINH_NGHIA_EMOTE[ten]) {
    throw new Error(`emotes.ts thiếu cấu hình cho emote "${ten}"`);
  }
}

