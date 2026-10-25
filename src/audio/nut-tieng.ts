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
 */
import type { LopTieng } from './tts-client';

const KHOA_NHO = 'gen-stage:tieng';

/**
 * Gắn nút + cơ chế mở khoá. Trả hàm tháo (test / `stage.reset`).
 *
 * `toast` để báo kết quả bằng tiếng Việt cho Boss.
 */
export function ganNutTieng(tieng: LopTieng, toast?: (chu: string) => void): () => void {
  const daDongY = nhoLaDaBat();

  const nut = document.createElement('button');
  nut.id = 'nut-tieng';
  nut.type = 'button';
  nut.textContent = '🔊 Bật tiếng';
  nut.title = 'Trình duyệt chặn tiếng tới khi Boss bấm một lần';
  nut.setAttribute('aria-label', 'Bật tiếng cho nhân vật');
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

  const xong = (co: boolean) => {
    if (!co) {
      toast?.('Trình duyệt vẫn chặn tiếng — bấm vào sân khấu rồi thử lại');
      return;
    }
    try {
      localStorage.setItem(KHOA_NHO, '1');
    } catch {
      /* chế độ ẩn danh — chỉ mất phần "nhớ", tiếng vẫn chạy */
    }
    thao();
    toast?.('Đã bật tiếng — nhân vật nói giọng Việt');
  };

  nut.addEventListener('click', () => {
    void tieng.batTieng().then(xong);
  });

  // Đã đồng ý ở phiên trước: không hiện nút, chỉ chờ cú tương tác đầu tiên.
  function moKhoaNgam(): void {
    void tieng.batTieng().then((co) => {
      if (co) thao();
    });
  }

  if (daDongY) {
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
