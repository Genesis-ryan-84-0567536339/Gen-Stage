/**
 * scene.ts — nhóm lệnh ánh sáng cảnh (spec mục 3.3).
 */
import type { CommandSpec } from '../types';
import { PRESET_DEN } from '../../stage/noi-dung';
import { ngay, pEnum } from './tien-ich';

export const LENH_SCENE: CommandSpec[] = [
  {
    cmd: 'scene.light',
    group: 'scene',
    events: ['scene.lightChanged'],
    desc: 'Đổi ánh sáng cảnh theo preset',
    params: [
      pEnum('preset', 'Kiểu sáng', {
        required: true,
        values: PRESET_DEN,
        default: 'sang',
      }),
    ],
    example: { cmd: 'scene.light', args: { preset: 'am' } },
    handler(a, ctx) {
      const preset = String(a.preset);
      ctx.world.sceneLight(preset);
      ctx.bus.emit('scene.lightChanged', { preset });
      return ngay({ preset });
    },
  },
];
