#!/usr/bin/env bash
# chay.sh — MỘT LỆNH bật tất cả: cầu nối (ws + giọng Việt + MCP + nhận giọng),
# sân khấu, não agy, rồi mở Firefox.
#
#   bash scripts/chay.sh        # bật
#   bash scripts/chay.sh tat    # tắt hết
#
# Phần CÀI (asset 46 MB + model nhận giọng ~930 MB) nằm ở `scripts/cai-dat.sh`,
# chạy một lần. Script này chỉ BẬT, nên lần thứ hai trở đi là ≤90 s.
#
# E1 (#48) việc 10 — **giết theo PID, không `fuser -k` mù.**
# Bản cũ làm `for p in 8787 8788 8789 8790 5173; do fuser -k $p/tcp; done`:
# nó giết bất cứ tiến trình nào đang giữ mấy cổng đó, kể cả thứ không phải của
# Gen-Stage (và kể cả stack riêng của người khác trên cùng máy). Giờ mỗi tiến
# trình do script này bật đều ghi PID vào `.cache/pid/<tên>.pid`, và `tat` chỉ
# giết đúng PID đó — sau khi **đối chiếu dòng lệnh** để chắc PID chưa bị hệ
# điều hành cấp lại cho tiến trình khác.
set -u
cd "$(dirname "$0")/.."
LOG=".cache/log"; PID=".cache/pid"; mkdir -p "$LOG" "$PID"

# Cổng đổi được bằng biến môi trường (bằng chứng/đợt song song chạy bộ riêng,
# không đụng bộ 8787-8790/5173 của Boss).
CONG_WS="${GEN_STAGE_PORT:-8787}"
CONG_TTS="${GEN_STAGE_TTS_PORT:-8788}"
CONG_MCP="${GEN_STAGE_MCP_PORT:-8789}"
CONG_STT="${GEN_STAGE_STT_PORT:-8790}"
CONG_WEB="${GEN_STAGE_WEB_PORT:-5173}"
TMUX_NAO="${GEN_STAGE_NAO_TMUX:-gen-stage-nao}"
export GEN_STAGE_PORT="$CONG_WS" GEN_STAGE_TTS_PORT="$CONG_TTS" \
       GEN_STAGE_MCP_PORT="$CONG_MCP" GEN_STAGE_STT_PORT="$CONG_STT" \
       GEN_STAGE_NAO_TMUX="$TMUX_NAO"

# ------------------------------------------------------------------ sổ PID
#
# `ghiPid <tên> <pid>` / `docPid <tên>` / `tatPid <tên> <chuỗi nhận dạng>`.
# Chuỗi nhận dạng là một mẩu phải có trong `/proc/<pid>/cmdline`: PID trong file
# mà dòng lệnh không khớp = tiến trình của mình đã chết và PID bị cấp lại cho
# ai đó → KHÔNG giết.
ghiPid() { echo "$2" > "$PID/$1.pid"; }
docPid() { [ -f "$PID/$1.pid" ] && cat "$PID/$1.pid" || echo ""; }
song()   { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }
khopLenh() {
  local p="$1" mau="$2"
  [ -r "/proc/$p/cmdline" ] || return 1
  tr '\0' ' ' < "/proc/$p/cmdline" | grep -qF -- "$mau"
}
# Giết cả CÂY tiến trình: watchdog là bash, node là con của nó.
tatCay() {
  local p="$1"
  for c in $(pgrep -P "$p" 2>/dev/null); do tatCay "$c"; done
  kill -TERM "$p" 2>/dev/null
}
tatPid() {
  local ten="$1" mau="$2" p; p="$(docPid "$ten")"
  if ! song "$p"; then rm -f "$PID/$ten.pid"; return 0; fi
  if ! khopLenh "$p" "$mau"; then
    echo "  bỏ qua $ten: PID $p giờ là tiến trình khác (không khớp \"$mau\")"
    rm -f "$PID/$ten.pid"; return 0
  fi
  tatCay "$p"
  for _ in 1 2 3 4 5 6 7 8 9 10; do song "$p" || break; sleep 0.2; done
  song "$p" && kill -KILL "$p" 2>/dev/null
  rm -f "$PID/$ten.pid"
  echo "  đã tắt $ten (PID $p)"
}

if [ "${1:-}" = "tat" ]; then
  echo "Đang tắt Gen-Stage…"
  tatPid nao   "scripts/nao-agy.mjs"
  tatPid vite  "vite"
  tatPid bridge "bridge/server.ts"
  tmux kill-session -t "$TMUX_NAO" 2>/dev/null && echo "  đã tắt tmux $TMUX_NAO"
  echo "Đã tắt Gen-Stage."
  exit 0
fi

# ------------------------------------------------------------------- phần cài
#
# C3 (#40): Boss từng thấy model owner CŨ sau khi merge vì chay.sh BỎ QUA
# fetch-assets.sh khi file đã tồn tại — URL đổi mà không ai gọi lại script thì
# không bao giờ tải lại. Ba script asset vẫn gọi mỗi lần (chúng tự so stamp
# `<file>.url`, không có mạng cũng chỉ mất vài trăm ms).
#
# E1 (#48): `fetch-stt.sh` thì KHÔNG gọi nữa khi đã có cờ `.cache/da-cai-dat` —
# đó là phần 930 MB, việc của `cai-dat.sh`. Chưa cài thì nhắc một câu rồi vẫn
# chạy (để `pnpm start` trên máy chưa cài không bị hỏng, chỉ chậm lần đầu).
[ -d node_modules ] || pnpm install --silent
bash scripts/fetch-assets.sh >/dev/null 2>&1
bash scripts/fetch-lab-assets.sh >/dev/null 2>&1
bash scripts/fetch-anim.sh >/dev/null 2>&1
if [ ! -f .cache/da-cai-dat ]; then
  echo "Chưa chạy scripts/cai-dat.sh — lần bật đầu sẽ tải bộ nhận giọng (~930 MB, lâu)."
  bash scripts/fetch-stt.sh
fi

# ----------------------------------------------------------------- cầu nối
#
# Còn sống thì để yên (giữ cache TTS đang ấm). Chết rồi thì bật lại và ghi PID.
pBridge="$(docPid bridge)"
if song "$pBridge" && khopLenh "$pBridge" "bridge/server.ts" \
   && curl -s -o /dev/null --max-time 3 "http://127.0.0.1:$CONG_TTS/khoe"; then
  echo "cầu nối: đang chạy (PID $pBridge)"
else
  tatPid bridge "bridge/server.ts"
  # Gọi THẲNG `tsx bridge/server.ts` (không qua `pnpm bridge`): PID ghi ra file
  # phải là tiến trình mà `khopLenh` nhận ra được, chứ không phải lớp bọc pnpm.
  nohup pnpm exec tsx bridge/server.ts > "$LOG/bridge.log" 2>&1 &
  ghiPid bridge $!
  echo "cầu nối: đã bật (PID $(docPid bridge)) · ws $CONG_WS · tts $CONG_TTS · mcp $CONG_MCP · stt $CONG_STT"
fi

# ------------------------------------------------------------------ sân khấu
pVite="$(docPid vite)"
if song "$pVite" && khopLenh "$pVite" "vite"; then
  echo "sân khấu: đang chạy (PID $pVite)"
else
  tatPid vite "vite"
  nohup pnpm exec vite --host --port "$CONG_WEB" > "$LOG/dev.log" 2>&1 &
  ghiPid vite $!
  echo "sân khấu: đã bật (PID $(docPid vite)) · cổng $CONG_WEB"
fi
URL="http://localhost:$CONG_WEB/"
for i in $(seq 1 45); do curl -s -o /dev/null --max-time 2 "$URL" && break; sleep 1; done

# ------------------------------------------------------------------- não của Gen
#
# Vòng lặp nằm ở DRIVER (`scripts/nao-agy.mjs`): nó nghe `user.text` qua ws,
# bắn phản xạ trong ≤300 ms, rồi bơm một dòng vào agy đang ấm trong tmux. Boss
# không phải chạm terminal.
#
# WATCHDOG (Refs #37): driver chết thì vòng `while true` này bật lại ngay.
# PID ghi ra file là PID của chính vòng bash — `tatCay` giết cả nó lẫn node con
# nên tắt là tắt thật, không tự sống lại.
if command -v agy >/dev/null; then
  pNao="$(docPid nao)"
  if song "$pNao" && khopLenh "$pNao" "scripts/nao-agy.mjs"; then
    echo "não: đang chạy (PID $pNao)"
  else
    tatPid nao "scripts/nao-agy.mjs"
    nohup bash -c '
      while true; do
        echo "[watchdog $(date +%T)] bật driver não — scripts/nao-agy.mjs"
        node scripts/nao-agy.mjs
        ma=$?
        echo "[watchdog $(date +%T)] driver não thoát (mã $ma) — bật lại sau 2 s"
        sleep 2
      done
    ' > "$LOG/nao.log" 2>&1 &
    ghiPid nao $!
    echo "não: đã bật (PID $(docPid nao)) · tmux $TMUX_NAO"
  fi
else
  echo "não: BỎ QUA (không thấy lệnh \`agy\` trên máy)"
fi

if [ "${GEN_STAGE_MO_TRINH_DUYET:-1}" = "1" ]; then
  (firefox "$URL" >/dev/null 2>&1 &) || (xdg-open "$URL" >/dev/null 2>&1 &)
fi
echo "Gen-Stage đã bật: $URL"
echo "  não: $LOG/nao.log  ·  xem agy nghĩ gì: tmux attach -t $TMUX_NAO  ·  tắt: bash scripts/chay.sh tat"
