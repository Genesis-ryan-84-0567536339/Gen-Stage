/**
 * ngu-phap.ts — NGỮ PHÁP LỆNH GIỌNG LÀ **DỮ LIỆU** (C2, Issue #32).
 *
 * File này không chứa luồng xử lý, chỉ chứa:
 *  - bảng **mẫu câu** tiếng Việt (mỗi dòng = một cách Sếp hay nói),
 *  - bảng **từ đồng nghĩa** cho người nhận / place / emote / màn hình,
 *  - mấy hàm text thuần (bỏ dấu, fuzzy Levenshtein, số đếm bằng chữ).
 *
 * Thêm một cách nói mới = **thêm một dòng vào bảng**, không sửa máy khớp
 * (`hieu-lenh.ts`) và không sửa tab "Giọng" trên bảng lệnh (tab đó sinh thẳng
 * từ bảng này).
 *
 * Quy ước: mọi **mẫu câu viết KHÔNG DẤU, chữ thường** — vì STT tiếng Việt sai
 * dấu là chuyện thường ngày, nên cả câu của Sếp lẫn mẫu câu đều được bỏ dấu
 * trước khi so. Phần `moTa`/`viDu` thì có dấu đầy đủ để hiện cho người đọc.
 *
 * Danh sách place / emote / màn hình / module **không** chôn ở đây: máy khớp
 * lấy động từ `stage.bootstrap` (xem `BoiCanh` trong `hieu-lenh.ts`). Bảng
 * dưới chỉ thêm **bí danh** cho những thứ Sếp không gọi đúng id.
 */

import { TEN_HIEN_THI } from '../stage/noi-dung';

/* ------------------------------------------------------------- text thuần */

/** Bỏ dấu tiếng Việt + hạ chữ thường ("Đi Tới Bàn" → "di toi ban"). */
export function boDau(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Cắt câu thành từ, giữ **song song** bản gốc (có dấu) và bản không dấu. */
export function tach(cau: string): { goc: string[]; sach: string[] } {
  const goc: string[] = [];
  const sach: string[] = [];
  for (const tho of cau.split(/[\s,.;:!?"'“”…()\[\]]+/)) {
    if (!tho) continue;
    const kho = boDau(tho).replace(/[^a-z0-9]/g, '');
    if (!kho) continue;
    goc.push(tho);
    sach.push(kho);
  }
  return { goc, sach };
}

/** Khoảng cách Levenshtein (dùng cho lỗi STT nhẹ: thừa/thiếu/sai 1–2 ký tự). */
export function khoangCach(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let truoc = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const hien = [i, ...Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      hien[j] = Math.min(
        truoc[j] + 1,
        hien[j - 1] + 1,
        truoc[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    truoc = hien;
  }
  return truoc[n];
}

/**
 * Ngưỡng fuzzy theo độ dài từ: từ ngắn không được nhân nhượng.
 *
 * "di" vs "do" lệch 1 ký tự nhưng là hai từ khác hẳn, trong khi "dieu khien"
 * vs "dieu khiem" thì rõ là STT nghe sai. Ngưỡng: ≤3 ký tự phải đúng y, 4–5
 * ký tự cho lệch 1, từ 6 ký tự cho lệch 2 (đúng yêu cầu "fuzzy ≤2").
 */
export function nguong(tu: string): number {
  if (tu.length <= 3) return 0;
  if (tu.length <= 5) return 1;
  return 2;
}

/** Số đếm viết bằng chữ → chữ số ("bàn một" = "ban 1"). */
export const SO_CHU: Record<string, string> = {
  khong: '0',
  mot: '1',
  nhat: '1',
  hai: '2',
  nhi: '2',
  ba: '3',
  bon: '4',
  tu: '4',
  nam: '5',
  sau: '6',
  bay: '7',
  tam: '8',
  chin: '9',
  muoi: '10',
};

/** Hai từ coi là một: giống y, hoặc số đếm bằng chữ, hoặc lệch trong ngưỡng. */
export function gan(nhap: string, mau: string): boolean {
  if (nhap === mau) return true;
  if (SO_CHU[nhap] === mau) return true;
  return khoangCach(nhap, mau) <= nguong(mau);
}

/* ------------------------------------------------------- bí danh người nhận */

/** Nhóm người nhận đặc biệt: cả hai nhân vật. */
export const BI_DANH_MOI_NGUOI = [
  // CỐ TÌNH không có "cả nhà" / "các bạn" / "hai bạn": 'ca nha' nằm ngay trong
  // lời thoại Sếp hay đọc ("nói chào cả nhà"), còn 'ban' lẫn với place "bàn".
  'ca hai nguoi',
  'moi nguoi',
  'ca hai',
  'tat ca',
  'hai nguoi',
];

/* --------------------------------------------------------------- bí danh id */

/**
 * Bí danh cho place: Sếp gọi "bàn điều khiển" thì khớp luôn bằng chính id
 * (`ban-dieu-khien`), nên ở đây chỉ khai những cách gọi **khác** id.
 */
export const BI_DANH_PLACE: Record<string, string[]> = {
  'ban-dieu-khien': ['ban dieu khien', 'ban lam viec', 'ban chinh', 'ban dk'],
  'buc-trung-tam': ['buc', 'buc giua', 'giua phong', 'giua san khau', 'trung tam'],
  'ke-module': ['ke', 'ke do', 'ke hang', 'kho'],
  cua: ['cua ra', 'cua chinh', 'ngoai cua'],
  'ban-1': ['ban 1'],
  'ban-2': ['ban 2'],
  'ghe-1': ['ghe 1'],
  'ghe-2': ['ghe 2'],
};

/** Bí danh emote: cách Sếp nói → emote id trong `EMOTES`. */
export const BI_DANH_EMOTE: Record<string, string[]> = {
  vui: ['vui len', 've len', 'tuoi len', 'vui ve', 'cuoi len'],
  'rat-vui': ['rat vui', 'vui qua', 'phan khoi', 'hanh phuc'],
  buon: ['buon di', 'buon ba'],
  gian: ['tuc len', 'gian len', 'tuc gian'],
  'ngac-nhien': ['bat ngo', 'ngac nhien di'],
  'suy-nghi': ['nghi di', 'nghi xem', 'suy nghi di', 'tram ngam'],
  'dong-y': ['dong y', 'gat dau', 'ok', 'duoc'],
  'tu-choi': ['tu choi', 'lac dau', 'khong duoc'],
  chao: ['chao di', 'chao sep', 'xin chao', 'chao moi nguoi', 'vay tay'],
  'thanh-cong': ['an mung', 'mung len', 'thanh cong', 'vo tay'],
  'that-bai': ['that bai', 'tiu nghiu'],
  'boi-roi': ['boi roi', 'ngo ngac'],
  met: ['met roi', 'met qua', 'nghi met'],
  'cham-chu': ['cham chu', 'tap trung', 'lam viec di'],
  'ra-lenh': ['ra lenh', 'chi tay'],
};

/** Bí danh màn hình hologram: "màn hình trái" → id `left`. */
export const BI_DANH_MAN_HINH: Record<string, string[]> = {
  main: ['chinh', 'giua', 'main', 'man hinh chinh', 'man hinh giua'],
  left: ['trai', 'ben trai', 'left'],
  right: ['phai', 'ben phai', 'right'],
};

/**
 * Chỗ "quay lại" của từng nhân vật (dữ liệu, không phải code): Gen về bàn điều
 * khiển — đúng chỗ cô ấy đứng lúc mở app; ai không khai thì về bục trung tâm.
 */
export const CHO_VE: Record<string, string> = {
  gen: 'ban-dieu-khien',
  owner: 'buc-trung-tam',
};
export const CHO_VE_MAC_DINH = 'buc-trung-tam';

/** Lời xác nhận ngắn, quay vòng để không lặp một câu mãi. */
export const XAC_NHAN = ['Dạ', 'Rõ Sếp', 'Vâng ạ'];

/** Câu Javis nói khi không khớp mẫu nào (Javis không có não — Issue #32). */
export const CAU_CHUA_HIEU = 'Em chưa hiểu lệnh này, Sếp nói rõ hơn ạ';

/* ------------------------------------------------------------- bảng mẫu câu */

/** Giá trị đã giải nghĩa cho từng slot của một mẫu câu đã khớp. */
export type Slot = Record<string, string>;

/** Một lệnh sân khấu do mẫu câu sinh ra (đi qua dispatcher như mọi đường vào). */
export interface LenhRa {
  cmd: string;
  args: Record<string, unknown>;
}

export interface MauCau {
  /** Mã ngắn, dùng trong test và nhật ký. */
  id: string;
  /** Nhóm hiện trên tab "Giọng". */
  nhom: 'Di chuyển' | 'Cơ thể' | 'Cảm xúc' | 'Lab' | 'Sân khấu' | 'Nói';
  /** Các cách nói — KHÔNG DẤU, slot trong `<>`. */
  mau: string[];
  /** Mô tả có dấu cho tab "Giọng". */
  moTa: string;
  /** Câu ví dụ có dấu (hiện trên tab "Giọng"). */
  viDu: string;
  /** `true` = lệnh gắn vào từng người nhận (có tham số `actor`). */
  canActor?: boolean;
  /** Sinh lệnh thật. `actor` rỗng khi `canActor` không bật. */
  tao(slot: Slot, actor: string): LenhRa;
  /** Nhân vật nhắc lại lệnh đã hiểu (có dấu) — vào bong bóng + giọng. */
  nhacLai(slot: Slot): string;
}

/**
 * Sentinel giải nghĩa MUỘN: lúc khớp mẫu chưa biết Sếp đứng đâu, ghế nào gần.
 * `hieu-lenh.ts` đọc `stage.describe` tươi rồi thay trước khi gọi dispatcher.
 */
export const CHO_SEP = '@cho-sep';
export const GHE_GAN_NHAT = '@ghe-gan-nhat';
export const GOC_MAY_KE = '@goc-may-ke';

/** Mã module từ tên Sếp đọc ("Connector Baserow" → `connector-baserow`). */
export function maTuTen(ten: string): string {
  const m = boDau(ten)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return m || 'module';
}

/**
 * BẢNG MẪU CÂU. Thứ tự không quan trọng (máy khớp chọn mẫu **cụ thể nhất**),
 * nhưng để cùng nhóm cạnh nhau cho dễ đọc.
 */
export const BANG_MAU_CAU: MauCau[] = [
  /* ------------------------------------------------------------ di chuyển */
  {
    id: 'moveTo',
    nhom: 'Di chuyển',
    mau: [
      'di toi <place>',
      'di den <place>',
      'di ra <place>',
      'di vao <place>',
      'den <place>',
      'toi <place>',
      'ra <place>',
      'qua <place>',
      'buoc toi <place>',
      'di <place>',
    ],
    moTa: 'Đi tới một chỗ trong lab',
    viDu: 'Javis, đi tới bàn điều khiển',
    canActor: true,
    tao: (s, actor) => ({ cmd: 'actor.moveTo', args: { actor, to: s.place } }),
    nhacLai: (s) => `đi tới ${tenDep(s.place)}`,
  },
  {
    id: 'laiDay',
    nhom: 'Di chuyển',
    mau: ['lai day', 'den day', 'toi day', 'ra day', 'lai cho toi', 'den cho toi'],
    moTa: 'Đi lại chỗ Sếp đang đứng',
    viDu: 'Gen, lại đây',
    canActor: true,
    tao: (_s, actor) => ({ cmd: 'actor.moveTo', args: { actor, to: CHO_SEP } }),
    nhacLai: () => 'lại chỗ Sếp',
  },
  {
    id: 'quayLai',
    nhom: 'Di chuyển',
    mau: ['quay lai', 've cho cu', 'quay ve', 've vi tri', 've cho'],
    moTa: 'Về lại chỗ quen của mình',
    viDu: 'Gen, quay lại',
    canActor: true,
    tao: (_s, actor) => ({
      cmd: 'actor.moveTo',
      args: { actor, to: CHO_VE[actor] ?? CHO_VE_MAC_DINH },
    }),
    nhacLai: () => 'quay về chỗ cũ',
  },
  {
    id: 'nhin',
    nhom: 'Di chuyển',
    mau: ['nhin <muc tieu>', 'nhin vao <muc tieu>', 'quay sang <muc tieu>', 'nhin ve <muc tieu>'],
    moTa: 'Nhìn về một người / một chỗ',
    viDu: 'Gen, nhìn Javis',
    canActor: true,
    tao: (s, actor) => ({
      cmd: 'actor.lookAt',
      args: { actor, target: s['muc tieu'] },
    }),
    nhacLai: (s) => `nhìn ${tenDep(s['muc tieu'])}`,
  },

  /* --------------------------------------------------------------- cơ thể */
  {
    id: 'ngoi',
    nhom: 'Cơ thể',
    mau: ['ngoi xuong', 'ngoi di', 'ngoi'],
    moTa: 'Ngồi xuống ghế gần nhất',
    viDu: 'Gen, ngồi xuống',
    canActor: true,
    tao: (_s, actor) => ({ cmd: 'actor.sit', args: { actor, seat: GHE_GAN_NHAT } }),
    nhacLai: () => 'ngồi xuống',
  },
  {
    id: 'ngoiGhe',
    nhom: 'Cơ thể',
    mau: ['ngoi <place>', 'ngoi xuong <place>', 'ngoi vao <place>', 'ngoi len <place>'],
    moTa: 'Ngồi vào một ghế có tên',
    viDu: 'Gen, ngồi ghế hai',
    canActor: true,
    tao: (s, actor) => ({ cmd: 'actor.sit', args: { actor, seat: s.place } }),
    nhacLai: (s) => `ngồi ${tenDep(s.place)}`,
  },
  {
    id: 'dungLen',
    nhom: 'Cơ thể',
    mau: ['dung len', 'dung day', 'dung len di'],
    moTa: 'Đứng lên',
    viDu: 'Gen, đứng lên',
    canActor: true,
    tao: (_s, actor) => ({ cmd: 'actor.stand', args: { actor } }),
    nhacLai: () => 'đứng lên',
  },
  {
    id: 'dungLai',
    nhom: 'Cơ thể',
    mau: ['dung lai', 'dung het', 'tam dung', 'thoi', 'dung'],
    moTa: 'Dừng mọi việc đang làm',
    viDu: 'Gen, dừng lại',
    canActor: true,
    tao: (_s, actor) => ({ cmd: 'actor.stop', args: { actor } }),
    nhacLai: () => 'dừng lại',
  },

  /* -------------------------------------------------------------- cảm xúc */
  {
    id: 'emote',
    nhom: 'Cảm xúc',
    mau: ['<emote>', '<emote> di', '<emote> len', 'to ra <emote>', 'lam mat <emote>'],
    moTa: 'Diễn một cảm xúc trọn gói (mặt + người + âm)',
    viDu: 'Gen, vui lên',
    canActor: true,
    tao: (s, actor) => ({ cmd: 'actor.emote', args: { actor, emote: s.emote } }),
    nhacLai: (s) => tenDep(s.emote),
  },

  /* ------------------------------------------------------------------ lab */
  {
    id: 'moManHinh',
    nhom: 'Lab',
    mau: [
      'mo man hinh <man hinh>',
      'bat man hinh <man hinh>',
      'mo <man hinh>',
      'hien man hinh <man hinh>',
    ],
    moTa: 'Mở một màn hình hologram',
    viDu: 'Mở màn hình trái',
    tao: (s) => ({
      cmd: 'screen.show',
      args: {
        screen: s['man hinh'],
        kind: 'text',
        content: 'Gen-Stage · lệnh giọng của Sếp',
      },
    }),
    nhacLai: (s) => `mở màn hình ${tenDep(s['man hinh'])}`,
  },
  {
    id: 'tatManHinh',
    nhom: 'Lab',
    mau: ['tat man hinh <man hinh>', 'dong man hinh <man hinh>', 'xoa man hinh <man hinh>'],
    moTa: 'Tắt / xoá một màn hình hologram',
    viDu: 'Tắt màn hình phải',
    tao: (s) => ({ cmd: 'screen.clear', args: { screen: s['man hinh'] } }),
    nhacLai: (s) => `tắt màn hình ${tenDep(s['man hinh'])}`,
  },
  {
    id: 'dungModule',
    nhom: 'Lab',
    mau: [
      'ket tinh <ten>',
      'dung module <ten>',
      'tao module <ten>',
      'lam module <ten>',
    ],
    moTa: 'Kết tinh một module mới rồi đưa vào tay',
    viDu: 'Gen, dựng connector Baserow',
    tao: (s) => ({
      cmd: 'module.build',
      args: { id: maTuTen(s.ten), shape: 'book', label: s.ten, from: 'main' },
    }),
    nhacLai: (s) => `kết tinh ${s.ten}`,
  },
  {
    id: 'camModule',
    nhom: 'Lab',
    mau: ['cam module <module>', 'mo module <module>', 'cam <module>', 'mo ra <module>'],
    moTa: 'Mở một module đã có ra xem',
    viDu: 'Gen, cầm module connector-baserow',
    tao: (s) => ({ cmd: 'module.open', args: { module: s.module } }),
    nhacLai: (s) => `mở module ${tenDep(s.module)}`,
  },
  {
    id: 'catModule',
    nhom: 'Lab',
    mau: ['cat module <module>', 'cat <module>', 'bo module <module>', 'luu module <module>'],
    moTa: 'Cất module lên kệ',
    viDu: 'Gen, cất module connector-baserow',
    tao: (s) => ({ cmd: 'module.store', args: { module: s.module, to: 'ke-module' } }),
    nhacLai: (s) => `cất module ${tenDep(s.module)}`,
  },

  /* ------------------------------------------------------------- sân khấu */
  {
    id: 'doiGocMay',
    nhom: 'Sân khấu',
    mau: ['doi goc may', 'doi camera', 'goc khac', 'doi goc quay', 'doi khung hinh'],
    moTa: 'Đổi sang góc máy kế tiếp',
    viDu: 'Đổi góc máy',
    tao: () => ({ cmd: 'camera.preset', args: { name: GOC_MAY_KE } }),
    nhacLai: () => 'đổi góc máy',
  },
  {
    id: 'dungLaiSanKhau',
    nhom: 'Sân khấu',
    mau: ['dung lai san khau', 'reset san khau', 'lam lai san khau', 'dung lai canh'],
    moTa: 'Dựng lại sân khấu từ đầu',
    viDu: 'Dựng lại sân khấu',
    tao: () => ({ cmd: 'stage.reset', args: {} }),
    nhacLai: () => 'dựng lại sân khấu',
  },

  /* ------------------------------------------------------------------ nói */
  {
    id: 'noiVoi',
    nhom: 'Nói',
    mau: ['noi voi <ai> <loi>', 'noi cho <ai> <loi>', 'bao <ai> <loi>', 'noi <ai> rang <loi>'],
    moTa: 'Nói một câu HƯỚNG VỀ nhân vật khác (không phải nói với Sếp)',
    viDu: 'Javis, nói với Gen "em lo phần giao diện nhé"',
    canActor: true,
    tao: (s, actor) => ({
      cmd: 'actor.say',
      args: { actor, text: s.loi, to: s.ai },
    }),
    nhacLai: (s) => `nói với ${tenDep(s.ai)}: "${s.loi}"`,
  },
  {
    id: 'nhacLoi',
    nhom: 'Nói',
    mau: ['noi <loi>', 'noi la <loi>', 'nhac lai <loi>'],
    moTa: 'Nhân vật nói lại đúng câu Sếp đọc',
    viDu: 'Gen, nói "chào cả nhà"',
    canActor: true,
    tao: (s, actor) => ({ cmd: 'actor.say', args: { actor, text: s.loi } }),
    nhacLai: (s) => `nói "${s.loi}"`,
  },
];

/** `ban-dieu-khien` → "bàn điều khiển"… cho câu nhắc lại đọc được bằng giọng. */
export function tenDep(id: string): string {
  const dep: Record<string, string> = {
    ...TEN_HIEN_THI,
    camera: 'Sếp',
    'ban-dieu-khien': 'bàn điều khiển',
    'buc-trung-tam': 'bục trung tâm',
    'ke-module': 'kệ module',
    cua: 'cửa',
    'ghe-1': 'ghế một',
    'ghe-2': 'ghế hai',
    'ban-1': 'bàn một',
    'ban-2': 'bàn hai',
    main: 'chính',
    left: 'trái',
    right: 'phải',
    vui: 'vui lên',
    'rat-vui': 'rất vui',
    buon: 'buồn',
    gian: 'giận',
    'ngac-nhien': 'ngạc nhiên',
    'suy-nghi': 'suy nghĩ',
    'dong-y': 'đồng ý',
    'tu-choi': 'từ chối',
    chao: 'chào',
    'ra-lenh': 'ra lệnh',
    'thanh-cong': 'ăn mừng',
    'that-bai': 'thất bại',
    'boi-roi': 'bối rối',
    met: 'mệt',
    'cham-chu': 'chăm chú',
  };
  return dep[id] ?? id.replace(/-/g, ' ');
}
