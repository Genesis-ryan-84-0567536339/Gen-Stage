/**
 * i1-phan-ung-tuc-thi.test.ts — **máy trạng thái ba tầng** (I1, Issue #74).
 *
 * Boss 29/10: *"các nhân vật phải đưa ra phản ứng và hành vi tức thì ngay sau
 * khi nhận lệnh để tăng trải nghiệm chân thực trong quá trình nó suy nghĩ"*.
 *
 * Bộ này dựng **não giả có độ trễ đặt được** (2 s / 8 s / 25 s) trên sân khấu
 * giả, đồng hồ tiêm vào, nhịp quét gọi tay — nên mọi con số dưới đây là số
 * của *logic*, không phụ thuộc máy chạy test. Bằng chứng trên Firefox thật
 * (trễ bus thực, giọng thực) nằm ở `scripts/kiem-i1.mjs`.
 *
 * Năm cảnh phải đúng:
 *  1. Tầng 0 — Boss bấm mic (`user.listening`) → Nhi nhìn máy quay **ngay
 *     trong handler**, chưa cần một nhịp quét nào.
 *  2. Tầng 1 — có chữ → gật (`actor.listen`) tức thì + câu đệm ở mốc 200 ms.
 *  3. Tầng 2 — não trễ 8 s: ≥1 đổi tư thế, **đúng 1** câu nối, không chồng giọng.
 *  4. Não trả lời ở 2 s: không câu nối, việc chêm bị cắt, câu của não vẫn chạy.
 *  5. Đang bận (`moveTo` của não): vẫn có `lookAt`, **hàng đợi không mất**,
 *     không quay thân, không emote, không nói.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { EventBus } from '../../events';
import { SanKhauGia, NHIP_MS } from './san-khau-gia';
import {
  batPhanXa,
  CAU_DEM,
  CAU_NOI,
  CAU_NOI_LAU,
  MAC_DINH,
  NGUON_PHAN_XA,
} from '../../behavior/phan-xa';
import { datSoNao, xoaSoNao } from '../../behavior/so-nao';
import { timPlace } from '../../stage/noi-dung';

const OWNER_MAC_DINH = timPlace('buc-trung-tam')!.pos;

/** Chờ mọi `.then()` đang treo chạy xong (dispatcher trả lời bất đồng bộ). */
const nhipMicro = () => new Promise<void>((r) => setTimeout(r, 0));
/** Chờ một hành động của sân khấu giả chạy hết. */
const choHanhDong = () => new Promise<void>((r) => setTimeout(r, NHIP_MS + 10));

/**
 * NÃO GIẢ — nghe `user.text` rồi trả lời sau `treMs` **theo đồng hồ giả**.
 *
 * Cố ý không dùng `setTimeout`: phải nằm trên cùng cái đồng hồ mà test đẩy
 * tay, không thì "trễ 8 s" thành 8 giây chờ thật trong CI. Nó gửi lệnh bằng
 * nguồn `bridge` đúng như bridge WebSocket làm, nên đường đi của câu trả lời
 * (xếp hàng → bị phản xạ cắt → chạy) giống hệt bản thật.
 */
function naoGia(opts: {
  bus: EventBus;
  dispatcher: Dispatcher;
  treMs: number;
  gio: () => number;
  cau?: string;
}) {
  const cau = opts.cau ?? 'Dạ, em làm ngay ạ';
  let henLuc: number | null = null;
  let daTraLoi = 0;
  /** Promise của câu não vừa gửi (test `await` để biết nó chạy được hay bị giết). */
  let cuaNao: Promise<unknown> | null = null;
  opts.bus.on('user.text', (e) => {
    if (e.data.handled === true) return;
    henLuc = opts.gio() + opts.treMs;
  });
  return {
    /** Gọi mỗi nhịp: tới hạn thì não mở miệng. */
    nhip() {
      if (henLuc === null || opts.gio() < henLuc) return;
      henLuc = null;
      daTraLoi++;
      cuaNao = opts.dispatcher.run('actor.say', { actor: 'gen', text: cau }, 'bridge');
    },
    cau,
    soLanTraLoi: () => daTraLoi,
    cuaNao: () => cuaNao,
  };
}

async function dung(opts: { treNaoMs?: number } = {}) {
  const world = new SanKhauGia(['owner', 'gen']);
  const bus = new EventBus();
  const dispatcher = new Dispatcher({ registry: taoRegistry(), world, bus });
  const [ox, oy, oz] = OWNER_MAC_DINH;
  // Nhi đứng cách Nam 1,2 m: dưới ngưỡng `banKinhLiec` 3 m nên KHÔNG có cú
  // liếc, mắt về máy quay ngay — đúng cảnh Boss nói qua màn hình.
  await world.actorMoveTo('gen', [ox + 1.2, oy, oz]).done;
  world.lichSu.length = 0;
  let dongHo = 2_000_000;
  const gio = () => dongHo;
  const nao =
    opts.treNaoMs === undefined
      ? null
      : naoGia({ bus, dispatcher, treMs: opts.treNaoMs, gio });
  const may = batPhanXa({
    dispatcher,
    bus,
    bayGio: gio,
    chonCauDem: (ds) => ds[0]!,
    so: { nhipMs: 1_000_000 }, // test gọi `nhip()` tay
  });
  return {
    world,
    bus,
    dispatcher,
    may,
    nao,
    gio,
    /** Đẩy đồng hồ `ms` rồi quét **từng nhịp 100 ms** như bản thật. */
    async tien(ms: number) {
      const buoc = MAC_DINH.nhipMs;
      for (let con = ms; con > 0; con -= buoc) {
        dongHo += Math.min(buoc, con);
        nao?.nhip();
        may.nhip();
        await nhipMicro();
      }
    },
  };
}

const co = (w: SanKhauGia, mau: string) => w.lichSu.some((x) => x.startsWith(mau));
const dem = (w: SanKhauGia, mau: string) => w.lichSu.filter((x) => x.startsWith(mau)).length;
/**
 * Mọi câu Nhi đã nói, theo thứ tự.
 *
 * Sân khấu giả ghi HAI dòng cho một câu: `say:<chữ>` (nội dung) rồi `say:<id
 * actor>` (hành động chiếm thân). Lọc bỏ dòng thứ hai, không thì mỗi câu đếm
 * thành hai.
 */
const cacCau = (w: SanKhauGia) =>
  w.lichSu
    .filter((x) => x.startsWith('say:') && x !== 'say:gen' && x !== 'say:owner')
    .map((x) => x.slice(4));

/* ===================================================== TẦNG 0 — chưa có chữ */

describe('I1 tầng 0 — Boss bắt đầu nói, chưa có chữ nào', () => {
  beforeEach(() => xoaSoNao());

  it('user.listening {on:true} → Nhi nhìn máy quay NGAY trong handler (không chờ nhịp quét)', async () => {
    const t = await dung();
    datSoNao(1);
    // Nhi đang dán mắt vào bàn điều khiển (dáng mặc định lúc mở trang) — có
    // thế cú `lookAt camera` mới là một lệnh THẬT, không bị `nhinVe` lọc vì
    // "đang nhìn đúng chỗ rồi".
    t.world.actorLookAt('gen', 'ban-dieu-khien');
    t.world.lichSu.length = 0;

    t.bus.emit('user.listening', { on: true, dangNhanDang: false });
    // CHƯA gọi `nhip()` lần nào — lời hứa ≤150 ms không được phụ thuộc nhịp quét
    expect(co(t.world, 'lookAt:gen')).toBe(true);
    expect(t.world.lichSu).toContain('ngheNgong:gen:true');
    await nhipMicro();
    expect(t.world.describe().actors.find((a) => a.id === 'gen')!.lookingAt).toBe('camera');
    expect(t.may.trangThai().ngheMic).toBe(true);
    t.may.dung();
  });

  it('bấm mic khi đang rảnh → thêm emote chu-y (ngẩng đầu chú ý)', async () => {
    const t = await dung();
    datSoNao(1);
    t.world.lichSu.length = 0;
    t.bus.emit('user.listening', { on: true });
    await nhipMicro();
    expect(co(t.world, 'emote.chu-y')).toBe(true);
    t.may.dung();
  });

  it('STT đang chạy → dáng "đang nhẩm" (suy-nghi nhẹ), vẫn hướng về Boss', async () => {
    const t = await dung();
    datSoNao(1);
    t.bus.emit('user.listening', { on: true });
    await nhipMicro();
    await choHanhDong(); // để emote chu-y chạy xong, Nhi rảnh lại
    t.world.lichSu.length = 0;

    t.bus.emit('user.listening', { on: false, dangNhanDang: true });
    await nhipMicro();
    expect(co(t.world, 'emote.suy-nghi')).toBe(true);
    expect(t.may.trangThai().nhanDang).toBe(true);
    expect(t.may.trangThai().ngheMic).toBe(false);
    t.may.dung();
  });

  it('lượt nói tắt giữa đường (không ra chữ) → THÔI dáng nghe, không gật một mình', async () => {
    const t = await dung();
    datSoNao(1);
    t.bus.emit('user.listening', { on: true });
    await nhipMicro();
    t.world.lichSu.length = 0;

    t.bus.emit('user.listening', { on: false, dangNhanDang: false });
    await nhipMicro();
    expect(t.world.lichSu).toContain('ngheNgong:gen:false');
    expect(t.may.trangThai().nhanDang).toBe(false);
    t.may.dung();
  });

  it('mọi lệnh của tầng 0 đi qua dispatcher với nguồn "phan-xa"', async () => {
    const t = await dung();
    datSoNao(1);
    const nguon: string[] = [];
    const goc = t.dispatcher.run.bind(t.dispatcher);
    t.dispatcher.run = ((cmd: string, args?: Record<string, unknown>, ng?: string) => {
      nguon.push(ng ?? 'ui');
      return goc(cmd, args, ng);
    }) as typeof t.dispatcher.run;

    t.bus.emit('user.listening', { on: true });
    await nhipMicro();
    expect(nguon.length).toBeGreaterThan(0);
    expect(nguon.every((n) => n === NGUON_PHAN_XA)).toBe(true);
    t.may.dung();
  });
});

/* ======================================================= TẦNG 1 — đã có chữ */

describe('I1 tầng 1 — có chữ: gật ngay, câu đệm trong 400 ms', () => {
  beforeEach(() => xoaSoNao());

  it('gật (actor.listen) chạy NGAY, không xếp hàng sau câu đệm', async () => {
    const t = await dung();
    datSoNao(1);
    t.world.lichSu.length = 0;

    t.bus.emit('user.text', { actor: 'owner', text: 'Nhi ơi, xong chưa' });
    await nhipMicro();
    // câu hỏi → nghiêng đầu luôn
    expect(t.world.lichSu).toContain('ngheNgong:gen:true:hoi');
    // và chưa có câu nào được nói ra: gật không phải là nói
    expect(cacCau(t.world)).toEqual([]);
    t.may.dung();
  });

  it('mốc câu đệm là 200 ms (I1 hạ từ 1,5 s) và nổ trong vòng 400 ms', async () => {
    expect(MAC_DINH.choNaoMs).toBeLessThanOrEqual(200);
    const t = await dung();
    datSoNao(1);
    t.bus.emit('user.text', { actor: 'owner', text: 'Nhi ơi' });
    await nhipMicro();
    t.world.lichSu.length = 0;

    // một nhịp (100 ms) thì CHƯA tới hạn
    await t.tien(MAC_DINH.nhipMs);
    expect(cacCau(t.world)).toEqual([]);

    // tới 300 ms là đã nói — ngân sách 400 ms còn 100 ms cho việc tải giọng
    await t.tien(MAC_DINH.nhipMs * 2);
    expect(cacCau(t.world)).toEqual([CAU_DEM[0]]);
    t.may.dung();
  });

  it('ĐANG BẬN việc của não: vẫn lookAt + gật, KHÔNG quay thân/emote/nói, hàng đợi NGUYÊN', async () => {
    const t = await dung();
    datSoNao(1);
    // não cho Nhi đi tới bàn, rồi xếp thêm một việc nữa vào hàng đợi
    void t.dispatcher.run('actor.moveTo', { actor: 'gen', to: 'ban-dieu-khien' }, 'bridge');
    await nhipMicro();
    const xepHang = t.dispatcher.run('actor.play', { actor: 'gen', clip: 'type' }, 'bridge');
    await nhipMicro();
    expect(t.dispatcher.soCho('gen')).toBe(1);
    t.world.actorLookAt('gen', 'ban-dieu-khien');
    t.world.lichSu.length = 0;

    t.bus.emit('user.text', { actor: 'owner', text: 'Nhi ơi' });
    await nhipMicro();

    expect(co(t.world, 'lookAt:gen')).toBe(true);
    expect(t.world.lichSu).toContain('ngheNgong:gen:true');
    expect(co(t.world, 'faceTo:gen')).toBe(false);
    expect(co(t.world, 'emote.')).toBe(false);
    expect(co(t.world, 'express:')).toBe(false);
    // hàng đợi của não không mất một việc nào
    expect(t.dispatcher.soCho('gen')).toBe(1);
    expect(co(t.world, 'interrupt:gen')).toBe(false);

    /*
     * Qua mốc câu đệm (200 ms) mà vẫn bận → tuyệt đối không nói chen.
     * Chỉ đẩy 500 ms: hành động của sân khấu giả dài 20 ms THẬT, đẩy 6 s
     * (65 nhịp × ~1 ms thật) là `moveTo` xong từ lâu và Nhi rảnh lại — khi
     * đó câu nối ra là ĐÚNG, không phải lỗi.
     */
    await t.tien(500);
    expect(cacCau(t.world)).toEqual([]);
    expect(co(t.world, 'interrupt:gen')).toBe(false);
    expect(t.dispatcher.soCho('gen')).toBe(1);

    // và việc xếp hàng của não cuối cùng VẪN chạy
    await choHanhDong();
    await choHanhDong();
    expect((await xepHang).ok).toBe(true);
    t.may.dung();
  });
});

/* ====================================================== TẦNG 2 — chờ não */

describe('I1 tầng 2 — vòng "đang nghĩ" trong lúc chờ não', () => {
  beforeEach(() => xoaSoNao());

  it('não giả trễ 8 s → ≥1 đổi tư thế, ĐÚNG 1 câu nối, không chồng giọng', async () => {
    const t = await dung({ treNaoMs: 8000 });
    datSoNao(1);
    t.world.lichSu.length = 0;

    t.bus.emit('user.text', { actor: 'owner', text: 'Nhi ơi, dựng giúp anh connector' });
    await nhipMicro();
    await t.tien(8000);
    // để câu của não chạy xong vòng dispatcher
    await choHanhDong();
    await choHanhDong();

    const cau = cacCau(t.world);
    // câu đệm trước, rồi ĐÚNG MỘT câu nối, rồi câu của não
    expect(cau[0]).toBe(CAU_DEM[0]);
    expect(cau.filter((c) => c === CAU_NOI)).toHaveLength(1);
    expect(cau.filter((c) => c === CAU_NOI_LAU)).toHaveLength(0);
    expect(cau).toContain(t.nao!.cau);
    // đổi tư thế ít nhất một lần
    expect(t.may.trangThai().soTuThe).toBeGreaterThanOrEqual(1);
    t.may.dung();
  });

  it('não giả trễ 25 s → thêm ĐÚNG 1 câu "hơi lâu", vẫn không chồng giọng', async () => {
    const t = await dung({ treNaoMs: 25000 });
    datSoNao(1);
    t.world.lichSu.length = 0;

    t.bus.emit('user.text', { actor: 'owner', text: 'Nhi ơi, dựng giúp anh connector' });
    await nhipMicro();
    await t.tien(25000);
    await choHanhDong();
    await choHanhDong();

    const cau = cacCau(t.world);
    expect(cau.filter((c) => c === CAU_NOI)).toHaveLength(1);
    expect(cau.filter((c) => c === CAU_NOI_LAU)).toHaveLength(1);
    expect(cau.indexOf(CAU_NOI)).toBeLessThan(cau.indexOf(CAU_NOI_LAU));
    expect(t.may.trangThai().soTuThe).toBeGreaterThanOrEqual(2);
    t.may.dung();
  });

  it('não giả trễ 2 s → KHÔNG câu nối, việc chêm bị cắt, câu của não vẫn chạy', async () => {
    const t = await dung({ treNaoMs: 2000 });
    datSoNao(1);
    t.world.lichSu.length = 0;

    t.bus.emit('user.text', { actor: 'owner', text: 'Nhi ơi' });
    await nhipMicro();
    await t.tien(2000);
    await choHanhDong();
    await choHanhDong();

    const cau = cacCau(t.world);
    expect(cau).not.toContain(CAU_NOI);
    expect(cau).not.toContain(CAU_NOI_LAU);
    // câu của não KHÔNG bị `catNgang` giết cùng việc chêm
    expect((await t.nao!.cuaNao())!).toMatchObject({ ok: true });
    expect(cau).toContain(t.nao!.cau);
    expect(t.may.trangThai().tangHai).toBe(false);
    t.may.dung();
  });

  it('não gửi câu TRONG lúc việc chêm đang chạy → cắt bằng actorInterrupt, KHÔNG catNgang', async () => {
    const t = await dung();
    datSoNao(1);
    t.bus.emit('user.text', { actor: 'owner', text: 'Nhi ơi' });
    await nhipMicro();
    // tới mốc câu đệm: Nhi đang nói câu đệm NGAY lúc này (không chờ thật)
    await t.tien(MAC_DINH.choNaoMs + MAC_DINH.nhipMs);
    expect(t.may.trangThai().dangDienCho).toBe(true);
    t.world.lichSu.length = 0;

    const cuaNao = t.dispatcher.run(
      'actor.say',
      { actor: 'gen', text: 'Dạ, em nghe Sếp' },
      'bridge',
    );
    await nhipMicro();
    expect(co(t.world, 'interrupt:gen')).toBe(true);
    expect(t.may.trangThai().tangHai).toBe(false);
    // `catNgang` sẽ giết luôn câu của não (nó xoá sạch hàng đợi) — đây là chỗ
    // chứng minh I1 vẫn giữ đúng giao kèo C0.
    expect((await cuaNao).ok).toBe(true);
    expect(cacCau(t.world)).toContain('Dạ, em nghe Sếp');
    t.may.dung();
  });

  it('não mở miệng → thoát vòng nghĩ: không đổi tư thế thêm, không nói chêm thêm', async () => {
    const t = await dung({ treNaoMs: 2000 });
    datSoNao(1);
    t.bus.emit('user.text', { actor: 'owner', text: 'Nhi ơi' });
    await nhipMicro();
    await t.tien(2000);
    await choHanhDong();
    await choHanhDong();
    const soTuTheLucDo = t.may.trangThai().soTuThe;
    t.world.lichSu.length = 0;

    await t.tien(MAC_DINH.cauNoiLauMs + 2000);
    expect(cacCau(t.world)).toEqual([]);
    expect(t.may.trangThai().soTuThe).toBe(soTuTheLucDo);
    t.may.dung();
  });

  it('một giọng duy nhất: không bao giờ có hai câu của Nhi chạy chồng nhau', async () => {
    const t = await dung({ treNaoMs: 25000 });
    datSoNao(1);
    /** Đếm câu đang phát: `sayStart` +1, `sayDone`/`interrupt` −1. */
    let dangPhat = 0;
    let dinhDangPhat = 0;
    t.bus.on('actor.sayStart', (e) => {
      if (e.data.actor !== 'gen') return;
      dangPhat++;
      dinhDangPhat = Math.max(dinhDangPhat, dangPhat);
    });
    t.bus.on('actor.sayDone', (e) => {
      if (e.data.actor !== 'gen') return;
      dangPhat = Math.max(0, dangPhat - 1);
    });

    t.bus.emit('user.text', { actor: 'owner', text: 'Nhi ơi' });
    await nhipMicro();
    await t.tien(26000);
    await choHanhDong();
    await choHanhDong();

    expect(dinhDangPhat).toBe(1);
    t.may.dung();
  });

  it('câu nối KHÔNG xếp hàng (xếp hàng là nó chen lên trước câu của não)', async () => {
    const t = await dung();
    datSoNao(1);
    t.bus.emit('user.text', { actor: 'owner', text: 'Nhi ơi' });
    await nhipMicro();
    // không `await choHanhDong()` → câu đệm vẫn đang chạy suốt đoạn này
    await t.tien(MAC_DINH.cauNoiMs + 300);
    // Nhi bận nói câu đệm nên câu nối phải HOÃN, tuyệt đối không vào hàng đợi
    expect(t.dispatcher.soCho('gen')).toBe(0);
    t.may.dung();
  });
});

/* ============================================================= NAM (owner) */

describe('I1 — Nam: không tự phản ứng với mình, gật khi Nhi nói xong', () => {
  beforeEach(() => xoaSoNao());

  it('Boss gõ (Nam nói) → Nam KHÔNG vào dáng nghe của chính mình', async () => {
    const t = await dung();
    datSoNao(1);
    t.world.lichSu.length = 0;
    await t.dispatcher.run('actor.say', { actor: 'owner', text: 'Nhi ơi' }, 'ui');
    await nhipMicro();
    expect(t.world.lichSu).not.toContain('ngheNgong:owner:true');
    expect(t.world.lichSu).toContain('ngheNgong:gen:true');
    t.may.dung();
  });

  it('Nhi nói → Nam nhìn Nhi; Nhi nói xong → Nam gật nhẹ rồi thôi', async () => {
    const t = await dung();
    datSoNao(1);
    t.world.lichSu.length = 0;

    void t.dispatcher.run('actor.say', { actor: 'gen', text: 'Dạ em đây ạ' }, 'bridge');
    await nhipMicro();
    // Nam quay cả mắt lẫn thân về Nhi trong lúc Nhi nói
    expect(co(t.world, 'faceTo:owner:gen')).toBe(true);
    expect(t.world.describe().actors.find((a) => a.id === 'owner')!.lookingAt).toBe('gen');
    expect(t.world.lichSu).not.toContain('ngheNgong:owner:true');

    // Nhi nói xong → Nam gật nhẹ
    await choHanhDong();
    await nhipMicro();
    expect(t.world.lichSu).toContain('ngheNgong:owner:true');

    // hết `gatNamMs` thì thôi gật
    t.world.lichSu.length = 0;
    await t.tien(MAC_DINH.gatNamMs + MAC_DINH.nhipMs);
    expect(t.world.lichSu).toContain('ngheNgong:owner:false');
    expect(dem(t.world, 'ngheNgong:owner:false')).toBe(1);
    t.may.dung();
  });

  it('Boss đang lái Nam (Nam bận) → phản xạ KHÔNG xoay thân anh ta', async () => {
    const t = await dung();
    datSoNao(1);
    void t.dispatcher.run('actor.moveTo', { actor: 'owner', to: 'ban-dieu-khien' }, 'ui');
    await nhipMicro();
    t.world.lichSu.length = 0;

    void t.dispatcher.run('actor.say', { actor: 'gen', text: 'Dạ em đây ạ' }, 'bridge');
    await nhipMicro();
    expect(co(t.world, 'faceTo:owner')).toBe(false);
    t.may.dung();
  });
});
