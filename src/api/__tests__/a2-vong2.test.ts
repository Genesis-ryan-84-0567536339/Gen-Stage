/**
 * a2-vong2.test.ts — **test hồi quy cho 3 lỗi chặn** của review PR #10 vòng 1,
 * cộng test chốt dấu hướng tay (gốc của lỗi "tay ngược chiều").
 *
 * | # | Lỗi vòng 1 | Test ở đây |
 * | --- | --- | --- |
 * | 1.1 | 4 emote xoay tay ngược chiều (đoán dấu euler) | `huongTay` / `huongCanhTay` |
 * | 1.2 | `actor.stop` không reset biểu cảm + mood | `actor.stop` |
 * | 1.3 | `done` resolve giống nhau cho "xong" và "bị cắt" | `cancel vs done` |
 * | 2.2 | emote chỉ kết thúc trong `capNhat` (tụt fps là sai giờ) | `hẹn giờ thật` |
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { EventBus } from '../../events';
import { NhatKy } from '../../log';
import { NHIP_MS, SanKhauGia } from './san-khau-gia';
import { huongCanhTay, huongTay, trongSoCuChi } from '../../behavior/cu-chi';
import { DANG_NEN, NEN_CLIP, NEN_EMOTE } from '../../behavior/chuyen-dong';
import { CLIPS, EMOTES } from '../../stage/noi-dung';
import { hanhDongHenGio } from '../../stage/hanh-dong';

let world: SanKhauGia;
let bus: EventBus;
let d: Dispatcher;

beforeEach(() => {
  world = new SanKhauGia(['lan']);
  bus = new EventBus();
  const nhatKy = new NhatKy();
  nhatKy.theoBus(bus);
  d = new Dispatcher({ registry: taoRegistry(), world, bus, nhatKy });
});

const cho = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------- 1.1 hướng tay: giơ lên là LÊN */

describe('hướng tay (lỗi chặn 1.1 — 4 emote xoay tay ngược chiều)', () => {
  it('doCao càng lớn, tay càng CAO — đúng cho cả hai bên', () => {
    for (const ben of ['trai', 'phai'] as const) {
      let truoc = -Infinity;
      for (const doCao of [0, 0.25, 0.5, 0.75, 1]) {
        const y = huongTay(ben, doCao).y;
        expect(y, `${ben} doCao=${doCao} phải cao hơn mức trước`).toBeGreaterThan(truoc);
        truoc = y;
      }
    }
  });

  it('doCao 0 = tay chỉ xuống, 0.5 = ngang vai, 1 = thẳng đứng lên', () => {
    expect(huongTay('trai', 0).y).toBeCloseTo(-1, 5);
    expect(huongTay('trai', 0.5).y).toBeCloseTo(0, 5);
    expect(huongTay('trai', 1).y).toBeCloseTo(1, 5);
    // ngang vai thì chìa ra bên: trái +X, phải −X (quy ước VRM)
    expect(huongTay('trai', 0.5).x).toBeGreaterThan(0.9);
    expect(huongTay('phai', 0.5).x).toBeLessThan(-0.9);
  });

  it('raTruoc = 1 ⇒ tay chỉ ra trước mặt (+Z), không còn chìa ra bên', () => {
    const v = huongTay('phai', 0.5, 1);
    expect(v.z).toBeGreaterThan(0.9);
    expect(Math.abs(v.x)).toBeLessThan(0.1);
  });

  it('6 emote giơ tay trong spec đều phải cho bàn tay cao hơn vai (y > 0)', () => {
    // đúng các giá trị doCao dùng trong `CU_CHI_EMOTE`
    const giơ: Array<[string, number]> = [
      ['rat-vui', 0.95],
      ['thanh-cong', 0.92],
      ['ngac-nhien', 0.72],
      ['boi-roi', 0.82],
      ['chao', 0.8],
      ['dong-y', 0.68],
    ];
    for (const [ten, doCao] of giơ) {
      expect(doCao, `${ten} phải giơ cao hơn vai`).toBeGreaterThan(0.5);
      expect(huongTay('phai', doCao).y, ten).toBeGreaterThan(0);
    }
  });

  it('gập cẳng tay: gap 0 = giữ hướng gốc, gap 1 = quay về phía trước', () => {
    const goc = new THREE.Vector3(0, -1, 0); // tay buông thẳng xuống
    expect(huongCanhTay(0, goc).angleTo(goc)).toBeCloseTo(0, 5);
    const gap = huongCanhTay(1, goc);
    expect(gap.z).toBeGreaterThan(0.5); // bàn tay đi ra TRƯỚC, không ra sau
    expect(gap.angleTo(goc)).toBeGreaterThan(1.5);
  });

  it('trọng số cử chỉ bắt đầu và kết thúc ở 0 (crossfade thật, không "pop")', () => {
    expect(trongSoCuChi(0)).toBe(0);
    expect(trongSoCuChi(1)).toBe(0);
    expect(trongSoCuChi(0.5)).toBe(1);
    expect(trongSoCuChi(0, true)).toBe(1); // clip lặp thì giữ nguyên
  });
});

/* ------------------------------------ bảng dáng nền: phủ đủ clip + emote */

describe('clip chuyển động thật phủ đủ spec', () => {
  it('mọi clip trong spec có một dáng nền CC0, và dáng đó có trong bảng', () => {
    for (const c of CLIPS) {
      const khoa = NEN_CLIP[c];
      expect(khoa, `clip "${c}" chưa có dáng nền`).toBeTruthy();
      expect(DANG_NEN[khoa!], `dáng nền "${khoa}" không có trong DANG_NEN`).toBeTruthy();
    }
  });

  it('mọi emote trong spec có một dáng nền CC0', () => {
    for (const e of EMOTES) {
      const khoa = NEN_EMOTE[e];
      expect(khoa, `emote "${e}" chưa có dáng nền`).toBeTruthy();
      expect(DANG_NEN[khoa!]).toBeTruthy();
    }
  });
});

/* -------------------------------- 1.2 actor.stop phải dọn cả cảm xúc */

describe('actor.stop (lỗi chặn 1.2)', () => {
  it('reset biểu cảm về neutral và mood về mặc định NGAY', async () => {
    await d.run('actor.emote', { actor: 'lan', emote: 'gian' });
    await cho(NHIP_MS + 20);
    let s = await d.run('stage.describe');
    let lan = layActor(s);
    expect(lan?.expression).toBe('angry');
    expect(lan?.mood).toBe('gian');

    const r = await d.run('actor.stop', { actor: 'lan' });
    expect(r.ok).toBe(true);
    s = await d.run('stage.describe');
    lan = layActor(s);
    expect(lan?.expression, 'mặt phải về neutral ngay').toBe('neutral');
    expect(lan?.mood, 'mood phải về mặc định ngay').toBe('binh-thuong');
  });

  it('cắt emote giữa chừng bằng actor.stop thì mood KHÔNG bị ghi', async () => {
    await d.run('actor.emote', { actor: 'lan', emote: 'buon' });
    await d.run('actor.stop', { actor: 'lan' });
    await cho(NHIP_MS + 30);
    const lan = layActor(await d.run('stage.describe'));
    expect(lan?.mood).toBe('binh-thuong');
    expect(lan?.expression).toBe('neutral');
  });
});

/* ---------------------- 1.3 cancel() không được coi như xong thật */

describe('cancel vs done (lỗi chặn 1.3)', () => {
  it('emote bị cắt bắn actor.emoteCancelled, KHÔNG bắn actor.emoteDone', async () => {
    const su: string[] = [];
    bus.on('actor.emoteDone', (e) => su.push(`done:${(e.data as { emote: string }).emote}`));
    bus.on('actor.emoteCancelled', (e) =>
      su.push(`cancel:${(e.data as { emote: string }).emote}`),
    );

    await d.run('actor.emote', { actor: 'lan', emote: 'buon' });
    await d.run('actor.emote', { actor: 'lan', emote: 'vui', interrupt: true });
    await cho(NHIP_MS + 40);

    expect(su).toContain('cancel:buon');
    expect(su).not.toContain('done:buon');
    expect(su).toContain('done:vui');
  });

  it('`cancelled()` của hành động phân biệt được "xong" và "bị cắt"', async () => {
    const a = world.actorEmote('lan', 'vui');
    expect(a.cancelled?.()).toBe(false);
    a.cancel();
    await a.done;
    expect(a.cancelled?.(), 'bị cắt ⇒ cancelled() = true').toBe(true);

    const b = world.actorEmote('lan', 'vui');
    await b.done;
    expect(b.cancelled?.(), 'xong thật ⇒ cancelled() = false').toBe(false);
  });

  it('emote có `say` bị cắt bởi emote có `say` khác: giọng mới không bị giết', async () => {
    // Sân khấu giả ghi lại thứ tự; cái quan trọng là emote cũ không được coi
    // là "xong" sau khi emote mới đã bắt đầu nói.
    const su: string[] = [];
    bus.on('actor.emoteDone', (e) => su.push(`done:${(e.data as { emote: string }).emote}`));
    await d.run('actor.emote', { actor: 'lan', emote: 'buon', say: 'Câu cũ' });
    await d.run('actor.emote', { actor: 'lan', emote: 'vui', say: 'Câu mới', interrupt: true });
    await cho(NHIP_MS + 40);
    expect(su).toEqual(['done:vui']);
    expect(world.lichSu).toContain('emote:vui:1:Câu mới');
  });
});

/* ------------- 2.2 hẹn giờ thật: durationMs đúng khi tụt khung hình */

describe('hẹn giờ thật (lỗi chặn 2.2 — emote kết thúc theo đồng hồ)', () => {
  it('hanhDongHenGio xong theo đồng hồ, không cần ai gọi capNhat', async () => {
    const t0 = Date.now();
    let biHuyRa: boolean | null = null;
    const hd = hanhDongHenGio(60, (biHuy) => {
      biHuyRa = biHuy;
    });
    await hd.done;
    expect(Date.now() - t0).toBeGreaterThanOrEqual(55);
    expect(biHuyRa).toBe(false);
  });

  it('huỷ trước hạn thì `ket(true)` chạy và hẹn giờ bị xoá', async () => {
    let soLan = 0;
    let biHuyRa: boolean | null = null;
    const hd = hanhDongHenGio(40, (biHuy) => {
      soLan++;
      biHuyRa = biHuy;
    });
    hd.cancel();
    await hd.done;
    expect(biHuyRa).toBe(true);
    await cho(70);
    expect(soLan, 'ket chỉ được chạy đúng 1 lần').toBe(1);
  });

  it('emote trả durationMs > 0 và tự xong dù không ai vẽ khung hình nào', async () => {
    const r = await d.run('actor.emote', { actor: 'lan', emote: 'cham-chu' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.result as { durationMs: number }).durationMs).toBeGreaterThan(0);
    await cho(NHIP_MS + 30);
    const lan = layActor(await d.run('stage.describe'));
    expect(lan?.state).toBe('idle');
    expect(lan?.busy).toBe(false);
  });
});

function layActor(r: Awaited<ReturnType<Dispatcher['run']>>) {
  if (!r.ok) return null;
  return (
    r.result as {
      actors: Array<{ id: string; state: string; busy: boolean; mood: string; expression: string }>;
    }
  ).actors.find((a) => a.id === 'lan');
}
