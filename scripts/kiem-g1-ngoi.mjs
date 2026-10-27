/**
 * kiem-g1-ngoi.mjs — kiểm **RIÊNG MỤC NGỒI** sau khi hạ nội thất về cỡ chibi
 * (G1, Issue #56). Firefox thật, cổng 5363, KHÔNG chạy lại cả bộ `kiem-g1`.
 *
 * Boss chốt: "nội thất là của hai nhân vật chibi nên ghế/sofa/bàn phải VỪA
 * họ". Hạ mặt ngồi ghế ăn / ghế làm việc / sofa về ~0,30 m và bàn ăn / bàn
 * làm việc về ~0,58–0,60 m (`bo-cuc.ts`, chỉ sửa `cao`/`rongToiDa`).
 *
 * Chấm (ngồi ở `ghe-1`, `ghe-2`, `sofa`):
 *   1. bàn chân chạm sàn ±2 cm (`deGiayY`, thước đế giày của G1);
 *   2. hông NGỒI TRÊN mặt ghế (hipsY − seatY nằm trong 0…0,15 m);
 *   3. tay không xuyên bàn: bàn tay nào nằm trong vết chân bàn làm việc thì
 *      phải cao hơn mặt bàn;
 *   4. màn hình `may-tinh` vẫn ĐỨNG TRÊN mặt bàn (E2: `bottomY` ≈ `surfaceY`).
 *
 * Ra `docs/g1/`: `bang-ngoi.txt`, `nhat-ky-ngoi.json`, `ngoi-*.jpg` (nén sau).
 */
import { firefox } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const THU_MUC = 'docs/g1';
mkdirSync(THU_MUC, { recursive: true });

const MOC = {
  /** Bàn chân chạm sàn khi ngồi, sai số cho phép (m). */
  leSan: 0.02,
  /** Hông phải cao hơn mặt ghế, trong khoảng này (m) — nửa bề dày đùi chibi. */
  hongTrenGhe: [0, 0.15],
  /** Màn hình đứng trên mặt bàn, lệch tối đa (m). */
  leManHinh: 0.01,
};
/**
 * Mặt ngồi/mặt bàn mong muốn sau khi hạ về cỡ chibi (m).
 *
 * Boss nhắm 0,30–0,32 m cho mặt ngồi, nhưng ĐO TRÊN MODEL thì mức đó **không
 * thể** cho bàn chân chạm sàn: cẳng chân chibi dài 0,25 m, đế giày 0,033 m,
 * nên đầu gối phải ở 0,283 m thì bàn chân mới tới sàn — mà dáng ngồi giữ đầu
 * gối cao hơn mặt ghế 0,03 m (`LE_DAU_GOI`). Mặt ghế vì thế phải ≤ 0,253 m +
 * lề. Đo thật ở 0,30 m: bàn chân treo 4,7–5,2 cm. Chốt 0,26 m — giao kèo
 * "chân chạm sàn" thắng con số ước lượng.
 */
const MONG_MUON = { matGhe: [0.24, 0.3], matBan: [0.54, 0.62] };

const PORT = 5363;
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

const nhatKy = { khi: new Date().toISOString(), moc: MOC, mongMuon: MONG_MUON, ghe: {}, dat: {}, loiConsole: [] };
const loi = [];
const chot = (ten, dat, chiTiet) => {
  nhatKy.dat[ten] = { dat, ...chiTiet };
  if (!dat) loi.push(`${ten}: ${JSON.stringify(chiTiet)}`);
};

const br = await firefox.launch({
  headless: process.env.HL === "1",
  env: { ...process.env, MOZ_ENABLE_WAYLAND: '0', MOZ_X11_EGL: '0' },
});
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();
pg.on('console', (m) => m.type() === 'error' && nhatKy.loiConsole.push(m.text()));
pg.on('pageerror', (e) => nhatKy.loiConsole.push(`pageerror: ${e.message}`));
await pg.goto(url, { waitUntil: 'load' });
await pg.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
await pg.waitForTimeout(3000);

/** Chạy lệnh và NÉM nếu nó rớt (bài học: `.catch` nuốt lỗi → mục đạt vô nghĩa). */
const chayLenh = async (cmd, args) => {
  const r = await pg.evaluate(
    ([c, a]) => window.stage.run(c, a).then((x) => ({ ok: true, x }), (e) => ({ ok: false, e: String(e) })),
    [cmd, args],
  );
  if (!r.ok) throw new Error(`${cmd} hỏng: ${r.e}`);
  return r.x;
};

/* mặt bàn làm việc + màn hình trên nó (E2) */
const manHinh = await pg.evaluate(async () => {
  const d = await window.stage.describe();
  return d.result.screens?.find((s) => s.id === 'may-tinh') ?? null;
});
nhatKy.manHinh = manHinh;

await pg.evaluate(() =>
  window.stage.datMay([0.6, 0.55, -2.0], [3, 0.35, -4.4]),
);
await pg.addStyleTag({
  content: '#bang,#hud,#toast,#loading,#o-chat,#goi-y-phim,#nut-tieng,#o-noi-nhanh{display:none!important}',
});

for (const ghe of ['ghe-1', 'ghe-2', 'sofa']) {
  await chayLenh('actor.sit', { actor: 'owner', seat: ghe });
  await pg
    .waitForFunction(() => window.stage.doXuong('owner').dangNgoiCo === true, null, {
      timeout: 30000,
      polling: 400,
    })
    .catch(() => {});
  await pg.waitForTimeout(1500);
  const m = await pg.evaluate(() => {
    const d = window.stage.doXuong('owner');
    return {
      ngoi: d.dangNgoiCo,
      deGiayY: d.deGiayY,
      chanY: d.tuThe.footY,
      hipsY: d.tuThe.hipsY,
      kneeY: d.tuThe.kneeY,
      seatY: d.seatY,
      dayDui: d.dayDui,
      tayT: d.banTayTrai,
      tayP: d.banTayPhai,
    };
  });
  nhatKy.ghe[ghe] = m;
  console.log(`${ghe.padEnd(7)} ngồi=${m.ngoi} đế=${m.deGiayY} hông=${m.hipsY} ghế=${m.seatY}`);
  // ảnh: máy ngang mặt ghế, ngắm vào hông/chân
  await pg.evaluate(
    ([h]) => {
      const d = window.stage.doXuong('owner');
      const [x, , z] = d.hips;
      window.stage.datMay([x + 1.5, h + 0.25, z + 1.5], [x, h, z]);
    },
    [m.seatY],
  );
  await pg.waitForTimeout(700);
  await pg.screenshot({ path: `${THU_MUC}/ngoi-${ghe}.png` });

  chot(`ngoi/${ghe}/that-su-ngoi`, m.ngoi === true, { ngoi: m.ngoi });
  chot(`ngoi/${ghe}/chan-cham-san`, Math.abs(m.deGiayY) <= MOC.leSan, {
    deGiayY: m.deGiayY,
    chanY: m.chanY,
  });
  const treoHong = +(m.hipsY - m.seatY).toFixed(4);
  chot(
    `ngoi/${ghe}/hong-tren-mat-ghe`,
    treoHong >= MOC.hongTrenGhe[0] && treoHong <= MOC.hongTrenGhe[1],
    { hipsY: m.hipsY, seatY: m.seatY, treoHong, dayDui: m.dayDui },
  );
  chot(`ngoi/${ghe}/mat-ghe-co-chibi`, m.seatY >= MONG_MUON.matGhe[0] && m.seatY <= MONG_MUON.matGhe[1], {
    seatY: m.seatY,
    mongMuon: MONG_MUON.matGhe,
  });

  // tay không xuyên BÀN LÀM VIỆC (chỉ có nghĩa ở ghế làm việc, nhưng kiểm cả 3)
  if (manHinh?.restsOn) {
    const matBan = manHinh.restsOn.surfaceY;
    const trongBan = (p) => p && Math.abs(p[0] - 3) <= 0.56 && Math.abs(p[2] + 4.5) <= 0.3;
    const xuyen = [m.tayT, m.tayP].filter((p) => trongBan(p) && p[1] < matBan - 0.005);
    chot(`ngoi/${ghe}/tay-khong-xuyen-ban`, xuyen.length === 0, {
      matBan,
      tayT: m.tayT,
      tayP: m.tayP,
    });
  }

  await chayLenh('actor.stand', { actor: 'owner' });
  await pg
    .waitForFunction(() => window.stage.doXuong('owner').dangNgoiCo === false, null, {
      timeout: 20000,
      polling: 400,
    })
    .catch(() => {});
  await pg.waitForTimeout(1200);
}

/* E2: màn hình vẫn đứng trên mặt bàn sau khi hạ bàn */
if (manHinh?.restsOn) {
  const lech = +Math.abs(manHinh.bottomY - manHinh.restsOn.surfaceY).toFixed(4);
  chot('man-hinh-van-tren-ban', lech <= MOC.leManHinh, {
    bottomY: manHinh.bottomY,
    surfaceY: manHinh.restsOn.surfaceY,
    lech,
  });
  chot(
    'mat-ban-co-chibi',
    manHinh.restsOn.surfaceY >= MONG_MUON.matBan[0] && manHinh.restsOn.surfaceY <= MONG_MUON.matBan[1],
    { surfaceY: manHinh.restsOn.surfaceY, mongMuon: MONG_MUON.matBan },
  );
} else {
  chot('man-hinh-van-tren-ban', false, { manHinh });
}

/* ảnh cụm phòng khách + bàn làm việc sau khi hạ nội thất */
for (const name of ['phong-khach', 'ban-lam-viec', 'bep']) {
  await pg.evaluate((n) => window.stage.run('camera.preset', { name: n }), name);
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: `${THU_MUC}/noi-that-chibi-${name}.png` });
}

const ON_BRIDGE = /(127\.0\.0\.1:8787|localhost:879\d|\/stt\/|\/tts\/|role=stage)/;
const loiThat = nhatKy.loiConsole.filter((t) => !ON_BRIDGE.test(t));
chot('console-sach', loiThat.length === 0, { loi: loiThat.slice(0, 5) });

await ctx.close();
await br.close();
server.kill('SIGTERM');

writeFileSync(
  `${THU_MUC}/bang-ngoi.txt`,
  'G1 (#56) — NGỒI trên nội thất đã hạ về cỡ chibi (Firefox thật, sàn y = 0)\n\n' +
    'ghế     mặt ghế  hông    hông−ghế  đầu gối  ĐẾ GIÀY\n' +
    '------- -------- ------- --------- -------- --------\n' +
    Object.entries(nhatKy.ghe)
      .map(([k, m]) =>
        [
          k.padEnd(7),
          m.seatY.toFixed(4).padStart(8),
          m.hipsY.toFixed(4).padStart(7),
          (m.hipsY - m.seatY).toFixed(4).padStart(9),
          m.kneeY.toFixed(4).padStart(8),
          m.deGiayY.toFixed(4).padStart(8),
        ].join(' '),
      )
      .join('\n') +
    `\n\nMặt bàn làm việc: ${nhatKy.manHinh?.restsOn?.surfaceY ?? '?'} m — màn hình ` +
    `may-tinh đáy ${nhatKy.manHinh?.bottomY ?? '?'} m (E2: phải trùng).\n` +
    'Đạt = |đế giày| ≤ 0,02 m · hông−ghế trong 0…0,15 m · mặt ghế 0,24–0,30 m\n' +
    '(0,30–0,32 m Boss nhắm là BẤT KHẢ với cẳng chân chibi 0,25 m — xem MONG_MUON).\n',
);
writeFileSync(`${THU_MUC}/nhat-ky-ngoi.json`, JSON.stringify(nhatKy, null, 1));

for (const [k, v] of Object.entries(nhatKy.dat)) if (!v.dat) console.log(`✗ ${k} ${JSON.stringify(v)}`);
console.log(`\n${Object.values(nhatKy.dat).filter((v) => v.dat).length}/${Object.keys(nhatKy.dat).length} mục đạt`);
if (loi.length) {
  console.error(`\n⛔ ${loi.length} mục KHÔNG đạt\n`);
  process.exit(1);
}
console.log(`\n✓ Mục NGỒI đạt. Bằng chứng: ${THU_MUC}/bang-ngoi.txt\n`);
