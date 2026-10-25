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
/** Nhịp gửi `actor.steer` khi đang giữ phím (ms) — Issue #18 chốt 100 ms. */
const NHIP_STEER = 100;
/**
 * Mỗi lệnh steer có hiệu lực 180 ms > nhịp 100 ms: hai lệnh gối nhau nên
 * không có khe nào nhân vật bị "hết lệnh" mà Boss vẫn đang giữ phím. Nhưng
 * cũng chỉ 180 ms, nên tab bị treo / mất focus giữa lúc giữ phím là nhân vật
 * tự dừng êm sau chưa đến 0,2 s, không đi mãi.
 */
const HIEU_LUC_STEER = 180;
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
}

/** Đang gõ chữ ở đâu đó thì phím KHÔNG được coi là lệnh sân khấu. */
function dangGoChu(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const ten = el.tagName;
  return (
    ten === 'INPUT' ||
    ten === 'TEXTAREA' ||
    ten === 'SELECT' ||
    el.isContentEditable === true
  );
}

export function batPhim(
  dispatcher: Dispatcher,
  toast: (chu: string) => void,
): BanPhim {
  /** Actor đang được phím lái — mặc định nhân vật có `controlledBy: "owner"`. */
  let actorId = 'owner';
  /** Mã phím hướng đang được giữ. */
  const dangGiu = new Set<string>();
  /** Hẹn giờ gửi steer theo nhịp (0 = không chạy). */
  let henSteer = 0;
  /** Vector đã gửi lần cuối — chỉ gửi lại khi đổi hoặc tới nhịp. */
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

  /** Gửi một lệnh steer theo vector hiện tại. */
  function guiSteer(): void {
    const [vx, vz] = vectorPhim();
    void chay('actor.steer', { actor: actorId, vx, vz, ms: HIEU_LUC_STEER });
  }

  /**
   * Một hẹn giờ DUY NHẤT cho cả bàn phím: bật khi phím hướng đầu tiên được
   * nhấn, tắt khi nhả hết. Không tạo hẹn giờ theo từng phím (bản cũ dễ chồng
   * nhiều interval khi bấm nhiều phím liền tay).
   */
  function batNhipSteer(): void {
    if (henSteer) return;
    guiSteer();
    henSteer = window.setInterval(() => {
      if (dangGiu.size === 0) {
        clearInterval(henSteer);
        henSteer = 0;
        // nhả hết phím: một lệnh vận tốc 0 để nhân vật giảm tốc về 0 ngay
        void chay('actor.steer', { actor: actorId, vx: 0, vz: 0, ms: 120 });
        return;
      }
      guiSteer();
    }, NHIP_STEER);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (dangGoChu()) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (HUONG[e.code]) {
      e.preventDefault();
      if (!dangGiu.has(e.code)) {
        dangGiu.add(e.code);
        // đổi vector là gửi NGAY (không đợi hết nhịp 100 ms) → bấm là đi liền
        if (henSteer) guiSteer();
        else batNhipSteer();
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
        dangGiu.clear();
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
    // nhả một phím trong tổ hợp (W+D → chỉ còn D): vector mới gửi ngay
    if (dangGiu.size > 0) guiSteer();
  }

  /** Mất focus cửa sổ giữa lúc đang giữ phím → nhả hết, đừng đi mãi. */
  function onBlur(): void {
    dangGiu.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  void capNhatChu();

  return {
    thao() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      if (henSteer) clearInterval(henSteer);
      goiY.remove();
      if (dangNhap()) moONhap(null);
    },
    actor: () => actorId,
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
