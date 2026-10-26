/**
 * j1-sat-tuong-toc-gon.test.ts — J1 (Issue #78).
 *
 * Boss 27/10: *"nội thất nên thiết kế sát tường để chừa không gian giữa để
 * hoạt động… chỉnh lại tóc của các nhân vật cho gọn gàng vì đang rối quá"*.
 *
 * File này giữ phần ĐO ĐƯỢC BẰNG SỐ THUẦN của J1 — bảng bố cục và bộ số tóc.
 * Phần phải chạy trên GPU thật (độ dài chuỗi tóc thật của từng model, lệch tóc
 * khi đứng/đi/emote, `min.y` mọi khối, ảnh 5 preset) nằm ở
 * `scripts/kiem-j1.mjs`, chạy trên Firefox thật — test đơn vị không thay được
 * nó, nhưng nó cũng không thay được test này: đây là cái CHẶN mọi lần dời đồ
 * về sau.
 */
import { describe, expect, it } from 'vitest';
import {
  DO_TUA_TUONG,
  KHOI_CANH,
  LOI_DI,
  NUA_RONG,
  NUA_SAU,
  TUA_TUONG,
  VUNG_HOAT_DONG,
  VUNG_TOI_THIEU,
  biChan,
  coVungTrong,
  hopChan,
  kiemCum,
  kiemHanhLang,
  kiemLoiDi,
  kiemLuoi,
  kiemTuaTuong,
  kiemVungTrong,
  tuongTua,
} from '../../stage/bo-cuc';
import { PLACES } from '../../stage/noi-dung';
import { SO_TOC_J1 } from '../../stage/nhanvat';

describe('J1 (#78) — nội thất sát tường, vùng giữa trống', () => {
  it('mọi món lớn TỰA TƯỜNG: mép sau cách tường ≤ 0,15 m', () => {
    expect(kiemTuaTuong()).toEqual([]);
    expect(TUA_TUONG).toBeLessThanOrEqual(0.15);
    // danh sách không được rỗng hay thiếu món đề bài nêu tên
    for (const id of ['sofa', 'ghe-don-1', 'ghe-don-2', 'ke-tivi', 'ke-module', 'ban-dieu-khien', 'ban-an', 'bep-nau']) {
      expect(DO_TUA_TUONG, `đề bài #78 nêu ${id}`).toContain(id);
    }
  });

  it('VÙNG GIỮA TRỐNG ≥ 6 × 4 m và không hộp chắn nào lấn vào', () => {
    expect(kiemVungTrong()).toEqual([]);
    const { rong, sau } = coVungTrong();
    expect(rong).toBeGreaterThanOrEqual(VUNG_TOI_THIEU.rong);
    expect(sau).toBeGreaterThanOrEqual(VUNG_TOI_THIEU.sau);
    expect(VUNG_TOI_THIEU.rong).toBeGreaterThanOrEqual(6);
    expect(VUNG_TOI_THIEU.sau).toBeGreaterThanOrEqual(4);
    // vùng nằm TRONG nhà, và là vùng GIỮA (chứa gốc toạ độ)
    expect(VUNG_HOAT_DONG.x0).toBeGreaterThan(-NUA_RONG);
    expect(VUNG_HOAT_DONG.x1).toBeLessThan(NUA_RONG);
    expect(VUNG_HOAT_DONG.z0).toBeLessThan(0);
    expect(VUNG_HOAT_DONG.z1).toBeGreaterThan(0);
  });

  it('đi lại được KHẮP vùng giữa: lưới 0,25 m không điểm nào bị chặn', () => {
    const chan: string[] = [];
    for (let x = VUNG_HOAT_DONG.x0; x <= VUNG_HOAT_DONG.x1 + 1e-9; x += 0.25) {
      for (let z = VUNG_HOAT_DONG.z0; z <= VUNG_HOAT_DONG.z1 + 1e-9; z += 0.25) {
        // `banKinh: 0` = chính điểm đó; bán kính người (0,3 m) được phép liếm
        // mép vùng, nên đo tâm là đúng nghĩa "ô sàn này có đồ hay không".
        const b = biChan(x, z, 0);
        if (b) chan.push(`${x.toFixed(2)},${z.toFixed(2)} → ${b}`);
      }
    }
    expect(chan).toEqual([]);
  });

  it('cụm · lối đi 2 m · hành lang · lưới 0,5 m đều còn xanh', () => {
    expect(kiemCum()).toEqual([]);
    expect(kiemLoiDi()).toEqual([]);
    expect(kiemHanhLang()).toEqual([]);
    expect(kiemLuoi()).toEqual([]);
    expect(LOI_DI).toBeGreaterThanOrEqual(2);
  });

  it('`lech` đẩy sát tường thì hộp chắn ĐI THEO (không còn hai thước lệch nhau)', () => {
    const hs = hopChan();
    for (const k of KHOI_CANH) {
      if (!k.chan || !k.lech) continue;
      const h = hs.find((x) => x.id === k.id)!;
      const tx = (h.x0 + h.x1) / 2;
      const tz = (h.z0 + h.z1) / 2;
      expect(tx, `${k.id} tâm X`).toBeCloseTo(k.tai[0] + k.lech[0], 9);
      expect(tz, `${k.id} tâm Z`).toBeCloseTo(k.tai[1] + k.lech[1], 9);
    }
  });

  it('mọi hộp chắn vẫn TRONG nhà sau khi nhích sát tường', () => {
    for (const h of hopChan()) {
      expect(h.x0, h.id).toBeGreaterThanOrEqual(-NUA_RONG - 1e-9);
      expect(h.x1, h.id).toBeLessThanOrEqual(NUA_RONG + 1e-9);
      expect(h.z0, h.id).toBeGreaterThanOrEqual(-NUA_SAU - 1e-9);
      expect(h.z1, h.id).toBeLessThanOrEqual(NUA_SAU + 1e-9);
    }
  });

  it('`tuongTua` trả đúng mặt tường, và món giữa sàn thì trả null', () => {
    const h = (id: string) => hopChan().find((x) => x.id === id)!;
    expect(tuongTua(h('sofa'))).toBe('tay');
    expect(tuongTua(h('ke-tivi'))).toBe('nam');
    expect(tuongTua(h('ban-dieu-khien'))).toBe('bac');
    expect(tuongTua(h('tu-lanh'))).toBe('dong');
    // bàn trà nằm trong lòng cụm phòng khách (đề bài #78 cho phép)
    expect(tuongTua(h('ban-tra'))).toBeNull();
  });

  it('chỗ đứng của MỌI place đi tới được, và `buc-trung-tam` ở trong vùng giữa', () => {
    for (const p of PLACES) {
      const d = p.standAt ?? p.pos;
      if (p.kind === 'seat') continue; // ghế thì đứng chồng là đúng
      expect(biChan(d[0], d[2]), `chỗ đứng của ${p.id}`).toBeNull();
    }
    const buc = PLACES.find((p) => p.id === 'buc-trung-tam')!;
    expect(buc.pos[0]).toBeGreaterThanOrEqual(VUNG_HOAT_DONG.x0);
    expect(buc.pos[0]).toBeLessThanOrEqual(VUNG_HOAT_DONG.x1);
    expect(buc.pos[2]).toBeGreaterThanOrEqual(VUNG_HOAT_DONG.z0);
    expect(buc.pos[2]).toBeLessThanOrEqual(VUNG_HOAT_DONG.z1);
  });

  it('place `sofa`/`ban-an` khớp đúng bảng bố cục sau khi dời', () => {
    for (const id of ['sofa', 'ban-an', 'ke-module', 'ban-dieu-khien']) {
      const p = PLACES.find((x) => x.id === id)!;
      const k = KHOI_CANH.find((x) => x.id === id)!;
      expect([p.pos[0], p.pos[2]], id).toEqual([k.tai[0], k.tai[1]]);
    }
  });
});

describe('J1 (#78) — bộ số tóc gọn', () => {
  it('trần độ dài chuỗi tóc ≤ 0,45 m (đề bài: ngang lưng trên)', () => {
    expect(SO_TOC_J1.tranDai).toBeLessThanOrEqual(0.45);
    expect(SO_TOC_J1.tranDai).toBeGreaterThan(0.2); // không rút thành tóc tém
  });

  it('sàn hãm (`dragForce`) ≥ 0,45 và vẫn là hãm, không phải khoá cứng', () => {
    expect(SO_TOC_J1.sanHam).toBeGreaterThanOrEqual(0.45);
    expect(SO_TOC_J1.sanHam).toBeLessThan(1);
  });

  it('sàn thu gọn đủ thấp để trần 0,45 m với tới được chuỗi tóc dài 1,09 m', () => {
    // chuỗi tóc đo thật của `avatar.vrm` sau chibi hoá: 1,09 m (ghi chú G1).
    expect(SO_TOC_J1.sanThuToc).toBeLessThanOrEqual(SO_TOC_J1.tranDai / 1.09 + 1e-9);
  });

  it('cứng thêm so với model gốc (stiffness tăng vừa, không khoá tóc)', () => {
    expect(SO_TOC_J1.cungThem).toBeGreaterThan(2.6);
    expect(SO_TOC_J1.cungThem).toBeLessThanOrEqual(4);
  });

  it('mốc lệch tóc của Boss không bị nới', () => {
    expect(SO_TOC_J1.mocLech).toEqual({ dung: 0.02, di: 0.05, emote: 0.07 });
  });
});
