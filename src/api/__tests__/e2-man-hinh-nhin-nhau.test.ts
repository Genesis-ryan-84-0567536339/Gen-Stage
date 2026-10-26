/**
 * e2-man-hinh-nhin-nhau.test.ts — cửa chất lượng cho **E2** (Issue #48, hai
 * mục 3 và 7 của bản kiểm hoàn chỉnh):
 *
 *  · mục 3 — màn hình GIỮ nội dung sau khi stream xong (`showing`/`lines`
 *    đúng), và `actors[].holding` LUÔN khớp `props[].state.heldBy` (một nguồn
 *    sự thật) kể cả khi `module.build` tự đưa module vào tay.
 *  · mục 7 — `actor.say { to: <actorId> }` làm hai nhân vật **nhìn nhau**
 *    (mắt + thân + dáng nghe ngóng), nói xong người nghe **liếc máy quay**;
 *    và phản xạ KHÔNG chen câu đệm vào câu không gửi cho Gen.
 *
 * Chạy trên **sân khấu giả** như mọi test khác (không WebGL): cái được kiểm ở
 * đây là HỢP ĐỒNG LỆNH. Phần đồ hoạ (pixel trên màn hình, chiều cao mặt bàn)
 * kiểm bằng `scripts/kiem-e2.mjs` chạm bản thật.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { EventBus } from '../../events';
import { SanKhauGia, NHIP_MS } from './san-khau-gia';
import { batPhanXa, CAU_DEM, MAC_DINH } from '../../behavior/phan-xa';
import { datSoNao, xoaSoNao } from '../../behavior/so-nao';
import { timPlace } from '../../stage/noi-dung';
import type { ActorSnapshot, PropSnapshot, ScreenSnapshot } from '../types';

const nhipMicro = () => new Promise<void>((r) => setTimeout(r, 0));
const cho = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const choHanhDong = () => cho(NHIP_MS + 20);

const OWNER_MAC_DINH = timPlace('buc-trung-tam')!.pos;

function dungSan(ds: string[] = ['owner', 'gen']) {
  const world = new SanKhauGia(ds);
  const bus = new EventBus();
  const dispatcher = new Dispatcher({ registry: taoRegistry(), world, bus });
  return { world, bus, dispatcher };
}

function layActor(world: SanKhauGia, id: string): ActorSnapshot {
  return world.describe().actors.find((a) => a.id === id)!;
}

/* ================================================= mục 3 — màn hình + tay */

describe('E2 mục 3 — màn hình giữ nội dung, module vào tay', () => {
  it('stream bằng chunks: xong rồi nội dung VẪN còn, showing/lines đúng', async () => {
    const { world, dispatcher } = dungSan();
    await dispatcher.run('screen.spawn', { id: 'main', at: 'buc-trung-tam' });

    const r = await dispatcher.run('screen.stream', {
      screen: 'main',
      kind: 'code',
      chunks: ['const a = 1;\n', 'const b = 2;\n', 'console.log(a + b);\n'],
    });
    expect(r.ok).toBe(true);
    // chờ hết chuỗi chunk (90 ms + 18 ms/ký tự mỗi mẩu)
    await cho(1400);

    const mh = world.describe().screens.find((s: ScreenSnapshot) => s.id === 'main')!;
    expect(mh.streaming).toBe(false);
    expect(mh.showing).toBe('code'); // KHÔNG bị reset về null sau streamDone
    expect(mh.lines).toBeGreaterThan(0);
    expect(world.screenContent('main')).toContain('console.log(a + b);');
  });

  it('stream bằng source + feed: mỗi mẩu cộng thêm, xong vẫn giữ nội dung', async () => {
    const { world, bus, dispatcher } = dungSan();
    await dispatcher.run('screen.spawn', { id: 'main' });

    const dangChay = dispatcher.run('screen.stream', {
      screen: 'main',
      kind: 'log',
      source: 'agent',
    });
    // `window.stage.feed` nối dây ở main.ts = screenAppend + bắn 'screen.fed'
    world.screenAppend('main', 'khoi dong\n');
    bus.emit('screen.fed', { screen: 'main', chunk: 'khoi dong\n' });
    await cho(50);
    world.screenAppend('main', 'xong ok\n');
    bus.emit('screen.fed', { screen: 'main', chunk: 'xong ok\n' });

    const giua = world.describe().screens.find((s) => s.id === 'main')!;
    expect(giua.streaming).toBe(true);
    expect(giua.lines).toBe(3); // 2 dòng + dòng rỗng cuối

    const r = await dangChay;
    expect(r.ok).toBe(true);
    await cho(MAC_DINH.nhipMs);
    const sau = world.describe().screens.find((s) => s.id === 'main')!;
    expect(sau.showing).toBe('log');
    expect(sau.lines).toBe(3);
  });

  it('module.build → holding của Gen KHỚP heldBy của prop (một nguồn sự thật)', async () => {
    const { world, bus, dispatcher } = dungSan();
    const daBuilt: Array<Record<string, unknown>> = [];
    bus.on('module.built', (e) => daBuilt.push(e.data as Record<string, unknown>));

    await dispatcher.run('screen.spawn', { id: 'main' });
    const r = await dispatcher.run('module.build', {
      id: 'connector-baserow',
      shape: 'book',
      label: 'Baserow',
      from: 'main',
      durationMs: 400,
    });
    expect(r.ok).toBe(true);
    await choHanhDong();
    await nhipMicro();

    const gen = layActor(world, 'gen');
    const prop = world
      .describe()
      .props.find((p: PropSnapshot) => p.id === 'connector-baserow')!;
    expect(gen.holding).toBe('connector-baserow');
    expect(prop.state.heldBy).toBe('gen');
    // bất biến: prop mà Gen khai đang cầm phải là prop khai do Gen giữ
    const propCuaGen = world.describe().props.find((p) => p.state.heldBy === 'gen');
    expect(propCuaGen?.id).toBe(gen.holding);
    expect(daBuilt[0]?.heldBy).toBe('gen');
  });

  it('module.build không để Boss cầm hộ: ưu tiên actor controlledBy "agent"', async () => {
    const { world, dispatcher } = dungSan();
    await dispatcher.run('module.build', { id: 'mod-x', shape: 'crystal', label: 'X', durationMs: 300 });
    await choHanhDong();
    await nhipMicro();
    expect(layActor(world, 'owner').holding).toBeNull();
    expect(layActor(world, 'gen').holding).toBe('mod-x');
  });
});

/* ================================================== mục 7 — nhìn nhau */

describe('E2 mục 7 — hai nhân vật nhìn nhau', () => {
  it('actor.say { to: gen } → Javis quay về Gen, Gen quay + nhìn + nghe ngóng', async () => {
    const { world, dispatcher } = dungSan();
    world.lichSu.length = 0;
    const r = dispatcher.run('actor.say', {
      actor: 'owner',
      text: 'xong rồi nhé',
      to: 'gen',
    });
    await nhipMicro();

    // người nói: mắt + thân về người nghe
    expect(world.lichSu).toContain('faceTo:owner:gen');
    // người nghe: mắt + THÂN về người nói (bản cũ chỉ đổi mắt) + dáng nghe
    expect(world.lichSu).toContain('faceTo:gen:owner');
    expect(world.lichSu.some((x) => x.startsWith('ngheNgong:gen:true'))).toBe(true);
    expect(layActor(world, 'gen').lookingAt).toBe('owner');

    // góc lệch của cả hai phải ≤ 15° (tiêu chí dòng 7 bản kiểm hoàn chỉnh)
    const g = layActor(world, 'gen');
    const o = layActor(world, 'owner');
    expect(lechVe(g, o.pos)).toBeLessThanOrEqual(15);
    expect(lechVe(o, g.pos)).toBeLessThanOrEqual(15);

    await r;
    await choHanhDong();
    await nhipMicro();
    // nói xong: thôi dáng nghe ngóng + người nghe LIẾC MÁY QUAY
    expect(world.lichSu.some((x) => x.startsWith('ngheNgong:gen:false'))).toBe(true);
    expect(layActor(world, 'gen').lookingAt).toBe('camera');
  });

  it('câu hỏi gửi cho một actor → người nghe nghiêng đầu (ngheNgong cờ "hoi")', async () => {
    const { world, dispatcher } = dungSan();
    world.lichSu.length = 0;
    await dispatcher.run('actor.say', { actor: 'owner', text: 'xong chưa', to: 'gen' });
    expect(world.lichSu).toContain('ngheNgong:gen:true:hoi');
  });
});

/* ==================================== mục 7 — phản xạ không chen vào */

describe('E2 mục 7 — phản xạ không chen câu đệm vào câu của người khác', () => {
  beforeEach(() => xoaSoNao());

  async function dungPhanXa() {
    const { world, bus, dispatcher } = dungSan();
    const [ox, oy, oz] = OWNER_MAC_DINH;
    await world.actorMoveTo('gen', [ox + 4.8, oy, oz - 1]).done;
    world.lichSu.length = 0;
    let dongHo = 1_000_000;
    let choBridge = false;
    const may = batPhanXa({
      dispatcher,
      bus,
      bayGio: () => dongHo,
      chonCauDem: (ds) => ds[0]!,
      choSauBridge: () => choBridge,
      so: { nhipMs: 1_000_000 },
    });
    return {
      world,
      bus,
      may,
      datChoBridge: (v: boolean) => {
        choBridge = v;
      },
      tien(ms: number) {
        dongHo += ms;
        may.nhip();
      },
    };
  }

  it('câu gửi cho actor khác (to ≠ camera/gen) → KHÔNG có câu đệm nào', async () => {
    const t = await dungPhanXa();
    datSoNao(1);
    t.bus.emit('user.text', { actor: 'owner', text: 'ê Lan, qua đây', to: 'lan' });
    await nhipMicro();
    t.tien(MAC_DINH.choNaoMs + 200);
    await nhipMicro();
    expect(t.may.trangThai().dangCauDem).toBe(false);
    for (const cau of CAU_DEM) {
      expect(t.world.lichSu).not.toContain(`say:${cau}`);
    }
  });

  it('câu gửi cho Gen (to = camera) → VẪN có câu đệm như cũ', async () => {
    const t = await dungPhanXa();
    datSoNao(1);
    t.bus.emit('user.text', { actor: 'owner', text: 'Gen ơi', to: 'camera' });
    await nhipMicro();
    await choHanhDong(); // emote `chu-y` chạy xong thì Gen mới rảnh để đệm
    t.tien(MAC_DINH.choNaoMs + 200);
    await nhipMicro();
    expect(t.world.lichSu).toContain(`say:${CAU_DEM[0]}`);
  });

  it('câu gửi cho actor khác → cũng KHÔNG để não rule-based trả lời', async () => {
    const t = await dungPhanXa();
    // không có não (xoaSoNao) — bình thường Gen sẽ nói "Em chưa có não…"
    t.bus.emit('user.text', { actor: 'owner', text: 'Lan ơi, tên gì', to: 'lan' });
    await cho(MAC_DINH.choNaoNoiBoMs + 80);
    expect(t.world.lichSu.some((x) => x.startsWith('say:Em chưa có não'))).toBe(false);
  });

  it('hook choSauBridge = true → im câu "chưa có não" (cửa cho E1 chờ 3 s)', async () => {
    const t = await dungPhanXa();
    t.datChoBridge(true);
    t.bus.emit('user.text', { actor: 'owner', text: 'Gen, tên em là gì', to: 'camera' });
    await cho(MAC_DINH.choNaoNoiBoMs + 80);
    expect(t.world.lichSu.some((x) => x.startsWith('say:Em là Gen'))).toBe(false);
    // tắt hook → lại trả lời bình thường
    t.datChoBridge(false);
    t.bus.emit('user.text', { actor: 'owner', text: 'Gen, tên em là gì', to: 'camera' });
    await cho(MAC_DINH.choNaoNoiBoMs + 80);
    expect(t.world.lichSu.some((x) => x.startsWith('say:Em là Gen'))).toBe(true);
  });

  it('actor.sayStart { actor: owner, to: gen } → phản xạ quay Gen về Javis dù hiểu lệnh đã "handled"', async () => {
    const t = await dungPhanXa();
    datSoNao(1);
    // đúng cảnh thật: lớp hiểu lệnh khớp "Javis nói với Gen …" nên đánh dấu
    // handled → phản xạ bỏ qua `user.text`; cặp hội thoại phải lấy từ sayStart
    t.bus.emit('user.text', { actor: 'owner', text: 'Javis nói với Gen', to: 'camera', handled: true });
    await nhipMicro();
    t.world.lichSu.length = 0;
    t.bus.emit('actor.sayStart', { actor: 'owner', text: 'xong rồi nhé', to: 'gen' });
    await nhipMicro();
    expect(t.world.lichSu).toContain('faceTo:gen:owner');
    expect(t.may.trangThai().nguoiNghe).toBe('owner');
  });

  it('nói xong (sayDone to = gen) → người nghe của Gen về lại máy quay', async () => {
    const t = await dungPhanXa();
    datSoNao(1);
    t.bus.emit('actor.sayStart', { actor: 'owner', text: 'xong rồi nhé', to: 'gen' });
    await nhipMicro();
    expect(t.may.trangThai().nguoiNghe).toBe('owner');
    t.bus.emit('actor.sayDone', { actor: 'owner', text: 'xong rồi nhé', to: 'gen' });
    await nhipMicro();
    expect(t.may.trangThai().nguoiNghe).toBe('camera');
    expect(t.world.describe().actors.find((a) => a.id === 'gen')!.lookingAt).toBe('camera');
  });
});

/** Góc (độ) giữa hướng thân của `a` và hướng từ `a` tới điểm `p`. */
function lechVe(a: ActorSnapshot, p: readonly number[]): number {
  const muc = (Math.atan2(p[0]! - a.pos[0], p[2]! - a.pos[2]) * 180) / Math.PI;
  return Math.abs(((((a.facing - muc) % 360) + 540) % 360) - 180);
}
