/**
 * kiem-e2.mjs — **BẰNG CHỨNG E2** (Issue #48, mục 3 và 7 của
 * `docs/KIEM-HOAN-CHINH.md`). CHẠY ĐÚNG MỘT LẦN (cờ khoá `docs/e2/.da-chay`).
 *
 * Kiểm chạm BẢN THẬT (Chrome + WebGL, không phải sân khấu giả):
 *
 *  1. Màn hình `may-tinh` ĐẶT ĐÚNG lên mặt bàn làm việc: `bottomY` của màn
 *     hình ≈ `restsOn.surfaceY` (mặt trên ĐO ĐƯỢC của khối `ban-dieu-khien`
 *     trong cảnh) — không nổi, không chìm.
 *  2. `screen.stream` xong thì nội dung CÒN TRÊN MÀN HÌNH: so pixel ảnh
 *     trước/sau (vùng đổi + hộp bao) và `describe().screens[]` phải có
 *     `showing: "code"`, `streaming: false`, `lines > 0`, `chars > 0`; kiểm
 *     lại sau 6 s nữa để chắc không bị reset muộn.
 *  3. `module.build` → module VÀO TAY: `actors[].holding` khớp đúng prop có
 *     `state.heldBy` (một nguồn sự thật) + ảnh module trên tay Gen.
 *  4. `actor.say { to: gen }` → hai nhân vật NHÌN NHAU: góc lệch thân của cả
 *     hai ≤ 15°, đo cả khi đổi `camera.preset` GIỮA CÂU; nói xong người nghe
 *     LIẾC MÁY QUAY. Và `actor.say` gửi cho một nhân vật thứ ba thì phản xạ
 *     KHÔNG chen câu đệm ("Sếp cần gì ạ?") của Gen vào.
 *
 * Cổng RIÊNG: vite 5220, stub TTS 8851 — KHÔNG đụng 5173 / 8787-8790 / tmux
 * `gen-stage-nao` của Boss, KHÔNG giết tiến trình nào không phải của script.
 * Stub TTS chỉ để trang không gọi ra bridge thật của Boss (8788): console
 * sạch, số đo không phụ thuộc edge-tts.
 *
 * Renderer: swiftshader (phần mềm) nên MỖI KHUNG HÌNH mất ~1–2 s. Mọi chỗ
 * chờ đều là **vòng chờ theo điều kiện** (`choToi`), không `sleep` cố định —
 * bài học từ bản kiểm trước: hiệu ứng kết tinh cần nhiều khung hình, chờ
 * cứng 6 s thì đo nhầm thành "module không vào tay".
 */
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createConnection as netConnect } from 'node:net';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { decodePng } from './lib-png.mjs';

const THU_MUC = 'docs/e2';
const CO_DA_CHAY = `${THU_MUC}/.da-chay`;
const PORT_VITE = 5220;
const PORT_TTS = 8851;

mkdirSync(THU_MUC, { recursive: true });
if (existsSync(CO_DA_CHAY)) {
  console.log(`⛔ Đã chạy rồi (${CO_DA_CHAY}) — không chạy lại. Xoá cờ nếu thật sự muốn chạy lại.`);
  process.exit(0);
}

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

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
for (const c of [PORT_VITE, PORT_TTS]) {
  if (await congBan(c)) {
    console.error(`⛔ Cổng ${c} đang bận — đổi cổng trong script, KHÔNG giết tiến trình nào.`);
    process.exit(3);
  }
}

/* -------- stub TTS: trả 200 + vài byte → lớp tiếng tự nhép miệng, im tiếng -- */
const stub = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'audio/mpeg', 'access-control-allow-origin': '*' });
  res.end(Buffer.from([0xff, 0xfb, 0x90, 0x00]));
});
await new Promise((r) => stub.listen(PORT_TTS, '127.0.0.1', r));

/**
 * H1 (#69 mục 50) — **ĐO TRÊN BẢN BUILD, KHÔNG TRÊN DEV SERVER.**
 *
 * `threejs-qa-release` gọi đây là cái bẫy có tên: "Dev server tested,
 * production build shipped untested". Dev server không minify, kèm client HMR
 * và source map, nên mọi số `calls`/FPS/luma đo trên nó là số của một bản
 * **không ai dùng**. Build trước rồi `vite preview` — đúng bản Boss sẽ mở.
 *
 * `--khong-build` để chạy lại nhanh khi `dist/` đã mới.
 */
if (!process.argv.includes('--khong-build')) {
  console.log('==> pnpm build (tsc + vite build) — số đo phải lấy trên bản build');
  const b = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit' });
  if (b.status !== 0) {
    console.error('⛔ vite build thất bại — không đo trên dev server để thay thế.');
    process.exit(1);
  }
} else if (!existsSync('dist/index.html')) {
  console.error('⛔ Chưa có dist/index.html — bỏ --khong-build để build trước.');
  process.exit(1);
}

console.log(`==> bật vite PREVIEW (bản build) ở cổng ${PORT_VITE}`);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT_VITE), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
await new Promise((resolve, reject) => {
  const han = setTimeout(() => reject(new Error('vite preview không khởi động')), 40000);
  const doc = (d) => {
    const s = String(d);
    if (/Local:|ready in/.test(s)) {
      clearTimeout(han);
      resolve();
    }
  };
  server.stdout.on('data', doc);
  server.stderr.on('data', doc);
});
await nghi(600);
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
process.on('exit', () => {
  dietCay(server);
  try {
    stub.close();
  } catch {}
});

const URL_TRANG = `http://localhost:${PORT_VITE}/?bridge=0&ttsUrl=http%3A%2F%2F127.0.0.1%3A${PORT_TTS}`;

const kq = { khi: new Date().toISOString(), anh: {}, so: {}, dat: {}, buoc: [] };
const loiConsole = [];
const ghiFile = () => writeFileSync(`${THU_MUC}/ket-qua.json`, JSON.stringify(kq, null, 2));

/** Vùng pixel KHÁC nhau giữa 2 ảnh PNG: số điểm đổi + hộp bao. */
function khacNhau(a, b, nguong = 14) {
  const x = decodePng(a);
  const y = decodePng(b);
  if (x.width !== y.width || x.height !== y.height) throw new Error('2 ảnh khác cỡ');
  let n = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  let tongLech = 0;
  for (let j = 0; j < x.height; j++) {
    for (let i = 0; i < x.width; i++) {
      const p = (j * x.width + i) * x.channels;
      const q = (j * y.width + i) * y.channels;
      const la = 0.2126 * x.data[p] + 0.7152 * x.data[p + 1] + 0.0722 * x.data[p + 2];
      const lb = 0.2126 * y.data[q] + 0.7152 * y.data[q + 1] + 0.0722 * y.data[q + 2];
      const d = Math.abs(la - lb);
      if (d > nguong) {
        n++;
        tongLech += d;
        if (i < x0) x0 = i;
        if (i > x1) x1 = i;
        if (j < y0) y0 = j;
        if (j > y1) y1 = j;
      }
    }
  }
  return {
    soDiemDoi: n,
    phanTram: +((n / (x.width * x.height)) * 100).toFixed(2),
    lechTrungBinh: n ? +(tongLech / n).toFixed(1) : 0,
    hopBao: n ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null,
    coAnh: { w: x.width, h: x.height },
  };
}

/** Góc lệch (độ) giữa hướng THÂN của actor `a` và hướng từ `a` tới điểm `p`. */
function lechVe(a, p) {
  const muc = (Math.atan2(p[0] - a.pos[0], p[2] - a.pos[2]) * 180) / Math.PI;
  return +Math.abs(((((a.facing - muc) % 360) + 540) % 360) - 180).toFixed(1);
}

let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => {
    if (m.type() === 'error') loiConsole.push(`[console] ${m.text()}`);
  });
  page.on('pageerror', (e) => loiConsole.push(`[pageerror] ${e.message}`));

  console.log('==> mở', URL_TRANG);
  await page.goto(URL_TRANG, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
  await nghi(3000);

  const mota = () => page.evaluate(async () => (await window.stage.describe()).result);
  const chay = (cmd, args) => page.evaluate(([c, a]) => window.stage.run(c, a), [cmd, args]);
  const chup = async (ten, file) => {
    const duong = `${THU_MUC}/${file}`;
    await page.screenshot({ path: duong });
    kq.anh[ten] = duong;
    console.log(`   📷 ${ten} → ${duong}`);
    ghiFile();
    return duong;
  };
  /** Chờ tới khi `dieuKien(trangThai)` đúng — renderer phần mềm rất chậm. */
  const choToi = async (ten, dieuKien, hanMs = 60000) => {
    const batDau = Date.now();
    let st = await mota();
    while (!dieuKien(st)) {
      if (Date.now() - batDau > hanMs) {
        kq.buoc.push(`hết hạn chờ: ${ten} (${hanMs} ms)`);
        return { st, kip: false, choMs: Date.now() - batDau };
      }
      await nghi(500);
      st = await mota();
    }
    return { st, kip: true, choMs: Date.now() - batDau };
  };

  /* ================= 1. màn hình đặt đúng lên mặt bàn làm việc ============ */
  const st0 = await mota();
  const mh0 = st0.screens.find((s) => s.id === 'may-tinh');
  kq.so.manHinhLucDung = st0.screens;
  const lechBan = mh0.restsOn ? +Math.abs(mh0.bottomY - mh0.restsOn.surfaceY).toFixed(4) : null;
  kq.so.lechMatBan_m = lechBan;
  kq.dat.manHinhDungTrenBan = lechBan !== null && lechBan <= 0.005;
  console.log(
    `==> may-tinh: bottomY ${mh0.bottomY} m · mặt bàn đo được ${mh0.restsOn?.surfaceY} m · lệch ${lechBan} m`,
  );
  ghiFile();

  /* ================= 2. stream xong, chữ CÒN trên màn hình ================ */
  // máy quay chính diện màn hình (toạ độ lấy từ `describe`, không chôn số)
  await page.evaluate(
    ([vt, tam]) => window.stage.datMay(vt, tam),
    [[mh0.pos[0], mh0.pos[1], mh0.pos[2] + 0.95], mh0.pos],
  );
  await nghi(2500);
  const anhTruoc = await chup('manHinhTruocStream', 'man-hinh-truoc.png');

  const MA = [
    'async function dungConnector() {\n',
    '  const api = await moBaserow();\n',
    '  const bang = await api.taoBang("khach");\n',
    '  await api.themCot(bang, "ten");\n',
    '  return { ok: true, bang };\n',
    '}\n',
  ];
  kq.so.streamKetQua = await chay('screen.stream', {
    screen: 'may-tinh',
    kind: 'code',
    chunks: MA,
  });
  const choStream = await choToi(
    'stream xong',
    (st) => {
      const m = st.screens.find((s) => s.id === 'may-tinh');
      return m.streaming === false && m.chars > 0;
    },
    60000,
  );
  const mhSau = choStream.st.screens.find((s) => s.id === 'may-tinh');
  const anhSau = await chup('manHinhSauStream', 'man-hinh-sau.png');
  const doi = khacNhau(anhTruoc, anhSau);
  kq.so.manHinhSauStream = mhSau;
  kq.so.pixelDoiVungManHinh = doi;
  kq.dat.manHinhGiuNoiDung =
    mhSau.showing === 'code' &&
    mhSau.streaming === false &&
    mhSau.lines > 0 &&
    mhSau.chars > 0 &&
    doi.soDiemDoi > 500;
  console.log(
    `==> sau stream: showing=${mhSau.showing} lines=${mhSau.lines} chars=${mhSau.chars} · pixel đổi ${doi.soDiemDoi} (${doi.phanTram}%)`,
  );
  await nghi(6000);
  const mhLau = (await mota()).screens.find((s) => s.id === 'may-tinh');
  kq.so.manHinhSau6s = mhLau;
  kq.dat.manHinhCon6s = mhLau.lines === mhSau.lines && mhLau.showing === 'code';
  ghiFile();

  /* ================= 3. module kết tinh rồi VÀO TAY Gen ================== */
  kq.so.moduleKetQua = await chay('module.build', {
    id: 'connector-baserow',
    shape: 'book',
    label: 'Baserow',
    from: 'may-tinh',
    durationMs: 2000,
  });
  const choTay = await choToi(
    'module vào tay',
    (st) => st.props.find((p) => p.id === 'connector-baserow')?.state.heldBy === 'gen',
    90000,
  );
  const stMod = choTay.st;
  const gen = stMod.actors.find((a) => a.id === 'gen');
  const owner = stMod.actors.find((a) => a.id === 'owner');
  const prop = stMod.props.find((p) => p.id === 'connector-baserow');
  kq.so.choModuleVaoTayMs = choTay.choMs;
  kq.so.holding = stMod.actors.map((a) => ({ id: a.id, holding: a.holding }));
  kq.so.props = stMod.props.map((p) => ({ id: p.id, heldBy: p.state.heldBy, pos: p.pos }));
  // một nguồn sự thật: prop mà Gen khai đang cầm = đúng prop khai do Gen giữ
  kq.dat.moduleVaoTay =
    gen.holding === 'connector-baserow' &&
    prop?.state.heldBy === 'gen' &&
    owner.holding === null &&
    stMod.props.filter((p) => p.state.heldBy === 'gen').length === 1;
  console.log(
    `==> holding gen=${gen.holding} · heldBy=${prop?.state.heldBy} (chờ ${choTay.choMs} ms)`,
  );
  await page.evaluate(
    ([vt, tam]) => window.stage.datMay(vt, tam),
    [
      [gen.pos[0] - 0.2, 1.35, gen.pos[2] + 1.1],
      [gen.pos[0], 1.0, gen.pos[2]],
    ],
  );
  await nghi(2500);
  await chup('moduleTrenTay', 'module-tren-tay.png');
  ghiFile();

  /* ======= 4a. câu gửi cho nhân vật thứ ba → Gen KHÔNG chen câu đệm ====== */
  await page.evaluate(() => {
    window.__e2Say = [];
    window.stage.on('actor.sayStart', (e) => window.__e2Say.push({ ...e.data }));
  });
  kq.so.spawnLan = await chay('actor.spawn', {
    id: 'lan',
    name: 'Lan',
    model: 'models/owner.vrm',
    at: 'ban-an',
    controlledBy: 'agent',
  });
  await nghi(4000);
  await chay('actor.say', { actor: 'owner', text: 'Lan ơi, chiều nay rảnh không', to: 'lan' });
  await nghi(8000); // quá hạn câu đệm (1,5 s) và hạn não rule-based (1,9 s)
  const CAU_DEM = ['Dạ, Sếp?', 'Em nghe ạ', 'Sếp cần gì ạ?', 'Dạ em đây'];
  const sayLan = await page.evaluate(() => window.__e2Say ?? []);
  kq.so.cauKhiNoiVoiLan = sayLan;
  kq.dat.khongChenCauDem = !sayLan.some((x) => x.actor === 'gen' && CAU_DEM.includes(x.text));
  console.log(
    `==> nói với Lan: Gen chen câu đệm? ${!kq.dat.khongChenCauDem} (${sayLan.length} câu trong lượt)`,
  );
  await chay('actor.remove', { actor: 'lan' });
  await nghi(1500);
  ghiFile();

  /* ======= 4b. Javis nói với Gen → hai người nhìn nhau, đổi góc máy giữa câu */
  await chay('actor.moveTo', { actor: 'owner', to: [gen.pos[0] - 1.5, 0, gen.pos[2] + 1.0] });
  const choDi = await choToi(
    'Javis đi tới cạnh Gen',
    (st) => st.actors.find((a) => a.id === 'owner')?.state !== 'walking',
    60000,
  );
  kq.so.viTriTruocKhiNoi = choDi.st.actors.map((a) => ({ id: a.id, pos: a.pos, facing: a.facing }));
  /**
   * Cú **liếc máy quay** chỉ giữ ~700 ms (`MAC_DINH.liecMs`) rồi Gen vào câu
   * trả lời của mình (và lúc đang nói thì phải nhìn người nghe của câu đó) —
   * nên không đo được bằng một lần `describe()` sau khi câu kết thúc. Lấy
   * mẫu 60 ms/lần NGAY TRONG TRANG cùng mốc `actor.sayDone`, rồi xét: sau khi
   * Javis nói xong, có mẫu nào Gen nhìn `camera` không.
   */
  await page.evaluate(() => {
    window.__e2Say = [];
    window.__e2Mau = [];
    window.__e2Done = [];
    window.stage.on('actor.sayDone', (e) => window.__e2Done.push({ t: Date.now(), ...e.data }));
    window.__e2Hen = setInterval(async () => {
      const d = (await window.stage.describe()).result;
      const g = d.actors.find((a) => a.id === 'gen');
      const o = d.actors.find((a) => a.id === 'owner');
      window.__e2Mau.push({
        t: Date.now(),
        genLookingAt: g?.lookingAt ?? null,
        genState: g?.state ?? null,
        ownerState: o?.state ?? null,
      });
    }, 60);
  });

  const dangNoi = page.evaluate(
    ([args]) => window.stage.run('actor.say', args),
    [{ actor: 'owner', text: 'Gen ơi, phần giao diện em lo nhé', to: 'gen' }],
  );
  await nghi(1200);
  // ĐỔI GÓC MÁY GIỮA CÂU — hai nhân vật vẫn phải nhìn NHAU, không quay theo máy
  await chay('camera.preset', { name: 'toan-canh' });
  await nghi(1800);
  const stGiua = await mota();
  const gG = stGiua.actors.find((a) => a.id === 'gen');
  const oG = stGiua.actors.find((a) => a.id === 'owner');
  kq.so.gocGiuaCau = {
    javisLechVeGen: lechVe(oG, gG.pos),
    genLechVeJavis: lechVe(gG, oG.pos),
    genLookingAt: gG.lookingAt,
    javisLookingAt: oG.lookingAt,
    genState: gG.state,
    cameraPreset: stGiua.camera.preset,
  };
  // ảnh hai nhân vật nhìn nhau: máy đứng ngang cặp, lùi ra ~2,9 m
  const giuaX = (gG.pos[0] + oG.pos[0]) / 2;
  const giuaZ = (gG.pos[2] + oG.pos[2]) / 2;
  await page.evaluate(
    ([vt, tam]) => window.stage.datMay(vt, tam),
    [
      [giuaX + 0.3, 1.45, giuaZ + 2.9],
      [giuaX, 1.25, giuaZ],
    ],
  );
  await nghi(2500);
  await chup('haiNguoiNhinNhau', 'nhin-nhau.png');

  await dangNoi;
  // ĐO NGAY: cú liếc máy quay chỉ giữ ~700 ms (MAC_DINH.liecMs)
  const stXong = await mota();
  const gX = stXong.actors.find((a) => a.id === 'gen');
  const oX = stXong.actors.find((a) => a.id === 'owner');
  kq.so.gocNgaySauCau = {
    javisLechVeGen: lechVe(oX, gX.pos),
    genLechVeJavis: lechVe(gX, oX.pos),
    genLookingAt: gX.lookingAt,
  };
  kq.so.cauKhiNoiVoiGen = await page.evaluate(() => window.__e2Say ?? []);

  // để Gen vào câu trả lời xong rồi mới chốt mẫu (câu đệm/não rule-based)
  await nghi(5000);
  const vet = await page.evaluate(() => {
    clearInterval(window.__e2Hen);
    return { mau: window.__e2Mau ?? [], done: window.__e2Done ?? [] };
  });
  const xongCuaJavis = vet.done.find((x) => x.actor === 'owner' && x.to === 'gen');
  const mauSauDo = xongCuaJavis ? vet.mau.filter((m) => m.t >= xongCuaJavis.t - 150) : [];
  const liec = mauSauDo.find((m) => m.genLookingAt === 'camera');
  kq.so.liecMayQuay = {
    mocJavisNoiXong: xongCuaJavis ? xongCuaJavis.t : null,
    soMauSauDo: mauSauDo.length,
    treMs: liec && xongCuaJavis ? liec.t - xongCuaJavis.t : null,
    mau: mauSauDo.slice(0, 40),
  };
  kq.dat.nhinNhauDuoi15Do =
    kq.so.gocGiuaCau.javisLechVeGen <= 15 &&
    kq.so.gocGiuaCau.genLechVeJavis <= 15 &&
    kq.so.gocNgaySauCau.javisLechVeGen <= 15 &&
    kq.so.gocNgaySauCau.genLechVeJavis <= 15;
  kq.dat.nguoiNgheLiecMayQuay = liec !== undefined;
  console.log(
    `==> giữa câu (preset ${kq.so.gocGiuaCau.cameraPreset}): Javis ${kq.so.gocGiuaCau.javisLechVeGen}° · Gen ${kq.so.gocGiuaCau.genLechVeJavis}°`,
  );
  console.log(
    `==> ngay sau câu: Javis ${kq.so.gocNgaySauCau.javisLechVeGen}° · Gen ${kq.so.gocNgaySauCau.genLechVeJavis}° · Gen nhìn ${gX.lookingAt}`,
  );
  console.log(
    `==> liếc máy quay: ${liec ? `có, trễ ${kq.so.liecMayQuay.treMs} ms` : 'KHÔNG'} (${mauSauDo.length} mẫu sau khi Javis nói xong)`,
  );
  ghiFile();

  kq.so.loiConsole = loiConsole;
  kq.dat.consoleSach = loiConsole.length === 0;
} catch (e) {
  kq.loi = e instanceof Error ? e.stack : String(e);
  console.error('⛔ lỗi:', kq.loi);
} finally {
  if (browser) {
    try {
      await browser.close();
    } catch {}
  }
}

if (kq.so.loiConsole === undefined) {
  kq.so.loiConsole = loiConsole;
  kq.dat.consoleSach = loiConsole.length === 0;
}
const moiDat = Object.entries(kq.dat);
kq.tongKet = {
  dat: moiDat.filter(([, v]) => v === true).map(([k]) => k),
  khong: moiDat.filter(([, v]) => v !== true).map(([k]) => k),
};
ghiFile();
console.log('\n===== TỔNG KẾT =====');
for (const [k, v] of moiDat) console.log(`${v === true ? '✅' : '❌'} ${k}`);
console.log(`console lỗi: ${loiConsole.length}`);
console.log(`→ ${THU_MUC}/ket-qua.json`);

if (!kq.loi && kq.tongKet.khong.length === 0 && moiDat.length >= 7) {
  writeFileSync(CO_DA_CHAY, `${new Date().toISOString()}\n`);
  console.log(`🔒 ghi cờ khoá ${CO_DA_CHAY}`);
  process.exit(0);
}
process.exit(1);
