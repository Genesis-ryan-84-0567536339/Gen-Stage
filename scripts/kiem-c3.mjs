/**
 * kiem-c3.mjs — bằng chứng C3 (Issue #40): bloom chọn lọc, hết cháy trắng
 * nhân vật, giảm chói. CHẠY ĐÚNG MỘT LẦN (cờ khoá `docs/c3/.da-chay`).
 *
 * Dùng cổng dev RIÊNG (≥5195, mặc định 5195) — không đụng 5173 của Boss.
 * Không pkill bất cứ tiến trình nào không phải do chính script này spawn.
 *
 * Ảnh "trước" dùng lại 3 ảnh hiện trạng Boss đã chụp trên `main` (trước khi
 * sửa gì) — thay vì checkout lại main để tự chụp lại (tốn thời gian, cùng
 * một trạng thái cháy trắng đã thấy rõ bằng mắt). Ảnh "sau" chụp sống trên
 * code đã sửa trong worktree này. Đo luma bằng bộ giải mã PNG THUẦN NODE
 * (`lib-png.mjs`) — không giữ trang trình duyệt sống lúc đo (máy đang chạy
 * nhiều tiến trình khác, Chrome dễ bị OOM-kill nếu giữ lâu).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { createConnection as netConnect } from 'node:net';
import { lumaStats } from './lib-png.mjs';

const CO_DA_CHAY = 'docs/c3/.da-chay';
const THU_MUC = 'docs/c3';
mkdirSync(THU_MUC, { recursive: true });

if (existsSync(CO_DA_CHAY)) {
  console.log(`⛔ Đã chạy rồi (${CO_DA_CHAY} tồn tại) — không chạy lại. Xoá cờ nếu thật sự muốn chạy lại.`);
  process.exit(0);
}

const SCRATCH =
  '/tmp/claude-1000/-home-ryan-Documents-Games-3d/460209ef-271f-4d4b-8f8a-855217e30a54/scratchpad';
const TRUOC = {
  javisNear: `${SCRATCH}/javis-near.png`,
  javisFace: `${SCRATCH}/javis-face.png`,
  genFace: `${SCRATCH}/gen-face.png`,
};
for (const [k, p] of Object.entries(TRUOC)) {
  if (!existsSync(p)) throw new Error(`thiếu ảnh "trước" ${k}: ${p}`);
  copyFileSync(p, `${THU_MUC}/truoc-${k}.png`);
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

const PORT = 5195;
if (await congBan(PORT)) {
  console.error(`⛔ Cổng ${PORT} đang bận — đổi PORT trong script hoặc dọn tiến trình đang chiếm nó.`);
  process.exit(3);
}

console.log(`==> bật vite dev riêng ở cổng ${PORT} (không đụng 5173)`);
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

const urlServer = `http://localhost:${PORT}/`;
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

  /* 1) toàn cảnh 1440 */
  await page.evaluate(() => window.stage.run('camera.preset', { name: 'toan-canh' }));
  await page.waitForTimeout(3500); // camera.preset bay lerp — đợi tới nơi
  await chupVaGhi(page, 'sau-toan-canh', 'sau-toan-canh-1440.png');

  /* 2) hologram + module (bàn điều khiển) */
  await page.evaluate(() => window.stage.run('camera.preset', { name: 'ban-dieu-khien' }));
  await page.waitForTimeout(3500);
  await chupVaGhi(page, 'sau-hologram', 'sau-hologram-module.png');

  /* 3) cận mặt Javis (owner) + Gen: chính diện + góc 3/4 */
  /**
   * `facing` (độ) = góc thật của `goc.rotation.y` — hướng MẶT nhân vật đang
   * quay tới; "0 = hướng camera mặc định" = hướng +Z (forward(θ) =
   * (sin θ, 0, cos θ), xem `nhanvat.ts`). Bản đầu đặt camera lệch CỐ ĐỊNH
   * (0,0,+0.78) cho mọi actor → owner (facing 0°) đúng, nhưng Gen (facing
   * 90°, đứng quay +X ở bàn điều khiển) bị chụp LƯNG. Giờ đọc `facing` thật
   * từ `stage.describe()` rồi mới đặt camera đối diện đúng hướng mặt.
   */
  async function capAnhMat(actorId) {
    const d = await page.evaluate(() => window.stage.describe());
    const actor = d.result.actors.find((a) => a.id === actorId);
    if (!actor) throw new Error(`không thấy actor ${actorId} trong describe()`);
    const facingRad = (actor.facing * Math.PI) / 180;

    const dx = await page.evaluate((id) => window.stage.doXuong(id), actorId);
    const dau = dx.head;
    if (!dau) throw new Error(`không đọc được xương head của ${actorId}`);
    const [hx, hy, hz] = dau;

    function huong(goLechDo) {
      const th = facingRad + (goLechDo * Math.PI) / 180;
      return [Math.sin(th), 0, Math.cos(th)];
    }

    const [fx0, , fz0] = huong(0);
    const vtChinhDien = [hx + fx0 * 0.78, hy + 0.08, hz + fz0 * 0.78];
    await page.evaluate(({ vt, tam }) => window.stage.datMay(vt, tam), { vt: vtChinhDien, tam: dau });
    await page.waitForTimeout(250);
    await chupVaGhi(page, `sau-${actorId}-chinh-dien`, `sau-${actorId}-chinh-dien.png`);

    const [fx1, , fz1] = huong(-35);
    const vt34 = [hx + fx1 * 0.85, hy + 0.3, hz + fz1 * 0.85];
    await page.evaluate(({ vt, tam }) => window.stage.datMay(vt, tam), { vt: vt34, tam: dau });
    await page.waitForTimeout(250);
    await chupVaGhi(page, `sau-${actorId}-goc-34`, `sau-${actorId}-goc-34.png`);
  }
  await capAnhMat('owner');
  await capAnhMat('gen');

  /* FPS */
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
  console.log(`   FPS sau (bloom chọn lọc, 4 s ổn định): ${fps.toFixed(2)}`);
} finally {
  if (browser) await browser.close();
  dietCay(server);
}

/* --------------------------------------------- đo luma (PNG thuần, không cần browser) --- */

const BOX_TRUOC = { x: 330, y: 20, w: 420, h: 420 };
const BOX_SAU = { x: 1440 / 2 - 190, y: 900 / 2 - 230, w: 380, h: 380 };
const BOX_DEN_TRAN = { x: 380, y: 40, w: 680, h: 140 };

ketQua.luma.javisMatTruoc = lumaStats(`${THU_MUC}/truoc-javisFace.png`, BOX_TRUOC);
ketQua.luma.genMatTruoc = lumaStats(`${THU_MUC}/truoc-genFace.png`, BOX_TRUOC);
ketQua.luma.javisMatSau = lumaStats(`${THU_MUC}/sau-owner-chinh-dien.png`, BOX_SAU);
ketQua.luma.genMatSau = lumaStats(`${THU_MUC}/sau-gen-chinh-dien.png`, BOX_SAU);
ketQua.luma.toanKhungSau = lumaStats(`${THU_MUC}/sau-toan-canh-1440.png`);
ketQua.luma.denTranSau = lumaStats(`${THU_MUC}/sau-toan-canh-1440.png`, BOX_DEN_TRAN);
ketQua.fps = { sau: fps != null ? +fps.toFixed(2) : null, mocYeuCau: '>=85% FPS trước (không giảm >15%)' };
ketQua.consoleLoi = loiConsole;

console.log('\n==> luma:');
console.log(JSON.stringify(ketQua.luma, null, 2));
console.log(`\n==> console.error: ${loiConsole.length}`);
loiConsole.forEach((l) => console.log('    ' + l));

writeFileSync(`${THU_MUC}/ket-qua.json`, JSON.stringify(ketQua, null, 2));
console.log(`\n==> đã ghi ${THU_MUC}/ket-qua.json`);

if (loiConsole.length === 0) {
  writeFileSync(CO_DA_CHAY, new Date().toISOString());
  console.log(`\n==> đã khoá: ${CO_DA_CHAY} (không chạy lại script này nữa)`);
} else {
  console.log('\n==> CÓ lỗi console — KHÔNG ghi cờ khoá, có thể chạy lại sau khi sửa.');
}

process.exit(loiConsole.length ? 1 : 0);
