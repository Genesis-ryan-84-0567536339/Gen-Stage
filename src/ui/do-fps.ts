/**
 * do-fps.ts — THƯỚC FPS TRONG APP (D1b vòng 2, PR #51).
 *
 * Lý do tồn tại: mọi script bằng chứng chạy Chromium + **swiftshader** (renderer
 * PHẦN MỀM, ~1 fps) — con số FPS ở đó dao động ±40 % giữa hai lượt đo liền nhau
 * nên **không kết luận được gì** về hiệu năng thật. Mốc thật của Issue #48 là
 * "≥ 30 FPS trên GPU tích hợp, ≥ 25 FPS trên điện thoại", và chỉ đo được trên
 * **Firefox + GPU thật của Boss**.
 *
 * Cách Boss tự đo: mở `http://localhost:5173/?fps=1` → một thẻ nhỏ góc trên
 * trái đếm **10 giây** rồi chốt lại: FPS trung bình, FPS thấp nhất (1 % xấu
 * nhất), số lượt vẽ phần nhà / phần VRM, cỡ shadow map. Bấm vào thẻ để đo lại.
 *
 * Không có `?fps=1` thì file này không gắn gì vào DOM và không chạy vòng nào.
 */

/** Bật thước FPS khi URL có `?fps=1`. */
export function coDoFps(): boolean {
  const v = new URLSearchParams(location.search).get('fps');
  return v === '1' || v === 'true';
}

interface NguonSo {
  hieuNang(): Record<string, unknown>;
}

const GIAY_DO = 10;
/**
 * F2 (#56) — **số khung TỐI THIỂU** để dám chốt một con số.
 *
 * Boss báo thước này hiện "FPS trung bình 60.0 / 1% xấu nhất NaN" trên
 * renderer ~1 FPS. Gốc: bản D1b cắt 10 % mẫu đầu bằng `dt.slice(floor(n/10))`
 * rồi chia cho `trungBinh`, mà `trungBinh([])` lại **trả về `1000/60`** — một
 * giá trị bịa. Khi khung đầu tiên mất hơn 10 giây (biên dịch shader trên
 * renderer phần mềm là chuyện thường) thì vòng đo kết thúc với đúng 1 mẫu,
 * `slice(1)` ra mảng rỗng → 60.0 bịa, và percentile trên mảng rỗng → NaN.
 *
 * Giờ: thước **không bao giờ bịa số**. Thiếu mẫu thì nó nói thiếu mẫu và đo
 * tiếp (tới trần `GIAY_TOI_DA`), vì Boss sẽ dựa vào đúng thước này để chốt
 * dòng 13/14 của bản kiểm hoàn chỉnh.
 */
const KHUNG_TOI_THIEU = 8;
/** Trần thời gian một lượt đo (s) — renderer rất chậm vẫn phải chốt được số. */
const GIAY_TOI_DA = 40;
/** Bỏ `WARMUP` giây đầu (biên dịch shader) — cắt theo THỜI GIAN, không theo %. */
const WARMUP = 0.5;

/**
 * Chốt số từ danh sách `dt` (ms) của các khung đã đo. Tách khỏi DOM để test
 * được (`src/api/__tests__/f2-steer-muot.test.ts`).
 *
 * `fps` = **số khung chia cho thời gian thật** của chính bộ mẫu đã dùng. (Về
 * đại số nó bằng `1000 / trung bình dt` — viết theo định nghĩa gốc để không
 * còn chỗ nào gọi một hàm `trungBinh` có giá trị mặc định bịa.) Ba tật thật
 * của bản cũ nằm ở chỗ khác, và đều được sửa ở đây:
 *   1. `trungBinh([])` **trả về `1000/60`** → in ra "60.0" khi không có mẫu;
 *   2. cắt warmup bằng `floor(n·0,1)` (theo %) nên n nhỏ là cắt sạch mẫu;
 *   3. phân vị dùng `floor(n·0,99) − 1` → lệch một bậc, và `NaN` khi mảng rỗng.
 */
export function chotFps(dt: number[]): {
  soKhung: number;
  giay: number;
  fps: number | null;
  fpsXau: number | null;
  dtDinh: number | null;
} {
  const tong = dt.reduce((a, b) => a + b, 0);
  let bo = dt;
  // cắt warmup theo thời gian, nhưng chỉ khi còn đủ mẫu để nói được gì
  let daCat = 0;
  let i = 0;
  while (i < dt.length && daCat < WARMUP * 1000 && dt.length - i > KHUNG_TOI_THIEU) {
    daCat += dt[i]!;
    i += 1;
  }
  bo = dt.slice(i);
  if (bo.length < KHUNG_TOI_THIEU) {
    return {
      soKhung: dt.length,
      giay: +(tong / 1000).toFixed(2),
      fps: null,
      fpsXau: null,
      dtDinh: null,
    };
  }
  const tongBo = bo.reduce((a, b) => a + b, 0);
  const xep = [...bo].sort((a, b) => a - b);
  /**
   * Phân vị 99 của **thời gian khung** = 1 % khung chậm nhất, rồi đổi sang FPS.
   * Chỉ số theo quy ước "nearest-rank": `ceil(0,99·n) − 1`, kẹp trong mảng.
   * Bản cũ dùng `floor(n·0,99) − 1` nên với n = 100 nó lấy phần tử thứ 98
   * (phân vị 98) và với n ≤ 1 thì lấy `xep[0]` của mảng rỗng → NaN.
   */
  const vt = Math.min(xep.length - 1, Math.max(0, Math.ceil(xep.length * 0.99) - 1));
  const dtDinh = xep[vt]!;
  return {
    soKhung: dt.length,
    giay: +(tong / 1000).toFixed(2),
    fps: +((bo.length / (tongBo / 1000)) || 0).toFixed(1),
    fpsXau: +(1000 / dtDinh).toFixed(1),
    dtDinh: +dtDinh.toFixed(1),
  };
}

export function batDoFps(nguon: NguonSo): void {
  const the = document.createElement('div');
  the.id = 'do-fps';
  the.style.cssText = [
    'position:fixed',
    'left:12px',
    'top:12px',
    'z-index:50',
    'padding:10px 12px',
    'border-radius:10px',
    'background:rgba(24,18,12,0.86)',
    'color:#ffe9c8',
    'font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
    'white-space:pre',
    'cursor:pointer',
    'user-select:none',
    'box-shadow:0 2px 10px rgba(0,0,0,0.35)',
  ].join(';');
  the.title = 'Bấm để đo lại 10 giây';
  document.body.appendChild(the);

  let dangChay = false;

  function doMotLuot(): void {
    if (dangChay) return;
    dangChay = true;
    const dt: number[] = [];
    let truoc = performance.now();
    const batDau = truoc;

    const tick = (): void => {
      const nay = performance.now();
      dt.push(nay - truoc);
      truoc = nay;
      const daQua = (nay - batDau) / 1000;
      /**
       * F2 — đo tới khi CẢ HAI điều kiện đủ: hết `GIAY_DO` giây **và** có
       * `KHUNG_TOI_THIEU` khung. Renderer ~1 FPS vì vậy vẫn chốt được số (đo
       * lâu hơn, tới trần `GIAY_TOI_DA`) chứ không trả về một con số bịa.
       */
      const duKhung = dt.length >= KHUNG_TOI_THIEU + 1;
      if ((daQua < GIAY_DO || !duKhung) && daQua < GIAY_TOI_DA) {
        const tam = chotFps(dt);
        the.textContent =
          `⏱ đang đo ${daQua.toFixed(1)}/${GIAY_DO}s\n` +
          `khung đếm được  ${dt.length}\n` +
          (tam.fps === null ? 'FPS tạm: chưa đủ khung' : `FPS tạm: ${tam.fps.toFixed(1)}`);
        requestAnimationFrame(tick);
        return;
      }
      dangChay = false;
      chotSo(dt);
    };
    requestAnimationFrame(tick);
  }

  function chotSo(dt: number[]): void {
    const so = chotFps(dt);
    const hn = nguon.hieuNang();
    const dong = (nhan: string, v: unknown) => `${nhan.padEnd(16)}${v}\n`;
    the.textContent =
      dong('khung đếm được', `${so.soKhung} trong ${so.giay}s`) +
      (so.fps === null
        ? `⚠ chưa đủ khung để chốt FPS\n  (cần ≥ ${KHUNG_TOI_THIEU} khung sau ${WARMUP}s khởi động)\n`
        : dong('FPS trung bình', so.fps.toFixed(1)) +
          dong('FPS 1% xấu nhất', `${so.fpsXau!.toFixed(1)}  (khung ${so.dtDinh} ms)`)) +
      dong('lượt vẽ nhà', hn.callsNha) +
      dong('lượt vẽ VRM', hn.callsVrm) +
      dong('tam giác', hn.triangles) +
      dong('shadow map', hn.coBong) +
      dong('pixel ratio', hn.pixelRatio) +
      '(bấm để đo lại)';
  }

  the.addEventListener('click', doMotLuot);
  doMotLuot();
}
