/**
 * dispatcher.ts — **một hàm duy nhất** `run(cmd, args)` cho mọi đường vào.
 *
 * Nút trên UI, ô kịch bản, bridge WebSocket và (sau này) MCP đều gọi vào đây,
 * nên Boss bấm tay được gì thì agent gọi được đúng cái đó, không lệch.
 *
 * Việc của dispatcher:
 *  1. tìm lệnh trong registry (không có → lỗi rõ ràng),
 *  2. kiểm tra + chuẩn hoá tham số (`validate.ts`),
 *  3. xếp hàng khi actor đang bận, hoặc cắt ngang nếu `interrupt: true`,
 *  4. trả lời ngay kèm `durationMs`, bắn sự kiện khi hành động xong,
 *  5. ghi nhật ký mọi lệnh.
 */
import type {
  Command,
  CommandCtx,
  CommandSpec,
  EventBusLike,
  Result,
  StageWorld,
} from './types';
import { Registry } from './registry';
import { kiemThamSo } from './validate';
import type { NhatKy } from '../log';

interface ViecCho {
  cmd: string;
  args: Record<string, unknown>;
  nguon: string;
  resolve: (r: Result) => void;
}

interface DangChay {
  /**
   * Mã riêng của **lần chạy này**, không phải tên lệnh.
   *
   * Nhận diện bằng tên lệnh là sai: cắt `actor.play` bằng đúng `actor.play` thì
   * `done` của hành động cũ về sau sẽ xoá nhầm bản ghi của hành động mới, làm
   * `busy` thành `false` giả và hàng đợi xả sớm.
   */
  token: number;
  cmd: string;
  cancel?: () => void;
  /**
   * Nguồn đã gọi lệnh này (`ui` · `bridge` · `phan-xa` · `window.stage`…).
   *
   * I1 vòng 2 (#74, review PR #75 mục mong manh 2): phản xạ cần biết **cái
   * đang chiếm Nhi là việc của ai** để quyết định có được cắt hay không. Bản
   * I1 vòng 1 dùng một cờ `boolean` tự hết hạn theo nhịp 100 ms, nên có cửa
   * sổ ≤100 ms mà cờ còn bật trong lúc slot đã thuộc về não → phản xạ cắt rồi
   * **xếp câu đệm SAU câu của não**. Đọc thẳng nguồn của slot thì không còn
   * cửa sổ nào.
   */
  nguon: string;
  /**
   * Đã bị cắt (xem `CommandCtx.daHuy`). Đặt bởi `catNhe`/`catNgang` để
   * handler đang treo trong `await` tự thôi sau khi `await` xong.
   */
  daHuy?: boolean;
}

export interface DispatcherOpts {
  registry: Registry;
  world: StageWorld;
  bus: EventBusLike;
  nhatKy?: NhatKy;
}

export class Dispatcher {
  readonly registry: Registry;
  readonly world: StageWorld;
  readonly bus: EventBusLike;
  private nhatKy?: NhatKy;

  /** Hành động đang chiếm actor, theo id actor. */
  private dangChay = new Map<string, DangChay>();
  /** Lệnh chờ actor rảnh, theo id actor. */
  private hangDoiActor = new Map<string, ViecCho[]>();
  /** Bộ đếm sinh token cho mỗi lần chạy. */
  private demToken = 0;

  constructor(o: DispatcherOpts) {
    this.registry = o.registry;
    this.world = o.world;
    this.bus = o.bus;
    this.nhatKy = o.nhatKy;
  }

  /**
   * Bối cảnh truyền cho handler.
   *
   * `actor`/`token` chỉ có khi lệnh chiếm actor — đó là cái làm `daHuy()` biết
   * nói về ĐÚNG lượt chạy này, không phải lượt nào khác của cùng actor.
   */
  private ctx(actor = '', token = 0): CommandCtx {
    return {
      world: this.world,
      bus: this.bus,
      registry: this.registry,
      run: (cmd, args) => this.run(cmd, args, 'noi-bo'),
      daHuy: () => {
        if (!actor) return false;
        const h = this.dangChay.get(actor);
        return h === undefined || h.token !== token || h.daHuy === true;
      },
      hangDoi: () => this.trangThaiHangDoi(),
      catNgang: (actor) => this.catNgang(actor),
    };
  }

  /** Trạng thái bận/chờ của từng actor — `stage.describe` ghép vào snapshot. */
  trangThaiHangDoi(): Record<string, { busy: boolean; queued: number }> {
    const ra: Record<string, { busy: boolean; queued: number }> = {};
    for (const id of this.world.actorIds()) {
      ra[id] = {
        busy: this.dangChay.has(id),
        queued: this.hangDoiActor.get(id)?.length ?? 0,
      };
    }
    return ra;
  }

  dangBan(actor: string): boolean {
    return this.dangChay.has(actor);
  }

  /**
   * I1 vòng 2 — **nguồn của hành động đang chiếm actor** (`null` = đang rảnh).
   *
   * Phản xạ đọc cái này thay cho cờ `dangDienCho` cũ: nó là sự thật của chính
   * dispatcher, không có cửa sổ lệch nhịp nào.
   */
  nguonDangChay(actor: string): string | null {
    return this.dangChay.get(actor)?.nguon ?? null;
  }

  /**
   * I1 vòng 2 — **cắt NHẸ**: huỷ đúng hành động đang chạy, **GIỮ hàng đợi**.
   *
   * Đây là cửa cho phản xạ nhường chỗ (câu đệm/tư thế nghĩ của chính nó).
   * `catNgang` không dùng được vì nó xoá sạch hàng đợi → giết luôn câu của não
   * vừa xếp hàng sau câu đệm (quyết định C0). So với việc gọi thẳng
   * `world.actorInterrupt`, hàm này thêm đúng một thứ cần thiết: đánh dấu
   * `daHuy` để handler còn đang treo trong `await chuanBiGiong` tự thôi —
   * không thì câu đã bị cắt vẫn phát trọn (review PR #75).
   */
  catNhe(actor: string): void {
    const hien = this.dangChay.get(actor);
    if (hien) hien.daHuy = true;
    hien?.cancel?.();
    this.world.actorInterrupt(actor);
  }

  soCho(actor: string): number {
    return this.hangDoiActor.get(actor)?.length ?? 0;
  }

  /* ----------------------------------------------------------- cửa chính */

  /** Gọi một lệnh. Không bao giờ ném ra ngoài — lỗi về dưới dạng `ok: false`. */
  async run(
    cmd: string,
    args?: Record<string, unknown>,
    nguon = 'ui',
  ): Promise<Result> {
    const batDau = Date.now();
    const spec = this.registry.get(cmd);

    if (!spec) {
      const gan = this.goiYTenGan(cmd);
      return this.ghi(
        cmd,
        args ?? {},
        {
          ok: false,
          error: `Không có lệnh "${cmd}".${gan ? ` Ý Boss là "${gan}"?` : ''} Gọi stage.bootstrap để xem danh sách.`,
        },
        batDau,
        nguon,
      );
    }

    const kiem = kiemThamSo(spec, args, this.world);
    if (!kiem.ok) {
      return this.ghi(cmd, args ?? {}, { ok: false, error: kiem.error }, batDau, nguon);
    }
    const sach = kiem.args;

    /* --- lệnh chiếm actor: kiểm tra tồn tại, bận thì xếp hàng --- */
    if (spec.chiemActor) {
      const actor = String(sach[spec.chiemActor] ?? '');
      if (!this.world.coActor(actor)) {
        return this.ghi(
          cmd,
          sach,
          {
            ok: false,
            error: `Không có actor "${actor}". Đang có: ${
              this.world.actorIds().join(', ') || '(chưa có ai)'
            }`,
          },
          batDau,
          nguon,
        );
      }

      const catNgang = sach.interrupt === true;
      delete sach.interrupt;

      if (catNgang) {
        this.catNgang(actor);
      } else if (this.dangChay.has(actor)) {
        const cho = this.hangDoiActor.get(actor) ?? [];
        this.hangDoiActor.set(actor, cho);
        const kq = await new Promise<Result>((resolve) => {
          cho.push({ cmd, args: sach, nguon, resolve });
          this.bus.emit('cmd.queued', {
            cmd,
            actor,
            position: cho.length,
            dangChay: this.dangChay.get(actor)?.cmd ?? null,
          });
        });
        return kq;
      }
    }

    return this.chay(spec, sach, batDau, nguon);
  }

  /** Gọi bằng gói `Command` (bridge/MCP dùng), giữ lại `id` để ghép cặp. */
  async runCommand(c: Command, nguon = 'bridge'): Promise<Result> {
    const kq = await this.run(c.cmd, c.args as Record<string, unknown>, nguon);
    return c.id === undefined ? kq : { ...kq, id: c.id };
  }

  /* --------------------------------------------------------- chạy thật */

  private async chay(
    spec: CommandSpec,
    args: Record<string, unknown>,
    batDau: number,
    nguon: string,
  ): Promise<Result> {
    const actor = spec.chiemActor ? String(args[spec.chiemActor] ?? '') : '';

    const token = ++this.demToken;

    try {
      // đánh dấu bận TRƯỚC khi gọi handler: handler có thể gọi lệnh khác
      if (actor) this.dangChay.set(actor, { token, cmd: spec.cmd, nguon });

      const kq = await spec.handler(args, this.ctx(actor, token));

      const result: Record<string, unknown> = { ...kq.result };
      if (kq.durationMs !== undefined) result.durationMs = kq.durationMs;

      if (actor) {
        // hành động cũ có thể đã cắt mình giữa chừng → không giành lại chỗ
        const conGiuCho = this.dangChay.get(actor)?.token === token;
        if (kq.done && conGiuCho) {
          this.dangChay.set(actor, { token, cmd: spec.cmd, nguon, cancel: kq.cancel });
          void kq.done
            .catch(() => undefined)
            .then(() => this.xongActor(actor, token));
        } else if (conGiuCho) {
          this.dangChay.delete(actor);
          this.giaiPhong(actor);
        }
      }

      return this.ghi(spec.cmd, args, { ok: true, result }, batDau, nguon);
    } catch (e) {
      if (actor && this.dangChay.get(actor)?.token === token) {
        this.dangChay.delete(actor);
        this.giaiPhong(actor);
      }
      const error = e instanceof Error ? e.message : String(e);
      return this.ghi(spec.cmd, args, { ok: false, error }, batDau, nguon);
    }
  }

  private xongActor(actor: string, token: number): void {
    const hien = this.dangChay.get(actor);
    // so TOKEN chứ không so tên lệnh: hành động cũ xong muộn không được dọn chỗ
    // của hành động mới (kể cả khi hai bên trùng tên lệnh)
    if (!hien || hien.token !== token) return;
    this.dangChay.delete(actor);
    this.giaiPhong(actor);
  }

  /** Lấy lệnh kế tiếp trong hàng đợi của actor ra chạy. */
  private giaiPhong(actor: string): void {
    if (this.dangChay.has(actor)) return;
    const cho = this.hangDoiActor.get(actor);
    if (!cho || cho.length === 0) return;
    const viec = cho.shift()!;
    if (cho.length === 0) this.hangDoiActor.delete(actor);

    const spec = this.registry.get(viec.cmd);
    if (!spec) {
      viec.resolve({ ok: false, error: `Không có lệnh "${viec.cmd}"` });
      this.giaiPhong(actor);
      return;
    }
    void this.chay(spec, viec.args, Date.now(), viec.nguon).then(viec.resolve);
  }

  /** Cắt hành động đang chạy + bỏ sạch hàng đợi của actor. */
  catNgang(actor: string): number {
    const hien = this.dangChay.get(actor);
    // handler còn treo trong `await` cũng phải biết là mình đã bị cắt
    if (hien) hien.daHuy = true;
    this.dangChay.delete(actor);
    hien?.cancel?.();
    this.world.actorInterrupt(actor);

    const cho = this.hangDoiActor.get(actor) ?? [];
    this.hangDoiActor.delete(actor);
    for (const v of cho) {
      v.resolve({ ok: false, error: `Bị cắt bởi interrupt (lệnh ${v.cmd})` });
    }
    if (hien || cho.length) {
      this.bus.emit('cmd.interrupted', {
        actor,
        catLenh: hien?.cmd ?? null,
        boHangDoi: cho.length,
      });
    }
    return cho.length;
  }

  /** Xoá sạch hàng đợi mọi actor (dùng cho `stage.reset`). */
  donSach(): void {
    for (const actor of [...this.dangChay.keys(), ...this.hangDoiActor.keys()]) {
      this.catNgang(actor);
    }
  }

  /* ----------------------------------------------------------- phụ trợ */

  private ghi(
    cmd: string,
    args: Record<string, unknown>,
    kq: Result,
    batDau: number,
    nguon: string,
  ): Result {
    const durationMs = Date.now() - batDau;
    this.nhatKy?.ghiLenh(cmd, args, kq, durationMs, nguon);
    if (!kq.ok) this.bus.emit('cmd.error', { cmd, args, error: kq.error });
    return kq;
  }

  /** Gợi ý tên lệnh gần nhất khi agent gõ sai (so khớp thô theo ký tự chung). */
  private goiYTenGan(cmd: string): string | null {
    const thap = cmd.toLowerCase();
    let tot: string | null = null;
    let diemTot = 0;
    for (const s of this.registry.all()) {
      const a = s.cmd.toLowerCase();
      let diem = 0;
      for (let i = 0; i < Math.min(a.length, thap.length); i++) {
        if (a[i] === thap[i]) diem++;
        else break;
      }
      if (a.includes(thap) || thap.includes(a)) diem += 3;
      if (diem > diemTot) {
        diemTot = diem;
        tot = s.cmd;
      }
    }
    return diemTot >= 4 ? tot : null;
  }
}
