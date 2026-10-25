/**
 * screen.ts — nhóm lệnh màn hình hologram (spec mục 3.4b).
 *
 * `screen.stream` có 2 nguồn: `chunks` (mảng biết trước, tự chạy dần theo
 * nhịp đọc được) hoặc `source` (vd `"agent"` — agent tự đẩy từng mẩu bằng
 * `window.stage.feed(screen, chunk)`, nối dây ở `main.ts`). Cả hai đường đều
 * kết thúc bằng sự kiện `screen.streamDone`, và `source` tự kết thúc sau một
 * khoảng im lặng (không có chunk mới) để không treo mãi nếu agent quên báo xong.
 */
import type { CommandSpec, Vec3 } from '../types';
import { ngay, pEnum, tuHanhDong } from './tien-ich';

const s = (v: unknown) => String(v);
const ngu = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const P_SCREEN = pEnum('screen', 'Màn hình hologram', {
  required: true,
  goiY: 'screens',
  tuDo: true,
});

const LOAI_NOI_DUNG = ['text', 'code', 'log', 'chart', 'image'] as const;

/** Nguồn `source: "agent"` tự kết thúc sau khoảng lặng này (không có chunk mới). */
const IDLE_MS_AGENT = 1800;
/** Trần an toàn — không treo mãi nếu agent quên gọi feed lần cuối. */
const TRAN_MS_AGENT = 90_000;

export const LENH_SCREEN: CommandSpec[] = [
  {
    cmd: 'screen.spawn',
    group: 'screen',
    events: ['screen.spawned'],
    desc: 'Thêm một tấm hologram trong suốt phát sáng, lơ lửng',
    params: [
      { name: 'id', type: 'string', desc: 'Mã màn hình', required: true },
      {
        name: 'at',
        type: 'target',
        desc: 'Place hoặc toạ độ (bỏ trống thì dùng vị trí mặc định nếu id là main/left/right)',
        goiY: 'places',
        tuDo: true,
      },
      { name: 'size', type: 'number', desc: 'Chiều rộng mét', min: 0.3, max: 8, default: 2.2 },
      { name: 'tilt', type: 'number', desc: 'Nghiêng (độ)', min: -45, max: 45 },
    ],
    example: { cmd: 'screen.spawn', args: { id: 'main', at: 'ban-dieu-khien', size: 2.4 } },
    async handler(a, ctx) {
      const id = s(a.id);
      if (ctx.world.coScreen(id)) throw new Error(`Màn hình "${id}" đã có`);
      const snap = await ctx.world.screenSpawn({
        id,
        at: a.at as string | Vec3 | undefined,
        size: a.size as number | undefined,
        tilt: a.tilt as number | undefined,
      });
      ctx.bus.emit('screen.spawned', { screen: snap.id, pos: snap.pos });
      return ngay({ screen: snap });
    },
  },

  {
    cmd: 'screen.remove',
    group: 'screen',
    events: ['screen.removed'],
    desc: 'Bỏ màn hình hologram',
    params: [P_SCREEN],
    example: { cmd: 'screen.remove', args: { screen: 'main' } },
    handler(a, ctx) {
      const id = s(a.screen);
      if (!ctx.world.coScreen(id)) throw new Error(`Không có màn hình "${id}"`);
      ctx.world.screenRemove(id);
      ctx.bus.emit('screen.removed', { screen: id });
      return ngay({ screen: id, removed: true });
    },
  },

  {
    cmd: 'screen.show',
    group: 'screen',
    events: ['screen.shown'],
    desc: 'Hiện nội dung tĩnh trên màn hình',
    params: [
      P_SCREEN,
      pEnum('kind', 'Loại nội dung', { required: true, values: LOAI_NOI_DUNG }),
      { name: 'content', type: 'text', desc: 'Nội dung', required: true },
    ],
    example: { cmd: 'screen.show', args: { screen: 'main', kind: 'code', content: 'const a = 1;' } },
    handler(a, ctx) {
      const id = s(a.screen);
      if (!ctx.world.coScreen(id)) throw new Error(`Không có màn hình "${id}"`);
      ctx.world.screenShow(id, s(a.kind), s(a.content));
      ctx.bus.emit('screen.shown', { screen: id, kind: a.kind });
      return ngay({ screen: id });
    },
  },

  {
    cmd: 'screen.stream',
    group: 'screen',
    events: ['screen.streamDone'],
    desc:
      'Chữ/code chạy dần như đang được gõ: cho sẵn "chunks" (mảng) hoặc "source" ' +
      '(vd "agent" — đẩy từng mẩu qua window.stage.feed(screen, chunk))',
    params: [
      P_SCREEN,
      pEnum('kind', 'Loại nội dung', { required: true, values: LOAI_NOI_DUNG }),
      { name: 'chunks', type: 'json', desc: 'Mảng mẩu nội dung biết trước' },
      { name: 'source', type: 'string', desc: 'Nguồn đẩy dần, vd "agent"' },
    ],
    example: { cmd: 'screen.stream', args: { screen: 'main', kind: 'code', source: 'agent' } },
    handler(a, ctx) {
      const id = s(a.screen);
      if (!ctx.world.coScreen(id)) throw new Error(`Không có màn hình "${id}"`);
      const kind = s(a.kind);
      const chunks = Array.isArray(a.chunks) ? a.chunks.map(String) : [];
      const nguon = a.source === undefined ? undefined : s(a.source);

      ctx.world.screenStartStream(id, kind);

      let xongRoi = false;
      let giaiQuyet: () => void = () => undefined;
      const done = new Promise<void>((r) => {
        giaiQuyet = r;
      });
      // `xong(cancelled)` chạy đúng một lần, từ 3 nguồn có thể đến bất cứ lúc
      // nào: hết chunks/nguồn im lặng, `cancel()` do interrupt, hoặc màn hình
      // bị `screen.remove` giữa lúc đang stream (C3) — nguồn thứ 3 không đi
      // qua `cancel()` nên phải tự nghe sự kiện, và LUÔN kiểm `coScreen` trước
      // khi gọi `screenEndStream` để không ném lỗi vào màn hình đã mất.
      const xong = (cancelled = false) => {
        if (xongRoi) return;
        xongRoi = true;
        boTheoDoiXoa();
        if (ctx.world.coScreen(id)) ctx.world.screenEndStream(id);
        ctx.bus.emit('screen.streamDone', { screen: id, cancelled });
        giaiQuyet();
      };
      const boTheoDoiXoa = ctx.bus.on('screen.removed', (e) => {
        if ((e.data as { screen?: string }).screen === id) xong(true);
      });

      if (chunks.length > 0) {
        const tongMs = chunks.reduce(
          (t: number, c: string) => t + 90 + Math.min(c.length * 18, 900),
          0,
        );
        void (async () => {
          for (const c of chunks) {
            if (xongRoi) return;
            ctx.world.screenAppend(id, c);
            await ngu(90 + Math.min(c.length * 18, 900));
          }
          xong();
        })();
        return {
          result: { screen: id, chunks: chunks.length },
          durationMs: Math.max(200, Math.round(tongMs)),
          done,
          cancel: () => xong(true),
        };
      }

      // source: không biết trước nội dung — chờ `window.stage.feed(screen, chunk)`
      // (bắn 'screen.fed' lên ctx.bus, nối dây ở main.ts), tự xong sau khoảng lặng.
      let henRanh: ReturnType<typeof setTimeout>;
      const datLaiRanh = () => {
        clearTimeout(henRanh);
        henRanh = setTimeout(() => xong(), IDLE_MS_AGENT);
      };
      datLaiRanh();
      const henTran = setTimeout(() => xong(), TRAN_MS_AGENT);
      const boDangKy = ctx.bus.on('screen.fed', (e) => {
        if ((e.data as { screen?: string }).screen === id) datLaiRanh();
      });

      return {
        result: { screen: id, source: nguon ?? null },
        durationMs: IDLE_MS_AGENT,
        done,
        cancel: () => {
          clearTimeout(henRanh);
          clearTimeout(henTran);
          boDangKy();
          xong(true);
        },
      };
    },
  },

  {
    cmd: 'screen.clear',
    group: 'screen',
    events: ['screen.cleared'],
    desc: 'Xoá nội dung màn hình',
    params: [P_SCREEN],
    example: { cmd: 'screen.clear', args: { screen: 'main' } },
    handler(a, ctx) {
      const id = s(a.screen);
      if (!ctx.world.coScreen(id)) throw new Error(`Không có màn hình "${id}"`);
      ctx.world.screenClear(id);
      ctx.bus.emit('screen.cleared', { screen: id });
      return ngay({ screen: id });
    },
  },

  {
    cmd: 'screen.focus',
    group: 'screen',
    events: ['screen.focused'],
    desc: 'Bay màn hình tới trước mặt nhân vật/camera',
    params: [P_SCREEN],
    example: { cmd: 'screen.focus', args: { screen: 'main' } },
    handler(a, ctx) {
      const id = s(a.screen);
      if (!ctx.world.coScreen(id)) throw new Error(`Không có màn hình "${id}"`);
      const hd = ctx.world.screenFocus(id);
      void hd.done.then(() => ctx.bus.emit('screen.focused', { screen: id }));
      return tuHanhDong(hd, { screen: id });
    },
  },
];
