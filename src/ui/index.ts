/**
 * index.ts — dựng cả bảng điều khiển bên phải: 3 thẻ Lệnh / Kịch bản / Nhật ký,
 * thu gọn được để vừa màn hình điện thoại.
 */
import type { Dispatcher } from '../api/dispatcher';
import type { EventBus } from '../events';
import type { NhatKy } from '../log';
import { BangLenh } from './panel';
import { OKichBan } from './script-box';
import { KhungNhatKy } from './log-view';

export interface GiaoDien {
  bangLenh: BangLenh;
  oKichBan: OKichBan;
  nhatKyView: KhungNhatKy;
  moThe(ten: 'lenh' | 'kich-ban' | 'nhat-ky'): void;
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
        <button type="button" data-the="kich-ban">Kịch bản</button>
        <button type="button" data-the="nhat-ky">Nhật ký</button>
      </nav>
    </header>
    <section id="the-lenh" class="the-noi-dung hien"></section>
    <section id="the-kich-ban" class="the-noi-dung"></section>
    <section id="the-nhat-ky" class="the-noi-dung"></section>`;

  const bangLenh = new BangLenh(document.getElementById('the-lenh')!, dispatcher, bus);
  await bangLenh.dung();

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
  const moThe = (ten: 'lenh' | 'kich-ban' | 'nhat-ky') => {
    for (const n of nutThe) n.classList.toggle('dang-chon', n.dataset.the === ten);
    for (const s of bang.querySelectorAll<HTMLElement>('.the-noi-dung')) {
      s.classList.toggle('hien', s.id === `the-${ten}`);
    }
  };
  for (const n of nutThe) {
    n.addEventListener('click', () =>
      moThe(n.dataset.the as 'lenh' | 'kich-ban' | 'nhat-ky'),
    );
  }

  const nutDongMo = document.getElementById('bang-dong-mo')!;
  const dongMo = (mo?: boolean) => {
    const dangThuGon = mo === undefined ? !bang.classList.contains('thu-gon') : !mo;
    bang.classList.toggle('thu-gon', dangThuGon);
    nutDongMo.textContent = dangThuGon ? '‹' : '›';
    nutDongMo.setAttribute('aria-label', dangThuGon ? 'Mở bảng lệnh' : 'Thu gọn bảng');
  };
  nutDongMo.addEventListener('click', () => dongMo());
  // điện thoại: mở app là thu gọn cho thấy sân khấu, bấm nút để mở bảng
  if (window.innerWidth < 760) dongMo(false);

  return { bangLenh, oKichBan, nhatKyView, moThe, dongMo };
}
