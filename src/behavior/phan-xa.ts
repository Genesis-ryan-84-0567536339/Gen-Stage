/**
 * phan-xa.ts — **PHẢN XẠ XÃ HỘI CỦA GEN** (C0, Issue #28; spec mục 3.2d).
 *
 * Boss thử bản B3 và nói đúng một câu: *"gọi Gen không quay lại trả lời"*.
 * Lý do: mọi cái Gen làm đều do **não** quyết, mà não ở ngoài trình duyệt —
 * nối MCP, suy nghĩ, gọi tool, mất hàng giây. Người thật thì quay đầu lại
 * **trước khi** nghĩ xong câu trả lời.
 *
 * File này là phần "tuỷ sống": chạy **trong trình duyệt**, không chờ não, và
 * mọi hành động của nó đi qua **đúng dispatcher** với nguồn `phan-xa` — nên
 * Boss xem nhật ký là phân biệt được ngay cái gì do phản xạ, cái gì do não.
 *
 * Bốn phản xạ (số đo trong `MAC_DINH`):
 *
 *  1. **Owner nói** (`user.text`) → trong ≤300 ms: `lookAt owner` (tức thì) +
 *     `turnTo owner` + emote `chu-y`. Não chưa `actor.say` trong 1,5 s thì Gen
 *     tự nói một **câu đệm** ngắn ("Dạ, Sếp?") bằng giọng; não nói tới thì câu
 *     đệm bị **cắt** ngay.
 *  2. **Owner lại gần** (≤2,5 m) → nhìn theo; ở gần > 4 s mà Gen đang rảnh thì
 *     quay người **chào nhẹ một lần**. Owner đi xa (> 4 m) → về việc đang làm.
 *  3. **Gen nói** → luôn nhìn về Owner, nói xong **giữ nhìn 2 s** rồi thả.
 *  4. **Không có não** (`brainConnected: false`) → trả lời bằng **não
 *     rule-based tối thiểu** ngay trong app, để Gen không bao giờ im lặng.
 *
 * Hai giao kèo quan trọng, cố ý:
 *
 * - **Ưu tiên thấp nhất.** Phản xạ chỉ ra lệnh khi Gen đang RẢNH
 *   (`dangBan(gen) === false`) — không bao giờ cắt lệnh não đang chạy. Ngoại lệ
 *   duy nhất: chính **câu đệm** của mình.
 * - **Cắt câu đệm KHÔNG dùng `actor.stop`/`interrupt`.** Hai cửa đó gọi
 *   `Dispatcher.catNgang`, mà hàm đó **xoá sạch hàng đợi** → giết luôn câu của
 *   não vừa xếp hàng sau câu đệm (đúng cái ta đang muốn nhường chỗ cho). Phản
 *   xạ gọi thẳng `world.actorInterrupt(gen)`: huỷ đúng hành động đang chạy,
 *   dispatcher thấy `done` thì tự xả hàng đợi → câu của não chạy ngay sau đó.
 *
 * ## I1 (#74) — PHẢN ỨNG TỨC THÌ BA TẦNG
 *
 * Boss 29/10: *"các nhân vật phải đưa ra phản ứng và hành vi tức thì ngay sau
 * khi nhận lệnh"*. Bản C0 chỉ phản ứng khi **đã có chữ**, mà giọng nói mất
 * 3–18 s STT mới thành chữ, và câu đệm còn chờ thêm 1,5 s — Boss nói xong là
 * nhìn một nhân vật đứng im hàng chục giây.
 *
 *  - **Tầng 0 — Boss bắt đầu nói, chưa có chữ** (`user.listening` do
 *    `src/audio/mic.ts` bắn): `lookAt camera` **đồng bộ ngay trong handler**
 *    (không chờ nhịp quét → ≤150 ms) + dáng nghe + `chu-y` nhẹ. Lúc STT đang
 *    chạy thì đổi sang `suy-nghi` nhẹ (đang nhẩm).
 *  - **Tầng 1 — có chữ** (`user.text`): gật (`actor.listen`, không chiếm thân
 *    nên không xếp hàng sau câu đệm) + câu đệm sau **200 ms** thay vì 1,5 s.
 *  - **Tầng 2 — chờ não**: vòng "đang nghĩ" — đổi tư thế mỗi 4,5 s rồi nhìn
 *    lại Boss, 6 s một **câu nối**, 20 s câu "hơi lâu". Não mở miệng là cắt.
 *
 * Hai luật xuyên suốt cả ba tầng, và là chỗ dễ sai nhất:
 *
 *  - **MỘT GIỌNG DUY NHẤT, XUYÊN NHÂN VẬT.** Mọi câu tầng 2 chỉ phát khi
 *    **KHÔNG CÒN AI** trên sân khấu đang nói — không phải chỉ khi Nhi rảnh.
 *    Review PR #75 đo ở tầng audio thật (móc `AudioBufferSourceNode`) và thấy
 *    **đỉnh 2 giọng** trong cả ba ca: `actor.say` bắn `user.text` ở **đầu
 *    câu** của Nam, Nam đọc câu của Boss mất 2–3 s giọng thật, mà `choNaoMs`
 *    hạ còn 200 ms → Nhi chen "Dạ, Sếp?" vào **giữa câu Nam**. Mốc 1,5 s của
 *    C0 che được chuyện đó một cách tình cờ; 200 ms thì không.
 *    Thêm một lý do nữa phải chờ Nhi rảnh: hàng đợi là FIFO nên một câu nối
 *    *xếp hàng* sẽ chạy TRƯỚC câu trả lời thật của não.
 *  - **TẦNG 2 CÓ TRẦN.** Não nhận `user.text` rồi chết giữa đường thì ba cửa
 *    ra của tầng 2 (câu của não, lệnh của não, câu không gửi cho Nhi) đều
 *    không bao giờ tới — review đo được `actor.emote` của phản xạ vẫn tăng ở
 *    mốc 46 s và nhánh "Boss lại gần" bị khoá vĩnh viễn. Nay có `tranTangHaiMs`
 *    (30 s, nói một câu kết rồi về nhịp thường) và hai cửa sập:
 *    `bridge.disconnected` / `bridge.brain { count: 0 }`.
 *  - **KHI BẬN CHỈ CHO LỆNH NHÌN.** Nhi đang chạy việc của não (`moveTo`…)
 *    thì phản xạ chỉ `actor.lookAt` + `actor.listen` (cả hai không chiếm
 *    thân): không `faceTo`, không emote, không nói, và **không chạm hàng
 *    đợi** — xem `viecCuaMinh()` ở người nghe `cmd.queued`.
 */
import type { ActorSnapshot, EventBusLike, Result, StageState, StageWorld } from '../api/types';
import { laCauHoi } from '../api/commands/actor';
import { coNao } from './so-nao';

/** Nguồn ghi vào nhật ký cho mọi lệnh do phản xạ sinh ra. */
export const NGUON_PHAN_XA = 'phan-xa';

/** Số đo của máy phản xạ — spec mục 3.2d. */
export interface SoPhanXa {
  nhipMs: number;
  choNaoMs: number;
  banKinhGan: number;
  banKinhXa: number;
  choChaoMs: number;
  giuNhinMs: number;
  choNaoNoiBoMs: number;
  /** Javis xa hơn ngần này thì Gen liếc anh ta trước khi quay về máy quay (m). */
  banKinhLiec: number;
  /** Liếc bao lâu rồi quay lại người nghe thật (ms). */
  liecMs: number;
  /** Lệch quá ngần này độ thì quay lại cho thẳng người nghe. */
  lechToiDa: number;
  /** E1 (#48) — ân hạn sau `bridge.connected` trước khi dám nói "chưa có não" (ms). */
  choXacNhanNaoMs: number;
  /* ------------------------------------------- I1 (#74): vòng "đang nghĩ" */
  /** Vào tầng 2 bao lâu thì lấy tư thế nghĩ đầu tiên (ms). */
  tuTheDauMs: number;
  /** Sau đó đổi tư thế mỗi bao lâu (ms) — Issue #74 đòi 4–6 s. */
  nhipTuTheMs: number;
  /** Chờ não bao lâu thì nói **câu nối** (ms). */
  cauNoiMs: number;
  /** Chờ não bao lâu thì xin lỗi là hơi lâu (ms). */
  cauNoiLauMs: number;
  /** Lúc đổi tư thế thì rời mắt khỏi Boss bao lâu rồi nhìn lại (ms). */
  liecNghiMs: number;
  /** Nam gật nhẹ bao lâu sau khi Nhi nói xong (ms). */
  gatNamMs: number;
  /**
   * I1 vòng 2 — **trần của "người này sắp có tiếng"** (ms).
   *
   * `user.text` bắn ở đầu câu, `actor.sayStart` chỉ bắn sau `await
   * chuanBiGiong` (300–900 ms). Phản xạ phải coi người nói là "đang nói" ngay
   * từ `user.text` (cờ `sePhat`), không thì nó chêm câu đệm vào đúng cửa sổ
   * đó. Trần này là dây an toàn: câu bị huỷ giữa lúc tải giọng thì không có
   * `sayDone` nào tới, và nếu không có trần thì Nhi im vĩnh viễn.
   */
  tranSePhatMs: number;
  /**
   * **Trần của tầng 2** (ms). Hết trần mà não vẫn im: nói một câu kết rồi
   * thoát hẳn vòng "đang nghĩ" và trả lại nhịp thường (chào khi Boss lại gần,
   * thả mắt về chỗ cũ). Phải > `cauNoiLauMs` để câu "hơi lâu" còn chỗ.
   */
  tranTangHaiMs: number;
}

/** Số đo mặc định — spec mục 3.2d. */
export const MAC_DINH: SoPhanXa = {
  /** Nhịp quét máy trạng thái (ms). Phải nhỏ hơn 300 ms để kịp lời hứa. */
  nhipMs: 100,
  /**
   * Chờ não nói bao lâu trước khi chêm câu đệm (ms).
   *
   * I1 (#74) hạ **1500 → 200**. Lời hứa của Issue là *"câu đệm bắt đầu phát
   * trong ≤400 ms sau khi có chữ"*; nhịp quét 100 ms nên mốc 200 ms nổ ở
   * nhịp thứ 2–3 (200–300 ms), còn lại 100–200 ms cho `chuanBiGiong` tải
   * giọng từ bridge. Đặt 400 ở đây là **hết luôn ngân sách** trước khi mở
   * miệng.
   */
  choNaoMs: 200,
  /** Owner vào bán kính này thì Gen nhìn theo (m). */
  banKinhGan: 2.5,
  /** Ra ngoài bán kính này thì Gen về việc đang làm (m) — có trễ để khỏi rung. */
  banKinhXa: 4,
  /** Ở gần quá lâu thì chào nhẹ một lần (ms). */
  choChaoMs: 4000,
  /** Nói xong giữ nhìn Owner bao lâu (ms). */
  giuNhinMs: 2000,
  /** Não không nối: trả lời rule-based sau câu đệm bao lâu (ms). */
  choNaoNoiBoMs: 1900,
  /**
   * E1 (#48) việc 8 — **ân hạn sau khi nối bridge**.
   *
   * Lúc mới mở trang, `bridge.brain` của bridge và câu hỏi đầu của Sếp đua
   * nhau: kiểm độc lập 26/10 đo được `brainConnected=false` trong ~8 s đầu dù
   * driver đã nối từ trước, nên Gen nói "Em chưa có não, Sếp bật agy nhé."
   * ngay khi Boss vừa mở trang — câu sai và làm Boss tưởng hỏng.
   *
   * Trong 3 s đầu sau `bridge.connected`, phản xạ **hoãn** câu rule-based rồi
   * ĐỌC LẠI `coNaoNoi()`: não tới kịp thì không nói gì cả.
   */
  choXacNhanNaoMs: 3000,
  banKinhLiec: 3,
  liecMs: 700,
  lechToiDa: 12,
  /* --------------------------------------------------------------- I1 (#74) */
  tuTheDauMs: 1800,
  nhipTuTheMs: 4500,
  cauNoiMs: 6000,
  cauNoiLauMs: 20000,
  liecNghiMs: 1300,
  gatNamMs: 1200,
  tranTangHaiMs: 30000,
  tranSePhatMs: 12000,
};

/** Câu đệm — ngắn, không hứa gì, nói trong lúc não còn đang nghĩ. */
export const CAU_DEM = [
  'Dạ, Sếp?',
  'Em nghe ạ',
  'Sếp cần gì ạ?',
  'Dạ em đây',
] as const;

/**
 * I1 (#74) — **câu nối** lúc chờ não: nói đúng cái đang xảy ra, không hứa gì.
 *
 * Tách hẳn khỏi `CAU_DEM` vì hai cái trả lời hai câu hỏi khác nhau của Boss:
 * câu đệm = *"nó có nghe mình không"*, câu nối = *"nó còn sống không"*.
 */
export const CAU_NOI = 'Em đang nghĩ ạ…';

/**
 * Hết trần tầng 2 mà chưa nói được câu kết (Nhi còn đang làm việc của não, hay
 * Nam đang nói) thì cố thêm ngần này rồi **thoát dù không nói được** — thoát
 * tầng 2 là vô điều kiện, câu kết chỉ là cố gắng hết sức.
 */
const GRACE_KET_MS = 3000;

/** Chờ quá lâu (20 s) — nói thẳng là lâu, đừng im. */
export const CAU_NOI_LAU = 'Hơi lâu, Sếp chờ em chút.';

/**
 * I1 vòng 2 — **câu kết của tầng 2** (hết trần 30 s, hoặc mất não giữa đường).
 *
 * Không hứa gì và nói đúng cái đang xảy ra: não đã nhận câu rồi im. Nói xong
 * là Nhi về nhịp thường — thà nhận là chưa trả lời được còn hơn quay tư thế
 * nghĩ mãi mãi (review PR #75 đo được số emote vẫn tăng ở mốc 46 s).
 */
export const CAU_HET_CHO = 'Não em chưa trả lời, Sếp thử lại nhé.';

/**
 * Não rule-based tối thiểu **trong app** — chỉ dùng khi `brainConnected` là
 * `false`. Không cố tỏ ra thông minh: ba nhánh, nhánh cuối nói thẳng là chưa
 * có não, để Boss biết phải bật `agy`.
 */
export function naoToiThieu(chu: string): string {
  const t = chu.toLowerCase();
  if (/(^|\s)(chào|chao|hello|hi|hey|xin chào)(\s|$|,|!)/.test(t)) {
    return 'Dạ, em chào Sếp!';
  }
  if (/(tên gì|tên em|là ai|em là|giới thiệu)/.test(t)) {
    return 'Em là Gen, trợ lý của Sếp ạ.';
  }
  return 'Em chưa có não, Sếp bật agy nhé.';
}

/**
 * Cửa duy nhất phản xạ cần ở dispatcher.
 *
 * Khai bằng interface thay vì import thẳng class `Dispatcher` để test dựng
 * được máy trạng thái trên **sân khấu giả** mà không kéo theo cả registry.
 */
export interface CuaLenhPhanXa {
  run(cmd: string, args?: Record<string, unknown>, nguon?: string): Promise<Result>;
  dangBan(actor: string): boolean;
  /**
   * I1 vòng 2 — nguồn của hành động đang chiếm actor (`null` = rảnh).
   *
   * Thay cho cờ `dangDienCho` cũ: cờ đó tự hết hạn theo nhịp 100 ms nên có cửa
   * sổ mà nó còn bật trong lúc slot đã thuộc về não, và phản xạ cắt rồi xếp
   * câu đệm **sau** câu của não (review PR #75 mục mong manh 2).
   */
  nguonDangChay(actor: string): string | null;
  /**
   * I1 vòng 2 — cắt NHẸ: huỷ hành động đang chạy, **giữ hàng đợi**, và đánh
   * dấu để handler còn treo trong `await chuanBiGiong` tự thôi. Khác
   * `catNgang` (xoá sạch hàng đợi → giết câu của não, xem mục C0).
   */
  catNhe(actor: string): void;
  readonly world: Pick<StageWorld, 'describe' | 'actorInterrupt' | 'actorNgheNgong'>;
}

export interface ThamSoPhanXa {
  dispatcher: CuaLenhPhanXa;
  bus: EventBusLike;
  /** Ghi đè số đo (test dùng số nhỏ cho nhanh). */
  so?: Partial<SoPhanXa>;
  /** Đồng hồ (test tiêm được). */
  bayGio?: () => number;
  /** Chọn câu đệm (test tiêm cố định để so chuỗi). */
  chonCauDem?: (ds: readonly string[]) => string;
  /** Có não nối hay không — mặc định đọc `so-nao.ts`. */
  coNaoNoi?: () => boolean;
  /**
   * **Hook cho E1 (#48 mục 8)** — "đừng nói *chưa có não* quá sớm".
   *
   * Trả `true` khi vừa nối bridge và CHƯA hết khoảng chờ (E1 đặt 3 s): trong
   * khoảng đó phản xạ KHÔNG dùng não rule-based (`naoToiThieu`), vì gói
   * `bridge.brain` thường tới muộn vài giây sau `bridge.connected` và Gen hay
   * buột miệng "Em chưa có não, Sếp bật agy nhé" dù driver đã nối từ trước.
   *
   * E2 chỉ ĐẶT SẴN cửa này (mặc định `() => false`, hành vi không đổi) — E1
   * nối dây đồng hồ 3 s vào `main.ts` ở đúng một chỗ, không sửa file này.
   */
  choSauBridge?: () => boolean;
}

export interface TrangThaiPhanXa {
  owner: string | null;
  gen: string | null;
  /** Đang chờ não trả lời (chưa tới hạn chêm câu đệm). */
  choNao: boolean;
  /** Câu đệm đang phát. */
  dangCauDem: boolean;
  /** Nội dung câu đệm đang phát (null = không có). */
  cauDem: string | null;
  /** Đã chào nhẹ cho lượt "Owner đứng gần" này chưa. */
  daChao: boolean;
  /** Mốc hết hạn giữ nhìn Owner (ms, 0 = không giữ). */
  giuNhinDen: number;
  /** Người nghe của Gen lượt này: `"camera"` (Sếp qua màn hình) hay id actor. */
  nguoiNghe: string;
  /* ------------------------------------------------------------- I1 (#74) */
  /** Tầng 0: Boss đang giữ mic (chưa có chữ). */
  ngheMic: boolean;
  /** Tầng 0: STT đang chạy (Nhi đang "nhẩm"). */
  nhanDang: boolean;
  /** Tầng 2: đang trong vòng "đang nghĩ" chờ não. */
  tangHai: boolean;
  /** Đã nói mấy câu nối lượt này (0 · 1 = câu nối · 2 = thêm câu "hơi lâu"). */
  soCauNoi: number;
  /** Đã đổi tư thế mấy lần trong lượt chờ này. */
  soTuThe: number;
  /** Hành động đang chiếm Nhi là **câu/tư thế chêm của phản xạ** (cắt được). */
  dangDienCho: boolean;
  /** I1 vòng 2 — những actor đang mở miệng (nguồn sự thật của "một giọng"). */
  aiDangNoi: string[];
}

export interface MayPhanXa {
  /** Chạy một nhịp quét ngay (test gọi tay thay cho `setInterval`). */
  nhip(): void;
  trangThai(): TrangThaiPhanXa;
  dung(): void;
}

/** Bật phản xạ xã hội. Gọi một lần sau khi sân khấu sẵn sàng. */
export function batPhanXa(ts: ThamSoPhanXa): MayPhanXa {
  const { dispatcher, bus } = ts;
  const so = { ...MAC_DINH, ...(ts.so ?? {}) };
  const bayGio = ts.bayGio ?? (() => Date.now());
  const chon = ts.chonCauDem ?? ((ds) => ds[Math.floor(Math.random() * ds.length)]!);
  const coNaoNoi = ts.coNaoNoi ?? coNao;
  /** Xem `ThamSoPhanXa.choSauBridge` — mặc định: không chờ gì cả. */
  const choSauBridge = ts.choSauBridge ?? (() => false);

  let ownerId: string | null = null;
  let genId: string | null = null;
  /** Gen nhìn vào đâu khi không có ai gọi — đo lúc bật, không đoán. */
  let nhinNen: string | null = null;

  let tOwnerNoi = 0;
  let choNao = false;
  let tGan = 0;
  let daChao = false;
  let giuNhinDen = 0;
  /** Đang trong lúc chính mình gọi `dispatcher.run` (xem `cmd.queued`). */
  let tuGui = false;
  let henNoiBo: ReturnType<typeof setTimeout> | null = null;
  /** Câu đệm đang phát (null = không có) — dùng để biết cái gì được cắt. */
  let cauDemDangPhat: string | null = null;
  /** Người nghe của Gen trong lượt này: `camera` (Sếp xem) hay id actor. */
  let nguoiNgheCuaGen = 'camera';
  /** Hạn của cú **liếc** tạm (0 = không liếc). */
  let nhinTamDen = 0;
  /**
   * E1 (#48) — mốc `bridge.connected` gần nhất. `-Infinity` = chưa nối bridge
   * lần nào trong phiên này, tức là thật sự không có đường tới não → không ân
   * hạn, cứ nói thẳng.
   */
  let tBridgeNoi = Number.NEGATIVE_INFINITY;

  /* --------------------------------------------- I1 (#74): ba tầng phản ứng */
  /** Tầng 0 — Boss đang giữ mic (chưa có chữ). */
  let ngheMic = false;
  /** Tầng 0 — STT đang chạy. */
  let nhanDang = false;
  /** Tầng 2 — đang chờ não trả lời. */
  let tangHai = false;
  /** 0 = chưa câu nối · 1 = đã nói câu nối · 2 = đã nói thêm câu "hơi lâu". */
  let soCauNoi = 0;
  let soTuThe = 0;
  /** Mốc đổi tư thế kế tiếp (0 = không có). */
  let tTuThe = 0;
  /**
   * I1 vòng 2 — **ai đang mở miệng**, mọi actor, lấy từ
   * `actor.sayStart`/`actor.sayDone`.
   *
   * Nguồn sự thật của lời hứa "một giọng duy nhất". `actor.sayDone` bắn khi
   * `hd.done` xong, mà `durationMs` của câu = **thời lượng audio thật** đo bởi
   * lớp tiếng (xem `uocThoiLuongNoi`), nên mốc này khớp với lúc giọng tắt —
   * không phải lúc lệnh trả lời.
   */
  const dangNoiDen = new Map<string, number>();
  /** Mốc hết trần tầng 2 (0 = không trong tầng 2). */
  let tranDen = 0;
  /** Mốc tắt dáng nghe của Nam sau khi Nhi nói xong (0 = không có). */
  let tatNgheNam = 0;

  /**
   * Gửi một lệnh phản xạ.
   *
   * `cmd.queued` được bắn **đồng bộ** ngay trong `dispatcher.run` (trước
   * `await` đầu tiên), nên cờ `tuGui` chỉ cần bật quanh lời gọi là đủ để người
   * nghe phân biệt "lệnh của mình xếp hàng" với "não vừa xếp hàng".
   */
  function gui(cmd: string, args: Record<string, unknown>): Promise<Result> {
    tuGui = true;
    try {
      return dispatcher.run(cmd, args, NGUON_PHAN_XA);
    } finally {
      tuGui = false;
    }
  }

  /**
   * Nhìn về `muc` nếu chưa nhìn ở đó.
   *
   * `dangNhin` là giá trị **đọc từ sân khấu** (`lookingAt`), không phải cache
   * của riêng phản xạ: não cũng gọi `actor.lookAt` được, cache sẽ nói dối.
   */
  function nhinVe(gen: string, muc: string | null, dangNhin: string | null): void {
    if (dangNhin === muc) return;
    void gui('actor.lookAt', { actor: gen, target: muc });
  }

  /** Quay người **không chiếm thân** về `muc` (giữ hướng trong lúc đang nói). */
  function quayVe(ai: string, muc: string): void {
    void gui('actor.faceTo', { actor: ai, target: muc });
  }

  /**
   * I1 (#74) — quay người CHỈ KHI được phép.
   *
   * Luật "khi bận chỉ cho lệnh nhìn": đang chạy việc của não (`moveTo`,
   * `play`…) thì không được quay thân — nhân vật đang đi dở mà bị xoay là
   * hỏng cả cú đi. Ngoại lệ: chính nó **đang nói** (lúc đó `dangBan` bật vì
   * câu nói của nó), vì giữ mặt về người nghe suốt câu là việc bắt buộc.
   */
  function quayVeNeuDuoc(ai: string, muc: string, a: ActorSnapshot | undefined): void {
    /**
     * I1 vòng 2 (review PR #75 mục mong manh 3) — **đang NGỒI thì không xoay
     * thân.** `actor.faceTo` ghi `goc.rotation.y`: đo thật thấy Nhi ngồi
     * `ghe-1` (ghế `facing: 0`) mà `facing: 318` — xoay ngang ra khỏi ghế.
     * Ngồi thì đầu/mắt (`actor.lookAt` + dáng nghe) là đủ.
     */
    if (a?.state === 'sitting') return;
    if (a?.state !== 'speaking' && dispatcher.dangBan(ai)) return;
    quayVe(ai, muc);
  }

  /**
   * I1 (#74) — bật/tắt **dáng lắng nghe** qua đúng cửa dispatcher.
   *
   * Trước I1 chỗ này gọi thẳng `world.actorNgheNgong`, nên cái gật đầu không
   * có trong nhật ký — mà thước đo tầng 1 của Issue #74 là *"t(`user.text`) →
   * t(gật) ≤300 ms"*. `actor.listen` không chiếm thân nên gọi được cả khi Nhi
   * đang bận.
   */
  function nghe(ai: string, bat: boolean, cauHoi = false): void {
    void gui('actor.listen', { actor: ai, on: bat, question: cauHoi });
  }

  /** Nhi có rảnh để DIỄN (không tiếng) không. */
  function ranh(ai: string, g: ActorSnapshot | undefined): boolean {
    return !dispatcher.dangBan(ai) && g?.state !== 'speaking';
  }

  /**
   * I1 vòng 2 — **có ai khác đang nói không?**
   *
   * Mọi câu của phản xạ phải đi qua cửa này. Ca thật: `actor.say` của Nam bắn
   * `user.text` ngay ĐẦU câu, Nam còn đọc 2–3 s nữa, mà mốc câu đệm chỉ
   * 200 ms — không có cửa này là Nhi chen vào giữa câu Nam, đúng cái review
   * PR #75 đo được bằng móc `AudioBufferSourceNode` (đỉnh 2 giọng).
   */
  function aiKhacDangNoi(minh: string): boolean {
    const now = bayGio();
    for (const [x, den] of dangNoiDen) {
      if (x === minh) continue;
      if (den > now) return true;
      dangNoiDen.delete(x); // hết trần: câu bị huỷ giữa lúc tải giọng
    }
    return false;
  }

  /**
   * Hành động đang chiếm Nhi là **của phản xạ** → cắt được.
   *
   * Đọc thẳng nguồn của slot trong dispatcher. Bản I1 vòng 1 dùng một cờ
   * `boolean` tự hết hạn theo nhịp 100 ms và có cửa sổ cờ-còn-bật-slot-đã-đổi
   * (review PR #75 mục mong manh 2).
   */
  function viecCuaMinh(ai: string): boolean {
    return dispatcher.nguonDangChay(ai) === NGUON_PHAN_XA;
  }

  /**
   * Nói một câu **chêm** (câu đệm hoặc câu nối). Trả `false` = chưa nói được.
   *
   * Ba luật nằm gọn trong hàm này, và cả ba đều là chỗ I1 từng sai:
   *
   *  1. **Nhường chỗ của chính mình.** Tư thế nghĩ (`actor.emote suy-nghi`,
   *     2,6 s) hay cú `chu-y` của tầng 0 (0,8 s) đang chiếm Nhi thì câu đệm
   *     *không được chờ nó xong* — chờ là mất lời hứa 400 ms. Cắt bằng
   *     `world.actorInterrupt` (KHÔNG `catNgang`, xem mục C0), rồi gửi câu:
   *     dispatcher thấy chỗ còn bận nên xếp hàng, và `done` của hành động vừa
   *     bị huỷ giải quyết ngay nên câu chạy sau đúng một microtask.
   *  2. **Không bao giờ cắt lời chính mình.** Đang nói (`speaking`) thì câu
   *     sau phải **hoãn**, nhịp quét sẽ thử lại — đây là chỗ giữ lời hứa "một
   *     giọng duy nhất, không chồng".
   *  3. **Không bao giờ cắt việc của não.** `viecCuaMinh()` sai ⇒ cái đang
   *     chiếm Nhi là việc của não ⇒ im, và không chạm hàng đợi.
   *  4. **Không bao giờ chen vào câu của người khác** — cửa `aiKhacDangNoi`.
   */
  function noiChem(ai: string, cau: string, g: ActorSnapshot | undefined): boolean {
    // 0. AI KHÁC ĐANG NÓI → hoãn. Cửa quan trọng nhất của I1 vòng 2.
    if (aiKhacDangNoi(ai)) return false;
    if (dispatcher.dangBan(ai)) {
      if (!viecCuaMinh(ai) || g?.state === 'speaking') return false;
      // `catNhe` thay `world.actorInterrupt`: giữ hàng đợi NHƯNG cũng đánh dấu
      // để câu đang treo trong `await chuanBiGiong` tự thôi (mong manh 1).
      dispatcher.catNhe(ai);
    }
    cauDemDangPhat = cau;
    void gui('actor.say', { actor: ai, text: cau, to: nguoiNgheCuaGen });
    return true;
  }

  /**
   * Tầng 2 — **đổi tư thế nhẹ rồi nhìn lại Boss**.
   *
   * Mắt thả (`target: null` = nhìn quanh tự nhiên, có cả hướng lên) trong
   * `liecNghiMs` rồi mục 2 của nhịp quét tự kéo về đúng người nghe. Hai tư
   * thế xen kẽ để vòng chờ không thành một vòng lặp máy móc.
   */
  function doiTuThe(ai: string, now: number): void {
    soTuThe++;
    void gui('actor.lookAt', { actor: ai, target: null });
    nhinTamDen = now + so.liecNghiMs;
    void gui('actor.emote', {
      actor: ai,
      emote: soTuThe % 2 === 1 ? 'suy-nghi' : 'cham-chu',
      intensity: 0.65,
    });
  }

  /** Thoát vòng "đang nghĩ" (não đã mở miệng, hoặc câu không gửi cho Nhi). */
  function ketTangHai(): void {
    tangHai = false;
    choNao = false;
    tTuThe = 0;
    tranDen = 0;
    cauDemDangPhat = null;
    // CỐ Ý không xoá `soCauNoi`/`soTuThe`: đó là **sổ của lượt chờ vừa rồi**,
    // `ownerNoi` mới là chỗ mở lượt mới. Xoá ở đây thì không test nào (và
    // không script bằng chứng nào) đọc lại được "đã nói mấy câu nối".
  }

  /** Góc (độ) giữa hướng thân của `a` và hướng từ `a` tới điểm `p`. */
  function lechVe(a: ActorSnapshot, p: readonly number[]): number {
    const muc = (Math.atan2(p[0]! - a.pos[0], p[2]! - a.pos[2]) * 180) / Math.PI;
    return Math.abs(((((a.facing - muc) % 360) + 540) % 360) - 180);
  }

  /** Toạ độ của một mục tiêu có tên (`camera` hoặc id actor). */
  function viTriMuc(st: StageState, ten: string | null): readonly number[] | null {
    if (!ten) return null;
    if (ten === 'camera') return st.camera?.pos ?? null;
    return st.actors.find((a) => a.id === ten)?.pos ?? null;
  }

  function doc(): { st: StageState; owner: string | null; gen: string | null } {
    const st = dispatcher.world.describe();
    const o = st.actors.find((a) => a.controlledBy === 'owner');
    const g = st.actors.find((a) => a.controlledBy !== 'owner');
    ownerId = o?.id ?? null;
    genId = g?.id ?? null;
    if (nhinNen === null && g) nhinNen = g.lookingAt;
    return { st, owner: ownerId, gen: genId };
  }

  /* ------------------------------ I1 (#74) tầng 0: Boss bắt đầu nói, chưa chữ */

  /**
   * Boss vừa bấm mic. **Lời hứa ≤150 ms**, nên mọi thứ ở đây chạy ĐỒNG BỘ
   * ngay trong handler sự kiện — chờ nhịp quét (100 ms) là đã mất nửa ngân
   * sách trước khi gửi lệnh đầu tiên.
   */
  function micBatDau(): void {
    const { st, gen } = doc();
    if (!gen) return;
    ngheMic = true;
    nhanDang = false;
    const g = st.actors.find((a) => a.id === gen);
    const now = bayGio();
    // Boss nói qua mic = nói với **màn hình**, không phải với Nam trong phòng.
    nguoiNgheCuaGen = 'camera';
    nhinTamDen = 0;
    giuNhinDen = now + so.giuNhinMs;
    nhinVe(gen, 'camera', g?.lookingAt ?? null);
    nghe(gen, true);
    quayVeNeuDuoc(gen, 'camera', g);
    // `chu-y` im tiếng (`am: []`) nên không cần cửa "ai khác đang nói"
    if (ranh(gen, g)) void gui('actor.emote', { actor: gen, emote: 'chu-y', intensity: 0.7 });
  }

  /** Hết ghi, STT đang chạy (3–18 s) → dáng "đang nhẩm", vẫn hướng về Boss. */
  function micNhanDang(): void {
    const { st, gen } = doc();
    if (!gen) return;
    ngheMic = false;
    nhanDang = true;
    const g = st.actors.find((a) => a.id === gen);
    nhinVe(gen, 'camera', g?.lookingAt ?? null);
    nghe(gen, true);
    // `suy-nghi` có một nốt ngắn 260 ms → vẫn qua cửa "ai khác đang nói"
    if (ranh(gen, g) && !aiKhacDangNoi(gen)) {
      void gui('actor.emote', { actor: gen, emote: 'suy-nghi', intensity: 0.45 });
    }
  }

  /**
   * Lượt nói đóng lại. Có chữ thì `ownerNoi` bật lại dáng nghe ngay sau đó;
   * không ra chữ (im lặng, lỗi mạng) thì phải **thôi** dáng nghe, không thì
   * Nhi gật đầu một mình mãi.
   */
  function micXong(): void {
    ngheMic = false;
    nhanDang = false;
    if (!tangHai && genId) nghe(genId, false);
  }

  /* -------------------------------------------------- Owner vừa nói gì đó */

  function ownerNoi(chu: string, toi: string, sePhat = false): void {
    const { st, owner, gen } = doc();
    if (!owner || !gen) return;
    /**
     * I1 vòng 2 — **Nam SẮP có tiếng** (cờ `sePhat` của `actor.say`).
     *
     * Đây là chỗ bịt cửa sổ `user.text` → `actor.sayStart`: vòng sửa đầu chỉ
     * nghe `sayStart` nên vẫn để Nhi chêm câu đệm vào giữa 300–900 ms tải
     * giọng của Nam, và móc audio vẫn đo **đỉnh 2 giọng**. `sayStart` tới sau
     * sẽ ghi lại mốc này thành vô hạn, `sayDone` xoá nó.
     */
    if (sePhat) dangNoiDen.set(owner, bayGio() + so.tranSePhatMs);
    const now = bayGio();
    tOwnerNoi = now;
    choNao = true;
    giuNhinDen = now + so.giuNhinMs;
    // I1 (#74) — vào tầng 2: đã có chữ, từ đây là chờ não.
    ngheMic = false;
    nhanDang = false;
    tangHai = true;
    soCauNoi = 0;
    soTuThe = 0;
    tTuThe = now + so.tuTheDauMs;
    tranDen = now + so.tranTangHaiMs;
    const g = st.actors.find((a) => a.id === gen);
    const o = st.actors.find((a) => a.id === owner);
    const xa =
      g && o ? Math.hypot(g.pos[0] - o.pos[0], g.pos[2] - o.pos[2]) > so.banKinhLiec : false;

    /**
     * **Người nghe là ai.** Mặc định Sếp nói với Gen qua màn hình → Gen phải
     * quay về **máy quay** (chỗ Sếp đang đứng xem), KHÔNG phải về Javis (avatar
     * của Sếp trong phòng). `to: "gen"` thì ngược lại: hai nhân vật nói chuyện
     * với nhau trong phòng, Gen quay về Javis.
     */
    const noiTrongPhong = toi !== 'camera' && toi === gen;
    /**
     * E2 (#48 mục 7) — **câu này có gửi cho Gen không?**
     *
     * `to: "camera"` = Sếp nói với Gen qua màn hình; `to: <id của Gen>` = một
     * nhân vật trong phòng nói với Gen. Mọi giá trị khác (vd Javis nói với
     * một nhân vật thứ ba) thì Gen chỉ là người ngoài: KHÔNG chêm câu đệm,
     * KHÔNG để não rule-based trả lời — reviewer đo được Gen chen "Sếp cần gì
     * ạ?" vào giữa câu không gửi cho mình.
     */
    const guiChoGen = toi === 'camera' || toi === gen;
    if (!guiChoGen) {
      ketTangHai();
      if (henNoiBo) clearTimeout(henNoiBo);
      henNoiBo = null;
      // hướng nhìn của cặp đang nói do chính `actor.say` lo (một nguồn sự
      // thật), phản xạ không chen vào.
      return;
    }
    nguoiNgheCuaGen = noiTrongPhong ? owner : 'camera';

    // 1) Nam (avatar của Sếp) quay về Nhi — người nói luôn hướng về người nghe.
    quayVeNeuDuoc(owner, gen, o);
    nhinVe(owner, gen, o?.lookingAt ?? null);

    // 2) Gen: nhìn + quay về đúng người nghe. Javis đứng xa (> 3 m) thì Gen
    //    **liếc** anh ta một nhịp cho tự nhiên rồi mới về máy quay.
    if (!noiTrongPhong && xa) {
      nhinVe(gen, owner, g?.lookingAt ?? null);
      nhinTamDen = now + so.liecMs;
    } else {
      nhinVe(gen, nguoiNgheCuaGen, g?.lookingAt ?? null);
      nhinTamDen = 0;
    }
    quayVeNeuDuoc(gen, nguoiNgheCuaGen, g);

    // 3) Tầng 1 — **GẬT NGAY**: `actor.listen` không chiếm thân nên nó chạy
    //    tức thì, không xếp hàng sau câu đệm (lời hứa ≤300 ms), và dùng được
    //    cả khi Nhi đang bận việc của não.
    nghe(gen, true, laCauHoi(chu));

    /**
     * 4) Ngẩng đầu chú ý — I1 (#74) đổi từ `actor.emote chu-y` sang
     *    **`actor.express`**.
     *
     * `chu-y` dài 800 ms và **chiếm thân**, nên nó ăn trọn ngân sách 400 ms
     * của câu đệm: C0 đo được câu đệm bị bỏ hẳn vì lúc tới hạn Nhi còn đang
     * diễn chính cú chú ý đó. Mặt vẫn ngẩng/mở to mắt, nhưng bằng một lệnh
     * **không chiếm thân, không xếp hàng**. Cú `chu-y` trọn gói chuyển về
     * **tầng 0** (`micBatDau`), chỗ còn vài giây trước khi có chữ.
     *
     * Vẫn gác `ranh()`: phản xạ là ưu tiên thấp nhất (spec mục 3.2d).
     */
    if (ranh(gen, g)) {
      void gui('actor.express', {
        actor: gen,
        expression: 'surprised',
        weight: 0.3,
        durationMs: 900,
      });
    }

    // 5) Não không nối → tự trả lời bằng não rule-based, sau câu đệm.
    if (henNoiBo) clearTimeout(henNoiBo);
    henNoiBo = null;
    if (!coNaoNoi() && !choSauBridge()) {
      const cau = naoToiThieu(chu);
      /**
       * E1 (#48) việc 8 — đợi hết ân hạn `bridge.connected` rồi mới nói, và
       * **đọc lại** `coNaoNoi()` trong hẹn giờ: gói `bridge.brain` tới trong
       * lúc chờ thì câu "chưa có não" bị bỏ, không phát ra tiếng nào.
       */
      const anHanConLai = tBridgeNoi + so.choXacNhanNaoMs - now;
      const cho = Math.max(so.choNaoNoiBoMs, anHanConLai);
      henNoiBo = setTimeout(() => {
        henNoiBo = null;
        if (!genId) return;
        if (coNaoNoi()) return;
        void gui('actor.say', { actor: genId, text: cau, to: nguoiNgheCuaGen });
      }, cho);
    }
  }

  /* ------------------------------------------------------------ nhịp quét */

  function nhip(): void {
    const { st, owner, gen } = doc();
    if (!owner || !gen) return;
    const g = st.actors.find((a) => a.id === gen)!;
    const o = st.actors.find((a) => a.id === owner)!;
    const now = bayGio();
    const d = Math.hypot(g.pos[0] - o.pos[0], g.pos[2] - o.pos[2]);
    const dangNoi = g.state === 'speaking';

    /* 1. câu đệm: hết `choNaoMs` (I1: 200 ms) mà não vẫn im.
       Câu đệm "đang phát" tới khi `actor.sayDone` của CHÍNH nó bắn ra — không
       phải khi `dispatcher.run` trả lời (lệnh trả lời ngay, giọng còn chạy
       tiếp vài giây sau đó). `noiChem` tự lo việc nhường chỗ / im lặng. */
    if (choNao && now - tOwnerNoi >= so.choNaoMs) {
      /**
       * I1 vòng 2 — **câu đệm được HOÃN, không bị bỏ.**
       *
       * Vòng 1 xoá `choNao` ngay khi tới hạn, nói được hay không. Nhưng trong
       * app thật Nam LUÔN đọc to câu của Boss (ô chat và mic đều đi qua
       * `actor.say` lên nhân vật owner), mà `user.text` bắn ở **đầu câu** —
       * nên tới hạn 200 ms thì Nam còn đang nói và câu đệm bị bỏ lặng lẽ, để
       * lại một khoảng im tới mốc câu nối 6 s. Giữ `choNao` cho tới khi nói
       * được thật, hoặc tới lúc câu đệm hết nghĩa (mốc câu nối tiếp quản).
       *
       * Hệ quả cho thước đo: lời hứa "≤400 ms" tính từ **lúc Nam dứt lời** —
       * mốc sớm nhất mà Nhi trả lời được mà không chồng giọng.
       */
      if (now - tOwnerNoi >= so.cauNoiMs) choNao = false;
      else if (noiChem(gen, chon(CAU_DEM), g)) choNao = false;
    }
    // não nói trước hạn → không chêm nữa
    if (choNao && dangNoi) choNao = false;

    /* 1b. TẦNG 2 (I1 #74) — vòng "đang nghĩ" trong lúc chờ não.
       CHỈ gửi khi Nhi đang rảnh. Không phải để lịch sự: hàng đợi là FIFO nên
       một câu nối xếp hàng sẽ chạy TRƯỚC câu trả lời của não. */
    if (tangHai) {
      const troi = now - tOwnerNoi;
      /* HẾT TRẦN (I1 vòng 2) — não nhận câu rồi im hẳn.
         Nói một câu kết rồi THOÁT tầng 2: `soTuThe` ngừng tăng và mục 4 của
         nhịp (chào khi Boss lại gần, thả mắt về chỗ cũ) sống lại. Nếu chưa nói
         được (ai đó đang nói) thì hoãn — nhưng vẫn không đổi tư thế nữa. */
      if (tranDen !== 0 && now >= tranDen) {
        /**
         * **Thoát tầng 2 là VÔ ĐIỀU KIỆN; câu kết chỉ là cố gắng hết sức.**
         *
         * Vòng sửa đầu chỉ thoát khi nói được câu kết — đo thật thì Nhi đang
         * chạy một việc dài của não ở mốc 30 s, `noiChem` trả `false`, và
         * tầng 2 sống tiếp **vĩnh viễn** (mục 4 của nhịp vẫn bị khoá, mắt vẫn
         * dán vào máy quay). Đó đúng là họ lỗi mà trần này sinh ra để diệt.
         * Nay: thử nói trong `graceKetMs`, hết thì thoát dù không nói được.
         */
        if (soCauNoi < 3 && noiChem(gen, CAU_HET_CHO, g)) soCauNoi = 3;
        if (soCauNoi >= 3 || now >= tranDen + GRACE_KET_MS) ketTangHai();
        else tTuThe = 0; // chờ nói được: nhưng KHÔNG đổi tư thế nữa
      } else if (troi >= so.cauNoiLauMs && soCauNoi < 2) {
        // `noiChem` trả `false` khi Nhi đang nói / đang làm việc của não →
        // HOÃN sang nhịp sau, không bỏ và không chen.
        if (noiChem(gen, CAU_NOI_LAU, g)) soCauNoi = 2;
      } else if (troi >= so.cauNoiMs && soCauNoi < 1) {
        if (noiChem(gen, CAU_NOI, g)) soCauNoi = 1;
      } else if (tTuThe !== 0 && now >= tTuThe && ranh(gen, g) && !aiKhacDangNoi(gen)) {
        // Đổi tư thế thì KHÔNG nhường chỗ của chính mình: một câu đang nói
        // quan trọng hơn một cú đổi dáng.
        tTuThe = now + so.nhipTuTheMs;
        doiTuThe(gen, now);
      }
    }

    /* 1c. Nam gật nhẹ xong thì thôi dáng nghe (I1 #74). */
    if (tatNgheNam !== 0 && now > tatNgheNam) {
      tatNgheNam = 0;
      nghe(owner, false);
    }

    /* 2. hết cú LIẾC tạm → quay mắt về đúng người nghe.
       I1 (#74): cú quay thân đi qua `quayVeNeuDuoc` — Nhi đang chạy việc của
       não (Boss gõ lúc Nhi đang đi, mà Nam lại đứng xa > 3 m nên có cú liếc)
       thì chỉ được đổi MẮT. */
    if (nhinTamDen !== 0 && now > nhinTamDen) {
      nhinTamDen = 0;
      nhinVe(gen, nguoiNgheCuaGen, g.lookingAt);
      quayVeNeuDuoc(gen, nguoiNgheCuaGen, g);
    }

    /* 3. ĐANG NÓI → bám người nghe MỖI NHỊP.
       Đây là chỗ xử lý "Boss đổi camera.preset giữa lúc Gen nói": máy quay
       nhảy sang chỗ khác thì vòng này quay Gen theo, còn `actor.lookAt camera`
       lo phần mắt (sân khấu cập nhật điểm nhìn mỗi khung hình). */
    if (dangNoi) {
      const muc = g.facingTarget ?? nguoiNgheCuaGen;
      const p = viTriMuc(st, muc);
      nhinVe(gen, muc, g.lookingAt);
      if (p && lechVe(g, p) > so.lechToiDa) quayVeNeuDuoc(gen, muc, g);
      giuNhinDen = now + so.giuNhinMs;
    }

    /**
     * 3b. SẾP ĐANG NÓI (Javis mở miệng) → vẫn là lượt hội thoại: Gen giữ
     * hướng về người nghe của mình, không được quay về bàn giữa câu của Sếp.
     */
    const ownerNoiDay = o.state === 'speaking';
    if (ownerNoiDay) {
      const p = viTriMuc(st, nguoiNgheCuaGen);
      if (nhinTamDen === 0) nhinVe(gen, nguoiNgheCuaGen, g.lookingAt);
      // I1 (#74) — Nhi đang chạy việc của não thì CHỈ lệnh nhìn, không quay thân.
      if (p && lechVe(g, p) > so.lechToiDa) quayVeNeuDuoc(gen, nguoiNgheCuaGen, g);
      giuNhinDen = now + so.giuNhinMs;
    }

    /* 4. Owner lại gần / đi xa (không ai đang nói, không đang chờ não).
       `!tangHai` là của I1: đang chờ não thì hướng mắt do vòng "đang nghĩ" lo,
       nhánh "chào nhẹ" chen vào giữa là Nhi vừa nghĩ vừa chào. */
    if (!dangNoi && !ownerNoiDay && !tangHai && nhinTamDen === 0) {
      if (d <= so.banKinhGan) {
        if (tGan === 0) tGan = now;
        nhinVe(gen, owner, g.lookingAt);
        giuNhinDen = Math.max(giuNhinDen, now + so.giuNhinMs);
        if (!daChao && now - tGan >= so.choChaoMs && !dispatcher.dangBan(gen)) {
          daChao = true;
          void gui('actor.turnTo', { actor: gen, target: owner });
          void gui('actor.emote', { actor: gen, emote: 'chao', intensity: 0.6 });
        }
      } else if (d > so.banKinhXa) {
        tGan = 0;
        daChao = false;
        if (giuNhinDen !== 0 && now > giuNhinDen) {
          nhinVe(gen, nhinNen, g.lookingAt);
          giuNhinDen = 0;
        }
      }
      // Khoảng 2,5–4 m là vùng ĐỆM cố ý: không bám nữa nhưng cũng chưa quay đi,
      // để Gen khỏi giật mắt qua lại khi Sếp đi tới đi lui quanh ranh giới.
    }
  }

  /* -------------------------------------------------------- người nghe bus */

  const boNghe: Array<() => void> = [];

  /**
   * E1 (#48) — ghi mốc nối bridge. Nối lại (bridge khởi động lại, mạng chớp)
   * cũng tính là mốc mới: `bridge.brain` sẽ tới sau đó vài chục ms.
   */
  boNghe.push(
    bus.on('bridge.connected', () => {
      tBridgeNoi = bayGio();
    }),
  );

  /**
   * I1 vòng 2 — **hai cửa sập của tầng 2**.
   *
   * Vòng "đang nghĩ" chỉ có nghĩa khi còn một cái não đang nghĩ. Mất bridge
   * hoặc `bridge.brain { count: 0 }` là biết chắc **không ai sẽ trả lời** —
   * đứng quay tư thế thêm 30 s nữa chỉ làm Boss tưởng nó còn đang chạy. Nói
   * một câu kết (nếu nói được) rồi về nhịp thường.
   */
  function hetNao(): void {
    if (!tangHai || !genId) return;
    const g = dispatcher.world.describe().actors.find((a) => a.id === genId);
    // nói được thì nói; ai đó đang nói thì thôi — nhưng thoát tầng 2 ĐẰNG NÀO
    // CŨNG phải làm, không thì vòng "đang nghĩ" sống tiếp dù đã biết là vô ích
    noiChem(genId, CAU_HET_CHO, g);
    soCauNoi = 3;
    ketTangHai();
  }

  boNghe.push(bus.on('bridge.disconnected', () => hetNao()));
  boNghe.push(
    bus.on('bridge.brain', (e) => {
      if (Number(e.data.count ?? 0) <= 0) hetNao();
    }),
  );

  /**
   * I1 (#74) tầng 0 — **Boss bắt đầu nói, chưa có chữ nào**.
   *
   * `src/audio/mic.ts` bắn ba mốc: `{on:true}` lúc `MediaRecorder` chạy,
   * `{on:false, dangNhanDang:true}` lúc gửi audio lên STT, và
   * `{on:false, dangNhanDang:false}` khi lượt nói đóng (có chữ / không ra chữ
   * / lỗi).
   */
  boNghe.push(
    bus.on('user.listening', (e) => {
      if (e.data.on === true) micBatDau();
      else if (e.data.dangNhanDang === true) micNhanDang();
      else micXong();
    }),
  );

  boNghe.push(
    bus.on('user.text', (e) => {
      // C2 (#32) đã hiểu và thực thi lệnh cố định → chỉ phản xạ quay/nhìn,
      // KHÔNG đệm câu, KHÔNG để não rule-based nói "chưa có não".
      if (e.data.handled) return;
      ownerNoi(
        String(e.data.text ?? ''),
        String(e.data.to ?? 'camera'),
        e.data.sePhat === true,
      );
    }),
  );

  /**
   * **Cặp hội thoại lấy từ chính `actor.say`** (E2, #48 mục 7).
   *
   * Trước đây phản xạ chỉ biết "ai nói với ai" qua `user.text`, mà lớp hiểu
   * lệnh (`hieu-lenh.ts`) đánh dấu `handled = true` cho mọi câu nó đã khớp —
   * nên đúng trường hợp Boss gõ *"Javis, nói với Gen …"* thì phản xạ bị bỏ
   * qua hoàn toàn và Gen đứng nguyên hướng máy quay (reviewer đo được).
   * `actor.sayStart` thì LUÔN bắn, cho cả lệnh từ hiểu lệnh, từ não, từ ws —
   * nên đây là nguồn sự thật duy nhất về người nghe của Gen.
   */
  boNghe.push(
    bus.on('actor.sayStart', (e) => {
      const ai = String(e.data.actor ?? '');
      const toi = String(e.data.to ?? 'camera');
      /*
       * I1 vòng 2 — sổ "ai đang mở miệng". Cập nhật TRƯỚC mọi quyết định khác.
       * Bong bóng đã hiện ⇒ chắc chắn có tiếng ⇒ giữ tới `actor.sayDone`
       * (luôn bắn, vì nó treo trên `hd.done`), không cần trần thời gian.
       */
      if (ai) dangNoiDen.set(ai, Number.POSITIVE_INFINITY);
      const { st, owner, gen } = doc();
      if (!owner || !gen) return;
      if (ai === gen) {
        // Gen đang nói: hướng về đúng người nghe của câu đó
        nguoiNgheCuaGen = toi === 'cursor' ? 'camera' : toi;
        nhinTamDen = 0;
        /**
         * I1 (#74) — **Nam nhìn Nhi khi Nhi nói**, nhưng chỉ khi Nam đang
         * rảnh: Boss có thể đang lái Nam bằng WASD, xoay thân anh ta giữa cú
         * đi là đúng cái tật F2 (#56) đã sửa.
         */
        const o2 = st.actors.find((a) => a.id === owner);
        if (o2 && ranh(owner, o2)) {
          nhinVe(owner, gen, o2.lookingAt);
          quayVeNeuDuoc(owner, gen, o2);
        }
        /**
         * I1 (#74) — câu này là của PHẢN XẠ hay của NÃO?
         *
         * Của phản xạ (câu đệm / câu nối) thì vòng "đang nghĩ" còn chạy tiếp.
         * Của não (hoặc của lớp hiểu lệnh, hoặc của não rule-based) thì thoát
         * tầng 2 ngay và về dáng chú ý — không nói chồng, không đổi tư thế
         * giữa câu trả lời thật.
         */
        const chu = String(e.data.text ?? '');
        if (tangHai && chu !== cauDemDangPhat) {
          ketTangHai();
          nghe(gen, false);
        }
        return;
      }
      if (ai !== owner) return;
      // Javis nói VỚI GEN → Gen quay cả mắt lẫn thân về Javis, ngay lúc mở
      // miệng. Nói với Sếp/máy quay → Gen giữ hướng máy quay như cũ.
      nguoiNgheCuaGen = toi === gen ? owner : 'camera';
      if (toi === gen) {
        nhinTamDen = 0;
        const g = st.actors.find((a) => a.id === gen);
        nhinVe(gen, owner, g?.lookingAt ?? null);
        quayVeNeuDuoc(gen, owner, g);
        giuNhinDen = bayGio() + so.giuNhinMs;
      }
    }),
  );

  /**
   * Não vừa xếp hàng sau câu đệm → cắt câu đệm để não nói ngay.
   *
   * `tuGui` loại chính lệnh của phản xạ (emote `chu-y` xếp sau `turnTo`, câu
   * trả lời của não rule-based xếp sau câu đệm): phản xạ không tự cắt mình.
   */
  boNghe.push(
    bus.on('cmd.queued', (e) => {
      if (tuGui) return;
      if (e.data.actor !== genId) return;
      /**
       * I1 (#74) — **chỉ cắt việc của CHÍNH MÌNH.**
       *
       * C0 gác bằng `cauDemDangPhat !== null`, tức chỉ che được câu đệm. Tầng
       * 2 còn chêm cả tư thế nghĩ (`actor.emote`), nên I1 vòng 1 thay bằng một
       * cờ `boolean`; vòng 2 thay tiếp bằng **nguồn của slot trong dispatcher**
       * (`viecCuaMinh`) — cờ có cửa sổ ≤100 ms nói dối, nguồn thì không.
       *
       * Đây cũng là chỗ giữ lời hứa ngược lại: Nhi đang chạy `moveTo` của não
       * mà não gửi thêm lệnh thì **không cắt gì cả**, hàng đợi nguyên.
       */
      if (!viecCuaMinh(String(genId))) return;
      cauDemDangPhat = null;
      ketTangHai();
      // `catNhe`: giữ hàng đợi + đánh dấu `daHuy` cho câu còn đang tải giọng
      dispatcher.catNhe(String(genId));
    }),
  );

  boNghe.push(
    bus.on('actor.sayDone', (e) => {
      const ai = e.data.actor;
      if (typeof ai === 'string') dangNoiDen.delete(ai);
      if (ai === ownerId) {
        // Sếp nói xong → Gen thôi dáng lắng nghe (đang chờ não thì vòng "đang
        // nghĩ" của tầng 2 lo tiếp, dáng NGHE phải tắt mới đúng cái đang xảy ra)
        if (genId) nghe(genId, false);
        /**
         * E2 (#48 mục 7) — Javis nói với Gen xong thì **Gen liếc máy quay**
         * (Sếp vẫn đang xem). `actor.say` đã đổi mắt người nghe; chỗ này đổi
         * luôn "người nghe của Gen" để nhịp quét không kéo mắt Gen về lại
         * Javis ngay khung hình sau.
         */
        if (genId && e.data.to === genId) {
          nguoiNgheCuaGen = 'camera';
          nhinVe(genId, 'camera', null);
          // GIỮ cú liếc đủ lâu để thấy được: không có mốc này thì nhịp quét
          // sau (Sếp đang đứng gần ≤ 2,5 m) kéo mắt Gen về Javis ngay 100 ms
          // sau, Boss không kịp thấy Gen có nhìn mình.
          nhinTamDen = bayGio() + so.liecMs;
          giuNhinDen = bayGio() + so.giuNhinMs;
        }
        return;
      }
      if (ai !== genId) return;
      if (cauDemDangPhat !== null && e.data.text === cauDemDangPhat) cauDemDangPhat = null;
      /**
       * I1 (#74) — **Nam gật nhẹ khi Nhi nói xong.** Đúng lúc nói xong, không
       * phải trong lúc nói: gật giữa câu là cắt lời.
       */
      if (ownerId && !dispatcher.dangBan(ownerId)) {
        nghe(ownerId, true);
        tatNgheNam = bayGio() + so.gatNamMs;
      }
      giuNhinDen = bayGio() + so.giuNhinMs;
      // Nói với một nhân vật trong phòng xong thì **liếc máy quay** — Sếp vẫn
      // là người xem, không được quên mất Sếp.
      if (genId && e.data.to !== 'camera') {
        nhinVe(genId, 'camera', null);
        nhinTamDen = 0;
        nguoiNgheCuaGen = 'camera';
      }
    }),
  );

  const hen = setInterval(nhip, so.nhipMs);
  // không giữ tiến trình Node sống chỉ vì nhịp quét (test chạy trong vitest)
  (hen as unknown as { unref?: () => void }).unref?.();

  return {
    nhip,
    trangThai: () => ({
      owner: ownerId,
      gen: genId,
      choNao,
      dangCauDem: cauDemDangPhat !== null,
      cauDem: cauDemDangPhat,
      daChao,
      giuNhinDen,
      nguoiNghe: nguoiNgheCuaGen,
      aiDangNoi: [...dangNoiDen.keys()].filter((x) => (dangNoiDen.get(x) ?? 0) > bayGio()),
      ngheMic,
      nhanDang,
      tangHai,
      soCauNoi,
      soTuThe,
      dangDienCho: genId !== null && viecCuaMinh(genId),
    }),
    dung() {
      clearInterval(hen);
      if (henNoiBo) clearTimeout(henNoiBo);
      for (const h of boNghe) h();
    },
  };
}
