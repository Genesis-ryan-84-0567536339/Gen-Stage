/**
 * so-giong.ts — **sổ nối** giữa mic (`src/audio/mic.ts`) và bộ lệnh
 * (`src/api/commands/actor.ts`), C1 / Issue #31.
 *
 * Cùng lối với `so-tieng.ts`: file này **không phụ thuộc gì** (không DOM,
 * không Three.js), nên `commands/actor.ts` nạp được trong vitest Node mà không
 * kéo theo `MediaRecorder`.
 *
 * Vì sao cần sổ thay vì thêm tham số vào `actor.say`: spec mục 3.5 nói `user.text`
 * có **đúng một nguồn** là `actor.say` lên nhân vật `owner`, và ba cửa của Boss
 * (phím Space, ô chat, bảng lệnh) đi qua đúng đó. Mic là cửa thứ tư và đi qua
 * y hệt ô chat — nếu thêm `confidence`/`source` vào tham số `actor.say` thì
 * mọi agent gọi lệnh đó phải học thêm hai khoá không liên quan đến diễn xuất.
 * Nên mic **ghi phiếu** vào đây ngay trước khi gửi, `actor.say` thấy phiếu
 * khớp đúng câu thì bắn thêm `user.speech`.
 */

/** Phiếu mic để lại: câu này đến từ giọng nói, không phải tay gõ. */
export interface PhieuGiong {
  /** Nguyên văn chữ nhận được (so để chắc đúng câu). */
  text: string;
  /** 0…1 — engine tin tới đâu (xem `bridge/stt.ts`). */
  confidence: number;
  /** Thời gian nhận dạng (ms) — spec mục 3.5. */
  durationMs: number;
  /** Boss mở đầu bằng "Gen ơi / Gen à / Gen," → đang gọi Gen. */
  goiGen: boolean;
}

/** Phiếu chỉ sống bấy nhiêu ms. Quá hạn là chữ cũ, coi như Boss gõ tay. */
const HAN_MS = 20_000;

let phieu: (PhieuGiong & { khi: number }) | null = null;

/** Mic gọi ngay trước khi gửi câu đi (`src/audio/mic.ts`). */
export function datPhieuGiong(p: PhieuGiong): void {
  phieu = { ...p, khi: Date.now() };
}

/**
 * `actor.say` gọi: câu `text` này có phải Boss vừa nói không?
 *
 * **Dùng một lần** — lấy ra là xoá, nên Boss gõ lại đúng câu đó bằng tay thì
 * không bị tính là nói, và `actor.say` của agent không ăn trộm phiếu.
 */
export function layPhieuGiong(text: string): PhieuGiong | null {
  if (!phieu) return null;
  const cu = phieu;
  if (Date.now() - cu.khi > HAN_MS) {
    phieu = null;
    return null;
  }
  if (cu.text.trim() !== text.trim()) return null;
  phieu = null;
  const { khi: _khi, ...ra } = cu;
  return ra;
}

/** Xoá phiếu (Boss sửa chữ trong ô chat rồi gửi → tính là gõ tay). */
export function boPhieuGiong(): void {
  phieu = null;
}
