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
import { BridgeClient, coBatBridge } from './bridge-client';
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

const world = new World(canvas, bus, bongBongLop);
const registry = taoRegistry();
const dispatcher = new Dispatcher({ registry, world, bus, nhatKy });
const bridge = new BridgeClient(dispatcher, bus);

let hanToast = 0;
function toast(chu: string): void {
  toastEl.textContent = chu;
  toastEl.classList.add('hien');
  clearTimeout(hanToast);
  hanToast = window.setTimeout(() => toastEl.classList.remove('hien'), 2600);
}

/* --------------------------------------------------------- cửa window.stage */

let sanSang = false;
window.stage = {
  run: (cmd, args) => dispatcher.run(cmd, args, 'window.stage'),
  runCommand: (c) => dispatcher.runCommand(c, 'window.stage'),
  describe: () => dispatcher.run('stage.describe', {}, 'window.stage'),
  bootstrap: () => dispatcher.run('stage.bootstrap', {}, 'window.stage'),
  on: (event, fn) => bus.on(event, fn),
  log: () => nhatKy.toJSON(),
  bridge: (bat) => (bat ? bridge.bat() : bridge.tat()),
  get san() {
    return sanSang;
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

  loading.classList.add('xong');
  sanSang = true;
  bus.emit('stage.ready', { actors: world.actorIds(), places: world.placeIds() });
  toast('Bảng lệnh bên phải · bấm từng lệnh để thử');

  if (coBatBridge()) bridge.bat();
}

/* ------------------------------------------- Boss bấm vào nhân vật / đồ vật */

canvas.addEventListener('pointerdown', (e) => {
  if (!sanSang) return;
  bus.emit('user.click', { x: e.clientX, y: e.clientY });
});

void khoiDong();
