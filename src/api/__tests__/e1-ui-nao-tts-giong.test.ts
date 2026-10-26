/**
 * e1-ui-nao-tts-giong.test.ts — E1 (Issue #48).
 *
 * Năm lời hứa của đợt này, mỗi cái đã từng SAI trên bản chạy thật (kiểm độc
 * lập 26/10) nên mỗi cái phải có một test giữ:
 *
 * 1. **Nghe ra "Javis".** PhoWhisper không bao giờ nghe đúng tên này; nó ra
 *    `david` / `gia viết`. Hậu quả đo thật: *"Javis, chào"* → **Gen** chào.
 * 2. **Hai lớp khớp nhau.** `bridge/so-tu.ts` (sửa chữ) và
 *    `BI_DANH_NHAN_VAT.owner` (tách người nhận) phải biết cùng bộ đồng âm —
 *    lệch một cách nghe là câu lại chạy sang Gen.
 * 3. **`module.demo` diễn đủ 5 bước.** Não cũ bị ép "tối đa 2 lệnh" nên chuỗi
 *    dựng connector không bao giờ xong (`props: []`, `lines: 0`).
 * 4. **Nhắc đầu phiên không còn trần 2 lệnh, và không còn id `"main"`.**
 * 5. **`/tts` thử lại trước khi chịu lỗi.** 2/10 lần gọi liên tiếp trả 502.
 */
import { describe, expect, it } from 'vitest';
import { chuanHoaCauNoi, suaTheoSoTu } from '../../../bridge/so-tu';
import { BI_DANH_NHAN_VAT } from '../../stage/noi-dung';
import { phanTich } from '../../behavior/hieu-lenh';
import { Dispatcher } from '../dispatcher';
import { EventBus } from '../../events';
import { NhatKy } from '../../log';
import { taoRegistry } from '../commands/index';
import { SanKhauGia } from './san-khau-gia';
import { mauCode } from '../commands/demo';
import { CAU_DEM_SAN, CHO_THU_LAI_MS, goiEdgeThuLai } from '../../../bridge/tts';
import { MAC_DINH, batPhanXa } from '../../behavior/phan-xa';


/* ------------------------------------------------- 1 + 2. nghe ra "Javis" */

describe('E1 — giọng hiểu "Javis"', () => {
  /** Đúng những cách engine nghe thật, ghi trong báo cáo kiểm 26/10. */
  const CACH_NGHE = [
    'david',
    'davids',
    'gia viết',
    'gia vít',
    'gia việt',
    'đa vít',
    'javit',
    'jarvis',
  ];

  it('sổ từ sửa mọi cách nghe sai về "Javis"', () => {
    for (const x of CACH_NGHE) {
      expect(suaTheoSoTu(x), `"${x}" phải thành Javis`).toBe('Javis');
    }
  });

  it('câu lệnh thật: tên về đúng "Javis", phần còn lại không bị sửa', () => {
    // Dấu phẩy rơi theo đúng hành vi có sẵn của sổ từ (y như `Gen,` → `Gen`):
    // `dangNghe` bỏ mọi ký tự không phải chữ/số trước khi so, nên cụm được
    // thay bằng dạng chuẩn. `hieu-lenh.ts` tách người nhận không cần dấu phẩy
    // — test dưới chứng minh điều đó.
    expect(chuanHoaCauNoi('david, đi tới bàn điều khiển').text).toBe(
      'Javis đi tới bàn điều khiển',
    );
    expect(chuanHoaCauNoi('gia viết, dừng lại').text).toBe('Javis dừng lại');
  });

  it('bí danh nhân vật biết CÙNG bộ cách nghe (không lệch hai lớp)', () => {
    const owner = BI_DANH_NHAN_VAT.owner!.map((x) => x.toLowerCase());
    for (const x of CACH_NGHE) {
      expect(owner, `BI_DANH_NHAN_VAT.owner thiếu "${x}"`).toContain(x.toLowerCase());
    }
  });

  it('lớp hiểu lệnh tách đúng người nhận là Javis, KHÔNG phải Gen', () => {
    const bc = {
      actors: [
        { id: 'owner', controlledBy: 'owner' },
        { id: 'gen', controlledBy: 'agent' },
      ],
      places: [{ id: 'ban-dieu-khien', kind: 'desk' }],
      emotes: ['chao'],
      screens: ['may-tinh'],
      props: [],
      gocMay: [],
    };
    for (const ten of ['Javis', 'david', 'gia viết', 'đa vít']) {
      const kq = phanTich(`${ten}, đi tới bàn điều khiển`, bc);
      expect(kq.nguoiNhan, `"${ten}" phải ra owner`).toEqual(['owner']);
      expect(kq.coGoiTen).toBe(true);
    }
  });

  it('KHÔNG ăn mất từ tiếng Việt thường', () => {
    for (const c of ['gia vị thì để trên bếp', 'cất module lên kệ', 'đi về đây']) {
      expect(suaTheoSoTu(c)).not.toContain('Javis');
    }
  });
});

/* ----------------------------------------------- 3. module.demo diễn đủ */

function dungBo() {
  // Hai nhân vật như cảnh thật: `owner` Boss lái, `gen` của agent — `module.demo`
  // phải chọn ĐÚNG người của agent để module rơi vào tay người làm.
  const world = new SanKhauGia(['owner', 'gen']);
  const bus = new EventBus();
  const nhatKy = new NhatKy();
  const registry = taoRegistry();
  const d = new Dispatcher({ registry, world, bus, nhatKy });
  return { world, bus, d, nhatKy };
}

describe('E1 — module.demo: MỘT lệnh = cả màn diễn', () => {
  it('có mặt trong registry nên bootstrap/MCP/bảng lệnh tự biết', () => {
    expect(taoRegistry().all().some((c) => c.cmd === 'module.demo')).toBe(true);
  });

  it('chạy đủ 5 bước: focus → stream → build → emote → say', async () => {
    const { world, bus, d, nhatKy } = dungBo();
    await d.run('screen.spawn', { id: 'may-tinh', at: 'ban-dieu-khien' });
    // Theo dấu bằng **nhật ký của chính dispatcher**: `module.demo` gọi lệnh
    // con qua `ctx.run`, tức cùng một đường với lúc Boss bấm tay từng nút —
    // nên nhật ký là bằng chứng mạnh hơn mọi cách bọc hàm.
    nhatKy.xoa();
    const lenh = () =>
      nhatKy
        .tatCa()
        .filter((b): b is Extract<typeof b, { loai: 'lenh' }> => b.loai === 'lenh')
        .map((b) => b.cmd);

    const kq = await d.run('module.demo', { id: 'con-x', label: 'Baserow' });
    if (!kq.ok) throw new Error(kq.error);
    // lệnh trả về NGAY kèm lời hứa thời lượng (quy ước "thời gian là lời hứa").
    // `durationMs` nằm TRONG `result` — dispatcher gắn vào đó, xem `dispatcher.ts`.
    const r = kq.result as { durationMs: number; steps: number; actor: string };
    expect(r.durationMs).toBeGreaterThan(1000);
    expect(r.steps).toBe(5);
    // module rơi vào tay NGƯỜI LÀM (actor của agent), không phải tay Boss
    expect(r.actor).toBe('gen');

    await new Promise<void>((r) => {
      bus.on('module.demoDone', () => r());
    });

    const ds = lenh();
    expect(ds).toContain('screen.focus');
    expect(ds).toContain('screen.stream');
    expect(ds).toContain('module.build');
    expect(ds).toContain('actor.emote');
    expect(ds).toContain('actor.say');
    // và sân khấu đổi thật, không chỉ log
    expect(world.coProp('con-x')).toBe(true);
  }, 30_000);

  it('báo lỗi rõ tên màn hình thật khi não đưa id chết ("main")', async () => {
    const { d } = dungBo();
    await d.run('screen.spawn', { id: 'may-tinh', at: 'ban-dieu-khien' });
    const kq = await d.run('module.demo', { id: 'con-y', label: 'X', screen: 'main-khong-co' });
    if (kq.ok) throw new Error('lẽ ra phải lỗi vì không có màn hình đó');
    expect(kq.error).toContain('Màn hình đang có');
  });

  it('mẩu code mang nhãn module nên Boss đọc màn hình là biết đang dựng gì', () => {
    const ds = mauCode('Baserow', 'connector-baserow');
    expect(ds.length).toBeGreaterThanOrEqual(5);
    expect(ds.join('')).toContain('Baserow');
    expect(ds.join('')).toContain('connector-baserow');
  });
});


/* ------------------------------------------------- 5. /tts thử lại khi lỗi */

describe('E1 — /tts thử lại thay vì trả 502', () => {
  it('backoff đúng 300 / 800 ms (2 lần thử lại)', () => {
    expect([...CHO_THU_LAI_MS]).toEqual([300, 800]);
  });

  it('lỗi 2 lần đầu rồi thành công → trả mp3, KHÔNG ném lỗi', async () => {
    let lan = 0;
    const nghi: number[] = [];
    const mp3 = await goiEdgeThuLai('xin chào', 'nu', '+0%', '+0Hz', {
      goi: async () => {
        lan++;
        if (lan <= 2) throw new Error('Unexpected server response: 502');
        return Buffer.from('mp3');
      },
      nghi: async (ms) => void nghi.push(ms),
    });
    expect(lan).toBe(3);
    expect(nghi).toEqual([300, 800]);
    expect(mp3.toString()).toBe('mp3');
  });

  it('lỗi cả 3 lần → ném lỗi CUỐI (để endpoint còn nói được vì sao)', async () => {
    let lan = 0;
    await expect(
      goiEdgeThuLai('x', 'nu', '+0%', '+0Hz', {
        goi: async () => {
          lan++;
          throw new Error(`hỏng lần ${lan}`);
        },
        nghi: async () => undefined,
      }),
    ).rejects.toThrow('hỏng lần 3');
  });

  it('hâm sẵn đúng 8 câu đệm hay dùng nhất', () => {
    expect(CAU_DEM_SAN).toHaveLength(8);
    // phải phủ trọn câu đệm của phản xạ — đó là mấy câu dính 502 gây hại nhất
    for (const c of ['Dạ, Sếp?', 'Em nghe ạ', 'Sếp cần gì ạ?', 'Dạ em đây']) {
      expect(CAU_DEM_SAN).toContain(c);
    }
    expect(CAU_DEM_SAN).toContain('Em chưa có não, Sếp bật agy nhé.');
  });
});

/* ------------------------------- 8. không "chưa có não" lúc mới mở trang */

describe('E1 — phản xạ chờ xác nhận não trước khi nói "chưa có não"', () => {
  it('ân hạn mặc định là 3 s', () => {
    expect(MAC_DINH.choXacNhanNaoMs).toBe(3000);
  });

  it('não tới TRONG ân hạn → Gen tuyệt đối không nói "chưa có não"', async () => {
    const world = new SanKhauGia(['owner', 'gen']);
    const bus = new EventBus();
    const d = new Dispatcher({ registry: taoRegistry(), world, bus });
    let coNao = false;
    const may = batPhanXa({
      dispatcher: d,
      bus,
      coNaoNoi: () => coNao,
      // ân hạn 120 ms cho test nhanh; câu rule-based lẽ ra bắn sau 20 ms
      so: { choNaoNoiBoMs: 20, choXacNhanNaoMs: 120, nhipMs: 10 },
    });
    bus.emit('bridge.connected', { url: 'ws://test' });
    bus.emit('user.text', { actor: 'owner', text: 'Gen ơi hôm nay làm gì', to: 'camera' });
    // bridge báo có não sau 40 ms — vẫn trong ân hạn
    await new Promise((r) => setTimeout(r, 40));
    coNao = true;
    await new Promise((r) => setTimeout(r, 250));
    may.dung();
    expect(world.lichSu.some((x) => x.startsWith('say:Em chưa có não'))).toBe(false);
  });

  it('hết ân hạn mà vẫn không có não → vẫn nói, không im lặng', async () => {
    const world = new SanKhauGia(['owner', 'gen']);
    const bus = new EventBus();
    const d = new Dispatcher({ registry: taoRegistry(), world, bus });
    const may = batPhanXa({
      dispatcher: d,
      bus,
      coNaoNoi: () => false,
      so: { choNaoNoiBoMs: 20, choXacNhanNaoMs: 60, nhipMs: 10 },
    });
    bus.emit('bridge.connected', { url: 'ws://test' });
    bus.emit('user.text', { actor: 'owner', text: 'Gen ơi hôm nay làm gì', to: 'camera' });
    await new Promise((r) => setTimeout(r, 250));
    may.dung();
    expect(world.lichSu.some((x) => x.startsWith('say:Em chưa có não'))).toBe(true);
  });
});
