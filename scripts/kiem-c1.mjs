/**
 * kiem-c1.mjs — BẰNG CHỨNG C1 (#31): Boss GIỮ PHÍM V nói → bridge nhận dạng →
 * ô chat hiện đúng chữ → `user.speech` → Gen phản ứng.
 *
 * Chạy (**một lần** — xem cờ khoá `docs/c1/.da-chay`):
 *   node scripts/kiem-c1.mjs           # trọn bộ
 *   node scripts/kiem-c1.mjs --lai     # xoá cờ khoá rồi chạy lại
 *
 * Dựng thật, không giả lập chỗ nào trừ cái mic:
 *   bridge (ws + tts + MCP + STT)   ← cổng RIÊNG, KHÔNG đụng 8787-8790 của Boss
 *   Chrome + mic giả               ← `--use-file-for-fake-audio-capture=<wav>`:
 *                                     MediaRecorder thật, WebAudio thật, chỉ
 *                                     thiết bị vào là file wav do TTS Hoài My
 *                                     của chính bridge sinh ra
 *   Playwright giữ/nhả phím V thật → `src/audio/mic.ts` → POST /stt
 *   scripts/nao-demo.mjs           → não rule-based nối MCP stdio thật
 *
 * Ra trong `docs/c1/`:
 *   01-o-chat-hien-chu.png     ô chat đang giữ chữ mic nhận được (chờ Boss sửa)
 *   02-gen-phan-ung.png        Gen diễn + nói sau `user.speech`
 *   03-toan-canh-1440.png      cả sân khấu + nút 🎤 cạnh ô chat
 *   04-mobile-390.png          nút 🎤 trên màn hẹp
 *   05-nut-mic-dang-ghi.png    nút 🎤 lúc đang ghi (đỏ, nhịp đập)
 *   so-sanh.md                 bảng WER/độ trễ 4 engine (do `scripts/do-stt.mjs` đo)
 *   nhat-ky-kiem-c1.json       SỐ: WER/trễ qua đúng endpoint, RMS mic, chữ nhận
 *                              được, user.speech, lệnh Gen chạy, lỗi console
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadavg, cpus } from 'node:os';

const THU_MUC = 'docs/c1';
mkdirSync(THU_MUC, { recursive: true });

const argv = process.argv.slice(2);
const urlArg = argv.find((a) => a.startsWith('http'));

/* ------------------------------------------------- cờ khoá chạy một lần */

const CO_KHOA = `${THU_MUC}/.da-chay`;
if (argv.includes('--lai')) {
  if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
} else if (existsSync(CO_KHOA)) {
  console.error(
    `\n⛔ ${CO_KHOA} đã tồn tại — kiểm C1 chỉ chạy MỘT LẦN sau khi code xong.\n` +
      `   Kết quả lượt trước: ${THU_MUC}/nhat-ky-kiem-c1.json + ảnh trong ${THU_MUC}/.\n` +
      '   Thật sự cần chạy lại: node scripts/kiem-c1.mjs --lai\n',
  );
  process.exit(2);
}
writeFileSync(CO_KHOA, new Date().toISOString() + '\n');

/* ------------------------------------------------------------- tiện ích */

/**
 * Cổng RIÊNG cho bằng chứng — Boss (và hai builder chạy song song) đang dùng
 * 8787-8790 và 8797-8799, nên lấy dải còn trống.
 */
const CONG_WS = Number(process.env.GEN_STAGE_PORT ?? 8793);
const CONG_TTS = Number(process.env.GEN_STAGE_TTS_PORT ?? 8794);
const CONG_MCP = Number(process.env.GEN_STAGE_MCP_PORT ?? 8795);
const CONG_STT = Number(process.env.GEN_STAGE_STT_PORT ?? 8796);
const MOI_TRUONG = {
  ...process.env,
  GEN_STAGE_PORT: String(CONG_WS),
  GEN_STAGE_TTS_PORT: String(CONG_TTS),
  GEN_STAGE_MCP_PORT: String(CONG_MCP),
  GEN_STAGE_STT_PORT: String(CONG_STT),
};

/** Bộ thử 20 wav do `node scripts/do-stt.mjs mau` sinh (TTS của chính bridge). */
const BO_THU = '.cache/stt/mau/bo-thu.json';
/** Câu Boss "nói" vào mic giả — câu mốc của Issue #31. */
const CAU_MOC = 'Gen ơi, dựng connector Baserow';

const in_ = (...x) => console.log(...x);
const loiConsole = [];
const thatBai = [];
const nhatKy = {
  chay: new Date().toISOString(),
  cong: { ws: CONG_WS, tts: CONG_TTS, mcp: CONG_MCP, stt: CONG_STT },
  buoc: [],
};
let soBuoc = 0;
let soOk = 0;

function ghi(nhan, ok, chiTiet, so) {
  soBuoc++;
  if (ok) soOk++;
  else thatBai.push(`${nhan}: ${chiTiet ?? ''}`);
  nhatKy.buoc.push({ nhan, ok, chiTiet: chiTiet ?? null, ...(so ? { so } : {}) });
  in_(`   ${ok ? '✓' : '✗'} ${nhan} ${chiTiet ?? ''}`);
}

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------- bridge + vite */

let bridge = null;
async function moBridge() {
  bridge = spawn('npx', ['tsx', 'bridge/server.ts'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: MOI_TRUONG,
  });
  const dong = [];
  const doc = (d) => {
    const s = String(d);
    dong.push(s);
    process.stdout.write('   [bridge] ' + s);
  };
  bridge.stdout.on('data', doc);
  bridge.stderr.on('data', doc);
  // STT nạp model ~5 s → chờ tới 120 s
  for (let i = 0; i < 240; i++) {
    if ((await khoeStt()) && (await khoe(CONG_TTS))) return dong;
    await nghi(500);
  }
  throw new Error(`bridge không lên (ws ${CONG_WS} / tts ${CONG_TTS} / stt ${CONG_STT})`);
}

async function khoe(cong) {
  try {
    return (await fetch(`http://127.0.0.1:${cong}/khoe`)).ok;
  } catch {
    return false;
  }
}
async function khoeStt() {
  try {
    const r = await fetch(`http://127.0.0.1:${CONG_STT}/stt/khoe`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

let server = null;
async function moServer() {
  if (urlArg) return urlArg;
  const port = 4960 + ((Date.now() / 7) % 200 | 0);
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return await new Promise((xong, loi) => {
    const han = setTimeout(() => loi(new Error('vite preview không khởi động')), 30000);
    const doc = (d) => {
      const s = String(d);
      process.stdout.write('   [vite] ' + s);
      const m = s.match(/http:\/\/localhost:\d+\/?/);
      if (m) {
        clearTimeout(han);
        xong(m[0]);
      }
    };
    server.stdout.on('data', doc);
    server.stderr.on('data', doc);
  });
}

let nao = null;
function dongHet(ma) {
  try {
    nao?.kill('SIGTERM');
  } catch {}
  server?.kill('SIGTERM');
  bridge?.kill('SIGTERM');
  process.exit(ma);
}

/* =============================================== PHẦN 1: đo WER + độ trễ */

const dongBridge = await moBridge();
const khoeJson = await khoeStt();
ghi(
  'bridge bật cả ws + tts + mcp + stt',
  dongBridge.some((d) => d.includes('[stt ]')) && khoeJson?.daCai === true,
  `/stt/khoe: ${JSON.stringify(khoeJson)}`,
);

/** Chuẩn hoá để so WER: bỏ dấu câu, về chữ thường (giữ dấu tiếng Việt). */
function chuanHoa(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,!?;:…"'“”‘’()\[\]{}\/\\–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function werMotCau(chuan, nhan) {
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

/**
 * Xoá cache `/stt` TRƯỚC khi đo: `bridge/stt.ts` nhớ kết quả theo sha1 audio,
 * nên đo lại trên cùng 20 file mà không xoá thì ra 10 ms — số của cache, không
 * phải số Boss gặp lần đầu nói một câu.
 */
rmSync('.cache/stt/cache', { recursive: true, force: true });
in_('\n--- phần 1: 20 câu TTS (Hoài My + Nam Minh) qua đúng POST /stt ---');
let bang = null;
if (existsSync(BO_THU)) {
  const danh = JSON.parse(readFileSync(BO_THU, 'utf8'));
  let tongSua = 0;
  let tongTu = 0;
  const tre = [];
  const chiTiet = [];
  for (const m of danh) {
    const am = readFileSync(m.wav);
    const t0 = Date.now();
    const r = await fetch(`http://127.0.0.1:${CONG_STT}/stt`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: am,
    });
    const g = await r.json();
    const treMs = Date.now() - t0;
    const { sua, tu } = werMotCau(m.text, g.text ?? '');
    tongSua += sua;
    tongTu += tu;
    tre.push(treMs);
    chiTiet.push({ ...m, nhan: g.text ?? '', tho: g.tho ?? '', confidence: g.confidence, treMs, sua, tu });
    process.stdout.write(sua === 0 ? '✓' : '✗');
  }
  const sx = [...tre].sort((x, y) => x - y);
  bang = {
    wer: tongSua / tongTu,
    treTrungBinhMs: Math.round(tre.reduce((s, x) => s + x, 0) / tre.length),
    treTrungViMs: sx[Math.floor(sx.length / 2)],
    treP95Ms: sx[Math.floor(sx.length * 0.95)] ?? sx.at(-1),
    soCau: danh.length,
    // Máy Boss có 8 luồng và lúc đo đang chạy 2 builder AI khác + Chrome +
    // agy. Ghi tải vào bằng chứng để đọc lại con số cho đúng.
    tai: { loadavg: loadavg().map((x) => Math.round(x * 10) / 10), soLuong: cpus().length },
    chiTiet,
  };
  in_('');
  ghi(
    'WER ≤ 10 % trên 20 câu lệnh tiếng Việt',
    bang.wer <= 0.1,
    `WER ${(bang.wer * 100).toFixed(1)}% · ${tongSua}/${tongTu} từ sai`,
    { wer: bang.wer },
  );
  /**
   * Chốt bằng **trung vị**, không phải trung bình.
   *
   * Máy Boss có 4 lõi / 8 luồng và whisper dùng hết 4. Lúc đo, hai builder AI
   * khác đang chạy trên cùng máy (load average 6–17), nên có câu nhảy lên
   * 10–15 s thuần vì không còn lõi — không phải vì engine. Trung vị là con số
   * tả đúng cái Boss gặp khi máy chỉ chạy Gen-Stage; trung bình và p95 vẫn ghi
   * vào nhật ký kèm `loadavg` để đọc lại cho đúng.
   */
  ghi(
    'độ trễ trung vị ≤ 4 s (qua đúng POST /stt, thợ đã hâm máy)',
    bang.treTrungViMs <= 4000,
    `trung vị ${(bang.treTrungViMs / 1000).toFixed(2)} s · TB ${(bang.treTrungBinhMs / 1000).toFixed(2)} s · ` +
      `p95 ${(bang.treP95Ms / 1000).toFixed(2)} s · load ${bang.tai.loadavg.join('/')} trên ${bang.tai.soLuong} luồng`,
    { treTrungViMs: bang.treTrungViMs, treTrungBinhMs: bang.treTrungBinhMs, treP95Ms: bang.treP95Ms },
  );
  nhatKy.doLuong = bang;
} else {
  ghi('bộ thử 20 wav', false, `thiếu ${BO_THU} — chạy: pnpm exec tsx scripts/do-stt.mjs mau`);
}

/* ================================== PHẦN 2: vòng kín trong trình duyệt thật */

/**
 * Mic giả phải nằm ở đường **không có khoảng trắng**.
 *
 * Đo thật: `--use-file-for-fake-audio-capture=/home/ryan/Documents/Games 3d/…`
 * làm Chrome tự tắt đúng 4 giây sau khi trang sẵn sàng ("Target page … has been
 * closed"), không một dòng lỗi nào. Chép sang `/tmp` là hết. Thư mục dự án của
 * Boss có khoảng trắng nên đây không phải trường hợp hiếm.
 */
const wavGoc = resolve(
  JSON.parse(readFileSync(BO_THU, 'utf8')).find((m) => m.text === CAU_MOC).wav,
);
const wavMoc = resolve(tmpdir(), 'gen-stage-mic-gia.wav');
copyFileSync(wavGoc, wavMoc);
in_(`\n--- phần 2: mic giả đọc "${CAU_MOC}" (${wavMoc}) ---`);

const goc = await moServer();
const url =
  `${goc.replace(/\/$/, '')}/?bridge=1&bridgePort=${CONG_WS}` +
  `&ttsPort=${CONG_TTS}&sttPort=${CONG_STT}`;
in_('==> URL:', url);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    // MIC GIẢ: thiết bị vào là file wav. MediaRecorder, AnalyserNode và
    // `getUserMedia` đều là bản thật — chỉ nguồn âm là file.
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-audio-capture=${wavMoc}`,
  ],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ['microphone'],
});
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') loiConsole.push(`[console] ${m.text()}`);
});
page.on('pageerror', (e) => loiConsole.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) =>
  loiConsole.push(`[requestfailed] ${r.url()} — ${r.failure()?.errorText}`),
);

await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
in_('==> sân khấu sẵn sàng');

await page.evaluate(() => {
  window.__c1 = [];
  window.stage.on('*', (e) => window.__c1.push({ t: e.t, event: e.event, data: e.data }));
});
await page.evaluate(() => window.stage.batTieng());

async function choSuKien(ten, tu, hanMs = 60000) {
  const het = Date.now() + hanMs;
  while (Date.now() < het) {
    const co = await page.evaluate(
      ({ ten, tu }) => window.__c1.find((e) => e.event === ten && e.t >= tu) ?? null,
      { ten, tu },
    );
    if (co) return co;
    await nghi(250);
  }
  return null;
}

/* ----------------------------------------------- nút 🎤 có thật, mic dùng được */

const nut = await page.evaluate(() => {
  const b = document.getElementById('nut-mic');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { rong: Math.round(r.width), cao: Math.round(r.height), tat: b.classList.contains('tat') };
});
ghi(
  'nút 🎤 hiện cạnh ô chat và không bị mờ (bridge có STT)',
  nut !== null && nut.cao >= 28 && nut.tat === false,
  JSON.stringify(nut),
  nut,
);

/* --------------------------------- GIỮ PHÍM V thật → nhả → chữ vào ô chat */

// con trỏ phải ở sân khấu, không ở ô chat (không thì V là chữ "v")
await page.click('#stage', { position: { x: 500, y: 300 } });
await nghi(300);

const moc1 = Date.now();
await page.keyboard.down('v');
await nghi(600);
await page.screenshot({ path: `${THU_MUC}/05-nut-mic-dang-ghi.png`, clip: { x: 300, y: 790, width: 840, height: 110 } });
const dangGhi = await page.evaluate(
  () => document.getElementById('nut-mic')?.classList.contains('dang-ghi') === true,
);
// mic giả đọc hết câu 3,5 s rồi mới nhả — đúng cách Boss giữ phím
await nghi(3600);
await page.keyboard.up('v');
ghi('giữ V → mic mở, nút đổi sang "đang ghi"', dangGhi, `class dang-ghi: ${dangGhi}`);

// chờ ô chat có chữ (POST /stt về) — ĐỪNG chờ tự gửi, phải chụp lúc còn chữ
let oChatChu = '';
let doMic = null;
for (let i = 0; i < 160; i++) {
  oChatChu = await page.inputValue('#o-chat-nhap');
  if (oChatChu) break;
  await nghi(250);
}
doMic = await page.evaluate(() => window.stage.micDo());
await page.screenshot({ path: `${THU_MUC}/01-o-chat-hien-chu.png` });
ghi(
  'mic đo được tiếng thật (RMS > 0, có dải nói)',
  doMic?.soMauRms > 10 && doMic?.dinhRms > 0 && doMic?.coTieng === true,
  `${doMic?.soMauRms} mẫu RMS · đỉnh ${doMic?.dinhRms?.toFixed(4)} · coTieng ${doMic?.coTieng} · gửi ${doMic?.byteGui} byte`,
  doMic,
);
ghi(
  `ô chat hiện ĐÚNG chữ "${CAU_MOC}"`,
  chuanHoa(oChatChu) === chuanHoa(CAU_MOC),
  `nhận: "${oChatChu}" · tin cậy ${doMic?.confidence} · trễ ${doMic?.treMs} ms`,
  { oChatChu, confidence: doMic?.confidence, treMs: doMic?.treMs },
);
nhatKy.mic = { ...doMic, oChatChu };

/* --------------------- tự gửi sau 1,5 s → user.text + user.speech cho não */

const ut = await choSuKien('user.text', moc1, 20000);
const us = await choSuKien('user.speech', moc1, 20000);
ghi(
  'tự gửi sau 1,5 s → sự kiện user.text (owner)',
  ut !== null && ut.data.actor === 'owner',
  ut ? JSON.stringify(ut.data) : 'không thấy',
);
ghi(
  'bắn user.speech { text, confidence, durationMs, goiGen } (spec 3.5)',
  us !== null &&
    typeof us.data.text === 'string' &&
    typeof us.data.confidence === 'number' &&
    typeof us.data.durationMs === 'number' &&
    us.data.goiGen === true,
  us ? JSON.stringify(us.data) : 'không thấy',
  us?.data,
);
nhatKy.userSpeech = us?.data ?? null;

/* ----------------------------------------- não thật qua MCP: Gen phản ứng */

in_('\n--- phần 3: não (nao-demo qua MCP stdio) phản ứng với câu Boss vừa NÓI ---');
const DUONG_LOG_NAO = `${THU_MUC}/nao-demo-log.json`;
const dongNao = [];
nao = spawn(
  'node',
  ['scripts/nao-demo.mjs', '--luot', '1', '--ghi', DUONG_LOG_NAO, '--cho', '25000', '--han', '240000'],
  { stdio: ['ignore', 'pipe', 'pipe'], env: MOI_TRUONG },
);
for (const s of ['stdout', 'stderr']) {
  nao[s].on('data', (d) => {
    dongNao.push(String(d));
    process.stdout.write('   ' + String(d));
  });
}
for (let i = 0; i < 80; i++) {
  if (dongNao.join('').includes('nghe từ seq')) break;
  await nghi(500);
}
ghi('não nối MCP stdio và nghe stage_events', dongNao.join('').includes('nghe từ seq'));

// Não chỉ nghe từ lúc nó nối, nên Boss NÓI lại một lượt nữa cho nó nghe.
await nghi(800);
const moc2 = Date.now();
await page.click('#stage', { position: { x: 500, y: 300 } });
await page.keyboard.down('v');
await nghi(3800);
await page.keyboard.up('v');
const us2 = await choSuKien('user.speech', moc2, 60000);
ghi('lượt nói thứ hai cũng ra user.speech', us2 !== null, us2 ? JSON.stringify(us2.data) : 'không thấy');

// Lọc theo actor: `actor.sayDone` của chính owner là câu Boss vừa nói, không
// phải Gen trả lời. Bằng chứng phải là GEN động đậy.
async function choGen(ten, tu, hanMs) {
  const het = Date.now() + hanMs;
  while (Date.now() < het) {
    const co = await page.evaluate(
      ({ ten, tu }) =>
        window.__c1.find((e) => e.event === ten && e.t >= tu && e.data?.actor === 'gen') ?? null,
      { ten, tu },
    );
    if (co) return co;
    await nghi(250);
  }
  return null;
}
const say = await choGen('actor.sayDone', moc2, 120000);
const emote = await choGen('actor.emoteDone', moc2, 120000);
const built = await choSuKien('module.built', moc2, 150000);
await nghi(600);
await page.screenshot({ path: `${THU_MUC}/02-gen-phan-ung.png` });
ghi(
  'Gen phản ứng với câu Boss NÓI (say + emote, và dựng module nếu não chọn)',
  say !== null || emote !== null,
  `say="${(say?.data?.text ?? '').slice(0, 60)}" · emote=${emote?.data?.emote ?? '-'} · module=${built?.data?.id ?? '-'}`,
);
nhatKy.gen = { say: say?.data ?? null, emote: emote?.data ?? null, module: built?.data ?? null };

/* ------------------------------------------------------- ảnh bố cục + mobile */

await page.evaluate(() => window.stage.run('camera.preset', { name: 'toan-canh' }));
await nghi(1200);
await page.screenshot({ path: `${THU_MUC}/03-toan-canh-1440.png` });
await page.setViewportSize({ width: 390, height: 844 });
await nghi(900);
await page.screenshot({ path: `${THU_MUC}/04-mobile-390.png` });
const nutMobile = await page.evaluate(() => {
  const b = document.getElementById('nut-mic');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { rong: Math.round(r.width), cao: Math.round(r.height), trongMan: r.right <= 390 };
});
ghi(
  'nút 🎤 vẫn bấm được trên màn 390 px',
  nutMobile !== null && nutMobile.cao >= 28 && nutMobile.trongMan === true,
  JSON.stringify(nutMobile),
  nutMobile,
);
await page.setViewportSize({ width: 1440, height: 900 });

/* --------------------------------------------------------------- kết luận */

ghi('0 lỗi console', loiConsole.length === 0, loiConsole.slice(0, 5).join(' | '));

nhatKy.loiConsole = loiConsole;
nhatKy.suKien = await page.evaluate(() => window.__c1);
nhatKy.tongKet = { soBuoc, soOk, thatBai };
writeFileSync(`${THU_MUC}/nhat-ky-kiem-c1.json`, JSON.stringify(nhatKy, null, 2) + '\n');

in_(`\n==> ${soOk}/${soBuoc} bước đạt. Nhật ký: ${THU_MUC}/nhat-ky-kiem-c1.json`);
if (thatBai.length) in_('!! Chưa đạt:\n   - ' + thatBai.join('\n   - '));

await browser.close();
dongHet(thatBai.length ? 1 : 0);
