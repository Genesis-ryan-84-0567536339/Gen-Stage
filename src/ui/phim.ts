/**
 * phim.ts — ĐIỀU KHIỂN BẰNG PHÍM (Issue #14).
 *
 * Boss 25/10: "không dùng phím để điều khiển hành động được". Lớp này thêm
 * bàn phím làm **mặt thứ ba** của cùng một bộ lệnh (sau bảng lệnh và bridge).
 *
 * Nguyên tắc cứng (spec mục 2): **mọi** phím đều đi qua `dispatcher.run` —
 * không có đường tắt nào gọi thẳng `world`. Nhờ vậy phím được ghi vào nhật ký,
 * được kiểm tham số, được xếp hàng/cắt ngang như lệnh của agent, và lệnh nào
 * còn là stub A2 (`actor.emote`) thì phím chỉ hiện toast lỗi nhẹ chứ không
 * crash — A2 merge xong là phím tự chạy, không phải sửa file này.
 *
 * Bảng phím:
 *   WASD / ↑←↓→  LÁI nhân vật owner (giữ = đi liên tục, nhả = dừng êm)
 *   1…9, 0       10 emote đầu trong `EMOTES`
 *   Space        mở ô nhập nhanh để nói (Enter gửi, Esc huỷ)
 *   V (giữ)      GIỮ ĐỂ NÓI — mic → bridge nhận dạng → ô chat (`src/audio/mic.ts`)
 *   C            xoay vòng `camera.preset`
 *   E            `module.build` một module mẫu
 *   R            `stage.reset`
 *   ?            ẩn/hiện bảng gợi ý phím ở góc dưới trái
 */
import type { Dispatcher } from '../api/dispatcher';
import { EMOTES, PRESET_MAY } from '../stage/noi-dung';
import type { ActorSnapshot, StageState } from '../api/types';

/**
 * B1 (Issue #18 mục 2) — ĐIỀU KHIỂN BẰNG VẬN TỐC, không bằng từng bước đi.
 *
 * Bản #14 cũ gửi `actor.moveTo` tới một đích tích luỹ mỗi 420 ms kèm
 * `interrupt: true`. Boss xem thật và chốt "điều khiển chạy không mượt": mỗi
 * lệnh `moveTo` nội suy tuyến tính tới đích rồi lệnh sau cắt ngang giữa đường,
 * nên vận tốc nhảy bậc từng nhịp (và lúc nhả phím thì nhân vật còn lết tới
 * đích cũ).
 *
 * Giờ phím chỉ nói **hướng**: cứ `NHIP_STEER` ms gửi một `actor.steer` với
 * vector của các phím đang giữ. Gia tốc, giảm tốc, xoay mặt, kẹp tường và
 * tránh bàn đều nằm trong sân khấu (`NhanVat.lai` + `bo-cuc.ts`) — nơi duy
 * nhất biết đồng hồ khung hình.
 */
/**
 * F2 (#56 mục 2) — **GIA HẠN, không gối lệnh.**
 *
 * Bản B1 gửi một `actor.steer` mới mỗi 100 ms với hiệu lực 180 ms, cố ý cho
 * hai lệnh gối nhau. Đo trên Firefox GPU thật (60 FPS) thì cách đó là gốc của
 * "điều khiển loạn tùm lum":
 *   · mỗi lệnh mới **xé rồi dựng lại** hành động trong `NhanVat.lai` (nhả
 *     `viec`, xoá lớp clip, `state` nháy `walking → idle → walking`) — ở 60
 *     FPS là cứ 6 khung một lần, ở ~1 FPS của máy kiểm thì cả chục lệnh rơi
 *     vào cùng một khung nên **không để lại dấu nào trong bằng chứng cũ**;
 *   · 180 ms chỉ hơn nhịp 100 ms có 80 ms: một lượt GC hoặc một khung nặng là
 *     hạn cũ hết trước khi lệnh sau tới → vận tốc mục tiêu tụt về 0 rồi vọt
 *     lại 1,6 m/s. Đo được: 1,60 → 0,32 → 1,15 m/s trong 3 khung liền.
 *
 * Giờ: hiệu lực `HIEU_LUC_STEER` = 700 ms, gia hạn mỗi `NHIP_GIA_HAN` = 200 ms
 * (dư 3,5 lần biên an toàn) và `NhanVat.lai` **gia hạn tại chỗ** khi vector
 * không đổi — không tạo hành động mới. Đổi vector hoặc nhả phím thì gửi NGAY,
 * không chờ hết nhịp.
 */
const NHIP_GIA_HAN = 200;
/**
 * Hiệu lực một lệnh steer (ms). Đủ dài để không bao giờ hết hạn oan giữa hai
 * lượt gia hạn, nhưng vẫn là **dây an toàn**: nếu cả tab bị treo hoặc trang bị
 * bỏ (`pagehide`) mà không kịp gửi lệnh dừng, nhân vật tự dừng êm sau 0,7 s
 * chứ không đi mãi.
 */
const HIEU_LUC_STEER = 700;
/** Hiệu lực lệnh "dừng" lúc nhả phím (ms) — chỉ cần đủ cho `LERP_PHANH`. */
const HIEU_LUC_DUNG = 400;
/** Tốc độ lái tối đa (m/s) — khớp `TOC_DO_STEER` trong `nhanvat.ts`. */
const TOC_DO = 1.6;
/** 10 emote đầu gắn vào phím 1…9, 0. */
const EMOTE_PHIM = EMOTES.slice(0, 10);
/** Câu mẫu khi Boss bấm Space rồi Enter mà ô nhập trống. */
const CAU_MAU = 'Sếp gọi em có việc gì ạ?';

const HUONG: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export interface BanPhim {
  /** Tháo mọi listener (dùng khi test / hot reload). */
  thao(): void;
  /** Actor đang được phím điều khiển. */
  actor(): string;
  /** F2 — vector steer đã gửi lần cuối + có đang giữ phím nào không (test). */
  doPhim(): { vx: number; vz: number; giu: number; nhip: boolean };
}

/**
 * Đang gõ chữ ở đâu đó thì phím KHÔNG được coi là lệnh sân khấu.
 *
 * F2 — soi cả `shadowRoot`: ô chat/ô kịch bản của các đợt sau có thể nằm trong
 * web component, lúc đó `document.activeElement` chỉ trả về **thẻ bọc** chứ
 * không phải ô nhập bên trong, và WASD lại rơi vào sân khấu khi Boss đang gõ.
 */
function dangGoChu(): boolean {
  let el = document.activeElement as (HTMLElement & { shadowRoot?: ShadowRoot }) | null;
  for (let sau = 0; el && sau < 8; sau += 1) {
    const ten = el.tagName;
    if (
      ten === 'INPUT' ||
      ten === 'TEXTAREA' ||
      ten === 'SELECT' ||
      el.isContentEditable === true
    ) {
      return true;
    }
    const trong = el.shadowRoot?.activeElement as HTMLElement | null;
    if (!trong || trong === el) return false;
    el = trong as HTMLElement & { shadowRoot?: ShadowRoot };
  }
  return false;
}

export function batPhim(
  dispatcher: Dispatcher,
  toast: (chu: string) => void,
): BanPhim {
  /** Actor đang được phím lái — mặc định nhân vật có `controlledBy: "owner"`. */
  let actorId = 'owner';
  /** Mã phím hướng đang được giữ. */
  const dangGiu = new Set<string>();
  /** Hẹn giờ GIA HẠN lệnh steer đang chạy (0 = không chạy). */
  let henSteer = 0;
  /** Vector đã gửi lần cuối — để biết lúc nào phải gửi lệnh mới. */
  let daGuiVx = 0;
  let daGuiVz = 0;
  /** Đã gửi lệnh "dừng" rồi chưa (tránh bắn lặp khi blur + keyup cùng lúc). */
  let daGuiDung = true;
  let viPreset = 0;
  let soModule = 0;

  const { goiY, doiHienGoiY } = dungGoiY();
  const { moONhap, dangNhap, datTen } = dungONhap((chu) =>
    chay('actor.say', { actor: actorId, text: chu }),
  );

  /** Cửa duy nhất: mọi phím đều qua đây → `dispatcher.run`. */
  async function chay(cmd: string, args: Record<string, unknown>): Promise<boolean> {
    const kq = await dispatcher.run(cmd, args, 'phim');
    if (!kq.ok) toast(`⌨ ${cmd}: ${kq.error}`);
    return kq.ok;
  }

  /**
   * Tìm nhân vật Boss điều khiển: `controlledBy === "owner"`.
   *
   * Đọc qua `stage.describe` (vẫn là dispatcher) chứ không hard-code id: đợt
   * sau Boss đổi tên/đổi model thì phím tự bám đúng người, không phải sửa file
   * này. Không thấy ai là `owner` thì lấy actor đầu tiên.
   */
  async function capNhatChu(): Promise<void> {
    const kq = await dispatcher.run('stage.describe', {}, 'phim');
    if (!kq.ok) return;
    const st = kq.result as StageState;
    const chu: ActorSnapshot | undefined =
      st.actors.find((a) => a.controlledBy === 'owner') ?? st.actors[0];
    if (!chu) return;
    actorId = chu.id;
    datTen(chu.name);
  }

  /** Vector hướng từ các phím đang giữ, đã chuẩn hoá về `TOC_DO` m/s. */
  function vectorPhim(): [number, number] {
    let dx = 0;
    let dz = 0;
    for (const ma of dangGiu) {
      const h = HUONG[ma];
      if (h) {
        dx += h[0];
        dz += h[1];
      }
    }
    if (dx === 0 && dz === 0) return [0, 0];
    // chuẩn hoá: đi chéo (W+D) KHÔNG được nhanh hơn đi thẳng
    const dai = Math.hypot(dx, dz);
    return [(dx / dai) * TOC_DO, (dz / dai) * TOC_DO];
  }

  /**
   * Gửi (hoặc gia hạn) một lệnh steer theo vector hiện tại.
   *
   * `NhanVat.lai` nhận ra vector không đổi thì chỉ **đẩy hạn** của lần lái
   * đang chạy — nên gọi hàm này mỗi `NHIP_GIA_HAN` ms là rẻ, không xé lại
   * hành động, không làm `state` nháy.
   */
  function guiSteer(): void {
    const [vx, vz] = vectorPhim();
    daGuiVx = vx;
    daGuiVz = vz;
    daGuiDung = vx === 0 && vz === 0;
    void chay('actor.steer', { actor: actorId, vx, vz, ms: HIEU_LUC_STEER });
  }

  /**
   * Nhịp GIA HẠN: bật khi phím hướng đầu tiên được nhấn, tắt ngay khi nhả hết.
   *
   * F2 — khác bản B1 ở chỗ việc **dừng** không còn chờ nhịp: `dungNgay()` được
   * gọi thẳng từ `keyup` / `blur` / `visibilitychange`, nên nhả phím là lệnh
   * dừng bay đi trong cùng một tick, không trễ tới 100 ms.
   */
  function batNhipSteer(): void {
    if (henSteer) return;
    henSteer = window.setInterval(() => {
      if (dangGiu.size === 0) {
        dungNgay();
        return;
      }
      guiSteer();
    }, NHIP_GIA_HAN);
  }

  /** Tắt nhịp gia hạn và gửi NGAY một lệnh vận tốc 0 (nhân vật phanh êm). */
  function dungNgay(): void {
    if (henSteer) {
      clearInterval(henSteer);
      henSteer = 0;
    }
    dangGiu.clear();
    if (daGuiDung) return;
    daGuiVx = 0;
    daGuiVz = 0;
    daGuiDung = true;
    void chay('actor.steer', { actor: actorId, vx: 0, vz: 0, ms: HIEU_LUC_DUNG });
  }

  function onKeyDown(e: KeyboardEvent): void {
    /**
     * F2 — đang gõ chữ (kể cả ô chat, ô kịch bản, ô nói nhanh) thì phím thuộc
     * về ô nhập. Và nếu Boss đang GIỮ phím hướng rồi mới nhảy vào ô nhập thì
     * phải **dừng ngay** — không để nhân vật đi mãi vì `keyup` sau đó rơi vào
     * ô nhập chứ không về đây.
     */
    if (dangGoChu()) {
      if (dangGiu.size > 0) dungNgay();
      return;
    }
    // Bộ gõ tiếng Việt (telex/VNI) đang dựng chữ: `w`, `s`, `d`… là nguyên liệu
    // của chữ, không phải lệnh lái.
    if (e.isComposing || e.keyCode === 229) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    /**
     * H1 (#69 mục 21) — **PHÍM LẶP KHÔNG PHẢI LỆNH MỚI.**
     *
     * Giữ một phím thì trình duyệt bắn `keydown` lặp ~30 lần/giây với
     * `e.repeat === true`. Chuẩn `input-systems` (Core workflow 3) gọi đây là
     * "đọc sai mép tín hiệu": giữ `1` thành 30 `actor.emote`/giây (dispatcher
     * xếp hàng rồi cắt ngang nhau), giữ `C` thành đổi góc máy loạn, giữ `E`
     * sinh một đống module, giữ `R` reset sân khấu liên tục.
     *
     * Đặt ngay sau `isComposing` (và trước MỌI nhánh phím) nên không nhánh nào
     * phải tự nhớ kiểm: nhánh hướng vẫn đúng vì `dangGiu` + `batNhipSteer()`
     * mới là thứ giữ nhân vật đi, chứ không phải nhịp `keydown` lặp.
     */
    if (e.repeat) {
      e.preventDefault();
      return;
    }

    if (HUONG[e.code]) {
      e.preventDefault();
      if (!dangGiu.has(e.code)) {
        dangGiu.add(e.code);
        // đổi vector là gửi NGAY (không đợi hết nhịp) → bấm là đi liền
        guiSteer();
        batNhipSteer();
      }
      return;
    }

    // 1…9 → emote 0…8, 0 → emote thứ 10
    if (/^(Digit|Numpad)[0-9]$/.test(e.code)) {
      const n = Number(e.code.slice(-1));
      const emote = EMOTE_PHIM[n === 0 ? 9 : n - 1];
      if (emote) {
        e.preventDefault();
        void chay('actor.emote', { actor: actorId, emote });
      }
      return;
    }

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        moONhap(CAU_MAU);
        break;
      case 'KeyC':
        e.preventDefault();
        viPreset = (viPreset + 1) % PRESET_MAY.length;
        void chay('camera.preset', { name: PRESET_MAY[viPreset] });
        break;
      case 'KeyE': {
        e.preventDefault();
        soModule += 1;
        void chay('module.build', {
          id: `module-phim-${soModule}`,
          shape: 'crystal',
          label: `Module ${soModule}`,
          from: 'main',
        });
        break;
      }
      case 'KeyR':
        e.preventDefault();
        dungNgay();
        void chay('stage.reset', {}).then(() => capNhatChu());
        break;
      case 'Slash':
      case 'IntlRo':
        // `?` trên bàn phím Mỹ là Shift+Slash
        e.preventDefault();
        doiHienGoiY();
        break;
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (!dangGiu.delete(e.code)) return;
    // F2 — nhả hết là DỪNG NGAY trong cùng tick, không chờ nhịp gia hạn.
    // Nhả một phím trong tổ hợp (W+D → chỉ còn D): vector mới cũng gửi ngay.
    if (dangGiu.size === 0) dungNgay();
    else guiSteer();
  }

  /**
   * Mất focus cửa sổ / đổi tab / rời trang giữa lúc đang giữ phím → DỪNG.
   *
   * F2 — bản B1 chỉ `dangGiu.clear()` rồi chờ nhịp 100 ms gửi lệnh 0. Nhưng
   * tab bị ẩn thì `setInterval` bị trình duyệt hạ xuống ~1 lần/giây, nên lệnh
   * dừng tới muộn cả giây; `requestAnimationFrame` cũng ngừng nên nhân vật
   * không hề phanh trong lúc đó. Giờ gửi lệnh dừng **ngay tại handler**, và
   * `HIEU_LUC_STEER` 0,7 s là dây an toàn cuối nếu cả lệnh đó cũng không đi.
   */
  function onBlur(): void {
    dungNgay();
  }
  function onAnTab(): void {
    if (document.visibilityState === 'hidden') dungNgay();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onAnTab);
  window.addEventListener('pagehide', onBlur);
  void capNhatChu();

  return {
    thao() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onAnTab);
      window.removeEventListener('pagehide', onBlur);
      if (henSteer) clearInterval(henSteer);
      goiY.remove();
      if (dangNhap()) moONhap(null);
    },
    actor: () => actorId,
    doPhim: () => ({
      vx: daGuiVx,
      vz: daGuiVz,
      giu: dangGiu.size,
      nhip: henSteer !== 0,
    }),
  };
}

/* ------------------------------------------------------- bảng gợi ý phím */

function dungGoiY(): { goiY: HTMLElement; doiHienGoiY: () => void } {
  const el = document.createElement('div');
  el.id = 'goi-y-phim';
  const dong = (phim: string, y: string) =>
    `<li><kbd>${phim}</kbd><span>${y}</span></li>`;
  el.innerHTML =
    '<p>Phím điều khiển <kbd>?</kbd></p><ul>' +
    dong('W A S D', 'lái nhân vật (giữ để đi liên tục)') +
    dong('1 – 0', '10 emote đầu') +
    dong('Space', 'nói (Enter gửi)') +
    // C1 (#31) — mic nằm ở `src/audio/mic.ts`, chỉ ghi vào bảng gợi ý ở đây.
    // F3 (#56): nhắc luôn cú bấm xin quyền, vì thiếu nó thì Firefox không bao
    // giờ mở mic và phím V im lặng tuyệt đối.
    dong('V (giữ)', 'giữ để NÓI (bấm 🔊 Bật tiếng một lần để cho quyền mic)') +
    dong('C', 'đổi góc máy') +
    dong('E', 'kết tinh module mẫu') +
    dong('R', 'dựng lại sân khấu') +
    '</ul>';
  document.body.appendChild(el);
  return {
    goiY: el,
    doiHienGoiY: () => el.classList.toggle('an'),
  };
}

/* ---------------------------------------------------------- ô nhập nhanh */

function dungONhap(gui: (chu: string) => void): {
  moONhap: (mau: string | null) => void;
  dangNhap: () => boolean;
  datTen: (ten: string) => void;
} {
  let hop: HTMLElement | null = null;
  let tenChu = 'Boss';

  function dong(): void {
    // Gán null TRƯỚC rồi mới xoá: remove() bắn blur đồng bộ → gọi lại dong()
    const el = hop;
    hop = null;
    el?.remove();
  }

  return {
    dangNhap: () => hop !== null,
    datTen(ten) {
      tenChu = ten;
    },
    moONhap(mau) {
      if (hop) {
        dong();
        return;
      }
      if (mau === null) return;
      hop = document.createElement('div');
      hop.id = 'o-noi-nhanh';
      hop.innerHTML = `<label>${tenChu} nói:</label><input type="text" placeholder="${mau}" />`;
      document.body.appendChild(hop);
      const o = hop.querySelector('input')!;
      o.focus();
      o.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          const chu = o.value.trim() || mau;
          dong();
          gui(chu);
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          dong();
        }
      });
      o.addEventListener('blur', () => dong());
    },
  };
}
