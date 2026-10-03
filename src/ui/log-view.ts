/**
 * log-view.ts — khung nhật ký cuộn (spec mục 4): mọi lệnh và sự kiện, kèm nút
 * Sao chép / Xuất JSON / Xoá để gửi bằng chứng.
 */
import type { BanGhi, NhatKy } from '../log';

/** Số dòng giữ trên màn hình (nhật ký trong bộ nhớ vẫn đủ để xuất file). */
const TRAN_DONG = 400;

export class KhungNhatKy {
  private ds: HTMLElement;
  private nhatKy: NhatKy;
  private tuCuon = true;

  constructor(root: HTMLElement, nhatKy: NhatKy) {
    this.nhatKy = nhatKy;
    root.innerHTML = `
      <div class="nk-chan">
        <button type="button" id="nk-copy">Sao chép</button>
        <button type="button" id="nk-xuat">Xuất JSON</button>
        <button type="button" id="nk-xoa">Xoá</button>
        <label class="nk-cuon"><input type="checkbox" id="nk-tu-cuon" checked /> tự cuộn</label>
      </div>
      <div id="nk-ds" class="nk-ds" role="log" aria-live="polite"></div>`;

    this.ds = root.querySelector<HTMLElement>('#nk-ds')!;

    root.querySelector('#nk-copy')!.addEventListener('click', () => {
      void navigator.clipboard?.writeText(this.nhatKy.toJSON());
      this.chuThich('Đã sao chép nhật ký JSON.');
    });
    root.querySelector('#nk-xuat')!.addEventListener('click', () => {
      this.nhatKy.xuatFile();
      this.chuThich('Đã xuất file JSON.');
    });
    root.querySelector('#nk-xoa')!.addEventListener('click', () => {
      this.nhatKy.xoa();
      this.ds.innerHTML = '';
    });
    root
      .querySelector<HTMLInputElement>('#nk-tu-cuon')!
      .addEventListener('change', (e) => {
        this.tuCuon = (e.target as HTMLInputElement).checked;
      });

    for (const b of nhatKy.tatCa()) this.them(b);
    nhatKy.onThem((b) => this.them(b));
  }

  private chuThich(chu: string): void {
    this.them({ t: Date.now(), loai: 'su-kien', event: 'ui.note', data: { chu } });
  }

  private them(b: BanGhi): void {
    const d = document.createElement('div');
    const gio = new Date(b.t).toLocaleTimeString('vi-VN', { hour12: false });

    if (b.loai === 'lenh') {
      d.className = `nk-dong ${b.ok ? 'ok' : 'loi'}`;
      const args = Object.keys(b.args).length ? JSON.stringify(b.args) : '';
      d.innerHTML =
        `<time>${gio}</time><b>${b.cmd}</b>` +
        `<span class="nk-args"></span>` +
        `<em>${b.ok ? 'ok' : 'LỖI'} ${b.durationMs}ms</em>`;
      d.querySelector('.nk-args')!.textContent = args;
      d.title = b.ok
        ? JSON.stringify(b.result, null, 2).slice(0, 4000)
        : String(b.error);
    } else {
      d.className = 'nk-dong su-kien';
      d.innerHTML = `<time>${gio}</time><b>▸ ${b.event}</b><span class="nk-args"></span>`;
      const data = Object.keys(b.data).length ? JSON.stringify(b.data) : '';
      d.querySelector('.nk-args')!.textContent = data.slice(0, 300);
      d.title = JSON.stringify(b.data, null, 2).slice(0, 4000);
    }

    this.ds.appendChild(d);
    while (this.ds.childElementCount > TRAN_DONG) this.ds.firstElementChild?.remove();
    if (this.tuCuon) this.ds.scrollTop = this.ds.scrollHeight;
  }
}
