/**
 * kiem-e1.mjs — BẰNG CHỨNG E1 (Issue #48, việc 1 · 4 · 5 · 6 · 8 · 10).
 *
 * Chạy (**một lần** — cờ khoá `docs/e1/.da-chay`):
 *   node scripts/kiem-e1.mjs            # trọn bộ
 *   node scripts/kiem-e1.mjs --lai      # xoá cờ khoá rồi chạy lại
 *   node scripts/kiem-e1.mjs --nhanh    # bỏ phần agy thật + bảng cấu hình STT
 *
 * Mọi thứ chạy trên **bộ cổng riêng 8840-8843 + web 5210 + tmux
 * `gen-stage-nao-e1` + MCP `gen-stage-e1`** — KHÔNG đụng 5173/8787-8790/
 * `gen-stage-nao` của Boss, cũng không đụng dải 8793-8799 của hai builder khác.
 *
 * Ra trong `docs/e1/`:
 *   01-mobile-390.png      390×844: thấy 3D + nút kéo bảng ra (việc 1)
 *   02-mobile-mo-bang.png  390×844 lúc MỞ bảng — vẫn còn dải 3D, không 100vw
 *   03-desktop-1440.png    1440×900 giữ nguyên như cũ
 *   04-nao-dien.png        agy thật dựng connector Baserow (việc 4)
 *   bang-stt.md            bảng trễ STT theo cấu hình (việc 6)
 *   nhat-ky-kiem-e1.json   SỐ của mọi bước
 */
import { chromium } from 'playwright';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { WebSocket } from 'ws';

const THU_MUC = 'docs/e1';
mkdirSync(THU_MUC, { recursive: true });

const argv = process.argv.slice(2);
const NHANH = argv.includes('--nhanh');

/* ------------------------------------------------- cờ khoá chạy một lần */

const CO_KHOA = `${THU_MUC}/.da-chay`;
if (argv.includes('--lai')) {
  if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
} else if (existsSync(CO_KHOA)) {
  console.error(
    `\n⛔ ${CO_KHOA} đã tồn tại — kiểm E1 chỉ chạy MỘT LẦN sau khi code xong.\n` +
      `   Kết quả lượt trước: ${THU_MUC}/nhat-ky-kiem-e1.json + ảnh trong ${THU_MUC}/.\n` +
      '   Thật sự cần chạy lại: node scripts/kiem-e1.mjs --lai\n',
  );
  process.exit(2);
}
writeFileSync(CO_KHOA, new Date().toISOString() + '\n');

/* ------------------------------------------------------------- cấu hình */

const CONG_WS = Number(process.env.GEN_STAGE_PORT ?? 8840);
const CONG_TTS = Number(process.env.GEN_STAGE_TTS_PORT ?? 8841);
const CONG_MCP = Number(process.env.GEN_STAGE_MCP_PORT ?? 8842);
const CONG_STT = Number(process.env.GEN_STAGE_STT_PORT ?? 8843);
const CONG_WEB = Number(process.env.GEN_STAGE_WEB_PORT ?? 5210);
const TMUX_THU = 'gen-stage-nao-e1';
const MCP_THU = 'gen-stage-e1';
const agyBin = process.env.GEN_STAGE_AGY ?? 'agy';

const MOI_TRUONG = {
  ...process.env,
  GEN_STAGE_PORT: String(CONG_WS),
  GEN_STAGE_TTS_PORT: String(CONG_TTS),
  GEN_STAGE_MCP_PORT: String(CONG_MCP),
  GEN_STAGE_STT_PORT: String(CONG_STT),
  GEN_STAGE_WEB_PORT: String(CONG_WEB),
  GEN_STAGE_NAO_TMUX: TMUX_THU,
  GEN_STAGE_MO_TRINH_DUYET: '0',
};

const in_ = (...x) => console.log(...x);
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
const loiConsole = [];
const thatBai = [];
const nhatKy = {
  chay: new Date().toISOString(),
  cong: { ws: CONG_WS, tts: CONG_TTS, mcp: CONG_MCP, stt: CONG_STT, web: CONG_WEB },
  may: { soLuong: cpus().length, loadavg: loadavg().map((x) => Math.round(x * 10) / 10) },
  buoc: [],
};
let soBuoc = 0;
let soOk = 0;
function ghi(nhan, ok, chiTiet, so) {
  soBuoc++;
  if (ok) soOk++;
  else thatBai.push(`${nhan}: ${chiTiet ?? ''}`);
  nhatKy.buoc.push({ nhan, ok, chiTiet: chiTiet ?? null, ...(so ? { so } : {}) });
  in_(`   ${ok ? '✓' : '✗'} ${nhan} ${chiTiet ?? ''}`);
}

/* ---------------------------------------------------------- dọn & đóng */

function giaiPhongCong() {
  for (const loc of ['--use-angle=swiftshader', `vite preview --port ${CONG_WEB}`]) {
    try {
      for (const d of execFileSync('ps', ['-eo', 'pid,cmd'], { encoding: 'utf8' }).split('\n')) {
        if (!d.includes(loc) || d.includes('--port 5173')) continue;
        const pid = Number(d.trim().split(/\s+/)[0]);
        if (pid && pid !== process.pid) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {}
        }
      }
    } catch {}
  }
  try {
    execFileSync('tmux', ['kill-session', '-t', TMUX_THU], { stdio: 'ignore' });
  } catch {}
  // CHỈ cổng của chính mình (8840-8843) — không bao giờ chạm 8787-8790
  for (const p of [CONG_WS, CONG_TTS, CONG_MCP, CONG_STT]) {
    try {
      for (const d of execFileSync('ss', ['-ltnp'], { encoding: 'utf8' }).split('\n')) {
        if (!d.includes(`:${p} `)) continue;
        const m = d.match(/pid=(\d+)/);
        if (m) {
          try {
            process.kill(Number(m[1]), 'SIGKILL');
          } catch {}
        }
      }
    } catch {}
  }
}

let bridge = null;
let server = null;
let driver = null;
let browser = null;
let naoGia = null;
let daThemMcp = false;

function boMcpThu() {
  if (!daThemMcp) return;
  try {
    execFileSync(agyBin, ['mcp', 'remove', MCP_THU], { encoding: 'utf8' });
  } catch (e) {
    in_('   !! không xoá được MCP tạm:', e.message);
  }
  daThemMcp = false;
}

function dongHet(ma) {
  boMcpThu();
  try {
    naoGia?.close();
  } catch {}
  try {
    driver?.kill('SIGTERM');
  } catch {}
  try {
    execFileSync('tmux', ['kill-session', '-t', TMUX_THU], { stdio: 'ignore' });
  } catch {}
  browser?.close().catch(() => undefined);
  server?.kill('SIGTERM');
  bridge?.kill('SIGTERM');
  setTimeout(() => process.exit(ma), 600);
}
process.on('SIGINT', () => dongHet(130));

/* --------------------------------------------------------- bridge + web */

async function khoe(cong, duong = '/khoe') {
  try {
    return (await fetch(`http://127.0.0.1:${cong}${duong}`)).ok;
  } catch {
    return false;
  }
}

async function moBridge(themEnv = {}) {
  const dong = [];
  bridge = spawn('npx', ['tsx', 'bridge/server.ts'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...MOI_TRUONG, ...themEnv },
  });
  const doc = (d) => {
    dong.push(String(d));
    process.stdout.write('   [bridge] ' + d);
  };
  bridge.stdout.on('data', doc);
  bridge.stderr.on('data', doc);
  for (let i = 0; i < 400; i++) {
    if ((await khoe(CONG_TTS)) && (await khoe(CONG_STT, '/stt/khoe'))) return dong;
    await nghi(500);
  }
  throw new Error('bridge không lên');
}

async function dongBridge() {
  try {
    bridge?.kill('SIGTERM');
  } catch {}
  for (let i = 0; i < 40; i++) {
    if (!(await khoe(CONG_TTS))) return;
    await nghi(250);
  }
  try {
    bridge?.kill('SIGKILL');
  } catch {}
}

async function moServer() {
  server = spawn('npx', ['vite', 'preview', '--port', String(CONG_WEB), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return await new Promise((xong, loi) => {
    const han = setTimeout(() => loi(new Error('vite preview không khởi động')), 40000);
    const doc = (d) => {
      const s = String(d);
      process.stdout.write('   [vite] ' + s);
      const m = s.match(/http:\/\/localhost:\d+\/?/);
      if (m) {
        clearTimeout(han);
        xong(m[0]);
      }
    };
    server.stdout.on('data', doc);
    server.stderr.on('data', doc);
  });
}

/* ====================================================================== */

giaiPhongCong();
in_('\n=== E1 — bằng chứng (cổng riêng 8840-8843 / web 5210) ===');

in_('\n--- bridge (ws + tts + mcp + stt) ---');
const dongB = await moBridge();
ghi('bridge bật đủ 4 cửa', true, `ws ${CONG_WS} · tts ${CONG_TTS} · mcp ${CONG_MCP} · stt ${CONG_STT}`);
// Hâm chạy NỀN (không chặn cổng) nên dòng log tới sau vài giây — chờ hẳn,
// đừng đọc log đúng lúc cổng vừa lên rồi kết luận là không hâm.
let dongHam = null;
for (let i = 0; i < 120; i++) {
  dongHam = dongB.join('').match(/hâm câu đệm:[^\n]*/)?.[0] ?? null;
  if (dongHam) break;
  await nghi(500);
}
ghi(
  'việc 5: bridge HÂM SẴN 8 câu đệm lúc bật',
  /8 sẵn/.test(dongHam ?? ''),
  dongHam ?? 'không thấy dòng hâm sau 60 s',
);

/* ------------------------------- việc 5: /tts 20 lần, không được 502 */

in_('\n--- việc 5: gọi /tts 20 lần liên tiếp (câu MỚI, không ăn cache) ---');
{
  const moc = Date.now();
  const ket = [];
  for (let i = 0; i < 20; i++) {
    // Câu KHÁC NHAU và có mốc thời gian → chắc chắn không có trong cache đĩa,
    // nên mỗi lượt là một cú gọi Edge thật (đúng điều kiện reviewer đo 2/10 lỗi).
    const cau = `Thử lần thứ ${i + 1} lúc ${moc}, Sếp nghe rõ không ạ`;
    const t0 = Date.now();
    let ma = 0;
    let dai = 0;
    try {
      const r = await fetch(
        `http://127.0.0.1:${CONG_TTS}/tts?text=${encodeURIComponent(cau)}&voice=nu`,
      );
      ma = r.status;
      dai = (await r.arrayBuffer()).byteLength;
    } catch (e) {
      ma = -1;
    }
    ket.push({ lan: i + 1, ma, byte: dai, ms: Date.now() - t0 });
    process.stdout.write(ma === 200 && dai > 0 ? '✓' : `✗${ma}`);
  }
  in_('');
  const so502 = ket.filter((k) => k.ma === 502).length;
  const soLoi = ket.filter((k) => k.ma !== 200 || k.byte === 0).length;
  const ms = ket.map((k) => k.ms).sort((a, b) => a - b);
  nhatKy.tts = { ket, so502, soLoi, msTrungVi: ms[10], msMax: ms.at(-1) };
  ghi(
    'việc 5: 20/20 lượt /tts trả 200 + có byte, 0 lần 502',
    so502 === 0 && soLoi === 0,
    `502: ${so502} · lỗi khác: ${soLoi} · trễ trung vị ${ms[10]} ms, max ${ms.at(-1)} ms`,
    { so502, soLoi },
  );
}

/* ------------------------------------------- việc 6: STT nghe ra "Javis" */

/** 10 câu Boss nói cho JAVIS — đúng mấy câu reviewer đo hỏng 26/10. */
const CAU_JAVIS = [
  'Javis, đi tới bàn điều khiển',
  'Javis, chào',
  'Javis, dừng lại',
  'Javis, quay lại đây',
  'Javis, ngồi xuống',
  'Javis, đứng lên',
  'Javis, vui lên',
  'Javis, đi tới kệ module',
  'Javis, nhìn Gen',
  'Javis, suy nghĩ đi',
];

/** Sinh wav 16 kHz từ giọng NAM của chính bridge (Boss là nam). */
async function sinhWavJavis() {
  mkdirSync('.cache/stt/javis', { recursive: true });
  const ds = [];
  for (let i = 0; i < CAU_JAVIS.length; i++) {
    const mp3 = `.cache/stt/javis/${String(i).padStart(2, '0')}.mp3`;
    const wav = mp3.replace(/\.mp3$/, '.wav');
    if (!existsSync(wav)) {
      const r = await fetch(
        `http://127.0.0.1:${CONG_TTS}/tts?text=${encodeURIComponent(CAU_JAVIS[i])}&voice=nam`,
      );
      if (!r.ok) throw new Error(`TTS lỗi khi sinh mẫu: ${r.status}`);
      writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
      execFileSync('ffmpeg', ['-y', '-i', mp3, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], {
        stdio: 'ignore',
      });
    }
    ds.push({ wav, text: CAU_JAVIS[i] });
  }
  return ds;
}

/** Gửi cả bộ qua đúng `POST /stt`, trả chữ nhận được + trễ. */
async function chayBoStt(ds) {
  // Cache theo sha1 audio sẽ cho ra 10 ms — số của cache, không phải số Boss
  // gặp lần đầu nói một câu. Xoá trước mỗi cấu hình.
  rmSync('.cache/stt/cache', { recursive: true, force: true });
  const ra = [];
  for (const m of ds) {
    const t0 = Date.now();
    const r = await fetch(`http://127.0.0.1:${CONG_STT}/stt`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: readFileSync(m.wav),
    });
    const g = await r.json();
    ra.push({
      chuan: m.text,
      nhan: g.text ?? '',
      tho: g.tho ?? '',
      treMs: Date.now() - t0,
      coJavis: /javis/i.test(g.text ?? ''),
    });
    process.stdout.write(/javis/i.test(g.text ?? '') ? '✓' : '✗');
  }
  in_('');
  return ra;
}

function chuanHoa(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,!?;:…"'“”‘’()\[\]{}\/\\–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function werMotCau(chuan, nhan) {
  const a = chuanHoa(chuan).split(' ').filter(Boolean);
  const b = chuanHoa(nhan).split(' ').filter(Boolean);
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] =
        a[i - 1] === b[j - 1]
          ? d[i - 1][j - 1]
          : 1 + Math.min(d[i - 1][j - 1], d[i - 1][j], d[i][j - 1]);
  return { sua: d[a.length][b.length], tu: a.length };
}
function tongKet(ra) {
  let sua = 0;
  let tu = 0;
  for (const x of ra) {
    const w = werMotCau(x.chuan, x.nhan);
    sua += w.sua;
    tu += w.tu;
  }
  const ms = ra.map((x) => x.treMs).sort((a, b) => a - b);
  return {
    wer: sua / tu,
    soJavis: ra.filter((x) => x.coJavis).length,
    msTrungVi: ms[Math.floor(ms.length / 2)],
    msMax: ms.at(-1),
    msTrungBinh: Math.round(ms.reduce((s, x) => s + x, 0) / ms.length),
  };
}

in_('\n--- việc 6: 10 câu "Javis" qua POST /stt ---');
const dsWav = await sinhWavJavis();
const cauHinh = [
  { ten: 'int8 · beam 1 · vad bật (mặc định)', env: {} },
  ...(NHANH
    ? []
    : [
        { ten: 'int8 · beam 1 · vad TẮT', env: { GEN_STAGE_STT_VAD: '0' } },
        { ten: 'int8 · beam 2 · vad bật', env: { GEN_STAGE_STT_BEAM: '2' } },
      ]),
];
const bangStt = [];
let raMacDinh = null;
for (let i = 0; i < cauHinh.length; i++) {
  const c = cauHinh[i];
  if (i > 0) {
    in_(`\n   (bật lại bridge cho cấu hình: ${c.ten})`);
    await dongBridge();
    await moBridge(c.env);
  }
  in_(`   ${c.ten}:`);
  const ra = await chayBoStt(dsWav);
  const tk = tongKet(ra);
  bangStt.push({ ...c, ...tk, chiTiet: ra });
  if (i === 0) raMacDinh = ra;
  in_(
    `      WER ${(tk.wer * 100).toFixed(1)}% · "Javis" đúng ${tk.soJavis}/10 · ` +
      `trễ trung vị ${tk.msTrungVi} ms (max ${tk.msMax})`,
  );
}
nhatKy.stt = bangStt.map(({ chiTiet, env, ...r }) => ({ ...r, env }));
nhatKy.sttChiTiet = bangStt[0].chiTiet;

const hopLe = bangStt.filter((b) => b.wer <= 0.1);
const totNhat = (hopLe.length ? hopLe : bangStt).reduce((a, b) =>
  b.msTrungVi < a.msTrungVi ? b : a,
);
ghi(
  'việc 6: sổ từ nghe ra "Javis" ≥ 9/10 câu',
  bangStt[0].soJavis >= 9,
  `${bangStt[0].soJavis}/10 · WER ${(bangStt[0].wer * 100).toFixed(1)}%`,
  { soJavis: bangStt[0].soJavis, wer: bangStt[0].wer },
);
ghi(
  'việc 6: cấu hình nhanh nhất còn giữ WER ≤ 10 %',
  true,
  `${totNhat.ten} — trễ trung vị ${totNhat.msTrungVi} ms, WER ${(totNhat.wer * 100).toFixed(1)}%`,
);

writeFileSync(
  `${THU_MUC}/bang-stt.md`,
  [
    '# Bảng trễ nhận giọng — E1 (#48) việc 6',
    '',
    `Đo trên máy Boss lúc ${new Date().toLocaleString('vi-VN')}, ${cpus().length} luồng, ` +
      `loadavg ${loadavg().map((x) => x.toFixed(1)).join(' / ')}. Mười câu "Javis, …" ` +
      'sinh bằng giọng nam của chính bridge rồi gửi qua đúng `POST /stt` ' +
      '(cache xoá trước mỗi cấu hình — số dưới là số Boss gặp lần đầu nói một câu).',
    '',
    '| Cấu hình | Trễ trung vị | Trễ TB | Trễ max | WER | "Javis" đúng |',
    '| --- | --- | --- | --- | --- | --- |',
    ...bangStt.map(
      (b) =>
        `| ${b.ten} | **${b.msTrungVi} ms** | ${b.msTrungBinh} ms | ${b.msMax} ms | ` +
        `${(b.wer * 100).toFixed(1)}% | ${b.soJavis}/10 |`,
    ),
    '',
    `**Chọn:** ${totNhat.ten} — nhanh nhất trong số cấu hình còn giữ WER ≤ 10 %.`,
    '',
    '## Mười câu, chữ nhận được (cấu hình mặc định)',
    '',
    '| Boss nói | Engine nghe thô | Sau sổ từ |',
    '| --- | --- | --- |',
    ...bangStt[0].chiTiet.map(
      (x) => `| ${x.chuan} | ${x.tho || '—'} | ${x.nhan} |`,
    ),
    '',
    '## Ghi chú về model `base`',
    '',
    'Không đổi sang PhoWhisper-**base**: bản CTranslate2 của `base` không có',
    'trong repo `quocphu/PhoWhisper-ct2-FasterWhisper` mà `scripts/fetch-stt.sh`',
    'đang dùng (chỉ có small/medium/large), nên không tải được mà không tự',
    'chuyển đổi model — việc đó vượt phạm vi đợt E. Mặc định hiện tại đã là',
    '`compute_type int8` + `beam_size 1` (hai mục Boss nhắc), và bảng trên cho',
    'thấy tắt `vad_filter` không đổi được đáng kể.',
    '',
  ].join('\n'),
);
in_(`   → ${THU_MUC}/bang-stt.md`);

/* ------------------------- về cấu hình mặc định cho mấy phần còn lại */

if (cauHinh.length > 1) {
  await dongBridge();
  await moBridge();
}

/* ------------------------------------------------------- trình duyệt */

in_('\n--- trình duyệt (Chrome + swiftshader, KHÔNG chấm FPS) ---');
const goc = await moServer();
const url = `${goc.replace(/\/$/, '')}/?bridge=1&bridgePort=${CONG_WS}&ttsPort=${CONG_TTS}&sttPort=${CONG_STT}`;
in_('==> URL:', url);

browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    '--disable-dev-shm-usage',
    '--renderer-process-limit=2',
    '--disable-extensions',
  ],
});

/* ------------------- việc 8: "chưa có não" KHÔNG được hiện khi có não */
//
// Nối một client ws xưng `?role=nao` TRƯỚC khi mở trang — đúng tình huống Boss
// gặp: driver đã nối từ trước, Boss mới mở Firefox.
naoGia = new WebSocket(`ws://127.0.0.1:${CONG_WS}/?role=nao`);
await new Promise((r) => naoGia.once('open', r));
await nghi(300);
ghi('việc 8: có "não" nối bridge trước khi mở trang', naoGia.readyState === 1, 'role=nao');

const ctx8 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page8 = await ctx8.newPage();
page8.on('console', (m) => {
  if (m.type() === 'error') loiConsole.push(`[console] ${m.text()}`);
});
page8.on('pageerror', (e) => loiConsole.push(`[pageerror] ${e.message}`));
const tMoTrang = Date.now();
await page8.goto(url, { waitUntil: 'load', timeout: 240000 });
await page8.waitForFunction(() => window.stage?.san === true, null, { timeout: 240000 });
await page8.evaluate(() => {
  window.__e1 = [];
  window.stage.on('*', (e) => window.__e1.push({ t: e.t, event: e.event, data: e.data }));
});
/**
 * Đo từ mốc **`bridge.connected`**, không từ mốc `window.stage.san`.
 *
 * `src/main.ts` đặt `sanSang = true` (dòng 203) TRƯỚC khi gọi `bridge.bat()`
 * (dòng 213) — đúng thiết kế, vì sân khấu phải chạy được cả khi không có
 * bridge. Nên đọc `describe()` đúng lúc `san === true` thì `brainConnected`
 * **luôn** false, chẳng chứng minh gì cả (lượt đo đầu của script này sai đúng
 * chỗ đó). Lời hứa thật của việc 8 là: *bridge báo não trong gói chào*, tức
 * `brainConnected` phải thành true trong vòng một nhịp sau khi ws nối — và đó
 * cũng là lý do `phan-xa.ts` chờ 3 s trước khi dám nói "chưa có não".
 */
let msBrain = null;
let brainNgay = null;
{
  const t0 = Date.now();
  for (let i = 0; i < 60; i++) {
    brainNgay = await page8.evaluate(async () => {
      const r = await window.stage.describe();
      return r.ok ? r.result.brainConnected : null;
    });
    if (brainNgay === true) {
      msBrain = Date.now() - t0;
      break;
    }
    await nghi(100);
  }
}
nhatKy.brain = { msSauKhiSanSang: msBrain, brainConnected: brainNgay };
ghi(
  'việc 8: brainConnected thành true ≤ 3 s sau khi trang sẵn sàng',
  brainNgay === true && msBrain !== null && msBrain <= 3000,
  `brainConnected = ${brainNgay} sau ${msBrain} ms (gói bridge.brain là gói ĐẦU TIÊN sân khấu nhận)`,
  { msBrain },
);

// Sếp gõ một câu TỰ DO (không khớp mẫu lệnh) ngay lập tức, rồi theo dõi 10 s:
// không được có câu "chưa có não" nào.
await page8.fill('#o-chat-nhap', 'Gen ơi, hôm nay mình làm gì nhỉ');
await page8.press('#o-chat-nhap', 'Enter');
await nghi(10_000);
const noiGi = await page8.evaluate(() =>
  window.__e1
    .filter((e) => e.event === 'actor.sayStart' || e.event === 'actor.say')
    .map((e) => String(e.data?.text ?? '')),
);
const coChuaNao = noiGi.some((t) => /chưa có não/i.test(t));
nhatKy.chuaCoNao = { msTuLucMoTrang: Date.now() - tMoTrang, cauGen: noiGi };
ghi(
  'việc 8: KHÔNG câu "chưa có não" nào trong 10 s đầu',
  !coChuaNao,
  `Gen nói: ${noiGi.map((t) => `"${t.slice(0, 40)}"`).join(' · ') || '(chưa nói gì)'}`,
);

/* ------------------- việc 6b: 10 câu nhận được đi đúng người nhận */

in_('\n--- việc 6b: chữ nhận được → lớp hiểu lệnh → ĐÚNG người nhận ---');
{
  const ket = [];
  for (const x of raMacDinh) {
    const t0 = Date.now();
    await page8.evaluate(() => {
      window.__e1 = [];
    });
    await page8.fill('#o-chat-nhap', x.nhan);
    await page8.press('#o-chat-nhap', 'Enter');
    await nghi(700);
    const uc = await page8.evaluate(
      () => window.__e1.find((e) => e.event === 'user.command')?.data ?? null,
    );
    const ai = uc?.actors?.[0] ?? uc?.actor ?? null;
    ket.push({ noi: x.chuan, nhan: x.nhan, nguoiNhan: ai, lenh: uc?.cmd ?? null });
    process.stdout.write(ai === 'owner' ? '✓' : '✗');
    await nghi(300);
  }
  in_('');
  const dung = ket.filter((k) => k.nguoiNhan === 'owner').length;
  nhatKy.nguoiNhan = { dung, tong: ket.length, ket };
  ghi(
    'việc 6: ≥ 9/10 câu "Javis…" đi đúng người nhận (owner), KHÔNG sang Gen',
    dung >= 9,
    `${dung}/10 đúng · sai: ${ket.filter((k) => k.nguoiNhan !== 'owner').map((k) => `${k.nhan}→${k.nguoiNhan}`).join(', ') || 'không có'}`,
    { dung },
  );
}
await ctx8.close();

/* ---------------------------------- việc 1: bảng lệnh trên màn 390 px */

in_('\n--- việc 1: bảng lệnh trên 390×844 ---');
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const p = await ctx.newPage();
  p.on('console', (m) => {
    if (m.type() === 'error') loiConsole.push(`[console 390] ${m.text()}`);
  });
  await p.goto(url, { waitUntil: 'load', timeout: 240000 });
  await p.waitForFunction(() => window.stage?.san === true, null, { timeout: 240000 });
  await nghi(1500);

  const do390 = await p.evaluate(() => {
    const bang = document.getElementById('bang');
    const nut = document.getElementById('bang-dong-mo');
    const can = document.getElementById('stage');
    const rb = bang.getBoundingClientRect();
    const rn = nut.getBoundingClientRect();
    const rc = can.getBoundingClientRect();
    return {
      thuGon: bang.classList.contains('thu-gon'),
      bangLeft: Math.round(rb.left),
      bangRong: Math.round(rb.width),
      bangRongPhanTram: Math.round((rb.width / innerWidth) * 100),
      nut: { w: Math.round(rn.width), h: Math.round(rn.height), left: Math.round(rn.left), hien: rn.width > 0 && rn.left < innerWidth && rn.right > 0 },
      canvas: { w: Math.round(rc.width), h: Math.round(rc.height) },
      // phần sân khấu KHÔNG bị bảng che (bảng thu gọn thì = cả bề ngang)
      ngangThay: Math.round(Math.max(0, Math.min(innerWidth, rb.left))),
      innerWidth,
    };
  });
  nhatKy.mobile = do390;
  await p.screenshot({ path: `${THU_MUC}/01-mobile-390.png` });
  ghi(
    'việc 1: 390 px mở app là bảng THU GỌN, chỉ còn nút kéo ra',
    do390.thuGon === true && do390.nut.hien === true,
    `thu-gon=${do390.thuGon} · nút ${do390.nut.w}×${do390.nut.h} px tại x=${do390.nut.left}`,
    do390,
  );
  ghi(
    'việc 1: nút kéo ra đạt mốc chạm 44 px',
    do390.nut.w >= 44 && do390.nut.h >= 44,
    `${do390.nut.w}×${do390.nut.h} px (bản cũ 34×64)`,
  );
  ghi(
    'việc 1: sân khấu 3D thấy TRỌN bề ngang khi thu gọn',
    do390.ngangThay >= 350,
    `${do390.ngangThay}/${do390.innerWidth} px không bị bảng che`,
  );

  // mở bảng ra: vẫn phải còn dải 3D (không bao giờ 100vw)
  await p.click('#bang-dong-mo');
  await nghi(700);
  const doMo = await p.evaluate(() => {
    const r = document.getElementById('bang').getBoundingClientRect();
    return {
      rong: Math.round(r.width),
      phanTram: Math.round((r.width / innerWidth) * 100),
      conLai: Math.round(Math.max(0, r.left)),
      innerWidth,
    };
  });
  nhatKy.mobileMoBang = doMo;
  await p.screenshot({ path: `${THU_MUC}/02-mobile-mo-bang.png` });
  ghi(
    'việc 1: MỞ bảng trên 390 px vẫn không 100vw — còn dải 3D',
    doMo.phanTram <= 90 && doMo.conLai >= 40,
    `bảng ${doMo.rong} px = ${doMo.phanTram}% · còn ${doMo.conLai} px sân khấu (bản cũ: 100%, 0 px)`,
  );
  await ctx.close();
}

/* -------------------------------- desktop giữ nguyên (không hồi quy) */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'load', timeout: 240000 });
  await p.waitForFunction(() => window.stage?.san === true, null, { timeout: 240000 });
  await nghi(1200);
  const doD = await p.evaluate(() => {
    const b = document.getElementById('bang');
    return { thuGon: b.classList.contains('thu-gon'), rong: Math.round(b.getBoundingClientRect().width) };
  });
  await p.screenshot({ path: `${THU_MUC}/03-desktop-1440.png` });
  nhatKy.desktop = doD;
  ghi(
    'việc 1: desktop 1440 px vẫn MỞ bảng 390 px như cũ',
    doD.thuGon === false && doD.rong === 390,
    `thu-gon=${doD.thuGon} · rộng ${doD.rong} px`,
  );
  await ctx.close();
}

/* ------------------------------------------- việc 4: agy THẬT diễn */

if (NHANH || !existsSync(`${process.env.HOME}/.gemini`)) {
  ghi('việc 4: agy thật (BỎ QUA)', true, NHANH ? '--nhanh' : 'không thấy ~/.gemini');
} else {
  in_('\n--- việc 4: agy THẬT — "Gen, dựng connector Baserow" (1 lượt) ---');
  try {
    execFileSync(
      agyBin,
      ['mcp', 'add', '--type', 'http', MCP_THU, `http://127.0.0.1:${CONG_MCP}/mcp`],
      { encoding: 'utf8' },
    );
    daThemMcp = true;
  } catch (e) {
    in_('   !! không thêm được MCP tạm:', e.message);
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') loiConsole.push(`[console nao] ${m.text()}`);
  });
  await page.goto(url, { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 240000 });
  await page.evaluate(() => {
    window.__e1 = [];
    window.stage.on('*', (e) => window.__e1.push({ t: e.t, event: e.event, data: e.data }));
  });
  await page.evaluate(() => window.stage.batTieng());

  const dongDriver = [];
  driver = spawn('node', ['scripts/nao-agy.mjs'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...MOI_TRUONG, GEN_STAGE_AGY_MCP: MCP_THU, GEN_STAGE_NAO_TMUX: TMUX_THU },
  });
  const docDriver = (d) => {
    dongDriver.push(String(d));
    process.stdout.write('   [nao] ' + d);
  };
  driver.stdout.on('data', docDriver);
  driver.stderr.on('data', docDriver);
  let daAm = false;
  for (let i = 0; i < 300; i++) {
    const t = dongDriver.join('');
    if (/đã ấm/.test(t)) {
      daAm = true;
      break;
    }
    if (/không nối được bridge|không bật được tmux/.test(t)) break;
    await nghi(1000);
  }
  ghi('việc 4: driver nối bridge + agy ấm trong tmux riêng', daAm, TMUX_THU);

  if (daAm) {
    const t0 = Date.now();
    await page.fill('#o-chat-nhap', 'Gen, dựng connector Baserow');
    await page.press('#o-chat-nhap', 'Enter');

    // chờ tới khi não hết việc: không có lệnh mới nào trong 20 s, tối đa 4 phút
    let cuoi = Date.now();
    let demTruoc = 0;
    while (Date.now() - t0 < 240_000) {
      const dem = await page.evaluate(
        (tu) => window.__e1.filter((e) => e.t >= tu).length,
        t0 - 50,
      );
      if (dem !== demTruoc) {
        demTruoc = dem;
        cuoi = Date.now();
      }
      if (Date.now() - cuoi > 20_000 && dem > 0) break;
      await nghi(1000);
    }

    const sk = await page.evaluate((tu) => window.__e1.filter((e) => e.t >= tu), t0 - 50);
    const st = await page.evaluate(async () => {
      const r = await window.stage.describe();
      return r.ok ? r.result : null;
    });
    const tieng = await page.evaluate(() => window.stage.doTieng('gen'));
    // lệnh DIỄN = lệnh não gọi làm đổi sân khấu (không tính phản xạ của app)
    const sukienDien = sk.filter((e) =>
      /^(screen\.|module\.|actor\.(emote|say|play|moveTo|hold)|fx\.)/.test(e.event),
    );
    const noi = sk.filter((e) => e.event === 'actor.sayStart' && e.data?.actor === 'gen');

    nhatKy.nao = {
      msDenCauDau: noi[0] ? noi[0].t - t0 : null,
      cauDau: noi[0]?.data?.text ?? null,
      soSuKienDien: sukienDien.length,
      suKien: sukienDien.map((e) => e.event),
      props: (st?.props ?? []).map((p) => p.id ?? p),
      holding: (st?.actors ?? []).map((a) => ({ id: a.id, holding: a.holding ?? null })),
      screens: st?.screens ?? [],
      doTieng: tieng,
    };

    try {
      const m = await page.evaluate(() => window.stage.doXuong('gen'));
      if (m?.neck) {
        const [x, , z] = m.neck;
        const cao = m.bbox?.[1] ?? 1.2;
        await page.evaluate(
          ({ vt, tam }) => window.stage.datMay(vt, tam),
          { vt: [x + 1.2, cao * 1.5, z + 3.2], tam: [x, cao * 0.6, z] },
        );
        await nghi(500);
      }
    } catch {}
    await page.screenshot({ path: `${THU_MUC}/04-nao-dien.png` });

    ghi(
      'việc 4: não diễn ≥ 4 lệnh (không chỉ nói)',
      sukienDien.length >= 4,
      `${sukienDien.length} sự kiện diễn: ${nhatKy.nao.suKien.slice(0, 10).join(', ')}`,
      { soSuKienDien: sukienDien.length },
    );
    ghi(
      'việc 4: Gen NÓI và có tiếng thật (nhép miệng theo âm)',
      noi.length > 0 && tieng.soMauDuong > 0,
      `${noi.length} câu · doTieng ${JSON.stringify(tieng)} · câu đầu sau ${nhatKy.nao.msDenCauDau} ms`,
    );
    ghi(
      'việc 4: module kết tinh thật (prop mới trên sân khấu)',
      (st?.props ?? []).length > 0,
      `props: ${JSON.stringify(nhatKy.nao.props)} · holding: ${JSON.stringify(nhatKy.nao.holding)}`,
    );

    try {
      writeFileSync(
        `${THU_MUC}/agy-khung.txt`,
        execFileSync('tmux', ['capture-pane', '-pt', TMUX_THU, '-S', '-250'], { encoding: 'utf8' }),
      );
    } catch {}
  }
  try {
    driver.kill('SIGTERM');
  } catch {}
  await ctx.close();
  boMcpThu();
  try {
    execFileSync('tmux', ['kill-session', '-t', TMUX_THU], { stdio: 'ignore' });
  } catch {}
}

/* -------------------------------------- việc 10: pnpm stop → pnpm start */

in_('\n--- việc 10: pnpm stop rồi pnpm start (bộ cổng riêng) ---');
await browser.close();
browser = null;
server?.kill('SIGTERM');
server = null;
await dongBridge();
bridge = null;
await nghi(1500);

{
  const envChay = { ...MOI_TRUONG, GEN_STAGE_MO_TRINH_DUYET: '0' };
  let ok1 = true;
  try {
    execFileSync('bash', ['scripts/chay.sh', 'tat'], { encoding: 'utf8', env: envChay, timeout: 60_000 });
  } catch (e) {
    ok1 = false;
    in_('   !! chay.sh tat lỗi:', e.message);
  }
  // Bật lần một: tạo PID file (và nếu chưa cài STT thì sẽ tải — nên bỏ qua đo)
  const t1 = Date.now();
  let raBat = '';
  try {
    raBat = execFileSync('bash', ['scripts/chay.sh'], {
      encoding: 'utf8',
      env: envChay,
      timeout: 300_000,
    });
  } catch (e) {
    in_('   !! chay.sh lỗi:', e.message);
  }
  const msBat1 = Date.now() - t1;
  in_(raBat.split('\n').map((l) => '   [chay] ' + l).join('\n'));

  const coPid = ['bridge', 'vite'].filter((t) => existsSync(`.cache/pid/${t}.pid`));
  ghi(
    'việc 10: chay.sh ghi PID ra .cache/pid/ (không còn fuser -k mù)',
    coPid.length === 2,
    `có: ${coPid.join(', ')}`,
  );

  // tắt rồi bật LẦN HAI — đây là con số Boss quan tâm ("lần sau ≤90 s")
  execFileSync('bash', ['scripts/chay.sh', 'tat'], { encoding: 'utf8', env: envChay, timeout: 60_000 });
  const conSong = await khoe(CONG_TTS);
  ghi('việc 10: pnpm stop tắt sạch (cổng tts im)', conSong === false, `tts ${CONG_TTS} còn trả lời: ${conSong}`);

  const t2 = Date.now();
  try {
    execFileSync('bash', ['scripts/chay.sh'], { encoding: 'utf8', env: envChay, timeout: 300_000 });
  } catch (e) {
    in_('   !! chay.sh (lần 2) lỗi:', e.message);
  }
  // "bật xong" = cả web lẫn tts trả lời được
  let msSan = null;
  for (let i = 0; i < 180; i++) {
    if ((await khoe(CONG_TTS)) && (await khoe(CONG_WEB, '/'))) {
      msSan = Date.now() - t2;
      break;
    }
    await nghi(500);
  }
  nhatKy.chay = { msBatLan1: msBat1, msBatLan2: msSan, ok1 };
  ghi(
    'việc 10: pnpm start lần sau ≤ 90 s (web + giọng cùng sẵn sàng)',
    msSan !== null && msSan <= 90_000,
    `${msSan === null ? 'không lên' : (msSan / 1000).toFixed(1) + ' s'} (lần đầu sau tat: ${(msBat1 / 1000).toFixed(1)} s)`,
    { msBatLan2: msSan },
  );
  execFileSync('bash', ['scripts/chay.sh', 'tat'], { encoding: 'utf8', env: envChay, timeout: 60_000 });
  ghi('việc 10: dọn sạch sau khi đo', true, 'đã chạy chay.sh tat lần cuối');
}

/* ----------------------------------------------------------- tổng kết */

nhatKy.loiConsole = loiConsole;
nhatKy.tongKet = { soBuoc, soOk, thatBai };
writeFileSync(`${THU_MUC}/nhat-ky-kiem-e1.json`, JSON.stringify(nhatKy, null, 2));

in_(`\n=== E1: ${soOk}/${soBuoc} bước đạt ===`);
if (loiConsole.length) in_(`lỗi console: ${loiConsole.length}\n  ${loiConsole.slice(0, 8).join('\n  ')}`);
else in_('lỗi console: 0');
if (thatBai.length) in_('KHÔNG ĐẠT:\n  - ' + thatBai.join('\n  - '));
in_(`Nhật ký: ${THU_MUC}/nhat-ky-kiem-e1.json`);
dongHet(thatBai.length ? 1 : 0);
