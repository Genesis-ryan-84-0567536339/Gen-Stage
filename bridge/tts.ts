/**
 * tts.ts — giọng tiếng Việt thật cho sân khấu (B2, Issue #20).
 *
 *     trình duyệt ──GET /tts?text=…&voice=nu──► bridge ──wss──► Edge TTS
 *                 ◄──────── audio/mpeg ────────┘        (cache đĩa)
 *
 * **Không dùng thư viện edge-tts nào** — `@andresaya/edge-tts` (GPL-3.0-only)
 * và `edge-tts-universal` (AGPL-3.0) đều là **copyleft**, nối vào bridge là
 * kéo cả Gen-Stage theo giấy phép đó. Giao thức Edge chỉ gồm: một URL có
 * `Sec-MS-GEC` (SHA-256 của mốc thời gian Windows + token công khai), một
 * khung `speech.config`, một khung SSML, rồi nhận các khung nhị phân
 * `Path:audio` cho tới `turn.end`. Tự viết ~120 dòng bằng `ws` + `node:crypto`
 * có sẵn, nên không thêm phụ thuộc nào và không vướng giấy phép.
 *
 * Dịch vụ này là **điểm cuối công khai của Microsoft Edge**, không cần khoá
 * API — không có bí mật nào để lọt vào log hay repo.
 *
 * Bind giống bridge ws: mặc định chỉ `127.0.0.1`.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WebSocket } from 'ws';

/* --------------------------------------------------------------- hằng số */

const TOKEN_EDGE = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WSS = 'wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1';
const PHIEN_BAN_GEC = '1-155.0.4283.45';
const DANG_RA = 'audio-24khz-48kbitrate-mono-mp3';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0';

/**
 * Giọng tiếng Việt. `nu` cho mọi nhân vật, `nam` cho `owner` (xem
 * `giongTheoActor` trong `src/audio/tts-client.ts`).
 */
export const GIONG = {
  nu: 'vi-VN-HoaiMyNeural',
  nam: 'vi-VN-NamMinhNeural',
} as const;

/** Thư mục cache (trong `.gitignore`). */
const THU_MUC_CACHE = process.env.GEN_STAGE_TTS_CACHE ?? '.cache/tts';

/* ------------------------------------------------- E1 (#48) — thử lại + hâm */

/**
 * **Thử lại khi Edge hắt hơi** (E1, Issue #48 việc 5).
 *
 * Kiểm độc lập 26/10: gọi `/tts` 10 lần liên tiếp thì **2 lần trả 502**, và
 * đúng lượt trả lời đầu tiên của não dính 502 → Gen câm, Boss nghe thấy im
 * lặng. Nguyên nhân không phải lỗi của ta: điểm cuối công khai của Edge thỉnh
 * thoảng đóng ws giữa khung hoặc trả 0 byte. Đó là lỗi **tạm thời**, nên lời
 * hứa mới là: endpoint không bao giờ trả 502 cho lỗi tạm nếu thử lại được.
 *
 * Backoff 300 / 800 ms (tổng xấu nhất ≈ 1,1 s cộng thêm) — đủ để Edge đổi
 * node, mà vẫn dưới ngưỡng Boss cảm nhận được so với 3–6 s não nghĩ.
 */
export const CHO_THU_LAI_MS = [300, 800] as const;

/**
 * Tám câu **đệm/đáp cố định** sân khấu nói nhiều nhất: 4 câu đệm của phản xạ
 * (`CAU_DEM` trong `src/behavior/phan-xa.ts`), 3 câu của não rule-based
 * (`naoToiThieu`), và câu Gen hay đáp khi nhận việc.
 *
 * Hâm sẵn lúc bridge bật ⇒ mấy câu này **không bao giờ** phải chờ Edge, nên
 * cú 502 tệ nhất (đúng lượt phản xạ) không còn đường xảy ra.
 */
export const CAU_DEM_SAN = [
  'Dạ, Sếp?',
  'Em nghe ạ',
  'Sếp cần gì ạ?',
  'Dạ em đây',
  'Dạ, em chào Sếp!',
  'Em là Gen, trợ lý của Sếp ạ.',
  'Em chưa có não, Sếp bật agy nhé.',
  'Dạ em làm ngay ạ.',
  // I1 (#74) — câu nối lúc chờ não. Hâm sẵn vì chúng nổ đúng lúc Boss đang
  // sốt ruột nhất; để chờ Edge ở đó là mất trắng cả ý nghĩa của câu nối.
  'Em đang nghĩ ạ…',
  'Hơi lâu, Sếp chờ em chút.',
] as const;

export interface ThamSoNoi {
  /** Tên giọng đầy đủ, hoặc `nu` / `nam`. */
  voice?: string;
  /** Tốc độ: `-100`…`100` (%) hoặc chuỗi `"+10%"`. */
  rate?: number | string;
  /** Cao độ: `-100`…`100` (Hz) hoặc chuỗi `"-5Hz"`. */
  pitch?: number | string;
}

/** `nu` / `nam` / tên giọng đầy đủ → tên giọng Edge. */
export function tenGiong(v: string | undefined): string {
  if (!v) return GIONG.nu;
  const g = v.trim();
  if (g === 'nu' || g === 'nữ' || g === 'female') return GIONG.nu;
  if (g === 'nam' || g === 'male') return GIONG.nam;
  return g;
}

function phanTram(x: number | string | undefined): string {
  if (x === undefined) return '+0%';
  if (typeof x === 'string') {
    if (/^[+-]?\d+(\.\d+)?%$/.test(x.trim())) return x.trim();
    x = Number.parseFloat(x);
  }
  const n = Number.isFinite(x) ? Math.max(-100, Math.min(100, x as number)) : 0;
  return `${n >= 0 ? '+' : ''}${n}%`;
}

function hecZ(x: number | string | undefined): string {
  if (x === undefined) return '+0Hz';
  if (typeof x === 'string') {
    if (/^[+-]?\d+(\.\d+)?Hz$/.test(x.trim())) return x.trim();
    x = Number.parseFloat(x);
  }
  const n = Number.isFinite(x) ? Math.max(-100, Math.min(100, x as number)) : 0;
  return `${n >= 0 ? '+' : ''}${n}Hz`;
}

/* ------------------------------------------------------------ cache đĩa */

/**
 * Khoá cache: sha1 của **mọi thứ ảnh hưởng tới tiếng** (giọng, tốc độ, cao độ,
 * nguyên văn). Đổi một dấu trong câu là file khác — không bao giờ phát sai câu.
 * Cùng tên với hàm bên trình duyệt (`bam` trong `src/audio/tts-client.ts`) để
 * test so được hai bên.
 */
export function bamCache(text: string, ts: ThamSoNoi = {}): string {
  const khoa = [tenGiong(ts.voice), phanTram(ts.rate), hecZ(ts.pitch), text].join('');
  return createHash('sha1').update(khoa, 'utf8').digest('hex');
}

function duongCache(bam: string): string {
  return join(THU_MUC_CACHE, `${bam}.mp3`);
}

/* ------------------------------------------------------- giao thức Edge */

/**
 * `Sec-MS-GEC` — SHA-256 chữ hoa của `<mốc Windows làm tròn 5 phút><token>`.
 * Mốc Windows = (giây Unix + 11644473600) × 10⁷, làm tròn xuống 300 s.
 */
function chuKy(khi = Date.now()): string {
  const giay = Math.floor(khi / 1000) + 11644473600;
  const ticks = (giay - (giay % 300)) * 10_000_000;
  return createHash('sha256').update(`${ticks}${TOKEN_EDGE}`, 'utf8').digest('hex').toUpperCase();
}

function thoatXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function ssml(text: string, voice: string, rate: string, pitch: string): string {
  // `xml:lang` để `vi-VN` cho dịch vụ đọc đúng dấu tiếng Việt.
  return (
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="vi-VN">' +
    `<voice name="${voice}">` +
    `<prosody pitch="${pitch}" rate="${rate}" volume="+0%">${thoatXml(text)}</prosody>` +
    '</voice></speak>'
  );
}

function mocGio(): string {
  return new Date().toString();
}

/** Tách khung nhị phân: 2 byte độ dài header + header text + thân. */
function tachNhiPhan(d: Buffer): { path: string; than: Buffer } {
  if (d.length < 2) return { path: '', than: Buffer.alloc(0) };
  const dai = (d[0]! << 8) | d[1]!;
  const head = d.subarray(2, 2 + dai).toString('utf8');
  return { path: /Path:([^\r\n]*)/i.exec(head)?.[1]?.trim() ?? '', than: d.subarray(2 + dai) };
}

/**
 * Gọi Edge TTS một lượt, trả mp3. Không ghi log nội dung câu quá 60 ký tự
 * (nhật ký bridge là chỗ Boss dán cho người khác xem).
 */
async function goiEdge(text: string, voice: string, rate: string, pitch: string): Promise<Buffer> {
  const idYeuCau = randomUUID().replace(/-/g, '');
  const url =
    `${WSS}?Ocp-Apim-Subscription-Key=${TOKEN_EDGE}` +
    `&Sec-MS-GEC=${chuKy()}&Sec-MS-GEC-Version=${PHIEN_BAN_GEC}&ConnectionId=${idYeuCau}`;

  return await new Promise<Buffer>((xong, loi) => {
    const ws = new WebSocket(url, {
      headers: {
        // Thiếu `Cookie: MUID=…` hoặc `Accept-Encoding` là dịch vụ trả HTTP 200
        // thay vì 101 (đo thật: "Unexpected server response: 200").
        'User-Agent': UA,
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: `MUID=${randomBytes(16).toString('hex').toUpperCase()}`,
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      },
    });
    const manh: Buffer[] = [];
    let ketThuc = false;
    const han = setTimeout(() => {
      if (!ketThuc) {
        ketThuc = true;
        ws.terminate();
        loi(new Error('Edge TTS không trả lời trong 20 s'));
      }
    }, 20_000);

    const dong = (e?: Error) => {
      if (ketThuc) return;
      ketThuc = true;
      clearTimeout(han);
      try {
        ws.close();
      } catch {
        /* đóng được thì tốt, không thì thôi */
      }
      if (e) loi(e);
      else {
        const mp3 = Buffer.concat(manh);
        if (mp3.length === 0) loi(new Error('Edge TTS trả 0 byte (giọng không khớp ngôn ngữ?)'));
        else xong(mp3);
      }
    };

    ws.on('open', () => {
      ws.send(
        `X-Timestamp:${mocGio()}\r\nContent-Type:application/json; charset=utf-8\r\n` +
          'Path:speech.config\r\n\r\n' +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":false,` +
          `"wordBoundaryEnabled":false},"outputFormat":"${DANG_RA}"}}}}`,
      );
      ws.send(
        `X-RequestId:${idYeuCau}\r\nContent-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${mocGio()}\r\nPath:ssml\r\n\r\n${ssml(text, voice, rate, pitch)}`,
      );
    });

    ws.on('message', (d: Buffer, nhiPhan: boolean) => {
      if (nhiPhan) {
        const { path, than } = tachNhiPhan(d);
        if (path === 'audio' && than.length > 0) manh.push(than);
      } else if (/Path:\s*turn\.end/i.test(d.toString('utf8'))) {
        dong();
      }
    });

    ws.on('error', (e: Error) => dong(e));
    ws.on('close', () => dong());
  });
}

/**
 * Gọi Edge, thử lại tối đa `CHO_THU_LAI_MS.length` lần nữa khi lỗi.
 *
 * `goiEdge` đã tự dọn ws trong mọi nhánh (timeout / error / close), nên thử
 * lại chỉ là gọi lại — không rò kết nối. Lỗi lần cuối mới được ném ra.
 */
export async function goiEdgeThuLai(
  text: string,
  voice: string,
  rate: string,
  pitch: string,
  {
    goi = goiEdge,
    nghi = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    cho = CHO_THU_LAI_MS,
  }: {
    goi?: (t: string, v: string, r: string, p: string) => Promise<Buffer>;
    nghi?: (ms: number) => Promise<void>;
    cho?: readonly number[];
  } = {},
): Promise<Buffer> {
  let cuoi: Error | null = null;
  for (let lan = 0; lan <= cho.length; lan++) {
    try {
      return await goi(text, voice, rate, pitch);
    } catch (e) {
      cuoi = e as Error;
      const doi = cho[lan];
      if (doi === undefined) break;
      console.warn(`[tts ] Edge lỗi (${cuoi.message}) — thử lại sau ${doi} ms`);
      await nghi(doi);
    }
  }
  throw cuoi ?? new Error('Edge TTS lỗi không rõ');
}

/* ------------------------------------------------------------ cổng chính */

/** Tổng hợp một câu (đọc cache trước, chưa có thì gọi Edge rồi ghi cache). */
export async function tongHop(text: string, ts: ThamSoNoi = {}): Promise<Buffer> {
  const cau = text.trim();
  if (!cau) throw new Error('Thiếu "text"');
  if (cau.length > 1000) throw new Error('Câu dài quá 1000 ký tự');

  const bam = bamCache(cau, ts);
  const duong = duongCache(bam);
  try {
    const cu = await readFile(duong);
    if (cu.length > 0) return cu;
  } catch {
    /* chưa có cache — tổng hợp mới */
  }

  const mp3 = await goiEdgeThuLai(cau, tenGiong(ts.voice), phanTram(ts.rate), hecZ(ts.pitch));
  try {
    await mkdir(THU_MUC_CACHE, { recursive: true });
    await writeFile(duong, mp3);
  } catch (e) {
    // cache hỏng thì vẫn phát được tiếng — chỉ ghi chú, không làm lỗi lệnh
    console.warn('[tts] không ghi được cache:', (e as Error).message);
  }
  return mp3;
}

/**
 * Bật endpoint HTTP cho trình duyệt.
 *
 * - `GET /tts?text=…&voice=nu|nam|<tên>&rate=&pitch=` → `audio/mpeg`
 * - `GET /tts/giong` → `{ nu, nam }`
 * - `GET /khoe` → `{ ok: true }`
 */
/**
 * Hâm sẵn cache cho `CAU_DEM_SAN`. Chạy **tuần tự** (không `Promise.all`):
 * tám ws song song tới Edge là cách nhanh nhất để bị nó cắt, mà đây là việc
 * nền — không ai chờ.
 *
 * Trả về số câu đã có trong cache sau khi chạy (bằng chứng cho `kiem-e1`).
 */
export async function hamCauDem(
  ds: readonly string[] = CAU_DEM_SAN,
  ts: ThamSoNoi = { voice: 'nu' },
): Promise<{ xong: number; loi: number }> {
  let xong = 0;
  let loi = 0;
  for (const cau of ds) {
    try {
      await tongHop(cau, ts);
      xong++;
    } catch (e) {
      loi++;
      console.warn(`[tts ] không hâm được «${cau.slice(0, 40)}»:`, (e as Error).message);
    }
  }
  return { xong, loi };
}

export function batTts(host: string, cong: number): Server {
  const sv = createServer((req, res) => {
    // Vite chạy ở cổng khác (5173) nên đây là yêu cầu khác nguồn: phải có CORS.
    // Mở `*` được vì bridge chỉ nghe 127.0.0.1 (xem `bridge/server.ts`).
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    const u = new URL(req.url ?? '/', `http://${host}:${cong}`);

    if (u.pathname === '/khoe') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      return;
    }
    if (u.pathname === '/tts/giong') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(GIONG));
      return;
    }
    if (u.pathname !== '/tts') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Chỉ có /tts');
      return;
    }

    const text = u.searchParams.get('text') ?? '';
    const ts: ThamSoNoi = {
      voice: u.searchParams.get('voice') ?? undefined,
      rate: u.searchParams.get('rate') ?? undefined,
      pitch: u.searchParams.get('pitch') ?? undefined,
    };
    tongHop(text, ts).then(
      (mp3) => {
        res
          .writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Content-Length': String(mp3.length),
            // cache theo hash câu nên đổi câu là đổi URL → giữ lâu được
            'Cache-Control': 'public, max-age=86400',
          })
          .end(mp3);
      },
      (e: Error) => {
        res
          .writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
          .end(JSON.stringify({ ok: false, error: e.message }));
      },
    );
  });
  sv.listen(cong, host, () => {
    console.log(`[tts ] đang nghe http://${host}:${cong}/tts?text=Xin%20ch%C3%A0o&voice=nu`);
    console.log(`[tts ] giọng: nữ ${GIONG.nu} · nam ${GIONG.nam} · cache ${THU_MUC_CACHE}/`);
    // E1 (#48): hâm 8 câu đệm NGAY lúc bật, nền, không chặn cổng.
    if (process.env.GEN_STAGE_TTS_HAM !== '0') {
      void hamCauDem().then(({ xong, loi }) =>
        console.log(`[tts ] hâm câu đệm: ${xong} sẵn${loi ? `, ${loi} lỗi` : ''}`),
      );
    }
  });
  return sv;
}
