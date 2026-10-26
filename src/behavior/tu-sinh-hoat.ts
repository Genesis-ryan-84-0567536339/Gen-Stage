/**
 * tu-sinh-hoat.ts — **TỰ SINH HOẠT KHI RẢNH** (J2, Issue #79).
 *
 * Boss đi vắng 20 giây là Nhi đứng im như tượng — đó là cái làm cả sân khấu
 * trông như một bản demo chứ không như một căn nhà. Máy này lấp đúng khoảng
 * đó: Nhi **rảnh > 20 s và không ai ra lệnh** thì tự chọn một hoạt động trong
 * `BANG_HOAT_DONG` mà làm; Boss gõ/nói hay não ra lệnh là **cắt ngay**.
 *
 * Nó là một file RIÊNG, không nhét vào `phan-xa.ts`, vì hai máy trả lời hai
 * câu hỏi khác nhau: phản xạ là *"có ai vừa gọi mình không"* (chạy theo sự
 * kiện, ngân sách tính bằng trăm mili giây), còn máy này là *"đã lâu không ai
 * gọi mình"* (chạy theo đồng hồ, ngân sách tính bằng chục giây). Trộn vào một
 * vòng quét 100 ms thì mọi cờ của I1 phải thêm một nhánh "mà có đang tự sinh
 * hoạt không" — đúng chỗ dễ sai nhất của C0/I1.
 *
 * ## Bốn giao kèo
 *
 * 1. **Ưu tiên THẤP NHẤT — thấp hơn cả phản xạ.** Chỉ gửi `actor.activity`
 *    khi Nhi `idle` và `dangBan === false`. Phản xạ còn được phép chêm câu khi
 *    Nhi đang làm việc của chính phản xạ; máy này thì không chêm gì, bao giờ.
 * 2. **Cắt qua `huyHoatDong()` → `world.actorInterrupt`, KHÔNG
 *    `dispatcher.catNgang`.** `catNgang` xoá sạch hàng đợi, tức giết luôn lệnh
 *    não vừa xếp hàng — đúng cái ta đang nhường chỗ cho (bài học C0, nhắc lại
 *    ở I1). Cắt chạy **đồng bộ trong handler sự kiện**, không chờ nhịp quét:
 *    nhịp ở đây là 500 ms, chờ nhịp là tự phá lời hứa ≤300 ms.
 * 3. **Chỉ nhân vật của agent.** Nam (`controlledBy: 'owner'`) là avatar Boss
 *    lái bằng WASD — tự dưng cho anh ta đi pha cà phê giữa lúc Boss đang giữ
 *    phím là đúng cái tật F2 (#56) đã sửa.
 * 4. **Không lặp lại cái vừa làm.** Chọn ngẫu nhiên trong bảng TRỪ hoạt động
 *    của lượt trước; bảng 12 món nên vẫn đủ ngẫu nhiên.
 *
 * ## Vì sao "rảnh" đo bằng `describe()` mà không bằng một sự kiện
 *
 * Không có sự kiện nào nghĩa là *"não vừa ra lệnh"* cho mọi đường vào (ws,
 * MCP, bảng lệnh, ô kịch bản, phím) — `cmd.queued` chỉ bắn **khi actor đang
 * bận**. Nhưng có một thứ luôn đúng cho mọi đường: lệnh nào chiếm thân cũng
 * làm `dangBan(nhi)` bật và `state` khác `idle`. Nên đồng hồ rảnh **reset mỗi
 * nhịp thấy Nhi đang bận vì việc của người khác** — một thước đo, không phải
 * một danh sách sự kiện phải nhớ bổ sung mỗi lần thêm đường vào.
 */
import type { EventBusLike, Result, StageState, StageWorld } from '../api/types';
import {
  BANG_HOAT_DONG,
  dangGuiBuoc,
  huyHoatDong,
  layHoatDong,
  type HoatDong,
} from './hoat-dong';

/** Nguồn ghi vào nhật ký cho lệnh do máy này sinh ra. */
export const NGUON_TU_SINH = 'tu-sinh-hoat';

export interface SoTuSinhHoat {
  /** Nhịp quét (ms). Không cần nhỏ: mốc của máy này tính bằng chục giây. */
  nhipMs: number;
  /** Nhi rảnh liên tục bao lâu thì tự sinh hoạt (ms) — Issue #79: > 20 s. */
  ranhMs: number;
  /**
   * Nghỉ bao lâu giữa hai hoạt động TỰ SINH liên tiếp (ms).
   *
   * Không dùng lại `ranhMs` ở đây, và đây là một quyết định có số: thước đo
   * của Issue là *"rảnh 60 s → ≥2 hoạt động khác nhau"*. Hoạt động dài
   * 8–20 s, nên nếu phải chờ lại 20 s nữa thì lượt thứ hai rơi ra ngoài phút
   * đo. Mà về mặt đời thực cũng đúng hơn: người đang rảnh rỗi làm việc nọ
   * tiếp việc kia, chỉ nghỉ một nhịp.
   */
  nghiGiuaMs: number;
}

export const MAC_DINH_TU_SINH: SoTuSinhHoat = {
  nhipMs: 500,
  ranhMs: 20000,
  nghiGiuaMs: 3000,
};

/** Cửa duy nhất máy này cần ở dispatcher (test dựng được trên sân khấu giả). */
export interface CuaLenhTuSinh {
  run(cmd: string, args?: Record<string, unknown>, nguon?: string): Promise<Result>;
  dangBan(actor: string): boolean;
  readonly world: Pick<StageWorld, 'describe'>;
}

export interface ThamSoTuSinhHoat {
  dispatcher: CuaLenhTuSinh;
  bus: EventBusLike;
  so?: Partial<SoTuSinhHoat>;
  /** Đồng hồ (test tiêm được). */
  bayGio?: () => number;
  /** Chọn hoạt động (test tiêm cố định để so chuỗi). */
  chon?: (ds: readonly HoatDong[]) => HoatDong;
}

export interface TrangThaiTuSinh {
  /** Nhân vật được theo (nhân vật của agent). */
  gen: string | null;
  /** Đang làm một hoạt động TỰ SINH. */
  dangChay: boolean;
  /** Hoạt động đang làm (đọc từ sổ chung — kể cả khi do não gọi). */
  hoatDong: string | null;
  /** Hoạt động tự sinh của lượt trước (không chọn lại ngay). */
  lanTruoc: string | null;
  /** Đã tự sinh mấy lượt kể từ lúc bật. */
  soLuot: number;
  /** Số lượt bị cắt vì Boss/não xen vào. */
  soCat: number;
  /** Rảnh được bao lâu rồi (ms) — 0 khi đang bận. */
  ranhMs: number;
}

export interface MayTuSinhHoat {
  /** Chạy một nhịp quét ngay (test gọi tay thay cho `setInterval`). */
  nhip(): void;
  trangThai(): TrangThaiTuSinh;
  dung(): void;
}

export function batTuSinhHoat(ts: ThamSoTuSinhHoat): MayTuSinhHoat {
  const { dispatcher, bus } = ts;
  const so = { ...MAC_DINH_TU_SINH, ...(ts.so ?? {}) };
  const bayGio = ts.bayGio ?? (() => Date.now());
  const chon =
    ts.chon ?? ((ds) => ds[Math.floor(Math.random() * ds.length)]!);

  let genId: string | null = null;
  /** Mốc bắt đầu khoảng rảnh hiện tại. */
  let tRanhTu = bayGio();
  /** Mốc hoạt động TỰ SINH gần nhất kết thúc (0 = chưa có lượt nào). */
  let tXongLuot = 0;
  let dangChay = false;
  let lanTruoc: string | null = null;
  let soLuot = 0;
  let soCat = 0;

  function doc(): { st: StageState; gen: string | null } {
    const st = dispatcher.world.describe();
    const g = st.actors.find((a) => a.controlledBy !== 'owner');
    genId = g?.id ?? null;
    return { st, gen: genId };
  }

  /**
   * **Có người gọi** — Boss gõ/nói, hoặc não ra lệnh.
   *
   * Cắt trước, đặt lại đồng hồ sau: đặt đồng hồ trước thì giữa hai dòng đó có
   * một nhịp quét chen vào được (nhịp chạy trên cùng luồng nên thật ra không,
   * nhưng thứ tự này đọc đúng ý và không phụ thuộc chi tiết đó).
   */
  function coNguoiGoi(): void {
    const now = bayGio();
    // `genId` chỉ được điền trong `doc()`; Boss có thể gõ TRƯỚC nhịp quét đầu
    // tiên (và test thì không gọi `nhip()` tay trước đó) — đọc lại cho chắc.
    if (genId === null) doc();
    /*
     * Cắt **MỌI hoạt động đang chạy**, không chỉ hoạt động do máy này sinh ra.
     *
     * Bản đầu gác bằng cờ `dangChay` (= "lượt này của tôi") và đo thật trên
     * Firefox bắt đúng lỗi đó: Boss gõ giữa một `actor.activity` do **não/bảng
     * lệnh** gọi thì KHÔNG có `actor.activityCancelled` nào, Nhi đi tiếp hết
     * vòng dạo (`{activity:"di-dao", state:"walking"}` sau khi Boss đã gõ).
     *
     * Luật đúng: **một hoạt động không bao giờ là việc gấp.** Boss gõ/nói là
     * cần Nhi chú ý ngay, nên hoạt động nhường chỗ bất kể ai đặt nó. Điều này
     * KHÔNG phá "lệnh não > phản xạ": mọi lệnh não khác (`moveTo`, `say`,
     * `play`…) vẫn chạy nguyên, chỉ riêng chuỗi hoạt động bị cắt — và chính
     * lệnh `actor.activity` cũng đã theo luật "lệnh sau thắng" (gọi hoạt động
     * mới thì cắt hoạt động cũ).
     */
    if (genId) {
      if (huyHoatDong(genId) !== null) {
        soCat++;
        dangChay = false;
        tXongLuot = now;
      }
    }
    tRanhTu = now;
  }

  /** Bảng trừ hoạt động vừa làm (không lặp lại cái vừa xong). */
  function ungVien(): readonly HoatDong[] {
    const ds = BANG_HOAT_DONG.filter((h) => h.id !== lanTruoc);
    return ds.length ? ds : BANG_HOAT_DONG;
  }

  function batDauMot(gen: string, now: number): void {
    const h = chon(ungVien());
    lanTruoc = h.id;
    dangChay = true;
    soLuot++;
    tRanhTu = now;
    void dispatcher
      .run('actor.activity', { actor: gen, name: h.id }, NGUON_TU_SINH)
      .then((kq) => {
        // Lệnh trả `ok:false` (actor vừa bị xoá, hoạt động lạ) thì đừng treo
        // cờ `dangChay` mãi — không có `actor.activityDone` nào tới cả.
        if (!kq.ok) {
          dangChay = false;
          tXongLuot = bayGio();
        }
      });
  }

  function nhip(): void {
    const { st, gen } = doc();
    if (!gen) return;
    const g = st.actors.find((a) => a.id === gen);
    if (!g) return;
    const now = bayGio();

    /* 1. Đang chạy hoạt động của mình → không làm gì, chờ sự kiện xong/cắt.
       Sổ chung là nguồn sự thật: hoạt động bị `actor.stop` cắt (không qua
       `huyHoatDong`) thì sổ đã trống, cờ phải theo. */
    if (dangChay) {
      if (layHoatDong(gen) === null) {
        dangChay = false;
        tXongLuot = now;
        tRanhTu = now;
      }
      return;
    }

    /* 2. Nhi đang bận vì việc của NGƯỜI KHÁC (não, Boss, phản xạ) → khoảng
          rảnh bắt đầu lại từ đây. Xem ghi chú đầu file: đây là thước đo duy
          nhất đúng cho mọi đường vào. */
    if (dispatcher.dangBan(gen) || g.state !== 'idle' || layHoatDong(gen) !== null) {
      tRanhTu = now;
      return;
    }

    /* 3. Đủ rảnh + đã nghỉ đủ sau lượt trước → tự sinh một hoạt động. */
    if (now - tRanhTu < so.ranhMs) return;
    if (tXongLuot !== 0 && now - tXongLuot < so.nghiGiuaMs) return;
    batDauMot(gen, now);
  }

  /* ---------------------------------------------------------- người nghe bus */

  const boNghe: Array<() => void> = [];

  /**
   * Boss gõ / Boss bắt đầu nói / lớp hiểu lệnh khớp một mệnh lệnh.
   *
   * `user.listening` (I1 #74) là mốc SỚM NHẤT có được: Boss vừa bấm mic, chữ
   * còn 3–18 s nữa mới có. Cắt từ đây thì tới lúc có chữ Nhi đã rảnh sẵn.
   */
  for (const ten of ['user.text', 'user.speech', 'user.listening', 'user.command']) {
    boNghe.push(bus.on(ten, () => coNguoiGoi()));
  }

  /**
   * Não (hay bảng lệnh, hay ws) vừa xếp hàng một lệnh sau bước đang chạy.
   *
   * Lệnh của chính hoạt động KHÔNG bao giờ xếp hàng (chuỗi `await` từng bước),
   * nên `cmd.queued` cho Nhi trong lúc đang tự sinh hoạt chắc chắn là của
   * người khác → nhường chỗ ngay.
   */
  boNghe.push(
    bus.on('cmd.queued', (e) => {
      const gen = genId ?? doc().gen;
      if (e.data.actor !== gen) return;
      // Bước của CHÍNH hoạt động xếp hàng sau một cú chêm của phản xạ — không
      // phải ai xen vào (xem `dangGuiBuoc` trong `hoat-dong.ts`).
      if (dangGuiBuoc(String(gen))) return;
      coNguoiGoi();
    }),
  );

  /** Hoạt động xong tử tế → tính giờ nghỉ giữa hai lượt. */
  for (const ten of ['actor.activityDone', 'actor.activityCancelled']) {
    boNghe.push(
      bus.on(ten, (e) => {
        if (e.data.actor !== (genId ?? doc().gen)) return;
        dangChay = false;
        tXongLuot = bayGio();
        tRanhTu = bayGio();
      }),
    );
  }

  const hen = setInterval(nhip, so.nhipMs);
  // không giữ tiến trình Node sống chỉ vì nhịp quét (test chạy trong vitest)
  (hen as unknown as { unref?: () => void }).unref?.();

  return {
    nhip,
    trangThai: () => ({
      gen: genId,
      dangChay,
      hoatDong: genId ? layHoatDong(genId) : null,
      lanTruoc,
      soLuot,
      soCat,
      ranhMs: Math.max(0, bayGio() - tRanhTu),
    }),
    dung() {
      clearInterval(hen);
      for (const h of boNghe) h();
    },
  };
}
