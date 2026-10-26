/**
 * c0-phan-xa.test.ts — máy trạng thái **phản xạ xã hội** (C0, Issue #28).
 *
 * Chạy trên **sân khấu giả** (`san-khau-gia.ts`): không WebGL, không bridge,
 * không giọng — nên cái được kiểm ở đây đúng là *logic phản xạ*, không phải
 * đồ hoạ. Đồng hồ và nhịp quét đều tiêm được, nên test không `sleep` lần nào.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { EventBus } from '../../events';
import { SanKhauGia, NHIP_MS } from './san-khau-gia';
import { batPhanXa, CAU_DEM, MAC_DINH, naoToiThieu, NGUON_PHAN_XA } from '../../behavior/phan-xa';
import { laCauHoi } from '../commands/actor';
import { coNao, datSoNao, soNao, xoaSoNao } from '../../behavior/so-nao';
import { timPlace } from '../../stage/noi-dung';

/**
 * Owner mặc định đứng ở `buc-trung-tam` (D1, Issue #43: giữa thảm phòng
 * khách, KHÔNG còn ở gốc toạ độ [0,0,0] như bản lab cũ) — mọi toạ độ Gen
 * trong test này phải tính TƯƠNG ĐỐI theo điểm đó, không chôn số tuyệt đối.
 */
const OWNER_MAC_DINH = timPlace('buc-trung-tam')!.pos;

/** Chờ cho mọi `.then()` đang treo chạy xong (dispatcher trả lời bất đồng bộ). */
const nhipMicro = () => new Promise<void>((r) => setTimeout(r, 0));
/** Chờ một hành động của sân khấu giả chạy hết (`NHIP_MS`). */
const choHanhDong = () => new Promise<void>((r) => setTimeout(r, NHIP_MS + 10));

async function dung(opts: { ganNhau?: boolean } = {}) {
  const world = new SanKhauGia(['owner', 'gen']);
  const bus = new EventBus();
  const dispatcher = new Dispatcher({ registry: taoRegistry(), world, bus });
  // Owner đứng ở `buc-trung-tam` (mặc định của sân khấu giả); Gen đặt CÁCH
  // owner 1,2 m (ganNhau) hoặc ~4,9 m (xa) theo đúng ngưỡng 3 m mà phan-xa.ts
  // dùng để quyết định có cú liếc hay không. Phải CHỜ hành động giả chạy xong
  // thì toạ độ mới dời thật.
  const [ox, oy, oz] = OWNER_MAC_DINH;
  await world.actorMoveTo('gen', opts.ganNhau ? [ox + 1.2, oy, oz] : [ox + 4.8, oy, oz - 1]).done;
  world.lichSu.length = 0;
  let dongHo = 1_000_000;
  const may = batPhanXa({
    dispatcher,
    bus,
    bayGio: () => dongHo,
    chonCauDem: (ds) => ds[0]!,
    so: { nhipMs: 1_000_000 }, // không để `setInterval` tự chạy: test gọi `nhip()` tay
  });
  return {
    world,
    bus,
    dispatcher,
    may,
    /** Đẩy đồng hồ giả tiến `ms` rồi quét một nhịp. */
    tien(ms: number) {
      dongHo += ms;
      may.nhip();
    },
    gio: () => dongHo,
  };
}

/** Lệnh sân khấu giả đã nhận, dạng chuỗi (`lichSu`). */
const coTrongLichSu = (w: SanKhauGia, mau: string) => w.lichSu.some((x) => x.startsWith(mau));

describe('phản xạ: Owner nói → Gen quay lại ngay, không chờ não', () => {
  beforeEach(() => xoaSoNao());

  it('Sếp gõ → Gen quay về MÁY QUAY (Sếp xem qua màn hình), Javis quay về Gen', async () => {
    const t = await dung({ ganNhau: true }); // < 3 m: không có cú liếc
    datSoNao(1); // có não → không chen não rule-based vào
    t.world.lichSu.length = 0;

    t.bus.emit('user.text', { actor: 'owner', text: 'Gen ơi', to: 'camera' });
    await nhipMicro();

    const st = t.world.describe();
    const g = st.actors.find((a) => a.id === 'gen')!;
    const o = st.actors.find((a) => a.id === 'owner')!;
    // Gen nghe Sếp → mắt + thân về máy quay
    expect(g.lookingAt).toBe('camera');
    expect(g.facingTarget).toBe('camera');
    // Javis (avatar của Sếp) quay về Gen — người nói hướng về người nghe
    expect(o.facingTarget).toBe('gen');
    expect(coTrongLichSu(t.world, 'faceTo:gen:camera')).toBe(true);
    expect(coTrongLichSu(t.world, 'faceTo:owner:gen')).toBe(true);
    // dáng lắng nghe bật lên
    expect(t.world.lichSu).toContain('ngheNgong:gen:true');
    t.may.dung();
  });

  it('Javis đứng XA (> 3 m) → Gen liếc anh ta rồi mới quay về máy quay', async () => {
    const t = await dung(); // ~4,9 m
    datSoNao(1);
    t.bus.emit('user.text', { actor: 'owner', text: 'Gen ơi', to: 'camera' });
    await nhipMicro();
    expect(t.world.describe().actors.find((a) => a.id === 'gen')!.lookingAt).toBe('owner');

    t.tien(MAC_DINH.liecMs + 50);
    await nhipMicro();
    expect(t.world.describe().actors.find((a) => a.id === 'gen')!.lookingAt).toBe('camera');
    t.may.dung();
  });

  it('actor.say owner to gen → hai nhân vật nhìn nhau', async () => {
    const t = await dung({ ganNhau: true });
    datSoNao(1);
    await t.dispatcher.run('actor.say', { actor: 'owner', text: 'Gen ơi', to: 'gen' }, 'ui');
    await nhipMicro();

    const st = t.world.describe();
    const g = st.actors.find((a) => a.id === 'gen')!;
    const o = st.actors.find((a) => a.id === 'owner')!;
    expect(o.lookingAt).toBe('gen');
    expect(o.facingTarget).toBe('gen');
    expect(g.lookingAt).toBe('owner');
    expect(g.facingTarget).toBe('owner');
    expect(t.may.trangThai().nguoiNghe).toBe('owner');
    t.may.dung();
  });

  it('đang nói mà máy quay dời chỗ → Gen quay theo (không chỉ lúc bắt đầu)', async () => {
    const t = await dung({ ganNhau: true });
    datSoNao(1);
    void t.dispatcher.run('actor.say', { actor: 'gen', text: 'Dạ em đây ạ' }, 'bridge');
    await nhipMicro();
    expect(t.world.describe().actors.find((a) => a.id === 'gen')!.facingTarget).toBe('camera');

    // Boss đổi góc máy giữa câu: máy quay nhảy sang bên kia phòng
    t.world.mayViTri = [-7, 1.6, -7];
    t.world.lichSu.length = 0;
    t.tien(120);
    await nhipMicro();
    expect(coTrongLichSu(t.world, 'faceTo:gen:camera')).toBe(true);

    const g = t.world.describe().actors.find((a) => a.id === 'gen')!;
    const goc = (Math.atan2(-7 - g.pos[0], -7 - g.pos[2]) * 180) / Math.PI;
    const lech = Math.abs(((((g.facing - goc) % 360) + 540) % 360) - 180);
    expect(lech).toBeLessThanOrEqual(15);
    t.may.dung();
  });

  /**
   * **I1 (#74) đổi chỗ cú "chú ý".**
   *
   * C0 gửi `actor.emote chu-y` ngay ở `user.text`. Emote đó dài 800 ms và
   * CHIẾM THÂN, nên nó ăn trọn ngân sách 400 ms mà I1 hứa cho câu đệm — đo
   * thật thì câu đệm bị bỏ hẳn vì tới hạn Nhi còn đang diễn chính cú chú ý.
   * Giờ: tầng 1 ngẩng mặt bằng `actor.express` (không chiếm thân), còn cú
   * `chu-y` trọn gói chuyển về **tầng 0** (`user.listening`) — chỗ còn vài
   * giây trước khi có chữ. Lời hứa "phản ứng ngay khi Sếp gọi" không đổi.
   */
  it('I1: có chữ → ngẩng mặt bằng actor.express (không chiếm thân, không chắn câu đệm)', async () => {
    const t = await dung();
    datSoNao(1);
    t.world.lichSu.length = 0;
    t.bus.emit('user.text', { actor: 'owner', text: 'Gen ơi' });
    await nhipMicro();
    expect(coTrongLichSu(t.world, 'express:surprised')).toBe(true);
    expect(coTrongLichSu(t.world, 'emote.chu-y')).toBe(false);
    t.may.dung();
  });

  it('I1: cú emote chu-y trọn gói giờ nằm ở tầng 0 (Sếp vừa bấm mic)', async () => {
    const t = await dung();
    datSoNao(1);
    t.world.lichSu.length = 0;
    t.bus.emit('user.listening', { on: true });
    await nhipMicro();
    expect(coTrongLichSu(t.world, 'emote.chu-y')).toBe(true);
    t.may.dung();
  });

  it('mọi lệnh phản xạ đi qua dispatcher với nguồn "phan-xa"', async () => {
    const t = await dung();
    datSoNao(1);
    const nguon: string[] = [];
    // nhật ký thật nằm ở `NhatKy`; ở đây chỉ cần chắc dispatcher được gọi —
    // bọc `run` để đọc tham số nguồn.
    const goc = t.dispatcher.run.bind(t.dispatcher);
    t.dispatcher.run = ((cmd: string, args?: Record<string, unknown>, ng?: string) => {
      nguon.push(ng ?? 'ui');
      return goc(cmd, args, ng);
    }) as typeof t.dispatcher.run;

    t.bus.emit('user.text', { actor: 'owner', text: 'Gen ơi' });
    await nhipMicro();
    expect(nguon.length).toBeGreaterThan(0);
    expect(nguon.every((n) => n === NGUON_PHAN_XA)).toBe(true);
    t.may.dung();
  });

  it('KHÔNG quay/emote khi Gen đang bận việc của não (ưu tiên thấp)', async () => {
    const t = await dung();
    datSoNao(1);
    void t.dispatcher.run('actor.play', { actor: 'gen', clip: 'type' }, 'bridge');
    await nhipMicro();
    t.world.lichSu.length = 0;

    t.bus.emit('user.text', { actor: 'owner', text: 'Gen ơi' });
    await nhipMicro();

    // vẫn nhìn + quay mặt (đều KHÔNG chiếm thân), nhưng không emote
    expect(coTrongLichSu(t.world, 'lookAt:gen')).toBe(true);
    expect(coTrongLichSu(t.world, 'emote.chu-y')).toBe(false);
    t.may.dung();
  });
});

describe('phản xạ: câu đệm khi não im quá mốc choNaoMs (I1 #74: 200 ms)', () => {
  beforeEach(() => xoaSoNao());

  it('não im 1,5 s → Gen nói câu đệm bằng chính actor.say', async () => {
    const t = await dung();
    datSoNao(1);
    t.bus.emit('user.text', { actor: 'owner', text: 'Gen ơi' });
    await nhipMicro();
    await choHanhDong();
    await choHanhDong();
    t.world.lichSu.length = 0;

    t.tien(MAC_DINH.choNaoMs);
    await nhipMicro();

    expect(t.world.lichSu).toContain(`say:${CAU_DEM[0]}`);
    expect(t.may.trangThai().cauDem).toBe(CAU_DEM[0]);
    t.may.dung();
  });

  it('chưa tới hạn thì KHÔNG chêm câu đệm', async () => {
    const t = await dung();
    datSoNao(1);
    t.bus.emit('user.text', { actor: 'owner', text: 'Gen ơi' });
    await nhipMicro();
    await choHanhDong();
    await choHanhDong();
    t.world.lichSu.length = 0;

    // nửa mốc: chưa tới hạn (số tương đối theo `choNaoMs`, I1 hạ nó 1500 → 200)
    t.tien(Math.floor(MAC_DINH.choNaoMs / 2));
    await nhipMicro();
    expect(t.world.lichSu.some((x) => x.startsWith('say:'))).toBe(false);
    t.may.dung();
  });

  it('não nói TRƯỚC hạn → bỏ câu đệm luôn', async () => {
    const t = await dung();
    datSoNao(1);
    t.bus.emit('user.text', { actor: 'owner', text: 'Gen ơi' });
    await nhipMicro();
    await choHanhDong();
    await choHanhDong();

    // não trả lời ngay (nguồn `bridge`, không phải phản xạ)
    void t.dispatcher.run('actor.say', { actor: 'gen', text: 'Dạ em đây ạ' }, 'bridge');
    await nhipMicro();
    t.world.lichSu.length = 0;

    t.tien(MAC_DINH.choNaoMs);
    await nhipMicro();
    expect(t.world.lichSu.some((x) => x.startsWith('say:'))).toBe(false);
    t.may.dung();
  });

  it('não nói TRONG lúc câu đệm đang chạy → câu đệm bị cắt, câu của não vẫn chạy', async () => {
    const t = await dung();
    datSoNao(1);
    t.bus.emit('user.text', { actor: 'owner', text: 'Gen ơi' });
    await nhipMicro();
    await choHanhDong();
    await choHanhDong();

    t.tien(MAC_DINH.choNaoMs);
    await nhipMicro();
    expect(t.may.trangThai().cauDem).toBe(CAU_DEM[0]);

    // não gửi câu thật trong lúc câu đệm còn đang nói → xếp hàng → bị phản xạ cắt
    const cuaNao = t.dispatcher.run('actor.say', { actor: 'gen', text: 'Dạ, em nghe Sếp' }, 'bridge');
    await nhipMicro();

    expect(coTrongLichSu(t.world, 'interrupt:gen')).toBe(true);
    expect(t.may.trangThai().cauDem).toBe(null);

    // QUAN TRỌNG: cắt câu đệm KHÔNG được giết câu của não (lỗi của `actor.stop`)
    const kq = await cuaNao;
    expect(kq.ok).toBe(true);
    expect(t.world.lichSu).toContain('say:Dạ, em nghe Sếp');
    t.may.dung();
  });

  it('phản xạ không tự cắt câu đệm của chính mình', async () => {
    const t = await dung();
    // không có não → sau câu đệm còn một câu rule-based xếp hàng SAU nó
    t.bus.emit('user.text', { actor: 'owner', text: 'Chào Gen' });
    await nhipMicro();
    await choHanhDong();
    await choHanhDong();
    t.tien(MAC_DINH.choNaoMs);
    await nhipMicro();
    expect(t.may.trangThai().cauDem).toBe(CAU_DEM[0]);
    t.world.lichSu.length = 0;

    // hẹn giờ não rule-based dùng đồng hồ THẬT → chờ nó bắn
    await new Promise((r) => setTimeout(r, MAC_DINH.choNaoNoiBoMs + 60));
    expect(coTrongLichSu(t.world, 'interrupt:gen')).toBe(false);
    t.may.dung();
  });
});

describe('phản xạ: Owner lại gần / đi xa', () => {
  beforeEach(() => xoaSoNao());

  it('vào 2,5 m → Gen nhìn theo; đứng > 4 s → chào nhẹ đúng một lần', async () => {
    const t = await dung();
    datSoNao(1);
    t.tien(0);
    expect(t.world.describe().actors.find((a) => a.id === 'gen')!.lookingAt).not.toBe('owner');

    // Sếp đi tới sát Gen — `dung()` không `ganNhau` đặt Gen ở owner + [4.8,0,-1]
    void t.world.actorMoveTo('owner', [
      OWNER_MAC_DINH[0] + 4.8,
      0,
      OWNER_MAC_DINH[2] - 1,
    ]);
    await choHanhDong();
    t.world.lichSu.length = 0;

    t.tien(100);
    await nhipMicro();
    expect(t.world.describe().actors.find((a) => a.id === 'gen')!.lookingAt).toBe('owner');
    expect(coTrongLichSu(t.world, 'emote.chao')).toBe(false);

    t.tien(MAC_DINH.choChaoMs);
    await nhipMicro();
    // emote xếp hàng sau turnTo → chờ cú quay xong mới thấy nó trong lịch sử
    await choHanhDong();
    await choHanhDong();
    expect(coTrongLichSu(t.world, 'emote.chao')).toBe(true);

    // chỉ chào MỘT lần, đứng mãi cũng không chào lại
    await choHanhDong();
    t.world.lichSu.length = 0;
    t.tien(MAC_DINH.choChaoMs * 2);
    await nhipMicro();
    expect(coTrongLichSu(t.world, 'emote.chao')).toBe(false);
    t.may.dung();
  });

  it('Owner đi xa > 4 m và hết hạn giữ nhìn → Gen về việc đang làm', async () => {
    const t = await dung({ ganNhau: true });
    datSoNao(1);
    t.tien(100);
    await nhipMicro();
    expect(t.world.describe().actors.find((a) => a.id === 'gen')!.lookingAt).toBe('owner');

    // ganNhau:true đặt Gen ở owner + [1,2, 0, 0] — dời Owner đủ xa (> 4 m)
    // TƯƠNG ĐỐI theo điểm đó, không chôn toạ độ tuyệt đối.
    void t.world.actorMoveTo('owner', [
      OWNER_MAC_DINH[0] - 1.5,
      0,
      OWNER_MAC_DINH[2] + 4.0,
    ]);
    await choHanhDong();
    t.tien(MAC_DINH.giuNhinMs + 300);
    await nhipMicro();
    expect(t.world.describe().actors.find((a) => a.id === 'gen')!.lookingAt).not.toBe('owner');
    t.may.dung();
  });
});

describe('phản xạ: không có não thì vẫn trả lời (não rule-based tối thiểu)', () => {
  beforeEach(() => xoaSoNao());

  it('ba nhánh đúng như spec 3.2d', () => {
    expect(naoToiThieu('Chào Gen')).toMatch(/chào Sếp/i);
    expect(naoToiThieu('em tên gì')).toMatch(/Gen/);
    expect(naoToiThieu('dựng cho anh cái connector Baserow')).toBe(
      'Em chưa có não, Sếp bật agy nhé.',
    );
  });

  it('brainConnected = false → Gen tự trả lời, không im lặng', async () => {
    const t = await dung();
    expect(coNao()).toBe(false);
    t.bus.emit('user.text', { actor: 'owner', text: 'Gen ơi, dựng giúp anh cái này' });
    await nhipMicro();
    t.world.lichSu.length = 0;

    await new Promise((r) => setTimeout(r, MAC_DINH.choNaoNoiBoMs + 80));
    expect(t.world.lichSu).toContain('say:Em chưa có não, Sếp bật agy nhé.');
    t.may.dung();
  });

  it('brainConnected = true → phản xạ KHÔNG tự trả lời thay não', async () => {
    const t = await dung();
    datSoNao(1);
    t.bus.emit('user.text', { actor: 'owner', text: 'Gen ơi, dựng giúp anh cái này' });
    await nhipMicro();
    t.world.lichSu.length = 0;

    await new Promise((r) => setTimeout(r, MAC_DINH.choNaoNoiBoMs + 80));
    expect(t.world.lichSu.some((x) => x.startsWith('say:Em chưa có não'))).toBe(false);
    t.may.dung();
  });
});

describe('ngôn ngữ cơ thể của người nghe', () => {
  it('nhận ra câu hỏi tiếng Việt kể cả khi không có dấu "?"', () => {
    expect(laCauHoi('Sếp cần gì ạ?')).toBe(true);
    expect(laCauHoi('xong chưa')).toBe(true);
    expect(laCauHoi('được không')).toBe(true);
    expect(laCauHoi('Em làm xong rồi ạ.')).toBe(false);
  });

  it('Sếp nói xong → Gen thôi dáng lắng nghe', async () => {
    const t = await dung({ ganNhau: true });
    datSoNao(1);
    await t.dispatcher.run('actor.say', { actor: 'owner', text: 'Gen ơi, xong chưa' }, 'ui');
    expect(t.world.lichSu).toContain('ngheNgong:gen:true:hoi');
    await choHanhDong();
    await nhipMicro();
    expect(t.world.lichSu).toContain('ngheNgong:gen:false');
    t.may.dung();
  });
});

describe('stage.describe → brainConnected', () => {
  beforeEach(() => xoaSoNao());

  it('sổ não: 0 client = chưa nối, >0 = có não', () => {
    expect(coNao()).toBe(false);
    expect(soNao()).toBe(0);
    datSoNao(2);
    expect(coNao()).toBe(true);
    expect(soNao()).toBe(2);
    datSoNao(0);
    expect(coNao()).toBe(false);
  });

  it('stage.describe trả về trường brainConnected', async () => {
    const world = new SanKhauGia(['owner', 'gen']);
    const bus = new EventBus();
    const d = new Dispatcher({ registry: taoRegistry(), world, bus });

    const doc = async () => {
      const kq = await d.run('stage.describe');
      expect(kq.ok).toBe(true);
      return (kq as { result: { brainConnected: boolean } }).result;
    };

    expect((await doc()).brainConnected).toBe(false);
    world.coNao = true;
    expect((await doc()).brainConnected).toBe(true);
  });
});
