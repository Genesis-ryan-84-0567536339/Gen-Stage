/**
 * kiem-g1-vong3.mjs — bằng chứng cho HAI MỤC CHẶN của review PR #70 (G1, #56).
 *
 * Firefox THẬT (playwright `firefox-1543`, `headless:false`, GPU thật), cổng
 * riêng 5451/5452 — không đụng 5173 hay 8787–8790 của Boss.
 *
 * Hai bảng, hai thước ĐỘC LẬP với code vừa sửa:
 *
 *  1. **BẢNG ĐẾ GIÀY** — không dùng `deChan`/`deGiayY` của sân khấu. Lấy
 *     `WebGLRenderer` qua hook `__THREE_DEVTOOLS__`, bọc `render()` để bắt
 *     `scene` thật, rồi **tự quét đỉnh mọi `SkinnedMesh`** (`getVertexPosition`
 *     + `matrixWorld`) mỗi lần lấy mẫu: nhận đỉnh nằm trong bán kính 0,25 m
 *     quanh một xương bàn chân (toạ độ xương lấy từ `doXuong`, không phải mốc
 *     đế) và không cao hơn xương bàn chân quá 6 cm, lấy `y` nhỏ nhất. Đo cho
 *     đứng · đi · ngồi `ghe-1`/`ghe-2`/`sofa` · đứng lên.
 *
 *  2. **BẢNG LỆCH TÓC** — lấy mẫu **mỗi 100 ms trong 2 s** ngay từ lúc gọi
 *     `actor.emote` (`rat-vui`, `buon`, `ngac-nhien`), không phải một mẫu ở
 *     1,2 s như vòng trước. Kèm thời gian khung hình thật để thấy máy đang
 *     chạy khung bao nhiêu ms lúc đo.
 *
 * Ra `docs/g1/`: `bang-vong3.txt`, `nhat-ky-vong3.json`, `vong3-*.jpg`.
 */
import { firefox } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const THU_MUC = 'docs/g1';
mkdirSync(THU_MUC, { recursive: true });

const MOC = {
  /** Đứng/đi/emote: đế giày sát mặt sàn (m). */
  leDung: 0.01,
  /** Ngồi: đế giày sát mặt sàn (m) — mốc Boss ±2 cm. */
  leNgoi: 0.02,
  /** Lệch tóc tối đa, MỌI mẫu suốt emote (m) — mốc Boss. */
  lechToc: 0.07,
};
/** `--emote=a,b` = chỉ đo bấy nhiêu emote (vòng kiểm lại, khỏi mở Firefox nhiều lần). */
const XIN_EMOTE = (process.argv.find((a) => a.startsWith('--emote=')) ?? '').slice(8);
const EMOTE = XIN_EMOTE
  ? XIN_EMOTE.split(',').filter(Boolean)
  : ['rat-vui', 'buon', 'ngac-nhien'];
const GHE = ['ghe-1', 'ghe-2', 'sofa'];
/**
 * `--dev` = chạy trên dev server (khung hình dài hơn hẳn: 150–340 ms trên
 * Firefox + nouveau) thay vì bản build. Hai lượt cho hai hoàn cảnh, file bằng
 * chứng tách riêng.
 */
const DEV = process.argv.includes('--dev');
/**
 * `--tai` = **kéo dài khung hình có chủ ý** (chặn luồng chính ~250 ms mỗi khung
 * thứ hai) trong lúc đo tóc. Đây đúng hoàn cảnh làm vỡ bản vòng 2: khung hình
 * 129–338 ms trên Firefox + nouveau. Để bằng chứng không phụ thuộc hôm nay máy
 * có khựng hay không, ta tự tạo ra nó.
 */
const TAI = process.argv.includes('--tai');
const PORT = DEV ? 5452 : 5451;
const HAU = `${DEV ? '-dev' : ''}${TAI ? '-tai' : ''}`;

const server = spawn(
  'npx',
  DEV
    ? ['vite', '--port', String(PORT), '--strictPort']
    : ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
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
console.log(`${DEV ? 'dev' : 'preview'}: ${url} (pid ${server.pid})`);

const nhatKy = {
  khi: new Date().toISOString(),
  che: DEV ? 'dev' : 'preview',
  moc: MOC,
  tai: TAI,
  de: {},
  toc: {},
  dat: {},
  loiConsole: [],
};
const loi = [];
const chot = (ten, dat, chiTiet) => {
  nhatKy.dat[ten] = { dat, ...chiTiet };
  if (!dat) loi.push(`${ten}: ${JSON.stringify(chiTiet)}`);
};

const br = await firefox.launch({
  headless: process.env.HL === '1',
  env: { ...process.env, MOZ_ENABLE_WAYLAND: '0', MOZ_X11_EGL: '0' },
});
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();

/* ---- THƯỚC ĐỘC LẬP: bắt renderer trước khi trang chạy, rồi bắt scene ---- */
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

await pg.addStyleTag({
  content:
    '#bang,#hud,#toast,#loading,#o-chat,#goi-y-phim,#nut-tieng,#o-noi-nhanh{display:none!important}',
});

const doDe = async (nhan, actor) => {
  const m = await pg.evaluate((a) => window.__GS_DE(a), actor);
  nhatKy.de[`${nhan}/${actor}`] = m;
  console.log(
    `${nhan.padEnd(14)} ${actor.padEnd(5)} đế THẬT=${m?.deGiayThat} ` +
      `(PR báo ${m?.pr.deGiayY}) đỉnh nhận=${m?.soNhan}`,
  );
  return m;
};

/* cảnh thật chỉ bắt được ở lượt render kế tiếp — chờ nó rồi mới đo */
await pg.waitForFunction(() => !!window.__GS_SCENE, null, { timeout: 30000 });

/* ------------------------------------------------- 1. ĐỨNG (owner + gen) */
for (const ai of ['owner', 'gen']) {
  const m = await doDe('dung', ai);
  chot(
    `de/dung/${ai}`,
    m !== null && m.deGiayThat !== null && m.soNhan > 0 && Math.abs(m.deGiayThat) <= MOC.leDung,
    m,
  );
}

/* ------------------------------------------------- 2. ĐI (giữ W ~2 s) */
await chayLenh('actor.steer', { actor: 'owner', vx: 0, vz: -1.6, ms: 2200 });
const diMau = [];
for (let i = 0; i < 12; i += 1) {
  await pg.waitForTimeout(150);
  const m = await pg.evaluate(() => window.__GS_DE('owner'));
  if (m) diMau.push(m.soNhan > 0 ? m.deGiayThat : null);
}
nhatKy.de['di/owner/mau'] = diMau;
const diXau = diMau.filter((y) => y === null || Math.abs(y) > MOC.leDung);
chot('de/di/owner', diMau.length >= 10 && diXau.length === 0, {
  soMau: diMau.length,
  min: Math.min(...diMau.filter((y) => y !== null)),
  max: Math.max(...diMau.filter((y) => y !== null)),
  xau: diXau.slice(0, 5),
});
await pg.waitForTimeout(1500);

/* ------------------------------------------------- 3. NGỒI 3 chỗ + ĐỨNG LÊN */
for (const ghe of GHE) {
  await chayLenh('actor.sit', { actor: 'owner', seat: ghe });
  await pg
    .waitForFunction(() => window.stage.doXuong('owner').dangNgoiCo === true, null, {
      timeout: 30000,
      polling: 300,
    })
    .catch(() => {});
  await pg.waitForTimeout(2200);
  const m = await doDe(`ngoi-${ghe}`, 'owner');
  const seatY = await pg.evaluate(() => window.stage.doXuong('owner').seatY);
  chot(
    `de/ngoi/${ghe}`,
    m !== null && m.deGiayThat !== null && m.soNhan > 0 && Math.abs(m.deGiayThat) <= MOC.leNgoi,
    { ...m, seatY },
  );

  // ảnh: máy ngang sàn, nhìn thẳng vào đôi giày
  await pg.evaluate(() => {
    const d = window.stage.doXuong('owner');
    const [x, , z] = d.hips;
    window.stage.datMay([x + 1.1, 0.14, z + 1.1], [x, 0.06, z]);
  });
  await pg.waitForTimeout(600);
  await pg.screenshot({ path: `${THU_MUC}/vong3${HAU}-ngoi-${ghe}.png` });

  await chayLenh('actor.stand', { actor: 'owner' });
  await pg
    .waitForFunction(() => window.stage.doXuong('owner').dangNgoiCo === false, null, {
      timeout: 20000,
      polling: 300,
    })
    .catch(() => {});
  await pg.waitForTimeout(1600);
  const s = await doDe(`dung-len-sau-${ghe}`, 'owner');
  chot(
    `de/dung-len/${ghe}`,
    s !== null && s.deGiayThat !== null && s.soNhan > 0 && Math.abs(s.deGiayThat) <= MOC.leDung,
    s,
  );
}

/* ------------------------------------------------- 4. TÓC: 100 ms × 2 s */
await pg.evaluate(() => window.stage.run('camera.preset', { name: 'toan-canh' }));
await pg.waitForTimeout(1200);

if (TAI) {
  await pg.evaluate(() => {
    let n = 0;
    const keo = () => {
      n += 1;
      if (n % 2 === 0) {
        const t = performance.now();
        while (performance.now() - t < 250) {
          /* chặn luồng chính: y như một khung hình nouveau khựng */
        }
      }
      requestAnimationFrame(keo);
    };
    requestAnimationFrame(keo);
  });
  console.log('đã bật TẢI: chặn luồng chính ~250 ms mỗi khung thứ hai');
}

for (const em of EMOTE) {
  // dồn mẫu TRONG trang: ra/vào playwright mỗi 100 ms tự nó đã là 1 khung hình
  const mau = await pg.evaluate(
    async ([ten]) => {
      const ds = [];
      let nenGiua = null;
      let clipGiua = null;
      let trangThaiGiua = null;
      const t0 = performance.now();
      const k0 = window.__GS_KHUNG.length;
      // Giải phóng thân trước: nếu phản xạ xã hội đang chiếm actor thì
      // `actor.emote` bị XẾP HÀNG, 2 s đo được là 2 s đứng yên.
      await window.stage.run('actor.interrupt', { actor: 'gen' }).catch(() => {});
      const chay = window.stage
        .run('actor.emote', { actor: 'gen', emote: ten })
        .then((r) => r, (e) => ({ error: String(e) }));
      /*
       * Lấy mẫu bằng `doToc` (chỉ đi qua khớp spring), KHÔNG bằng `doXuong`:
       * `doXuong` kèm `Box3.setFromObject(…, true)` nên một mẫu tốn ~140 ms —
       * đòi 100 ms mà thực ra 240 ms một mẫu, và chính nó kéo FPS.
       * Hẹn theo MỐC TUYỆT ĐỐI để trễ của một mẫu không dồn sang mẫu sau.
       */
      for (let i = 0; i < 21; i += 1) {
        const hen = t0 + i * 100;
        const cho = hen - performance.now();
        if (cho > 0) await new Promise((r) => setTimeout(r, cho));
        const toc = window.stage.doToc('gen');
        ds.push({
          t: Math.round(performance.now() - t0),
          lechToc: toc.lechToc,
          xaDauNhat: toc.xaDauNhat,
          lechVay: toc.lechVay,
          soHamCat: toc.soHamCat,
        });
        // GIỮA emote (t ≈ 400 ms) mới đọc dáng nền: đọc ở cuối thì emote đã
        // tan và luôn ra `idle`, chẳng chứng minh được gì.
        if (i === 4) {
          const g = window.stage.doXuong('gen');
          nenGiua = g.dangNen;
          clipGiua = g.clipThat;
          trangThaiGiua = g.state;
        }
      }
      const khung = window.__GS_KHUNG.slice(k0);
      const d = window.stage.doXuong('gen');
      return {
        ds,
        khung,
        // bằng chứng nhịp cố định chạy đúng đồng hồ
        buocSpring: d.soBuocSpring,
        // bằng chứng ĐANG diễn clip CC0 thật (rat-vui → `nhay`), không phải
        // lớp thủ tục dự phòng — nếu rơi về dự phòng thì thân cử động ít hẳn
        // và bảng lệch tóc này không nói lên điều gì
        dangNen: nenGiua,
        clipThat: clipGiua,
        trangThai: trangThaiGiua,
        ketQua: await chay,
        spring: window.stage.doToc('gen').spring,
        soKhopHam: window.stage.doToc('gen').soKhopHam,
        mocDaOnDinh: window.stage.doToc('gen').mocDaOnDinh,
      };
    },
    [em],
  );
  nhatKy.toc[em] = mau;
  const dinh = Math.max(...mau.ds.map((x) => x.lechToc));
  const khungMax = mau.khung.length ? Math.max(...mau.khung) : 0;
  const buoc = mau.buocSpring ?? 0;
  console.log(
    `emote ${em.padEnd(11)} đỉnh lệchTóc=${dinh.toFixed(4)} m · khung dài nhất=${khungMax} ms · ` +
      `bước spring=${buoc} · nền=${mau.dangNen} · hãm cắt tối đa=${Math.max(
        ...mau.ds.map((x) => x.soHamCat ?? 0),
      )}/${mau.soKhopHam ?? '?'} xương`,
  );
  // Bảng tóc chỉ có nghĩa nếu emote THẬT SỰ đang diễn giữa cửa sổ đo
  // thước chỉ đúng nghĩa khi mốc tóc đã đóng lại ở dáng cân bằng
  chot(`toc/${em}/moc-da-on-dinh`, mau.mocDaOnDinh === true, {
    mocDaOnDinh: mau.mocDaOnDinh,
  });
  /*
   * Bảng tóc chỉ có nghĩa nếu emote THẬT SỰ đang diễn giữa cửa sổ đo. Dáng nền
   * `idle` KHÔNG phải lỗi: `NEN_EMOTE.buon` là `idle` theo đúng bảng (phần
   * nghiêng người do lớp cử chỉ lo) — chấm bằng `state` và `clipThat`.
   */
  chot(
    `toc/${em}/dang-dien-that`,
    mau.clipThat === true && mau.trangThai === 'emoting' && !!mau.dangNen,
    { dangNen: mau.dangNen, clipThat: mau.clipThat, trangThai: mau.trangThai },
  );
  chot(`toc/${em}`, dinh <= MOC.lechToc, {
    dinhLechToc: +dinh.toFixed(4),
    moc: MOC.lechToc,
    khungDaiNhatMs: khungMax,
    buocSpringToiDa: buoc,
    mau: mau.ds,
  });
  await pg.waitForTimeout(1500);
}

/* ảnh tóc + toàn cảnh */
await pg.evaluate(() => {
  const d = window.stage.doXuong('gen');
  const [x, y, z] = d.head;
  window.stage.datMay([x + 1.0, y + 0.25, z + 1.0], [x, y - 0.15, z]);
});
await pg.evaluate(() => window.stage.run('actor.emote', { actor: 'gen', emote: 'rat-vui' }));
await pg.waitForTimeout(250);
await pg.screenshot({ path: `${THU_MUC}/vong3${HAU}-toc-rat-vui.png` });
await pg.evaluate(() => window.stage.run('camera.preset', { name: 'toan-canh' }));
await pg.waitForTimeout(1200);
await pg.screenshot({ path: `${THU_MUC}/vong3${HAU}-toan-canh.png` });

/* spring không được chạy trong vrm.update (điểm mong manh 1) */
const sp = await pg.evaluate(() => ({
  owner: window.stage.doXuong('owner').springTrongUpdate,
  gen: window.stage.doXuong('gen').springTrongUpdate,
}));
nhatKy.springTrongUpdate = sp;
chot('spring-khong-chay-trong-vrm-update', sp.owner === 0 && sp.gen === 0, sp);

const ON_BRIDGE = /(127\.0\.0\.1:8787|localhost:879\d|\/stt\/|\/tts\/|role=stage)/;
const loiThat = nhatKy.loiConsole.filter((t) => !ON_BRIDGE.test(t));
chot('console-sach', loiThat.length === 0, { loi: loiThat.slice(0, 5) });

await ctx.close();
await br.close();
server.kill('SIGTERM');

/* ------------------------------------------------------------ bảng ra file */
const bangDe = Object.entries(nhatKy.de)
  .filter(([, m]) => m && m.deGiayThat !== undefined)
  .map(([k, m]) =>
    [
      k.padEnd(24),
      String(m.deGiayThat).padStart(9),
      String(m.pr.deGiayY).padStart(9),
      String(m.xuongChanY).padStart(9),
      String(m.pr.deChanTuThe).padStart(8),
      String(m.soNhan).padStart(7),
    ].join(' '),
  )
  .join('\n');

const bangToc = EMOTE.map((em) => {
  const d = nhatKy.toc[em]?.ds ?? [];
  return (
    `${em}\n` +
    d.map((x) => `  ${String(x.t).padStart(4)} ms  lệchTóc ${x.lechToc.toFixed(4)}  xaĐầuNhất ${x.xaDauNhat}`).join('\n')
  );
}).join('\n\n');

writeFileSync(
  `${THU_MUC}/bang-vong3${HAU}.txt`,
  `G1 vòng 3 (#56) — review PR #70, hai mục CHẶN. Firefox thật ` +
    `(${DEV ? 'dev' : 'bản build'}${TAI ? ', CÓ TẢI: chặn luồng chính 250 ms mỗi khung thứ hai' : ''}), sàn y = 0.\n\n` +
    'BẢNG 1 — ĐẾ GIÀY đo bằng QUÉT ĐỈNH MESH (world space), độc lập với deChan\n\n' +
    'trạng thái/ai            đếTHẬT   PRbáo   xươngChân  mốcTưThế  đỉnhNhận\n' +
    '------------------------ --------- --------- --------- -------- -------\n' +
    bangDe +
    `\n\nĐạt = |đế THẬT| ≤ ${MOC.leDung} m khi đứng/đi, ≤ ${MOC.leNgoi} m khi ngồi.\n` +
    '"PRbáo" là `doXuong().deGiayY` — in ra chỉ để đối chiếu, KHÔNG dùng để chấm.\n\n' +
    `BẢNG 2 — LỆCH TÓC mỗi 100 ms suốt 2 s từ lúc gọi emote (mốc ≤ ${MOC.lechToc} m)\n\n` +
    bangToc +
    '\n',
);
writeFileSync(`${THU_MUC}/nhat-ky-vong3${HAU}.json`, JSON.stringify(nhatKy, null, 1));

for (const [k, v] of Object.entries(nhatKy.dat)) if (!v.dat) console.log(`✗ ${k}`);
console.log(
  `\n${Object.values(nhatKy.dat).filter((v) => v.dat).length}/${Object.keys(nhatKy.dat).length} mục đạt`,
);
if (loi.length) {
  console.error(`\n⛔ ${loi.length} mục KHÔNG đạt\n${loi.join('\n')}\n`);
  process.exit(1);
}
console.log(`\n✓ Hai mục CHẶN đạt. Bằng chứng: ${THU_MUC}/bang-vong3${HAU}.txt\n`);
