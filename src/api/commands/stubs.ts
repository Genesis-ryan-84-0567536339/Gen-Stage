/**
 * stubs.ts — lệnh đã CHỐT trong spec nhưng thuộc đợt A2 (hành vi).
 *
 * Vì sao đăng ký sẵn: `stage.bootstrap` phải liệt kê **đủ** bộ lệnh v0.1 để
 * agent và Boss thấy toàn bộ mặt bằng ngay từ A1, và để A2 chỉ việc thay
 * handler chứ không phải sửa registry, UI hay bridge.
 *
 * Gọi một stub trả `{ ok: false, error: "A2…" }` — không bao giờ im lặng.
 *
 * A3 (`screen.*`, `module.*`, `fx.*`) đã thi công thật ở `screen.ts`,
 * `module.ts`, `fx.ts` — các stub tương ứng đã bỏ khỏi file này (đăng ký
 * trùng tên lệnh sẽ làm `Registry.dangKy` ném lỗi lúc khởi động).
 */
import type { CommandSpec, ParamSpec } from '../types';
import { EMOTES } from '../../stage/noi-dung';
import { P_ACTOR, pEnum, pSo } from './tien-ich';

function stub(
  dot: 'A2' | 'A3',
  cmd: string,
  group: string,
  desc: string,
  params: ParamSpec[],
  example: Record<string, unknown>,
  events: string[] = [],
): CommandSpec {
  return {
    cmd,
    group,
    desc,
    params,
    events,
    stub: dot,
    example: { cmd, args: example },
    handler() {
      throw new Error(
        `${dot}: lệnh "${cmd}" đã chốt trong spec nhưng do workflow ${dot} thi công, A1 chỉ đăng ký.`,
      );
    },
  };
}

export const LENH_STUB: CommandSpec[] = [
  /* ---------------------------------------------------------- A2: hành vi */
  stub(
    'A2',
    'actor.emote',
    'actor',
    'Cảm xúc trọn gói: mặt + chuỗi chuyển động cơ thể + âm ngắn + (tuỳ chọn) nói',
    [
      P_ACTOR,
      pEnum('emote', 'Tên emote', { required: true, values: EMOTES }),
      pSo('intensity', 'Độ mạnh 0–1', { min: 0, max: 1, default: 1 }),
      { name: 'say', type: 'text', desc: 'Nói kèm (tuỳ chọn)' },
    ],
    { actor: 'lan', emote: 'vui', intensity: 1 },
    ['actor.emoteDone'],
  ),
  stub(
    'A2',
    'actor.idleStyle',
    'actor',
    'Đổi dáng đứng chờ để nhân vật không bao giờ đứng im',
    [
      P_ACTOR,
      pEnum('style', 'Kiểu đứng chờ', {
        required: true,
        values: ['binh-thuong', 'hao-hung', 'met', 'cang-thang'],
      }),
    ],
    { actor: 'lan', style: 'hao-hung' },
  ),
];
