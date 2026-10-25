/**
 * stubs.ts — chỗ đăng ký lệnh "đã CHỐT trong spec nhưng chưa thi công".
 *
 * Vì sao vẫn giữ file: `stage.bootstrap` phải liệt kê **đủ** bộ lệnh của spec
 * để agent và Boss thấy toàn bộ mặt bằng ngay từ đầu; đợt sau chỉ việc thay
 * handler chứ không phải sửa registry, UI hay bridge. Mỗi stub trả
 * `{ ok: false, error: "<đợt>…" }` — không bao giờ im lặng.
 *
 * Hiện tại danh sách RỖNG: toàn bộ lệnh v0.1 đã thi công thật —
 *  - A2: `actor.emote`, `actor.idleStyle` → `commands/actor.ts`
 *  - A3: `screen.*`, `module.*`, `fx.*` → `commands/screen.ts`, `module.ts`, `fx.ts`
 *
 * Giữ file (thay vì xoá) để đợt sau có chỗ khai lệnh mới mà không phải dựng
 * lại khuôn; `Registry.dangKy` sẽ ném lỗi nếu khai trùng tên lệnh đã có thật.
 */
import type { CommandSpec } from '../types';

export const LENH_STUB: CommandSpec[] = [];
