/**
 * kiem-f3.mjs — BẰNG CHỨNG F3 (#56 mục 3): "voice chat không nghe" trên
 * Firefox của Boss — tái hiện, chữa, rồi chứng minh đã nghe được.
 *
 * Chạy (**một lần** — xem cờ khoá `docs/f3/.da-chay`):
 *   node scripts/kiem-f3.mjs           # trọn bộ
 *   node scripts/kiem-f3.mjs --lai     # xoá cờ khoá rồi chạy lại
 *
 * **Vì sao phải là Firefox, không phải Chromium.** Bằng chứng C1 (#31) chạy
 * Chromium với `--use-fake-ui-for-media-stream`: cờ đó **cho quyền ngay**, nên
 * nó không bao giờ gặp cái làm Boss "không nghe" — hộp hỏi quyền của Firefox.
 * Script này dùng đúng Firefox Playwright đã cài (`firefox-1543`), cửa sổ thật
 * (`headless: false`), trên `http://localhost` y như Boss.
 *
 * Ba phần:
 *
 *   A. TÁI HIỆN — Firefox hỏi quyền thật (không tắt prompt). Giữ V như Boss:
 *      `getUserMedia` treo ở hộp hỏi quyền, không bao giờ trả lời.
 *   B. BẢN SỬA — `media.navigator.permission.disabled` = Boss đã bấm "Cho
 *      phép" nhưng Firefox **không nhớ** (đúng ca `http://localhost`). Bấm
 *      "🔊 Bật tiếng" → mic mở và được giữ sẵn → giữ V hai lượt → ô chat hiện
 *      chữ tiếng Việt thật → `user.text` + `user.speech`.
 *   C. TỪ CHỐI — pref `permissions.default.microphone = 2` (Firefox chặn mic
 *      thật) → đúng một dòng hướng dẫn trong toast.
 *
 * **Mic giả**: `getUserMedia` được bọc trong trang — vẫn gọi `getUserMedia`
 * THẬT của Firefox (nên luồng quyền là thật), rồi trả về một stream lấy âm từ
 * **file wav do chính TTS của bridge đọc** câu "Gen ơi, chào Sếp". Firefox
 * không có cách nạp file vào thiết bị giả như cờ của Chrome
 * (`media.navigator.streams.fake` chỉ cho một tiếng bíp), nên đây là cách duy
 * nhất có giọng Việt thật đi qua MediaRecorder thật của Firefox.
 *
 * Ra trong `docs/f3/`:
 *   00-tai-hien-treo.png        Phần A — màn hình lúc giữ V mà quyền còn treo
 *   01-dang-nghe.png            ô chat: "🎤 đang nghe…"
 *   02-dang-nhan-dang.png       ô chat: "⏳ đang nhận dạng…"
 *   03-nghe-duoc.png            ô chat: "nghe được: «Gen ơi chào Sếp»"
 *   04-toan-canh-1440.png       cả sân khấu sau khi nghe được
 *   05-mobile-390.png           ô chat + nút 🎤 trên màn hẹp
 *   06-tu-choi-quyen.png        toast hướng dẫn khi Firefox chặn mic
 *   nhat-ky-kiem-f3.json        SỐ: từng bước mic, quyền, byte, chữ, sự kiện
 */
import { firefox } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const THU_MUC = 'docs/f3';
mkdirSync(THU_MUC, { recursive: true });

const argv = process.argv.slice(2);

/* ------------------------------------------------- cờ khoá chạy một lần */

const CO_KHOA = `${THU_MUC}/.da-chay`;
if (argv.includes('--lai')) {
  if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
} else if (existsSync(CO_KHOA)) {
  console.error(
    `\n⛔ ${CO_KHOA} đã tồn tại — kiểm F3 chỉ chạy MỘT LẦN sau khi code xong.\n` +
      `   Kết quả lượt trước: ${THU_MUC}/nhat-ky-kiem-f3.json + ảnh trong ${THU_MUC}/.\n` +
      '   Thật sự cần chạy lại: node scripts/kiem-f3.mjs --lai\n',
  );
  process.exit(2);
}
writeFileSync(CO_KHOA, new Date().toISOString() + '\n');

/* ------------------------------------------------------------- tiện ích */

/**
 * Cổng RIÊNG cho bằng chứng F3. Boss đang dùng 8787-8790 + 5173, và hai
 * builder khác (F1/F2) chạy song song, nên F3 lấy dải ≥ 8890 / ≥ 5300 theo
 * đúng phân công.
 */
const CONG_WS = Number(process.env.GEN_STAGE_PORT ?? 8894);
const CONG_TTS = Number(process.env.GEN_STAGE_TTS_PORT ?? 8895);
const CONG_MCP = Number(process.env.GEN_STAGE_MCP_PORT ?? 8896);
const CONG_STT = Number(process.env.GEN_STAGE_STT_PORT ?? 8897);
const CONG_WEB = Number(process.env.GEN_STAGE_WEB_PORT ?? 5302);
const MOI_TRUONG = {
  ...process.env,
  GEN_STAGE_PORT: String(CONG_WS),
  GEN_STAGE_TTS_PORT: String(CONG_TTS),
  GEN_STAGE_MCP_PORT: String(CONG_MCP),
  GEN_STAGE_STT_PORT: String(CONG_STT),
};

/** Câu Boss "nói" vào mic giả — câu mốc của F3. */
const CAU_MOC = 'Gen ơi, chào Sếp';

/**
 * Firefox trên máy Boss chạy nouveau; bản Firefox của Playwright đụng driver
 * đó là chết hẳn tiến trình ("nouveau: kernel rejected pushbuf"). Bằng chứng
 * chỉ cần WebGL CHẠY, không cần GPU, nên ép llvmpipe + X11.
 */
const MOI_TRUONG_FF = {
  ...process.env,
  LIBGL_ALWAYS_SOFTWARE: '1',
  MOZ_ENABLE_WAYLAND: '0',
};

const in_ = (...x) => console.log(...x);
const thatBai = [];
const nhatKy = {
  chay: new Date().toISOString(),
  cong: { ws: CONG_WS, tts: CONG_TTS, mcp: CONG_MCP, stt: CONG_STT, web: CONG_WEB },
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

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------- bridge + web */

let bridge = null;
async function moBridge() {
  bridge = spawn('npx', ['tsx', 'bridge/server.ts'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: MOI_TRUONG,
  });
  const dong = [];
  const doc = (d) => {
    const s = String(d);
    dong.push(s);
    process.stdout.write('   [bridge] ' + s);
  };
  bridge.stdout.on('data', doc);
  bridge.stderr.on('data', doc);
  for (let i = 0; i < 240; i++) {
    const k = await khoeStt();
    if (k?.daCai === true) return dong;
    await nghi(500);
  }
  throw new Error(`bridge không lên (stt ${CONG_STT})`);
}

async function khoeStt() {
  try {
    const r = await fetch(`http://127.0.0.1:${CONG_STT}/stt/khoe`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

let web = null;
async function moWeb() {
  web = spawn('npx', ['vite', 'preview', '--port', String(CONG_WEB), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return await new Promise((xong, loi) => {
    const han = setTimeout(() => loi(new Error('vite preview không khởi động')), 30000);
    const doc = (d) => {
      const s = String(d);
      process.stdout.write('   [vite] ' + s);
      const m = s.match(/http:\/\/localhost:\d+\/?/);
      if (m) {
        clearTimeout(han);
        xong(m[0]);
      }
    };
    web.stdout.on('data', doc);
    web.stderr.on('data', doc);
  });
}

function dongHet(ma) {
  web?.kill('SIGTERM');
  bridge?.kill('SIGTERM');
  process.exit(ma);
}

/* ------------------------------------------- wav "Gen ơi, chào Sếp" thật */

/**
 * Lấy giọng từ chính `/tts` của bridge rồi đổi sang wav 48 kHz: đó là nguồn
 * âm duy nhất trong bộ kiểm này, và nó là giọng Việt thật chứ không phải
 * tiếng bíp của `media.navigator.streams.fake`.
 */
async function lamWavMoc() {
  const u = `http://127.0.0.1:${CONG_TTS}/tts?text=${encodeURIComponent(CAU_MOC)}&voice=nu`;
  const mp3 = resolve(tmpdir(), 'gen-stage-f3-moc.mp3');
  const wav = resolve(tmpdir(), 'gen-stage-f3-moc.wav');
  const r = await fetch(u);
  if (!r.ok) throw new Error(`/tts trả ${r.status}`);
  writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
  const ff = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', mp3, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', wav,
  ]);
  if (ff.status !== 0) throw new Error(`ffmpeg lỗi: ${String(ff.stderr).slice(0, 200)}`);
  return wav;
}

/* ------------------------------------------------------- Firefox + trang */

/**
 * Bọc `getUserMedia`: vẫn gọi bản THẬT của Firefox (để luồng quyền là thật,
 * kể cả khi nó treo ở hộp hỏi quyền), rồi thay nguồn âm bằng file wav.
 *
 * `window.__gum` ghi từng pha — đây là chỗ nhìn ra "treo ở hộp hỏi quyền":
 * có `goi` mà không có `duoc`/`loi`.
 */
function bocGetUserMedia(wavB64) {
  return `(() => {
    window.__gum = [];
    const that = navigator.mediaDevices;
    const that_ = that.getUserMedia.bind(that);
    const b64 = "${wavB64}";
    let am = null;
    async function nguonWav(ctx) {
      if (!am) {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        am = await ctx.decodeAudioData(u8.buffer);
      }
      return am;
    }
    that.getUserMedia = async (c) => {
      const t0 = performance.now();
      window.__gum.push({ pha: 'goi', t: Math.round(t0) });
      let that2 = null;
      try {
        that2 = await that_(c);
      } catch (e) {
        window.__gum.push({ pha: 'loi', treMs: Math.round(performance.now() - t0), ten: e.name });
        throw e;
      }
      window.__gum.push({ pha: 'duoc', treMs: Math.round(performance.now() - t0) });
      // Quyền đã đi qua Firefox thật; giờ thay nguồn âm bằng wav TTS.
      for (const t of that2.getTracks()) t.stop();
      const ctx = new AudioContext();
      const buf = await nguonWav(ctx);
      const dich = ctx.createMediaStreamDestination();
      /*
       * Phát LẠI TỪ ĐẦU mỗi khi track được bật tiếng.
       *
       * Để loop chạy nền liên tục thì lượt nói thứ hai bắt đúng giữa câu
       * ("chào sếp gates ơi chào sếp" — đo thật ở lượt chạy trước). Mic giữ
       * sẵn chỉ bật/tắt track.enabled, nên bám đúng mép lên của cờ đó là mô
       * phỏng đúng "Boss bắt đầu nói khi bấm V".
       */
      const track = dich.stream.getAudioTracks()[0];
      let src = null;
      let truoc = false;
      setInterval(() => {
        if (track.enabled === truoc) return;
        truoc = track.enabled;
        try { src?.stop(); } catch {}
        src = null;
        if (!truoc) return;
        src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(dich);
        src.start();
      }, 30);
      return dich.stream;
    };
  })()`;
}

async function moTrang(prefs, wavB64, { bridge: coBridge = true } = {}) {
  const browser = await firefox.launch({
    headless: false,
    firefoxUserPrefs: prefs,
    env: MOI_TRUONG_FF,
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const loiConsole = [];
  const micLog = [];
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('[mic]')) micLog.push(t);
    if (m.type() === 'error') loiConsole.push(`[console] ${t}`);
  });
  page.on('pageerror', (e) => loiConsole.push(`[pageerror] ${e.message}`));
  if (wavB64) await page.addInitScript(bocGetUserMedia(wavB64));
  const url =
    `http://localhost:${CONG_WEB}/?bridge=${coBridge ? 1 : 0}&bridgePort=${CONG_WS}` +
    `&ttsPort=${CONG_TTS}&sttPort=${CONG_STT}`;
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
  await page.evaluate(() => {
    window.__ev = [];
    window.stage.on('*', (e) => window.__ev.push({ t: e.t, event: e.event, data: e.data }));
    /*
     * Ghi MỌI lần dòng trạng thái đổi chữ, thay vì hỏi thăm theo nhịp: khi
     * bridge trả lời từ cache thì "⏳ đang nhận dạng…" chỉ sống vài chục mili
     * giây, hỏi thăm kiểu nào cũng lỡ. `MutationObserver` không lỡ cái nào.
     */
    window.__tt = [];
    const el = document.getElementById('o-chat-tt');
    if (el) {
      const doc = () => window.__tt.push({ t: Date.now(), chu: el.textContent ?? '', an: el.hidden });
      doc();
      new MutationObserver(doc).observe(el, {
        childList: true, characterData: true, subtree: true, attributes: true,
      });
    }
  });
  return { browser, page, loiConsole, micLog };
}

/* ======================================================= chạy bằng chứng */

in_('\n--- dựng bridge (cổng riêng 8894-8897) + web 5302 ---');
await moBridge();
const khoe = await khoeStt();
ghi('bridge bật STT thật', khoe?.daCai === true, JSON.stringify(khoe));

/*
 * Xoá cache `/stt` trước khi đo: `bridge/stt.ts` nhớ kết quả theo sha1 audio,
 * nên chạy lại trên cùng file mà không xoá thì ra vài chục ms — số của cache,
 * không phải số Boss gặp khi nói lần đầu.
 */
rmSync('.cache/stt/cache', { recursive: true, force: true });

const wavMoc = await lamWavMoc();
const wavB64 = readFileSync(wavMoc).toString('base64');
in_(`==> mic giả đọc "${CAU_MOC}" (${wavMoc}, ${(wavB64.length / 1365).toFixed(0)} kB)`);

// Bridge nghe đúng file đó qua chính POST /stt — mốc để so với chữ ô chat.
{
  const r = await fetch(`http://127.0.0.1:${CONG_STT}/stt`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: readFileSync(wavMoc),
  });
  const g = await r.json();
  ghi(
    `bridge /stt nghe ra câu mốc từ chính wav này`,
    typeof g.text === 'string' && g.text.length > 0,
    `"${g.text}" · tin ${g.confidence}`,
    g,
  );
  nhatKy.sttThang = g;
}

await moWeb();

/* =============================================== PHẦN A: TÁI HIỆN CA BOSS */

in_('\n--- phần A: Firefox HỎI QUYỀN thật — đúng ca Boss gặp ---');
{
  // KHÔNG tắt prompt: đây mới là Firefox của Boss. `streams.fake` chỉ để khỏi
  // chạm vào mic thật của Boss nếu lỡ có ai bấm Cho phép.
  const { browser, page, micLog } = await moTrang(
    { 'media.navigator.streams.fake': true },
    null,
    { bridge: false },
  );
  const quyen = await page.evaluate(async () => {
    try {
      return (await navigator.permissions.query({ name: 'microphone' })).state;
    } catch (e) {
      return 'loi:' + e.message;
    }
  });
  ghi('Firefox báo quyền mic = "prompt" (chưa cho, sẽ hỏi)', quyen === 'prompt', quyen);

  await page.click('#stage', { position: { x: 500, y: 300 } });
  await nghi(300);
  await page.keyboard.down('v');
  await nghi(2500);
  /*
   * KHÔNG có ảnh hộp hỏi quyền trong bộ này, và đó là giới hạn thật chứ không
   * phải quên: hộp hỏi quyền là **giao diện trình duyệt** nên
   * `page.screenshot()` không thấy, còn chụp cả màn hình thì phiên GNOME
   * Wayland của Boss trả về ảnh đen (`gnome-screenshot` phải rơi về X11, mà
   * cửa sổ Wayland không nằm trong root window của Xwayland). Bằng chứng thay
   * thế là SỐ: `getUserMedia` có pha `goi` mà không bao giờ có `duoc`/`loi`.
   */
  await page.screenshot({ path: `${THU_MUC}/00-tai-hien-treo.png` });
  const giua = await page.evaluate(() => ({
    gum: window.__gum ?? null,
    nut: document.getElementById('nut-mic')?.className ?? null,
    micDo: window.stage.micDo(),
  }));
  await page.keyboard.up('v');
  await nghi(2000);
  const sau = await page.evaluate(() => ({
    oChat: document.getElementById('o-chat-nhap')?.value ?? '',
    micDo: window.stage.micDo(),
  }));

  ghi(
    'giữ V → getUserMedia TREO ở hộp hỏi quyền (không duoc/loi)',
    giua.micDo.buoc?.some((d) => d.includes('xin quyền mic')) === true &&
      giua.nut === '' &&
      giua.micDo.soMauRms === 0,
    `nút "${giua.nut}" · ${giua.micDo.soMauRms} mẫu RMS · quyền ${giua.micDo.quyen}`,
    giua.micDo,
  );
  ghi(
    'nhả V → ô chat vẫn trống (đúng "voice chat không nghe" của Boss)',
    sau.oChat === '' && sau.micDo.byteGui === 0,
    `ô chat "${sau.oChat}" · ${sau.micDo.byteGui} byte gửi`,
  );
  ghi(
    'KHÁC BẢN CŨ: mọi bước đều có log [mic] để đọc ra nguyên nhân',
    micLog.length > 0,
    `${micLog.length} dòng · vd: ${micLog.at(-1) ?? '-'}`,
  );
  ghi(
    'getUserMedia có "goi" mà KHÔNG có "duoc"/"loi" — treo ở hộp hỏi quyền',
    Array.isArray(giua.gum) === false || // không bọc ở phần A → đọc qua log mic
      giua.gum.every((x) => x.pha === 'goi'),
    JSON.stringify(giua.gum),
    giua.gum,
  );
  nhatKy.phanA = { quyen, giua, sau, micLog };
  await browser.close();
}

/* ============================= PHẦN B: BẢN SỬA — xin quyền ở nút Bật tiếng */

in_('\n--- phần B: Boss đã cho quyền, Firefox KHÔNG nhớ (ca http://localhost) ---');
{
  const { browser, page, loiConsole, micLog } = await moTrang(
    {
      // = Boss đã bấm "Cho phép". `permissions.query` vẫn trả "prompt", đúng
      // như Firefox thật trên http://localhost không cho tick "ghi nhớ".
      'media.navigator.permission.disabled': true,
      'media.navigator.streams.fake': true,
    },
    wavB64,
  );

  /* ---------------------------------------- nút "Bật tiếng" xin luôn quyền */
  const coNut = await page.evaluate(() => document.getElementById('nut-tieng') !== null);
  ghi('nút "🔊 Bật tiếng" có mặt để Boss cho quyền bằng MỘT cú bấm', coNut);
  await page.click('#nut-tieng');
  await page.waitForFunction(() => window.stage.micDo().quyen === 'duoc', null, {
    timeout: 20000,
  });
  const sauBam = await page.evaluate(() => ({
    micDo: window.stage.micDo(),
    gum: window.__gum,
    toast: document.getElementById('toast')?.textContent ?? '',
  }));
  ghi(
    'bấm "Bật tiếng" → mic mở, Firefox không nhớ quyền → GIỮ SẴN cả phiên',
    sauBam.micDo.quyen === 'duoc' &&
      sauBam.micDo.nhoQuyen === false &&
      sauBam.micDo.giuStream === true,
    `quyền ${sauBam.micDo.quyen} · nhớ ${sauBam.micDo.nhoQuyen} · giữ ${sauBam.micDo.giuStream}`,
    sauBam.micDo,
  );
  ghi(
    'toast nói rõ Boss đang ở trạng thái nào',
    sauBam.toast.includes('Mic'),
    `"${sauBam.toast}"`,
  );
  const soGoi1 = sauBam.gum.filter((x) => x.pha === 'goi').length;

  /* ------------------------------------------------ lượt nói 1: giữ phím V */
  await page.click('#stage', { position: { x: 500, y: 300 } });
  await nghi(300);
  const moc1 = Date.now();
  await page.keyboard.down('v');
  await nghi(900);
  const dangNghe = await page.evaluate(() => ({
    tt: document.getElementById('o-chat-tt')?.textContent ?? '',
    an: document.getElementById('o-chat-tt')?.hidden ?? true,
    nut: document.getElementById('nut-mic')?.className ?? '',
  }));
  await page.screenshot({
    path: `${THU_MUC}/01-dang-nghe.png`,
    clip: { x: 0, y: 730, width: 1440, height: 170 },
  });
  await nghi(2600); // đọc hết câu mốc rồi mới nhả — đúng cách Boss giữ phím
  await page.keyboard.up('v');
  ghi(
    'giữ V → nút 🎤 đỏ + ô chat hiện "🎤 đang nghe…"',
    dangNghe.tt === '🎤 đang nghe…' && dangNghe.an === false && dangNghe.nut.includes('dang-ghi'),
    `"${dangNghe.tt}" · ẩn ${dangNghe.an} · nút "${dangNghe.nut}"`,
  );

  await nghi(400);
  await page.screenshot({
    path: `${THU_MUC}/02-dang-nhan-dang.png`,
    clip: { x: 0, y: 730, width: 1440, height: 170 },
  });

  await page.waitForFunction(
    () => (document.getElementById('o-chat-nhap')?.value ?? '') !== '',
    null,
    { timeout: 120000 },
  );
  const nghe = await page.evaluate(() => ({
    oChat: document.getElementById('o-chat-nhap').value,
    tt: document.getElementById('o-chat-tt')?.textContent ?? '',
    chuoiTt: (window.__tt ?? []).map((x) => x.chu),
    micDo: window.stage.micDo(),
  }));
  ghi(
    'ô chat đi đủ 3 trạng thái: đang nghe → đang nhận dạng → nghe được',
    nghe.chuoiTt.some((c) => c.includes('đang nghe')) &&
      nghe.chuoiTt.some((c) => c.includes('nhận dạng')) &&
      nghe.chuoiTt.some((c) => c.startsWith('nghe được')),
    JSON.stringify(nghe.chuoiTt),
    nghe.chuoiTt,
  );
  await page.screenshot({
    path: `${THU_MUC}/03-nghe-duoc.png`,
    clip: { x: 0, y: 720, width: 1440, height: 180 },
  });
  const chuanHoa = (s) =>
    String(s ?? '').toLowerCase().normalize('NFC').replace(/[.,!?]/g, '').replace(/\s+/g, ' ').trim();
  ghi(
    `ô chat hiện ĐÚNG câu mốc "${CAU_MOC}"`,
    chuanHoa(nghe.oChat) === chuanHoa(CAU_MOC),
    `nhận "${nghe.oChat}" · tin ${nghe.micDo.confidence} · trễ ${nghe.micDo.treMs} ms`,
    { oChat: nghe.oChat, confidence: nghe.micDo.confidence, treMs: nghe.micDo.treMs },
  );
  ghi(
    'dòng trạng thái báo "nghe được: «…»"',
    nghe.tt.startsWith('nghe được:'),
    `"${nghe.tt}"`,
  );
  ghi(
    'MediaRecorder của Firefox cho opus và ffmpeg nhận được',
    String(nghe.micDo.dangBlob).includes('opus') && nghe.micDo.byteGui > 1000,
    `${nghe.micDo.byteGui} byte "${nghe.micDo.dangBlob}"`,
    { byteGui: nghe.micDo.byteGui, dangBlob: nghe.micDo.dangBlob },
  );
  ghi(
    'mic đo được tiếng thật (RMS > 0, có dải nói)',
    nghe.micDo.soMauRms > 10 && nghe.micDo.dinhRms > 0 && nghe.micDo.coTieng === true,
    `${nghe.micDo.soMauRms} mẫu · đỉnh ${Number(nghe.micDo.dinhRms).toFixed(4)} · coTieng ${nghe.micDo.coTieng}`,
  );

  /* ------------------------------ tự gửi 1,5 s → user.text + user.speech */
  async function choSuKien(ten, tu, hanMs = 30000) {
    const het = Date.now() + hanMs;
    while (Date.now() < het) {
      const co = await page.evaluate(
        ({ ten, tu }) => window.__ev.find((e) => e.event === ten && e.t >= tu) ?? null,
        { ten, tu },
      );
      if (co) return co;
      await nghi(250);
    }
    return null;
  }
  const ut = await choSuKien('user.text', moc1);
  const us = await choSuKien('user.speech', moc1);
  ghi(
    'tự gửi sau 1,5 s → user.text (owner)',
    ut !== null && ut.data.actor === 'owner',
    ut ? JSON.stringify(ut.data).slice(0, 140) : 'không thấy',
  );
  ghi(
    'bắn user.speech { text, confidence, durationMs, goiGen }',
    us !== null && typeof us.data.text === 'string' && typeof us.data.confidence === 'number',
    us ? JSON.stringify(us.data).slice(0, 180) : 'không thấy',
    us?.data,
  );
  nhatKy.userSpeech = us?.data ?? null;

  /* --------------------- lượt nói 2: KHÔNG hỏi quyền lại (mic giữ sẵn) */
  await nghi(1500);
  await page.click('#stage', { position: { x: 500, y: 300 } });
  await page.keyboard.down('v');
  await nghi(3400);
  await page.keyboard.up('v');
  await page.waitForFunction(
    () => (document.getElementById('o-chat-nhap')?.value ?? '') !== '',
    null,
    { timeout: 120000 },
  );
  const luot2 = await page.evaluate(() => ({
    oChat: document.getElementById('o-chat-nhap').value,
    gum: window.__gum,
    micDo: window.stage.micDo(),
  }));
  const soGoi2 = luot2.gum.filter((x) => x.pha === 'goi').length;
  ghi(
    'lượt nói thứ hai KHÔNG gọi getUserMedia lần nữa (không hộp hỏi quyền)',
    soGoi2 === soGoi1 && soGoi1 === 1,
    `getUserMedia gọi ${soGoi1} lần lúc bấm "Bật tiếng", vẫn ${soGoi2} sau 2 lượt nói`,
    { soGoi1, soGoi2 },
  );
  ghi(
    'lượt nói thứ hai cũng ra chữ',
    chuanHoa(luot2.oChat) === chuanHoa(CAU_MOC),
    `"${luot2.oChat}"`,
  );

  /* ------------------------------------------------------- ảnh bố cục */
  await nghi(2500);
  await page.screenshot({ path: `${THU_MUC}/04-toan-canh-1440.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await nghi(1200);
  await page.evaluate(() => window.stage.micDo());
  await page.screenshot({ path: `${THU_MUC}/05-mobile-390.png` });
  const nutMobile = await page.evaluate(() => {
    const b = document.getElementById('nut-mic');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { rong: Math.round(r.width), cao: Math.round(r.height), trongMan: r.right <= 390 };
  });
  ghi(
    'nút 🎤 vẫn bấm được trên màn 390 px (mốc chạm 44 px)',
    nutMobile !== null && nutMobile.cao >= 44 && nutMobile.trongMan === true,
    JSON.stringify(nutMobile),
    nutMobile,
  );

  ghi('0 lỗi console ở phần B', loiConsole.length === 0, loiConsole.slice(0, 3).join(' | '));
  nhatKy.phanB = {
    sauBam: sauBam.micDo,
    nghe: nghe.micDo,
    oChat: nghe.oChat,
    oChatLuot2: luot2.oChat,
    soGoiGetUserMedia: { sauBatTieng: soGoi1, sauHaiLuotNoi: soGoi2 },
    micLog,
    loiConsole,
  };
  await browser.close();
}

/* ================================================= PHẦN C: TỪ CHỐI QUYỀN */

in_('\n--- phần C: Firefox CHẶN mic (permissions.default.microphone = 2) ---');
{
  const { browser, page, micLog } = await moTrang(
    { 'permissions.default.microphone': 2 },
    null,
    { bridge: false },
  );
  await page.click('#nut-tieng');
  await page.waitForFunction(
    () => (document.getElementById('toast')?.textContent ?? '').includes('Mic bị chặn'),
    null,
    { timeout: 20000 },
  );
  const tc = await page.evaluate(() => ({
    toast: document.getElementById('toast').textContent,
    micDo: window.stage.micDo(),
  }));
  await page.screenshot({
    path: `${THU_MUC}/06-tu-choi-quyen.png`,
    clip: { x: 0, y: 0, width: 1440, height: 200 },
  });
  ghi(
    'bị chặn → đúng MỘT dòng hướng dẫn việc Boss phải làm',
    tc.toast.includes('Mic bị chặn') && tc.toast.includes('thanh địa chỉ'),
    `"${tc.toast}"`,
  );
  ghi(
    'trạng thái quyền ghi lại đúng là "tu-choi"',
    tc.micDo.quyen === 'tu-choi',
    `quyền ${tc.micDo.quyen} · log: ${(tc.micDo.buoc ?? []).at(-1) ?? '-'}`,
  );
  nhatKy.phanC = { toast: tc.toast, micDo: tc.micDo, micLog };
  await browser.close();
}

/* --------------------------------------------------------------- kết luận */

nhatKy.tongKet = { soBuoc, soOk, thatBai };
writeFileSync(`${THU_MUC}/nhat-ky-kiem-f3.json`, JSON.stringify(nhatKy, null, 2) + '\n');
in_(`\n==> ${soOk}/${soBuoc} bước đạt. Nhật ký: ${THU_MUC}/nhat-ky-kiem-f3.json`);
if (thatBai.length) in_('!! Chưa đạt:\n   - ' + thatBai.join('\n   - '));
dongHet(thatBai.length ? 1 : 0);
