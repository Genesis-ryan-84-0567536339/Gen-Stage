/**
 * kiem-nao.mjs — BẰNG CHỨNG DRIVER NÃO (#21): Sếp gõ trong trình duyệt →
 * `scripts/nao-agy.mjs` nghe → agy THẬT diễn → Gen nói. Không ai chạm terminal.
 *
 * Chạy (**một lần** — xem cờ khoá `docs/nao/.da-chay`):
 *   node scripts/kiem-nao.mjs           # trọn bộ
 *   node scripts/kiem-nao.mjs --lai     # xoá cờ khoá rồi chạy lại
 *
 * Dựng thật, không giả lập chỗ nào:
 *   bridge (ws + tts + MCP HTTP)  ← cổng RIÊNG 8797/8798/8799, KHÔNG đụng
 *                                   bridge 8787 Boss đang dùng
 *   `agy mcp add gen-stage-thu`   ← bản MCP tạm trỏ 8799, XOÁ ở cuối script
 *   Playwright + Chrome hệ thống  → app thật (`?bridge=1`)
 *   scripts/nao-agy.mjs           → driver thật, agy thật trong tmux
 *                                   session riêng `gen-stage-nao-thu`
 *   Sếp gõ 2 câu vào ô chat       → đo độ trễ từng mốc
 *
 * Ra trong `docs/nao/`:
 *   01-phan-xa.png          Gen vừa quay sang + đang nghĩ (≤300 ms sau khi gõ)
 *   02-gen-tra-loi.png      Gen đang nói (bong bóng chữ)
 *   03-viec-thu-hai.png     lượt "dựng connector Baserow"
 *   04-toan-canh-1440.png   cả sân khấu + ô chat
 *   05-mobile-390.png       ô chat trên màn hẹp
 *   nao.log                 nhật ký driver (có đủ mốc thời gian)
 *   agy-khung.txt           khung tmux của agy (thấy tool call MCP)
 *   nhat-ky-kiem-nao.json   SỐ: độ trễ từng mốc, sự kiện, lỗi console
 */
import { chromium } from 'playwright';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const THU_MUC = 'docs/nao';
mkdirSync(THU_MUC, { recursive: true });

const argv = process.argv.slice(2);
const urlArg = argv.find((a) => a.startsWith('http'));

/* ------------------------------------------------- cờ khoá chạy một lần */

const CO_KHOA = `${THU_MUC}/.da-chay`;
if (argv.includes('--lai')) {
  if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
} else if (existsSync(CO_KHOA)) {
  console.error(
    `\n⛔ ${CO_KHOA} đã tồn tại — kiểm driver não chỉ chạy MỘT LẦN sau khi code xong.\n` +
      `   Kết quả lượt trước: ${THU_MUC}/nhat-ky-kiem-nao.json + ảnh trong ${THU_MUC}/.\n` +
      '   Thật sự cần chạy lại: node scripts/kiem-nao.mjs --lai\n',
  );
  process.exit(2);
}
writeFileSync(CO_KHOA, new Date().toISOString() + '\n');

/* ------------------------------------------------------------- cổng riêng */

const CONG_WS = Number(process.env.GEN_STAGE_PORT ?? 8797);
const CONG_TTS = Number(process.env.GEN_STAGE_TTS_PORT ?? 8798);
const CONG_MCP = Number(process.env.GEN_STAGE_MCP_PORT ?? 8799);
/** Tên server MCP TẠM trong cấu hình agy — xoá ở cuối, không đụng "gen-stage". */
const MCP_THU = 'gen-stage-thu';
/** Session tmux TẠM — không đụng "gen-stage-nao" của Boss. */
const TMUX_THU = 'gen-stage-nao-thu';

/**
 * Token riêng cho lượt đo — **khoá cửa bridge thử**.
 *
 * Máy Boss hay có sẵn một tab Gen-Stage mở từ lượt trước; nó cứ 1,5 s lại
 * giành vai `role=stage` của bridge 8797, đẩy trang đang đo ra ("sân khấu mới
 * kết nối — đóng bản cũ" 115 lần trong một lượt) và nuốt mất `actor.sayStart`.
 * Bật token thì chỉ trang + driver + MCP của script này vào được.
 */
const TOKEN = randomBytes(12).toString('hex');

const MOI_TRUONG = {
  ...process.env,
  GEN_STAGE_PORT: String(CONG_WS),
  GEN_STAGE_TTS_PORT: String(CONG_TTS),
  GEN_STAGE_MCP_PORT: String(CONG_MCP),
  GEN_STAGE_TOKEN: TOKEN,
};

const in_ = (...x) => console.log(...x);
const loiConsole = [];
const thatBai = [];
const nhatKy = {
  chay: new Date().toISOString(),
  cong: { ws: CONG_WS, tts: CONG_TTS, mcp: CONG_MCP },
  mcpThu: MCP_THU,
  buoc: [],
  luot: [],
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
const agyBin = process.env.GEN_STAGE_AGY ?? 'agy';

/* ------------------------------------------------- MCP tạm cho agy */

let daThemMcp = false;
function themMcpThu() {
  execFileSync(
    agyBin,
    ['mcp', 'add', '--type', 'http', '--header', `Authorization: Bearer ${TOKEN}`, MCP_THU, `http://127.0.0.1:${CONG_MCP}/mcp`],
    { encoding: 'utf8' },
  );
  daThemMcp = true;
}
function boMcpThu() {
  if (!daThemMcp) return;
  try {
    execFileSync(agyBin, ['mcp', 'remove', MCP_THU], { encoding: 'utf8' });
    daThemMcp = false;
  } catch (e) {
    in_('   !! không xoá được MCP tạm:', e.message);
  }
}

/**
 * Giải phóng 3 cổng riêng trước khi bật.
 *
 * Lượt chạy trước bị ngắt giữa đường để lại bridge treo → `EADDRINUSE` và
 * script sau chết ở chỗ khó hiểu. Chỉ giết tiến trình đang NGHE đúng cổng của
 * mình (8797–8799), không bao giờ chạm 8787–8789 của Boss.
 */
function giaiPhongCong() {
  /**
   * Lượt chạy trước bị ngắt để lại **Chrome của Playwright** còn sống: trang
   * cũ vẫn trỏ `bridgePort=8797` nên cứ 1,5 s lại giành vai `role=stage`, đẩy
   * trang mới ra ("sân khấu mới kết nối — đóng bản cũ" lặp vô hạn) và lượt đo
   * treo ở bước đầu. Chỉ giết Chrome mang đúng cờ của script bằng chứng
   * (`--use-angle=swiftshader`) và `vite preview --strictPort` — không chạm
   * Chrome/Firefox Boss đang mở, cũng không chạm `vite --host --port 5173`.
   */
  for (const loc of ['--use-angle=swiftshader', 'vite preview']) {
    try {
      const ra = execFileSync('ps', ['-eo', 'pid,cmd'], { encoding: 'utf8' });
      for (const d of ra.split('\n')) {
        if (!d.includes(loc) || d.includes('--port 5173')) continue;
        const pid = Number(d.trim().split(/\s+/)[0]);
        if (pid && pid !== process.pid) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            /* đã chết */
          }
        }
      }
    } catch {
      /* không có ps thì bỏ qua */
    }
  }
  // lượt trước bị ngắt có thể để lại session tmux + agy đang nghĩ dở
  try {
    execFileSync('tmux', ['kill-session', '-t', TMUX_THU], { stdio: 'ignore' });
    in_(`   (dọn session tmux cũ ${TMUX_THU})`);
  } catch {
    /* chưa có */
  }
  for (const p of [CONG_WS, CONG_TTS, CONG_MCP]) {
    try {
      const ra = execFileSync('ss', ['-ltnp'], { encoding: 'utf8' });
      const dong = ra.split('\n').find((d) => d.includes(`:${p} `));
      const pid = dong?.match(/pid=(\d+)/)?.[1];
      if (pid) {
        process.kill(Number(pid), 'SIGKILL');
        in_(`   (giải phóng cổng ${p}: kill ${pid})`);
      }
    } catch {
      /* không ai giữ cổng */
    }
  }
}

/* -------------------------------------------------------- bridge + vite */

let bridge = null;
async function moBridge() {
  bridge = spawn('npx', ['tsx', 'bridge/server.ts'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: MOI_TRUONG,
  });
  const dong = [];
  const doc = (d) => {
    dong.push(String(d));
    process.stdout.write('   [bridge] ' + d);
  };
  bridge.stdout.on('data', doc);
  bridge.stderr.on('data', doc);
  for (let i = 0; i < 60; i++) {
    if ((await khoe(CONG_TTS)) && (await khoe(CONG_MCP))) return dong;
    await nghi(500);
  }
  throw new Error(`bridge không lên (ws ${CONG_WS} / tts ${CONG_TTS} / mcp ${CONG_MCP})`);
}

async function khoe(cong) {
  try {
    return (await fetch(`http://127.0.0.1:${cong}/khoe`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })).ok;
  } catch {
    return false;
  }
}

let server = null;
async function moServer() {
  if (urlArg) return urlArg;
  const port = 4880 + ((Date.now() / 7) % 150 | 0);
  server = spawn('npx', ['vite', 'preview', '--port', String(port)], {
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

let driver = null;
function dongHet(ma) {
  try {
    driver?.kill('SIGTERM');
  } catch {
    /* đã chết */
  }
  try {
    execFileSync('tmux', ['kill-session', '-t', TMUX_THU], { stdio: 'ignore' });
  } catch {
    /* chưa có */
  }
  boMcpThu();
  server?.kill('SIGTERM');
  bridge?.kill('SIGTERM');
  process.exit(ma);
}
for (const t of ['SIGINT', 'SIGTERM']) process.on(t, () => dongHet(130));

/* ---------------------------------------------------------------- chạy */

giaiPhongCong();
const dongBridge = await moBridge();
ghi(
  'bridge bật cả ws + tts + mcp (cổng riêng)',
  dongBridge.some((d) => d.includes('[mcp ]')),
  `mcp /khoe: ${JSON.stringify(
    await (
      await fetch(`http://127.0.0.1:${CONG_MCP}/khoe`, { headers: { Authorization: `Bearer ${TOKEN}` } })
    ).json(),
  )}`,
);

themMcpThu();
ghi('đăng ký MCP tạm cho agy', daThemMcp, `${MCP_THU} → http://127.0.0.1:${CONG_MCP}/mcp (xoá ở cuối)`);

const goc = await moServer();
const url = `${goc.replace(/\/$/, '')}/?bridge=1&bridgePort=${CONG_WS}&ttsPort=${CONG_TTS}&bridgeToken=${TOKEN}`;
in_('==> URL:', url);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    // máy Boss đang chạy sẵn IDE + agy + bridge: Chrome swiftshader bị kernel
    // giết giữa chừng vài lượt đo. Ba cờ này cắt phần ngốn RAM không cần cho
    // bằng chứng (/dev/shm nhỏ, tiến trình phụ, tiện ích).
    '--disable-dev-shm-usage',
    '--renderer-process-limit=2',
    '--disable-extensions',
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') loiConsole.push(`[console] ${m.text()}`);
});
page.on('pageerror', (e) => loiConsole.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) =>
  loiConsole.push(`[requestfailed] ${r.url()} — ${r.failure()?.errorText}`),
);

await page.goto(url, { waitUntil: 'load', timeout: 240000 });
try {
  await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 240000 });
} catch (e) {
  // sân khấu không sẵn sàng thì in ngay lỗi console ra, đừng để chết im lặng
  in_('!! sân khấu không sẵn sàng:', e.message);
  in_('!! lỗi console:', loiConsole.slice(0, 10).join(' | ') || '(không có)');
  dongHet(1);
}
await page.evaluate(() => {
  window.__nao = [];
  window.stage.on('*', (e) => window.__nao.push({ t: e.t, event: e.event, data: e.data }));
});
await page.evaluate(() => window.stage.batTieng());
await page.evaluate(() => window.stage.run('scene.light', { preset: 'am' }));
const daNoi = await page.evaluate(
  () =>
    new Promise((r) =>
      setTimeout(() => r(window.__nao.some((e) => e.event === 'bridge.connected')), 1500),
    ),
);
ghi('trình duyệt nối bridge (?bridge=1)', daNoi === true, `cổng ws ${CONG_WS}`);

/* ----------------------------------------------------- driver não thật */

const dongDriver = [];
driver = spawn('node', ['scripts/nao-agy.mjs'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...MOI_TRUONG,
    GEN_STAGE_AGY_MCP: MCP_THU,
    GEN_STAGE_NAO_TMUX: TMUX_THU,
  },
});
const docDriver = (d) => {
  dongDriver.push(String(d));
  process.stdout.write('   [nao] ' + d);
};
driver.stdout.on('data', docDriver);
driver.stderr.on('data', docDriver);

// chờ driver nối bridge + agy ấm trong tmux (lần đầu phải qua hộp trust)
let daAm = false;
for (let i = 0; i < 300; i++) {
  const t = dongDriver.join('');
  if (/đã ấm/.test(t)) {
    daAm = true;
    break;
  }
  if (/không nối được bridge|không bật được tmux/.test(t)) break;
  await nghi(1000);
}
ghi(
  'driver nối bridge + agy ấm trong tmux',
  daAm,
  (dongDriver.join('').match(/tmux "[^"]+" đã ấm \([^)]+\)/) ?? ['không thấy'])[0],
);
ghi(
  'driver đang nghe user.text (không cần Boss chạm terminal)',
  /đang nghe user\.text/.test(dongDriver.join('')),
  '',
);

/* ----------------------------------------------------- tiện ích đo mốc */

async function choSuKien(loc, tu, hanMs) {
  const het = Date.now() + hanMs;
  while (Date.now() < het) {
    const co = await page.evaluate(
      ({ loc, tu }) => {
        const ds = window.__nao.filter((e) => e.t >= tu);
        return (
          ds.find((e) =>
            loc.ten ? e.event === loc.ten && (!loc.actor || e.data?.actor === loc.actor) : false,
          ) ?? null
        );
      },
      { loc, tu },
    );
    if (co) return co;
    await nghi(60);
  }
  return null;
}

/**
 * Đặt máy quay thấy rõ Gen.
 *
 * `camera.focus` căn giữa cả khung, mà bảng lệnh chiếm 400 px bên phải nên Gen
 * rơi vào mép. Dùng đúng cách của `kiem-b3.mjs`: đọc xương cổ rồi đặt máy tay.
 */
async function datMayGen(kieu) {
  const m = await page.evaluate(() => window.stage.doXuong('gen'));
  if (!m?.neck) return;
  const [x, , z] = m.neck;
  const cao = m.bbox?.[1] ?? 1.2;
  if (kieu === 'gan') {
    await page.evaluate(
      ({ vt, tam }) => window.stage.datMay(vt, tam),
      { vt: [x + 0.25, m.neck[1] + 0.1, z + 1.5], tam: [x, cao * 0.55, z] },
    );
  } else {
    await page.evaluate(
      ({ vt, tam }) => window.stage.datMay(vt, tam),
      { vt: [x + 1.2, cao * 1.5, z + 3.4], tam: [x, cao * 0.6, z] },
    );
  }
  await nghi(400);
}

/** Mốc "Gen phản ứng": sự kiện đầu tiên của gen do driver bắn (không phải user.text). */
async function choPhanXa(tu, hanMs = 10000) {
  const het = Date.now() + hanMs;
  while (Date.now() < het) {
    const co = await page.evaluate(
      (tu) =>
        window.__nao.find(
          (e) => e.t >= tu && e.event !== 'user.text' && e.data?.actor === 'gen',
        ) ?? null,
      tu,
    );
    if (co) return co;
    await nghi(40);
  }
  return null;
}

async function moiLuot(so, cau, { anhPhanXa = false } = {}) {
  in_(`\n--- lượt ${so}: Sếp gõ "${cau}" ---`);
  await page.fill('#o-chat-nhap', cau);
  const t0 = Date.now();
  await page.press('#o-chat-nhap', 'Enter');

  const ut = await choSuKien({ ten: 'user.text' }, t0 - 50, 20000);
  const px = await choPhanXa(t0 - 50, 15000);
  if (anhPhanXa && px) {
    await datMayGen('gan');
    await page.screenshot({ path: `${THU_MUC}/01-phan-xa.png` });
  }
  const batDauNoi = await choSuKien({ ten: 'actor.sayStart', actor: 'gen' }, t0 - 50, 120000);
  // ảnh phải THẤY Gen: mặc định máy quay nhìn owner, bong bóng của Gen rơi ra
  // ngoài khung. Lia về Gen rồi mới chụp.
  if (batDauNoi) await datMayGen(so === 1 ? 'gan' : 'xa');
  if (batDauNoi) await page.screenshot({ path: `${THU_MUC}/0${so + 1}-${so === 1 ? 'gen-tra-loi' : 'viec-thu-hai'}.png` });
  const xongNoi = await choSuKien({ ten: 'actor.sayDone', actor: 'gen' }, t0 - 50, 60000);

  const lt = {
    luot: so,
    cau,
    msUserText: ut ? ut.t - t0 : null,
    msPhanXa: px ? px.t - t0 : null,
    suKienPhanXa: px?.event ?? null,
    msBatDauNoi: batDauNoi ? batDauNoi.t - t0 : null,
    cauTraLoi: batDauNoi?.data?.text ?? null,
    msXongNoi: xongNoi ? xongNoi.t - t0 : null,
  };
  nhatKy.luot.push(lt);
  ghi(
    `lượt ${so}: Sếp gõ → user.text`,
    ut !== null,
    ut ? `${lt.msUserText} ms · ${JSON.stringify(ut.data)}` : 'không thấy',
  );
  ghi(
    `lượt ${so}: phản xạ của Gen ≤300 ms`,
    px !== null && lt.msPhanXa !== null && lt.msPhanXa <= 300,
    `${lt.msPhanXa} ms (${lt.suKienPhanXa})`,
  );
  ghi(
    `lượt ${so}: Gen BẮT ĐẦU NÓI (agy thật qua MCP)`,
    batDauNoi !== null,
    batDauNoi ? `${lt.msBatDauNoi} ms · "${String(lt.cauTraLoi).slice(0, 70)}"` : 'không thấy',
  );
  return lt;
}

const lt1 = await moiLuot(1, 'Gen ơi, chào Sếp đi', { anhPhanXa: true });
await nghi(1500);
const lt2 = await moiLuot(2, 'dựng connector Baserow');

/* ------------------------------------------------- hai câu sát nhau → 1 lượt */

/**
 * Gộp câu phải đo bằng hai câu CÁCH NHAU 300 ms thật.
 *
 * Gõ qua `page.fill` + `page.press` mất 200–400 ms mỗi câu, cộng vào là quá
 * cửa sổ 800 ms → phép đo nói dối. Nên bắn thẳng hai `actor.say` lên `owner`
 * **trong trang** (đúng đường của Space và ô chat, vẫn bắn `user.text`), hẹn
 * giờ bằng đồng hồ của trang.
 *
 * Câu thứ hai phải có `interrupt: true`: `actor.say` **chiếm** actor, nên nếu
 * không cắt thì câu hai nằm chờ owner nói xong (2–3 s) rồi `user.text` mới
 * bắn — quá cửa sổ gộp. Đúng cảnh thật: Sếp gõ tiếp khi mình còn đang nói.
 */
in_('\n--- lượt 3: hai câu cách nhau 300 ms trong trang (kiểm gộp câu) ---');
await nghi(2000);
const soLuotTruoc = (dongDriver.join('').match(/SẾP: «/g) ?? []).length;
const t3 = Date.now();
await page.evaluate(async () => {
  void window.stage.run('actor.say', { actor: 'owner', text: 'Gen ơi' });
  await new Promise((r) => setTimeout(r, 300));
  void window.stage.run('actor.say', {
    actor: 'owner',
    text: 'cất module vào kệ đi',
    interrupt: true,
  });
});
// lượt gộp có thể còn nằm trong hàng đợi (lượt trước chưa xong) — chờ tới khi
// driver thật sự nhận nó, đừng chờ cứng vài giây rồi kết luận
for (let i = 0; i < 180; i++) {
  if (/SẾP: «Gen ơi\. cất module/.test(dongDriver.join(''))) break;
  await nghi(500);
}
const noi3 = await choSuKien({ ten: 'actor.sayStart', actor: 'gen' }, t3 + 1000, 120000);
const themLuot = (dongDriver.join('').match(/SẾP: «/g) ?? []).length - soLuotTruoc;
const cauGop = (dongDriver.join('').match(/SẾP: «Gen ơi\. cất module[^»]*»/) ?? [])[0] ?? null;
ghi(
  'hai câu cách 300 ms gộp thành MỘT lượt não',
  themLuot === 1 && cauGop !== null,
  `thêm ${themLuot} lượt · câu gộp: ${cauGop ?? 'không thấy'}`,
);
nhatKy.luot.push({
  luot: 3,
  cau: 'Gen ơi | cất module vào kệ đi (cách 300 ms)',
  themLuot,
  cauGop,
  msBatDauNoi: noi3 ? noi3.t - t3 : null,
  cauTraLoi: noi3?.data?.text ?? null,
});

/* --------------------------------------------- không tự nghe lời mình */

const tuNghe = await page.evaluate(
  () => window.__nao.filter((e) => e.event === 'user.text' && e.data?.actor === 'gen').length,
);
ghi('không có user.text nào do gen tạo (chống lặp)', tuNghe === 0, `${tuNghe} cái`);

/* ------------------------------------------------------- ảnh bố cục + mobile */

await page.evaluate(() => window.stage.run('camera.preset', { name: 'toan-canh' }));
await nghi(1200);
await page.screenshot({ path: `${THU_MUC}/04-toan-canh-1440.png` });
await page.setViewportSize({ width: 390, height: 844 });
await nghi(900);
await page.screenshot({ path: `${THU_MUC}/05-mobile-390.png` });
await page.setViewportSize({ width: 1440, height: 900 });

/* ------------------------------------------------------------- tổng kết */

let khungAgy = '';
try {
  khungAgy = execFileSync('tmux', ['capture-pane', '-pt', TMUX_THU, '-S', '-200'], {
    encoding: 'utf8',
  });
} catch {
  khungAgy = '(không đọc được khung tmux)';
}
writeFileSync(`${THU_MUC}/agy-khung.txt`, khungAgy);
writeFileSync(`${THU_MUC}/nao.log`, dongDriver.join(''));

const coToolCall = /actor_say|gen-stage-thu/.test(khungAgy);
ghi('khung tmux cho thấy agy gọi tool MCP gen-stage', coToolCall, '');
ghi('0 lỗi console', loiConsole.length === 0, loiConsole.slice(0, 5).join(' | '));

const treTraLoi = [lt1, lt2].map((l) => l.msBatDauNoi).filter((x) => typeof x === 'number');
nhatKy.doTre = {
  phanXaMs: nhatKy.luot.map((l) => l.msPhanXa ?? null),
  batDauNoiMs: nhatKy.luot.map((l) => l.msBatDauNoi ?? null),
  trungBinhBatDauNoiMs: treTraLoi.length
    ? Math.round(treTraLoi.reduce((a, b) => a + b, 0) / treTraLoi.length)
    : null,
};
ghi(
  'câu trả lời đầu ≤8 s (mục tiêu Sếp đặt)',
  treTraLoi.length > 0 && Math.max(...treTraLoi) <= 8000,
  `${treTraLoi.join(' ms · ')} ms`,
);

nhatKy.loiConsole = loiConsole;
nhatKy.suKien = await page.evaluate(() => window.__nao.map((e) => ({ t: e.t, event: e.event, data: e.data })));
nhatKy.tongKet = { soBuoc, soOk, thatBai };
writeFileSync(`${THU_MUC}/nhat-ky-kiem-nao.json`, JSON.stringify(nhatKy, null, 2) + '\n');

in_(`\n==> ${soOk}/${soBuoc} bước đạt. Nhật ký: ${THU_MUC}/nhat-ky-kiem-nao.json`);
in_(`==> độ trễ bắt đầu nói: ${JSON.stringify(nhatKy.doTre)}`);
if (thatBai.length) in_('!! Chưa đạt:\n   - ' + thatBai.join('\n   - '));

await browser.close();
dongHet(thatBai.length ? 1 : 0);
