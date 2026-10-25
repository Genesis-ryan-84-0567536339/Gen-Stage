/**
 * c2-hieu-lenh.test.ts — BẰNG CHỨNG SỐ cho C2 (#32).
 *
 * 30 câu Sếp nói (bảng `BO_CAU`) + 5 câu lỗi STT giả (`BO_LOI_STT`) chạy qua
 * `phanTich` — hàm thuần, không cần sân khấu thật. Hai ngưỡng Issue #32 chốt:
 * **100 % đúng người nhận** và **≥ 95 % đúng lệnh**.
 *
 * Bảng câu ở đây cũng là bảng in ra `docs/c2/ket-qua.md` (script
 * `scripts/kiem-c2.mjs` đọc lại nhật ký test, không gõ tay số nào).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOI_CANH_TRONG,
  khopMauCau,
  phanTich,
  tachNguoiNhan,
  type BoiCanh,
} from '../hieu-lenh';
import { BANG_MAU_CAU, boDau, gan, khoangCach, tach } from '../ngu-phap';

/** Bối cảnh y như sân khấu lab thật lúc mở app (lấy từ `noi-dung.ts`/A3). */
const BC: BoiCanh = {
  ...BOI_CANH_TRONG,
  actors: [
    { id: 'owner', controlledBy: 'owner' },
    { id: 'gen', controlledBy: 'agent' },
  ],
  places: [
    { id: 'ban-dieu-khien', kind: 'desk' },
    { id: 'ban-1', kind: 'desk' },
    { id: 'ban-2', kind: 'desk' },
    { id: 'ghe-1', kind: 'seat' },
    { id: 'ghe-2', kind: 'seat' },
    { id: 'buc-trung-tam', kind: 'stage' },
    { id: 'cua', kind: 'door' },
    { id: 'ke-module', kind: 'shelf' },
  ],
  emotes: [
    'vui',
    'rat-vui',
    'buon',
    'ngac-nhien',
    'gian',
    'suy-nghi',
    'dong-y',
    'tu-choi',
    'chao',
    'ra-lenh',
    'thanh-cong',
    'that-bai',
    'boi-roi',
    'met',
    'cham-chu',
  ],
  screens: ['main', 'left', 'right'],
  props: ['connector-baserow'],
  gocMay: ['toan-canh', 'theo-owner', 'ban-dieu-khien', 'hop', 'truoc-mat'],
};

interface Cau {
  cau: string;
  /** Người nhận mong đợi, theo thứ tự. */
  ai: string[];
  /** Lệnh mong đợi (null = câu tự do, phải chuyển cho não). */
  cmd: string | null;
  /** Một vài tham số phải đúng. */
  args?: Record<string, unknown>;
}

/** 30 câu Sếp hay nói — bảng này là bằng chứng, không phải ví dụ. */
export const BO_CAU: Cau[] = [
  // --- gọi tên + di chuyển
  { cau: 'Javis, đi tới bàn điều khiển', ai: ['owner'], cmd: 'actor.moveTo', args: { to: 'ban-dieu-khien' } },
  { cau: 'Gen, đi tới kệ module', ai: ['gen'], cmd: 'actor.moveTo', args: { to: 'ke-module' } },
  { cau: 'Javis ơi, đi ra cửa giúp em nhé', ai: ['owner'], cmd: 'actor.moveTo', args: { to: 'cua' } },
  { cau: 'Gen qua bàn hai', ai: ['gen'], cmd: 'actor.moveTo', args: { to: 'ban-2' } },
  { cau: 'Gen, đi tới bàn một', ai: ['gen'], cmd: 'actor.moveTo', args: { to: 'ban-1' } },
  { cau: 'đi tới bục trung tâm', ai: ['gen'], cmd: 'actor.moveTo', args: { to: 'buc-trung-tam' } },
  { cau: 'Gen, lại đây', ai: ['gen'], cmd: 'actor.moveTo' },
  { cau: 'Javis quay lại', ai: ['owner'], cmd: 'actor.moveTo', args: { to: 'buc-trung-tam' } },
  // --- cơ thể
  { cau: 'Gen, ngồi xuống', ai: ['gen'], cmd: 'actor.sit' },
  { cau: 'Gen ngồi ghế hai', ai: ['gen'], cmd: 'actor.sit', args: { seat: 'ghe-2' } },
  { cau: 'Javis, đứng lên', ai: ['owner'], cmd: 'actor.stand' },
  { cau: 'Gen, dừng lại', ai: ['gen'], cmd: 'actor.stop' },
  { cau: 'Javis dừng', ai: ['owner'], cmd: 'actor.stop' },
  { cau: 'Gen, nhìn Javis', ai: ['gen'], cmd: 'actor.lookAt', args: { target: 'owner' } },
  { cau: 'Javis, nhìn vào bàn điều khiển', ai: ['owner'], cmd: 'actor.lookAt', args: { target: 'ban-dieu-khien' } },
  // --- cảm xúc
  { cau: 'Gen, vui lên', ai: ['gen'], cmd: 'actor.emote', args: { emote: 'vui' } },
  { cau: 'Javis, chào', ai: ['owner'], cmd: 'actor.emote', args: { emote: 'chao' } },
  { cau: 'Gen ngạc nhiên đi', ai: ['gen'], cmd: 'actor.emote', args: { emote: 'ngac-nhien' } },
  { cau: 'Gen, suy nghĩ đi', ai: ['gen'], cmd: 'actor.emote', args: { emote: 'suy-nghi' } },
  { cau: 'Javis, ăn mừng', ai: ['owner'], cmd: 'actor.emote', args: { emote: 'thanh-cong' } },
  { cau: 'Gen mệt rồi', ai: ['gen'], cmd: 'actor.emote', args: { emote: 'met' } },
  // --- cả nhóm
  { cau: 'mọi người chào', ai: ['owner', 'gen'], cmd: 'actor.emote', args: { emote: 'chao' } },
  { cau: 'cả hai vui lên', ai: ['owner', 'gen'], cmd: 'actor.emote', args: { emote: 'vui' } },
  { cau: 'tất cả đi tới bục trung tâm', ai: ['owner', 'gen'], cmd: 'actor.moveTo', args: { to: 'buc-trung-tam' } },
  // --- lab + sân khấu
  { cau: 'mở màn hình trái', ai: ['gen'], cmd: 'screen.show', args: { screen: 'left' } },
  { cau: 'tắt màn hình phải', ai: ['gen'], cmd: 'screen.clear', args: { screen: 'right' } },
  { cau: 'đổi góc máy', ai: ['gen'], cmd: 'camera.preset' },
  { cau: 'dựng lại sân khấu', ai: ['gen'], cmd: 'stage.reset' },
  // --- câu tự do: phải KHÔNG khớp, để chuyển cho não
  { cau: 'Gen, hôm nay làm gì', ai: ['gen'], cmd: null },
  { cau: 'Gen, dự án Gen-Harness tới đâu rồi em', ai: ['gen'], cmd: null },
];

/** 5 câu lỗi STT giả: mất dấu, sai một từ, số đếm bằng chữ. */
export const BO_LOI_STT: Cau[] = [
  { cau: 'javis di toi ban dieu khien', ai: ['owner'], cmd: 'actor.moveTo', args: { to: 'ban-dieu-khien' } },
  { cau: 'Ja-vít, đi tới bàn điều khiểm', ai: ['owner'], cmd: 'actor.moveTo', args: { to: 'ban-dieu-khien' } },
  { cau: 'Ghen, vui lên', ai: ['gen'], cmd: 'actor.emote', args: { emote: 'vui' } },
  { cau: 'Gen ngoi ghe hai', ai: ['gen'], cmd: 'actor.sit', args: { seat: 'ghe-2' } },
  { cau: 'moi nguoi chao', ai: ['owner', 'gen'], cmd: 'actor.emote', args: { emote: 'chao' } },
];

function chamDiem(bo: Cau[]) {
  const sai: string[] = [];
  let dungAi = 0;
  let dungLenh = 0;
  const chiTiet: Record<string, unknown>[] = [];
  for (const c of bo) {
    const kq = phanTich(c.cau, BC);
    const aiOk = JSON.stringify(kq.nguoiNhan) === JSON.stringify(c.ai);
    const cmdThay = kq.lenh[0]?.cmd ?? null;
    let lenhOk = cmdThay === c.cmd;
    if (lenhOk && c.args) {
      for (const [k, v] of Object.entries(c.args)) {
        if (kq.lenh[0]?.args[k] !== v) lenhOk = false;
      }
    }
    if (lenhOk && c.cmd && c.ai.length > 1) {
      lenhOk = kq.lenh.length === c.ai.length;
    }
    if (aiOk) dungAi++;
    if (lenhOk) dungLenh++;
    if (!aiOk || !lenhOk) {
      sai.push(
        `"${c.cau}" → ai=${JSON.stringify(kq.nguoiNhan)} cmd=${cmdThay} args=${JSON.stringify(kq.lenh[0]?.args ?? null)}`,
      );
    }
    chiTiet.push({
      cau: c.cau,
      aiMongDoi: c.ai,
      aiThay: kq.nguoiNhan,
      cmdMongDoi: c.cmd,
      cmdThay,
      args: kq.lenh[0]?.args ?? null,
      mau: kq.mau,
      nhacLai: kq.nhacLai,
      aiOk,
      lenhOk,
    });
  }
  return { so: bo.length, dungAi, dungLenh, sai, chiTiet };
}

/**
 * Bảng chấm điểm được GHI RA FILE để `scripts/kiem-c2.mjs` dựng
 * `docs/c2/ket-qua.md` — không ai gõ tay lại con số nào.
 */
function ghiBang(ten: string, d: ReturnType<typeof chamDiem>): void {
  try {
    mkdirSync('docs/c2', { recursive: true });
    writeFileSync(
      `docs/c2/bang-${ten}.json`,
      JSON.stringify(
        { so: d.so, dungAi: d.dungAi, dungLenh: d.dungLenh, sai: d.sai, cau: d.chiTiet },
        null,
        2,
      ) + '\n',
    );
  } catch {
    /* chạy trong môi trường chỉ đọc thì bỏ qua, test vẫn tính */
  }
}

describe('C2 — hiểu lệnh giọng', () => {
  it('30 câu: 100% đúng người nhận, ≥95% đúng lệnh', () => {
    const d = chamDiem(BO_CAU);
    ghiBang('30-cau', d);
    expect(d.so).toBe(30);
    expect(d.dungAi, `sai người nhận:\n${d.sai.join('\n')}`).toBe(30);
    expect(d.dungLenh / d.so, `sai lệnh:\n${d.sai.join('\n')}`).toBeGreaterThanOrEqual(0.95);
  });

  it('5 câu lỗi STT giả vẫn hiểu đúng', () => {
    const d = chamDiem(BO_LOI_STT);
    ghiBang('loi-stt', d);
    expect(d.dungAi, d.sai.join('\n')).toBe(5);
    expect(d.dungLenh, d.sai.join('\n')).toBe(5);
  });

  it('người nhận mặc định là Gen khi Sếp không gọi tên', () => {
    const kq = phanTich('ngồi xuống', BC);
    expect(kq.nguoiNhan).toEqual(['gen']);
    expect(kq.coGoiTen).toBe(false);
  });

  it('"mọi người" gồm cả Javis lẫn Gen, Javis trước', () => {
    const kq = phanTich('mọi người chào', BC);
    expect(kq.nguoiNhan).toEqual(['owner', 'gen']);
    expect(kq.moiNguoi).toBe(true);
    expect(kq.lenh).toHaveLength(2);
    expect(kq.lenh.map((l) => l.args.actor)).toEqual(['owner', 'gen']);
  });

  it('câu tự do không sinh lệnh nào (để não trả lời)', () => {
    const kq = phanTich('Gen, hôm nay mình làm gì tiếp', BC);
    expect(kq.mau).toBeNull();
    expect(kq.lenh).toEqual([]);
  });

  it('"dựng lại sân khấu" thắng "dừng lại" (mẫu cụ thể hơn)', () => {
    expect(phanTich('dựng lại sân khấu', BC).lenh[0].cmd).toBe('stage.reset');
    expect(phanTich('Gen, dừng lại', BC).lenh[0].cmd).toBe('actor.stop');
    expect(phanTich('Gen, đứng lên', BC).lenh[0].cmd).toBe('actor.stand');
  });

  it('nhắc lại lệnh bằng tiếng Việt có dấu, đọc được bằng giọng', () => {
    expect(phanTich('Javis, đi tới bàn điều khiển', BC).nhacLai).toBe('đi tới bàn điều khiển');
    expect(phanTich('Gen, vui lên', BC).nhacLai).toBe('vui lên');
  });

  it('nói lại nguyên văn giữ đủ dấu', () => {
    const kq = phanTich('Gen, nói "chào cả nhà nhé"', BC);
    expect(kq.lenh[0].cmd).toBe('actor.say');
    expect(kq.lenh[0].args.text).toBe('chào cả nhà nhé');
  });

  it('"nói với <ai>" sinh `to` để nhân vật nói hướng về người kia (C0)', () => {
    const kq = phanTich('Javis, nói với Gen "em lo phần giao diện nhé"', BC);
    expect(kq.nguoiNhan).toEqual(['owner']);
    expect(kq.lenh[0].cmd).toBe('actor.say');
    expect(kq.lenh[0].args.to).toBe('gen');
    expect(kq.lenh[0].args.text).toBe('em lo phần giao diện nhé');
    const kq2 = phanTich('Gen, nói với Javis là xong rồi', BC);
    expect(kq2.nguoiNhan).toEqual(['gen']);
    expect(kq2.lenh[0].args.to).toBe('owner');
  });

  it('dựng module lấy tên Sếp đọc làm nhãn + mã', () => {
    const kq = phanTich('Gen, dựng connector Baserow', BC);
    expect(kq.lenh[0].cmd).toBe('module.build');
    expect(kq.lenh[0].args.id).toBe('connector-baserow');
    expect(kq.lenh[0].args.label).toBe('connector Baserow');
  });

  it('bảng ngữ pháp là DỮ LIỆU: mọi mẫu câu đều có mô tả + ví dụ', () => {
    expect(BANG_MAU_CAU.length).toBeGreaterThan(10);
    for (const mc of BANG_MAU_CAU) {
      expect(mc.mau.length, mc.id).toBeGreaterThan(0);
      expect(mc.moTa.length, mc.id).toBeGreaterThan(3);
      expect(mc.viDu.length, mc.id).toBeGreaterThan(3);
      // mẫu câu phải viết KHÔNG DẤU, chữ thường
      for (const m of mc.mau) expect(boDau(m), `${mc.id}: "${m}"`).toBe(m);
    }
  });

  it('chịu lỗi STT: fuzzy ≤2 ký tự, từ ngắn không nhân nhượng', () => {
    expect(khoangCach('dieu khien', 'dieu khiem')).toBe(1);
    expect(gan('khiem', 'khien')).toBe(true);
    expect(gan('ban', 'bon')).toBe(false); // 3 ký tự: phải đúng y
    expect(gan('mot', '1')).toBe(true); // số đếm bằng chữ
  });

  it('tách người nhận cắt đúng tên khỏi câu lệnh', () => {
    const t = tachNguoiNhan(tach('Javis, đi tới bàn điều khiển'), BC);
    expect(t.nguoiNhan).toEqual(['owner']);
    expect(t.conLai.sach).toEqual(['di', 'toi', 'ban', 'dieu', 'khien']);
  });

  it('khớp mẫu bỏ qua được từ lạ giữa câu', () => {
    const k = khopMauCau('di toi <place>', tach('đi tới cái bàn điều khiển nhé'), BC);
    expect(k?.slot.place).toBe('ban-dieu-khien');
  });

  it('không có sân khấu (bối cảnh rỗng) thì không nổ', () => {
    const kq = phanTich('Javis, đi tới bàn điều khiển', BOI_CANH_TRONG);
    expect(kq.lenh).toEqual([]);
  });
});
