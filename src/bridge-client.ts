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
// C0 (#28) — bridge báo số client MCP đang nối; sân khấu đọc lại qua sổ này.
import { datSoNao, xoaSoNao } from './behavior/so-nao';
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

    ws.addEventListener('close', (ev) => {
      this.boNgheSuKien?.();
      this.boNgheSuKien = null;
      this.ws = null;
      if (ev.code === 4001) {
        // Tab khác vừa nối bridge: tab này lùi lại, KHÔNG tranh (tránh đá nhau).
        this.dungHan = true;
        xoaSoNao();
        this.bus.emit('bridge.replaced', { url: this.url });
        this.bus.emit('bridge.disconnected', { url: this.url });
        return;
      }
      // mất bridge = mất đường tới não: `brainConnected` phải về false ngay
      xoaSoNao();
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
    /**
     * C0 (#28) — bridge cũng **đẩy sự kiện xuống** sân khấu, không chỉ lệnh.
     * Sự kiện duy nhất hiện có là `bridge.brain` (số client MCP đang nối).
     * Tên bắt đầu bằng `bridge.` nên vòng gửi ngược ở `open` bỏ qua — không
     * có vòng lặp.
     */
    const sk = goi as unknown as { event?: unknown; data?: Record<string, unknown> };
    if (typeof sk.event === 'string') {
      if (sk.event === 'bridge.brain') datSoNao(Number(sk.data?.count ?? 0));
      this.bus.emit(sk.event, sk.data ?? {});
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
  return `${giaoThuc}//${mayBridge()}:${cong}/?role=stage`;
}

/**
 * Máy chạy bridge, suy ra từ địa chỉ đang mở app.
 *
 * Cạm bẫy đã đo: để nguyên `localhost` thì Chrome thử `::1` TRƯỚC, mà bridge
 * mặc định chỉ nghe `127.0.0.1` (IPv4) → mỗi lần nối đều ném một
 * `ERR_CONNECTION_REFUSED` ra console rồi mới nối lại bằng IPv4. Nối vẫn
 * được, nhưng console đầy lỗi giả. Đổi thẳng sang `127.0.0.1` cho khỏi phải
 * thử hai lần.
 */
function mayBridge(): string {
  const may = location.hostname || '127.0.0.1';
  return may === 'localhost' ? '127.0.0.1' : may;
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
  return `${location.protocol === 'https:' ? 'https:' : 'http:'}//${mayBridge()}:${cong}`;
}

/** Có bật bridge lúc mở app không. */
/** Mặc định BẬT (bridge chưa chạy thì tự thử lại, không lỗi); tắt bằng `?bridge=0`. */
export function coBatBridge(): boolean {
  const q = new URLSearchParams(location.search).get('bridge');
  return !(q === '0' || q === 'false');
}
