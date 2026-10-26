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
// B2 (#20) — giọng tiếng Việt: `pnpm bridge` bật cả ws lẫn HTTP /tts.
import { batTts } from './tts';
// B3 (#21) — MCP 1:1 với Actor API: `pnpm bridge` bật luôn bản HTTP streamable.
import { batMcpHttp, CONG_MCP_MAC_DINH, noiBridgeWs } from './mcp';
// C1 (#31) — nhận dạng giọng Việt: `pnpm bridge` bật luôn POST /stt.
import { batStt, CONG_STT_MAC_DINH } from './stt';

const CONG = Number(process.env.GEN_STAGE_PORT ?? 8787);
/** Cổng HTTP cho TTS (B2) — khác cổng ws để không đụng `WebSocketServer`. */
const CONG_TTS = Number(process.env.GEN_STAGE_TTS_PORT ?? 8788);
/** Cổng HTTP cho MCP (B3) — bind cùng chính sách với ws, mặc định 127.0.0.1. */
const CONG_MCP = Number(process.env.GEN_STAGE_MCP_PORT ?? CONG_MCP_MAC_DINH);
/** Cổng HTTP cho STT (C1) — cùng chính sách bind, mặc định 127.0.0.1. */
const CONG_STT = Number(process.env.GEN_STAGE_STT_PORT ?? CONG_STT_MAC_DINH);
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
/**
 * C0 (#28) — **client MCP (não) đang nối**.
 *
 * Hai nguồn, cố ý tách đôi:
 *  - `naoWs` — tiến trình MCP stdio (`pnpm mcp` cho agy, `scripts/nao-demo.mjs`)
 *    nối vào bridge bằng ws và tự xưng `?role=nao`. Đếm được chính xác.
 *  - `naoHttpDen` — bản MCP HTTP chạy **trong chính tiến trình này**. Nó luôn
 *    giữ sẵn một kết nối ws dù chưa có não nào gọi, nên đếm theo ws là nói dối;
 *    thay vào đó `bridge/mcp.ts` báo mỗi lần có yêu cầu MCP thật, và ta coi là
 *    "đang có não" trong `HAN_NAO_MS` kể từ lần cuối.
 */
const naoWs = new Set<WebSocket>();
let naoHttpDen = 0;
let henNao: NodeJS.Timeout | null = null;
let soNaoDaBao = -1;
/** Không nghe gì từ não HTTP quá lâu thì coi như nó đã tắt (vòng long-poll ~25 s). */
const HAN_NAO_MS = Number(process.env.GEN_STAGE_BRAIN_TTL ?? 60000);
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
  const vaiTho = q.get('role');
  const vai = vaiTho === 'stage' ? 'stage' : 'client';
  /** C0 (#28) — client tự xưng là não (tiến trình MCP stdio). */
  const laNao = vaiTho === 'nao';

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
      ghi('sân khấu mới kết nối — đóng bản cũ (tab cũ sẽ KHÔNG tự nối lại)');
      // Mã 4001 = "bị thay thế": tab cũ đọc mã này và ngừng nối lại, không thì
      // hai tab đá nhau mỗi 2 s, sự kiện rơi hết (Boss 26/10: "chưa có não").
      sanKhau.close(4001, 'thay-the');
    }
    sanKhau = ws;
    ghi('sân khấu đã nối. Client đang chờ:', clients.size);
    /**
     * E1 (#48) việc 8 — **`bridge.brain` là gói ĐẦU TIÊN** sân khấu nhận.
     *
     * Bản cũ báo não *sau* `bridge.stageOnline`; đo thật 26/10 thì gói
     * `bridge.brain {count:2}` tới muộn (≈2,2 s của lượt hỏi đầu) nên
     * `brainConnected` còn `false` lúc Sếp vừa gõ câu đầu → Gen nói "chưa có
     * não" vô cớ. Giờ gửi trước mọi thứ khác, và `buocPhai = true` để không
     * bị cái chốt "số không đổi thì khỏi gửi" chặn lại.
     *
     * Lớp thứ hai của lời hứa nằm ở `src/behavior/phan-xa.ts`
     * (`choXacNhanNaoMs`): kể cả gói này tới muộn, Gen vẫn chờ 3 s mới dám
     * kết luận là chưa có não.
     */
    baoNao(true);
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
  if (laNao) {
    naoWs.add(ws);
    baoNao();
  }
  ghi('client nối. Tổng:', clients.size, laNao ? '(não)' : '');
  // lời chào chỉ gửi cho kết nối đã qua cửa — chưa xưng tên thì chưa biết gì
  if (daXac.has(ws)) chaoClient(ws);

  ws.on('message', (tho) => tuClient(ws, String(tho)));
  ws.on('close', (ma, lyDo) => {
    clients.delete(ws);
    const laiLaNao = naoWs.delete(ws);
    if (laiLaNao) baoNao();
    ghi(
      'client ngắt. Tổng:', clients.size,
      laiLaNao ? '(não)' : '', `mã ${ma}${lyDo?.length ? ' · ' + lyDo.toString() : ''}`,
    );
  });
  ws.on('error', (e) => ghi('lỗi client:', e.message));
});

/** Số não đang nối = tiến trình MCP stdio + bản HTTP còn trong hạn. */
function soNao(): number {
  return naoWs.size + (naoHttpDen > Date.now() ? 1 : 0);
}

/**
 * Báo số não cho **cả sân khấu lẫn client** mỗi khi con số đổi.
 *
 * Sân khấu cần để `stage.describe().brainConnected` nói đúng sự thật; client
 * (và chính não) nhận kèm cho tiện gỡ lỗi. Tên bắt đầu bằng `bridge.` nên
 * `bridge-client.ts` không đẩy ngược lên — không có vòng lặp sự kiện.
 */
function baoNao(buocPhai = false): void {
  const n = soNao();
  if (!buocPhai && n === soNaoDaBao) return;
  soNaoDaBao = n;
  const goi = { event: 'bridge.brain', data: { count: n, connected: n > 0 } };
  phatChoClient(goi);
  if (sanKhau?.readyState === WebSocket.OPEN) sanKhau.send(JSON.stringify(goi));
  ghi('não đang nối:', n);
}

/** `bridge/mcp.ts` gọi mỗi khi có một yêu cầu MCP thật qua HTTP. */
export function naoHttpVuaGoi(): void {
  naoHttpDen = Date.now() + HAN_NAO_MS;
  baoNao();
  if (henNao) clearTimeout(henNao);
  henNao = setTimeout(() => {
    henNao = null;
    baoNao();
  }, HAN_NAO_MS + 100);
  henNao.unref?.();
}

function chaoClient(ws: WebSocket): void {
  ws.send(
    JSON.stringify({
      event: 'bridge.hello',
      data: {
        stageOnline: sanKhau?.readyState === WebSocket.OPEN,
        // E1 (#48) — tình trạng não nằm luôn trong gói chào, client (và chính
        // não) không phải chờ gói `bridge.brain` riêng.
        brain: soNao(),
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
  let goi: { id?: unknown; cmd?: unknown; args?: unknown; ping?: unknown };
  try {
    goi = JSON.parse(tho);
  } catch {
    ws.send(JSON.stringify({ ok: false, error: 'JSON không đọc được' }));
    return;
  }
  // Heartbeat tầng ứng dụng (Refs #37) — driver não gửi {"ping":…} mỗi 15 s để
  // tự phát hiện socket chết nửa chừng (không phải lệnh, không log "→ cmd").
  if (goi && (typeof goi.ping === 'number' || goi.ping === true)) {
    ws.send(JSON.stringify({ pong: goi.ping }));
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

// B2 — cùng một lệnh `pnpm bridge` bật luôn giọng nói, cùng chính sách bind.
const svTts = batTts(HOST, CONG_TTS);

/**
 * B3 — MCP HTTP streamable. Nó nói với sân khấu bằng **chính vai client ws ở
 * trên** (`noiBridgeWs`), không có đường tắt riêng vào trình duyệt: cùng hàng
 * đợi, cùng timeout, cùng cửa token. Cổng khác nên bind lại cùng chính sách.
 */
const noiMcp = noiBridgeWs({ url: `ws://${HOST}:${CONG}/`, token: TOKEN || undefined });
const svMcp = batMcpHttp({
  host: HOST,
  cong: CONG_MCP,
  noi: noiMcp,
  token: TOKEN || undefined,
  // C0 (#28) — mỗi yêu cầu MCP HTTP là một dấu hiệu "não còn sống"
  khiNaoGoi: naoHttpVuaGoi,
});

// C1 — mic trong trình duyệt gửi audio về đây. Cùng `pnpm bridge`, cổng riêng.
const svStt = batStt(HOST, CONG_STT);

for (const tin of ['SIGINT', 'SIGTERM'] as const) {
  process.on(tin, () => {
    ghi('đóng bridge…');
    svTts.close();
    svMcp.close();
    svStt.close();
    noiMcp.dong();
    wss.close(() => process.exit(0));
  });
}
