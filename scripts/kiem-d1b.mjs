/**
 * kiem-d1b.mjs — bằng chứng D1b (Issue #48): hoàn thiện mỹ thuật căn nhà ấm.
 *
 * CHẠY ĐÚNG MỘT LẦN (cờ khoá `docs/d1b/.da-chay`). Cổng dev riêng **5252**
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
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync, statSync, readdirSync } from 'node:fs';
import { createConnection as netConnect } from 'node:net';
import { lumaStats } from './lib-png.mjs';

const THU_MUC = 'docs/d1b';
const CO_DA_CHAY = `${THU_MUC}/.da-chay`;
mkdirSync(THU_MUC, { recursive: true });

// `--lai`: xoá cờ khoá rồi chạy lại (vòng 2 PR #51 — cờ không còn nằm trong git).
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

const PORT = 5252;
if (await congBan(PORT)) {
  console.error(`⛔ Cổng ${PORT} đang bận — đổi PORT, KHÔNG giết tiến trình của Sếp.`);
  process.exit(3);
}

/**
 * H1 (#69 mục 50) — **ĐO TRÊN BẢN BUILD, KHÔNG TRÊN DEV SERVER.**
 *
 * `threejs-qa-release` gọi đây là cái bẫy có tên: "Dev server tested,
 * production build shipped untested". Dev server không minify, kèm client HMR
 * và source map, nên mọi số `calls`/FPS/luma đo trên nó là số của một bản
 * **không ai dùng**. Build trước rồi `vite preview` — đúng bản Boss sẽ mở.
 *
 * `--khong-build` để chạy lại nhanh khi `dist/` đã mới.
 */
if (!process.argv.includes('--khong-build')) {
  console.log('==> pnpm build (tsc + vite build) — số đo phải lấy trên bản build');
  const b = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit' });
  if (b.status !== 0) {
    console.error('⛔ vite build thất bại — không đo trên dev server để thay thế.');
    process.exit(1);
  }
} else if (!existsSync('dist/index.html')) {
  console.error('⛔ Chưa có dist/index.html — bỏ --khong-build để build trước.');
  process.exit(1);
}

console.log(`==> bật vite PREVIEW (bản build) ở cổng ${PORT}`);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
await new Promise((resolve, reject) => {
  const han = setTimeout(() => reject(new Error('vite preview không khởi động')), 40000);
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

  /*
   * ẨN GIAO DIỆN trước khi chụp 5 ảnh preset (PR #51 vòng 2). Kiểm độc lập
   * đúng ở chỗ này: bản vòng 1 đo luma trong một **ô cắt tay** `{300,110,720,
   * 560}` chỉ chiếm 31 % khung hình — nhìn như chọn ô cho vừa ngưỡng. Ẩn bảng
   * lệnh + HUD rồi đo **CẢ KHUNG** thì không còn chỗ nào để chọn.
   */
  const anGiaoDien = async () => {
    await page.addStyleTag({
      content:
        '#bang,#hud,#toast,#loading,#o-chat,#goi-y-phim,#nut-tieng,#o-noi-nhanh{display:none!important}',
    });
  };

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
  // một ảnh CÓ giao diện (bằng chứng app thật: nhân vật không bị bảng lệnh che)
  await datCam('toan-canh');
  await chup('toan-canh-giao-dien', 'toan-canh-giao-dien.png');
  await anGiaoDien();
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
    ghiChu:
      'swiftshader (renderer PHẦN MỀM) — biên độ nhiễu ±40 % giữa hai lượt đo liền nhau, LỚN HƠN mọi chênh lệch D1/D1b, nên con số này KHÔNG kết luận được gì về hiệu năng. Thước chính của PR là calls/triangles/shadow size. FPS thật: mở `?fps=1` trên Firefox + GPU thật (xem src/ui/do-fps.ts).',
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
 * Luma CẢNH đo trên **CẢ KHUNG 1440×900 đã ẩn giao diện** (PR #51 vòng 2).
 * Bản vòng 1 đo trong một ô cắt tay 720×560 vì bảng lệnh trắng bên phải kéo
 * p95 lên 246–250 — chữa đúng bệnh nhưng sai thuốc. Ẩn hẳn giao diện lúc chụp
 * thì cả khung đều là ảnh 3D, không còn ô nào để chọn.
 */
for (const ten of ['toan-canh', 'phong-khach', 'ban-lam-viec', 'bep', 'cua-so']) {
  // CẢ KHUNG 1440×900, giao diện đã ẩn — không còn ô cắt tay nào.
  ketQua.luma[ten] = lumaStats(`${THU_MUC}/${ten}-1440.png`);
}
ketQua.consoleLoi = loiConsole;

console.log('\n==> luma (mặt: p95 ≤ 230 VÀ p5 ≥ 70):');
console.log(JSON.stringify(ketQua.luma, null, 2));
console.log('==> hiệu năng:', JSON.stringify(ketQua.hieuNang));
console.log(`==> console.error: ${loiConsole.length}`);
loiConsole.forEach((l) => console.log('    ' + l));

/*
 * NÉN ẢNH BẰNG CHỨNG (PR #51 vòng 2 — kiểm độc lập: "4,5 MB PNG vào git").
 * Hạ về 1280 px + bảng màu 192 màu bằng ImageMagick nếu máy có; không có thì
 * bỏ qua, chỉ cảnh báo. Mốc tự áp: **< 400 KB mỗi ảnh**.
 */
function nenAnh() {
  const coIM = spawnSync('convert', ['-version'], { stdio: 'ignore' }).status === 0;
  if (!coIM) {
    console.log('⚠ không có ImageMagick (`convert`) — bỏ qua bước nén ảnh.');
    return;
  }
  for (const f of readdirSync(THU_MUC).filter((x) => x.endsWith('.png'))) {
    const duong = `${THU_MUC}/${f}`;
    spawnSync('convert', [duong, '-resize', '1280x>', '-colors', '192', '-strip', duong]);
    const kb = Math.round(statSync(duong).size / 1024);
    console.log(`   🗜 ${f}: ${kb} KB${kb > 400 ? ' ⚠ > 400 KB' : ''}`);
  }
}
nenAnh();

const mat = [ketQua.luma.javisMat, ketQua.luma.genMat];
const matOk = mat.every((m) => m.p95 <= 230 && m.p5 >= 70);
/*
 * Mốc: **không cháy** (p95 ≤ 235) và **không chìm** (p50 ≥ 100). Vòng 1 chốt
 * `p95 <= 236` — vừa khít số đo được 234,9, đúng cái kiểm độc lập gọi là "nới
 * ngưỡng theo kết quả". 235 là mốc của dòng 14 (205–235), không phải mốc vẽ
 * quanh số đo.
 */
const canhOk = ['toan-canh', 'phong-khach', 'ban-lam-viec', 'bep', 'cua-so'].every(
  (t) => ketQua.luma[t].p95 <= 235 && ketQua.luma[t].p50 >= 100,
);
ketQua.datMoc = { mat: matOk, canh: canhOk, bangMobile: ketQua.bangThuGonMobile };
// GHI SAU khi chấm mốc (vòng 1 ghi TRƯỚC nên `datMoc` không bao giờ vào file).
writeFileSync(`${THU_MUC}/ket-qua.json`, JSON.stringify(ketQua, null, 2));
console.log(`\n==> đã ghi ${THU_MUC}/ket-qua.json`);

const ok = loiConsole.length === 0 && matOk && canhOk && ketQua.bangThuGonMobile;
if (ok) {
  writeFileSync(CO_DA_CHAY, new Date().toISOString());
  console.log(`==> đã khoá: ${CO_DA_CHAY}`);
} else {
  console.log('==> CHƯA đạt (console lỗi / luma mặt / luma toàn cảnh / bảng lệnh mobile) — KHÔNG ghi cờ khoá.');
}
process.exit(ok ? 0 : 1);
