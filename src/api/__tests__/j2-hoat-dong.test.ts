/**
 * j2-hoat-dong.test.ts — **BẢNG HOẠT ĐỘNG + tự sinh hoạt khi rảnh** (J2, #79).
 *
 * Ba nhóm, và nhóm đầu là nhóm quan trọng nhất:
 *
 *  1. **Bảng là dữ liệu, nên TypeScript không soi được nó.** `{ cmd:
 *     'actor.mveTo' }` hay `{ seat: 'ban-an' }` (bàn, không phải ghế) đều biên
 *     dịch sạch rồi `ok:false` lúc chạy thật trên máy Boss. Nhóm này chạy
 *     ĐÚNG `kiemThamSo()` của dispatcher cho từng bước của cả 12 hoạt động,
 *     cộng mấy ràng buộc không nằm trong kiểu: place phải có thật, `seat` phải
 *     là place loại ghế, ngồi thì phải đứng lên.
 *  2. **Chạy trọn + cắt được**: `actor.activity` trên sân khấu giả — về idle,
 *     không còn cầm gì, `describe().activity` đúng trong lúc làm và `null`
 *     sau đó; Boss gõ giữa chừng thì **cắt ngay** và lệnh của não (đã xếp
 *     hàng) vẫn chạy.
 *  3. **Máy tự sinh hoạt**: đồng hồ tiêm, nhịp gọi tay — rảnh 20 s thì bắt
 *     đầu, 60 s ra ≥2 hoạt động KHÁC NHAU, Nam không bao giờ tự sinh hoạt.
 *
 * Bằng chứng trên Firefox thật (chân chạm sàn, không xuyên nội thất, ảnh từng
 * hoạt động): `scripts/kiem-j2.mjs`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { kiemThamSo } from '../validate';
import { EventBus } from '../../events';
import { NHIP_MS, SanKhauGia } from './san-khau-gia';
import {
  BANG_HOAT_DONG,
  TEN_HOAT_DONG,
  VUNG_GIUA,
  donSoHoatDong,
  layHoatDong,
} from '../../behavior/hoat-dong';
import { MAC_DINH_TU_SINH, batTuSinhHoat } from '../../behavior/tu-sinh-hoat';
import { PLACES, timPlace } from '../../stage/noi-dung';

const nhipMicro = () => new Promise<void>((r) => setTimeout(r, 0));

/** Chờ `actor.activityDone`/`actor.activityCancelled` của một actor. */
function choXong(bus: EventBus, actor: string): Promise<{ event: string; data: Record<string, unknown> }> {
  return new Promise((ok) => {
    const bo: Array<() => void> = [];
    for (const ten of ['actor.activityDone', 'actor.activityCancelled']) {
      bo.push(
        bus.on(ten, (e) => {
          if (e.data.actor !== actor) return;
          for (const h of bo) h();
          ok({ event: e.event, data: e.data });
        }),
      );
    }
  });
}

beforeEach(() => {
  donSoHoatDong();
});

/* ============================================= 1. BẢNG LÀ HỢP ĐỒNG, SOI SỐ */

describe('J2 bảng hoạt động — mọi bước phải hợp lệ với registry', () => {
  const registry = taoRegistry();

  it('có ít nhất 12 hoạt động, id duy nhất, có nhãn + mô tả tiếng Việt', () => {
    expect(BANG_HOAT_DONG.length).toBeGreaterThanOrEqual(12);
    expect(new Set(TEN_HOAT_DONG).size).toBe(BANG_HOAT_DONG.length);
    for (const h of BANG_HOAT_DONG) {
      expect(h.id).toMatch(/^[a-z0-9-]+$/);
      expect(h.nhan.trim().length).toBeGreaterThan(2);
      expect(h.mo.trim().length).toBeGreaterThan(10);
      expect(h.buoc.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('mỗi `cmd` có thật trong registry và MỌI tham số qua được kiemThamSo', async () => {
    const world = new SanKhauGia(['owner', 'gen']);
    // prop của hoạt động được `actor.activity` tự dựng lúc chạy; ở đây dựng
    // sẵn để `actor.hold` (enum `goiY: 'props'`) có cái mà kiểm.
    for (const h of BANG_HOAT_DONG) {
      if (h.prop && !world.coProp(h.prop.id)) {
        await world.propSpawn({ id: h.prop.id, shape: h.prop.shape, at: h.prop.at });
      }
    }
    for (const h of BANG_HOAT_DONG) {
      for (const [i, b] of h.buoc.entries()) {
        const spec = registry.get(b.cmd);
        expect(spec, `${h.id} bước ${i}: không có lệnh "${b.cmd}"`).toBeTruthy();
        const kq = kiemThamSo(spec!, { ...(b.args ?? {}), actor: 'gen' }, world);
        expect(kq.ok ? '' : kq.error, `${h.id} bước ${i} (${b.cmd})`).toBe('');
      }
    }
  });

  it('mọi place được nhắc tới đều có thật, và `seat` phải là place loại ghế', () => {
    const idPlace = new Set(PLACES.map((p) => p.id));
    for (const h of BANG_HOAT_DONG) {
      if (h.prop) expect(idPlace, `${h.id}: prop.at`).toContain(h.prop.at);
      for (const b of h.buoc) {
        for (const khoa of ['to', 'target', 'seat'] as const) {
          const v = b.args?.[khoa];
          if (typeof v !== 'string') continue;
          // `target` nhận cả `camera`/`cursor`/id actor — chỉ soi khi nó là place
          if (khoa === 'target' && !idPlace.has(v)) continue;
          expect(idPlace, `${h.id}: ${khoa} = ${v}`).toContain(v);
        }
        if (typeof b.args?.seat === 'string') {
          expect(timPlace(b.args.seat)?.kind, `${h.id}: ghế ${b.args.seat}`).toBe('seat');
        }
      }
    }
  });

  it('ngồi thì phải đứng lên — không hoạt động nào để Nhi ngồi lại', () => {
    for (const h of BANG_HOAT_DONG) {
      const iNgoi = h.buoc.findIndex((b) => b.cmd === 'actor.sit');
      if (iNgoi < 0) continue;
      const iDung = h.buoc.findIndex((b, i) => i > iNgoi && b.cmd === 'actor.stand');
      expect(iDung, `${h.id}: ngồi ở bước ${iNgoi} mà không có actor.stand sau đó`)
        .toBeGreaterThan(iNgoi);
    }
  });

  it('vùng giữa dùng place có thật (tạm là buc-trung-tam, chưa có VUNG_HOAT_DONG)', () => {
    expect(timPlace(VUNG_GIUA)).toBeTruthy();
    const giua = BANG_HOAT_DONG.filter((h) =>
      h.buoc.some((b) => b.args?.to === VUNG_GIUA),
    );
    // nhảy · tập thể dục · đi dạo · tưới cây
    expect(giua.length).toBeGreaterThanOrEqual(3);
  });

  it('đủ 12 hoạt động Issue #79 đòi, gọi tên được', () => {
    for (const id of [
      'doc-sach-sofa',
      'pha-ca-phe',
      'go-may-tinh',
      'vuon-vai',
      'ngam-cua-so',
      'tuoi-cay',
      'don-ban-an',
      'nhay-theo-nhac',
      'tap-the-duc',
      'di-dao',
      'uong-nuoc-ghe-an',
      'ngu-gat-sofa',
    ]) {
      expect(TEN_HOAT_DONG).toContain(id);
    }
  });
});

/* ====================================== 2. actor.activity — chạy trọn, cắt được */

function dung() {
  const world = new SanKhauGia(['owner', 'gen']);
  const bus = new EventBus();
  const dispatcher = new Dispatcher({ registry: taoRegistry(), world, bus });
  return { world, bus, dispatcher };
}

describe('J2 actor.activity — chạy trọn gói qua dispatcher', () => {
  it('`actor.activities` liệt kê đủ bảng, kèm thời lượng ước', async () => {
    const { dispatcher } = dung();
    const r = await dispatcher.run('actor.activities');
    expect(r.ok).toBe(true);
    const ds = (r as { result: { activities: Array<Record<string, unknown>> } }).result.activities;
    expect(ds.length).toBe(BANG_HOAT_DONG.length);
    for (const a of ds) {
      expect(typeof a.label).toBe('string');
      expect(a.estimatedMs as number).toBeGreaterThan(0);
    }
  });

  it('mọi hoạt động chạy trọn: r.ok, mọi bước ok, về idle, không cầm gì', async () => {
    for (const h of BANG_HOAT_DONG) {
      donSoHoatDong();
      const { world, bus, dispatcher } = dung();
      const xong = choXong(bus, 'gen');
      const r = await dispatcher.run('actor.activity', { actor: 'gen', name: h.id });
      expect(r.ok, `${h.id}: ${r.ok ? '' : r.error}`).toBe(true);
      const kq = await xong;
      expect(kq.event, `${h.id} phải chạy trọn, không bị cắt`).toBe('actor.activityDone');
      expect(kq.data.errors, `${h.id} có bước lỗi`).toBeUndefined();
      // `steps` đếm MỌI lệnh đã chạy, kể cả phần prop (`prop.spawn` →
      // `actor.hold` → `actor.drop` → `prop.moveTo`) mà bảng không khai —
      // nên nó ≥ số bước trong bảng, không bằng.
      expect(kq.data.steps as number).toBeGreaterThanOrEqual(h.buoc.length);
      await nhipMicro();
      const g = world.describe().actors.find((a) => a.id === 'gen')!;
      expect(g.state, `${h.id} phải về idle`).toBe('idle');
      expect(g.holding, `${h.id} phải thả đồ ra`).toBeNull();
    }
  });

  it('`stage.describe` trả `activity` đang làm, rồi về null khi xong', async () => {
    const { bus, dispatcher } = dung();
    const xong = choXong(bus, 'gen');
    await dispatcher.run('actor.activity', { actor: 'gen', name: 'di-dao' });
    const dang = await dispatcher.run('stage.describe');
    const a1 = (dang as { result: { actors: Array<{ id: string; activity?: string | null }> } })
      .result.actors.find((x) => x.id === 'gen')!;
    expect(a1.activity).toBe('di-dao');
    await xong;
    const sau = await dispatcher.run('stage.describe');
    const a2 = (sau as { result: { actors: Array<{ id: string; activity?: string | null }> } })
      .result.actors.find((x) => x.id === 'gen')!;
    expect(a2.activity).toBeNull();
  });

  it('bỏ trống `actor` thì tự chọn nhân vật của agent (Nhi), không phải Nam', async () => {
    const { dispatcher } = dung();
    const r = await dispatcher.run('actor.activity', { name: 'vuon-vai' });
    expect(r.ok).toBe(true);
    expect((r as { result: { actor: string } }).result.actor).toBe('gen');
  });

  it('tên hoạt động lạ → ok:false, kèm danh sách đang có', async () => {
    const { dispatcher } = dung();
    const r = await dispatcher.run('actor.activity', { actor: 'gen', name: 'bay-len-troi' });
    expect(r.ok).toBe(false);
  });

  it('`actor.stop` cắt cả CHUỖI, không chỉ bước đang chạy', async () => {
    const { bus, dispatcher } = dung();
    const xong = choXong(bus, 'gen');
    await dispatcher.run('actor.activity', { actor: 'gen', name: 'di-dao' });
    await dispatcher.run('actor.stop', { actor: 'gen' });
    const kq = await xong;
    expect(kq.event).toBe('actor.activityCancelled');
    expect(layHoatDong('gen')).toBeNull();
    // các bước còn lại KHÔNG chạy nữa
    const sau = kq.data.steps as number;
    await new Promise<void>((r) => setTimeout(r, NHIP_MS * 4));
    expect(layHoatDong('gen')).toBeNull();
    expect(sau).toBeLessThan(BANG_HOAT_DONG.find((h) => h.id === 'di-dao')!.buoc.length);
  });
});

/* ========================================== 3. MÁY TỰ SINH HOẠT KHI RẢNH */

function dungTuSinh(opts: { chon?: (ds: readonly { id: string }[]) => { id: string } } = {}) {
  const world = new SanKhauGia(['owner', 'gen']);
  const bus = new EventBus();
  const dispatcher = new Dispatcher({ registry: taoRegistry(), world, bus });
  let dongHo = 5_000_000;
  const gio = () => dongHo;
  const may = batTuSinhHoat({
    dispatcher,
    bus,
    bayGio: gio,
    so: { nhipMs: 1_000_000 }, // test gọi `nhip()` tay
    ...(opts.chon ? { chon: opts.chon as never } : {}),
  });
  return {
    world,
    bus,
    dispatcher,
    may,
    gio,
    /**
     * Đẩy đồng hồ `ms`, quét từng nhịp 500 ms như bản thật.
     *
     * **Cạm bẫy của sân khấu giả** (ghi ở I1, vẫn đúng ở đây): một hành động
     * giả dài **20 ms THẬT**, còn đồng hồ thì do test đẩy tay — hai cái không
     * dính nhau. Nhịp chỉ nghỉ 2 ms thật thì một hoạt động 10 bước cần ~100
     * nhịp để xong, tức "50 giây" trên đồng hồ giả, và phép đo *"rảnh 60 s →
     * ≥2 hoạt động"* không bao giờ đạt dù logic đúng. Nghỉ `nghiThatMs` = 12 ms
     * mỗi nhịp đưa tỉ lệ về gần bản thật (hoạt động ~8 s đồng hồ giả).
     */
    async tien(ms: number, nghiThatMs = 12) {
      const buoc = MAC_DINH_TU_SINH.nhipMs;
      for (let con = ms; con > 0; con -= buoc) {
        dongHo += Math.min(buoc, con);
        may.nhip();
        await new Promise<void>((r) => setTimeout(r, nghiThatMs));
      }
    },
  };
}

describe('J2 tự sinh hoạt khi rảnh', () => {
  it('rảnh CHƯA đủ 20 s thì không tự làm gì', async () => {
    const t = dungTuSinh();
    await t.tien(19_000);
    expect(t.may.trangThai().soLuot).toBe(0);
    expect(layHoatDong('gen')).toBeNull();
  });

  it('rảnh > 20 s thì tự sinh một hoạt động, nguồn `tu-sinh-hoat`', async () => {
    const t = dungTuSinh();
    const batDau: string[] = [];
    t.bus.on('actor.activityStart', (e) => batDau.push(String(e.data.activity)));
    await t.tien(21_000);
    expect(t.may.trangThai().soLuot).toBe(1);
    expect(batDau.length).toBe(1);
    expect(TEN_HOAT_DONG).toContain(batDau[0]!);
  });

  it('rảnh 60 s → ≥2 hoạt động, KHÁC NHAU (không lặp cái vừa làm)', async () => {
    const t = dungTuSinh();
    const batDau: string[] = [];
    t.bus.on('actor.activityStart', (e) => batDau.push(String(e.data.activity)));
    await t.tien(60_000);
    expect(batDau.length).toBeGreaterThanOrEqual(2);
    expect(new Set(batDau).size).toBeGreaterThanOrEqual(2);
    // không bao giờ hai lượt liền nhau trùng nhau
    for (let i = 1; i < batDau.length; i++) expect(batDau[i]).not.toBe(batDau[i - 1]);
  });

  it('Boss gõ giữa chừng → cắt NGAY trong cùng tick của `user.text`', async () => {
    const t = dungTuSinh();
    await t.tien(21_000);
    expect(layHoatDong('gen')).not.toBeNull();
    const cat: number[] = [];
    t.bus.on('actor.activityCancelled', () => cat.push(t.gio()));
    // ĐỒNG BỘ: không `await`, không một nhịp quét nào giữa hai dòng này
    t.bus.emit('user.text', { actor: 'owner', text: 'Nhi ơi', to: 'camera' });
    expect(cat.length, 'phải cắt ngay trong handler, không chờ nhịp 500 ms').toBe(1);
    expect(layHoatDong('gen')).toBeNull();
    expect(t.may.trangThai().soCat).toBe(1);
  });

  it('Boss bấm mic (`user.listening`) cũng cắt — mốc sớm nhất, chưa có chữ', async () => {
    const t = dungTuSinh();
    await t.tien(21_000);
    expect(layHoatDong('gen')).not.toBeNull();
    t.bus.emit('user.listening', { on: true });
    expect(layHoatDong('gen')).toBeNull();
  });

  it('cắt rồi thì lệnh của não (đã xếp hàng) vẫn chạy — hàng đợi không bị xoá', async () => {
    const t = dungTuSinh();
    await t.tien(21_000);
    // não gửi lệnh trong lúc Nhi đang làm hoạt động → xếp hàng
    const cuaNao = t.dispatcher.run('actor.moveTo', { actor: 'gen', to: 'ban-1' }, 'bridge');
    const kq = await cuaNao;
    expect(kq.ok, kq.ok ? '' : kq.error).toBe(true);
    expect(layHoatDong('gen')).toBeNull();
  });

  it('não ra lệnh (cmd.queued) cũng cắt, không cần Boss gõ', async () => {
    const t = dungTuSinh();
    await t.tien(21_000);
    expect(layHoatDong('gen')).not.toBeNull();
    void t.dispatcher.run('actor.play', { actor: 'gen', clip: 'wave' }, 'bridge');
    expect(layHoatDong('gen')).toBeNull();
  });

  it('Nam (controlledBy owner) KHÔNG bao giờ tự sinh hoạt', async () => {
    const t = dungTuSinh();
    const batDau: string[] = [];
    t.bus.on('actor.activityStart', (e) => batDau.push(String(e.data.actor)));
    await t.tien(60_000);
    expect(batDau.length).toBeGreaterThan(0);
    expect(batDau.every((x) => x === 'gen')).toBe(true);
    expect(t.may.trangThai().gen).toBe('gen');
  });

  it('Nhi đang bận việc của não thì đồng hồ rảnh reset, không chen vào', async () => {
    const t = dungTuSinh();
    await t.tien(15_000);
    // não cho Nhi đi — mỗi nhịp quét thấy bận thì đồng hồ rảnh về 0
    void t.dispatcher.run('actor.play', { actor: 'gen', clip: 'sleep', loop: true }, 'bridge');
    await t.tien(15_000);
    expect(t.may.trangThai().soLuot).toBe(0);
  });
});
