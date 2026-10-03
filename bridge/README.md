# Bridge WebSocket (A1)

Cho agent/script ra lệnh cho sân khấu đang mở trong trình duyệt. Chưa có MCP.

```bash
pnpm bridge                 # cửa sổ 1 — chỉ nghe 127.0.0.1:8787
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
