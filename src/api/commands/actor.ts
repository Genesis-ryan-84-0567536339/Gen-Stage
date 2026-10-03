/**
 * actor.ts — nhóm lệnh nhân vật (spec mục 3.2).
 *
 * Mọi lệnh có thời lượng (`moveTo`, `sit`, `play`, `say`…) khai `chiemActor:
 * 'actor'`: dispatcher sẽ xếp hàng khi nhân vật đang bận, hoặc cắt ngang nếu
 * lệnh có `interrupt: true`.
 */
import type { CommandSpec, Vec3 } from '../types';
import { BIEU_CAM } from '../../stage/noi-dung';
import { P_ACTOR, ngay, pEnum, pSo, tuHanhDong } from './tien-ich';

const s = (v: unknown) => String(v);

export const LENH_ACTOR: CommandSpec[] = [
  {
    cmd: 'actor.spawn',
    group: 'actor',
    events: ['actor.spawned'],
    desc: 'Thêm một nhân vật VRM vào sân khấu',
    params: [
      { name: 'id', type: 'string', desc: 'Mã ngắn, vd "lan"', required: true },
      {
        name: 'model',
        type: 'string',
        desc: 'File VRM trong kho',
        default: 'models/avatar.vrm',
      },
      { name: 'name', type: 'string', desc: 'Tên hiện trên bong bóng chữ' },
      {
        name: 'at',
        type: 'target',
        desc: 'Place hoặc toạ độ đặt nhân vật',
        goiY: 'places',
        tuDo: true,
        default: 'buc-trung-tam',
      },
    ],
    example: {
      cmd: 'actor.spawn',
      args: { id: 'minh', model: 'models/avatar.vrm', name: 'Minh', at: 'ban-2' },
    },
    async handler(a, ctx) {
      const snap = await ctx.world.actorSpawn({
        id: s(a.id),
        model: a.model === undefined ? undefined : s(a.model),
        name: a.name === undefined ? undefined : s(a.name),
        at: a.at as string | Vec3 | undefined,
      });
      ctx.bus.emit('actor.spawned', { actor: snap.id, at: snap.at, pos: snap.pos });
      return ngay({ actor: snap });
    },
  },

  {
    cmd: 'actor.remove',
    group: 'actor',
    events: ['actor.removed', 'cmd.interrupted'],
    desc: 'Bỏ nhân vật khỏi sân khấu',
    params: [P_ACTOR],
    example: { cmd: 'actor.remove', args: { actor: 'minh' } },
    handler(a, ctx) {
      const id = s(a.actor);
      if (!ctx.world.coActor(id)) throw new Error(`Không có actor "${id}"`);
      ctx.catNgang(id);
      ctx.world.actorRemove(id);
      ctx.bus.emit('actor.removed', { actor: id });
      return ngay({ actor: id, removed: true });
    },
  },

  {
    cmd: 'actor.list',
    group: 'actor',
    desc: 'Liệt kê nhân vật đang có kèm trạng thái',
    params: [],
    example: { cmd: 'actor.list' },
    handler(_a, ctx) {
      return ngay({ actors: ctx.world.describe().actors });
    },
  },

  {
    cmd: 'actor.moveTo',
    group: 'actor',
    events: ['actor.arrived', 'cmd.queued'],
    desc: 'Đi tới một place hoặc toạ độ (tự chơi walk, tới nơi về idle)',
    chiemActor: 'actor',
    params: [
      P_ACTOR,
      {
        name: 'to',
        type: 'target',
        desc: 'Place hoặc toạ độ "x, y, z"',
        required: true,
        goiY: 'places',
        tuDo: true,
      },
      pSo('speed', 'Tốc độ đi (m/s)', { min: 0.1, max: 4 }),
    ],
    example: { cmd: 'actor.moveTo', args: { actor: 'lan', to: 'ban-2' } },
    handler(a, ctx) {
      const hd = ctx.world.actorMoveTo(
        s(a.actor),
        a.to as string | Vec3,
        a.speed as number | undefined,
      );
      void hd.done.then(() =>
        ctx.bus.emit('actor.arrived', {
          actor: s(a.actor),
          to: a.to,
          pos: timActor(ctx, s(a.actor))?.pos ?? null,
        }),
      );
      return tuHanhDong(hd, { actor: s(a.actor), to: a.to });
    },
  },

  {
    cmd: 'actor.lookAt',
    group: 'actor',
    desc: 'Nhìn về actor / prop / place / camera / cursor (null = thả)',
    params: [
      P_ACTOR,
      {
        name: 'target',
        type: 'target',
        desc: 'Mục tiêu nhìn, "null" để thả',
        goiY: 'targets',
        tuDo: true,
        default: 'camera',
      },
    ],
    example: { cmd: 'actor.lookAt', args: { actor: 'lan', target: 'camera' } },
    handler(a, ctx) {
      const id = s(a.actor);
      if (!ctx.world.coActor(id)) throw new Error(`Không có actor "${id}"`);
      const t = a.target === null ? null : s(a.target);
      ctx.world.actorLookAt(id, t);
      return ngay({ actor: id, lookingAt: t });
    },
  },

  {
    cmd: 'actor.turnTo',
    group: 'actor',
    events: ['actor.turned', 'cmd.queued'],
    desc: 'Xoay người về mục tiêu',
    chiemActor: 'actor',
    params: [
      P_ACTOR,
      {
        name: 'target',
        type: 'target',
        desc: 'Mục tiêu xoay về',
        required: true,
        goiY: 'targets',
        tuDo: true,
      },
    ],
    example: { cmd: 'actor.turnTo', args: { actor: 'lan', target: 'cua' } },
    handler(a, ctx) {
      const hd = ctx.world.actorTurnTo(s(a.actor), a.target as string | Vec3);
      void hd.done.then(() =>
        ctx.bus.emit('actor.turned', { actor: s(a.actor), target: a.target }),
      );
      return tuHanhDong(hd, { actor: s(a.actor), target: a.target });
    },
  },

  {
    cmd: 'actor.sit',
    group: 'actor',
    events: ['actor.sat', 'cmd.queued'],
    desc: 'Ngồi xuống một ghế',
    chiemActor: 'actor',
    params: [
      P_ACTOR,
      pEnum('seat', 'Place loại ghế', { required: true, goiY: 'places' }),
    ],
    example: { cmd: 'actor.sit', args: { actor: 'lan', seat: 'ghe-2' } },
    handler(a, ctx) {
      const hd = ctx.world.actorSit(s(a.actor), s(a.seat));
      void hd.done.then(() =>
        ctx.bus.emit('actor.sat', { actor: s(a.actor), seat: s(a.seat) }),
      );
      return tuHanhDong(hd, { actor: s(a.actor), seat: s(a.seat) });
    },
  },

  {
    cmd: 'actor.stand',
    group: 'actor',
    events: ['actor.stood', 'cmd.queued'],
    desc: 'Đứng lên',
    chiemActor: 'actor',
    params: [P_ACTOR],
    example: { cmd: 'actor.stand', args: { actor: 'lan' } },
    handler(a, ctx) {
      const hd = ctx.world.actorStand(s(a.actor));
      void hd.done.then(() => ctx.bus.emit('actor.stood', { actor: s(a.actor) }));
      return tuHanhDong(hd, { actor: s(a.actor) });
    },
  },

  {
    cmd: 'actor.play',
    group: 'actor',
    events: ['actor.clipDone', 'cmd.queued'],
    desc: 'Chơi một chuyển động có tên (hết thì bắn actor.clipDone)',
    chiemActor: 'actor',
    params: [
      P_ACTOR,
      pEnum('clip', 'Tên chuyển động', { required: true, goiY: 'clips' }),
      { name: 'loop', type: 'boolean', desc: 'Lặp mãi', default: false },
      pSo('speed', 'Nhân tốc độ', { min: 0.1, max: 4, default: 1 }),
    ],
    example: { cmd: 'actor.play', args: { actor: 'lan', clip: 'wave' } },
    handler(a, ctx) {
      const loop = a.loop === true;
      const hd = ctx.world.actorPlay(
        s(a.actor),
        s(a.clip),
        loop,
        a.speed as number | undefined,
      );
      if (!loop) {
        void hd.done.then(() =>
          ctx.bus.emit('actor.clipDone', { actor: s(a.actor), clip: s(a.clip) }),
        );
      }
      return tuHanhDong(hd, { actor: s(a.actor), clip: s(a.clip), loop });
    },
  },

  {
    cmd: 'actor.stop',
    group: 'actor',
    events: ['actor.stopped', 'cmd.interrupted'],
    desc: 'Dừng mọi thứ đang làm, bỏ hàng đợi, về idle',
    params: [P_ACTOR],
    example: { cmd: 'actor.stop', args: { actor: 'lan' } },
    handler(a, ctx) {
      const id = s(a.actor);
      if (!ctx.world.coActor(id)) throw new Error(`Không có actor "${id}"`);
      const boQua = ctx.catNgang(id);
      ctx.world.actorStop(id);
      ctx.bus.emit('actor.stopped', { actor: id, boHangDoi: boQua });
      return ngay({ actor: id, boHangDoi: boQua });
    },
  },

  {
    cmd: 'actor.express',
    group: 'actor',
    desc: 'Đặt biểu cảm mặt (tinh chỉnh; cảm xúc trọn gói dùng actor.emote)',
    params: [
      P_ACTOR,
      pEnum('expression', 'Biểu cảm VRM', {
        required: true,
        values: BIEU_CAM,
      }),
      pSo('weight', 'Độ mạnh 0–1', { min: 0, max: 1, default: 1 }),
      pSo('durationMs', 'Tự về neutral sau bao lâu (ms)', { min: 0, max: 60000 }),
    ],
    example: {
      cmd: 'actor.express',
      args: { actor: 'lan', expression: 'happy', weight: 1, durationMs: 3000 },
    },
    handler(a, ctx) {
      const id = s(a.actor);
      if (!ctx.world.coActor(id)) throw new Error(`Không có actor "${id}"`);
      ctx.world.actorExpress(
        id,
        s(a.expression),
        a.weight as number | undefined,
        a.durationMs as number | undefined,
      );
      return ngay({ actor: id, expression: s(a.expression) });
    },
  },

  {
    cmd: 'actor.say',
    group: 'actor',
    events: ['actor.sayDone', 'cmd.queued'],
    desc:
      'Nói: bong bóng chữ + nhép miệng + giọng trình duyệt nếu có. Bắn actor.sayDone',
    chiemActor: 'actor',
    params: [
      P_ACTOR,
      { name: 'text', type: 'text', desc: 'Lời nói', required: true },
      pEnum('emotion', 'Cảm xúc khi nói (A2 làm cử chỉ theo cảm xúc)', {
        goiY: 'emotes',
        tuDo: true,
      }),
      { name: 'voice', type: 'string', desc: 'Tên giọng Web Speech' },
    ],
    example: {
      cmd: 'actor.say',
      args: { actor: 'lan', text: 'Sếp ơi, test xanh rồi!', emotion: 'vui' },
    },
    handler(a, ctx) {
      const hd = ctx.world.actorSay(
        s(a.actor),
        s(a.text),
        a.emotion === undefined ? undefined : s(a.emotion),
        a.voice === undefined ? undefined : s(a.voice),
      );
      void hd.done.then(() =>
        ctx.bus.emit('actor.sayDone', { actor: s(a.actor), text: s(a.text) }),
      );
      return tuHanhDong(hd, { actor: s(a.actor), text: s(a.text) });
    },
  },

  {
    cmd: 'actor.bubble',
    group: 'actor',
    events: ['actor.bubbleDone', 'cmd.queued'],
    desc: 'Chỉ hiện bong bóng chữ, không tiếng',
    chiemActor: 'actor',
    params: [
      P_ACTOR,
      { name: 'text', type: 'text', desc: 'Nội dung', required: true },
      pSo('durationMs', 'Hiện bao lâu (ms)', { min: 200, max: 60000 }),
    ],
    example: {
      cmd: 'actor.bubble',
      args: { actor: 'lan', text: 'Đang nghĩ…', durationMs: 2000 },
    },
    handler(a, ctx) {
      const hd = ctx.world.actorBubble(
        s(a.actor),
        s(a.text),
        a.durationMs as number | undefined,
      );
      void hd.done.then(() =>
        ctx.bus.emit('actor.bubbleDone', { actor: s(a.actor) }),
      );
      return tuHanhDong(hd, { actor: s(a.actor), text: s(a.text) });
    },
  },

  {
    cmd: 'actor.hold',
    group: 'actor',
    events: ['actor.held'],
    desc: 'Cầm một đồ vật lên tay',
    params: [
      P_ACTOR,
      pEnum('prop', 'Đồ vật', { required: true, goiY: 'props' }),
      pEnum('hand', 'Tay nào', {
        values: ['left', 'right'],
        default: 'right',
      }),
    ],
    example: {
      cmd: 'actor.hold',
      args: { actor: 'lan', prop: 'so-tay', hand: 'right' },
    },
    handler(a, ctx) {
      const id = s(a.actor);
      if (!ctx.world.coActor(id)) throw new Error(`Không có actor "${id}"`);
      const hand = a.hand === 'left' ? 'left' : 'right';
      ctx.world.actorHold(id, s(a.prop), hand);
      ctx.bus.emit('actor.held', { actor: id, prop: s(a.prop), hand });
      return ngay({ actor: id, prop: s(a.prop), hand });
    },
  },

  {
    cmd: 'actor.drop',
    group: 'actor',
    events: ['actor.dropped'],
    desc: 'Thả đồ đang cầm xuống chân',
    params: [P_ACTOR],
    example: { cmd: 'actor.drop', args: { actor: 'lan' } },
    handler(a, ctx) {
      const id = s(a.actor);
      if (!ctx.world.coActor(id)) throw new Error(`Không có actor "${id}"`);
      const prop = ctx.world.actorDrop(id);
      ctx.bus.emit('actor.dropped', { actor: id, prop });
      return ngay({ actor: id, prop });
    },
  },
];

function timActor(
  ctx: { world: { describe(): { actors: { id: string; pos: Vec3 }[] } } },
  id: string,
) {
  return ctx.world.describe().actors.find((x) => x.id === id);
}
