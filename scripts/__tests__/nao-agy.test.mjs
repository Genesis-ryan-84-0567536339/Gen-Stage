/**
 * nao-agy.test.mjs — kiểm phần "đầu lạnh" của driver não: gộp câu, chống lặp,
 * hàng đợi một-lượt, nhắc gọn, và đường lỗi (Gen phải nói ra lỗi).
 *
 * Không có agy thật, không có bridge, không có trình duyệt: `nghi` và `san` là
 * hàng giả, nên bộ test này chạy trong vài trăm ms và không tốn quota.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  CAU_DA_NOI_LAI,
  DAU_BAN,
  dungDongNhac,
  gonDescribe,
  laCauCuaSep,
  lyDoNgan,
  MS_BACKOFF_MAX,
  MS_BACKOFF_MIN,
  noiSanKhau,
  phanXa,
  promptDau,
  rutGonSkill,
  taoGop,
  taoHangDoi,
  taoLuot,
  taoNaoAm,
  taoNaoTmux,
  tinhBackoff,
} from '../nao-agy.mjs';

const SKILL = `---
name: gen-stage-nao
description: dài dòng
---

# Em là Gen

Em là **Gen**.

## Luật cứng

1. Em chỉ điều khiển actor \`gen\`.
2. Trả lời bằng \`actor_say\`.

## Vòng lặp

\`\`\`
stage_bootstrap
lặp mãi: stage_events
\`\`\`

## Chọn lệnh thế nào

| Sếp nói | Em làm |
| --- | --- |
| Chào hỏi | actor_emote chao |
`;

/* ------------------------------------------------------- chống lặp (lọc) */

describe('laCauCuaSep — chống tự nghe lời mình', () => {
  it('nhận user.text của owner', () => {
    expect(laCauCuaSep('user.text', { actor: 'owner', text: 'Gen ơi' })).toBe(true);
    expect(laCauCuaSep('user.speech', { text: 'Gen ơi' })).toBe(true);
  });

  it('BỎ QUA câu do chính gen tạo (nếu không sẽ gọi não vô hạn)', () => {
    expect(laCauCuaSep('user.text', { actor: 'gen', text: 'em chào Sếp' })).toBe(false);
  });

  it('BỎ QUA câu đã có lớp hiểu lệnh xử lý (handled: true — PR #33)', () => {
    // "Javis, đi tới bàn điều khiển" → lớp lệnh đã cho đi rồi, não không phải nghĩ
    expect(
      laCauCuaSep('user.text', { actor: 'owner', text: 'Javis, đi tới bàn điều khiển', handled: true }),
    ).toBe(false);
    expect(
      laCauCuaSep('user.speech', { actor: 'owner', text: 'Javis, đi tới bàn điều khiển', handled: true }),
    ).toBe(false);
    // "Gen, hôm nay làm gì" → không lệnh nào khớp, đến lượt não
    expect(laCauCuaSep('user.text', { actor: 'owner', text: 'Gen, hôm nay làm gì' })).toBe(true);
    expect(laCauCuaSep('user.text', { actor: 'owner', text: 'Gen, hôm nay làm gì', handled: false })).toBe(true);
  });

  it('bỏ qua user.command (lớp lệnh tự lo, não không nghe)', () => {
    expect(laCauCuaSep('user.command', { actor: 'owner', text: 'đi tới bàn điều khiển' })).toBe(false);
  });

  it('bỏ qua sự kiện khác và câu rỗng', () => {
    expect(laCauCuaSep('actor.sayDone', { actor: 'gen', text: 'xong' })).toBe(false);
    expect(laCauCuaSep('actor.sayStart', { actor: 'gen', text: 'xong' })).toBe(false);
    expect(laCauCuaSep('user.text', { text: '   ' })).toBe(false);
    expect(laCauCuaSep('user.text', {})).toBe(false);
  });
});

/* ----------------------------------------------------------------- gộp câu */

describe('taoGop — gộp câu tới trong cửa sổ 800 ms', () => {
  it('hai câu sát nhau thành MỘT lượt', () => {
    vi.useFakeTimers();
    const ra = [];
    const gop = taoGop({ msGop: 800, xong: (c) => ra.push(c) });
    gop.nhan('Gen ơi');
    vi.advanceTimersByTime(300);
    gop.nhan('chào Sếp đi');
    expect(ra).toEqual([]); // chưa hết cửa sổ thì chưa gọi não
    vi.advanceTimersByTime(800);
    expect(ra).toEqual(['Gen ơi. chào Sếp đi']);
    vi.useRealTimers();
  });

  it('hai câu cách xa thành HAI lượt', () => {
    vi.useFakeTimers();
    const ra = [];
    const gop = taoGop({ msGop: 800, xong: (c) => ra.push(c) });
    gop.nhan('câu một');
    vi.advanceTimersByTime(900);
    gop.nhan('câu hai');
    vi.advanceTimersByTime(900);
    expect(ra).toEqual(['câu một', 'câu hai']);
    vi.useRealTimers();
  });

  it('dangCho() = 0 sau khi xả, để driver biết lúc nào bắn phản xạ', () => {
    vi.useFakeTimers();
    const gop = taoGop({ msGop: 800, xong: () => {} });
    expect(gop.dangCho()).toBe(0);
    gop.nhan('a');
    expect(gop.dangCho()).toBe(1);
    vi.advanceTimersByTime(900);
    expect(gop.dangCho()).toBe(0);
    vi.useRealTimers();
  });
});

/* --------------------------------------------------------------- hàng đợi */

describe('taoHangDoi — tối đa một lượt não cùng lúc', () => {
  it('lượt sau chờ lượt trước, đúng thứ tự', async () => {
    const dau = [];
    let dangChay = 0;
    let toiDa = 0;
    const hd = taoHangDoi({
      chay: async (c) => {
        dangChay++;
        toiDa = Math.max(toiDa, dangChay);
        await new Promise((r) => setTimeout(r, 20));
        dau.push(c);
        dangChay--;
      },
    });
    hd.them('một');
    hd.them('hai');
    hd.them('ba');
    expect(hd.doDai()).toBeGreaterThan(0);
    await hd.choHet();
    expect(dau).toEqual(['một', 'hai', 'ba']);
    expect(toiDa).toBe(1);
  });

  it('một lượt nổ lỗi không làm chết hàng đợi', async () => {
    const dau = [];
    const hd = taoHangDoi({
      chay: async (c) => {
        if (c === 'xấu') throw new Error('não sặc');
        dau.push(c);
      },
      ghi: () => {},
    });
    hd.them('xấu');
    hd.them('tốt');
    await hd.choHet();
    expect(dau).toEqual(['tốt']);
  });
});

/* ------------------------------------------------------------------- nhắc */

describe('nhắc gọn cho não', () => {
  it('rutGonSkill bỏ frontmatter, bỏ mục Vòng lặp, ≤40 dòng', () => {
    const r = rutGonSkill(SKILL);
    expect(r).not.toMatch(/description:/);
    expect(r).not.toMatch(/Vòng lặp/);
    expect(r).toMatch(/Luật cứng/);
    expect(r.split('\n').length).toBeLessThanOrEqual(40);
  });

  it('promptDau dặn nói TRƯỚC, không gọi stage_events, và dùng đúng tên server MCP', () => {
    const p = promptDau({ skill: SKILL, tenMcp: 'gen-stage-thu' });
    expect(p).toMatch(/gen-stage-thu:actor_say TRƯỚC TIÊN/);
    expect(p).toMatch(/ĐỪNG gọi[\s\S]*stage_events/);
  });

  it('gonDescribe chỉ giữ gen + owner và 5 sự kiện cuối', () => {
    const g = gonDescribe(
      {
        actors: [
          { id: 'owner', at: 'cua', pos: [1.23456, 0, 2.5], busy: false, controlledBy: 'owner' },
          { id: 'gen', at: 'ban-2', pos: [0, 0, 0], busy: true, holding: 'so-tay' },
          { id: 'lan', at: 'ban-1', pos: [9, 9, 9] },
        ],
        screens: [{ id: 'main' }],
        modules: [{ id: 'connector-baserow' }],
        places: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}` })),
      },
      { suKien: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
    );
    expect(g.actors.map((a) => a.id)).toEqual(['owner', 'gen']);
    expect(g.actors[0].pos).toEqual([1.23, 0, 2.5]);
    expect(g.screens).toEqual(['main']);
    expect(g.suKien).toEqual(['c', 'd', 'e', 'f', 'g']);
    expect(g.places).toBeUndefined(); // bỏ hẳn bảng khoảng cách dài
  });

  it('dungDongNhac luôn ra MỘT dòng (send-keys gặp \\n là Enter giữa câu)', () => {
    const d = dungDongNhac({
      cau: 'dựng\nconnector\tBaserow',
      describe: { actors: [{ id: 'gen' }] },
    });
    expect(d.includes('\n')).toBe(false);
    expect(d).toMatch(/^SẾP NÓI «dựng connector Baserow» \| SÂN KHẤU \{/);
  });
});

/* --------------------------------------------------------------- não tmux */

describe('taoNaoTmux + taoNaoAm — bơm một dòng vào agy đang ấm', () => {
  function tmuxGia(khung) {
    const lenh = [];
    return {
      lenh,
      tmux: (...a) => {
        lenh.push(a);
        if (a[0] === 'capture-pane') return khung();
        if (a[0] === 'has-session') return '';
        return '';
      },
    };
  }

  it('ban() đọc đúng dấu "esc to cancel"', () => {
    let k = `>\n${DAU_BAN}`;
    const { tmux } = tmuxGia(() => k);
    const nao = taoNaoTmux({ prompt: 'x', tmux, ghi: () => {} });
    expect(nao.ban()).toBe(true);
    k = '>\n? for shortcuts';
    expect(nao.ban()).toBe(false);
  });

  it('gui() dùng send-keys -l rồi Enter (không để tmux dịch phím)', () => {
    const { tmux, lenh } = tmuxGia(() => '? for shortcuts');
    const nao = taoNaoTmux({ ten: 's', prompt: 'x', tmux, ghi: () => {} });
    nao.gui('SẾP NÓI «chào»');
    expect(lenh).toEqual([
      ['send-keys', '-t', 's', '-l', 'SẾP NÓI «chào»'],
      ['send-keys', '-t', 's', 'Enter'],
    ]);
  });

  it('một lượt ấm: rảnh → bơm dòng → bận → rảnh lại là xong', async () => {
    // rảnh (chờ trước khi bơm) → bận 3 nhịp (đang nghĩ) → rảnh (đã trả lời)
    let dem = 0;
    const ban = `x\n${DAU_BAN}`;
    const ranh = 'x\n? for shortcuts';
    const { tmux, lenh } = tmuxGia(() => {
      dem++;
      return dem === 1 || dem > 4 ? ranh : ban;
    });
    const nao = taoNaoTmux({ ten: 's', prompt: 'x', tmux, ghi: () => {} });
    const kq = await taoNaoAm(nao, { hanMs: 3000, msVaoBan: 800 })('SẾP NÓI «chào»');
    expect(kq.ok).toBe(true);
    expect(lenh.some((a) => a[3] === '-l' && a[4] === 'SẾP NÓI «chào»')).toBe(true);
  });

  it('não nghĩ mãi không xong thì hết hạn, và Gen nói được lý do', async () => {
    const banMai = tmuxGia(() => `x\n${DAU_BAN}`);
    const nao2 = taoNaoTmux({ prompt: 'x', tmux: banMai.tmux, ghi: () => {} });
    const kq2 = await taoNaoAm(nao2, { hanMs: 300, msVaoBan: 100, msChoTruoc: 100 })('x');
    expect(kq2.ok).toBe(false);
    expect(lyDoNgan(kq2.loi)).toBe('nghĩ quá lâu');
  });
});

/* ------------------------------------------------------- một lượt trọn vẹn */

function sanGia() {
  const goi = [];
  let noi = null;
  return {
    goi,
    khiGenNoi(f) {
      noi = f;
      return () => (noi = null);
    },
    genNoi: () => noi?.(),
    suKienCuoi: () => ['user.text'],
    goiSan: null,
    api: {
      goi: async (cmd, args) => {
        goi.push([cmd, args]);
        if (cmd === 'stage.describe') return { ok: true, result: { actors: [{ id: 'gen' }] } };
        return { ok: true, result: {} };
      },
      khiGenNoi(f) {
        noi = f;
        return () => (noi = null);
      },
      suKienCuoi: () => ['user.text'],
    },
  };
}

describe('taoLuot — phản xạ, đo giờ, và đường lỗi', () => {
  it('phanXa bắn turnTo + emote suy-nghi ngay, không chờ não', () => {
    const goi = [];
    phanXa({ goi: (c, a) => goi.push([c, a]) });
    expect(goi.map((x) => x[0])).toEqual(['actor.turnTo', 'actor.emote']);
    expect(goi[0][1]).toMatchObject({ actor: 'gen', target: 'owner', interrupt: true });
    expect(goi[1][1]).toMatchObject({ emote: 'suy-nghi' });
  });

  it('não lỗi → Gen NÓI RA lỗi bằng giọng, không im lặng', async () => {
    const s = sanGia();
    const luot = taoLuot({
      san: s.api,
      skill: SKILL,
      nghi: async () => ({ ok: false, loi: 'quota exhausted', msGiay: 10 }),
      ghi: () => {},
    });
    const kq = await luot('chào em');
    expect(kq.ok).toBe(false);
    const say = s.goi.find(([c]) => c === 'actor.say');
    expect(say[1].text).toBe('Em bị lỗi não: hết lượt gọi model');
    expect(say[1].interrupt).toBe(true);
  });

  it('não xong mà không mở miệng → driver nói đỡ một câu', async () => {
    const s = sanGia();
    const luot = taoLuot({
      san: s.api,
      skill: SKILL,
      nghi: async () => ({ ok: true, msGiay: 50 }),
      ghi: () => {},
    });
    const kq = await luot('chào em');
    expect(kq.ok).toBe(true);
    expect(kq.daNoi).toBe(false);
    expect(s.goi.some(([c, a]) => c === 'actor.say' && /chưa diễn được/.test(a.text))).toBe(true);
  });

  it('thấy actor.sayStart của gen thì KHÔNG nói đỡ và KHÔNG xin chờ', async () => {
    const s = sanGia();
    const luot = taoLuot({
      san: s.api,
      skill: SKILL,
      nghi: async () => {
        s.genNoi();
        return { ok: true, msGiay: 50 };
      },
      msXinCho: 10,
      ghi: () => {},
    });
    const kq = await luot('chào em');
    expect(kq.daNoi).toBe(true);
    expect(s.goi.filter(([c]) => c === 'actor.say')).toHaveLength(0);
  });

  it('quá msXinCho mà chưa nói → driver tự xin Sếp chờ', async () => {
    const s = sanGia();
    const luot = taoLuot({
      san: s.api,
      skill: SKILL,
      nghi: () => new Promise((r) => setTimeout(() => r({ ok: true, msGiay: 80 }), 80)),
      msXinCho: 20,
      ghi: () => {},
    });
    await luot('chào em');
    expect(s.goi.some(([c, a]) => c === 'actor.say' && /chờ chút/.test(a.text))).toBe(true);
  });
});

/* ----------------------------------------------------------------- lý do */

describe('lyDoNgan — lỗi dài thành một câu Gen nói được', () => {
  it('nhận ra các loại lỗi hay gặp', () => {
    expect(lyDoNgan('Error: 429 rate limit')).toBe('hết lượt gọi model');
    expect(lyDoNgan('agy quá 120000 ms')).toBe('nghĩ quá lâu');
    expect(lyDoNgan('không chạy được "agy": ENOENT')).toBe('não agy chưa bật');
    expect(lyDoNgan('')).toBe('không rõ');
    expect(lyDoNgan('a\nb\ndòng cuối')).toBe('dòng cuối');
  });
});

/* ------------------------------------------------------- backoff nối lại */

describe('tinhBackoff — tăng dần 1 s → 10 s, không giới hạn số lần', () => {
  it('nhân đôi mỗi lần thử rồi kẹp ở max', () => {
    expect(tinhBackoff(1)).toBe(1000);
    expect(tinhBackoff(2)).toBe(2000);
    expect(tinhBackoff(3)).toBe(4000);
    expect(tinhBackoff(4)).toBe(8000);
    expect(tinhBackoff(5)).toBe(MS_BACKOFF_MAX); // 16000 → kẹp 10000
    expect(tinhBackoff(9)).toBe(MS_BACKOFF_MAX); // vẫn kẹp, không bỏ cuộc
  });

  it('tôn trọng min/max tuỳ biến', () => {
    expect(tinhBackoff(1, { min: 500, max: 4000 })).toBe(500);
    expect(tinhBackoff(10, { min: 500, max: 4000 })).toBe(4000);
  });
});

/* --------------------------------------------------- heartbeat + nối lại */

/** WebSocket giả tối thiểu, giống API của `ws`: on/send/close/terminate. */
class WsGia {
  static dsTao = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.daGui = [];
    this._cb = {};
    WsGia.dsTao.push(this);
  }
  on(ev, f) {
    (this._cb[ev] ??= []).push(f);
    return this;
  }
  send(d) {
    if (this.readyState !== 1) throw new Error('send trên socket đã đóng');
    this.daGui.push(JSON.parse(d));
  }
  _bam(ev, ...a) {
    for (const f of this._cb[ev] ?? []) f(...a);
  }
  /** Bên "bridge giả" chủ động mở xong. */
  moXong() {
    this.readyState = 1;
    this._bam('open');
  }
  /** Bridge trả pong cho ping gần nhất đã gửi. */
  traPong() {
    const cuoi = this.daGui.filter((g) => typeof g.ping !== 'undefined').pop();
    this._bam('message', JSON.stringify({ pong: cuoi?.ping ?? true }));
  }
  terminate() {
    this.readyState = 3;
    this._bam('close', 1006, Buffer.from('terminate'));
  }
  close(ma = 1000, lyDo = '') {
    this.readyState = 3;
    this._bam('close', ma, Buffer.from(lyDo));
  }
}

function hangDoiWs() {
  WsGia.dsTao = [];
  return WsGia;
}

describe('noiSanKhau — heartbeat 2 chiều + backoff + báo nối lại 1 lần', () => {
  it('gửi {ping} mỗi msNhipTim, và pong giữ kết nối sống (không bị coi là chết)', async () => {
    vi.useFakeTimers();
    const WebSocket = hangDoiWs();
    const ghi = vi.fn();
    const p = noiSanKhau({ WebSocket, cong: 8821, ghi, msNhipTim: 1000, msQuaHanTim: 3500 });
    await vi.advanceTimersByTimeAsync(0);
    const w = WebSocket.dsTao[0];
    expect(w.url).toMatch(/\?role=nao$/); // Refs #37: driver phải xưng não để brainConnected đúng
    w.moXong();

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      w.traPong(); // bridge trả lời đúng hạn → không bao giờ bị terminate
    }
    expect(w.readyState).toBe(1);
    expect(w.daGui.filter((g) => typeof g.ping !== 'undefined').length).toBeGreaterThanOrEqual(5);
    expect(WsGia.dsTao.length).toBe(1); // chưa rớt lần nào thì chưa nối lại lần nào

    const san = await p;
    san.dong();
    vi.useRealTimers();
  });

  it('không thấy pong quá msQuaHanTim → tự terminate() rồi NỐI LẠI, có log lý do', async () => {
    vi.useFakeTimers();
    const WebSocket = hangDoiWs();
    const ghi = vi.fn();
    const p = noiSanKhau({ WebSocket, cong: 8822, ghi, msNhipTim: 1000, msQuaHanTim: 2500 });
    await vi.advanceTimersByTimeAsync(0);
    WebSocket.dsTao[0].moXong();
    // im lặng không trả pong nào — quá 2500 ms là driver tự ngắt
    await vi.advanceTimersByTimeAsync(3000);
    expect(WebSocket.dsTao[0].readyState).toBe(3);
    expect(ghi).toHaveBeenCalledWith(expect.stringMatching(/KHÔNG thấy pong/));
    expect(ghi).toHaveBeenCalledWith(expect.stringMatching(/MẤT KẾT NỐI bridge.*nối lại lần 1/));

    // backoff lần 1 = 1000 ms: chưa tới thì chưa có socket thứ hai
    await vi.advanceTimersByTimeAsync(900);
    expect(WebSocket.dsTao.length).toBe(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(WebSocket.dsTao.length).toBe(2);

    const san = await p;
    san.dong();
    vi.useRealTimers();
  });

  it('rớt liên tiếp (chưa kịp mở) thì backoff tăng dần 1 s, 2 s, 4 s — không cố định', async () => {
    vi.useFakeTimers();
    const WebSocket = hangDoiWs();
    const p = noiSanKhau({ WebSocket, cong: 8823, ghi: () => {}, msNhipTim: 50_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(WebSocket.dsTao.length).toBe(1);

    WebSocket.dsTao[0].close(1006, 'rụng'); // rớt ngay khi chưa kịp mở
    await vi.advanceTimersByTimeAsync(999);
    expect(WebSocket.dsTao.length).toBe(1); // backoff lần 1 = 1000 ms, chưa tới
    await vi.advanceTimersByTimeAsync(2);
    expect(WebSocket.dsTao.length).toBe(2);

    WebSocket.dsTao[1].close(1006, 'rụng nữa');
    await vi.advanceTimersByTimeAsync(1999);
    expect(WebSocket.dsTao.length).toBe(2); // backoff lần 2 = 2000 ms
    await vi.advanceTimersByTimeAsync(2);
    expect(WebSocket.dsTao.length).toBe(3);

    const san = await p;
    san.dong();
    vi.useRealTimers();
  });

  it('phục hồi sau khi mất kết nối → Gen báo đúng MỘT lần, không lặp lại các lần sau', async () => {
    vi.useFakeTimers();
    const WebSocket = hangDoiWs();
    const p = noiSanKhau({ WebSocket, cong: 8824, ghi: () => {}, msNhipTim: 50_000 });
    await vi.advanceTimersByTimeAsync(0);
    WebSocket.dsTao[0].moXong();

    WebSocket.dsTao[0].close(1006, 'rớt'); // mất lần 1
    await vi.advanceTimersByTimeAsync(1100); // qua backoff 1000 ms
    expect(WebSocket.dsTao.length).toBe(2);
    WebSocket.dsTao[1].moXong(); // nối lại xong

    const baoSay = (w) => w.daGui.filter((g) => g.cmd === 'actor.say' && g.args?.text === CAU_DA_NOI_LAI);
    expect(baoSay(WebSocket.dsTao[1])).toHaveLength(1); // đúng một câu báo

    // mở rồi đóng lại lần nữa: nối thành công đã reset bộ đếm backoff, nên
    // lần mất kế tiếp lại tính từ "lần 1" (1000 ms), không cộng dồn vô hạn.
    WebSocket.dsTao[1].close(1006, 'rớt lần 2');
    await vi.advanceTimersByTimeAsync(1100); // backoff lần 1 = 1000 ms (đã reset sau khi nối lại)
    expect(WebSocket.dsTao.length).toBe(3);
    WebSocket.dsTao[2].moXong();
    expect(baoSay(WebSocket.dsTao[2])).toHaveLength(1); // mất lần 2 → lại báo đúng 1 lần, không dồn

    const san = await p;
    san.dong();
    vi.useRealTimers();
  });
});
