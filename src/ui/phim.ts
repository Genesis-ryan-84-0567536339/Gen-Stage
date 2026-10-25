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
 *   WASD / ↑←↓→  đi 1 m theo trục phòng (giữ phím thì đi liên tục)
 *   1…9, 0       10 emote đầu trong `EMOTES`
 *   Space        mở ô nhập nhanh để nói (Enter gửi, Esc huỷ)
 *   C            xoay vòng `camera.preset`
 *   E            `module.build` một module mẫu
 *   R            `stage.reset`
 *   ?            ẩn/hiện bảng gợi ý phím ở góc dưới trái
 */
import type { Dispatcher } from '../api/dispatcher';
import { EMOTES, PRESET_MAY } from '../stage/noi-dung';
import type { StageState, Vec3 } from '../api/types';

/** Bấm nhả một lần = đi 1 m. */
const BUOC = 1;
/**
 * Giữ phím: cứ `NHIP_GIU` ms lại đẩy đích thêm `BUOC_GIU` m. Nhân vật đi
 * 0,95 m/s (`TOC_DO_DI`) nên 0,4 m mỗi 420 ms giữ đích luôn ở phía trước
 * chân nhân vật khoảng 1 m — đi liên tục, mượt, không "giật" từng bước và
 * cũng không để đích chạy mất hút so với thân.
 */
const NHIP_GIU = 420;
const BUOC_GIU = 0.4;
/**
 * Nhả phím xong còn bấy nhiêu ms thì phím tiếp theo vẫn TÍCH LUỸ lên đích cũ
 * thay vì đọc lại vị trí thân. Không có cửa sổ này, bấm W ba nhát liên tiếp
 * chỉ đi được 1 m vì nhát nào cũng neo lại vào chỗ nhân vật đang lết tới.
 */
const AN_HAN_DICH = 1200;
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
  let actorId = 'lan';
  /** Đích đang nhắm (x, z). Tích luỹ cục bộ để giữ phím đi liền mạch. */
  let dich: [number, number] | null = null;
  let lanCuoiDi = 0;
  let henGiu = 0;
  const dangGiu = new Set<string>();
  let iPreset = 0;
  let soModule = 0;

  const { goiY, doiHienGoiY } = dungGoiY();
  const { moONhap, dangNhap } = dungONhap((chu) => chay('actor.say', { actor: actorId, text: chu }));

  /** Cửa duy nhất: mọi phím đều qua đây → `dispatcher.run`. */
  async function chay(cmd: string, args: Record<string, unknown>): Promise<boolean> {
    const kq = await dispatcher.run(cmd, args, 'phim');
    if (!kq.ok) toast(`⌨ ${cmd}: ${kq.error}`);
    return kq.ok;
  }

  async function docViTri(): Promise<{ pos: Vec3; facing: number } | null> {
    const kq = await dispatcher.run('stage.describe', {}, 'phim');
    if (!kq.ok) return null;
    const st = kq.result as StageState;
    const a = st.actors.find((x) => x.id === actorId) ?? st.actors[0];
    if (!a) return null;
    actorId = a.id;
    return { pos: a.pos, facing: a.facing };
  }

  /**
   * Đi một bước. Đích được tích luỹ trong `dich` nên giữ phím là đi liên tục
   * (mỗi lệnh mới `interrupt: true` cắt ngang lệnh đi đang chạy, không xếp hàng
   * — nếu xếp hàng thì nhả phím rồi nhân vật vẫn còn lết thêm vài mét).
   */
  async function diMotBuoc(buoc: number): Promise<void> {
    if (dangGiu.size === 0) return;
    let dx = 0;
    let dz = 0;
    for (const ma of dangGiu) {
      const h = HUONG[ma];
      if (h) {
        dx += h[0];
        dz += h[1];
      }
    }
    if (dx === 0 && dz === 0) return;
    const dai = Math.hypot(dx, dz);
    dx = (dx / dai) * buoc;
    dz = (dz / dai) * buoc;

    if (!dich || Date.now() - lanCuoiDi > AN_HAN_DICH) {
      const tt = await docViTri();
      if (!tt) return;
      dich = [tt.pos[0], tt.pos[2]];
    }
    const GIOI_HAN = 7.4; // nửa phòng 16 m trừ lề, không đi xuyên tường
    dich = [
      Math.max(-GIOI_HAN, Math.min(GIOI_HAN, dich[0] + dx)),
      Math.max(-GIOI_HAN, Math.min(GIOI_HAN, dich[1] + dz)),
    ];
    lanCuoiDi = Date.now();
    const ok = await chay('actor.moveTo', {
      actor: actorId,
      to: [dich[0], 0, dich[1]],
      interrupt: true,
    });
    if (!ok) dich = null;
  }

  function batNhipGiu(): void {
    if (henGiu) return;
    void diMotBuoc(BUOC);
    henGiu = window.setInterval(() => {
      if (dangGiu.size === 0) {
        clearInterval(henGiu);
        henGiu = 0;
        return;
      }
      void diMotBuoc(BUOC_GIU);
    }, NHIP_GIU);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (dangGoChu()) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (HUONG[e.code]) {
      e.preventDefault();
      if (!dangGiu.has(e.code)) {
        dangGiu.add(e.code);
        batNhipGiu();
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
        iPreset = (iPreset + 1) % PRESET_MAY.length;
        void chay('camera.preset', { name: PRESET_MAY[iPreset] });
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
        dich = null;
        void chay('stage.reset', {});
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
    dangGiu.delete(e.code);
  }

  /** Mất focus cửa sổ giữa lúc đang giữ phím → nhả hết, đừng đi mãi. */
  function onBlur(): void {
    dangGiu.clear();
    dich = null;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    thao() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      if (henGiu) clearInterval(henGiu);
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
    dong('W A S D', 'đi 1 m (giữ để đi liên tục)') +
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
} {
  let hop: HTMLElement | null = null;

  function dong(): void {
    // Gán null TRƯỚC rồi mới xoá: remove() bắn blur đồng bộ → gọi lại dong()
    const el = hop;
    hop = null;
    el?.remove();
  }

  return {
    dangNhap: () => hop !== null,
    moONhap(mau) {
      if (hop) {
        dong();
        return;
      }
      if (mau === null) return;
      hop = document.createElement('div');
      hop.id = 'o-noi-nhanh';
      hop.innerHTML = `<label>Lan nói:</label><input type="text" placeholder="${mau}" />`;
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
