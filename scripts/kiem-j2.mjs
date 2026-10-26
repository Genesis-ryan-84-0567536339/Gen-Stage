/**
 * kiem-j2.mjs — BẰNG CHỨNG J2 (#79): **bảng hoạt động + tự sinh hoạt khi rảnh**.
 *
 * Chạy (**một lần** — cờ khoá `docs/j2/.da-chay`):
 *   node scripts/kiem-j2.mjs          # trọn bộ (~8 phút)
 *   node scripts/kiem-j2.mjs --lai    # xoá cờ khoá rồi chạy lại
 *
 * Đo trên **Firefox thật** (`firefox-1543`, không headless), bản `vite
 * preview`, **cổng web riêng 5393** — không đụng 5173 lẫn 8787-8790 của Boss.
 * Bộ này **không cần bridge**: hoạt động không nói gì, và Boss "gõ" qua đúng
 * cửa ô chat (`window.stage.guiChat`) nên không cần TTS/STT. Mở trang với
 * `?bridge=0`.
 *
 * Bốn thước đo của Issue:
 *   1. **12 hoạt động chạy trọn** qua `actor.activity`: `r.ok`, sự kiện
 *      `actor.activityDone` (không phải `Cancelled`), không bước nào lỗi, kết
 *      thúc về `idle`, không còn cầm gì — **và một ảnh mỗi hoạt động**.
 *   2. **Chân chạm sàn**: đế thấp nhất của mesh (quét đỉnh thật,
 *      `doXuong().tuThe.minY` = `Box3.setFromObject(root, true).min.y`) phải
 *      ∈ [−0,01; +∞) ở MỌI mẫu — lấy mẫu giữa hoạt động và lúc vừa xong.
 *   3. **Rảnh 60 s → ≥2 hoạt động TỰ SINH, khác nhau.**
 *   4. **Boss gõ giữa chừng → cắt ≤300 ms**, và lệnh sau đó vẫn chạy.
 * Cộng hai mục bắt buộc của mọi PR: `r.ok` cho MỌI lệnh trong cả phiên, và
 * console 0 lỗi.
 *
 * Mốc thời gian lấy từ **sổ bus của chính app** (`window.stage.on('*')` →
 * `e.t`) và **nhật ký lệnh** (`window.stage.log()`), không từ ảnh chụp: mốc
 * "cắt" nằm trong handler sự kiện, không chờ khung hình nào.
 *
 * Ra trong `docs/j2/`:
 *   hd-01-…png … hd-12-…png   một ảnh mỗi hoạt động (lúc vừa diễn xong)
 *   90-tu-sinh-hoat.png        Nhi đang tự sinh hoạt khi Boss để yên
 *   91-mobile-390.png          màn hẹp
 *   nhat-ky-kiem-j2.json       SỐ của từng mốc
 *   bang.md                    bảng số đo, dán thẳng vào mô tả PR
 */
import { firefox } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const THU_MUC = 'docs/j2';
mkdirSync(THU_MUC, { recursive: true });
const argv = process.argv.slice(2);

/* ------------------------------------------------- cờ khoá chạy một lần */

const CO_KHOA = `${THU_MUC}/.da-chay`;
if (argv.includes('--lai')) {
  if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
} else if (existsSync(CO_KHOA)) {
  console.error(
    `\n⛔ ${CO_KHOA} đã tồn tại — kiểm J2 chỉ chạy MỘT LẦN sau khi code xong.\n` +
      `   Kết quả lượt trước: ${THU_MUC}/nhat-ky-kiem-j2.json + ${THU_MUC}/bang.md\n` +
      '   Thật sự cần chạy lại: node scripts/kiem-j2.mjs --lai\n',
  );
  process.exit(2);
}

/* ------------------------------------------------------------- cổng riêng */

const CONG_WEB = Number(process.env.GEN_STAGE_WEB_PORT ?? 5393);
/**
 * Firefox qua X11 + **llvmpipe**, như `kiem-g3.mjs`/`kiem-i1.mjs`.
 *
 * Vì sao renderer phần mềm KHÔNG làm sai bộ số này: mọi thước đo của J2 là
 * **sự kiện/lệnh trong sổ của app** (hoạt động chạy trọn, mốc cắt) và **hình
 * học xương/mesh** (`minY` — hệ số đo bằng mét, không phụ thuộc rasterizer).
 * Không có số nào về FPS/mượt/tóc ở đây — đúng những thứ Cửa 1 cấm đo trên
 * renderer phần mềm. GPU thật (nouveau) thì gãy đúng cạm bẫy F2 (#56) ghi lại
 * khi có nhiều phiên Firefox khác đang dùng cùng GPU.
 */
const MOI_TRUONG_FF = { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1', MOZ_ENABLE_WAYLAND: '0' };

/* ---------------------------------------------------------------- tiện ích */

const in_ = (...x) => console.log(...x);

/**
 * **Từ chối chạy khi đã có phiên Firefox khác** (I1b, review PR #75).
 *
 * Nhiều phiên tranh GPU là nouveau gãy giữa lượt ("Exiting due to channel
 * error", cạm bẫy F2 #56), mà lượt gãy giữa đường thì số đo vô nghĩa — và bộ
 * này mở trình duyệt **đúng một lần** cho cả lượt nên không có đường cứu.
 *
 * Khớp theo **đường binary** `firefox-1543/firefox/firefox`, không phải
 * `firefox-1543` trần: chuỗi trần khớp luôn vòng `bash -c` của chính mình và
 * của agent khác đang chờ, thành ra mấy phiên chờ nhau vĩnh viễn.
 */
function kiemFirefoxTrong() {
  const r = spawnSync('pgrep', ['-f', 'firefox-1543/firefox/firefox'], { encoding: 'utf8' });
  const pid = String(r.stdout ?? '').trim().split(/\s+/).filter(Boolean);
  if (pid.length === 0) return;
  console.error(
    `\n⛔ Đã có ${pid.length} tiến trình firefox-1543 đang chạy (PID ${pid.join(', ')}).\n` +
      '   Chạy J2 lúc này là đo trên GPU đang bị tranh — nouveau gãy giữa lượt.\n' +
      '   Chờ phiên kia xong (hoặc tắt nó) rồi chạy lại: node scripts/kiem-j2.mjs --lai\n',
  );
  process.exit(3);
}
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
const thatBai = [];
const nhatKy = {
  chay: new Date().toISOString(),
  issue: 79,
  trinhDuyet: 'Playwright firefox-1543, headless:false, llvmpipe (chỉ đo sự kiện + hình học)',
  cong: { web: CONG_WEB },
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

/* ------------------------------------------------------------------- web */

let web = null;
let trinhDuyet = null;

async function moWeb() {
  web = spawn('npx', ['vite', 'preview', '--port', String(CONG_WEB), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    // `detached` để có NHÓM tiến trình riêng (bài học #37: `npx` sinh node con,
    // giết đúng PID mình giữ chỉ giết cái vỏ).
    detached: true,
  });
  return await new Promise((xong, loi) => {
    const han = setTimeout(() => loi(new Error('vite preview không khởi động')), 60000);
    const doc = (d) => {
      const s = String(d);
      process.stdout.write('   [vite] ' + s);
      const m = s.match(/http:\/\/localhost:\d+\/?/);
      if (m) {
        clearTimeout(han);
        xong(m[0]);
      }
    };
    web.stdout.on('data', doc);
    web.stderr.on('data', doc);
  });
}

/** Tắt ĐÚNG tiến trình của mình, theo PID mình giữ (không `fuser -k` cổng mù). */
function dongHet(ma) {
  try {
    trinhDuyet?.process()?.kill('SIGKILL');
  } catch {
    /* trình duyệt đã chết */
  }
  if (web?.pid) {
    try {
      process.kill(-web.pid, 'SIGTERM');
    } catch {
      try {
        web.kill('SIGTERM');
      } catch {
        /* đã chết rồi */
      }
    }
  }
  process.exit(ma);
}

process.on('uncaughtException', (e) => {
  in_('\n💥 ' + (e?.stack ?? e));
  dongHet(1);
});
process.on('unhandledRejection', (e) => {
  in_('\n💥 (promise) ' + (e?.stack ?? e));
  dongHet(1);
});

/* --------------------------------------------------------------- trình duyệt */

async function moTrang() {
  const browser = await firefox.launch({ headless: false, env: MOI_TRUONG_FF });
  trinhDuyet = browser;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const loiConsole = [];
  page.on('console', (m) => {
    if (m.type() === 'error') loiConsole.push(`[console] ${m.text()}`);
  });
  page.on('pageerror', (e) => loiConsole.push(`[pageerror] ${e.message}`));
  // `bridge=0`: bộ này không cần bridge (xem đầu file), và nối vào bridge thật
  // của Boss là vừa sai số vừa giành sân khấu với Boss.
  await page.goto(`http://localhost:${CONG_WEB}/?bridge=0`, {
    waitUntil: 'load',
    timeout: 180000,
  });
  await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
  await page.evaluate(() => {
    window.__ev = [];
    window.stage.on('*', (e) => window.__ev.push({ t: e.t, event: e.event, data: e.data }));
  });
  return { browser, page, loiConsole };
}

/* ---------------------------------------------------- đọc hai cái sổ của app */

const ev = (page) => page.evaluate(() => window.__ev);
const lenh = (page) =>
  page.evaluate(() => {
    const g = JSON.parse(window.stage.log());
    return (g.banGhi ?? []).filter((b) => b.loai === 'lenh');
  });
const sauEv = (ds, ten, tu, loc = () => true) =>
  ds.find((e) => e.event === ten && e.t >= tu && loc(e)) ?? null;

/** Số đo tư thế: đế thấp nhất của MESH (quét đỉnh thật) + chân xương. */
const doChan = (page) =>
  page.evaluate(() => {
    const d = window.stage.doXuong('gen');
    return {
      minY: d.tuThe?.minY ?? null,
      footY: d.tuThe?.footY ?? null,
      state: d.state,
    };
  });

/** Chờ `actor.activityDone` / `actor.activityCancelled` của Nhi. */
async function choHoatDongXong(page, tu, hanMs) {
  const het = Date.now() + hanMs;
  while (Date.now() < het) {
    const ds = await ev(page);
    const e =
      sauEv(ds, 'actor.activityDone', tu, (x) => x.data?.actor === 'gen') ??
      sauEv(ds, 'actor.activityCancelled', tu, (x) => x.data?.actor === 'gen');
    if (e) return e;
    await nghi(400);
  }
  return null;
}

/* ======================================================= chạy bằng chứng */

kiemFirefoxTrong();
writeFileSync(CO_KHOA, new Date().toISOString() + '\n');

in_(`\n--- dựng web ${CONG_WEB} (vite preview, không bridge) ---`);
await moWeb();
const { browser, page, loiConsole } = await moTrang();

try {
  /* ---------------------------------------- danh sách hoạt động từ chính app */
  in_('\n--- bảng hoạt động đọc từ `actor.activities` (không viết tay) ---');
  const dsHd = await page.evaluate(() =>
    window.stage.run('actor.activities').then((r) => (r.ok ? r.result.activities : null)),
  );
  ghi(
    '`actor.activities` trả về bảng ≥12 hoạt động',
    Array.isArray(dsHd) && dsHd.length >= 12,
    Array.isArray(dsHd) ? `${dsHd.length} hoạt động: ${dsHd.map((h) => h.name).join(', ')}` : 'lỗi',
    { soHoatDong: dsHd?.length ?? 0 },
  );
  if (!Array.isArray(dsHd)) throw new Error('không đọc được actor.activities');

  const btr = await page.evaluate(() =>
    window.stage.run('stage.bootstrap').then((r) => (r.ok ? r.result.commands.map((c) => c.cmd) : [])),
  );
  ghi(
    'hai lệnh mới vào `stage.bootstrap` (nên MCP tự có tool `actor_activity`)',
    btr.includes('actor.activity') && btr.includes('actor.activities'),
    `${btr.length} lệnh trong bootstrap`,
  );

  /* =========================================== MỐC 1 + 2: 12 hoạt động chạy trọn */
  in_('\n--- MỐC 1+2: từng hoạt động chạy trọn + chân chạm sàn ---');
  let ds = [];
  let dsL = [];
  const ketHd = [];
  let chanXau = null; // mẫu minY thấp nhất của cả phiên
  let soAnh = 0;
  for (const h of dsHd) {
    const t0 = Date.now();
    const r = await page.evaluate(
      (ten) => window.stage.run('actor.activity', { actor: 'gen', name: ten }),
      h.name,
    );
    // mẫu GIỮA hoạt động: lúc đang đi/ngồi/diễn, chỗ dễ lún chân nhất
    await nghi(Math.min(3000, Math.max(900, (h.estimatedMs ?? 6000) / 3)));
    const giua = await doChan(page);
    const xong = await choHoatDongXong(page, t0, Math.max(40000, (h.estimatedMs ?? 8000) * 4));
    await nghi(600);
    const sau = await doChan(page);
    const st = await page.evaluate(() =>
      window.stage.run('stage.describe').then((x) => {
        const g = x.result.actors.find((a) => a.id === 'gen');
        return { state: g.state, holding: g.holding, activity: g.activity, at: g.at, pos: g.pos };
      }),
    );
    soAnh++;
    const anh = `hd-${String(soAnh).padStart(2, '0')}-${h.name}.png`;
    await page.screenshot({ path: `${THU_MUC}/${anh}` });

    for (const m of [giua, sau]) {
      if (m.minY === null || !Number.isFinite(m.minY)) continue;
      if (chanXau === null || m.minY < chanXau.minY) chanXau = { ...m, hoatDong: h.name };
    }
    const ok =
      r.ok === true &&
      xong?.event === 'actor.activityDone' &&
      xong?.data?.errors === undefined &&
      st.state === 'idle' &&
      st.holding === null &&
      st.activity === null;
    ketHd.push({
      name: h.name,
      label: h.label,
      ok,
      rOk: r.ok === true,
      suKien: xong?.event ?? 'KHÔNG CÓ',
      buoc: xong?.data?.steps ?? null,
      loiBuoc: xong?.data?.errors ?? null,
      stateSau: st.state,
      holdingSau: st.holding,
      minYGiua: giua.minY,
      minYSau: sau.minY,
      anh,
      msThat: Date.now() - t0,
      uocMs: h.estimatedMs,
    });
    ghi(
      `hoạt động «${h.label}» (${h.name}) chạy trọn`,
      ok,
      `r.ok=${r.ok} · ${xong?.event ?? 'không có sự kiện'} · ${xong?.data?.steps ?? '—'} bước · ` +
        `state ${st.state} · holding ${st.holding} · minY giữa ${giua.minY} / sau ${sau.minY} · ` +
        `${Date.now() - t0} ms (ước ${h.estimatedMs} ms) · ảnh ${anh}` +
        (xong?.data?.errors ? ` · LỖI BƯỚC: ${JSON.stringify(xong.data.errors)}` : ''),
      ketHd.at(-1),
    );
  }
  const soTron = ketHd.filter((x) => x.ok).length;
  ghi(
    `MỐC 1 — cả ${dsHd.length} hoạt động chạy TRỌN, mỗi cái một ảnh`,
    soTron === dsHd.length,
    `${soTron}/${dsHd.length} trọn · ${soAnh} ảnh trong ${THU_MUC}/`,
    { soTron, soHoatDong: dsHd.length, soAnh },
  );
  ghi(
    'MỐC 2 — đế giày (quét mesh) KHÔNG lún: minY ≥ −0,01 m ở mọi mẫu',
    chanXau !== null && chanXau.minY >= -0.01,
    chanXau
      ? `thấp nhất ${chanXau.minY} m (state ${chanXau.state}, hoạt động «${chanXau.hoatDong}»), ` +
        `xương bàn chân ${chanXau.footY} m`
      : 'không đo được',
    chanXau,
  );

  /* ============================== MỐC 4: Boss gõ giữa chừng → cắt ≤300 ms */
  in_('\n--- MỐC 4: Boss gõ giữa chừng → cắt ≤300 ms, lệnh sau vẫn chạy ---');
  const tBatDau = Date.now();
  await page.evaluate(() => window.stage.run('actor.activity', { actor: 'gen', name: 'di-dao' }));
  await nghi(2500);
  const dangLam = await page.evaluate(() =>
    window.stage.run('stage.describe').then((x) => x.result.actors.find((a) => a.id === 'gen').activity),
  );
  ghi(
    '`stage.describe().activity` báo đúng hoạt động đang làm',
    dangLam === 'di-dao',
    `activity = ${JSON.stringify(dangLam)}`,
  );
  const tGo = Date.now();
  await page.evaluate(() => window.stage.guiChat('Nhi ơi, lại đây giúp anh chút'));
  await nghi(2000);
  ds = await ev(page);
  const evText = sauEv(ds, 'user.text', tGo - 50, (e) => e.data?.actor === 'owner');
  const evCat = evText
    ? sauEv(ds, 'actor.activityCancelled', evText.t - 5, (e) => e.data?.actor === 'gen')
    : null;
  const treCat = evText && evCat ? evCat.t - evText.t : null;
  ghi(
    'MỐC 4 — t(user.text) → t(actor.activityCancelled) ≤300 ms',
    treCat !== null && treCat <= 300,
    `${treCat} ms (cắt sau ${evCat?.data?.steps ?? '—'} bước; hoạt động bắt đầu ${tGo - tBatDau} ms trước đó)`,
    { treCatMs: treCat, buocDaChay: evCat?.data?.steps ?? null },
  );
  const sauCat = await page.evaluate(() =>
    window.stage.run('stage.describe').then((x) => {
      const g = x.result.actors.find((a) => a.id === 'gen');
      return { activity: g.activity, state: g.state, queued: g.queued };
    }),
  );
  ghi(
    'cắt rồi thì `activity` về null và Nhi quay sang Boss (không đi tiếp)',
    sauCat.activity === null,
    JSON.stringify(sauCat),
    sauCat,
  );
  // lệnh ngay sau khi cắt vẫn chạy được (hàng đợi không bị xoá sạch)
  const rSau = await page.evaluate(() =>
    window.stage.run('actor.emote', { actor: 'gen', emote: 'dong-y' }),
  );
  ghi('lệnh gửi ngay sau cú cắt vẫn `ok`', rSau.ok === true, JSON.stringify(rSau).slice(0, 160));

  /*
   * Chờ cho **vòng chờ não của I1 tắt hẳn** trước khi đo mốc 3.
   *
   * Bộ này chạy `?bridge=0` nên không có não: câu vừa gõ đưa phản xạ vào tầng
   * 2, và tầng 2 có **trần 30 s** (`tranTangHaiMs`, I1b/#75) — tới hạn Nhi nói
   * `CAU_HET_CHO`. Câu đó nổ giữa phút đo "để yên 65 s" thì đồng hồ rảnh của
   * máy tự sinh hoạt reset đúng lúc, và lượt thứ hai rơi ra ngoài phút đo:
   * **lỗi của dụng cụ đo, không phải của app**. Chờ cho hết trần rồi mới bấm
   * đồng hồ.
   */
  in_('   … chờ 36 s cho vòng "đang nghĩ" của I1 hết trần 30 s rồi mới bấm đồng hồ');
  await nghi(36000);

  /* ================================ MỐC 3: rảnh 65 s → ≥2 hoạt động tự sinh */
  in_('\n--- MỐC 3: để yên 65 s → Nhi tự sinh ≥2 hoạt động khác nhau ---');
  const tYen = Date.now();
  // Để YÊN thật: không gõ, không bấm, không gọi lệnh nào trong 65 s.
  for (let i = 0; i < 13; i++) {
    await nghi(5000);
    if (i === 6) await page.screenshot({ path: `${THU_MUC}/90-tu-sinh-hoat.png` });
  }
  ds = await ev(page);
  dsL = await lenh(page);
  const tuSinh = ds.filter(
    (e) => e.event === 'actor.activityStart' && e.t >= tYen && e.data?.actor === 'gen',
  );
  const lenhTuSinh = dsL.filter((b) => b.nguon === 'tu-sinh-hoat' && b.t >= tYen);
  const tenTuSinh = tuSinh.map((e) => String(e.data?.activity));
  ghi(
    'MỐC 3 — rảnh 65 s → ≥2 hoạt động TỰ SINH, khác nhau',
    tuSinh.length >= 2 && new Set(tenTuSinh).size >= 2,
    `${tuSinh.length} lượt: ${tenTuSinh.join(' → ')} (${new Set(tenTuSinh).size} loại khác nhau)`,
    { soLuot: tuSinh.length, ten: tenTuSinh, soKhacNhau: new Set(tenTuSinh).size },
  );
  ghi(
    'lệnh tự sinh đi qua dispatcher với nguồn "tu-sinh-hoat" (phân biệt được trong nhật ký)',
    lenhTuSinh.length >= 2 && lenhTuSinh.every((b) => b.cmd === 'actor.activity'),
    `${lenhTuSinh.length} lệnh nguồn tu-sinh-hoat: ${lenhTuSinh.map((b) => b.args?.name).join(', ')}`,
    { soLenhTuSinh: lenhTuSinh.length },
  );
  const dinhThoiGian = tuSinh.length >= 2 ? tuSinh[1].t - tuSinh[0].t : null;
  ghi(
    'lượt tự sinh đầu tiên nổ sau ~20 s im lặng (ngưỡng `ranhMs`)',
    tuSinh.length >= 1 && tuSinh[0].t - tYen >= 19000 && tuSinh[0].t - tYen <= 40000,
    `lượt 1 ở +${tuSinh.length ? tuSinh[0].t - tYen : '—'} ms · khoảng giữa hai lượt ${dinhThoiGian} ms`,
    { luot1Ms: tuSinh.length ? tuSinh[0].t - tYen : null, giuaHaiLuotMs: dinhThoiGian },
  );
  const chanTuSinh = await doChan(page);
  ghi(
    'sau khi tự sinh hoạt, chân vẫn chạm sàn (minY ≥ −0,01 m)',
    chanTuSinh.minY !== null && chanTuSinh.minY >= -0.01,
    `minY ${chanTuSinh.minY} m (state ${chanTuSinh.state})`,
    chanTuSinh,
  );

  /* ============================================== sạch: mọi lệnh ok, console 0 */
  in_('\n--- sạch: r.ok mọi lệnh · console 0 lỗi · màn 390 px ---');
  await page.setViewportSize({ width: 390, height: 844 });
  await nghi(3000);
  await page.screenshot({ path: `${THU_MUC}/91-mobile-390.png` });
  await page.setViewportSize({ width: 1440, height: 900 });

  dsL = await lenh(page);
  const loiLenh = dsL.filter((b) => b.ok !== true);
  ghi(
    'r.ok = true cho MỌI lệnh trong cả phiên',
    loiLenh.length === 0,
    `${dsL.length} lệnh, ${loiLenh.length} lỗi` +
      (loiLenh.length ? ': ' + loiLenh.map((b) => `${b.cmd} (${b.error})`).join(' · ') : ''),
    { soLenh: dsL.length, loi: loiLenh.slice(0, 5) },
  );
  const soLenhHd = dsL.filter((b) => b.cmd === 'actor.activity').length;
  ghi(
    'hoạt động chạy bằng LỆNH CÓ SẴN qua ctx.run (nhật ký có đủ moveTo/sit/play/emote)',
    dsL.some((b) => b.cmd === 'actor.sit') &&
      dsL.some((b) => b.cmd === 'actor.play') &&
      dsL.some((b) => b.cmd === 'actor.moveTo') &&
      dsL.some((b) => b.cmd === 'actor.hold'),
    `${soLenhHd} lệnh actor.activity · ${dsL.length} lệnh tổng`,
  );
  ghi('console 0 lỗi suốt cả vòng', loiConsole.length === 0, loiConsole.slice(0, 4).join(' | '), {
    loiConsole,
  });

  /* ------------------------------------------------------------- kết quả */
  nhatKy.hoatDong = ketHd;
  nhatKy.tomTat = { soBuoc, soOk, thatBai };
  writeFileSync(`${THU_MUC}/nhat-ky-kiem-j2.json`, JSON.stringify(nhatKy, null, 2));

  const bangHd = ketHd
    .map(
      (x) =>
        `| ${x.name} | ${x.buoc ?? '—'} | ${x.msThat} ms (ước ${x.uocMs}) | ${x.minYGiua} / ${x.minYSau} | ` +
        `${x.stateSau} | ${x.ok ? '✅' : '❌'} | \`${x.anh}\` |`,
    )
    .join('\n');
  const bang = [
    '| Thước đo (Issue #79) | Lời hứa | Đo thật | Kết |',
    '| --- | --- | --- | --- |',
    `| số hoạt động trong bảng | ≥12 | **${dsHd.length}** | ${dsHd.length >= 12 ? '✅' : '❌'} |`,
    `| hoạt động chạy TRỌN (r.ok + activityDone + về idle) | 12/12 | **${soTron}/${dsHd.length}** | ${soTron === dsHd.length ? '✅' : '❌'} |`,
    `| đế giày quét mesh (\`minY\`) | ≥ −0,01 m | **${chanXau?.minY ?? '—'} m** | ${chanXau && chanXau.minY >= -0.01 ? '✅' : '❌'} |`,
    `| rảnh 65 s → hoạt động tự sinh | ≥2, khác nhau | **${tuSinh.length} lượt / ${new Set(tenTuSinh).size} loại** | ${tuSinh.length >= 2 && new Set(tenTuSinh).size >= 2 ? '✅' : '❌'} |`,
    `| Boss gõ giữa chừng → cắt | ≤300 ms | **${treCat} ms** | ${treCat !== null && treCat <= 300 ? '✅' : '❌'} |`,
    `| \`r.ok\` mọi lệnh | 100 % | **${dsL.length - loiLenh.length}/${dsL.length}** | ${loiLenh.length === 0 ? '✅' : '❌'} |`,
    `| console | 0 lỗi | **${loiConsole.length}** | ${loiConsole.length === 0 ? '✅' : '❌'} |`,
    '',
    '### Từng hoạt động',
    '',
    '| hoạt động | bước | thời lượng | minY giữa / sau (m) | state cuối | kết | ảnh |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    bangHd,
    '',
    `Tự sinh hoạt: ${tenTuSinh.join(' → ') || '(không có)'}; lượt đầu ở +${
      tuSinh.length ? tuSinh[0].t - tYen : '—'
    } ms sau khi Boss để yên.`,
    `Cổng web riêng ${CONG_WEB}, \`?bridge=0\` — không đụng 5173/8787-8790 của Boss.`,
  ].join('\n');
  writeFileSync(`${THU_MUC}/bang.md`, bang + '\n');
  in_('\n' + bang + '\n');

  in_(`\n=== ${soOk}/${soBuoc} mục ĐẠT ===`);
  if (thatBai.length) {
    in_('✗ CHƯA ĐẠT:');
    for (const t of thatBai) in_('   - ' + t);
  }
  await browser.close();
  dongHet(thatBai.length ? 1 : 0);
} catch (e) {
  in_('\n💥 ' + (e?.stack ?? e));
  nhatKy.loiChay = String(e?.message ?? e);
  nhatKy.tomTat = { soBuoc, soOk, thatBai };
  writeFileSync(`${THU_MUC}/nhat-ky-kiem-j2.json`, JSON.stringify(nhatKy, null, 2));
  try {
    await page.screenshot({ path: `${THU_MUC}/99-loi.png` });
  } catch {
    /* trang đã chết */
  }
  await browser.close().catch(() => undefined);
  dongHet(1);
}
