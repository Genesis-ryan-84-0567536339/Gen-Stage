/**
 * main.ts — nối dây: sân khấu ↔ dispatcher ↔ giao diện ↔ bridge.
 *
 * File này chỉ **lắp**, không chứa nghiệp vụ: cảnh ở `src/stage/`, bộ lệnh ở
 * `src/api/commands/`, giao diện ở `src/ui/`. Cuối cùng phơi `window.stage` để
 * Playwright, bridge và (sau này) MCP gọi vào đúng một cửa.
 */
import { EventBus } from './events';
import { NhatKy } from './log';
import { taoRegistry } from './api/commands/index';
import { Dispatcher } from './api/dispatcher';
import { World } from './stage/world';
import { dungGiaoDien } from './ui/index';
import { batPhim } from './ui/phim';
// B3 (#21) — ô chat dưới màn hình: cùng đường với Space, bắn `user.text`.
import { batOChat } from './ui/o-chat';
// C2 (#32) — lớp hiểu lệnh giọng: nghe `user.text`/`user.speech` trên bus.
import { batHieuLenh } from './behavior/hieu-lenh';
// C0 (#28) — phản xạ xã hội: Gen quay lại, nhìn, đáp ngay khi Sếp gọi, KHÔNG chờ não.
import { batPhanXa } from './behavior/phan-xa';
import { BridgeClient, coBatBridge, urlTts } from './bridge-client';
// B2 (#20) — giọng tiếng Việt thật + nút mở khoá autoplay.
import { lopTieng } from './audio/tts-client';
import { ganNutTieng } from './audio/nut-tieng';
import type { Command, Result, StageEvent } from './api/types';

/** Cửa duy nhất cho test / bridge / agent. */
export interface CuaStage {
  run(cmd: string, args?: Record<string, unknown>): Promise<Result>;
  runCommand(c: Command): Promise<Result>;
  describe(): Promise<Result>;
  bootstrap(): Promise<Result>;
  on(event: string, fn: (e: StageEvent) => void): () => void;
  /** Nhật ký JSON (bằng chứng kiểm thử). */
  log(): string;
  bridge(bat: boolean): void;
  san: boolean;
  /**
   * A3 — agent đẩy từng mẩu nội dung khi `screen.stream` có `source: "agent"`
   * (spec mục 3.4b). Gọi trực tiếp (không qua dispatcher): vẽ lên màn hình
   * NGAY và bắn `screen.fed` để Action đang chờ của `screen.stream` biết còn
   * sống, tự lùi hẹn giờ kết thúc.
   */
  feed(screen: string, chunk: string): void;
  /** Số đo xương (bằng chứng số cho `scripts/kiem-a2.mjs`). */
  doXuong(actor: string): Record<string, unknown>;
  /** Đặt góc máy thủ công, tức thì (ảnh bằng chứng — xem `World.datMayThu`). */
  datMay(vt: [number, number, number], tam: [number, number, number]): void;
  /**
   * B2 — mở khoá autoplay (trình duyệt chặn tiếng tới khi có cú bấm thật).
   * Trả `true` khi `AudioContext` đã chạy. Script bằng chứng gọi cái này.
   */
  batTieng(): Promise<boolean>;
  /**
   * B2 — số đo nhép miệng theo âm của một actor (bằng chứng):
   * `{ soMau, soMauDuong, dinh }`. `soMauDuong > 0` = miệng đã chạy theo âm thật.
   */
  doTieng(actor: string): { soMau: number; soMauDuong: number; dinh: number };
  /**
   * B3 — gõ một câu vào ô chat như Boss (bằng chứng `scripts/kiem-b3.mjs`).
   * Đi đúng đường của ô chat → `actor.say` owner → sự kiện `user.text`.
   */
  guiChat(chu: string): Promise<boolean>;
}

declare global {
  interface Window {
    stage: CuaStage;
  }
}

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const loading = document.getElementById('loading')!;
const loadingText = document.getElementById('loading-text')!;
const toastEl = document.getElementById('toast')!;
const bongBongLop = document.getElementById('bong-bong-lop')!;

const bus = new EventBus();
const nhatKy = new NhatKy();
nhatKy.theoBus(bus);

let world: World;
try {
  world = new World(canvas, bus, bongBongLop);
} catch (e) {
  console.error('[Gen-Stage] Không tạo được WebGL:', e);
  loadingText.textContent =
    'Trình duyệt này không bật được WebGL (3D). Hãy mở bằng Chrome/Firefox thật trên máy, ' +
    'không dùng khung xem trong app. Kiểm tra: chrome://gpu → WebGL phải là "Hardware accelerated".';
  document.querySelector('#loading .spin')?.remove();
  throw e;
}
const registry = taoRegistry();
const dispatcher = new Dispatcher({ registry, world, bus, nhatKy });
/**
 * C2 (#32) — BẬT TRƯỚC cầu nối: lớp hiểu lệnh phải là người nghe `user.text`
 * ĐẦU TIÊN để kịp đánh dấu `handled: true` trước khi sự kiện đi ra bridge/MCP
 * (xem `src/behavior/hieu-lenh.ts`).
 */
const hieuLenh = batHieuLenh(dispatcher, bus, (chu) => toast(chu));
const bridge = new BridgeClient(dispatcher, bus);
// B2 — lớp tiếng dùng chung; `null` nếu trình duyệt không có Web Audio.
const tieng = lopTieng();
tieng?.capHinh({ url: urlTts() });

let hanToast = 0;
function toast(chu: string): void {
  toastEl.textContent = chu;
  toastEl.classList.add('hien');
  clearTimeout(hanToast);
  hanToast = window.setTimeout(() => toastEl.classList.remove('hien'), 2600);
}

/* --------------------------------------------------------- cửa window.stage */

let sanSang = false;
/** B3 — ô chat (gán sau khi giao diện dựng xong). */
let oChat: { gui(chu: string): Promise<boolean> } | null = null;
window.stage = {
  run: (cmd, args) => dispatcher.run(cmd, args, 'window.stage'),
  runCommand: (c) => dispatcher.runCommand(c, 'window.stage'),
  describe: () => dispatcher.run('stage.describe', {}, 'window.stage'),
  bootstrap: () => dispatcher.run('stage.bootstrap', {}, 'window.stage'),
  on: (event, fn) => bus.on(event, fn),
  log: () => nhatKy.toJSON(),
  bridge: (bat) => (bat ? bridge.bat() : bridge.tat()),
  doXuong: (actor) => world.doXuongActor(actor),
  datMay: (vt, tam) => world.datMayThu(vt, tam),
  batTieng: () => tieng?.batTieng() ?? Promise.resolve(false),
  doTieng: (actor) => tieng?.thongKe(actor) ?? { soMau: 0, soMauDuong: 0, dinh: 0 },
  get san() {
    return sanSang;
  },
  guiChat: (chu) => oChat?.gui(chu) ?? Promise.resolve(false),
  feed: (screen, chunk) => {
    world.screenAppend(screen, chunk);
    bus.emit('screen.fed', { screen, chunk });
  },
} as CuaStage;

/* --------------------------------------------------------------- khởi động */

async function khoiDong(): Promise<void> {
  try {
    const { dungKenney } = await world.napCanh((chu) => {
      loadingText.textContent = chu;
    });
    if (!dungKenney) {
      console.info(
        '[Gen-Stage] Chưa thấy model Kenney trong public/kenney/ — dùng nội thất tự dựng. ' +
          'Chạy `bash scripts/fetch-assets.sh` để tải bản CC0.',
      );
    }
  } catch (e) {
    console.error('[Gen-Stage] Không nạp được cảnh:', e);
    loadingText.textContent =
      'Không nạp được nhân vật. Chạy: bash scripts/fetch-assets.sh';
    setTimeout(() => loading.classList.add('xong'), 2600);
    return;
  }

  world.batDauVe();
  loadingText.textContent = 'Đang dựng bảng lệnh…';
  await dungGiaoDien(dispatcher, bus, nhatKy);

  // Issue #14 — bàn phím là mặt thứ ba của cùng bộ lệnh, vẫn qua dispatcher.
  batPhim(dispatcher, toast);

  // B3 (#21) — chỗ Boss gõ cho Gen: cùng `actor.say` lên nhân vật owner.
  oChat = batOChat(dispatcher, toast);

  // B2 (#20) — nút "🔊 Bật tiếng" (ẩn nếu Boss đã đồng ý ở phiên trước).
  if (tieng) {
    tieng.capHinh({ toast });
    ganNutTieng(tieng, toast);
  }

  // C0 (#28) — bật "tuỷ sống" của Gen. Đặt sau khi cảnh đã có đủ nhân vật, và
  // trước `stage.ready` để câu đầu tiên của Sếp cũng được phản xạ bắt.
  batPhanXa({ dispatcher, bus });

  loading.classList.add('xong');
  sanSang = true;
  bus.emit('stage.ready', { actors: world.actorIds(), places: world.placeIds() });
  toast('WASD để đi · 1–0 emote · Space nói · ? xem bảng phím');

  // C2 — nạp danh sách place/emote/màn hình cho lớp hiểu lệnh (sinh từ bootstrap)
  await hieuLenh.lamMoi();

  if (coBatBridge()) bridge.bat();
}

/* ------------------------------------------- Boss bấm vào nhân vật / đồ vật */

canvas.addEventListener('pointerdown', (e) => {
  if (!sanSang) return;
  bus.emit('user.click', { x: e.clientX, y: e.clientY });
});

void khoiDong();
