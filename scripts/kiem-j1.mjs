/**
 * kiem-j1.mjs — bằng chứng J1 (Issue #78) trên **Firefox THẬT**.
 *
 * Boss 27/10: *"nội thất nên thiết kế sát tường để chừa không gian giữa để
 * hoạt động… chỉnh lại tóc của các nhân vật cho gọn gàng vì đang rối quá"*.
 *
 * Quy tắc đo trên Firefox thật (CLAUDE.md): Playwright `firefox-1543`,
 * `headless:false`, **GPU thật** (không `LIBGL_ALWAYS_SOFTWARE`), bản
 * `vite preview` (không dev server), **mở ĐÚNG MỘT LẦN** cho cả lượt
 * (một browser · một context · một page), đóng khi xong, cổng riêng 5478 —
 * không đụng 5173 của Boss, không đụng 8787–8790 / tmux `gen-stage-nao`.
 * Server bị giết bằng PID ÂM của process group do chính script này spawn.
 *
 * Ra `docs/j1/`:
 *   · `bang-j1.txt`     — bảng chữ đọc được: tựa tường · vùng trống ·
 *                         `min.y` mọi khối · lệch tóc đứng/đi/emote.
 *   · `ket-qua.json`    — toàn bộ số thô + ĐẠT/KHÔNG từng mốc.
 *   · `*-1440.png`      — 5 preset camera.
 *   · `toc-<ai>-<goc>.png` — tóc 3 góc (chính diện · sau lưng · nghiêng)
 *                         × 2 nhân vật (`gen` = Nhi tóc dài · `owner` = Nam).
 *
 * MỌI lệnh sân khấu đi qua `chay()` — hàm đó kiểm `r.ok` và NÉM nếu lệnh hỏng,
 * nên không có số nào trong bảng được sinh ra từ một lệnh im lặng thất bại.
 */
import { firefox } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createConnection as netConnect } from 'node:net';

const THU_MUC = 'docs/j1';
mkdirSync(THU_MUC, { recursive: true });
const PORT = 5478;
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mốc Boss / đề bài Issue #78. */
const MOC = {
  tuaTuong: 0.15,
  vung: { rong: 6, sau: 4 },
  daiToc: 0.45,
  hamToc: 0.45,
  lech: { dung: 0.02, di: 0.05, emote: 0.07 },
  /** `min.y` của khối đứng sàn: |min.y| ≤ bấy nhiêu mét. */
  sanY: 0.02,
};
/** `gen` = Nhi (tóc dài, `avatar.vrm`) · `owner` = Nam (`owner.vrm`). */
const AI = [
  { id: 'gen', ten: 'Nhi', dung: [-1.6, 0, 0.6] },
  { id: 'owner', ten: 'Nam', dung: [1.6, 0, 0.6] },
];

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
if (await congBan(PORT)) {
  console.error(`⛔ Cổng ${PORT} đang bận — đổi PORT, KHÔNG giết tiến trình của Boss.`);
  process.exit(3);
}

/*
 * MỘT LÚC CHỈ MỘT AGENT dùng Firefox thật (CLAUDE.md "Quy tắc đo trên Firefox
 * thật"): nouveau gãy (`kernel rejected pushbuf`) khi ≥3 phiên Firefox GPU
 * cùng lúc, và cửa sổ nhấp nháy làm phiền Boss.
 *
 * Mẫu `pgrep` phải **neo argv[0]** (`^[^ ]*firefox-1543/firefox/firefox`):
 * mẫu không neo (`-f firefox-1543`) tự khớp luôn vòng `bash -c` đang CHỜ của
 * agent khác, nên hai agent chờ nhau mãi không ai mở được.
 */
const { execFileSync } = await import('node:child_process');
let soFirefox = 0;
try {
  soFirefox = execFileSync('pgrep', ['-cf', '^[^ ]*firefox-1543/firefox/firefox'], {
    encoding: 'utf8',
  }).trim() | 0;
} catch {
  soFirefox = 0; // pgrep trả mã 1 khi không khớp gì
}
if (soFirefox > 0 && !process.argv.includes('--chen')) {
  console.error(
    `⛔ Đang có ${soFirefox} tiến trình Firefox thật — chờ hết rồi chạy lại (ép bằng \`--chen\`).`,
  );
  process.exit(4);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
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
process.on('exit', () => dietCay(server));
const url = await new Promise((ok, no) => {
  const h = setTimeout(() => no(new Error('vite preview không lên (đã `pnpm build` chưa?)')), 60000);
  const doc = (d) => {
    if (String(d).includes(`localhost:${PORT}`)) {
      clearTimeout(h);
      ok(`http://localhost:${PORT}/`);
    }
  };
  server.stdout.on('data', doc);
  server.stderr.on('data', doc);
});
console.log(`preview: ${url} (pid ${server.pid})`);

const kq = {
  khi: new Date().toISOString(),
  che: 'vite preview · firefox headless:false · GPU thật',
  moc: MOC,
  anh: {},
  tuaTuong: [],
  vungTrong: null,
  minY: [],
  toc: {},
  hieuNang: null,
  dat: {},
  loiConsole: [],
};
const loi = [];
const chot = (ten, dat, chiTiet) => {
  kq.dat[ten] = { dat, ...(chiTiet ?? {}) };
  if (!dat) loi.push(`${ten}: ${JSON.stringify(chiTiet)}`);
};

/* ======================= MỞ FIREFOX — ĐÚNG MỘT LẦN ======================= */
const br = await firefox.launch({
  headless: false,
  env: { ...process.env, MOZ_ENABLE_WAYLAND: '0', MOZ_X11_EGL: '0' },
});
try {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();

  pg.on('console', (m) => m.type() === 'error' && kq.loiConsole.push(m.text()));
  pg.on('pageerror', (e) => kq.loiConsole.push(`pageerror: ${e.message}`));

  // `?bridge=0`: KHÔNG nối vào bridge thật của Boss (8787–8790 đang chạy).
  await pg.goto(`${url}?bridge=0`, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
  await nghi(4500); // nạp VRM + ~40 model Kenney + biên dịch shader

  /** Chạy một lệnh sân khấu, KIỂM `r.ok`, ném nếu hỏng. */
  const chay = async (cmd, args) => {
    const r = await pg.evaluate(
      ([c, a]) =>
        window.stage.run(c, a).then(
          (x) => ({ ok: true, x }),
          (e) => ({ ok: false, e: String(e?.message ?? e) }),
        ),
      [cmd, args ?? {}],
    );
    if (!r.ok) throw new Error(`lệnh ${cmd} hỏng: ${r.e}`);
    if (r.x && r.x.ok === false) throw new Error(`lệnh ${cmd} trả ok=false: ${JSON.stringify(r.x)}`);
    return r.x;
  };

  await pg.addStyleTag({
    content:
      '#bang,#hud,#toast,#loading,#o-chat,#goi-y-phim,#nut-tieng,#o-noi-nhanh{display:none!important}',
  });

  /* ============ 1. min.y + hộp bao XZ của MỌI khối, đo LÚC DỰNG ============
   * Đọc `window.stage.doKhoi()` — sổ đo `Box3` của từng khối ghi NGAY LÚC
   * `dungPhong()` đặt nó. KHÔNG tự quét đỉnh trên cảnh đã dựng: `gopTinh()`
   * gộp mesh tĩnh theo vật liệu nên nhóm `khoi:<id>` rỗng (vòng đo đầu của J1
   * chỉ thấy 7/60 khối — đúng bài học `matTrenKhoi()` của G1).
   */
  const soKhoi = await pg.evaluate(() => window.stage.doKhoi());
  const khoi = Object.entries(soKhoi).map(([id, h]) => ({
    id,
    minx: h.min[0],
    miny: h.min[1],
    minz: h.min[2],
    maxx: h.max[0],
    maxy: h.max[1],
    maxz: h.max[2],
  }));
  kq.minY = khoi.map((k) => ({
    id: k.id,
    minY: +k.miny.toFixed(4),
    maxY: +k.maxy.toFixed(4),
    x: [+k.minx.toFixed(3), +k.maxx.toFixed(3)],
    z: [+k.minz.toFixed(3), +k.maxz.toFixed(3)],
  }));
  console.log(`   đo được ${khoi.length} khối trong cảnh`);

  /* ============ 2. TỰA TƯỜNG + VÙNG GIỮA TRỐNG, đo trên hình học THẬT ============ */
  const NUA_RONG = 7;
  const NUA_SAU = 5;
  const TUA = [
    'sofa', 'ghe-don-1', 'ghe-don-2', 'ke-tivi', 'ban-canh-sofa', 'ke-module',
    'ban-dieu-khien', 'ban-an', 'tu-bat-dia', 'tu-bep', 'tu-bep-goc', 'tu-duoi-1',
    'bep-nau', 'tu-duoi-2', 'tu-lanh', 'ke-giay',
  ];
  for (const id of TUA) {
    const k = khoi.find((x) => x.id === id);
    if (!k) {
      kq.tuaTuong.push({ id, ho: null, thieu: true });
      continue;
    }
    const ho = Math.min(k.minx + NUA_RONG, NUA_RONG - k.maxx, k.minz + NUA_SAU, NUA_SAU - k.maxz);
    kq.tuaTuong.push({ id, ho: +ho.toFixed(3) });
  }
  // đo theo HÌNH HỌC THẬT nên lề rộng hơn số trong `bo-cuc.ts` (hộp `chan` là
  // hộp đi đường, nhỏ hơn model): mốc ở đây là **mép model** ≤ 0,15 m.
  const hoXau = kq.tuaTuong.filter((t) => t.thieu || t.ho > MOC.tuaTuong + 1e-6);
  chot('tua-tuong', hoXau.length === 0, { hoXau, soMon: kq.tuaTuong.length });

  // VÙNG GIỮA TRỐNG: khối nào có mép model lấn vào x −3…3 · z −2,5…2,5?
  const V = { x0: -3, x1: 3, z0: -2.5, z1: 2.5 };
  const BO_QUA = new Set(['tham', 'tham-an', 'tham-cua', 'cua']); // thảm/cửa không chắn
  const lan = khoi
    .filter((k) => !BO_QUA.has(k.id))
    .filter((k) => k.minx < V.x1 && k.maxx > V.x0 && k.minz < V.z1 && k.maxz > V.z0)
    // đồ treo tường / đèn trần: chân cao hơn đầu người thì không chắn hoạt động
    .filter((k) => k.miny < 1.9)
    .map((k) => ({ id: k.id, x: [+k.minx.toFixed(2), +k.maxx.toFixed(2)], z: [+k.minz.toFixed(2), +k.maxz.toFixed(2)] }));
  kq.vungTrong = { vung: V, rong: V.x1 - V.x0, sau: V.z1 - V.z0, lan };
  chot(
    'vung-giua-trong',
    lan.length === 0 && V.x1 - V.x0 >= MOC.vung.rong && V.z1 - V.z0 >= MOC.vung.sau,
    kq.vungTrong,
  );

  // min.y: khối đứng sàn phải chạm sàn; khối `tren`/`datY` phải TRÊN sàn
  const TREO = new Set(kq.minY.filter((m) => m.minY > 0.05).map((m) => m.id));
  const lunSan = kq.minY.filter((m) => m.minY < -MOC.sanY);
  chot('min-y-khong-lun-san', lunSan.length === 0, { lunSan, soTreo: TREO.size });

  /* ====================== 3. BẢNG LỆCH TÓC — mẫu 100 ms ====================== */
  const doToc2s = async (actor, nhan) => {
    const mau = [];
    for (let i = 0; i < 20; i += 1) {
      mau.push(await pg.evaluate((a) => window.stage.doToc(a), actor));
      await nghi(100);
    }
    const lech = mau.map((m) => m.lechToc);
    const vay = mau.map((m) => m.lechVay);
    const ra = {
      soMau: mau.length,
      lechMax: +Math.max(...lech).toFixed(4),
      lechTB: +(lech.reduce((a, b) => a + b, 0) / lech.length).toFixed(4),
      vayMax: +Math.max(...vay).toFixed(4),
      daiChuoiToc: mau[0].daiChuoiToc,
      tyThuToc: mau[0].tyThuToc,
      xaDauNhat: Math.max(...mau.map((m) => m.xaDauNhat)),
      mocDaOnDinh: mau[mau.length - 1].mocDaOnDinh,
      soToc: mau[0].soToc,
      spring: mau[0].spring,
    };
    kq.toc[`${nhan}/${actor}`] = ra;
    console.log(
      `   tóc ${nhan.padEnd(6)} ${actor.padEnd(6)} lệch max=${ra.lechMax} m · chuỗi=${ra.daiChuoiToc} m · ty=${ra.tyThuToc}`,
    );
    return ra;
  };

  // đưa cả hai ra giữa vùng hoạt động, quay mặt về +Z, chờ tóc về dáng cân bằng
  for (const a of AI) {
    await chay('actor.moveTo', { actor: a.id, to: a.dung });
  }
  await nghi(2500);
  for (const a of AI) {
    await chay('actor.turnTo', { actor: a.id, target: [a.dung[0], 0, 5] });
  }
  await nghi(4000); // > CHO_ON_TOC (3 s) để `mocDaOnDinh` = true

  for (const a of AI) {
    const d = await doToc2s(a.id, 'dung');
    chot(`toc/dung/${a.id}`, d.lechMax <= MOC.lech.dung, d);
    chot(`toc/dai/${a.id}`, d.daiChuoiToc <= MOC.daiToc + 1e-9, {
      daiChuoiToc: d.daiChuoiToc,
      moc: MOC.daiToc,
    });
    chot(`toc/ham/${a.id}`, (d.spring?.hamMin ?? 0) >= MOC.hamToc - 1e-9, {
      hamMin: d.spring?.hamMin,
      hamMax: d.spring?.hamMax,
      moc: MOC.hamToc,
    });
  }

  /* ---- ĐI: `actor.steer` 2 s rồi lấy mẫu trong lúc còn đang đi ---- */
  for (const a of AI) {
    await chay('actor.steer', { actor: a.id, vx: 0, vz: -1.6, ms: 2600 });
    const d = await doToc2s(a.id, 'di');
    chot(`toc/di/${a.id}`, d.lechMax <= MOC.lech.di, d);
    await nghi(600);
    await chay('actor.moveTo', { actor: a.id, to: a.dung });
    await nghi(2200);
    await chay('actor.turnTo', { actor: a.id, target: [a.dung[0], 0, 5] });
    await nghi(1200);
  }

  /* ---- EMOTE: 3 emote mạnh nhất, mẫu từ ngay lúc gọi ---- */
  for (const a of AI) {
    for (const em of ['rat-vui', 'ngac-nhien', 'buon']) {
      await chay('actor.emote', { actor: a.id, emote: em, intensity: 1 });
      const d = await doToc2s(a.id, `emote-${em}`);
      chot(`toc/emote/${em}/${a.id}`, d.lechMax <= MOC.lech.emote, d);
      await nghi(500);
    }
  }

  /* ========================= 4. ẢNH 5 PRESET (1440) ========================= */
  // `camera.preset` bay dần → gọi preset cho `describe()` nói đúng tên, rồi
  // `datMay` đúng toạ độ đã khai trong `world.ts cameraPreset()`.
  const PRESET = {
    'toan-canh': { vt: [3.6, 2.6, 4.4], tam: [-1.2, 0.8, -1.2] },
    'phong-khach': { vt: [-1.8, 1.8, 0.6], tam: [-6.0, 0.7, 3.6] },
    'ban-lam-viec': { vt: [0.5, 1.7, -1.7], tam: [2.3, 1.0, -4.5] },
    bep: { vt: [4.0, 2.0, 1.1], tam: [6.3, 0.95, -3.3] },
    'cua-so': { vt: [-1.0, 1.45, 1.6], tam: [-1.0, 1.1, 4.8] },
  };
  const chup = async (ten, file) => {
    await pg.screenshot({ path: `${THU_MUC}/${file}` });
    kq.anh[ten] = `${THU_MUC}/${file}`;
    console.log(`   📷 ${ten} → ${THU_MUC}/${file}`);
  };
  for (const [name, g] of Object.entries(PRESET)) {
    await chay('camera.preset', { name });
    await pg.evaluate(({ vt, tam }) => window.stage.datMay(vt, tam), g);
    await nghi(800);
    await chup(name, `${name}-1440.png`);
  }
  kq.hieuNang = await pg.evaluate(() => window.stage.hieuNang());
  console.log('   hiệu năng:', JSON.stringify(kq.hieuNang));

  /* ============ 5. ẢNH TÓC — 3 góc × 2 nhân vật (1440) ============ */
  for (const a of AI) {
    const x = await pg.evaluate((id) => window.stage.doXuong(id), a.id);
    const dau = x.head ?? [a.dung[0], 1.0, a.dung[2]];
    const yT = dau[1];
    const tam = [dau[0], yT - 0.22, dau[2]];
    const GOC = {
      'chinh-dien': [dau[0], yT + 0.02, dau[2] + 1.15],
      'sau-lung': [dau[0], yT + 0.02, dau[2] - 1.15],
      nghieng: [dau[0] + 1.15, yT + 0.02, dau[2]],
    };
    for (const [ten, vt] of Object.entries(GOC)) {
      await pg.evaluate(([v, t]) => window.stage.datMay(v, t), [vt, tam]);
      await nghi(650);
      await chup(`toc-${a.id}-${ten}`, `toc-${a.id}-${ten}.png`);
    }
    kq.toc[`xuong/${a.id}`] = { head: dau, bbox: x.bbox };
  }

  chot('console-sach', kq.loiConsole.length === 0, { loiConsole: kq.loiConsole.slice(0, 8) });
} finally {
  await br.close();
  dietCay(server);
}

/* ============================== BẢNG CHỮ ============================== */
const d = (v, n = 3) => (typeof v === 'number' ? v.toFixed(n) : String(v));
const dong = [];
dong.push(`J1 (#78) — ${kq.khi}`);
dong.push(`chế độ: ${kq.che}`);
dong.push('');
dong.push('== 1. TỰA TƯỜNG (mép MODEL tới tường gần nhất, mốc ≤ 0,15 m) ==');
for (const t of kq.tuaTuong) {
  dong.push(`  ${t.id.padEnd(16)} hở ${d(t.ho)} m  ${t.thieu ? 'THIẾU KHỐI' : t.ho <= MOC.tuaTuong + 1e-6 ? 'ĐẠT' : 'KHÔNG'}`);
}
dong.push('');
dong.push(`== 2. VÙNG GIỮA TRỐNG (x ${kq.vungTrong.vung.x0}…${kq.vungTrong.vung.x1} · z ${kq.vungTrong.vung.z0}…${kq.vungTrong.vung.z1}) ==`);
dong.push(`  kích thước ${kq.vungTrong.rong} × ${kq.vungTrong.sau} m (mốc ≥ ${MOC.vung.rong} × ${MOC.vung.sau} m)`);
dong.push(`  khối lấn vào: ${kq.vungTrong.lan.length === 0 ? 'KHÔNG CÓ → ĐẠT' : JSON.stringify(kq.vungTrong.lan)}`);
dong.push('');
dong.push('== 3. min.y MỌI KHỐI (m) — âm là lún xuống dưới sàn ==');
for (const m of [...kq.minY].sort((a, b) => a.minY - b.minY)) {
  dong.push(`  ${m.id.padEnd(16)} min.y ${d(m.minY, 4).padStart(8)}  max.y ${d(m.maxY, 4).padStart(8)}`);
}
dong.push('');
dong.push('== 4. LỆCH TÓC (mẫu 100 ms × 2 s) ==');
dong.push(`  mốc: đứng ≤ ${MOC.lech.dung} · đi ≤ ${MOC.lech.di} · emote ≤ ${MOC.lech.emote} m`);
for (const [k, v] of Object.entries(kq.toc)) {
  if (k.startsWith('xuong/')) continue;
  dong.push(
    `  ${k.padEnd(26)} lệch max ${d(v.lechMax, 4)} · TB ${d(v.lechTB, 4)} · váy ${d(v.vayMax, 4)} · chuỗi tóc ${d(v.daiChuoiToc, 4)} m · hãm ${d(v.spring?.hamMin, 3)}…${d(v.spring?.hamMax, 3)}`,
  );
}
dong.push('');
dong.push('== 5. ĐẠT / KHÔNG ==');
for (const [k, v] of Object.entries(kq.dat)) dong.push(`  ${v.dat ? 'ĐẠT   ' : 'KHÔNG '} ${k}`);
dong.push('');
dong.push(`lỗi console: ${kq.loiConsole.length}`);
dong.push(`hiệu năng: ${JSON.stringify(kq.hieuNang)}`);

writeFileSync(`${THU_MUC}/bang-j1.txt`, dong.join('\n') + '\n');
writeFileSync(`${THU_MUC}/ket-qua.json`, JSON.stringify(kq, null, 2) + '\n');
console.log('\n' + dong.join('\n'));
if (loi.length) {
  console.error(`\n❌ ${loi.length} mốc KHÔNG đạt:\n` + loi.join('\n'));
  process.exit(1);
}
console.log(`\n✅ J1 đạt hết mốc — ${THU_MUC}/bang-j1.txt`);
