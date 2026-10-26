/**
 * do-stt.mjs — SINH BỘ THỬ + ĐO WER/ĐỘ TRỄ cho C1 (Issue #31).
 *
 * Không phải mã chạy trong sản phẩm: đây là bàn đo một lần để chọn engine, giữ
 * lại trong repo để Boss (hoặc người sau) đo lại được bằng đúng một lệnh.
 *
 *   node scripts/do-stt.mjs mau        # sinh 20 wav 16 kHz từ TTS bridge (Hoài My + Nam Minh)
 *   node scripts/do-stt.mjs do <ten> "<lệnh có {wav}>"   # chạy một engine trên cả bộ, in WER/trễ
 *
 * Bộ thử nằm trong `.cache/stt/mau/` (không commit). Kết quả ghi JSON vào
 * `.cache/stt/ketqua/<ten>.json` để `docs/c1/so-sanh.md` tổng hợp lại.
 */
import { execFile } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const chay = promisify(execFile);

/** 10 câu lệnh tiếng Việt Boss hay nói (Issue #31). */
export const CAU = [
  'Gen ơi, dựng connector Baserow',
  'đi tới bàn điều khiển',
  'cất module lên kệ',
  'chào Gen',
  'mở màn hình chính',
  'Gen, vui lên',
  'kết tinh module tên Kho Ryan',
  'quay lại đây',
  'nói lại lần nữa',
  'dừng lại',
];

const GIONG = { nu: 'nu', nam: 'nam' };
const THU_MUC = '.cache/stt/mau';
const THU_MUC_KQ = '.cache/stt/ketqua';

/* ----------------------------------------------------------------- sinh mẫu */

async function sinhMau() {
  const { tongHop } = await import('../bridge/tts.ts');
  await mkdir(THU_MUC, { recursive: true });
  const danh = [];
  for (const [ten, giong] of Object.entries(GIONG)) {
    for (let i = 0; i < CAU.length; i++) {
      const goc = join(THU_MUC, `${ten}-${String(i).padStart(2, '0')}.mp3`);
      const wav = goc.replace(/\.mp3$/, '.wav');
      const mp3 = await tongHop(CAU[i], { voice: giong });
      await writeFile(goc, mp3);
      // 16 kHz mono PCM — đúng dạng mọi engine whisper/vosk cần
      await chay('ffmpeg', ['-y', '-i', goc, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
      danh.push({ wav, text: CAU[i], giong: ten });
      process.stdout.write('.');
    }
  }
  await writeFile(join(THU_MUC, 'bo-thu.json'), JSON.stringify(danh, null, 2));
  console.log(`\nĐã sinh ${danh.length} wav 16 kHz vào ${THU_MUC}/`);
}

/* ------------------------------------------------------------------ đo WER */

/** Chuẩn hoá để so: bỏ dấu câu, về chữ thường, gộp khoảng trắng. Giữ dấu tiếng Việt. */
export function chuanHoa(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,!?;:…"'“”‘’()\[\]{}\/\\–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Khoảng cách sửa theo TỪ (Levenshtein) → WER = sửa / số từ chuẩn. */
export function werMotCau(chuan, nhan) {
  const a = chuanHoa(chuan).split(' ').filter(Boolean);
  const b = chuanHoa(nhan).split(' ').filter(Boolean);
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] =
        a[i - 1] === b[j - 1]
          ? d[i - 1][j - 1]
          : 1 + Math.min(d[i - 1][j - 1], d[i - 1][j], d[i][j - 1]);
  return { sua: d[a.length][b.length], tu: a.length };
}

async function doEngine(ten, mauLenh) {
  const danh = JSON.parse(await readFile(join(THU_MUC, 'bo-thu.json'), 'utf8'));
  let tongSua = 0;
  let tongTu = 0;
  const treTungCau = [];
  const chiTiet = [];
  for (const m of danh) {
    const lenh = mauLenh.replace(/\{wav\}/g, m.wav);
    const t0 = Date.now();
    let ra = '';
    try {
      const { stdout } = await chay('bash', ['-lc', lenh], { maxBuffer: 1 << 26 });
      ra = stdout;
    } catch (e) {
      ra = `__LỖI__ ${e.message}`;
    }
    const tre = Date.now() - t0;
    const { sua, tu } = werMotCau(m.text, ra);
    tongSua += sua;
    tongTu += tu;
    treTungCau.push(tre);
    chiTiet.push({ ...m, nhan: chuanHoa(ra), sua, tu, treMs: tre });
    process.stdout.write(sua === 0 ? '✓' : '✗');
  }
  treTungCau.sort((x, y) => x - y);
  const kq = {
    engine: ten,
    lenh: mauLenh,
    wer: tongSua / tongTu,
    treTrungBinhMs: Math.round(treTungCau.reduce((s, x) => s + x, 0) / treTungCau.length),
    treP95Ms: treTungCau[Math.floor(treTungCau.length * 0.95)] ?? treTungCau.at(-1),
    soCau: danh.length,
    chiTiet,
  };
  await mkdir(THU_MUC_KQ, { recursive: true });
  await writeFile(join(THU_MUC_KQ, `${ten}.json`), JSON.stringify(kq, null, 2));
  console.log(
    `\n${ten}: WER ${(kq.wer * 100).toFixed(1)}% · trễ TB ${kq.treTrungBinhMs} ms · p95 ${kq.treP95Ms} ms`,
  );
  return kq;
}

/* ------------------------------------------------------------------- bảng */

async function bang() {
  const ds = await readdir(THU_MUC_KQ).catch(() => []);
  const hang = [];
  for (const f of ds.filter((x) => x.endsWith('.json'))) {
    const k = JSON.parse(await readFile(join(THU_MUC_KQ, f), 'utf8'));
    hang.push(k);
  }
  hang.sort((a, b) => a.wer - b.wer);
  console.log('| Engine | WER | Trễ TB | p95 |');
  console.log('| --- | --- | --- | --- |');
  for (const h of hang)
    console.log(
      `| ${h.engine} | ${(h.wer * 100).toFixed(1)}% | ${(h.treTrungBinhMs / 1000).toFixed(2)} s | ${(h.treP95Ms / 1000).toFixed(2)} s |`,
    );
}

const [viec, ...tham] = process.argv.slice(2);
if (viec === 'mau') await sinhMau();
else if (viec === 'do') await doEngine(tham[0], tham[1]);
else if (viec === "bang") await bang();
else if (viec === "cham") await chamTsv(tham[0], await readFile(tham[1], "utf8"), tham[2] === "sua");
else console.log('Dùng: node scripts/do-stt.mjs mau | do <ten> "<lệnh {wav}>" | bang');

/* ------------------------------------------- chấm điểm từ TSV "<ms>\t<chữ>" */
// Dùng cho engine nạp model MỘT LẦN rồi chạy cả bộ (đúng cảnh bridge chạy
// thật): engine tự in mỗi dòng một câu theo đúng thứ tự `bo-thu.json`.
export async function chamTsv(ten, tsv, sua = false) {
  const { chuanHoaCauNoi } = sua ? await import('../bridge/so-tu.ts') : { chuanHoaCauNoi: null };
  const danh = JSON.parse(await readFile(join(THU_MUC, 'bo-thu.json'), 'utf8'));
  const dong = tsv.trim().split('\n');
  let tongSua = 0;
  let tongTu = 0;
  const tre = [];
  const chiTiet = [];
  for (let i = 0; i < danh.length; i++) {
    const [ms, ...rest] = (dong[i] ?? '').split('\t');
    let nhan = rest.join('\t');
    if (chuanHoaCauNoi) nhan = chuanHoaCauNoi(nhan).text;
    const { sua, tu } = werMotCau(danh[i].text, nhan);
    tongSua += sua;
    tongTu += tu;
    tre.push(Number(ms.replace(/ms$/, '')) || 0);
    chiTiet.push({ ...danh[i], nhan: chuanHoa(nhan), sua, tu, treMs: tre[i] });
  }
  const sx = [...tre].sort((a, b) => a - b);
  const kq = {
    engine: ten,
    wer: tongSua / tongTu,
    treTrungBinhMs: Math.round(tre.reduce((s, x) => s + x, 0) / tre.length),
    treP95Ms: sx[Math.floor(sx.length * 0.95)] ?? sx.at(-1),
    soCau: danh.length,
    cauSai: chiTiet.filter((c) => c.sua > 0).map((c) => `${c.text} → ${c.nhan}`),
    chiTiet,
  };
  await mkdir(THU_MUC_KQ, { recursive: true });
  await writeFile(join(THU_MUC_KQ, `${ten}.json`), JSON.stringify(kq, null, 2));
  console.log(
    `${ten}: WER ${(kq.wer * 100).toFixed(1)}% · trễ TB ${kq.treTrungBinhMs} ms · p95 ${kq.treP95Ms} ms`,
  );
  return kq;
}
