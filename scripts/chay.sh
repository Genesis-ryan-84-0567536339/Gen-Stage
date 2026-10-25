#!/usr/bin/env bash
# Gen-Stage — MỘT LỆNH bật tất cả: cầu nối (ws + giọng Việt + MCP), sân khấu, não agy, rồi mở Firefox.
# Dùng:  bash scripts/chay.sh          # bật
#        bash scripts/chay.sh tat      # tắt hết
set -u
cd "$(dirname "$0")/.."
LOG=".cache/log"; mkdir -p "$LOG"
if [ "${1:-}" = "tat" ]; then
  tmux kill-session -t gen-stage-nao 2>/dev/null
  for p in 8787 8788 8789 5173; do fuser -k ${p}/tcp >/dev/null 2>&1; done
  echo "Đã tắt Gen-Stage."; exit 0
fi
[ -d node_modules ] || pnpm install --silent
[ -f public/models/avatar.vrm ] || bash scripts/fetch-assets.sh >/dev/null 2>&1
[ -d public/kenney-sci-fi ] || bash scripts/fetch-lab-assets.sh >/dev/null 2>&1
[ -d public/anim ] && [ "$(ls public/anim | wc -l)" -gt 0 ] || bash scripts/fetch-anim.sh >/dev/null 2>&1
# bridge: nếu cổng đã có tiến trình cũ (kể cả bản chạy ngoài script) thì giải phóng rồi bật lại cho sạch
if ! curl -s -o /dev/null "http://127.0.0.1:8788/tts?text=a&voice=nu"; then
  for p in 8787 8788 8789; do fuser -k ${p}/tcp >/dev/null 2>&1; done; sleep 1
  (nohup pnpm bridge > "$LOG/bridge.log" 2>&1 &)
fi
pgrep -f "vite --host --port 5173" >/dev/null || (nohup pnpm exec vite --host --port 5173 > "$LOG/dev.log" 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:5173/ && break; sleep 1; done
# Não agy chạy trong tmux (cần terminal tương tác). Boss xem não nghĩ gì: tmux attach -t gen-stage-nao
if command -v agy >/dev/null && ! tmux has-session -t gen-stage-nao 2>/dev/null; then
  tmux new-session -d -s gen-stage-nao -c "$PWD" \
    "agy --dangerously-skip-permissions --prompt-interactive \"\$(cat skills/gen-stage-nao/SKILL.md)\"; echo; echo '[não đã tắt — Enter để đóng]'; read"
  # agy hỏi "Do you trust this folder?" lần đầu → tự chọn Yes (đang được tô sẵn)
  for i in $(seq 1 20); do
    sleep 1
    if tmux capture-pane -pt gen-stage-nao 2>/dev/null | grep -q "trust"; then tmux send-keys -t gen-stage-nao Enter; break; fi
  done
fi
URL="http://localhost:5173/"
(firefox "$URL" >/dev/null 2>&1 &) || (xdg-open "$URL" >/dev/null 2>&1 &)
echo "Gen-Stage đã bật: $URL  · não agy: tmux attach -t gen-stage-nao  · tắt: bash scripts/chay.sh tat"
