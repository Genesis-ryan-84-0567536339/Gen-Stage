/**
 * g3-ngu-phap.test.ts — CÂU ĐỜI THƯỜNG PHẢI RA LỆNH (G3, Issue #62).
 *
 * Boss 28/10: "nhận diện giọng nói tào lao quá". Hai gốc, và đây là gốc thứ
 * hai: lớp hiểu lệnh chỉ bắt mẫu cố định kiểu tài liệu ("Gen, đi tới bàn điều
 * khiển"), còn Boss nói "tôi kêu hai bạn qua ghế ngồi đi" thì trượt hết.
 *
 * Bộ này là **15 câu đời thường** — mốc của Issue là ≥ 12 câu ra đúng hành
 * động. Câu nào lấy từ log giọng thật thì ghi rõ trong chú thích.
 *
 * Vì sao test ở tầng `phanTich()` chứ không qua mic: tầng này là hàm thuần,
 * nên lỗi hiểu lệnh tách hẳn khỏi lỗi nhận dạng âm. Số đo của tầng âm nằm
 * trong `docs/g3/ket-qua.md`.
 */
import { describe, expect, it } from 'vitest';
import { phanTich, type BoiCanh } from '../hieu-lenh';
import {
  BI_DANH_MOI_NGUOI,
  DONG_AM_TU_LENH,
  KHONG_KHAI_DONG_AM,
  gan,
} from '../ngu-phap';

/** Bối cảnh giống sân khấu thật (D1b): hai nhân vật, năm chỗ, hai ghế. */
const BC: BoiCanh = {
  actors: [
    { id: 'owner', controlledBy: 'owner' },
    { id: 'gen', controlledBy: 'agent' },
  ],
  places: [
    { id: 'ban-dieu-khien', kind: 'stand' },
    { id: 'buc-trung-tam', kind: 'stand' },
    { id: 'ke-module', kind: 'stand' },
    { id: 'cua', kind: 'stand' },
    { id: 'ghe-1', kind: 'seat' },
    { id: 'ghe-2', kind: 'seat' },
  ],
  emotes: ['vui', 'rat-vui', 'buon', 'cham-chu', 'chao'],
  screens: ['main', 'left', 'right'],
  props: [],
  gocMay: ['toan-canh', 'ban-dieu-khien'],
};

/** Một ca: câu Boss nói → lệnh mong đợi + ai phải diễn. */
interface Ca {
  cau: string;
  cmd: string;
  /** Mẫu câu phải khớp (để lỗi chỉ ra đúng mẫu nào sai). */
  mau: string;
  nguoiNhan?: string[];
  /** Kiểm thêm một tham số của lệnh đầu. */
  args?: Record<string, unknown>;
  /** Vì sao có câu này trong bộ. */
  vi?: string;
}

const BO_15: Ca[] = [
  {
    cau: 'tôi kêu hai bạn qua ghế ngồi đi',
    cmd: 'actor.sit',
    mau: 'ngoi',
    nguoiNhan: ['owner', 'gen'],
    vi: 'NGUYÊN VĂN ý Boss trong log #62 (engine nghe thành "qua hồi đi mà dính dáng hồi đi")',
  },
  {
    cau: 'Gen ơi, qua ghế ngồi đi',
    cmd: 'actor.sit',
    mau: 'ngoi',
    nguoiNhan: ['gen'],
    vi: 'log #62: engine nghe thành "dạ nơi qua ghế ngồi đi" — mất cả tên gọi',
  },
  { cau: 'đi qua đây thôi', cmd: 'actor.moveTo', mau: 'laiDay', vi: 'log #62, nguyên văn' },
  {
    cau: 'tôi kêu bạn đi kiếm chỗ ngồi',
    cmd: 'actor.sit',
    mau: 'ngoi',
    nguoiNhan: ['gen'],
    vi: 'log #62, nguyên văn (engine nghe ĐÚNG, mà lệnh vẫn trượt)',
  },
  {
    cau: 'bảo Javis đi tới cửa',
    cmd: 'actor.moveTo',
    mau: 'moveTo',
    nguoiNhan: ['owner'],
    args: { to: 'cua' },
  },
  {
    cau: 'nhờ Gen qua bàn điều khiển',
    cmd: 'actor.moveTo',
    mau: 'moveTo',
    nguoiNhan: ['gen'],
    args: { to: 'ban-dieu-khien' },
  },
  { cau: 'hai bạn lại đây', cmd: 'actor.moveTo', mau: 'laiDay', nguoiNhan: ['owner', 'gen'] },
  {
    cau: 'cả hai qua bục trung tâm',
    cmd: 'actor.moveTo',
    mau: 'moveTo',
    nguoiNhan: ['owner', 'gen'],
    args: { to: 'buc-trung-tam' },
  },
  { cau: 'Gen tới đây coi', cmd: 'actor.moveTo', mau: 'laiDay', nguoiNhan: ['gen'] },
  { cau: 'kêu Gen vui lên', cmd: 'actor.emote', mau: 'emote', args: { emote: 'vui' } },
  { cau: 'mọi người ngồi xuống đi', cmd: 'actor.sit', mau: 'ngoi', nguoiNhan: ['owner', 'gen'] },
  { cau: 'Gen ngồi ghế hai đi', cmd: 'actor.sit', mau: 'ngoiGhe', args: { seat: 'ghe-2' } },
  { cau: 'Javis đứng lên đi', cmd: 'actor.stand', mau: 'dungLen', nguoiNhan: ['owner'] },
  { cau: 'kêu Gen qua kệ module', cmd: 'actor.moveTo', mau: 'moveTo', args: { to: 'ke-module' } },
  { cau: 'các bạn qua đây coi', cmd: 'actor.moveTo', mau: 'laiDay', nguoiNhan: ['owner', 'gen'] },
];

describe('G3 (#62) — 15 câu đời thường ra đúng hành động', () => {
  for (const c of BO_15) {
    it(`«${c.cau}» → ${c.cmd}${c.vi ? ` · ${c.vi}` : ''}`, () => {
      const kq = phanTich(c.cau, BC);
      expect(kq.mau, `mẫu khớp (điểm ${kq.diem.toFixed(1)})`).toBe(c.mau);
      expect(kq.lenh[0]?.cmd).toBe(c.cmd);
      if (c.nguoiNhan) expect(kq.nguoiNhan).toEqual(c.nguoiNhan);
      if (c.args)
        for (const [k, v] of Object.entries(c.args)) expect(kq.lenh[0]?.args[k]).toBe(v);
    });
  }

  it('cả bộ 15 câu đạt mốc Issue #62 (≥ 12 câu đúng lệnh)', () => {
    const dung = BO_15.filter((c) => {
      const kq = phanTich(c.cau, BC);
      return kq.mau === c.mau && kq.lenh[0]?.cmd === c.cmd;
    });
    expect(dung.length).toBeGreaterThanOrEqual(12);
  });
});

describe('G3 — bí danh nhóm "hai bạn" KHÔNG lẫn với place "bàn"', () => {
  /*
   * C2 cố tình loại "hai bạn"/"các bạn" vì sợ `ban` lẫn `bàn`. G3 khai lại,
   * nên hai ca dưới là lý do khai được: cụm phải khớp ĐÚNG THỨ TỰ.
   */
  it('"đi tới bàn hai" vẫn là place, không phải "hai bạn"', () => {
    const kq = phanTich('Gen, đi tới bàn hai', {
      ...BC,
      places: [...BC.places, { id: 'ban-2', kind: 'stand' }],
    });
    expect(kq.moiNguoi).toBe(false);
    expect(kq.lenh[0]?.args.to).toBe('ban-2');
  });

  it('"đi tới bàn điều khiển" không bị hiểu thành gọi hai người', () => {
    const kq = phanTich('Gen, đi tới bàn điều khiển', BC);
    expect(kq.moiNguoi).toBe(false);
    expect(kq.nguoiNhan).toEqual(['gen']);
  });

  it('bảng nhóm có đủ ba cách Issue #62 yêu cầu', () => {
    for (const c of ['hai ban', 'moi nguoi', 'ca hai']) expect(BI_DANH_MOI_NGUOI).toContain(c);
  });
});

describe('G3 — đồng âm từ lệnh (fuzzy chịu "hồi")', () => {
  it('"hồi" (bỏ dấu: hoi) khớp từ lệnh "ngồi"', () => {
    expect(gan('hoi', 'ngoi')).toBe(true);
    expect(DONG_AM_TU_LENH.ngoi).toContain('hoi');
  });

  it('"kiều" khớp "kêu" — log #62 "người kiều bàn…"', () => {
    expect(gan('kieu', 'keu')).toBe(true);
  });

  /*
   * Bài học của `bridge/so-tu.ts` áp luôn vào đây: thà bỏ sót một cách nghe
   * sai hơn sửa bừa câu Boss nói đúng.
   *
   * `gan('noi','ngoi')` ĐÃ là `true` từ C2 — fuzzy sẵn cho lệch 1 ký tự ở từ
   * 4 ký tự, không phải bảng này thêm vào. Điều phải giữ là: bảng KHÔNG khai
   * thêm từ Việt thường, và câu "nói" vẫn ra `actor.say` nhờ điểm mẫu.
   */
  it('KHÔNG khai từ Việt thường / từ quá ngắn vào bảng đồng âm', () => {
    const tatCa = Object.values(DONG_AM_TU_LENH).flat();
    for (const d of tatCa)
      expect(d.length, `"${d}" quá ngắn, dễ sửa bừa`).toBeGreaterThan(2);
    for (const xau of KHONG_KHAI_DONG_AM)
      expect(tatCa, `"${xau}" là từ Việt thường, khai vào là sửa bừa`).not.toContain(xau);
  });

  it('câu "nói …" vẫn ra actor.say, không thành lệnh ngồi', () => {
    const kq = phanTich('Gen, nói "chào cả nhà"', BC);
    expect(kq.lenh[0]?.cmd).toBe('actor.say');
  });

  it('KHÔNG khai từ 2 ký tự: "họ" một mình không thành lệnh ngồi', () => {
    expect(gan('ho', 'ngoi')).toBe(false);
  });
});
