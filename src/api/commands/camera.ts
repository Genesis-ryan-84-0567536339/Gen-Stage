/**
 * camera.ts — nhóm lệnh máy quay (spec mục 3.3).
 */
import type { CommandSpec } from '../types';
import { PRESET_MAY } from '../../stage/noi-dung';
import { ngay, pEnum, pSo } from './tien-ich';

export const LENH_CAMERA: CommandSpec[] = [
  {
    cmd: 'camera.focus',
    group: 'camera',
    events: ['camera.moved'],
    desc: 'Bay tới nhìn gần một actor / prop / place',
    params: [
      {
        name: 'target',
        type: 'target',
        desc: 'Mục tiêu',
        required: true,
        goiY: 'targets',
        tuDo: true,
      },
      pSo('distance', 'Khoảng cách mét', { min: 0.5, max: 12, default: 2.6 }),
    ],
    example: { cmd: 'camera.focus', args: { target: 'lan', distance: 2.2 } },
    handler(a, ctx) {
      const target = String(a.target);
      ctx.world.cameraFocus(target, a.distance as number | undefined);
      ctx.bus.emit('camera.moved', { target, distance: a.distance ?? null });
      return ngay({ target, distance: a.distance ?? null });
    },
  },

  {
    cmd: 'camera.preset',
    group: 'camera',
    events: ['camera.moved'],
    desc: 'Về một góc máy đặt sẵn',
    params: [
      pEnum('name', 'Góc máy', {
        required: true,
        values: PRESET_MAY,
        default: 'toan-canh',
      }),
    ],
    example: { cmd: 'camera.preset', args: { name: 'toan-canh' } },
    handler(a, ctx) {
      const name = String(a.name);
      ctx.world.cameraPreset(name);
      ctx.bus.emit('camera.moved', { preset: name });
      return ngay({ preset: name });
    },
  },
];
