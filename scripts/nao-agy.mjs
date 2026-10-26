/**
 * nao-agy.mjs — DRIVER NÃO: chạy nền, tự lắng nghe sân khấu, nuôi agy mỗi câu.
 *
 * VÌ SAO CÓ FILE NÀY. Bản cũ bật agy ở chế độ tương tác trong tmux
 * (`agy --prompt-interactive "$(cat SKILL.md)"`) rồi bỏ đó. agy chào một lượt
 * rồi về dấu nhắc `>` **chờ người gõ trong terminal** — nó không tự lặp
 * `stage_events`. Sếp gõ trong Firefox (sự kiện `user.text`) thì không ai nghe
 * → "nó chưa trả lời". File này đảo vai: *driver* là cái vòng lặp, agy chỉ là
 * cái não được gọi một lượt mỗi câu nói.
 *
 *     Firefox (ô chat / Space)
 *        │  actor.say owner  →  sự kiện user.text
 *        ▼
 *     bridge/server.ts ──ws──► nao-agy.mjs  (file này, vai "client")
 *         │                        │
 *         │  ≤300 ms: turnTo + emote suy-nghi  (phản xạ, không chờ não)
 *         │                        ▼
 *         │                 agy đang ấm trong tmux  ←── một dòng nhắc
 *         │                        │  MCP gen-stage
 *         ◄── actor.sayStart ──────┘  actor_say (trước) + diễn (sau)
 *
 * HAI PHƯƠNG ÁN, ĐÃ ĐO THẬT TRÊN MÁY SẾP (Gemini 3.8 Flash low):
 *
 *   A. `agy -p "<prompt>"` mỗi câu — **8–12 s chỉ để khởi động** (prompt rỗng,
 *      không gọi tool nào), vì mỗi lần chạy phải nối lại cả 3 server MCP.
 *      Cộng 2–3 lệnh diễn là 15–25 s. Quá chậm.
 *   B. **giữ agy ấm** trong tmux (`-i "<vai diễn>"`) rồi bơm một dòng mỗi câu
 *      bằng `tmux send-keys` — **3,4–5,2 s/lượt**, trả tiền khởi động một lần.
 *
 * → Mặc định là **B**. A vẫn giữ làm phương án dự phòng
 * (`GEN_STAGE_NAO_CHE_DO=print`) cho máy không có tmux.
 *
 * Chạy:  node scripts/nao-agy.mjs           (hoặc `pnpm nao`)
 * Tắt:   bash scripts/chay.sh tat           (hoặc `pnpm stop`)
 *
 * Biến môi trường:
 *   GEN_STAGE_PORT       cổng ws của bridge (mặc định 8787)
 *   GEN_STAGE_TOKEN      token ws nếu bridge bật token
 *   GEN_STAGE_AGY        đường dẫn agy (mặc định "agy")
 *   GEN_STAGE_AGY_MCP    tên server MCP trong cấu hình agy (mặc định "gen-stage")
 *   GEN_STAGE_AGY_MODEL  model (mặc định "gemini-3.8-flash-low" — nhanh nhất)
 *   GEN_STAGE_AGY_CWD    thư mục làm việc của agy (mặc định `.cache/nao-agy` — CỐ Ý
 *                        để trống: Gen là nhân vật, không phải thợ sửa repo; mở agy
 *                        ngay trong repo thì nó đọc CLAUDE.md rồi đi chạy `tsc`)
 *   GEN_STAGE_NAO_CHE_DO "tmux" (mặc định) | "print"
 *   GEN_STAGE_NAO_TMUX   tên session tmux (mặc định "gen-stage-nao")
 *   GEN_STAGE_NAO_GOP    ms gộp câu tới liên tiếp (mặc định 800)
 *   GEN_STAGE_NAO_HAN    ms chờ một lượt não (mặc định 120000)
 *   GEN_STAGE_NAO_NHIP_TIM  ms nhịp heartbeat ws tới bridge (mặc định 15000)
 *   GEN_STAGE_NAO_QUA_HAN_TIM  ms không thấy pong thì coi là mất (mặc định 35000)
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Gộp các câu tới trong bao lâu thì coi là MỘT lượt nói. */
export const MS_GOP_MAC_DINH = 800;
/** Chưa thấy Gen mở miệng sau bấy lâu thì driver tự xin Sếp chờ. */
export const MS_XIN_CHO = 20_000;
/** Hạn chờ một lượt não. */
export const MS_HAN = 120_000;
/** Model mặc định: nhanh nhất trong `agy models`. */
export const MODEL_MAC_DINH = 'gemini-3.8-flash-low';
/** Dòng cuối khung agy khi đang nghĩ (mốc nhận biết bận/rảnh). */
export const DAU_BAN = 'esc to cancel';
/** Giữ lại bao nhiêu sự kiện cuối để kèm vào nhắc. */
const GIU_SU_KIEN = 5;

/* ======================================================= 1. lọc sự kiện */

/**
 * Sự kiện nào là "Sếp vừa nói **mà não phải nghĩ**"?
 *
 * Ba cửa lọc:
 *  1. Chỉ `user.text` và `user.speech` (C1 — nói bằng miệng đi cùng một đường
 *     với gõ chữ, não không được phân biệt hai cái).
 *  2. Không phải của `gen`: nếu não tự nói hộ owner (hoặc script nào bắn nhầm)
 *     thì driver tự nghe lời mình rồi gọi não vô hạn.
 *  3. **`handled: true` là bỏ qua** (C2, PR #33): lớp hiểu lệnh đã nhận ra câu
 *     này là một lệnh cố định và **đã thực thi** rồi (kèm `user.command`).
 *     Gọi agy nữa là tốn 6 s + quota để nói lại một việc đã xong, và tệ hơn là
 *     Gen đi làm lần thứ hai. "Javis, đi tới bàn điều khiển" → lớp lệnh lo;
 *     "Gen, hôm nay làm gì" → không ai lo, đến lượt não.
 */
export function laCauCuaSep(event, data = {}) {
  if (event !== 'user.text' && event !== 'user.speech') return false;
  if (data.handled === true) return false;
  if (String(data.actor ?? 'owner') === 'gen') return false;
  return typeof data.text === 'string' && data.text.trim().length > 0;
}

/* ======================================================= 2. gộp câu 800 ms */

/**
 * Gộp câu: Sếp gõ "Gen ơi" Enter, 300 ms sau gõ "chào Sếp đi" → **một** lượt
 * não, không hai. Phản xạ (turnTo + emote) thì bắn ngay từ sự kiện thô, không
 * chờ cửa sổ gộp — nên Sếp vẫn thấy Gen quay sang trong ≤300 ms.
 *
 * `hen`/`huy` nhận vào được để test chạy đồng hồ giả.
 */
export function taoGop({ msGop = MS_GOP_MAC_DINH, xong, hen = setTimeout, huy = clearTimeout } = {}) {
  let dem = [];
  let h = null;
  return {
    nhan(cau) {
      dem.push(String(cau).trim());
      if (h) huy(h);
      h = hen(() => {
        h = null;
        const gop = dem.join('. ').replace(/\.\s*\./g, '.');
        dem = [];
        if (gop) xong(gop);
      }, msGop);
    },
    dangCho: () => dem.length,
  };
}

/* ========================================================= 3. hàng đợi 1-1 */

/**
 * Hàng đợi: **tối đa một lượt não cùng lúc**. Hai lượt song song sẽ cùng gọi
 * `actor_say` lên `gen` → hai bong bóng chen nhau và hai lần tốn quota. Câu
 * tới trong lúc đang nghĩ thì nằm chờ. Đây là cái chặn vòng lặp thứ hai.
 */
export function taoHangDoi({ chay, ghi = console.error }) {
  const cho = [];
  let dangChay = false;
  let xongHet = null;

  async function bom() {
    if (dangChay) return;
    const cau = cho.shift();
    if (cau === undefined) {
      xongHet?.();
      xongHet = null;
      return;
    }
    dangChay = true;
    try {
      await chay(cau);
    } catch (e) {
      ghi('[nao] lượt lỗi:', e?.message ?? e); // một lượt lỗi không được làm chết hàng đợi
    } finally {
      dangChay = false;
      void bom();
    }
  }

  return {
    them(cau) {
      cho.push(cau);
      void bom();
    },
    doDai: () => cho.length,
    dangChay: () => dangChay,
    /** Chờ hết việc — chỉ dùng trong test. */
    choHet() {
      if (!dangChay && cho.length === 0) return Promise.resolve();
      return new Promise((r) => {
        xongHet = r;
      });
    },
  };
}

/* ============================================================== 4. nhắc */

/**
 * SKILL.md rút gọn còn ≤ `toiDaDong` dòng: bỏ frontmatter, bỏ mục "Vòng lặp"
 * (driver lo vòng lặp, không phải não) và bỏ các khối trích dẫn dài. Nhắc càng
 * ngắn thì model càng ít token đọc → trả lời càng sớm.
 */
export function rutGonSkill(skill, { toiDaDong = 40 } = {}) {
  const sach = String(skill)
    .replace(/^---[\s\S]*?\n---\n/, '')
    .replace(/\n## Vòng lặp[\s\S]*?(?=\n## |$)/, '\n')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return sach.split('\n').slice(0, toiDaDong).join('\n').trim();
}

/**
 * Id màn hình THẬT của cảnh (E1 #48 việc 4).
 *
 * Kiểm độc lập 26/10: nhắc cũ bảo não dùng `screen: "main"` — id đó **không
 * tồn tại** trong cảnh nhà, nên mọi `screen_focus`/`screen_stream` của não trả
 * lỗi và màn hình không bao giờ chạy chữ. Id thật đọc từ `MAC_DINH_MAN_HINH`
 * (`src/stage/man-hinh.ts`), và mỗi lượt driver còn gửi kèm `screens` thật
 * trong dòng SÂN KHẤU, nên não không phải nhớ.
 */
export const MAN_HINH_THAT = [
  ['may-tinh', 'màn hình máy tính trên bàn điều khiển — dùng cái này để dựng module'],
  ['tivi', 'TV treo trên kệ phòng khách — dùng khi Sếp muốn xem chung'],
];

/**
 * Nhắc đầu phiên (trả tiền MỘT lần, giữ ấm trong tmux): vai diễn + luật cứng +
 * cách xuống tiếng sớm. Câu quan trọng nhất là "actor_say TRƯỚC, diễn SAU":
 * Sếp nghe được tiếng sau 3–4 s thay vì chờ hết 3 lệnh diễn.
 *
 * E1 (#48) việc 4 — **bỏ trần "diễn tối đa 2 lệnh"**. Chuỗi dựng connector cần
 * 5 lệnh, nên cái trần đó làm não không bao giờ diễn xong: đo thật agy gọi
 * `actor_say + actor_emote + screen_focus` rồi dừng, `describe()` sau đó
 * `props: []`, `holding: null`, `lines: 0`. Giờ: trần là **6 lệnh trở lên khi
 * cần**, và có lệnh gói `module_demo` làm trọn màn diễn trong MỘT lời gọi
 * (xem `src/api/commands/demo.ts`) — nên đường ngắn nhất lại cũng là đường
 * đúng nhất.
 */
export function promptDau({ skill, tenMcp = 'gen-stage' }) {
  return [
    rutGonSkill(skill),
    '',
    `Em điều khiển thân mình qua tool MCP của server "${tenMcp}" (${tenMcp}:actor_say,`,
    `${tenMcp}:actor_emote, ${tenMcp}:screen_focus, ${tenMcp}:screen_stream,`,
    `${tenMcp}:module_build, ${tenMcp}:module_demo…).`,
    '',
    'MÀN HÌNH TRONG PHÒNG — id thật, KHÔNG có màn hình nào tên "main":',
    ...MAN_HINH_THAT.map(([id, giai]) => `  - ${id}: ${giai}`),
    'Mỗi lượt dòng SÂN KHẤU có mảng "screens" — đó là sự thật, cứ lấy từ đó.',
    '',
    'CÁCH LÀM MỖI LƯỢT (quan trọng — Sếp đang chê chậm VÀ chê chỉ nói không diễn):',
    `1. GỌI ${tenMcp}:actor_say TRƯỚC TIÊN (actor "gen", interrupt true, tiếng Việt, tối đa 2 câu).`,
    '   Tiếng phải ra trước, diễn xuất sau.',
    '2. RỒI DIỄN CHO ĐỦ. Không có trần 2 lệnh: cần 6, 8 lệnh thì gọi đủ 6, 8 lệnh.',
    '   Sếp nhờ làm một việc mà em chỉ nói thôi là em làm sai vai.',
    `3. Sếp nhờ DỰNG/LÀM một thứ (connector, module, công cụ) → gọi ${tenMcp}:module_demo`,
    '   { id: "connector-<ten>", label: "<Tên>" } — MỘT lệnh này tự chạy trọn chuỗi:',
    '   màn hình bay tới trước mặt → code chạy lên màn hình → hạt kết tinh thành module',
    '   vào tay em → emote thành công → nói câu báo xong. Không phải tự xếp 5 bước.',
    '   Muốn tự xếp tay thì đúng thứ tự này, KHÔNG bỏ bước nào:',
    `     ${tenMcp}:screen_focus { screen: "may-tinh" }`,
    `     → ${tenMcp}:screen_stream { screen: "may-tinh", kind: "code", chunks: [ …mẩu code… ] }`,
    `     → ${tenMcp}:module_build { id, shape: "book", label, from: "may-tinh" }`,
    `     → ${tenMcp}:actor_emote { actor: "gen", emote: "thanh-cong" }`,
    `     → ${tenMcp}:actor_say báo xong.`,
    '   Dùng "chunks" (mảng mẩu code) chứ đừng dùng source:"agent" — source chờ',
    '   trình duyệt tự đẩy, em không đẩy được nên màn hình sẽ trống.',
    `4. ĐỪNG gọi ${tenMcp}:stage_describe (driver đã gửi kèm trạng thái) và ĐỪNG gọi`,
    `   ${tenMcp}:stage_events — driver lo việc nghe. Xong một lượt là dừng, chờ dòng nhắc sau.`,
    '5. TUYỆT ĐỐI KHÔNG dùng tool shell/terminal, KHÔNG đọc/ghi/sửa file, KHÔNG git,',
    '   KHÔNG tạo tài liệu, KHÔNG kiểm tra repo. Em là nhân vật trên sân khấu, không phải',
    `   thợ sửa mã. Tool duy nhất em được dùng là tool của server "${tenMcp}".`,
    '',
    'Mỗi lượt sau đây driver gửi một dòng dạng: SẾP NÓI «…» | SÂN KHẤU {json}.',
    'Driver chỉ gửi câu NÀO CHƯA AI LÀM: câu là lệnh cố định đã được lớp hiểu lệnh',
    'thực thi (handled) thì nó không gọi em — nên câu nào tới tay em là việc của em.',
    'Bây giờ chưa có gì để làm — trả lời đúng một chữ "san-sang" và chờ.',
  ].join('\n');
}

/**
 * `stage.describe` đầy đủ dài hàng trăm dòng (khoảng cách tới mọi place).
 * Não chỉ cần: gen + owner (ở đâu, bận gì, cầm gì), danh sách màn hình/module,
 * và 5 sự kiện cuối để biết chuyện gì vừa xảy ra.
 */
export function gonDescribe(st, { suKien = [] } = {}) {
  const tron = (n) => (typeof n === 'number' ? Math.round(n * 100) / 100 : n);
  const ds = (st && typeof st === 'object' && st.actors) || [];
  const can = ds.filter((a) => a.id === 'gen' || a.id === 'owner');
  return {
    actors: (can.length ? can : ds).map((a) => ({
      id: a.id,
      at: a.at ?? null,
      pos: Array.isArray(a.pos) ? a.pos.map(tron) : a.pos,
      busy: !!a.busy,
      ...(a.holding ? { holding: a.holding } : {}),
    })),
    screens: ((st && st.screens) || []).map((s) => s.id ?? s),
    modules: ((st && st.modules) || []).map((m) => m.id ?? m),
    suKien: suKien.slice(-GIU_SU_KIEN),
  };
}

/**
 * Một lượt = **một dòng** (send-keys gặp `\n` là Enter → submit giữa câu).
 * Mọi xuống dòng trong lời Sếp bị đổi thành dấu cách.
 */
export function dungDongNhac({ cau, describe }) {
  const mot = (x) => String(x).replace(/\s+/g, ' ').trim();
  return `SẾP NÓI «${mot(cau)}» | SÂN KHẤU ${JSON.stringify(describe)}`;
}

/**
 * Đặt **vai diễn ngay trong thư mục làm việc** của agy.
 *
 * Cạm bẫy đã đo: mở agy trong một thư mục trắng thì nó lấy chỉ dẫn toàn cục
 * của Boss (quy trình SSOT, kiểm trạng thái repo…) rồi tự `git init`, tạo
 * `docs/ssot/`, sửa `plan.md` — tốn 10–20 s mỗi lượt và chẳng diễn gì. Một
 * `AGENTS.md`/`GEMINI.md` ngay tại chỗ là chỉ dẫn gần nhất, nên nó thắng.
 */
export function datVaiDien(cwd, noiDung) {
  for (const ten of ['AGENTS.md', 'GEMINI.md']) {
    writeFileSync(resolve(cwd, ten), noiDung + '\n');
  }
}

/* ======================================================= 5. não ấm (tmux) */

/**
 * agy giữ ấm trong một session tmux. Biết ba việc: bật (và tự bấm qua hộp
 * "Do you trust this folder?"), đoán bận/rảnh bằng `capture-pane`, bơm một
 * dòng bằng `send-keys`.
 */
export function taoNaoTmux({
  ten = 'gen-stage-nao',
  cwd = GOC,
  bin = 'agy',
  model = MODEL_MAC_DINH,
  prompt,
  ghi = console.log,
  tmux = (...a) => execFileSync('tmux', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
} = {}) {
  const co = () => {
    try {
      tmux('has-session', '-t', ten);
      return true;
    } catch {
      return false;
    }
  };
  const khung = () => {
    try {
      return tmux('capture-pane', '-pt', ten);
    } catch {
      return '';
    }
  };

  return {
    ten,
    co,
    khung,
    /** Đang nghĩ? Khung agy để dòng "esc to cancel" ở cuối khi còn chạy. */
    ban: () => khung().includes(DAU_BAN),
    async bat() {
      if (co()) {
        // dùng lại session có sẵn: vẫn phải chờ nó rảnh, và vẫn in đúng một
        // dòng "đã ấm" để script bằng chứng (và Boss) biết khi nào nói được
        await this.choRanh(90_000);
        ghi(`[nao] tmux "${ten}" đã ấm (dùng lại session có sẵn).`);
        return true;
      }
      tmux(
        'new-session', '-d', '-s', ten, '-x', '200', '-y', '50', '-c', cwd,
        `${bin} --dangerously-skip-permissions --model ${model} --disable-slash-commands -i ${nhay(prompt)}; echo; echo '[não đã tắt]'; read`,
      );
      // hộp "Do you trust this folder?" lần đầu: Yes đang được tô sẵn → Enter
      for (let i = 0; i < 25; i++) {
        await ngu(1000);
        const k = khung();
        if (/trust/i.test(k)) {
          tmux('send-keys', '-t', ten, 'Enter');
          continue;
        }
        if (k.includes(DAU_BAN) || /san-sang/i.test(k)) break;
      }
      // chờ lượt chào xong để lượt thật không phải xếp hàng sau nó
      await this.choRanh(90_000);
      ghi(`[nao] tmux "${ten}" đã ấm (${bin} ${model}).`);
      return co();
    },
    /** Chờ não rảnh. Trả false nếu hết hạn (vẫn đang nghĩ). */
    async choRanh(hanMs = MS_HAN) {
      const het = Date.now() + hanMs;
      while (Date.now() < het) {
        if (!this.ban()) return true;
        await ngu(120);
      }
      return false;
    },
    /** Bơm một dòng rồi Enter. */
    gui(dong) {
      tmux('send-keys', '-t', ten, '-l', dong);
      tmux('send-keys', '-t', ten, 'Enter');
    },
    tat() {
      try {
        tmux('kill-session', '-t', ten);
      } catch {
        /* chưa có */
      }
    },
  };
}

/** Một lượt não ở chế độ tmux: bơm dòng → chờ bận → chờ rảnh. */
export function taoNaoAm(tmuxNao, { hanMs = MS_HAN, msVaoBan = 1500, msChoTruoc = 15_000 } = {}) {
  return async function nghi(dong) {
    const bd = Date.now();
    if (!tmuxNao.co()) return { ok: false, loi: 'não agy trong tmux đã tắt', msGiay: 0 };
    await tmuxNao.choRanh(msChoTruoc);
    tmuxNao.gui(dong);
    // chờ nó vào trạng thái bận (thường ~120 ms) rồi chờ nghĩ xong
    const vao = Date.now() + msVaoBan;
    while (Date.now() < vao && !tmuxNao.ban()) await ngu(80);
    const ranh = await tmuxNao.choRanh(hanMs);
    return {
      ok: ranh,
      loi: ranh ? '' : `não nghĩ quá ${hanMs} ms`,
      msGiay: Date.now() - bd,
      ra: tmuxNao.khung().split('\n').filter(Boolean).slice(-6).join(' / '),
    };
  };
}

/* ================================================= 6. não lạnh (dự phòng) */

/**
 * Phương án A: `agy -p` một lần mỗi câu. Đo được 8–12 s **chỉ để khởi động**,
 * nên chỉ dùng khi không có tmux.
 */
export function taoNaoLanh({
  bin = 'agy',
  model = MODEL_MAC_DINH,
  cwd = GOC,
  hanMs = MS_HAN,
  tao = spawn,
} = {}) {
  return function nghi(prompt) {
    const bd = Date.now();
    return new Promise((xong) => {
      const p = tao(
        bin,
        ['--dangerously-skip-permissions', '--model', model, '--disable-slash-commands', '-p', prompt],
        { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
      );
      let ra = '';
      let loi = '';
      const het = setTimeout(() => {
        try {
          p.kill('SIGKILL');
        } catch {
          /* đã chết */
        }
        xong({ ok: false, ra, loi: `agy quá ${hanMs} ms`, msGiay: Date.now() - bd });
      }, hanMs);
      p.stdout?.on('data', (d) => (ra += d));
      p.stderr?.on('data', (d) => (loi += d));
      p.on('error', (e) => {
        clearTimeout(het);
        xong({ ok: false, ra, loi: `không chạy được "${bin}": ${e.message}`, msGiay: Date.now() - bd });
      });
      p.on('close', (ma) => {
        clearTimeout(het);
        xong({ ok: ma === 0, ra: String(ra).trim(), loi: String(loi).trim(), msGiay: Date.now() - bd });
      });
    });
  };
}

/** Lý do lỗi rút thành một câu ngắn để Gen nói ra miệng. */
export function lyDoNgan(loi) {
  const t = String(loi ?? '').trim();
  if (!t) return 'không rõ';
  if (/quota|rate.?limit|429|exhaust|hết lượt/i.test(t)) return 'hết lượt gọi model';
  if (/quá \d+ ms|timeout|nghĩ quá/i.test(t)) return 'nghĩ quá lâu';
  if (/không chạy được|đã tắt/i.test(t)) return 'não agy chưa bật';
  return (t.split('\n').filter(Boolean).pop() ?? t).slice(0, 80);
}

/* =============================================================== 7. một lượt */

/**
 * Một lượt trọn vẹn, có đo giờ:
 *
 *   t0  sự kiện user.text
 *   ≤300 ms  phản xạ: turnTo owner + emote suy-nghi  (không chờ não)
 *   →  nhắc một dòng cho não ấm
 *   →  `actor.sayStart` của gen = mốc "Sếp nghe được tiếng"
 *   >20 s chưa nói  → driver tự nói "Em đang nghĩ, Sếp chờ chút ạ"
 *   não lỗi         → "Em bị lỗi não: <lý do ngắn>"
 */
export function taoLuot({
  san,
  skill,
  tenMcp = 'gen-stage',
  nghi,
  cheDo = 'tmux',
  msXinCho = MS_XIN_CHO,
  ghi = console.log,
  moc = () => Date.now(),
}) {
  return async function luot(cau, { t0 = moc() } = {}) {
    ghi(`[nao] ${gio()} SẾP: «${cau}»`);
    let dangNoi = false;
    const thoiSay = san.khiGenNoi(() => {
      if (dangNoi) return;
      dangNoi = true;
      ghi(`[nao] ${gio()} Gen BẮT ĐẦU NÓI sau ${moc() - t0} ms (từ lúc Sếp gõ)`);
    });

    const henXinCho = setTimeout(() => {
      if (!dangNoi) {
        void san.goi('actor.say', {
          actor: 'gen',
          text: 'Em đang nghĩ, Sếp chờ chút ạ',
          emotion: 'suy-nghi',
          interrupt: true,
        });
      }
    }, msXinCho);

    const mt = await san.goi('stage.describe', {});
    const dDescribe = gonDescribe(mt.result, { suKien: san.suKienCuoi() });
    const kq =
      cheDo === 'tmux'
        ? await nghi(dungDongNhac({ cau, describe: dDescribe }))
        : await nghi(
            `${promptDau({ skill, tenMcp })}\n\n${dungDongNhac({ cau, describe: dDescribe })}`,
          );

    clearTimeout(henXinCho);
    thoiSay();

    if (!kq.ok) {
      const vi = lyDoNgan(kq.loi || kq.ra);
      ghi(`[nao] ${gio()} NÃO LỖI sau ${kq.msGiay} ms: ${String(kq.loi || kq.ra).slice(0, 300)}`);
      await san.goi('actor.say', {
        actor: 'gen',
        text: `Em bị lỗi não: ${vi}`,
        emotion: 'that-bai',
        interrupt: true,
      });
      return { ok: false, msGiay: moc() - t0, daNoi: false };
    }

    ghi(
      `[nao] ${gio()} não xong sau ${kq.msGiay} ms · trọn lượt ${moc() - t0} ms · ` +
        `${dangNoi ? 'đã nói' : 'KHÔNG thấy actor.sayStart'}`,
    );
    if (!dangNoi) {
      // não nghĩ xong mà không mở miệng: Sếp vẫn phải nghe một câu
      await san.goi('actor.say', {
        actor: 'gen',
        text: 'Em nghe rồi Sếp, nhưng chưa diễn được, em thử lại ạ',
        emotion: 'boi-roi',
        interrupt: true,
      });
    }
    return { ok: true, msGiay: moc() - t0, daNoi: dangNoi };
  };
}

/** Phản xạ ≤300 ms — bắn từ sự kiện thô, KHÔNG chờ cửa sổ gộp và não. */
export function phanXa(san) {
  void san.goi('actor.turnTo', { actor: 'gen', target: 'owner', interrupt: true });
  void san.goi('actor.emote', { actor: 'gen', emote: 'suy-nghi' });
}

/* ============================================================ 8. nối bridge */

/** Nhịp tim: driver gửi {ping}, bridge trả {pong} — hai chiều, mỗi 15 s. */
export const MS_NHIP_TIM_MAC_DINH = 15_000;
/** Không thấy pong quá bấy lâu (> 2 nhịp) thì coi là chết, đóng để nối lại. */
export const MS_QUA_HAN_TIM_MAC_DINH = 35_000;
/** Backoff nối lại: 1 s → … → 10 s, không giới hạn số lần thử. */
export const MS_BACKOFF_MIN = 1_000;
export const MS_BACKOFF_MAX = 10_000;
/** Câu Gen nói đúng MỘT lần sau khi vừa phục hồi một lần mất kết nối. */
export const CAU_DA_NOI_LAI = 'Em vừa mất kết nối não, giờ đã nối lại ạ';

/** Độ trễ nối lại lần thứ `lanThu` (1, 2, 3…): tăng gấp đôi, kẹp ở `max`. */
export function tinhBackoff(lanThu, { min = MS_BACKOFF_MIN, max = MS_BACKOFF_MAX } = {}) {
  const n = Math.max(1, Math.floor(lanThu));
  return Math.min(min * 2 ** (n - 1), max);
}

/**
 * Lớp mỏng nói với bridge bằng vai client ws, xưng `?role=nao` (bridge đếm
 * vào `brainConnected` — trước đây driver nối "trần", không role nào, nên
 * `brainConnected` chỉ sống nhờ agy gọi MCP trong 60 s gần nhất: Sếp im hơn
 * 1 phút là Gen tự báo "chưa có não" dù driver vẫn khoẻ mạnh).
 *
 * Có **ba lớp chống rớt-mà-không-ai-biết** (nguyên nhân gốc đã đo: `ws` không
 * tự phát hiện socket chết nửa chừng — máy ngủ, rút mạng, bridge bị `kill -9`
 * không kịp bắt tay FIN — nên `close`/`error` có thể KHÔNG BAO GIỜ bắn, và
 * `readyState` nằm lì ở `OPEN` dù không còn ai ở đầu kia):
 *
 *  1. **Heartbeat ứng dụng** (không phải ping/pong tầng WebSocket — cấp đó
 *     trình duyệt không cho script gửi tay, và ta cần log được lý do):
 *     mỗi `msNhipTim` gửi `{ping}`, bridge trả `{pong}` ngay. Quá
 *     `msQuaHanTim` (> 2 nhịp) không thấy pong nào → `terminate()` chính tay,
 *     để `close` CHẮC CHẮN bắn và vòng nối lại chạy.
 *  2. **Backoff tăng dần, không giới hạn số lần**: 1 s, 2 s, 4 s, 8 s, rồi kẹp
 *     ở 10 s — không đợi cố định 1,5 s như bản cũ (dễ dội bridge lúc nó còn
 *     bận khởi động lại) mà cũng không bỏ cuộc.
 *  3. **Log rõ mỗi lần mất/nối lại kèm lý do** (mã đóng + lý do WebSocket, số
 *     lần đã thử) — bản cũ `rot()` không ghi gì, nên "không có dòng log nào"
 *     đúng là triệu chứng, không phải lỗi hiếm.
 *
 * Mất kết nối rồi phục hồi → Gen nói **đúng một câu** báo Sếp biết vừa có một
 * khoảng mất não (không phải mỗi lần ping lỡ một nhịp), qua chính kênh ws này
 * (không chờ `goi()` vì lúc đó có thể còn trong lượt não khác).
 */
export async function noiSanKhau({
  WebSocket,
  cong,
  token = '',
  ghi = console.log,
  hanMs = 35_000,
  msNhipTim = MS_NHIP_TIM_MAC_DINH,
  msQuaHanTim = MS_QUA_HAN_TIM_MAC_DINH,
  backoff = { min: MS_BACKOFF_MIN, max: MS_BACKOFF_MAX },
}) {
  const goc = `ws://127.0.0.1:${cong}/?role=nao`;
  const url = token ? `${goc}&token=${encodeURIComponent(token)}` : goc;
  let ws = null;
  let dem = 0;
  const dangCho = new Map();
  const nghe = new Set();
  const genNoi = new Set();
  const cuoi = [];
  let dungHan = false;
  let henTim = null;
  let gioPongCuoi = 0;
  let lanThuNoiLai = 0;
  /** Đã từng mất kết nối (chờ một dịp để báo Sếp — đúng một lần). */
  let tungMat = false;
  let henNoiLai = null;

  function dungNhipTim() {
    if (henTim) clearInterval(henTim);
    henTim = null;
  }

  function batNhipTim(w) {
    dungNhipTim();
    gioPongCuoi = Date.now();
    henTim = setInterval(() => {
      if (ws !== w || w.readyState !== 1) return;
      if (Date.now() - gioPongCuoi > msQuaHanTim) {
        ghi(
          `[nao] ${gio()} KHÔNG thấy pong của bridge quá ${msQuaHanTim} ms — coi như đã chết, đóng để nối lại.`,
        );
        try {
          (w.terminate ?? w.close).call(w);
        } catch {
          /* đã chết sẵn rồi */
        }
        return;
      }
      try {
        const t = Date.now();
        w.send(JSON.stringify({ ping: t }));
        if (process.env.GEN_STAGE_NAO_DEBUG_NHIP_TIM) ghi(`[nao] ${gio()} -> ping ${t}`);
      } catch {
        /* send lỗi thì close/error sẽ tự bắn ngay sau */
      }
    }, msNhipTim); // KHÔNG unref — cùng lý do ở henNoiLai bên dưới
  }

  function baoDaNoiLaiNeuCan(w) {
    if (!tungMat) return;
    tungMat = false;
    try {
      w.send(
        JSON.stringify({
          id: `nao-hb-${++dem}`,
          cmd: 'actor.say',
          args: { actor: 'gen', text: CAU_DA_NOI_LAI, emotion: 'nhe-nhom', interrupt: true },
        }),
      );
    } catch {
      /* không sao, lượt não bình thường vẫn chạy */
    }
  }

  function noi() {
    if (ws || dungHan) return;
    const w = new WebSocket(url);
    ws = w;
    w.on('open', () => {
      if (token) w.send(JSON.stringify({ token }));
      ghi(
        `[nao] ${gio()} đã nối bridge ${goc}` +
          (lanThuNoiLai > 0 ? ` (sau ${lanThuNoiLai} lần thử nối lại)` : ''),
      );
      lanThuNoiLai = 0;
      batNhipTim(w);
      baoDaNoiLaiNeuCan(w);
    });
    w.on('message', (tho) => {
      let g;
      try {
        g = JSON.parse(String(tho));
      } catch {
        return;
      }
      if (typeof g.pong !== 'undefined') {
        gioPongCuoi = Date.now();
        if (process.env.GEN_STAGE_NAO_DEBUG_NHIP_TIM) ghi(`[nao] ${gio()} <- pong ${g.pong}`);
        return;
      }
      if (typeof g.event === 'string') {
        if (!/^cmd\./.test(g.event)) cuoi.push(g.event);
        if (cuoi.length > 20) cuoi.shift();
        if (g.event === 'actor.sayStart' && (g.data ?? {}).actor === 'gen') {
          for (const f of Array.from(genNoi)) f();
        }
        for (const f of nghe) f(g.event, g.data ?? {});
        return;
      }
      if (typeof g.id === 'string') {
        const f = dangCho.get(g.id);
        if (!f) return;
        dangCho.delete(g.id);
        f({ ok: g.ok === true, result: g.result, error: g.error });
      }
    });
    const rot = (ma, lyDoTho) => {
      dungNhipTim();
      if (ws === w) ws = null;
      if (dungHan) return;
      tungMat = true;
      lanThuNoiLai++;
      const cho = tinhBackoff(lanThuNoiLai, backoff);
      const lyDo = lyDoTho ? String(lyDoTho) : '';
      ghi(
        `[nao] ${gio()} MẤT KẾT NỐI bridge (mã ${ma ?? '?'}${lyDo ? ' · ' + lyDo : ''}) — ` +
          `nối lại lần ${lanThuNoiLai} sau ${cho} ms.`,
      );
      if (henNoiLai) clearTimeout(henNoiLai);
      // KHÔNG unref() hẹn giờ này — đã đo thật bằng chính bằng chứng #37: khi
      // ws chết lúc driver đang rảnh (không lượt não nào, cheDo print không
      // có tmux nào giữ event loop), một hẹn giờ unref là handle DUY NHẤT còn
      // sống; unref nó thì Node thấy "chẳng còn gì để làm" và tự thoát sạch
      // (code 0, không log, không crash) — driver biến mất, không phải chỉ
      // mất ws. Đây CHÍNH LÀ kiểu "rớt kết nối âm thầm, không log nào".
      henNoiLai = setTimeout(noi, cho);
    };
    w.on('close', (ma, lyDo) => rot(ma, lyDo?.toString?.() ?? lyDo));
    w.on('error', (e) => ghi(`[nao] ${gio()} lỗi ws bridge: ${e?.message ?? e}`));
  }
  noi();

  async function choMo(ms = 10_000) {
    const het = Date.now() + ms;
    while (Date.now() < het) {
      if (ws?.readyState === 1) return true;
      noi();
      await ngu(150);
    }
    return ws?.readyState === 1;
  }

  return {
    url: goc,
    choMo,
    khiSuKien: (f) => nghe.add(f),
    /** Đăng ký "gen bắt đầu nói"; trả hàm thôi nghe. */
    khiGenNoi(f) {
      genNoi.add(f);
      return () => genNoi.delete(f);
    },
    suKienCuoi: () => cuoi.slice(-GIU_SU_KIEN),
    /** Đang mất kết nối tại thời điểm gọi? (để chẩn đoán/test). */
    dangMat: () => ws?.readyState !== 1,
    dong() {
      dungHan = true;
      dungNhipTim();
      if (henNoiLai) clearTimeout(henNoiLai);
      ws?.close();
    },
    async goi(cmd, args = {}) {
      if (!(await choMo(3000))) return { ok: false, error: `chưa nối được bridge ${goc}` };
      const w = ws; // khoá tại chỗ: tránh khe nứt "rụng giữa choMo() và send()"
      if (!w || w.readyState !== 1) return { ok: false, error: `chưa nối được bridge ${goc}` };
      const id = `nao-${++dem}`;
      return await new Promise((xong) => {
        const het = setTimeout(() => {
          dangCho.delete(id);
          xong({ ok: false, error: `bridge không trả lời trong ${hanMs} ms` });
        }, hanMs);
        dangCho.set(id, (kq) => {
          clearTimeout(het);
          xong(kq);
        });
        try {
          w.send(JSON.stringify({ id, cmd, args }));
        } catch (e) {
          clearTimeout(het);
          dangCho.delete(id);
          xong({ ok: false, error: `gửi lệnh lỗi: ${e?.message ?? e}` });
        }
      });
    },
  };
}

/* ================================================================= 9. main */

export async function chay() {
  const { default: WebSocket } = await import('ws');
  const cong = process.env.GEN_STAGE_PORT ?? '8787';
  const token = process.env.GEN_STAGE_TOKEN ?? '';
  const tenMcp = process.env.GEN_STAGE_AGY_MCP ?? 'gen-stage';
  const bin = process.env.GEN_STAGE_AGY ?? 'agy';
  const model = process.env.GEN_STAGE_AGY_MODEL ?? MODEL_MAC_DINH;
  const cheDo = process.env.GEN_STAGE_NAO_CHE_DO ?? 'tmux';
  // Thư mục rỗng cho agy: trong repo nó đọc CLAUDE.md rồi tự đi chạy `tsc`,
  // `ls`, `cat package.json`… mất 10–20 s mỗi lượt và chẳng diễn gì.
  const cwdAgy = process.env.GEN_STAGE_AGY_CWD ?? resolve(GOC, '.cache/nao-agy');
  mkdirSync(cwdAgy, { recursive: true });
  const tenTmux = process.env.GEN_STAGE_NAO_TMUX ?? 'gen-stage-nao';
  const msGop = Number(process.env.GEN_STAGE_NAO_GOP ?? MS_GOP_MAC_DINH);
  const hanMs = Number(process.env.GEN_STAGE_NAO_HAN ?? MS_HAN);
  const msNhipTim = Number(process.env.GEN_STAGE_NAO_NHIP_TIM ?? MS_NHIP_TIM_MAC_DINH);
  const msQuaHanTim = Number(process.env.GEN_STAGE_NAO_QUA_HAN_TIM ?? MS_QUA_HAN_TIM_MAC_DINH);
  const skill = readFileSync(resolve(GOC, 'skills/gen-stage-nao/SKILL.md'), 'utf8');

  console.log(
    `[nao] ${gio()} driver não agy · bridge ${cong} · MCP "${tenMcp}" · ${cheDo} · ${model} · gộp ${msGop} ms`,
  );
  const san = await noiSanKhau({ WebSocket, cong, token, msNhipTim, msQuaHanTim });
  if (!(await san.choMo())) {
    console.error(`[nao] không nối được bridge cổng ${cong}. Bật \`pnpm bridge\` trước.`);
    process.exit(1);
  }

  let nghi;
  let naoTmux = null;
  datVaiDien(cwdAgy, promptDau({ skill, tenMcp }));
  if (cheDo === 'tmux') {
    naoTmux = taoNaoTmux({ ten: tenTmux, cwd: cwdAgy, bin, model, prompt: promptDau({ skill, tenMcp }) });
    if (!(await naoTmux.bat())) {
      console.error('[nao] không bật được tmux — chuyển sang chế độ print (chậm hơn).');
      nghi = taoNaoLanh({ bin, model, hanMs, cwd: cwdAgy });
    } else {
      nghi = taoNaoAm(naoTmux, { hanMs });
    }
  } else {
    nghi = taoNaoLanh({ bin, model, hanMs, cwd: cwdAgy });
  }

  const luot = taoLuot({ san, skill, tenMcp, nghi, cheDo: naoTmux ? 'tmux' : 'print' });
  const hangDoi = taoHangDoi({ chay: (x) => luot(x.cau, { t0: x.t0 }) });
  /** Mốc "Sếp gõ" của lượt đang gộp — để đo đúng độ trễ Sếp cảm nhận được. */
  let tDau = null;
  const gop = taoGop({
    msGop,
    xong: (cau) => {
      hangDoi.them({ cau, t0: tDau ?? Date.now() });
      tDau = null;
    },
  });

  san.khiSuKien((event, data) => {
    if (!laCauCuaSep(event, data)) return;
    if (gop.dangCho() === 0) {
      tDau = Date.now();
      phanXa(san); // ≤300 ms: Sếp thấy Gen quay sang và nghĩ ngay
    }
    gop.nhan(data.text);
  });

  console.log(`[nao] ${gio()} đang nghe user.text/user.speech — Sếp gõ trong Firefox là em nghe.`);
  for (const tin of ['SIGINT', 'SIGTERM']) {
    process.on(tin, () => {
      console.log(`[nao] ${gio()} tắt driver.`);
      san.dong();
      process.exit(0);
    });
  }
}

/* ------------------------------------------------------------------ tiện ích */

function ngu(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Bọc nháy đơn an toàn cho dòng lệnh shell của tmux. */
export function nhay(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function gio() {
  return new Date().toLocaleTimeString('vi-VN', { hour12: false });
}

/* Chạy trực tiếp thì bật vòng lặp; `import` (test) thì không. */
if (process.argv[1] && /nao-agy\.mjs$/.test(process.argv[1])) void chay();
