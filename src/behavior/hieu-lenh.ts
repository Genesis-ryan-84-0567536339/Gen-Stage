/**
 * hieu-lenh.ts — LỚP HIỂU LỆNH GIỌNG (C2, Issue #32).
 *
 * Sếp gọi tên nhân vật rồi ra lệnh bằng tiếng Việt; lớp này nghe `user.text`
 * (Sếp gõ) và `user.speech` (Sếp nói, đã thành chữ), khớp với **bảng mẫu câu**
 * trong `ngu-phap.ts` rồi gọi `dispatcher.run(..., 'giong')`. Không LLM, không
 * gọi mạng, chạy trong trình duyệt dưới 50 ms.
 *
 * Ba quyết định xương sống:
 *
 * 1. **Quyết định khớp phải ĐỒNG BỘ.** Sự kiện `user.text` được bus phát đồng
 *    bộ tới mọi người nghe (kể cả cầu nối ws đẩy sang não). Muốn đánh dấu
 *    `handled: true` để não không trả lời chồng lên lệnh vừa chạy thì phải
 *    đánh dấu NGAY trong handler, không được `await` gì trước đó. Vì vậy danh
 *    sách place / emote / màn hình / module được **giữ sẵn trong bộ đệm**
 *    (`lamMoi`, tự cập nhật theo sự kiện sân khấu), còn thứ phải đo
 *    tươi (Sếp đang đứng đâu, ghế nào gần) thì để **sentinel** và giải nghĩa ở
 *    bước gọi lệnh — lúc đó `await` thoải mái.
 *
 * 2. **Không bắn `user.text` hai lần.** Lớp này KHÔNG bắn lại sự kiện nào;
 *    khớp được thì nó chỉ thêm `handled: true` vào đúng `data` của sự kiện
 *    `user.text`/`user.speech` đang chảy, và bắn thêm **`user.command`** cho ai
 *    muốn nghe "lệnh đã hiểu". Não (C-não / `nao-demo`) bỏ qua mọi `user.text`
 *    có `handled: true` — ghi trong spec mục 3.6.
 *
 * 3. **Nam không có não.** Câu tự do gửi cho Nam (tên hiển thị của `owner`,
 *    nhân vật nam) được lớp này trả lời bằng giọng nam rồi đánh dấu `handled`
 *    — không đẩy sang não. Câu tự do cho Nhi (`gen`) thì **giữ nguyên** luồng
 *    cũ (`user.text` → não qua MCP), lớp này không chạm vào.
 */
import type { Dispatcher } from '../api/dispatcher';
import type { EventBusLike, StageEvent, StageState } from '../api/types';
import {
  BANG_MAU_CAU,
  BI_DANH_EMOTE,
  BI_DANH_MAN_HINH,
  BI_DANH_MOI_NGUOI,
  BI_DANH_PLACE,
  CAU_CHUA_HIEU,
  CHO_SEP,
  GHE_GAN_NHAT,
  GOC_MAY_KE,
  XAC_NHAN,
  boDau,
  gan,
  tach,
  type LenhRa,
  type MauCau,
  type Slot,
} from './ngu-phap';
import { BI_DANH_NHAN_VAT, TEN_HIEN_THI } from '../stage/noi-dung';

/* ------------------------------------------------------------- bối cảnh */

/** Ảnh chụp những gì đang có trên sân khấu — máy khớp đọc, không tự đi tìm. */
export interface BoiCanh {
  /** `{ id, controlledBy }` của từng nhân vật. */
  actors: { id: string; controlledBy: string }[];
  places: { id: string; kind: string }[];
  emotes: string[];
  screens: string[];
  props: string[];
  gocMay: string[];
}

export const BOI_CANH_TRONG: BoiCanh = {
  actors: [],
  places: [],
  emotes: [],
  screens: [],
  props: [],
  gocMay: [],
};

/* -------------------------------------------------------------- kết quả */

export interface KetQuaHieu {
  /** Câu gốc. */
  text: string;
  /** Người nhận đã tách ra (id actor), theo thứ tự diễn. */
  nguoiNhan: string[];
  /** Sếp có gọi tên không (false = dùng người nhận mặc định). */
  coGoiTen: boolean;
  /** Gọi "mọi người / cả hai / tất cả". */
  moiNguoi: boolean;
  /** Khớp được mẫu câu nào (null = câu tự do). */
  mau: string | null;
  /** Lệnh sinh ra (một lệnh cho mỗi người nhận với mẫu `canActor`). */
  lenh: LenhRa[];
  /** Câu nhân vật nhắc lại lệnh đã hiểu (có dấu). */
  nhacLai: string | null;
  /** Điểm khớp (để gỡ lỗi / so mẫu). */
  diem: number;
}

/* ------------------------------------------------------ tách người nhận */

interface TachNguoiNhan {
  nguoiNhan: string[];
  coGoiTen: boolean;
  moiNguoi: boolean;
  /** Câu còn lại sau khi bỏ tên người được gọi. */
  conLai: { goc: string[]; sach: string[] };
}

/** Người nhận mặc định khi Sếp không gọi tên: Gen (Issue #32). */
export const NGUOI_NHAN_MAC_DINH = 'gen';

/**
 * G2 (28/10) — tên hiển thị trùng từ Việt thường: KHÔNG được tự thêm làm bí
 * danh trần một từ trong `bangBiDanh` (bình thường `TEN_HIEN_THI[id]` luôn
 * được thêm — đúng cho "Javis"/"Gen" cũ, nhưng "Nam"/"Nhi" thì "nam châm"/
 * "nhí nhảnh" sẽ bị hiểu nhầm là gọi tên). Bị loại ở đây thì nhân vật đó vẫn
 * gọi được bằng tên mới qua các cụm an toàn khai tay trong `BI_DANH_NHAN_VAT`
 * ("nam ơi", "anh nam"…) và qua bước 1b (gọi trần + dấu phẩy ở đầu câu).
 */
const TEN_HIEN_THI_MO_HO = new Set(['nam', 'nhi']);

function bangBiDanh(bc: BoiCanh): { id: string; cum: string[][] }[] {
  const ra: { id: string; cum: string[][] }[] = [];
  for (const a of bc.actors) {
    const tenHienThi = boDau(TEN_HIEN_THI[a.id] ?? a.id);
    const cum = new Set<string>([a.id]);
    if (!TEN_HIEN_THI_MO_HO.has(tenHienThi)) cum.add(tenHienThi);
    for (const b of BI_DANH_NHAN_VAT[a.id] ?? []) cum.add(boDau(b));
    ra.push({
      id: a.id,
      cum: [...cum].map((c) => c.split(/\s+/).filter(Boolean)),
    });
  }
  // cụm dài trước: "hai nguoi" phải thắng "nguoi"
  for (const r of ra) r.cum.sort((x, y) => y.length - x.length);
  return ra;
}

/**
 * Tìm tên người được gọi ở bất kỳ đâu trong câu rồi cắt nó ra.
 *
 * `textGoc` (câu NGUYÊN VĂN, có dấu câu) chỉ cần cho bước 1b (gọi trần "Nam,"/
 * "Nhi," ở đầu câu — dấu phẩy đã bị `tach()` ăn mất khỏi `cau`); không truyền
 * thì bước đó coi như không khớp, không ảnh hưởng gì khác.
 */
export function tachNguoiNhan(
  cau: { goc: string[]; sach: string[] },
  bc: BoiCanh,
  textGoc?: string,
): TachNguoiNhan {
  const ds = bangBiDanh(bc);
  const idOwner = bc.actors.find((a) => a.controlledBy === 'owner')?.id ?? 'owner';
  const idGen =
    bc.actors.find((a) => a.controlledBy !== 'owner')?.id ?? NGUOI_NHAN_MAC_DINH;

  // 1) "mọi người / cả hai / tất cả" → cả hai nhân vật, Nam (owner) diễn trước
  for (const cum of BI_DANH_MOI_NGUOI.map((c) => c.split(' '))) {
    const vt = timCum(cau.sach, cum);
    if (vt < 0) continue;
    return {
      nguoiNhan: [idOwner, idGen],
      coGoiTen: true,
      moiNguoi: true,
      conLai: cat(cau, vt, cum.length),
    };
  }

  /**
   * 1b. G2 (28/10) — "Nam," / "Nhi," TRẦN ở ĐÚNG ĐẦU CÂU, có dấu phẩy ngay
   * sau. "nam"/"nhi" là từ tiếng Việt thường (xem chú thích `BI_DANH_NHAN_VAT`
   * trong `noi-dung.ts`) nên KHÔNG được khai vào bảng bí danh chung (máy khớp
   * `timCum` ở bước 2 tìm cụm ở bất kỳ đâu trong câu — khai trần thì "nam
   * châm" cũng dính). Cụm có "ơi"/"à"/"anh"/"em" đã an toàn ở MỌI vị trí nên
   * nằm thẳng trong bí danh; chỉ dạng "gọi trần + phẩy" này cần ràng buộc vị
   * trí riêng — và dấu phẩy chỉ còn lại trong `goc` (`sach` đã mất dấu câu khi
   * `tach()` chạy), nên phải soi câu GỐC, không soi `cau.sach[0]`.
   */
  const goiTranDauCau = textGoc ? /^\s*(nam|nhi)\s*,/i.exec(boDau(textGoc)) : null;
  if (goiTranDauCau) {
    const tenTran = goiTranDauCau[1];
    return {
      nguoiNhan: [tenTran === 'nam' ? idOwner : idGen],
      coGoiTen: true,
      moiNguoi: false,
      conLai: cat(cau, 0, 1),
    };
  }

  /**
   * 2) gọi đúng tên một người — lấy tên xuất hiện **sớm nhất** trong câu.
   *
   * "Nhi, nhìn Nam" có hai tên: người nhận là người được gọi ở đầu câu, tên
   * còn lại là mục tiêu của lệnh. Quét theo thứ tự danh sách actor thì Nam
   * (actor đầu tiên của sân khấu) ăn mất chỗ của Nhi.
   */
  let som: { id: string; vt: number; dai: number } | null = null;
  for (const nv of ds) {
    for (const cum of nv.cum) {
      const vt = timCum(cau.sach, cum);
      if (vt < 0) continue;
      if (!som || vt < som.vt || (vt === som.vt && cum.length > som.dai)) {
        som = { id: nv.id, vt, dai: cum.length };
      }
    }
  }
  if (som) {
    return {
      nguoiNhan: [som.id],
      coGoiTen: true,
      moiNguoi: false,
      conLai: cat(cau, som.vt, som.dai),
    };
  }

  // 3) không gọi tên → Gen
  const mac = bc.actors.some((a) => a.id === NGUOI_NHAN_MAC_DINH)
    ? NGUOI_NHAN_MAC_DINH
    : idGen;
  return { nguoiNhan: [mac], coGoiTen: false, moiNguoi: false, conLai: cau };
}

function timCum(toks: string[], cum: string[]): number {
  for (let i = 0; i + cum.length <= toks.length; i++) {
    let ok = true;
    for (let k = 0; k < cum.length; k++) {
      if (!gan(toks[i + k], cum[k])) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function cat(
  cau: { goc: string[]; sach: string[] },
  tu: number,
  dai: number,
): { goc: string[]; sach: string[] } {
  return {
    goc: [...cau.goc.slice(0, tu), ...cau.goc.slice(tu + dai)],
    sach: [...cau.sach.slice(0, tu), ...cau.sach.slice(tu + dai)],
  };
}

/* ------------------------------------------------------------ khớp slot */

/** Danh sách ứng viên của một slot: id + mọi cụm từ gọi được nó. */
function ungVien(ten: string, bc: BoiCanh): { id: string; cum: string[][] }[] {
  const tu = (
    ds: string[],
    biDanh: Record<string, string[]> = {},
  ): { id: string; cum: string[][] }[] =>
    ds.map((id) => {
      const cum = new Set<string>([boDau(id).replace(/-/g, ' ')]);
      for (const b of biDanh[id] ?? []) cum.add(boDau(b));
      return {
        id,
        cum: [...cum]
          .map((c) => c.split(/\s+/).filter(Boolean))
          .sort((x, y) => y.length - x.length),
      };
    });

  switch (ten) {
    case 'place':
      return tu(
        bc.places.map((p) => p.id),
        BI_DANH_PLACE,
      );
    case 'emote':
      return tu(bc.emotes, BI_DANH_EMOTE);
    case 'man hinh':
      return tu(bc.screens, BI_DANH_MAN_HINH);
    case 'module':
      return tu(bc.props);
    /**
     * `<ai>` = NGƯỜI nghe: nhân vật, hoặc `camera` (= Sếp). Dùng cho tham số
     * `to` của `actor.say` (đồng bộ với C0 — phản xạ nhìn người đang nói).
     */
    case 'ai':
      return [
        ...tu(
          bc.actors.map((a) => a.id),
          BI_DANH_NHAN_VAT,
        ),
        ...tu(['camera']),
      ];
    case 'muc tieu':
      return [
        ...tu(
          bc.actors.map((a) => a.id),
          BI_DANH_NHAN_VAT,
        ),
        ...tu(
          bc.places.map((p) => p.id),
          BI_DANH_PLACE,
        ),
        ...tu(['camera']),
      ];
    default:
      return [];
  }
}

/** Slot ăn hết phần còn lại của câu (giữ nguyên dấu): `<ten>`, `<loi>`. */
const SLOT_TU_DO = new Set(['ten', 'loi']);

interface KhopSlot {
  gia: string;
  dai: number;
}

/**
 * MỌI cách đọc một slot ở vị trí `tu`, **cụm dài nhất trước**.
 *
 * Trả về danh sách thay vì một đáp án vì cụm dài nhất không chắc đúng: bí danh
 * emote `suy nghi di` ăn luôn chữ "đi" nên mẫu `<emote> di` hết chỗ khớp, trong
 * khi cách đọc ngắn hơn (`suy nghi`) mới là cách đúng. Máy khớp mẫu thử lần
 * lượt (xem `khopMauCau`).
 */
function khopSlotDs(
  ten: string,
  cau: { goc: string[]; sach: string[] },
  tu: number,
  bc: BoiCanh,
): KhopSlot[] {
  if (SLOT_TU_DO.has(ten)) {
    if (tu >= cau.goc.length) return [];
    return [{ gia: cau.goc.slice(tu).join(' '), dai: cau.goc.length - tu }];
  }
  const ra: KhopSlot[] = [];
  for (const uv of ungVien(ten, bc)) {
    for (const cum of uv.cum) {
      if (tu + cum.length > cau.sach.length) continue;
      let ok = true;
      for (let k = 0; k < cum.length; k++) {
        if (!gan(cau.sach[tu + k], cum[k])) {
          ok = false;
          break;
        }
      }
      if (ok && !ra.some((r) => r.gia === uv.id && r.dai === cum.length)) {
        ra.push({ gia: uv.id, dai: cum.length });
      }
    }
  }
  return ra.sort((x, y) => y.dai - x.dai);
}

/* ------------------------------------------------------------ khớp mẫu câu */

interface KhopMau {
  slot: Slot;
  diem: number;
}

/**
 * Khớp một mẫu câu với câu của Sếp, **cho phép bỏ qua từ lạ**.
 *
 * Sếp nói "Nam ơi, đi tới cái bàn điều khiển giúp em nhé" thì mẫu
 * `di toi <place>` vẫn phải khớp. Vì vậy máy đi tuần tự theo mẫu, mỗi phần tử
 * được quét tới trước trong câu; từ nào trong câu không dùng tới thì bị trừ
 * điểm nhẹ. Mẫu **cụ thể hơn** (nhiều từ khoá hơn, bỏ qua ít hơn) điểm cao hơn,
 * nên "dung lai san khau" luôn thắng "dung lai".
 */
export function khopMauCau(
  mau: string,
  cau: { goc: string[]; sach: string[] },
  bc: BoiCanh,
): KhopMau | null {
  const phanTu = mau.match(/<[^>]+>|[^\s<>]+/g) ?? [];

  /** Khớp từ phần tử thứ `k` của mẫu, bắt đầu quét câu từ `i`. */
  function tiep(k: number, i: number): { slot: Slot; diem: number; boQua: number } | null {
    if (k >= phanTu.length) {
      return { slot: {}, diem: 0, boQua: cau.sach.length - i };
    }
    const pt = phanTu[k];
    let tot: { slot: Slot; diem: number; boQua: number } | null = null;

    for (let j = i; j < cau.sach.length; j++) {
      if (pt.startsWith('<')) {
        const ten = pt.slice(1, -1);
        /**
         * Slot có DANH SÁCH thật (place/emote/màn hình/module) đáng 3 điểm:
         * khớp được nghĩa là Sếp gọi đúng một thứ đang có trên sân khấu. Slot
         * TỰ DO (`<ten>`, `<loi>`) chỉ đáng 1 điểm vì nó ăn hết phần còn lại
         * của câu — không thì "làm gì" cũng thành `module.build`.
         */
        const diemSlot = SLOT_TU_DO.has(ten) ? 1 : 3;
        for (const r of khopSlotDs(ten, cau, j, bc)) {
          const sau = tiep(k + 1, j + r.dai);
          if (!sau) continue;
          const ung = {
            slot: { ...sau.slot, [ten]: r.gia },
            diem: diemSlot + sau.diem,
            boQua: j - i + sau.boQua,
          };
          if (!tot || diemThat(ung) > diemThat(tot)) tot = ung;
        }
      } else if (gan(cau.sach[j], pt)) {
        const sau = tiep(k + 1, j + 1);
        if (sau) {
          const ung = {
            slot: sau.slot,
            diem: 2 + sau.diem,
            boQua: j - i + sau.boQua,
          };
          if (!tot || diemThat(ung) > diemThat(tot)) tot = ung;
        }
      }
      // không `break`: còn phải thử vị trí sau (từ lạ giữa câu bị bỏ qua)
    }
    return tot;
  }

  const kq = tiep(0, 0);
  if (!kq) return null;
  return { slot: kq.slot, diem: diemThat(kq) };
}

/** Điểm thật = điểm khớp trừ phần câu không dùng tới (mỗi từ lạ −0,7). */
function diemThat(x: { diem: number; boQua: number }): number {
  return x.diem - x.boQua * 0.7;
}

/* ---------------------------------------------------------------- phân tích */

/** Đọc một câu của Sếp → người nhận + lệnh. Hàm **thuần**, test gọi trực tiếp. */
export function phanTich(text: string, bc: BoiCanh): KetQuaHieu {
  const cau = tach(text);
  const nn = tachNguoiNhan(cau, bc, text);
  const chung = {
    text,
    nguoiNhan: nn.nguoiNhan,
    coGoiTen: nn.coGoiTen,
    moiNguoi: nn.moiNguoi,
  };

  if (!nn.conLai.sach.length) {
    // chỉ gọi tên, không có lệnh → coi là gọi: nhân vật "dạ" cho biết đang nghe
    return { ...chung, mau: null, lenh: [], nhacLai: null, diem: 0 };
  }

  let tot: { mc: MauCau; k: KhopMau } | null = null;
  for (const mc of BANG_MAU_CAU) {
    for (const m of mc.mau) {
      const k = khopMauCau(m, nn.conLai, bc);
      if (!k) continue;
      if (!tot || k.diem > tot.k.diem) tot = { mc, k };
    }
  }

  // ngưỡng: phải khớp ít nhất một từ khoá/slot và không bỏ qua quá nhiều
  if (!tot || tot.k.diem < 1.5) {
    return { ...chung, mau: null, lenh: [], nhacLai: null, diem: tot?.k.diem ?? 0 };
  }

  const lenh = tot.mc.canActor
    ? nn.nguoiNhan.map((a) => tot!.mc.tao(tot!.k.slot, a))
    : [tot.mc.tao(tot.k.slot, nn.nguoiNhan[0] ?? '')];

  return {
    ...chung,
    mau: tot.mc.id,
    lenh,
    nhacLai: tot.mc.nhacLai(tot.k.slot),
    diem: tot.k.diem,
  };
}

/* ------------------------------------------------------- lệnh cuối (describe) */

export interface LenhCuoi {
  text: string;
  actor: string;
  cmd: string | null;
  matched: boolean;
  t: number;
}

let lenhCuoiBan: LenhCuoi | null = null;

/** `stage.describe().lastCommand` — câu giọng gần nhất và lệnh đã hiểu. */
export function lenhCuoi(): LenhCuoi | null {
  return lenhCuoiBan;
}

/** Dọn cho test. */
export function xoaLenhCuoi(): void {
  lenhCuoiBan = null;
}

/* ------------------------------------------------------------------ lớp chạy */

export interface HieuLenh {
  /** Bối cảnh đang dùng (test/bằng chứng đọc được). */
  boiCanh(): BoiCanh;
  /** Nạp lại danh sách place/emote/màn hình/module từ `stage.bootstrap`. */
  lamMoi(): Promise<void>;
  /** Xử lý một câu như vừa nghe được (bằng chứng Playwright dùng). */
  nghe(text: string, nguon?: string): Promise<KetQuaHieu>;
  thao(): void;
}

/**
 * Bật lớp hiểu lệnh. Gọi MỘT lần trong `main.ts`, **trước** khi cầu nối ws
 * đăng ký người nghe `'*'`, để cờ `handled` kịp có mặt lúc sự kiện đi ra ngoài.
 */
export function batHieuLenh(
  dispatcher: Dispatcher,
  bus: EventBusLike,
  toast?: (chu: string) => void,
): HieuLenh {
  let bc: BoiCanh = { ...BOI_CANH_TRONG };
  let demXacNhan = 0;
  let demGocMay = 0;
  /** Câu do chính lớp này cho nhân vật nói — nghe lại thì bỏ qua, không lặp. */
  const tuNoi = new Set<string>();
  /**
   * Chống nghe một câu hai lần.
   *
   * Cùng một câu của Sếp có thể tới bằng HAI sự kiện: `user.speech` (mic của
   * C1) rồi `user.text` (chính câu đó được `actor.say` lên nhân vật owner).
   * Không chặn thì lệnh chạy hai lần. Cửa sổ 2 s: Sếp lặp đúng từng chữ trong
   * 2 s là chuyện gần như không có, còn hai sự kiện của **một** câu thì luôn
   * cách nhau vài chục mili giây.
   */
  const ganDay = new Map<string, number>();
  const CUA_SO_LAP = 2000;
  const huy: (() => void)[] = [];

  async function lamMoi(): Promise<void> {
    const kq = await dispatcher.run('stage.bootstrap', {}, 'giong');
    if (!kq.ok) return;
    const b = kq.result as {
      commands: { cmd: string; params: { name: string; values?: string[] }[] }[];
      places: { id: string; kind: string }[];
      emotes: string[];
      screens: string[];
      props: string[];
    };
    const st = await dispatcher.run('stage.describe', {}, 'giong');
    const actors = st.ok
      ? (st.result as unknown as StageState).actors.map((a) => ({
          id: a.id,
          controlledBy: a.controlledBy ?? 'agent',
        }))
      : bc.actors;
    const gocMay =
      b.commands
        .find((c) => c.cmd === 'camera.preset')
        ?.params.find((p) => p.name === 'name')?.values ?? bc.gocMay;
    bc = {
      actors,
      places: b.places ?? [],
      emotes: b.emotes ?? [],
      screens: b.screens ?? [],
      props: b.props ?? [],
      gocMay,
    };
  }

  /**
   * `actor.say` có tham số `to?: actorId | "camera"` hay chưa (C0 — phản xạ
   * nhìn người đang nói). `validate.ts` **chặn tham số lạ**, nên khi nhánh C0
   * chưa merge thì phải bỏ `to` đi chứ không được gửi đại.
   */
  function coThamSoTo(): boolean {
    return (
      dispatcher.registry.get('actor.say')?.params.some((p) => p.name === 'to') === true
    );
  }

  /** Thay sentinel bằng số đo TƯƠI (chỗ Sếp đứng, ghế gần nhất, góc máy kế). */
  async function giaiNghia(l: LenhRa): Promise<LenhRa> {
    const args = { ...l.args };
    if ('to' in args && l.cmd === 'actor.say' && !coThamSoTo()) delete args.to;
    const canSep = args.to === CHO_SEP;
    const canGhe = args.seat === GHE_GAN_NHAT;
    if (canSep || canGhe) {
      const kq = await dispatcher.run('stage.describe', {}, 'giong');
      const st = kq.ok ? (kq.result as unknown as StageState) : null;
      if (canSep) {
        const sep = st?.actors.find((a) => a.controlledBy === 'owner');
        args.to = sep ? `${sep.pos[0]}, ${sep.pos[1]}, ${sep.pos[2]}` : 'buc-trung-tam';
      }
      if (canGhe) {
        const ai = st?.actors.find((a) => a.id === args.actor);
        const ghe = (st?.places ?? [])
          .filter((p) => p.kind === 'seat')
          .map((p) => ({
            id: p.id,
            d: ai ? khoangCachPos(ai.pos, p.pos) : 0,
          }))
          .sort((x, y) => x.d - y.d)[0];
        args.seat = ghe?.id ?? 'ghe-1';
      }
    }
    if (args.name === GOC_MAY_KE) {
      const ds = bc.gocMay.length ? bc.gocMay : ['toan-canh'];
      args.name = ds[demGocMay++ % ds.length];
    }
    return { cmd: l.cmd, args };
  }

  /** Cho nhân vật nói một câu của chính lớp này (không để não nghe lại). */
  async function noiHo(actor: string, cau: string): Promise<void> {
    tuNoi.add(cau);
    const kq = await dispatcher.run(
      'actor.say',
      {
        actor,
        text: cau,
        interrupt: true,
        // xác nhận là nói VỚI SẾP → `to: 'camera'` (bỏ đi nếu C0 chưa merge)
        ...(coThamSoTo() ? { to: 'camera' } : {}),
      },
      'giong',
    );
    if (!kq.ok) tuNoi.delete(cau);
  }

  /** Một câu đã nghe: quyết định ĐỒNG BỘ, chạy lệnh thì không đồng bộ. */
  function xuLy(text: string, data: Record<string, unknown> | null): KetQuaHieu {
    const kq = phanTich(text, bc);
    lenhCuoiBan = {
      text,
      actor: kq.nguoiNhan[0] ?? '',
      cmd: kq.lenh[0]?.cmd ?? null,
      matched: kq.mau !== null,
      t: Date.now(),
    };

    const javisTuDo =
      kq.mau === null &&
      kq.nguoiNhan.length === 1 &&
      bc.actors.find((a) => a.id === kq.nguoiNhan[0])?.controlledBy === 'owner';

    if (kq.mau === null && !javisTuDo) {
      /*
       * Nhi (gen) nghe câu tự do → giữ nguyên luồng cũ: `user.text` chảy tới não.
       *
       * G3 (#62) — THÊM MỘT TRƯỜNG, KHÔNG ĐỔI LUỒNG. Boss gọi đúng tên nhân
       * vật mà không mẫu nào khớp thì gần như chắc đó là **lệnh nói kiểu đời
       * thường** chứ không phải câu hỏi: log thật 28/10 có "tôi kêu hai bạn
       * qua hồi đi mà dính dáng hồi đi" — engine nghe nát, mẫu nào cũng trượt,
       * nhưng rõ ràng Boss đang sai việc chứ không trò chuyện.
       *
       * Nên đánh dấu `hint: 'co-the-la-lenh'` để não biết **trả lời ngắn và
       * hỏi lại** thay vì tán chuyện. Cố tình KHÔNG đặt `handled` và KHÔNG tự
       * đoán lệnh: đoán sai là Nhi làm sai việc, mà "hỏi lại một câu" thì
       * không mất gì. `diem` đi kèm để não/Issue biết nó trượt ngưỡng bao xa.
       */
      if (data && kq.coGoiTen) {
        data.hint = 'co-the-la-lenh';
        data.diem = kq.diem;
      }
      return kq;
    }

    // khớp rồi (hoặc Nam phải tự trả lời) → não bỏ qua câu này
    if (data) data.handled = true;
    bus.emit('user.command', {
      text,
      actors: kq.nguoiNhan,
      cmd: kq.lenh[0]?.cmd ?? null,
      args: kq.lenh[0]?.args ?? null,
      mau: kq.mau,
      matched: kq.mau !== null,
      nhacLai: kq.nhacLai,
    });

    /**
     * Chạy lệnh ở **nhịp sau**, không chạy ngay trong handler.
     *
     * `actor.say` của câu xác nhận lại bắn `user.text` (Nam là tên hiển thị
     * của nhân vật `owner`), mà `EventBus.emit` gọi người nghe theo tên trước rồi mới tới
     * người nghe `'*'`. Chạy ngay thì sự kiện xác nhận chen lên trước chính
     * sự kiện đang chảy: nhật ký và cầu nối ws nhận hai câu **ngược thứ tự**.
     * Lùi một microtask là mọi người nghe của câu gốc xong việc trước.
     */
    queueMicrotask(() => void chay(kq, javisTuDo));
    return kq;
  }

  async function chay(kq: KetQuaHieu, javisTuDo: boolean): Promise<void> {
    if (javisTuDo) {
      await noiHo(kq.nguoiNhan[0], CAU_CHUA_HIEU);
      toast?.(`🗣️ ${TEN_HIEN_THI[kq.nguoiNhan[0]] ?? kq.nguoiNhan[0]}: chưa hiểu lệnh`);
      return;
    }

    // 1) xác nhận ngắn bằng giọng + bong bóng nhắc lại lệnh đã hiểu
    const xn = XAC_NHAN[demXacNhan++ % XAC_NHAN.length];
    const nguoiXacNhan = kq.nguoiNhan[0];
    if (!kq.lenh.length) {
      await noiHo(nguoiXacNhan, `${xn}, Sếp cần gì ạ?`);
      return;
    }
    await noiHo(nguoiXacNhan, kq.nhacLai ? `${xn}, ${kq.nhacLai}` : xn);
    toast?.(`🗣️ ${kq.nhacLai ?? ''} → ${kq.lenh.map((l) => l.cmd).join(' · ')}`);

    // 2) chạy lệnh thật — qua dispatcher, nguồn `giong`
    for (const l of kq.lenh) {
      const that = await giaiNghia(l);
      await dispatcher.run(that.cmd, that.args, 'giong');
    }
  }

  function nghe(e: StageEvent): void {
    const d = e.data as Record<string, unknown>;
    const text = typeof d.text === 'string' ? d.text : '';
    if (!text.trim()) return;
    if (d.handled === true) return;
    // câu của chính mình vừa cho nhân vật nói → đánh dấu để não bỏ qua, hết
    const sach = text.trim();
    if (tuNoi.has(sach)) {
      tuNoi.delete(sach);
      d.handled = true;
      return;
    }
    const truoc = ganDay.get(sach);
    const now = Date.now();
    if (truoc !== undefined && now - truoc < CUA_SO_LAP) {
      // đã xử lý câu này ở sự kiện trước (speech → text): chỉ truyền lại cờ
      if (lenhCuoiBan?.text === sach && lenhCuoiBan.matched) d.handled = true;
      return;
    }
    ganDay.set(sach, now);
    for (const [k, t] of ganDay) if (now - t > CUA_SO_LAP * 5) ganDay.delete(k);
    xuLy(text, d);
  }

  huy.push(bus.on('user.text', nghe));
  huy.push(bus.on('user.speech', nghe));
  for (const ev of [
    'stage.ready',
    'stage.reset',
    'actor.spawned',
    'actor.removed',
    'prop.spawned',
    'prop.removed',
    'module.built',
    'screen.spawned',
  ]) {
    huy.push(bus.on(ev, () => void lamMoi()));
  }

  return {
    boiCanh: () => bc,
    lamMoi,
    nghe: async (text: string) => {
      const kq = xuLy(text, null);
      await new Promise((r) => setTimeout(r, 0));
      return kq;
    },
    thao: () => {
      for (const h of huy) h();
    },
  };
}

function khoangCachPos(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}
