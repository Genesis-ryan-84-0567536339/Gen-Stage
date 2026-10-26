/**
 * nao-demo.mjs — NÃO MẪU KHÔNG CẦN LLM (B3, Issue #21).
 *
 * Mục đích: chứng minh **vòng kín** chạy thật, không phụ thuộc agy hay mạng.
 * Nó là một client MCP đầy đủ: tự bật `bridge/mcp.ts` qua **stdio thật**, gọi
 * `stage_bootstrap` → `stage_events` (long-poll) → `stage_describe` → ra lệnh.
 * Luật chọn lệnh chỉ là bảng if/else (xem `chonLenh`), không có mô hình nào —
 * nên khi agy bí, bằng chứng vòng kín vẫn còn, và khi agy chạy thì nó làm đúng
 * việc này bằng đầu của nó.
 *
 * Chạy:
 *   node scripts/nao-demo.mjs                   # nghe mãi (Ctrl+C để dừng)
 *   node scripts/nao-demo.mjs --luot 2          # trả lời 2 lượt rồi thoát
 *   node scripts/nao-demo.mjs --ghi docs/b3/nao-demo-log.json
 *   node scripts/nao-demo.mjs --han 120000      # trần thời gian (ms)
 *
 * Yêu cầu: `pnpm bridge` đang chạy và app mở bằng `?bridge=1`. Chưa mở trình
 * duyệt thì tool trả lỗi rõ và script in ra, không treo im lặng.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const argv = process.argv.slice(2);
const soLuot = Number(doc('--luot') ?? Infinity);
const duongGhi = doc('--ghi');
const HAN = Number(doc('--han') ?? 180000);
/** Long-poll mỗi lượt chờ bao lâu (ms) — giống skill cho agy. */
const CHO = Number(doc('--cho') ?? 25000);

function doc(ten) {
  const i = argv.indexOf(ten);
  return i >= 0 ? argv[i + 1] : undefined;
}

const nhatKy = {
  chay: new Date().toISOString(),
  nao: 'nao-demo (rule-based, không LLM)',
  qua: 'MCP stdio → bridge/mcp.ts',
  toolCalls: [],
  luot: [],
};

/* ------------------------------------------------------------ luật chọn lệnh */

/** Bỏ dấu để so khớp từ khoá dù Boss gõ thiếu dấu. */
function khongDau(s) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function slug(s) {
  return (
    khongDau(s)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'module'
  );
}

/**
 * Luật: câu của Boss → danh sách tool call cho Gen.
 *
 * Ba nhánh đúng như đề bài:
 *  - chào         → `actor_emote chao` + `actor_say`
 *  - "dựng/làm X" → `ra-lenh` + `screen_stream` (code giả) + `module_build X`
 *                   + `thanh-cong` + `actor_say`
 *  - còn lại      → `suy-nghi` + `actor_say` nhại lại câu Boss
 */
export function chonLenh(cau, dem = 1) {
  const k = khongDau(cau);

  if (/\b(chao|hello|hi|hey|xin chao)\b/.test(k)) {
    return {
      kieu: 'chao',
      buoc: [
        ['actor_emote', { actor: 'gen', emote: 'chao', interrupt: true }],
        ['actor_say', { actor: 'gen', text: 'Dạ em chào Sếp. Sếp cần em làm gì ạ?', emotion: 'vui' }],
      ],
    };
  }

  const viec = /(?:dung|lam|tao|build|viet|xay)\s+(?:cho em\s+|giup em\s+|thu\s+)?(.+)/.exec(k);
  if (viec) {
    // lấy lại nguyên văn CÓ DẤU ở đúng khúc đó để nhãn module đẹp
    // `khongDau` giữ nguyên số ký tự (NFD rồi bỏ dấu kết hợp), nên vị trí khớp
    // trên bản không dấu trỏ đúng vào bản có dấu → nhãn module giữ được dấu.
    const dau = viec.index + viec[0].length - viec[1].length;
    const thoVi = cau.slice(dau).replace(/[.!?,;]+$/, '').trim();
    const ten = thoVi || viec[1];
    const id = `${slug(ten)}-${dem}`;
    return {
      kieu: 'lam-viec',
      viec: ten,
      moduleId: id,
      buoc: [
        ['actor_emote', { actor: 'gen', emote: 'ra-lenh', interrupt: true }],
        [
          'screen_stream',
          {
            screen: 'main',
            kind: 'code',
            chunks: JSON.stringify([
              `// ${ten}\n`,
              'import { connector } from "@genesis/sdk";\n',
              `export default connector({\n  ten: "${ten}",\n`,
              '  xacThuc: "token",\n  bang: ["ban-ghi", "truong"],\n});\n',
              '✓ build xong, 0 lỗi\n',
            ]),
          },
        ],
        [
          'module_build',
          { id, shape: 'book', label: ten.slice(0, 24), from: 'main', durationMs: 2600 },
        ],
        ['actor_emote', { actor: 'gen', emote: 'thanh-cong', interrupt: true }],
        [
          'actor_say',
          {
            actor: 'gen',
            text: `Xong rồi Sếp, ${ten} đã kết tinh thành module. Em cất lên kệ nhé?`,
            emotion: 'vui',
          },
        ],
      ],
    };
  }

  return {
    kieu: 'nhai-lai',
    buoc: [
      ['actor_emote', { actor: 'gen', emote: 'suy-nghi', interrupt: true }],
      [
        'actor_say',
        {
          actor: 'gen',
          text: `Dạ Sếp nói "${cau.replace(/"/g, '')}". Em ghi lại rồi ạ.`,
          emotion: 'cham-chu',
        },
      ],
    ],
  };
}

/* --------------------------------------------------------------- client MCP */

const ra = (...x) => console.log('[nao]', ...x);

/**
 * Phải truyền `env` TAY.
 *
 * `StdioClientTransport` mặc định chỉ cho con thừa hưởng một danh sách biến
 * môi trường an toàn (PATH, HOME…), nên `GEN_STAGE_PORT` của bằng chứng bị
 * rơi và `bridge/mcp.ts` quay về cổng 8787 — tức nối vào bridge khác, nghe
 * mãi không thấy câu nào. Đo thật một lần rồi mới thấy.
 */
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', 'bridge/mcp.ts'],
  cwd: process.cwd(),
  env: { ...process.env },
  stderr: 'inherit',
});
const client = new Client({ name: 'nao-demo', version: '0.1' });
await client.connect(transport);

const ds = await client.listTools();
ra(`đã nối MCP stdio · ${ds.tools.length} tool`);
nhatKy.soTool = ds.tools.length;
nhatKy.tenTool = ds.tools.map((t) => t.name);

/** Gọi một tool, ghi vào nhật ký, trả về JSON đã đọc (hoặc `{error}`). */
async function goi(ten, args = {}) {
  const t0 = Date.now();
  let kq;
  try {
    kq = await client.callTool({ name: ten, arguments: args });
  } catch (e) {
    kq = { isError: true, content: [{ type: 'text', text: e.message }] };
  }
  const chu = (kq.content ?? []).map((c) => c.text ?? '').join('');
  let doc = null;
  try {
    doc = JSON.parse(chu);
  } catch {
    doc = null;
  }
  const ghi = {
    tool: ten,
    args,
    ok: kq.isError !== true,
    msGoi: Date.now() - t0,
    ...(kq.isError ? { error: chu.slice(0, 300) } : {}),
    ...(doc && typeof doc === 'object' && 'durationMs' in doc ? { durationMs: doc.durationMs } : {}),
  };
  nhatKy.toolCalls.push(ghi);
  ra(`${kq.isError ? '✗' : '→'} ${ten} ${kq.isError ? chu.slice(0, 160) : JSON.stringify(args).slice(0, 110)}`);
  return { ok: kq.isError !== true, doc, chu };
}

/* --------------------------------------------------------------- vòng hội thoại */

const boot = await goi('stage_bootstrap');
if (boot.ok && boot.doc?.huongDanAgent) {
  ra('bootstrap có "Hướng dẫn cho agent":', boot.doc.huongDanAgent.slice(0, 80) + '…');
  nhatKy.huongDanAgent = boot.doc.huongDanAgent;
}

/** Bắt đầu từ sự kiện mới nhất: không trả lời lại những câu trước khi não bật. */
let since = (await goi('stage_events', { since: 0, waitMs: 0 })).doc?.latest ?? 0;
ra('nghe từ seq', since);

let dem = 0;
const hetGio = Date.now() + HAN;

while (dem < soLuot && Date.now() < hetGio) {
  const sk = await goi('stage_events', { since, waitMs: CHO });
  if (!sk.ok) {
    await new Promise((r) => setTimeout(r, 1000));
    continue;
  }
  since = sk.doc.latest ?? since;
  const cauBoss = (sk.doc.events ?? []).filter((e) => e.event === 'user.text' && !(e.data && e.data.handled));
  if (cauBoss.length === 0) continue;

  for (const e of cauBoss) {
    if (dem >= soLuot) break;
    const cau = String(e.data?.text ?? '').trim();
    if (!cau) continue;
    dem++;
    ra(`\n=== lượt ${dem}: Sếp nói "${cau}"`);

    // đọc trạng thái TRƯỚC khi chọn lệnh (đúng vòng mẫu của skill)
    const mota = await goi('stage_describe');
    const genTruoc = mota.doc?.actors?.find((a) => a.id === 'gen') ?? null;

    const ke = chonLenh(cau, dem);
    ra(`luật chọn: ${ke.kieu}`);
    const dauVao = { luot: dem, text: cau, seq: e.seq, kieu: ke.kieu, goi: [] };
    if (ke.viec) dauVao.viec = ke.viec;
    if (ke.moduleId) dauVao.moduleId = ke.moduleId;

    for (const [ten, args] of ke.buoc) {
      const r = await goi(ten, args);
      dauVao.goi.push({
        tool: ten,
        ok: r.ok,
        ...(r.doc?.durationMs ? { durationMs: r.doc.durationMs } : {}),
        ...(r.ok ? {} : { error: r.chu.slice(0, 200) }),
      });
      // nói/diễn có thời lượng: chờ cho hết để lệnh sau không bị xếp hàng lệch
      const cho = r.doc?.durationMs;
      if (typeof cho === 'number' && cho > 0) {
        await new Promise((x) => setTimeout(x, Math.min(cho + 150, 9000)));
      }
    }

    const sau = await goi('stage_describe');
    dauVao.genTruoc = genTruoc && { state: genTruoc.state, holding: genTruoc.holding };
    const genSau = sau.doc?.actors?.find((a) => a.id === 'gen') ?? null;
    dauVao.genSau = genSau && { state: genSau.state, holding: genSau.holding, mood: genSau.mood };
    nhatKy.luot.push(dauVao);
  }
}

ra(`\nxong ${dem} lượt · ${nhatKy.toolCalls.length} tool call`);
nhatKy.tongKet = {
  soLuot: dem,
  soToolCall: nhatKy.toolCalls.length,
  soLoi: nhatKy.toolCalls.filter((t) => !t.ok).length,
};
if (duongGhi) {
  mkdirSync(dirname(duongGhi), { recursive: true });
  writeFileSync(duongGhi, JSON.stringify(nhatKy, null, 2) + '\n');
  ra('nhật ký:', duongGhi);
}

await client.close();
process.exit(nhatKy.tongKet.soLoi > 0 ? 1 : 0);
