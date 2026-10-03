/**
 * script-box.ts — ô kịch bản (spec mục 4).
 *
 * Nhận hai dạng:
 *  1. **JSON**: `{ "cmd": "script.run", "args": { "steps": [...] } }`, hoặc một
 *     lệnh đơn `{ "cmd": "...", "args": {...} }`, hoặc thẳng mảng các bước.
 *  2. **Dạng ngắn**, một lệnh mỗi dòng:
 *     ```
 *     lan moveTo ban-2
 *     waitFor actor.arrived
 *     lan express happy
 *     lan say Sếp ơi, test xanh rồi!
 *     wait 500
 *     ```
 *     Dòng bắt đầu bằng `#` là ghi chú. `<actor> <việc> …` tự thành
 *     `actor.<việc>`; tham số xếp theo đúng thứ tự khai báo trong registry, hoặc
 *     ghi rõ `key=value`.
 */
import type { Dispatcher } from '../api/dispatcher';
import { danhSachThamSo } from '../api/registry';
import type { Step } from '../api/commands/script';

export interface KetQuaPhanTich {
  /** Lệnh chạy ngay (dạng JSON một lệnh). */
  lenh?: { cmd: string; args: Record<string, unknown> };
  /** Nhiều bước → gói vào `script.run`. */
  steps?: Step[];
  mode?: 'sequential' | 'parallel';
}

export class OKichBan {
  private ta: HTMLTextAreaElement;
  private nutChay: HTMLButtonElement;
  private nutDung: HTMLButtonElement;
  private nutMau: HTMLButtonElement;
  private oMode: HTMLSelectElement;
  private kq: HTMLElement;
  private dispatcher: Dispatcher;

  constructor(root: HTMLElement, dispatcher: Dispatcher) {
    this.dispatcher = dispatcher;
    root.innerHTML = `
      <p class="goi-y">Dán JSON, hoặc gõ dạng ngắn — <b>1 lệnh / 1 dòng</b>:
        <code>lan moveTo ban-2</code>, <code>wait 500</code>,
        <code>waitFor actor.arrived</code>.</p>
      <textarea id="kb-nhap" rows="9" spellcheck="false"
        placeholder="lan moveTo ban-2&#10;waitFor actor.arrived&#10;lan express happy&#10;lan say Sếp ơi, test xanh rồi!&#10;lan play celebrate"></textarea>
      <div class="kb-chan">
        <select id="kb-mode" title="Cách chạy các bước">
          <option value="sequential">Lần lượt</option>
          <option value="parallel">Cùng lúc</option>
        </select>
        <button type="button" id="kb-chay" class="chinh">▶ Chạy kịch bản</button>
        <button type="button" id="kb-dung">■ Dừng</button>
        <button type="button" id="kb-mau">Kịch bản mẫu</button>
      </div>
      <output id="kb-kq" class="kb-kq"></output>`;

    this.ta = root.querySelector<HTMLTextAreaElement>('#kb-nhap')!;
    this.nutChay = root.querySelector<HTMLButtonElement>('#kb-chay')!;
    this.nutDung = root.querySelector<HTMLButtonElement>('#kb-dung')!;
    this.nutMau = root.querySelector<HTMLButtonElement>('#kb-mau')!;
    this.oMode = root.querySelector<HTMLSelectElement>('#kb-mode')!;
    this.kq = root.querySelector<HTMLElement>('#kb-kq')!;

    this.nutChay.addEventListener('click', () => void this.chay());
    this.nutDung.addEventListener('click', () => void this.dung());
    this.nutMau.addEventListener('click', () => {
      this.ta.value = KICH_BAN_MAU;
    });
  }

  datNoiDung(chu: string): void {
    this.ta.value = chu;
  }

  async chay(): Promise<void> {
    const tho = this.ta.value;
    this.kq.className = 'kb-kq dang-chay';
    this.kq.textContent = 'Đang phân tích…';

    let pt: KetQuaPhanTich;
    try {
      pt = phanTich(tho, this.dispatcher);
    } catch (e) {
      this.kq.className = 'kb-kq loi';
      this.kq.textContent = e instanceof Error ? e.message : String(e);
      return;
    }

    const r = pt.lenh
      ? await this.dispatcher.run(pt.lenh.cmd, pt.lenh.args, 'ui-kich-ban')
      : await this.dispatcher.run(
          'script.run',
          { steps: pt.steps, mode: pt.mode ?? this.oMode.value },
          'ui-kich-ban',
        );

    if (r.ok) {
      this.kq.className = 'kb-kq ok';
      this.kq.textContent = `Đã gửi: ${JSON.stringify(r.result)}`;
    } else {
      this.kq.className = 'kb-kq loi';
      this.kq.textContent = r.error;
    }
  }

  private async dung(): Promise<void> {
    const r = await this.dispatcher.run('script.stop', {}, 'ui-kich-ban');
    this.kq.className = r.ok ? 'kb-kq ok' : 'kb-kq loi';
    this.kq.textContent = r.ok ? 'Đã dừng kịch bản.' : r.error;
  }
}

/** Kịch bản mẫu của spec mục 3.4 (bỏ phần screen/module thuộc A3). */
export const KICH_BAN_MAU = JSON.stringify(
  {
    cmd: 'script.run',
    args: {
      steps: [
        { cmd: 'actor.moveTo', args: { actor: 'lan', to: 'ban-2' } },
        { waitFor: 'actor.arrived' },
        { cmd: 'actor.express', args: { actor: 'lan', expression: 'happy' } },
        { cmd: 'actor.say', args: { actor: 'lan', text: 'Sếp ơi, test xanh rồi!' } },
        { cmd: 'actor.play', args: { actor: 'lan', clip: 'celebrate' } },
      ],
    },
  },
  null,
  2,
);

/* --------------------------------------------------------------- phân tích */

export function phanTich(tho: string, dispatcher: Dispatcher): KetQuaPhanTich {
  const chu = tho.trim();
  if (!chu) throw new Error('Ô kịch bản đang rỗng.');

  if (chu.startsWith('{') || chu.startsWith('[')) return phanTichJson(chu);
  return { steps: phanTichDangNgan(chu, dispatcher) };
}

function phanTichJson(chu: string): KetQuaPhanTich {
  let j: unknown;
  try {
    j = JSON.parse(chu);
  } catch (e) {
    throw new Error(`JSON sai: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (Array.isArray(j)) return { steps: j as Step[] };

  const o = j as Record<string, unknown>;
  if (typeof o.cmd === 'string') {
    const args = (o.args ?? {}) as Record<string, unknown>;
    if (o.cmd === 'script.run') {
      const steps = args.steps;
      if (!Array.isArray(steps)) throw new Error('script.run thiếu "steps" dạng mảng.');
      return {
        steps: steps as Step[],
        mode: args.mode === 'parallel' ? 'parallel' : 'sequential',
      };
    }
    return { lenh: { cmd: o.cmd, args } };
  }
  if (Array.isArray(o.steps)) {
    return {
      steps: o.steps as Step[],
      mode: o.mode === 'parallel' ? 'parallel' : 'sequential',
    };
  }
  throw new Error('JSON phải có "cmd" hoặc "steps".');
}

export function phanTichDangNgan(chu: string, dispatcher: Dispatcher): Step[] {
  const steps: Step[] = [];
  const dong = chu.split('\n');

  for (let i = 0; i < dong.length; i++) {
    const d = dong[i]!.trim();
    if (!d || d.startsWith('#') || d.startsWith('//')) continue;

    const tk = catToken(d);
    const dau = tk[0]!;

    if (dau === 'wait') {
      const ms = Number(tk[1]);
      if (!Number.isFinite(ms)) throw new Error(`Dòng ${i + 1}: "wait" cần số ms.`);
      steps.push({ wait: ms });
      continue;
    }
    if (dau === 'waitFor' || dau === 'waitfor') {
      if (!tk[1]) throw new Error(`Dòng ${i + 1}: "waitFor" cần tên sự kiện.`);
      steps.push({ waitFor: tk[1] });
      continue;
    }

    // `nhom.lenh …` hoặc `<actor> <viec> …`
    let cmd: string;
    let phan: string[];
    let actorNgam: string | null = null;
    if (dau.includes('.')) {
      cmd = dau;
      phan = tk.slice(1);
    } else {
      if (!tk[1]) {
        throw new Error(
          `Dòng ${i + 1}: không hiểu "${d}". Viết "<actor> <việc> …" hoặc "nhom.lenh …".`,
        );
      }
      cmd = `actor.${tk[1]}`;
      actorNgam = dau;
      phan = tk.slice(2);
    }

    const spec = dispatcher.registry.get(cmd);
    if (!spec) throw new Error(`Dòng ${i + 1}: không có lệnh "${cmd}".`);

    const params = danhSachThamSo(spec);
    const args: Record<string, unknown> = {};
    if (actorNgam) args.actor = actorNgam;

    // dạng key=value nếu mọi mẩu đều có dấu "="
    const coTen = phan.length > 0 && phan.every((p) => /^[A-Za-z_][\w]*=/.test(p));
    if (coTen) {
      for (const p of phan) {
        const k = p.slice(0, p.indexOf('='));
        args[k] = p.slice(p.indexOf('=') + 1);
      }
    } else {
      const conLai = params.filter((p) => p.name !== 'actor' || !actorNgam);
      let j = 0;
      for (const p of conLai) {
        if (j >= phan.length) break;
        if (p.type === 'text') {
          // tham số chữ lấy hết phần còn lại của dòng
          args[p.name] = phan.slice(j).join(' ');
          j = phan.length;
        } else {
          args[p.name] = phan[j]!;
          j++;
        }
      }
      if (j < phan.length) {
        throw new Error(
          `Dòng ${i + 1}: "${cmd}" chỉ nhận ${conLai.length} tham số, thừa "${phan
            .slice(j)
            .join(' ')}".`,
        );
      }
    }

    steps.push({ cmd, args });
  }

  if (!steps.length) throw new Error('Không có dòng lệnh nào đọc được.');
  return steps;
}

/** Cắt token theo khoảng trắng, giữ nguyên phần trong dấu ngoặc kép. */
function catToken(d: string): string[] {
  const ra: string[] = [];
  let hienTai = '';
  let trongNgoac = false;
  for (const c of d) {
    if (c === '"') {
      trongNgoac = !trongNgoac;
      continue;
    }
    if (!trongNgoac && /\s/.test(c)) {
      if (hienTai) ra.push(hienTai);
      hienTai = '';
      continue;
    }
    hienTai += c;
  }
  if (hienTai) ra.push(hienTai);
  return ra;
}
