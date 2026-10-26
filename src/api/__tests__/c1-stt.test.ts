/**
 * c1-stt.test.ts — NHẬN DẠNG GIỌNG VIỆT (C1, Issue #31).
 *
 * Ba thứ phải giữ đúng, vì cả ba đều đã từng sai trong lúc đo thật:
 *
 * 1. **Sổ từ nhà chỉ được sửa TÊN RIÊNG.** Bản đầu khai `tuc` là cách nghe sai
 *    của `kết tinh` → "cất module lên kệ" thành "kết tinh module lên kệ"; khai
 *    `màn hình` vào sổ → "mở màn hình chính" mất chữ "mở"; nới ngưỡng cho
 *    `Kho Ryan` lên 0,5 → "khó bảo ghê" thành "Kho Ryan Gen". Test giữ các câu
 *    tiếng Việt thường **không bị sửa**.
 * 2. **VAD cắt đúng dải** và nói "không có tiếng" khi Boss giữ phím mà im.
 * 3. **`user.speech` chỉ bắn khi câu đến từ mic**, và phiếu dùng một lần.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  chuanHoaCauNoi,
  dangNghe,
  khoangCach,
  suaTheoSoTu,
} from '../../../bridge/so-tu';
import { SoDoAm, timDaiNoi, tinhRms } from '../../audio/vad';
import { boPhieuGiong, datPhieuGiong, layPhieuGiong } from '../../audio/so-giong';
import { Dispatcher } from '../dispatcher';
import { EventBus } from '../../events';
import { taoRegistry } from '../commands/index';
import { SanKhauGia } from './san-khau-gia';
import { NhatKy } from '../../log';
import type { StageEvent } from '../types';

/* ------------------------------------------------------------- sổ từ nhà */

describe('dạng nghe + khoảng cách', () => {
  it('bỏ dấu tiếng Việt và mọi thứ không phải chữ/số', () => {
    expect(dangNghe('Kết tinh module')).toBe('kettinhmodule');
    expect(dangNghe('đi tới bàn điều khiển')).toBe('ditoibandieukhien');
    expect(dangNghe('Gen ơi,')).toBe('genoi');
  });

  it('khoảng cách sửa theo ký tự', () => {
    expect(khoangCach('module', 'module')).toBe(0);
    expect(khoangCach('modun', 'module')).toBe(2);
    expect(khoangCach('', 'abc')).toBe(3);
  });
});

describe('sổ từ nhà sửa tên riêng', () => {
  // Đúng những cách nghe đo được từ PhoWhisper-small trên bộ thử 20 wav.
  const batBuoc: Array<[string, string]> = [
    ['ghen ơi dựng con nét to ba su rau', 'Gen ơi dựng connector Baserow'],
    ['gên ơi dựng con nét to ba xu rao', 'Gen ơi dựng connector Baserow'],
    ['kkin mua đùng tên kho rayon', 'kết tinh module tên Kho Ryan'],
    ['kết tinh mua đùng tên kho raion', 'kết tinh module tên Kho Ryan'],
    ['cất mô đun lên kệ', 'cất module lên kệ'],
    ['cất model lên kệ', 'cất module lên kệ'],
  ];
  for (const [tho, mong] of batBuoc)
    it(`"${tho}" → "${mong}"`, () => {
      expect(suaTheoSoTu(tho)).toBe(mong);
    });

  // Câu tiếng Việt thường: sổ từ KHÔNG được chạm vào.
  const giuNguyen = [
    'đi tới bàn điều khiển',
    'mở màn hình chính',
    'quay lại đây',
    'nói lại lần nữa',
    'dừng lại',
    'khó bảo ghê',
    'ba lô của tôi',
    'bà già đi chợ',
    'chơi game đi',
    'đen quá đi',
  ];
  for (const c of giuNguyen)
    it(`không sửa "${c}"`, () => {
      expect(suaTheoSoTu(c)).toBe(c);
    });

  it('cửa sổ ngắn thắng khi hoà điểm (không ăn mất chữ "lên")', () => {
    // `mô đun lên` và `mô đun` đều cách `module` 2 ký tự → phải lấy `mô đun`.
    expect(suaTheoSoTu('mô đun lên kệ')).toBe('module lên kệ');
  });
});

describe('chuẩn hoá câu Boss nói', () => {
  it('bỏ dấu câu cuối, giữ dấu tiếng Việt', () => {
    expect(chuanHoaCauNoi('Dừng lại!').text).toBe('Dừng lại');
    expect(chuanHoaCauNoi('  đi tới bàn điều khiển.  ').text).toBe(
      'đi tới bàn điều khiển',
    );
  });

  it('bỏ phụ âm lạc engine chèn ở đầu câu', () => {
    expect(chuanHoaCauNoi('n nói lại lần nữa').text).toBe('nói lại lần nữa');
    expect(chuanHoaCauNoi('d quay lại đây').text).toBe('quay lại đây');
    // nhưng không bỏ nguyên âm đứng một mình (từ Việt thật)
    expect(chuanHoaCauNoi('à quay lại đây').text).toBe('à quay lại đây');
  });

  it('goiGen chỉ bật khi gọi tên ở ĐẦU câu', () => {
    expect(chuanHoaCauNoi('Gen ơi, dựng connector').goiGen).toBe(true);
    expect(chuanHoaCauNoi('ghen à mở màn hình').goiGen).toBe(true);
    expect(chuanHoaCauNoi('gen, vui lên').goiGen).toBe(true);
    expect(chuanHoaCauNoi('nói với Gen là tôi về').goiGen).toBe(false);
    expect(chuanHoaCauNoi('dừng lại').goiGen).toBe(false);
  });

  it('text giữ nguyên nội dung, không viết hoa lại hộ', () => {
    expect(chuanHoaCauNoi('dừng lại').text).toBe('dừng lại');
  });
});

/* ------------------------------------------------------------------- VAD */

describe('VAD cắt im lặng', () => {
  /** 200 ms im, 400 ms nói, 300 ms im — bước 50 ms. */
  const chuoi = [0, 0, 0, 0, 0.3, 0.42, 0.38, 0.4, 0.31, 0.2, 0, 0, 0, 0, 0, 0];

  it('tìm đúng dải nói và chừa lề', () => {
    const d = timDaiNoi(chuoi, 50, { chuaMs: 100 });
    expect(d.coTieng).toBe(true);
    // nói từ mẫu 4 (200 ms) tới mẫu 9 (450 ms), chừa 100 ms mỗi đầu
    expect(d.tuMs).toBe(100);
    expect(d.denMs).toBe(600);
    expect(d.dinh).toBeCloseTo(0.42, 3);
  });

  it('giữ phím mà im → coTieng false, trả cả lượt', () => {
    const d = timDaiNoi([0, 0.0005, 0, 0.001, 0], 50);
    expect(d.coTieng).toBe(false);
    expect(d.tuMs).toBe(0);
    expect(d.denMs).toBe(250);
  });

  it('một tiếng cộc ngắn không tính là nói', () => {
    // một mẫu 50 ms < toiThieuMs 150 ms
    expect(timDaiNoi([0, 0, 0.9, 0, 0], 50).coTieng).toBe(false);
  });

  it('ngưỡng là TƯƠNG ĐỐI theo đỉnh, nên mic nhỏ vẫn cắt được', () => {
    const nho = chuoi.map((x) => x * 0.02);
    expect(timDaiNoi(nho, 50, { chuaMs: 0, nguongSan: 0 }).coTieng).toBe(true);
  });

  it('SoDoAm gom mẫu theo nhịp thật', () => {
    const so = new SoDoAm(50, { chuaMs: 0 });
    for (const x of chuoi) so.them(x);
    expect(so.soMau).toBe(chuoi.length);
    expect(so.ket().coTieng).toBe(true);
  });

  it('tinhRms: im = 0, sóng vuông ±1 = 1', () => {
    expect(tinhRms(new Float32Array(16))).toBe(0);
    expect(tinhRms([1, -1, 1, -1])).toBeCloseTo(1, 6);
  });
});

/* ------------------------------------------------- phiếu giọng + user.speech */

describe('phiếu giọng', () => {
  beforeEach(() => boPhieuGiong());

  it('dùng một lần, và chỉ khớp đúng câu', () => {
    datPhieuGiong({ text: 'dừng lại', confidence: 0.9, durationMs: 1200, goiGen: false });
    expect(layPhieuGiong('câu khác')).toBeNull();
    expect(layPhieuGiong('dừng lại')?.confidence).toBe(0.9);
    expect(layPhieuGiong('dừng lại')).toBeNull();
  });
});

describe('actor.say bắn user.speech khi câu đến từ mic', () => {
  function dung(): { d: Dispatcher; bus: EventBus; thay: StageEvent[] } {
    const bus = new EventBus();
    const world = new SanKhauGia(['owner', 'gen']);
    const d = new Dispatcher({ registry: taoRegistry(), world, bus, nhatKy: new NhatKy() });
    const thay: StageEvent[] = [];
    bus.on('*', (e) => thay.push(e));
    return { d, bus, thay };
  }

  beforeEach(() => boPhieuGiong());

  it('có phiếu → user.text + user.speech (có confidence, durationMs)', async () => {
    const { d, thay } = dung();
    datPhieuGiong({
      text: 'Gen ơi dựng connector Baserow',
      confidence: 0.86,
      durationMs: 2100,
      goiGen: true,
    });
    const kq = await d.run('actor.say', {
      actor: 'owner',
      text: 'Gen ơi dựng connector Baserow',
    });
    expect(kq.ok).toBe(true);
    const sp = thay.find((e) => e.event === 'user.speech');
    expect(sp).toBeDefined();
    expect(sp!.data).toMatchObject({
      actor: 'owner',
      text: 'Gen ơi dựng connector Baserow',
      confidence: 0.86,
      durationMs: 2100,
      goiGen: true,
    });
    expect(thay.some((e) => e.event === 'user.text')).toBe(true);
  });

  it('Boss GÕ tay → chỉ user.text, không user.speech', async () => {
    const { d, thay } = dung();
    const kq = await d.run('actor.say', { actor: 'owner', text: 'dừng lại' });
    expect(kq.ok).toBe(true);
    expect(thay.some((e) => e.event === 'user.text')).toBe(true);
    expect(thay.some((e) => e.event === 'user.speech')).toBe(false);
  });

  it('Gen nói → không user.text, không user.speech (không tự nghe lời mình)', async () => {
    const { d, thay } = dung();
    datPhieuGiong({ text: 'chào Sếp', confidence: 0.9, durationMs: 900, goiGen: false });
    await d.run('actor.say', { actor: 'gen', text: 'chào Sếp' });
    expect(thay.some((e) => e.event === 'user.text')).toBe(false);
    expect(thay.some((e) => e.event === 'user.speech')).toBe(false);
  });

  it('registry khai user.speech trong events của actor.say (stage.bootstrap đọc từ đây)', () => {
    const spec = taoRegistry().get('actor.say');
    expect(spec?.events).toContain('user.speech');
  });
});
