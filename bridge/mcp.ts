/**
 * mcp.ts — BRIDGE PHƠI MCP 1:1 VỚI ACTOR API (B3, Issue #21).
 *
 *   não (agy CLI / Claude / nao-demo.mjs)
 *        │  MCP  (stdio  →  `pnpm mcp`     |  HTTP streamable → 127.0.0.1:8789/mcp)
 *        ▼
 *   bridge/mcp.ts ──ws client──► bridge/server.ts ──ws(stage)──► trình duyệt
 *        ◄── Result + sự kiện ───────────┘
 *
 * Ba quyết định của file này:
 *
 * 1. **Tool sinh tự động từ registry, không viết tay một dòng nào.** Mỗi lệnh
 *    `a.b` trong `src/api/commands/` thành tool `a_b`; `inputSchema` dịch từ
 *    `params` (kiểu, enum, min/max, bắt buộc), `description` lấy `desc` + ví dụ
 *    chạy được + danh sách sự kiện lệnh bắn ra. Thêm lệnh mới ở đợt sau là MCP
 *    tự có tool mới — đúng nguyên tắc "thêm một lệnh mới" trong CLAUDE.md.
 *    Chỉ **một** tool khai tay: `stage_events` (không phải lệnh sân khấu, mà là
 *    cửa để não *nghe* — long-poll sự kiện mới, kể cả `user.text`).
 *
 * 2. **Không nói thẳng vào sân khấu, luôn đi qua ws có sẵn.** Cả bản stdio lẫn
 *    bản HTTP đều là **client ws** của `bridge/server.ts`, nên dùng lại nguyên
 *    hàng đợi, token, timeout và phát sự kiện của bridge — không có đường tắt
 *    thứ hai vào dispatcher để lệch hành vi.
 *
 * 3. **Bảo mật y như ws**: HTTP chỉ nghe `127.0.0.1`. Muốn mở ra ngoài thì phải
 *    `GEN_STAGE_TOKEN` + `--host`, và mọi yêu cầu phải mang
 *    `Authorization: Bearer <token>` (hoặc `?token=`).
 *
 * Chạy riêng (stdio, cho agy CLI):  `pnpm mcp`
 * Chạy kèm bridge (HTTP):           `pnpm bridge` → http://127.0.0.1:8789/mcp
 */
import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocket } from 'ws';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { taoRegistry } from '../src/api/commands/index';
import { danhSachThamSo } from '../src/api/registry';
import type { CommandSpec, ParamSpec } from '../src/api/types';

export const PHIEN_BAN_MCP = '0.1';
/** Cổng MCP HTTP streamable — khác ws (8787) và TTS (8788). */
export const CONG_MCP_MAC_DINH = 8789;
/** Số sự kiện giữ lại cho `stage_events` (não hỏi lại muộn vẫn còn). */
const GIU_SU_KIEN = 500;
/** Trần thời gian long-poll của `stage_events` (ms). */
const CHO_TOI_DA = 60_000;

/* ==================================================================== tools */

/** Một tool MCP đã sinh xong (JSON Schema thuần, không phụ thuộc zod). */
export interface ToolMcp {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** `actor.moveTo` → `actor_moveTo` (MCP không cho dấu chấm trong tên tool). */
export function tenTool(cmd: string): string {
  return cmd.replace(/\./g, '_');
}

/**
 * Một tham số của lệnh → JSON Schema.
 *
 * `vec3`/`target` khai là **chuỗi** chứ không phải mảng số: `validate.ts` đọc
 * được cả `"ban-dieu-khien"`, `"1.4, 0, 1.4"`, `[x,y,z]` và `{x,y,z}`, nhưng
 * khai một kiểu duy nhất thì não (và client MCP khó tính) không phải đoán —
 * mô tả nói rõ cả hai dạng chấp nhận được.
 */
export function schemaThamSo(p: ParamSpec): Record<string, unknown> {
  const them = p.goiY ? ` Giá trị hợp lệ lấy từ stage_describe (${p.goiY}).` : '';
  const mac = p.default === undefined ? '' : ` Mặc định: ${JSON.stringify(p.default)}.`;
  const mo = { description: `${p.desc}.${them}${mac}`.replace(/\.\./g, '.') };

  switch (p.type) {
    case 'string':
    case 'text':
      return { ...mo, type: 'string' };
    case 'number':
      return {
        ...mo,
        type: 'number',
        ...(p.min === undefined ? {} : { minimum: p.min }),
        ...(p.max === undefined ? {} : { maximum: p.max }),
      };
    case 'boolean':
      return { ...mo, type: 'boolean' };
    case 'enum':
      return p.values && p.values.length && !p.tuDo
        ? { ...mo, type: 'string', enum: [...p.values] }
        : {
            ...mo,
            type: 'string',
            ...(p.values && p.values.length ? { examples: [...p.values] } : {}),
          };
    case 'vec3':
      return { ...mo, type: 'string', description: `${mo.description} Dạng "x, y, z" (mét).` };
    case 'target':
      return {
        ...mo,
        type: 'string',
        description: `${mo.description} Tên place/actor/prop/screen, "camera", "cursor", hoặc toạ độ "x, y, z".`,
      };
    case 'json':
      return { ...mo, type: 'string', description: `${mo.description} JSON dạng chuỗi.` };
  }
}

/** Một `CommandSpec` → một tool MCP. */
export function toolTuLenh(spec: CommandSpec): ToolMcp {
  const params = danhSachThamSo(spec);
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of params) {
    properties[p.name] = schemaThamSo(p);
    if (p.required) required.push(p.name);
  }
  const viDu = JSON.stringify(spec.example.args ?? {});
  const suKien = spec.events?.length ? ` Sự kiện bắn ra: ${spec.events.join(', ')}.` : '';
  return {
    name: tenTool(spec.cmd),
    description: `[${spec.group}] ${spec.desc}.${suKien} Ví dụ args: ${viDu}`.replace(
      /\.\./g,
      '.',
    ),
    inputSchema: {
      type: 'object',
      properties,
      ...(required.length ? { required } : {}),
      additionalProperties: false,
    },
  };
}

/** Tool khai tay DUY NHẤT: cửa để não *nghe* sân khấu. */
export const TOOL_SU_KIEN: ToolMcp = {
  name: 'stage_events',
  description:
    '[stage] Đọc sự kiện mới của sân khấu (long-poll). Truyền "since" = seq lần trước để chỉ ' +
    'lấy cái mới; "waitMs" > 0 thì chờ tới khi có sự kiện mới hoặc hết hạn. ' +
    'Sự kiện quan trọng nhất: user.text (Owner gõ/nói qua Space), user.speech, user.click. ' +
    'Ví dụ args: {"since":0,"waitMs":25000}',
  inputSchema: {
    type: 'object',
    properties: {
      since: {
        type: 'number',
        description: 'Chỉ lấy sự kiện có seq lớn hơn số này. Lần đầu bỏ trống (hoặc 0).',
        minimum: 0,
      },
      waitMs: {
        type: 'number',
        description: `Chờ tối đa bao lâu khi chưa có sự kiện mới (ms, 0 = trả ngay, trần ${CHO_TOI_DA}).`,
        minimum: 0,
        maximum: CHO_TOI_DA,
      },
    },
    additionalProperties: false,
  },
};

/** Lời dặn trả kèm `stage_bootstrap` — một đoạn, để não biết mình là ai. */
export const HUONG_DAN_AGENT =
  'Hướng dẫn cho agent: bạn là Gen, nhân vật nữ trong phòng lab này. Bạn CHỈ điều khiển actor ' +
  '"gen"; actor "owner" là Javis — avatar của Sếp trong phòng, Sếp tự lái, không bao giờ ra lệnh ' +
  'cho owner. QUAN TRỌNG: **Sếp thật đang xem qua màn hình, tức là ở chỗ MÁY QUAY** — nói với Sếp ' +
  'thì actor_say để mặc định (to: "camera"), đừng quay Gen về phía Javis; chỉ dùng to: "owner" khi ' +
  'Gen nói riêng với Javis trong phòng. stage_describe cho biết camera.pos và facingTarget của từng ' +
  'nhân vật. Đọc stage_describe ' +
  'trước mỗi lượt để biết ai đang ở đâu, bận gì, cầm gì. Trả lời Sếp bằng tool actor_say với ' +
  'actor "gen", tiếng Việt, câu ngắn (tối đa 2 câu), gọi Sếp là "Sếp" và tự gọi là "em". Diễn xuất ' +
  'bằng actor_emote (chao, dong-y, suy-nghi, ra-lenh, thanh-cong, vui…), chạy việc trên màn hình ' +
  'hologram bằng screen_stream / screen_focus, và kết tinh kết quả thành vật thể bằng module_build ' +
  'rồi module_store khi Sếp nhờ làm một việc. Nghe Sếp bằng stage_events (waitMs 25000) và phản ứng ' +
  'với sự kiện user.text.';

/** Toàn bộ tool: mỗi lệnh một tool + `stage_events`. */
export function sinhTools(): ToolMcp[] {
  return [...taoRegistry().all().map(toolTuLenh), TOOL_SU_KIEN];
}

/** Tool nào ứng với lệnh nào (`actor_say` → `actor.say`). */
export function banDoTool(): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of taoRegistry().all()) m.set(tenTool(s.cmd), s.cmd);
  return m;
}

/* ============================================================ bộ sự kiện */

export interface SuKienCoSo {
  seq: number;
  t: number;
  event: string;
  data: Record<string, unknown>;
}

export interface TraSuKien {
  events: SuKienCoSo[];
  /** Seq mới nhất — truyền lại làm `since` cho lượt sau. */
  latest: number;
}

/**
 * Bộ đệm sự kiện + long-poll cho `stage_events`.
 *
 * Tách riêng khỏi ws để `pnpm test` kiểm được `since`/`waitMs` mà không cần
 * bridge, trình duyệt hay mạng.
 */
export class BoSuKien {
  private bo: SuKienCoSo[] = [];
  private dem = 0;
  private cho = new Set<() => void>();

  them(e: { event: string; data?: Record<string, unknown>; t?: number }): SuKienCoSo {
    const sk: SuKienCoSo = {
      seq: ++this.dem,
      t: e.t ?? Date.now(),
      event: e.event,
      data: e.data ?? {},
    };
    this.bo.push(sk);
    if (this.bo.length > GIU_SU_KIEN) this.bo.shift();
    for (const danh of Array.from(this.cho)) danh();
    return sk;
  }

  seq(): number {
    return this.dem;
  }

  /** Sự kiện có `seq > since`, không chờ. */
  tuSince(since: number): SuKienCoSo[] {
    return this.bo.filter((e) => e.seq > since);
  }

  /** Long-poll: có ngay thì trả ngay, không thì chờ tới `waitMs`. */
  async doc(since = 0, waitMs = 0): Promise<TraSuKien> {
    const han = Math.max(0, Math.min(CHO_TOI_DA, waitMs));
    let ds = this.tuSince(since);
    if (ds.length === 0 && han > 0) {
      await new Promise<void>((xong) => {
        let het: NodeJS.Timeout;
        const danh = () => {
          clearTimeout(het);
          this.cho.delete(danh);
          xong();
        };
        het = setTimeout(danh, han);
        // không giữ tiến trình sống chỉ vì một lượt long-poll
        het.unref?.();
        this.cho.add(danh);
      });
      ds = this.tuSince(since);
    }
    return { events: ds, latest: ds.length ? ds[ds.length - 1]!.seq : Math.max(since, this.dem) };
  }
}

/* ======================================================= kết nối tới bridge */

export interface KetQuaLenh {
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** Thứ MCP server cần: gọi được lệnh, đọc được sự kiện. */
export interface NoiSanKhau {
  goi(cmd: string, args: Record<string, unknown>): Promise<KetQuaLenh>;
  suKien(): BoSuKien;
  dong(): void;
}

export interface ThamSoNoi {
  url?: string;
  token?: string;
  /** Hạn chờ một lệnh (ms). */
  hanMs?: number;
  /**
   * C0 (#28) — xưng vai với bridge.
   *
   * `'nao'` = tiến trình MCP **riêng** (stdio: `pnpm mcp`, `nao-demo.mjs`):
   * bridge đếm nó vào `brainConnected`, vì tiến trình này chỉ tồn tại khi có
   * não thật. Bản HTTP chạy trong chính bridge thì KHÔNG xưng (`undefined`):
   * nó luôn sẵn sàng kể cả khi chưa não nào gọi, đếm vào là nói dối.
   */
  vai?: 'nao';
}

/**
 * Nối tới `bridge/server.ts` bằng **vai client ws** (không phải `role=stage`).
 *
 * Tự nối lại khi bridge khởi động muộn hoặc restart; `goi()` chờ tối đa 3 s cho
 * kết nối rồi mới chịu báo lỗi, nên mở MCP trước bridge vẫn chạy.
 */
export function noiBridgeWs(ts: ThamSoNoi = {}): NoiSanKhau {
  const cong = process.env.GEN_STAGE_PORT ?? '8787';
  const token = ts.token ?? process.env.GEN_STAGE_TOKEN ?? '';
  const goc = ts.url ?? `ws://127.0.0.1:${cong}/`;
  const url = ts.vai ? `${goc}${goc.includes('?') ? '&' : '?'}role=${ts.vai}` : goc;
  const hanMs = ts.hanMs ?? Number(process.env.GEN_STAGE_TIMEOUT ?? 35000);

  const bo = new BoSuKien();
  const dangCho = new Map<string, (kq: KetQuaLenh) => void>();
  let ws: WebSocket | null = null;
  let dem = 0;
  let dungHan = false;
  let henNoiLai: NodeJS.Timeout | null = null;

  function noi(): void {
    if (ws || dungHan) return;
    const w = new WebSocket(
      token ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url,
    );
    ws = w;
    w.on('open', () => {
      if (token) w.send(JSON.stringify({ token }));
      bo.them({ event: 'mcp.bridgeConnected', data: { url } });
    });
    w.on('message', (tho) => {
      let g: Record<string, unknown>;
      try {
        g = JSON.parse(String(tho)) as Record<string, unknown>;
      } catch {
        return;
      }
      if (typeof g.event === 'string') {
        bo.them({
          event: g.event,
          data: (g.data as Record<string, unknown>) ?? {},
          t: typeof g.t === 'number' ? g.t : undefined,
        });
        return;
      }
      if (typeof g.id === 'string') {
        const xong = dangCho.get(g.id);
        if (!xong) return;
        dangCho.delete(g.id);
        xong({ ok: g.ok === true, result: g.result, error: g.error as string | undefined });
      }
    });
    const rot = () => {
      if (ws === w) ws = null;
      if (dungHan || henNoiLai) return;
      henNoiLai = setTimeout(() => {
        henNoiLai = null;
        noi();
      }, 1500);
      henNoiLai.unref?.();
    };
    w.on('close', rot);
    w.on('error', rot);
  }
  noi();

  /** Chờ ws mở, tối đa `msCho`. */
  async function choMo(msCho = 3000): Promise<boolean> {
    const het = Date.now() + msCho;
    while (Date.now() < het) {
      if (ws?.readyState === WebSocket.OPEN) return true;
      noi();
      await new Promise((r) => setTimeout(r, 120));
    }
    return ws?.readyState === WebSocket.OPEN;
  }

  return {
    suKien: () => bo,
    dong() {
      dungHan = true;
      if (henNoiLai) clearTimeout(henNoiLai);
      ws?.close();
      ws = null;
    },
    async goi(cmd, args) {
      if (!(await choMo())) {
        return {
          ok: false,
          error:
            `Chưa nối được bridge ở ${url}. Bật bridge trước: \`pnpm bridge\` ` +
            '(và mở app bằng http://localhost:5173/?bridge=1).',
        };
      }
      const id = `mcp-${++dem}`;
      return await new Promise<KetQuaLenh>((xong) => {
        const het = setTimeout(() => {
          dangCho.delete(id);
          xong({ ok: false, error: `Bridge không trả lời trong ${hanMs} ms` });
        }, hanMs);
        dangCho.set(id, (kq) => {
          clearTimeout(het);
          xong(kq);
        });
        ws!.send(JSON.stringify({ id, cmd, args }));
      });
    },
  };
}

/* ================================================================ MCP server */

function chuoi(x: unknown): string {
  return JSON.stringify(x, null, 2);
}

/**
 * Dựng một MCP `Server` đã gắn đủ tool.
 *
 * Gọi được nhiều lần trên cùng một `NoiSanKhau` (bản HTTP không giữ phiên:
 * mỗi yêu cầu một server mới, cùng một kết nối bridge).
 */
export function taoMcpServer(noi: NoiSanKhau): Server {
  const sv = new Server(
    { name: 'gen-stage', version: PHIEN_BAN_MCP },
    {
      capabilities: { tools: {} },
      instructions: HUONG_DAN_AGENT,
    },
  );
  const tools = sinhTools();
  const banDo = banDoTool();

  sv.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  sv.setRequestHandler(CallToolRequestSchema, async (yc) => {
    const ten = yc.params.name;
    const args = (yc.params.arguments ?? {}) as Record<string, unknown>;

    if (ten === TOOL_SU_KIEN.name) {
      const tra = await noi.suKien().doc(
        Number(args.since ?? 0) || 0,
        Number(args.waitMs ?? 0) || 0,
      );
      return { content: [{ type: 'text' as const, text: chuoi(tra) }] };
    }

    const cmd = banDo.get(ten);
    if (!cmd) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Không có tool "${ten}". Gọi tools/list để xem danh sách.` }],
      };
    }

    // Não KHÔNG được điều khiển nhân vật của Sếp: `actor.say owner` còn bắn
    // `user.text` → não tự nói hộ rồi tự nghe, lặp vô hạn (review PR #26).
    if (cmd.startsWith('actor.') && cmd !== 'actor.list' && String(args.actor ?? '') === 'owner') {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: 'Não không được điều khiển actor "owner" (nhân vật của Sếp). Chỉ điều khiển "gen".' }],
      };
    }

    const kq = await noi.goi(cmd, args);
    if (!kq.ok) {
      return { isError: true, content: [{ type: 'text' as const, text: kq.error ?? 'lỗi không rõ' }] };
    }
    // `stage_bootstrap` trả thêm lời dặn vai diễn — não đọc một lần là biết việc
    const ra =
      cmd === 'stage.bootstrap' && kq.result && typeof kq.result === 'object'
        ? { huongDanAgent: HUONG_DAN_AGENT, ...(kq.result as Record<string, unknown>) }
        : kq.result;
    return { content: [{ type: 'text' as const, text: chuoi(ra) }] };
  });

  return sv;
}

/* ------------------------------------------------------------- MCP qua HTTP */

export interface ThamSoHttp {
  host: string;
  cong: number;
  noi: NoiSanKhau;
  token?: string;
  /**
   * C0 (#28) — gọi mỗi khi có một yêu cầu MCP thật (não đang sống).
   * `bridge/server.ts` dùng để cập nhật `brainConnected`.
   */
  khiNaoGoi?: () => void;
}

/**
 * MCP streamable HTTP, **không giữ phiên** (`sessionIdGenerator: undefined`):
 * mỗi POST `/mcp` là một server + transport dùng xong bỏ, nên không có phiên
 * treo khi não (agy) tắt giữa đường.
 */
export function batMcpHttp(ts: ThamSoHttp): HttpServer {
  const { host, cong, noi } = ts;
  const khiNaoGoi = ts.khiNaoGoi;
  const token = ts.token ?? '';
  const riengMay = host === '127.0.0.1' || host === 'localhost' || host === '::1';

  const sv = createServer((req, res) => {
    void xuLy(req, res).catch((e: Error) => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    });
  });

  async function xuLy(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const u = new URL(req.url ?? '/', `http://${host}:${cong}`);

    if (u.pathname === '/khoe') {
      res
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ ok: true, mcp: PHIEN_BAN_MCP, tools: sinhTools().length }));
      return;
    }

    // Cửa token: y hệt ws — mở ra ngoài máy thì bắt buộc có mã.
    if (token) {
      const mang =
        (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || u.searchParams.get('token');
      if (mang !== token) {
        res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"ok":false,"error":"Token sai"}');
        return;
      }
    }

    if (u.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Chỉ có /mcp và /khoe');
      return;
    }
    if (req.method !== 'POST') {
      res
        .writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST' })
        .end('{"ok":false,"error":"Bản HTTP không giữ phiên — chỉ nhận POST /mcp"}');
      return;
    }

    const than = await docThan(req);
    khiNaoGoi?.(); // C0 — có yêu cầu MCP thật = đang có não nối
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const mcp = taoMcpServer(noi);
    res.on('close', () => {
      void transport.close();
      void mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, than);
  }

  sv.listen(cong, host, () => {
    console.log(`[mcp ] đang nghe http://${host}:${cong}/mcp  (POST, streamable)`);
    console.log(
      `[mcp ] ${sinhTools().length} tool sinh từ registry · ${
        token ? 'token: BẬT (Authorization: Bearer …)' : riengMay ? 'token: tắt (chỉ máy này)' : 'token: tắt'
      }`,
    );
  });
  return sv;
}

async function docThan(req: IncomingMessage): Promise<unknown> {
  const manh: Buffer[] = [];
  for await (const m of req) manh.push(m as Buffer);
  const chu = Buffer.concat(manh).toString('utf8');
  if (!chu) return undefined;
  try {
    return JSON.parse(chu);
  } catch {
    return undefined;
  }
}

/* --------------------------------------------------------------- chạy stdio */

/** `pnpm mcp` — MCP qua stdio cho agy CLI (`agy mcp add gen-stage …`). */
export async function chayStdio(): Promise<void> {
  // xưng `role=nao` để bridge tính vào `stage.describe().brainConnected`
  const noi = noiBridgeWs({ vai: 'nao' });
  const sv = taoMcpServer(noi);
  // stdout là đường MCP: mọi lời giải thích phải ra stderr, không thì vỡ giao thức
  console.error(`[mcp stdio] gen-stage v${PHIEN_BAN_MCP} · ${sinhTools().length} tool`);
  await sv.connect(new StdioServerTransport());
  for (const tin of ['SIGINT', 'SIGTERM'] as const) {
    process.on(tin, () => {
      noi.dong();
      void sv.close().then(() => process.exit(0));
    });
  }
}

/** Chạy trực tiếp (`tsx bridge/mcp.ts`) thì bật stdio; import thì không. */
const laChinh = process.argv[1]
  ? import.meta.url === new URL(`file://${process.argv[1]}`).href ||
    /bridge[/\\]mcp\.ts$/.test(process.argv[1])
  : false;
if (laChinh) void chayStdio();
