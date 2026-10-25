/**
 * bridge-client.ts — nối trình duyệt với bridge Node (`bridge/server.ts`).
 *
 * Trình duyệt là bên **chủ động kết nối** (vai `stage`): nhận gói lệnh từ
 * bridge, đưa vào đúng dispatcher mà UI đang dùng, trả `Result` về, và đẩy mọi
 * sự kiện sân khấu ngược lên.
 *
 * Chỉ bật khi mở app với `?bridge=1` (hoặc gọi `window.stage.bridge(true)`) —
 * để lần mở thường không có lỗi WebSocket nào trong console.
 */
import type { Command } from './api/types';
import type { Dispatcher } from './api/dispatcher';
import type { EventBus } from './events';

const CONG_MAC_DINH = 8787;
/** Cổng HTTP TTS của bridge (B2 #20 — xem `bridge/tts.ts`). */
const CONG_TTS_MAC_DINH = 8788;

export interface TrangThaiBridge {
  bat: boolean;
  url: string | null;
  noi: boolean;
}

export class BridgeClient {
  private ws: WebSocket | null = null;
  private dispatcher: Dispatcher;
  private bus: EventBus;
  private url: string;
  private boNgheSuKien: (() => void) | null = null;
  private henNoiLai = 0;
  private dungHan = false;

  constructor(dispatcher: Dispatcher, bus: EventBus, url?: string) {
    this.dispatcher = dispatcher;
    this.bus = bus;
    this.url = url ?? macDinhUrl();
  }

  trangThai(): TrangThaiBridge {
    return {
      bat: this.ws !== null || this.henNoiLai !== 0,
      url: this.url,
      noi: this.ws?.readyState === WebSocket.OPEN,
    };
  }

  bat(): void {
    this.dungHan = false;
    if (this.ws) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.addEventListener('open', () => {
      // bridge mở ra ngoài máy sẽ bật token — gửi ngay ở khung đầu
      const token = new URLSearchParams(location.search).get('bridgeToken');
      if (token) ws.send(JSON.stringify({ token }));
      this.bus.emit('bridge.connected', { url: this.url });
      this.boNgheSuKien = this.bus.on('*', (e) => {
        if (e.event.startsWith('bridge.')) return;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: e.event, data: e.data, t: e.t }));
        }
      });
    });

    ws.addEventListener('message', (ev) => void this.nhan(String(ev.data)));

    ws.addEventListener('close', () => {
      this.boNgheSuKien?.();
      this.boNgheSuKien = null;
      this.ws = null;
      this.bus.emit('bridge.disconnected', { url: this.url });
      if (!this.dungHan) {
        this.henNoiLai = window.setTimeout(() => {
          this.henNoiLai = 0;
          this.bat();
        }, 2000);
      }
    });

    // không log lỗi: bridge chưa chạy là bình thường, `close` sẽ tự thử lại
    ws.addEventListener('error', () => undefined);
  }

  tat(): void {
    this.dungHan = true;
    if (this.henNoiLai) {
      clearTimeout(this.henNoiLai);
      this.henNoiLai = 0;
    }
    this.ws?.close();
    this.ws = null;
  }

  private async nhan(tho: string): Promise<void> {
    let goi: Command;
    try {
      goi = JSON.parse(tho) as Command;
    } catch {
      this.guiVe({ ok: false, error: 'Gói JSON không đọc được' });
      return;
    }
    // gói không phải lệnh (vd xác nhận token) thì bỏ qua, không coi là lỗi
    if (!goi || typeof goi.cmd !== 'string') return;
    const kq = await this.dispatcher.runCommand(goi, 'bridge');
    this.guiVe(kq);
  }

  private guiVe(x: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(x));
  }
}

function macDinhUrl(): string {
  const cong = new URLSearchParams(location.search).get('bridgePort') ?? String(CONG_MAC_DINH);
  const giaoThuc = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const may = location.hostname || 'localhost';
  return `${giaoThuc}//${may}:${cong}/?role=stage`;
}

/**
 * B2 — chỗ **nhận audio** giọng tiếng Việt: cùng máy với bridge ws, khác cổng.
 *
 * Suy ra từ địa chỉ đang mở app, nên mở bằng `pnpm dev --host` trên điện thoại
 * thì vẫn trúng máy chạy bridge. Ghi đè bằng `?ttsUrl=` hoặc `?ttsPort=`.
 */
export function urlTts(): string {
  const q = new URLSearchParams(location.search);
  const thang = q.get('ttsUrl');
  if (thang) return thang;
  const cong = q.get('ttsPort') ?? String(CONG_TTS_MAC_DINH);
  const may = location.hostname || '127.0.0.1';
  return `${location.protocol === 'https:' ? 'https:' : 'http:'}//${may}:${cong}`;
}

/** Có bật bridge lúc mở app không. */
/** Mặc định BẬT (bridge chưa chạy thì tự thử lại, không lỗi); tắt bằng `?bridge=0`. */
export function coBatBridge(): boolean {
  const q = new URLSearchParams(location.search).get('bridge');
  return !(q === '0' || q === 'false');
}
