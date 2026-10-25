/**
 * kiem-b2.mjs — bằng chứng B2 (#20): giọng tiếng Việt edge-tts qua bridge +
 * nhép miệng theo biên độ âm, trên app THẬT (Playwright + Chrome hệ thống).
 *
 * Chạy (**một lần** — xem cờ khoá `docs/b2/.da-chay`):
 *   node scripts/kiem-b2.mjs           # trọn bộ
 *   node scripts/kiem-b2.mjs --lai     # xoá cờ khoá rồi chạy lại
 *   node scripts/kiem-b2.mjs <url>     # dùng một url đang chạy sẵn
 *
 * Ra trong `docs/b2/`:
 *   01-<actor>-<giọng>-mieng-mo.png   ảnh miệng mở GIỮA câu (cận mặt)
 *   02-<actor>-<giọng>-toan-than.png  ảnh toàn thân lúc đang nói
 *   giong-nu.mp3 · giong-nam.mp3      2 file mẫu từ bridge (< 300 KB)
 *   nhat-ky-kiem-b2.json              SỐ: durationMs thật vs ước theo chữ,
 *                                     số mẫu RMS > 0, đỉnh RMS, lỗi console
 *
 * Kiểm bằng SỐ, không bằng mắt:
 *  - `durationMs` của `actor.say` phải khớp thời lượng mp3 (ffprobe) ±200 ms,
 *    và phải KHÁC công thức đếm ký tự cũ (chứng minh nó lấy từ audio thật);
 *  - `window.stage.doTieng(actor).soMauDuong > 0` (miệng đã chạy theo âm);
 *  - 0 lỗi console.
 */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';

const THU_MUC = 'docs/b2';
mkdirSync(THU_MUC, { recursive: true });

const argv = process.argv.slice(2);
const urlArg = argv.find((a) => a.startsWith('http'));

/* ------------------------------------------------- cờ khoá chạy một lần */

const CO_KHOA = `${THU_MUC}/.da-chay`;
if (argv.includes('--lai')) {
  if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
} else if (existsSync(CO_KHOA)) {
  console.error(
    `\n⛔ ${CO_KHOA} đã tồn tại — kiểm B2 chỉ chạy MỘT LẦN sau khi code xong.\n` +
      `   Kết quả lượt trước: ${THU_MUC}/nhat-ky-kiem-b2.json + ảnh/mp3 trong ${THU_MUC}/.\n` +
      '   Thật sự cần chạy lại: node scripts/kiem-b2.mjs --lai\n',
  );
  process.exit(2);
}
writeFileSync(CO_KHOA, new Date().toISOString() + '\n');

/* ------------------------------------------------------------- tiện ích */

const in_ = (...x) => console.log(...x);
const loiConsole = [];
const thatBai = [];
const nhatKy = { chay: new Date().toISOString(), buoc: [], cau: [] };
let soBuoc = 0;
let soOk = 0;

function ghi(nhan, ok, chiTiet, so) {
  soBuoc++;
  if (ok) soOk++;
  else thatBai.push(`${nhan}: ${chiTiet ?? ''}`);
  nhatKy.buoc.push({ nhan, ok, chiTiet: chiTiet ?? null, ...(so ? { so } : {}) });
  in_(`   ${ok ? '✓' : '✗'} ${nhan} ${chiTiet ?? ''}`);
}

/** Đúng công thức ước theo ký tự của A1 (`uocThoiLuongNoi` lúc chưa có audio). */
function uocTheoChu(chu) {
  const ms = 600 + (chu.trim().length / 13) * 1000;
  return Math.round(Math.min(9000, Math.max(900, ms)));
}

function doMp3(duong) {
  try {
    const ra = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', duong],
      { encoding: 'utf8' },
    );
    return Math.round(Number.parseFloat(ra) * 1000);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------- bridge + vite */

const CONG_TTS = 8788;
let bridge = null;

async function moBridge() {
  // Bridge của Boss có thể đang chạy sẵn — dùng luôn, không mở chồng.
  if (await khoeTts()) {
    in_('==> bridge TTS đã chạy sẵn trên 127.0.0.1:' + CONG_TTS);
    return false;
  }
  bridge = spawn('npx', ['tsx', 'bridge/server.ts'], { stdio: ['ignore', 'pipe', 'pipe'] });
  bridge.stdout.on('data', (d) => process.stdout.write('   [bridge] ' + d));
  bridge.stderr.on('data', (d) => process.stdout.write('   [bridge] ' + d));
  for (let i = 0; i < 40; i++) {
    if (await khoeTts()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('bridge TTS không lên');
}

async function khoeTts() {
  try {
    const r = await fetch(`http://127.0.0.1:${CONG_TTS}/khoe`);
    return r.ok;
  } catch {
    return false;
  }
}

let server = null;
async function moServer() {
  if (urlArg) return urlArg;
  const port = 4820 + ((Date.now() / 11) % 300 | 0);
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return await new Promise((resolve, reject) => {
    const han = setTimeout(() => reject(new Error('vite preview không khởi động')), 30000);
    const doc = (d) => {
      const s = String(d);
      process.stdout.write('   [vite] ' + s);
      const m = s.match(/http:\/\/localhost:\d+\/?/);
      if (m) {
        clearTimeout(han);
        resolve(m[0]);
      }
    };
    server.stdout.on('data', doc);
    server.stderr.on('data', doc);
  });
}

/* ---------------------------------------------------------------- chạy */

const daMoBridge = await moBridge();
const url = await moServer();
in_('==> URL:', url);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    // B2: không có người bấm "Bật tiếng" trong Playwright → cho phát luôn
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio', // máy chủ không có loa; AudioContext vẫn chạy, RMS vẫn đúng
  ],
});

const ctx = await browser.newContext({ viewport: { width: 760, height: 860 } });
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

// đèn dịu để thấy rõ mặt (như kiem-a2), và mở khoá tiếng qua đúng cửa window.stage
await page.evaluate(() => window.stage.run('scene.light', { preset: 'toi' }));
const daBatTieng = await page.evaluate(() => window.stage.batTieng());
ghi('mở khoá autoplay (window.stage.batTieng)', daBatTieng === true, `batTieng=${daBatTieng}`);

/* --------------------------------------------- hai nhân vật, hai giọng */

const coSan = await page.evaluate(async () => {
  const r = await window.stage.describe();
  return r.ok ? r.result.actors.map((a) => a.id) : [];
});
in_('==> actor có sẵn:', coSan.join(', ') || '(không có)');

// `owner` là Sếp → giọng NAM theo mặc định mới của spec; `lan`/`gen` → NỮ.
const themOwner = await page.evaluate(() =>
  window.stage.run('actor.spawn', { id: 'owner', name: 'Sếp', at: '1.4, 0, 1.4' }),
);
ghi('actor.spawn owner (giọng nam mặc định)', themOwner.ok === true, themOwner.error ?? '');

const LUOT = themOwner.ok
  ? [
      {
        actor: coSan[0] ?? 'lan',
        text: 'Chào Sếp, em là Gen. Giọng tiếng Việt đã chạy qua bridge rồi ạ.',
        voice: null,
        giong: 'nu',
      },
      {
        actor: 'owner',
        text: 'Giỏi lắm. Nghe rõ từng chữ, nhép miệng khớp với âm luôn.',
        voice: null,
        giong: 'nam',
      },
    ]
  : [
      {
        actor: coSan[0] ?? 'lan',
        text: 'Chào Sếp, em là Gen. Giọng tiếng Việt đã chạy qua bridge rồi ạ.',
        voice: 'nu',
        giong: 'nu',
      },
      {
        actor: coSan[0] ?? 'lan',
        text: 'Giỏi lắm. Nghe rõ từng chữ, nhép miệng khớp với âm luôn.',
        voice: 'nam',
        giong: 'nam',
      },
    ];

/**
 * Đặt máy quay cho ảnh bằng chứng bằng `window.stage.datMay`, KHÔNG dùng
 * `camera.focus`: focus bay dần (lerp) và tự cộng 1,1 m vào điểm nhắm, nên
 * ảnh cận mặt chụp ra lại thành ảnh toàn cảnh (đúng ghi chú ở
 * `world.ts#datMayThu`). Nhân vật đang quay về `cua` (+Z) nên máy đứng phía
 * +Z là chính diện.
 */
async function datMay(actor, kieu) {
  const m = await page.evaluate((a) => window.stage.doXuong(a), actor);
  const [x, , z] = m.neck;
  if (kieu === 'mat') {
    await page.evaluate(
      ({ vt, tam }) => window.stage.datMay(vt, tam),
      { vt: [x, m.neck[1] + 0.03, z + 0.4], tam: [x, m.neck[1] + 0.01, z] },
    );
  } else {
    const cao = m.bbox[1];
    await page.evaluate(
      ({ vt, tam }) => window.stage.datMay(vt, tam),
      { vt: [x + 0.5, cao * 0.78, z + 1.5], tam: [x, cao * 0.48, z] },
    );
  }
  await page.waitForTimeout(500);
}

for (const [i, l] of LUOT.entries()) {
  in_(`\n--- câu ${i + 1}: ${l.actor} / giọng ${l.giong} ---`);
  await page.evaluate(
    ({ a }) => window.stage.run('actor.turnTo', { actor: a, target: 'cua' }),
    { a: l.actor },
  );
  await page.waitForTimeout(600);
  await datMay(l.actor, 'mat');

  const args = { actor: l.actor, text: l.text, interrupt: true };
  if (l.voice) args.voice = l.voice;
  const r = await page.evaluate((x) => window.stage.run('actor.say', x), args);
  ghi(`actor.say ${l.actor}`, r.ok === true, r.ok ? `durationMs=${r.result?.durationMs}` : r.error);
  if (!r.ok) continue;
  const durationMs = r.result.durationMs;

  // CHỤP GIỮA CÂU: ~45% thời lượng là lúc đang phát âm mạnh nhất
  await page.waitForTimeout(Math.round(durationMs * 0.45));
  const tk = await page.evaluate((a) => window.stage.doTieng(a), l.actor);
  await page.screenshot({ path: `${THU_MUC}/01-${l.actor}-${l.giong}-mieng-mo.png` });
  // Cận MẶT: `controls.minDistance = 1.5` (world.ts) chặn không cho máy lại
  // gần hơn 1,5 m, nên cắt thẳng trên khung đã dựng. Mốc cắt là bong bóng chữ
  // — nó được chiếu đúng lên đầu nhân vật, nên luôn tìm ra mặt dù actor đứng đâu.
  const o = await page.evaluate(() => {
    const b = document.querySelector('#bong-bong-lop .bong-bong, #bong-bong-lop > *');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.bottom };
  });
  const W = 760;
  const H = 860;
  const tam = o ?? { x: W / 2, y: H * 0.3 };
  const clip = {
    x: Math.max(0, Math.min(W - 300, tam.x - 150)),
    y: Math.max(0, Math.min(H - 300, tam.y - 20)),
    width: 300,
    height: 300,
  };
  await page.screenshot({ path: `${THU_MUC}/00-${l.actor}-${l.giong}-mat-can.png`, clip });

  await datMay(l.actor, 'toan-than');
  await page.screenshot({ path: `${THU_MUC}/02-${l.actor}-${l.giong}-toan-than.png` });

  ghi(
    `nhép miệng theo âm thật (${l.giong})`,
    tk.soMauDuong > 0,
    `soMau=${tk.soMau} soMauDuong=${tk.soMauDuong} đỉnhRMS=${tk.dinh.toFixed(3)}`,
    tk,
  );

  // tải đúng câu đó từ bridge để đo bằng ffprobe + lưu mẫu
  const mp3 = `${THU_MUC}/giong-${l.giong}.mp3`;
  const q = new URLSearchParams({ text: l.text, voice: l.giong, rate: '0', pitch: '0' });
  const resp = await fetch(`http://127.0.0.1:${CONG_TTS}/tts?${q}`);
  const byte = Buffer.from(await resp.arrayBuffer());
  writeFileSync(mp3, byte);
  const daiMp3 = doMp3(mp3);
  ghi(
    `mp3 mẫu ${mp3}`,
    byte.length > 10 * 1024 && byte.length < 300 * 1024 && daiMp3 !== null,
    `${(byte.length / 1024).toFixed(1)} KB · ffprobe ${daiMp3} ms`,
  );

  const uoc = uocTheoChu(l.text);
  ghi(
    `durationMs là thời lượng AUDIO thật (${l.giong})`,
    daiMp3 !== null && Math.abs(durationMs - daiMp3) <= 200 && durationMs !== uoc,
    `say=${durationMs} ms · mp3=${daiMp3} ms · ước theo chữ=${uoc} ms`,
  );

  nhatKy.cau.push({
    actor: l.actor,
    giong: l.giong,
    text: l.text,
    durationMsSay: durationMs,
    durationMsMp3: daiMp3,
    uocTheoChu: uoc,
    mp3KB: +(byte.length / 1024).toFixed(1),
    rms: tk,
  });

  await page.evaluate(
    ({ a }) => window.stage.run('actor.stop', { actor: a }),
    { a: l.actor },
  );
  await page.waitForTimeout(400);
}

/* --------------------------------------------- hai giọng phải KHÁC nhau */

{
  const a = nhatKy.cau[0];
  const b = nhatKy.cau[1];
  ghi(
    'hai giọng là hai file khác nhau',
    !!a && !!b && a.mp3KB !== b.mp3KB,
    a && b ? `nữ ${a.mp3KB} KB vs nam ${b.mp3KB} KB` : 'thiếu câu',
  );
}

ghi('0 lỗi console', loiConsole.length === 0, loiConsole.slice(0, 5).join(' | '));

nhatKy.loiConsole = loiConsole;
nhatKy.tongKet = { soBuoc, soOk, thatBai };
writeFileSync(`${THU_MUC}/nhat-ky-kiem-b2.json`, JSON.stringify(nhatKy, null, 2) + '\n');

in_(`\n==> ${soOk}/${soBuoc} bước đạt. Nhật ký: ${THU_MUC}/nhat-ky-kiem-b2.json`);
if (thatBai.length) in_('!! Chưa đạt:\n   - ' + thatBai.join('\n   - '));

await browser.close();
server?.kill('SIGTERM');
if (daMoBridge) bridge?.kill('SIGTERM');
process.exit(thatBai.length ? 1 : 0);
