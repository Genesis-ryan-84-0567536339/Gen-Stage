/**
 * kiem-lab2.mjs — bằng chứng cho "lab rộng–sáng–gọn + điều khiển phím"
 * (Issue #11, #14).
 *
 * Cùng khuôn `kiem-a3.mjs` (Playwright, Chrome hệ thống, cờ swiftshader) nhưng
 * gọn lại đúng những gì Boss cần xem sau phản hồi 25/10:
 *   · 4 ảnh 1440×900: toàn cảnh · bàn điều khiển · hologram + module · góc nhân vật
 *   · 2 ảnh 390×844: bảng lệnh thu gọn mặc định · screen.focus không tràn khung
 *   · 1 ảnh sau khi bấm W ba lần rồi phím 1 (đường bàn phím → dispatcher)
 *   · console.error phải bằng 0
 *
 * Dùng: node scripts/kiem-lab2.mjs [url]
 * Không truyền url thì tự chạy `vite preview` trên bản build (`pnpm build` trước).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const THU_MUC = 'docs/lab2';
mkdirSync(THU_MUC, { recursive: true });

const loi = [];
const buoc = [];
function in_(...x) {
  console.log(...x);
}
function ghi(nhan, ok, chiTiet = '') {
  buoc.push({ nhan, ok });
  in_(`   ${ok ? '✓' : '✗'} ${nhan.padEnd(46)} ${chiTiet}`);
}

/* ----------------------------------------------------------- máy chủ xem thử */

let server = null;
let url = process.argv[2];
if (!url) {
  server = spawn('npx', ['vite', 'preview', '--port', '4471'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  url = await new Promise((resolve, reject) => {
    const han = setTimeout(() => reject(new Error('vite preview không khởi động')), 30000);
    const doc = (d) => {
      const m = String(d).match(/http:\/\/localhost:\d+\/?/);
      if (m) {
        clearTimeout(han);
        resolve(m[0]);
      }
    };
    server.stdout.on('data', doc);
    server.stderr.on('data', doc);
  });
}
in_('==> URL:', url);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

function theoDoiLoi(page, nhan) {
  page.on('console', (m) => {
    if (m.type() === 'error') loi.push(`[${nhan}] ${m.text()}`);
  });
  page.on('pageerror', (e) => loi.push(`[${nhan}/pageerror] ${e.message}`));
  page.on('requestfailed', (r) =>
    loi.push(`[${nhan}/requestfailed] ${r.url()} — ${r.failure()?.errorText}`),
  );
}

async function moTrang(w, h, nhan) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  theoDoiLoi(page, nhan);
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  return page;
}

const goi = (page, cmd, args) =>
  page.evaluate(([c, a]) => window.stage.run(c, a), [cmd, args]);

async function anh(page, ten) {
  const f = `${THU_MUC}/${ten}.png`;
  await page.screenshot({ path: f });
  in_(`   📷 ${f}`);
}

/* ===================================================== 1440×900 — máy tính */

in_('\n==> Khung 1440×900 (Issue #11: rộng · sáng · gọn)');
const may = await moTrang(1440, 900, 'desktop');
ghi('app sẵn sàng (window.stage.san)', true);

const moTa = await goi(may, 'stage.describe', {});
const st = moTa.result;
const places = st.places.map((p) => p.id);
ghi(
  'giữ đủ 8 place cũ (tên không đổi)',
  ['ban-dieu-khien', 'ban-1', 'ban-2', 'ghe-1', 'ghe-2', 'buc-trung-tam', 'cua', 'ke-module'].every(
    (x) => places.includes(x),
  ),
  places.join(', '),
);

// toàn cảnh
await goi(may, 'camera.preset', { name: 'toan-canh' });
await may.waitForTimeout(2200);
await anh(may, '01-toan-canh-1440');

// bàn điều khiển
const rBan = await goi(may, 'camera.preset', { name: 'ban-dieu-khien' });
ghi('camera.preset ban-dieu-khien', rBan.ok, JSON.stringify(rBan.result ?? rBan.error));
await may.waitForTimeout(2200);
await anh(may, '02-ban-dieu-khien-1440');

// hologram + module kết tinh
await goi(may, 'camera.preset', { name: 'toan-canh' });
await may.waitForTimeout(1600);
const rShow = await goi(may, 'screen.show', {
  screen: 'main',
  kind: 'code',
  content: 'const connector = Baserow;\nawait connector.sync();',
});
ghi('screen.show trên hologram main', rShow.ok);
await goi(may, 'screen.show', { screen: 'left', kind: 'text', content: 'Lab 16 × 16 m\nTrần 5,6 m' });
await goi(may, 'screen.show', { screen: 'right', kind: 'text', content: 'Ánh sáng: sáng\nBloom: emissive' });
const rBuild = await goi(may, 'module.build', {
  id: 'module-kiem',
  shape: 'crystal',
  label: 'Baserow',
  from: 'main',
});
ghi('module.build kết tinh từ main', rBuild.ok);
await may.waitForTimeout(3200);
await goi(may, 'camera.focus', { target: 'ban-dieu-khien', distance: 6 });
await may.waitForTimeout(2200);
await anh(may, '03-hologram-module-1440');

// góc nhân vật
const rFocus = await goi(may, 'camera.focus', { target: 'lan', distance: 2.6 });
ghi('camera.focus vào nhân vật', rFocus.ok);
await goi(may, 'actor.express', { actor: 'lan', expression: 'happy' });
await goi(may, 'actor.say', { actor: 'lan', text: 'Phòng rộng và sáng hơn rồi Sếp ạ!' });
await may.waitForTimeout(2400);
await anh(may, '04-goc-nhan-vat-1440');

/* ============================================ bàn phím (Issue #14) */

in_('\n==> Bàn phím → dispatcher (Issue #14)');
await goi(may, 'camera.preset', { name: 'toan-canh' });
await may.waitForTimeout(1800);

const truoc = (await goi(may, 'stage.describe', {})).result.actors[0].pos;
await may.click('#stage', { position: { x: 300, y: 500 } });
for (let i = 0; i < 3; i++) {
  await may.keyboard.press('KeyW');
  await may.waitForTimeout(700);
}
await may.waitForTimeout(1200);
const sau = (await goi(may, 'stage.describe', {})).result.actors[0].pos;
ghi(
  'bấm W ×3 → nhân vật đi lên (z giảm)',
  sau[2] < truoc[2] - 0.2,
  `pos ${JSON.stringify(truoc)} → ${JSON.stringify(sau)}`,
);

await may.keyboard.press('Digit1');
await may.waitForTimeout(900);
const nhatKy = JSON.parse(await may.evaluate(() => window.stage.log())).banGhi;
const lenhPhim = nhatKy.filter((x) => x.nguon === 'phim');
const coEmote = lenhPhim.some((x) => x.cmd === 'actor.emote');
const dichDaBam = lenhPhim.filter((x) => x.cmd === 'actor.moveTo').map((x) => x.args.to[2]);
ghi(
  'mọi phím đi qua dispatcher (nguồn "phim")',
  dichDaBam.length > 0 && coEmote,
  `${lenhPhim.length} lệnh ghi nhật ký`,
);
// Bất biến thật của việc giữ/bấm phím: ĐÍCH phải TÍCH LUỸ (−1 → −2 → −3), chứ
// không phải quãng đường đi được trong bấy nhiêu mili-giây — swiftshader chạy
// vài khung hình/giây nên quãng đường đo bằng đồng hồ rất phập phù.
ghi(
  'đích mỗi lần bấm W tích luỹ thêm 1 m',
  dichDaBam.length === 3 && dichDaBam.every((z, i) => Math.abs(z - (truoc[2] - (i + 1))) < 0.01),
  `đích z: ${dichDaBam.join(' → ')}`,
);
const emoteKq = lenhPhim.filter((x) => x.cmd === 'actor.emote').pop();
ghi(
  'phím 1 gọi actor.emote (A2 chưa merge → toast lỗi nhẹ, không crash)',
  !!emoteKq,
  emoteKq ? (emoteKq.ok ? 'ok' : `stub: ${String(emoteKq.error).slice(0, 60)}`) : '',
);

await may.keyboard.press('KeyC');
await may.waitForTimeout(1800);
ghi(
  'phím C xoay vòng camera.preset',
  JSON.parse(await may.evaluate(() => window.stage.log())).banGhi.some(
    (x) => x.nguon === 'phim' && x.cmd === 'camera.preset',
  ),
);
await goi(may, 'camera.preset', { name: 'toan-canh' });
await may.waitForTimeout(2000);
await anh(may, '05-sau-phim-W-va-1');

/* ========================================================= 390×844 — mobile */

in_('\n==> Khung 390×844 (bảng lệnh thu gọn · screen.focus)');
const dt = await moTrang(390, 844, 'mobile');
const thuGon = await dt.evaluate(() => document.getElementById('bang').classList.contains('thu-gon'));
ghi('bảng lệnh THU GỌN mặc định ở <900px', thuGon === true);
const anGoiY = await dt.evaluate(() => {
  const el = document.getElementById('goi-y-phim');
  return !el || getComputedStyle(el).display === 'none';
});
ghi('bảng gợi ý phím ẩn trên màn hẹp', anGoiY === true);
await anh(dt, '06-dien-thoai-bang-thu-gon-390');

const rF = await goi(dt, 'screen.focus', { screen: 'main' });
ghi('screen.focus trên khung dọc', rF.ok);
await dt.waitForTimeout(1600);
// hình học: panel được đặt theo hfov thật của khung hình (World.choPanelTruocMay)
// nên 4 góc panel phải chiếu vào trong khung — kiểm trực tiếp bằng ảnh 07.
const posPanel = (await goi(dt, 'stage.describe', {})).result.screens.find((x) => x.id === 'main');
ghi(
  'panel main đã bay ra trước máy quay',
  !!posPanel && Math.abs(posPanel.pos[2]) < 11,
  JSON.stringify(posPanel?.pos),
);
await anh(dt, '07-dien-thoai-screen-focus-390');

/* ================================================================ tổng kết */

in_('\n==> Console');
ghi('console.error = 0', loi.length === 0, loi.slice(0, 5).join(' | '));

const hong = buoc.filter((b) => !b.ok);
in_(`\n==> KẾT QUẢ: ${buoc.length - hong.length}/${buoc.length} mục đạt · ${loi.length} lỗi console`);
if (hong.length) for (const h of hong) in_(`   ✗ ${h.nhan}`);
if (loi.length) for (const l of loi) in_(`   ! ${l}`);
in_(`\nẢnh: ${THU_MUC}/`);

await browser.close();
server?.kill('SIGTERM');
process.exit(hong.length || loi.length ? 1 : 0);
