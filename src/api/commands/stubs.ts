/**
 * stubs.ts — lệnh đã CHỐT trong spec nhưng thuộc đợt A2 (hành vi) / A3 (lab).
 *
 * Vì sao đăng ký sẵn: `stage.bootstrap` phải liệt kê **đủ** bộ lệnh v0.1 để
 * agent và Boss thấy toàn bộ mặt bằng ngay từ A1, và để A2/A3 chỉ việc thay
 * handler chứ không phải sửa registry, UI hay bridge.
 *
 * Gọi một stub trả `{ ok: false, error: "A2…" }` — không bao giờ im lặng.
 */
import type { CommandSpec, ParamSpec } from '../types';
import { EMOTES } from '../../stage/noi-dung';
import { HINH_PROP } from './prop';
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

const P_SCREEN: ParamSpec = {
  name: 'screen',
  type: 'enum',
  desc: 'Màn hình hologram',
  required: true,
  goiY: 'screens',
  tuDo: true,
};

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

  /* ------------------------------------------------- A3: màn hình hologram */
  stub(
    'A3',
    'screen.spawn',
    'screen',
    'Thêm một tấm hologram trong suốt phát sáng',
    [
      { name: 'id', type: 'string', desc: 'Mã màn hình', required: true },
      { name: 'at', type: 'target', desc: 'Place hoặc toạ độ', goiY: 'places', tuDo: true },
      pSo('size', 'Chiều rộng mét', { min: 0.3, max: 8 }),
      pSo('tilt', 'Nghiêng (độ)', { min: -45, max: 45 }),
    ],
    { id: 'main', at: 'buc-trung-tam', size: 2.4 },
  ),
  stub('A3', 'screen.remove', 'screen', 'Bỏ màn hình', [P_SCREEN], { screen: 'main' }),
  stub(
    'A3',
    'screen.show',
    'screen',
    'Hiện nội dung tĩnh trên màn hình',
    [
      P_SCREEN,
      pEnum('kind', 'Loại nội dung', {
        required: true,
        values: ['text', 'code', 'log', 'chart', 'image'],
      }),
      { name: 'content', type: 'text', desc: 'Nội dung', required: true },
    ],
    { screen: 'main', kind: 'code', content: 'const a = 1;' },
  ),
  stub(
    'A3',
    'screen.stream',
    'screen',
    'Chữ/code chạy dần như đang được gõ (agent đẩy từng mẩu)',
    [
      P_SCREEN,
      pEnum('kind', 'Loại nội dung', {
        required: true,
        values: ['text', 'code', 'log', 'chart', 'image'],
      }),
      { name: 'chunks', type: 'json', desc: 'Mảng mẩu nội dung' },
      { name: 'source', type: 'string', desc: 'Nguồn đẩy, vd "agent"' },
    ],
    { screen: 'main', kind: 'code', source: 'agent' },
    ['screen.streamDone'],
  ),
  stub('A3', 'screen.clear', 'screen', 'Xoá nội dung màn hình', [P_SCREEN], {
    screen: 'main',
  }),
  stub('A3', 'screen.focus', 'screen', 'Bay màn hình tới trước mặt nhân vật/camera', [P_SCREEN], {
    screen: 'main',
  }),

  /* ------------------------------------------------------- A3: module + fx */
  stub(
    'A3',
    'module.build',
    'module',
    'Hiệu ứng kết tinh: hạt sáng từ màn hình tụ thành vật thể rồi rơi vào tay nhân vật',
    [
      { name: 'id', type: 'string', desc: 'Mã module', required: true },
      pEnum('shape', 'Hình kết tinh', { required: true, values: HINH_PROP }),
      { name: 'label', type: 'string', desc: 'Nhãn hiện trên module', required: true },
      { name: 'from', type: 'enum', desc: 'Kết tinh từ màn hình nào', goiY: 'screens', tuDo: true },
      pSo('durationMs', 'Thời lượng hiệu ứng (ms)', { min: 200, max: 20000 }),
    ],
    { id: 'connector-baserow', shape: 'book', label: 'Baserow', from: 'main' },
    ['module.built'],
  ),
  stub(
    'A3',
    'module.open',
    'module',
    'Mở module ra thành màn hình nhỏ hiện nội dung bên trong',
    [pEnum('module', 'Module', { required: true, goiY: 'props' })],
    { module: 'connector-baserow' },
  ),
  stub(
    'A3',
    'module.store',
    'module',
    'Đặt module lên kệ/bàn lưu trữ',
    [
      pEnum('module', 'Module', { required: true, goiY: 'props' }),
      pEnum('to', 'Place lưu trữ', { required: true, goiY: 'places' }),
    ],
    { module: 'connector-baserow', to: 'ke-module' },
  ),
  stub(
    'A3',
    'fx.play',
    'fx',
    'Hiệu ứng ánh sáng/âm ngắn',
    [
      pEnum('name', 'Tên hiệu ứng', {
        required: true,
        values: ['scan', 'pulse', 'alert', 'success'],
      }),
      { name: 'at', type: 'target', desc: 'Nơi phát', goiY: 'targets', tuDo: true },
      pSo('durationMs', 'Thời lượng (ms)', { min: 100, max: 20000 }),
    ],
    { name: 'success' },
  ),
];
