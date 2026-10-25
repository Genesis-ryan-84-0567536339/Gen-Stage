/**
 * am-thanh.ts — âm ngắn tổng hợp bằng Web Audio cho `actor.emote` (spec mục
 * 3.2b: "âm ngắn Web Audio"), không cần file âm thanh nên không đụng
 * `assets/LICENSES.md`.
 *
 * Không bao giờ chặn hay làm hỏng lệnh: trình duyệt headless (Playwright
 * `--use-gl=swiftshader`) hoặc chưa có tương tác người dùng có thể từ chối
 * `AudioContext` — bọc try/catch, im lặng bỏ qua như `doc()` ở `nhanvat.ts`.
 */
import type { NotNgan } from './emotes';

let ctx: AudioContext | null = null;
let hongDa = false;

function layCtx(): AudioContext | null {
  if (hongDa) return null;
  if (ctx) return ctx;
  try {
    const C = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) {
      hongDa = true;
      return null;
    }
    ctx = new C();
    return ctx;
  } catch {
    hongDa = true;
    return null;
  }
}

/** Phát một chuỗi nốt ngắn nối tiếp. `manh` (0–1) nhân vào biên độ. */
export function phatAmNgan(notes: readonly NotNgan[] | undefined, manh = 1): void {
  if (!notes || notes.length === 0) return;
  const a = layCtx();
  if (!a) return;
  try {
    if (a.state === 'suspended') void a.resume().catch(() => undefined);
    let khi = a.currentTime;
    for (const n of notes) {
      const osc = a.createOscillator();
      const gn = a.createGain();
      osc.type = n.type ?? 'sine';
      osc.frequency.value = n.f;
      const dinh = Math.max(0, Math.min(1, (n.gain ?? 0.5) * manh));
      const dai = Math.max(0.02, n.ms / 1000);
      gn.gain.setValueAtTime(0, khi);
      gn.gain.linearRampToValueAtTime(dinh, khi + Math.min(0.02, dai / 4));
      gn.gain.linearRampToValueAtTime(0, khi + dai);
      osc.connect(gn).connect(a.destination);
      osc.start(khi);
      osc.stop(khi + dai + 0.02);
      khi += dai;
    }
  } catch {
    // trình duyệt chặn âm — bỏ qua, lệnh không bao giờ hỏng vì thiếu tiếng
  }
}
