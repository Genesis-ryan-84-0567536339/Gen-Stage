/**
 * so-tu.ts — SỔ TỪ NHÀ: sửa chữ nhận dạng theo vốn từ riêng của Gen-Stage
 * (C1, Issue #31).
 *
 * Đo thật trên máy Boss (bảng trong `docs/c1/so-sanh.md`): **mọi** engine CPU
 * nghe đúng câu lệnh tiếng Việt thường ("đi tới bàn điều khiển", "mở màn hình
 * chính", "quay lại đây", "dừng lại") nhưng **không engine nào** nghe ra
 * `Gen`, `connector`, `Baserow`, `module`, `Kho Ryan` — vì đó là tên riêng
 * ngoài vốn từ của model, không phải lỗi âm học. Nâng model (medium,
 * large-v3-turbo) **không chữa được** chuyện này mà chỉ đổi 3,5 s thành 78 s.
 *
 * Nên lớp này là chỗ chữa, và nó **không phải bảng tra tay cho 10 câu mẫu**:
 *  - từ dài (≥ 4 ký tự khi bỏ dấu) khớp **mờ** theo khoảng cách sửa trên
 *    "dạng nghe" (bỏ dấu, bỏ khoảng trắng) nên `con nét to` → `connector`,
 *    `ba su rau` → `Baserow` mà không cần kể trước từng cách nghe sai;
 *  - từ ngắn (`Gen`) khớp theo **danh sách đồng âm** khai tay, vì 3 ký tự thì
 *    khớp mờ bắt bừa cả `đến`, `gần`.
 *
 * Thêm một tên riêng mới (connector mới, tên module mới) = thêm MỘT dòng vào
 * `SO_TU`, không sửa logic.
 */

/** Một từ trong sổ. */
export interface TuNha {
  /** Dạng chuẩn sẽ ghi ra. */
  chuan: string;
  /**
   * Cách nghe sai khai tay — dùng cho từ ngắn, hoặc cho cách nghe quá xa để
   * khớp mờ bắt được. So sau khi bỏ dấu.
   */
  dongAm?: string[];
  /** Số từ tối đa engine có thể cắt tên này thành (mặc định 3). */
  soTu?: number;
  /**
   * Ngưỡng khớp mờ riêng (mặc định `NGUONG`). Để trống trong hầu hết trường
   * hợp: đo thật thấy nới lên 0,5 cho `Kho Ryan` thì `khó bảo ghê` cũng thành
   * `Kho Ryan` — tên nước ngoài thì khai `dongAm` an toàn hơn nới ngưỡng.
   */
  nguong?: number;
}

/**
 * Vốn từ riêng. Thứ tự không quan trọng (chọn theo điểm khớp, không theo thứ
 * tự khai), nhưng giữ nhóm cho dễ đọc.
 */
/**
 * G2 (28/10) — Boss đổi tên hiển thị **Gen → "Nhi"**, **Javis → "Nam"**.
 *
 * CỐ Ý KHÔNG thêm "Nhi"/"Nam" vào sổ này. Khác với "Gen"/"Javis" (tên riêng
 * NGOÀI vốn từ model, nên PhoWhisper nghe sai sang thứ khác hẳn — `david`,
 * `gia viết`…), "Nam" và "Nhi" là **từ tiếng Việt thường model đã biết rất
 * rõ** (phương hướng "phía nam", vật "nam châm", từ "nhí nhảnh", số đếm — xem
 * `SO_CHU` trong `src/behavior/ngu-phap.ts`: `nhi` = 2, `nam` = 5). Nghĩa là
 * cái lỗi "model không biết tên riêng" mà sổ này sinh ra để chữa **không tồn
 * tại** với hai tên mới — model nghe đúng "nam"/"nhi" ngay từ đầu, không cần
 * sửa chữ. Khai bừa đồng âm (`nghi`, `ni`, `năm`, `nằm`…) cho hai từ thường
 * này còn tệ hơn: `suaTheoSoTu` so khớp CHÍNH XÁC không theo vị trí trong
 * câu (xem `khopCuaSo`), nên bất kỳ câu nào tình cờ chứa "nghi"/"ni"/"năm"/
 * "nằm" sẽ bị viết đè thành "Nam"/"Nhi" — rủi ro y như bài học "không khai
 * `ghê` cho Gen" ở dưới, nhưng ở quy mô lớn hơn vì đây là từ cực thường gặp.
 * Việc tách "ai đang được gọi tên" khỏi câu đã có lớp riêng, có ràng buộc vị
 * trí/ngữ cảnh: `BI_DANH_NHAN_VAT` + bước 1b trong
 * `src/behavior/hieu-lenh.ts#tachNguoiNhan`.
 *
 * Chưa đo thật bằng audio qua `/stt`: cần tải model PhoWhisper (~930 MB,
 * `scripts/fetch-stt.sh`) + dựng 10 câu TTS rồi gọi `/stt` — ngoài phạm vi
 * thời gian hợp lý của đợt G2 này. Nếu đo sau mà thấy PhoWhisper nghe sai
 * "Nam"/"Nhi" ra dạng **khác hẳn từ thường khác** (kiểu "david" của Javis),
 * mới nên thêm một dòng ở đây — không thêm trước khi có số đo thật.
 */
export const SO_TU: TuNha[] = [
  // tên Gen — 3 ký tự, phải khai đồng âm
  {
    chuan: 'Gen',
    soTu: 1,
    // CỐ Ý không khai `ghê`, `đen`, `kem`, `game`, `gian`: đó là từ Việt
    // thường, khai vào thì "khó bảo ghê" thành "khó bảo Gen". Thà bỏ sót một
    // cách nghe sai hơn là sửa bừa câu Boss nói đúng.
    dongAm: ['ghen', 'gen', 'gân', 'gane', 'gene', 'gem', 'gêm', 'giàng', 'ghèn'],
  },
  /**
   * **Javis** — tên nhân vật nam (avatar của Sếp), E1 (#48) việc 6.
   *
   * Kiểm độc lập 26/10: PhoWhisper **không bao giờ** nghe ra "Javis"; nó ra
   * `david` / `davids` / `gia viết` / `gia vít`. Hậu quả đo thật: *"Javis, đi
   * tới bàn điều khiển"* → **Gen** đi, vì không tách được người nhận. Ba trong
   * mười câu đúng người.
   *
   * `Javis` dài 5 ký tự nên khớp mờ cũng chạy (≤ 1 phép sửa), nhưng mấy cách
   * nghe thật đều xa hơn thế → phải khai tay. Khai `david` là **an toàn**:
   * tiếng Việt không có từ nào đọc thành "david", khác hẳn chuyện khai `ghê`
   * cho `Gen` (xem ghi chú ở trên).
   */
  {
    chuan: 'Javis',
    dongAm: [
      'david',
      'davids',
      'đa vít',
      'da vit',
      'gia viết',
      'gia vít',
      'gia việt',
      'gia vis',
      'giavis',
      'javit',
      'ja vít',
      'ja vit',
      'jarvis',
      'ja vis',
    ],
  },
  // từ nghiệp vụ
  { chuan: 'connector', dongAm: ['cong nghe', 'can net', 'con net to'] },
  // Tên nước ngoài do TTS/giọng Việt đọc ra âm khá xa dạng viết, vượt ngưỡng
  // khớp mờ → khai thẳng mấy cách đọc. Thêm tên mới = thêm một dòng ở đây.
  {
    chuan: 'Baserow',
    dongAm: ['ba sao', 'basura', 'ba su rau', 'ba su rao', 'ba xu rao', 'ba xu dau', 'ba sue rau'],
  },
  { chuan: 'module', dongAm: ['mo dun', 'mua dun', 'mo dung', 'mua dung', 'model', 'moi truong'] },
  // KHÔNG khai `tuc`/`cac`/`cuc`: đo thật thấy nó ăn mất `cất` trong
  // "cất module lên kệ". Sổ từ chỉ chứa TÊN RIÊNG ngoài vốn từ model —
  // từ tiếng Việt thường thì để model tự nghe, nó nghe đúng.
  { chuan: 'kết tinh', dongAm: ['ket tinh', 'kich tinh', 'kkin', 'thai tinh'] },
  {
    chuan: 'Kho Ryan',
    dongAm: ['co ryan', 'corayan', 'cho ryan', 'kho rayon', 'kho raion', 'kho rai ung', 'khoai rai ang'],
  },
  { chuan: 'Gen-Stage', dongAm: ['gen stage', 'ghen stay'] },
  { chuan: 'Gen-hub', dongAm: ['gen hap', 'ghen hap'] },
];

/** Ngưỡng khớp mờ: khoảng cách sửa / độ dài dạng chuẩn. Trên ngưỡng = không phải. */
const NGUONG = 0.34;
/** Dưới bấy nhiêu ký tự (đã bỏ dấu) thì KHÔNG khớp mờ — chỉ khai đồng âm. */
const DAI_TOI_THIEU = 4;

/**
 * "Dạng nghe": bỏ dấu tiếng Việt, bỏ mọi thứ không phải chữ/số.
 *
 * Hai chữ nghe giống nhau thì dạng nghe gần nhau: `con nét to` → `connetto`,
 * `connector` → `connector`. Giữ `đ → d` riêng vì NFD không tách `đ`.
 */
export function dangNghe(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

/** Khoảng cách sửa theo ký tự. */
export function khoangCach(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let truoc = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const nay = [i];
    for (let j = 1; j <= b.length; j++) {
      nay[j] =
        a[i - 1] === b[j - 1]
          ? truoc[j - 1]!
          : 1 + Math.min(truoc[j - 1]!, truoc[j]!, nay[j - 1]!);
    }
    truoc = nay;
  }
  return truoc[b.length]!;
}

/** Số từ tối đa một tên riêng bị engine cắt ra (trần cho cửa sổ trượt). */
const CUA_SO_MAX = 4;

interface Khop {
  tu: TuNha;
  diem: number;
}

/** Cửa sổ `w` (đã bỏ dấu) khớp từ nào trong sổ? `null` nếu không khớp từ nào. */
function khopCuaSo(w: string, soTuCuaSo: number): Khop | null {
  let tot: Khop | null = null;
  for (const tu of SO_TU) {
    if (soTuCuaSo > (tu.soTu ?? 3)) continue;
    const chuan = dangNghe(tu.chuan);

    // 1) đồng âm khai tay — khớp ĐÚNG, không ngưỡng (từ ngắn dựa cả vào đây)
    if (tu.dongAm?.some((x) => dangNghe(x) === w)) return { tu, diem: 0 };
    if (w === chuan) return { tu, diem: 0 };

    // 2) khớp mờ — chỉ cho từ đủ dài, không thì `gen` bắt cả `gần`, `đến`
    if (chuan.length < DAI_TOI_THIEU || w.length < DAI_TOI_THIEU) continue;
    const diem = khoangCach(w, chuan) / chuan.length;
    if (diem <= (tu.nguong ?? NGUONG) && (tot === null || diem < tot.diem)) tot = { tu, diem };
  }
  return tot;
}

/**
 * Sửa một câu theo sổ từ.
 *
 * Ở mỗi vị trí thử **mọi** cửa sổ 1…4 từ rồi lấy điểm khớp tốt nhất, hoà điểm
 * thì lấy cửa sổ NGẮN hơn. Lấy dài trước (bản đầu) thì `mô đun lên kệ` bị
 * `mô đun lên` → `module` ăn mất chữ `lên` — cùng điểm 0,33 với `mô đun`.
 */
export function suaTheoSoTu(cau: string): string {
  const tu = cau.split(/\s+/).filter(Boolean);
  const ra: string[] = [];
  let i = 0;
  while (i < tu.length) {
    let tot: (Khop & { n: number }) | null = null;
    for (let n = 1; n <= Math.min(CUA_SO_MAX, tu.length - i); n++) {
      const k = khopCuaSo(dangNghe(tu.slice(i, i + n).join(' ')), n);
      if (k && (tot === null || k.diem < tot.diem)) tot = { ...k, n };
    }
    if (tot) {
      ra.push(tot.tu.chuan);
      i += tot.n;
    } else {
      ra.push(tu[i]!);
      i += 1;
    }
  }
  return ra.join(' ');
}

/**
 * Chuẩn hoá câu Boss vừa nói, trước khi đẩy vào ô chat.
 *
 * - bỏ dấu câu cuối engine tự thêm (`.` `!`), giữ nguyên dấu tiếng Việt;
 * - sửa theo sổ từ nhà;
 * - **không** viết hoa / sửa ngữ pháp: text giữ nguyên để não đọc, chỉ gắn
 *   thêm cờ `goiGen` khi câu mở đầu bằng cách gọi tên.
 */
export function chuanHoaCauNoi(tho: string): { text: string; goiGen: boolean } {
  const sach = tho
    .trim()
    .replace(/[.!…]+$/g, '')
    .replace(/\s+/g, ' ')
    // Engine hay chèn một phụ âm lạc ở đầu ("n nói lại lần nữa", "d quay lại
    // đây", "m mở màn hình") — tiếng Việt không có từ một phụ âm, nên bỏ.
    .replace(/^[bcdfghjklmnpqrstvxz]\s+/i, '');
  const sua = suaTheoSoTu(sach);
  // "Gen ơi," / "Gen à," / "Gen," ở ĐẦU câu = gọi tên. Giữa câu thì không.
  const goiGen = /^gen\s*(ơi|à|ạ|a)?\s*[,.!]?\s/i.test(`${sua} `);
  return { text: sua, goiGen };
}
