/**
 * kiem-b3.mjs — BẰNG CHỨNG B3 (#21): vòng kín Owner gõ → não qua MCP → Gen diễn + nói.
 *
 * Chạy (**một lần** — xem cờ khoá `docs/b3/.da-chay`):
 *   node scripts/kiem-b3.mjs           # trọn bộ
 *   node scripts/kiem-b3.mjs --lai     # xoá cờ khoá rồi chạy lại
 *
 * Dựng thật, không giả lập chỗ nào:
 *   bridge (ws + tts + MCP HTTP)  ← cổng RIÊNG 8797/8798/8799 để KHÔNG đụng
 *                                    bridge Boss có thể đang chạy ở 8787
 *   Playwright + Chrome hệ thống  → app thật (`?bridge=1`, swiftshader, autoplay)
 *   scripts/nao-demo.mjs          → não rule-based nối MCP **stdio thật**
 *   Owner gõ 2 câu vào ô chat     → sự kiện `user.text` → não chọn lệnh → Gen diễn
 *
 * Ra trong `docs/b3/`:
 *   01-gen-tra-loi.png        Gen đang nói (bong bóng chữ + miệng mở)
 *   02-hologram-chay.png      màn hình hologram đang stream code
 *   03-module-tren-tay.png    module đã kết tinh, trên tay Gen
 *   04-toan-canh-1440.png     cả sân khấu + ô chat dưới màn hình
 *   05-mobile-390.png         ô chat trên màn hẹp
 *   nao-demo-log.json         tool call của não (do chính nao-demo ghi)
 *   nhat-ky-kiem-b3.json      SỐ: sự kiện user.text, tool call, say/emote/module,
 *                             durationMs giọng, lỗi console
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const THU_MUC = 'docs/b3';
mkdirSync(THU_MUC, { recursive: true });

const argv = process.argv.slice(2);
const urlArg = argv.find((a) => a.startsWith('http'));

/* ------------------------------------------------- cờ khoá chạy một lần */

const CO_KHOA = `${THU_MUC}/.da-chay`;
if (argv.includes('--lai')) {
  if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
} else if (existsSync(CO_KHOA)) {
  console.error(
    `\n⛔ ${CO_KHOA} đã tồn tại — kiểm B3 chỉ chạy MỘT LẦN sau khi code xong.\n` +
      `   Kết quả lượt trước: ${THU_MUC}/nhat-ky-kiem-b3.json + ảnh trong ${THU_MUC}/.\n` +
      '   Thật sự cần chạy lại: node scripts/kiem-b3.mjs --lai\n',
  );
  process.exit(2);
}
writeFileSync(CO_KHOA, new Date().toISOString() + '\n');

/* ------------------------------------------------------------- tiện ích */

/**
 * Cổng RIÊNG cho bằng chứng.
 *
 * Boss (hoặc một phiên khác) thường đã có `pnpm bridge` chạy ở 8787/8788 —
 * bridge đó điều khiển sân khấu của Boss, nên script này **không được** dùng
 * chung lẫn giết nó. Dùng bộ cổng khác, và nói cho trình duyệt biết bằng
 * `?bridgePort=` + `?ttsPort=`.
 */
const CONG_WS = Number(process.env.GEN_STAGE_PORT ?? 8797);
const CONG_TTS = Number(process.env.GEN_STAGE_TTS_PORT ?? 8798);
const CONG_MCP = Number(process.env.GEN_STAGE_MCP_PORT ?? 8799);
const MOI_TRUONG = {
  ...process.env,
  GEN_STAGE_PORT: String(CONG_WS),
  GEN_STAGE_TTS_PORT: String(CONG_TTS),
  GEN_STAGE_MCP_PORT: String(CONG_MCP),
};

const in_ = (...x) => console.log(...x);
const loiConsole = [];
const thatBai = [];
const nhatKy = {
  chay: new Date().toISOString(),
  cong: { ws: CONG_WS, tts: CONG_TTS, mcp: CONG_MCP },
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
  for (let i = 0; i < 60; i++) {
    if ((await khoe(CONG_TTS)) && (await khoe(CONG_MCP))) return dong;
    await nghi(500);
  }
  throw new Error(`bridge không lên (ws ${CONG_WS} / tts ${CONG_TTS} / mcp ${CONG_MCP})`);
}

async function khoe(cong) {
  try {
    const r = await fetch(`http://127.0.0.1:${cong}/khoe`);
    return r.ok;
  } catch {
    return false;
  }
}

let server = null;
async function moServer() {
  if (urlArg) return urlArg;
  const port = 4860 + ((Date.now() / 7) % 200 | 0);
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

function dongHet(ma) {
  try {
    nao?.kill('SIGTERM');
  } catch {}
  server?.kill('SIGTERM');
  bridge?.kill('SIGTERM');
  process.exit(ma);
}

/* ---------------------------------------------------------------- chạy */

const dongBridge = await moBridge();
ghi(
  'bridge bật cả ws + tts + mcp',
  dongBridge.some((d) => d.includes('[mcp ]')),
  `mcp /khoe: ${JSON.stringify(await (await fetch(`http://127.0.0.1:${CONG_MCP}/khoe`)).json())}`,
);

const goc = await moServer();
const url = `${goc.replace(/\/$/, '')}/?bridge=1&bridgePort=${CONG_WS}&ttsPort=${CONG_TTS}`;
in_('==> URL:', url);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
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

await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
in_('==> sân khấu sẵn sàng');

// gom MỌI sự kiện sân khấu để đối chiếu với tool call của não
await page.evaluate(() => {
  window.__b3 = [];
  window.stage.on('*', (e) => window.__b3.push({ t: e.t, event: e.event, data: e.data }));
});
await page.evaluate(() => window.stage.batTieng());
await page.evaluate(() => window.stage.run('scene.light', { preset: 'am' }));

const noi = await page.evaluate(
  () => new Promise((r) => setTimeout(() => r(window.__b3.some((e) => e.event === 'bridge.connected')), 1500)),
);
ghi('trình duyệt nối bridge (?bridge=1)', noi === true, `cổng ws ${CONG_WS}`);

/* ----------------------------------------------- ô chat có thật trên màn hình */

const coOChat = await page.evaluate(() => {
  const el = document.getElementById('o-chat');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { rong: Math.round(r.width), cao: Math.round(r.height), duoi: Math.round(innerHeight - r.bottom) };
});
ghi('ô chat hiện dưới màn hình', coOChat !== null && coOChat.cao > 20, JSON.stringify(coOChat), coOChat);

/* --------------------------------------------------- não thật qua MCP stdio */

let nao = null;
const dongNao = [];
const DUONG_LOG_NAO = `${THU_MUC}/nao-demo-log.json`;
nao = spawn(
  'node',
  ['scripts/nao-demo.mjs', '--luot', '2', '--ghi', DUONG_LOG_NAO, '--cho', '25000', '--han', '240000'],
  { stdio: ['ignore', 'pipe', 'pipe'], env: MOI_TRUONG },
);
nao.stdout.on('data', (d) => {
  const s = String(d);
  dongNao.push(s);
  process.stdout.write('   ' + s);
});
nao.stderr.on('data', (d) => {
  dongNao.push(String(d));
  process.stdout.write('   ' + String(d));
});

// chờ não nối MCP và bắt đầu nghe (nó in "nghe từ seq")
for (let i = 0; i < 80; i++) {
  if (dongNao.join('').includes('nghe từ seq')) break;
  await nghi(500);
}
const naoDaNoi = dongNao.join('').includes('nghe từ seq');
ghi(
  'não nối MCP stdio và bắt đầu nghe stage_events',
  naoDaNoi,
  (dongNao.join('').match(/đã nối MCP stdio · \d+ tool/) ?? [''])[0],
);

/* ----------------------------------------------------- tiện ích chờ sự kiện */

/** Chờ tới khi có sự kiện tên `ten` xuất hiện sau mốc `tu`. */
async function choSuKien(ten, tu, hanMs = 60000) {
  const het = Date.now() + hanMs;
  while (Date.now() < het) {
    const co = await page.evaluate(
      ({ ten, tu }) => window.__b3.find((e) => e.event === ten && e.t >= tu) ?? null,
      { ten, tu },
    );
    if (co) return co;
    await nghi(250);
  }
  return null;
}

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

/* ------------------------------------------------ LƯỢT 1: Owner chào Gen */

in_('\n--- lượt 1: Sếp gõ "Chào Gen" vào ô chat ---');
const moc1 = Date.now();
await page.fill('#o-chat-nhap', 'Chào Gen');
await page.press('#o-chat-nhap', 'Enter');

const ut1 = await choSuKien('user.text', moc1, 20000);
ghi('Sếp gõ → sự kiện user.text', ut1 !== null, ut1 ? JSON.stringify(ut1.data) : 'không thấy', ut1);

const emote1 = await choSuKien('actor.emoteDone', moc1, 60000);
const say1 = await choSuKien('actor.sayDone', moc1 + 1, 60000);
// chụp lúc Gen đang nói: bắt đầu nói là có bong bóng chữ
await datMayGen('gan');
await page.screenshot({ path: `${THU_MUC}/01-gen-tra-loi.png` });
const bong1 = await page.evaluate(() => {
  const el = document.querySelector('#bong-bong-lop .bong-bong, #bong-bong-lop > *');
  return el ? el.textContent.trim().slice(0, 120) : null;
});
ghi(
  'Gen diễn + trả lời (emote + say)',
  emote1 !== null && say1 !== null,
  `emote=${emote1?.data?.emote ?? '-'} · say="${(say1?.data?.text ?? '').slice(0, 60)}"`,
);
nhatKy.luot.push({
  luot: 1,
  boss: ut1?.data ?? null,
  emote: emote1?.data ?? null,
  say: say1?.data ?? null,
  bongBong: bong1,
});

/* -------------------------------- LƯỢT 2: Owner nhờ dựng connector Baserow */

in_('\n--- lượt 2: Sếp gõ "Gen, dựng connector Baserow" ---');
await nghi(1200);
const moc2 = Date.now();
await page.fill('#o-chat-nhap', 'Gen, dựng connector Baserow');
await page.press('#o-chat-nhap', 'Enter');

const ut2 = await choSuKien('user.text', moc2, 20000);
ghi('câu thứ hai → user.text', ut2 !== null, ut2 ? JSON.stringify(ut2.data) : 'không thấy', ut2);

// hologram đang chạy: chụp ngay giữa lúc stream (trước `screen.streamDone`)
let anhHologram = false;
for (let i = 0; i < 160; i++) {
  const dangChay = await page.evaluate(async () => {
    const r = await window.stage.describe();
    return r.ok ? r.result.screens.some((s) => s.streaming) : false;
  });
  if (dangChay) {
    await datMayGen('xa');
    await page.screenshot({ path: `${THU_MUC}/02-hologram-chay.png` });
    anhHologram = true;
    break;
  }
  await nghi(250);
}
const stream = await choSuKien('screen.streamDone', moc2, 90000);
ghi(
  'màn hình hologram chạy code do não đẩy',
  anhHologram && stream !== null,
  `streamDone=${stream ? 'có' : 'không'}`,
);

const built = await choSuKien('module.built', moc2, 120000);
await nghi(700);
await datMayGen('gan');
await page.screenshot({ path: `${THU_MUC}/03-module-tren-tay.png` });
const cam = await page.evaluate(async () => {
  const r = await window.stage.describe();
  const g = r.ok ? r.result.actors.find((a) => a.id === 'gen') : null;
  return g ? { holding: g.holding, state: g.state, mood: g.mood } : null;
});
ghi(
  'module kết tinh và nằm trên tay Gen',
  built !== null && cam?.holding !== null && cam?.holding !== undefined,
  `module.built=${JSON.stringify(built?.data ?? null)} · holding=${cam?.holding ?? 'null'}`,
  cam,
);

const say2 = await choSuKien('actor.sayDone', (built?.t ?? moc2) + 1, 90000);
ghi(
  'Gen báo cáo xong bằng giọng Việt',
  say2 !== null,
  `say="${(say2?.data?.text ?? '').slice(0, 70)}"`,
);
nhatKy.luot.push({
  luot: 2,
  boss: ut2?.data ?? null,
  streamDone: stream?.data ?? null,
  moduleBuilt: built?.data ?? null,
  gen: cam,
  say: say2?.data ?? null,
});

/* ------------------------------------------------------- ảnh bố cục + mobile */

await page.evaluate(() => window.stage.run('camera.preset', { name: 'toan-canh' }));
await nghi(1200);
await page.screenshot({ path: `${THU_MUC}/04-toan-canh-1440.png` });
await page.setViewportSize({ width: 390, height: 844 });
await nghi(900);
await page.screenshot({ path: `${THU_MUC}/05-mobile-390.png` });
await page.setViewportSize({ width: 1440, height: 900 });

/* ------------------------------------------------- đối chiếu nhật ký của não */

// cho não ghi nốt nhật ký rồi tự thoát
for (let i = 0; i < 60; i++) {
  if (existsSync(DUONG_LOG_NAO)) break;
  await nghi(500);
}
let logNao = null;
try {
  logNao = JSON.parse(readFileSync(DUONG_LOG_NAO, 'utf8'));
} catch {
  /* không đọc được thì bước dưới tự báo lỗi */
}
ghi(
  'não ghi nhật ký tool call (MCP stdio thật)',
  !!logNao && logNao.toolCalls?.length > 0,
  logNao
    ? `${logNao.toolCalls.length} tool call · ${logNao.soTool} tool · ${logNao.tongKet?.soLuot} lượt`
    : 'không có nao-demo-log.json',
);
if (logNao) {
  nhatKy.nao = {
    soTool: logNao.soTool,
    soToolCall: logNao.toolCalls.length,
    tongKet: logNao.tongKet,
    coHuongDanAgent: !!logNao.huongDanAgent,
    tenToolDaGoi: [...new Set(logNao.toolCalls.map((t) => t.tool))],
  };
  const daGoi = nhatKy.nao.tenToolDaGoi;
  ghi(
    'não gọi đúng bộ tool của vòng mẫu',
    ['stage_bootstrap', 'stage_events', 'stage_describe', 'actor_say', 'actor_emote', 'module_build'].every(
      (t) => daGoi.includes(t),
    ),
    daGoi.join(', '),
  );
  ghi(
    'stage_bootstrap trả kèm "Hướng dẫn cho agent"',
    !!logNao.huongDanAgent && /Gen/.test(logNao.huongDanAgent),
    (logNao.huongDanAgent ?? '').slice(0, 90) + '…',
  );
  const giong = logNao.toolCalls.filter((t) => t.tool === 'actor_say' && t.durationMs > 0);
  ghi(
    'giọng phát có durationMs thật (audio edge-tts)',
    giong.length >= 2,
    giong.map((g) => `${g.durationMs} ms`).join(' · '),
  );
  nhatKy.giong = giong.map((g) => ({ text: g.args?.text, durationMs: g.durationMs }));
}

/* ---------------------------------------- sự kiện user.text đúng 2 lần, từ owner */

const ut = await page.evaluate(() => window.__b3.filter((e) => e.event === 'user.text'));
ghi(
  'đúng 2 sự kiện user.text, đều của owner',
  ut.length === 2 && ut.every((e) => e.data.actor === 'owner'),
  JSON.stringify(ut.map((e) => e.data)),
);
nhatKy.userText = ut;

ghi('0 lỗi console', loiConsole.length === 0, loiConsole.slice(0, 5).join(' | '));

nhatKy.loiConsole = loiConsole;
nhatKy.suKien = await page.evaluate(() => window.__b3.map((e) => ({ t: e.t, event: e.event, data: e.data })));
nhatKy.tongKet = { soBuoc, soOk, thatBai };
writeFileSync(`${THU_MUC}/nhat-ky-kiem-b3.json`, JSON.stringify(nhatKy, null, 2) + '\n');

in_(`\n==> ${soOk}/${soBuoc} bước đạt. Nhật ký: ${THU_MUC}/nhat-ky-kiem-b3.json`);
if (thatBai.length) in_('!! Chưa đạt:\n   - ' + thatBai.join('\n   - '));

await browser.close();
dongHet(thatBai.length ? 1 : 0);
