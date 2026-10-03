/**
 * stage.ts — nhóm lệnh meta (spec mục 3.1).
 *
 * `stage.bootstrap` là **sách hướng dẫn tự sinh**: nó đọc registry, không có
 * danh sách viết tay nào, nên thêm lệnh mới là bootstrap tự biết.
 */
import type { CommandSpec } from '../types';
import { moTaLenh } from '../registry';
import { ngay } from './tien-ich';

export const PHIEN_BAN_API = '0.1';

export const LENH_STAGE: CommandSpec[] = [
  {
    cmd: 'stage.bootstrap',
    group: 'stage',
    desc: 'Toàn bộ sách hướng dẫn: version, mọi lệnh + mô tả + ví dụ, danh sách actor/place/prop/clip/biểu cảm. Agent gọi đầu tiên.',
    params: [],
    example: { cmd: 'stage.bootstrap' },
    handler(_a, ctx) {
      const w = ctx.world;
      const lenh = ctx.registry.all().map((sp) => moTaLenh(sp, w));
      return ngay({
        version: PHIEN_BAN_API,
        huongDan:
          'Gọi stage.describe để đọc trạng thái bằng số (mét, facing độ, distances tính sẵn), ' +
          'rồi chọn lệnh trong danh sách dưới. Lệnh có "chuaLam" là của đợt A2/A3, gọi sẽ trả ok:false.',
        quyUocDo: {
          donVi: 'mét',
          goc: 'giữa phòng',
          facing: 'độ, 0 = hướng camera mặc định (+Z)',
          trangThaiActor: [
            'idle',
            'walking',
            'sitting',
            'playing',
            'speaking',
            'emoting',
            'building',
          ],
          hangDoi:
            'busy=true thì lệnh mới vào hàng đợi; thêm interrupt:true để cắt ngang',
        },
        groups: ctx.registry.groups(),
        commands: lenh,
        actors: w.actorIds(),
        places: w.describe().places,
        props: w.propIds(),
        screens: w.screenIds(),
        clips: w.clips(),
        expressions: w.expressions(),
        emotes: w.emotes(),
        voices: dsGiong(),
        events: [
          'actor.spawned',
          'actor.removed',
          'actor.arrived',
          'actor.turned',
          'actor.sat',
          'actor.stood',
          'actor.clipDone',
          'actor.sayDone',
          'actor.bubbleDone',
          'actor.stopped',
          'actor.held',
          'actor.dropped',
          'prop.spawned',
          'prop.removed',
          'prop.moved',
          'prop.set',
          'scene.lightChanged',
          'camera.moved',
          'script.step',
          'script.done',
          'script.stopped',
          'cmd.queued',
          'cmd.interrupted',
          'cmd.error',
          'stage.reset',
        ],
      });
    },
  },

  {
    cmd: 'stage.describe',
    group: 'stage',
    desc: 'Trạng thái sân khấu bằng số: actor ở đâu, làm gì, khoảng cách tới mọi place',
    params: [],
    example: { cmd: 'stage.describe' },
    handler(_a, ctx) {
      const st = ctx.world.describe();
      const hd = ctx.hangDoi();
      // ghép thông tin hàng đợi của dispatcher vào snapshot: `busy` phải phản
      // ánh cả hành động trong sân khấu lẫn lệnh đang chờ ở dispatcher
      st.actors = st.actors.map((a) => {
        const q = hd[a.id];
        return q ? { ...a, busy: a.busy || q.busy, queued: q.queued } : a;
      });
      return ngay(st as unknown as Record<string, unknown>);
    },
  },

  {
    cmd: 'stage.reset',
    group: 'stage',
    desc: 'Về trạng thái ban đầu: xoá actor/prop thêm vào, dọn hàng đợi, đèn và camera mặc định',
    params: [],
    example: { cmd: 'stage.reset' },
    async handler(_a, ctx) {
      for (const id of ctx.world.actorIds()) ctx.catNgang(id);
      await ctx.world.reset();
      ctx.bus.emit('stage.reset', {});
      return ngay({ reset: true, actors: ctx.world.actorIds() });
    },
  },
];

/** Danh sách giọng Web Speech có trên máy (rỗng khi chạy ngoài trình duyệt). */
function dsGiong(): string[] {
  const g = globalThis as { speechSynthesis?: { getVoices(): { name: string; lang: string }[] } };
  if (!g.speechSynthesis) return [];
  try {
    return g.speechSynthesis
      .getVoices()
      .filter((v) => v.lang.startsWith('vi') || v.lang.startsWith('en'))
      .map((v) => `${v.name} (${v.lang})`);
  } catch {
    return [];
  }
}
