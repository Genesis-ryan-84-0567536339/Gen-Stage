/**
 * kiem-bridge.mjs — bằng chứng cho bridge WebSocket.
 *
 * Tự lo cả ba vai: bật `bridge/server.ts`, mở trình duyệt vào app với
 * `?bridge=1` (vai sân khấu), rồi làm client gửi `actor.moveTo` qua ws và chờ
 * sự kiện `actor.arrived` quay về.
 *
 * Dùng: node scripts/kiem-bridge.mjs [url]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const CONG = 8787;
let urlArg = process.argv[2];
const treo = [];

function in_(...x) {
  console.log(...x);
}

function dong(ma) {
  for (const p of treo) {
    try {
      p.kill('SIGTERM');
    } catch {
      /* đã chết */
    }
  }
  process.exit(ma);
}

/* --- 1. bridge --- */

const bridge = spawn('npx', ['tsx', 'bridge/server.ts'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GEN_STAGE_PORT: String(CONG) },
});
treo.push(bridge);
bridge.stdout.on('data', (d) => process.stdout.write('   ' + d));
bridge.stderr.on('data', (d) => process.stdout.write('   [err] ' + d));
await new Promise((r) => setTimeout(r, 1500));

/* --- 2. máy chủ xem thử + trình duyệt (vai sân khấu) --- */

let url = urlArg;
if (!url) {
  const sv = spawn('npx', ['vite', 'preview', '--port', String(4760 + ((Date.now() / 11) % 200 | 0))], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  treo.push(sv);
  url = await new Promise((resolve, reject) => {
    const han = setTimeout(() => reject(new Error('vite preview không khởi động')), 30000);
    const doc = (d) => {
      const m = String(d).match(/http:\/\/localhost:\d+\/?/);
      if (m) {
        clearTimeout(han);
        resolve(m[0]);
      }
    };
    sv.stdout.on('data', doc);
    sv.stderr.on('data', doc);
  });
}

const loi = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => {
  if (m.type() === 'error') loi.push('[console] ' + m.text());
});
page.on('pageerror', (e) => loi.push('[pageerror] ' + e.message));

const urlStage = `${url.replace(/\/$/, '')}/?bridge=1&bridgePort=${CONG}`;
in_('==> mở sân khấu:', urlStage);
await page.goto(urlStage, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
await page.waitForFunction(
  () => new Promise((r) => setTimeout(() => r(true), 1500)),
  null,
  { timeout: 10000 },
);
in_('==> sân khấu sẵn sàng, đã nối bridge');

/* --- 3. client ra lệnh --- */

const ws = new WebSocket(`ws://localhost:${CONG}/`);
const nhan = [];
let daArrived = false;
let kqMoveTo = null;

ws.on('message', (tho) => {
  const g = JSON.parse(String(tho));
  nhan.push(g);
  if (g.id === 'm1') {
    kqMoveTo = g;
    in_('<== kết quả actor.moveTo:', JSON.stringify(g));
  } else if (g.event === 'actor.arrived') {
    daArrived = true;
    in_('<== sự kiện actor.arrived:', JSON.stringify(g));
  } else if (g.event) {
    in_('<== sự kiện', g.event);
  }
});

await new Promise((r, j) => {
  ws.on('open', r);
  ws.on('error', j);
});
in_('==> client đã nối ws://localhost:' + CONG);

in_('==> gửi {"id":"d1","cmd":"stage.describe"}');
ws.send(JSON.stringify({ id: 'd1', cmd: 'stage.describe' }));
await new Promise((r) => setTimeout(r, 600));
const moTa = nhan.find((g) => g.id === 'd1');
in_(
  '<== describe: actor lan ở',
  JSON.stringify(moTa?.result?.actors?.[0]?.pos),
  '· at =',
  moTa?.result?.actors?.[0]?.at,
);

in_('==> gửi {"id":"m1","cmd":"actor.moveTo","args":{"actor":"lan","to":"ban-2"}}');
ws.send(
  JSON.stringify({ id: 'm1', cmd: 'actor.moveTo', args: { actor: 'lan', to: 'ban-2' } }),
);

const han = Date.now() + 20000;
while (!daArrived && Date.now() < han) await new Promise((r) => setTimeout(r, 200));

ws.send(JSON.stringify({ id: 'd2', cmd: 'stage.describe' }));
await new Promise((r) => setTimeout(r, 600));
const moTa2 = nhan.find((g) => g.id === 'd2');
in_(
  '<== describe sau khi đi: actor lan ở',
  JSON.stringify(moTa2?.result?.actors?.[0]?.pos),
  '· at =',
  moTa2?.result?.actors?.[0]?.at,
);

in_('==> gửi lệnh sai để xem bridge trả lỗi rõ ràng');
ws.send(JSON.stringify({ id: 'x1', cmd: 'actor.bay', args: {} }));
await new Promise((r) => setTimeout(r, 500));
const loiTra = nhan.find((g) => g.id === 'x1');
in_('<== ', JSON.stringify(loiTra));

ws.close();
await browser.close();

/* --- 4. tổng kết --- */

const okMoveTo = kqMoveTo?.ok === true && typeof kqMoveTo.result?.durationMs === 'number';
const okArrived = daArrived;
const okDiChuyen = moTa2?.result?.actors?.[0]?.at === 'ban-2';
const okLoi = loiTra?.ok === false;

in_('\n================ TỔNG KẾT BRIDGE ================');
in_(`actor.moveTo trả ok + durationMs : ${okMoveTo ? 'ĐÚNG' : 'SAI'}`);
in_(`nhận sự kiện actor.arrived       : ${okArrived ? 'ĐÚNG' : 'SAI'}`);
in_(`describe xác nhận at = ban-2     : ${okDiChuyen ? 'ĐÚNG' : 'SAI'}`);
in_(`lệnh sai trả ok:false            : ${okLoi ? 'ĐÚNG' : 'SAI'}`);
in_(`console.error trong trình duyệt  : ${loi.length}`);
loi.forEach((l) => in_('    ' + l));

const xanh = okMoveTo && okArrived && okDiChuyen && okLoi && loi.length === 0;
in_(xanh ? '\n==> BRIDGE XANH' : '\n==> BRIDGE ĐỎ');
dong(xanh ? 0 : 1);
