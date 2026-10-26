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
}

/** Số đo mặc định — spec mục 3.2d. */
export const MAC_DINH: SoPhanXa = {
  /** Nhịp quét máy trạng thái (ms). Phải nhỏ hơn 300 ms để kịp lời hứa. */
  nhipMs: 100,
  /** Chờ não nói bao lâu trước khi chêm câu đệm (ms). */
  choNaoMs: 1500,
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
  banKinhLiec: 3,
  liecMs: 700,
  lechToiDa: 12,
};

/** Câu đệm — ngắn, không hứa gì, nói trong lúc não còn đang nghĩ. */
export const CAU_DEM = [
  'Dạ, Sếp?',
  'Em nghe ạ',
  'Sếp cần gì ạ?',
  'Dạ em đây',
] as const;

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

  /* -------------------------------------------------- Owner vừa nói gì đó */

  function ownerNoi(chu: string, toi: string): void {
    const { st, owner, gen } = doc();
    if (!owner || !gen) return;
    const now = bayGio();
    tOwnerNoi = now;
    choNao = true;
    giuNhinDen = now + so.giuNhinMs;
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
    nguoiNgheCuaGen = noiTrongPhong ? owner : 'camera';

    // 1) Javis (avatar của Sếp) quay về Gen — người nói luôn hướng về người nghe.
    quayVe(owner, gen);
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
    quayVe(gen, nguoiNgheCuaGen);

    // 3) Dáng LẮNG NGHE: gật nhẹ, nghiêng đầu nếu Sếp đang hỏi.
    dispatcher.world.actorNgheNgong(gen, true, laCauHoi(chu));

    // 4) Ngẩng đầu chú ý: CHỈ khi Gen đang rảnh — phản xạ không được cắt việc
    //    não đang làm (spec mục 3.2d, ưu tiên thấp).
    if (!dispatcher.dangBan(gen)) {
      void gui('actor.emote', { actor: gen, emote: 'chu-y', intensity: 0.85 });
    }

    // 5) Não không nối → tự trả lời bằng não rule-based, sau câu đệm.
    if (henNoiBo) clearTimeout(henNoiBo);
    henNoiBo = null;
    if (!coNaoNoi()) {
      const cau = naoToiThieu(chu);
      henNoiBo = setTimeout(() => {
        henNoiBo = null;
        if (!genId) return;
        void gui('actor.say', { actor: genId, text: cau, to: nguoiNgheCuaGen });
      }, so.choNaoNoiBoMs);
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

    /* 1. câu đệm: hết 1,5 s mà não vẫn im */
    if (choNao && now - tOwnerNoi >= so.choNaoMs) {
      choNao = false;
      if (!dangNoi && !dispatcher.dangBan(gen)) {
        // Câu đệm "đang phát" tới khi `actor.sayDone` của CHÍNH nó bắn ra —
        // không phải khi `dispatcher.run` trả lời (lệnh trả lời ngay, giọng
        // còn chạy tiếp vài giây sau đó).
        const cau = chon(CAU_DEM);
        cauDemDangPhat = cau;
        void gui('actor.say', { actor: gen, text: cau, to: nguoiNgheCuaGen });
      }
    }
    // não nói trước hạn → không chêm nữa
    if (choNao && dangNoi) choNao = false;

    /* 2. hết cú LIẾC tạm → quay mắt về đúng người nghe */
    if (nhinTamDen !== 0 && now > nhinTamDen) {
      nhinTamDen = 0;
      nhinVe(gen, nguoiNgheCuaGen, g.lookingAt);
      quayVe(gen, nguoiNgheCuaGen);
    }

    /* 3. ĐANG NÓI → bám người nghe MỖI NHỊP.
       Đây là chỗ xử lý "Boss đổi camera.preset giữa lúc Gen nói": máy quay
       nhảy sang chỗ khác thì vòng này quay Gen theo, còn `actor.lookAt camera`
       lo phần mắt (sân khấu cập nhật điểm nhìn mỗi khung hình). */
    if (dangNoi) {
      const muc = g.facingTarget ?? nguoiNgheCuaGen;
      const p = viTriMuc(st, muc);
      nhinVe(gen, muc, g.lookingAt);
      if (p && lechVe(g, p) > so.lechToiDa) quayVe(gen, muc);
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
      if (p && lechVe(g, p) > so.lechToiDa) quayVe(gen, nguoiNgheCuaGen);
      giuNhinDen = now + so.giuNhinMs;
    }

    /* 4. Owner lại gần / đi xa (không ai đang nói) */
    if (!dangNoi && !ownerNoiDay && nhinTamDen === 0) {
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

  boNghe.push(
    bus.on('user.text', (e) => {
      // C2 (#32) đã hiểu và thực thi lệnh cố định → chỉ phản xạ quay/nhìn,
      // KHÔNG đệm câu, KHÔNG để não rule-based nói "chưa có não".
      if (e.data.handled) return;
      ownerNoi(String(e.data.text ?? ''), String(e.data.to ?? 'camera'));
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
      if (tuGui || cauDemDangPhat === null) return;
      if (e.data.actor !== genId) return;
      cauDemDangPhat = null;
      choNao = false;
      dispatcher.world.actorInterrupt(String(genId));
    }),
  );

  boNghe.push(
    bus.on('actor.sayDone', (e) => {
      const ai = e.data.actor;
      if (ai === ownerId) {
        // Sếp nói xong → Gen thôi dáng lắng nghe
        if (genId) dispatcher.world.actorNgheNgong(genId, false);
        return;
      }
      if (ai !== genId) return;
      if (cauDemDangPhat !== null && e.data.text === cauDemDangPhat) cauDemDangPhat = null;
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
    }),
    dung() {
      clearInterval(hen);
      if (henNoiBo) clearTimeout(henNoiBo);
      for (const h of boNghe) h();
    },
  };
}
