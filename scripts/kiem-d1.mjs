/**
 * kiem-d1.mjs — bằng chứng D1 (Issue #43): căn nhà ấm đầy đủ nội thất, ánh
 * sáng tự nhiên, bỏ lab neon. CHẠY ĐÚNG MỘT LẦN (cờ khoá `docs/d1/.da-chay`).
 *
 * Dùng cổng dev RIÊNG (5210, không đụng 5173 của Boss, không đụng
 * 8787-8790/tmux gen-stage-nao). Không pkill bất cứ tiến trình nào không
 * phải do chính script này spawn.
 *
 * Chụp: 5 preset camera 1440×900 + 1 ảnh 390×844 (mobile) + cận mặt
 * Javis/Gen dưới nắng + màn hình đang stream + module đang kết tinh. Đo luma
 * mặt (p95), FPS tương đối, console lỗi.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createConnection as netConnect } from 'node:net';
import { lumaStats } from './lib-png.mjs';

const CO_DA_CHAY = 'docs/d1/.da-chay';
const THU_MUC = 'docs/d1';
mkdirSync(THU_MUC, { recursive: true });

if (existsSync(CO_DA_CHAY)) {
  console.log(`⛔ Đã chạy rồi (${CO_DA_CHAY} tồn tại) — không chạy lại. Xoá cờ nếu thật sự muốn chạy lại.`);
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

const PORT = 5210;
if (await congBan(PORT)) {
  console.error(`⛔ Cổng ${PORT} đang bận — đổi PORT trong script hoặc dọn tiến trình đang chiếm nó.`);
  process.exit(3);
}

console.log(`==> bật vite dev riêng ở cổng ${PORT} (không đụng 5173 của Boss)`);
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
await new Promise((resolve, reject) => {
  const han = setTimeout(() => reject(new Error('vite dev không khởi động')), 30000);
  const doc = (d) => {
    const s = String(d);
    process.stdout.write('   [vite] ' + s);
    if (/Local:/.test(s) || /ready in/.test(s)) {
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

// `?bridge=0`: không bật bridge-client — script này không chạy `pnpm bridge`,
// nối thử WebSocket 8787 chỉ tạo lỗi console giả (đã ghi trong CLAUDE.md).
const urlServer = `http://localhost:${PORT}/?bridge=0`;
const ketQua = { anh: {}, luma: {} };
const loiConsole = [];

async function chupVaGhi(page, ten, tenFile) {
  const duong = `${THU_MUC}/${tenFile}`;
  await page.screenshot({ path: duong });
  ketQua.anh[ten] = duong;
  console.log(`   📷 ${ten} → ${duong}`);
}

let browser;
let fps = null;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => {
    if (m.type() === 'error') loiConsole.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => loiConsole.push('[pageerror] ' + e.message));

  console.log('==> mở', urlServer);
  await page.goto(urlServer, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
  await page.waitForTimeout(2500); // nạp VRM + Kenney + biên dịch shader xong hẳn

  /**
   * 5 preset camera 1440×900.
   *
   * `camera.preset` BAY dần (lerp `dt·3,2`, `dt` kẹp ≤ 1/20 s trong
   * `world.ts`) — trên renderer phần mềm (~1 fps đo được) mỗi khung hình chỉ
   * tiến ~16 % quãng đường, nên chờ vài giây KHÔNG đủ tới nơi (đo thật: sau
   * 1,5 s camera mới đi được ~30 % quãng đường). Gọi `camera.preset` trước để
   * `stage.describe().camera.preset` đúng tên, rồi `datMay` đúng toạ độ ĐÃ
   * khai trong `world.ts cameraPreset()` để đặt máy TỨC THÌ — cùng cách
   * `kiem-c3.mjs`/`kiem-a2.mjs` chụp cận mặt.
   */
  const PRESET_CAM = {
    'toan-canh': { vt: [0, 2.25, -4.3], tam: [-1.2, 1.0, 1.3] },
    'phong-khach': { vt: [-1.8, 1.7, 3.2], tam: [-4.5, 1.0, 1.6] },
    'ban-lam-viec': { vt: [1.2, 1.8, -1.0], tam: [4.3, 1.1, -3.5] },
    bep: { vt: [1.4, 1.9, 1.7], tam: [4.5, 1.0, 2.6] },
    'cua-so': { vt: [-1.0, 1.45, 1.6], tam: [-1.0, 1.1, 4.8] },
  };
  async function datCam(name) {
    await page.evaluate((n) => window.stage.run('camera.preset', { name: n }), name);
    await page.evaluate(({ vt, tam }) => window.stage.datMay(vt, tam), PRESET_CAM[name]);
    await page.waitForTimeout(350);
  }
  for (const name of Object.keys(PRESET_CAM)) {
    await datCam(name);
    await chupVaGhi(page, name, `${name}-1440.png`);
  }

  /* ảnh mobile 390×844 */
  await page.setViewportSize({ width: 390, height: 844 });
  await datCam('toan-canh');
  await chupVaGhi(page, 'mobile', 'mobile-390x844.png');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);

  /* cận mặt Javis (owner) + Gen dưới nắng */
  async function capAnhMat(actorId) {
    const d = await page.evaluate(() => window.stage.describe());
    const actor = d.result.actors.find((a) => a.id === actorId);
    if (!actor) throw new Error(`không thấy actor ${actorId} trong describe()`);
    const facingRad = (actor.facing * Math.PI) / 180;
    const dx = await page.evaluate((id) => window.stage.doXuong(id), actorId);
    const dau = dx.head;
    if (!dau) throw new Error(`không đọc được xương head của ${actorId}`);
    const [hx, hy, hz] = dau;
    const fx0 = Math.sin(facingRad);
    const fz0 = Math.cos(facingRad);
    const vtChinhDien = [hx + fx0 * 0.78, hy + 0.08, hz + fz0 * 0.78];
    await page.evaluate(({ vt, tam }) => window.stage.datMay(vt, tam), { vt: vtChinhDien, tam: dau });
    await page.waitForTimeout(250);
    await chupVaGhi(page, `${actorId}-mat`, `${actorId}-mat-nang.png`);
  }
  await capAnhMat('owner');
  await capAnhMat('gen');

  /* màn hình đang stream */
  await datCam('ban-lam-viec');
  await page.evaluate(async () => {
    await window.stage.run('screen.stream', {
      screen: 'may-tinh',
      kind: 'log',
      chunks: ['đang biên dịch…\n', 'xong, 0 lỗi\n', 'sẵn sàng.\n'],
      intervalMs: 150,
    });
  });
  await page.waitForTimeout(900);
  await chupVaGhi(page, 'man-hinh-stream', 'man-hinh-stream.png');

  /* module đang kết tinh */
  await datCam('toan-canh');
  page
    .evaluate(() =>
      window.stage.run('module.build', { module: 'm-d1', shape: 'crystal', durationMs: 2600 }),
    )
    .catch(() => {});
  await page.waitForTimeout(1300);
  await chupVaGhi(page, 'module-build', 'module-build.png');
  await page.waitForTimeout(1600);

  /* FPS tương đối */
  await page.evaluate(() => window.stage.run('camera.preset', { name: 'toan-canh' }));
  await page.waitForTimeout(1000);
  fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const DAI_MS = 4000;
        function tick() {
          n++;
          if (performance.now() - t0 < DAI_MS) requestAnimationFrame(tick);
          else resolve(n / ((performance.now() - t0) / 1000));
        }
        requestAnimationFrame(tick);
      }),
  );
  console.log(`   FPS (swiftshader, 4 s ổn định): ${fps.toFixed(2)}`);
} finally {
  if (browser) await browser.close();
  dietCay(server);
}

/* --------------------------------------------- đo luma (PNG thuần, không cần browser) --- */

const BOX_MAT = { x: 1440 / 2 - 190, y: 900 / 2 - 230, w: 380, h: 380 };

ketQua.luma.javisMat = lumaStats(`${THU_MUC}/owner-mat-nang.png`, BOX_MAT);
ketQua.luma.genMat = lumaStats(`${THU_MUC}/gen-mat-nang.png`, BOX_MAT);
ketQua.luma.toanCanh = lumaStats(`${THU_MUC}/toan-canh-1440.png`);
ketQua.luma.phongKhach = lumaStats(`${THU_MUC}/phong-khach-1440.png`);
ketQua.fps = { do: fps != null ? +fps.toFixed(2) : null, mocYeuCau: 'FPS tương đối, so với lab cũ' };
ketQua.consoleLoi = loiConsole;

console.log('\n==> luma (p95 mặt phải ≤ 230):');
console.log(JSON.stringify(ketQua.luma, null, 2));
console.log(`\n==> console.error: ${loiConsole.length}`);
loiConsole.forEach((l) => console.log('    ' + l));

writeFileSync(`${THU_MUC}/ket-qua.json`, JSON.stringify(ketQua, null, 2));
console.log(`\n==> đã ghi ${THU_MUC}/ket-qua.json`);

const matOk = ketQua.luma.javisMat.p95 <= 230 && ketQua.luma.genMat.p95 <= 230;
if (loiConsole.length === 0 && matOk) {
  writeFileSync(CO_DA_CHAY, new Date().toISOString());
  console.log(`\n==> đã khoá: ${CO_DA_CHAY} (không chạy lại script này nữa)`);
} else {
  console.log('\n==> CÓ lỗi console hoặc luma mặt vượt 230 — KHÔNG ghi cờ khoá.');
}

process.exit(loiConsole.length || !matOk ? 1 : 0);
