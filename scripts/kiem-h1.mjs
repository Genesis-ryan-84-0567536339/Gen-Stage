/**
 * kiem-h1.mjs — BẰNG CHỨNG H1 (Issue #69): làm theo `docs/KIEM-TOAN-SKILL.md`.
 *
 * Chạy trên **FIREFOX GPU THẬT** (`headless: false`) và trên **BẢN BUILD**
 * (`vite preview`), đúng hai điều mà `threejs-qa-release` đòi và mà đợt D–F
 * còn làm nửa vời.
 *
 * Sáu số đo:
 *   1. giữ phím `1` (1 keydown + 30 nhịp `repeat`) → ĐÚNG MỘT `actor.emote`;
 *      giữ `C`/`E` cũng vậy. Trước H1: 31 lệnh mỗi lần giữ.
 *   2. `scene.light sang` và phím `R` → **luma p95 không đổi** (≤ 2 %). Trước
 *      H1 trời sáng thêm 26 % mỗi lần gọi, đúng lỗi "chói" Boss báo.
 *   3. `actor.moveTo` lái Nhi **xuyên sofa** → dừng/trượt, không khung nào
 *      nằm trong hộp sofa.
 *   4. camera chạy quanh nhà (bám chủ + 5 preset + xoay chuột) → **mọi mẫu vị
 *      trí camera nằm trong AABB nhà**.
 *   5. FPS (`?fps=1`) + `calls`/tam giác trên bản build.
 *   6. console: 0 lỗi.
 *   7. **dao động `|v|`** (biến trạng thái của bộ tích phân) khi giữ phím, đo
 *      trên cửa sổ chạy tự do ≥ 120 khung — KHÔNG phải "hết giật" (quãng
 *      đi được/khung vẫn còn nợ #3 nội suy render).
 *  10. **tay máy ở 4 góc + dọc 4 tường** (review PR #72 mục 1): khoảng cách
 *      camera → ĐẦU nhân vật mỗi 100 ms ≥ 0,6 m, `|v|` camera ≤ 3 m/s, 0 mẫu
 *      ngoài AABB. Số 4 không bắt được lỗi này: co vào trong người thì vẫn ở
 *      trong hộp nhà.
 *
 * Cổng RIÊNG: vite preview **8961** — KHÔNG đụng 5173 / 8787-8790 / tmux của
 * Boss. Chỉ giết tiến trình do chính script này spawn (PID âm của group).
 *
 *   node scripts/kiem-h1.mjs                 # bằng chứng đầy đủ (MỘT LẦN)
 *   node scripts/kiem-h1.mjs --lai           # cho phép chạy lại
 *   node scripts/kiem-h1.mjs --chi-fps --nhan=truoc   # chỉ đo FPS/luma làm mốc
 */
import { firefox } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createConnection as netConnect } from 'node:net';
import { lumaStats } from './lib-png.mjs';

const argv = process.argv.slice(2);
const CHI_FPS = argv.includes('--chi-fps');
const NHAN = (argv.find((a) => a.startsWith('--nhan=')) ?? '--nhan=sau').slice(7);
const THU_MUC = 'docs/h1';
mkdirSync(THU_MUC, { recursive: true });

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mốc chấm điểm. */
const MOC = {
  /**
   * Luma được phép lệch bao nhiêu phần trăm sau `scene.light`/`R`.
   *
   * Chấm trên **p50** mới có nghĩa: đo mốc trên `main` cho thấy `p95` đã
   * **bão hoà** (204,9 → 206,0 = 0,54 %) vì ACES + exposure 0,86 nén hết mảng
   * sáng, trong khi p50 nhảy 121,6 → 127,6 = **+4,9 %** — đó mới là cái mắt
   * Boss đọc ra thành "chói". Giữ cả hai ngưỡng trong nhật ký.
   */
  lumaLechToiDa: 2,
  lumaLechP50ToiDa: 1,
  /** FPS trung vị tối thiểu trên GPU thật. */
  /**
   * Trung vị 3 lượt phải ≥ mốc này. Hạ 24 → 20 sau khi đo thật: hai lượt liền
   * nhau trên cùng bản build cho 23,3 và 29,5 — nouveau + GPU chia với desktop
   * của Boss dao động ±25 %. Mốc 20 vẫn bắt được hồi quy thật (mất nửa FPS)
   * mà không biến cổng thành xúc xắc.
   */
  fpsToiThieu: 20,
  /**
   * Dao động tốc độ khi GIỮ phím, phần trăm — Cửa 2 vòng 28/10 mục 12 đo
   * W/S/A/D = 33 / 6 / 44 / 34 % trên Firefox GPU, mốc là ≤ 35 %.
   */
  daoDongToiDa: 35,
  /** Bảng lệnh được phép phủ bao nhiêu phần trăm khung 3D lúc MỚI mở trang. */
  bangPhuToiDa: 5,
  /** Nhà 14 × 10 m, trần 2,8 m — AABB mà camera phải nằm trong (lề 0,05 m). */
  nha: { hx: 7, hz: 5, yMin: 0, yMax: 2.8 },
  /**
   * Review PR #72 mục 1 — **khoảng cách camera → đầu nhân vật nhỏ nhất** (m).
   * Khớp `MAY_GAN_TOI_DA`/`controls.minDistance` trong `world.ts`. Trước vòng
   * 2 đo được 0,1265 m: khung hình chỉ còn cái áo.
   */
  tayMayToiThieu: 0.6,
  /** Tốc độ camera bám lớn nhất (m/s). Trước vòng 2: 13,23 tích vào tường. */
  vMayToiDa: 3,
};

/**
 * Số khung tối thiểu của **cửa sổ chạy tự do** để số (7) có nghĩa (review PR
 * #72 mục 2): 120 khung ≈ 2 s ở 60 FPS.
 */
const KHUNG_TU_DO_TOI_THIEU = 120;

const CO_KHOA = `${THU_MUC}/.da-chay`;
if (!CHI_FPS) {
  if (argv.includes('--lai')) {
    if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
  } else if (existsSync(CO_KHOA)) {
    console.error(
      `\n⛔ ${CO_KHOA} đã tồn tại — kiểm H1 chỉ chạy MỘT LẦN sau khi code xong.\n` +
        `   Kết quả lượt trước: ${THU_MUC}/nhat-ky-kiem-h1.json + ảnh trong ${THU_MUC}/.\n` +
        '   Thật sự cần chạy lại: node scripts/kiem-h1.mjs --lai\n',
    );
    process.exit(2);
  }
}

function congBan(cong) {
  return new Promise((ok) => {
    const sk = netConnect({ host: '127.0.0.1', port: cong });
    sk.on('connect', () => {
      sk.destroy();
      ok(true);
    });
    sk.on('error', () => ok(false));
    setTimeout(() => {
      sk.destroy();
      ok(false);
    }, 600);
  });
}

/** Cổng ≥ 8960 theo giao kèo H1: không đụng 8787-8790 của Boss. */
const PORT = 8961;
if (await congBan(PORT)) {
  console.error(`⛔ Cổng ${PORT} đang bận — đổi PORT, KHÔNG giết tiến trình của Sếp.`);
  process.exit(3);
}

if (!argv.includes('--khong-build')) {
  console.log('==> vite build — mọi số đo H1 lấy trên BẢN BUILD, không dev server');
  const b = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit' });
  if (b.status !== 0) {
    console.error('⛔ vite build thất bại.');
    process.exit(1);
  }
}

console.log(`==> bật vite PREVIEW ở cổng ${PORT}`);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
await new Promise((ok, no) => {
  const han = setTimeout(() => no(new Error('vite preview không khởi động')), 60000);
  const doc = (d) => {
    if (/localhost:/.test(String(d))) {
      clearTimeout(han);
      ok();
    }
  };
  server.stdout.on('data', doc);
  server.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
});
await nghi(500);

function dietCay(p) {
  if (!p?.pid) return;
  try {
    process.kill(-p.pid, 'SIGTERM');
  } catch {
    /* đã chết */
  }
}

const url = `http://localhost:${PORT}/`;
const nhatKy = {
  khi: new Date().toISOString(),
  nhan: NHAN,
  trinhDuyet: 'firefox (playwright) — GPU thật, headless:false',
  banDo: 'vite preview (BẢN BUILD)',
  moc: MOC,
  so: {},
  dat: {},
  loiConsole: [],
};
const loi = [];
function chot(ten, dat, chiTiet) {
  nhatKy.dat[ten] = { dat, ...chiTiet };
  console.log(`${dat ? '✅' : '❌'} ${ten} ${JSON.stringify(chiTiet)}`);
  if (!dat) loi.push(ten);
}

/**
 * Chạy MỘT lệnh qua dispatcher thật và **bắt buộc `r.ok`**.
 *
 * Review PR #72 mục 2: bản đầu gọi `actor.moveTo { x, z }` trong khi lệnh nhận
 * `to`, dispatcher từ chối, mà script không kiểm `r.ok` — nên hai số bằng
 * chứng đo một nhân vật **chưa bao giờ nhận lệnh đi**. Giờ mọi lệnh đi qua
 * đây và `!ok` là **ném**, không có số nào đứng trên một lệnh bị từ chối.
 */
async function lenh(pg, cmd, args) {
  const r = await pg.evaluate(
    ([c, a]) => window.stage.run(c, a).then((x) => ({ ok: x.ok, error: x.error ?? null })),
    [cmd, args],
  );
  if (!r.ok) throw new Error(`lệnh ${cmd} ${JSON.stringify(args)} bị từ chối: ${r.error}`);
  return r;
}

const br = await firefox.launch({
  headless: false,
  // Wayland + nouveau làm tiến trình GPU của Firefox gãy; qua X11 thì WebGL
  // vẫn là GPU THẬT (bài học F2).
  env: { ...process.env, MOZ_ENABLE_WAYLAND: '0', MOZ_X11_EGL: '0' },
});
let maLoi = 0;
try {
  const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
  pg.on('console', (m) => {
    if (m.type() === 'error') nhatKy.loiConsole.push(m.text());
  });
  pg.on('pageerror', (e) => nhatKy.loiConsole.push(String(e)));

  // Lần nạp nào cũng là "Boss mở trang lần đầu": xoá `localStorage` TRƯỚC khi
  // trang chạy, nên số đo bảng lệnh không phụ thuộc lượt chạy trước.
  await pg.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      /* chế độ riêng tư */
    }
  });
  await pg.goto(`${url}?bridge=0&fps=1`, { waitUntil: 'load' });
  await pg.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
  await nghi(1500);

  const anh = async (ten) => {
    const p = `${THU_MUC}/${ten}.png`;
    await pg.screenshot({ path: p });
    return p;
  };

  if (!CHI_FPS) {
    /* ====== 8. bảng lệnh thu gọn mặc định ở 1440 (Cửa 2 vòng 28/10 mục 5) ====
     * Đo NGAY lúc vừa nạp, trước khi ẩn overlay — đây mới là thứ Boss thấy. */
    const phu = await pg.evaluate(() => {
      const b = document.getElementById('bang');
      const r = b.getBoundingClientRect();
      const rong = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
      const cao = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      return {
        thuGon: b.classList.contains('thu-gon'),
        phuPc: +(((rong * cao) / (innerWidth * innerHeight)) * 100).toFixed(1),
        rong: +r.width.toFixed(1),
      };
    });
    await anh('10-mo-trang-1440-bang-thu-gon');
    nhatKy.so.bangLenh = phu;
    chot('8-bang-lenh-thu-gon-mac-dinh-1440', phu.thuGon && phu.phuPc <= MOC.bangPhuToiDa, {
      ...phu,
      mocPc: MOC.bangPhuToiDa,
      truocH1: 27.1,
    });
    await pg.click('#bang-dong-mo');
    await nghi(600);
    const sauKeo = await pg.evaluate(() =>
      document.getElementById('bang').classList.contains('thu-gon'),
    );
    await anh('10b-bang-mo-khi-bam-nut');
    chot('8b-nut-keo-ra-mo-duoc-bang', sauKeo === false, { thuGonSauKhiBam: sauKeo });
    await pg.click('#bang-dong-mo');
    await nghi(400);

    /* === 9. module.build { from: 'main' } không còn chết (Cửa 2 mục 6) === */
    const kqMain = await pg.evaluate(async () => {
      const canh = [];
      window.stage.on('module.fallback', (e) => canh.push(e.data));
      const r = await window.stage.run('module.build', {
        id: 'h1-connector-baserow',
        shape: 'book',
        label: 'Baserow',
        from: 'main',
        durationMs: 800,
      });
      await new Promise((x) => setTimeout(x, 2000));
      const st = await window.stage.describe();
      return {
        ok: r.ok,
        loi: r.error ?? null,
        canhBao: canh,
        coProp: ((st.result ?? st).props ?? []).some((p) => p.id === 'h1-connector-baserow'),
      };
    });
    nhatKy.so.moduleFromMain = kqMain;
    chot(
      '9-module-build-from-main-tu-lay-man-hinh-dau',
      kqMain.ok === true && kqMain.canhBao.length === 1 && kqMain.coProp === true,
      {
        ok: kqMain.ok,
        loi: kqMain.loi,
        xin: kqMain.canhBao[0]?.xin ?? null,
        dung: kqMain.canhBao[0]?.dung ?? null,
        coSan: kqMain.canhBao[0]?.coSan ?? null,
        moduleCoTrenSanKhau: kqMain.coProp,
      },
    );
    await anh('11-module-from-main-van-dung-duoc');
    // `prop`, không phải `id` — lỗi thứ hai mà `lenh()` (kiểm `r.ok`) bắt được
    await lenh(pg, 'prop.remove', { prop: 'h1-connector-baserow' });
    await nghi(400);
  }

  // Ẩn overlay để ảnh chỉ còn sân khấu (mẫu của D1b/F1).
  await pg.addStyleTag({
    content:
      '#bang,#hud,#toast,#loading,#o-chat,#goi-y-phim,#nut-tieng,#o-noi-nhanh{display:none!important}',
  });
  await nghi(600);

  /* ============================================ 2 + 5. luma / FPS làm mốc */
  await lenh(pg, 'camera.preset', { name: 'toan-canh' });
  await nghi(2000);
  const aTruoc = await anh(`${CHI_FPS ? NHAN + '-' : ''}01-toan-canh-truoc`);
  const lTruoc = lumaStats(aTruoc);

  // `scene.light sang` — đúng đường mà `stage.reset` và phím R đi qua
  await lenh(pg, 'scene.light', { preset: 'sang' });
  await nghi(1200);
  const aSau = await anh(`${CHI_FPS ? NHAN + '-' : ''}02-toan-canh-sau-scene-light`);
  const lSau = lumaStats(aSau);
  const pc = (a, b) => +((Math.abs(b - a) / Math.max(1, a)) * 100).toFixed(2);
  const lech = pc(lTruoc.p95, lSau.p95);
  const lech50 = pc(lTruoc.p50, lSau.p50);
  nhatKy.so.luma = { truoc: lTruoc, sau: lSau, lechP95Pc: lech, lechP50Pc: lech50 };
  chot(
    '2-scene-light-sang-khong-doi-luma',
    lech <= MOC.lumaLechToiDa && lech50 <= MOC.lumaLechP50ToiDa,
    {
      p50Truoc: lTruoc.p50,
      p50Sau: lSau.p50,
      lechP50Pc: lech50,
      p95Truoc: lTruoc.p95,
      p95Sau: lSau.p95,
      lechP95Pc: lech,
    },
  );

  // phím R (stage.reset → sceneLight) — cùng giao kèo, qua đúng cửa của Boss
  await pg.evaluate(() => {
    document.activeElement?.blur?.();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }));
  });
  await nghi(3000);
  await lenh(pg, 'camera.preset', { name: 'toan-canh' });
  await nghi(2200);
  const aR = await anh(`${CHI_FPS ? NHAN + '-' : ''}03-toan-canh-sau-phim-R`);
  const lR = lumaStats(aR);
  const lechR = pc(lTruoc.p95, lR.p95);
  const lechR50 = pc(lTruoc.p50, lR.p50);
  nhatKy.so.lumaSauR = { ...lR, lechP95Pc: lechR, lechP50Pc: lechR50 };
  chot(
    '2b-phim-R-khong-doi-luma',
    lechR <= MOC.lumaLechToiDa && lechR50 <= MOC.lumaLechP50ToiDa,
    { p50Truoc: lTruoc.p50, p50SauR: lR.p50, lechP50Pc: lechR50, p95SauR: lR.p95, lechP95Pc: lechR },
  );

  /**
   * FPS: **trung vị 3 lượt**, không một lượt.
   *
   * Máy này chạy nouveau và chia GPU với desktop của Boss: hai lượt đo liền
   * nhau cho 23,3 và 29,5 FPS trên cùng một bản build. Một lượt thì cổng FPS
   * trở thành xúc xắc, và tệ hơn: nó cho phép đọc ra một "hồi quy" không có
   * thật khi so với mốc trên `main`.
   */
  const dsFps = [];
  let theFps = null;
  for (let i = 0; i < 3; i += 1) {
    if (i > 0) {
      await pg.click('#do-fps');
      await nghi(500);
    }
    await pg.waitForFunction(
      () => /FPS trung b/.test(document.getElementById('do-fps')?.textContent ?? ''),
      null,
      { timeout: 60000 },
    );
    theFps = await pg.evaluate(() => document.getElementById('do-fps')?.textContent ?? null);
    const v = Number(String(theFps ?? '').match(/FPS trung b[^\n]*?([\d.]+)/)?.[1] ?? NaN);
    if (Number.isFinite(v)) dsFps.push(v);
  }
  nhatKy.so.fpsBaLuot = dsFps;
  const hieu = await pg.evaluate(() => window.stage.hieuNang());
  nhatKy.so.fps = theFps;
  nhatKy.so.hieuNang = {
    calls: hieu.calls,
    triangles: hieu.triangles,
    callsNha: hieu.callsNha,
    callsVrm: hieu.callsVrm,
    mesh: hieu.mesh,
    vatLieu: hieu.vatLieu,
    cull: hieu.cull,
    buocCoDinh: hieu.buocCoDinh,
    khungTranBuoc: hieu.khungTranBuoc,
    may: hieu.may,
    hopNha: hieu.hopNha,
  };
  // Đọc ĐÚNG dòng "FPS trung bình" — bản đầu bắt số đầu tiên của thẻ và lấy
  // phải "khung đếm được 261", tức báo đạt mốc bằng một con số khác hẳn.
  const fpsSo = dsFps.length ? [...dsFps].sort((a, b) => a - b)[Math.floor(dsFps.length / 2)] : NaN;
  chot('5-fps-tren-ban-build', Number.isFinite(fpsSo) && fpsSo >= MOC.fpsToiThieu, {
    baLuot: dsFps,
    trungVi: fpsSo,
    calls: hieu.calls,
    mocMain: 'Cửa 2 trên main: 27,3 · mốc riêng lượt này đo được 31,6',
  });

  if (CHI_FPS) {
    writeFileSync(`${THU_MUC}/fps-${NHAN}.json`, JSON.stringify(nhatKy, null, 2));
    console.log(`\n==> ghi mốc: ${THU_MUC}/fps-${NHAN}.json`);
  } else {
    /* =================================================== 1. phím lặp */
    const demEmote = async () =>
      pg.evaluate(() => {
        const ds = JSON.parse(window.stage.log()).banGhi;
        const d = (cmd) => ds.filter((b) => b.loai === 'lenh' && b.cmd === cmd).length;
        return { emote: d('actor.emote'), preset: d('camera.preset'), build: d('module.build') };
      });
    const t0 = await demEmote();
    await pg.evaluate(() => {
      document.activeElement?.blur?.();
      const giu = (code) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code }));
        for (let i = 0; i < 30; i += 1) {
          window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat: true }));
        }
        window.dispatchEvent(new KeyboardEvent('keyup', { code }));
      };
      giu('Digit1');
      giu('KeyC');
      giu('KeyE');
    });
    await nghi(1500);
    const t1 = await demEmote();
    const soEmote = t1.emote - t0.emote;
    const soPreset = t1.preset - t0.preset;
    const soBuild = t1.build - t0.build;
    nhatKy.so.phimLap = { emote: soEmote, preset: soPreset, build: soBuild };
    chot('1-giu-phim-mot-lenh', soEmote === 1 && soPreset === 1 && soBuild === 1, {
      emote: soEmote,
      cameraPreset: soPreset,
      moduleBuild: soBuild,
      nhipLapDaBan: 30,
    });
    await anh('04-sau-giu-phim');

    /* ======================================== 3. moveTo xuyên sofa */
    const sofa = { x0: -3.45, x1: -2.55, z0: -0.15, z1: 2.15 };
    await lenh(pg, 'camera.preset', { name: 'toan-canh' });
    // đặt Nhi ở phía ĐÔNG sofa, cùng làn z = 1 (hành lang giữa nhà).
    // `to` — KHÔNG phải `x`/`z` (review PR #72 mục 2).
    await lenh(pg, 'actor.moveTo', { actor: 'gen', to: [0, 0, 1], speed: 1.6 });
    await nghi(6000);
    const batDau = await pg.evaluate(
      () => window.stage.describe().then?.((r) => r) ?? window.stage.describe(),
    );
    void batDau;
    // lệnh "xuyên": đích nằm HẲN phía tây sofa
    await lenh(pg, 'actor.moveTo', { actor: 'gen', to: [-6, 0, 1], speed: 1.6 });
    const mauNhi = [];
    for (let i = 0; i < 60; i += 1) {
      const r = await pg.evaluate(async () => {
        const kq = await window.stage.describe();
        const a = (kq.result?.actors ?? kq.actors ?? []).find((x) => x.id === 'gen');
        return a ? { pos: a.pos, state: a.state } : null;
      });
      if (r) mauNhi.push(r);
      await nghi(120);
    }
    const trongSofa = mauNhi.filter(
      (m) =>
        m.pos[0] > sofa.x0 - 0.2 &&
        m.pos[0] < sofa.x1 + 0.2 &&
        m.pos[2] > sofa.z0 - 0.2 &&
        m.pos[2] < sofa.z1 + 0.2,
    );
    const tayNhat = Math.min(...mauNhi.map((m) => m.pos[0]));
    nhatKy.so.moveToSofa = {
      soMau: mauNhi.length,
      xTayNhat: +tayNhat.toFixed(3),
      sofa,
      cuoi: mauNhi.at(-1),
      soMauTrongSofa: trongSofa.length,
    };
    chot('3-moveTo-khong-xuyen-sofa', trongSofa.length === 0 && tayNhat > sofa.x1, {
      soMauTrongSofa: trongSofa.length,
      xTayNhat: +tayNhat.toFixed(3),
      mepDongSofa: sofa.x1,
    });
    await anh('05-nhi-dung-truoc-sofa');

    /* ============================ 4. camera quanh nhà không ra ngoài tường */
    await lenh(pg, 'camera.preset', { name: 'theo-owner' });
    await nghi(600);
    const mauMay = [];
    const docMay = async () => {
      const r = await pg.evaluate(async () => {
        const kq = await window.stage.describe();
        return (kq.result ?? kq).camera ?? null;
      });
      if (r?.pos) mauMay.push(r.pos);
    };
    // lái chủ đi một vòng sát 4 góc nhà — chỗ lệch cố định từng đẩy máy ra
    // ngoài tường — rồi qua cả 5 preset, rồi xoay chuột quanh sân khấu.
    for (const [code, ms] of [
      ['KeyW', 2600],
      ['KeyD', 2600],
      ['KeyS', 2600],
      ['KeyA', 2600],
    ]) {
      await pg.evaluate((c) => {
        document.activeElement?.blur?.();
        window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
      }, code);
      const het = Date.now() + ms;
      while (Date.now() < het) {
        await docMay();
        await nghi(150);
      }
      await pg.evaluate((c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c })), code);
      await nghi(250);
      await docMay();
    }
    await anh('06-camera-bam-goc-nha');
    for (const name of ['toan-canh', 'truoc-mat', 'ban-dieu-khien', 'bep', 'theo-owner']) {
      // mọi preset trong danh sách này đều có thật ⇒ `!ok` là lỗi, không "bỏ qua"
      await lenh(pg, 'camera.preset', { name });
      for (let i = 0; i < 10; i += 1) {
        await docMay();
        await nghi(130);
      }
    }
    await anh('07-camera-sau-5-preset');
    // xoay + zoom bằng chuột thật quanh sân khấu (OrbitControls)
    const box = await pg.evaluate(() => {
      const r = document.querySelector('canvas').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    await pg.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
    await pg.mouse.down();
    for (let i = 0; i < 24; i += 1) {
      await pg.mouse.move(box.x + box.w / 2 + Math.cos(i / 3) * 420, box.y + box.h / 2 + i * 8);
      await docMay();
      await nghi(60);
    }
    await pg.mouse.up();
    await pg.mouse.wheel(0, -2400);
    await nghi(400);
    await docMay();
    await pg.mouse.wheel(0, 3600);
    await nghi(400);
    await docMay();
    await anh('08-camera-sau-xoay-zoom-chuot');

    const ngoai = mauMay.filter(
      (p) =>
        Math.abs(p[0]) > MOC.nha.hx + 0.05 ||
        Math.abs(p[2]) > MOC.nha.hz + 0.05 ||
        p[1] < MOC.nha.yMin - 0.05 ||
        p[1] > MOC.nha.yMax + 0.05,
    );
    nhatKy.so.camera = {
      soMau: mauMay.length,
      soMauNgoaiNha: ngoai.length,
      viDuNgoai: ngoai.slice(0, 5),
      xMin: +Math.min(...mauMay.map((p) => p[0])).toFixed(3),
      xMax: +Math.max(...mauMay.map((p) => p[0])).toFixed(3),
      yMin: +Math.min(...mauMay.map((p) => p[1])).toFixed(3),
      yMax: +Math.max(...mauMay.map((p) => p[1])).toFixed(3),
      zMin: +Math.min(...mauMay.map((p) => p[2])).toFixed(3),
      zMax: +Math.max(...mauMay.map((p) => p[2])).toFixed(3),
    };
    chot('4-camera-luon-trong-AABB-nha', mauMay.length > 80 && ngoai.length === 0, {
      soMau: mauMay.length,
      soMauNgoaiNha: ngoai.length,
      hopNha: MOC.nha,
      ...nhatKy.so.camera,
    });

    /* ======= 10. THƯỚC ĐO MỚI (review PR #72 mục 1): tay máy ở 4 GÓC + 4 TƯỜNG
     *
     * Vì sao cần thước đo khác số 4: số 4 chỉ hỏi "camera có trong hộp nhà
     * không" — tay máy co vào **trong người** nhân vật thì vẫn ở trong hộp,
     * nên lỗi "khung hình toàn áo" (0,1265 m) lọt qua. Ở đây đo đúng thứ Boss
     * nhìn thấy: **khoảng cách camera → đầu nhân vật**, mỗi 100 ms, khi lái
     * vào 4 góc nhà và dọc 4 tường.
     *
     * Ba mốc: `xaDau` nhỏ nhất ≥ 0,6 m · `|v|` camera ≤ 3 m/s · 0 mẫu ngoài
     * AABB. `|v|` lấy từ **sổ ghi từng khung** `hieuNang().soMay` (cột 4) —
     * lấy mẫu từ ngoài mỗi 100 ms không thấy được đỉnh giữa hai mẫu.
     */
    await lenh(pg, 'camera.preset', { name: 'toan-canh' });
    await nghi(400);
    await lenh(pg, 'camera.preset', { name: 'theo-owner' }); // ⇒ sổ `soMay` mở lại từ 0
    await nghi(1200);
    const mauTay = [];
    const docTay = async () => {
      const r = await pg.evaluate(async () => {
        const kq = await window.stage.describe();
        const st = kq.result ?? kq;
        const a = (st.actors ?? []).find((x) => x.id === 'owner');
        if (!a || !st.camera?.pos) return null;
        const c = st.camera.pos;
        return {
          xaDau: Math.hypot(c[0] - a.pos[0], c[1] - (a.pos[1] + 1.1), c[2] - a.pos[2]),
          may: c,
          chu: a.pos,
        };
      });
      if (r) mauTay.push(r);
    };
    /** Khoảng cách từ nhân vật tới mặt tường gần nhất (m) — có thật sự ép sát? */
    const satTuong = (chu) => Math.min(MOC.nha.hx - Math.abs(chu[0]), MOC.nha.hz - Math.abs(chu[2]));
    /** Giữ một bộ phím `ms` ms, lấy mẫu mỗi 100 ms. */
    const giuVaDo = async (codes, ms) => {
      await pg.evaluate((cs) => {
        document.activeElement?.blur?.();
        for (const c of cs) window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
      }, codes);
      const het = Date.now() + ms;
      while (Date.now() < het) {
        await docTay();
        await nghi(100);
      }
      await pg.evaluate((cs) => {
        for (const c of cs) window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
      }, codes);
      await nghi(200);
      await docTay();
    };
    /* 4 GÓC: đưa chủ về gần góc rồi GIỮ hai phím chéo cho tới khi đụng tường */
    const GOC = [
      ['đông-nam', [5.2, 3.2], ['KeyS', 'KeyD']],
      ['tây-nam', [-5.2, 3.2], ['KeyS', 'KeyA']],
      ['đông-bắc', [5.2, -3.2], ['KeyW', 'KeyD']],
      ['tây-bắc', [-5.2, -3.2], ['KeyW', 'KeyA']],
    ];
    const theoGoc = {};
    for (const [ten, [x, z], codes] of GOC) {
      const i0 = mauTay.length;
      await lenh(pg, 'actor.moveTo', { actor: 'owner', to: [x, 0, z], speed: 1.6 });
      await nghi(6000);
      await giuVaDo(codes, 5000);
      const lat = mauTay.slice(i0);
      theoGoc[ten] = {
        soMau: lat.length,
        xaDauMin: +Math.min(...lat.map((m) => m.xaDau)).toFixed(4),
        // nhà có nội thất: góc đông-bắc là BẾP (tủ x = 6,5 · z = −4,5…−0,5) nên
        // nhân vật không vào được — ghi lại đã ép sát tới đâu thay vì giả vờ
        satTuongM: +Math.min(...lat.map((m) => satTuong(m.chu))).toFixed(3),
        chuCuoi: lat.at(-1)?.chu.map((v) => +v.toFixed(2)) ?? null,
        mayCuoi: lat.at(-1)?.may.map((v) => +v.toFixed(2)) ?? null,
      };
    }
    await anh('12-tay-may-o-goc-nha');
    /* 4 TƯỜNG: ép sát từng tường rồi chạy DỌC tường (chỗ tay máy bị cắt liên tục) */
    const TUONG = [
      ['nam z+', [0, 3.2], ['KeyS'], ['KeyD']],
      ['bắc z−', [0, -3.2], ['KeyW'], ['KeyA']],
      ['đông x+', [5.2, 0], ['KeyD'], ['KeyS']],
      ['tây x−', [-5.2, 0], ['KeyA'], ['KeyW']],
    ];
    const theoTuong = {};
    for (const [ten, [x, z], epSat, doc] of TUONG) {
      const i0 = mauTay.length;
      await lenh(pg, 'actor.moveTo', { actor: 'owner', to: [x, 0, z], speed: 1.6 });
      await nghi(5000);
      await giuVaDo(epSat, 2500);
      await giuVaDo(doc, 3500);
      const lat = mauTay.slice(i0);
      theoTuong[ten] = {
        soMau: lat.length,
        xaDauMin: +Math.min(...lat.map((m) => m.xaDau)).toFixed(4),
        satTuongM: +Math.min(...lat.map((m) => satTuong(m.chu))).toFixed(3),
        chuCuoi: lat.at(-1)?.chu.map((v) => +v.toFixed(2)) ?? null,
        mayCuoi: lat.at(-1)?.may.map((v) => +v.toFixed(2)) ?? null,
      };
    }
    await anh('13-tay-may-doc-tuong');
    const hieuTay = await pg.evaluate(() => window.stage.hieuNang());
    const soMay = hieuTay.soMay ?? [];
    // đỉnh |v| của CẢ lượt bám (~45 s), không bị trần 900 khung của `soMay`
    const vMaxCaLuot = hieuTay.may?.vMax ?? null;
    const vMax = soMay.length ? Math.max(...soMay.map((r) => r[4])) : null;
    /*
     * `vMax` toàn lượt luôn chạm `MAY_VEL_TOI_DA` vì **lúc MỚI vào preset**
     * camera đang ở góc nhà, sai số 6–8 m: lò xo tới hạn vọt tới ~0,37·ω·e =
     * 20 m/s nếu không có trần. Nên ghi thêm `vMaxOnDinh` — bỏ 2 s đầu — đó là
     * con số nói về việc BÁM, và là chỗ trước vòng 2 đọc 13,23 m/s.
     */
    const t0May = soMay.length ? soMay[0][0] : 0;
    /*
     * Bỏ **5 s** đầu, không phải 2: lúc mới vào preset camera đang ở góc nhà
     * của `toan-canh`, phải bay ~8 m ở trần 2,8 m/s ⇒ pha bay dài hơn 2 s và
     * `vMaxOnDinh` của lượt trước đọc đúng cái trần đó.
     */
    const vOnDinh = soMay.filter((r) => r[0] - t0May > 5000).map((r) => r[4]);
    const vMaxOnDinh = vOnDinh.length ? Math.max(...vOnDinh) : null;
    const xaKhung = soMay.map((r) => r[5]).filter((v) => typeof v === 'number');
    const xaKhungMin = xaKhung.length ? Math.min(...xaKhung) : null;
    const xaMin = Math.min(...mauTay.map((m) => m.xaDau));
    const ngoaiTay = mauTay.filter(
      (m) =>
        Math.abs(m.may[0]) > MOC.nha.hx + 0.05 ||
        Math.abs(m.may[2]) > MOC.nha.hz + 0.05 ||
        m.may[1] < MOC.nha.yMin - 0.05 ||
        m.may[1] > MOC.nha.yMax + 0.05,
    );
    nhatKy.so.tayMay = {
      soMau100ms: mauTay.length,
      soKhungSoMay: soMay.length,
      xaDauMin100ms: +xaMin.toFixed(4),
      xaDauMinTungKhung: xaKhungMin === null ? null : +xaKhungMin.toFixed(4),
      vMayMax: vMax === null ? null : +vMax.toFixed(4),
      vMayMaxCaLuot: vMaxCaLuot,
      vMayMaxOnDinh: vMaxOnDinh === null ? null : +vMaxOnDinh.toFixed(4),
      tranVanToc: 2.8,
      soMauNgoaiNha: ngoaiTay.length,
      // sổ từng khung (lấy 1/5 cho gọn): [t ms, dt s, cam.x, cam.z, |v|, xaDau]
      soMayMau: soMay.filter((_, i) => i % 5 === 0),
      theoGoc,
      theoTuong,
      truocVong2: { xaDau: 0.1265, vMay: 13.23, batRaKhiRoiGoc: 3.33 },
    };
    chot(
      '10-tay-may-khong-co-vao-nguoi',
      mauTay.length >= 80 &&
        xaMin >= MOC.tayMayToiThieu &&
        (xaKhungMin === null || xaKhungMin >= MOC.tayMayToiThieu) &&
        vMax !== null &&
        vMax <= MOC.vMayToiDa &&
        vMaxOnDinh !== null &&
        vMaxOnDinh <= MOC.vMayToiDa &&
        vMaxCaLuot !== null &&
        vMaxCaLuot <= MOC.vMayToiDa &&
        ngoaiTay.length === 0,
      {
        soMau100ms: mauTay.length,
        xaDauMin: +xaMin.toFixed(4),
        xaDauMinTungKhung: xaKhungMin === null ? null : +xaKhungMin.toFixed(4),
        mocXa: MOC.tayMayToiThieu,
        vMayMax: vMax === null ? null : +vMax.toFixed(4),
        vMayMaxCaLuot: vMaxCaLuot,
        vMayMaxOnDinh: vMaxOnDinh === null ? null : +vMaxOnDinh.toFixed(4),
        mocV: MOC.vMayToiDa,
        soMauNgoaiNha: ngoaiTay.length,
        truocVong2: 'xaDau 0,1265 m · |v| 13,23 m/s · bật ra 3,33 m/s',
      },
    );

    /* ====================== 7. dao động tốc độ khi giữ phím (Cửa 2 mục 12) */
    await lenh(pg, 'camera.preset', { name: 'theo-owner' });
    const soLai = () => pg.evaluate(() => window.stage.doXuong('owner').vanToc);
    const daoDong = {};
    /**
     * Chỗ xuất phát RIÊNG cho từng hướng, chọn bằng cách dò chính bảng
     * `bo-cuc.ts`: điểm có đường chạy tự do dài nhất theo hướng đó (≈9 m).
     *
     * Lượt đo đầu dùng chung một điểm (0; 1) cho cả bốn hướng và ra 75,7 % cho
     * W — nhưng 85,7 % khung của lượt đó **bị vật cản chặn**: con số nói về bố
     * cục nội thất, không nói gì về bước mô phỏng. Muốn chấm timestep thì phải
     * cho nhân vật một đoạn đường trống mà chạy.
     */
    const XUAT_PHAT = {
      KeyW: [-1, 4.5],
      KeyS: [-1, -4.5],
      KeyA: [3, -3],
      KeyD: [-6, -3],
    };
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
      const [sx, sz] = XUAT_PHAT[code];
      /*
       * Phải TỚI được `XUAT_PHAT` thì cửa sổ chạy tự do mới dài: lượt đo trước
       * có lần nhân vật bỏ cuộc giữa đường (vướng đồ) và W/S chỉ còn ~100 khung.
       * Chờ tới đúng chỗ (sai số ≤ 0,35 m), thử lại một lần nếu chưa tới.
       */
      for (let lan = 0; lan < 2; lan += 1) {
        await lenh(pg, 'actor.moveTo', { actor: 'owner', to: [sx, 0, sz], speed: 1.6 });
        const het = Date.now() + 9000;
        let xong = false;
        while (Date.now() < het && !xong) {
          await nghi(300);
          xong = await pg.evaluate(
            async ([x, z]) => {
              const kq = await window.stage.describe();
              const a = ((kq.result ?? kq).actors ?? []).find((v) => v.id === 'owner');
              return !!a && a.state !== 'walking' && Math.hypot(a.pos[0] - x, a.pos[2] - z) <= 0.35;
            },
            [sx, sz],
          );
        }
        if (xong) break;
      }
      await nghi(600);
      await pg.evaluate((c) => {
        document.activeElement?.blur?.();
        window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
      }, code);
      /*
       * 7 s, không phải 4: review PR #72 mục 2 đòi cửa sổ chạy tự do ≥ 120
       * khung, mà máy kiểm chạy ~28 FPS ⇒ 4 s chỉ cho ~100 khung.
       */
      await nghi(7000);
      const vt = await soLai();
      await pg.evaluate((c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c })), code);
      await nghi(1200);
      const so = (vt.so ?? []).filter((r) => r[1] > 0);
      // bỏ 0,5 s đầu (đang tăng tốc) — chỉ chấm phần GIỮ ổn định
      const t0 = so.length ? so[0][0] : 0;
      const than = so.filter((r) => r[0] - t0 > 500);
      const diDuoc = than.filter((r) => r[6] === 0 && r[4] > 0.04);
      /*
       * Đoạn CHẠY TỰ DO: từ hết đà tới **khung bị chặn đầu tiên**. Đây là tập
       * duy nhất mà dao động nói về timestep; từ lúc đụng đồ trở đi, con số
       * nói về bố cục (nợ A* — mục 38 bước (b), không thuộc H1).
       */
      const iChan = than.findIndex((r) => r[6] !== 0);
      const tuDo = (iChan < 0 ? than : than.slice(0, iChan)).filter((r) => r[4] > 0.04);
      const tinh = (ds, toiThieu = 5) => {
        if (ds.length < toiThieu) return null;
        const v = ds.map((r) => r[4]);
        const max = Math.max(...v);
        const min = Math.min(...v);
        return {
          soKhung: ds.length,
          max: +max.toFixed(4),
          min: +min.toFixed(4),
          daoDongPc: +(((max - min) / Math.max(1e-6, max)) * 100).toFixed(1),
        };
      };
      daoDong[code] = {
        /*
         * CHẤM trên đoạn chạy tự do: đây là cái timestep chịu trách nhiệm.
         * Review PR #72 mục 2: đòi **≥ 120 khung** (≈2 s) mới cho con số có
         * nghĩa — lượt trước `XUAT_PHAT` không hề được áp dụng (lệnh `moveTo`
         * bị từ chối) nên cửa sổ chỉ còn 11–29 khung ≈ 0,2 s.
         */
        tuDo: tinh(tuDo, KHUNG_TU_DO_TOI_THIEU),
        // phần đi được nhưng có thể đã trượt men vật cản
        diDuoc: tinh(diDuoc),
        tatCa: tinh(than),
        soKhungTuDo: tuDo.length,
        tyLeKhungBiChan: than.length
          ? +((than.filter((r) => r[6] !== 0).length / than.length) * 100).toFixed(1)
          : null,
      };
    }
    nhatKy.so.daoDongTocDo = daoDong;
    const xau = Object.entries(daoDong)
      .map(([k, v]) => [k, v.tuDo?.daoDongPc ?? null])
      .filter(([, v]) => v !== null);
    const khungTuDo = Object.fromEntries(
      Object.entries(daoDong).map(([k, v]) => [k, v.soKhungTuDo]),
    );
    chot(
      '7-dao-dong-|v|-khi-giu-phim',
      xau.length === 4 &&
        xau.every(([, v]) => v <= MOC.daoDongToiDa) &&
        Object.values(khungTuDo).every((n) => n >= KHUNG_TU_DO_TOI_THIEU),
      Object.fromEntries(
        xau.concat([
          ['mocPc', MOC.daoDongToiDa],
          ['soKhungTuDo', JSON.stringify(khungTuDo)],
          ['mocKhungTuDo', KHUNG_TU_DO_TOI_THIEU],
          ['doCaiGi', 'dao động |v| của bộ tích phân bước cố định'],
          ['chuaDo', 'quãng đi được / khung (nợ #3: nội suy render) — xem mô tả PR'],
          ['truocH1', 'W 33 · S 6 · A 44 · D 34 (Cửa 2 trên main)'],
        ]),
      ),
    );
    await anh('09-sau-giu-4-huong');

    /* =================================================== 6. console sạch */
    chot('6-console-khong-loi', nhatKy.loiConsole.length === 0, {
      soLoi: nhatKy.loiConsole.length,
      vaiDong: nhatKy.loiConsole.slice(0, 5),
    });

    const theFps2 = await pg.evaluate(
      () => document.getElementById('do-fps')?.textContent ?? null,
    );
    nhatKy.so.fpsCuoi = theFps2;
    const hieu2 = await pg.evaluate(() => window.stage.hieuNang());
    nhatKy.so.khungTranBuocCuoi = hieu2.khungTranBuoc;
    nhatKy.so.cullCuoi = hieu2.cull;

    writeFileSync(`${THU_MUC}/nhat-ky-kiem-h1.json`, JSON.stringify(nhatKy, null, 2));
    if (loi.length === 0) writeFileSync(CO_KHOA, new Date().toISOString() + '\n');
    console.log(`\n==> nhật ký: ${THU_MUC}/nhat-ky-kiem-h1.json`);
    if (loi.length) {
      console.error(`\n⛔ KHÔNG ĐẠT: ${loi.join(', ')}`);
      maLoi = 1;
    } else {
      console.log('\n🎉 H1 đạt hết số đo.');
    }
  }
} catch (e) {
  console.error('⛔ lỗi khi chạy kiểm H1:', e);
  nhatKy.loiChay = String(e);
  writeFileSync(`${THU_MUC}/nhat-ky-kiem-h1.json`, JSON.stringify(nhatKy, null, 2));
  maLoi = 1;
} finally {
  await br.close().catch(() => undefined);
  dietCay(server);
}
process.exit(maLoi);
