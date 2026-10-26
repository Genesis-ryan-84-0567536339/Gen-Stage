/**
 * kiem-g3.mjs — BẰNG CHỨNG G3 (#62): "nhận diện giọng nói tào lao quá".
 *
 * Chạy (**một lần** — cờ khoá `docs/g3/.da-chay`):
 *   node scripts/kiem-g3.mjs          # trọn bộ
 *   node scripts/kiem-g3.mjs --lai    # xoá cờ khoá rồi chạy lại
 *
 * Bộ này chứng minh bốn thứ, trên **Firefox thật** của Boss (không headless,
 * `http://localhost`, hộp hỏi quyền thật — xem `scripts/kiem-f3.mjs` để biết
 * vì sao không dùng Chromium):
 *
 *   1. **Bridge LƯU audio thô mỗi lượt** → `.cache/stt/thu/<ts>.ogg` + `.json`.
 *      Trước G3 bridge chỉ giữ chữ, nên không ai đo được trên giọng Boss.
 *   2. **Nút "✎ Sửa" ghi cặp (giọng, chữ đúng)** → `.cache/stt/mau/<ts>.{ogg,txt}`.
 *   3. **Mic xin đúng ràng buộc** (3 cờ lọc + 16 kHz mono) và **nói ra tên
 *      thiết bị** đang nghe.
 *   4. **15 câu đời thường ra đúng hành động** qua đúng cửa ô chat.
 *
 * Số đo engine (WER/trễ của 4 model trên bộ bẩn) KHÔNG nằm ở đây mà ở
 * `docs/g3/ket-qua.md` — đo bằng `scripts/do-stt.mjs chay`, vì nó mất ~25 phút
 * và không cần trình duyệt.
 *
 * Ra trong `docs/g3/`:
 *   01-nghe-duoc-nut-sua.png   ô chat: chữ nghe được + nút "✎ Sửa"
 *   02-dang-sua.png            sau khi bấm Sửa: nút "✓ Lưu mẫu"
 *   03-toan-canh-1440.png      cả sân khấu
 *   04-mobile-390.png          ô chat + nút trên màn hẹp
 *   nhat-ky-kiem-g3.json       SỐ của từng bước
 */
import { firefox } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const THU_MUC = 'docs/g3';
mkdirSync(THU_MUC, { recursive: true });
const argv = process.argv.slice(2);

/* ------------------------------------------------- cờ khoá chạy một lần */

const CO_KHOA = `${THU_MUC}/.da-chay`;
if (argv.includes('--lai')) {
  if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
} else if (existsSync(CO_KHOA)) {
  console.error(
    `\n⛔ ${CO_KHOA} đã tồn tại — kiểm G3 chỉ chạy MỘT LẦN sau khi code xong.\n` +
      `   Kết quả lượt trước: ${THU_MUC}/nhat-ky-kiem-g3.json + ảnh trong ${THU_MUC}/.\n` +
      '   Thật sự cần chạy lại: node scripts/kiem-g3.mjs --lai\n',
  );
  process.exit(2);
}
writeFileSync(CO_KHOA, new Date().toISOString() + '\n');

/* ------------------------------------------------------------- tiện ích */

/**
 * Cổng RIÊNG cho G3 theo phân công đợt này: **≥ 8940** và web **≥ 5380**.
 * Boss đang giữ 8787-8790 + 5173; G1/G2 chạy song song ở dải riêng của họ.
 */
const CONG_WS = Number(process.env.GEN_STAGE_PORT ?? 8940);
const CONG_TTS = Number(process.env.GEN_STAGE_TTS_PORT ?? 8941);
const CONG_MCP = Number(process.env.GEN_STAGE_MCP_PORT ?? 8942);
const CONG_STT = Number(process.env.GEN_STAGE_STT_PORT ?? 8943);
const CONG_WEB = Number(process.env.GEN_STAGE_WEB_PORT ?? 5380);
const MOI_TRUONG = {
  ...process.env,
  GEN_STAGE_PORT: String(CONG_WS),
  GEN_STAGE_TTS_PORT: String(CONG_TTS),
  GEN_STAGE_MCP_PORT: String(CONG_MCP),
  GEN_STAGE_STT_PORT: String(CONG_STT),
};

const THU = '.cache/stt/thu';
const MAU = '.cache/stt/mau';

/** Câu Boss "nói" vào mic giả. Lấy đúng một câu ĐỜI THƯỜNG của Issue #62. */
const CAU_MOC = 'Gen ơi, qua ghế ngồi đi';
/** Chữ Boss gõ lại khi bấm "✎ Sửa" (giả cảnh engine nghe sai). */
const CHU_SUA = 'Gen ơi, qua ghế ngồi đi';

/** Firefox của Playwright đụng nouveau là chết — ép llvmpipe + X11 (như F3). */
const MOI_TRUONG_FF = { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1', MOZ_ENABLE_WAYLAND: '0' };

const in_ = (...x) => console.log(...x);
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
const thatBai = [];
const nhatKy = {
  chay: new Date().toISOString(),
  issue: 62,
  cong: { ws: CONG_WS, tts: CONG_TTS, mcp: CONG_MCP, stt: CONG_STT, web: CONG_WEB },
  loadavg: readFileSync('/proc/loadavg', 'utf8').trim(),
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

/** Danh sách tệp trong một thư mục (rỗng nếu chưa có). */
const ls = (d) => (existsSync(d) ? readdirSync(d) : []);

/* -------------------------------------------------------- bridge + web */

let bridge = null;
async function khoeStt() {
  try {
    const r = await fetch(`http://127.0.0.1:${CONG_STT}/stt/khoe`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function moBridge() {
  bridge = spawn('npx', ['tsx', 'bridge/server.ts'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: MOI_TRUONG,
  });
  const dong = [];
  const doc = (d) => {
    dong.push(String(d));
    process.stdout.write('   [bridge] ' + d);
  };
  bridge.stdout.on('data', doc);
  bridge.stderr.on('data', doc);
  for (let i = 0; i < 360; i++) {
    const k = await khoeStt();
    if (k?.daCai === true) return dong;
    await nghi(500);
  }
  throw new Error(`bridge không lên (stt ${CONG_STT})`);
}

let web = null;
async function moWeb() {
  web = spawn('npx', ['vite', 'preview', '--port', String(CONG_WEB), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return await new Promise((xong, loi) => {
    const han = setTimeout(() => loi(new Error('vite preview không khởi động')), 60000);
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

/* ---------------------------------- wav câu mốc: lấy từ chính /tts của bridge */

async function lamWavMoc() {
  const u = `http://127.0.0.1:${CONG_TTS}/tts?text=${encodeURIComponent(CAU_MOC)}&voice=nu&rate=25`;
  const mp3 = resolve(tmpdir(), 'gen-stage-g3-moc.mp3');
  const wav = resolve(tmpdir(), 'gen-stage-g3-moc.wav');
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

/**
 * Bọc `getUserMedia`: vẫn gọi bản THẬT của Firefox (luồng quyền là thật), rồi
 * thay nguồn âm bằng wav TTS — và **ghi lại ràng buộc** mã sản phẩm đã xin.
 *
 * Ghi ràng buộc là điểm mới của G3: việc 4 của Issue #62 là "lọc nhiễu/AGC bật
 * trong getUserMedia", mà cái đó không nhìn thấy trên ảnh chụp — chỉ đọc được
 * ở đây. `track.label` cũng lấy từ stream THẬT trước khi thay nguồn, nên toast
 * tên thiết bị là tên thiết bị thật của máy.
 */
function bocGetUserMedia(wavB64) {
  return `(() => {
    window.__gum = [];
    window.__rangBuoc = [];
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
      window.__rangBuoc.push(JSON.parse(JSON.stringify(c)));
      const t0 = performance.now();
      window.__gum.push({ pha: 'goi', t: Math.round(t0) });
      let that2 = null;
      try {
        that2 = await that_(c);
      } catch (e) {
        window.__gum.push({ pha: 'loi', ten: e.name });
        throw e;
      }
      window.__gum.push({ pha: 'duoc', treMs: Math.round(performance.now() - t0) });
      const nhan = that2.getAudioTracks()[0] ? that2.getAudioTracks()[0].label : '';
      window.__thietBiThat = nhan;
      for (const t of that2.getTracks()) t.stop();
      const ctx = new AudioContext();
      const buf = await nguonWav(ctx);
      const dich = ctx.createMediaStreamDestination();
      const track = dich.stream.getAudioTracks()[0];
      // Giữ nhãn thiết bị THẬT trên track giả: toast của mic.ts đọc đúng chỗ này.
      try { Object.defineProperty(track, 'label', { value: nhan, configurable: true }); } catch {}
      let src = null;
      let truoc = false;
      setInterval(() => {
        if (track.enabled === truoc) return;
        truoc = track.enabled;
        try { src && src.stop(); } catch {}
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

async function moTrang(wavB64) {
  const browser = await firefox.launch({
    headless: false,
    firefoxUserPrefs: {
      // = Boss đã bấm "Cho phép" nhưng Firefox KHÔNG nhớ (ca http://localhost)
      'media.navigator.permission.disabled': true,
      'media.navigator.streams.fake': true,
    },
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
  await page.addInitScript(bocGetUserMedia(wavB64));
  await page.goto(
    `http://localhost:${CONG_WEB}/?bridge=1&bridgePort=${CONG_WS}` +
      `&ttsPort=${CONG_TTS}&sttPort=${CONG_STT}`,
    { waitUntil: 'load', timeout: 180000 },
  );
  await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
  await page.evaluate(() => {
    window.__ev = [];
    window.stage.on('*', (e) => window.__ev.push({ t: e.t, event: e.event, data: e.data }));
    window.__toast = [];
    const el = document.getElementById('toast');
    if (el)
      new MutationObserver(() => {
        const c = el.textContent ?? '';
        if (c && window.__toast.at(-1) !== c) window.__toast.push(c);
      }).observe(el, { childList: true, characterData: true, subtree: true });
  });
  return { browser, page, loiConsole, micLog };
}

/* ======================================================= chạy bằng chứng */

in_(`\n--- dựng bridge (cổng ${CONG_WS}-${CONG_STT}) + web ${CONG_WEB} ---`);
await moBridge();
const khoe = await khoeStt();
ghi('bridge bật STT thật', khoe?.daCai === true, JSON.stringify(khoe), khoe);
ghi(
  'bridge khai thư mục thu + mẫu (việc 1 của #62)',
  khoe?.thu === THU && khoe?.mau === MAU,
  `thu=${khoe?.thu} mau=${khoe?.mau}`,
);

/*
 * Dọn SẠCH trước khi đo: cache `/stt` nhớ theo sha1 audio nên không xoá là đo
 * được số của cache; `thu/` và `mau/` phải trống để "có tệp mới" là bằng chứng
 * thật chứ không phải tệp của lượt trước.
 */
rmSync('.cache/stt/cache', { recursive: true, force: true });
rmSync(THU, { recursive: true, force: true });
rmSync(MAU, { recursive: true, force: true });
ghi('dọn cache + thu/ + mau/ trước khi đo', ls(THU).length === 0 && ls(MAU).length === 0);

const wavMoc = await lamWavMoc();
const wavB64 = readFileSync(wavMoc).toString('base64');
in_(`==> mic giả đọc "${CAU_MOC}" (${(wavB64.length / 1365).toFixed(0)} kB)`);

await moWeb();
const { browser, page, loiConsole, micLog } = await moTrang(wavB64);

try {
  /* ============================= việc 4: ràng buộc mic + tên thiết bị */
  in_('\n--- việc 4: getUserMedia xin lọc nhiễu/AGC + 16 kHz mono ---');
  await page.click('#nut-tieng');
  await page.waitForFunction(() => window.stage.micDo().quyen === 'duoc', null, {
    timeout: 30000,
  });
  const rb = await page.evaluate(() => ({
    rangBuoc: window.__rangBuoc,
    thietBiThat: window.__thietBiThat ?? '',
    micDo: window.stage.micDo(),
    toast: window.__toast,
  }));
  const a = rb.rangBuoc[0]?.audio ?? {};
  ghi(
    'ba cờ lọc BẬT: echoCancellation + noiseSuppression + autoGainControl',
    a.echoCancellation === true && a.noiseSuppression === true && a.autoGainControl === true,
    JSON.stringify(a),
    a,
  );
  ghi(
    'xin 16 kHz MONO ngay từ mic (channelCount 1 + sampleRate 16000)',
    a.channelCount === 1 && a.sampleRate === 16000,
    `channelCount=${a.channelCount} sampleRate=${a.sampleRate}`,
  );
  ghi(
    'KHÔNG dùng { exact: … } — mic không chạy nổi 16 kHz vẫn mở được',
    JSON.stringify(a).includes('exact') === false,
    JSON.stringify(a),
  );
  ghi(
    'toast nói ra TÊN THIẾT BỊ mic đang nghe',
    rb.toast.some((t) => t.includes('Đang nghe bằng')),
    JSON.stringify(rb.toast),
    rb.toast,
  );
  ghi(
    'micDo() ghi tên thiết bị để script/Issue đọc được',
    typeof rb.micDo.tenMic === 'string' && rb.micDo.tenMic.length > 0,
    `tenMic "${rb.micDo.tenMic}" (thiết bị thật của máy: "${rb.thietBiThat}")`,
  );

  /* ================== việc 1: giữ V → bridge lưu audio thô mỗi lượt */
  in_('\n--- việc 1: bridge LƯU audio thô mỗi lượt vào .cache/stt/thu/ ---');
  await page.click('#stage', { position: { x: 500, y: 300 } });
  await nghi(300);
  await page.keyboard.down('v');
  await nghi(3200); // đọc hết câu mốc rồi mới nhả, đúng cách Boss giữ phím
  await page.keyboard.up('v');
  await page.waitForFunction(
    () => (document.getElementById('o-chat-nhap')?.value ?? '') !== '',
    null,
    { timeout: 180000 },
  );
  const nghe = await page.evaluate(() => ({
    oChat: document.getElementById('o-chat-nhap').value,
    tt: document.getElementById('o-chat-tt')?.textContent ?? '',
    coNutSua: document.getElementById('o-chat-sua') !== null,
    micDo: window.stage.micDo(),
  }));
  const tepThu = ls(THU);
  const am = tepThu.filter((f) => !f.endsWith('.json'));
  ghi(
    'nghe được chữ tiếng Việt từ giọng đi qua MediaRecorder thật của Firefox',
    nghe.oChat.length > 0,
    `ô chat "${nghe.oChat}" · tin ${nghe.micDo.confidence} · trễ ${nghe.micDo.treMs} ms`,
    nghe.micDo,
  );
  ghi(
    'CÓ TỆP AUDIO THÔ trong .cache/stt/thu/ (trước G3: không có tệp nào)',
    am.length === 1,
    `${tepThu.length} tệp: ${tepThu.join(', ')}`,
    { tepThu },
  );
  const jsThu = tepThu.find((f) => f.endsWith('.json'));
  const soThu = jsThu ? JSON.parse(readFileSync(`${THU}/${jsThu}`, 'utf8')) : null;
  ghi(
    'tệp .json kèm theo ghi đủ chữ + độ tin + dải cắt VAD + model',
    soThu !== null &&
      typeof soThu.text === 'string' &&
      typeof soThu.confidence === 'number' &&
      soThu.cat?.tuMs !== undefined &&
      typeof soThu.model === 'string',
    JSON.stringify(soThu)?.slice(0, 220),
    soThu,
  );
  ghi(
    'dải cắt VAD chừa 200 ms (việc 4 của #62)',
    soThu !== null && soThu.cat.tuMs !== null,
    `tu=${soThu?.cat.tuMs} den=${soThu?.cat.denMs} ms`,
  );
  ghi('mã lượt (ts) có trong gói trả về cho trình duyệt', nghe.micDo.ts?.length > 0, nghe.micDo.ts);

  /* ===================== việc 1b: nút "✎ Sửa" ghi cặp vào mau/ */
  in_('\n--- việc 1b: nút "✎ Sửa" ghi cặp (giọng, chữ đúng) vào .cache/stt/mau/ ---');
  ghi('dòng "nghe được" có nút "✎ Sửa"', nghe.coNutSua, `"${nghe.tt}"`);
  await page.screenshot({
    path: `${THU_MUC}/01-nghe-duoc-nut-sua.png`,
    clip: { x: 0, y: 720, width: 1440, height: 180 },
  });
  await page.click('#o-chat-sua');
  await nghi(200);
  const dangSua = await page.evaluate(() => ({
    coNutLuu: document.getElementById('o-chat-luu') !== null,
    tt: document.getElementById('o-chat-tt')?.textContent ?? '',
    choSua: document.getElementById('o-chat')?.className ?? '',
  }));
  ghi(
    'bấm Sửa → hiện "✓ Lưu mẫu" và HUỶ hẹn tự gửi (không để câu bay đi giữa lúc sửa)',
    dangSua.coNutLuu && !dangSua.choSua.includes('cho-sua'),
    `"${dangSua.tt}" · class ô chat "${dangSua.choSua}"`,
  );
  await page.screenshot({
    path: `${THU_MUC}/02-dang-sua.png`,
    clip: { x: 0, y: 720, width: 1440, height: 180 },
  });
  // Boss gõ lại chữ đúng rồi bấm Lưu
  await page.fill('#o-chat-nhap', CHU_SUA);
  await page.click('#o-chat-luu');
  await nghi(1500);
  const tepMau = ls(MAU);
  const coOgg = tepMau.some((f) => !/\.(txt|json)$/.test(f));
  const txt = tepMau.find((f) => f.endsWith('.txt'));
  ghi(
    'có CẶP (audio, chữ đúng) trong .cache/stt/mau/',
    coOgg && txt !== undefined,
    `${tepMau.length} tệp: ${tepMau.join(', ')}`,
    { tepMau },
  );
  ghi(
    'tệp .txt chứa đúng chữ Boss gõ lại',
    txt !== undefined && readFileSync(`${MAU}/${txt}`, 'utf8').trim() === CHU_SUA,
    txt ? `"${readFileSync(`${MAU}/${txt}`, 'utf8').trim()}"` : 'không có .txt',
  );
  const toastSau = await page.evaluate(() => window.__toast);
  ghi(
    'Boss thấy một dòng xác nhận đã lưu mẫu',
    toastSau.some((t) => t.includes('Đã lưu mẫu')),
    JSON.stringify(toastSau.slice(-2)),
  );

  /* ================= việc 5: 15 câu đời thường ra đúng hành động */
  in_('\n--- việc 5: 15 câu đời thường qua ĐÚNG cửa ô chat ---');
  const BO_15 = [
    ['tôi kêu hai bạn qua ghế ngồi đi', 'actor.sit'],
    ['Gen ơi, qua ghế ngồi đi', 'actor.sit'],
    ['đi qua đây thôi', 'actor.moveTo'],
    ['tôi kêu bạn đi kiếm chỗ ngồi', 'actor.sit'],
    ['bảo Javis đi tới cửa', 'actor.moveTo'],
    ['nhờ Gen qua bàn điều khiển', 'actor.moveTo'],
    ['hai bạn lại đây', 'actor.moveTo'],
    ['cả hai qua bục trung tâm', 'actor.moveTo'],
    ['Gen tới đây coi', 'actor.moveTo'],
    ['kêu Gen vui lên', 'actor.emote'],
    ['mọi người ngồi xuống đi', 'actor.sit'],
    ['Gen ngồi ghế hai đi', 'actor.sit'],
    ['Javis đứng lên đi', 'actor.stand'],
    ['kêu Gen qua kệ module', 'actor.moveTo'],
    ['các bạn qua đây coi', 'actor.moveTo'],
  ];
  const bang = [];
  for (const [cau, cmd] of BO_15) {
    const kq = await page.evaluate(async (c) => {
      await window.stage.guiChat(c);
      await new Promise((r) => setTimeout(r, 420));
      const d = await window.stage.describe();
      return d.ok ? d.result.lastCommand : null;
    }, cau);
    const dung = kq?.cmd === cmd && kq?.matched === true;
    bang.push({ cau, mongDoi: cmd, duoc: kq?.cmd ?? null, actor: kq?.actor ?? null, dung });
    in_(`   ${dung ? '✓' : '✗'} «${cau}» → ${kq?.cmd ?? 'KHÔNG KHỚP'}`);
  }
  const soDung = bang.filter((b) => b.dung).length;
  ghi(
    `15 câu đời thường ra đúng hành động (mốc #62: ≥ 12)`,
    soDung >= 12,
    `${soDung}/15 đúng`,
    bang,
  );
  nhatKy.cauDoiThuong = bang;

  /* ============= việc 5b: câu có tên mà không khớp → tới não kèm hint */
  in_('\n--- việc 5b: câu có tên không khớp mẫu → não nhận hint "co-the-la-lenh" ---');
  const hint = await page.evaluate(async () => {
    window.__ev.length = 0;
    // Nguyên văn log #62 — engine nghe nát, không mẫu nào khớp nổi.
    await window.stage.guiChat('Gen ơi, tôi kêu hai bạn qua hồi đi mà dính dáng hồi đi');
    await new Promise((r) => setTimeout(r, 500));
    const e = window.__ev.filter((x) => x.event === 'user.text').at(-1);
    return e ? { data: e.data } : null;
  });
  ghi(
    'câu nát + có tên → `user.text` mang hint "co-the-la-lenh", KHÔNG handled',
    hint?.data?.hint === 'co-the-la-lenh' && hint?.data?.handled !== true,
    JSON.stringify(hint?.data)?.slice(0, 200),
    hint?.data,
  );

  /* ---------------------------------------------------------- ảnh + console */
  await page.screenshot({ path: `${THU_MUC}/03-toan-canh-1440.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await nghi(700);
  await page.evaluate(() => window.stage.micDo());
  await page.screenshot({ path: `${THU_MUC}/04-mobile-390.png` });

  ghi('console 0 lỗi', loiConsole.length === 0, loiConsole.join(' | ').slice(0, 300), loiConsole);
  nhatKy.micLog = micLog;
  nhatKy.loiConsole = loiConsole;
} catch (e) {
  ghi('chạy trọn bộ', false, e.message);
  nhatKy.loi = e.message;
} finally {
  await browser.close().catch(() => {});
}

/* ----------------------------------------------------------------- kết */

nhatKy.tong = { soBuoc, soOk, thatBai };
writeFileSync(`${THU_MUC}/nhat-ky-kiem-g3.json`, JSON.stringify(nhatKy, null, 2));
in_(`\n=== ${soOk}/${soBuoc} bước đạt · nhật ký: ${THU_MUC}/nhat-ky-kiem-g3.json`);
if (thatBai.length) {
  in_('\nKHÔNG đạt:');
  for (const t of thatBai) in_(`   ✗ ${t}`);
}
dongHet(thatBai.length ? 1 : 0);
