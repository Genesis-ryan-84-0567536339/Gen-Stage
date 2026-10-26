/**
 * b2-tieng-viet.test.ts — B2 (#20): giọng tiếng Việt qua bridge.
 *
 * Kiểm bốn chỗ dễ sai nhất, không cần mạng và không cần trình duyệt:
 *  - khoá cache (bridge và trình duyệt phải phân biệt đúng giọng/tốc độ/câu);
 *  - envelope RMS (nguồn của nhép miệng — phải có mẫu > 0 và chuẩn hoá về 1);
 *  - hàng đợi câu theo actor (hai câu không chồng tiếng);
 *  - fallback khi bridge tắt (không ném lỗi, hạ cờ chặn Web Speech, nhắc 1 lần).
 */
import { describe, expect, it, vi } from 'vitest';
import { bamCache, tenGiong } from '../../../bridge/tts';
import {
  LopTieng,
  doEnvelope,
  giongTheoActor,
  khoaCau,
} from '../../audio/tts-client';
import {
  dangChanWebSpeech,
  datChanWebSpeech,
  datDoThoiLuongThat,
  ghiMiengNhep,
  thoiLuongThat,
} from '../../audio/so-tieng';

/* ------------------------------------------------------------ khoá cache */

describe('bamCache (bridge) — khoá cache đĩa', () => {
  it('cùng câu + cùng giọng = cùng khoá', () => {
    expect(bamCache('Xin chào Sếp', { voice: 'nu' })).toBe(
      bamCache('Xin chào Sếp', { voice: 'nu' }),
    );
  });

  it('đổi giọng, tốc độ, cao độ hay một dấu trong câu là đổi khoá', () => {
    const goc = bamCache('Xin chào Sếp', { voice: 'nu' });
    expect(bamCache('Xin chào Sếp', { voice: 'nam' })).not.toBe(goc);
    expect(bamCache('Xin chào Sếp', { voice: 'nu', rate: 10 })).not.toBe(goc);
    expect(bamCache('Xin chào Sếp', { voice: 'nu', pitch: 5 })).not.toBe(goc);
    // "Sép" vs "Sếp": chỉ khác một dấu — không được phát lẫn file của nhau
    expect(bamCache('Xin chào Sép', { voice: 'nu' })).not.toBe(goc);
  });

  it('"nu"/"nam" là bí danh của tên giọng đầy đủ nên ra cùng khoá', () => {
    expect(bamCache('Chào', { voice: 'nu' })).toBe(
      bamCache('Chào', { voice: 'vi-VN-HoaiMyNeural' }),
    );
    expect(tenGiong('nam')).toBe('vi-VN-NamMinhNeural');
    expect(tenGiong(undefined)).toBe('vi-VN-HoaiMyNeural');
  });

  it('khoá là sha1 hex 40 ký tự (tên file hợp lệ mọi hệ tệp)', () => {
    expect(bamCache('Câu tiếng Việt có dấu')).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('giọng mặc định theo actor', () => {
  it('owner → nam, còn lại → nữ, voice truyền tay thắng tất', () => {
    expect(giongTheoActor('owner')).toBe('nam');
    expect(giongTheoActor('OWNER')).toBe('nam');
    expect(giongTheoActor('gen')).toBe('nu');
    expect(giongTheoActor('lan')).toBe('nu');
    expect(giongTheoActor('owner', 'nu')).toBe('nu');
    expect(giongTheoActor('gen', 'vi-VN-NamMinhNeural')).toBe('vi-VN-NamMinhNeural');
  });

  it('khoá câu phía trình duyệt phân biệt cảm xúc (vì cảm xúc đổi tốc độ)', () => {
    expect(khoaCau('Xong rồi', { voice: 'nu', emotion: 'vui' })).not.toBe(
      khoaCau('Xong rồi', { voice: 'nu', emotion: 'buon' }),
    );
  });
});

/* -------------------------------------------------------------- envelope */

describe('doEnvelope — nguồn của nhép miệng', () => {
  it('một giây sóng sin 24 kHz → 20 mẫu, tất cả > 0, đỉnh = 1', () => {
    const sr = 24000;
    const mau = new Float32Array(sr);
    for (let i = 0; i < sr; i++) mau[i] = Math.sin((i / sr) * 220 * 2 * Math.PI) * 0.3;
    const env = doEnvelope(mau, sr, 50);
    expect(env.length).toBe(20);
    expect([...env].filter((x) => x > 0).length).toBe(20);
    expect(Math.max(...env)).toBeCloseTo(1, 5);
  });

  it('đoạn im thì mẫu = 0, đoạn có tiếng thì mẫu > 0', () => {
    const sr = 24000;
    const mau = new Float32Array(sr); // nửa đầu im
    for (let i = sr / 2; i < sr; i++) mau[i] = 0.5;
    const env = doEnvelope(mau, sr, 50);
    expect(env[0]).toBe(0);
    expect(env[19]).toBeGreaterThan(0);
  });

  it('toàn im lặng không chia cho 0', () => {
    const env = doEnvelope(new Float32Array(2400), 24000, 50);
    expect([...env].every((x) => x === 0)).toBe(true);
  });
});

/* ----------------------------------------------------------- sổ nối tầng */

describe('so-tieng — sổ nối sân khấu ↔ lớp tiếng', () => {
  it('thời lượng thật ghi đè ước lượng, và trả null khi tháo', () => {
    datDoThoiLuongThat((chu) => (chu === 'Xin chào' ? 1234 : null));
    expect(thoiLuongThat('Xin chào')).toBe(1234);
    expect(thoiLuongThat('Câu khác')).toBeNull();
    datDoThoiLuongThat(null);
    expect(thoiLuongThat('Xin chào')).toBeNull();
  });

  it('hàm tra ném lỗi cũng không làm hỏng sân khấu', () => {
    datDoThoiLuongThat(() => {
      throw new Error('hỏng');
    });
    expect(thoiLuongThat('gì cũng được')).toBeNull();
    datDoThoiLuongThat(null);
  });

  it('cờ chặn Web Speech bật/tắt được', () => {
    datChanWebSpeech(true);
    expect(dangChanWebSpeech()).toBe(true);
    datChanWebSpeech(false);
    expect(dangChanWebSpeech()).toBe(false);
  });
});

/* ------------------------------------------------- lớp tiếng (mock fetch) */

/** AudioContext giả: giải mã "mp3" = sóng vuông dài theo số byte. */
function ctxGia(giayMoiKb = 0.1) {
  const daPhat: string[] = [];
  const ctx = {
    state: 'running' as AudioContextState,
    destination: {} as AudioDestinationNode,
    resume: async () => undefined,
    decodeAudioData: async (b: ArrayBuffer) => {
      const sr = 24000;
      const giay = Math.max(0.2, (b.byteLength / 1024) * giayMoiKb);
      const n = Math.round(sr * giay);
      const data = new Float32Array(n);
      for (let i = 0; i < n; i++) data[i] = i % 2 ? 0.4 : -0.4;
      return {
        duration: giay,
        sampleRate: sr,
        numberOfChannels: 1,
        getChannelData: () => data,
      } as unknown as AudioBuffer;
    },
    createBufferSource: () => ({
      buffer: null,
      connect: () => undefined,
      start: () => daPhat.push('start'),
      stop: () => daPhat.push('stop'),
    }),
  };
  return { ctx: ctx as unknown as AudioContext, daPhat };
}

function fetchGia(byte = 20304) {
  return vi.fn(async () =>
    new Response(new Uint8Array(byte), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }),
  ) as unknown as typeof fetch;
}

function miengGia() {
  const mau: number[] = [];
  return { mau, mieng: { nhepMiengTheoBienDo: (r: number) => mau.push(r) } };
}

describe('LopTieng — tải, phát, nhép miệng', () => {
  it('chuanBi trả durationMs THẬT từ audio và chặn Web Speech', async () => {
    const { ctx } = ctxGia();
    const f = fetchGia(10240); // 10 KB → 1,0 s
    const t = new LopTieng({ url: 'http://127.0.0.1:8788', fetchFn: f, taoCtx: () => ctx });

    const cau = await t.chuanBi('gen', 'Xin chào Sếp, em là Gen.', { voice: 'nu' });
    expect(cau).not.toBeNull();
    expect(cau!.durationMs).toBe(1000);
    expect(dangChanWebSpeech()).toBe(true);
    // thời lượng đã báo sang sân khấu → uocThoiLuongNoi dùng số này
    expect(thoiLuongThat('Xin chào Sếp, em là Gen.')).toBe(1000);
    t.huyHet();
  });

  it('gọi bridge đúng URL, có voice/rate/pitch; câu cũ không tải lại', async () => {
    const { ctx } = ctxGia();
    const f = fetchGia();
    const t = new LopTieng({ url: 'http://127.0.0.1:8788/', fetchFn: f, taoCtx: () => ctx });

    await t.chuanBi('owner', 'Chào Gen.', {});
    const url = String((f as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0]);
    expect(url.startsWith('http://127.0.0.1:8788/tts?')).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get('text')).toBe('Chào Gen.');
    expect(q.get('voice')).toBe('nam'); // owner → nam
    expect(q.get('rate')).toBe('0');
    expect(q.get('pitch')).toBe('0');

    await t.chuanBi('owner', 'Chào Gen.', {});
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
    t.huyHet();
  });

  it('cảm xúc "vui" đổi tốc độ và cao độ gửi lên bridge', async () => {
    const { ctx } = ctxGia();
    const f = fetchGia();
    const t = new LopTieng({ fetchFn: f, taoCtx: () => ctx });
    await t.chuanBi('gen', 'Xong rồi Sếp!', { emotion: 'vui' });
    const q = new URL(
      String((f as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0]),
    ).searchParams;
    expect(Number(q.get('rate'))).toBeGreaterThan(0);
    expect(Number(q.get('pitch'))).toBe(0); // Boss 26/10: không đổi cao độ, giọng méo
    t.huyHet();
  });

  it('phát xong gọi nhepMiengTheoBienDo nhiều lần, có mẫu > 0, kết bằng 0', async () => {
    const { ctx, daPhat } = ctxGia();
    const { mau, mieng } = miengGia();
    ghiMiengNhep('gen', mieng);
    const t = new LopTieng({ fetchFn: fetchGia(3072), taoCtx: () => ctx }); // ~0,3 s

    const cau = await t.chuanBi('gen', 'Câu ngắn.', {});
    cau!.phat();
    await new Promise((r) => setTimeout(r, 600));

    expect(daPhat).toContain('start');
    expect(mau.length).toBeGreaterThan(3);
    expect(mau.filter((x) => x > 0).length).toBeGreaterThan(0);
    expect(mau.at(-1)).toBe(0); // miệng đóng lại khi hết câu
    t.huyHet();
  });

  it('hàng đợi theo actor: câu hai chỉ phát sau khi câu một xong', async () => {
    const { ctx, daPhat } = ctxGia();
    const { mieng } = miengGia();
    ghiMiengNhep('gen', mieng);
    const t = new LopTieng({ fetchFn: fetchGia(2048), taoCtx: () => ctx }); // ~0,2 s

    const a = await t.chuanBi('gen', 'Câu một.', {});
    const b = await t.chuanBi('gen', 'Câu hai.', {});
    a!.phat();
    b!.phat();
    // ngay sau khi xếp hàng: chỉ một câu được start
    await new Promise((r) => setTimeout(r, 60));
    expect(daPhat.filter((x) => x === 'start').length).toBe(1);

    await new Promise((r) => setTimeout(r, 600));
    expect(daPhat.filter((x) => x === 'start').length).toBe(2);
    t.huyHet();
  });

  it('huy(actor) cắt tiếng ngay và đóng miệng', async () => {
    const { ctx, daPhat } = ctxGia();
    const { mau, mieng } = miengGia();
    ghiMiengNhep('gen', mieng);
    const t = new LopTieng({ fetchFn: fetchGia(20480), taoCtx: () => ctx }); // 2 s

    const cau = await t.chuanBi('gen', 'Câu dài hai giây.', {});
    cau!.phat();
    await new Promise((r) => setTimeout(r, 120));
    t.huy('gen');
    const soMauLucCat = mau.length;
    expect(daPhat).toContain('stop');
    expect(mau.at(-1)).toBe(0);

    await new Promise((r) => setTimeout(r, 200));
    expect(mau.length).toBe(soMauLucCat); // không nhép thêm sau khi cắt
  });

  /**
   * I1 vòng 2 (#74, review PR #75 lỗi chặn 1) — **MỘT GIỌNG CHO CẢ SÂN KHẤU.**
   *
   * `vaoHangDoi` nối theo **từng actor**, nên hai nhân vật khác nhau vẫn phát
   * cùng lúc được: móc `AudioBufferSourceNode` ở bộ bằng chứng đo **đỉnh 2
   * giọng** (Nam đọc câu của Boss, Nhi chêm vào giữa). Issue #74 ghi thẳng
   * *"không bao giờ nói chồng (một giọng)"* — tính chất của **sân khấu**, nên
   * chốt phải ở lớp tiếng, chỗ duy nhất mọi câu đi qua.
   */
  it('HAI ACTOR khác nhau: câu sau chờ câu trước, không bao giờ chồng giọng', async () => {
    const { ctx } = ctxGia();
    ghiMiengNhep('owner', miengGia().mieng);
    ghiMiengNhep('gen', miengGia().mieng);
    const t = new LopTieng({ fetchFn: fetchGia(10240), taoCtx: () => ctx }); // ~1 s/câu

    const cuaNam = await t.chuanBi('owner', 'Nam đọc câu của Boss.', {});
    const cuaNhi = await t.chuanBi('gen', 'Dạ, Sếp?', {});
    cuaNam!.phat();
    cuaNhi!.phat();

    // ngay sau khi gọi cả hai: CHỈ Nam có giọng
    await new Promise((r) => setTimeout(r, 150));
    expect(t.aiConGiong()).toEqual(['owner']);

    // Nhi chỉ mở miệng sau khi Nam dứt hẳn — đỉnh số giọng luôn là 1
    let dinh = 0;
    for (let i = 0; i < 24; i++) {
      dinh = Math.max(dinh, t.aiConGiong().length);
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(dinh).toBe(1);
  });

  it('choGiongRanh() chờ hết câu đang phát rồi mới trả về', async () => {
    const { ctx } = ctxGia();
    ghiMiengNhep('owner', miengGia().mieng);
    const t = new LopTieng({ fetchFn: fetchGia(10240), taoCtx: () => ctx });
    const cau = await t.chuanBi('owner', 'Nam đọc một giây.', {});
    cau!.phat();
    await new Promise((r) => setTimeout(r, 100));
    expect(t.aiConGiong()).toEqual(['owner']);
    await t.choGiongRanh();
    expect(t.aiConGiong()).toEqual([]);
  });

  it('phat() gọi hai lần cũng chỉ phát một lần', async () => {
    const { ctx, daPhat } = ctxGia();
    ghiMiengNhep('gen', miengGia().mieng);
    const t = new LopTieng({ fetchFn: fetchGia(2048), taoCtx: () => ctx });
    const cau = await t.chuanBi('gen', 'Một lần thôi.', {});
    cau!.phat();
    cau!.phat();
    await new Promise((r) => setTimeout(r, 400));
    expect(daPhat.filter((x) => x === 'start').length).toBe(1);
    t.huyHet();
  });
});

/* -------------------------------------------------------------- fallback */

describe('LopTieng — bridge tắt thì nhường chỗ, không ném lỗi', () => {
  it('fetch lỗi → null, hạ cờ chặn Web Speech, toast đúng một lần', async () => {
    const { ctx } = ctxGia();
    const toast = vi.fn();
    const f = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const t = new LopTieng({ fetchFn: f, taoCtx: () => ctx, toast });

    datChanWebSpeech(true); // giả như câu trước có giọng thật
    expect(await t.chuanBi('gen', 'Bridge đang tắt.', {})).toBeNull();
    expect(dangChanWebSpeech()).toBe(true); // Boss 26/10: có lớp tiếng thì không bao giờ Web Speech (chồng giọng)
    expect(t.coGiong()).toBe(false);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(String(toast.mock.calls[0]![0])).toContain('pnpm bridge');

    // câu sau: vẫn null, KHÔNG gọi lại bridge, KHÔNG nhắc lần hai
    expect(await t.chuanBi('gen', 'Câu nữa.', {})).toBeNull();
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('bridge trả HTTP lỗi hoặc 0 byte cũng là fallback', async () => {
    const { ctx } = ctxGia();
    const t502 = new LopTieng({
      fetchFn: (async () => new Response('{"ok":false}', { status: 502 })) as typeof fetch,
      taoCtx: () => ctx,
    });
    expect(await t502.chuanBi('gen', 'Lỗi 502.', {})).toBeNull();

    const tRong = new LopTieng({
      fetchFn: (async () => new Response(new Uint8Array(0), { status: 200 })) as typeof fetch,
      taoCtx: () => ctx,
    });
    expect(await tRong.chuanBi('gen', 'Rỗng.', {})).toBeNull();
  });

  it('không có Web Audio (máy/trình duyệt chặn) → null, không ném', async () => {
    const t = new LopTieng({ fetchFn: fetchGia(), taoCtx: () => null });
    expect(await t.chuanBi('gen', 'Không có Web Audio.', {})).toBeNull();
    expect(await t.batTieng()).toBe(false);
  });

  it('câu rỗng không gọi bridge', async () => {
    const { ctx } = ctxGia();
    const f = fetchGia();
    const t = new LopTieng({ fetchFn: f, taoCtx: () => ctx });
    expect(await t.chuanBi('gen', '   ', {})).toBeNull();
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
  });
});
