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
