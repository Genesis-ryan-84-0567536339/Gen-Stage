/**
 * kiem-reconnect.mjs — BẰNG CHỨNG driver não sống 10 phút + tự nối lại sau
 * khi mất bridge (Refs #37). Cờ khoá chạy MỘT LẦN: `docs/nao/.da-chay-reconnect`.
 *
 * Dựng: bridge thử (cổng ≥8820, KHÔNG đụng 8787-8790 của Boss) + một "sân
 * khấu giả" (ws role=stage trả lời mọi lệnh ngay) + driver não THẬT
 * (`scripts/nao-agy.mjs`, `GEN_STAGE_NAO_CHE_DO=print` — không cần agy/tmux vì
 * không có câu nào được gửi, chỉ đo tầng kết nối ws + heartbeat).
 *
 * Mốc 5 phút: `kill -9` bridge (mô phỏng crash/rớt mạng thật, không bắt tay
 * đóng), bật lại ngay bridge mới trên đúng cổng đó, rồi đo driver nối lại
 * trong bao lâu và `brainConnected` (qua `bridge.brain` sân khấu giả nhận
 * được) có về `true` không.
 *
 * Chạy:  node scripts/kiem-reconnect.mjs           # mất ~10 phút
 *        node scripts/kiem-reconnect.mjs --lai     # xoá cờ khoá rồi chạy lại
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import WebSocket from 'ws';

const THU_MUC = 'docs/nao';
mkdirSync(THU_MUC, { recursive: true });

const argv = process.argv.slice(2);
const CO_KHOA = `${THU_MUC}/.da-chay-reconnect`;
if (argv.includes('--lai')) {
  if (existsSync(CO_KHOA)) rmSync(CO_KHOA);
} else if (existsSync(CO_KHOA)) {
  console.error(
    `\n⛔ ${CO_KHOA} đã tồn tại — bằng chứng reconnect chỉ chạy MỘT LẦN.\n` +
      `   Thật sự cần chạy lại: node scripts/kiem-reconnect.mjs --lai\n`,
  );
  process.exit(2);
}

const CONG = 8821; // ≥8820
const CONG_TTS = 8822;
const CONG_MCP = 8823;
const CONG_STT = 8824;
const TONG_PHUT = Number(process.env.KIEM_RECONNECT_PHUT ?? 10);
const MOC_GIET_MS = Math.round((TONG_PHUT * 60_000) / 2); // giết bridge ở đúng giữa chừng (mặc định ~phút 5)
const TONG_MS = TONG_PHUT * 60_000;

const nhatKy = [];
const bienCo = [];
const ghi = (s) => {
  const dong = `[${new Date().toISOString()}] ${s}`;
  nhatKy.push(dong);
  console.log(dong);
};

const MOI_TRUONG_BRIDGE = {
  ...process.env,
  GEN_STAGE_PORT: String(CONG),
  GEN_STAGE_TTS_PORT: String(CONG_TTS),
  GEN_STAGE_MCP_PORT: String(CONG_MCP),
  GEN_STAGE_STT_PORT: String(CONG_STT),
};

let bridge = null;
function moBridge() {
  // `tsx` (cả qua `npx` lẫn gọi thẳng `node_modules/.bin/tsx`) tự SINH THÊM
  // một tiến trình node con để nạp loader (`--require preflight.cjs --import
  // loader.mjs`) — đã đo thật: giết đúng PID mà `spawn()` trả về chỉ giết cái
  // vỏ, bridge thật (con) vẫn sống, giữ cổng → bật lại dính `EADDRINUSE` và
  // ping vẫn được trả lời sau "giết" vì chẳng ai chết. `detached: true` đặt
  // tiến trình vỏ làm trưởng một process GROUP mới; con (không tự detach)
  // nằm trong đúng group đó, nên giết bằng PID ÂM (`kill(-pid)`) giết cả nhà.
  bridge = spawn('node_modules/.bin/tsx', ['bridge/server.ts'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: MOI_TRUONG_BRIDGE,
    detached: true,
  });
  bridge.stdout.on('data', (d) => ghi(`[bridge] ${d}`.trim()));
  bridge.stderr.on('data', (d) => ghi(`[bridge] ${d}`.trim()));
  return bridge;
}

/** Giết CẢ process group của bridge (vỏ tsx + con node thật), không chỉ vỏ. */
function gietBridge() {
  if (!bridge?.pid) return;
  try {
    process.kill(-bridge.pid, 'SIGKILL');
  } catch {
    try {
      bridge.kill('SIGKILL');
    } catch {
      /* đã chết */
    }
  }
}

async function choCongLen(port, msToiDa = 15000) {
  const het = Date.now() + msToiDa;
  while (Date.now() < het) {
    try {
      await fetch(`http://127.0.0.1:${CONG_MCP}/khoe`);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return false;
}

/* ------------------------------------------------------------- sân khấu giả */

let sanGia = null;
let soLanBrainTrue = 0;
let soLanBrainFalse = 0;
let gioBrainTrueGanNhat = 0;
function moSanKhauGia() {
  const w = new WebSocket(`ws://127.0.0.1:${CONG}/?role=stage`);
  w.on('open', () => ghi('[sân khấu giả] đã nối (role=stage)'));
  w.on('message', (tho) => {
    let g;
    try {
      g = JSON.parse(String(tho));
    } catch {
      return;
    }
    if (g.event === 'bridge.brain') {
      bienCo.push({ t: Date.now(), event: 'bridge.brain', data: g.data });
      if (g.data?.connected) {
        soLanBrainTrue++;
        gioBrainTrueGanNhat = Date.now();
      } else {
        soLanBrainFalse++;
        ghi(`[sân khấu giả] <- bridge.brain connected:false (count ${g.data?.count})`);
      }
      return;
    }
    // "sân khấu giả" trả lời ngay mọi lệnh (describe, actor.say…) để driver
    // không bao giờ bị chặn ở `stage.describe` nếu lỡ có một lượt não.
    if (typeof g.id === 'string' && typeof g.cmd === 'string') {
      w.send(JSON.stringify({ id: g.id, ok: true, result: {} }));
    }
  });
  w.on('close', (ma) => {
    ghi(`[sân khấu giả] mất kết nối (mã ${ma}) — tự nối lại`);
    setTimeout(moSanKhauGia, 500);
  });
  w.on('error', () => {});
  sanGia = w;
  return w;
}

/* ----------------------------------------------------------------- driver */

let driver = null;
const dongDriver = [];
function moDriver() {
  driver = spawn('node', ['scripts/nao-agy.mjs'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GEN_STAGE_PORT: String(CONG),
      GEN_STAGE_NAO_CHE_DO: 'print', // không cần tmux/agy — không gửi câu nào trong bài đo này
      GEN_STAGE_AGY_CWD: '.cache/kiem-reconnect-agy',
      GEN_STAGE_NAO_DEBUG_NHIP_TIM: '1', // in từng ping/pong ra log làm bằng chứng
    },
  });
  driver.stdout.on('data', (d) => {
    const s = String(d);
    dongDriver.push(s);
    process.stdout.write(`   [nao] ${s}`);
  });
  driver.stderr.on('data', (d) => {
    const s = String(d);
    dongDriver.push(s);
    process.stdout.write(`   [nao:err] ${s}`);
  });
  return driver;
}

function dongHet(ma) {
  try {
    driver?.kill('SIGTERM');
  } catch {
    /* đã chết */
  }
  try {
    sanGia?.close();
  } catch {
    /* đã đóng */
  }
  try {
    gietBridge();
  } catch {
    /* đã chết */
  }
  process.exit(ma);
}
for (const t of ['SIGINT', 'SIGTERM']) process.on(t, () => dongHet(130));

/* ---------------------------------------------------------------- chạy */

ghi(`=== kiểm reconnect: ${TONG_PHUT} phút · bridge thử cổng ${CONG} · giết bridge ở mốc ${MOC_GIET_MS} ms ===`);
moBridge();
if (!(await choCongLen())) {
  ghi('!! bridge không lên nổi — dừng.');
  dongHet(1);
}
moSanKhauGia();
moDriver();

const t0 = Date.now();
let daGiet = false;
let gioGiet = 0;
let soDongTruocGiet = 0;
let gioNoiLaiSauGiet = null;
let gioBrainTrueSauGiet = null;

while (Date.now() - t0 < TONG_MS) {
  await new Promise((r) => setTimeout(r, 1000));
  const trieu = Date.now() - t0;

  if (!daGiet && trieu >= MOC_GIET_MS) {
    daGiet = true;
    gioGiet = Date.now();
    soDongTruocGiet = dongDriver.length;
    ghi(`=== MỐC GIẾT BRIDGE (mô phỏng crash: kill -9) lúc ${Math.round(trieu / 1000)} s ===`);
    gietBridge();
    await new Promise((r) => setTimeout(r, 800)); // chờ OS giải phóng cổng
    moBridge();
    if (!(await choCongLen())) ghi('!! bridge mới không lên nổi.');
  }

  if (daGiet && !gioNoiLaiSauGiet) {
    // chỉ nhìn dòng log driver XUẤT HIỆN SAU mốc giết — tránh nhận nhầm lần
    // nối đầu tiên (lúc mới bật) làm "đã nối lại".
    const dongMoi = dongDriver.slice(soDongTruocGiet).join('');
    if (/đã nối bridge.*\(sau \d+ lần thử nối lại\)/.test(dongMoi)) {
      gioNoiLaiSauGiet = Date.now();
      ghi(`=== driver đã NỐI LẠI sau ${gioNoiLaiSauGiet - gioGiet} ms ===`);
    }
  }

  if (daGiet && gioNoiLaiSauGiet && !gioBrainTrueSauGiet && gioBrainTrueGanNhat > gioGiet) {
    gioBrainTrueSauGiet = gioBrainTrueGanNhat;
    ghi(`=== brainConnected VỀ TRUE sau ${gioBrainTrueSauGiet - gioGiet} ms kể từ lúc giết ===`);
  }
}

ghi(`=== hết ${TONG_PHUT} phút — dọn dẹp ===`);
writeFileSync(`${THU_MUC}/reconnect.log`, nhatKy.join('\n') + '\n');

const ketQua = {
  cong: CONG,
  tongPhut: TONG_PHUT,
  mocGietMs: MOC_GIET_MS,
  gioGietMs: gioGiet - t0,
  msNoiLaiSauGiet: gioNoiLaiSauGiet ? gioNoiLaiSauGiet - gioGiet : null,
  msBrainTrueSauGiet: gioBrainTrueSauGiet ? gioBrainTrueSauGiet - gioGiet : null,
  noiLaiTrong10s: gioNoiLaiSauGiet ? gioNoiLaiSauGiet - gioGiet <= 10_000 : false,
  soLanBrainTrue,
  soLanBrainFalse,
  soPingGuiDi: (dongDriver.join('').match(/-> ping/g) ?? []).length,
  soPongNhanDuoc: (dongDriver.join('').match(/<- pong/g) ?? []).length,
  bienCoBrain: bienCo,
};
writeFileSync(`${THU_MUC}/nhat-ky-reconnect.json`, JSON.stringify(ketQua, null, 2) + '\n');
writeFileSync(CO_KHOA, new Date().toISOString() + '\n');

ghi(`==> ${JSON.stringify(ketQua)}`);
dongHet(ketQua.noiLaiTrong10s ? 0 : 1);
