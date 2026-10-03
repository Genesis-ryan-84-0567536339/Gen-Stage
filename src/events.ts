/**
 * events.ts — bus sự kiện của sân khấu.
 *
 * Mọi thứ xảy ra trên sân khấu (actor tới đích, nói xong, kịch bản xong, Boss
 * bấm chuột) đều chảy qua đây. Dispatcher, nhật ký, UI và bridge WebSocket đều
 * chỉ là người nghe — không ai gọi trực tiếp vào nhau.
 *
 * Đăng ký `'*'` để nghe tất cả.
 */
import type { EventBusLike, HuyDangKy, StageEvent } from './api/types';

/** Số sự kiện gần nhất giữ lại cho `stage.describe().lastEvents`. */
const GIU_LAI = 50;

export class EventBus implements EventBusLike {
  private nghe = new Map<string, Set<(e: StageEvent) => void>>();
  private lichSu: StageEvent[] = [];

  emit(event: string, data: Record<string, unknown> = {}): StageEvent {
    const e: StageEvent = { t: Date.now(), event, data };

    this.lichSu.push(e);
    if (this.lichSu.length > GIU_LAI) this.lichSu.shift();

    for (const ten of [event, '*']) {
      const bo = this.nghe.get(ten);
      if (!bo) continue;
      // chụp lại danh sách: người nghe có thể tự hủy trong lúc chạy
      for (const fn of Array.from(bo)) {
        try {
          fn(e);
        } catch (loi) {
          console.warn('[Gen-Stage] người nghe sự kiện lỗi:', ten, loi);
        }
      }
    }
    return e;
  }

  on(event: string, fn: (e: StageEvent) => void): HuyDangKy {
    let bo = this.nghe.get(event);
    if (!bo) {
      bo = new Set();
      this.nghe.set(event, bo);
    }
    bo.add(fn);
    return () => {
      bo?.delete(fn);
    };
  }

  /** Chờ đúng một lần sự kiện (kịch bản `waitFor` dùng). */
  once(event: string): Promise<StageEvent> {
    return new Promise((resolve) => {
      const huy = this.on(event, (e) => {
        huy();
        resolve(e);
      });
    });
  }

  recent(n = 10): StageEvent[] {
    return this.lichSu.slice(-n);
  }

  xoa(): void {
    this.lichSu = [];
  }
}
