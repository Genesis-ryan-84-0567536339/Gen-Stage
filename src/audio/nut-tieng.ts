/**
 * nut-tieng.ts — nút "🔊 Bật tiếng" (B2, Issue #20).
 *
 * Chrome/Safari **chặn mọi âm thanh** cho tới khi người dùng bấm hoặc gõ một
 * lần (autoplay policy): `AudioContext` mới tạo nằm ở `suspended`, phải
 * `resume()` **trong chính handler của cú bấm** mới được.
 *
 * Nên: một nút góc trên, bấm xong là nhớ vào `localStorage` và **không hiện
 * lại** ở lần mở sau — lần sau chỉ cần cú tương tác đầu tiên bất kỳ (bấm bảng
 * lệnh, gõ phím WASD) là tự mở khoá, không bắt Boss bấm thêm.
 *
 * Nút dựng hoàn toàn bằng mã (không sửa `index.html`) để đợt sau rebase dễ.
 *
 * ---
 *
 * **F3 (#56 mục 3) — nút này cũng là chỗ XIN QUYỀN MIC.**
 *
 * Firefox hỏi quyền mic bằng một hộp thoại, và `getUserMedia` treo tới khi
 * Boss trả lời. Mic của Gen-Stage là **đẩy-để-nói**: Boss nhả phím V trước khi
 * kịp bấm "Cho phép", nên bản cũ chẳng bao giờ ghi được gì — đo thật trên
 * Firefox 147: `getUserMedia` gọi rồi không trả lời, 0 mẫu RMS, 0 byte, ô chat
 * trống, không một dòng lỗi (xem đầu `src/audio/mic.ts`).
 *
 * Nút này đã là **một cú bấm người dùng** Boss phải làm một lần mỗi phiên cho
 * tiếng nói của Gen. Xin quyền mic ngay trong cùng cú bấm đó: hộp hỏi quyền
 * hiện lúc Boss đang rảnh tay, và từ đó phím V chạy ngay không trễ.
 */
import type { LopTieng } from './tts-client';
import { quyenMicHienTai, xinQuyenMic } from './mic';

const KHOA_NHO = 'gen-stage:tieng';

/**
 * Gắn nút + cơ chế mở khoá. Trả hàm tháo (test / `stage.reset`).
 *
 * `toast` để báo kết quả bằng tiếng Việt cho Boss.
 */
export function ganNutTieng(tieng: LopTieng, toast?: (chu: string) => void): () => void {
  const daDongY = nhoLaDaBat();
  /**
   * F3 — quyền mic chưa có thì VẪN phải hiện nút, kể cả khi Boss đã đồng ý bật
   * tiếng ở phiên trước: nút là cú bấm duy nhất xin được quyền mic tử tế.
   */
  const canXinMic = quyenMicHienTai() !== 'duoc';

  const nut = document.createElement('button');
  nut.id = 'nut-tieng';
  nut.type = 'button';
  nut.textContent = daDongY && canXinMic ? '🎤 Cho phép mic' : '🔊 Bật tiếng';
  nut.title = daDongY && canXinMic
    ? 'Firefox hỏi quyền mic — bấm một lần rồi giữ phím V để nói'
    : 'Trình duyệt chặn tiếng và mic tới khi Boss bấm một lần';
  nut.setAttribute('aria-label', 'Bật tiếng và cho phép mic');
  nut.style.cssText = [
    'position:fixed',
    'top:10px',
    'right:10px',
    'z-index:40',
    'padding:8px 12px',
    'border:1px solid rgba(0,0,0,.18)',
    'border-radius:999px',
    'background:#fdf3e3',
    'color:#2b2117',
    'font:600 13px/1.2 system-ui,sans-serif',
    'box-shadow:0 2px 8px rgba(0,0,0,.18)',
    'cursor:pointer',
  ].join(';');

  let daThao = false;
  const thao = () => {
    if (daThao) return;
    daThao = true;
    nut.remove();
    document.removeEventListener('pointerdown', moKhoaNgam, true);
    document.removeEventListener('keydown', moKhoaNgam, true);
  };

  /**
   * `giuNut` = còn việc chưa xong nên nút phải ở lại (F3: mic bị chặn thì Boss
   * cần bấm lại sau khi mở quyền trong Firefox — bỏ nút đi là bỏ luôn đường
   * duy nhất xin quyền bằng một cú bấm).
   */
  const xong = (co: boolean, giuNut = false, micDaNoi = false) => {
    if (!co) {
      toast?.('Trình duyệt vẫn chặn tiếng — bấm vào sân khấu rồi thử lại');
      return;
    }
    try {
      localStorage.setItem(KHOA_NHO, '1');
    } catch {
      /* chế độ ẩn danh — chỉ mất phần "nhớ", tiếng vẫn chạy */
    }
    if (giuNut) {
      nut.textContent = '🎤 Cho phép mic';
      return;
    }
    thao();
    /*
     * F3 — mic đã toast câu quan trọng hơn ("mic mở cho phiên này…" hoặc "đã
     * cho quyền mic…"). Toast ở đây nữa là đè mất nó sau nửa giây, và câu Boss
     * cần đọc chính là câu về mic.
     */
    if (!micDaNoi) toast?.('Đã bật tiếng — nhân vật nói giọng Việt');
  };

  nut.addEventListener('click', () => {
    /*
     * Gọi `xinQuyenMic()` TRƯỚC `await` nào: cả hai thứ (`AudioContext.resume`
     * và `getUserMedia`) đều muốn được gọi trong chính cú bấm, nên bắn song
     * song rồi chờ, chứ không xếp hàng cái nọ sau cái kia.
     */
    const mic = xinQuyenMic();
    void tieng.batTieng().then(async (co) => {
      const kqMic = await mic;
      // `mic.ts` đã toast đúng câu cho từng ca (chặn / không có mic / không nhớ
      // quyền) khi nó thật sự chạm tới mic — tức mọi kết quả trừ `false`
      // (= chưa có lớp mic nào chạy). Khi đó đừng toast chồng dòng thứ hai.
      xong(co, !(kqMic === 'duoc' || kqMic === false), kqMic !== false);
    });
  });

  // Đã đồng ý ở phiên trước: không hiện nút, chỉ chờ cú tương tác đầu tiên.
  function moKhoaNgam(): void {
    void tieng.batTieng().then((co) => {
      if (co) thao();
    });
  }

  // F3 — còn thiếu quyền mic thì nút phải hiện, dù tiếng đã mở khoá từ phiên
  // trước: không có cú bấm này thì phím V vĩnh viễn "không nghe" trên Firefox.
  if (daDongY && !canXinMic) {
    document.addEventListener('pointerdown', moKhoaNgam, true);
    document.addEventListener('keydown', moKhoaNgam, true);
  } else {
    document.body.appendChild(nut);
  }

  return thao;
}

/** Boss đã bật tiếng ở một phiên trước chưa. */
export function nhoLaDaBat(): boolean {
  try {
    return localStorage.getItem(KHOA_NHO) === '1';
  } catch {
    return false;
  }
}
