/**
 * Chụp ảnh demo + kiểm tra console (bằng chứng cho PR).
 * Dùng: node scripts/chup-anh.mjs [url] [file-ra]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5173/';
const raFile = process.argv[3] ?? 'docs/demo-01.png';
mkdirSync(dirname(raFile), { recursive: true });

const browser = await chromium.launch({
  // dùng Google Chrome có sẵn trên máy (không cần tải bản Chromium riêng)
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const loi = [];
const canhBao = [];
page.on('console', (m) => {
  const d = `[${m.type()}] ${m.text()}`;
  if (m.type() === 'error') loi.push(d);
  else if (m.type() === 'warning') canhBao.push(d);
  else console.log('   ' + d);
});
page.on('pageerror', (e) => loi.push('[pageerror] ' + e.message));
page.on('requestfailed', (r) => loi.push(`[requestfailed] ${r.url()} — ${r.failure()?.errorText}`));

console.log('==> mở', url);
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
// đợi tải xong VRM + nội thất
await page.waitForFunction(
  () => document.getElementById('loading')?.classList.contains('xong'),
  null,
  { timeout: 120000 },
);
await page.waitForTimeout(3000);

console.log('==> bấm "Vẫy tay"');
await page.click('button[data-act="wave"]');
await page.waitForTimeout(700);

await page.screenshot({ path: raFile });
console.log('==> đã lưu', raFile);

console.log('==> bấm "Đi tới bàn 2"');
await page.click('button[data-act="walk"]');
await page.waitForTimeout(1100);
await page.screenshot({ path: 'docs/demo-02-di-lai.png' });
console.log('==> đã lưu docs/demo-02-di-lai.png');

console.log('==> kiểm bản điện thoại 390x844');
const dt = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
dt.on('console', (m) => {
  if (m.type() === 'error') loi.push('[mobile] ' + m.text());
});
dt.on('pageerror', (e) => loi.push('[mobile pageerror] ' + e.message));
await dt.goto(url, { waitUntil: 'load', timeout: 120000 });
await dt.waitForFunction(
  () => document.getElementById('loading')?.classList.contains('xong'),
  null,
  { timeout: 120000 },
);
await dt.waitForTimeout(2500);
await dt.click('button[data-act="happy"]');
await dt.waitForTimeout(700);
await dt.screenshot({ path: 'docs/demo-03-dien-thoai.png' });
console.log('==> đã lưu docs/demo-03-dien-thoai.png');

console.log('\n==> console.error:', loi.length);
loi.forEach((l) => console.log('    ' + l));
console.log('==> console.warn :', canhBao.length);
canhBao.forEach((l) => console.log('    ' + l));

await browser.close();
process.exit(loi.length ? 1 : 0);
