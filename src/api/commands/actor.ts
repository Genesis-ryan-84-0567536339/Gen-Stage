/**
 * actor.ts — nhóm lệnh nhân vật (spec mục 3.2).
 *
 * Mọi lệnh có thời lượng (`moveTo`, `sit`, `play`, `say`…) khai `chiemActor:
 * 'actor'`: dispatcher sẽ xếp hàng khi nhân vật đang bận, hoặc cắt ngang nếu
 * lệnh có `interrupt: true`.
 */
import type { CommandSpec, Vec3 } from '../types';
import { BIEU_CAM, EMOTES } from '../../stage/noi-dung';
import { IDLE_STYLES } from '../../behavior/idle-styles';
import { P_ACTOR, ngay, pEnum, pSo, tuHanhDong } from './tien-ich';
// B2 (#20) — giọng tiếng Việt thật qua bridge. `lopTieng()` trả `null` ngoài
// trình duyệt (test Node), nên mọi chỗ gọi đều có `?.`.
import { giongTheoActor, lopTieng } from '../../audio/tts-client';
import { boMiengNhep } from '../../audio/so-tieng';

const s = (v: unknown) => String(v);

/**
 * B2 — tải sẵn giọng cho một câu TRƯỚC khi sân khấu mở miệng.
 *
 * Phải xong trước `world.actorSay`/`actorEmote` vì `durationMs` của hành động
 * lấy từ `uocThoiLuongNoi`, mà hàm đó đọc thời lượng audio thật do lớp tiếng
 * vừa đo (xem `src/audio/so-tieng.ts`). Bridge tắt → `null`, sân khấu nói như
 * A1 (Web Speech `vi-VN`, không có thì nhép theo độ dài chữ).
 */
async function chuanBiGiong(
  actor: string,
  text: string,
  voice?: string,
  emotion?: string,
) {
  const t = lopTieng();
  if (!t) return null;
  try {
    return await t.chuanBi(actor, text, { voice, emotion });
  } catch {
    return null; // thiếu tiếng không bao giờ làm hỏng lệnh
  }
}

export const LENH_ACTOR: CommandSpec[] = [
  {
    cmd: 'actor.spawn',
    group: 'actor',
    events: ['actor.spawned'],
    desc: 'Thêm một nhân vật VRM vào sân khấu',
    params: [
      { name: 'id', type: 'string', desc: 'Mã ngắn, vd "gen"', required: true },
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
      pEnum('controlledBy', 'Ai điều khiển: owner (phím của Boss) hay agent', {
        values: ['owner', 'agent'],
        default: 'agent',
      }),
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
        controlledBy: a.controlledBy === 'owner' ? 'owner' : 'agent',
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
      lopTieng()?.huy(id); // B2 — dọn tiếng + sổ nhép miệng của actor này
      boMiengNhep(id);
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
    example: { cmd: 'actor.moveTo', args: { actor: 'gen', to: 'ban-2' } },
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
    cmd: 'actor.steer',
    group: 'actor',
    events: ['actor.steerDone'],
    desc:
      'Lái bằng vận tốc: đi theo (vx, vz) m/s trong ms rồi tự hết. Gọi lại để ' +
      'kéo dài; lệnh mới THAY lệnh cũ, không xếp hàng',
    /**
     * CỐ TÌNH KHÔNG khai `chiemActor` — và đây là một quyết định thiết kế, không
     * phải sơ sót (ghi trong spec mục 3.2c):
     *
     * `chiemActor` nghĩa là "actor bận thì XẾP HÀNG". Với điều khiển tay thì xếp
     * hàng là sai hẳn: Boss giữ phím W, cứ 100 ms một lệnh `actor.steer` bay
     * vào — xếp hàng thì nhả phím rồi nhân vật vẫn còn lết hết hàng đợi. Lệnh
     * này phải **thay** lệnh trước, tức thì.
     *
     * Vẫn là hành động **chiếm thân**: `NhanVat.lai()` giữ `NhanVat.viec`
     * (nguồn sự thật duy nhất của `state` theo CLAUDE.md) nên `state` là
     * `walking` khi đang đi, `at` trả `null`, và mỗi lần lái có token riêng —
     * steer mới huỷ steer cũ bằng token, không bằng tên lệnh.
     */
    params: [
      P_ACTOR,
      pSo('vx', 'Vận tốc theo trục X (m/s, + là sang phải)', {
        required: true,
        min: -4,
        max: 4,
      }),
      pSo('vz', 'Vận tốc theo trục Z (m/s, + là về phía camera)', {
        required: true,
        min: -4,
        max: 4,
      }),
      pSo('ms', 'Giữ vận tốc này bao lâu (ms) rồi tự dừng êm', {
        min: 0,
        max: 5000,
        default: 150,
      }),
    ],
    example: { cmd: 'actor.steer', args: { actor: 'gen', vx: 0, vz: -1.6, ms: 150 } },
    handler(a, ctx) {
      const id = s(a.actor);
      if (!ctx.world.coActor(id)) {
        throw new Error(
          `Không có actor "${id}". Đang có: ${ctx.world.actorIds().join(', ') || '(chưa có ai)'}`,
        );
      }
      const vx = Number(a.vx);
      const vz = Number(a.vz);
      const ms = a.ms === undefined ? 150 : Number(a.ms);
      const hd = ctx.world.actorSteer(id, vx, vz, ms);
      void hd.done.then(() =>
        ctx.bus.emit('actor.steerDone', { actor: id, vx, vz, ms }),
      );
      return tuHanhDong(hd, { actor: id, vx, vz, ms });
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
    example: { cmd: 'actor.lookAt', args: { actor: 'gen', target: 'camera' } },
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
    example: { cmd: 'actor.turnTo', args: { actor: 'gen', target: 'cua' } },
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
    example: { cmd: 'actor.sit', args: { actor: 'gen', seat: 'ghe-2' } },
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
    example: { cmd: 'actor.stand', args: { actor: 'gen' } },
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
    example: { cmd: 'actor.play', args: { actor: 'gen', clip: 'wave' } },
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
    example: { cmd: 'actor.stop', args: { actor: 'gen' } },
    handler(a, ctx) {
      const id = s(a.actor);
      if (!ctx.world.coActor(id)) throw new Error(`Không có actor "${id}"`);
      const boQua = ctx.catNgang(id);
      lopTieng()?.huy(id); // B2 — im tiếng ngay, không đọc tiếp sau khi stop
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
      args: { actor: 'gen', expression: 'happy', weight: 1, durationMs: 3000 },
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
    events: ['actor.sayStart', 'actor.sayDone', 'user.text', 'cmd.queued'],
    desc:
      'Nói: bong bóng chữ + nhép miệng + giọng trình duyệt nếu có. Bắn actor.sayDone; ' +
      'nếu actor là người Boss lái (controlledBy "owner") thì bắn thêm user.text để não nghe',
    chiemActor: 'actor',
    params: [
      P_ACTOR,
      { name: 'text', type: 'text', desc: 'Lời nói', required: true },
      pEnum('emotion', 'Cảm xúc khi nói (A2 làm cử chỉ theo cảm xúc)', {
        goiY: 'emotes',
        tuDo: true,
      }),
      {
        name: 'voice',
        type: 'string',
        desc: 'Giọng: "nu" | "nam" | tên giọng đầy đủ (mặc định: owner → nam, còn lại → nữ)',
      },
    ],
    example: {
      cmd: 'actor.say',
      args: { actor: 'gen', text: 'Sếp ơi, test xanh rồi!', emotion: 'vui', voice: 'nu' },
    },
    async handler(a, ctx) {
      const id = s(a.actor);
      // kiểm trước khi tải tiếng: actor không có thì lỗi ngay như cũ
      if (!ctx.world.coActor(id)) throw new Error(`Không có actor "${id}"`);
      const chu = s(a.text);
      const camXuc = a.emotion === undefined ? undefined : s(a.emotion);
      const giong = a.voice === undefined ? undefined : s(a.voice);

      /**
       * B3 (#21) — Owner nói là **sự kiện cho não**, không chỉ là lời thoại.
       *
       * Space / ô chat của Boss đi qua đúng lệnh này (`src/ui/phim.ts`,
       * `src/ui/o-chat.ts`), nên chỗ duy nhất biết "ai vừa nói" là đây. Nhân
       * vật `controlledBy: "owner"` mở miệng → bắn `user.text` để `stage_events`
       * của MCP đẩy sang não (spec mục 3.5). Agent nói thì KHÔNG bắn, không thì
       * Gen tự nghe lời mình rồi trả lời vòng vo mãi.
       */
      const nguoiNoi = ctx.world.describe().actors.find((x) => x.id === id);
      if (nguoiNoi?.controlledBy === 'owner') {
        ctx.bus.emit('user.text', { actor: id, text: chu });
      }

      const tieng = await chuanBiGiong(id, chu, giong, camXuc);
      const hd = ctx.world.actorSay(id, chu, camXuc, giong);
      // `actor.sayStart` bắn đúng lúc bong bóng chữ hiện ra (sau khi tải tiếng,
      // trước khi chờ nói xong). Driver não (`scripts/nao-agy.mjs`) đo độ trễ
      // "Sếp gõ → Gen bắt đầu nói" bằng mốc này, và tắt hẹn "xin Sếp chờ".
      ctx.bus.emit('actor.sayStart', { actor: id, text: chu });
      tieng?.phat();
      void hd.done.then(() => {
        if (tieng) lopTieng()?.huy(id);
        ctx.bus.emit('actor.sayDone', { actor: id, text: chu });
      });
      // trả **giọng đã chọn** (không phải tham số thô): agent đọc log biết ngay
      // câu này phát bằng giọng nào, kể cả khi `voice` bỏ trống.
      return tuHanhDong(hd, { actor: id, text: chu, voice: giongTheoActor(id, giong) });
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
      args: { actor: 'gen', text: 'Đang nghĩ…', durationMs: 2000 },
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
      args: { actor: 'gen', prop: 'so-tay', hand: 'right' },
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
    cmd: 'actor.emote',
    group: 'actor',
    events: ['actor.emoteDone', 'actor.emoteCancelled', 'cmd.queued'],
    desc:
      'Cảm xúc trọn gói: mặt + chuỗi chuyển động cơ thể + âm ngắn + (tuỳ chọn) nói',
    chiemActor: 'actor',
    params: [
      P_ACTOR,
      pEnum('emote', 'Tên emote', { required: true, values: EMOTES }),
      pSo('intensity', 'Độ mạnh 0–1', { min: 0, max: 1, default: 1 }),
      { name: 'say', type: 'text', desc: 'Nói kèm (tuỳ chọn)' },
    ],
    example: { cmd: 'actor.emote', args: { actor: 'gen', emote: 'vui', intensity: 1 } },
    async handler(a, ctx) {
      const id = s(a.actor);
      if (!ctx.world.coActor(id)) throw new Error(`Không có actor "${id}"`);
      const noiKem = a.say === undefined ? undefined : s(a.say);
      // B2 — emote cắt câu đang nói, và nếu có `say` thì nói bằng giọng thật.
      lopTieng()?.huy(id);
      const tieng = noiKem ? await chuanBiGiong(id, noiKem, undefined, s(a.emote)) : null;
      const hd = ctx.world.actorEmote(
        s(a.actor),
        s(a.emote),
        a.intensity as number | undefined,
        noiKem,
      );
      tieng?.phat();
      // Bị cắt giữa chừng KHÔNG được coi là xong: bắn `actor.emoteCancelled`
      // để agent đọc sự kiện không tưởng emote chạy trọn (review PR #10 1.3).
      void hd.done.then(() =>
        ctx.bus.emit(
          hd.cancelled?.() ? 'actor.emoteCancelled' : 'actor.emoteDone',
          { actor: s(a.actor), emote: s(a.emote) },
        ),
      );
      return tuHanhDong(hd, { actor: s(a.actor), emote: s(a.emote) });
    },
  },

  {
    cmd: 'actor.idleStyle',
    group: 'actor',
    desc: 'Đổi dáng đứng chờ để nhân vật không bao giờ đứng im',
    params: [
      P_ACTOR,
      pEnum('style', 'Kiểu đứng chờ', { required: true, values: IDLE_STYLES }),
    ],
    example: { cmd: 'actor.idleStyle', args: { actor: 'gen', style: 'hao-hung' } },
    handler(a, ctx) {
      const id = s(a.actor);
      if (!ctx.world.coActor(id)) throw new Error(`Không có actor "${id}"`);
      ctx.world.actorIdleStyle(id, s(a.style));
      return ngay({ actor: id, style: s(a.style) });
    },
  },

  {
    cmd: 'actor.drop',
    group: 'actor',
    events: ['actor.dropped'],
    desc: 'Thả đồ đang cầm xuống chân',
    params: [P_ACTOR],
    example: { cmd: 'actor.drop', args: { actor: 'gen' } },
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
