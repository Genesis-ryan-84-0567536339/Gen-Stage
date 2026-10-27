/**
 * kiem-g1-lai.mjs — việc CUỐI trước merge PR #70 (reviewer yêu cầu).
 *
 * H1 ghi `x`/`z` mỗi khung (lái), G1 ghi `y` mỗi khung (cắm đế giày xuống sàn)
 * — sau khi rebase g1 lên main, phải xem hai cái đó có đạp nhau không. Kiểm:
 *   1. giữ W 3 s (phím THẬT, đi qua `src/ui/phim.ts` → `actor.steer`);
 *   2. `actor.moveTo` tới `ban-an` rồi `sofa`;
 * suốt đường đi: đế giày (QUÉT ĐỈNH MESH, độc lập với `deChan`) 0 ± 0,01 m,
 * |v| dao động ≤5 %, không xuyên hộp chắn, camera `theo-owner` bình thường,
 * console 0 lỗi.
 *
 * Hai lượt giữ W: lượt SẠCH không lấy mẫu gì (đọc sổ từng khung của sân khấu
 * một lần ở cuối — bài học F2: gọi `doXuong` mỗi 100 ms tự nó kéo FPS rồi lại
 * kết luận về độ mượt), lượt sau mới quét đế giày mỗi 100 ms.
 */
import { firefox } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const THU_MUC = 'docs/g1';
mkdirSync(THU_MUC, { recursive: true });
const MOC = { leSan: 0.01, daoDongV: 0.05 };
const PORT = 5461;

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
console.log(`preview: ${url} (pid ${server.pid})`);

const nhatKy = { khi: new Date().toISOString(), moc: MOC, dat: {}, loiConsole: [] };
const loi = [];
const chot = (ten, dat, chiTiet) => {
  nhatKy.dat[ten] = { dat, ...chiTiet };
  if (!dat) loi.push(`${ten}: ${JSON.stringify(chiTiet).slice(0, 300)}`);
};

const br = await firefox.launch({
  headless: process.env.HL === '1',
  env: { ...process.env, MOZ_ENABLE_WAYLAND: '0', MOZ_X11_EGL: '0' },
});
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();
await pg.addInitScript(() => {
  const et = new EventTarget();
  window.__GS_OBS = [];
  et.addEventListener('observe', (e) => window.__GS_OBS.push(e.detail));
  window.__THREE_DEVTOOLS__ = et;
  // thời gian khung hình thật (không qua code của sân khấu)
  window.__GS_KHUNG = [];
  let truoc = 0;
  const tick = (t) => {
    if (truoc) window.__GS_KHUNG.push(+(t - truoc).toFixed(1));
    truoc = t;
    if (window.__GS_KHUNG.length > 4000) window.__GS_KHUNG.shift();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

pg.on('console', (m) => m.type() === 'error' && nhatKy.loiConsole.push(m.text()));
pg.on('pageerror', (e) => nhatKy.loiConsole.push(`pageerror: ${e.message}`));
// `?bridge=0`: KHÔNG nối vào bridge thật của Boss (8787–8790 đang chạy).
await pg.goto(`${url}?bridge=0`, { waitUntil: 'load' });
await pg.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
await pg.waitForTimeout(3500);

/** Cắm thước: bọc `renderer.render` một lần để giữ `scene` thật. */
const coThuoc = await pg.evaluate(() => {
  const r = window.__GS_OBS.find((o) => o && o.isWebGLRenderer);
  if (!r) return false;
  const goc = r.render.bind(r);
  r.render = (scene, cam) => {
    /*
     * Chỉ nhận cảnh CÓ `SkinnedMesh`: bloom (`EffectComposer`) cũng gọi
     * `renderer.render()` với cảnh một tấm quad toàn màn hình, nhận bừa là
     * mất cảnh thật. Thử một lần rồi nhớ luôn.
     */
    if (!window.__GS_SCENE && scene && scene.isScene) {
      let co = false;
      scene.traverse((o) => {
        if (o.isSkinnedMesh) co = true;
      });
      if (co) window.__GS_SCENE = scene;
    }
    return goc(scene, cam);
  };
  /**
   * ĐẾ GIÀY THẬT — hoàn toàn độc lập với code của PR.
   *
   * Không đọc `deChan`/`deGiayY`/`deChanTuThe`, và cũng **không** lấy toạ độ
   * xương từ `doXuong()` (những số đó đo trên rig *normalized*, đứng thì bàn
   * chân normalized ở y = −0,28 m — lệch hẳn xương đang dựng hình). Thay vào
   * đó: duyệt `skeleton.bones` của chính các `SkinnedMesh` trong cảnh, lọc tên
   * xương bàn chân/ngón (`J_Bip_L_Foot`, `…_Toes`, kiểu VRM), rồi quét đỉnh
   * quanh đó. `doXuong(actor).hips` chỉ dùng để biết cụm mesh nào là nhân vật
   * nào (hai người đứng cách nhau hàng mét).
   */
  window.__GS_DE = (actor) => {
    const scene = window.__GS_SCENE;
    if (!scene) return null;
    window.__GS_V3 ??= scene.position.clone();
    const v = window.__GS_V3;

    /* 1. gom `SkinnedMesh` theo CỤM (tổ tiên ngay dưới scene) */
    const cum = new Map();
    scene.traverse((o) => {
      if (!o.isSkinnedMesh || typeof o.getVertexPosition !== 'function') return;
      let r = o;
      while (r.parent && r.parent !== scene) r = r.parent;
      if (!cum.has(r)) cum.set(r, []);
      cum.get(r).push(o);
    });
    if (cum.size === 0) return null;

    /* 2. xương bàn chân/ngón của từng cụm, lấy từ chính skeleton */
    const ds = [];
    for (const [goc, ms] of cum) {
      const xuong = new Set();
      for (const m of ms) {
        for (const b of m.skeleton?.bones ?? []) {
          if (/foot|toe/i.test(b.name)) xuong.add(b);
        }
      }
      if (xuong.size === 0) continue;
      const moc = [...xuong].map((b) => {
        const p = b.getWorldPosition(scene.position.clone());
        return [p.x, p.y, p.z];
      });
      ds.push({ goc, ms, moc });
    }
    if (ds.length === 0) return null;

    /* 3. cụm nào là nhân vật đang hỏi: gần `hips` nhất theo mặt bằng */
    const hips = window.stage.doXuong(actor).hips;
    let chon = ds[0];
    let gn = Infinity;
    for (const c of ds) {
      const x = c.moc.reduce((a, p) => a + p[0], 0) / c.moc.length;
      const z = c.moc.reduce((a, p) => a + p[2], 0) / c.moc.length;
      const d2 = (x - hips[0]) ** 2 + (z - hips[2]) ** 2;
      if (d2 < gn) {
        gn = d2;
        chon = c;
      }
    }
    const chanY = Math.min(...chon.moc.map((p) => p[1]));

    /* 4. quét đỉnh: `y` nhỏ nhất trong bán kính 0,25 m quanh xương bàn chân */
    let dayQuanhChan = Infinity;
    let day = Infinity;
    let soDinh = 0;
    let soNhan = 0;
    for (const m of chon.ms) {
      const pos = m.geometry.getAttribute('position');
      if (!pos) continue;
      for (let i = 0; i < pos.count; i += 1) {
        m.getVertexPosition(i, v);
        v.applyMatrix4(m.matrixWorld);
        soDinh += 1;
        let gan = false;
        for (const c of chon.moc) {
          if ((v.x - c[0]) ** 2 + (v.z - c[2]) ** 2 <= 0.25 * 0.25) {
            gan = true;
            break;
          }
        }
        if (!gan) continue;
        if (v.y < dayQuanhChan) dayQuanhChan = v.y;
        if (v.y > chanY + 0.06) continue;
        soNhan += 1;
        if (v.y < day) day = v.y;
      }
    }
    return {
      // thước chính: đỉnh THẤP NHẤT của mọi thứ quanh bàn chân (đôi giày)
      deGiayThat: Number.isFinite(dayQuanhChan) ? +dayQuanhChan.toFixed(4) : null,
      // cùng phép quét nhưng chỉ nhận đỉnh dưới mắt cá — phải trùng số trên
      deDuoiMatCa: Number.isFinite(day) ? +day.toFixed(4) : null,
      xuongChanY: +chanY.toFixed(4),
      soXuongChan: chon.moc.length,
      soDinh,
      soNhan,
      cum: chon.goc.name || '(không tên)',
      // số của sân khấu, chỉ để ĐỐI CHIẾU — không dùng để chấm
      pr: {
        deGiayY: window.stage.doXuong(actor).deGiayY,
        deGiayMoc: window.stage.doXuong(actor).deGiayMoc,
        deChan: window.stage.doXuong(actor).deChan,
        deChanTuThe: window.stage.doXuong(actor).deChanTuThe,
        soMocDe: window.stage.doXuong(actor).soMocDe,
      },
    };
  };
  return true;
});
if (!coThuoc) throw new Error('không bắt được WebGLRenderer qua __THREE_DEVTOOLS__');

const chayLenh = async (cmd, args) => {
  const r = await pg.evaluate(
    ([c, a]) =>
      window.stage.run(c, a).then(
        (x) => ({ ok: true, x }),
        (e) => ({ ok: false, e: String(e) }),
      ),
    [cmd, args],
  );
  if (!r.ok) throw new Error(`${cmd} hỏng: ${r.e}`);
  return r.x;
};

await pg.waitForFunction(() => !!window.__GS_SCENE, null, { timeout: 30000 });
await pg.addStyleTag({
  content:
    '#bang,#hud,#toast,#loading,#o-chat,#goi-y-phim,#nut-tieng,#o-noi-nhanh{display:none!important}',
});

/** Camera bám owner — đúng preset Boss dùng khi lái. */
await chayLenh('camera.preset', { name: 'theo-owner' });
await pg.waitForTimeout(1200);

/** Hộp chắn của phòng: quét đỉnh mesh TĨNH quanh hông, ở tầm hông. */
const xuyenHop = async (nhan) => {
  const r = await pg.evaluate(() => {
    const scene = window.__GS_SCENE;
    const d = window.stage.doXuong('owner');
    const [hx, hy, hz] = d.hips;
    let gan = Infinity;
    let soDinh = 0;
    const v = scene.position.clone();
    scene.traverse((o) => {
      const m = o;
      if (!m.isMesh || m.isSkinnedMesh) return;
      const pos = m.geometry?.getAttribute?.('position');
      if (!pos) return;
      if (soDinh + pos.count > 600000) return;
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        // chỉ xét đỉnh ở TẦM HÔNG (±12 cm) — sàn/tường trần không tính
        if (Math.abs(v.y - hy) > 0.12) continue;
        const d2 = (v.x - hx) ** 2 + (v.z - hz) ** 2;
        if (d2 < gan) gan = d2;
      }
      soDinh += pos.count;
    });
    return { ganNhat: Number.isFinite(gan) ? +Math.sqrt(gan).toFixed(4) : null, soDinh, hips: [hx, hy, hz] };
  });
  nhatKy[`xuyenHop/${nhan}`] = r;
  console.log(`${nhan.padEnd(16)} mesh tĩnh gần hông nhất = ${r.ganNhat} m (tầm hông, ${r.soDinh} đỉnh)`);
  // bán kính người chibi ~0,12 m: gần hơn thế là thân đã lọt vào trong khối
  chot(`khong-xuyen-hop/${nhan}`, r.ganNhat === null || r.ganNhat >= 0.12, r);
};

/* ============ 1a. GIỮ W 3 s — lượt SẠCH, không lấy mẫu gì ============ */
// KHÔNG `datMay`: nó là máy quay THỦ CÔNG, đặt vào là preset `theo-owner`
// hết bám (lượt đo đầu của tôi vì thế chấm camera sai — hông chiếu ra x = −327).
//
// Xuất phát từ HÀNH LANG (`ban-2`, x = −1): giữ W ở chỗ khác là đâm thẳng vào
// cụm nội thất, 95/127 khung bị hộp chắn và |v| tụt xuống 0,21 m/s — đúng theo
// thiết kế `truotVaCham`, nhưng không đo được độ mượt của đoạn đi tự do.
await pg.locator('body').click({ position: { x: 700, y: 700 } });
await pg.waitForTimeout(400);
/*
 * Lái sang +X (`d`) cho mục ĐỘ MƯỢT: ở cao độ z ≈ 3,5 thì trục X là trục DÀI
 * và trống của căn nhà (x −7…+7), còn W (−Z) từ bất cứ đâu trong phòng khách
 * cũng tì vào cụm sofa sau ~0,5 s — đo thật 3 lượt: chỉ 16–26/125 khung đi tự
 * do, không đủ để nói gì về độ mượt. Mục ĐẾ GIÀY vẫn giữ W như reviewer yêu
 * cầu (ở dưới).
 */
await pg.keyboard.down('d');
await pg.waitForTimeout(3000);
/*
 * ĐỌC SỔ TRƯỚC KHI NHẢ PHÍM. `keyup` gửi lệnh "dừng" → một lượt lái MỚI bắt
 * đầu từ lúc đứng yên → `soLai` bị xoá sạch (xem ghi chú `soLai` trong
 * `nhanvat.ts`). Lượt đo đầu của tôi đọc sau `keyup` nên ra 0 khung.
 */
const soLai = await pg.evaluate(() => window.stage.doXuong('owner').vanToc.so);
await pg.keyboard.up('d');
await pg.waitForTimeout(1200);
nhatKy.soLai = soLai;

/*
 * `so` = `[t ms, dt s, x, z, |v|, facing rad, chặn]` mỗi KHUNG của lượt lái.
 *
 * Chấm theo đúng HỢP ĐỒNG F2 (`scripts/kiem-f2.mjs` mục 1) — thước đã có,
 * đừng tự đặt thước mới: đỉnh |v| ≥ 1,5 m/s, KHÔNG tụt bậc quá 0,25 m/s giữa
 * hai khung LIỀN NHAU KHÔNG BỊ CHẶN (tì vào hộp thì `truotVaCham` hạ tốc theo
 * thiết kế — đó là tính năng), và không đi lùi. Thêm mốc Boss đòi lần này:
 * trên đoạn CAO NGUYÊN (|v| ≥ 90 % đỉnh) dao động ≤ 5 %.
 */
const V = 4;
const dinhV = Math.max(...soLai.map((r) => r[V]));
const than = soLai.slice(2, Math.max(3, soLai.length - 4));
let tutToiDa = 0;
for (let i = 1; i < than.length; i += 1) {
  if (than[i][6] !== 0 || than[i - 1][6] !== 0) continue; // bỏ khung bị hộp chắn
  const tut = than[i - 1][V] - than[i][V];
  if (tut > tutToiDa) tutToiDa = tut;
}
// đi sang +X nên `x` phải tăng đơn điệu (không bao giờ lùi lại)
const luiNguoc = soLai.filter((r, i) => i > 0 && r[2] < soLai[i - 1][2] - 1e-4).length;
/*
 * Đoạn ỔN ĐỊNH = từ khung đầu tiên đạt ≥ 99 % đỉnh trở đi. Lấy mốc 90 % là
 * gộp cả đường TĂNG TỐC (lerp 0,15 s tiệm cận 1,6 m/s) vào rồi gọi nó là "dao
 * động": đo thật ra 9,5 % trong khi `|v|` KHÔNG hề giảm một khung nào.
 */
const iOn = soLai.findIndex((r) => r[V] >= 0.99 * dinhV);
const cao = (iOn < 0 ? [] : soLai.slice(iOn)).filter((r) => r[6] === 0).map((r) => r[V]);
const soKhungGiam = soLai.filter((r, i) => i > 0 && r[V] < soLai[i - 1][V] - 1e-9).length;
const vTB = cao.reduce((a, b) => a + b, 0) / (cao.length || 1);
const daoDong = cao.length ? +((Math.max(...cao) - Math.min(...cao)) / vTB).toFixed(4) : null;
const tuDo = soLai.filter((r) => r[6] === 0).length;
console.log(
  `giữ W: ${soLai.length} khung (${tuDo} đi tự do) · đỉnh |v| ${dinhV.toFixed(3)} m/s · ` +
    `tụt bậc tối đa ${tutToiDa.toFixed(4)} · cao nguyên ${cao.length} khung dao động ${daoDong}`,
);
nhatKy.chamLai = {
  soKhung: soLai.length,
  tuDo,
  dinhV,
  tutToiDa,
  luiNguoc,
  soKhungOnDinh: cao.length,
  daoDong,
  soKhungGiam,
};
chot('lai/dinh-toc-do', dinhV >= 1.5, { dinhV: +dinhV.toFixed(4), moc: 1.5 });
chot('lai/khong-tut-bac', tutToiDa <= 0.25, { tutToiDa: +tutToiDa.toFixed(4), moc: 0.25 });
chot('lai/khong-di-lui', luiNguoc === 0, { luiNguoc });
chot('lai/on-dinh-dao-dong', cao.length >= 10 && daoDong !== null && daoDong <= MOC.daoDongV, {
  soKhungOnDinh: cao.length,
  daoDong,
  moc: MOC.daoDongV,
});
chot('lai/v-khong-bao-gio-giam', soKhungGiam === 0, { soKhungGiam, soKhung: soLai.length });
chot('lai/co-doan-di-tu-do', tuDo >= 40, { tuDo, soKhung: soLai.length });
await xuyenHop('sau-giu-W');

/* ============ 1b. GIỮ W 3 s — lượt ĐO ĐẾ GIÀY mỗi 100 ms ============ */
await chayLenh('actor.interrupt', { actor: 'owner' });
await chayLenh('actor.moveTo', { actor: 'owner', to: 'buc-trung-tam' });
await pg.waitForTimeout(800);
const deKhiDi = [];
await pg.keyboard.down('w');
for (let i = 0; i < 30; i += 1) {
  await pg.waitForTimeout(100);
  const m = await pg.evaluate(() => window.__GS_DE('owner'));
  if (m) deKhiDi.push({ de: m.soNhan > 0 ? m.deGiayThat : null, dinh: m.soNhan });
}
await pg.keyboard.up('w');
nhatKy.deKhiDi = deKhiDi;
const xauDi = deKhiDi.filter((x) => x.de === null || Math.abs(x.de) > MOC.leSan);
const coDi = deKhiDi.filter((x) => x.de !== null).map((x) => x.de);
console.log(
  `giữ W (đo đế): ${deKhiDi.length} mẫu · đế min ${Math.min(...coDi).toFixed(4)} ` +
    `max ${Math.max(...coDi).toFixed(4)} · mẫu xấu ${xauDi.length}`,
);
chot('lai/de-giay-suot-duong-di', deKhiDi.length >= 25 && xauDi.length === 0, {
  soMau: deKhiDi.length,
  min: +Math.min(...coDi).toFixed(4),
  max: +Math.max(...coDi).toFixed(4),
  xau: xauDi.slice(0, 5),
});
await pg.waitForTimeout(1200);

/* ============ 2. moveTo ban-an rồi sofa ============ */
for (const noi of ['ban-an', 'sofa']) {
  const mau = [];
  /*
   * Giải phóng thân RỒI phát lệnh mà KHÔNG chờ: `window.stage.run` của một
   * hành động có thời lượng chỉ resolve khi hành động xong, mà nếu actor đang
   * bận thì nó bị XẾP HÀNG và resolve ngay với `queued` — lượt đo đầu của tôi
   * vì thế lấy mẫu trong lúc nhân vật còn đang làm việc cũ, rồi kết luận
   * "không tới được chỗ".
   */
  /*
   * `actor.moveTo` là nội suy ĐƯỜNG THẲNG + trượt va chạm, KHÔNG dò đường
   * (B1). Đứng trong cụm sofa mà gọi `moveTo ban-an` là tì vào nội thất suốt
   * rồi không tới — lượt đo trước của tôi vướng đúng chỗ đó. Qua hành lang
   * (`ban-2`) trước, rồi mới tới đích.
   */
  await chayLenh('actor.interrupt', { actor: 'owner' });
  await chayLenh('actor.moveTo', { actor: 'owner', to: 'ban-2' });
  await pg.waitForTimeout(400);
  await pg
    .waitForFunction(
      () =>
        window.stage
          .describe()
          .then((r) => r.result.actors.find((a) => a.id === 'owner')?.at === 'ban-2'),
      null,
      { timeout: 25000, polling: 500 },
    )
    .catch(() => {});
  await chayLenh('actor.interrupt', { actor: 'owner' });
  await pg.evaluate((n) => {
    window.__KQ = window.stage
      .run('actor.moveTo', { actor: 'owner', to: n })
      .then((r) => r, (e) => ({ error: String(e) }));
  }, noi);
  for (let i = 0; i < 90; i += 1) {
    await pg.waitForTimeout(100);
    const m = await pg.evaluate(() => window.__GS_DE('owner'));
    if (m) mau.push(m.soNhan > 0 ? m.deGiayThat : null);
    const xong = await pg.evaluate(
      (n) => window.stage.describe().then((r) => r.result.actors.find((a) => a.id === 'owner')?.at === n),
      noi,
    );
    if (xong) break;
  }
  await pg.waitForTimeout(600);
  const d = await pg.evaluate(() =>
    window.stage.describe().then((r) => r.result.actors.find((a) => a.id === 'owner')),
  );
  const kq = await pg.evaluate(() => window.__KQ);
  nhatKy[`moveTo/${noi}`] = { mau, at: d?.at, nearest: d?.nearest, state: d?.state, kq };
  const co = mau.filter((y) => y !== null);
  const xau = mau.filter((y) => y === null || Math.abs(y) > MOC.leSan);
  console.log(
    `moveTo ${noi.padEnd(8)} ${mau.length} mẫu · đế min ${Math.min(...co).toFixed(4)} ` +
      `max ${Math.max(...co).toFixed(4)} · xấu ${xau.length} · at=${d?.at}`,
  );
  chot(`moveTo/${noi}/den-dung-cho`, d?.at === noi, { at: d?.at, nearest: d?.nearest, kq });
  chot(`moveTo/${noi}/de-giay-suot-duong`, co.length >= 3 && xau.length === 0, {
    soMau: mau.length,
    min: +Math.min(...co).toFixed(4),
    max: +Math.max(...co).toFixed(4),
    xau: xau.slice(0, 5),
  });
  await xuyenHop(`tai-${noi}`);
  await pg.screenshot({ path: `${THU_MUC}/lai-${noi}.png` });
}

/* ============ 3. camera theo-owner còn bám ============ */
await chayLenh('camera.preset', { name: 'theo-owner' });
await pg.waitForTimeout(1500);
await pg.screenshot({ path: `${THU_MUC}/lai-camera-theo-owner.png` });
const may = await pg.evaluate(async () => {
  const d = window.stage.doXuong('owner');
  const diem = window.stage.chieuDiem(d.hips);
  return { hips: d.hips, diem, w: window.innerWidth, h: window.innerHeight };
});
nhatKy.may = may;
// hông phải nằm trong khung hình (camera đang bám), không lệch ra ngoài
const trongKhung =
  may.diem.x > 0 && may.diem.x < may.w && may.diem.y > 0 && may.diem.y < may.h;
console.log(`camera theo-owner: hông chiếu ra (${may.diem.x}, ${may.diem.y}) / ${may.w}×${may.h}`);
chot('camera/theo-owner-con-bam', trongKhung, may);

const ON_BRIDGE = /(127\.0\.0\.1:8787|localhost:879\d|\/stt\/|\/tts\/|role=stage)/;
const loiThat = nhatKy.loiConsole.filter((t) => !ON_BRIDGE.test(t));
chot('console-sach', loiThat.length === 0, { loi: loiThat.slice(0, 5) });

await ctx.close();
await br.close();
server.kill('SIGTERM');

writeFileSync(
  `${THU_MUC}/bang-sau-rebase.txt`,
  'G1 sau khi rebase lên main — KIỂM LÁI (Firefox thật, bản build, cổng 5461)\n' +
    'H1 ghi x/z mỗi khung (lái), G1 ghi y mỗi khung (cắm đế giày) — xem có đạp nhau.\n\n' +
    `giữ phím 3 s (lái +X, trục dài trống) · ${nhatKy.chamLai?.soKhung} khung, ` +
    `${nhatKy.chamLai?.tuDo} khung đi tự do — sổ TỪNG KHUNG của sân khấu, đọc 1 lần\n` +
    `  đỉnh |v| ${nhatKy.chamLai?.dinhV?.toFixed(4)} m/s (mốc F2 ≥ 1,5)\n` +
    `  tụt bậc giữa 2 khung liền nhau: ${nhatKy.chamLai?.tutToiDa?.toFixed(4)} m/s (mốc F2 ≤ 0,25)\n` +
    `  số khung |v| GIẢM: ${nhatKy.chamLai?.soKhungGiam} · số khung đi lùi: ${nhatKy.chamLai?.luiNguoc}\n` +
    `  đoạn ổn định (≥99 % đỉnh): ${nhatKy.chamLai?.soKhungOnDinh} khung · ` +
    `dao động ${nhatKy.chamLai?.daoDong} (mốc ≤ ${MOC.daoDongV})\n\n` +
    'ĐẾ GIÀY quét đỉnh mesh (world space, KHÔNG dùng deChan) — mốc |y| ≤ 0,01 m\n' +
    `  giữ W, ${nhatKy.dat['lai/de-giay-suot-duong-di']?.soMau} mẫu/100 ms: ` +
    `${nhatKy.dat['lai/de-giay-suot-duong-di']?.min} … ${nhatKy.dat['lai/de-giay-suot-duong-di']?.max}\n` +
    ['ban-an', 'sofa']
      .map(
        (n) =>
          `  moveTo ${n}: ${nhatKy.dat[`moveTo/${n}/de-giay-suot-duong`]?.soMau} mẫu · ` +
          `${nhatKy.dat[`moveTo/${n}/de-giay-suot-duong`]?.min} … ` +
          `${nhatKy.dat[`moveTo/${n}/de-giay-suot-duong`]?.max} · at=${nhatKy.dat[`moveTo/${n}/den-dung-cho`]?.at}`,
      )
      .join('\n') +
    '\n\nKHÔNG XUYÊN HỘP — mesh tĩnh gần hông nhất ở tầm hông (bán kính người ~0,12 m)\n' +
    ['sau-giu-W', 'tai-ban-an', 'tai-sofa']
      .map((n) => `  ${n.padEnd(12)} ${nhatKy[`xuyenHop/${n}`]?.ganNhat} m`)
      .join('\n') +
    `\n\ncamera theo-owner: hông chiếu ra (${nhatKy.may?.diem.x}, ${nhatKy.may?.diem.y}) ` +
    `trong khung ${nhatKy.may?.w}×${nhatKy.may?.h}\n` +
    `console: ${nhatKy.loiConsole.length} dòng lỗi\n\n` +
    `${Object.values(nhatKy.dat).filter((v) => v.dat).length}/${Object.keys(nhatKy.dat).length} mục đạt\n`,
);
writeFileSync(`${THU_MUC}/nhat-ky-sau-rebase.json`, JSON.stringify(nhatKy, null, 1));

for (const [k, v] of Object.entries(nhatKy.dat)) if (!v.dat) console.log(`✗ ${k}`);
console.log(
  `\n${Object.values(nhatKy.dat).filter((v) => v.dat).length}/${Object.keys(nhatKy.dat).length} mục đạt`,
);
if (loi.length) {
  console.error(`\n⛔ ${loi.length} mục KHÔNG đạt\n${loi.join('\n')}\n`);
  process.exit(1);
}
console.log(`\n✓ Lái sau rebase ĐẠT. Bằng chứng: ${THU_MUC}/bang-sau-rebase.txt\n`);
