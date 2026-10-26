/**
 * kiem-f2.mjs — BẰNG CHỨNG F2 (Issue #56 mục 2) trên **Firefox + GPU THẬT**.
 *
 * Vì sao không dùng Chromium như các script trước: mọi bằng chứng B1/D1b chạy
 * Chromium + swiftshader (~1 FPS), và chính ở `dt` cỡ 1 giây thì các công thức
 * `x += (muc − x) · min(1, dt·k)` đều kẹp về 1 — **bám tức thì** — nên ba tật
 * làm Boss thấy "điều khiển loạn tùm lum" đều vô hình. Script này chạy đúng
 * trình duyệt Boss dùng, dựng hình bằng GPU thật.
 *
 * Chạy (**một lần** — cờ khoá `docs/f2/.da-chay`):
 *   node scripts/kiem-f2.mjs          # trọn bộ
 *   node scripts/kiem-f2.mjs --lai    # xoá cờ khoá rồi chạy lại
 *   node scripts/kiem-f2.mjs <url>    # chạy vào một url có sẵn
 *
 * Ra `docs/f2/`:
 *   nhat-ky-kiem-f2.json   LOG SỐ: 3 lượt lái, mỗi lượt là sổ TỪNG KHUNG
 *                          (`[t, dt, x, z, |v|, facing, chặn]`) do chính sân
 *                          khấu ghi, cộng sổ camera và thẻ FPS trong app
 *   bang-giu-W.txt         bảng 60 mẫu khi giữ W (đọc được bằng mắt)
 *   01-giu-W.png           giữa lúc giữ W
 *   02-doi-huong.png       giữa lúc đổi A→D
 *   03-da-dung.png         sau khi nhả phím
 *   04-thuoc-fps.png       thẻ `?fps=1` đã chốt số
 *   video/*.webm           video 10 s cả lượt điều khiển
 *
 * **Số đo đến từ đâu**: sân khấu tự ghi sổ mỗi khung (`NhanVat.soLai`,
 * `World.soMay`), script chỉ đọc MỘT lần ở cuối. Vòng dò đầu tiên lấy mẫu
 * bằng `stage.describe()` mỗi khung và tự kéo FPS 60 → 8,5 — dụng cụ đo làm
 * hỏng cái cần đo. Đừng quay lại cách đó.
 *
 * Kiểm bằng SỐ (ngưỡng ở `MOC`):
 *   1. giữ W: tốc độ tăng ĐƠN ĐIỆU tới ~1,6 m/s rồi giữ; không khung nào tụt
 *      quá `MOC.tutToiDa` giữa lúc đang giữ phím (tật cũ: 1,60 → 0,32 → 1,15);
 *   2. không có "chạy bộ tại chỗ": mọi khung có |v| > ngưỡng đều phải DỊCH
 *      CHUYỂN thật (tật cũ: v = 0,23 m/s mà toạ độ đứng im trước sofa);
 *   3. đổi hướng A→D: `facing` quay đều, tốc độ góc ≤ `MOC.tocXoayToiDa`;
 *   4. nhả phím: |v| về 0 trong ≤ `MOC.giayDung` s;
 *   5. camera bám: không đổi chiều liên tiếp (rung) quá `MOC.doiChieu` lần;
 *   6. console 0 lỗi; thước FPS chốt được số thật (không "60.0 / NaN").
 */
import { firefox } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const THU_MUC = 'docs/f2';
mkdirSync(`${THU_MUC}/video`, { recursive: true });

/** Ngưỡng đạt/không đạt — để một chỗ, đổi là thấy ngay. */
const MOC = {
  /** Tốc độ ổn định phải đạt ≥ (m/s) — `TOC_DO_STEER` là 1,6. */
  tocDat: 1.5,
  /** Giữa lúc ĐANG giữ phím, |v| không được tụt quá bấy nhiêu m/s giữa 2 khung. */
  tutToiDa: 0.25,
  /** Dưới ngưỡng này coi là đã dừng (m/s) — khớp `NGUONG_DUNG`. */
  nguongDung: 0.12,
  /**
   * Nhả phím → dừng trong (s). Đây là **ngân sách vật lý** (đường cong phanh
   * `LERP_PHANH`, chứng minh ở test đơn vị cho 10/30/60/144 FPS). Khi chấm
   * điểm trên máy thật phải cộng thêm `khungDung` khung hình: lệnh dừng chỉ có
   * hiệu lực ở khung TIẾP THEO, và máy này chạy ~16 FPS nên một khung đã là
   * 62 ms. Không cộng thì ngưỡng đang đo tốc độ GPU của máy kiểm, không phải
   * đo đường cong phanh.
   */
  giayDung: 0.3,
  /** Số khung dung sai cộng thêm khi chấm mục "nhả phím → dừng". */
  khungDung: 2,
  /** Trần tốc độ quay người khi lái (rad/s) — `TOC_XOAY_LAI` là 2π. */
  tocXoayToiDa: Math.PI * 2 * 1.25,
  /** Số lần camera đổi chiều chạy cho phép trong một lượt (rung). */
  doiChieu: 3,
};

const argv = process.argv.slice(2);
const urlArg = argv.find((a) => a.startsWith('http'));

const CO_KHOA = `${THU_MUC}/.da-chay`;
if (argv.includes('--lai')) {
  if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
} else if (existsSync(CO_KHOA)) {
  console.error(
    `\n⛔ ${CO_KHOA} đã tồn tại — kiểm F2 chỉ chạy MỘT LẦN sau khi code xong.\n` +
      `   Kết quả lượt trước: ${THU_MUC}/nhat-ky-kiem-f2.json + ảnh/video trong ${THU_MUC}/.\n` +
      '   Thật sự cần chạy lại: node scripts/kiem-f2.mjs --lai\n',
  );
  process.exit(2);
}

/** Cổng ≥ 8900 / dev ≥ 5310: KHÔNG đụng stack thật của Boss (5173, 8787…). */
const PORT = 8901;
let server = null;
async function moServer() {
  if (urlArg) return urlArg;
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise((ok, no) => {
    const h = setTimeout(() => no(new Error('vite preview không lên')), 60000);
    server.stdout.on('data', (d) => {
      const t = String(d);
      if (t.includes(`localhost:${PORT}`)) {
        clearTimeout(h);
        ok(`http://localhost:${PORT}/`);
      }
    });
    server.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  });
  return url;
}

const nhatKy = {
  khi: new Date().toISOString(),
  trinhDuyet: 'firefox (playwright) — GPU thật, headless:false',
  moc: MOC,
  luot: {},
  loiConsole: [],
  dat: {},
};
const loi = [];
function chot(ten, dat, chiTiet) {
  nhatKy.dat[ten] = { dat, ...chiTiet };
  if (!dat) loi.push(`${ten}: ${JSON.stringify(chiTiet)}`);
}

const url = await moServer();
const br = await firefox.launch({
  headless: false,
  // Wayland + nouveau làm tiến trình GPU của Firefox gãy ("channel error");
  // chạy qua X11 thì WebGL vẫn là GPU thật (`glxinfo`: Accelerated yes).
  env: { ...process.env, MOZ_ENABLE_WAYLAND: '0', MOZ_X11_EGL: '0' },
});
/**
 * Quay phim bằng `ffmpeg -f x11grab`, KHÔNG dùng `recordVideo` của Playwright.
 *
 * Lượt đầu thử `recordVideo` với Firefox: file ra 3,2 KB / **1,0 giây** cho cả
 * 25 giây điều khiển (đo bằng `ffprobe`) — tính năng đó thực chất chỉ chạy
 * đúng trên Chromium. Một video chỉ-tên-là-video thì không phải bằng chứng,
 * nên quay thẳng màn hình X11 trong đúng lúc Boss-giả đang bấm phím.
 */
const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
const pg = await ctx.newPage();
pg.on('console', (m) => {
  if (m.type() === 'error') nhatKy.loiConsole.push(m.text());
});
pg.on('pageerror', (e) => nhatKy.loiConsole.push(`pageerror: ${e.message}`));

await pg.goto(`${url}?fps=1`, { waitUntil: 'load' });
await pg.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
await pg.evaluate(() => window.stage.run('camera.preset', { name: 'theo-owner' }));

/**
 * Lái owner ra giữa hành lang trước khi đo.
 *
 * Chỗ spawn (−4,5; 2,6) cách mép sofa đúng 0,26 m: lượt dò đầu tiên giữ W là
 * nhân vật đụng sofa sau 2 khung, và bản B1 đứng im tại đó với |v| = 0,23 m/s
 * (tật "chạy bộ tại chỗ", mục 2). Giao kèo "giữ W là đi đều" phải đo ở nơi
 * KHÔNG có vật cản, còn tật va chạm có mục kiểm riêng.
 */
await pg.evaluate(() => window.stage.run('actor.moveTo', { actor: 'owner', to: [0, 0, 3.2] }));
await pg.waitForTimeout(3500);
await pg.evaluate(() => window.stage.run('actor.turnTo', { actor: 'owner', target: [0, 0, -4] }));
await pg.waitForTimeout(900);

/** Lấy sổ từng khung mà SÂN KHẤU tự ghi (không lấy mẫu từ ngoài). */
const soLai = () => pg.evaluate(() => window.stage.doXuong('owner').vanToc);
const soMay = () => pg.evaluate(() => window.stage.hieuNang().soMay);
const anh = (ten) => pg.screenshot({ path: `${THU_MUC}/${ten}.png` });

// ép cửa sổ nhận phím, và KHÔNG để con trỏ nằm trong ô nhập nào
await pg.mouse.click(640, 740);
await pg.waitForTimeout(300);

/** Quay 11 giây màn hình (bao trùm cả cửa sổ Firefox 1280×800) song song. */
const phim = spawn(
  'ffmpeg',
  // prettier-ignore
  ['-hide_banner', '-loglevel', 'error', '-f', 'x11grab',
   '-video_size', '1440x920', '-framerate', '25', '-i', `${process.env.DISPLAY || ':0'}.0+0,0`,
   '-t', '11', '-c:v', 'libvpx', '-b:v', '1500k', '-y', `${THU_MUC}/video/dieu-khien-10s.webm`],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
phim.stderr.on('data', (d) => process.stderr.write(`[ffmpeg] ${d}`));

/* ------------------------------------------------- lượt 1: giữ W 3 giây */
await pg.keyboard.down('w');
await pg.waitForTimeout(1200);
await anh('01-giu-W');
await pg.waitForTimeout(1800);
const giuW = await soLai();
nhatKy.luot.giuW = giuW;

/* ----------------------------------------- lượt 2: A → D (đổi hướng 180°) */
await pg.keyboard.up('w');
await pg.waitForTimeout(700);
await pg.keyboard.down('a');
await pg.waitForTimeout(1100);
await pg.keyboard.up('a');
await pg.keyboard.down('d');
await pg.waitForTimeout(400);
await anh('02-doi-huong');
await pg.waitForTimeout(900);
const doiHuong = await soLai();
nhatKy.luot.doiHuong = doiHuong;

/* ------------------------------------------------ lượt 3: nhả phím → dừng */
await pg.keyboard.up('d');
await pg.waitForTimeout(1400);
const nhaPhim = await soLai();
nhatKy.luot.nhaPhim = nhaPhim;
await anh('03-da-dung');

/* --------------------------------------------- lượt 4: ẩn tab giữa lúc giữ */
await pg.keyboard.down('w');
await pg.waitForTimeout(600);
await pg.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
});
await pg.waitForTimeout(1200);
await pg.keyboard.up('w');
const anTab = await soLai();
nhatKy.luot.anTab = anTab;

/* --------------------- lượt 5: ép vào VẬT CẢN trong khi VẪN giữ phím (gốc 2) */
/**
 * Review #58 chỉ đúng một chỗ đau: mục `2-khong-chay-bo-tai-cho` của vòng đầu
 * chấm trên hai lượt **không có vật cản** (script đã lái owner ra chỗ trống
 * trước khi đo) nên đạt một cách tầm thường, trong khi tật thật chỉ hiện ra
 * khi **ép vào vật cản mà vẫn giữ phím**.
 *
 * Dùng **tường phòng** (`kepTrongPhong`, |z| ≤ 4,5) chứ không dùng một món đồ
 * cụ thể: F1 (#57) vừa dọn lại toàn bộ bố cục, ghi cứng toạ độ sofa là lượt
 * sau lại sai. Tường luôn ở đó, và đi qua **đúng một đường mã** với bàn ghế
 * (`buocLai` → `truotVaCham`). Va chạm với từng hộp đồ đạc có test đơn vị
 * riêng (`f2-dieu-khien-muot.test.ts` mục 5, tự dò hộp từ `hopChan()`).
 */
await pg.evaluate(() => window.stage.run('actor.moveTo', { actor: 'owner', to: [0, 0, 0] }));
await pg.waitForTimeout(5000); // `moveTo` đi 0,95 m/s — chờ ngắn là chưa tới nơi
await pg.mouse.click(640, 740);
await pg.keyboard.down('s'); // +Z, về phía tường nam (z = +4,5)
// 4,5 m ở 1,6 m/s mất ~2,9 s; giữ 4,5 s để chắc chắn ĐÃ áp vào tường rồi mới đo
await pg.waitForTimeout(4500);
// VẪN ĐANG GIỮ PHÍM: đọc trạng thái + độ cao hông 3 lần để bắt cú "nhún tại chỗ"
const epTuong = { hongY: [] };
for (let i = 0; i < 3; i += 1) {
  epTuong.hongY.push(await pg.evaluate(() => window.stage.doXuong('owner').hips[1]));
  epTuong.state = await pg.evaluate(
    async () =>
      (await window.stage.describe()).result.actors.find((a) => a.controlledBy === 'owner').state,
  );
  await pg.waitForTimeout(200);
}
// đọc sổ SAU cùng, để mẫu cuối đúng là lúc đang ép vào tường
epTuong.so = (await soLai()).so;
await anh('05-ep-vat-can');
await pg.keyboard.up('s');
await pg.waitForTimeout(600);
nhatKy.luot.epTuong = epTuong;

await new Promise((ok) => (phim.exitCode !== null ? ok() : phim.on('exit', ok)));

nhatKy.camera = await soMay();
nhatKy.theFps = await pg.evaluate(() => document.getElementById('do-fps')?.textContent ?? null);
await anh('04-thuoc-fps');

/* =============================================================== CHẤM ĐIỂM */
/** Mỗi dòng sổ: `[t ms, dt s, x, z, |v|, facing rad, chặn]`. */
const T = 0, DT = 1, X = 2, Z = 3, V = 4, F = 5, CHAN = 6;

/* --- 1. giữ W: tăng đơn điệu tới ~1,6 rồi giữ, không tụt bậc --- */
{
  const so = giuW.so;
  const dinh = Math.max(...so.map((r) => r[V]));
  // chỉ xét lúc ĐANG giữ phím: bỏ 4 khung cuối (có thể đã sang lượt sau)
  const than = so.slice(2, Math.max(3, so.length - 4));
  let tutToiDa = 0;
  let tutTai = null;
  for (let i = 1; i < than.length; i += 1) {
    const tut = than[i - 1][V] - than[i][V];
    if (tut > tutToiDa) {
      tutToiDa = tut;
      tutTai = than[i][T];
    }
  }
  chot('1-giu-W-toc-do-on-dinh', dinh >= MOC.tocDat, { dinh, soKhung: so.length });
  chot('1-giu-W-khong-tut-bac', tutToiDa <= MOC.tutToiDa, {
    tutToiDa: +tutToiDa.toFixed(4),
    tutTai,
  });
  // không lùi: z phải giảm đơn điệu (đi về −Z)
  const luiNguoc = so.filter((r, i) => i > 0 && r[Z] > so[i - 1][Z] + 1e-4).length;
  chot('1-giu-W-khong-di-lui', luiNguoc === 0, { luiNguoc });
}

/* --- 2. không "chạy bộ tại chỗ": có vận tốc là phải dịch chuyển thật --- */
{
  const lam = (so) => {
    let xau = 0;
    for (let i = 1; i < so.length; i += 1) {
      const v = so[i][V];
      if (v <= MOC.nguongDung) continue;
      const di = Math.hypot(so[i][X] - so[i - 1][X], so[i][Z] - so[i - 1][Z]);
      const cho = v * so[i][DT];
      // cho phép 25 % hao do trượt dọc vật cản; 0 m thì chắc chắn là tật cũ
      if (di < cho * 0.25) xau += 1;
    }
    return xau;
  };
  const xau = lam(giuW.so) + lam(doiHuong.so);
  chot('2-khong-chay-bo-tai-cho', xau === 0, { khungXau: xau });
}

/* --- 3. đổi hướng: tốc độ góc có trần, không lật tức thì --- */
{
  const so = doiHuong.so;
  let tocMax = 0;
  for (let i = 1; i < so.length; i += 1) {
    let d = (so[i][F] - so[i - 1][F]) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    const dt = so[i][DT];
    if (dt > 0) tocMax = Math.max(tocMax, Math.abs(d) / dt);
  }
  chot('3-doi-huong-khong-lat-tuc-thi', tocMax <= MOC.tocXoayToiDa, {
    tocXoayMax: +tocMax.toFixed(3),
    tran: +MOC.tocXoayToiDa.toFixed(3),
  });
}

/* --- 4a. nhả phím → dừng ≤ 0,35 s (đo bằng đồng hồ) --- */
{
  const so = nhaPhim.so;
  // khung cuối cùng còn nhanh → khung đầu tiên đã dừng hẳn
  let cuoiNhanh = -1;
  for (let i = 0; i < so.length; i += 1) if (so[i][V] > MOC.tocDat * 0.6) cuoiNhanh = i;
  let dungTai = -1;
  for (let i = cuoiNhanh + 1; i < so.length; i += 1) {
    if (so[i][V] === 0) {
      dungTai = i;
      break;
    }
  }
  const giay = dungTai > 0 ? (so[dungTai][T] - so[cuoiNhanh][T]) / 1000 : null;
  // một khung của MÁY NÀY, đo từ chính sổ (không giả định 60 FPS)
  const dtKhung = so.length > 1 ? (so.at(-1)[T] - so[0][T]) / 1000 / (so.length - 1) : 1 / 60;
  const tran = MOC.giayDung + MOC.khungDung * dtKhung;
  chot('4a-nha-phim-dung-em', giay !== null && giay <= tran, {
    giay,
    tran: +tran.toFixed(3),
    dtKhung: +dtKhung.toFixed(4),
    vCuoi: so.at(-1)?.[V] ?? null,
    soKhung: so.length,
  });
}

/* --- 4b. ẩn tab giữa lúc giữ phím → dừng, KHÔNG đi mãi --- */
{
  /**
   * Ở đây **không đo bằng giây** như 4a, và đó là cố ý: tab bị ẩn thì
   * `requestAnimationFrame` đóng băng, nên sổ chỉ còn vài khung và hiệu hai
   * mốc `performance.now()` không còn nghĩa "nhanh/chậm" nào cả. Giao kèo thật
   * ở mục này là **không đi mãi**: vận tốc phải về 0 và quãng đi thêm sau lúc
   * ẩn tab phải không đáng kể.
   */
  const so = anTab.so;
  const vCuoi = so.at(-1)?.[V] ?? null;
  let dinh = -1;
  for (let i = 0; i < so.length; i += 1) if (so[i][V] > so[Math.max(0, dinh)][V]) dinh = i;
  const diThem =
    dinh >= 0 && so.length > dinh
      ? Math.hypot(so.at(-1)[X] - so[dinh][X], so.at(-1)[Z] - so[dinh][Z])
      : null;
  // 1,6 m/s × (0,35 s phanh + 1 khung) < 0,45 m: quá số này là "đi mãi"
  chot('4b-an-tab-dung-khong-di-mai', vCuoi === 0 && diThem !== null && diThem <= 0.45, {
    vCuoi,
    diThem: diThem === null ? null : +diThem.toFixed(4),
    soKhung: so.length,
  });
}

/* --- 7. ép vào vật cản mà VẪN giữ phím: dừng thật, không "chạy bộ tại chỗ" --- */
{
  const so = epTuong.so;
  const duoi = so.slice(-10);
  const vCuoi = so.at(-1)?.[V] ?? null;
  const nhich = Math.max(...duoi.map((r) => Math.abs(r[Z] - duoi[0][Z])));
  // độ cao hông: nhún thân là `position.y = |sin(phaBuoc)|·0,022` → dao động
  // tới 2,2 cm. Đứng im thật thì ba mẫu cách nhau 200 ms phải TRÙNG nhau.
  const bienHong = Math.max(...epTuong.hongY) - Math.min(...epTuong.hongY);
  // phải THẬT SỰ có chạm (cờ `chặn` ≠ 0) — nếu không thì mục này đang đo một
  // lượt đi trong chỗ trống và "đạt" một cách vô nghĩa, đúng lỗi của vòng đầu
  const daCham = so.some((r) => r[CHAN] !== 0);
  chot('7-ep-vat-can-dung-that', daCham && vCuoi === 0 && nhich < 1e-3, {
    daCham,
    vCuoi,
    nhich: +nhich.toFixed(5),
    soKhung: so.length,
  });
  chot('7-ep-vat-can-state-idle', epTuong.state === 'idle', { state: epTuong.state });
  chot('7-ep-vat-can-khong-nhun', bienHong < 1e-3, {
    bienHong: +bienHong.toFixed(5),
    hongY: epTuong.hongY,
  });
}

/* --- 5. camera bám: không rung (không đổi chiều liên tiếp) --- */
{
  const so = nhatKy.camera ?? [];
  let doiChieu = 0;
  for (let i = 2; i < so.length; i += 1) {
    const a = so[i - 1][2] - so[i - 2][2];
    const b = so[i][2] - so[i - 1][2];
    // chỉ tính đổi chiều THẬT (biên độ > 1 mm), bỏ nhiễu số học lúc gần đích
    if (a * b < 0 && Math.abs(a) > 1e-3 && Math.abs(b) > 1e-3) doiChieu += 1;
  }
  chot('5-camera-khong-rung', doiChieu <= MOC.doiChieu, { doiChieu, soKhung: so.length });
}

/* --- 6. console sạch + thước FPS chốt được số thật --- */
/**
 * Bỏ tiếng ồn của **bridge chưa chạy**: script này KHÔNG được bật bridge thật
 * của Boss (cổng 8787/8790 là stack đang chạy trên máy Sếp — chỉ Sếp mới được
 * khởi động lại). Thiếu bridge thì app vẫn phải diễn được, và chính nó ghi
 * "không kết nối được" ra console. Lọc theo HOST + đường dẫn, không lọc theo
 * chữ "Error", để một lỗi thật vẫn không lọt qua.
 */
const ON_BRIDGE = /(127\.0\.0\.1:8787|localhost:879\d|\/stt\/|\/tts\/|role=stage)/;
const loiThat = nhatKy.loiConsole.filter((t) => !ON_BRIDGE.test(t));
nhatKy.loiBoQua = nhatKy.loiConsole.filter((t) => ON_BRIDGE.test(t)).length;
chot('6-console-sach', loiThat.length === 0, {
  loi: loiThat.slice(0, 5),
  boQuaBridge: nhatKy.loiBoQua,
});
{
  const t = nhatKy.theFps ?? '';
  const m = /FPS trung bình\s+([\d.]+)/.exec(t);
  const fps = m ? Number(m[1]) : null;
  const coNaN = /NaN/.test(t);
  const coKhung = /khung đếm được\s+\d+/.test(t);
  chot('6-thuoc-fps-khong-bia-so', fps !== null && !coNaN && coKhung, { fps, coNaN, coKhung });
  nhatKy.fps = fps;
}

/* ------------------------------------------------------- bảng cho người đọc */
{
  const so = giuW.so.slice(0, 60);
  const dong = so.map((r, i) =>
    [
      String(i).padStart(3),
      ((r[T] - so[0][T]) / 1000).toFixed(3).padStart(7),
      (r[DT] * 1000).toFixed(1).padStart(6),
      r[X].toFixed(3).padStart(8),
      r[Z].toFixed(3).padStart(8),
      r[V].toFixed(3).padStart(7),
      ((r[F] * 180) / Math.PI).toFixed(1).padStart(7),
      String(r[CHAN]).padStart(2),
    ].join(' '),
  );
  writeFileSync(
    `${THU_MUC}/bang-giu-W.txt`,
    'F2 (#56 mục 2) — GIỮ PHÍM W trên Firefox + GPU THẬT\n' +
      `FPS trong app: ${nhatKy.fps ?? '?'}   (sổ do chính sân khấu ghi mỗi khung)\n\n` +
      '  #       t   dt_ms        x        z     |v|  facing ch\n' +
      '--- ------- ------- -------- -------- ------- ------- --\n' +
      dong.join('\n') +
      '\n\nch = cờ chặn va chạm (1 = trục X, 2 = trục Z, 0 = thông thoáng)\n',
  );
}

writeFileSync(`${THU_MUC}/nhat-ky-kiem-f2.json`, JSON.stringify(nhatKy, null, 1));
await ctx.close();
await br.close();
server?.kill('SIGTERM');

console.log(`\nFPS trong app: ${nhatKy.fps}`);
for (const [k, v] of Object.entries(nhatKy.dat)) {
  console.log(`${v.dat ? '✓' : '✗'} ${k}  ${JSON.stringify({ ...v, dat: undefined })}`);
}
if (loi.length) {
  console.error(`\n⛔ ${loi.length} mục KHÔNG đạt:\n  ` + loi.join('\n  ') + '\n');
  process.exit(1);
}
writeFileSync(CO_KHOA, new Date().toISOString() + '\n');
console.log(`\n✓ F2 đạt. Bằng chứng: ${THU_MUC}/\n`);
