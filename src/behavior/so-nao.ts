/**
 * so-nao.ts — **sổ nối sân khấu ↔ não** (C0, Issue #28).
 *
 * Một con số duy nhất: *đang có mấy client MCP nối vào bridge*. Ai biết thì
 * ghi vào đây (`src/bridge-client.ts` khi bridge báo `bridge.brain`), ai cần
 * thì đọc ra đây (`stage.describe` → `brainConnected`).
 *
 * Tách thành một file **không phụ thuộc gì** (đúng mẫu `src/audio/so-tieng.ts`)
 * vì hai bên không được biết nhau: sân khấu không được nối ws, mà lớp bridge
 * không được chạm Three.js. Không có bridge → không ai ghi → `false`, đúng như
 * spec mục 3.2d đòi.
 */

/** Số client MCP (não) đang nối vào bridge. */
let soClientNao = 0;

/** Bridge báo số client MCP đang nối. */
export function datSoNao(n: number): void {
  soClientNao = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Số client MCP đang nối (0 = chưa có não, hoặc chưa có bridge). */
export function soNao(): number {
  return soClientNao;
}

/** Có não nối hay không — giá trị của `stage.describe().brainConnected`. */
export function coNao(): boolean {
  return soClientNao > 0;
}

/** Dọn sổ (mất bridge, `stage.reset`, giữa hai test). */
export function xoaSoNao(): void {
  soClientNao = 0;
}
