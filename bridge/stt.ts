/**
 * stt.ts — NHẬN DẠNG GIỌNG VIỆT cho sân khấu (C1, Issue #31).
 *
 *     trình duyệt ──POST /stt (webm/opus | wav)──► bridge
 *                                                   │ ffmpeg → 16 kHz mono wav
 *                                                   │ thợ python (model nạp sẵn)
 *                                                   │ sổ từ nhà (bridge/so-tu.ts)
 *                 ◄── { text, confidence, durationMs, goiGen } ──┘
 *
 * **Vì sao nhận dạng ở bridge, không ở trình duyệt**: Boss dùng Firefox trên
 * Fedora, không có Web Speech API (`webkitSpeechRecognition` là của Chrome, và
 * Chrome trên máy Boss đang tắt GPU). Máy không có CUDA dùng được → CPU.
 *
 * **Engine chọn theo số đo thật** (bảng trong `docs/c1/so-sanh.md`):
 * PhoWhisper-small (VinAI) bản CTranslate2 int8 qua `faster-whisper`. Lý do
 * tóm gọn: whisper.cpp trên CPU Haswell này mất 14 s (small) → 78 s
 * (large-v3-turbo) một câu, Vosk nhanh 0,24 s nhưng WER 28 %, còn whisper gốc
 * đa ngôn ngữ nghe tiếng Việt kém hơn PhoWhisper cùng cỡ.
 *
 * **Ba quyết định đáng ghi**
 *
 * 1. **Thợ python chạy mãi, không gọi mới mỗi câu.** Nạp model mất 3–6 s; gọi
 *    mới mỗi câu là Boss chờ thêm khoản đó mỗi lần nói. `bridge/stt-worker.py`
 *    nạp một lần lúc `pnpm bridge` bật rồi đứng chờ ở stdin. Thợ chết thì tự
 *    bật lại ở câu sau (không làm sập bridge).
 * 2. **Hàng đợi một câu một lúc.** Model dùng cả 4 lõi; hai câu song song làm
 *    cả hai chậm gấp đôi chứ không nhanh hơn. Câu mới tới trong lúc đang chạy
 *    thì xếp hàng.
 * 3. **Sửa theo sổ từ nhà, không nâng model.** Đo thật: mọi engine nghe đúng
 *    câu lệnh tiếng Việt thường nhưng không engine nào nghe ra `Gen`,
 *    `connector`, `Baserow`, `module`, `Kho Ryan` — đó là tên riêng ngoài vốn
 *    từ, nâng cỡ model không chữa được. `bridge/so-tu.ts` hạ WER 47 % → 3,9 %.
 *
 * Bind giống bridge ws và TTS: mặc định chỉ `127.0.0.1`.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chuanHoaCauNoi } from './so-tu';

/* --------------------------------------------------------------- hằng số */

/** Cổng mặc định — ngay sau MCP (8789), không đụng ws 8787 / TTS 8788. */
export const CONG_STT_MAC_DINH = 8790;
/** Thư mục cài STT (venv + model), nằm trong `.gitignore`. */
const GOC = process.env.GEN_STAGE_STT_DIR ?? '.cache/stt';
/** Audio dài hơn thế này là Boss để tay trên phím V quên nhả — cắt. */
const DAI_TOI_DA_MS = 30_000;
/** Thân yêu cầu lớn hơn thế này thì từ chối (30 s opus ≈ 120 kB). */
const THAN_TOI_DA = 8 * 1024 * 1024;
/** Hạn chờ thợ trả lời một câu. */
const HAN_THO_MS = 120_000;

/** Đường tới python trong venv do `scripts/fetch-stt.sh` lập. */
function duongPython(): string {
  return process.env.GEN_STAGE_STT_PYTHON ?? join(GOC, 'venv', 'bin', 'python');
}

/* ----------------------------------------------------------- thợ python */

export interface KetQuaTho {
  text: string;
  confidence: number;
  durationMs: number;
  audioMs: number;
}

interface ChoTho {
  xong: (k: KetQuaTho) => void;
  loi: (e: Error) => void;
  hen: NodeJS.Timeout;
}

/**
 * Thợ nhận dạng: một tiến trình python chạy mãi, một câu một lúc.
 *
 * Lớp này cố tình **không** biết HTTP: test gọi được nó trực tiếp, và `/stt`
 * chỉ là một người gọi.
 */
export class Tho {
  private con: ChildProcessWithoutNullStreams | null = null;
  private san: Promise<void> | null = null;
  /** Câu đang chờ thợ trả lời (chỉ một). */
  private dangCho: ChoTho | null = null;
  /** Hàng đợi câu tới trong lúc thợ đang làm. */
  private hangDoi: Array<() => void> = [];
  private dem = '';

  constructor(private readonly model = process.env.GEN_STAGE_STT_MODEL) {}

  /** Có cài đặt chưa (venv + model)? Chưa thì `/stt` trả lời tử tế thay vì nổ. */
  daCai(): boolean {
    return existsSync(duongPython()) && existsSync(this.thuMucModel());
  }

  thuMucModel(): string {
    return this.model ?? join(GOC, 'models', 'PhoWhisper-small-ct2');
  }

  private bat(): Promise<void> {
    if (this.san) return this.san;
    this.san = new Promise<void>((xong, loi) => {
      const con = spawn(duongPython(), ['bridge/stt-worker.py'], {
        env: { ...process.env, GEN_STAGE_STT_MODEL: this.thuMucModel() },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.con = con;
      const han = setTimeout(() => loi(new Error('Thợ STT không sẵn sàng trong 180 s')), 180_000);

      con.stdout.setEncoding('utf8');
      con.stdout.on('data', (d: string) => {
        this.dem += d;
        let i: number;
        while ((i = this.dem.indexOf('\n')) >= 0) {
          const dong = this.dem.slice(0, i).trim();
          this.dem = this.dem.slice(i + 1);
          if (!dong) continue;
          let g: Record<string, unknown>;
          try {
            g = JSON.parse(dong) as Record<string, unknown>;
          } catch {
            console.warn('[stt ] thợ nói gì không hiểu:', dong.slice(0, 120));
            continue;
          }
          if (g.san === true) {
            clearTimeout(han);
            console.log(`[stt ] thợ sẵn sàng · model ${String(g.model)} · ${String(g.luong)} luồng`);
            xong();
            continue;
          }
          this.traLoi(g);
        }
      });
      // stderr của faster-whisper là cảnh báo, không phải lỗi — chỉ ghi gọn
      con.stderr.setEncoding('utf8');
      con.stderr.on('data', (d: string) => {
        const g = d.trim();
        if (g) console.warn('[stt ]', g.split('\n').at(-1)?.slice(0, 200));
      });
      con.on('exit', (ma) => {
        console.warn(`[stt ] thợ tắt (mã ${ma}) — câu sau sẽ bật lại`);
        this.con = null;
        this.san = null;
        this.traLoi({ error: 'thợ STT tắt giữa câu' });
      });
      con.on('error', (e) => loi(e));
    }).catch((e: Error) => {
      this.san = null;
      this.con = null;
      throw e;
    });
    return this.san;
  }

  private traLoi(g: Record<string, unknown>): void {
    const cho = this.dangCho;
    this.dangCho = null;
    const tiep = this.hangDoi.shift();
    if (cho) {
      clearTimeout(cho.hen);
      if (typeof g.error === 'string') cho.loi(new Error(g.error));
      else
        cho.xong({
          text: String(g.text ?? ''),
          confidence: Number(g.confidence ?? 0),
          durationMs: Number(g.durationMs ?? 0),
          audioMs: Number(g.audioMs ?? 0),
        });
    }
    tiep?.();
  }

  /** Nhận dạng một file wav 16 kHz mono. Xếp hàng nếu thợ đang làm câu khác. */
  async nhan(duongWav: string): Promise<KetQuaTho> {
    await this.bat();
    if (this.dangCho) await new Promise<void>((r) => this.hangDoi.push(r));
    await this.bat(); // thợ có thể đã tắt trong lúc xếp hàng
    const con = this.con;
    if (!con) throw new Error('Thợ STT không bật được');
    return await new Promise<KetQuaTho>((xong, loi) => {
      this.dangCho = {
        xong,
        loi,
        hen: setTimeout(() => this.traLoi({ error: `Thợ STT quá ${HAN_THO_MS} ms` }), HAN_THO_MS),
      };
      con.stdin.write(`${duongWav}\n`);
    });
  }

  dong(): void {
    this.con?.kill();
    this.con = null;
    this.san = null;
  }
}

/* ----------------------------------------------------------------- ffmpeg */

/**
 * Về **16 kHz mono PCM** — dạng duy nhất mọi engine whisper/vosk nhận.
 *
 * `MediaRecorder` của Firefox cho webm/opus 48 kHz; iOS cho mp4/aac. Không đoán
 * dạng vào: ffmpeg tự nhận, nên thêm trình duyệt mới không phải sửa gì.
 */
export async function veWav16k(
  vao: Buffer,
  duongRa: string,
  cat?: { tuMs?: number; denMs?: number },
): Promise<void> {
  const duongVao = `${duongRa}.vao`;
  await writeFile(duongVao, vao);
  // Cắt im lặng đầu/cuối theo dải `src/audio/vad.ts` đo được trong trình duyệt.
  // Cắt ở đây (ffmpeg) chứ không ở trình duyệt: Firefox cho opus, giải mã lại
  // để cắt mẫu thì vừa chậm vừa phải tự ghép header wav.
  const tu = Math.max(0, cat?.tuMs ?? 0);
  const den = cat?.denMs !== undefined && cat.denMs > tu ? cat.denMs : undefined;
  const dai = Math.min(DAI_TOI_DA_MS, den !== undefined ? den - tu : DAI_TOI_DA_MS);
  try {
    await new Promise<void>((xong, loi) => {
      const p = spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        // `-ss` TRƯỚC `-i` để ffmpeg nhảy thẳng, không giải mã phần bỏ đi
        '-ss',
        (tu / 1000).toFixed(3),
        '-i',
        duongVao,
        '-t',
        (dai / 1000).toFixed(3),
        '-ar',
        '16000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        duongRa,
      ]);
      let noi = '';
      p.stderr.setEncoding('utf8');
      p.stderr.on('data', (d: string) => (noi += d));
      p.on('error', loi);
      p.on('exit', (ma) =>
        ma === 0 ? xong() : loi(new Error(`ffmpeg lỗi ${ma}: ${noi.trim().slice(0, 200)}`)),
      );
    });
  } finally {
    await rm(duongVao, { force: true });
  }
}

/* ------------------------------------------------------------ cổng chính */

export interface KetQuaStt {
  text: string;
  confidence: number;
  /** Thời gian nhận dạng (ms) — số Boss thấy khi đo trễ. */
  durationMs: number;
  /** Độ dài audio (ms). */
  audioMs: number;
  /** Câu mở đầu bằng "Gen ơi / Gen à / Gen," → Boss đang gọi Gen. */
  goiGen: boolean;
  /** Chữ thô trước khi sửa theo sổ từ (để Boss/Issue soi khi sai). */
  tho: string;
}

const tho = new Tho();

/** Cache theo nội dung audio: nói lại y nguyên một file (script bằng chứng) thì khỏi nhận lại. */
const THU_MUC_CACHE = process.env.GEN_STAGE_STT_CACHE ?? join(GOC, 'cache');

/** Nhận dạng một khối audio bất kỳ dạng gì → kết quả đã chuẩn hoá. */
export async function nhanDang(
  am: Buffer,
  cat?: { tuMs?: number; denMs?: number },
): Promise<KetQuaStt> {
  if (am.length === 0) throw new Error('Không có audio');
  // Khoá cache gồm cả dải cắt: cùng audio mà cắt khác là câu khác.
  const bam = createHash('sha1')
    .update(am)
    .update(`|${cat?.tuMs ?? 0}|${cat?.denMs ?? 0}`)
    .digest('hex');
  const duongCache = join(THU_MUC_CACHE, `${bam}.json`);
  try {
    return JSON.parse(await readFile(duongCache, 'utf8')) as KetQuaStt;
  } catch {
    /* chưa có cache */
  }

  const wav = join(tmpdir(), `gen-stage-stt-${bam}.wav`);
  try {
    await veWav16k(am, wav, cat);
    const k = await tho.nhan(wav);
    const { text, goiGen } = chuanHoaCauNoi(k.text);
    const ra: KetQuaStt = {
      text,
      confidence: k.confidence,
      durationMs: k.durationMs,
      audioMs: k.audioMs,
      goiGen,
      tho: k.text,
    };
    try {
      await mkdir(THU_MUC_CACHE, { recursive: true });
      await writeFile(duongCache, JSON.stringify(ra));
    } catch {
      /* cache hỏng thì vẫn nhận được chữ */
    }
    return ra;
  } finally {
    await rm(wav, { force: true });
  }
}

function docThan(req: IncomingMessage): Promise<Buffer> {
  return new Promise((xong, loi) => {
    const manh: Buffer[] = [];
    let dai = 0;
    req.on('data', (d: Buffer) => {
      dai += d.length;
      if (dai > THAN_TOI_DA) {
        loi(new Error(`Audio lớn quá ${THAN_TOI_DA} byte`));
        req.destroy();
        return;
      }
      manh.push(d);
    });
    req.on('end', () => xong(Buffer.concat(manh)));
    req.on('error', loi);
  });
}

/**
 * Bật endpoint HTTP cho trình duyệt.
 *
 * - `POST /stt` (thân = audio webm/opus hoặc wav) → `{ text, confidence, durationMs, goiGen }`
 * - `GET  /stt/khoe` → `{ ok, daCai, model }` — mic trong trình duyệt hỏi cái này
 *   để biết có nên hiện nút 🎤 không.
 */
export function batStt(host: string, cong: number): Server {
  const sv = createServer((req, res) => {
    // Vite ở cổng khác (5173) → khác nguồn. Mở `*` được vì chỉ nghe 127.0.0.1.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    /*
     * F3 (#56) — khai rõ `Allow-Methods` + `Max-Age`.
     *
     * `Content-Type: audio/ogg; codecs=opus` (dạng MediaRecorder của Firefox)
     * KHÔNG nằm trong danh sách an toàn của CORS, nên mỗi lượt Boss nói là một
     * `OPTIONS` đi trước. `Max-Age` cho trình duyệt nhớ kết quả preflight một
     * ngày → lượt nói thứ hai trở đi tiết kiệm một vòng mạng.
     */
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    const u = new URL(req.url ?? '/', `http://${host}:${cong}`);

    if (u.pathname === '/stt/khoe') {
      res
        .writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        .end(
          JSON.stringify({
            ok: true,
            daCai: tho.daCai(),
            model: tho.thuMucModel(),
            huongDan: tho.daCai() ? undefined : 'Chạy: bash scripts/fetch-stt.sh',
          }),
        );
      return;
    }
    if (u.pathname !== '/stt') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Chỉ có /stt');
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Chỉ POST');
      return;
    }
    if (!tho.daCai()) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' }).end(
        JSON.stringify({
          ok: false,
          error: 'Chưa cài STT. Chạy: bash scripts/fetch-stt.sh',
        }),
      );
      return;
    }

    const soMs = (ten: string): number | undefined => {
      const x = Number(u.searchParams.get(ten));
      return Number.isFinite(x) && x >= 0 ? x : undefined;
    };
    docThan(req)
      .then((am) => nhanDang(am, { tuMs: soMs('tu'), denMs: soMs('den') }))
      .then(
        (k) => {
          res
            .writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
            .end(JSON.stringify(k));
          // Không ghi nguyên văn câu Boss nói vào log quá 60 ký tự: nhật ký
          // bridge là chỗ Boss dán cho người khác xem (giống `bridge/tts.ts`).
          console.log(
            `[stt ] ${k.audioMs} ms audio → ${k.durationMs} ms · tin ${k.confidence} · ` +
              `"${k.text.slice(0, 60)}"`,
          );
        },
        (e: Error) => {
          res
            .writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
            .end(JSON.stringify({ ok: false, error: e.message }));
          console.warn('[stt ] lỗi:', e.message);
        },
      );
  });
  sv.listen(cong, host, () => {
    console.log(`[stt ] đang nghe http://${host}:${cong}/stt  (POST audio)`);
    console.log(
      tho.daCai()
        ? `[stt ] model ${tho.thuMucModel()} · giữ phím V trong trình duyệt để nói`
        : '[stt ] CHƯA CÀI model — chạy: bash scripts/fetch-stt.sh',
    );
  });
  sv.on('close', () => tho.dong());
  return sv;
}
