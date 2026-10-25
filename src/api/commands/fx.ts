/**
 * fx.ts — nhóm lệnh hiệu ứng ánh sáng/âm ngắn (spec mục 3.4b).
 */
import type { CommandSpec, Vec3 } from '../types';
import { pEnum, pSo, tuHanhDong } from './tien-ich';

export const TEN_FX = ['scan', 'pulse', 'alert', 'success'] as const;

export const LENH_FX: CommandSpec[] = [
  {
    cmd: 'fx.play',
    group: 'fx',
    events: ['fx.played'],
    desc: 'Hiệu ứng ánh sáng/âm ngắn: quét (scan), nhấp sáng (pulse), cảnh báo (alert), thành công (success)',
    params: [
      pEnum('name', 'Tên hiệu ứng', { required: true, values: TEN_FX }),
      {
        name: 'at',
        type: 'target',
        desc: 'Nơi phát (bỏ trống thì phát ở bục trung tâm)',
        goiY: 'targets',
        tuDo: true,
      },
      pSo('durationMs', 'Thời lượng (ms)', { min: 100, max: 20000 }),
    ],
    example: { cmd: 'fx.play', args: { name: 'success' } },
    handler(a, ctx) {
      const name = String(a.name);
      const hd = ctx.world.fxPlay(
        name,
        a.at as string | Vec3 | undefined,
        a.durationMs as number | undefined,
      );
      void hd.done.then(() => ctx.bus.emit('fx.played', { name, at: a.at ?? null }));
      return tuHanhDong(hd, { name });
    },
  },
];
