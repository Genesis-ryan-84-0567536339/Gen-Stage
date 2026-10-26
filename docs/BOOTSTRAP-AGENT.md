# Gen-Stage cho agent — đọc 1 câu là đủ

> **Gọi `stage_bootstrap` trước, làm theo nó.**

Hết. Mọi thứ khác dưới đây chỉ là cách nối dây.

---

## 1. Bật sân khấu (máy Boss)

```bash
cd ~/Documents/Games\ 3d/Gen-Stage
pnpm start           # MỘT LỆNH: bridge (ws 8787 + giọng 8788 + MCP 8789) + sân khấu + DRIVER não (scripts/nao-agy.mjs, log .cache/log/nao.log) + mở Firefox
```

Trình duyệt mặc định tự nối bridge (tắt bằng `?bridge=0`); chưa nối thì mọi tool trả đúng một câu
lỗi: *"Sân khấu chưa nối. Mở http://localhost:5173/?bridge=1…"*.

## 2. Đăng ký MCP vào agy CLI (Antigravity CLI)

agy giữ cấu hình MCP ở **`~/.gemini/config/mcp_config.json`** (quản bằng
`agy mcp`). Cách gọn nhất — bridge đã phơi MCP streamable HTTP:

```bash
agy mcp add gen-stage http://127.0.0.1:8789/mcp
agy mcp list                 # phải thấy: gen-stage  http  enabled
# đã kiểm thật 25/10: agy ghi khoá "serverUrl", báo `Added MCP server "gen-stage" (http)`
```

Cách thứ hai (stdio — dùng khi không muốn bật cổng HTTP):

```bash
agy mcp add gen-stage -- \
  /home/ryan/Documents/Games\ 3d/Gen-Stage/node_modules/.bin/tsx \
  /home/ryan/Documents/Games\ 3d/Gen-Stage/bridge/mcp.ts
```

Sau khi thêm, `~/.gemini/config/mcp_config.json` trông như vậy:

```json
{
  "mcpServers": {
    "gen-stage": { "disabled": false, "serverUrl": "http://127.0.0.1:8789/mcp" }
  }
}
```

Bỏ đăng ký: `agy mcp remove gen-stage`.

**Cổng khác mặc định** (`GEN_STAGE_PORT`/`GEN_STAGE_MCP_PORT`) thì phải khai
`--env` khi đăng ký bản stdio: client MCP **không** cho tiến trình con thừa
hưởng biến môi trường tuỳ ý, nên thiếu `--env` là MCP lặng lẽ nối về 8787.

## 3. Chạy não

```bash
agy --prompt-interactive "$(cat skills/gen-stage-nao/SKILL.md)"
```

Rồi Boss gõ vào **ô chat dưới màn hình** (hoặc bấm `Space`) — mỗi câu của Boss
thành sự kiện `user.text`, agy nghe bằng `stage_events` rồi diễn.

Không có agy thì vẫn chạy được vòng kín bằng não rule-based:

```bash
node scripts/nao-demo.mjs --luot 2 --ghi docs/b3/nao-demo-log.json
```

## 4. Vòng mẫu (đúng cái skill dặn)

```
stage_bootstrap                         # 1 lần: đủ lệnh + "Hướng dẫn cho agent"
loop:
  stage_events { since, waitMs: 25000 } # chờ Boss nói
  có user.text?
    stage_describe                      # ai ở đâu, bận gì, cầm gì
    chọn 1–3 lệnh                       # actor_emote / screen_stream / module_build
    actor_say { actor: "gen", text }    # ≤ 2 câu tiếng Việt
  since = latest
```

## 5. Bộ tool

42 tool, **sinh tự động** từ sổ lệnh (`src/api/commands/`): mỗi lệnh `a.b` →
tool `a_b` (`stage_bootstrap`, `stage_describe`, `actor_say`, `actor_emote`,
`actor_steer`, `screen_stream`, `module_build`, `fx_play`, `script_run`…),
cộng **`stage_events`** để nghe. Thêm lệnh vào Actor API là có tool mới ngay,
không sửa gì ở MCP.

## 6. Bảo mật

MCP HTTP chỉ nghe `127.0.0.1`. Muốn cho máy khác vào thì phải `--host` **và**
`GEN_STAGE_TOKEN`, rồi mọi yêu cầu mang `Authorization: Bearer <token>` —
đúng chính sách của ws (xem `bridge/server.ts`).
