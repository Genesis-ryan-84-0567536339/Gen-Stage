/**
 * hanh-dong.ts — tiện ích dựng `Action` (hành động có thời lượng).
 *
 * Mọi lệnh "đi", "nói", "chơi clip" trả về một `Action`: biết trước
 * `durationMs`, có `done` để dispatcher biết khi nào rảnh, có `cancel` cho
 * `interrupt`.
 */
import type { Action } from '../api/types';

export interface HanhDongCoTay extends Action {
  /** Gọi khi sân khấu tự chạy xong trước hạn. */
  xong: () => void;
}

/** Tạo hành động rỗng, do sân khấu tự gọi `xong()` hoặc `cancel()`. */
export function hanhDong(durationMs: number, khiHuy?: () => void): HanhDongCoTay {
  let giaiQuyet: () => void = () => undefined;
  let daXong = false;
  const done = new Promise<void>((r) => {
    giaiQuyet = r;
  });
  const ket = () => {
    if (daXong) return;
    daXong = true;
    giaiQuyet();
  };
  return {
    durationMs,
    done,
    xong: ket,
    cancel: () => {
      if (daXong) return;
      khiHuy?.();
      ket();
    },
  };
}

/** Hành động xong ngay (dùng cho lệnh tức thì cần vẫn trả `Action`). */
export function hanhDongXongNgay(durationMs = 0): Action {
  return { durationMs, done: Promise.resolve(), cancel: () => undefined };
}

/**
 * Nối nhiều hành động lại thành một (vd: đi tới ghế rồi ngồi).
 * `uocLuongMs` là thời lượng báo cho bên gọi ngay lúc trả lời — hành động sau
 * chỉ được tạo khi hành động trước xong, nên không thể cộng chính xác trước.
 */
export function noiTiep(ds: Array<() => Action>, uocLuongMs: number): Action {
  let huyHienTai: (() => void) | null = null;
  let dungLai = false;

  const done = (async () => {
    for (const taoHd of ds) {
      if (dungLai) return;
      const hd = taoHd();
      huyHienTai = hd.cancel;
      await hd.done;
    }
  })();

  return {
    durationMs: uocLuongMs,
    done,
    cancel: () => {
      dungLai = true;
      huyHienTai?.();
    },
  };
}
