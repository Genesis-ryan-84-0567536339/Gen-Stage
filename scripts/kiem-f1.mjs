/**
 * kiem-f1.mjs — bằng chứng F1 (Issue #56 mục 1): bố cục nhà như nhà thật.
 *
 * Boss xem bản main (D1b) trên **Firefox**: *"nội thất đồ đạc tùm lum, thiết
 * kế kỳ"* → nên bằng chứng F1 chạy đúng trên **Playwright firefox, headless
 * FALSE** (cửa sổ thật trên DISPLAY thật, WebGL thật của máy — không
 * swiftshader), chứ không phải Chromium phần mềm như các đợt trước.
 *
 * CHẠY ĐÚNG MỘT LẦN (cờ khoá `docs/f1/.da-chay`, xoá bằng `--lai`).
 * Cổng dev riêng **5320** — không đụng 5173 của Sếp, không đụng 5252 (D1b),
 * không đụng 8787–8790/tmux. Không `pkill` gì không do script này sinh ra:
 * giết bằng PID ÂM của process group mình spawn.
 *
 * Chụp: 5 preset camera 1440×900 (`toan-canh` · `phong-khach` ·
 * `ban-lam-viec` · `bep` · `cua-so`) + 1 ảnh `toan-canh` CÓ giao diện + cận
 * cảnh cụm sofa + 1 ảnh 390×844.
 * Đo: số lượt vẽ / tam giác (`stage.hieuNang()`), lỗi console, và ba nguyên
 * tắc bố cục đọc thẳng từ `bo-cuc.ts` (`kiemCum`/`kiemLoiDi`/`kiemHanhLang`).
 */
import { firefox } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createConnection as netConnect } from 'node:net';

const THU_MUC = 'docs/f1';
const CO_DA_CHAY = `${THU_MUC}/.da-chay`;
mkdirSync(THU_MUC, { recursive: true });

if (process.argv.includes('--lai')) {
  rmSync(CO_DA_CHAY, { force: true });
  console.log('↻ --lai: đã xoá cờ khoá, chạy lại.');
}
if (existsSync(CO_DA_CHAY)) {
  console.log(`⛔ Đã chạy rồi (${CO_DA_CHAY}) — không chạy lại. Chạy lại bằng \`--lai\`.`);
  process.exit(0);
}

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

async function congBan(cong) {
  return await new Promise((res) => {
    const sk = netConnect({ host: '127.0.0.1', port: cong });
    const xong = (v) => {
      sk.destroy();
      res(v);
    };
    sk.once('connect', () => xong(true));
    sk.once('error', () => xong(false));
    setTimeout(() => xong(false), 800);
  });
}

const PORT = 5320;
if (await congBan(PORT)) {
  console.error(`⛔ Cổng ${PORT} đang bận — đổi PORT, KHÔNG giết tiến trình của Sếp.`);
  process.exit(3);
}

console.log(`==> bật vite dev riêng ở cổng ${PORT}`);
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
await new Promise((resolve, reject) => {
  const han = setTimeout(() => reject(new Error('vite dev không khởi động')), 40000);
  const doc = (d) => {
    if (/Local:|ready in/.test(String(d))) {
      clearTimeout(han);
      resolve();
    }
  };
  server.stdout.on('data', doc);
  server.stderr.on('data', doc);
});
await nghi(500);

function dietCay(p) {
  if (!p?.pid) return;
  try {
    process.kill(-p.pid, 'SIGTERM');
  } catch {
    try {
      p.kill('SIGTERM');
    } catch {}
  }
}
process.on('exit', () => dietCay(server));

const urlServer = `http://localhost:${PORT}/?bridge=0`;
const ketQua = { trinhDuyet: 'firefox (playwright, headless:false)', anh: {} };
const loiConsole = [];

let browser;
try {
  /*
   * Firefox + GPU nouveau của máy này **đổ WebGL** ngay khi mở trang
   * ("nouveau: kernel rejected pushbuf" rồi tab chết). Ép GL phần mềm
   * (llvmpipe) + webrender software: vẫn là **Firefox thật, cửa sổ thật**
   * (headless:false) đúng trình duyệt Boss dùng, chỉ đổi đường vẽ.
   */
  browser = await firefox.launch({
    headless: false,
    env: {
      ...process.env,
      LIBGL_ALWAYS_SOFTWARE: '1',
      MOZ_ENABLE_WAYLAND: '0',
      GALLIUM_DRIVER: 'llvmpipe',
    },
    firefoxUserPrefs: {
      'webgl.force-enabled': true,
      'webgl.disabled': false,
      'webgl.disable-fail-if-major-performance-caveat': true,
      'gfx.webrender.software': true,
      'layers.acceleration.disabled': true,
      'gfx.x11-egl.force-disabled': true,
    },
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => {
    if (m.type() === 'error') loiConsole.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => loiConsole.push('[pageerror] ' + e.message));

  const anGiaoDien = () =>
    page.addStyleTag({
      content:
        '#bang,#hud,#toast,#loading,#o-chat,#goi-y-phim,#nut-tieng,#o-noi-nhanh{display:none!important}',
    });

  const chup = async (ten, tenFile) => {
    const duong = `${THU_MUC}/${tenFile}`;
    await page.screenshot({ path: duong });
    ketQua.anh[ten] = duong;
    console.log(`   📷 ${ten} → ${duong}`);
  };

  console.log('==> mở', urlServer);
  await page.goto(urlServer, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
  await nghi(4000); // nạp VRM + ~40 model Kenney + biên dịch shader

  /*
   * `camera.preset` bay dần (lerp mỗi khung hình) nên chụp ngay sẽ chụp giữa
   * lúc đang bay → gọi preset cho `describe()` nói đúng tên, rồi `datMay`
   * ĐÚNG toạ độ đã khai trong `world.ts cameraPreset()` (F1 mục 4 so-do.md).
   */
  const PRESET_CAM = {
    'toan-canh': { vt: [1.0, 1.92, 4.3], tam: [-0.5, 0.82, -3.9] },
    'phong-khach': { vt: [-1.5, 1.9, 4.2], tam: [-4.9, 0.9, 0.9] },
    'ban-lam-viec': { vt: [0.5, 1.7, -1.7], tam: [2.3, 1.0, -4.5] },
    bep: { vt: [4.0, 2.0, 1.1], tam: [6.3, 0.95, -3.3] },
    'cua-so': { vt: [-1.0, 1.45, 1.6], tam: [-1.0, 1.1, 4.8] },
  };
  const datCam = async (name) => {
    await page.evaluate((n) => window.stage.run('camera.preset', { name: n }), name);
    await page.evaluate(({ vt, tam }) => window.stage.datMay(vt, tam), PRESET_CAM[name]);
    await nghi(700);
  };

  // 1 ảnh CÓ giao diện (bằng chứng app thật, không phải ảnh dựng riêng)
  await datCam('toan-canh');
  await chup('toan-canh-giao-dien', 'toan-canh-giao-dien.png');
  await anGiaoDien();
  for (const name of Object.keys(PRESET_CAM)) {
    await datCam(name);
    await chup(name, `${name}-1440.png`);
  }

  // cận cảnh CỤM SOFA: sofa ↔ bàn trà ↔ kệ TV trong một khung (lỗi số 1 D1b)
  await page.evaluate(() => window.stage.datMay([-2.4, 1.35, 4.0], [-5.2, 0.6, 1.0]));
  await nghi(700);
  await chup('cum-sofa-can', 'cum-sofa-can.png');

  ketQua.hieuNang = await page.evaluate(() => window.stage.hieuNang());
  ketQua.maySau = (await page.evaluate(() => window.stage.describe())).result.camera;
  console.log('   hiệu năng:', JSON.stringify(ketQua.hieuNang));

  // ảnh 390×844: mở TRANG MỚI đúng 390 px (đổi viewport giữa chừng từng làm
  // trang chết ở vòng D1b), bảng lệnh phải TỰ thu gọn.
  await page.close();
  const pageM = await browser.newPage({ viewport: { width: 390, height: 844 } });
  pageM.on('console', (m) => {
    if (m.type() === 'error') loiConsole.push(`[mobile ${m.type()}] ${m.text()}`);
  });
  pageM.on('pageerror', (e) => loiConsole.push('[mobile pageerror] ' + e.message));
  await pageM.goto(urlServer, { waitUntil: 'load', timeout: 120000 });
  await pageM.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
  await nghi(3000);
  ketQua.bangThuGonMobile = await pageM.evaluate(
    () => document.getElementById('bang')?.classList.contains('thu-gon') ?? false,
  );
  await pageM.screenshot({ path: `${THU_MUC}/toan-canh-390.png` });
  ketQua.anh['toan-canh-390'] = `${THU_MUC}/toan-canh-390.png`;
  console.log(`   📷 toan-canh-390 → ${THU_MUC}/toan-canh-390.png`);
} finally {
  await browser?.close();
  dietCay(server);
}

ketQua.loiConsole = loiConsole;
writeFileSync(`${THU_MUC}/ket-qua.json`, JSON.stringify(ketQua, null, 2) + '\n');
writeFileSync(CO_DA_CHAY, new Date().toISOString() + '\n');
console.log(`\n✅ xong — ${THU_MUC}/ket-qua.json · lỗi console: ${loiConsole.length}`);
if (loiConsole.length) console.log(loiConsole.slice(0, 8).join('\n'));
