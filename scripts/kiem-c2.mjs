/**
 * kiem-c2.mjs — BẰNG CHỨNG C2 (#32): Sếp ra lệnh bằng câu tiếng Việt, mọi
 * nhân vật làm ngay; câu tự do thì vẫn về não như cũ.
 *
 * Chạy (**một lần** — cờ khoá `docs/c2/.da-chay`):
 *   node scripts/kiem-c2.mjs           # trọn bộ
 *   node scripts/kiem-c2.mjs --lai     # xoá cờ khoá rồi chạy lại
 *
 * Dựng thật, không giả lập chỗ nào:
 *   bridge (ws + tts + MCP HTTP)  ← cổng RIÊNG 8797/8798/8799, KHÔNG đụng
 *                                   bridge thật của Sếp ở 8787/8788/8789
 *   Playwright + Chrome hệ thống  → app thật (`?bridge=1`, swiftshader, autoplay)
 *   scripts/nao-demo.mjs          → não rule-based qua MCP stdio (bước 6)
 *
 * Bốn câu bắt buộc theo Issue #32:
 *   1. "Javis, đi tới bàn điều khiển" → owner `actor.moveTo` + "Rõ Sếp" giọng NAM
 *   2. "Gen, vui lên"                 → gen `actor.emote` vui
 *   3. "mọi người chào"               → CẢ HAI `actor.emote` chao
 *   4. "Gen, hôm nay làm gì"          → `user.text` KHÔNG bị lớp này ăn, não trả lời
 *
 * Ra trong `docs/c2/`:
 *   01-javis-toi-ban-dieu-khien.png  Javis đã tới bàn, bong bóng xác nhận
 *   02-gen-vui.png                   Gen đang diễn emote vui
 *   03-moi-nguoi-chao.png            cả hai cùng chào
 *   04-tab-giong-1440.png            tab "Giọng" (mẫu câu sinh từ bảng)
 *   05-tab-giong-390.png             tab "Giọng" trên điện thoại
 *   06-nao-tra-loi.png               Gen trả lời câu tự do (não qua MCP)
 *   ket-qua.md                       BẢNG kết quả 30 câu + 5 câu lỗi STT
 *   nhat-ky-kiem-c2.json             SỐ: sự kiện, lệnh, giọng, lỗi console
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const THU_MUC = 'docs/c2';
mkdirSync(THU_MUC, { recursive: true });

const argv = process.argv.slice(2);
const urlArg = argv.find((a) => a.startsWith('http'));

/* ------------------------------------------------- cờ khoá chạy một lần */

const CO_KHOA = `${THU_MUC}/.da-chay`;
if (argv.includes('--lai')) {
  if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
} else if (existsSync(CO_KHOA)) {
  console.error(
    `\n⛔ ${CO_KHOA} đã tồn tại — kiểm C2 chỉ chạy MỘT LẦN sau khi code xong.\n` +
      `   Kết quả lượt trước: ${THU_MUC}/nhat-ky-kiem-c2.json + ảnh trong ${THU_MUC}/.\n` +
      '   Thật sự cần chạy lại: node scripts/kiem-c2.mjs --lai\n',
  );
  process.exit(2);
}
writeFileSync(CO_KHOA, new Date().toISOString() + '\n');

/* ------------------------------------------------------------- tiện ích */

/**
 * Bộ cổng RIÊNG cho bằng chứng, **tự tìm chỗ trống**.
 *
 * Mốc là 8797/8798/8799 (không bao giờ đụng bridge thật của Sếp ở
 * 8787/8788/8789). Nhưng máy Sếp có thể đang chạy nhiều phiên thi công song
 * song, mỗi phiên một bridge bằng chứng — lần chạy trước đã dính đúng cái bẫy
 * đó: cổng bị phiên khác giữ, `/khoe` vẫn trả 200 (của *bridge người ta*), nên
 * script tưởng bridge của mình lên rồi, còn trình duyệt thì không nối được.
 * Vì vậy quét theo bước 10 cho tới khi **cả ba cổng đều trống**.
 */
async function congTrong(cong) {
  return await new Promise((r) => {
    const sv = createServer();
    sv.once('error', () => r(false));
    sv.once('listening', () => sv.close(() => r(true)));
    sv.listen(cong, '127.0.0.1');
  });
}

async function timBoCong() {
  if (process.env.GEN_STAGE_PORT) {
    return {
      ws: Number(process.env.GEN_STAGE_PORT),
      tts: Number(process.env.GEN_STAGE_TTS_PORT ?? Number(process.env.GEN_STAGE_PORT) + 1),
      mcp: Number(process.env.GEN_STAGE_MCP_PORT ?? Number(process.env.GEN_STAGE_PORT) + 2),
    };
  }
  for (let goc = 8797; goc <= 8897; goc += 10) {
    const ds = [goc, goc + 1, goc + 2];
    const trong = await Promise.all(ds.map(congTrong));
    if (trong.every(Boolean)) return { ws: ds[0], tts: ds[1], mcp: ds[2] };
  }
  throw new Error('không tìm được bộ 3 cổng trống trong 8797–8899');
}

const BO_CONG = await timBoCong();
const CONG_WS = BO_CONG.ws;
const CONG_TTS = BO_CONG.tts;
const CONG_MCP = BO_CONG.mcp;
const MOI_TRUONG = {
  ...process.env,
  GEN_STAGE_PORT: String(CONG_WS),
  GEN_STAGE_TTS_PORT: String(CONG_TTS),
  GEN_STAGE_MCP_PORT: String(CONG_MCP),
};

const in_ = (...x) => console.log(...x);
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
const loiConsole = [];
const thatBai = [];
const nhatKy = {
  chay: new Date().toISOString(),
  cong: { ws: CONG_WS, tts: CONG_TTS, mcp: CONG_MCP },
  buoc: [],
  cauNoi: [],
};
let soBuoc = 0;
let soOk = 0;

/**
 * Chạy một bước, nổ thì ghi FAIL chứ không bỏ cả lượt kiểm.
 *
 * Máy Sếp chạy nhiều phiên thi công song song; Chrome headless + swiftshader
 * có lúc bị hệ điều hành giết vì hết RAM. Bọc lại để nhật ký phần đã chạy
 * không bị mất.
 */
async function thu(nhan, fn) {
  try {
    return await fn();
  } catch (e) {
    ghi(nhan, false, `nổ: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
    return null;
  }
}

function ghi(nhan, ok, chiTiet, so) {
  soBuoc++;
  if (ok) soOk++;
  else thatBai.push(`${nhan}: ${chiTiet ?? ''}`);
  nhatKy.buoc.push({ nhan, ok, chiTiet: chiTiet ?? null, ...(so ? { so } : {}) });
  in_(`   ${ok ? '✓' : '✗'} ${nhan} ${chiTiet ?? ''}`);
}

/* -------------------------------------------------------- bridge + vite */

let bridge = null;
async function moBridge() {
  bridge = spawn('npx', ['tsx', 'bridge/server.ts'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: MOI_TRUONG,
  });
  const dong = [];
  const doc = (d) => {
    dong.push(String(d));
    process.stdout.write('   [bridge] ' + String(d));
  };
  bridge.stdout.on('data', doc);
  bridge.stderr.on('data', doc);
  // chờ CHÍNH bridge này in ra dòng mcp — không tin `/khoe` (có thể là bridge
  // của phiên khác đang giữ cổng, xem `timBoCong`)
  for (let i = 0; i < 90; i++) {
    if (dong.some((d) => d.includes('[mcp ]')) && (await khoe(CONG_TTS))) return dong;
    await nghi(500);
  }
  throw new Error(
    `bridge không lên (ws ${CONG_WS} / tts ${CONG_TTS} / mcp ${CONG_MCP}): ${dong.join(' ')}`,
  );
}

async function khoe(cong) {
  try {
    return (await fetch(`http://127.0.0.1:${cong}/khoe`)).ok;
  } catch {
    return false;
  }
}

let server = null;
async function moServer() {
  if (urlArg) return urlArg;
  const port = 4960 + ((Date.now() / 11) % 200 | 0);
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
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
function dongHet(ma) {
  try {
    nao?.kill('SIGTERM');
  } catch {}
  server?.kill('SIGTERM');
  bridge?.kill('SIGTERM');
  process.exit(ma);
}

/* ------------------------------------ bảng kết quả 30 câu (từ vitest) */

function docBang(ten) {
  try {
    return JSON.parse(readFileSync(`${THU_MUC}/bang-${ten}.json`, 'utf8'));
  } catch {
    return null;
  }
}

function bangMd(tieuDe, b) {
  if (!b) return `### ${tieuDe}\n\nChưa có số liệu (chạy \`pnpm test\` trước).\n`;
  const dong = b.cau
    .map(
      (c) =>
        `| ${c.cau} | ${c.aiThay.join(' + ')} | ${c.cmdThay ?? '— (tới não)'} | ` +
        `${c.nhacLai ?? '—'} | ${c.aiOk && c.lenhOk ? '✓' : '✗'} |`,
    )
    .join('\n');
  return (
    `### ${tieuDe}\n\n` +
    `**${b.dungAi}/${b.so} đúng người nhận** · ` +
    `**${b.dungLenh}/${b.so} đúng lệnh** (${((b.dungLenh / b.so) * 100).toFixed(1)} %)\n\n` +
    '| Câu Sếp nói | Người nhận | Lệnh đã gọi | Nhân vật nhắc lại | Đạt |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    dong +
    '\n'
  );
}

/* ------------------------------------------------------------------ chạy */

const dongBridge = await moBridge();
ghi(
  'bridge bật cả ws + tts + mcp (cổng riêng)',
  dongBridge.some((d) => d.includes('[mcp ]')),
  `ws ${CONG_WS} · tts ${CONG_TTS} · mcp ${CONG_MCP}`,
);

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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
  window.__c2 = [];
  window.stage.on('*', (e) => window.__c2.push({ t: e.t, event: e.event, data: e.data }));
});
await page.evaluate(() => window.stage.batTieng());
await page.evaluate(() => window.stage.run('scene.light', { preset: 'am' }));
await nghi(1200);

/** Chờ sự kiện `ten` xuất hiện sau mốc `tu` (lọc thêm nếu cần). */
async function choSuKien(ten, tu, hanMs = 40000, loc = null, nhip = 600) {
  const het = Date.now() + hanMs;
  while (Date.now() < het) {
    const co = await page.evaluate(
      ({ ten, tu, loc }) =>
        window.__c2.find(
          (e) =>
            e.event === ten &&
            e.t >= tu &&
            (!loc || Object.entries(loc).every(([k, v]) => e.data?.[k] === v)),
        ) ?? null,
      { ten, tu, loc },
    );
    if (co) return co;
    await nghi(nhip);
  }
  return null;
}

/** Gõ một câu vào ô chat của Sếp — đúng đường Sếp vẫn dùng. */
async function sepNoi(cau) {
  await page.fill('#o-chat-nhap', cau);
  await page.press('#o-chat-nhap', 'Enter');
}

/**
 * Đưa máy quay về trước mặt một nhân vật rồi chụp — ảnh bằng chứng phải THẤY
 * nhân vật đang diễn, không phải thấy căn phòng trống.
 */
async function chupNhanVat(ten, actor, kieu = 'gan') {
  await thu(`ảnh ${ten}`, async () => {
    const m = await page.evaluate((a) => window.stage.doXuong(a), actor);
    if (m?.neck) {
      const [x, y, z] = m.neck;
      const cao = m.bbox?.[1] ?? 1.2;
      /**
       * Khung TOÀN THÂN, không phải cận mặt: nhân vật đã chibi hoá nên chỉ
       * ~1,1 m, đứng gần 1,7 m là cái đầu che hết khung hình (ảnh lượt đầu).
       * `gan` = một người, `xa` = lùi ra để thấy cả hai người cùng diễn.
       */
      const vt =
        kieu === 'gan'
          ? [x + 1.0, Math.max(y, cao) * 1.35, z + 3.0]
          : [x + 1.8, Math.max(y, cao) * 1.9, z + 5.2];
      await page.evaluate(
        ({ vt, tam }) => window.stage.datMay(vt, tam),
        { vt, tam: [x, cao * 0.55, z] },
      );
      await nghi(400);
    }
    await page.screenshot({ path: `${THU_MUC}/${ten}` });
  });
}

/** Mọi lệnh nguồn `giong` trong nhật ký (bằng chứng: lệnh đi qua dispatcher). */
async function lenhGiong() {
  const log = JSON.parse(await page.evaluate(() => window.stage.log()));
  return (log.banGhi ?? []).filter((b) => b.nguon === 'giong');
}

/* --------------------------- bước 0: nhân vật nam tên Javis */

const tenNv = await page.evaluate(async () => {
  const r = await window.stage.describe();
  return r.ok ? r.result.actors.map((a) => ({ id: a.id, name: a.name })) : null;
});
ghi(
  'nhân vật nam hiện tên "Javis" (id vẫn là owner)',
  tenNv?.find((a) => a.id === 'owner')?.name === 'Javis',
  JSON.stringify(tenNv),
  tenNv,
);

/* ------------- bước 1: "Javis, đi tới bàn điều khiển" → owner moveTo */

in_('\n--- câu 1: "Javis, đi tới bàn điều khiển" ---');
const moc1 = Date.now();
await sepNoi('Javis, đi tới bàn điều khiển');

const uc1 = await choSuKien('user.command', moc1, 20000);
ghi(
  'lớp hiểu lệnh khớp mẫu và bắn user.command',
  uc1?.data?.cmd === 'actor.moveTo' && uc1?.data?.actors?.[0] === 'owner',
  JSON.stringify(uc1?.data ?? null),
  uc1?.data,
);

// phải là ĐÚNG câu Sếp gõ, không phải câu xác nhận của Javis (cũng bắn user.text)
const ut1 = await page.evaluate(
  ({ tu, cau }) =>
    window.__c2.find(
      (e) => e.event === 'user.text' && e.t >= tu && e.data?.text === cau,
    )?.data ?? null,
  { tu: moc1, cau: 'Javis, đi tới bàn điều khiển' },
);
const utXacNhan = await page.evaluate(
  (tu) =>
    window.__c2
      .filter((e) => e.event === 'user.text' && e.t >= tu)
      .map((e) => ({ text: e.data?.text, handled: e.data?.handled ?? false })),
  moc1,
);
ghi(
  'user.text của câu lệnh được đánh dấu handled (não bỏ qua)',
  ut1?.handled === true && utXacNhan.every((x) => x.handled === true),
  JSON.stringify(utXacNhan),
  { userText: utXacNhan },
);

const den1 = await choSuKien('actor.arrived', moc1, 60000, { actor: 'owner' });
const oDau = await page.evaluate(async () => {
  const r = await window.stage.describe();
  const o = r.ok ? r.result.actors.find((a) => a.id === 'owner') : null;
  return o ? { at: o.at, nearest: o.nearest } : null;
});
ghi(
  'Javis đi tới bàn điều khiển thật',
  den1 !== null && oDau?.at === 'ban-dieu-khien',
  `arrived=${JSON.stringify(den1?.data ?? null)} · at=${oDau?.at}`,
  oDau,
);

const dsGiong1 = await lenhGiong();
const say1 = dsGiong1.find((b) => b.cmd === 'actor.say' && b.args?.actor === 'owner');
ghi(
  'Javis xác nhận ngắn bằng GIỌNG NAM, nhắc lại lệnh đã hiểu',
  !!say1 &&
    /Rõ Sếp|Dạ|Vâng ạ/.test(String(say1.args?.text ?? '')) &&
    /bàn điều khiển/.test(String(say1.args?.text ?? '')) &&
    /^nam$|Nam/.test(String(say1.result?.voice ?? '')),
  `text="${say1?.args?.text}" · voice=${say1?.result?.voice}`,
  { text: say1?.args?.text, voice: say1?.result?.voice },
);
const bong1 = await page.evaluate(() => {
  const el = document.querySelector('#bong-bong-lop .bong-bong.hien');
  return el ? el.textContent.trim().slice(0, 140) : null;
});
await chupNhanVat('01-javis-toi-ban-dieu-khien.png', 'owner');
nhatKy.cauNoi.push({ cau: 'Javis, đi tới bàn điều khiển', userCommand: uc1?.data, bongBong: bong1 });

/* --------------------------------- bước 2: "Gen, vui lên" → gen emote */

in_('\n--- câu 2: "Gen, vui lên" ---');
await nghi(900);
const moc2 = Date.now();
await sepNoi('Gen, vui lên');
const uc2 = await choSuKien('user.command', moc2, 20000);
const em2 = await choSuKien('actor.emoteDone', moc2, 60000, { actor: 'gen' });
const em2b = em2 ?? (await choSuKien('actor.emoteCancelled', moc2, 1000, { actor: 'gen' }));
await chupNhanVat('02-gen-vui.png', 'gen');
ghi(
  'Gen diễn emote "vui"',
  uc2?.data?.cmd === 'actor.emote' &&
    uc2?.data?.args?.emote === 'vui' &&
    em2b?.data?.emote === 'vui',
  `user.command=${JSON.stringify(uc2?.data?.args ?? null)} · emote=${em2b?.data?.emote}`,
);
nhatKy.cauNoi.push({ cau: 'Gen, vui lên', userCommand: uc2?.data, emote: em2b?.data });

/* ----------------------------- bước 3: "mọi người chào" → cả hai chào */

in_('\n--- câu 3: "mọi người chào" ---');
await nghi(1500);
const moc3 = Date.now();
await sepNoi('mọi người chào');
const uc3 = await choSuKien('user.command', moc3, 20000);
const chaoOwner = await choSuKien('actor.emoteDone', moc3, 60000, { actor: 'owner' });
const chaoGen = await choSuKien('actor.emoteDone', moc3, 60000, { actor: 'gen' });
// chụp lúc cả hai còn đang chào, lùi máy ra để thấy cả hai người
await chupNhanVat('03-moi-nguoi-chao.png', 'owner', 'xa');
const emoteGiong = (await lenhGiong()).filter(
  (b) => b.cmd === 'actor.emote' && b.t >= moc3 && b.args?.emote === 'chao',
);
ghi(
  '"mọi người chào" → CẢ HAI nhân vật cùng chào',
  uc3?.data?.actors?.length === 2 &&
    emoteGiong.length === 2 &&
    emoteGiong.some((b) => b.args.actor === 'owner') &&
    emoteGiong.some((b) => b.args.actor === 'gen'),
  `người nhận=${JSON.stringify(uc3?.data?.actors)} · lệnh=${emoteGiong
    .map((b) => `${b.args.actor}:${b.args.emote}`)
    .join(' · ')} · emoteDone owner=${!!chaoOwner} gen=${!!chaoGen}`,
  { actors: uc3?.data?.actors, lenh: emoteGiong.map((b) => b.args) },
);
nhatKy.cauNoi.push({ cau: 'mọi người chào', userCommand: uc3?.data, lenh: emoteGiong.map((b) => b.args) });

/* ------------------------------------------- bước 4: ảnh tab "Giọng" */

in_('\n--- tab "Giọng" ---');
await thu('máy quay về toàn cảnh', () =>
  page.evaluate(() => window.stage.run('camera.preset', { name: 'toan-canh' })),
);
await nghi(2200);
const soMauCau = (await thu('tab "Giọng" dựng được', async () => {
  await page.evaluate(() => {
    document.querySelector('#bang')?.classList.remove('thu-gon');
    document.querySelector('#bang-the button[data-the="giong"]')?.click();
  });
  await nghi(600);
  const so = await page.evaluate(() => ({
    nhom: document.querySelectorAll('#the-giong .nhom').length,
    mau: document.querySelectorAll('#the-giong .mau-cau').length,
    cuoi: document.getElementById('giong-cuoi')?.textContent?.trim() ?? null,
  }));
  await page.screenshot({ path: `${THU_MUC}/04-tab-giong-1440.png` });
  return so;
})) ?? { nhom: 0, mau: 0, cuoi: null };
ghi(
  'tab "Giọng" liệt kê mẫu câu, sinh từ bảng ngữ pháp',
  soMauCau.mau >= 10 && soMauCau.nhom >= 4,
  JSON.stringify(soMauCau),
  soMauCau,
);
await thu('ảnh tab "Giọng" trên màn hẹp 390 px', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await nghi(700);
  await page.evaluate(() => {
    document.querySelector('#bang')?.classList.remove('thu-gon');
    document.querySelector('#bang-the button[data-the="giong"]')?.click();
  });
  await nghi(400);
  await page.screenshot({ path: `${THU_MUC}/05-tab-giong-390.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await nghi(600);
});

/* --------------------------------------------- lastCommand trong describe */

const cuoi = await page.evaluate(async () => {
  const r = await window.stage.describe();
  return r.ok ? (r.result.lastCommand ?? null) : null;
});
ghi(
  'stage.describe trả lastCommand',
  cuoi !== null && typeof cuoi.text === 'string' && 'matched' in cuoi,
  JSON.stringify(cuoi),
  cuoi,
);

/* -------------------------------------------- mọi lệnh đều qua dispatcher */

const dsGiong = await lenhGiong();
ghi(
  'mọi lệnh của lớp hiểu lệnh đi qua dispatcher (nguồn "giong")',
  dsGiong.length >= 7 && dsGiong.every((b) => b.ok || b.error),
  `${dsGiong.length} lệnh: ${[...new Set(dsGiong.map((b) => b.cmd))].join(', ')}`,
);
nhatKy.lenhGiong = dsGiong.map((b) => ({ cmd: b.cmd, args: b.args, ok: b.ok, nguon: b.nguon }));

/* ------------------- bước 5: câu tự do → KHÔNG bị lớp này ăn, não trả lời */

in_('\n--- câu 4: "Gen, hôm nay làm gì" (câu tự do → não) ---');
const DUONG_LOG_NAO = `${THU_MUC}/nao-demo-log.json`;
const dongNao = [];
nao = spawn(
  'node',
  ['scripts/nao-demo.mjs', '--luot', '1', '--ghi', DUONG_LOG_NAO, '--cho', '25000', '--han', '180000'],
  { stdio: ['ignore', 'pipe', 'pipe'], env: MOI_TRUONG },
);
for (const ong of ['stdout', 'stderr']) {
  nao[ong].on('data', (d) => {
    dongNao.push(String(d));
    process.stdout.write('   ' + String(d));
  });
}
for (let i = 0; i < 90; i++) {
  if (dongNao.join('').includes('nghe từ seq')) break;
  await nghi(500);
}
ghi('não nối MCP stdio và bắt đầu nghe', dongNao.join('').includes('nghe từ seq'));

await nghi(800);
const moc4 = Date.now();
await sepNoi('Gen, hôm nay làm gì');
const ut4 = await page.evaluate(async (tu) => {
  for (let i = 0; i < 60; i++) {
    const e = window.__c2.find((x) => x.event === 'user.text' && x.t >= tu);
    if (e) return e.data;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}, moc4);
const uc4 = await page.evaluate(
  (tu) => window.__c2.find((e) => e.event === 'user.command' && e.t >= tu)?.data ?? null,
  moc4,
);
ghi(
  'câu tự do KHÔNG bị lớp hiểu lệnh ăn (không handled, không user.command)',
  ut4 !== null && ut4.handled !== true && uc4 === null,
  `user.text=${JSON.stringify(ut4)} · user.command=${JSON.stringify(uc4)}`,
  { userText: ut4 },
);

/**
 * Bằng chứng "não vẫn nghe được" đọc từ HAI phía:
 *  - trên trang: Gen diễn/nói sau câu đó (ảnh `06-nao-tra-loi.png`),
 *  - ngoài trang: `nao-demo-log.json` do chính não ghi — còn nguyên kể cả khi
 *    Chrome bị hệ điều hành giết lúc máy chạy nhiều phiên song song.
 */
const dien4 = await choSuKien('actor.emoteDone', moc4 + 1, 60000, { actor: 'gen' });
await chupNhanVat('06-nao-tra-loi.png', 'gen');
ghi(
  'não (nao-demo) nghe được câu đó và Gen diễn trên sân khấu',
  dien4 !== null,
  `emote=${dien4?.data?.emote ?? '-'}`,
);
nhatKy.cauNoi.push({ cau: 'Gen, hôm nay làm gì', userText: ut4, genDien: dien4?.data ?? null });

/**
 * KHÔNG chờ `actor.sayDone` trên trang nữa.
 *
 * Vòng "làm việc" của não (stream màn hình + kết tinh module + nói) là đoạn
 * nặng nhất: Chrome swiftshader trên máy đang chạy nhiều phiên song song có
 * lúc chết đúng ở đây. Câu trả lời của Gen đã nằm trong `nao-demo-log.json`
 * (tool `actor_say` kèm `durationMs` thật) — bằng chứng đó do **tiến trình
 * khác** ghi nên không phụ thuộc vào trang còn sống hay không.
 */

for (let i = 0; i < 40; i++) {
  if (existsSync(DUONG_LOG_NAO)) break;
  await nghi(500);
}
let logNao = null;
try {
  logNao = JSON.parse(readFileSync(DUONG_LOG_NAO, 'utf8'));
} catch {
  /* bước dưới tự báo */
}
const nghe4 = logNao?.luot?.some?.((l) => String(l.text ?? '').includes('hôm nay làm gì'));
ghi(
  'nhật ký của não: nghe ĐÚNG câu tự do rồi tự chọn lệnh',
  !!logNao && logNao.toolCalls?.length > 0 && nghe4 === true,
  logNao
    ? `${logNao.toolCalls.length} tool call · câu nghe được: ${JSON.stringify(
        logNao.luot?.map?.((l) => l.text) ?? null,
      )}`
    : 'không có nao-demo-log.json',
);
if (logNao) {
  const say = logNao.toolCalls.filter((t) => t.tool === 'actor_say');
  ghi(
    'Gen trả lời bằng giọng thật (durationMs audio) theo lệnh của não',
    say.length > 0,
    say.map((t) => `"${String(t.args?.text ?? '').slice(0, 50)}" ${t.durationMs ?? '-'} ms`).join(' · '),
  );
  nhatKy.nao = {
    soToolCall: logNao.toolCalls.length,
    tenToolDaGoi: [...new Set(logNao.toolCalls.map((t) => t.tool))],
    cauNghe: logNao.luot?.map?.((l) => l.text) ?? null,
  };
}

/* ----------------------------------------------------- ket-qua.md + nhật ký */

// `loiConsole` là mảng trong tiến trình này, đọc được kể cả khi trang đã chết
ghi('0 lỗi console', loiConsole.length === 0, loiConsole.slice(0, 5).join(' | '));
try {
  nhatKy.suKien = await page.evaluate(() => window.__c2);
} catch {
  nhatKy.suKien = []; // trang đã đóng: nhật ký bước + ảnh vẫn đủ, không tính là lỗi
}

const b30 = docBang('30-cau');
const bStt = docBang('loi-stt');
if (b30) {
  ghi('30 câu: 100 % đúng người nhận', b30.dungAi === b30.so, `${b30.dungAi}/${b30.so}`);
  ghi(
    '30 câu: ≥ 95 % đúng lệnh',
    b30.dungLenh / b30.so >= 0.95,
    `${b30.dungLenh}/${b30.so} = ${((b30.dungLenh / b30.so) * 100).toFixed(1)} %`,
  );
}
if (bStt) {
  ghi('5 câu lỗi STT giả vẫn hiểu', bStt.dungLenh === bStt.so, `${bStt.dungLenh}/${bStt.so}`);
}

writeFileSync(
  `${THU_MUC}/ket-qua.md`,
  `# C2 — Hiểu lệnh giọng cho mọi nhân vật (Issue #32)\n\n` +
    `Chạy: ${nhatKy.chay} · cổng riêng ws ${CONG_WS} / tts ${CONG_TTS} / mcp ${CONG_MCP}.\n` +
    `Số đo đầy đủ: \`nhat-ky-kiem-c2.json\`. Bảng dưới do \`pnpm test\` sinh\n` +
    `(\`src/behavior/__tests__/c2-hieu-lenh.test.ts\`), không gõ tay con số nào.\n\n` +
    `## Vòng kín trên app thật (Playwright + Chrome)\n\n` +
    `| Bước | Đạt | Chi tiết |\n| --- | --- | --- |\n` +
    nhatKy.buoc
      .map((b) => `| ${b.nhan} | ${b.ok ? '✓' : '✗'} | ${(b.chiTiet ?? '').replace(/\|/g, '/')} |`)
      .join('\n') +
    `\n\n## Bảng câu thử\n\n` +
    bangMd('30 câu Sếp hay nói', b30) +
    '\n' +
    bangMd('5 câu lỗi STT giả (mất dấu, sai một từ, số đếm bằng chữ)', bStt) +
    `\n## Ảnh\n\n` +
    [
      '01-javis-toi-ban-dieu-khien.png — "Javis, đi tới bàn điều khiển"',
      '02-gen-vui.png — "Gen, vui lên"',
      '03-moi-nguoi-chao.png — "mọi người chào"',
      '04-tab-giong-1440.png — tab "Giọng" (1440 px)',
      '05-tab-giong-390.png — tab "Giọng" (390 px)',
      '06-nao-tra-loi.png — "Gen, hôm nay làm gì" → não trả lời',
    ]
      .map((x) => `- ![${x}](${x.split(' — ')[0]})`)
      .join('\n') +
    '\n',
);

nhatKy.loiConsole = loiConsole;
nhatKy.tongKet = { soBuoc, soOk, thatBai };
writeFileSync(`${THU_MUC}/nhat-ky-kiem-c2.json`, JSON.stringify(nhatKy, null, 2) + '\n');

in_(`\n==> ${soOk}/${soBuoc} bước đạt. Nhật ký: ${THU_MUC}/nhat-ky-kiem-c2.json`);
if (thatBai.length) in_('!! Chưa đạt:\n   - ' + thatBai.join('\n   - '));

await thu('đóng trình duyệt', () => browser.close());
dongHet(thatBai.length ? 1 : 0);
