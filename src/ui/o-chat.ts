/**
 * o-chat.ts — Ô CHAT DƯỚI MÀN HÌNH (B3, Issue #21).
 *
 * Space mở ô nhập nhanh giữa sân khấu (`phim.ts`) rất gọn, nhưng nó biến mất
 * sau mỗi câu nên Boss không thấy "chỗ để nói chuyện". Ô này luôn ở đó, dưới
 * màn hình: gõ, Enter là gửi — **đúng một đường với Space**, tức
 * `actor.say` lên nhân vật `controlledBy: "owner"`, nên nó cũng bắn `user.text`
 * cho não nghe (xem `src/api/commands/actor.ts`).
 *
 * Không có đường tắt riêng: mọi chữ Boss gõ đều qua `dispatcher.run`.
 */
import type { Dispatcher } from '../api/dispatcher';
import type { ActorSnapshot, StageState } from '../api/types';
import { NGUOI_NHAN_MAC_DINH } from '../behavior/hieu-lenh';
import { TEN_HIEN_THI } from '../stage/noi-dung';

export interface OChat {
  /** Gửi một câu như Boss vừa gõ (script bằng chứng dùng). */
  gui(chu: string): Promise<boolean>;
  /**
   * C1 (#31) — đổ chữ mic nhận được vào ô nhập cho Boss xem/sửa.
   *
   * `tuGuiSauMs` khác `null` thì tự gửi sau bấy nhiêu ms (tin cậy cao);
   * `null` thì đứng chờ Boss bấm Enter. Boss sửa một ký tự là **huỷ** hẹn
   * giờ — đang sửa mà câu tự bay đi thì tệ hơn phải bấm thêm Enter.
   */
  datNhap(chu: string, tuGuiSauMs: number | null): void;
  /**
   * F3 (#56 mục 3) — một dòng trạng thái mic ngay trên ô chat.
   *
   * Boss báo "voice chat không nghe" vì mic chết lặng: không có dòng nào nói
   * mic đang mở, đang nhận dạng, hay đã nghe ra gì. Dòng này là chỗ Boss nhìn
   * (console thì Boss không mở). `null` = xoá dòng.
   */
  trangThai(chu: string | null, sua?: SuaMau): void;
  /** Con trỏ đang ở trong ô chat không (phím V là chữ "v", không phải mic). */
  dangGoChu(): boolean;
  /** Actor đang nói hộ Boss. */
  actor(): string;
  thao(): void;
}

/**
 * G3 (#62) — nút "✎ Sửa" đi kèm dòng "nghe được: «…»".
 *
 * Boss bấm → ô nhập (đang giữ đúng chữ engine nghe được) nhận con trỏ và hẹn
 * tự gửi bị huỷ; Boss chữa chữ rồi bấm "✓ Lưu mẫu" là `luu()` được gọi với
 * chữ đúng. `src/audio/mic.ts` đem nó về `POST /stt/mau` làm bộ kiểm chuẩn.
 *
 * Vì sao **không** làm một ô nhập riêng: chữ đã nằm trong ô chat rồi, và Boss
 * vẫn phải sửa ở đó trước khi gửi. Thêm ô thứ hai là bắt Boss gõ lại câu.
 */
export interface SuaMau {
  /** Chữ đúng Boss gõ lại. */
  luu(chuDung: string): void;
}

export function batOChat(
  dispatcher: Dispatcher,
  toast: (chu: string) => void,
): OChat {
  let actorId = 'owner';

  // G2 (28/10): placeholder/nút đọc tên hiển thị động (mặc định không gọi
  // tên thì lệnh rơi vào NGUOI_NHAN_MAC_DINH = "gen", tên hiển thị "Nhi") —
  // không ghi cứng "Gen" nữa.
  const tenMacDinh = TEN_HIEN_THI[NGUOI_NHAN_MAC_DINH] ?? 'Nhi';
  const hop = document.createElement('form');
  hop.id = 'o-chat';
  hop.innerHTML =
    '<label for="o-chat-nhap">Sếp nói</label>' +
    '<input id="o-chat-nhap" type="text" autocomplete="off" ' +
    `placeholder="${tenMacDinh}, dựng connector Baserow… (Enter gửi)" />` +
    `<button type="submit" title="Gửi cho ${tenMacDinh}">Gửi</button>`;
  document.body.appendChild(hop);

  const o = hop.querySelector('input')!;

  /*
   * F3 (#56) — dòng trạng thái mic, đặt TUYỆT ĐỐI phía trên ô chat nên không
   * chen vào `display: flex` của `#o-chat`: bố cục ô chat (F1 đang sửa) không
   * đổi một pixel khi dòng này hiện hay ẩn.
   */
  const tt = document.createElement('div');
  tt.id = 'o-chat-tt';
  // `polite` để trình đọc màn hình đọc sau câu đang đọc, không cắt ngang.
  tt.setAttribute('aria-live', 'polite');
  tt.hidden = true;
  hop.appendChild(tt);
  /** Xoá dòng "nghe được: …" sau bấy nhiêu ms (chữ đã nằm trong ô nhập). */
  let henTt = 0;
  /** G3 — chữ của dòng trạng thái, tách khỏi nút Sửa để không ghi đè nhau. */
  const ttChu = document.createElement('span');
  tt.appendChild(ttChu);

  function datTrangThai(chu: string | null, sua?: SuaMau): void {
    clearTimeout(henTt);
    tt.querySelector('#o-chat-sua')?.remove();
    tt.querySelector('#o-chat-luu')?.remove();
    if (!chu) {
      tt.hidden = true;
      ttChu.textContent = '';
      return;
    }
    ttChu.textContent = chu;
    tt.hidden = false;
    if (sua) {
      const nut = document.createElement('button');
      nut.type = 'button';
      nut.id = 'o-chat-sua';
      nut.textContent = '✎ Sửa';
      nut.title = 'Nghe sai? Sửa lại chữ đúng để Nhi học giọng Sếp';
      nut.addEventListener('click', () => {
        // Sửa là **không** để câu tự bay đi: Boss đang gõ lại chữ đúng.
        huyHen();
        o.focus();
        o.setSelectionRange(o.value.length, o.value.length);
        nut.remove();
        const luu = document.createElement('button');
        luu.type = 'button';
        luu.id = 'o-chat-luu';
        luu.textContent = '✓ Lưu mẫu';
        luu.title = 'Ghi cặp (giọng vừa nói, chữ đúng) vào bộ kiểm chuẩn';
        luu.addEventListener('click', () => {
          sua.luu(o.value);
          luu.remove();
        });
        tt.appendChild(luu);
        ttChu.textContent = 'sửa chữ trong ô dưới rồi bấm:';
        // Boss đang sửa thì đừng tự xoá dòng này giữa lúc gõ.
        clearTimeout(henTt);
      });
      tt.appendChild(nut);
    }
    // "đang nghe…" / "đang nhận dạng…" đứng tới khi có bước sau; câu kết quả
    // thì tự tắt để ô chat sạch trở lại. Có nút Sửa thì để lâu hơn — Boss cần
    // thời gian đọc chữ rồi mới quyết định là nó sai.
    if (chu.startsWith('nghe được'))
      henTt = window.setTimeout(() => datTrangThai(null), sua ? 12000 : 4000);
  }

  async function gui(chu: string): Promise<boolean> {
    const cau = chu.trim();
    if (!cau) return false;
    const kq = await dispatcher.run(
      'actor.say',
      // `interrupt` để Boss nói liên tục không phải chờ câu trước dứt
      { actor: actorId, text: cau, interrupt: true },
      'o-chat',
    );
    if (!kq.ok) toast(`💬 ${kq.error}`);
    return kq.ok;
  }

  /* ----------------------------- C1: chữ mic nhận được, chờ Boss sửa 1,5 s */

  let henTuGui = 0;
  function huyHen(): void {
    if (henTuGui) {
      clearTimeout(henTuGui);
      henTuGui = 0;
      hop.classList.remove('cho-sua');
    }
  }

  hop.addEventListener('submit', (e) => {
    e.preventDefault();
    huyHen();
    const chu = o.value;
    o.value = '';
    void gui(chu);
  });
  // Esc = nhả bàn phím về sân khấu (không thì WASD gõ vào ô chat)
  o.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      huyHen();
      o.value = '';
      o.blur();
    }
  });
  // C1 — Boss chạm vào chữ mic nhận được thì thôi tự gửi, chờ Boss bấm Enter.
  o.addEventListener('input', huyHen);

  /** Ai là người Boss lái — đọc qua dispatcher, không hard-code id. */
  void dispatcher.run('stage.describe', {}, 'o-chat').then((kq) => {
    if (!kq.ok) return;
    const st = kq.result as StageState;
    const chu: ActorSnapshot | undefined =
      st.actors.find((a) => a.controlledBy === 'owner') ?? st.actors[0];
    if (!chu) return;
    actorId = chu.id;
    hop.querySelector('label')!.textContent = `${chu.name} nói`;
  });

  return {
    gui,
    actor: () => actorId,
    trangThai: datTrangThai,
    dangGoChu: () => document.activeElement === o,
    datNhap(chu, tuGuiSauMs) {
      huyHen();
      o.value = chu;
      o.focus();
      // con trỏ về cuối để Boss gõ tiếp / xoá được ngay
      o.setSelectionRange(chu.length, chu.length);
      if (tuGuiSauMs === null) return;
      hop.classList.add('cho-sua');
      henTuGui = window.setTimeout(() => {
        henTuGui = 0;
        hop.classList.remove('cho-sua');
        const c = o.value;
        o.value = '';
        void gui(c);
      }, tuGuiSauMs);
    },
    thao: () => {
      huyHen();
      clearTimeout(henTt);
      hop.remove();
    },
  };
}
