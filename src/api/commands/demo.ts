/**
 * demo.ts — **lệnh gói `module.demo`** (E1, Issue #48 việc 4).
 *
 * Boss chê đúng chỗ: *"não chỉ nói, không diễn"*. Kiểm độc lập 26/10 khoanh ra
 * nguyên nhân gốc: chuỗi "dựng một connector" cần **5 lệnh** (`screen.focus` →
 * `screen.stream` → `module.build` → `actor.emote thanh-cong` → `actor.say`),
 * mà nhắc đầu phiên của driver lại ép não *"diễn tối đa 2 lệnh"*. Nới trần là
 * một nửa việc; nửa còn lại là **đừng bắt não phải xếp đúng 5 bước mỗi lần**.
 *
 * Nên có lệnh này: **một lời gọi = cả màn diễn**. Não chỉ cần biết `id` và
 * `label`, còn thứ tự, màn hình nào, chữ gì chạy lên, ai cầm module thì lệnh
 * tự lo. Não gọi `actor_say` trước cho tiếng ra sớm, rồi `module_demo` — hai
 * lệnh, vẫn trong tầm một lượt agy.
 *
 * Vì sao nằm ở file riêng chứ không nhét vào `commands/module.ts`: đợt E chạy
 * song song ba nhánh, `module.ts` là của nhánh E2 (screen/module/holding).
 * Thêm một file mới thì hai nhánh không đụng nhau, mà `stage.bootstrap`, bảng
 * lệnh UI, ô kịch bản và MCP vẫn tự biết lệnh mới (đúng mục "Thêm một lệnh
 * mới" trong `CLAUDE.md`).
 *
 * Lệnh **không** tự thi công gì mới: nó gọi lại đúng những lệnh đã có qua
 * `ctx.run`, nên hàng đợi, `interrupt`, nhật ký và token y hệt khi Boss bấm
 * tay từng nút.
 */
import type { CommandCtx, CommandSpec } from '../types';
import { HINH_PROP } from './prop';
import { pEnum, pSo } from './tien-ich';

const s = (v: unknown) => String(v);

/** Màn hình mặc định khi não không nói rõ — màn hình đầu tiên đang có. */
function manHinhMacDinh(ctx: CommandCtx): string | undefined {
  return ctx.world.screenIds()[0];
}

/** Nhân vật diễn: ưu tiên actor của agent (Gen), không có thì người đầu tiên. */
function nguoiDien(ctx: CommandCtx): string | undefined {
  const ds = ctx.world.describe().actors;
  return ds.find((a) => a.controlledBy === 'agent')?.id ?? ds[0]?.id;
}

/**
 * Mấy mẩu "code đang được gõ" cho màn hình.
 *
 * Cố ý **không** là code thật: đây là sân khấu, chữ chỉ cần nhìn ra là đang
 * dựng cái gì. Nhãn của module được chèn vào nên Boss đọc màn hình là biết
 * ngay nó đang dựng Baserow hay Notion.
 */
export function mauCode(label: string, id: string): string[] {
  const ten = label.replace(/[^\p{L}\p{N}_-]+/gu, '') || 'connector';
  return [
    `// ${label} — connector\n`,
    `import { dangKy } from '@gen/kho';\n\n`,
    `export const ${ten.toLowerCase()} = dangKy({\n`,
    `  id: '${id}',\n`,
    `  ten: '${label}',\n`,
    `  xacThuc: 'token',\n`,
    `  bang: ['ban-ghi', 'truong', 'khung-nhin'],\n`,
    `});\n\n`,
    `// kiểm: 12 bảng · 0 lỗi\n`,
    `✔ ${label} sẵn sàng\n`,
  ];
}

export const LENH_DEMO: CommandSpec[] = [
  {
    cmd: 'module.demo',
    group: 'module',
    events: ['module.demoDone'],
    desc:
      'MỘT LỆNH = cả màn dựng module: bay màn hình tới trước mặt → code chạy lên màn hình → ' +
      'hạt kết tinh thành module vào tay nhân vật → emote thành công → nói một câu báo xong',
    params: [
      { name: 'id', type: 'string', desc: 'Mã module (vd "connector-baserow")', required: true },
      { name: 'label', type: 'string', desc: 'Nhãn hiện trên module (vd "Baserow")', required: true },
      pEnum('screen', 'Dựng trên màn hình nào (bỏ trống = màn hình đầu tiên)', {
        goiY: 'screens',
        tuDo: true,
      }),
      pEnum('shape', 'Hình kết tinh', { values: HINH_PROP, default: 'book' }),
      {
        name: 'say',
        type: 'text',
        desc: 'Câu báo xong (bỏ trống thì lệnh tự ghép một câu tiếng Việt)',
      },
      pSo('buildMs', 'Thời lượng hiệu ứng kết tinh (ms)', {
        min: 200,
        max: 20000,
        default: 2600,
      }),
    ],
    /**
     * Ví dụ **cố ý bỏ trống `screen`**: id màn hình là của từng cảnh (cảnh nhà
     * hiện tại có `may-tinh` và `tivi`), nên viết cứng một id vào ví dụ là tự
     * dựng lại đúng cái bẫy `"main"` mà việc 4 đang đi sửa. Bỏ trống thì lệnh
     * lấy màn hình đầu tiên đang có, và `stage.bootstrap` vẫn liệt kê đủ id
     * thật qua `goiY: 'screens'`.
     */
    example: {
      cmd: 'module.demo',
      args: { id: 'demo-baserow', label: 'Baserow' },
    },
    handler(a, ctx) {
      const id = s(a.id);
      const label = s(a.label);
      const shape = a.shape === undefined || a.shape === '' ? 'book' : s(a.shape);
      const man =
        a.screen === undefined || a.screen === '' ? manHinhMacDinh(ctx) : s(a.screen);
      if (!man) throw new Error('Sân khấu chưa có màn hình nào để dựng module');
      if (!ctx.world.coScreen(man)) {
        throw new Error(
          `Không có màn hình "${man}". Màn hình đang có: ${ctx.world.screenIds().join(', ')}`,
        );
      }
      if (ctx.world.coProp(id)) throw new Error(`Prop "${id}" đã có trên sân khấu`);
      const ai = nguoiDien(ctx);
      if (!ai) throw new Error('Sân khấu chưa có nhân vật nào để diễn');

      const chunks = mauCode(label, id);
      const buildMs = typeof a.buildMs === 'number' ? a.buildMs : 2600;
      const cau =
        a.say === undefined || s(a.say).trim() === ''
          ? `Xong rồi Sếp, module ${label} đã kết tinh ạ.`
          : s(a.say);

      /**
       * Huỷ được giữa đường: `interrupt`/`actor.stop` cắt lệnh này thì các
       * bước còn lại **không** chạy nữa (cờ `huy`), và bước đang chạy tự dừng
       * theo `cancel` của chính nó qua dispatcher.
       */
      let huy = false;
      const buoc: string[] = [];

      const done = (async () => {
        const chay = async (cmd: string, args: Record<string, unknown>) => {
          if (huy) return false;
          const kq = await ctx.run(cmd, args);
          if (!kq.ok) throw new Error(`${cmd}: ${kq.error}`);
          buoc.push(cmd);
          return true;
        };

        // 1) màn hình bay tới trước mặt — Boss thấy chuyện gì sắp xảy ra
        if (!(await chay('screen.focus', { screen: man }))) return;
        // 2) code chạy lên màn hình (chunks biết trước → `screen.stream` tự
        //    đợi hết mẩu cuối rồi mới `done`, nên bước sau chạy đúng lúc)
        if (!(await chay('screen.stream', { screen: man, kind: 'code', chunks }))) return;
        // 3) hạt kết tinh → module vào tay người diễn (`module.build` tự
        //    `actor.hold` qua dispatcher)
        if (
          !(await chay('module.build', {
            id,
            shape,
            label,
            from: man,
            durationMs: buildMs,
          }))
        ) {
          return;
        }
        // 4) ăn mừng rồi 5) báo xong — nói SAU khi có vật trong tay thì câu
        //    "xong rồi Sếp" mới đúng sự thật
        if (!(await chay('actor.emote', { actor: ai, emote: 'thanh-cong' }))) return;
        if (!(await chay('actor.say', { actor: ai, text: cau }))) return;
      })()
        .then(() => {
          ctx.bus.emit('module.demoDone', {
            module: id,
            actor: ai,
            screen: man,
            steps: buoc.length,
            cancelled: huy,
          });
        })
        .catch((e: unknown) => {
          ctx.bus.emit('module.demoDone', {
            module: id,
            actor: ai,
            screen: man,
            steps: buoc.length,
            cancelled: huy,
            error: e instanceof Error ? e.message : String(e),
          });
        });

      // Ước lượng: focus ~900 + stream (90 + 18/ký tự mỗi mẩu) + build + emote
      // ~1800 + câu nói. Trả ngay theo quy ước "thời gian là lời hứa".
      const streamMs = chunks.reduce((t, c) => t + 90 + Math.min(c.length * 18, 900), 0);
      const noiMs = Math.round(Math.min(9000, Math.max(900, 600 + (cau.length / 13) * 1000)));
      return {
        result: { module: id, label, screen: man, actor: ai, steps: 5 },
        durationMs: Math.round(900 + streamMs + buildMs + 1800 + noiMs),
        done,
        cancel: () => {
          huy = true;
        },
      };
    },
  },
];
