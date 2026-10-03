/**
 * server.ts — bridge WebSocket giữa agent (hoặc script) và sân khấu trong
 * trình duyệt. Chạy: `pnpm bridge`.
 *
 *     agent/wscat ──ws──► bridge ──ws──► trình duyệt (vai "stage")
 *                   ◄── kết quả + sự kiện ◄──
 *
 * Hai vai trên cùng một cổng, phân biệt bằng query `?role=`:
 *  - `?role=stage`  — trình duyệt. Chỉ nhận một bản mới nhất (mở tab mới thì
 *    tab mới thay tab cũ), vì chỉ có một sân khấu.
 *  - mặc định       — client ra lệnh. Gửi `{ "id": "a1", "cmd": "...", "args": {} }`,
 *    nhận lại `{ "id": "a1", "ok": true, "result": {...} }`; sự kiện sân khấu
 *    `{ "event": "...", "data": {...} }` được phát cho mọi client.
 *
 * Chưa có MCP (đó là việc của đợt B) — nhưng bộ lệnh đi qua đúng dispatcher
 * trong trình duyệt, nên thêm MCP về sau chỉ là bọc thêm một lớp.
 */
import { WebSocketServer, WebSocket } from 'ws';

const CONG = Number(process.env.GEN_STAGE_PORT ?? 8787);
/** Hạn chờ trình duyệt trả lời một lệnh. */
const HAN_MS = Number(process.env.GEN_STAGE_TIMEOUT ?? 30000);

/**
 * Mặc định chỉ nghe trên máy này.
 *
 * Bridge điều khiển được toàn bộ sân khấu (kể cả `stage.reset`), nên mở ra cả
 * mạng wifi là ai cũng giỡn được. Muốn cho máy khác vào thì phải nói rõ:
 * `--host 0.0.0.0` (hoặc `GEN_STAGE_HOST`) **và** đặt `GEN_STAGE_TOKEN`.
 */
const coCoMoRong = process.argv.includes('--host');
const hostCo = coCoMoRong ? process.argv[process.argv.indexOf('--host') + 1] : undefined;
const HOST = hostCo ?? process.env.GEN_STAGE_HOST ?? '127.0.0.1';
const TOKEN = process.env.GEN_STAGE_TOKEN ?? '';
const RIENG_MAY_NAY = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';

if (!RIENG_MAY_NAY && !TOKEN) {
  console.error(
    `[bridge] Từ chối nghe trên ${HOST} khi chưa có GEN_STAGE_TOKEN.\n` +
      '         Mở ra ngoài máy thì phải có mã: GEN_STAGE_TOKEN=... pnpm bridge --host 0.0.0.0',
  );
  process.exit(1);
}

interface Cho {
  client: WebSocket;
  /** Mã client đặt, trả lại y nguyên. */
  idGoc: string | undefined;
  hen: NodeJS.Timeout;
}

const wss = new WebSocketServer({ port: CONG, host: HOST });

let sanKhau: WebSocket | null = null;
const clients = new Set<WebSocket>();
/** Lệnh đang chờ trình duyệt trả lời, theo mã nội bộ của bridge. */
const dangCho = new Map<string, Cho>();
/** Kết nối đã qua cửa token (khi có bật token). */
const daXac = new Set<WebSocket>();
let dem = 0;

function ghi(...x: unknown[]): void {
  console.log(`[bridge ${gio()}]`, ...x);
}

function gio(): string {
  return new Date().toLocaleTimeString('vi-VN', { hour12: false });
}

wss.on('connection', (ws, req) => {
  const q = new URLSearchParams((req.url ?? '/').split('?')[1] ?? '');
  const vai = q.get('role') === 'stage' ? 'stage' : 'client';

  // Có token thì mọi kết nối phải xưng tên: hoặc `?token=` trên URL, hoặc khung
  // đầu tiên `{"token":"..."}`. Sai/thiếu là đóng ngay, không trả lời gì thêm.
  if (TOKEN) {
    if (q.get('token') === TOKEN) {
      daXac.add(ws);
    } else {
      const han = setTimeout(() => {
        if (!daXac.has(ws)) {
          ws.send(JSON.stringify({ ok: false, error: 'Thiếu token trong khung đầu' }));
          ws.close(1008, 'thieu-token');
        }
      }, 3000);
      ws.once('message', (tho) => {
        clearTimeout(han);
        let g: { token?: unknown } = {};
        try {
          g = JSON.parse(String(tho));
        } catch {
          /* hỏng JSON = sai token */
        }
        if (g.token === TOKEN) {
          daXac.add(ws);
          if (vai === 'client') chaoClient(ws);
          else ws.send(JSON.stringify({ event: 'bridge.authOk', data: {} }));
        } else {
          ghi('từ chối một kết nối sai token');
          ws.send(JSON.stringify({ ok: false, error: 'Token sai' }));
          ws.close(1008, 'sai-token');
        }
      });
    }
  } else {
    daXac.add(ws);
  }
  ws.on('close', () => daXac.delete(ws));

  if (vai === 'stage') {
    if (sanKhau && sanKhau.readyState === WebSocket.OPEN) {
      ghi('sân khấu mới kết nối — đóng bản cũ');
      sanKhau.close(1000, 'thay bằng kết nối mới');
    }
    sanKhau = ws;
    ghi('sân khấu đã nối. Client đang chờ:', clients.size);
    phatChoClient({ event: 'bridge.stageOnline', data: {} });

    ws.on('message', (tho) => tuSanKhau(String(tho)));
    ws.on('close', () => {
      if (sanKhau === ws) sanKhau = null;
      ghi('sân khấu ngắt kết nối');
      phatChoClient({ event: 'bridge.stageOffline', data: {} });
    });
    ws.on('error', (e) => ghi('lỗi sân khấu:', e.message));
    return;
  }

  clients.add(ws);
  ghi('client nối. Tổng:', clients.size);
  // lời chào chỉ gửi cho kết nối đã qua cửa — chưa xưng tên thì chưa biết gì
  if (daXac.has(ws)) chaoClient(ws);

  ws.on('message', (tho) => tuClient(ws, String(tho)));
  ws.on('close', () => {
    clients.delete(ws);
    ghi('client ngắt. Tổng:', clients.size);
  });
  ws.on('error', (e) => ghi('lỗi client:', e.message));
});

function chaoClient(ws: WebSocket): void {
  ws.send(
    JSON.stringify({
      event: 'bridge.hello',
      data: {
        stageOnline: sanKhau?.readyState === WebSocket.OPEN,
        huongDan:
          'Gửi {"id":"1","cmd":"stage.bootstrap"} để lấy danh sách lệnh. ' +
          'Mở trình duyệt với ?bridge=1 nếu stageOnline=false.',
      },
    }),
  );
}

/* ------------------------------------------------------- client → sân khấu */

function tuClient(ws: WebSocket, tho: string): void {
  if (!daXac.has(ws)) return; // khung đầu là token, không phải lệnh
  let goi: { id?: unknown; cmd?: unknown; args?: unknown };
  try {
    goi = JSON.parse(tho);
  } catch {
    ws.send(JSON.stringify({ ok: false, error: 'JSON không đọc được' }));
    return;
  }
  if (!goi || typeof goi.cmd !== 'string') {
    ws.send(
      JSON.stringify({
        id: typeof goi?.id === 'string' ? goi.id : undefined,
        ok: false,
        error: 'Thiếu "cmd" (chuỗi)',
      }),
    );
    return;
  }
  if (!sanKhau || sanKhau.readyState !== WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        id: goi.id,
        ok: false,
        error:
          'Sân khấu chưa nối. Mở http://localhost:5173/?bridge=1 trong trình duyệt rồi gửi lại.',
      }),
    );
    return;
  }

  const idGoc = typeof goi.id === 'string' ? goi.id : undefined;
  const idBridge = `br-${++dem}`;
  const hen = setTimeout(() => {
    dangCho.delete(idBridge);
    ws.send(
      JSON.stringify({ id: idGoc, ok: false, error: `Sân khấu không trả lời trong ${HAN_MS} ms` }),
    );
  }, HAN_MS);

  dangCho.set(idBridge, { client: ws, idGoc, hen });
  sanKhau.send(JSON.stringify({ id: idBridge, cmd: goi.cmd, args: goi.args ?? {} }));
  ghi('→', goi.cmd, JSON.stringify(goi.args ?? {}));
}

/* ------------------------------------------------------- sân khấu → client */

function tuSanKhau(tho: string): void {
  if (sanKhau && !daXac.has(sanKhau)) return;
  let goi: { id?: unknown; ok?: unknown; event?: unknown };
  try {
    goi = JSON.parse(tho);
  } catch {
    ghi('sân khấu gửi JSON lỗi');
    return;
  }

  // sự kiện: phát cho mọi client
  if (typeof goi.event === 'string') {
    phatChoClient(goi as Record<string, unknown>);
    return;
  }

  // kết quả lệnh: gửi về đúng client đã hỏi
  if (typeof goi.id === 'string') {
    const cho = dangCho.get(goi.id);
    if (!cho) return;
    dangCho.delete(goi.id);
    clearTimeout(cho.hen);
    const ra = { ...goi, id: cho.idGoc };
    if (cho.idGoc === undefined) delete (ra as { id?: unknown }).id;
    if (cho.client.readyState === WebSocket.OPEN) cho.client.send(JSON.stringify(ra));
    ghi('←', goi.ok === true ? 'ok' : 'lỗi');
    return;
  }
  ghi('bỏ qua gói lạ từ sân khấu');
}

function phatChoClient(x: Record<string, unknown>): void {
  const chu = JSON.stringify(x);
  for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(chu);
}

/* ------------------------------------------------------------------ chạy */

ghi(`đang nghe ws://${HOST}:${CONG}  (kiểm bằng: ss -ltn | grep ${CONG})`);
ghi(`sân khấu nối vào  ws://${HOST}:${CONG}/?role=stage  (mở app với ?bridge=1)`);
ghi(`client ra lệnh    ws://${HOST}:${CONG}/`);
ghi(
  TOKEN
    ? 'token: BẬT — gửi {"token":"..."} ở khung đầu, hoặc thêm ?token=... vào URL'
    : RIENG_MAY_NAY
      ? 'token: tắt (chỉ nghe trên máy này nên không cần)'
      : 'token: tắt',
);

for (const tin of ['SIGINT', 'SIGTERM'] as const) {
  process.on(tin, () => {
    ghi('đóng bridge…');
    wss.close(() => process.exit(0));
  });
}
