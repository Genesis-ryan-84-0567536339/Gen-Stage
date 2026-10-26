/**
 * kiem-mo-phong-loi-cu.mjs — MÔ PHỎNG nguyên nhân gốc của lỗi "driver rớt
 * kết nối ws tới bridge âm thầm sau vài phút → brainConnected về 0, không có
 * dòng log nào" (Refs #37, báo cáo E2E 26/10).
 *
 * NGUYÊN NHÂN THẬT (đọc code, không đoán):
 *
 *   `scripts/nao-agy.mjs` (bản TRƯỚC khi sửa) nối tới bridge bằng
 *   `noiSanKhau()` KHÔNG hề truyền `?role=nao` trên URL ws. Bridge
 *   (`bridge/server.ts`) chỉ đếm một client vào `naoWs` (tức "não đang nối")
 *   khi `req.url` có `?role=nao` — driver connect "trần" thì KHÔNG BAO GIỜ
 *   được tính, dù ws của nó sống khoẻ suốt phiên.
 *
 *   Vậy `brainConnected` dựa vào đâu? — Vào MỘT nguồn khác hẳn: mỗi khi agy
 *   gọi một tool MCP qua HTTP (`bridge/mcp.ts` → `khiNaoGoi: naoHttpVuaGoi`),
 *   bridge đặt `naoHttpDen = Date.now() + HAN_NAO_MS` (mặc định **60 000 ms**).
 *   `soNao()` chỉ đếm là ">0" khi `naoHttpDen > Date.now()`.
 *
 *   Driver chỉ gọi agy **một lượt mỗi câu Sếp nói** (không polling liên tục).
 *   Sếp im hơn 60 giây (rất bình thường — đang đọc màn hình, đang làm việc
 *   khác) → đồng hồ `naoHttpDen` hết hạn → bridge tự bắn
 *   `bridge.brain {count:0, connected:false}` cho MỌI client lẫn sân khấu.
 *   KHÔNG có sự kiện `close`/`error` nào xảy ra (ws của driver vẫn `OPEN`
 *   100 % thời gian) nên driver **không ghi một dòng log nào** — đúng khớp
 *   với "rớt kết nối ws âm thầm... không log nào". Đây không phải lỗi mạng,
 *   là lỗi THIẾT KẾ: driver không bao giờ tự xưng là "não".
 *
 * Script này nối một ws GIỐNG bản driver CŨ (không `role=nao`) tới một bridge
 * thử (cổng ≥8820), rồi RÚT NGẮN hạn `GEN_STAGE_BRAIN_TTL` xuống vài giây để
 * "mô phỏng" đúng 5 phút im lặng mà không phải chờ thật — thấy `brainConnected`
 * rơi về false dù ws không hề đóng, không hề lỗi.
 *
 * Chạy:  node scripts/kiem-mo-phong-loi-cu.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import WebSocket from 'ws';

const THU_MUC = 'docs/nao';
mkdirSync(THU_MUC, { recursive: true });

const CONG = 8825; // ≥8820, không đụng 8787-8790 của Boss
const CONG_TTS = 8826;
const CONG_MCP = 8827;
const CONG_STT = 8828;
const TTL_MO_PHONG = 3000; // "vài phút im lặng" rút thành 3 s cho script chạy nhanh

const nhatKy = [];
const ghi = (s) => {
  const dong = `[${new Date().toISOString()}] ${s}`;
  nhatKy.push(dong);
  console.log(dong);
};

const bridge = spawn('node_modules/.bin/tsx', ['bridge/server.ts'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    GEN_STAGE_PORT: String(CONG),
    GEN_STAGE_TTS_PORT: String(CONG_TTS),
    GEN_STAGE_MCP_PORT: String(CONG_MCP),
    GEN_STAGE_STT_PORT: String(CONG_STT),
    GEN_STAGE_BRAIN_TTL: String(TTL_MO_PHONG),
  },
});
bridge.stdout.on('data', (d) => ghi(`[bridge] ${d}`.trim()));
bridge.stderr.on('data', (d) => ghi(`[bridge] ${d}`.trim()));

await new Promise((r) => setTimeout(r, 1500)); // chờ bridge lên cổng

ghi(`--- nối ws KIỂU CŨ (không "?role=nao") — đúng như scripts/nao-agy.mjs TRƯỚC khi sửa ---`);
const soKienBrain = [];
const w = new WebSocket(`ws://127.0.0.1:${CONG}/`); // KHÔNG có role=nao — tái hiện lỗi
w.on('open', () => ghi('ws kiểu cũ đã OPEN (sẽ không bao giờ close/error trong lượt này)'));
w.on('message', (tho) => {
  const g = JSON.parse(String(tho));
  if (g.event === 'bridge.brain') {
    soKienBrain.push({ t: Date.now(), ...g.data });
    ghi(`<- bridge.brain ${JSON.stringify(g.data)}  (readyState ws vẫn = ${w.readyState} = OPEN)`);
  }
});

ghi(`--- mô phỏng agy gọi tool MCP một lần (y như một câu Sếp nói) rồi IM — chờ hết hạn ${TTL_MO_PHONG} ms ---`);
const resMcp = await fetch(`http://127.0.0.1:${CONG_MCP}/mcp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
}).catch((e) => ({ loi: e.message }));
ghi(`-> gọi POST /mcp một lần (naoHttpDen được đặt): ${resMcp.loi ?? resMcp.status ?? 'ok'}`);
await new Promise((r) => setTimeout(r, TTL_MO_PHONG + 1200));

const matDoLog = soKienBrain.some((e) => e.connected === false);
ghi(
  matDoLog
    ? '=> ĐÚNG NHƯ BÁO CÁO: brainConnected về false dù ws driver vẫn OPEN, không một dòng close/error nào.'
    : '=> không tái hiện được trong lượt này (xem log bridge ở trên).',
);
ghi(`ws kiểu cũ readyState cuối cùng = ${w.readyState} (1 = OPEN — KHÔNG hề rớt tầng TCP)`);

w.close();
bridge.kill('SIGTERM');
await new Promise((r) => setTimeout(r, 500));

writeFileSync(`${THU_MUC}/mo-phong-loi-cu.log`, nhatKy.join('\n') + '\n');
writeFileSync(
  `${THU_MUC}/mo-phong-loi-cu.json`,
  JSON.stringify({ cong: CONG, ttlMoPhong: TTL_MO_PHONG, soKienBrain, ketLuan: matDoLog }, null, 2) + '\n',
);
console.log(`\n==> ${matDoLog ? 'TÁI HIỆN ĐƯỢC' : 'KHÔNG tái hiện được'}. Log: ${THU_MUC}/mo-phong-loi-cu.log`);
process.exit(matDoLog ? 0 : 1);
