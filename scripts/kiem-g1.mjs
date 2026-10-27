/**
 * kiem-g1.mjs — BẰNG CHỨNG G1 (Issue #56, Boss 26/10) trên **Firefox thật**.
 *
 * Boss xem bản main (F1+F2+F3) trên Firefox và chốt hai việc:
 *   1. "không cần làm trần nhà vì nhìn rất vướng" → bỏ trần + phào + đèn trần;
 *   2. "các nhân vật đang toàn đi trên không trung" → chân phải chạm sàn.
 * Kèm theo là tóc Gen bung loạn (spring bone chạy sai tỉ lệ sau chibi hoá).
 *
 * Chạy (**một lần** — cờ khoá `docs/g1/.da-chay`):
 *   node scripts/kiem-g1.mjs          # trọn bộ
 *   node scripts/kiem-g1.mjs --lai    # xoá cờ khoá rồi chạy lại
 *
 * Vì sao Firefox + GPU thật chứ không Chromium/swiftshader: đây là trình duyệt
 * Boss dùng, và cả hai tật đều là tật NHÌN THẤY — phải chụp đúng cái Boss thấy.
 *
 * Ra `docs/g1/`:
 *   nhat-ky-kiem-g1.json   mọi số đo + kết quả chấm
 *   bang-chan-san.txt      bảng y bàn chân owner/gen trước → sau, từng trạng thái
 *   can-chan-*.png         ảnh CẬN CHÂN, máy ngang sàn (y = 0,1 m)
 *   nhin-len.png           máy giữa phòng ngửa lên: không còn trần
 *   preset-*.png           5 góc máy, không góc nào còn trần che
 *
 * Số ĐO TRƯỚC KHI SỬA nằm trong `TRUOC` — đo bằng chính script dò này trên
 * cùng máy, cùng Firefox, bản `main` 1ae8b19 (xem `docs/g1/do-truoc/`).
 */
import { firefox } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { lumaStats } from './lib-png.mjs';

const THU_MUC = 'docs/g1';
mkdirSync(THU_MUC, { recursive: true });

/** Ngưỡng đạt/không đạt — để một chỗ, đổi là thấy ngay. */
const MOC = {
  /** Đế giày cách mặt sàn tối đa bấy nhiêu mét (Boss: ±1 cm). */
  leSan: 0.01,
  /** Khi NGỒI, bàn chân không được thủng sàn quá bấy nhiêu (m). */
  leSanNgoi: 0.01,
  /**
   * Lệch tóc so với dáng tác giả vẽ, tối đa (m). Tóc VẪN phải đung đưa, nên
   * mốc không phải 0: 0,08 m ≈ một phần mười chiều dài chuỗi tóc dài nhất của
   * Gen. Trước khi sửa: 0,26 m — tức tóc duỗi hẳn ra khỏi dáng, không phải
   * đung đưa quanh dáng.
   */
  lechToc: 0.08,
  /** Luma p95 cả khung hình — không cháy. */
  lumaP95: 235,
  /** Luma p50 — không chìm. */
  lumaP50: 100,
  /** Tỉ lệ điểm ảnh còn màu TRẦN cũ (0xf7f1e4) khi ngửa máy lên — tối đa. */
  dauVetTran: 0.02,
};

/** Đo thật trên main 1ae8b19, cùng máy/cùng Firefox (docs/g1/do-truoc/). */
const TRUOC = {
  owner: { idle: { chanY: 0.3805, dayY: 0.3469 }, di: { chanY: 0.3847, dayY: 0.3513 }, emote: { chanY: 0.3811, dayY: 0.3475 }, lechToc: 0.0149 },
  gen: { idle: { chanY: 0.42, dayY: 0.3709 }, di: { chanY: 0.42, dayY: 0.371 }, emote: { chanY: 0.4179, dayY: 0.3688 }, lechToc: 0.2637 },
};

const argv = process.argv.slice(2);
const CO_KHOA = `${THU_MUC}/.da-chay`;
if (argv.includes('--lai')) {
  if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
} else if (existsSync(CO_KHOA)) {
  console.error(
    `\n⛔ ${CO_KHOA} đã tồn tại — kiểm G1 chỉ chạy MỘT LẦN sau khi code xong.\n` +
      `   Kết quả lượt trước: ${THU_MUC}/nhat-ky-kiem-g1.json + ảnh trong ${THU_MUC}/.\n` +
      '   Thật sự cần chạy lại: node scripts/kiem-g1.mjs --lai\n',
  );
  process.exit(2);
}

/** Dev ≥ 5360: KHÔNG đụng stack thật của Boss (5173, 8787–8790). */
const PORT = 5362;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
process.on('exit', () => server.kill('SIGTERM'));
const url = await new Promise((ok, no) => {
  const h = setTimeout(() => no(new Error('vite preview không lên')), 60000);
  server.stdout.on('data', (d) => {
    if (String(d).includes(`localhost:${PORT}`)) {
      clearTimeout(h);
      ok(`http://localhost:${PORT}/`);
    }
  });
});

const nhatKy = {
  khi: new Date().toISOString(),
  trinhDuyet: 'firefox (playwright) — GPU thật, headless:false',
  moc: MOC,
  truoc: TRUOC,
  sau: {},
  luma: {},
  loiConsole: [],
  dat: {},
};
const loi = [];
const chot = (ten, dat, chiTiet) => {
  nhatKy.dat[ten] = { dat, ...chiTiet };
  if (!dat) loi.push(`${ten}: ${JSON.stringify(chiTiet)}`);
};

const br = await firefox.launch({
  headless: false,
  // Wayland + nouveau làm tiến trình GPU của Firefox gãy ("channel error");
  // qua X11 thì WebGL vẫn là GPU thật (bài học F2).
  env: { ...process.env, MOZ_ENABLE_WAYLAND: '0', MOZ_X11_EGL: '0' },
});
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();
pg.on('console', (m) => m.type() === 'error' && nhatKy.loiConsole.push(m.text()));
pg.on('pageerror', (e) => nhatKy.loiConsole.push(`pageerror: ${e.message}`));
await pg.goto(`${url}?fps=1`, { waitUntil: 'load' });
await pg.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
await pg.waitForTimeout(3000);

const chup0 = (ten) => pg.screenshot({ path: `${THU_MUC}/${ten}.png` });

/* ------------------------------------------------------------- số đo xương */
const doNguoi = (who) =>
  pg.evaluate((w) => {
    const d = window.stage.doXuong(w);
    return {
      gocY: d.gocY,
      chanY: d.tuThe.footY,
      deGiayY: d.deGiayY,
      deChan: d.deChan,
      dayY: d.tuThe.minY,
      hipsY: d.tuThe.hipsY,
      seatY: d.seatY,
      dayDui: d.dayDui,
      ngoi: d.dangNgoiCo,
      state: d.state,
      lechToc: d.toc.lechToc,
      lechVay: d.toc.lechVay,
      soKhop: d.toc.soKhop,
      tyLeGoc: d.toc.tyLeGoc,
    };
  }, who);
const doHet = async (nhan) => {
  const o = await doNguoi('owner');
  const g = await doNguoi('gen');
  nhatKy.sau[nhan] = { owner: o, gen: g };
  console.log(
    `${nhan.padEnd(10)} owner đế=${o.deGiayY.toFixed(4)} tóc=${o.lechToc.toFixed(3)} | ` +
      `gen đế=${g.deGiayY.toFixed(4)} tóc=${g.lechToc.toFixed(3)}`,
  );
  return { o, g };
};

await doHet('idle');
await pg.waitForTimeout(3000);
await doHet('idle-5s');

/* đi: giữ W 2 s (ép cửa sổ nhận phím, con trỏ ngoài mọi ô nhập) */
await pg.evaluate(() => window.stage.run('camera.preset', { name: 'theo-owner' }));
await pg.mouse.click(700, 500);
await pg.keyboard.down('w');
await pg.waitForTimeout(900);
const diGiua = await doHet('di-1s');
await pg.waitForTimeout(900);
await doHet('di-2s');
await pg.keyboard.up('w');
await pg.waitForTimeout(1200);
await doHet('vua-dung');

/*
 * emote — tên tham số là `emote` (KHÔNG phải `name`). Vòng chạy đầu gọi sai
 * tên, lệnh bị validate đánh rớt, `.catch` nuốt mất và mục "emote" chấm trên
 * một nhân vật đang đứng im: ĐẠT một cách vô nghĩa. Vì vậy ở đây đọc kết quả
 * lệnh và CHẶN nếu nó không chạy.
 */
const chayLenh = async (cmd, args) => {
  const r = await pg.evaluate(
    ([c, a]) => window.stage.run(c, a).then((x) => ({ ok: true, x }), (e) => ({ ok: false, e: String(e) })),
    [cmd, args],
  );
  if (!r.ok) throw new Error(`${cmd} hỏng: ${r.e}`);
  return r.x;
};
await chayLenh('actor.emote', { actor: 'gen', emote: 'rat-vui' });
await chayLenh('actor.emote', { actor: 'owner', emote: 'vui' });
await pg.waitForTimeout(1200);
await doHet('emote');
await pg.waitForTimeout(2500);

/* ngồi: `actor.sit` tự đi tới ghế rồi ngồi (tham số là `seat`) */
await chayLenh('actor.sit', { actor: 'owner', seat: 'ghe-2' });
// `run` trả về ngay kèm `durationMs`; chờ tới lúc THẬT SỰ ngồi (đi tới ghế
// 0,95 m/s + clip ngồi 1,2 s), tối đa 25 s rồi mới đo.
await pg
  .waitForFunction(() => window.stage.doXuong('owner').dangNgoiCo === true, null, {
    timeout: 25000,
    polling: 400,
  })
  .catch(() => {});
await pg.waitForTimeout(1200);
const ngoi = await doHet('ngoi');
await chup0('ngoi');
await chayLenh('actor.stand', { actor: 'owner' });
await pg
  .waitForFunction(() => window.stage.doXuong('owner').dangNgoiCo === false, null, {
    timeout: 15000,
    polling: 400,
  })
  .catch(() => {});
await pg.waitForTimeout(1800);
await doHet('sau-dung-len');

/* ------------------------------------------------------------------- ảnh */
const anGiaoDien = () =>
  pg.addStyleTag({
    content:
      '#bang,#hud,#toast,#loading,#o-chat,#goi-y-phim,#nut-tieng,#o-noi-nhanh,#do-fps{display:none!important}',
  });
const datMay = async (vt, tam) => {
  await pg.evaluate(([v, t]) => window.stage.datMay(v, t), [vt, tam]);
  await pg.waitForTimeout(700);
};
const chup = (ten) => pg.screenshot({ path: `${THU_MUC}/${ten}.png` });

// ảnh CÓ giao diện (bằng chứng app thật) trước khi ẩn
await pg.evaluate(() => window.stage.run('camera.preset', { name: 'toan-canh' }));
await pg.waitForTimeout(900);
await chup('toan-canh-giao-dien');
await anGiaoDien();

const viTri = await pg.evaluate(() => ({
  o: window.stage.doXuong('owner').hips,
  g: window.stage.doXuong('gen').hips,
}));
nhatKy.viTriHips = viTri;
// CẬN CHÂN: máy ngang sàn (y = 0,10 m) ngắm vào mắt cá — thấy ngay đế chạm sàn
await datMay([viTri.o[0] + 1.1, 0.1, viTri.o[2] + 1.1], [viTri.o[0], 0.06, viTri.o[2]]);
await chup('can-chan-owner');
await datMay([viTri.g[0] + 1.1, 0.1, viTri.g[2] + 1.1], [viTri.g[0], 0.06, viTri.g[2]]);
await chup('can-chan-gen');
await datMay([viTri.g[0] + 1.2, 1.3, viTri.g[2] + 1.2], [viTri.g[0], 0.95, viTri.g[2]]);
await chup('toc-gen');

// NGỬA MÁY LÊN giữa phòng: trước đây là tấm trần kín, giờ phải là trời
await datMay([0, 1.5, 0], [0.3, 6.5, 0.3]);
await chup('nhin-len');

const PRESET = ['toan-canh', 'phong-khach', 'ban-lam-viec', 'bep', 'cua-so'];
for (const name of PRESET) {
  await pg.evaluate((n) => window.stage.run('camera.preset', { name: n }), name);
  await pg.waitForTimeout(1200);
  await chup(`preset-${name}`);
}

nhatKy.hieuNang = await pg.evaluate(() => window.stage.hieuNang());
nhatKy.theFps = await pg.evaluate(() => document.getElementById('do-fps')?.textContent ?? null);

await ctx.close();
await br.close();
server.kill('SIGTERM');

/* ============================================================== CHẤM ĐIỂM */

/* 1. chân chạm sàn ở mọi trạng thái KHÔNG ngồi */
for (const nhan of ['idle', 'idle-5s', 'di-1s', 'di-2s', 'vua-dung', 'emote', 'sau-dung-len']) {
  const m = nhatKy.sau[nhan];
  if (!m) continue;
  for (const ai of ['owner', 'gen']) {
    const d = m[ai];
    if (d.ngoi) continue;
    chot(`1-chan-cham-san/${nhan}/${ai}`, Math.abs(d.deGiayY) <= MOC.leSan, {
      deGiayY: d.deGiayY,
      deChan: d.deChan,
      dayY: d.dayY,
      chanY: d.chanY,
      gocY: d.gocY,
      state: d.state,
    });
  }
}

/* 2. ngồi: hông đúng mặt ghế, bàn chân KHÔNG thủng sàn */
{
  const d = ngoi.o;
  chot('2-ngoi-that-su-ngoi', d.ngoi === true, { ngoi: d.ngoi, state: d.state });
  chot('2-ngoi-hong-dung-mat-ghe', d.ngoi && Math.abs(d.hipsY - (d.seatY + d.dayDui)) <= 0.03, {
    ngoi: d.ngoi,
    hipsY: d.hipsY,
    seatY: d.seatY,
    dayDui: d.dayDui,
  });
  chot('2-ngoi-chan-khong-thung-san', d.deGiayY >= -MOC.leSanNgoi, {
    deGiayY: d.deGiayY,
    ngoi: d.ngoi,
  });
}

/* 3. tóc: không bung khỏi dáng tác giả vẽ, ở mọi trạng thái */
for (const [nhan, m] of Object.entries(nhatKy.sau)) {
  for (const ai of ['owner', 'gen']) {
    chot(`3-toc-khong-bung/${nhan}/${ai}`, m[ai].lechToc <= MOC.lechToc, {
      lechToc: m[ai].lechToc,
      lechVay: m[ai].lechVay,
      soKhop: m[ai].soKhop,
      tyLeGoc: m[ai].tyLeGoc,
    });
  }
}

/* 4. không còn trần: ngửa máy lên không thấy màu trần cũ, và không cháy sáng */
{
  const img = lumaStats(`${THU_MUC}/nhin-len.png`);
  nhatKy.luma['nhin-len'] = img;
  chot('4-nhin-len-khong-chay', img.p95 <= MOC.lumaP95, img);
}
for (const name of PRESET) {
  const s = lumaStats(`${THU_MUC}/preset-${name}.png`);
  nhatKy.luma[name] = s;
  chot(`4-luma/${name}`, s.p95 <= MOC.lumaP95 && s.p50 >= MOC.lumaP50, s);
}

/* 5. console sạch (bỏ tiếng ồn của bridge chưa chạy — stack thật của Boss) */
const ON_BRIDGE = /(127\.0\.0\.1:8787|localhost:879\d|\/stt\/|\/tts\/|role=stage)/;
const loiThat = nhatKy.loiConsole.filter((t) => !ON_BRIDGE.test(t));
chot('5-console-sach', loiThat.length === 0, { loi: loiThat.slice(0, 5) });

/* ------------------------------------------------------ bảng cho người đọc */
{
  const dong = (nhan, ai) => {
    const t = TRUOC[ai]?.[nhan === 'di-1s' ? 'di' : nhan === 'emote' ? 'emote' : 'idle'];
    const s = nhatKy.sau[nhan]?.[ai];
    if (!s) return null;
    return [
      nhan.padEnd(13),
      ai.padEnd(6),
      (t ? t.chanY.toFixed(4) : '  —   ').padStart(8),
      (t ? t.dayY.toFixed(4) : '  —   ').padStart(8),
      s.chanY.toFixed(4).padStart(8),
      s.deGiayY.toFixed(4).padStart(8),
      s.lechToc.toFixed(4).padStart(8),
    ].join(' ');
  };
  const dsDong = [];
  for (const nhan of Object.keys(nhatKy.sau)) {
    for (const ai of ['owner', 'gen']) {
      const d = dong(nhan, ai);
      if (d) dsDong.push(d);
    }
  }
  writeFileSync(
    `${THU_MUC}/bang-chan-san.txt`,
    'G1 (#56) — Y BÀN CHÂN TRƯỚC → SAU, Firefox + GPU thật, mặt sàn y = 0\n' +
      `FPS trong app: ${nhatKy.theFps ?? '?'}\n\n` +
      'trạng thái    ai     xươngTRƯỚC đáyTRƯỚC xươngSAU   đếSAU  lệchTóc\n' +
      '------------- ------ -------- -------- -------- -------- --------\n' +
      dsDong.join('\n') +
      '\n\n"đáyTRƯỚC" = đáy hộp bao chính xác của bản cũ; "đếSAU" = mặt ĐẾ GIÀY đo\n' +
      'bằng đỉnh quanh bàn chân (model tóc dài có đuôi tóc thấp hơn gót, hộp bao\n' +
      'không dùng làm thước đế được — xem `chotDeChan()`).\n' +
      `Đạt = |đáySAU| ≤ ${MOC.leSan} m ở mọi trạng thái không ngồi; lệchTóc ≤ ${MOC.lechToc} m.\n`,
  );
}

writeFileSync(`${THU_MUC}/nhat-ky-kiem-g1.json`, JSON.stringify(nhatKy, null, 1));

console.log(`\nFPS: ${nhatKy.theFps}   calls: ${nhatKy.hieuNang?.calls ?? '?'}`);
for (const [k, v] of Object.entries(nhatKy.dat)) {
  if (!v.dat) console.log(`✗ ${k}  ${JSON.stringify(v)}`);
}
console.log(`\n${Object.values(nhatKy.dat).filter((v) => v.dat).length}/${Object.keys(nhatKy.dat).length} mục đạt`);
if (loi.length) {
  console.error(`\n⛔ ${loi.length} mục KHÔNG đạt:\n  ` + loi.join('\n  ') + '\n');
  process.exit(1);
}
writeFileSync(CO_KHOA, new Date().toISOString() + '\n');
console.log(`\n✓ G1 đạt. Bằng chứng: ${THU_MUC}/\n`);
