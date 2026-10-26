/**
 * kiem-i1.mjs — BẰNG CHỨNG I1 (#74): **phản ứng tức thì ba tầng**.
 *
 * Chạy (**một lần** — cờ khoá `docs/i1/.da-chay`):
 *   node scripts/kiem-i1.mjs          # trọn bộ
 *   node scripts/kiem-i1.mjs --lai    # xoá cờ khoá rồi chạy lại
 *
 * Mọi số dưới đây đo trên **Firefox thật** (`firefox-1543`, không headless,
 * `http://localhost`), cổng RIÊNG 8970-8973 + web 5397: **không đụng**
 * 5173/8787-8790 lẫn tmux `gen-stage-nao` của Boss. Xem `MOI_TRUONG_FF` để
 * biết vì sao bộ này chạy llvmpipe mà vẫn không phạm Cửa 1.
 *
 * Mốc thời gian lấy từ **hai cái sổ của chính app**, không từ ảnh chụp:
 *   - bus sự kiện (`window.stage.on('*')` → `e.t`),
 *   - nhật ký lệnh (`window.stage.log()` → `{ t, cmd, args, ok, nguon }`).
 * Nhờ vậy đo được cả thứ không nhìn thấy trên khung hình (cái gật, cú
 * `lookAt`), và kiểm được **`ok` của MỌI lệnh** trong cả phiên.
 *
 * **Não giả** là một client ws thật của bridge tự xưng `?role=nao` (đúng vai
 * mà `scripts/nao-agy.mjs` dùng), trả lời sau N giây — N đổi được giữa các
 * bước để dựng đúng hai cảnh Issue #74 đòi đo trên trình duyệt: **8 s** và
 * **2 s**. Cảnh 25 s (câu "hơi lâu") đo bằng đồng hồ tiêm trong
 * `src/api/__tests__/i1-phan-ung-tuc-thi.test.ts` — bắt Firefox đứng chờ 25
 * giây thật chỉ để xem một câu thì không thêm thông tin nào.
 *
 * Bảy thước đo của Issue:
 *   1. t(`user.listening on`) → t(`actor.lookAt` của Nhi) ≤150 ms
 *   2. t(`user.text`) → t(gật, tức `actor.listening`) ≤300 ms
 *   3. t(`user.text`) → t(câu đệm **bắt đầu phát**) ≤400 ms
 *   4. não trễ 8 s: ≥1 đổi tư thế + ĐÚNG 1 câu nối
 *   5. não trả lời ở 2 s: không câu nối, việc chêm bị cắt, não nói ngay
 *   6. đang bận (clip lặp của não): vẫn `lookAt` ≤300 ms, **hàng đợi không mất**
 *   7. **trần tầng 2** (vòng 2): não im 60 s → sau 30 s có câu kết, số emote
 *      của phản xạ NGỪNG tăng, và nhịp thường (thả mắt về chỗ cũ) sống lại
 *   8. **ĐỈNH SỐ GIỌNG CÙNG PHÁT = 1** trong MỌI ca (vòng 2) — đo ở tầng
 *      audio thật bằng móc `AudioBufferSourceNode.start`/`ended`, không phải
 *      đếm `actor.sayStart` của một actor (xem ghi chú ở `dinhGiong`)
 *   9. console 0 lỗi · mọi lệnh `ok`
 *
 * Ra trong `docs/i1/`:
 *   01-tang-0-nghe-mic.png    Nhi vừa quay về máy quay lúc Boss bấm mic
 *   02-tang-2-dang-nghi.png   tư thế nghĩ + câu nối trong lúc chờ não
 *   03-nao-tra-loi.png        não đã nói, Nhi về dáng chú ý
 *   04-mobile-390.png         màn hẹp
 *   nhat-ky-kiem-i1.json      SỐ của từng mốc
 *   bang.md                   bảng số đo, dán thẳng vào mô tả PR
 */
import { firefox } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { WebSocket } from 'ws';

const THU_MUC = 'docs/i1';
mkdirSync(THU_MUC, { recursive: true });
const argv = process.argv.slice(2);

/* ------------------------------------------------- cờ khoá chạy một lần */

const CO_KHOA = `${THU_MUC}/.da-chay`;
if (argv.includes('--lai')) {
  if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
} else if (existsSync(CO_KHOA)) {
  console.error(
    `\n⛔ ${CO_KHOA} đã tồn tại — kiểm I1 chỉ chạy MỘT LẦN sau khi code xong.\n` +
      `   Kết quả lượt trước: ${THU_MUC}/nhat-ky-kiem-i1.json + ${THU_MUC}/bang.md\n` +
      '   Thật sự cần chạy lại: node scripts/kiem-i1.mjs --lai\n',
  );
  process.exit(2);
}
writeFileSync(CO_KHOA, new Date().toISOString() + '\n');

/* ------------------------------------------------------------- cổng riêng */

const CONG_WS = Number(process.env.GEN_STAGE_PORT ?? 8970);
const CONG_TTS = Number(process.env.GEN_STAGE_TTS_PORT ?? 8971);
const CONG_MCP = Number(process.env.GEN_STAGE_MCP_PORT ?? 8972);
const CONG_STT = Number(process.env.GEN_STAGE_STT_PORT ?? 8973);
const CONG_WEB = Number(process.env.GEN_STAGE_WEB_PORT ?? 5397);
const MOI_TRUONG = {
  ...process.env,
  GEN_STAGE_PORT: String(CONG_WS),
  GEN_STAGE_TTS_PORT: String(CONG_TTS),
  GEN_STAGE_MCP_PORT: String(CONG_MCP),
  GEN_STAGE_STT_PORT: String(CONG_STT),
};
/**
 * Firefox qua X11 + **llvmpipe**, như `scripts/kiem-g3.mjs`.
 *
 * Đã thử GPU thật (chỉ `MOZ_ENABLE_WAYLAND=0` / `MOZ_X11_EGL=0`, đúng môi
 * trường F2 dùng) và nó chết đúng cái cạm bẫy F2 (#56) đã ghi: *"nouveau:
 * kernel rejected pushbuf: No such device · Exiting due to channel error"* —
 * nặng hơn khi có nhiều phiên Firefox khác đang dùng cùng GPU.
 *
 * **Vì sao renderer phần mềm KHÔNG làm sai bộ số này:** mọi thước đo của I1
 * là **độ trễ giữa hai mốc trong sổ của app** (bus + nhật ký lệnh), không
 * phải FPS, không phải mượt, không phải tóc/chân — đúng những thứ Cửa 1 cấm
 * đo trên renderer phần mềm. Mốc "phản ứng tức thì" nằm ở `setInterval` +
 * handler sự kiện, chạy trên **luồng JS**, không chờ khung hình. Số FPS ở
 * cuối bộ này **chỉ so TƯƠNG ĐỐI** (chờ não vs rảnh, cùng máy, cùng renderer)
 * và không được dùng làm số hiệu năng — thước FPS thật là `?fps=1` trên máy
 * Boss và `scripts/kiem-f2.mjs`.
 */
const MOI_TRUONG_FF = { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1', MOZ_ENABLE_WAYLAND: '0' };

/* ---------------------------------------------------------------- tiện ích */

const in_ = (...x) => console.log(...x);

/**
 * **Không mở Firefox khi đã có phiên nào đang chạy.**
 *
 * Máy này có nhiều worktree agent; nouveau gãy (`kernel rejected pushbuf`)
 * khi vài phiên Firefox cùng dùng GPU, và lượt chạy nào gãy giữa đường thì số
 * đo vô nghĩa. Thà dừng với một câu rõ ràng còn hơn đo trên sân khấu đang
 * tranh GPU. Bộ này mở trình duyệt **đúng một lần** cho cả lượt.
 */
function firefoxDangChay() {
  /*
   * Đọc **file nhị phân thật** của từng tiến trình (`/proc/<pid>/exe`), không
   * khớp chuỗi trong dòng lệnh.
   *
   * Hai lượt trước sai ở đúng chỗ này: `pgrep -f firefox-1543` (và cả
   * `pgrep -f firefox-1543/firefox/firefox`) khớp luôn cái vòng `bash -c` của
   * các agent đang CHỜ Firefox — dòng lệnh chờ của họ có chứa chính chuỗi đó.
   * Bộ kiểm tự chặn mình bằng những người đang chờ nó, kẹt vô hạn mà **không
   * có một Firefox thật nào chạy**. `/proc/<pid>/exe` thì không thể nhầm:
   * tiến trình bash có `exe` là `/usr/bin/bash`.
   */
  const ra = [];
  for (const ten of readdirSync('/proc')) {
    if (!/^\d+$/.test(ten)) continue;
    try {
      const exe = readlinkSync(`/proc/${ten}/exe`);
      if (exe.includes('ms-playwright') && exe.endsWith('/firefox')) ra.push(ten);
    } catch {
      // tiến trình đã chết, hoặc không phải của mình — bỏ qua
    }
  }
  return ra;
}

/** Không mở Firefox khi đã có phiên THẬT nào đang chạy (tranh GPU → nouveau gãy). */
function kiemFirefoxTrong() {
  const pid = firefoxDangChay();
  if (pid.length === 0) return;
  console.error(
    `\n⛔ Đã có ${pid.length} tiến trình Firefox của Playwright đang chạy (PID ${pid.join(', ')}).\n` +
      '   Chạy I1 lúc này là đo trên GPU đang bị tranh — nouveau gãy giữa lượt.\n' +
      '   Chờ phiên kia xong rồi chạy lại: node scripts/kiem-i1.mjs --lai\n',
  );
  process.exit(3);
}
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
const thatBai = [];
const nhatKy = {
  chay: new Date().toISOString(),
  issue: 74,
  trinhDuyet: 'Playwright firefox-1543, headless:false, GPU thật',
  cong: { ws: CONG_WS, tts: CONG_TTS, mcp: CONG_MCP, stt: CONG_STT, web: CONG_WEB },
  loadavg: readFileSync('/proc/loadavg', 'utf8').trim(),
  buoc: [],
};
let soBuoc = 0;
let soOk = 0;

/** Một dòng bằng chứng. `so` đi vào JSON cho Issue/PR đọc lại được. */
function ghi(nhan, ok, chiTiet, so) {
  soBuoc++;
  if (ok) soOk++;
  else thatBai.push(`${nhan}: ${chiTiet ?? ''}`);
  nhatKy.buoc.push({ nhan, ok, chiTiet: chiTiet ?? null, ...(so ? { so } : {}) });
  in_(`   ${ok ? '✓' : '✗'} ${nhan} ${chiTiet ?? ''}`);
}

/* ----------------------------------------------------------- bridge + web */

let bridge = null;
/**
 * Trình duyệt đang mở, để `dongHet` đóng được trên MỌI đường thoát.
 *
 * `process.exit` KHÔNG giết Firefox của Playwright: lượt chạy đầu thoát qua
 * `unhandledRejection` và để lại hai tiến trình `firefox` sống nhăn, ăn GPU
 * của các worktree khác. `browser.close()` phải nằm trong chính hàm dọn.
 */
let trinhDuyet = null;
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
    // `detached` để có NHÓM tiến trình riêng: `tsx` sinh thêm một node con
    // (quyết định #37), giết đúng PID mình giữ chỉ giết cái vỏ.
    detached: true,
  });
  const doc = (d) => process.stdout.write('   [bridge] ' + d);
  bridge.stdout.on('data', doc);
  bridge.stderr.on('data', doc);
  for (let i = 0; i < 360; i++) {
    const k = await khoeStt();
    if (k?.daCai === true) return k;
    await nghi(500);
  }
  throw new Error(`bridge không lên (stt ${CONG_STT})`);
}

let web = null;
async function moWeb() {
  web = spawn('npx', ['vite', 'preview', '--port', String(CONG_WEB), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
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

/**
 * Tắt ĐÚNG tiến trình của mình, theo PID mình giữ.
 *
 * `tsx` sinh thêm một node con (xem quyết định #37 trong CLAUDE.md), nên giết
 * cả **nhóm** bằng PID âm; `fuser -k` theo cổng là tuyệt đối không — Boss đang
 * giữ 8787-8790/5173 và một tmux não thật.
 */
function dongHet(ma) {
  // `kill` của Playwright là đồng bộ và không cần `await` — đúng cái cần ở
  // đây, vì `dongHet` chạy cả trong handler `uncaughtException`.
  try {
    trinhDuyet?.process()?.kill('SIGKILL');
  } catch {
    /* trình duyệt đã chết, hoặc chạy qua đường khác */
  }
  for (const p of [web, bridge]) {
    if (!p?.pid) continue;
    try {
      process.kill(-p.pid, 'SIGTERM');
    } catch {
      try {
        p.kill('SIGTERM');
      } catch {
        /* đã chết rồi */
      }
    }
  }
  process.exit(ma);
}

/**
 * Lỗi NGOÀI khối `try` chính (tải wav mốc, mở trang) cũng phải dọn tiến trình.
 *
 * Đo thật: một cú `fetch` tới `/tts` bị `ECONNRESET` làm script chết bằng
 * uncaught exception → `vite preview` và bridge **sống sót**, và lượt chạy sau
 * chết vì "Port 5397 is already in use". Rác của mình thì mình phải tự dọn.
 */
process.on('uncaughtException', (e) => {
  in_('\n💥 ' + (e?.stack ?? e));
  dongHet(1);
});
process.on('unhandledRejection', (e) => {
  in_('\n💥 (promise) ' + (e?.stack ?? e));
  dongHet(1);
});

/* ------------------------------------------------------------- NÃO GIẢ */

/** Câu não giả trả lời — nằm trong `CAU_DEM_SAN` nên giọng đã hâm sẵn. */
const CAU_NAO = 'Dạ em làm ngay ạ.';
const CAU_NOI = 'Em đang nghĩ ạ…';
const CAU_NOI_LAU = 'Hơi lâu, Sếp chờ em chút.';

let naoWs = null;
/** Độ trễ não giả (ms) — đổi giữa các bước. Rất lớn = coi như não im. */
let treNao = 3_600_000;
let demNao = 0;
/** Mỗi lượt não giả gửi đi: `{ id, tre, nhan, guiLuc, ok }`. */
const luotNao = [];

async function moNao() {
  naoWs = new WebSocket(`ws://127.0.0.1:${CONG_WS}/?role=nao`);
  await new Promise((ok, loi) => {
    naoWs.once('open', ok);
    naoWs.once('error', loi);
  });
  naoWs.on('message', (tho) => {
    let g;
    try {
      g = JSON.parse(String(tho));
    } catch {
      return;
    }
    // kết quả lệnh của chính mình → ghi `ok` lại để kiểm "r.ok mọi lệnh"
    if (typeof g.id === 'string') {
      const l = luotNao.find((x) => x.id === g.id);
      if (l) {
        l.ok = g.ok === true;
        l.loi = g.error ?? null;
      }
      return;
    }
    // Sếp vừa nói → hẹn trả lời sau `treNao`
    if (g.event !== 'user.text' || g.data?.handled === true) return;
    const tre = treNao;
    const nhan = String(g.data?.text ?? '').slice(0, 40);
    const id = `nao-${++demNao}`;
    const hen = setTimeout(() => {
      luotNao.push({ id, tre, nhan, guiLuc: Date.now(), ok: null, loi: null });
      naoWs.send(JSON.stringify({ id, cmd: 'actor.say', args: { actor: 'gen', text: CAU_NAO } }));
    }, tre);
    hen.unref?.();
  });
}

/* -------------------------------------------- mic giả (giọng đi qua Firefox) */

/** Câu Boss "nói" vào mic — một câu GỌI, không phải mệnh lệnh cố định. */
const CAU_MIC = 'Nhi ơi, hôm nay thế nào';

async function lamWavMoc() {
  const u = `http://127.0.0.1:${CONG_TTS}/tts?text=${encodeURIComponent(CAU_MIC)}&voice=nu&rate=20`;
  const mp3 = resolve(tmpdir(), 'gen-stage-i1-moc.mp3');
  const wav = resolve(tmpdir(), 'gen-stage-i1-moc.wav');
  /*
   * Thử lại 3 lần: `/tts` gọi thẳng WebSocket Edge, và đo thật ở E1 (#48) thì
   * 2/10 lượt liên tiếp hỏng (502 / ECONNRESET). Bridge đã tự thử lại bên
   * trong, nhưng cú `fetch` ở ĐÂY hỏng thì cả bộ bằng chứng chết ngay dòng
   * đầu — vì một lỗi mạng chẳng liên quan gì tới cái đang đo.
   */
  let loiCuoi = null;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`/tts trả ${r.status}`);
      writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
      loiCuoi = null;
      break;
    } catch (e) {
      loiCuoi = e;
      in_(`   … /tts hỏng lần ${i + 1} (${e?.message ?? e}) — thử lại`);
      await nghi(800 * (i + 1));
    }
  }
  if (loiCuoi) throw loiCuoi;
  const ff = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', mp3, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', wav,
  ]);
  if (ff.status !== 0) throw new Error(`ffmpeg lỗi: ${String(ff.stderr).slice(0, 200)}`);
  return wav;
}

/**
 * Bọc `getUserMedia`: vẫn gọi bản THẬT của Firefox (luồng quyền là thật) rồi
 * thay nguồn âm bằng wav TTS. Cùng cách `scripts/kiem-g3.mjs` làm — giữ
 * `track.label` thật để toast tên thiết bị không nói dối.
 */
function bocGetUserMedia(wavB64) {
  return `(() => {
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
      const that2 = await that_(c);
      const nhan = that2.getAudioTracks()[0] ? that2.getAudioTracks()[0].label : '';
      for (const t of that2.getTracks()) t.stop();
      const ctx = new AudioContext();
      const buf = await nguonWav(ctx);
      const dich = ctx.createMediaStreamDestination();
      const track = dich.stream.getAudioTracks()[0];
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

/* --------------------------------------------------------------- trình duyệt */

async function moTrang(wavB64) {
  const browser = await firefox.launch({
    headless: false,
    firefoxUserPrefs: {
      // = Boss đã bấm "Cho phép" nhưng Firefox KHÔNG nhớ (ca http://localhost)
      'media.navigator.permission.disabled': true,
      'media.navigator.streams.fake': true,
      'media.autoplay.default': 0,
      'media.autoplay.blocking_policy': 0,
    },
    env: MOI_TRUONG_FF,
  });
  trinhDuyet = browser;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const loiConsole = [];
  page.on('console', (m) => {
    if (m.type() === 'error') loiConsole.push(`[console] ${m.text()}`);
  });
  page.on('pageerror', (e) => loiConsole.push(`[pageerror] ${e.message}`));
  await page.addInitScript(bocGetUserMedia(wavB64));
  await page.goto(
    `http://localhost:${CONG_WEB}/?bridge=1&bridgePort=${CONG_WS}` +
      `&ttsPort=${CONG_TTS}&sttPort=${CONG_STT}`,
    { waitUntil: 'load', timeout: 180000 },
  );
  await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
  // Sổ bus + đếm khung hình. Hai cái này KHÔNG gọi `describe()` mỗi khung —
  // bài học F2 (#56): dụng cụ đo làm hỏng đúng cái cần đo.
  await page.evaluate(() => {
    window.__ev = [];
    window.stage.on('*', (e) => window.__ev.push({ t: e.t, event: e.event, data: e.data }));
    /**
     * I1 vòng 2 (review PR #75 lỗi chặn 1) — **đếm GIỌNG THẬT đang phát**.
     *
     * Thước cũ đếm `actor.sayStart`/`sayDone` **của một actor** rồi kết luận
     * "đỉnh 1" — mà Nhi-với-Nhi thì KHÔNG THỂ chồng (dispatcher giữ 1 slot
     * mỗi actor, lớp tiếng còn nối audio theo từng người), nên con số đó là
     * hệ quả có sẵn của kiến trúc, không chứng minh gì. Cái phải đo là **hai
     * nhân vật cùng mở miệng**. Chỉ lớp TTS dùng `AudioBufferSourceNode`
     * (emote dùng `createOscillator`), nên móc ở đây là đúng một thước giọng.
     */
    window.__am = { dinh: 0, dang: 0, moc: [] };
    const S = window.AudioBufferSourceNode;
    if (S) {
      const start0 = S.prototype.start;
      S.prototype.start = function (...a) {
        window.__am.dang++;
        window.__am.dinh = Math.max(window.__am.dinh, window.__am.dang);
        window.__am.moc.push({ t: Date.now(), pha: 'bat', dang: window.__am.dang });
        this.addEventListener('ended', () => {
          window.__am.dang = Math.max(0, window.__am.dang - 1);
          window.__am.moc.push({ t: Date.now(), pha: 'het', dang: window.__am.dang });
        });
        return start0.apply(this, a);
      };
    }
    window.__khung = 0;
    const dem = () => {
      window.__khung++;
      requestAnimationFrame(dem);
    };
    requestAnimationFrame(dem);
  });
  return { browser, page, loiConsole };
}

/* ---------------------------------------------------- đọc hai cái sổ của app */

const ev = (page) => page.evaluate(() => window.__ev);
/** Đặt lại thước giọng cho một ca (giữ số đang phát, xoá đỉnh + mốc). */
const amDatLai = (page) =>
  page.evaluate(() => {
    window.__am.dinh = window.__am.dang;
    window.__am.moc.length = 0;
  });
/** Đỉnh số giọng cùng phát từ lần `amDatLai` gần nhất. */
const dinhGiong = (page) => page.evaluate(() => window.__am.dinh);
/**
 * Nhật ký LỆNH. `window.stage.log()` trả **chuỗi JSON** của cả gói
 * `{ version, xuatLuc, banGhi }` (xem `src/log.ts`), không phải mảng — lấy
 * đúng `banGhi` rồi mới lọc.
 */
const lenh = (page) =>
  page.evaluate(() => {
    const g = JSON.parse(window.stage.log());
    return (g.banGhi ?? []).filter((b) => b.loai === 'lenh');
  });

/** Mốc đầu tiên của một sự kiện sau thời điểm `tu`. */
const sauEv = (ds, ten, tu, loc = () => true) =>
  ds.find((e) => e.event === ten && e.t >= tu && loc(e)) ?? null;
/** Mốc đầu tiên của một LỆNH sau `tu`. */
const sauLenh = (ds, cmd, tu, loc = () => true) =>
  ds.find((b) => b.cmd === cmd && b.t >= tu && loc(b)) ?? null;

/**
 * Đỉnh số câu của **một** actor đang phát cùng lúc — **thước YẾU, giữ lại để
 * so sánh**.
 *
 * Review PR #75 chỉ ra: Nhi-với-Nhi *không thể* chồng (dispatcher giữ 1 slot
 * `chiemActor` mỗi actor, lớp tiếng còn nối audio theo từng người), nên "đỉnh
 * 1" ở đây gần như là tautology. Thước thật của lời hứa "một giọng" là
 * `dinhGiong()` — móc `AudioBufferSourceNode`, đếm **giọng đang phát** bất kể
 * của ai.
 */
function dinhChongGiong(ds, actor, tu, den) {
  let dang = 0;
  let dinh = 0;
  for (const e of ds) {
    if (e.t < tu || e.t > den) continue;
    if (e.data?.actor !== actor) continue;
    if (e.event === 'actor.sayStart') dinh = Math.max(dinh, ++dang);
    if (e.event === 'actor.sayDone') dang = Math.max(0, dang - 1);
  }
  return dinh;
}

/** Số câu Nhi nói đúng nội dung `chu` trong khoảng. */
const demCau = (ds, chu, tu, den) =>
  ds.filter(
    (e) =>
      e.event === 'actor.sayStart' &&
      e.data?.actor === 'gen' &&
      e.data?.text === chu &&
      e.t >= tu &&
      e.t <= den,
  ).length;

/* ======================================================= chạy bằng chứng */

kiemFirefoxTrong();
in_(`\n--- dựng bridge (cổng ${CONG_WS}-${CONG_STT}) + web ${CONG_WEB} ---`);
const khoe = await moBridge();
ghi('bridge bật, STT thật đã cài', khoe?.daCai === true, JSON.stringify(khoe).slice(0, 160));
await moNao();
ghi('não giả nối bridge với vai ?role=nao', naoWs.readyState === 1);

const wavMoc = await lamWavMoc();
const wavB64 = readFileSync(wavMoc).toString('base64');
in_(`==> mic giả đọc "${CAU_MIC}" (${(wavB64.length / 1365).toFixed(0)} kB)`);

await moWeb();
const { browser, page, loiConsole } = await moTrang(wavB64);

try {
  /* ===================================================== TẦNG 0 (mốc 1) */
  in_('\n--- mốc 1: Boss bấm mic → Nhi quay về máy quay ≤150 ms ---');
  // mở quyền mic + mở khoá tiếng ngay trong cú bấm thật của Boss
  await page.click('#nut-tieng');
  await page.waitForFunction(() => window.stage.micDo().quyen === 'duoc', null, {
    timeout: 60000,
  });
  await page.click('#stage', { position: { x: 500, y: 300 } });
  await nghi(400);
  /*
   * Não giả trả lời lượt MIC sau 3 s — cố ý: lượt đó chỉ dùng để đo tầng 0,
   * mà nếu để não im thì vòng "đang nghĩ" của tầng 2 chạy mãi và nhiễu hết
   * các mốc sau. Mốc 2/3/4 đo trên câu GÕ, xác định hơn (không phụ thuộc STT).
   */
  treNao = 3000;

  const nhinTruoc = await page.evaluate(
    () => window.stage.run('stage.describe').then((r) => r.result.actors.find((a) => a.id === 'gen').lookingAt),
  );
  const t0 = Date.now();
  await page.keyboard.down('v');
  await nghi(3200); // đọc hết câu mốc rồi mới nhả — đúng cách Boss giữ phím
  await page.keyboard.up('v');

  let ds = await ev(page);
  let dsL = await lenh(page);
  const evNghe = sauEv(ds, 'user.listening', t0, (e) => e.data?.on === true);
  const lkNghe = evNghe ? sauLenh(dsL, 'actor.lookAt', evNghe.t, (b) => b.args?.actor === 'gen') : null;
  const tre1 = evNghe && lkNghe ? lkNghe.t - evNghe.t : null;
  ghi(
    'mic bắn user.listening { on: true } ngay lúc bắt đầu ghi',
    evNghe !== null,
    evNghe ? `t=${evNghe.t} data=${JSON.stringify(evNghe.data)}` : 'KHÔNG có sự kiện nào',
  );
  ghi(
    'MỐC 1 — t(user.listening on) → t(actor.lookAt của Nhi) ≤150 ms',
    tre1 !== null && tre1 <= 150,
    `${tre1} ms (trước đó Nhi nhìn "${nhinTruoc}", lệnh: nguồn ${lkNghe?.nguon}, target ${JSON.stringify(lkNghe?.args?.target)})`,
    { treMs: tre1, nhinTruoc, nguon: lkNghe?.nguon ?? null },
  );
  ghi(
    'tầng 0 cũng bật dáng nghe + cú chú ý (chu-y), tất cả nguồn phan-xa',
    sauEv(ds, 'actor.listening', evNghe?.t ?? t0, (e) => e.data?.actor === 'gen' && e.data?.on === true) !== null &&
      sauLenh(dsL, 'actor.emote', evNghe?.t ?? t0, (b) => b.args?.emote === 'chu-y' && b.nguon === 'phan-xa') !== null,
    'actor.listening + actor.emote chu-y',
  );
  await page.screenshot({ path: `${THU_MUC}/01-tang-0-nghe-mic.png` });

  /*
   * ĐỌC LẠI sổ bus trước khi chấm mốc nhận dạng: `ketGhi()` là chuỗi bất đồng
   * bộ (stop recorder → chờ blob → POST /stt), nên lúc `keyboard.up('v')` trả
   * về thì `user.listening { dangNhanDang: true }` CHƯA bắn. Lượt đầu chấm
   * ngay sau cú nhả phím và thấy "KHÔNG có mốc nhận dạng" — lỗi của dụng cụ
   * đo, không phải của app.
   */
  await nghi(2000);
  ds = await ev(page);
  dsL = await lenh(page);
  const evNhanDang = sauEv(ds, 'user.listening', t0, (e) => e.data?.dangNhanDang === true);
  ghi(
    'hết ghi → user.listening { dangNhanDang: true } + dáng "đang nhẩm" (suy-nghi)',
    evNhanDang !== null &&
      sauLenh(dsL, 'actor.emote', evNhanDang.t, (b) => b.args?.emote === 'suy-nghi' && b.nguon === 'phan-xa') !== null,
    evNhanDang ? `t=${evNhanDang.t}` : 'KHÔNG có mốc nhận dạng',
  );

  // chờ STT ra chữ rồi bỏ lượt nói đó đi (mốc 2/3 đo bằng câu GÕ cho xác định)
  await page
    .waitForFunction(() => (document.getElementById('o-chat-nhap')?.value ?? '') !== '', null, {
      timeout: 180000,
    })
    .catch(() => undefined);
  const chuNghe = await page.evaluate(() => ({
    oChat: document.getElementById('o-chat-nhap')?.value ?? '',
    micDo: window.stage.micDo(),
  }));
  ghi(
    'STT ra chữ từ giọng đi qua MediaRecorder thật của Firefox',
    chuNghe.oChat.length > 0,
    `"${chuNghe.oChat}" · tin ${chuNghe.micDo.confidence} · trễ ${chuNghe.micDo.treMs} ms`,
    chuNghe.micDo,
  );
  // để lượt mic tự gửi xong (tin cậy cao thì nó tự Enter sau 1,5 s), rồi dọn
  await nghi(2500);
  await page.evaluate(() => {
    const o = document.getElementById('o-chat-nhap');
    if (o) o.value = '';
  });
  // chờ mọi câu của lượt mic (câu đệm + câu của não) nói xong hẳn: mốc sau
  // phải đo trên một sân khấu đang im
  treNao = 8000;
  await nghi(14000);

  /* =============================================== TẦNG 1 + 2 (mốc 2,3,4) */
  in_('\n--- mốc 2,3,4: có chữ → gật ≤300 ms, câu đệm ≤400 ms, não trễ 8 s ---');
  const fpsTruoc = await page.evaluate(() => window.__khung);
  const tFpsTruoc = Date.now();
  await amDatLai(page);
  const tGo = Date.now();
  const guiOk = await page.evaluate(() => window.stage.guiChat('Nhi ơi, hôm nay mình làm gì nhỉ'));
  ghi('ô chat nhận câu gõ (cùng cửa mic dùng)', guiOk === true, `guiChat → ${guiOk}`);
  await nghi(1200);
  ds = await ev(page);
  dsL = await lenh(page);
  const evText = sauEv(ds, 'user.text', tGo, (e) => e.data?.actor === 'owner');
  ghi(
    'user.text bắn ra và KHÔNG bị lớp hiểu lệnh nhận (handled falsy) — đúng ca chờ não',
    evText !== null && evText.data?.handled !== true,
    evText ? `t=${evText.t} handled=${String(evText.data?.handled)}` : 'KHÔNG có user.text',
  );
  const evGat = evText
    ? sauEv(ds, 'actor.listening', evText.t, (e) => e.data?.actor === 'gen' && e.data?.on === true)
    : null;
  const tre2 = evText && evGat ? evGat.t - evText.t : null;
  ghi(
    'MỐC 2 — t(user.text) → t(gật, actor.listening) ≤300 ms',
    tre2 !== null && tre2 <= 300,
    `${tre2} ms (question=${String(evGat?.data?.question)})`,
    { treMs: tre2 },
  );
  /**
   * **MỐC 3 tính từ lúc NAM DỨT LỜI, không từ `user.text`** (I1 vòng 2).
   *
   * Review PR #75 đo được hai giọng chồng nhau: `actor.say` bắn `user.text`
   * ngay **đầu câu** của Nam, Nam còn đọc 2–3 s nữa, mà mốc câu đệm chỉ
   * 200 ms. Issue #74 ghi thẳng *"không bao giờ nói chồng"*, nên cửa đúng là
   * `actor.sayDone` của Nam — **mốc sớm nhất Nhi trả lời được mà không chen
   * vào giọng người khác**. Lời hứa 400 ms giữ nguyên, chỉ đổi điểm gốc.
   */
  const evNamXong = evText
    ? sauEv(ds, 'actor.sayDone', evText.t, (e) => e.data?.actor === 'owner')
    : null;
  const CAC_CAU_DEM = ['Dạ, Sếp?', 'Em nghe ạ', 'Sếp cần gì ạ?', 'Dạ em đây'];
  const evDem = evText
    ? sauEv(
        ds,
        'actor.sayStart',
        evText.t,
        (e) => e.data?.actor === 'gen' && CAC_CAU_DEM.includes(e.data?.text),
      )
    : null;
  const goc3 = evNamXong?.t ?? evText?.t ?? 0;
  const tre3 = evDem ? evDem.t - goc3 : null;
  ghi(
    'MỐC 3 — t(Nam dứt lời) → t(câu đệm BẮT ĐẦU PHÁT) ≤400 ms',
    tre3 !== null && tre3 >= 0 && tre3 <= 400,
    `${tre3} ms — «${evDem?.data?.text}» (Nam dứt lời ${evNamXong ? evNamXong.t - evText.t : '—'} ms sau user.text)`,
    { treMs: tre3, cau: evDem?.data?.text ?? null, namNoiMs: evNamXong && evText ? evNamXong.t - evText.t : null },
  );
  ghi(
    'MỐC 3b — câu đệm KHÔNG bắt đầu trước khi Nam dứt lời (không chồng giọng)',
    evDem !== null && evNamXong !== null && evDem.t >= evNamXong.t,
    evDem && evNamXong ? `câu đệm t=${evDem.t} · Nam dứt lời t=${evNamXong.t}` : 'thiếu mốc',
  );

  // chờ hết 8 s của não giả + để câu trả lời chạy
  await nghi(9000);
  ds = await ev(page);
  dsL = await lenh(page);
  const luot8 = luotNao.filter((l) => l.tre === 8000);
  const tNao8 = luot8.at(-1)?.guiLuc ?? Date.now();
  const soTuThe8 = dsL.filter(
    (b) =>
      b.cmd === 'actor.emote' &&
      b.nguon === 'phan-xa' &&
      ['suy-nghi', 'cham-chu'].includes(b.args?.emote) &&
      b.t >= (evText?.t ?? tGo) &&
      b.t <= tNao8,
  ).length;
  const soNoi8 = demCau(ds, CAU_NOI, evText?.t ?? tGo, tNao8);
  const soLau8 = demCau(ds, CAU_NOI_LAU, evText?.t ?? tGo, tNao8);
  const dinh8 = dinhChongGiong(ds, 'gen', evText?.t ?? tGo, tNao8 + 6000);
  const dinhAm8 = await dinhGiong(page);
  ghi(
    'MỐC 4a — não trễ 8 s: ≥1 ĐỔI TƯ THẾ trong lúc chờ',
    soTuThe8 >= 1,
    `${soTuThe8} lần (emote suy-nghi/cham-chu, nguồn phan-xa)`,
    { soTuThe: soTuThe8 },
  );
  ghi(
    'MỐC 4b — ĐÚNG 1 câu nối, chưa tới câu "hơi lâu"',
    soNoi8 === 1 && soLau8 === 0,
    `câu nối ×${soNoi8} · "hơi lâu" ×${soLau8}`,
    { soCauNoi: soNoi8, soCauLau: soLau8 },
  );
  ghi(
    'MỐC 4c — ĐỈNH SỐ GIỌNG THẬT CÙNG PHÁT = 1 (móc AudioBufferSourceNode)',
    dinhAm8 === 1,
    `đỉnh ${dinhAm8} giọng (thước cũ, chỉ đếm câu của Nhi: ${dinh8})`,
    { dinhGiong: dinhAm8, dinhCauCuaNhi: dinh8 },
  );
  const evNao8 = sauEv(ds, 'actor.sayStart', tNao8 - 50, (e) => e.data?.actor === 'gen' && e.data?.text === CAU_NAO);
  ghi(
    'câu của não VẪN nói được sau khi việc chêm bị cắt',
    evNao8 !== null && luot8.every((l) => l.ok === true),
    evNao8 ? `t=${evNao8.t} (não gửi lúc ${tNao8}, lệch ${evNao8.t - tNao8} ms)` : 'não không nói được',
    { luotNao: luot8 },
  );
  const fpsSau = await page.evaluate(() => window.__khung);
  const tFpsSau = Date.now();
  await page.screenshot({ path: `${THU_MUC}/02-tang-2-dang-nghi.png` });

  /* ===================================================== mốc 5: não 2 s */
  in_('\n--- mốc 5: não trả lời ở 2 s → không câu nối, việc chêm bị cắt ---');
  treNao = 2000;
  await nghi(1500);
  await amDatLai(page);
  const tGo2 = Date.now();
  await page.evaluate(() => window.stage.guiChat('Nhi ơi, còn việc gì nữa không'));
  await nghi(7000);
  ds = await ev(page);
  dsL = await lenh(page);
  const evText2 = sauEv(ds, 'user.text', tGo2, (e) => e.data?.actor === 'owner');
  const luot2 = luotNao.filter((l) => l.tre === 2000);
  const tNao2 = luot2.at(-1)?.guiLuc ?? Date.now();
  const evNao2 = sauEv(ds, 'actor.sayStart', tNao2 - 50, (e) => e.data?.actor === 'gen' && e.data?.text === CAU_NAO);
  ghi(
    'MỐC 5a — KHÔNG có câu nối nào (não kịp trả lời trước mốc 6 s)',
    demCau(ds, CAU_NOI, evText2?.t ?? tGo2, tNao2 + 500) === 0,
    `câu nối ×${demCau(ds, CAU_NOI, evText2?.t ?? tGo2, tNao2 + 500)}`,
  );
  ghi(
    'MỐC 5b — não nói NGAY sau khi gửi (việc chêm bị cắt, không phải chờ nó xong)',
    evNao2 !== null && evNao2.t - tNao2 <= 1500,
    evNao2 ? `${evNao2.t - tNao2} ms sau lệnh của não` : 'não không nói được',
    { treNaoNoiMs: evNao2 ? evNao2.t - tNao2 : null },
  );
  const dinhAm2 = await dinhGiong(page);
  ghi(
    'MỐC 5c — ĐỈNH SỐ GIỌNG THẬT CÙNG PHÁT = 1 quanh lúc cắt',
    dinhAm2 === 1,
    `đỉnh ${dinhAm2} giọng`,
    { dinhGiong: dinhAm2 },
  );
  await page.screenshot({ path: `${THU_MUC}/03-nao-tra-loi.png` });

  /* ================================================ mốc 6: Nhi đang bận */
  in_('\n--- mốc 6: Nhi đang moveTo của não → chỉ lookAt, hàng đợi không mất ---');
  treNao = 3_600_000; // não im: bước này đo phản xạ, không đo não
  await nghi(2500);
  /*
   * Việc dài của "não" là một clip **LẶP** chứ không phải `moveTo`: `moveTo`
   * dài bao lâu thì phụ thuộc Nhi đang đứng đâu, mà lúc đo thì nó có thể đã
   * xong từ lâu — thước đo "đang bận" phải bận THẬT suốt cả bước này.
   */
  const r1 = await page.evaluate(() =>
    window.stage.run('actor.play', { actor: 'gen', clip: 'type', loop: true }),
  );
  ghi('não giao việc dài: actor.play type loop', r1.ok === true, JSON.stringify(r1).slice(0, 120));
  await nghi(250);
  /*
   * KHÔNG `await`: lệnh này nằm trong hàng đợi tới hết bước — đó là cái cần
   * đo. `.catch()` là bắt buộc: nó chỉ được giải quyết khi hàng đợi xả, mà ta
   * **cố ý không xả**, nên lúc đóng trình duyệt nó reject và kéo cả script
   * xuống `unhandledRejection` (lượt trước: 29/29 ĐẠT nhưng mã thoát 1).
   */
  void page
    .evaluate(() => window.stage.run('actor.play', { actor: 'gen', clip: 'nod' }))
    .catch(() => undefined);
  await nghi(600);
  const banTruoc = await page.evaluate(() =>
    window.stage.run('stage.describe').then((r) => {
      const g = r.result.actors.find((a) => a.id === 'gen');
      return { busy: g.busy, queued: g.queued, state: g.state, lookingAt: g.lookingAt };
    }),
  );
  ghi(
    'Nhi đang bận và có 1 việc xếp hàng',
    banTruoc.busy === true && banTruoc.queued === 1,
    JSON.stringify(banTruoc),
    banTruoc,
  );
  /*
   * Dùng ĐÚNG câu đã chứng minh không bị lớp hiểu lệnh nhận ở mốc 2/3.
   * Lượt trước thử "Nhi ơi, nghe anh nói này" và C2 khớp nó thành một mệnh
   * lệnh (`handled: true`) → `ownerNoi` thoát ngay ở dòng đầu, nên mốc 6 đo
   * được 0 lệnh và trông như phản xạ hỏng. Thước đo phải đứng đúng chỗ tật
   * xảy ra, không phải chỗ lớp khác đã nuốt sự kiện.
   */
  await amDatLai(page);
  const tGo3 = Date.now();
  await page.evaluate(() => window.stage.guiChat('Nhi ơi, hôm nay mình làm gì nhỉ'));
  await nghi(1200);
  ds = await ev(page);
  dsL = await lenh(page);
  const evText3 = sauEv(ds, 'user.text', tGo3, (e) => e.data?.actor === 'owner');
  ghi(
    'câu thăm dò của mốc 6 cũng KHÔNG bị lớp hiểu lệnh nhận',
    evText3 !== null && evText3.data?.handled !== true,
    evText3 ? `handled=${String(evText3.data?.handled)}` : 'KHÔNG có user.text',
  );
  const lk3 = evText3 ? sauLenh(dsL, 'actor.lookAt', evText3.t, (b) => b.args?.actor === 'gen' && b.nguon === 'phan-xa') : null;
  const banSau = await page.evaluate(() =>
    window.stage.run('stage.describe').then((r) => {
      const g = r.result.actors.find((a) => a.id === 'gen');
      return { busy: g.busy, queued: g.queued, state: g.state };
    }),
  );
  ghi(
    'MỐC 6a — đang bận vẫn có actor.lookAt ≤300 ms',
    lk3 !== null && lk3.t - evText3.t <= 300,
    `${lk3 ? lk3.t - evText3.t : null} ms`,
    { treMs: lk3 && evText3 ? lk3.t - evText3.t : null },
  );
  ghi(
    'MỐC 6b — KHÔNG faceTo / emote / say nào chen vào khi đang bận',
    dsL.filter(
      (b) =>
        b.t >= evText3.t &&
        b.t <= evText3.t + 1000 &&
        b.nguon === 'phan-xa' &&
        ['actor.faceTo', 'actor.emote', 'actor.say'].includes(b.cmd) &&
        b.args?.actor === 'gen',
    ).length === 0,
    'không lệnh chiếm thân nào của phản xạ',
  );
  /*
   * Lọc `cmd.interrupted` theo ĐÚNG ACTOR: ô chat gửi câu của Sếp với
   * `interrupt` lên nhân vật **owner**, nên không lọc là luôn thấy "CÓ" dù
   * hàng đợi của Nhi còn nguyên — lượt trước chấm sai đúng vì thế.
   */
  const catNhi = sauEv(ds, 'cmd.interrupted', evText3.t, (e) => e.data?.actor === 'gen');
  ghi(
    'MỐC 6c — HÀNG ĐỢI CỦA NÃO KHÔNG MẤT (vẫn 1 việc chờ, không cmd.interrupted cho Nhi)',
    banSau.queued === 1 && catNhi === null,
    `queued ${banSau.queued} · cmd.interrupted của Nhi: ${catNhi === null ? 'không' : 'CÓ'}`,
    banSau,
  );


  /* ======================================= mốc 7 (vòng 2): TRẦN của tầng 2 */
  in_('\n--- mốc 7: não im 60 s → sau 30 s có câu kết, vòng "đang nghĩ" DỪNG ---');
  // dọn việc dài của bước trước để Nhi rảnh, nhưng KHÔNG xoá hàng đợi bằng
  // `actor.stop` lên Nhi giữa lúc còn việc chờ — cứ chờ nó chạy hết
  await nghi(4000);
  treNao = 3_600_000; // não "nhận câu rồi chết giữa đường"
  await amDatLai(page);
  const tGo4 = Date.now();
  await page.evaluate(() => window.stage.guiChat('Nhi ơi, hôm nay mình làm gì nhỉ'));
  await nghi(35000);
  ds = await ev(page);
  dsL = await lenh(page);
  const evText4 = sauEv(ds, 'user.text', tGo4, (e) => e.data?.actor === 'owner');
  const demEmote = (tu, den) =>
    dsL.filter(
      (b) =>
        b.cmd === 'actor.emote' &&
        b.nguon === 'phan-xa' &&
        b.args?.actor === 'gen' &&
        b.t >= tu &&
        b.t <= den,
    ).length;
  const CAU_KET = 'Não em chưa trả lời, Sếp thử lại nhé.';
  const soKet = demCau(ds, CAU_KET, evText4?.t ?? tGo4, Date.now());
  const emoteA = demEmote(evText4?.t ?? tGo4, Date.now());
  ghi(
    'MỐC 7a — hết trần 30 s → nói ĐÚNG 1 câu kết',
    soKet === 1,
    `câu kết ×${soKet} («${CAU_KET}»)`,
    { soCauKet: soKet },
  );
  // thêm 25 s nữa (tổng 60 s): số emote của phản xạ phải NGỪNG tăng
  await nghi(25000);
  dsL = await lenh(page);
  ds = await ev(page);
  const emoteB = demEmote(evText4?.t ?? tGo4, Date.now());
  ghi(
    'MỐC 7b — não im 60 s: số emote của phản xạ NGỪNG tăng sau mốc 30 s',
    emoteB === emoteA,
    `mốc 35 s: ${emoteA} emote · mốc 60 s: ${emoteB} emote (review đo bản cũ: 8 → 11, vẫn tăng)`,
    { emote35s: emoteA, emote60s: emoteB },
  );
  ghi(
    'MỐC 7c — không nói thêm câu nào sau câu kết',
    demCau(ds, CAU_KET, evText4?.t ?? tGo4, Date.now()) === 1 &&
      demCau(ds, CAU_NOI, (evText4?.t ?? tGo4) + 1, Date.now()) <= 1,
    `câu kết ×${demCau(ds, CAU_KET, evText4?.t ?? tGo4, Date.now())}`,
  );
  const nhinSau = await page.evaluate(() =>
    window.stage.run('stage.describe').then((r) => {
      const g = r.result.actors.find((a) => a.id === 'gen');
      const o = r.result.actors.find((a) => a.id === 'owner');
      return {
        lookingAt: g.lookingAt,
        xa: +Math.hypot(g.pos[0] - o.pos[0], g.pos[2] - o.pos[2]).toFixed(2),
      };
    }),
  );
  ghi(
    'MỐC 7d — nhịp thường sống lại: Nhi thả mắt về việc đang làm (mục 4 của nhịp)',
    nhinSau.lookingAt !== 'camera',
    `lookingAt "${nhinSau.lookingAt}" · cách Nam ${nhinSau.xa} m (bản cũ: mục 4 bị !tangHai khoá vĩnh viễn)`,
    nhinSau,
  );
  const dinhAm7 = await dinhGiong(page);
  ghi('MỐC 7e — cả bước này vẫn ĐỈNH 1 giọng', dinhAm7 <= 1, `đỉnh ${dinhAm7} giọng`, {
    dinhGiong: dinhAm7,
  });

  /* ================================================ mốc 8: sạch + mượt */
  in_('\n--- mốc 8: mọi lệnh ok · console 0 lỗi ---');
  await page.setViewportSize({ width: 390, height: 844 });
  await nghi(3000);
  await page.screenshot({ path: `${THU_MUC}/04-mobile-390.png` });
  await page.setViewportSize({ width: 1440, height: 900 });

  dsL = await lenh(page);
  const loiLenh = dsL.filter((b) => b.ok !== true);
  ghi(
    'r.ok = true cho MỌI lệnh trong cả phiên',
    loiLenh.length === 0,
    `${dsL.length} lệnh, ${loiLenh.length} lỗi${loiLenh.length ? ': ' + loiLenh.map((b) => `${b.cmd} (${b.error})`).join(' · ') : ''}`,
    { soLenh: dsL.length, loi: loiLenh.slice(0, 5) },
  );
  const lenhPhanXa = dsL.filter((b) => b.nguon === 'phan-xa');
  ghi(
    'mọi hành động của phản xạ đi qua dispatcher với nguồn "phan-xa"',
    lenhPhanXa.length > 0,
    `${lenhPhanXa.length}/${dsL.length} lệnh nguồn phan-xa`,
    { soLenhPhanXa: lenhPhanXa.length },
  );
  const fpsChoNao = Math.round(((fpsSau - fpsTruoc) / (tFpsSau - tFpsTruoc)) * 1000);
  const khungA = await page.evaluate(() => window.__khung);
  await nghi(6000);
  const khungB = await page.evaluate(() => window.__khung);
  const fpsRanh = ((khungB - khungA) / 6) | 0;
  ghi(
    'FPS lúc chờ não không tụt dưới 80 % lúc rảnh (so TƯƠNG ĐỐI, renderer phần mềm)',
    fpsChoNao >= fpsRanh * 0.8,
    `chờ não ${fpsChoNao} fps · rảnh ${fpsRanh} fps — KHÔNG phải số hiệu năng, ` +
      'chỉ chứng minh vòng "đang nghĩ" không thêm tải; số thật đo bằng ?fps=1 trên máy Boss',
    { fpsChoNao, fpsRanh, renderer: 'llvmpipe (software)' },
  );
  const hn = await page.evaluate(() => {
    const h = window.stage.hieuNang();
    return { calls: h.calls, callsNha: h.callsNha, coBong: h.coBong, pixelRatio: h.pixelRatio };
  });
  // `doHieuNang().coBong` trả **CỠ shadow map** (1024/2048), không phải boolean.
  ghi(
    'ngân sách đồ hoạ giữ nguyên (bóng 1024, pixel ratio ≤ 1,5)',
    hn.coBong === 1024 && hn.pixelRatio <= 1.5,
    JSON.stringify(hn),
    hn,
  );
  ghi('console 0 lỗi suốt cả vòng', loiConsole.length === 0, loiConsole.slice(0, 4).join(' | '), {
    loiConsole,
  });

  /* ------------------------------------------------------------- kết quả */
  nhatKy.tomTat = { soBuoc, soOk, thatBai };
  writeFileSync(`${THU_MUC}/nhat-ky-kiem-i1.json`, JSON.stringify(nhatKy, null, 2));

  const bang = [
    '| Thước đo (Issue #74) | Lời hứa | Đo thật | Kết |',
    '| --- | --- | --- | --- |',
    `| t(\`user.listening on\`) → t(\`actor.lookAt\` Nhi) | ≤150 ms | **${tre1} ms** | ${tre1 <= 150 ? '✅' : '❌'} |`,
    `| t(\`user.text\`) → t(gật, \`actor.listening\`) | ≤300 ms | **${tre2} ms** | ${tre2 <= 300 ? '✅' : '❌'} |`,
    `| t(**Nam dứt lời**) → t(câu đệm bắt đầu phát) | ≤400 ms | **${tre3} ms** | ${tre3 !== null && tre3 >= 0 && tre3 <= 400 ? '✅' : '❌'} |`,
    `| câu đệm bắt đầu **sau** khi Nam dứt lời | bắt buộc | **${evDem && evNamXong ? (evDem.t >= evNamXong.t ? 'có' : 'KHÔNG') : '—'}** | ${evDem && evNamXong && evDem.t >= evNamXong.t ? '✅' : '❌'} |`,
    `| não trễ 8 s: đổi tư thế | ≥1 | **${soTuThe8}** | ${soTuThe8 >= 1 ? '✅' : '❌'} |`,
    `| não trễ 8 s: câu nối | đúng 1 | **${soNoi8}** (câu "hơi lâu" ${soLau8}) | ${soNoi8 === 1 && soLau8 === 0 ? '✅' : '❌'} |`,
    `| **giọng thật cùng phát** (não 8 s) | đỉnh 1 | **${dinhAm8}** | ${dinhAm8 === 1 ? '✅' : '❌'} |`,
    `| **giọng thật cùng phát** (não 2 s, lúc cắt) | đỉnh 1 | **${dinhAm2}** | ${dinhAm2 === 1 ? '✅' : '❌'} |`,
    `| **giọng thật cùng phát** (trần tầng 2) | đỉnh 1 | **${dinhAm7}** | ${dinhAm7 <= 1 ? '✅' : '❌'} |`,
    `| não trả lời ở 2 s: câu nối | 0 | **${demCau(ds, CAU_NOI, evText2?.t ?? tGo2, tNao2 + 500)}** | ✅ |`,
    `| não trả lời ở 2 s: não nói sau lệnh | ngay | **${evNao2 ? evNao2.t - tNao2 : '—'} ms** | ${evNao2 && evNao2.t - tNao2 <= 1500 ? '✅' : '❌'} |`,
    `| đang việc của não: \`lookAt\` | ≤300 ms | **${lk3 && evText3 ? lk3.t - evText3.t : '—'} ms** | ${lk3 && evText3 && lk3.t - evText3.t <= 300 ? '✅' : '❌'} |`,
    `| đang việc của não: hàng đợi | không mất | **queued ${banSau.queued}**, 0 \`cmd.interrupted\` cho Nhi | ${banSau.queued === 1 && catNhi === null ? '✅' : '❌'} |`,
    `| trần tầng 2: câu kết sau 30 s | đúng 1 | **${soKet}** | ${soKet === 1 ? '✅' : '❌'} |`,
    `| trần tầng 2: emote phản xạ 35 s → 60 s | ngừng tăng | **${emoteA} → ${emoteB}** | ${emoteB === emoteA ? '✅' : '❌'} |`,
    `| trần tầng 2: nhịp thường sống lại | Nhi thả mắt | **lookingAt "${nhinSau.lookingAt}"** | ${nhinSau.lookingAt !== 'camera' ? '✅' : '❌'} |`,
    `| \`r.ok\` mọi lệnh | 100 % | **${dsL.length - loiLenh.length}/${dsL.length}** | ${loiLenh.length === 0 ? '✅' : '❌'} |`,
    `| console | 0 lỗi | **${loiConsole.length}** | ${loiConsole.length === 0 ? '✅' : '❌'} |`,
    '',
    `STT giọng thật qua MediaRecorder của Firefox: «${chuNghe.oChat}» (tin ${chuNghe.micDo.confidence}, trễ ${chuNghe.micDo.treMs} ms).`,
    `Cổng riêng ${CONG_WS}-${CONG_STT} + web ${CONG_WEB}; không đụng 5173/8787-8790 của Boss.`,
    `Đỉnh giọng đo bằng móc AudioBufferSourceNode.start/ended — chỉ lớp TTS dùng node đó.`,
    `FPS lượt này ${fpsChoNao}/${fpsRanh} (llvmpipe) — CỐ Ý không đưa vào bảng: số renderer phần mềm không nói được gì về mượt (Cửa 1).`,
  ].join('\n');
  writeFileSync(`${THU_MUC}/bang.md`, bang + '\n');
  in_('\n' + bang + '\n');

  in_(`\n=== ${soOk}/${soBuoc} mục ĐẠT ===`);
  if (thatBai.length) {
    in_('✗ CHƯA ĐẠT:');
    for (const t of thatBai) in_('   - ' + t);
  }
  await browser.close();
  naoWs.close();
  dongHet(thatBai.length ? 1 : 0);
} catch (e) {
  in_('\n💥 ' + (e?.stack ?? e));
  nhatKy.loiChay = String(e?.message ?? e);
  nhatKy.tomTat = { soBuoc, soOk, thatBai };
  writeFileSync(`${THU_MUC}/nhat-ky-kiem-i1.json`, JSON.stringify(nhatKy, null, 2));
  try {
    await page.screenshot({ path: `${THU_MUC}/99-loi.png` });
  } catch {
    /* trang đã chết */
  }
  await browser.close().catch(() => undefined);
  naoWs?.close();
  dongHet(1);
}
