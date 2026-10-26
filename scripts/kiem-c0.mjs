/**
 * kiem-c0.mjs — BẰNG CHỨNG C0 (#28): Gen có phản xạ như người + nhân vật nam anime.
 *
 * Chạy (**một lần** — xem cờ khoá `docs/c0/.da-chay`):
 *   node scripts/kiem-c0.mjs           # trọn bộ
 *   node scripts/kiem-c0.mjs --lai     # xoá cờ khoá rồi chạy lại
 *
 * Dựng thật, không giả lập chỗ nào:
 *   Playwright + Chrome hệ thống → app thật (swiftshader, autoplay, ?bridge=1)
 *   bridge ws+tts+MCP trên cổng RIÊNG 8797/8798/8799 (không đụng 8787 của Boss)
 *   scripts/nao-demo.mjs → não rule-based nối MCP **stdio thật**
 *
 * Năm việc phải chứng minh:
 *   1. KHÔNG não: Sếp gõ "Gen ơi" → Gen quay về Sếp (đo `facing` theo thời
 *      gian, phản ứng ≤ 300 ms) + câu đệm có `durationMs` > 0.
 *   2. Sếp lái lại gần Gen → `lookingAt` đổi sang `owner`.
 *   3. CÓ não (nao-demo): câu đệm bị **cắt** khi não nói.
 *   4. `describe().brainConnected` đúng cả hai trường hợp.
 *   5. Nhân vật nam anime: ảnh 2 nhân vật cạnh nhau + **hướng mặt không ngược**
 *      (vector mặt cùng chiều vận tốc khi đi).
 *
 * Ra trong `docs/c0/`:
 *   01-gen-quay-lai.png      Gen vừa quay mặt về Sếp (emote chu-y)
 *   02-cau-dem.png           Gen đang nói câu đệm (bong bóng chữ)
 *   03-owner-lai-gan.png     Sếp đứng cạnh, Gen nhìn theo
 *   04-hai-nhan-vat.png      hai nhân vật cạnh nhau, chính diện (cùng chibi)
 *   05-hai-nhan-vat-ngang.png góc ngang — kiểm mặt/tóc và hướng quay
 *   06-owner-di-toi.png      Sếp đang đi: mặt hướng về phía đi, không đi lùi
 *   07-mobile-390.png        màn hẹp
 *   08-nhin-may-quay.png     Gen nói với Sếp sau khi ĐỔI góc máy giữa câu
 *   09/10-nhin-nhau-*.png    Javis nói với Gen: hai nhân vật nhìn nhau, 2 góc máy
 *   nhat-ky-kiem-c0.json     SỐ: facing theo thời gian, độ trễ ms, durationMs,
 *                            brainConnected, hướng mặt, lỗi console
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect as netConnect } from 'node:net';
import { WebSocket } from 'ws';

const THU_MUC = 'docs/c0';
mkdirSync(THU_MUC, { recursive: true });

const argv = process.argv.slice(2);
const urlArg = argv.find((a) => a.startsWith('http'));

/* ------------------------------------------------- cờ khoá chạy một lần */

const CO_KHOA = `${THU_MUC}/.da-chay`;
if (argv.includes('--lai')) {
  if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
} else if (existsSync(CO_KHOA)) {
  console.error(
    `\n⛔ ${CO_KHOA} đã tồn tại — kiểm C0 chỉ chạy MỘT LẦN sau khi code xong.\n` +
      `   Kết quả lượt trước: ${THU_MUC}/nhat-ky-kiem-c0.json + ảnh trong ${THU_MUC}/.\n` +
      '   Thật sự cần chạy lại: node scripts/kiem-c0.mjs --lai\n',
  );
  process.exit(2);
}
writeFileSync(CO_KHOA, new Date().toISOString() + '\n');

/* ------------------------------------------------------------- tiện ích */

/** Cổng RIÊNG: máy Boss thường đã có `pnpm bridge` thật ở 8787/8788/8789. */
const CONG_WS = Number(process.env.GEN_STAGE_PORT ?? 8797);
const CONG_TTS = Number(process.env.GEN_STAGE_TTS_PORT ?? 8798);
const CONG_MCP = Number(process.env.GEN_STAGE_MCP_PORT ?? 8799);
const MOI_TRUONG = {
  ...process.env,
  GEN_STAGE_PORT: String(CONG_WS),
  GEN_STAGE_TTS_PORT: String(CONG_TTS),
  GEN_STAGE_MCP_PORT: String(CONG_MCP),
};

const in_ = (...x) => console.log(...x);
const loiConsole = [];
const thatBai = [];
const nhatKy = {
  chay: new Date().toISOString(),
  cong: { ws: CONG_WS, tts: CONG_TTS, mcp: CONG_MCP },
  buoc: [],
};
let soBuoc = 0;
let soOk = 0;

function ghi(nhan, ok, chiTiet, so) {
  soBuoc++;
  if (ok) soOk++;
  else thatBai.push(`${nhan}: ${chiTiet ?? ''}`);
  nhatKy.buoc.push({ nhan, ok, chiTiet: chiTiet ?? null, ...(so ? { so } : {}) });
  in_(`   ${ok ? '✓' : '✗'} ${nhan} ${chiTiet ?? ''}`);
}

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
/** Lệch góc nhỏ nhất giữa hai hướng (độ). */
const lechGoc = (a, b) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

/* -------------------------------------------------------- bridge + vite */

/**
 * Cổng bận = **dừng ngay**, đừng chạy tiếp.
 *
 * Đã bị một lần: một bridge cũ còn sống ôm 8797, bridge mới chết lặng lẽ, rồi
 * trình duyệt nối vào bridge CŨ còn não nối vào chỗ khác — `brainConnected`
 * sai mà không ai biết vì sao. Thà chết sớm với một câu rõ ràng.
 */
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

for (const c of [CONG_WS, CONG_TTS, CONG_MCP]) {
  if (await congBan(c)) {
    console.error(
      `\n⛔ Cổng ${c} đang bận — có bridge cũ chưa tắt.\n` +
        `   Dọn: pkill -f "bridge/server.ts" ; pkill -f "vite preview"\n`,
    );
    process.exit(3);
  }
}

let bridge = null;
async function moBridge() {
  bridge = spawn('npx', ['tsx', 'bridge/server.ts'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: MOI_TRUONG,
    detached: true, // để `dietCay` giết được cả nhóm (npx → tsx → node)
  });
  const dong = [];
  const doc = (d) => {
    const s = String(d);
    dong.push(s);
    process.stdout.write('   [bridge] ' + s);
  };
  bridge.stdout.on('data', doc);
  bridge.stderr.on('data', doc);
  for (let i = 0; i < 60; i++) {
    if ((await khoe(CONG_TTS)) && (await khoe(CONG_MCP))) return dong;
    await nghi(500);
  }
  throw new Error(`bridge không lên (ws ${CONG_WS} / tts ${CONG_TTS} / mcp ${CONG_MCP})`);
}

async function khoe(cong) {
  try {
    const r = await fetch(`http://127.0.0.1:${cong}/khoe`);
    return r.ok;
  } catch {
    return false;
  }
}

let server = null;
async function moServer() {
  if (urlArg) return urlArg;
  const port = 4910 + ((Date.now() / 7) % 180 | 0);
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  return await new Promise((resolve, reject) => {
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
}

let nao = null;
/**
 * `npx` KHÔNG truyền tín hiệu xuống tiến trình con (`tsx bridge/server.ts`),
 * nên `kill` suông để lại một bridge sống ôm cổng 8797 — lượt chạy sau thấy
 * EADDRINUSE rồi nối nhầm vào bridge cũ. Giết cả nhóm tiến trình.
 */
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

function dongHet(ma) {
  dietCay(nao);
  dietCay(server);
  dietCay(bridge);
  setTimeout(() => process.exit(ma), 400);
}

/* ---------------------------------------------------------------- chạy */

const dongBridge = await moBridge();
ghi('bridge bật ws + tts + mcp trên cổng riêng', dongBridge.some((d) => d.includes('[mcp ]')), `ws ${CONG_WS}`);

const goc = await moServer();
const url = `${goc.replace(/\/$/, '')}/?bridge=1&bridgePort=${CONG_WS}&ttsPort=${CONG_TTS}`;
in_('==> URL:', url);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') loiConsole.push(`[console] ${m.text()}`);
});
page.on('pageerror', (e) => loiConsole.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) =>
  loiConsole.push(`[requestfailed] ${r.url()} — ${r.failure()?.errorText}`),
);

await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
in_('==> sân khấu sẵn sàng');

await page.evaluate(() => {
  window.__c0 = [];
  window.stage.on('*', (e) => window.__c0.push({ t: e.t, event: e.event, data: e.data }));
});
await page.evaluate(() => window.stage.batTieng());
// đèn dịu: preset "sáng" + bloom làm cháy trắng mặt khi chụp cận (đã thấy ở B3)
await page.evaluate(() => window.stage.run('scene.light', { preset: 'am' }));
await nghi(1500);

const noiBridge = await page.evaluate(() =>
  window.__c0.some((e) => e.event === 'bridge.connected'),
);
ghi('trình duyệt nối bridge', noiBridge === true, `cổng ws ${CONG_WS}`);

/* ---------------------------------------- tiện ích đọc trạng thái + ảnh */

async function trangThai() {
  return await page.evaluate(async () => {
    const r = await window.stage.describe();
    if (!r.ok) return null;
    const a = (id) => r.result.actors.find((x) => x.id === id) ?? null;
    return {
      brainConnected: r.result.brainConnected,
      camera: r.result.camera,
      owner: a('owner'),
      gen: a('gen'),
    };
  });
}

/** Góc (độ) từ `a` nhìn sang điểm `p` — chuẩn so với `facing` của sân khấu. */
function gocToi(a, p) {
  return ((Math.atan2(p[0] - a.pos[0], p[2] - a.pos[2]) * 180) / Math.PI + 360) % 360;
}
/** Góc từ Gen sang MÁY QUAY — nơi Sếp đang đứng xem (spec 3.2d). */
function gocToiMay(st) {
  return gocToi(st.gen, st.camera.pos);
}

async function datMay(id, kieu = 'gan') {
  const m = await page.evaluate((x) => window.stage.doXuong(x), id);
  if (!m?.neck) return;
  const [x, , z] = m.neck;
  const cao = m.bbox?.[1] ?? 1.2;
  const vt =
    kieu === 'gan'
      ? [x + 0.3, m.neck[1] + 0.15, z + 1.6]
      : [x + 1.2, cao * 1.5, z + 3.4];
  await page.evaluate(
    ({ vt, tam }) => window.stage.datMay(vt, tam),
    { vt, tam: [x, cao * (kieu === 'gan' ? 0.62 : 0.6), z] },
  );
  await nghi(450);
}

/* ===================================================================== */
/* 4a. brainConnected khi CHƯA có não                                     */
/* ===================================================================== */

const st0 = await trangThai();
ghi(
  'describe.brainConnected = false khi chưa có não MCP',
  st0?.brainConnected === false,
  `brainConnected=${st0?.brainConnected}`,
  { brainConnected: st0?.brainConnected },
);

/* ===================================================================== */
/* 1. KHÔNG não: Sếp gõ "Gen ơi" → Gen quay lại ≤ 300 ms + câu đệm         */
/* ===================================================================== */

in_('\n--- 1) không có não: Sếp gõ "Gen ơi" ---');
const truoc = await trangThai();
const facing0 = truoc.gen.facing;
const nhinTruocKhiGoi = truoc.gen.lookingAt;
const mucTieu = gocToiMay(truoc);
const lech0 = lechGoc(facing0, mucTieu);

const t0 = Date.now();
await page.fill('#o-chat-nhap', 'Gen ơi');
await page.press('#o-chat-nhap', 'Enter');

/** Đo `facing` của Gen mỗi ~60 ms trong 4 s. */
const mau = [];
let anhQuay = false;
for (let i = 0; i < 70; i++) {
  const st = await trangThai();
  if (!st) break;
  mau.push({
    ms: Date.now() - t0,
    facing: st.gen.facing,
    lech: +lechGoc(st.gen.facing, gocToiMay(st)).toFixed(1),
    state: st.gen.state,
    lookingAt: st.gen.lookingAt,
    facingTarget: st.gen.facingTarget,
  });
  if (!anhQuay && lechGoc(st.gen.facing, gocToiMay(st)) < lech0 - 10) {
    await page.screenshot({ path: `${THU_MUC}/01-gen-quay-lai.png` });
    anhQuay = true;
  }
  await nghi(60);
}

const batDauQuay = mau.find((m) => Math.abs(m.facing - facing0) > 1.5);
const nhinSom = mau.find((m) => m.lookingAt !== nhinTruocKhiGoi);
const lechCuoi = mau[mau.length - 1]?.lech ?? 999;
nhatKy.facingTheoThoiGian = mau;

/**
 * Độ trễ ĐO BẰNG NHẬT KÝ LỆNH, không bằng khung hình.
 *
 * Máy kiểm chạy renderer phần mềm (swiftshader) ~1–3 fps, nên `facing` trong
 * `describe` chỉ đổi ở khung hình kế tiếp — có thể 300–600 ms sau. Lời hứa của
 * spec là "**phản xạ ra lệnh** trong ≤ 300 ms", và nhật ký lệnh là chỗ duy
 * nhất đo đúng cái đó. Đường cong `facing` vẫn ghi lại đầy đủ ở trên.
 */
const logPhanXa = JSON.parse(await page.evaluate(() => window.stage.log()));
const lenhCua = (log, loc) => (log.banGhi ?? []).filter((l) => l.loai === 'lenh' && loc(l));
const skUserText = (logPhanXa.banGhi ?? []).find(
  (l) => l.loai === 'su-kien' && l.event === 'user.text' && l.t >= t0,
);
const tUt = skUserText?.t ?? t0;
const lenhSau = lenhCua(logPhanXa, (l) => l.nguon === 'phan-xa' && l.t >= tUt);
const treDau = lenhSau.length ? lenhSau[0].t - tUt : null;
const coLook = lenhSau.find((l) => l.cmd === 'actor.lookAt');
const coFace = lenhSau.find((l) => l.cmd === 'actor.faceTo' && l.args?.actor === 'gen');
const coEmote = lenhSau.find((l) => l.cmd === 'actor.emote');
ghi(
  'phản xạ ra lệnh lookAt + faceTo + emote trong ≤ 300 ms kể từ user.text',
  coLook !== undefined &&
    coFace !== undefined &&
    coEmote !== undefined &&
    treDau !== null &&
    treDau <= 300 &&
    coEmote.t - tUt <= 300,
  `lookAt +${coLook ? coLook.t - tUt : '-'} ms · faceTo +${coFace ? coFace.t - tUt : '-'} ms · emote +${coEmote ? coEmote.t - tUt : '-'} ms`,
  {
    msLookAt: coLook ? coLook.t - tUt : null,
    msFaceTo: coFace ? coFace.t - tUt : null,
    msEmote: coEmote ? coEmote.t - tUt : null,
  },
);
ghi(
  'Gen đổi hướng nhìn (quan sát trên khung hình thật)',
  nhinSom !== undefined,
  `lookingAt "${nhinTruocKhiGoi}" → "${nhinSom?.lookingAt ?? '-'}" sau ${nhinSom?.ms ?? '-'} ms khung hình` +
    ` · facing đổi sau ${batDauQuay?.ms ?? '-'} ms`,
  { msNhin: nhinSom?.ms ?? null, msFacing: batDauQuay?.ms ?? null },
);
ghi(
  'Gen quay xong, mặt hướng về MÁY QUAY (chỗ Sếp đang xem), lệch < 25°',
  lechCuoi < 25,
  `lệch đầu ${lech0.toFixed(0)}° → cuối ${lechCuoi}°`,
  { lechDau: +lech0.toFixed(1), lechCuoi },
);

const emoteChuY = await page.evaluate(
  (tu) => window.__c0.find((e) => e.event.startsWith('actor.emote') && e.t >= tu) ?? null,
  t0,
);
ghi(
  'emote chu-y chạy',
  emoteChuY !== null,
  emoteChuY ? JSON.stringify(emoteChuY.data) : 'không thấy',
);

// câu đệm: `actor.say` của nguồn phản xạ → đọc trong nhật ký lệnh của app
const log1 = JSON.parse(await page.evaluate(() => window.stage.log()));
const cauDem = lenhCua(log1, (l) => l.cmd === 'actor.say' && l.nguon === 'phan-xa');
const cauDemDau = cauDem[0] ?? null;
ghi(
  'câu đệm phát ra bằng giọng, durationMs > 0',
  cauDemDau !== null && (cauDemDau.result?.durationMs ?? 0) > 0,
  cauDemDau
    ? `"${cauDemDau.args?.text}" · ${cauDemDau.result?.durationMs} ms · giọng ${cauDemDau.result?.voice}`
    : 'không có actor.say nguồn phan-xa',
  cauDemDau ? { text: cauDemDau.args?.text, durationMs: cauDemDau.result?.durationMs } : null,
);
nhatKy.cauDem = cauDem.map((l) => ({
  text: l.args?.text,
  durationMs: l.result?.durationMs,
  nguon: l.nguon,
}));

// câu trả lời của não rule-based (không não → không được im lặng)
const noiBo = lenhCua(
  log1,
  (l) =>
    l.cmd === 'actor.say' &&
    l.nguon === 'phan-xa' &&
    /chưa có não|chào Sếp|Em là Gen/i.test(String(l.args?.text ?? '')),
);
ghi(
  'không có não → Gen vẫn trả lời bằng não rule-based',
  noiBo.length > 0,
  noiBo.map((l) => `"${l.args?.text}"`).join(' · ') || 'không thấy',
);

await datMay('gen', 'gan');
await page.screenshot({ path: `${THU_MUC}/02-cau-dem.png` });

/* ===================================================================== */
/* 2. Sếp lái lại gần Gen → Gen nhìn theo                                 */
/* ===================================================================== */

in_('\n--- 2) Sếp lái lại gần Gen ---');
await page.evaluate(() => window.stage.run('actor.lookAt', { actor: 'gen', target: 'ban-dieu-khien' }));
await nghi(400);
const nhinTruoc = (await trangThai()).gen.lookingAt;

// lái owner về phía Gen bằng chính `actor.steer` (đúng đường phím WASD)
let nhinSau = nhinTruoc;
let dGan = 99;
/**
 * steer dài 2,5 s mỗi nhịp: máy kiểm chạy renderer phần mềm (~1 fps), mà
 * `actor.steer` áp vận tốc **mỗi khung hình** — lệnh 300 ms hết hạn trước cả
 * khung hình kế tiếp nên nhân vật gần như không nhúc nhích. Đây là giới hạn
 * của MÁY KIỂM, không phải của lệnh (trên máy Boss có GPU thì 100 ms/nhịp của
 * phím WASD chạy mượt — xem bằng chứng B1).
 */
let soNhipSteer = 0;
for (let i = 0; i < 20; i++) {
  soNhipSteer++;
  const st = await trangThai();
  const dx = st.gen.pos[0] - st.owner.pos[0];
  const dz = st.gen.pos[2] - st.owner.pos[2];
  dGan = Math.hypot(dx, dz);
  nhinSau = st.gen.lookingAt;
  if (dGan <= 2.0) break;
  const n = Math.hypot(dx, dz) || 1;
  await page.evaluate(
    ({ vx, vz }) => window.stage.run('actor.steer', { actor: 'owner', vx, vz, ms: 2500 }),
    { vx: (dx / n) * 1.6, vz: (dz / n) * 1.6 },
  );
  await nghi(2400);
}
// máy kiểm quá chậm để steer tới nơi trong thời gian chấp nhận được thì đi nốt
// quãng còn lại bằng `actor.moveTo` (cũng là lệnh thật, chỉ khác cách đi)
let buDuongBangMoveTo = false;
if (dGan > 2.3) {
  buDuongBangMoveTo = true;
  await page.evaluate(() => window.stage.run('actor.moveTo', { actor: 'owner', to: '3.3, 0, -0.8' }));
  for (let i = 0; i < 30; i++) {
    const st = await trangThai();
    dGan = Math.hypot(st.gen.pos[0] - st.owner.pos[0], st.gen.pos[2] - st.owner.pos[2]);
    nhinSau = st.gen.lookingAt;
    if (st.owner.state !== 'walking' && dGan <= 2.3) break;
    await nghi(500);
  }
}
// chờ nhịp quét phản xạ
for (let i = 0; i < 20 && nhinSau !== 'owner'; i++) {
  await nghi(150);
  nhinSau = (await trangThai()).gen.lookingAt;
}
ghi(
  'Sếp vào 2,5 m → Gen đổi lookAt sang owner',
  nhinSau === 'owner',
  `trước="${nhinTruoc}" → sau="${nhinSau}" · khoảng cách ${dGan.toFixed(2)} m` +
    ` · ${soNhipSteer} nhịp actor.steer${buDuongBangMoveTo ? ' + bù moveTo (máy kiểm ~1 fps)' : ''}`,
  { nhinTruoc, nhinSau, khoangCach: +dGan.toFixed(2), soNhipSteer, buDuongBangMoveTo },
);
await datMay('gen', 'xa');
await page.screenshot({ path: `${THU_MUC}/03-owner-lai-gan.png` });

/* ===================================================================== */
/* 5. Nhân vật nam anime: hướng mặt KHÔNG ngược + ảnh 2 nhân vật           */
/* ===================================================================== */

in_('\n--- 5) nhân vật nam anime + hướng mặt ---');
const doOwner = await page.evaluate(() => window.stage.doXuong('owner'));
const doGen = await page.evaluate(() => window.stage.doXuong('gen'));
ghi(
  'owner là model VRM 0.x (đã bù 180°) và chibi hoá như Gen',
  doOwner?.vrm0 === true && doOwner?.chibi?.daChibi === true && doGen?.chibi?.daChibi === true,
  `owner vrm0=${doOwner?.vrm0} · tỉ lệ đầu/người owner=${doOwner?.chibi?.tyLeDauNguoi ?? '-'} · gen=${doGen?.chibi?.tyLeDauNguoi ?? '-'}`,
  { owner: doOwner?.chibi ?? null, gen: doGen?.chibi ?? null },
);
const chamGen =
  doGen?.huongMat && doGen?.huongGoc
    ? doGen.huongMat[0] * doGen.huongGoc[0] + doGen.huongMat[1] * doGen.huongGoc[1]
    : 0;
ghi(
  'Gen (VRM 1.0) cũng không ngược — hai model cùng quy ước hướng',
  chamGen > 0.9,
  `gen mặt·facing = ${chamGen.toFixed(3)}`,
  { huongMatGen: doGen?.huongMat, huongGocGen: doGen?.huongGoc },
);

// đi về +Z (phía trước phòng, không vướng bàn/kệ) rồi đo
const mauDi = [];
for (let i = 0; i < 6; i++) {
  await page.evaluate(() =>
    window.stage.run('actor.steer', { actor: 'owner', vx: 0, vz: 1.6, ms: 1500 }),
  );
  await nghi(1400);
  const m = await page.evaluate(() => window.stage.doXuong('owner'));
  const st = await trangThai();
  mauDi.push({
    facing: st.owner.facing,
    huongGoc: m?.huongGoc,
    huongMat: m?.huongMat,
    vanToc: [m?.vanToc?.vx, m?.vanToc?.vz],
  });
}
const cuoi = mauDi[mauDi.length - 1];
const chamMatGoc =
  cuoi?.huongMat && cuoi?.huongGoc
    ? cuoi.huongMat[0] * cuoi.huongGoc[0] + cuoi.huongMat[1] * cuoi.huongGoc[1]
    : 0;
// hướng đi mong muốn: +Z
const chamMatDi = cuoi?.huongMat ? cuoi.huongMat[1] : 0;
ghi(
  'KHÔNG đi ngược: hướng mặt mesh cùng chiều với facing của sân khấu',
  chamMatGoc > 0.8,
  `tích vô hướng mặt·facing = ${chamMatGoc.toFixed(3)} (1 = cùng chiều, −1 = ngược)`,
  { huongMat: cuoi?.huongMat, huongGoc: cuoi?.huongGoc, cham: +chamMatGoc.toFixed(3) },
);
ghi(
  'KHÔNG đi lùi: mặt hướng về đúng phía đang đi (+Z)',
  chamMatDi > 0.7,
  `tích vô hướng mặt·hướng đi = ${chamMatDi.toFixed(3)}`,
  { mauDi },
);
nhatKy.huongDi = mauDi;

/**
 * Hồi quy C0: **tay phải nằm DƯỚI vai sau khi đi**.
 *
 * Model VRM 0.x nhận delta chuyển động chưa liên hợp 180° thì hai tay giơ
 * thẳng lên trời rồi ở nguyên đó — đúng cái Boss gọi là "thân thể nhìn kỳ".
 * Đo bằng số để không bao giờ phải nhìn ảnh mới biết hỏng.
 */
const taySauKhiDi = await page.evaluate(() => {
  const o = window.stage.doXuong('owner');
  const g = window.stage.doXuong('gen');
  return {
    owner: { vai: o.vaiPhai[1], tayP: o.banTayPhai[1], tayT: o.banTayTrai[1] },
    gen: { vai: g.vaiPhai[1], tayP: g.banTayPhai[1], tayT: g.banTayTrai[1] },
  };
});
ghi(
  'sau khi đi, hai tay vẫn buông xuôi (thấp hơn vai) — cả Javis lẫn Gen',
  taySauKhiDi.owner.tayP < taySauKhiDi.owner.vai &&
    taySauKhiDi.owner.tayT < taySauKhiDi.owner.vai &&
    taySauKhiDi.gen.tayP < taySauKhiDi.gen.vai,
  `Javis vai ${taySauKhiDi.owner.vai.toFixed(2)} m · tay ${taySauKhiDi.owner.tayP.toFixed(2)}/${taySauKhiDi.owner.tayT.toFixed(2)} m` +
    ` · Gen vai ${taySauKhiDi.gen.vai.toFixed(2)} m · tay ${taySauKhiDi.gen.tayP.toFixed(2)} m`,
  taySauKhiDi,
);

await datMay('owner', 'gan');
await page.screenshot({ path: `${THU_MUC}/06-owner-di-toi.png` });

// hai nhân vật cạnh nhau: kéo owner về sát Gen rồi quay cả hai ra camera
await page.evaluate(async () => {
  await window.stage.run('actor.moveTo', { actor: 'owner', to: '3.6, 0, -1' });
});
await nghi(2500);
/**
 * Quay cả hai ra camera. Phải gọi LẠI ngay trước mỗi lần chụp: Sếp đứng sát
 * Gen nên **phản xạ chào** (4 s) sẽ tự quay Gen về phía Sếp — đúng hành vi
 * mong muốn, nhưng không hợp cho tấm ảnh "hai nhân vật chính diện".
 */
async function quayRaCamera() {
  await page.evaluate(async () => {
    // dừng mọi việc dở (emote chào của phản xạ) để ảnh chân dung là dáng đứng
    await Promise.all([
      window.stage.run('actor.stop', { actor: 'owner' }),
      window.stage.run('actor.stop', { actor: 'gen' }),
    ]);
    await Promise.all([
      window.stage.run('actor.turnTo', { actor: 'owner', target: '3.6, 0, 6', interrupt: true }),
      window.stage.run('actor.turnTo', { actor: 'gen', target: '4.8, 0, 6', interrupt: true }),
    ]);
    window.stage.run('actor.lookAt', { actor: 'owner', target: 'camera' });
    window.stage.run('actor.lookAt', { actor: 'gen', target: 'camera' });
  });
  await nghi(1600);
}
await quayRaCamera();
/**
 * Khung hình chân dung: lùi xa 5,2 m và **lệch sang phải 1,1 m**.
 *
 * Bảng lệnh phủ ~390 px bên phải cửa sổ, nên ngắm thẳng vào giữa cặp nhân vật
 * là Gen bị che mất nửa người. Lệch máy quay cho cặp nhân vật rơi vào phần
 * khung hình còn nhìn thấy.
 */
const hai = await page.evaluate(async () => {
  const o = window.stage.doXuong('owner');
  const g = window.stage.doXuong('gen');
  const giua = [(o.hips[0] + g.hips[0]) / 2, 0, (o.hips[2] + g.hips[2]) / 2];
  const cao = Math.max(o.bbox[1], g.bbox[1]);
  window.stage.datMay(
    [giua[0] + 1.1, cao * 0.62, giua[2] + 5.2],
    [giua[0] + 0.6, cao * 0.5, giua[2]],
  );
  return { o: o.bbox, g: g.bbox, giua, cao };
});
await page.evaluate(() => window.stage.run('scene.light', { preset: 'toi' }));
await nghi(900);
await quayRaCamera();
await page.screenshot({ path: `${THU_MUC}/04-hai-nhan-vat.png` });
await page.evaluate(
  ({ giua, cao }) =>
    window.stage.datMay(
      [giua[0] + 4.4, cao * 0.62, giua[2] + 1.6],
      [giua[0] + 0.6, cao * 0.5, giua[2]],
    ),
  hai,
);
await nghi(900);
await quayRaCamera();
await page.screenshot({ path: `${THU_MUC}/05-hai-nhan-vat-ngang.png` });
await page.evaluate(() => window.stage.run('scene.light', { preset: 'am' }));
ghi(
  'hai nhân vật cùng tỉ lệ chibi, chiều cao sát nhau',
  Math.abs(hai.o[1] - hai.g[1]) < 0.35,
  `cao owner=${hai.o[1].toFixed(2)} m · gen=${hai.g[1].toFixed(2)} m`,
  { caoOwner: +hai.o[1].toFixed(3), caoGen: +hai.g[1].toFixed(3) },
);


/* ===================================================================== */
/* 6. Người nghe: đổi góc máy giữa câu + "Javis nói với Gen"              */
/* ===================================================================== */

in_('\n--- 6) Gen biết máy quay ở đâu và nhìn đúng người nghe ---');

// 6a. Gen đang nói với Sếp (mặc định to=camera) → đổi camera.preset giữa chừng
await page.evaluate(() => window.stage.run('camera.preset', { name: 'toan-canh' }));
await nghi(1200);
void page.evaluate(() =>
  window.stage.run('actor.say', {
    actor: 'gen',
    text: 'Dạ Sếp, em đang theo dõi màn hình và sẽ báo ngay khi có kết quả ạ.',
  }),
);
await nghi(1200);
const lechTruocDoiMay = await (async () => {
  const st = await trangThai();
  return { lech: +lechGoc(st.gen.facing, gocToiMay(st)).toFixed(1), preset: st.camera.preset };
})();
await page.evaluate(() => window.stage.run('camera.preset', { name: 'ban-dieu-khien' }));

// đo liên tục trong lúc Gen còn đang nói
const mauMay = [];
for (let i = 0; i < 26; i++) {
  const st = await trangThai();
  mauMay.push({
    ms: i * 250,
    preset: st.camera.preset,
    state: st.gen.state,
    facingTarget: st.gen.facingTarget,
    lookingAt: st.gen.lookingAt,
    lech: +lechGoc(st.gen.facing, gocToiMay(st)).toFixed(1),
  });
  if (st.gen.state !== 'speaking' && i > 6) break;
  await nghi(250);
}
const cuoiKhiNoi = [...mauMay].reverse().find((m) => m.state === 'speaking') ?? mauMay[mauMay.length - 1];
ghi(
  'đổi camera.preset GIỮA LÚC Gen nói → mặt vẫn hướng máy quay (≤ 15°)',
  cuoiKhiNoi.lech <= 15 && cuoiKhiNoi.facingTarget === 'camera',
  `preset ${lechTruocDoiMay.preset} → ${cuoiKhiNoi.preset} · lệch ${lechTruocDoiMay.lech}° → ${cuoiKhiNoi.lech}° · facingTarget=${cuoiKhiNoi.facingTarget}`,
  { truoc: lechTruocDoiMay, sau: cuoiKhiNoi },
);
nhatKy.doiGocMayGiuaCau = mauMay;
await datMay('gen', 'xa');
await page.screenshot({ path: `${THU_MUC}/08-nhin-may-quay.png` });

// 6b. `actor.say owner to gen` → hai nhân vật nhìn nhau
await page.evaluate(() => window.stage.run('camera.preset', { name: 'toan-canh' }));
await nghi(1200);
await page.evaluate(() =>
  window.stage.run('actor.say', { actor: 'owner', text: 'Gen ơi, qua đây anh nhờ chút', to: 'gen' }),
);
// máy kiểm ~1 fps: cú quay người cần vài khung hình mới xong
await nghi(4500);
const nhinNhau = await (async () => {
  const st = await trangThai();
  return {
    genLech: +lechGoc(st.gen.facing, gocToi(st.gen, st.owner.pos)).toFixed(1),
    ownerLech: +lechGoc(st.owner.facing, gocToi(st.owner, st.gen.pos)).toFixed(1),
    genNhin: st.gen.lookingAt,
    ownerNhin: st.owner.lookingAt,
    genHuong: st.gen.facingTarget,
    ownerHuong: st.owner.facingTarget,
  };
})();
ghi(
  'actor.say owner to gen → hai nhân vật quay vào nhau (≤ 15°)',
  nhinNhau.genLech <= 15 &&
    nhinNhau.ownerLech <= 15 &&
    nhinNhau.genNhin === 'owner' &&
    nhinNhau.ownerNhin === 'gen',
  `Gen lệch ${nhinNhau.genLech}° (nhìn ${nhinNhau.genNhin}) · Javis lệch ${nhinNhau.ownerLech}° (nhìn ${nhinNhau.ownerNhin})`,
  nhinNhau,
);
nhatKy.nhinNhau = nhinNhau;

// ảnh hai góc máy cho cảnh "nói chuyện với nhau"
const giuaHai = await page.evaluate(() => {
  const o = window.stage.doXuong('owner');
  const g = window.stage.doXuong('gen');
  return {
    giua: [(o.hips[0] + g.hips[0]) / 2, 0, (o.hips[2] + g.hips[2]) / 2],
    cao: Math.max(o.bbox[1], g.bbox[1]),
  };
});
for (const [ten, lech] of [
  ['09-nhin-nhau-truoc.png', [0, 3.2]],
  ['10-nhin-nhau-ngang.png', [3.2, 0.4]],
]) {
  await page.evaluate(
    ({ giua, cao, lech }) =>
      window.stage.datMay(
        [giua[0] + lech[0], cao * 0.72, giua[2] + lech[1]],
        [giua[0], cao * 0.55, giua[2]],
      ),
    { ...giuaHai, lech },
  );
  await nghi(800);
  await page.screenshot({ path: `${THU_MUC}/${ten}` });
}

/* ===================================================================== */
/* 3 + 4b. CÓ não: brainConnected = true, câu đệm bị cắt                   */
/* ===================================================================== */

in_('\n--- 3) bật não (nao-demo qua MCP stdio) ---');
const DUONG_LOG_NAO = `${THU_MUC}/nao-demo-log.json`;
const dongNao = [];
nao = spawn(
  'node',
  ['scripts/nao-demo.mjs', '--luot', '1', '--ghi', DUONG_LOG_NAO, '--cho', '25000', '--han', '180000'],
  { stdio: ['ignore', 'pipe', 'pipe'], env: MOI_TRUONG, detached: true },
);
const docNao = (d) => {
  const s = String(d);
  dongNao.push(s);
  process.stdout.write('   ' + s);
};
nao.stdout.on('data', docNao);
nao.stderr.on('data', docNao);

for (let i = 0; i < 80; i++) {
  if (dongNao.join('').includes('nghe từ seq')) break;
  await nghi(500);
}
ghi('não nối MCP stdio', dongNao.join('').includes('nghe từ seq'), '');

let stNao = await trangThai();
for (let i = 0; i < 30 && stNao?.brainConnected !== true; i++) {
  await nghi(300);
  stNao = await trangThai();
}
ghi(
  'describe.brainConnected = true khi có não MCP nối',
  stNao?.brainConnected === true,
  `brainConnected=${stNao?.brainConnected}`,
  { brainConnected: stNao?.brainConnected },
);

/**
 * Não thật (nao-demo) đã chứng minh `brainConnected`. Nhưng nó **phản ứng
 * ngay** (emote `chao` trong nửa giây) nên Gen bận, phản xạ nhường chỗ và
 * không có câu đệm nào để mà cắt — đúng luật "ưu tiên thấp", nhưng không đo
 * được cái cần đo.
 *
 * Nên bước này đổi sang một **não im lặng**: một client ws xưng `?role=nao`
 * (đúng đường mà `bridge/mcp.ts` dùng — MCP cũng chỉ là client ws của bridge).
 * `brainConnected` vẫn `true`, nhưng không ai cướp lời; script tự chọn đúng
 * thời điểm "não nói" để đo cú cắt.
 */
dietCay(nao);
nao = null;
await nghi(1500);

const naoIm = new WebSocket(`ws://127.0.0.1:${CONG_WS}/?role=nao`);
await new Promise((res, rej) => {
  naoIm.once('open', res);
  naoIm.once('error', rej);
});
let demLenhNao = 0;
const traLoiNao = new Map();
naoIm.on('message', (tho) => {
  try {
    const g = JSON.parse(String(tho));
    if (typeof g.id === 'string' && traLoiNao.has(g.id)) {
      traLoiNao.get(g.id)(g);
      traLoiNao.delete(g.id);
    }
  } catch {}
});
const naoGoi = (cmd, args) =>
  new Promise((res) => {
    const id = `kiem-${++demLenhNao}`;
    traLoiNao.set(id, res);
    naoIm.send(JSON.stringify({ id, cmd, args }));
    setTimeout(() => res({ ok: false, error: 'hết giờ' }), 20000);
  });

let stIm = await trangThai();
for (let i = 0; i < 20 && stIm?.brainConnected !== true; i++) {
  await nghi(300);
  stIm = await trangThai();
}
ghi(
  'não im lặng (client ws role=nao) cũng tính vào brainConnected',
  stIm?.brainConnected === true,
  `brainConnected=${stIm?.brainConnected}`,
);

// Sếp gõ → phản xạ chêm câu đệm ở mốc 1,5 s → não nói đè lên → câu đệm bị cắt
const t1 = Date.now();
await page.fill('#o-chat-nhap', 'Chào Gen');
await page.press('#o-chat-nhap', 'Enter');

/** Chờ tới khi câu đệm của phản xạ thật sự bắt đầu phát. */
let demDau = null;
for (let i = 0; i < 60; i++) {
  const lg = JSON.parse(await page.evaluate(() => window.stage.log()));
  demDau =
    lenhCua(lg, (l) => l.cmd === 'actor.say' && l.nguon === 'phan-xa' && (l.t ?? 0) >= t1)[0] ??
    null;
  if (demDau) break;
  await nghi(250);
}
const tNao = Date.now();
const kqNao = await naoGoi('actor.say', {
  actor: 'gen',
  text: 'Dạ, em nghe Sếp đây ạ',
  emotion: 'vui',
});
await nghi(6000);

const log2 = JSON.parse(await page.evaluate(() => window.stage.log()));
const demXong = (log2.banGhi ?? []).find(
  (l) =>
    l.loai === 'su-kien' &&
    l.event === 'actor.sayDone' &&
    l.data?.actor === 'gen' &&
    l.data?.text === demDau?.args?.text &&
    (l.t ?? 0) >= (demDau?.t ?? 0),
);
const cuaNao = lenhCua(
  log2,
  (l) => l.cmd === 'actor.say' && l.nguon === 'bridge' && (l.t ?? 0) >= t1,
)[0] ?? null;
const daiHua = demDau?.result?.durationMs ?? 0;
const daiThat = demXong && demDau ? demXong.t - demDau.t : null;
// bị cắt = kết thúc SỚM hơn hẳn thời lượng giọng đã hứa
const biCat = daiThat !== null && daiHua > 0 && daiThat < daiHua - 150;
ghi(
  'có não: câu đệm đang phát, não nói → câu đệm bị CẮT (và câu của não vẫn chạy)',
  demDau !== null && cuaNao !== null && kqNao.ok === true && biCat,
  demDau
    ? `đệm "${demDau.args?.text}" hứa ${daiHua} ms, thật ${daiThat} ms (não chen vào sau ${tNao - demDau.t} ms) · câu não: ${kqNao.ok ? 'chạy ok' : kqNao.error}`
    : 'không có câu đệm nào',
  {
    cauDem: demDau?.args?.text ?? null,
    huaMs: daiHua,
    thatMs: daiThat,
    msNaoChenVao: demDau ? tNao - demDau.t : null,
    cuaNao: cuaNao?.args?.text ?? null,
    naoOk: kqNao.ok === true,
  },
);

/* ------------------------------------------------------------- mobile + kết */

try {
await page.setViewportSize({ width: 390, height: 844 });
await nghi(900);
await page.screenshot({ path: `${THU_MUC}/07-mobile-390.png` });
await page.setViewportSize({ width: 1280, height: 800 });

try {
  naoIm.close();
} catch {}
dietCay(nao);
await nghi(2000);
let stTat = await trangThai();
for (let i = 0; i < 20 && stTat?.brainConnected !== false; i++) {
  await nghi(1000);
  stTat = await trangThai();
}
nhatKy.brainConnected = {
  truocKhiCoNao: st0?.brainConnected ?? null,
  khiCoNao: stNao?.brainConnected ?? null,
  sauKhiTatNao: stTat?.brainConnected ?? null,
};
nhatKy.suKien = await page.evaluate(() => window.__c0.map((e) => ({ t: e.t, event: e.event, data: e.data })));
} catch (e) {
  // trang sập ở bước cuối không được làm mất toàn bộ số đo đã đo xong
  ghi('chụp phần cuối không lỗi', false, String(e?.message ?? e));
}

ghi('0 lỗi console', loiConsole.length === 0, loiConsole.slice(0, 5).join(' | '));
nhatKy.loiConsole = loiConsole;
nhatKy.tongKet = { soBuoc, soOk, thatBai };
writeFileSync(`${THU_MUC}/nhat-ky-kiem-c0.json`, JSON.stringify(nhatKy, null, 2) + '\n');

in_(`\n==> ${soOk}/${soBuoc} bước đạt. Nhật ký: ${THU_MUC}/nhat-ky-kiem-c0.json`);
if (thatBai.length) in_('!! Chưa đạt:\n   - ' + thatBai.join('\n   - '));
if (existsSync(DUONG_LOG_NAO)) {
  try {
    const l = JSON.parse(readFileSync(DUONG_LOG_NAO, 'utf8'));
    in_(`==> não gọi ${l.toolCalls?.length ?? 0} tool MCP`);
  } catch {}
}

try {
  await browser.close();
} catch {}
dongHet(thatBai.length ? 1 : 0);
