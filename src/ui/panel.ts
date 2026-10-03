/**
 * panel.ts — bảng lệnh **tự sinh** từ `stage.bootstrap` (spec mục 4:
 * "Không viết tay nút nào").
 *
 * Mỗi lệnh thành một form nhỏ: ô nhập theo đúng kiểu tham số, ô chọn cho
 * actor / place / clip / biểu cảm, nút Chạy. Thêm lệnh vào registry là bảng tự
 * có thêm dòng, không sửa file này.
 */
import type { Dispatcher } from '../api/dispatcher';
import type { EventBus } from '../events';
import type { MoTaLenh, MoTaThamSo } from '../api/registry';
import { TEN_NHOM } from '../api/commands/index';

interface OLenh {
  mo: MoTaLenh;
  o: Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
  ketQua: HTMLElement;
}

export class BangLenh {
  private root: HTMLElement;
  private dispatcher: Dispatcher;
  private bus: EventBus;
  private ds: OLenh[] = [];
  private henLamMoi = 0;

  constructor(root: HTMLElement, dispatcher: Dispatcher, bus: EventBus) {
    this.root = root;
    this.dispatcher = dispatcher;
    this.bus = bus;
  }

  /** Dựng bảng từ `stage.bootstrap`. */
  async dung(): Promise<void> {
    const kq = await this.dispatcher.run('stage.bootstrap', {}, 'ui-bang');
    if (!kq.ok) {
      this.root.textContent = `Không dựng được bảng lệnh: ${kq.error}`;
      return;
    }
    const boot = kq.result as { commands: MoTaLenh[]; groups: string[] };

    this.root.innerHTML = '';
    this.ds = [];

    for (const nhom of boot.groups) {
      const lenhNhom = boot.commands.filter((c) => c.group === nhom);
      if (!lenhNhom.length) continue;

      const khoi = document.createElement('details');
      khoi.className = 'nhom';
      // mở sẵn hai nhóm hay dùng nhất, còn lại thu gọn cho vừa điện thoại
      khoi.open = nhom === 'stage' || nhom === 'actor';

      const dau = document.createElement('summary');
      dau.innerHTML = `<span>${TEN_NHOM[nhom] ?? nhom}</span><em>${lenhNhom.length}</em>`;
      khoi.appendChild(dau);

      for (const mo of lenhNhom) khoi.appendChild(this.dungMotLenh(mo));
      this.root.appendChild(khoi);
    }

    // actor/prop thay đổi thì ô chọn phải đổi theo, không dựng lại cả bảng
    for (const ev of [
      'actor.spawned',
      'actor.removed',
      'prop.spawned',
      'prop.removed',
      'stage.reset',
    ]) {
      this.bus.on(ev, () => this.henLamMoiOChon());
    }
  }

  private dungMotLenh(mo: MoTaLenh): HTMLElement {
    const hop = document.createElement('div');
    hop.className = 'lenh';
    if (mo.chuaLam) hop.classList.add('chua-lam');
    hop.dataset.cmd = mo.cmd;

    const dau = document.createElement('div');
    dau.className = 'lenh-dau';
    dau.innerHTML =
      `<code>${mo.cmd}</code>` +
      (mo.chuaLam ? `<span class="the">${mo.chuaLam}</span>` : '');
    hop.appendChild(dau);

    const moTa = document.createElement('p');
    moTa.className = 'lenh-mo-ta';
    moTa.textContent = mo.desc;
    hop.appendChild(moTa);

    const o = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
    if (mo.params.length) {
      const luoi = document.createElement('div');
      luoi.className = 'luoi-tham-so';
      for (const p of mo.params) {
        const nhan = document.createElement('label');
        nhan.className = `o-tham-so kieu-${p.type}`;
        const ten = document.createElement('span');
        ten.textContent = p.name + (p.required ? ' *' : '');
        ten.title = p.desc;
        nhan.appendChild(ten);
        const el = dungONhap(p, mo.cmd);
        nhan.appendChild(el);
        o.set(p.name, el);
        luoi.appendChild(nhan);
      }
      hop.appendChild(luoi);
    }

    const hang = document.createElement('div');
    hang.className = 'lenh-chan';
    const nut = document.createElement('button');
    nut.type = 'button';
    nut.className = 'nut-chay';
    nut.dataset.chay = mo.cmd;
    nut.textContent = 'Chạy';
    hang.appendChild(nut);

    const ketQua = document.createElement('output');
    ketQua.className = 'lenh-kq';
    hang.appendChild(ketQua);
    hop.appendChild(hang);

    const ban: OLenh = { mo, o, ketQua };
    this.ds.push(ban);
    nut.addEventListener('click', () => void this.chay(ban, nut));

    return hop;
  }

  private async chay(ban: OLenh, nut: HTMLButtonElement): Promise<void> {
    const args: Record<string, unknown> = {};
    for (const [ten, el] of ban.o) {
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        if (el.checked) args[ten] = true;
        continue;
      }
      const v = el.value.trim();
      if (v !== '') args[ten] = v;
    }

    nut.disabled = true;
    ban.ketQua.className = 'lenh-kq dang-chay';
    ban.ketQua.textContent = '…';

    const kq = await this.dispatcher.run(ban.mo.cmd, args, 'ui-bang');

    nut.disabled = false;
    if (kq.ok) {
      ban.ketQua.className = 'lenh-kq ok';
      const r = kq.result as Record<string, unknown>;
      const dm = typeof r?.durationMs === 'number' ? ` · ${r.durationMs} ms` : '';
      ban.ketQua.textContent = `ok${dm}`;
      ban.ketQua.title = JSON.stringify(kq.result, null, 2).slice(0, 4000);
    } else {
      ban.ketQua.className = 'lenh-kq loi';
      ban.ketQua.textContent = kq.error;
      ban.ketQua.title = kq.error;
    }
  }

  /** Gộp nhiều lần làm mới ô chọn trong một khung hình. */
  private henLamMoiOChon(): void {
    if (this.henLamMoi) return;
    this.henLamMoi = window.setTimeout(() => {
      this.henLamMoi = 0;
      void this.lamMoiOChon();
    }, 80);
  }

  private async lamMoiOChon(): Promise<void> {
    const kq = await this.dispatcher.run('stage.bootstrap', {}, 'ui-bang');
    if (!kq.ok) return;
    const boot = kq.result as { commands: MoTaLenh[] };

    for (const ban of this.ds) {
      const moi = boot.commands.find((c) => c.cmd === ban.mo.cmd);
      if (!moi) continue;
      for (const p of moi.params) {
        const el = ban.o.get(p.name);
        if (!el || !p.values) continue;
        if (el instanceof HTMLSelectElement) {
          const cu = el.value;
          datOption(el, p);
          el.value = p.values.includes(cu) ? cu : (el.options[0]?.value ?? '');
        } else if (el instanceof HTMLInputElement && el.list) {
          datDatalist(el.list, p.values);
        }
      }
    }
  }
}

/* ------------------------------------------------------------- ô nhập */

function dungONhap(
  p: MoTaThamSo,
  cmd: string,
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const mac = p.default;

  if (p.type === 'boolean') {
    const el = document.createElement('input');
    el.type = 'checkbox';
    el.checked = mac === true;
    return el;
  }

  if (p.type === 'number') {
    const el = document.createElement('input');
    el.type = 'number';
    el.step = 'any';
    el.placeholder = mac === undefined ? '' : String(mac);
    return el;
  }

  if ((p.type === 'json' || p.type === 'text') && p.name !== 'name') {
    const el = document.createElement('textarea');
    el.rows = p.type === 'json' ? 3 : 2;
    el.placeholder = mac === undefined ? p.desc : String(mac);
    if (p.type === 'json' && typeof mac === 'string') el.value = mac;
    return el;
  }

  // có danh sách giá trị: select nếu cố định, input + datalist nếu cho gõ tự do
  if (p.values && p.values.length && !p.tuDo) {
    const el = document.createElement('select');
    datOption(el, p);
    if (typeof mac === 'string' && p.values.includes(mac)) el.value = mac;
    return el;
  }

  const el = document.createElement('input');
  el.type = 'text';
  el.placeholder = mac === undefined ? p.desc : String(mac);
  if (p.values && p.values.length) {
    const dl = document.createElement('datalist');
    dl.id = `dl-${cmd.replace(/\./g, '-')}-${p.name}`;
    datDatalist(dl, p.values);
    el.setAttribute('list', dl.id);
    el.appendChild(dl);
  }
  return el;
}

function datOption(el: HTMLSelectElement, p: MoTaThamSo): void {
  el.innerHTML = '';
  if (!p.required) {
    const trong = document.createElement('option');
    trong.value = '';
    trong.textContent = '—';
    el.appendChild(trong);
  }
  for (const v of p.values ?? []) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    el.appendChild(o);
  }
}

function datDatalist(dl: HTMLDataListElement, values: string[]): void {
  dl.innerHTML = '';
  for (const v of values) {
    const o = document.createElement('option');
    o.value = v;
    dl.appendChild(o);
  }
}
