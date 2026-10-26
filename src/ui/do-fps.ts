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
      if (daQua < GIAY_DO) {
        // bỏ 0,5 s đầu: lượt biên dịch shader đầu tiên không đại diện cho gì
        the.textContent =
          `⏱ đang đo ${daQua.toFixed(1)}/${GIAY_DO}s\n` +
          `FPS tạm: ${(1000 / trungBinh(dt.slice(Math.floor(dt.length * 0.1)))).toFixed(1)}`;
        requestAnimationFrame(tick);
        return;
      }
      dangChay = false;
      chotSo(dt);
    };
    requestAnimationFrame(tick);
  }

  function chotSo(dt: number[]): void {
    const bo = dt.slice(Math.max(1, Math.floor(dt.length * 0.1)));
    const tb = 1000 / trungBinh(bo);
    const xep = [...bo].sort((a, b) => a - b);
    // "1 % xấu nhất": khung hình chậm nhất — cái làm Boss thấy giật
    const xau = 1000 / xep[Math.max(0, Math.floor(xep.length * 0.99) - 1)];
    const hn = nguon.hieuNang();
    the.textContent =
      `FPS trung bình  ${tb.toFixed(1)}\n` +
      `FPS 1% xấu nhất ${xau.toFixed(1)}\n` +
      `lượt vẽ nhà     ${hn.callsNha}\n` +
      `lượt vẽ VRM     ${hn.callsVrm}\n` +
      `tam giác        ${hn.triangles}\n` +
      `shadow map      ${hn.coBong}\n` +
      `pixel ratio     ${hn.pixelRatio}\n` +
      `(bấm để đo lại)`;
  }

  the.addEventListener('click', doMotLuot);
  doMotLuot();
}

function trungBinh(a: number[]): number {
  if (a.length === 0) return 1000 / 60;
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}
