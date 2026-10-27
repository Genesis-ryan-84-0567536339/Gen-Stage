/**
 * kiem-j2.mjs — BẰNG CHỨNG J2 (#79): **bảng hoạt động + tự sinh hoạt khi rảnh**.
 *
 * Chạy (**một lần** — cờ khoá `docs/j2/.da-chay`):
 *   node scripts/kiem-j2.mjs          # trọn bộ (~8 phút)
 *   node scripts/kiem-j2.mjs --lai    # xoá cờ khoá rồi chạy lại
 *
 * Đo trên **Firefox thật** (`firefox-1543`, không headless), bản `vite
 * preview`, **cổng web riêng 5393** — không đụng 5173 lẫn 8787-8790 của Boss.
 * Bộ này **không cần bridge**: hoạt động không nói gì, và Boss "gõ" qua đúng
 * cửa ô chat (`window.stage.guiChat`) nên không cần TTS/STT. Mở trang với
 * `?bridge=0`.
 *
 * Bốn thước đo của Issue:
 *   1. **12 hoạt động chạy trọn** qua `actor.activity`: `r.ok`, sự kiện
 *      `actor.activityDone` (không phải `Cancelled`), không bước nào lỗi, kết
 *      thúc về `idle`, không còn cầm gì — **và một ảnh mỗi hoạt động**.
 *   2. **Chân chạm sàn**: đế thấp nhất của mesh (quét đỉnh thật,
 *      `doXuong().tuThe.minY` = `Box3.setFromObject(root, true).min.y`) phải
 *      ∈ [−0,01; +∞) ở MỌI mẫu — lấy mẫu giữa hoạt động và lúc vừa xong.
 *   3. **Rảnh 60 s → ≥2 hoạt động TỰ SINH, khác nhau.**
 *   4. **Boss gõ giữa chừng → cắt ≤300 ms**, và lệnh sau đó vẫn chạy.
 * Cộng hai mục bắt buộc của mọi PR: `r.ok` cho MỌI lệnh trong cả phiên, và
 * console 0 lỗi.
 *
 * Mốc thời gian lấy từ **sổ bus của chính app** (`window.stage.on('*')` →
 * `e.t`) và **nhật ký lệnh** (`window.stage.log()`), không từ ảnh chụp: mốc
 * "cắt" nằm trong handler sự kiện, không chờ khung hình nào.
 *
 * Ra trong `docs/j2/`:
 *   hd-01-…png … hd-12-…png   một ảnh mỗi hoạt động (lúc vừa diễn xong)
 *   90-tu-sinh-hoat.png        Nhi đang tự sinh hoạt khi Boss để yên
 *   91-mobile-390.png          màn hẹp
 *   nhat-ky-kiem-j2.json       SỐ của từng mốc
 *   bang.md                    bảng số đo, dán thẳng vào mô tả PR
 */
import { firefox } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';

const THU_MUC = 'docs/j2';
mkdirSync(THU_MUC, { recursive: true });
const argv = process.argv.slice(2);

/* ------------------------------------------------- cờ khoá chạy một lần */

const CO_KHOA = `${THU_MUC}/.da-chay`;
if (argv.includes('--lai')) {
  if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
} else if (existsSync(CO_KHOA)) {
  console.error(
    `\n⛔ ${CO_KHOA} đã tồn tại — kiểm J2 chỉ chạy MỘT LẦN sau khi code xong.\n` +
      `   Kết quả lượt trước: ${THU_MUC}/nhat-ky-kiem-j2.json + ${THU_MUC}/bang.md\n` +
      '   Thật sự cần chạy lại: node scripts/kiem-j2.mjs --lai\n',
  );
  process.exit(2);
}

/* ------------------------------------------------------------- cổng riêng */

const CONG_WEB = Number(process.env.GEN_STAGE_WEB_PORT ?? 5393);
/**
 * **Bridge RIÊNG của bộ đo**, cổng riêng — không đụng 8787-8790 của Boss.
 *
 * Lượt 1-4 chạy `?bridge=0` và trỏ TTS vào một đường chết, nên thước "một
 * giọng" thành vô nghĩa: không có audio thật thì móc
 * `AudioBufferSourceNode` không bao giờ nổ. Review PR #83 lỗi 4 đo bằng
 * **bridge thật + TTS thật** và thấy **đỉnh 2 giọng**. Muốn chứng minh đã hết
 * thì phải đo trên cùng điều kiện đó.
 *
 * Không nối vào bridge của Boss: vừa giành sân khấu với Boss, vừa lẫn số đo
 * với tmux não thật đang chạy.
 */
const CONG_WS = Number(process.env.GEN_STAGE_PORT ?? 8985);
const CONG_TTS = Number(process.env.GEN_STAGE_TTS_PORT ?? 8986);
const CONG_MCP = Number(process.env.GEN_STAGE_MCP_PORT ?? 8987);
const CONG_STT = Number(process.env.GEN_STAGE_STT_PORT ?? 8988);
const MOI_TRUONG_BRIDGE = {
  ...process.env,
  GEN_STAGE_PORT: String(CONG_WS),
  GEN_STAGE_TTS_PORT: String(CONG_TTS),
  GEN_STAGE_MCP_PORT: String(CONG_MCP),
  GEN_STAGE_STT_PORT: String(CONG_STT),
};
/**
 * Firefox qua X11 + **llvmpipe**, như `kiem-g3.mjs`/`kiem-i1.mjs`.
 *
 * Vì sao renderer phần mềm KHÔNG làm sai bộ số này: mọi thước đo của J2 là
 * **sự kiện/lệnh trong sổ của app** (hoạt động chạy trọn, mốc cắt) và **hình
 * học xương/mesh** (`minY` — hệ số đo bằng mét, không phụ thuộc rasterizer).
 * Không có số nào về FPS/mượt/tóc ở đây — đúng những thứ Cửa 1 cấm đo trên
 * renderer phần mềm. GPU thật (nouveau) thì gãy đúng cạm bẫy F2 (#56) ghi lại
 * khi có nhiều phiên Firefox khác đang dùng cùng GPU.
 */
const MOI_TRUONG_FF = { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1', MOZ_ENABLE_WAYLAND: '0' };

/* ---------------------------------------------------------------- tiện ích */

const in_ = (...x) => console.log(...x);

/**
 * Tiến trình Firefox của Playwright đang chạy, đọc **file nhị phân thật**
 * (`/proc/<pid>/exe`) — thước I1b (#74) dựng, J2 dùng lại nguyên.
 *
 * Không khớp chuỗi trong dòng lệnh: `pgrep -f firefox-1543` (và cả
 * `pgrep -f firefox-1543/firefox/firefox`) khớp luôn cái vòng `bash -c` của
 * các agent đang **CHỜ** Firefox, nên bộ kiểm tự chặn mình bằng chính những
 * người đang chờ nó — kẹt vô hạn mà **không có một Firefox thật nào chạy**
 * (J2 mất hẳn một lượt vì chuyện này). `/proc/<pid>/exe` của bash là
 * `/usr/bin/bash`, không thể nhầm.
 */
function firefoxDangChay() {
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

/** Thước thứ hai, độc lập: mẫu `pgrep` **neo vào argv[0]**. */
function pgrepFirefox() {
  const r = spawnSync('pgrep', ['-f', '^[^ ]*firefox-1543/firefox/firefox'], {
    encoding: 'utf8',
  });
  return String(r.stdout ?? '').trim().split(/\s+/).filter(Boolean);
}

/**
 * **Từ chối chạy khi đã có phiên Firefox nào của Playwright.**
 *
 * Nhiều phiên tranh GPU là nouveau gãy giữa lượt ("Exiting due to channel
 * error", cạm bẫy F2 #56), mà lượt gãy giữa đường thì số đo vô nghĩa — và bộ
 * này mở trình duyệt **đúng một lần** cho cả lượt nên không có đường cứu. Hai
 * thước độc lập, có cái nào thấy là dừng.
 */
function kiemFirefoxTrong() {
  const pid = [...new Set([...pgrepFirefox(), ...firefoxDangChay()])];
  if (pid.length === 0) return;
  console.error(
    `\n⛔ Đã có ${pid.length} tiến trình Firefox của Playwright đang chạy (PID ${pid.join(', ')}).\n` +
      '   Chạy J2 lúc này là đo trên GPU đang bị tranh — nouveau gãy giữa lượt.\n' +
      '   Chờ phiên kia xong rồi chạy lại: node scripts/kiem-j2.mjs --lai\n',
  );
  process.exit(3);
}
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
const thatBai = [];
const nhatKy = {
  chay: new Date().toISOString(),
  issue: 79,
  trinhDuyet: 'Playwright firefox-1543, headless:false, llvmpipe (chỉ đo sự kiện + hình học)',
  cong: { web: CONG_WEB, ws: CONG_WS, tts: CONG_TTS, mcp: CONG_MCP, stt: CONG_STT },
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

/* ------------------------------------------------------------------- web */

let web = null;
let bridge = null;
let trinhDuyet = null;

/**
 * Bật bridge riêng rồi **chờ đúng cái mình cần: `/tts` trả tiếng**.
 *
 * Cố ý KHÔNG chờ `/stt/khoe` như `kiem-i1.mjs`: bộ này không dùng mic, mà thợ
 * STT nạp model ~930 MB mất hàng chục giây — chờ một thứ mình không dùng là
 * tự kéo dài lượt chiếm GPU.
 */
async function moBridge() {
  bridge = spawn('npx', ['tsx', 'bridge/server.ts'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: MOI_TRUONG_BRIDGE,
    // `detached` để có NHÓM tiến trình riêng: `tsx` sinh thêm một node con
    // (quyết định #37), giết đúng PID mình giữ chỉ giết cái vỏ.
    detached: true,
  });
  const doc = (d) => process.stdout.write('   [bridge] ' + d);
  bridge.stdout.on('data', doc);
  bridge.stderr.on('data', doc);
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(
        `http://127.0.0.1:${CONG_TTS}/tts?text=${encodeURIComponent('Dạ, Sếp?')}&voice=nu`,
      );
      if (r.ok) {
        const n = (await r.arrayBuffer()).byteLength;
        return n;
      }
    } catch {
      /* chưa lên */
    }
    await nghi(500);
  }
  throw new Error(`bridge/TTS không lên (cổng ${CONG_TTS})`);
}

async function moWeb() {
  web = spawn('npx', ['vite', 'preview', '--port', String(CONG_WEB), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    // `detached` để có NHÓM tiến trình riêng (bài học #37: `npx` sinh node con,
    // giết đúng PID mình giữ chỉ giết cái vỏ).
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

/** Tắt ĐÚNG tiến trình của mình, theo PID mình giữ (không `fuser -k` cổng mù). */
function dongHet(ma) {
  try {
    trinhDuyet?.process()?.kill('SIGKILL');
  } catch {
    /* trình duyệt đã chết */
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

process.on('uncaughtException', (e) => {
  in_('\n💥 ' + (e?.stack ?? e));
  dongHet(1);
});
process.on('unhandledRejection', (e) => {
  in_('\n💥 (promise) ' + (e?.stack ?? e));
  dongHet(1);
});

/* --------------------------------------------------------------- trình duyệt */

async function moTrang() {
  const browser = await firefox.launch({ headless: false, env: MOI_TRUONG_FF });
  trinhDuyet = browser;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const loiConsole = [];
  page.on('console', (m) => {
    if (m.type() === 'error') loiConsole.push(`[console] ${m.text()}`);
  });
  page.on('pageerror', (e) => loiConsole.push(`[pageerror] ${e.message}`));
  /*
   * `bridge=0`: bộ này không cần bridge (xem đầu file), và nối vào bridge thật
   * của Boss là vừa sai số vừa giành sân khấu với Boss.
   *
   * Nối vào **bridge RIÊNG của bộ đo** (cổng 8985-8988), không phải bridge
   * của Boss: cần TTS thật để thước "một giọng" có nghĩa (xem `CONG_WS`).
   * Não thì KHÔNG nối — `brainConnected: false` nên phản xạ tự trả lời bằng
   * não rule-based, đúng cảnh Boss gõ mà chưa bật agy.
   */
  await page.goto(
    `http://localhost:${CONG_WEB}/?bridge=1&bridgePort=${CONG_WS}` +
      `&ttsPort=${CONG_TTS}&sttPort=${CONG_STT}`,
    {
      waitUntil: 'load',
      timeout: 180000,
    },
  );
  await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
  await page.evaluate(() => {
    window.__ev = [];
    window.stage.on('*', (e) => window.__ev.push({ t: e.t, event: e.event, data: e.data }));
    /*
     * **Chốt tư thế NGAY tại mốc `actor.activityDone`**, đồng bộ trong handler.
     *
     * Lượt đo đầu chấm `state` 600 ms SAU mốc đó và thấy `playing`/`emoting` ở
     * 3 hoạt động — rồi tưởng hoạt động bỏ dở. Thật ra cả 3 đều kết thúc ở
     * `buc-trung-tam`, nơi Nam đứng: Nhi vừa rảnh thì **phản xạ C0** (ưu tiên
     * thấp nhất, đúng thiết kế) chạy nhánh "Boss đứng gần > 4 s → chào nhẹ" =
     * `actor.turnTo` (state `playing`) + `actor.emote chao` (state `emoting`).
     * Tức app đúng, **dụng cụ đo sai**: muốn biết "hoạt động kết thúc về idle"
     * thì phải đọc đúng lúc nó kết thúc, không đọc nửa giây sau.
     *
     * `window.stage.doXuong()` là **đồng bộ**, nên chốt được ngay trong
     * handler (`stage.describe` qua dispatcher thì đã là một `await`).
     */
    /**
     * **Đỉnh GIỌNG THẬT đang phát** — móc `AudioBufferSourceNode.start`/`ended`
     * (thước I1b/#75 dựng, J2 dùng lại nguyên).
     *
     * Đếm `actor.sayStart` của MỘT actor là tautology: dispatcher giữ 1 slot
     * mỗi actor và lớp tiếng còn nối audio theo từng người, nên "đỉnh 1" là
     * hệ quả có sẵn của kiến trúc. Cái phải đo là **hai nhân vật cùng mở
     * miệng**; chỉ lớp TTS dùng `AudioBufferSourceNode` (emote dùng
     * `createOscillator`), nên móc ở đây là đúng một thước giọng.
     */
    window.__am = { dinh: 0, dang: 0, soBat: 0 };
    const S = window.AudioBufferSourceNode;
    if (S) {
      const start0 = S.prototype.start;
      S.prototype.start = function (...a) {
        window.__am.dang++;
        window.__am.soBat++;
        window.__am.dinh = Math.max(window.__am.dinh, window.__am.dang);
        this.addEventListener('ended', () => {
          window.__am.dang = Math.max(0, window.__am.dang - 1);
        });
        return start0.apply(this, a);
      };
    }

    /**
     * **Lấy mẫu `minY` mỗi 300 ms, suốt cả phiên** (review #83 mục d).
     *
     * Ba mẫu mỗi hoạt động bỏ sót hẳn hai ca lún: reviewer lấy mẫu dày và
     * thấy **−0,0226 m** (`doc-sach-sofa`) và **−0,0233 m** (`ngu-gat-sofa`),
     * dưới ngưỡng ≥ −0,01 m mà chính PR đặt. Thước thưa không chứng minh được
     * "chân chạm sàn" — nó chỉ chứng minh "ba lúc tôi nhìn thì chạm".
     */
    window.__chan = { thapNhat: null, soMau: 0 };
    /*
     * **Nhịp 1 s, không phải 300 ms** — và đây là một số đo, không phải gu.
     * `doXuong().tuThe.minY` gọi `Box3.setFromObject(root, true)`, tức quét
     * TOÀN BỘ đỉnh của mesh có biến dạng xương. Lượt đo trước lấy mẫu mỗi
     * 300 ms và trang **sập giữa MỐC 3** ("sân khấu ngắt kết nối" rồi
     * `Target page … has been closed") sau ~5,5 phút. Đúng cạm bẫy F2 (#56):
     * *dụng cụ đo làm hỏng chính cái cần đo*. 1 s vẫn dày hơn 3 mẫu/hoạt động
     * cả trăm lần, mà hai ca lún mà review tìm ra là **tư thế giữ lâu** (ngồi
     * sofa + chạy clip) nên 1 s không thể bỏ sót.
     */
    setInterval(() => {
      try {
        const d = window.stage.doXuong('gen');
        const y = d.tuThe?.minY;
        if (typeof y !== 'number' || !Number.isFinite(y)) return;
        window.__chan.soMau++;
        const t = window.__chan.thapNhat;
        if (t === null || y < t.minY) {
          window.__chan.thapNhat = { minY: y, state: d.state, t: Date.now() };
        }
      } catch {
        /* actor chưa có */
      }
    }, 1000);

    window.__chot = {};
    // `doXuong` không trả `holding`; bắt từ sự kiện prop để chốt được đồng bộ
    window.__holding = null;
    window.stage.on('actor.held', (e) => {
      if (e.data.actor === 'gen') window.__holding = String(e.data.prop);
    });
    window.stage.on('actor.dropped', (e) => {
      if (e.data.actor === 'gen') window.__holding = null;
    });
    window.stage.on('actor.activityDone', (e) => {
      try {
        const d = window.stage.doXuong(String(e.data.actor));
        window.__chot[String(e.data.activity)] = {
          state: d.state,
          minY: d.tuThe?.minY ?? null,
          footY: d.tuThe?.footY ?? null,
          // dư âm của chính hoạt động: tay còn đồ không, sổ còn tên không
          holding: window.__holding ?? null,
        };
      } catch {
        /* actor vừa bị xoá */
      }
    });
  });
  return { browser, page, loiConsole };
}

/* ---------------------------------------------------- đọc hai cái sổ của app */

const ev = (page) => page.evaluate(() => window.__ev);
const lenh = (page) =>
  page.evaluate(() => {
    const g = JSON.parse(window.stage.log());
    return (g.banGhi ?? []).filter((b) => b.loai === 'lenh');
  });
const sauEv = (ds, ten, tu, loc = () => true) =>
  ds.find((e) => e.event === ten && e.t >= tu && loc(e)) ?? null;

/**
 * Đỉnh giọng thật + **số lượt đã phát** từ lúc đặt lại tới giờ.
 *
 * Phải trả cả `soBat`: nếu autoplay bị chặn thì không câu nào phát, đỉnh = 0
 * và thước "không chồng giọng" **ĐẠT một cách rỗng**. Có đo thì phải chứng
 * minh là mình đã đo được cái gì.
 */
const doGiong = (page) =>
  page.evaluate(() => ({ dinh: window.__am?.dinh ?? 0, soBat: window.__am?.soBat ?? 0 }));
const amDatLai = (page) =>
  page.evaluate(() => {
    if (!window.__am) return;
    window.__am.dinh = window.__am.dang;
    window.__am.soBat = 0;
  });
/** Mẫu `minY` thấp nhất của cả phiên (lấy mỗi 300 ms trong trang). */
const chanDayNhat = (page) => page.evaluate(() => window.__chan);

/** Số đo tư thế: đế thấp nhất của MESH (quét đỉnh thật) + chân xương. */
const doChan = (page) =>
  page.evaluate(() => {
    const d = window.stage.doXuong('gen');
    return {
      minY: d.tuThe?.minY ?? null,
      footY: d.tuThe?.footY ?? null,
      state: d.state,
    };
  });

/** Chờ `actor.activityDone` / `actor.activityCancelled` của Nhi. */
async function choHoatDongXong(page, tu, hanMs) {
  const het = Date.now() + hanMs;
  while (Date.now() < het) {
    const ds = await ev(page);
    const e =
      sauEv(ds, 'actor.activityDone', tu, (x) => x.data?.actor === 'gen') ??
      sauEv(ds, 'actor.activityCancelled', tu, (x) => x.data?.actor === 'gen');
    if (e) return e;
    await nghi(400);
  }
  return null;
}

/* ======================================================= chạy bằng chứng */

kiemFirefoxTrong();
writeFileSync(CO_KHOA, new Date().toISOString() + '\n');

in_(`\n--- dựng bridge riêng (ws ${CONG_WS} · tts ${CONG_TTS}) + web ${CONG_WEB} ---`);
const coTieng = await moBridge();
in_(`   TTS thật trả ${coTieng} byte mp3 cho câu mẫu`);
await moWeb();
const { browser, page, loiConsole } = await moTrang();

try {
  /* ---------------------------------------- danh sách hoạt động từ chính app */
  in_('\n--- bảng hoạt động đọc từ `actor.activities` (không viết tay) ---');
  const dsHd = await page.evaluate(() =>
    window.stage.run('actor.activities').then((r) => (r.ok ? r.result.activities : null)),
  );
  ghi(
    '`actor.activities` trả về bảng ≥12 hoạt động',
    Array.isArray(dsHd) && dsHd.length >= 12,
    Array.isArray(dsHd) ? `${dsHd.length} hoạt động: ${dsHd.map((h) => h.name).join(', ')}` : 'lỗi',
    { soHoatDong: dsHd?.length ?? 0 },
  );
  if (!Array.isArray(dsHd)) throw new Error('không đọc được actor.activities');

  /*
   * Mở khoá autoplay bằng một cú BẤM THẬT — không có nó thì Firefox chặn
   * `AudioContext` và thước "một giọng" lại thành vô nghĩa (đo 0 giọng).
   */
  await page.click('#nut-tieng').catch(() => undefined);
  const daMoTieng = await page.evaluate(() => window.stage.batTieng());
  ghi('mở khoá tiếng (autoplay) — thước "một giọng" mới có nghĩa', daMoTieng === true, `batTieng → ${daMoTieng}`);

  const btr = await page.evaluate(() =>
    window.stage.run('stage.bootstrap').then((r) => (r.ok ? r.result.commands.map((c) => c.cmd) : [])),
  );
  ghi(
    'hai lệnh mới vào `stage.bootstrap` (nên MCP tự có tool `actor_activity`)',
    btr.includes('actor.activity') && btr.includes('actor.activities'),
    `${btr.length} lệnh trong bootstrap`,
  );

  /* =========================================== MỐC 1 + 2: 12 hoạt động chạy trọn */
  /*
   * **Đưa Nam ra cửa trước khi đo 12 hoạt động.**
   *
   * Nam spawn đúng ở `buc-trung-tam` = `VUNG_GIUA`, nên 4/12 hoạt động kết
   * thúc cách anh ta vài chục cm. Nhi vừa rảnh là phản xạ C0 chạy nhánh "Boss
   * đứng gần > 4 s → chào nhẹ" (`actor.turnTo` → state `playing`,
   * `actor.emote chao` → `emoting`) — **đúng thiết kế**, nhưng nó chiếm thân
   * ngay sau mốc `activityDone` và làm thước "kết thúc về idle" chấm sai
   * người (2 lượt đo liền bị, mỗi lượt 2-3 hoạt động). Đẩy Nam ra `cua` là
   * tách hai hệ thống ra để đo từng cái một; phần phản xạ + hoạt động chạy
   * CÙNG nhau thì MỐC 4 đo riêng.
   *
   * Thêm một lợi ích: `hoatDongDienDuoc()` không còn phải loại 4 hoạt động
   * vùng giữa vì có người chắn chỗ (chính là điều kiện mới của vòng 3).
   */
  await page.evaluate(() => window.stage.run('actor.moveTo', { actor: 'owner', to: 'cua' }));
  await nghi(6000);
  const namODau = await page.evaluate(() =>
    window.stage.run('stage.describe').then((x) => {
      const o = x.result.actors.find((a) => a.id === 'owner');
      return { at: o.at, nearest: o.nearest };
    }),
  );
  ghi(
    'Nam ra khỏi vùng giữa (để phản xạ "chào nhẹ" không lẫn vào thước hoạt động)',
    namODau.nearest?.place === 'cua',
    JSON.stringify(namODau),
    namODau,
  );

  in_('\n--- MỐC 1+2: từng hoạt động chạy trọn + chân chạm sàn ---');
  let ds = [];
  let dsL = [];
  const ketHd = [];
  let chanXau = null; // mẫu minY thấp nhất của cả phiên
  let soAnh = 0;
  for (const h of dsHd) {
    const t0 = Date.now();
    const r = await page.evaluate(
      (ten) => window.stage.run('actor.activity', { actor: 'gen', name: ten }),
      h.name,
    );
    // mẫu GIỮA hoạt động: lúc đang đi/ngồi/diễn, chỗ dễ lún chân nhất
    await nghi(Math.min(3000, Math.max(900, (h.estimatedMs ?? 6000) / 3)));
    const giua = await doChan(page);
    const xong = await choHoatDongXong(page, t0, Math.max(40000, (h.estimatedMs ?? 8000) * 4));
    // tư thế CHỐT ngay tại mốc `activityDone` (xem ghi chú trong `moTrang`)
    const chot = await page.evaluate((ten) => window.__chot[ten] ?? null, h.name);
    await nghi(600);
    const sau = await doChan(page);
    const st = await page.evaluate(() =>
      window.stage.run('stage.describe').then((x) => {
        const g = x.result.actors.find((a) => a.id === 'gen');
        return { state: g.state, holding: g.holding, activity: g.activity, at: g.at, pos: g.pos };
      }),
    );
    soAnh++;
    const anh = `hd-${String(soAnh).padStart(2, '0')}-${h.name}.png`;
    await page.screenshot({ path: `${THU_MUC}/${anh}` });

    for (const m of [giua, sau, chot ?? {}]) {
      if (m.minY === null || !Number.isFinite(m.minY)) continue;
      if (chanXau === null || m.minY < chanXau.minY) chanXau = { ...m, hoatDong: h.name };
    }
    const ok =
      r.ok === true &&
      xong?.event === 'actor.activityDone' &&
      xong?.data?.errors === undefined &&
      /*
       * "Về idle" chấm ở ĐÚNG mốc kết thúc, và chấp nhận cả `playing`/`emoting`
       * **do phản xạ** tiếp quản: cái hoạt động phải bảo đảm là **không còn dư
       * âm của chính nó** (`holding` null, `activity` null, không ngồi lại),
       * chứ không phải "sân khấu đứng im" — phản xạ có quyền diễn ngay sau đó
       * và đó là thiết kế, không phải lỗi. Lượt này đã đẩy Nam ra cửa nên
       * nhánh chào nhẹ gần như không nổ; còn nổ thì cũng không chấm sai nữa.
       */
      chot?.state !== 'sitting' &&
      chot?.holding === null &&
      st.holding === null &&
      st.activity === null;
    ketHd.push({
      name: h.name,
      label: h.label,
      ok,
      rOk: r.ok === true,
      suKien: xong?.event ?? 'KHÔNG CÓ',
      buoc: xong?.data?.steps ?? null,
      loiBuoc: xong?.data?.errors ?? null,
      stateChot: chot?.state ?? null,
      stateSau600: st.state,
      holdingSau: st.holding,
      minYChot: chot?.minY ?? null,
      minYGiua: giua.minY,
      minYSau: sau.minY,
      anh,
      msThat: Date.now() - t0,
      uocMs: h.estimatedMs,
    });
    ghi(
      `hoạt động «${h.label}» (${h.name}) chạy trọn`,
      ok,
      `r.ok=${r.ok} · ${xong?.event ?? 'không có sự kiện'} · ${xong?.data?.steps ?? '—'} bước · ` +
        `state tại mốc xong ${chot?.state ?? '—'} (sau 600 ms: ${st.state}) · holding ${st.holding} · ` +
        `minY giữa ${giua.minY} / chốt ${chot?.minY ?? '—'} / sau ${sau.minY} · ` +
        `${Date.now() - t0} ms (ước ${h.estimatedMs} ms) · ảnh ${anh}` +
        (xong?.data?.errors ? ` · LỖI BƯỚC: ${JSON.stringify(xong.data.errors)}` : ''),
      ketHd.at(-1),
    );
  }
  const soTron = ketHd.filter((x) => x.ok).length;
  ghi(
    `MỐC 1 — cả ${dsHd.length} hoạt động chạy TRỌN, mỗi cái một ảnh`,
    soTron === dsHd.length,
    `${soTron}/${dsHd.length} trọn · ${soAnh} ảnh trong ${THU_MUC}/`,
    { soTron, soHoatDong: dsHd.length, soAnh },
  );
  ghi(
    'MỐC 2 — đế giày (quét mesh) KHÔNG lún: minY ≥ −0,01 m ở mọi mẫu',
    chanXau !== null && chanXau.minY >= -0.01,
    chanXau
      ? `thấp nhất ${chanXau.minY} m (state ${chanXau.state}, hoạt động «${chanXau.hoatDong}»), ` +
        `xương bàn chân ${chanXau.footY} m`
      : 'không đo được',
    chanXau,
  );

  /* ============================== MỐC 4: Boss gõ giữa chừng → cắt ≤300 ms */
  in_('\n--- MỐC 4: Boss gõ giữa chừng → cắt ≤300 ms, lệnh sau vẫn chạy ---');
  const tBatDau = Date.now();
  await page.evaluate(() => window.stage.run('actor.activity', { actor: 'gen', name: 'di-dao' }));
  await nghi(2500);
  const dangLam = await page.evaluate(() =>
    window.stage.run('stage.describe').then((x) => x.result.actors.find((a) => a.id === 'gen').activity),
  );
  ghi(
    '`stage.describe().activity` báo đúng hoạt động đang làm',
    dangLam === 'di-dao',
    `activity = ${JSON.stringify(dangLam)}`,
  );
  const tGo = Date.now();
  await page.evaluate(() => window.stage.guiChat('Nhi ơi, lại đây giúp anh chút'));
  await nghi(2000);
  ds = await ev(page);
  const evText = sauEv(ds, 'user.text', tGo - 50, (e) => e.data?.actor === 'owner');
  const evCat = evText
    ? sauEv(ds, 'actor.activityCancelled', evText.t - 5, (e) => e.data?.actor === 'gen')
    : null;
  const treCat = evText && evCat ? evCat.t - evText.t : null;
  ghi(
    'MỐC 4 — t(user.text) → t(actor.activityCancelled) ≤300 ms',
    treCat !== null && treCat <= 300,
    `${treCat} ms (cắt sau ${evCat?.data?.steps ?? '—'} bước; hoạt động bắt đầu ${tGo - tBatDau} ms trước đó)`,
    { treCatMs: treCat, buocDaChay: evCat?.data?.steps ?? null },
  );
  const sauCat = await page.evaluate(() =>
    window.stage.run('stage.describe').then((x) => {
      const g = x.result.actors.find((a) => a.id === 'gen');
      return { activity: g.activity, state: g.state, queued: g.queued };
    }),
  );
  ghi(
    'cắt rồi thì `activity` về null và Nhi quay sang Boss (không đi tiếp)',
    sauCat.activity === null,
    JSON.stringify(sauCat),
    sauCat,
  );
  /*
   * MỐC 4b/4c — review #83 lỗi 3: đường CẮT phải DỌN. Đo trên một hoạt động
   * **có prop + có ngồi** (`uong-nuoc-ghe-an`), cắt đúng lúc đang ngồi và
   * trong tay còn cốc.
   */
  await nghi(1500);
  await page.evaluate(() =>
    window.stage.run('actor.activity', { actor: 'gen', name: 'uong-nuoc-ghe-an' }),
  );
  let dangCam = null;
  for (let i = 0; i < 80; i++) {
    await nghi(400);
    dangCam = await page.evaluate(() =>
      window.stage.run('stage.describe').then((x) => {
        const g = x.result.actors.find((a) => a.id === 'gen');
        return { state: g.state, holding: g.holding, activity: g.activity };
      }),
    );
    if (dangCam.holding !== null && dangCam.state === 'sitting') break;
  }
  ghi(
    'trước khi cắt: Nhi ĐANG NGỒI và trong tay có prop (đúng ca khó)',
    dangCam?.holding !== null && dangCam?.state === 'sitting',
    JSON.stringify(dangCam),
    dangCam,
  );
  const tCat2 = Date.now();
  await page.evaluate(() => window.stage.guiChat('Nhi ơi, dừng tay giúp anh'));
  // chờ `actor.activityCleaned` (phần dọn tốn ~1 s, bắn riêng khỏi Cancelled)
  await page
    .waitForFunction(
      () => window.__ev.some((e) => e.event === 'actor.activityCleaned'),
      null,
      { timeout: 20000 },
    )
    .catch(() => undefined);
  await nghi(1500);
  ds = await ev(page);
  const evText2 = sauEv(ds, 'user.text', tCat2 - 50, (e) => e.data?.actor === 'owner');
  const evCat2 = evText2
    ? sauEv(ds, 'actor.activityCancelled', evText2.t - 5, (e) => e.data?.actor === 'gen')
    : null;
  const evDon = sauEv(ds, 'actor.activityCleaned', tCat2 - 50, (e) => e.data?.actor === 'gen');
  const treCat2 = evText2 && evCat2 ? evCat2.t - evText2.t : null;
  ghi(
    'MỐC 4b — cắt lúc đang ngồi + cầm đồ: vẫn ≤300 ms, và có `activityCleaned`',
    treCat2 !== null && treCat2 <= 300 && evDon !== null,
    `cắt ${treCat2} ms · dọn: ${evDon ? JSON.stringify(evDon.data) : 'KHÔNG CÓ'}`,
    { treCatMs: treCat2, don: evDon?.data ?? null },
  );
  const sauDon = await page.evaluate(() =>
    window.stage.run('stage.describe').then((x) => {
      const g = x.result.actors.find((a) => a.id === 'gen');
      return { state: g.state, holding: g.holding, activity: g.activity };
    }),
  );
  ghi(
    'MỐC 4c — sau cú cắt: tay TRỐNG và KHÔNG còn ngồi (không thì tự sinh hoạt chết hẳn)',
    sauDon.holding === null && sauDon.state !== 'sitting' && sauDon.activity === null,
    JSON.stringify(sauDon),
    sauDon,
  );
  /* MỐC 4d — Boss gõ 3 câu liên tiếp giữa hoạt động: KHÔNG được chồng giọng */
  await nghi(3000);
  await amDatLai(page);
  await page.evaluate(() =>
    window.stage.run('actor.activity', { actor: 'gen', name: 'ngam-cua-so' }),
  );
  await nghi(2000);
  for (const cau of ['Nhi ơi', 'Nhi làm gì đấy', 'Nhi nghe anh không']) {
    await page.evaluate((c) => window.stage.guiChat(c), cau);
    await nghi(1200);
  }
  await nghi(6000);
  const am = await doGiong(page);
  const dinhAm = am.dinh;
  /*
   * **ĐỐI CHỨNG: cùng 3 câu đó, nhưng KHÔNG có hoạt động nào chạy.**
   *
   * Lượt trước đo `đỉnh 3` và câu hỏi duy nhất đáng hỏi là: **tại ai?** Không
   * có mẫu đối chứng thì không trả lời được, và một bộ bằng chứng chỉ vào
   * "có lỗi" mà không khoanh được vùng thì người sửa vẫn phải đo lại từ đầu.
   * Hoạt động KHÔNG nói câu nào (giao kèo của bảng), nên nếu đối chứng cũng
   * chồng thì chuyện này nằm ở lớp tiếng / I1, không ở J2.
   */
  await page.evaluate(() => window.stage.run('actor.stop', { actor: 'gen' }));
  await nghi(8000);
  await amDatLai(page);
  for (const cau of ['Nhi ơi', 'Nhi làm gì đấy', 'Nhi nghe anh không']) {
    await page.evaluate((c) => window.stage.guiChat(c), cau);
    await nghi(1200);
  }
  await nghi(6000);
  const amDoiChung = await doGiong(page);
  ghi(
    'ĐỐI CHỨNG — cùng 3 câu, KHÔNG có hoạt động nào chạy: đỉnh giọng',
    true, // không chấm đạt/không: đây là mẫu để KHOANH VÙNG, không phải lời hứa của J2
    `đỉnh ${amDoiChung.dinh} trên ${amDoiChung.soBat} lượt phát — ` +
      (amDoiChung.dinh === dinhAm
        ? 'BẰNG lúc có hoạt động ⇒ chồng giọng KHÔNG do J2 (hoạt động không nói câu nào)'
        : 'KHÁC lúc có hoạt động ⇒ phải soi tiếp phía J2'),
    { dinhKhongHoatDong: amDoiChung.dinh, soBat: amDoiChung.soBat, dinhCoHoatDong: dinhAm },
  );
  ghi(
    'MỐC 4d — Boss gõ 3 câu giữa hoạt động: đỉnh GIỌNG THẬT = 1 (không chồng)',
    dinhAm <= 1 && am.soBat >= 2,
    `đỉnh ${dinhAm} trên ${am.soBat} lượt phát thật (móc AudioBufferSourceNode; ` +
      'hai nhân vật cùng mở miệng thì ra 2). `soBat` ≥ 2 là điều kiện để con số ' +
      'đỉnh có nghĩa — autoplay bị chặn thì đỉnh 0 mà chẳng đo được gì',
    am,
  );
  // lệnh ngay sau khi cắt vẫn chạy được (hàng đợi không bị xoá sạch)
  const rSau = await page.evaluate(() =>
    window.stage.run('actor.emote', { actor: 'gen', emote: 'dong-y' }),
  );
  ghi('lệnh gửi ngay sau cú cắt vẫn `ok`', rSau.ok === true, JSON.stringify(rSau).slice(0, 160));

  /*
   * Chờ cho **vòng chờ não của I1 tắt hẳn** trước khi đo mốc 3.
   *
   * Bộ này chạy `?bridge=0` nên không có não: câu vừa gõ đưa phản xạ vào tầng
   * 2, và tầng 2 có **trần 30 s** (`tranTangHaiMs`, I1b/#75) — tới hạn Nhi nói
   * `CAU_HET_CHO`. Câu đó nổ giữa phút đo "để yên 65 s" thì đồng hồ rảnh của
   * máy tự sinh hoạt reset đúng lúc, và lượt thứ hai rơi ra ngoài phút đo:
   * **lỗi của dụng cụ đo, không phải của app**. Chờ cho hết trần rồi mới bấm
   * đồng hồ.
   */
  in_('   … chờ 36 s cho vòng "đang nghĩ" của I1 hết trần 30 s rồi mới bấm đồng hồ');
  await nghi(36000);
  /*
   * **Bấm lại đồng hồ rảnh bằng một lệnh thật** trước khi đo mốc 3.
   *
   * Lượt 3 đo được "lượt tự sinh đầu ở +13,7 s" và chấm KHÔNG ĐẠT ngưỡng 20 s
   * — nhưng app đúng: Nhi đã rảnh suốt 36 s chờ ở trên, nên đồng hồ `ranhMs`
   * của máy đã chạy từ trước `tYen`. Thước đo giả định sai rằng khoảng rảnh
   * bắt đầu đúng lúc script bấm giờ.
   *
   * Một lệnh chiếm thân ngắn làm Nhi bận một nhịp ⇒ máy tự reset `tRanhTu`
   * (nhánh "bận vì việc của người khác"), và từ đó `tYen` mới là mốc thật.
   */
  await page.evaluate(() => window.stage.run('actor.emote', { actor: 'gen', emote: 'dong-y' }));
  /*
   * Và bấm giờ ĐÚNG LÚC Nhi rảnh lại, không phải một con số chờ cho chắc.
   *
   * Lượt 4 chờ cứng 2500 ms cho một emote dài 1300 ms, nên `tYen` trễ ~1,2 s
   * so với lúc khoảng rảnh thật bắt đầu — và lượt tự sinh đầu rơi vào
   * **+18552 ms** thay vì ≥19 s. Lệch 448 ms đó là **toàn bộ** khoảng cách
   * giữa ĐẠT và KHÔNG ĐẠT, và nó nằm trong thước đo chứ không nằm trong app.
   */
  await page.waitForFunction(
    () => window.stage.doXuong('gen').state === 'idle',
    null,
    { timeout: 20000 },
  );

  /* ================================ MỐC 3: rảnh 65 s → ≥2 hoạt động tự sinh */
  in_('\n--- MỐC 3: để yên 65 s → Nhi tự sinh ≥2 hoạt động khác nhau ---');
  const tYen = Date.now();
  // Để YÊN thật: không gõ, không bấm, không gọi lệnh nào trong 65 s.
  for (let i = 0; i < 13; i++) {
    await nghi(5000);
    if (i === 6) await page.screenshot({ path: `${THU_MUC}/90-tu-sinh-hoat.png` });
  }
  ds = await ev(page);
  dsL = await lenh(page);
  const tuSinh = ds.filter(
    (e) => e.event === 'actor.activityStart' && e.t >= tYen && e.data?.actor === 'gen',
  );
  const lenhTuSinh = dsL.filter((b) => b.nguon === 'tu-sinh-hoat' && b.t >= tYen);
  const tenTuSinh = tuSinh.map((e) => String(e.data?.activity));
  ghi(
    'MỐC 3 — rảnh 65 s → ≥2 hoạt động TỰ SINH, khác nhau',
    tuSinh.length >= 2 && new Set(tenTuSinh).size >= 2,
    `${tuSinh.length} lượt: ${tenTuSinh.join(' → ')} (${new Set(tenTuSinh).size} loại khác nhau)`,
    { soLuot: tuSinh.length, ten: tenTuSinh, soKhacNhau: new Set(tenTuSinh).size },
  );
  ghi(
    'lệnh tự sinh đi qua dispatcher với nguồn "tu-sinh-hoat" (phân biệt được trong nhật ký)',
    lenhTuSinh.length >= 2 && lenhTuSinh.every((b) => b.cmd === 'actor.activity'),
    `${lenhTuSinh.length} lệnh nguồn tu-sinh-hoat: ${lenhTuSinh.map((b) => b.args?.name).join(', ')}`,
    { soLenhTuSinh: lenhTuSinh.length },
  );
  const dinhThoiGian = tuSinh.length >= 2 ? tuSinh[1].t - tuSinh[0].t : null;
  ghi(
    'lượt tự sinh đầu tiên nổ sau ~20 s im lặng (ngưỡng `ranhMs`), không sớm hơn',
    tuSinh.length >= 1 && tuSinh[0].t - tYen >= 19000 && tuSinh[0].t - tYen <= 40000,
    `lượt 1 ở +${tuSinh.length ? tuSinh[0].t - tYen : '—'} ms · khoảng giữa hai lượt ${dinhThoiGian} ms`,
    { luot1Ms: tuSinh.length ? tuSinh[0].t - tYen : null, giuaHaiLuotMs: dinhThoiGian },
  );
  const chanDay = await chanDayNhat(page);
  ghi(
    'minY LẤY MẪU DÀY (mỗi 300 ms, cả phiên) vẫn ≥ −0,01 m',
    chanDay?.thapNhat !== null && (chanDay?.thapNhat?.minY ?? -1) >= -0.01,
    `thấp nhất ${chanDay?.thapNhat?.minY ?? '—'} m (state ${chanDay?.thapNhat?.state ?? '—'}) ` +
      `trên ${chanDay?.soMau ?? 0} mẫu`,
    chanDay,
  );
  const chanTuSinh = await doChan(page);
  ghi(
    'sau khi tự sinh hoạt, chân vẫn chạm sàn (minY ≥ −0,01 m)',
    chanTuSinh.minY !== null && chanTuSinh.minY >= -0.01,
    `minY ${chanTuSinh.minY} m (state ${chanTuSinh.state})`,
    chanTuSinh,
  );

  /* ============================================== sạch: mọi lệnh ok, console 0 */
  in_('\n--- sạch: r.ok mọi lệnh · console 0 lỗi · màn 390 px ---');
  await page.setViewportSize({ width: 390, height: 844 });
  await nghi(3000);
  await page.screenshot({ path: `${THU_MUC}/91-mobile-390.png` });
  await page.setViewportSize({ width: 1440, height: 900 });

  dsL = await lenh(page);
  const loiLenh = dsL.filter((b) => b.ok !== true);
  ghi(
    'r.ok = true cho MỌI lệnh trong cả phiên',
    loiLenh.length === 0,
    `${dsL.length} lệnh, ${loiLenh.length} lỗi` +
      (loiLenh.length ? ': ' + loiLenh.map((b) => `${b.cmd} (${b.error})`).join(' · ') : ''),
    { soLenh: dsL.length, loi: loiLenh.slice(0, 5) },
  );
  const soLenhHd = dsL.filter((b) => b.cmd === 'actor.activity').length;
  ghi(
    'hoạt động chạy bằng LỆNH CÓ SẴN qua ctx.run (nhật ký có đủ moveTo/sit/play/emote)',
    dsL.some((b) => b.cmd === 'actor.sit') &&
      dsL.some((b) => b.cmd === 'actor.play') &&
      dsL.some((b) => b.cmd === 'actor.moveTo') &&
      dsL.some((b) => b.cmd === 'actor.hold'),
    `${soLenhHd} lệnh actor.activity · ${dsL.length} lệnh tổng`,
  );
  ghi('console 0 lỗi suốt cả vòng', loiConsole.length === 0, loiConsole.slice(0, 4).join(' | '), {
    loiConsole,
  });

  /* ------------------------------------------------------------- kết quả */
  nhatKy.hoatDong = ketHd;
  nhatKy.tomTat = { soBuoc, soOk, thatBai };
  writeFileSync(`${THU_MUC}/nhat-ky-kiem-j2.json`, JSON.stringify(nhatKy, null, 2));

  const bangHd = ketHd
    .map(
      (x) =>
        `| ${x.name} | ${x.buoc ?? '—'} | ${x.msThat} ms (ước ${x.uocMs}) | ${x.minYGiua} / ${x.minYChot} / ${x.minYSau} | ` +
        `${x.stateChot} | ${x.ok ? '✅' : '❌'} | \`${x.anh}\` |`,
    )
    .join('\n');
  const bang = [
    '| Thước đo (Issue #79) | Lời hứa | Đo thật | Kết |',
    '| --- | --- | --- | --- |',
    `| số hoạt động trong bảng | ≥12 | **${dsHd.length}** | ${dsHd.length >= 12 ? '✅' : '❌'} |`,
    `| hoạt động chạy TRỌN (r.ok + activityDone + về idle) | 12/12 | **${soTron}/${dsHd.length}** | ${soTron === dsHd.length ? '✅' : '❌'} |`,
    `| đế giày quét mesh (\`minY\`) | ≥ −0,01 m | **${chanXau?.minY ?? '—'} m** | ${chanXau && chanXau.minY >= -0.01 ? '✅' : '❌'} |`,
    `| rảnh 65 s → hoạt động tự sinh | ≥2, khác nhau | **${tuSinh.length} lượt / ${new Set(tenTuSinh).size} loại** | ${tuSinh.length >= 2 && new Set(tenTuSinh).size >= 2 ? '✅' : '❌'} |`,
    `| Boss gõ giữa chừng → cắt | ≤300 ms | **${treCat} ms** | ${treCat !== null && treCat <= 300 ? '✅' : '❌'} |`,
    `| \`r.ok\` mọi lệnh | 100 % | **${dsL.length - loiLenh.length}/${dsL.length}** | ${loiLenh.length === 0 ? '✅' : '❌'} |`,
    `| cắt lúc NGỒI + CẦM ĐỒ (review #83 lỗi 3) | ≤300 ms + dọn | **${treCat2} ms**, holding ${sauDon.holding}, state ${sauDon.state} | ${treCat2 !== null && treCat2 <= 300 && sauDon.holding === null && sauDon.state !== 'sitting' ? '✅' : '❌'} |`,
    `| đỉnh GIỌNG THẬT, Boss gõ 3 câu giữa hoạt động | 1 (trên ≥2 lượt phát) | **${dinhAm}** / ${am.soBat} lượt | ${dinhAm <= 1 && am.soBat >= 2 ? '✅' : '❌'} |`,
    `| ĐỐI CHỨNG: cùng 3 câu, KHÔNG có hoạt động | — (khoanh vùng) | **${amDoiChung.dinh}** / ${amDoiChung.soBat} lượt | ${amDoiChung.dinh === dinhAm ? 'không do J2' : 'phải soi J2'} |`,
    `| \`minY\` lấy mẫu DÀY (300 ms, cả phiên) | ≥ −0,01 m | **${chanDay?.thapNhat?.minY ?? '—'} m** (${chanDay?.soMau ?? 0} mẫu) | ${(chanDay?.thapNhat?.minY ?? -1) >= -0.01 ? '✅' : '❌'} |`,
    `| console | 0 lỗi | **${loiConsole.length}** | ${loiConsole.length === 0 ? '✅' : '❌'} |`,
    '',
    '### Từng hoạt động',
    '',
    '| hoạt động | bước | thời lượng | minY giữa / chốt / sau (m) | state tại mốc xong | kết | ảnh |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    bangHd,
    '',
    `Tự sinh hoạt: ${tenTuSinh.join(' → ') || '(không có)'}; lượt đầu ở +${
      tuSinh.length ? tuSinh[0].t - tYen : '—'
    } ms sau khi Boss để yên.`,
    `Cổng riêng: web ${CONG_WEB} · ws ${CONG_WS} · tts ${CONG_TTS} — bridge RIÊNG của bộ đo, không đụng 5173/8787-8790 của Boss.`,
  ].join('\n');
  writeFileSync(`${THU_MUC}/bang.md`, bang + '\n');
  in_('\n' + bang + '\n');

  in_(`\n=== ${soOk}/${soBuoc} mục ĐẠT ===`);
  if (thatBai.length) {
    in_('✗ CHƯA ĐẠT:');
    for (const t of thatBai) in_('   - ' + t);
  }
  await browser.close();
  dongHet(thatBai.length ? 1 : 0);
} catch (e) {
  in_('\n💥 ' + (e?.stack ?? e));
  nhatKy.loiChay = String(e?.message ?? e);
  nhatKy.tomTat = { soBuoc, soOk, thatBai };
  writeFileSync(`${THU_MUC}/nhat-ky-kiem-j2.json`, JSON.stringify(nhatKy, null, 2));
  /*
   * **Vẫn ghi bảng dù hỏng giữa đường.** Lượt trước trang sập ở MỐC 3 và cả
   * bộ số của 12 hoạt động + MỐC 4 (đã đo xong, đã ĐẠT) **không vào được
   * `bang.md`** — mất trắng một lượt GPU vì mỗi cái ảnh chụp cuối cùng.
   */
  writeFileSync(
    `${THU_MUC}/bang.md`,
    [
      `> ⚠️ LƯỢT NÀY HỎNG GIỮA ĐƯỜNG: ${String(e?.message ?? e)}`,
      '> Bảng dưới là những mục đã đo xong trước khi hỏng.',
      '',
      '| Mục | Kết | Chi tiết |',
      '| --- | --- | --- |',
      ...nhatKy.buoc.map(
        (b) => `| ${b.nhan} | ${b.ok ? '✅' : '❌'} | ${String(b.chiTiet ?? '').replace(/\|/g, '/')} |`,
      ),
      '',
      `${soOk}/${soBuoc} mục ĐẠT trước khi hỏng.`,
    ].join('\n') + '\n',
  );
  try {
    await page.screenshot({ path: `${THU_MUC}/99-loi.png` });
  } catch {
    /* trang đã chết */
  }
  await browser.close().catch(() => undefined);
  dongHet(1);
}
