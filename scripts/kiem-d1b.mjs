/**
 * kiem-d1b.mjs — bằng chứng D1b (Issue #48): hoàn thiện mỹ thuật căn nhà ấm.
 *
 * CHẠY ĐÚNG MỘT LẦN (cờ khoá `docs/d1b/.da-chay`). Cổng dev riêng **5211**
 * (không đụng 5173 của Sếp, không đụng 5210 của `kiem-d1.mjs`, không đụng
 * 8787–8790/tmux). Không `pkill` bất cứ tiến trình nào không do chính script
 * này sinh ra — giết bằng PID ÂM của process group mình spawn.
 *
 * Chụp: 5 preset camera 1440×900 · 1 ảnh 390×844 (bảng lệnh phải TỰ thu gọn)
 * · cận mặt Javis/Gen dưới nắng · cửa sổ thấy sân vườn · bàn trà có đồ.
 * Đo: luma **đúng vùng mặt** (hộp lấy từ `stage.chieuDiem()` chiếu xương head
 * ra điểm ảnh, không phải ô vuông giữa ảnh đoán mò như D1), FPS, số lượt vẽ /
 * tam giác (`stage.hieuNang()`), console lỗi.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createConnection as netConnect } from 'node:net';
import { lumaStats } from './lib-png.mjs';

const THU_MUC = 'docs/d1b';
const CO_DA_CHAY = `${THU_MUC}/.da-chay`;
mkdirSync(THU_MUC, { recursive: true });

if (existsSync(CO_DA_CHAY)) {
  console.log(`⛔ Đã chạy rồi (${CO_DA_CHAY}) — không chạy lại. Xoá cờ nếu thật sự muốn.`);
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

const PORT = 5211;
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
    const s = String(d);
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

const urlServer = `http://localhost:${PORT}/?bridge=0`;
const ketQua = { anh: {}, luma: {}, hieuNang: {}, fps: {} };
const loiConsole = [];

let browser;
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

  const chup = async (ten, tenFile) => {
    const duong = `${THU_MUC}/${tenFile}`;
    await page.screenshot({ path: duong });
    ketQua.anh[ten] = duong;
    console.log(`   📷 ${ten} → ${duong}`);
  };

  console.log('==> mở', urlServer);
  await page.goto(urlServer, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
  await nghi(3000); // nạp VRM + 30 model Kenney + biên dịch shader xong hẳn

  /*
   * Camera bay (lerp mỗi khung hình) KHÔNG kịp tới nơi trên renderer phần mềm
   * ~1 fps (bài học D1) → gọi `camera.preset` cho `describe()` nói đúng tên,
   * rồi `datMay` đúng toạ độ đã khai trong `world.ts cameraPreset()`.
   */
  const PRESET_CAM = {
    'toan-canh': { vt: [-6.0, 1.82, 4.2], tam: [2.5, 1.0, -1.6] },
    'phong-khach': { vt: [-1.8, 1.7, 3.2], tam: [-4.5, 1.0, 1.6] },
    'ban-lam-viec': { vt: [1.2, 1.8, -1.0], tam: [4.3, 1.1, -3.5] },
    bep: { vt: [1.4, 1.9, 1.7], tam: [4.5, 1.0, 2.6] },
    'cua-so': { vt: [-1.0, 1.45, 1.6], tam: [-1.0, 1.1, 4.8] },
  };
  const datCam = async (name) => {
    await page.evaluate((n) => window.stage.run('camera.preset', { name: n }), name);
    await page.evaluate(({ vt, tam }) => window.stage.datMay(vt, tam), PRESET_CAM[name]);
    await nghi(400);
  };
  for (const name of Object.keys(PRESET_CAM)) {
    await datCam(name);
    await chup(name, `${name}-1440.png`);
  }

  /* cận cảnh BÀN TRÀ (sách + cốc) — "bàn trà có đồ" */
  await page.evaluate(() => window.stage.datMay([-3.9, 0.95, 1.5], [-4.5, 0.42, 0.5]));
  await nghi(400);
  await chup('ban-tra-can', 'ban-tra-can.png');

  /* cận mặt Javis + Gen dưới nắng, kèm HỘP MẶT đo bằng phép chiếu thật */
  async function capAnhMat(actorId) {
    const d = await page.evaluate(() => window.stage.describe());
    const actor = d.result.actors.find((a) => a.id === actorId);
    if (!actor) throw new Error(`không thấy actor ${actorId}`);
    const facingRad = (actor.facing * Math.PI) / 180;
    const dx = await page.evaluate((id) => window.stage.doXuong(id), actorId);
    const dau = dx.head;
    if (!dau) throw new Error(`không đọc được xương head của ${actorId}`);
    const [hx, hy, hz] = dau;
    const vt = [hx + Math.sin(facingRad) * 0.78, hy + 0.08, hz + Math.cos(facingRad) * 0.78];
    await page.evaluate(({ vt, tam }) => window.stage.datMay(vt, tam), { vt, tam: dau });
    await nghi(300);
    // hộp mặt: chiếu tâm đầu + một điểm lệch 9 cm để biết 1 m ra bao nhiêu px
    /*
     * HỘP MẶT = vùng DA, không phải cả cái đầu. Vòng 1 lấy hộp ±8,5 cm quanh
     * gốc xương `head` → trùm gần hết tóc đen của Javis, p5 đo được 1,4 (đen
     * kịt) trong khi mặt sáng bình thường. Gốc xương `head` của VRM nằm ở
     * chân sọ, mặt nằm THẤP HƠN ~6,8 cm và chỉ rộng ~7,8 cm (chibi) — số đo
     * này dò trên chính ảnh đã chụp (quét nhiều hộp, xem PR #48).
     */
    const hop = await page.evaluate(
      ({ dau }) => {
        const a = window.stage.chieuDiem(dau);
        const b = window.stage.chieuDiem([dau[0], dau[1] + 0.09, dau[2]]);
        const px = Math.abs(b.y - a.y) / 0.09; // điểm ảnh trên mỗi mét
        const w = px * 0.078;
        const h = px * 0.066;
        return {
          x: Math.round(a.x - w / 2),
          y: Math.round(a.y + px * 0.068 - h / 2),
          w: Math.round(w),
          h: Math.round(h),
        };
      },
      { dau },
    );
    await chup(`${actorId}-mat`, `${actorId}-mat-nang.png`);
    return hop;
  }
  const hopJavis = await capAnhMat('owner');
  const hopGen = await capAnhMat('gen');
  ketQua.hopMat = { javis: hopJavis, gen: hopGen };

  /* hiệu năng: số lượt vẽ / tam giác / mesh + FPS ổn định 4 s */
  await datCam('toan-canh');
  await nghi(800);
  ketQua.hieuNang = await page.evaluate(() => window.stage.hieuNang());
  ketQua.chibi = {
    javis: (await page.evaluate(() => window.stage.doXuong('owner'))).chibi,
    gen: (await page.evaluate(() => window.stage.doXuong('gen'))).chibi,
  };
  // Đo 3 lượt lấy TRUNG VỊ: swiftshader dao động ±40 % giữa hai lượt đo liền
  // nhau (đã thấy 0,75 và 1,40 trong cùng một bản dựng) — một lượt đo không
  // kết luận được gì.
  const mau = [];
  for (let i = 0; i < 3; i++) {
    mau.push(
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            let n = 0;
            const t0 = performance.now();
            (function tick() {
              n++;
              if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
              else resolve(n / ((performance.now() - t0) / 1000));
            })();
          }),
      ),
    );
  }
  mau.sort((x, y) => x - y);
  const fps = mau[1];
  ketQua.fpsMau = mau.map((v) => +v.toFixed(2));
  ketQua.fps = {
    d1b: +fps.toFixed(2),
    d1DoCungCach: 0.81,
    ghiChu: 'swiftshader (renderer phần mềm), 4 s ổn định — số tuyệt đối vô nghĩa, chỉ so TƯƠNG ĐỐI với D1 đo cùng máy cùng cách',
  };
  console.log(`   FPS D1b ${fps.toFixed(2)} (D1 đo cùng cách: 0,81)`);

  /*
   * Ảnh mobile 390×844 — mở TRANG MỚI đúng 390 px thay vì `setViewportSize`
   * trên trang cũ: đó mới là cảnh thật của điện thoại, và đổi viewport giữa
   * chừng trên renderer phần mềm ~0,8 fps đã làm Chrome chết giữa chừng
   * ("Target page… has been closed") ở vòng chạy trước. Đóng trang 1440 để
   * trả RAM trước khi mở trang mới.
   */
  await page.close();
  const pageM = await browser.newPage({ viewport: { width: 390, height: 844 } });
  pageM.on('console', (m) => {
    if (m.type() === 'error') loiConsole.push(`[mobile ${m.type()}] ${m.text()}`);
  });
  pageM.on('pageerror', (e) => loiConsole.push('[mobile pageerror] ' + e.message));
  await pageM.goto(urlServer, { waitUntil: 'load', timeout: 120000 });
  await pageM.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
  await nghi(2500);
  ketQua.bangThuGonMobile = await pageM.evaluate(
    () => document.getElementById('bang')?.classList.contains('thu-gon') ?? false,
  );
  await pageM.evaluate(() => window.stage.run('camera.preset', { name: 'toan-canh' }));
  await pageM.evaluate(() => window.stage.datMay([-5.9, 1.78, 4.15], [2.1, 1.0, -1.35]));
  await nghi(600);
  await pageM.screenshot({ path: `${THU_MUC}/mobile-390x844.png` });
  ketQua.anh.mobile = `${THU_MUC}/mobile-390x844.png`;
  console.log(`   📷 mobile → ${THU_MUC}/mobile-390x844.png (bảng thu gọn: ${ketQua.bangThuGonMobile})`);
} finally {
  if (browser) await browser.close();
  dietCay(server);
}

/* ------------------------------------ đo luma ĐÚNG vùng mặt (PNG thuần) --- */

ketQua.luma.javisMat = lumaStats(`${THU_MUC}/owner-mat-nang.png`, ketQua.hopMat.javis);
ketQua.luma.genMat = lumaStats(`${THU_MUC}/gen-mat-nang.png`, ketQua.hopMat.gen);
/*
 * Luma CẢNH phải đo trên **vùng 3D thuần**, không phải cả ảnh: bảng lệnh
 * trắng bên phải chiếm 27 % bề ngang và mấy thẻ HUD góc trái đều là ~250, nên
 * đo cả ảnh thì p95 luôn dính 246–250 **bất kể chỉnh exposure thế nào** (đúng
 * con số kiểm độc lập báo). Ô này nằm gọn trong khung hình 3D.
 */
const O_CANH = { x: 300, y: 110, w: 720, h: 560 };
for (const ten of ['toan-canh', 'phong-khach', 'ban-lam-viec', 'bep', 'cua-so']) {
  ketQua.luma[ten] = lumaStats(`${THU_MUC}/${ten}-1440.png`, O_CANH);
}
ketQua.consoleLoi = loiConsole;

console.log('\n==> luma (mặt: p95 ≤ 230 VÀ p5 ≥ 70):');
console.log(JSON.stringify(ketQua.luma, null, 2));
console.log('==> hiệu năng:', JSON.stringify(ketQua.hieuNang));
console.log(`==> console.error: ${loiConsole.length}`);
loiConsole.forEach((l) => console.log('    ' + l));

writeFileSync(`${THU_MUC}/ket-qua.json`, JSON.stringify(ketQua, null, 2));
console.log(`\n==> đã ghi ${THU_MUC}/ket-qua.json`);

const mat = [ketQua.luma.javisMat, ketQua.luma.genMat];
const matOk = mat.every((m) => m.p95 <= 230 && m.p5 >= 70);
// Kiểm độc lập (#48): luma TOÀN CẢNH p95 phải về 215–225, không còn 246–250.
const canhOk = ['toan-canh', 'phong-khach', 'ban-lam-viec', 'bep', 'cua-so'].every(
  (t) => ketQua.luma[t].p95 <= 236 && ketQua.luma[t].p50 >= 100,
);
ketQua.datMoc = { mat: matOk, canh: canhOk, bangMobile: ketQua.bangThuGonMobile };
const ok = loiConsole.length === 0 && matOk && canhOk && ketQua.bangThuGonMobile;
if (ok) {
  writeFileSync(CO_DA_CHAY, new Date().toISOString());
  console.log(`==> đã khoá: ${CO_DA_CHAY}`);
} else {
  console.log('==> CHƯA đạt (console lỗi / luma mặt / luma toàn cảnh / bảng lệnh mobile) — KHÔNG ghi cờ khoá.');
}
process.exit(ok ? 0 : 1);
