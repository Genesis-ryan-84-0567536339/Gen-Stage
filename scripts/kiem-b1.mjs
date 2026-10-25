/**
 * kiem-b1.mjs — bằng chứng B1 (Issue #18) trên app THẬT (Playwright + Chrome).
 *
 * Chạy (**một lần** — xem cờ khoá `docs/b1/.da-chay`):
 *   node scripts/kiem-b1.mjs         # trọn bộ
 *   node scripts/kiem-b1.mjs --lai   # xoá cờ khoá rồi chạy lại
 *   node scripts/kiem-b1.mjs <url>   # chạy vào một url có sẵn
 *
 * Ra `docs/b1/`:
 *   00-toan-canh-3-vung.png     1440×900, thấy CẢ ba vùng trong một khung
 *   01-vung-a-trinh-dien.png    bục trung tâm + 3 hologram
 *   02-vung-b-dieu-khien.png    bàn cong + 2 ghế + Gen đứng làm việc
 *   03-vung-c-kho.png           kệ module + 2 máy phát
 *   04-mobile-390x844.png       khổ dọc điện thoại
 *   05-di-<n>.png               6 khung cách nhau 0,5 s khi owner đi LIÊN TỤC
 *   06-gen-ban-dieu-khien.png   cận Gen ở bàn điều khiển
 *   07-theo-owner.png           camera preset `theo-owner` đang bám
 *   nhat-ky-kiem-b1.json        LOG SỐ: vị trí/vận tốc từng khung, describe,
 *                               controlledBy, tỉ lệ chibi, va chạm, lỗi console
 *
 * Kiểm bằng SỐ (không bằng mắt):
 *   · tốc độ đơn điệu TĂNG rồi ổn định ở 1,6 m/s, không khung nào đi lùi;
 *   · `state` = walking và `at` = null suốt lúc đi, về idle khi nhả;
 *   · lái thẳng vào bàn điều khiển thì DỪNG trước bàn, không lọt vào trong;
 *   · `stage.describe` có `controlledBy` cho cả hai nhân vật;
 *   · console 0 lỗi.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';

const THU_MUC = 'docs/b1';
mkdirSync(THU_MUC, { recursive: true });

const argv = process.argv.slice(2);
const urlArg = argv.find((a) => a.startsWith('http'));

/**
 * CỜ KHOÁ CHẠY MỘT LẦN (quy ước từ `kiem-a2.mjs`): script dựng hình bằng CPU
 * (swiftshader) nên một lượt tốn hàng chục phút — chạy lại nhiều lần là đốt
 * thời gian mà không thêm bằng chứng gì.
 */
const CO_KHOA = `${THU_MUC}/.da-chay`;
if (argv.includes('--lai')) {
  if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
} else if (existsSync(CO_KHOA)) {
  console.error(
    `\n⛔ ${CO_KHOA} đã tồn tại — script kiểm B1 chỉ chạy MỘT LẦN sau khi code xong.\n` +
      `   Kết quả lượt trước: ${THU_MUC}/nhat-ky-kiem-b1.json + ảnh trong ${THU_MUC}/.\n` +
      '   Thật sự cần chạy lại: node scripts/kiem-b1.mjs --lai\n',
  );
  process.exit(2);
}
writeFileSync(CO_KHOA, new Date().toISOString() + '\n');

/** Góc máy chụp từng vùng (đặt THẲNG, không bay lerp — xem `World.datMayThu`). */
const GOC_VUNG = {
  '00-toan-canh-3-vung': [[3.2, 6.8, 12.4], [0, 1.2, -2]],
  '01-vung-a-trinh-dien': [[0, 3.6, 6.4], [0, 1.4, -3.2]],
  '02-vung-b-dieu-khien': [[1.6, 3.4, 4.2], [6, 1, -1]],
  '03-vung-c-kho': [[-1.4, 3.6, 4.4], [-7, 1.2, -1.5]],
};

let server = null;
async function moServer() {
  if (urlArg) return urlArg;
  const port = 4300 + ((Date.now() / 11) % 500 | 0);
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return await new Promise((resolve, reject) => {
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

const in_ = (...x) => console.log(...x);
const loi = [];
const thatBai = [];
const nhatKy = { chay: new Date().toISOString(), buoc: [] };
let soBuoc = 0;
let soOk = 0;

function ghi(nhan, ok, chiTiet, so) {
  soBuoc++;
  if (ok) soOk++;
  else thatBai.push(`${nhan}: ${chiTiet ?? ''}`);
  nhatKy.buoc.push({ nhan, ok, chiTiet: chiTiet ?? null, ...(so ? { so } : {}) });
  in_(`   ${ok ? '✓' : '✗'} ${nhan} ${chiTiet ?? ''}`);
}

const url = await moServer();
in_('==> URL:', url);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') loi.push(`[console] ${m.text()}`);
});
page.on('pageerror', (e) => loi.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => loi.push(`[requestfailed] ${r.url()} — ${r.failure()?.errorText}`));

await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
await page.waitForTimeout(4000);

const mo = (cmd, args) => page.evaluate(([c, a]) => window.stage.run(c, a), [cmd, args]);
const dc = async () => {
  const r = await page.evaluate(() => window.stage.describe());
  return r.ok ? r.result : null;
};
const ai = (st, id) => st.actors.find((a) => a.id === id);

/* ---------------------------------------- 1) hai nhân vật + controlledBy */

in_('\n--- 1) hai nhân vật: owner (nam) trên bục, gen ở bàn điều khiển ---');
{
  const st = await dc();
  const o = st && ai(st, 'owner');
  const g = st && ai(st, 'gen');
  ghi('có actor "owner" và "gen"', !!o && !!g, st ? st.actors.map((a) => a.id).join(', ') : 'describe lỗi');
  ghi(
    'owner.controlledBy = "owner", gen.controlledBy = "agent"',
    o?.controlledBy === 'owner' && g?.controlledBy === 'agent',
    `owner=${o?.controlledBy} gen=${g?.controlledBy}`,
    { owner: o?.controlledBy, gen: g?.controlledBy },
  );
  ghi('owner đứng ở bục trung tâm', o?.at === 'buc-trung-tam', `at=${o?.at} pos=${JSON.stringify(o?.pos)}`);
  ghi('gen đứng ở bàn điều khiển', g?.at === 'ban-dieu-khien', `at=${g?.at} pos=${JSON.stringify(g?.pos)}`);
  nhatKy.actors = st?.actors ?? null;

  // Issue #17 — chibi hoá phải có TÁC DỤNG THẬT trên xương raw
  for (const id of ['owner', 'gen']) {
    const m = await page.evaluate((i) => window.stage.doXuong(i), id);
    const ty = m.chibi.tyLeDauNguoi;
    ghi(
      `chibi ${id}: tỉ lệ đầu/người trong 1/2,4–1/3,1 (đo trên XƯƠNG RAW)`,
      ty >= 2.4 && ty <= 3.1,
      `1/${ty} (rawHeadY=${m.chibi.rawHeadY} m, cao ${m.chibi.caoTong} m)`,
      m.chibi,
    );
  }
}

/* ------------------------------------------------- 2) ảnh bố cục 3 vùng */

in_('\n--- 2) ảnh bố cục: toàn cảnh + từng vùng (1440×900) ---');
// giấu bảng lệnh/HUD để thấy trọn sân khấu trong ảnh bố cục
await page.addStyleTag({ content: '#bang,#goi-y-phim,#hud,#toast{display:none!important}' });
await page.waitForTimeout(600);
for (const [ten, [vt, tam]] of Object.entries(GOC_VUNG)) {
  await page.evaluate(([v, t]) => window.stage.datMay(v, t), [vt, tam]);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${THU_MUC}/${ten}.png` });
  ghi(`ảnh ${ten}.png`, true, `máy ${JSON.stringify(vt)} → ${JSON.stringify(tam)}`);
}
// cận Gen đang làm việc ở bàn điều khiển
await page.evaluate(() => window.stage.datMay([3.4, 1.9, -1], [6, 1.2, -1]));
await page.waitForTimeout(1800);
await page.screenshot({ path: `${THU_MUC}/06-gen-ban-dieu-khien.png` });
ghi('ảnh 06-gen-ban-dieu-khien.png', true);

// khổ dọc điện thoại
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(2500);
// đặt máy THẲNG (không bay lerp): trên renderer phần mềm ~2 fps, một lệnh
// `camera.preset` lerp chưa kịp tới nơi thì ảnh chụp giữa đường bay.
await page.evaluate(() => window.stage.datMay([1.6, 5.4, 12.6], [0, 1.3, -2.2]));
await page.waitForTimeout(2000);
await page.screenshot({ path: `${THU_MUC}/04-mobile-390x844.png` });
ghi('ảnh 04-mobile-390x844.png', true);
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(1500);

/* ------------------------------- 3) ĐI LIÊN TỤC 3 s: 6 khung + số đo */

in_('\n--- 3) owner đi liên tục 3 s (steer mỗi 100 ms như giữ phím W) ---');
await page.evaluate(() => window.stage.datMay([4.6, 4.2, 7.6], [0, 1.1, 0]));
await page.waitForTimeout(1500);

const mau = [];
const t0 = Date.now();
const nhip = setInterval(() => {
  page
    .evaluate(() => window.stage.run('actor.steer', { actor: 'owner', vx: 0, vz: -1.6, ms: 180 }))
    .catch(() => undefined);
}, 100);
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(500);
  const d = await page.evaluate(() => {
    const x = window.stage.doXuong('owner');
    return { v: x.vanToc };
  });
  const st = await dc();
  const o = st && ai(st, 'owner');
  mau.push({
    khung: i,
    t: +((Date.now() - t0) / 1000).toFixed(2),
    pos: o?.pos,
    vx: d.v.vx,
    vz: d.v.vz,
    toc: d.v.toc,
    state: o?.state,
    at: o?.at,
    facing: o?.facing,
  });
  await page.screenshot({ path: `${THU_MUC}/05-di-${i}.png` });
  in_(`   khung ${i}: ${JSON.stringify(mau[i])}`);
}
clearInterval(nhip);
nhatKy.diLienTuc = mau;

// 3a. không khung nào ĐI LÙI (z phải giảm đều vì đi về -Z)
{
  let lui = null;
  for (let i = 1; i < mau.length; i++) {
    if (mau[i].pos[2] > mau[i - 1].pos[2] + 1e-6) lui = `khung ${i}: z ${mau[i - 1].pos[2]} → ${mau[i].pos[2]}`;
  }
  ghi('không khung nào đi lùi (z giảm đơn điệu)', lui === null, lui ?? 'z giảm đều suốt 6 khung');
}
// 3b. tốc độ TĂNG rồi ỔN ĐỊNH (không tụt giữa chừng)
{
  let tut = null;
  for (let i = 1; i < mau.length; i++) {
    if (mau[i].toc < mau[i - 1].toc - 1e-6) tut = `khung ${i}: ${mau[i - 1].toc} → ${mau[i].toc} m/s`;
  }
  const dinh = Math.max(...mau.map((m) => m.toc));
  ghi('tốc độ đơn điệu tăng rồi ổn định', tut === null, tut ?? `đỉnh ${dinh} m/s`, { dinh });
  ghi('tốc độ ổn định đúng trần 1,6 m/s', Math.abs(dinh - 1.6) < 0.01, `đỉnh = ${dinh} m/s`);
}
// 3c. suốt lúc đi: state walking, at null
{
  const sai = mau.filter((m) => m.state !== 'walking' || m.at !== null);
  ghi(
    'suốt lúc đi: state = walking và at = null',
    sai.length === 0,
    sai.length ? JSON.stringify(sai) : '6/6 khung đúng',
  );
}
// 3d. nhả phím → dừng êm, về idle, at có lại
{
  await page.waitForTimeout(1600);
  const st = await dc();
  const o = st && ai(st, 'owner');
  const d = await page.evaluate(() => window.stage.doXuong('owner'));
  ghi(
    'nhả phím: dừng hẳn và về idle',
    o?.state === 'idle' && d.vanToc.toc === 0,
    `state=${o?.state} |v|=${d.vanToc.toc} pos=${JSON.stringify(o?.pos)}`,
    { state: o?.state, v: d.vanToc, pos: o?.pos },
  );
  nhatKy.sauKhiNha = { state: o?.state, pos: o?.pos, at: o?.at, v: d.vanToc };
}

/* --------------------------------- 4) camera `theo-owner` bám khi đi */

in_('\n--- 4) camera preset theo-owner ---');
{
  const r = await mo('camera.preset', { name: 'theo-owner' });
  ghi('camera.preset theo-owner chạy được', r.ok === true, r.ok ? '' : r.error);
  const nhip2 = setInterval(() => {
    page
      .evaluate(() => window.stage.run('actor.steer', { actor: 'owner', vx: -1.6, vz: 0, ms: 180 }))
      .catch(() => undefined);
  }, 100);
  await page.waitForTimeout(3000);
  clearInterval(nhip2);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${THU_MUC}/07-theo-owner.png` });
  ghi('ảnh 07-theo-owner.png', true);
}

/* ------------------------------- 5) không đi xuyên bàn điều khiển */

in_('\n--- 5) lái thẳng vào bàn điều khiển: phải dừng TRƯỚC bàn ---');
{
  await mo('actor.moveTo', { actor: 'owner', to: [5, 0, -1], interrupt: true });
  await page.waitForTimeout(5000);
  const nhip3 = setInterval(() => {
    page
      .evaluate(() => window.stage.run('actor.steer', { actor: 'owner', vx: 1.6, vz: 0, ms: 180 }))
      .catch(() => undefined);
  }, 100);
  await page.waitForTimeout(6000);
  clearInterval(nhip3);
  await page.waitForTimeout(1200);
  const st = await dc();
  const o = st && ai(st, 'owner');
  // mép trái hộp bàn = 6 − 0,9/2 = 5,55 m; thân người bán kính 0,34 m
  const gioiHan = 5.55 - 0.3;
  ghi(
    'bị bàn điều khiển chặn, không lọt vào trong (x < 5,25)',
    (o?.pos?.[0] ?? 99) < gioiHan,
    `x = ${o?.pos?.[0]} (mép hộp bàn 5,55 m)`,
    { pos: o?.pos },
  );
  nhatKy.vaCham = { pos: o?.pos, gioiHan };
}

/* ------------------------------------------------------- 6) console sạch */

ghi('console 0 lỗi', loi.length === 0, loi.length ? JSON.stringify(loi.slice(0, 5)) : '0 lỗi');
nhatKy.loiConsole = loi;
nhatKy.tongKet = { soBuoc, soOk, thatBai };
writeFileSync(`${THU_MUC}/nhat-ky-kiem-b1.json`, JSON.stringify(nhatKy, null, 2) + '\n');

in_(`\n==> ${soOk}/${soBuoc} bước đạt. Ảnh + log: ${THU_MUC}/`);
if (thatBai.length) in_('==> CHƯA ĐẠT:\n   - ' + thatBai.join('\n   - '));

await browser.close();
server?.kill('SIGTERM');
process.exit(thatBai.length ? 1 : 0);
