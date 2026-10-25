/**
 * kiem-a2.mjs — bằng chứng A2 vòng 2 trên app thật (Playwright + Chrome).
 *
 * Chạy:
 *   node scripts/kiem-a2.mjs            # trọn bộ: ảnh + số đo + video + FPS
 *   node scripts/kiem-a2.mjs --chi-anh  # NHANH, chỉ ảnh + số đo (dùng lúc làm)
 *   node scripts/kiem-a2.mjs <url>      # chạy vào một url có sẵn
 *
 * Ra:
 *   docs/a2/<emote>.png            1 ảnh/emote, TOÀN THÂN, góc TRƯỚC MẶT,
 *                                  chụp đúng đỉnh động tác (45% thời lượng)
 *   docs/a2/clip-<clip>.png        13 clip spec
 *   docs/a2/say-<camxuc>.png       4 nhóm cử chỉ khi nói
 *   docs/a2/idle-<kieu>.png        4 idleStyle
 *   docs/a2/a2-emote-demo.webm     video liền mạch ≤ 15 s
 *   docs/a2/nhat-ky-kiem-a2.json   LOG SỐ: y bàn tay vs y vai từng emote,
 *                                  tỉ lệ chibi, clip nền thật đang dùng, FPS
 *
 * Kiểm bằng số (không bằng mắt): 6 emote giơ tay phải có `y` bàn tay > `y` vai.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, rmSync, readdirSync, writeFileSync } from 'node:fs';

const THU_MUC = 'docs/a2';
mkdirSync(THU_MUC, { recursive: true });

const argv = process.argv.slice(2);
const CHI_ANH = argv.includes('--chi-anh');
const urlArg = argv.find((a) => a.startsWith('http'));

const EMOTES = [
  'vui', 'rat-vui', 'buon', 'ngac-nhien', 'gian', 'suy-nghi', 'dong-y',
  'tu-choi', 'chao', 'ra-lenh', 'thanh-cong', 'that-bai', 'boi-roi', 'met',
  'cham-chu',
];
/** Emote giơ tay — bắt buộc `y` bàn tay > `y` vai (lỗi chặn 1.1 vòng 1). */
const GIO_TAY = ['rat-vui', 'thanh-cong', 'ngac-nhien', 'boi-roi', 'chao', 'dong-y'];
const CLIPS = [
  'idle', 'walk', 'wave', 'nod', 'shake', 'think', 'clap', 'point',
  'celebrate', 'type', 'sleep', 'sit', 'stand',
];
const IDLE_STYLES = ['binh-thuong', 'hao-hung', 'met', 'cang-thang'];
/** 4 nhóm cử chỉ khi nói (spec 3.2b — vòng 1 chạy giống hệt nhau). */
const NHOM_NOI = ['vui', 'buon', 'gian', 'ngac-nhien'];
/** Video ≤ 15 s: 7 emote tiêu biểu, chạy liền mạch, không chụp xen giữa. */
const EMOTE_VIDEO = ['chao', 'rat-vui', 'ngac-nhien', 'suy-nghi', 'that-bai', 'thanh-cong', 'dong-y'];

let server = null;
async function moServer() {
  if (urlArg) return urlArg;
  const port = 4420 + ((Date.now() / 7) % 400 | 0);
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return await new Promise((resolve, reject) => {
    const han = setTimeout(() => reject(new Error('vite preview không khởi động')), 30000);
    const doc = (d) => {
      const s = String(d);
      process.stdout.write('   [vite] ' + s);
      const m = s.match(/http:\/\/localhost:\d+\/?/);
      if (m) { clearTimeout(han); resolve(m[0]); }
    };
    server.stdout.on('data', doc);
    server.stderr.on('data', doc);
  });
}

const in_ = (...x) => console.log(...x);
const loi = [];
const thatBai = [];
const nhatKy = { chay: new Date().toISOString(), cheDo: CHI_ANH ? 'chi-anh' : 'day-du', buoc: [] };
let soBuoc = 0, soOk = 0;

function ghi(nhan, ok, chiTiet, so) {
  soBuoc++;
  if (ok) soOk++; else thatBai.push(`${nhan}: ${chiTiet ?? ''}`);
  nhatKy.buoc.push({ nhan, ok, chiTiet: chiTiet ?? null, ...(so ? { so } : {}) });
  in_(`   ${ok ? '✓' : '✗'} ${nhan} ${chiTiet ?? ''}`);
}

const url = await moServer();
in_('==> URL:', url);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

function ganLoi(page, tien = '') {
  page.on('console', (m) => { if (m.type() === 'error') loi.push(`${tien}[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => loi.push(`${tien}[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => loi.push(`${tien}[requestfailed] ${r.url()} — ${r.failure()?.errorText}`));
}

/**
 * `camera.focus` chuẩn vào ĐÚNG actor, nâng điểm nhắm lên `themCao` m (vòng 4:
 * review vòng 3 thấy ảnh `rat-vui.png` cắt cụt đầu + tay vì khung hình thấp
 * quá) — dùng toạ độ `[x,y+themCao,z]` thay vì tên actor vì `camera.focus`
 * không có tham số chỉnh độ cao riêng (xem `world.ts#cameraFocus`).
 */
async function layCameraVaoActor(page, distance, themCao = 0) {
  const d = await page.evaluate(async () => {
    const r = await window.stage.describe();
    const a = r.ok ? r.result.actors.find((x) => x.id === 'lan') : null;
    return a ? a.pos : [0, 0, 0];
  });
  const target = themCao === 0 ? 'lan' : [d[0], d[1] + themCao, d[2]];
  await page.evaluate(
    ({ target, distance }) => window.stage.run('camera.focus', { target, distance }),
    { target, distance },
  );
}

/** Mở app, quay mặt về camera, đặt góc máy TOÀN THÂN CHÍNH DIỆN. */
async function moApp(ctx, tien = '') {
  const page = await ctx.newPage();
  ganLoi(page, tien);
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
  // Giảm bloom trước khi chụp: preset mặc định 'sang' làm bục trung tâm
  // bloom thổi trắng nhân vật, không đọc được mặt — 'toi' hạ đèn + exposure
  // (review PR #10 mục 2.2, dùng preset `scene.light` có sẵn, không đụng A3).
  await page.evaluate(() => window.stage.run('scene.light', { preset: 'toi' }));
  // Quay mặt về phía CỬA (`cua`, +Z, xa bàn điều khiển) — KHÔNG quay về
  // 'camera': camera mặc định nằm phía bàn điều khiển (-Z) nên turnTo
  // 'camera' quay actor úp mặt vào đúng cái bàn, rồi camera lùi theo hướng
  // đó và lọt vào trong bàn cong, che nửa dưới người (review PR #10 mục 2.2).
  await page.evaluate(() => window.stage.run('actor.turnTo', { actor: 'lan', target: 'cua' }));
  await page.waitForTimeout(900);
  // Ảnh emote toàn thân KHÔNG cắt đầu/tay (review vòng 3 mục 3: `rat-vui.png`
  // cắt ngang eo) — `camera.focus` vào actor, distance 3, điểm nhắm cao hơn
  // 0,3 m so với mặc định (không dùng preset `truoc-mat` cho ảnh toàn thân).
  await layCameraVaoActor(page, 3, 0.3);
  await page.waitForTimeout(4000);
  return page;
}

/* ------------------------------- 1) ảnh toàn thân + SỐ ĐO từng emote/clip */

{
  // khổ dọc để lọt trọn người, không cắt chân như vòng 1
  const ctx = await browser.newContext({ viewport: { width: 700, height: 840 } });
  const page = await moApp(ctx);

  const nen = await page.evaluate(() => window.stage.doXuong('lan'));
  ghi('clip chuyển động THẬT đang chạy', nen.clipThat === true, `dangNen=${nen.dangNen}`, {
    clipThat: nen.clipThat, dangNen: nen.dangNen,
  });

  const [minY, maxY] = nen.bbox;
  const tong = maxY - minY;
  const dauCao = maxY - nen.neck[1];
  const tyLe = tong / dauCao;
  ghi('tỉ lệ chibi đầu/người trong 1/2,5–1/3', tyLe >= 2.45 && tyLe <= 3.1,
    `1/${tyLe.toFixed(2)} (cao ${tong.toFixed(3)} m, đầu ${dauCao.toFixed(3)} m)`,
    { tong: +tong.toFixed(4), dauCao: +dauCao.toFixed(4), tyLe: +tyLe.toFixed(3) });
  await page.screenshot({ path: `${THU_MUC}/00-idle-toan-than.png` });

  in_('\n--- 15 emote: ảnh toàn thân chính diện ở đỉnh động tác + số đo tay/vai ---');
  const doTay = [];
  for (const emote of EMOTES) {
    const r = await page.evaluate(
      (e) => window.stage.run('actor.emote', { actor: 'lan', emote: e, interrupt: true }),
      emote,
    );
    const dai = r.ok ? r.result.durationMs : 1500;
    ghi(`actor.emote ${emote}`, r.ok === true, r.ok ? `durationMs=${dai}` : r.error);

    // ĐO TRƯỚC, CHỤP SAU: chụp ảnh trên renderer phần mềm mất vài giây, đo
    // sau khi chụp là đo nhầm lúc emote đã xong (bài học lúc thử nháp).
    await page.waitForTimeout(Math.round(dai * 0.45)); // đỉnh động tác
    const m = await page.evaluate(() => window.stage.doXuong('lan'));
    await page.screenshot({ path: `${THU_MUC}/${emote}.png` });
    const dT = +(m.banTayTrai[1] - m.vaiTrai[1]).toFixed(4);
    const dP = +(m.banTayPhai[1] - m.vaiPhai[1]).toFixed(4);
    const cao = Math.max(dT, dP);
    const so = { emote, dangNen: m.dangNen, tayTraiTruVai: dT, tayPhaiTruVai: dP, giơTay: GIO_TAY.includes(emote) };
    doTay.push(so);
    if (GIO_TAY.includes(emote)) {
      ghi(`CHIỀU TAY ${emote}: bàn tay phải CAO HƠN vai`, cao > 0,
        `max(tayT−vai, tayP−vai) = ${cao} m (nền ${m.dangNen})`, so);
    } else {
      ghi(`số đo tay ${emote}`, true, `tayT−vai=${dT} tayP−vai=${dP} (nền ${m.dangNen})`, so);
    }

    const d = await page.evaluate(() => window.stage.describe());
    const lan = d.ok ? d.result.actors.find((a) => a.id === 'lan') : null;
    ghi(`stage.describe sau ${emote}`, !!lan,
      lan ? `state=${lan.state} mood=${lan.mood} expression=${lan.expression}` : 'không thấy actor');
  }
  nhatKy.doTay = doTay;

  in_('\n--- 13 clip spec ---');
  for (const clip of CLIPS) {
    const r = await page.evaluate((c) => window.stage.run('actor.play', { actor: 'lan', clip: c, interrupt: true }), clip);
    const dai = r.ok ? r.result.durationMs : 1200;
    ghi(`actor.play ${clip}`, r.ok === true, r.ok ? `durationMs=${dai}` : r.error);
    await page.waitForTimeout(Math.max(400, Math.round(dai * 0.5)));
    const m = await page.evaluate(() => window.stage.doXuong('lan'));
    await page.screenshot({ path: `${THU_MUC}/clip-${clip}.png` });
    nhatKy.buoc.push({ nhan: `clip ${clip} dùng nền`, ok: true, chiTiet: m.dangNen });
  }
  await page.evaluate(() => window.stage.run('actor.play', { actor: 'lan', clip: 'stand', interrupt: true }));
  await page.waitForTimeout(900);

  in_('\n--- lỗi chặn vòng 4 mục 2.1: ngồi KHÔNG lún xuyên ghế/sàn, đo ở trạng thái ỔN ĐỊNH ---');
  // Vòng 3 đo quá sớm (durationMs + 300 ms, ~1,7 s) trong khi goc.position.y
  // còn đang lerp xuống — review đo thật thấy hội tụ ở ~6-20 s. Giờ lấy mẫu
  // 50 ms suốt 6 s SAU khi actor.sit báo xong, 3 lần/ghế (ngồi → đứng → ngồi),
  // yêu cầu bbox.min.y ≥ −0,01 ở MỌI mẫu.
  const doNgoi = [];
  for (const ghe of ['ghe-1', 'ghe-2']) {
    for (let lan = 1; lan <= 3; lan++) {
      const r = await page.evaluate(
        (g) => window.stage.run('actor.sit', { actor: 'lan', seat: g }),
        ghe,
      );
      ghi(`actor.sit ${ghe} (lần ${lan}/3)`, r.ok === true, r.ok ? `durationMs=${r.result.durationMs}` : r.error);
      await page.waitForTimeout(r.ok ? r.result.durationMs + 300 : 1500);

      if (lan === 1) {
        // Ảnh bằng chứng GÓC NGANG toàn thân, không bị bàn điều khiển che:
        // camera.focus thẳng vào actor, distance 2,5 (review vòng 4).
        await layCameraVaoActor(page, 2.5);
        // Camera bay tới theo lerp (k = dt·3,2 trong world.ts) — nhảy vài mét
        // (ghế bên này sang ghế bên kia) cần ~1,6 s mới ổn định hẳn, 500 ms là
        // chưa tới nơi (review vòng 4 tự phát hiện: ảnh ghe-2 chụp giữa chừng
        // lúc camera còn đang bay, lọt ra ngoài, không thấy actor).
        await page.waitForTimeout(1800);
        await page.screenshot({ path: `${THU_MUC}/clip-sit-${ghe}.png` });
      }

      const mau = [];
      const t0 = Date.now();
      while (Date.now() - t0 < 6000) {
        const m = await page.evaluate(() => window.stage.doXuong('lan'));
        mau.push(+m.bbox[0].toFixed(4));
        await page.waitForTimeout(50);
      }
      const minCuaLan = Math.min(...mau);
      const dat = minCuaLan >= -0.01;
      ghi(`${ghe} lần ${lan}: ngồi không lún — min(bbox.min.y) 6 s ≥ −0,01`, dat,
        `min=${minCuaLan} (${mau.length} mẫu)`, { ghe, lan, min: minCuaLan, soMau: mau.length });
      doNgoi.push({ ghe, lan, min: minCuaLan, mau });

      await page.evaluate(() => window.stage.run('actor.stand', { actor: 'lan' }));
      await page.waitForTimeout(900);
    }
  }
  nhatKy.doNgoi = doNgoi;

  in_('\n--- 3 lỗi chặn vòng 1: kiểm lại trên app THẬT ---');
  // 1.2 actor.stop reset biểu cảm + mood ngay
  await page.evaluate(() => window.stage.run('actor.emote', { actor: 'lan', emote: 'gian', interrupt: true }));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.stage.run('actor.stop', { actor: 'lan' }));
  await page.waitForTimeout(120);
  const sauStop = await page.evaluate(async () => {
    const d = await window.stage.describe();
    return d.ok ? d.result.actors.find((a) => a.id === 'lan') : null;
  });
  ghi('1.2 actor.stop → expression neutral + mood mặc định NGAY',
    sauStop?.expression === 'neutral' && sauStop?.mood === 'binh-thuong',
    `expression=${sauStop?.expression} mood=${sauStop?.mood}`,
    { expression: sauStop?.expression, mood: sauStop?.mood });

  // 1.3 cắt emote → emoteCancelled, không emoteDone, không ghi mood
  const su = await page.evaluate(async () => {
    const ds = [];
    const bo1 = window.stage.on('actor.emoteDone', (e) => ds.push('done:' + e.data.emote));
    const bo2 = window.stage.on('actor.emoteCancelled', (e) => ds.push('cancel:' + e.data.emote));
    await window.stage.run('actor.emote', { actor: 'lan', emote: 'buon', say: 'Câu cũ' });
    await new Promise((r) => setTimeout(r, 300));
    await window.stage.run('actor.emote', { actor: 'lan', emote: 'vui', say: 'Câu mới', interrupt: true });
    await new Promise((r) => setTimeout(r, 2600));
    bo1(); bo2();
    const d = await window.stage.describe();
    return { ds, mood: d.ok ? d.result.actors.find((a) => a.id === 'lan').mood : null };
  });
  ghi('1.3 emote bị cắt bắn emoteCancelled, KHÔNG bắn emoteDone',
    su.ds.includes('cancel:buon') && !su.ds.includes('done:buon') && su.ds.includes('done:vui'),
    JSON.stringify(su.ds), { suKien: su.ds, moodSau: su.mood });
  ghi('1.3 emote bị cắt KHÔNG ghi mood của mình', su.mood !== 'buon', `mood=${su.mood}`);

  // 2.2 durationMs đúng theo đồng hồ thật (kể cả renderer chậm)
  const doGio = await page.evaluate(async () => {
    const t0 = performance.now();
    const r = await window.stage.run('actor.emote', { actor: 'lan', emote: 'suy-nghi', interrupt: true });
    const hua = r.ok ? r.result.durationMs : 0;
    await new Promise((res) => {
      const bo = window.stage.on('actor.emoteDone', () => { bo(); res(); });
    });
    return { hua, that: Math.round(performance.now() - t0) };
  });
  const lech = Math.abs(doGio.that - doGio.hua);
  ghi('2.2 emote xong ĐÚNG GIỜ hứa (sai số < 400 ms dù renderer chậm)', lech < 400,
    `hứa ${doGio.hua} ms, thật ${doGio.that} ms, lệch ${lech} ms`, doGio);

  in_('\n--- actor.say: 4 nhóm cử chỉ theo cảm xúc ---');
  for (const camXuc of NHOM_NOI) {
    const r = await page.evaluate(
      (e) => window.stage.run('actor.say', {
        actor: 'lan', text: 'Sếp ơi, em đang nói với cảm xúc ' + e + ' đây ạ.', emotion: e,
      }),
      camXuc,
    );
    ghi(`actor.say emotion=${camXuc}`, r.ok === true, r.ok ? `durationMs=${r.result.durationMs}` : r.error);
    await page.waitForTimeout(Math.round((r.ok ? r.result.durationMs : 1500) * 0.5));
    await page.screenshot({ path: `${THU_MUC}/say-${camXuc}.png` });
    await page.waitForTimeout(600);
  }

  in_('\n--- actor.idleStyle (4 kiểu) ---');
  for (const kieu of IDLE_STYLES) {
    const r = await page.evaluate((k) => window.stage.run('actor.idleStyle', { actor: 'lan', style: k }), kieu);
    ghi(`actor.idleStyle ${kieu}`, r.ok === true, r.ok ? 'ok' : r.error);
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `${THU_MUC}/idle-${kieu}.png` });
  }
  await page.evaluate(() => window.stage.run('actor.idleStyle', { actor: 'lan', style: 'binh-thuong' }));

  await ctx.close();
}

/* ------------------------------------------- 2) video liền mạch ≤ 15 s */

if (!CHI_ANH) {
  in_('\n--- video liền mạch (≤ 15 s), góc trước mặt, không chụp xen giữa ---');
  const ctx = await browser.newContext({
    viewport: { width: 560, height: 700 },
    recordVideo: { dir: THU_MUC, size: { width: 560, height: 700 } },
  });
  const page = await moApp(ctx, '[video] ');

  const t0 = Date.now();
  for (const emote of EMOTE_VIDEO) {
    const r = await page.evaluate(
      (e) => window.stage.run('actor.emote', { actor: 'lan', emote: e, interrupt: true }),
      emote,
    );
    await page.waitForTimeout(r.ok ? r.result.durationMs : 1500);
  }
  const giay = (Date.now() - t0) / 1000;
  ghi('video: 7 emote liền mạch ≤ 15 s', giay <= 15.5, `${giay.toFixed(1)} s nội dung`, { giay: +giay.toFixed(1) });

  const video = page.video();
  await ctx.close();
  if (video) {
    const duongDan = `${THU_MUC}/a2-emote-demo.webm`;
    if (existsSync(duongDan)) rmSync(duongDan);
    await video.saveAs(duongDan);
    for (const f of readdirSync(THU_MUC)) {
      if (f.endsWith('.webm') && f !== 'a2-emote-demo.webm') rmSync(`${THU_MUC}/${f}`);
    }
    if (existsSync(duongDan)) in_(`\n🎥 video: ${duongDan}`);
  }
}

/* ----------------------------------------------------- 3) FPS 390×844 */

if (!CHI_ANH) {
  in_('\n--- FPS ở 390×844 (điện thoại) ---');
  const dt = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const dtPage = await dt.newPage();
  ganLoi(dtPage, '[mobile] ');
  await dtPage.goto(url, { waitUntil: 'load', timeout: 120000 });
  await dtPage.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
  await dtPage.evaluate(() => window.stage.run('actor.emote', { actor: 'lan', emote: 'chao' }));
  await dtPage.waitForTimeout(600);
  await dtPage.screenshot({ path: `${THU_MUC}/mobile-390x844.png` });
  const fps = await dtPage.evaluate(() => new Promise((resolve) => {
    let n = 0; const t0 = performance.now();
    (function tick() {
      n++; const d = performance.now() - t0;
      if (d < 2000) requestAnimationFrame(tick); else resolve((n / d) * 1000);
    })();
  }));
  // CHỈ THÔNG TIN: máy kiểm không có GPU thật (Chrome --use-angle=swiftshader,
  // dựng hình bằng CPU) → số này phản ánh giới hạn MÔI TRƯỜNG kiểm.
  // **FPS đo lại khi review** trên máy/điện thoại có GPU thật.
  nhatKy.fpsMobile = +fps.toFixed(2);
  in_(`   ℹ FPS mobile (swiftshader, chỉ tham khảo): ${fps.toFixed(1)} fps — ĐO LẠI KHI REVIEW`);
  await dt.close();
}

/* --------------------------------------------------------------- tổng kết */

await browser.close();
if (server) server.kill();

nhatKy.tongKet = { buoc: soBuoc, ok: soOk, consoleError: loi.length, loi, thatBai };
writeFileSync(`${THU_MUC}/nhat-ky-kiem-a2.json`, JSON.stringify(nhatKy, null, 2));

in_('\n==================== TỔNG KẾT A2 (vòng 2) ====================');
in_(`Bước: ${soOk}/${soBuoc} ok`);
in_(`console.error: ${loi.length}`);
loi.forEach((l) => in_('   ' + l));
if (thatBai.length) { in_('\nThất bại:'); thatBai.forEach((l) => in_('   ✗ ' + l)); }
in_(`Log số: ${THU_MUC}/nhat-ky-kiem-a2.json`);
in_('==============================================================\n');

process.exit(loi.length === 0 && thatBai.length === 0 ? 0 : 1);
