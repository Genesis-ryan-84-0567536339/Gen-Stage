#!/usr/bin/env bash
# Gen-Stage — MỘT LỆNH bật tất cả: cầu nối (ws + giọng Việt + MCP), sân khấu, não agy, rồi mở Firefox.
# Dùng:  bash scripts/chay.sh          # bật
#        bash scripts/chay.sh tat      # tắt hết
set -u
cd "$(dirname "$0")/.."
LOG=".cache/log"; mkdir -p "$LOG"
if [ "${1:-}" = "tat" ]; then
  pkill -f "scripts/nao-agy.mjs" 2>/dev/null     # driver não (chạy nền, không có cổng nên fuser không thấy)
  tmux kill-session -t gen-stage-nao 2>/dev/null  # agy đang ấm trong tmux
  for p in 8787 8788 8789 8790 5173; do fuser -k ${p}/tcp >/dev/null 2>&1; done
  echo "Đã tắt Gen-Stage."; exit 0
fi
[ -d node_modules ] || pnpm install --silent
# C3 (#40): Boss từng thấy model owner CŨ sau khi merge vì chay.sh BỎ QUA
# fetch-assets.sh khi file đã tồn tại — URL đổi mà không ai gọi lại script thì
# không bao giờ tải lại. Giờ LUÔN gọi cả 3 script mỗi lần chạy; mỗi script tự
# quyết có tải lại hay không bằng stamp `<file>.url` (xem fetch-assets.sh).
bash scripts/fetch-assets.sh >/dev/null 2>&1
bash scripts/fetch-lab-assets.sh >/dev/null 2>&1
bash scripts/fetch-anim.sh >/dev/null 2>&1
bash scripts/fetch-stt.sh >/dev/null 2>&1   # C1 (#31): nhận dạng giọng Việt, tải 1 lần
# bridge: nếu cổng đã có tiến trình cũ (kể cả bản chạy ngoài script) thì giải phóng rồi bật lại cho sạch
if ! curl -s -o /dev/null "http://127.0.0.1:8788/tts?text=a&voice=nu"; then
  for p in 8787 8788 8789 8790; do fuser -k ${p}/tcp >/dev/null 2>&1; done; sleep 1
  (nohup pnpm bridge > "$LOG/bridge.log" 2>&1 &)
fi
pgrep -f "vite --host --port 5173" >/dev/null || (nohup pnpm exec vite --host --port 5173 > "$LOG/dev.log" 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:5173/ && break; sleep 1; done
# ------------------------------------------------------------------- não của Gen
#
# Bản cũ (GEN_STAGE_NAO=tmux) bật agy TƯƠNG TÁC rồi bỏ đó: agy chào một lượt
# rồi về dấu nhắc `>` chờ người gõ **trong terminal**, nên Sếp gõ trong Firefox
# thì không ai nghe. Mặc định bây giờ là DRIVER (`scripts/nao-agy.mjs`): nó
# nghe `user.text` qua ws, bắn phản xạ trong ≤300 ms, rồi bơm một dòng vào agy
# đang ấm trong tmux. Boss không phải chạm terminal.
if command -v agy >/dev/null; then
  if [ "${GEN_STAGE_NAO:-driver}" = "tmux" ]; then
    # CHẾ ĐỘ CŨ — chỉ để so sánh, Sếp phải tự gõ trong tmux
    if ! tmux has-session -t gen-stage-nao 2>/dev/null; then
      tmux new-session -d -s gen-stage-nao -c "$PWD" \
        "agy --dangerously-skip-permissions --prompt-interactive \"\$(cat skills/gen-stage-nao/SKILL.md)\"; echo; echo '[não đã tắt — Enter để đóng]'; read"
      for i in $(seq 1 20); do
        sleep 1
        if tmux capture-pane -pt gen-stage-nao 2>/dev/null | grep -q "trust"; then tmux send-keys -t gen-stage-nao Enter; break; fi
      done
    fi
  else
    # WATCHDOG (Refs #37): nếu tiến trình driver chết (crash, bị kill ngoài ý
    # muốn…) thì vòng `while true` nhẹ này tự bật lại ngay, không cần Sếp chạy
    # lại chay.sh. `pkill -f "scripts/nao-agy.mjs"` (ở nhánh "tat" trên) khớp
    # CẢ dòng lệnh của vòng lặp này lẫn tiến trình node con — tắt là tắt thật,
    # không tự sống lại.
    pgrep -f "scripts/nao-agy.mjs" >/dev/null || (nohup bash -c '
      while true; do
        echo "[watchdog $(date +%T)] bật driver não — scripts/nao-agy.mjs"
        node scripts/nao-agy.mjs
        ma=$?
        echo "[watchdog $(date +%T)] driver não thoát (mã $ma) — bật lại sau 2 s"
        sleep 2
      done
    ' > "$LOG/nao.log" 2>&1 &)
  fi
fi
URL="http://localhost:5173/"
(firefox "$URL" >/dev/null 2>&1 &) || (xdg-open "$URL" >/dev/null 2>&1 &)
echo "Gen-Stage đã bật: $URL"
echo "  não: $LOG/nao.log  ·  xem agy nghĩ gì: tmux attach -t gen-stage-nao  ·  tắt: bash scripts/chay.sh tat"
