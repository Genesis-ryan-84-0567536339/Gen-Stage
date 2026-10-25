/**
 * o-chat.ts — Ô CHAT DƯỚI MÀN HÌNH (B3, Issue #21).
 *
 * Space mở ô nhập nhanh giữa sân khấu (`phim.ts`) rất gọn, nhưng nó biến mất
 * sau mỗi câu nên Boss không thấy "chỗ để nói chuyện". Ô này luôn ở đó, dưới
 * màn hình: gõ, Enter là gửi — **đúng một đường với Space**, tức
 * `actor.say` lên nhân vật `controlledBy: "owner"`, nên nó cũng bắn `user.text`
 * cho não nghe (xem `src/api/commands/actor.ts`).
 *
 * Không có đường tắt riêng: mọi chữ Boss gõ đều qua `dispatcher.run`.
 */
import type { Dispatcher } from '../api/dispatcher';
import type { ActorSnapshot, StageState } from '../api/types';

export interface OChat {
  /** Gửi một câu như Boss vừa gõ (script bằng chứng dùng). */
  gui(chu: string): Promise<boolean>;
  /** Actor đang nói hộ Boss. */
  actor(): string;
  thao(): void;
}

export function batOChat(
  dispatcher: Dispatcher,
  toast: (chu: string) => void,
): OChat {
  let actorId = 'owner';

  const hop = document.createElement('form');
  hop.id = 'o-chat';
  hop.innerHTML =
    '<label for="o-chat-nhap">Sếp nói</label>' +
    '<input id="o-chat-nhap" type="text" autocomplete="off" ' +
    'placeholder="Gen, dựng connector Baserow… (Enter gửi)" />' +
    '<button type="submit" title="Gửi cho Gen">Gửi</button>';
  document.body.appendChild(hop);

  const o = hop.querySelector('input')!;

  async function gui(chu: string): Promise<boolean> {
    const cau = chu.trim();
    if (!cau) return false;
    const kq = await dispatcher.run(
      'actor.say',
      // `interrupt` để Boss nói liên tục không phải chờ câu trước dứt
      { actor: actorId, text: cau, interrupt: true },
      'o-chat',
    );
    if (!kq.ok) toast(`💬 ${kq.error}`);
    return kq.ok;
  }

  hop.addEventListener('submit', (e) => {
    e.preventDefault();
    const chu = o.value;
    o.value = '';
    void gui(chu);
  });
  // Esc = nhả bàn phím về sân khấu (không thì WASD gõ vào ô chat)
  o.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      o.blur();
    }
  });

  /** Ai là người Boss lái — đọc qua dispatcher, không hard-code id. */
  void dispatcher.run('stage.describe', {}, 'o-chat').then((kq) => {
    if (!kq.ok) return;
    const st = kq.result as StageState;
    const chu: ActorSnapshot | undefined =
      st.actors.find((a) => a.controlledBy === 'owner') ?? st.actors[0];
    if (!chu) return;
    actorId = chu.id;
    hop.querySelector('label')!.textContent = `${chu.name} nói`;
  });

  return {
    gui,
    actor: () => actorId,
    thao: () => hop.remove(),
  };
}
