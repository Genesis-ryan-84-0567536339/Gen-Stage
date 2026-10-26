/**
 * g3-goi-ten-giong.test.ts — GỌI TÊN BẰNG GIỌNG NÓI (G3, Issue #62 · review #67).
 *
 * Review độc lập #67 đo trên bộ TTS **bẩn** (giọng nhanh, băng hẹp, nhiễu):
 * gọi tên mới chỉ **5/10** đúng người. Ba nguyên nhân, mỗi cái một nhóm test:
 *
 * 1. "Nhi" dài 3 ký tự → ngưỡng fuzzy **0** (`nguong()`), nên `nia` / `nghi` /
 *    `ni` trượt hết. Fuzzy không cứu được, phải khai cách nghe chệch.
 * 2. Luật của G2 đòi **dấu phẩy** sau tên gọi trần. Giọng nói không bao giờ có
 *    dấu phẩy — "Nam đi tới bếp" vì thế không được coi là gọi Nam.
 * 3. Bí danh `gien` + fuzzy ≤1 ký tự bắt luôn `mien` → "**miền nam**" thành
 *    gọi Nhi.
 *
 * Mốc của review: **≥ 8/10** câu gọi tên trên bộ bẩn đúng người, và **6 câu từ
 * thường 0 nhầm**. Cả hai mốc là một test riêng ở cuối.
 */
import { describe, expect, it } from 'vitest';
import { phanTich, tachNguoiNhan, type BoiCanh } from '../hieu-lenh';
import { NGHE_NHAM_TEN, TIN_HIEU_GOI, tach } from '../ngu-phap';

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
  emotes: ['vui', 'rat-vui', 'buon', 'cham-chu', 'chao', 'suy-nghi'],
  screens: ['main', 'left', 'right'],
  props: [],
  gocMay: ['toan-canh'],
};

/**
 * 10 câu GỌI TÊN đúng như PhoWhisper trả ra trên bộ bẩn (#67): không dấu phẩy,
 * và tên bị nghe chệch. Cột `ai` là người Boss ĐANG gọi.
 */
const CAU_GOI_TEN: Array<{ cau: string; ai: string; vi?: string }> = [
  { cau: 'Nam đi tới bếp', ai: 'owner', vi: 'ca trượt tiêu biểu của #67 — giọng không có dấu phẩy' },
  { cau: 'Nhi đi tới bàn điều khiển', ai: 'gen' },
  { cau: 'nia ngồi xuống đi', ai: 'gen', vi: 'STT nghe "Nhi" thành "nia"' },
  { cau: 'ni qua ghế ngồi đi', ai: 'gen', vi: 'STT nghe "Nhi" thành "ni" — 2 ký tự, fuzzy bó tay' },
  { cau: 'nhì lại đây', ai: 'gen', vi: 'STT nghe "Nhi" thành "nhì" (số đếm!)' },
  { cau: 'nghi qua bàn điều khiển', ai: 'gen', vi: 'STT nghe "Nhi" thành "nghi" — động từ sau KHÔNG mơ hồ' },
  { cau: 'Nhi ơi ngồi đi', ai: 'gen', vi: 'tín hiệu gọi "ơi" phải bị CẮT, không để lại từ lạ trừ điểm' },
  { cau: 'Nam à đứng lên đi', ai: 'owner' },
  { cau: 'nhâm ra cửa', ai: 'owner', vi: 'STT nghe "Nam" thành "nhâm"' },
  { cau: 'năm vui lên', ai: 'owner', vi: 'STT nghe "Nam" thành "năm" + động từ cảm xúc ngay sau' },
];

/** 6 câu TỪ THƯỜNG — không câu nào được coi là gọi tên. */
const CAU_TU_THUONG = [
  'nhà ở phía nam của thành phố',
  'cục nam châm hút được sắt',
  'em bé rất nhí nhảnh và vui',
  'năm nay nhà mình đi du lịch nhiều',
  'miền nam mùa này mưa nhiều',
  'nghỉ đi cho đỡ mệt',
];

describe('G3 (#67) — gọi tên bằng GIỌNG: đầu câu + động từ lệnh, không cần dấu phẩy', () => {
  for (const c of CAU_GOI_TEN) {
    it(`«${c.cau}» → gọi ${c.ai}${c.vi ? ` · ${c.vi}` : ''}`, () => {
      const kq = phanTich(c.cau, BC);
      expect(kq.coGoiTen).toBe(true);
      expect(kq.nguoiNhan).toEqual([c.ai]);
    });
  }

  it('tiếng gọi "ơi"/"à" bị cắt khỏi câu còn lại (không trừ điểm mẫu)', () => {
    const cau = tach('Nhi ơi ngồi đi');
    const nn = tachNguoiNhan(cau, BC);
    expect(nn.conLai.sach).toEqual(['ngoi', 'di']);
    // và lệnh phải ra thật, không chỉ tách được tên
    expect(phanTich('Nhi ơi ngồi đi', BC).lenh[0]?.cmd).toBe('actor.sit');
  });

  it('CẢ 10 câu gọi tên đạt mốc review #67 (≥ 8/10 đúng người)', () => {
    const dung = CAU_GOI_TEN.filter((c) => {
      const kq = phanTich(c.cau, BC);
      return kq.coGoiTen && kq.nguoiNhan[0] === c.ai;
    });
    expect(dung.length).toBeGreaterThanOrEqual(8);
  });
});

describe('G3 (#67) — ba ràng buộc giữ luật gọi tên khỏi ăn vào câu thường', () => {
  for (const cau of CAU_TU_THUONG) {
    it(`«${cau}» KHÔNG phải gọi tên`, () => {
      const kq = phanTich(cau, BC);
      expect(kq.coGoiTen, `nhận bừa thành gọi ${JSON.stringify(kq.nguoiNhan)}`).toBe(false);
    });
  }

  it('6 câu từ thường: 0 nhầm (mốc review #67)', () => {
    const nham = CAU_TU_THUONG.filter((c) => phanTich(c, BC).coGoiTen);
    expect(nham).toEqual([]);
  });

  /* Ràng buộc 1: chỉ nhận ở ĐẦU CÂU. */
  it('tên ở GIỮA câu không thành lời gọi — "đi về phía nam" không gọi Nam', () => {
    expect(phanTich('đi về phía nam', BC).coGoiTen).toBe(false);
  });

  /* Ràng buộc 2: phải có động từ lệnh / tín hiệu gọi NGAY SAU. */
  it('đầu câu nhưng theo sau không phải động từ lệnh → không gọi', () => {
    for (const c of ['nam châm hút sắt', 'nhí nhảnh quá đi', 'nhi phân là cơ số hai'])
      expect(phanTich(c, BC).coGoiTen, c).toBe(false);
  });

  /*
   * Ràng buộc 3: cách nghe chệch trùng hẳn từ Việt thường (`nghi` = "nghỉ"/
   * "nghĩ") chỉ nhận khi động từ theo sau KHÔNG mơ hồ.
   */
  it('"nghỉ đi" giữ nguyên nghĩa, "nghi qua bàn điều khiển" mới là gọi Nhi', () => {
    expect(phanTich('nghỉ đi cho đỡ mệt', BC).coGoiTen).toBe(false);
    expect(phanTich('nghi qua bàn điều khiển', BC).nguoiNhan).toEqual(['gen']);
  });

  it('emote "suy nghĩ" vẫn chạy — bảng này KHÔNG viết đè chữ như sổ từ nhà', () => {
    const kq = phanTich('Nhi ơi, suy nghĩ đi', BC);
    expect(kq.nguoiNhan).toEqual(['gen']);
    expect(kq.lenh[0]?.cmd).toBe('actor.emote');
    expect(kq.lenh[0]?.args.emote).toBe('suy-nghi');
  });

  /* Nguyên nhân 3 của #67: bí danh `gien` + fuzzy bắt luôn `mien`. */
  it('bỏ bí danh "gien" → "miền nam" không còn bị hiểu thành gọi Nhi', async () => {
    const { BI_DANH_NHAN_VAT } = await import('../../stage/noi-dung');
    expect(BI_DANH_NHAN_VAT.gen).not.toContain('gien');
    expect(phanTich('miền nam mùa này mưa nhiều', BC).coGoiTen).toBe(false);
  });
});

describe('G3 (#67) — bảng cách nghe chệch giữ được kỷ luật', () => {
  it('không khai cách nghe chệch là một TỪ LỆNH (tự gọi chính mình)', () => {
    const tatCa = NGHE_NHAM_TEN.flatMap((t) => [...t.dongAm, ...(t.hep ?? [])]);
    for (const x of ['di', 'qua', 'ngoi', 'noi', 'lai']) expect(tatCa).not.toContain(x);
  });

  it('tín hiệu gọi KHÔNG chứa "nay" — "năm nay …" là câu thường', () => {
    expect(TIN_HIEU_GOI).not.toContain('nay');
  });

  it('tên cũ (Javis/Gen/david) vẫn gọi được y như trước', () => {
    expect(phanTich('Javis, đi tới bàn điều khiển', BC).nguoiNhan).toEqual(['owner']);
    expect(phanTich('Gen, ngồi xuống', BC).nguoiNhan).toEqual(['gen']);
    expect(phanTich('david, đi tới cửa', BC).nguoiNhan).toEqual(['owner']);
  });
});

/* ============================ sổ từ nhà: Boss phải THẤY đúng tên ========= */

describe('G3 (#67) — so-tu viết đúng tên ở đầu câu (ô chat hiện "Nhi", không phải "nia")', () => {
  it('sửa tên khi theo sau là động từ lệnh hoặc "ơi"', async () => {
    const { suaTenDauCau } = await import('../../../bridge/so-tu');
    expect(suaTenDauCau('nia ngồi xuống đi')).toBe('Nhi ngồi xuống đi');
    expect(suaTenDauCau('ni qua ghế ngồi đi')).toBe('Nhi qua ghế ngồi đi');
    expect(suaTenDauCau('nhì lại đây')).toBe('Nhi lại đây');
    expect(suaTenDauCau('nhâm ra cửa')).toBe('Nam ra cửa');
    expect(suaTenDauCau('năm vui lên')).toBe('Nam vui lên');
    // dấu câu engine để lại phải giữ nguyên
    expect(suaTenDauCau('nia, ngồi xuống')).toBe('Nhi, ngồi xuống');
  });

  it('KHÔNG sửa câu từ thường — cùng kỷ luật với sổ từ nhà của C1', async () => {
    const { suaTenDauCau } = await import('../../../bridge/so-tu');
    for (const c of CAU_TU_THUONG) expect(suaTenDauCau(c)).toBe(c);
    for (const c of ['nam châm hút sắt', 'nhí nhảnh quá', 'nghĩ kỹ chưa', 'nam'])
      expect(suaTenDauCau(c)).toBe(c);
  });

  it('cả vòng POST /stt: chữ thô của engine → chữ Boss thấy', async () => {
    const { chuanHoaCauNoi } = await import('../../../bridge/so-tu');
    expect(chuanHoaCauNoi('nia ngồi xuống đi.').text).toBe('Nhi ngồi xuống đi');
    // và lớp hiểu lệnh nhận đúng người từ chính chữ đó
    expect(phanTich(chuanHoaCauNoi('nia ngồi xuống đi.').text, BC).nguoiNhan).toEqual(['gen']);
  });
});
