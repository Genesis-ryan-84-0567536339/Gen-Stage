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
  /** Luma p95 được phép lệch bao nhiêu phần trăm sau `scene.light`/`R`. */
  lumaLechToiDa: 2,
  /** FPS trung vị tối thiểu trên GPU thật. */
  fpsToiThieu: 24,
  /** Nhà 14 × 10 m, trần 2,8 m — AABB mà camera phải nằm trong (lề 0,05 m). */
  nha: { hx: 7, hz: 5, yMin: 0, yMax: 2.8 },
};

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

  await pg.goto(`${url}?bridge=0&fps=1`, { waitUntil: 'load' });
  await pg.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
  // Ẩn overlay để ảnh chỉ còn sân khấu (mẫu của D1b/F1).
  await pg.addStyleTag({
    content:
      '#bang,#hud,#toast,#loading,#o-chat,#goi-y-phim,#nut-tieng,#o-noi-nhanh{display:none!important}',
  });
  await nghi(1500);

  const anh = async (ten) => {
    const p = `${THU_MUC}/${ten}.png`;
    await pg.screenshot({ path: p });
    return p;
  };

  /* ============================================ 2 + 5. luma / FPS làm mốc */
  await pg.evaluate(() => window.stage.run('camera.preset', { name: 'toan-canh' }));
  await nghi(2000);
  const aTruoc = await anh(`${CHI_FPS ? NHAN + '-' : ''}01-toan-canh-truoc`);
  const lTruoc = lumaStats(aTruoc);

  // `scene.light sang` — đúng đường mà `stage.reset` và phím R đi qua
  await pg.evaluate(() => window.stage.run('scene.light', { preset: 'sang' }));
  await nghi(1200);
  const aSau = await anh(`${CHI_FPS ? NHAN + '-' : ''}02-toan-canh-sau-scene-light`);
  const lSau = lumaStats(aSau);
  const lech = (Math.abs(lSau.p95 - lTruoc.p95) / Math.max(1, lTruoc.p95)) * 100;
  nhatKy.so.luma = { truoc: lTruoc, sau: lSau, lechP95Pc: +lech.toFixed(2) };
  chot('2-scene-light-sang-khong-doi-luma', lech <= MOC.lumaLechToiDa, {
    p95Truoc: lTruoc.p95,
    p95Sau: lSau.p95,
    lechPc: +lech.toFixed(2),
  });

  // phím R (stage.reset → sceneLight) — cùng giao kèo, qua đúng cửa của Boss
  await pg.evaluate(() => {
    document.activeElement?.blur?.();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }));
  });
  await nghi(3000);
  await pg.evaluate(() => window.stage.run('camera.preset', { name: 'toan-canh' }));
  await nghi(2200);
  const aR = await anh(`${CHI_FPS ? NHAN + '-' : ''}03-toan-canh-sau-phim-R`);
  const lR = lumaStats(aR);
  const lechR = (Math.abs(lR.p95 - lTruoc.p95) / Math.max(1, lTruoc.p95)) * 100;
  nhatKy.so.lumaSauR = { ...lR, lechP95Pc: +lechR.toFixed(2) };
  chot('2b-phim-R-khong-doi-luma', lechR <= MOC.lumaLechToiDa, {
    p95Truoc: lTruoc.p95,
    p95SauR: lR.p95,
    lechPc: +lechR.toFixed(2),
  });

  const theFps = await pg.evaluate(() => document.getElementById('do-fps')?.textContent ?? null);
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
  const fpsSo = Number(String(theFps ?? '').match(/([\d.]+)/)?.[1] ?? NaN);
  chot('5-fps-tren-ban-build', Number.isFinite(fpsSo) && fpsSo >= MOC.fpsToiThieu, {
    the: theFps,
    fps: fpsSo,
    calls: hieu.calls,
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
    await pg.evaluate(() => window.stage.run('camera.preset', { name: 'toan-canh' }));
    // đặt Nhi ở phía ĐÔNG sofa, cùng làn z = 1 (hành lang giữa nhà)
    await pg.evaluate(() =>
      window.stage.run('actor.moveTo', { actor: 'gen', x: 0, z: 1, speed: 1.6 }),
    );
    await nghi(6000);
    const batDau = await pg.evaluate(
      () => window.stage.describe().then?.((r) => r) ?? window.stage.describe(),
    );
    void batDau;
    // lệnh "xuyên": đích nằm HẲN phía tây sofa
    await pg.evaluate(() =>
      window.stage.run('actor.moveTo', { actor: 'gen', x: -6, z: 1, speed: 1.6 }),
    );
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
    await pg.evaluate(() => window.stage.run('camera.preset', { name: 'theo-owner' }));
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
      const kq = await pg.evaluate(
        (n) => window.stage.run('camera.preset', { name: n }).then((r) => r.ok),
        name,
      );
      if (!kq) continue;
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
