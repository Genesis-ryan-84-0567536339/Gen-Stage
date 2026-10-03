/**
 * kiem-a1.mjs — bằng chứng cho A1.
 *
 * Với MỖI lệnh thật trong spec, script này làm **cả hai đường**:
 *   1. gọi `window.stage.run(cmd, args)` — đường agent/bridge đi,
 *   2. điền form rồi bấm nút "Chạy" trên bảng lệnh — đường Boss đi,
 * rồi so: hai đường phải cho cùng kiểu kết quả. Kèm theo:
 *   - ảnh chụp sau mỗi nhóm vào `docs/a1/`,
 *   - `stage.describe()` trước/sau `actor.moveTo` để thấy pos + distances đổi,
 *   - kịch bản mẫu mục 3 của spec dán qua ô kịch bản, chạy trọn,
 *   - đếm console.error (phải bằng 0).
 *
 * Dùng: node scripts/kiem-a1.mjs [url]
 * Không truyền url thì tự chạy `vite preview` trên bản build (`pnpm build` trước).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const THU_MUC_ANH = 'docs/a1';
mkdirSync(THU_MUC_ANH, { recursive: true });

/* ----------------------------------------------------------- máy chủ xem thử */

let urlArg = process.argv[2];
let server = null;

async function moServer() {
  if (urlArg) return urlArg;
  // cổng ngẫu nhiên: chạy lại nhiều lần không vướng máy chủ cũ còn sót
  server = spawn('npx', ['vite', 'preview', '--port', String(4320 + ((Date.now() / 7) % 400 | 0))], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise((resolve, reject) => {
    const han = setTimeout(() => reject(new Error('vite preview không khởi động')), 30000);
    const doc = (d) => {
      const s = String(d);
      process.stdout.write('   [vite] ' + s);
      const m = s.match(/http:\/\/localhost:\d+\/?/);
      if (m) {
        clearTimeout(han);
        resolve(m[0]);
      }
    };
    server.stdout.on('data', doc);
    server.stderr.on('data', doc);
  });
  return url;
}

/* --------------------------------------------------------------- danh sách */

/** `api` = args cho window.stage.run · `ui` = args điền vào form rồi bấm Chạy. */
const BUOC = [
  { nhom: '01-stage', cmd: 'stage.bootstrap', api: {}, ui: {} },
  { nhom: '01-stage', cmd: 'stage.describe', api: {}, ui: {} },

  { nhom: '02-actor-vao-canh', cmd: 'actor.spawn', api: { id: 'minh', name: 'Minh', at: 'ban-2' }, ui: { id: 'huy', name: 'Huy', at: 'cua' } },
  { nhom: '02-actor-vao-canh', cmd: 'actor.list', api: {}, ui: {} },

  { nhom: '03-di-chuyen', cmd: 'actor.moveTo', api: { actor: 'lan', to: 'ban-2' }, ui: { actor: 'minh', to: 'buc-trung-tam' }, choSuKien: 'actor.arrived', moTaTruocSau: true },
  { nhom: '03-di-chuyen', cmd: 'actor.turnTo', api: { actor: 'lan', target: 'cua' }, ui: { actor: 'minh', target: 'ban-1' } },
  { nhom: '03-di-chuyen', cmd: 'actor.lookAt', api: { actor: 'lan', target: 'camera' }, ui: { actor: 'minh', target: 'lan' } },

  { nhom: '04-dien-xuat', cmd: 'actor.play', api: { actor: 'lan', clip: 'wave' }, ui: { actor: 'minh', clip: 'celebrate' } },
  { nhom: '04-dien-xuat', cmd: 'actor.express', api: { actor: 'lan', expression: 'happy', durationMs: 4000 }, ui: { actor: 'minh', expression: 'surprised' } },
  { nhom: '04-dien-xuat', cmd: 'actor.say', api: { actor: 'lan', text: 'Sếp ơi, test xanh rồi!', emotion: 'vui' }, ui: { actor: 'minh', text: 'Em chạy xong bộ lệnh A1.' } },
  { nhom: '04-dien-xuat', cmd: 'actor.bubble', api: { actor: 'lan', text: 'Đang nghĩ…', durationMs: 1500 }, ui: { actor: 'minh', text: 'Ghi nhật ký…' } },
  { nhom: '04-dien-xuat', cmd: 'actor.stop', api: { actor: 'lan' }, ui: { actor: 'minh' } },

  { nhom: '05-ngoi-dung', cmd: 'actor.sit', api: { actor: 'lan', seat: 'ghe-1' }, ui: { actor: 'minh', seat: 'ghe-2' }, choSuKien: 'actor.sat' },
  { nhom: '05-ngoi-dung', cmd: 'actor.stand', api: { actor: 'lan' }, ui: { actor: 'minh' } },

  { nhom: '06-do-vat', cmd: 'prop.spawn', api: { id: 'so-tay', shape: 'book', kind: 'module', at: 'ban-1' }, ui: { id: 'khoi', shape: 'crystal', at: 'buc-trung-tam' } },
  { nhom: '06-do-vat', cmd: 'prop.list', api: {}, ui: {} },
  { nhom: '06-do-vat', cmd: 'actor.hold', api: { actor: 'lan', prop: 'so-tay', hand: 'right' }, ui: { actor: 'minh', prop: 'khoi', hand: 'left' } },
  { nhom: '06-do-vat', cmd: 'actor.drop', api: { actor: 'lan' }, ui: { actor: 'minh' } },
  { nhom: '06-do-vat', cmd: 'prop.moveTo', api: { prop: 'so-tay', to: 'ke-module' }, ui: { prop: 'khoi', to: 'ban-2' } },
  { nhom: '06-do-vat', cmd: 'prop.set', api: { prop: 'so-tay', state: { screen: 'on', text: 'Đang chạy test…' } }, ui: { prop: 'khoi', state: '{"color":"#ff8844"}' } },
  { nhom: '06-do-vat', cmd: 'prop.remove', api: { prop: 'so-tay' }, ui: { prop: 'khoi' } },

  { nhom: '07-anh-sang-may-quay', cmd: 'scene.light', api: { preset: 'am' }, ui: { preset: 'sang' } },
  { nhom: '07-anh-sang-may-quay', cmd: 'camera.focus', api: { target: 'lan', distance: 2.2 }, ui: { target: 'ban-2', distance: 3 } },
  { nhom: '07-anh-sang-may-quay', cmd: 'camera.preset', api: { name: 'hop' }, ui: { name: 'toan-canh' } },

  { nhom: '08-ra-canh', cmd: 'actor.remove', api: { actor: 'minh' }, ui: { actor: 'huy' } },
];

/** Lệnh A2/A3 chỉ đăng ký — phải trả ok:false, nói rõ đợt nào. */
const STUB = [
  ['actor.emote', { actor: 'lan', emote: 'vui' }],
  ['actor.idleStyle', { actor: 'lan', style: 'hao-hung' }],
  ['screen.spawn', { id: 'main', at: 'buc-trung-tam' }],
  ['screen.show', { screen: 'main', kind: 'code', content: 'const a = 1;' }],
  ['screen.stream', { screen: 'main', kind: 'code', source: 'agent' }],
  ['screen.focus', { screen: 'main' }],
  ['screen.clear', { screen: 'main' }],
  ['screen.remove', { screen: 'main' }],
  ['module.build', { id: 'connector-baserow', shape: 'book', label: 'Baserow', from: 'main' }],
  ['module.open', { module: 'connector-baserow' }],
  ['module.store', { module: 'connector-baserow', to: 'ke-module' }],
  ['fx.play', { name: 'success' }],
];

/** Kịch bản mẫu mục 3.4 của spec (bỏ screen/module thuộc A3). */
const KICH_BAN_MAU = JSON.stringify(
  {
    cmd: 'script.run',
    args: {
      steps: [
        { cmd: 'actor.moveTo', args: { actor: 'lan', to: 'ban-2' } },
        { waitFor: 'actor.arrived' },
        { cmd: 'actor.express', args: { actor: 'lan', expression: 'happy' } },
        { cmd: 'actor.say', args: { actor: 'lan', text: 'Sếp ơi, test xanh rồi!' } },
        { cmd: 'actor.play', args: { actor: 'lan', clip: 'celebrate' } },
      ],
    },
  },
  null,
  2,
);

const KICH_BAN_NGAN = [
  '# dạng ngắn: 1 lệnh / 1 dòng',
  'lan moveTo buc-trung-tam',
  'waitFor actor.arrived',
  'lan turnTo camera',
  'wait 300',
  'lan play clap',
  'lan say Dạng ngắn cũng chạy, Sếp ạ!',
].join('\n');

/* ----------------------------------------------------------------- chạy */

const loi = [];
const canhBao = [];
let soLenhChay = 0;
let soLenhOk = 0;
const thatBai = [];

function in_(...x) {
  console.log(...x);
}

const url = await moServer();
in_('==> URL:', url);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });

page.on('console', (m) => {
  const d = `[${m.type()}] ${m.text()}`;
  if (m.type() === 'error') loi.push(d);
  else if (m.type() === 'warning') canhBao.push(d);
  else in_('   ' + d);
});
page.on('pageerror', (e) => loi.push('[pageerror] ' + e.message));
page.on('requestfailed', (r) =>
  loi.push(`[requestfailed] ${r.url()} — ${r.failure()?.errorText}`),
);

await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
await page.waitForTimeout(1200);
in_('==> app sẵn sàng (window.stage.san === true)\n');

/* --- helper --- */

async function goiApi(cmd, args) {
  return page.evaluate(
    ([c, a]) => window.stage.run(c, a),
    [cmd, args],
  );
}

/** Điền form của lệnh trên bảng lệnh rồi bấm "Chạy", trả về chữ hiện ở ô kết quả. */
async function bamUI(cmd, args) {
  const mo = await page.evaluate(
    ([c]) => {
      const hop = document.querySelector(`.lenh[data-cmd="${c}"]`);
      if (!hop) return { ok: false, error: 'không thấy ô lệnh trên bảng' };
      const chiTiet = hop.closest('details');
      if (chiTiet) chiTiet.open = true;
      return { ok: true };
    },
    [cmd],
  );
  if (!mo.ok) return mo;

  // Điền rồi ĐỌC LẠI: ô chọn chỉ nhận giá trị khi bảng đã làm mới danh sách
  // actor/prop, nên thử lại vài nhịp thay vì âm thầm chạy bằng giá trị cũ.
  let dien = null;
  for (let lan = 0; lan < 12; lan++) {
    dien = await page.evaluate(
      ([c, a]) => {
        const hop = document.querySelector(`.lenh[data-cmd="${c}"]`);
        const thieu = [];
        const lech = [];
        for (const [k, v] of Object.entries(a)) {
          let el = null;
          for (const o of hop.querySelectorAll('.o-tham-so')) {
            const ten = o.querySelector('span')?.textContent?.replace(' *', '').trim();
            if (ten === k) {
              el = o.querySelector('input, select, textarea');
              break;
            }
          }
          if (!el) {
            thieu.push(k);
            continue;
          }
          const muon = typeof v === 'string' ? v : JSON.stringify(v);
          if (el.type === 'checkbox') el.checked = Boolean(v);
          else el.value = muon;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          if (el.type !== 'checkbox' && el.value !== muon) {
            lech.push(`${k}: muốn "${muon}", ô đang là "${el.value}"`);
          }
        }
        return { thieu, lech };
      },
      [cmd, args],
    );
    if (!dien.thieu.length && !dien.lech.length) break;
    await page.waitForTimeout(250);
  }
  if (dien.thieu.length) {
    return { ok: false, error: `bảng lệnh thiếu ô cho: ${dien.thieu.join(', ')}` };
  }
  if (dien.lech.length) {
    return { ok: false, error: `ô nhập không nhận giá trị — ${dien.lech.join('; ')}` };
  }

  await page.click(`.lenh[data-cmd="${cmd}"] .nut-chay`);
  await page.waitForFunction(
    (c) => {
      const o = document.querySelector(`.lenh[data-cmd="${c}"] .lenh-kq`);
      return o && !o.classList.contains('dang-chay') && o.textContent.trim() !== '';
    },
    cmd,
    { timeout: 20000 },
  );
  return page.evaluate((c) => {
    const o = document.querySelector(`.lenh[data-cmd="${c}"] .lenh-kq`);
    return { ok: o.classList.contains('ok'), text: o.textContent.trim() };
  }, cmd);
}

function ghiNhan(nhan, cmd, ok, chiTiet) {
  soLenhChay++;
  if (ok) {
    soLenhOk++;
    in_(`   ✓ ${nhan.padEnd(4)} ${cmd.padEnd(18)} ${chiTiet}`);
  } else {
    thatBai.push(`${nhan} ${cmd}: ${chiTiet}`);
    in_(`   ✗ ${nhan.padEnd(4)} ${cmd.padEnd(18)} ${chiTiet}`);
  }
}

/**
 * Chờ tới khi actor hết bận. Hỏi vòng từ Node chứ KHÔNG dùng
 * `page.waitForFunction` với hàm async: ở đó một Promise luôn "truthy" nên điều
 * kiện đúng ngay lập tức và phép đo mất hết ý nghĩa.
 */
async function choRanh(id, hanMs = 60000) {
  const han = Date.now() + hanMs;
  for (;;) {
    const r = await page.evaluate(async (i) => {
      const kq = await window.stage.describe();
      const a = kq.result.actors.find((x) => x.id === i);
      return a ? { busy: a.busy, queued: a.queued, state: a.state } : null;
    }, id);
    if (!r || (!r.busy && r.queued === 0)) return true;
    if (Date.now() > han) {
      ghiNhan('chk', `cho-ranh/${id}`, false, `quá ${hanMs} ms mà vẫn ${JSON.stringify(r)}`);
      return false;
    }
    await page.waitForTimeout(200);
  }
}

/** Chờ một sự kiện sân khấu; quá hạn là HỎNG, không im lặng bỏ qua. */
async function choSuKien(ten, hanMs = 60000) {
  const duoc = await page.evaluate(
    ([t, h]) =>
      new Promise((resolve) => {
        const hen = setTimeout(() => {
          huy();
          resolve(false);
        }, h);
        const huy = window.stage.on(t, () => {
          clearTimeout(hen);
          huy();
          resolve(true);
        });
      }),
    [ten, hanMs],
  );
  if (!duoc) ghiNhan('chk', `cho-su-kien/${ten}`, false, `không thấy trong ${hanMs} ms`);
  return duoc;
}

async function anh(ten) {
  const f = `${THU_MUC_ANH}/${ten}.png`;
  await page.screenshot({ path: f });
  in_(`   📷 ${f}`);
}

/* --- đi qua từng lệnh --- */

let nhomHienTai = null;
let moTaTruoc = null;

for (const b of BUOC) {
  if (b.nhom !== nhomHienTai) {
    if (nhomHienTai) await anh(nhomHienTai);
    nhomHienTai = b.nhom;
    in_(`\n--- nhóm ${b.nhom} ---`);
  }

  if (b.moTaTruocSau) {
    moTaTruoc = (await goiApi('stage.describe', {})).result;
    in_('\n   ↓ stage.describe() TRƯỚC actor.moveTo:');
    in_('   ' + JSON.stringify(chonGon(moTaTruoc), null, 2).split('\n').join('\n   '));
  }

  const rApi = await goiApi(b.cmd, b.api);
  ghiNhan(
    'api',
    b.cmd,
    rApi.ok,
    rApi.ok ? gonKetQua(rApi.result) : rApi.error,
  );
  if (b.choSuKien) await choSuKien(b.choSuKien);
  if (b.api.actor) await choRanh(b.api.actor);

  // Chụp "SAU" ngay sau đường API: cặp trước/sau phải kẹp đúng MỘT lệnh,
  // nếu để đường UI chen vào thì số đo không còn chứng minh được gì.
  if (b.moTaTruocSau) {
    const sau = (await goiApi('stage.describe', {})).result;
    in_('\n   ↓ stage.describe() SAU actor.moveTo (pos + distances đã đổi):');
    in_('   ' + JSON.stringify(chonGon(sau), null, 2).split('\n').join('\n   '));
    const dich = b.api.to;
    const a0 = moTaTruoc.actors.find((a) => a.id === b.api.actor);
    const a1 = sau.actors.find((a) => a.id === b.api.actor);
    const doi =
      JSON.stringify(a0.pos) !== JSON.stringify(a1.pos) &&
      a1.distances[dich] < a0.distances[dich] &&
      a1.at === dich;
    ghiNhan(
      'chk',
      'describe-doi',
      doi,
      `${b.api.actor}: pos ${JSON.stringify(a0.pos)} → ${JSON.stringify(a1.pos)}` +
        ` · distances["${dich}"] ${a0.distances[dich]} → ${a1.distances[dich]} m` +
        ` · at=${a1.at} · nearest=${JSON.stringify(a1.nearest)}`,
    );
    in_('');
  }

  const rUi = await bamUI(b.cmd, b.ui);
  ghiNhan('ui', b.cmd, rUi.ok, rUi.text ?? rUi.error);
  if (b.choSuKien) await choSuKien(b.choSuKien);
  if (b.ui.actor) await choRanh(b.ui.actor);
}
await anh(nhomHienTai);

/* --- stub A2/A3 --- */

in_('\n--- nhóm 09-stub-A2-A3 (phải trả ok:false, nói rõ đợt) ---');
for (const [cmd, args] of STUB) {
  const r = await goiApi(cmd, args);
  const dung = r.ok === false && /^A[23]:/.test(r.error);
  ghiNhan('api', cmd, dung, r.ok ? 'KHÔNG được ok:true' : r.error.slice(0, 70));
}
await anh('09-stub-A2-A3');

/* --- hàng đợi + interrupt trên app thật --- */

in_('\n--- nhóm 10-hang-doi-interrupt ---');
await goiApi('camera.preset', { name: 'toan-canh' });
const q = await page.evaluate(async () => {
  const r1 = await window.stage.run('actor.moveTo', { actor: 'lan', to: 'cua' });
  const p2 = window.stage.run('actor.play', { actor: 'lan', clip: 'wave' });
  await new Promise((r) => setTimeout(r, 120));
  const giua = await window.stage.describe();
  const r3 = await window.stage.run('actor.play', {
    actor: 'lan',
    clip: 'nod',
    interrupt: true,
  });
  const bicat = await p2;
  return {
    r1,
    giua: giua.result.actors.find((a) => a.id === 'lan'),
    r3,
    bicat,
  };
});
in_('   actor.moveTo →', gonKetQua(q.r1.result));
in_(`   giữa đường: state=${q.giua.state} busy=${q.giua.busy} queued=${q.giua.queued}`);
ghiNhan('chk', 'hang-doi', q.giua.busy === true && q.giua.queued === 1, `busy+queued đúng`);
ghiNhan(
  'chk',
  'interrupt',
  q.r3.ok === true && q.bicat.ok === false && /interrupt/i.test(q.bicat.error),
  q.bicat.ok ? 'lệnh trong hàng đợi phải bị huỷ' : q.bicat.error,
);
await page.waitForTimeout(800);
await anh('10-hang-doi-interrupt');

/* --- C3: cắt hành động hẹn giờ không được báo sai trạng thái --- */

in_('\n--- nhóm 10b-cat-sit-bang-moveTo (hồi quy C3) ---');
await goiApi('stage.reset', {});
await page.waitForTimeout(800);
const c3 = await page.evaluate(async () => {
  const doc = async () => {
    const r = await window.stage.describe();
    const a = r.result.actors.find((x) => x.id === 'lan');
    return { state: a.state, at: a.at, nearest: a.nearest, pos: a.pos, busy: a.busy };
  };
  // actor.sit = đi tới ghế + xoay + ngồi, nên phải chờ hết chuỗi mới là "sitting"
  const rSit = await window.stage.run('actor.sit', { actor: 'lan', seat: 'ghe-1' });
  await new Promise((r) => setTimeout(r, (rSit.result.durationMs ?? 1500) + 1200));
  const khiNgoi = await doc();

  // bắt sự kiện tới nơi TRƯỚC khi ra lệnh, để không phụ thuộc tốc độ máy
  const toiNoi = new Promise((resolve) => {
    const huy = window.stage.on('actor.arrived', () => {
      huy();
      resolve();
    });
  });
  await window.stage.run('actor.moveTo', { actor: 'lan', to: 'cua', interrupt: true });
  const ngaySau = await doc();
  await new Promise((r) => setTimeout(r, 300));
  const sau300 = await doc();
  await toiNoi;
  const khiToi = await doc();
  return { khiNgoi, ngaySau, sau300, khiToi };
});
in_('   khi ngồi      :', JSON.stringify(c3.khiNgoi));
in_('   ngay sau cắt  :', JSON.stringify(c3.ngaySau));
in_('   sau 0,3 giây  :', JSON.stringify(c3.sau300));
in_('   khi actor.arrived:', JSON.stringify(c3.khiToi));

ghiNhan(
  'chk',
  'sit-roi-moveTo',
  c3.khiNgoi.state === 'sitting' && c3.khiNgoi.at === 'ghe-1',
  `ngồi xong: state=${c3.khiNgoi.state} at=${c3.khiNgoi.at}`,
);
// Lỗi C3 biểu hiện ở `state`: bản cũ nhảy về "sitting" khi hẹn giờ ngồi đáo hạn
// dù nhân vật đang đi giữa phòng. Và theo ngữ nghĩa đã chốt ở spec mục 1b,
// đang `walking` thì `at` luôn null, còn `nearest` vẫn phải có giá trị.
ghiNhan(
  'chk',
  'cat-sit-ngay-sau',
  c3.ngaySau.state === 'walking' && c3.ngaySau.at === null && !!c3.ngaySau.nearest.place,
  `state=${c3.ngaySau.state} at=${c3.ngaySau.at} nearest=${JSON.stringify(c3.ngaySau.nearest)}`,
);
ghiNhan(
  'chk',
  'cat-sit-0.3s',
  c3.sau300.state === 'walking' &&
    c3.sau300.at === null &&
    JSON.stringify(c3.sau300.pos) !== JSON.stringify(c3.khiNgoi.pos),
  `state=${c3.sau300.state} at=${c3.sau300.at} pos=${JSON.stringify(c3.sau300.pos)}`,
);
ghiNhan(
  'chk',
  'cat-sit-khi-toi-noi',
  c3.khiToi.state !== 'walking' && c3.khiToi.at === 'cua',
  `state=${c3.khiToi.state} at=${c3.khiToi.at} pos=${JSON.stringify(c3.khiToi.pos)}`,
);
await choRanh('lan');
await anh('10b-cat-sit-bang-moveTo');

/* --- kịch bản: dạng ngắn rồi JSON mẫu của spec (chạy 2 lần) --- */

in_('\n--- nhóm 11-kich-ban ---');
await page.click('#bang-the button[data-the="kich-ban"]');

// kịch bản mẫu chạy HAI lần liên tiếp: lần hai nhân vật đã đứng sẵn ở ban-2 nên
// moveTo dài 0 ms — đúng cái bẫy lỗi C1 trong review PR #6
for (const [ten, noiDung] of [
  ['dạng ngắn', KICH_BAN_NGAN],
  ['JSON mẫu spec mục 3.4 — lần 1', KICH_BAN_MAU],
  ['JSON mẫu spec mục 3.4 — lần 2 (lan đã ở ban-2)', KICH_BAN_MAU],
]) {
  await page.fill('#kb-nhap', noiDung);
  const xong = page.evaluate(
    () =>
      new Promise((resolve) => {
        const hen = setTimeout(() => resolve({ timeout: true }), 120000);
        const huy = window.stage.on('script.done', (e) => {
          clearTimeout(hen);
          huy();
          resolve(e.data);
        });
      }),
  );
  await page.click('#kb-chay');
  const kq = await page.textContent('#kb-kq');
  in_(`   gửi (${ten}): ${kq}`);
  const e = await xong;
  ghiNhan('kb', `script.run/${ten}`, e.timeout !== true && e.errors === 0, JSON.stringify(e));
  await page.waitForTimeout(400);
  await choRanh('lan');
}
await anh('11-kich-ban');

const rStop = await goiApi('script.stop', {});
ghiNhan('api', 'script.stop', rStop.ok, gonKetQua(rStop.result));
await page.click('#bang-the button[data-the="nhat-ky"]');
await page.waitForTimeout(300);
await anh('12-nhat-ky');

/* --- nhật ký xuất được --- */

const nk = JSON.parse(await page.evaluate(() => window.stage.log()));
ghiNhan('chk', 'nhat-ky', nk.banGhi.length > 50, `${nk.banGhi.length} bản ghi JSON`);
writeFileSync(`${THU_MUC_ANH}/nhat-ky-kiem-a1.json`, JSON.stringify(nk, null, 2));
in_(`   💾 ${THU_MUC_ANH}/nhat-ky-kiem-a1.json`);

/* --- stage.reset --- */

in_('\n--- nhóm 13-reset ---');
const rReset = await goiApi('stage.reset', {});
ghiNhan('api', 'stage.reset', rReset.ok, gonKetQua(rReset.result));
await page.waitForTimeout(700);
await page.click('#bang-the button[data-the="lenh"]');
const rResetUi = await bamUI('stage.reset', {});
ghiNhan('ui', 'stage.reset', rResetUi.ok, rResetUi.text ?? rResetUi.error);
await page.waitForTimeout(900);
await anh('13-reset');

/* --- điện thoại --- */

in_('\n--- nhóm 14-dien-thoai 390x844 ---');
const dt = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
dt.on('console', (m) => {
  if (m.type() === 'error') loi.push('[mobile] ' + m.text());
});
dt.on('pageerror', (e) => loi.push('[mobile pageerror] ' + e.message));
await dt.goto(url, { waitUntil: 'load', timeout: 120000 });
await dt.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 });
await dt.waitForTimeout(1500);
await dt.evaluate(() => window.stage.run('actor.play', { actor: 'lan', clip: 'wave' }));
await dt.waitForTimeout(600);
await dt.screenshot({ path: `${THU_MUC_ANH}/14-dien-thoai-san-khau.png` });
in_(`   📷 ${THU_MUC_ANH}/14-dien-thoai-san-khau.png`);
await dt.click('#bang-dong-mo');
await dt.waitForTimeout(500);
await dt.screenshot({ path: `${THU_MUC_ANH}/15-dien-thoai-bang-lenh.png` });
in_(`   📷 ${THU_MUC_ANH}/15-dien-thoai-bang-lenh.png`);

/* ------------------------------------------------------------------ tổng */

in_('\n================ TỔNG KẾT ================');
in_(`lệnh đã bấm/gọi : ${soLenhChay}, đúng ${soLenhOk}`);
in_(`console.error   : ${loi.length}`);
loi.forEach((l) => in_('    ' + l));
in_(`console.warn    : ${canhBao.length}`);
canhBao.slice(0, 10).forEach((l) => in_('    ' + l));
if (thatBai.length) {
  in_(`\nTHẤT BẠI (${thatBai.length}):`);
  thatBai.forEach((l) => in_('    ' + l));
}

await browser.close();
if (server) server.kill('SIGTERM');

const xanh = loi.length === 0 && thatBai.length === 0;
in_(xanh ? '\n==> A1 XANH' : '\n==> A1 ĐỎ');
process.exit(xanh ? 0 : 1);

/* --------------------------------------------------------------- phụ trợ */

function gonKetQua(r) {
  if (r === undefined) return '';
  const s = JSON.stringify(r);
  return s.length > 150 ? s.slice(0, 150) + '…' : s;
}

/** Bớt nhiễu khi in `stage.describe` ra log: chỉ phần Boss cần nhìn. */
function chonGon(st) {
  return {
    version: st.version,
    time: st.time,
    actors: st.actors.map((a) => ({
      id: a.id,
      pos: a.pos,
      facing: a.facing,
      at: a.at,
      nearest: a.nearest,
      state: a.state,
      busy: a.busy,
      expression: a.expression,
      holding: a.holding,
      lookingAt: a.lookingAt,
      queued: a.queued,
      distances: a.distances,
    })),
    places: st.places,
    props: st.props,
    screens: st.screens,
    scene: st.scene,
    lastEvents: st.lastEvents.slice(-3),
  };
}
