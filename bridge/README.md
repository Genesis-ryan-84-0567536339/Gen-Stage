# Bridge WebSocket (A1) + giọng tiếng Việt (B2)

Cho agent/script ra lệnh cho sân khấu đang mở trong trình duyệt. Chưa có MCP.

`pnpm bridge` bật **hai thứ cùng lúc**: ws ra lệnh (8787) và HTTP giọng nói
(8788, xem mục "Giọng tiếng Việt" ở dưới).

```bash
pnpm bridge                 # cửa sổ 1 — chỉ nghe 127.0.0.1:8787 (ws) + :8788 (tts)
pnpm dev                    # cửa sổ 2 — rồi mở http://localhost:5173/?bridge=1
npx wscat -c ws://localhost:8787/        # cửa sổ 3 — client ra lệnh
> {"id":"1","cmd":"stage.describe"}
> {"id":"2","cmd":"actor.moveTo","args":{"actor":"lan","to":"ban-2"}}
```

Trả `{"id":"2","ok":true,"result":{…,"durationMs":3895}}`, rồi sự kiện
`{"event":"actor.arrived","data":{…}}` khi tới nơi (phát cho mọi client).

**Chỉ nghe trên máy này** (`ss -ltn | grep 8787` → `127.0.0.1:8787`). Muốn máy
khác vào thì phải nói rõ *và* đặt mã, vì bridge điều khiển được cả sân khấu:

```bash
GEN_STAGE_TOKEN=abc123 pnpm bridge --host 0.0.0.0     # thiếu token là bridge từ chối chạy
npx wscat -c 'ws://192.168.1.9:8787/?token=abc123'    # hoặc gửi {"token":"abc123"} ở khung đầu
# trình duyệt: http://192.168.1.9:5173/?bridge=1&bridgeToken=abc123
```

Không có `wscat` thì `node scripts/kiem-bridge.mjs` tự chạy trọn:
gửi `actor.moveTo` rồi chờ `actor.arrived`. Cổng đổi bằng `GEN_STAGE_PORT`.

**Heartbeat (Refs #37)**: client gửi `{"ping":<số>}` bất cứ lúc nào, bridge trả
ngay `{"pong":<số>}` (không phải lệnh, không ghi vào nhật ký `→`). Driver não
(`scripts/nao-agy.mjs`) dùng cặp này mỗi 15 s để tự phát hiện ws chết nửa chừng
mà không có `close`/`error` nào bắn — xem "Quyết định HEARTBEAT + RECONNECT +
WATCHDOG" trong `CLAUDE.md`.

## Giọng tiếng Việt (B2 — Issue #20)

```bash
pnpm bridge                                     # bật luôn cổng 8788
curl 'http://127.0.0.1:8788/tts?text=Xin%20ch%C3%A0o%20S%E1%BA%BFp&voice=nu' -o thu.mp3
ffprobe -show_entries format=duration thu.mp3   # ~1,2 s, file ~8 KB
```

| Đường | Trả |
| --- | --- |
| `GET /tts?text=&voice=&rate=&pitch=` | `audio/mpeg` (mp3 24 kHz) |
| `GET /tts/giong` | `{"nu":"vi-VN-HoaiMyNeural","nam":"vi-VN-NamMinhNeural"}` |
| `GET /khoe` | `{"ok":true}` |

- `voice`: `nu` | `nam` | tên giọng Edge đầy đủ. `rate`/`pitch`: `-100`…`100`.
- **Cache đĩa** `.cache/tts/<sha1>.mp3` (trong `.gitignore`) — khoá tính theo
  giọng + tốc độ + cao độ + **nguyên văn** câu, nên đổi một dấu là file khác.
- **Không dùng thư viện edge-tts** (`@andresaya/edge-tts` GPL-3.0-only,
  `edge-tts-universal` AGPL-3.0 — copyleft, nối vào là kéo cả repo theo). Gọi
  thẳng WebSocket công khai của Edge trong `bridge/tts.ts` bằng `ws` +
  `node:crypto` có sẵn: không thêm phụ thuộc, không khoá API, không vướng giấy
  phép. Dịch vụ đổi giao thức thì chỉ sửa một file.
- Cổng đổi bằng `GEN_STAGE_TTS_PORT`, thư mục cache bằng `GEN_STAGE_TTS_CACHE`.
  Bind theo đúng chính sách của ws: mặc định chỉ `127.0.0.1`.
