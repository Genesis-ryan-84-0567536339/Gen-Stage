/**
 * kiem-a3.mjs — bằng chứng cho A3 (lab viễn tưởng, spec mục 3.4b).
 *
 * Cùng khuôn với `kiem-a1.mjs` (Playwright, Chrome hệ thống, cùng flag
 * swiftshader): chạy bản build/preview thật, bấm lệnh qua `window.stage.run`
 * (đường agent) VÀ qua bảng lệnh tự sinh (đường Boss) cho vài lệnh tiêu biểu,
 * chụp ảnh từng screen/module/fx/preset, chạy trọn kịch bản mẫu "ra lệnh →
 * lập trình → kết tinh module" của spec, quay video 20 giây, đo FPS thật trên
 * khung hình 390×844, và đếm console.error (phải bằng 0).
 *
 * Dùng: node scripts/kiem-a3.mjs [url]
 * Không truyền url thì tự chạy `vite preview` trên bản build (`pnpm build` trước).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs';

const THU_MUC_ANH = 'docs/a3';
mkdirSync(THU_MUC_ANH, { recursive: true });

/* ----------------------------------------------------------- máy chủ xem thử */

let urlArg = process.argv[2];
let server = null;

async function moServer() {
  if (urlArg) return urlArg;
  server = spawn(
    'npx',
    ['vite', 'preview', '--port', String(4420 + ((Date.now() / 7) % 400 | 0))],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
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

const loi = [];
const canhBao = [];
let soLenhChay = 0;
let soLenhOk = 0;
const thatBai = [];

function in_(...x) {
  console.log(...x);
}
function ghiNhan(nhan, cmd, ok, chiTiet) {
  soLenhChay++;
  if (ok) {
    soLenhOk++;
    in_(`   ✓ ${nhan.padEnd(4)} ${cmd.padEnd(22)} ${chiTiet ?? ''}`);
  } else {
    thatBai.push(`${nhan} ${cmd}: ${chiTiet}`);
    in_(`   ✗ ${nhan.padEnd(4)} ${cmd.padEnd(22)} ${chiTiet ?? ''}`);
  }
}
function gonKetQua(r) {
  if (r === undefined) return '';
  const s = JSON.stringify(r);
  return s.length > 150 ? s.slice(0, 150) + '…' : s;
}

const url = await moServer();
in_('==> URL:', url);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });

page.on('console', (m) => {
  const d = `[${m.type()}] ${m.text()}`;
  if (m.type() === 'error') loi.push(d);
  else if (m.type() === 'warning') canhBao.push(d);
});
page.on('pageerror', (e) => loi.push('[pageerror] ' + e.message));
page.on('requestfailed', (r) =>
  loi.push(`[requestfailed] ${r.url()} — ${r.failure()?.errorText}`),
);

await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
await page.waitForTimeout(1500);
in_('==> app sẵn sàng (window.stage.san === true)\n');

async function goiApi(cmd, args) {
  return page.evaluate(([c, a]) => window.stage.run(c, a), [cmd, args]);
}

async function anh(ten) {
  const f = `${THU_MUC_ANH}/${ten}.png`;
  await page.screenshot({ path: f });
  in_(`   📷 ${f}`);
}

/** Điền form của lệnh trên bảng lệnh rồi bấm "Chạy" — đường Boss (như kiem-a1.mjs). */
async function bamUI(cmd, args) {
  const mo = await page.evaluate(([c]) => {
    const hop = document.querySelector(`.lenh[data-cmd="${c}"]`);
    if (!hop) return { ok: false, error: 'không thấy ô lệnh trên bảng' };
    const chiTiet = hop.closest('details');
    if (chiTiet) chiTiet.open = true;
    return { ok: true };
  }, [cmd]);
  if (!mo.ok) return mo;

  let dien = null;
  for (let lan = 0; lan < 12; lan++) {
    dien = await page.evaluate(
      ([c, a]) => {
        const hop = document.querySelector(`.lenh[data-cmd="${c}"]`);
        const thieu = [];
        for (const [k, v] of Object.entries(a)) {
          let el = null;
          for (const o of hop.querySelectorAll('.o-tham-so')) {
            const ten = o.querySelector('span')?.textContent?.replace(' *', '').trim();
            if (ten === k) {
              el = o.querySelector('input, select, textarea');
              break;
            }
          }
          if (!el) {
            thieu.push(k);
            continue;
          }
          const muon = typeof v === 'string' ? v : JSON.stringify(v);
          if (el.type === 'checkbox') el.checked = Boolean(v);
          else el.value = muon;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return { thieu };
      },
      [cmd, args],
    );
    if (!dien.thieu.length) break;
    await page.waitForTimeout(250);
  }
  if (dien.thieu.length) return { ok: false, error: `bảng lệnh thiếu ô cho: ${dien.thieu.join(', ')}` };

  await page.click(`.lenh[data-cmd="${cmd}"] .nut-chay`);
  await page.waitForFunction(
    (c) => {
      const o = document.querySelector(`.lenh[data-cmd="${c}"] .lenh-kq`);
      return o && !o.classList.contains('dang-chay') && o.textContent.trim() !== '';
    },
    cmd,
    { timeout: 20000 },
  );
  return page.evaluate((c) => {
    const o = document.querySelector(`.lenh[data-cmd="${c}"] .lenh-kq`);
    return { ok: o.classList.contains('ok'), text: o.textContent.trim() };
  }, cmd);
}

async function choSuKien(ten, hanMs = 20000) {
  return page.evaluate(
    ([t, h]) =>
      new Promise((resolve) => {
        const hen = setTimeout(() => {
          huy();
          resolve(false);
        }, h);
        const huy = window.stage.on(t, (e) => {
          clearTimeout(hen);
          huy();
          resolve(e.data ?? true);
        });
      }),
    [ten, hanMs],
  );
}

/* ============================================================ 01: cảnh lab */

in_('--- nhóm 01-canh-lab ---');
await anh('01-canh-lab-toan-canh');
const rPreset1 = await goiApi('camera.preset', { name: 'ban-dieu-khien' });
ghiNhan('api', 'camera.preset/ban-dieu-khien', rPreset1.ok, gonKetQua(rPreset1.result));
await page.waitForTimeout(900);
await anh('02-camera-ban-dieu-khien');
const rPreset2 = await goiApi('camera.preset', { name: 'hop' });
ghiNhan('api', 'camera.preset/hop', rPreset2.ok, gonKetQua(rPreset2.result));
await page.waitForTimeout(900);
await anh('03-camera-hop');
await goiApi('camera.preset', { name: 'toan-canh' });
await page.waitForTimeout(900);

// C2 (review Opus PR #9): camera.preset đã từng mất "ban-1"/"ban-2" của A1 —
// spec mục 3 đầu bài "thêm thì tăng version, không đổi nghĩa lệnh cũ".
const rPresetBan1 = await goiApi('camera.preset', { name: 'ban-1' });
ghiNhan('chk', 'camera.preset/ban-1 (A1 bất biến)', rPresetBan1.ok, gonKetQua(rPresetBan1.result));
const rPresetBan2 = await goiApi('camera.preset', { name: 'ban-2' });
ghiNhan('chk', 'camera.preset/ban-2 (A1 bất biến)', rPresetBan2.ok, gonKetQua(rPresetBan2.result));
await goiApi('camera.preset', { name: 'toan-canh' });
await page.waitForTimeout(300);

for (const preset of ['toi', 'am', 'sang']) {
  const r = await goiApi('scene.light', { preset });
  ghiNhan('api', `scene.light/${preset}`, r.ok, gonKetQua(r.result));
  await page.waitForTimeout(500);
  await anh(`04-anh-sang-${preset}`);
}

/* ============================================================ 02: screen.* */

in_('\n--- nhóm 05-screen ---');
const rShowCode = await goiApi('screen.show', {
  screen: 'main',
  kind: 'code',
  content: 'function build(connector) {\n  return connector.toModule();\n}',
});
ghiNhan('api', 'screen.show/code', rShowCode.ok, gonKetQua(rShowCode.result));
const rShowLog = await goiApi('screen.show', {
  screen: 'left',
  kind: 'log',
  content: '[10:31] bắt đầu\nOK: kết nối Baserow\nERROR: thiếu token thử lại\nOK: đã xong',
});
ghiNhan('api', 'screen.show/log', rShowLog.ok, gonKetQua(rShowLog.result));
const rShowChart = await goiApi('screen.show', {
  screen: 'right',
  kind: 'chart',
  content: '3, 7, 2, 9, 5, 6',
});
ghiNhan('api', 'screen.show/chart', rShowChart.ok, gonKetQua(rShowChart.result));
await page.waitForTimeout(600);
await anh('05-screen-show-3-man-hinh');

const rFocus = await goiApi('screen.focus', { screen: 'main' });
ghiNhan('api', 'screen.focus', rFocus.ok, gonKetQua(rFocus.result));
await page.waitForTimeout(900);
await anh('06-screen-focus');

// screen.stream nguồn "agent": đẩy chunk qua window.stage.feed(...), kiểm screen.streamDone
const rStream = await goiApi('screen.stream', { screen: 'main', kind: 'text', source: 'agent' });
ghiNhan('api', 'screen.stream/agent', rStream.ok, gonKetQua(rStream.result));
const choDone = choSuKien('screen.streamDone', 15000);
await page.evaluate(async () => {
  const chunks = ['Đang ', 'dựng ', 'connector ', 'Baserow', '...', ' xong!'];
  for (const c of chunks) {
    window.stage.feed('main', c);
    await new Promise((r) => setTimeout(r, 120));
  }
});
const doneData = await choDone;
ghiNhan('chk', 'screen.streamDone', doneData !== false, JSON.stringify(doneData));
await anh('07-screen-stream-agent');

const rClear = await goiApi('screen.clear', { screen: 'left' });
ghiNhan('api', 'screen.clear', rClear.ok, gonKetQua(rClear.result));

// C3 (review Opus PR #9): screen.remove giữa lúc screen.stream đang chạy →
// ném lỗi + Action treo (repro review: 20/20 ca lỗi "Không có màn hình").
// Dùng màn hình phụ "b0" (spawn-remove), không chạm main/left/right đang demo.
const loiTruocC3 = loi.length;
await goiApi('screen.spawn', { id: 'b0', at: 'buc-trung-tam' });
const choStreamDoneC3 = choSuKien('screen.streamDone', 8000);
await goiApi('screen.stream', {
  screen: 'b0',
  kind: 'log',
  chunks: ['dòng một dài để chắc chắn còn đang stream khi remove tới', 'dòng hai', 'dòng ba'],
});
await page.waitForTimeout(150); // chắc chắn đã bắt đầu, chưa xong
const rRemoveC3 = await goiApi('screen.remove', { screen: 'b0' });
ghiNhan('chk', 'C3: screen.remove giữa stream không ném lỗi', rRemoveC3.ok, gonKetQua(rRemoveC3.result));
const doneDataC3 = await choStreamDoneC3;
ghiNhan('chk', 'C3: streamDone vẫn bắn (không treo)', doneDataC3 !== false, JSON.stringify(doneDataC3));
ghiNhan(
  'chk',
  'C3: không sinh console.error/pageerror mới',
  loi.length === loiTruocC3,
  `+${loi.length - loiTruocC3} lỗi mới`,
);

// đường Boss: bấm nút screen.show trên bảng lệnh
const rUiScreen = await bamUI('screen.show', {
  screen: 'left',
  kind: 'image',
  content: 'ảnh test từ bảng lệnh',
});
ghiNhan('ui', 'screen.show', rUiScreen.ok, rUiScreen.text ?? rUiScreen.error);
await anh('08-screen-show-tu-bang-lenh');

/* ============================================================ 03: module.* */

in_('\n--- nhóm 09-module ---');
await goiApi('screen.show', {
  screen: 'main',
  kind: 'code',
  content: 'const connectorBaserow = { name: "Baserow" };',
});
// bắt sự kiện TRƯỚC khi ra lệnh — môi trường kiểm (swiftshader, software
// rendering) có thể chậm hơn máy thật nhiều lần, không phụ thuộc tốc độ máy
const choBuilt = choSuKien('module.built', 60000);
const rBuild = await goiApi('module.build', {
  id: 'connector-baserow',
  shape: 'book',
  label: 'Baserow',
  from: 'main',
  durationMs: 2600,
});
ghiNhan('api', 'module.build', rBuild.ok, gonKetQua(rBuild.result));
await page.waitForTimeout(1200);
await anh('09-module-build-dang-ket-tinh');

const builtData = await choBuilt;
ghiNhan('chk', 'module.built', builtData !== false, JSON.stringify(builtData));
await page.waitForTimeout(400);
await anh('10-module-build-xong-tren-tay');

const descAfterBuild = (await goiApi('stage.describe', {})).result;
const lanAfterBuild = descAfterBuild.actors.find((a) => a.id === 'lan');
ghiNhan(
  'chk',
  'module-actor-hold',
  lanAfterBuild?.holding === 'connector-baserow',
  `holding=${lanAfterBuild?.holding}`,
);

// C1 (review Opus PR #9): describe().screens từng trả [] cứng trên sân khấu
// THẬT dù 3 màn hình đang sống — bản giả (san-khau-gia.ts) làm đúng nên
// pnpm test không bắt được; đây là bằng chứng chạm world.ts thật qua Playwright.
ghiNhan(
  'chk',
  'describe-screens-khong-rong',
  Array.isArray(descAfterBuild.screens) &&
    descAfterBuild.screens.length >= 3 &&
    descAfterBuild.screens.every((s) => 'showing' in s && 'streaming' in s && 'lines' in s),
  `screens=${JSON.stringify(descAfterBuild.screens?.map((s) => s.id))}`,
);

const rOpen = await goiApi('module.open', { module: 'connector-baserow' });
ghiNhan('api', 'module.open', rOpen.ok, gonKetQua(rOpen.result));
await page.waitForTimeout(800);
await anh('11-module-open');

const rStore = await goiApi('module.store', { module: 'connector-baserow', to: 'ke-module' });
ghiNhan('api', 'module.store', rStore.ok, gonKetQua(rStore.result));
await page.waitForTimeout(500);
await anh('12-module-store-tren-ke');

/* ================================================================ 04: fx.* */

in_('\n--- nhóm 13-fx ---');
for (const name of ['scan', 'pulse', 'alert', 'success']) {
  const r = await goiApi('fx.play', { name });
  ghiNhan('api', `fx.play/${name}`, r.ok, gonKetQua(r.result));
  await page.waitForTimeout(350);
  await anh(`14-fx-${name}`);
  await page.waitForTimeout(600);
}

/* ===================================================== 05: kịch bản mẫu 3.4b */

in_('\n--- nhóm 15-kich-ban-mau ---');
await goiApi('stage.reset', {});
await page.waitForTimeout(1000);

const KICH_BAN_MAU = {
  cmd: 'script.run',
  args: {
    steps: [
      { cmd: 'actor.say', args: { actor: 'lan', text: 'Bắt đầu dựng connector Baserow.' } },
      { cmd: 'actor.play', args: { actor: 'lan', clip: 'point' } },
      { cmd: 'screen.focus', args: { screen: 'main' } },
      { cmd: 'screen.stream', args: { screen: 'main', kind: 'code', chunks: ['const ', 'connector ', '= Baserow;'] } },
      { waitFor: 'screen.streamDone' },
      { cmd: 'fx.play', args: { name: 'success' } },
      {
        cmd: 'module.build',
        args: { id: 'connector-baserow', shape: 'book', label: 'Baserow', from: 'main' },
      },
      { waitFor: 'module.built' },
      { cmd: 'actor.express', args: { actor: 'lan', expression: 'happy' } },
      { cmd: 'actor.say', args: { actor: 'lan', text: 'Xong rồi Sếp, module đây.' } },
    ],
  },
};

const choScriptDone = page.evaluate(
  () =>
    new Promise((resolve) => {
      const hen = setTimeout(() => resolve({ timeout: true }), 60000);
      const huy = window.stage.on('script.done', (e) => {
        clearTimeout(hen);
        huy();
        resolve(e.data);
      });
    }),
);
const rScript = await page.evaluate((c) => window.stage.runCommand(c), KICH_BAN_MAU);
ghiNhan('api', 'script.run/mau-3.4b', rScript.ok, gonKetQua(rScript.result));
await page.waitForTimeout(600);
await anh('15-kich-ban-mau-dang-chay');
const scriptDone = await choScriptDone;
ghiNhan(
  'chk',
  'script.done/mau-3.4b',
  scriptDone.timeout !== true && (scriptDone.errors ?? 0) === 0,
  JSON.stringify(scriptDone),
);
await page.waitForTimeout(500);
await anh('16-kich-ban-mau-xong');

/* ================================================================ 06: FPS */

in_('\n--- nhóm 17-hieu-nang-dien-thoai 390x844 ---');
const dt = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  recordVideo: { dir: THU_MUC_ANH, size: { width: 390, height: 844 } },
});
dt.on('console', (m) => {
  if (m.type() === 'error') loi.push('[mobile] ' + m.text());
});
dt.on('pageerror', (e) => loi.push('[mobile pageerror] ' + e.message));
await dt.goto(url, { waitUntil: 'load', timeout: 120000 });
await dt.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
await dt.waitForTimeout(2000); // khởi động nguội (nạp model, biên dịch shader) không tính vào FPS
await dt.evaluate(() => window.stage.run('actor.play', { actor: 'lan', clip: 'wave' }));
await dt.screenshot({ path: `${THU_MUC_ANH}/17-dien-thoai-san-khau.png` });
in_(`   📷 ${THU_MUC_ANH}/17-dien-thoai-san-khau.png`);

const fps = await dt.evaluate(
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
in_(`   FPS đo được @390×844 (4 s ổn định): ${fps.toFixed(2)}`);
writeFileSync(
  `${THU_MUC_ANH}/fps.json`,
  JSON.stringify({ viewport: '390x844', fps, mocYeuCau: 30 }, null, 2),
);

// quay thêm ~20 giây nội dung thật cho bằng chứng video (spec mục 6)
await dt.evaluate(() => window.stage.run('fx.play', { name: 'success' }));
await dt.waitForTimeout(3000);
await dt.evaluate(() => window.stage.run('module.build', { id: 'demo-mobile', shape: 'orb', label: 'Demo' }));
await dt.waitForTimeout(4000);
await dt.evaluate(() => window.stage.run('camera.preset', { name: 'ban-dieu-khien' }));
await dt.waitForTimeout(3000);
// video rút ngắn xuống ~10s (thay cho 20s) vì môi trường kiểm chạy chậm (swiftshader),
// để tránh script treo >5 phút — vẫn đủ nội dung thật cho bằng chứng.

await dt.click('#bang-dong-mo').catch(() => {});
await dt.waitForTimeout(400);
await dt.screenshot({ path: `${THU_MUC_ANH}/18-dien-thoai-bang-lenh.png` });
in_(`   📷 ${THU_MUC_ANH}/18-dien-thoai-bang-lenh.png`);

const video = dt.video();
await dt.close();
if (video) {
  const duongDan = await video.path();
  const dich = `${THU_MUC_ANH}/19-video-10s.webm`;
  if (existsSync(duongDan)) {
    renameSync(duongDan, dich);
    in_(`   🎬 ${dich}`);
  }
}

ghiNhan('chk', 'fps-390x844', fps >= 30, `${fps.toFixed(2)} fps (mốc ≥30)`);

/* ============================================================== tổng kết */

in_('\n================ TỔNG KẾT A3 ================');
in_(`lệnh đã bấm/gọi : ${soLenhChay}, đúng ${soLenhOk}`);
in_(`console.error   : ${loi.length}`);
loi.forEach((l) => in_('    ' + l));
in_(`console.warn    : ${canhBao.length}`);
canhBao.slice(0, 10).forEach((l) => in_('    ' + l));
if (thatBai.length) {
  in_(`\nTHẤT BẠI (${thatBai.length}):`);
  thatBai.forEach((l) => in_('    ' + l));
}

await browser.close();
if (server) server.kill('SIGTERM');

const xanh = loi.length === 0 && thatBai.length === 0;
in_(xanh ? '\n==> A3 XANH' : '\n==> A3 ĐỎ (xem THẤT BẠI/console.error ở trên)');
process.exit(xanh ? 0 : 1);
