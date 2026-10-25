/**
 * kiem-a2.mjs — bằng chứng A2 (Issue #7): chạy trọn 15 emote + 4 idleStyle +
 * actor.say có emotion trên app thật, chụp 2 ảnh/emote + quay video 20–30 s,
 * đếm console.error, đo FPS ở khổ điện thoại 390×844.
 *
 * Dùng: node scripts/kiem-a2.mjs [url]
 * Không truyền url thì tự chạy `vite preview` trên bản build (`pnpm build` trước).
 *
 * Chia 2 lượt tách biệt (một bài học rút ra khi làm): lượt ẢNH + describe()
 * chụp/gọi API xen giữa làm video dài tới 3 phút (I/O ảnh chậm trên GPU giả
 * lập swiftshader) — video 20–30 s phải là MỘT lượt RIÊNG, chạy liền mạch 15
 * emote không chụp ảnh/gọi describe xen vào, tổng đúng bằng tổng `durationMs`
 * (~28.7 s cho bộ 15 emote hiện tại).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';

const THU_MUC = 'docs/a2';
mkdirSync(THU_MUC, { recursive: true });

const EMOTES = [
  'vui', 'rat-vui', 'buon', 'ngac-nhien', 'gian', 'suy-nghi', 'dong-y',
  'tu-choi', 'chao', 'ra-lenh', 'thanh-cong', 'that-bai', 'boi-roi', 'met',
  'cham-chu',
];
const IDLE_STYLES = ['binh-thuong', 'hao-hung', 'met', 'cang-thang'];

let urlArg = process.argv[2];
let server = null;

async function moServer() {
  if (urlArg) return urlArg;
  const port = 4420 + ((Date.now() / 7) % 400 | 0);
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.on('exit', (code, sig) => {
    if (code !== null) in_(`   [vite] đã thoát (code ${code})`);
    else in_(`   [vite] bị tắt (${sig})`);
  });
  const url = await new Promise((resolve, reject) => {
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
  return url;
}

function in_(...x) {
  console.log(...x);
}

const loi = [];
const thatBai = [];
let soBuoc = 0;
let soOk = 0;

function ghi(nhan, ok, chiTiet) {
  soBuoc++;
  if (ok) {
    soOk++;
    in_(`   ✓ ${nhan} ${chiTiet ?? ''}`);
  } else {
    thatBai.push(`${nhan}: ${chiTiet ?? ''}`);
    in_(`   ✗ ${nhan} ${chiTiet ?? ''}`);
  }
}

const url = await moServer();
in_('==> URL:', url);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

function ganLoi(page, tien = '') {
  page.on('console', (m) => {
    if (m.type() === 'error') loi.push(`${tien}[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => loi.push(`${tien}[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => loi.push(`${tien}[requestfailed] ${r.url()} — ${r.failure()?.errorText}`));
}

/* --------------------------------------------- 1) 15 emote + describe + ảnh */

{
  const ctx = await browser.newContext({ viewport: { width: 960, height: 720 } });
  const page = await ctx.newPage();
  ganLoi(page);

  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
  await page.evaluate(() => window.stage.run('actor.turnTo', { actor: 'lan', target: 'camera' }));
  await page.evaluate(() => window.stage.run('camera.focus', { target: 'lan', distance: 1.7 }));
  await page.waitForTimeout(1000);
  in_('==> app sẵn sàng, lượt 1: 15 emote + 2 ảnh/emote + describe()\n');

  for (const emote of EMOTES) {
    const r = await page.evaluate(
      (e) => window.stage.run('actor.emote', { actor: 'lan', emote: e, interrupt: true }),
      emote,
    );
    ghi(`actor.emote ${emote}`, r.ok === true, r.ok ? `durationMs=${r.result.durationMs}` : r.error);

    await page.waitForTimeout(250);
    await page.screenshot({ path: `${THU_MUC}/${emote}-1.png` });

    await page.waitForTimeout(500);
    await page.screenshot({ path: `${THU_MUC}/${emote}-2.png` });
    in_(`   📷 ${THU_MUC}/${emote}-1.png, ${emote}-2.png`);

    const d = await page.evaluate(() => window.stage.describe());
    const lan = d.ok ? d.result.actors.find((a) => a.id === 'lan') : null;
    ghi(
      `stage.describe sau ${emote}`,
      !!lan,
      lan ? `state=${lan.state} mood=${lan.mood} expression=${lan.expression}` : 'không thấy actor',
    );
  }

  in_('\n--- actor.idleStyle (4 kiểu) ---');
  for (const kieu of IDLE_STYLES) {
    const r = await page.evaluate((k) => window.stage.run('actor.idleStyle', { actor: 'lan', style: k }), kieu);
    ghi(`actor.idleStyle ${kieu}`, r.ok === true, r.ok ? 'ok' : r.error);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${THU_MUC}/idle-${kieu}.png` });
  }
  await page.evaluate(() => window.stage.run('actor.idleStyle', { actor: 'lan', style: 'binh-thuong' }));

  in_('\n--- actor.say kèm emotion ---');
  const rSay = await page.evaluate(() =>
    window.stage.run('actor.say', {
      actor: 'lan',
      text: 'Sếp ơi, bộ hành vi A2 chạy xong rồi!',
      emotion: 'vui',
    }),
  );
  ghi('actor.say emotion=vui', rSay.ok === true, rSay.ok ? `durationMs=${rSay.result.durationMs}` : rSay.error);
  await page.waitForTimeout((rSay.ok ? rSay.result.durationMs : 1500) + 300);
  await page.screenshot({ path: `${THU_MUC}/say-emotion.png` });

  await ctx.close();
}

/* ------------------------------------- 2) video 20–30 s, liền mạch, không chụp */

{
  in_('\n--- lượt 2: quay video liền mạch 15 emote (không chụp ảnh xen giữa) ---');
  const ctx = await browser.newContext({
    viewport: { width: 640, height: 480 },
    recordVideo: { dir: THU_MUC, size: { width: 640, height: 480 } },
  });
  const page = await ctx.newPage();
  ganLoi(page, '[video] ');

  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
  await page.evaluate(() => window.stage.run('actor.turnTo', { actor: 'lan', target: 'camera' }));
  await page.evaluate(() => window.stage.run('camera.focus', { target: 'lan', distance: 1.7 }));
  await page.waitForTimeout(300);

  const t0 = Date.now();
  for (const emote of EMOTES) {
    const r = await page.evaluate(
      (e) => window.stage.run('actor.emote', { actor: 'lan', emote: e, interrupt: true }),
      emote,
    );
    const dai = r.ok ? r.result.durationMs : 1500;
    await page.waitForTimeout(dai);
  }
  const giay = (Date.now() - t0) / 1000;
  ghi('video: 15 emote liền mạch', giay >= 15 && giay <= 40, `${giay.toFixed(1)} s nội dung`);

  const video = page.video();
  await ctx.close();
  if (video) {
    const duongDan = `${THU_MUC}/a2-emote-demo.webm`;
    if (existsSync(duongDan)) rmSync(duongDan);
    await video.saveAs(duongDan);
    // Playwright giữ lại bản gốc trong cùng thư mục (tên theo id nội bộ) — xoá
    // để không commit trùng 2 bản video nặng vào docs/a2.
    for (const f of readdirSync(THU_MUC)) {
      if (f.endsWith('.webm') && f !== 'a2-emote-demo.webm') rmSync(`${THU_MUC}/${f}`);
    }
    if (existsSync(duongDan)) in_(`\n🎥 video: ${duongDan}`);
  }
}

/* ----------------------------------------------------- 3) FPS 390×844 */

in_('\n--- FPS ở 390×844 (điện thoại) ---');
const dt = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const dtPage = await dt.newPage();
ganLoi(dtPage, '[mobile] ');
await dtPage.goto(url, { waitUntil: 'load', timeout: 120000 });
await dtPage.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
await dtPage.evaluate(() => window.stage.run('actor.emote', { actor: 'lan', emote: 'chao' }));
await dtPage.waitForTimeout(500);
await dtPage.screenshot({ path: `${THU_MUC}/mobile-390x844.png` });

const fps = await dtPage.evaluate(
  () =>
    new Promise((resolve) => {
      let n = 0;
      const t0 = performance.now();
      function tick() {
        n++;
        const dt_ = performance.now() - t0;
        if (dt_ < 2000) requestAnimationFrame(tick);
        else resolve((n / dt_) * 1000);
      }
      requestAnimationFrame(tick);
    }),
);
// CHỈ THÔNG TIN, không chặn pass/fail: máy kiểm (container, không GPU thật)
// chạy Chrome bằng --use-gl=swiftshader (dựng hình bằng CPU) — đo thử cả khổ
// desktop 960×720 cũng chỉ ~3 fps (số đo trong lúc làm A2), chứng tỏ số đo ở
// đây phản ánh giới hạn renderer phần mềm của MÔI TRƯỜNG kiểm, không phải
// nặng hay nhẹ do code A2. Muốn biết mượt thật trên điện thoại thì phải đo
// trên máy có GPU thật (Boss tự xem bằng `pnpm dev --host` trên điện thoại).
in_(`   ℹ FPS mobile (swiftshader, chỉ tham khảo): ${fps.toFixed(1)} fps — xem ghi chú trong PR`);
await dt.close();

/* --------------------------------------------------------------- tổng kết */

await browser.close();
if (server) server.kill();

in_('\n==================== TỔNG KẾT A2 ====================');
in_(`Bước: ${soOk}/${soBuoc} ok`);
in_(`console.error: ${loi.length}`);
loi.forEach((l) => in_('   ' + l));
if (thatBai.length) {
  in_('\nThất bại:');
  thatBai.forEach((l) => in_('   ✗ ' + l));
}
in_('=======================================================\n');

process.exit(loi.length === 0 && thatBai.length === 0 ? 0 : 1);
