/**
 * so-tieng.ts — **sổ nối** giữa sân khấu (`src/stage/nhanvat.ts`) và lớp tiếng
 * (`src/audio/tts-client.ts`), B2 / Issue #20.
 *
 * File này cố tình **không phụ thuộc gì** (không Three.js, không DOM): nó là
 * chỗ duy nhất hai tầng gặp nhau, nên `nhanvat.ts` nạp được mà không kéo lớp
 * tiếng, và test Node nạp `commands/actor.ts` cũng không kéo Three.js.
 *
 * Ba việc, mỗi việc một chiều:
 *  1. **Sổ miệng** — nhân vật tự ghi tên vào đây lúc sinh ra, để lớp tiếng tìm
 *     đúng người mà nhép miệng theo biên độ âm.
 *  2. **Thời lượng thật** — lớp tiếng báo "câu này audio dài đúng N ms", để
 *     `uocThoiLuongNoi` trả số thật thay vì đếm ký tự (spec: `durationMs` là
 *     lời hứa với agent).
 *  3. **Chặn Web Speech** — khi đã có giọng edge-tts thì giọng mặc định của
 *     trình duyệt phải im, không thì nói chồng hai tiếng.
 */

/** Phần duy nhất của nhân vật mà lớp tiếng cần biết. */
export interface MiengNhep {
  /** Nhép miệng theo biên độ âm thật, `rms` 0–1 (xem `NhanVat`). */
  nhepMiengTheoBienDo(rms: number): void;
}

const SO_MIENG = new Map<string, MiengNhep>();

/** Nhân vật tự ghi tên lúc sinh ra (gọi trong constructor `NhanVat`). */
export function ghiMiengNhep(id: string, nv: MiengNhep): void {
  SO_MIENG.set(id, nv);
}

/** Bỏ khỏi sổ (actor rời sân khấu). Gọi lại nhiều lần không sao. */
export function boMiengNhep(id: string): void {
  SO_MIENG.delete(id);
}

export function timMiengNhep(id: string): MiengNhep | null {
  return SO_MIENG.get(id) ?? null;
}

/* ------------------------------------------------------ thời lượng thật */

let doThat: ((chu: string) => number | null) | null = null;

/**
 * Lớp tiếng gắn hàm tra thời lượng audio thật vào đây. Truyền `null` để trả
 * `uocThoiLuongNoi` về cách đếm ký tự như cũ.
 */
export function datDoThoiLuongThat(fn: ((chu: string) => number | null) | null): void {
  doThat = fn;
}

/** `null` = chưa biết (chưa tải audio, hoặc không có bridge). */
export function thoiLuongThat(chu: string): number | null {
  if (!doThat) return null;
  try {
    const ms = doThat(chu);
    return ms !== null && Number.isFinite(ms) && ms > 0 ? ms : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------- chặn Web Speech */

let chanDoc = false;

/** Lớp tiếng bật cờ này khi nó đang lo phần giọng (edge-tts). */
export function datChanWebSpeech(bat: boolean): void {
  chanDoc = bat;
}

export function dangChanWebSpeech(): boolean {
  return chanDoc;
}
