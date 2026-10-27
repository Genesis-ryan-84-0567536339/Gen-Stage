/**
 * index.ts — dựng cả bảng điều khiển bên phải: 3 thẻ Lệnh / Kịch bản / Nhật ký,
 * thu gọn được để vừa màn hình điện thoại.
 */
import type { Dispatcher } from '../api/dispatcher';
import type { EventBus } from '../events';
import type { NhatKy } from '../log';
import { BangLenh, dungTabGiong } from './panel';
import { OKichBan } from './script-box';
import { KhungNhatKy } from './log-view';

/** Các thẻ của bảng điều khiển (C2 thêm "giong"). */
export type TenThe = 'lenh' | 'giong' | 'kich-ban' | 'nhat-ky';

export interface GiaoDien {
  bangLenh: BangLenh;
  oKichBan: OKichBan;
  nhatKyView: KhungNhatKy;
  moThe(ten: TenThe): void;
  dongMo(mo?: boolean): void;
}

export async function dungGiaoDien(
  dispatcher: Dispatcher,
  bus: EventBus,
  nhatKy: NhatKy,
): Promise<GiaoDien> {
  const bang = document.getElementById('bang')!;
  bang.innerHTML = `
    <button type="button" id="bang-dong-mo" aria-label="Thu gọn bảng">›</button>
    <header id="bang-dau">
      <h2>Bảng lệnh <span id="bang-ver"></span></h2>
      <nav id="bang-the">
        <button type="button" data-the="lenh" class="dang-chon">Lệnh</button>
        <button type="button" data-the="giong">Giọng</button>
        <button type="button" data-the="kich-ban">Kịch bản</button>
        <button type="button" data-the="nhat-ky">Nhật ký</button>
      </nav>
    </header>
    <section id="the-lenh" class="the-noi-dung hien"></section>
    <section id="the-giong" class="the-noi-dung"></section>
    <section id="the-kich-ban" class="the-noi-dung"></section>
    <section id="the-nhat-ky" class="the-noi-dung"></section>`;

  const bangLenh = new BangLenh(document.getElementById('the-lenh')!, dispatcher, bus);
  await bangLenh.dung();

  // C2 (#32) — tab "Giọng": mẫu câu lớp hiểu lệnh nghe được (sinh từ bảng).
  dungTabGiong(document.getElementById('the-giong')!, bus);

  const oKichBan = new OKichBan(document.getElementById('the-kich-ban')!, dispatcher);
  const nhatKyView = new KhungNhatKy(document.getElementById('the-nhat-ky')!, nhatKy);

  const boot = await dispatcher.run('stage.bootstrap', {}, 'ui');
  if (boot.ok) {
    document.getElementById('bang-ver')!.textContent =
      `v${(boot.result as { version: string }).version}`;
  }

  const nutThe = Array.from(
    bang.querySelectorAll<HTMLButtonElement>('#bang-the button'),
  );
  const moThe = (ten: TenThe) => {
    for (const n of nutThe) n.classList.toggle('dang-chon', n.dataset.the === ten);
    for (const s of bang.querySelectorAll<HTMLElement>('.the-noi-dung')) {
      s.classList.toggle('hien', s.id === `the-${ten}`);
    }
  };
  for (const n of nutThe) {
    n.addEventListener('click', () =>
      moThe(n.dataset.the as TenThe),
    );
  }

  const nutDongMo = document.getElementById('bang-dong-mo')!;
  /** H1 — khoá nhớ lựa chọn mở/thu của Boss (chỉ ghi khi Boss tự bấm). */
  const KHOA_BANG = 'gen-stage:bang-mo';
  const dongMo = (mo?: boolean, nhoLai = false) => {
    const dangThuGon = mo === undefined ? !bang.classList.contains('thu-gon') : !mo;
    bang.classList.toggle('thu-gon', dangThuGon);
    nutDongMo.textContent = dangThuGon ? '‹' : '›';
    nutDongMo.setAttribute('aria-label', dangThuGon ? 'Mở bảng lệnh' : 'Thu gọn bảng');
    if (nhoLai) {
      try {
        localStorage.setItem(KHOA_BANG, dangThuGon ? '0' : '1');
      } catch {
        /* chế độ riêng tư: không nhớ được thì thôi */
      }
    }
  };
  nutDongMo.addEventListener('click', () => dongMo(undefined, true));

  /**
   * **Mặc định THU GỌN ở MỌI cỡ màn** — H1, theo Cửa 2 vòng 28/10 mục 5:
   * *"bảng lệnh đè 27,1 % khung 3D ở 1440, và ở góc `toan-canh` nó che mất nửa
   * người Nhi"*. Trước H1 chỉ màn hẹp mới thu; desktop tự mở bảng ra, nên thứ
   * đầu tiên Boss thấy khi mở trang là hơn một phần tư căn nhà bị tấm kính
   * phủ. Nay bảng chỉ mở khi **Boss tự kéo ra** (nút `›`), và lựa chọn đó
   * được nhớ bằng `localStorage` cho lần sau.
   *
   * Bốn chỗ cùng giữ lời hứa này, cố ý không dồn vào một:
   *  - `index.html` khai sẵn `class="thu-gon"` → không loé bảng lúc chờ JS;
   *  - `src/style.css` kẹp `--bang-rong` ≤ 86vw/340px → mở hết vẫn thấy 3D;
   *  - hàm này **không bao giờ tự mở**, chỉ khôi phục lựa chọn đã nhớ;
   *  - và **thu lại khi màn hẹp đi** (quay ngang → dọc, hoặc kéo nhỏ cửa sổ),
   *    kể cả khi Boss đã nhớ là "mở": ở 760–900 px tấm kính 390 px vẫn che gần
   *    nửa khung hình (Boss 25/10).
   */
  const HEP = window.matchMedia('(max-width: 899px)');
  let daNhoMo = false;
  try {
    daNhoMo = localStorage.getItem(KHOA_BANG) === '1';
  } catch {
    /* chế độ riêng tư */
  }
  dongMo(daNhoMo && !HEP.matches);
  // `change` của matchMedia chỉ bắn khi VƯỢT ngưỡng, nên không rung mỗi pixel.
  // Hẹp đi thì THU; rộng ra thì **giữ nguyên** (không tự mở thay Boss).
  HEP.addEventListener('change', () => {
    if (HEP.matches) dongMo(false);
  });

  return { bangLenh, oKichBan, nhatKyView, moThe, dongMo };
}
