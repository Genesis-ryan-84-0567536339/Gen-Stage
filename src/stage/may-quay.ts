/**
 * may-quay.ts — **hình học tay máy (spring arm)**, H1 (#69 mục 14 + 15).
 *
 * Dữ liệu thuần: không `import three`, không DOM, không trạng thái. Nhờ vậy
 * `pnpm test` chấm được bằng số thay vì bằng lời văn trong PR — đúng lối mà
 * `bo-cuc.ts` (B1) và `buocLai` (F2) đã chọn.
 *
 * Vì sao tự tính thay vì `Raycaster`: vỏ căn nhà là **một hộp chữ nhật**
 * (14 × 10 m, trần 2,8 m), nên "tia từ tâm ngắm tới camera đụng tường/trần ở
 * đâu" có nghiệm đóng bằng phép slab — không cấp phát, không phụ thuộc thứ tự
 * duyệt scene, cho **cùng một kết quả ở mọi FPS**, và không rung khi camera
 * quét ngang một cái cột như raycast vào từng mesh nội thất.
 */

/** Hộp bên trong căn nhà mà camera được phép ở (nửa kích thước + trần). */
export interface HopNha {
  /** Nửa bề ngang cho phép (m, đã trừ lề tường). */
  hx: number;
  /** Nửa bề sâu cho phép (m, đã trừ lề tường). */
  hz: number;
  /** Sàn cho phép (m). */
  yMin: number;
  /** Trần cho phép (m, đã trừ lề trần). */
  yMax: number;
}

/** Kẹp một điểm vào trong hộp nhà. */
export function kepTrongHop(
  x: number,
  y: number,
  z: number,
  hop: HopNha,
): [number, number, number] {
  return [
    Math.max(-hop.hx, Math.min(hop.hx, x)),
    Math.max(hop.yMin, Math.min(hop.yMax, y)),
    Math.max(-hop.hz, Math.min(hop.hz, z)),
  ];
}

/** Điểm có nằm trong hộp nhà không (nở `no` m cho sai số dấu phẩy động). */
export function trongHop(x: number, y: number, z: number, hop: HopNha, no = 1e-6): boolean {
  return (
    x >= -hop.hx - no &&
    x <= hop.hx + no &&
    z >= -hop.hz - no &&
    z <= hop.hz + no &&
    y >= hop.yMin - no &&
    y <= hop.yMax + no
  );
}

/**
 * **Độ dài tay máy** lớn nhất giữ camera ở trong nhà.
 *
 * Tia bắt đầu ở `tam` (phải nằm trong hộp — kẹp trước bằng `kepTrongHop`), đi
 * theo `huong` (đã chuẩn hoá). Trả về `min(xaMuon, quãng tới mặt hộp − le)`,
 * không bao giờ nhỏ hơn `toiThieu`.
 *
 * Đây chính là chỗ xoá "trần vướng": camera leo lên sát trần 2,8 m thì tay máy
 * bị cắt **trước khi** chạm tấm trần, nên khung hình không bao giờ đầy trần
 * hay đen. Và cũng là chỗ xoá "camera ra ngoài tường" khi bám chủ ở góc nhà:
 * lệch cố định `(1.8, 2.0, 2.6)` đòi một vị trí ngoài tường thì tay máy ngắn
 * lại, góc nhìn giữ nguyên.
 */
export function dayTayMay(
  tam: readonly [number, number, number],
  huong: readonly [number, number, number],
  xaMuon: number,
  hop: HopNha,
  le = 0.12,
  toiThieu = 0.5,
): number {
  /* 1) quãng tới mặt hộp gần nhất theo tia (phép slab, chỉ xét t ≥ 0) */
  let tHop = Number.POSITIVE_INFINITY;
  const canh: Array<[number, number, number]> = [
    [tam[0], huong[0], hop.hx],
    [tam[2], huong[2], hop.hz],
  ];
  for (const [p, d, nua] of canh) {
    if (d > 1e-9) tHop = Math.min(tHop, (nua - p) / d);
    else if (d < -1e-9) tHop = Math.min(tHop, (-nua - p) / d);
  }
  if (huong[1] > 1e-9) tHop = Math.min(tHop, (hop.yMax - tam[1]) / huong[1]);
  else if (huong[1] < -1e-9) tHop = Math.min(tHop, (hop.yMin - tam[1]) / huong[1]);
  // tâm ngay trên mặt hộp (sai số dấu phẩy động) ⇒ `tHop` có thể âm
  const tranCung = Math.max(0, tHop);

  /*
   * 2) Ba điều kiện, theo thứ tự ƯU TIÊN GIẢM DẦN — thứ tự này là cả bài học:
   *      a. KHÔNG VƯỢT MẶT HỘP (`tranCung`) — bất biến duy nhất không được phá;
   *      b. không dài hơn `xaMuon`, và chừa lề `le` với tường;
   *      c. không ngắn hơn `toiThieu`.
   * Bản đầu viết `Math.max(toiThieu, …)` ngoài cùng nên (c) thắng (a): ở tâm
   * ngắm sát trần, sàn ép tay máy về 0,5 m là đẩy camera **lên trên trần** —
   * đúng cái hàm này sinh ra để chặn. Test "quét 2000 hướng" bắt được.
   */
  const mong = Math.min(xaMuon, Math.max(0, tranCung - le));
  return Math.min(Math.max(mong, Math.min(toiThieu, tranCung)), tranCung);
}

/**
 * **Hộp cho TÂM NGẮM**: hộp nhà thu vào mỗi mặt `lui` m.
 *
 * Vì sao cần: khoảng cách từ một điểm trong hộp tới biên theo **bất kỳ** tia
 * nào luôn ≥ khoảng cách tới mặt phẳng gần nhất. Nên nếu tâm ngắm luôn cách
 * mọi mặt ít nhất `toiThieu + le`, thì `dayTayMay` **không thể** trả về dưới
 * `toiThieu` — đó chính là bất biến mà review PR #72 (1) bắt được: lái sát
 * tường thì tâm ngắm nằm ngay trên mặt hộp, `tranCung → 0`, tay máy co còn
 * 0,126 m và khung hình chỉ còn cái áo nhân vật.
 */
export function hopTamNgam(hop: HopNha, lui: number): HopNha {
  const giua = (hop.yMin + hop.yMax) / 2;
  return {
    hx: Math.max(0, hop.hx - lui),
    hz: Math.max(0, hop.hz - lui),
    yMin: Math.min(giua, hop.yMin + lui),
    yMax: Math.max(giua, hop.yMax - lui),
  };
}

/**
 * **Đích camera KHẢ THI** cho một tâm ngắm + lệch mong muốn.
 *
 * Đây là chỗ sửa gốc của review PR #72 (1). Trước đây lò xo bám chạy tới
 * `đầu + lệch` — một điểm **ngoài tường** khi nhân vật đứng sát vách — rồi
 * `kepMayTrongNha()` dời camera về; lò xo thấy sai số không bao giờ giảm nên
 * tích vận tốc tới trạng thái xác lập `ω·e/(2+ω·dt)` (đo được 13,23 m/s) và
 * bật ra 3,33 m/s khi rời góc. Giờ **đích đã nằm trong nhà trước khi lò xo
 * chạy**, nên sai số về 0 và vận tốc về 0.
 *
 * Ba bước, đều **liên tục theo vị trí nhân vật** (phép chiếu lên hộp lồi là
 * 1-Lipschitz) nên không sinh cú nhảy đích ⇒ không sinh đỉnh vận tốc:
 *   1. kẹp đích vào hộp nhà (trừ lề `le`);
 *   2. nhân vật ở sát tường/góc thì bước 1 ăn mất khoảng cách — **nâng camera
 *      lên cao** để lấy lại tới `xaDeChiu` (trượt lên trần thay vì tiến vào
 *      người, đúng lối `camera-systems` tả cho spring arm bị chặn);
 *   3. lưới an toàn: vẫn ngắn hơn `toiThieu` thì đẩy ra đúng `toiThieu` theo
 *      hướng hiện có — an toàn vì `tam` đã cách mọi mặt ≥ `toiThieu`.
 */
export function dichCamera(
  tam: readonly [number, number, number],
  lech: readonly [number, number, number],
  hop: HopNha,
  xaDeChiu: number,
  le = 0.12,
  toiThieu = 0.6,
): [number, number, number] {
  const trongLe: HopNha = {
    hx: Math.max(0, hop.hx - le),
    hz: Math.max(0, hop.hz - le),
    yMin: Math.min(hop.yMax, hop.yMin + le),
    yMax: Math.max(hop.yMin, hop.yMax - le),
  };
  let [x, y, z] = kepTrongHop(tam[0] + lech[0], tam[1] + lech[1], tam[2] + lech[2], trongLe);

  /*
   * 2) bù bằng độ cao: ngang đã bị tường ăn thì **leo lên**.
   *
   * Bù theo ĐÚNG phần thiếu (`xaDeChiu − khoảng cách`), không theo nghiệm
   * đường tròn `sqrt(xaDeChiu² − ngang²)`: đạo hàm của căn ấy tiến ra vô cực
   * ở mép `ngang → xaDeChiu`, nên lúc nhân vật đi ngang qua mốc bù thì đích
   * camera **giật** một nhịp và lò xo chạm trần tốc độ. Phần thiếu thì
   * 1-Lipschitz: đích đi chậm hơn nhân vật.
   */
  const thieu = xaDeChiu - Math.hypot(x - tam[0], y - tam[1], z - tam[2]);
  if (thieu > 0) y = Math.min(trongLe.yMax, y + thieu);

  /* 3) lưới an toàn: không bao giờ ngắn hơn `toiThieu` */
  let ex = x - tam[0];
  let ey = y - tam[1];
  let ez = z - tam[2];
  let d = Math.hypot(ex, ey, ez);
  if (d < 1e-6) {
    ex = 0;
    ey = 0;
    ez = 1;
    d = 1;
  }
  if (d < toiThieu) {
    const k = toiThieu / d;
    return [tam[0] + ex * k, tam[1] + ey * k, tam[2] + ez * k];
  }
  return [x, y, z];
}
