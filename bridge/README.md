# Bridge WebSocket (A1)

Cho agent/script ra lệnh cho sân khấu đang mở trong trình duyệt. Chưa có MCP.

```bash
pnpm bridge                 # cửa sổ 1 — nghe ws://localhost:8787
pnpm dev                    # cửa sổ 2 — rồi mở http://localhost:5173/?bridge=1
npx wscat -c ws://localhost:8787/        # cửa sổ 3 — client ra lệnh
> {"id":"1","cmd":"stage.describe"}
> {"id":"2","cmd":"actor.moveTo","args":{"actor":"lan","to":"ban-2"}}
```

Trả về `{"id":"2","ok":true,"result":{...,"durationMs":2300}}`, rồi sự kiện
`{"event":"actor.arrived","data":{...}}` khi tới nơi (sự kiện phát cho mọi client).

Không có `wscat` thì chạy `node scripts/kiem-bridge.mjs` — script tự gửi
`actor.moveTo` và chờ `actor.arrived`. Cổng đổi bằng `GEN_STAGE_PORT=9000`.
