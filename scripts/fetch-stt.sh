#!/usr/bin/env bash
# fetch-stt.sh — CÀI MỘT LẦN bộ nhận dạng giọng Việt (C1, Issue #31).
#
#   bash scripts/fetch-stt.sh
#
# Lập `.cache/stt/venv` (python + faster-whisper) và tải model PhoWhisper-small
# bản CTranslate2 vào `.cache/stt/models/PhoWhisper-small-ct2/`. Cả hai nằm
# trong `.gitignore` — KHÔNG commit model (465 MB).
#
# Chạy lại thì không tải lại: có đủ thì thoát ngay, nên `scripts/chay.sh` gọi
# mỗi lần bật cũng không tốn gì.
#
# Vì sao PhoWhisper-small chứ không whisper.cpp / Vosk: số đo thật trên máy
# Boss ở `docs/c1/so-sanh.md`.
#
# ---
#
# G3 (#62) — TẢI THÊM MODEL LỚN để ĐO, không phải để chạy mặc định:
#
#   bash scripts/fetch-stt.sh medium   # PhoWhisper-medium ct2 (~1,5 GB)
#   bash scripts/fetch-stt.sh large    # PhoWhisper-large  ct2 (~3,1 GB)
#   bash scripts/fetch-stt.sh turbo    # whisper large-v3-turbo ct2 (~1,6 GB)
#   bash scripts/fetch-stt.sh bo-do    # cả ba, cho bàn đo `do-stt.mjs chay`
#
# Không tải sẵn trong `cai-dat.sh`: Boss chỉ cần MỘT model để nói, ba model
# kia là của bàn đo một lần (`docs/g3/ket-qua.md`). Xoá bớt được bằng
# `rm -rf .cache/stt/models/<tên>` mà sân khấu vẫn chạy.
set -u
cd "$(dirname "$0")/.."

GOC=".cache/stt"
VENV="$GOC/venv"
MODEL="$GOC/models/PhoWhisper-small-ct2"
# Bản ct2 của PhoWhisper-small (VinAI) — tải được, không cần đăng nhập.
REPO="quocphu/PhoWhisper-ct2-FasterWhisper"
THUMUC="PhoWhisper-small-ct2-fasterWhisper"
TEP="config.json model.bin preprocessor_config.json tokenizer.json vocabulary.json"

# Tải một model ct2 bất kỳ: taiModel <thư mục đích> <repo HF> <thư mục trong repo|.>
taiModel() {
  local dich="$1" repo="$2" trong="$3" f duong
  mkdir -p "$dich"
  for f in $TEP; do
    [ -s "$dich/$f" ] && continue
    if [ "$trong" = "." ]; then duong="$f"; else duong="$trong/$f"; fi
    echo "   · $f"
    curl -fL --retry 3 --progress-bar \
      -o "$dich/$f" "https://huggingface.co/$repo/resolve/main/$duong" || {
        rm -f "$dich/$f"; echo "Tải $f lỗi."; return 1; }
  done
  [ -s "$dich/model.bin" ]
}

# `bash scripts/fetch-stt.sh <tên model>` — cần venv đã có (chạy không tham số trước).
case "${1:-}" in
  medium|large|turbo|bo-do)
    [ -x "$VENV/bin/python" ] || { echo "Chạy 'bash scripts/fetch-stt.sh' trước (cần venv)."; exit 1; }
    ok=0
    for m in $([ "$1" = "bo-do" ] && echo "medium large turbo" || echo "$1"); do
      case "$m" in
        medium) d="$GOC/models/PhoWhisper-medium-ct2"; r="$REPO"; t="PhoWhisper-medium-ct2-fasterWhisper";;
        large)  d="$GOC/models/PhoWhisper-large-ct2";  r="$REPO"; t="PhoWhisper-large-ct2-fasterWhisper";;
        # large-v3-turbo: bản ct2 float16 công khai; thợ nạp với compute_type=int8
        # thì ctranslate2 tự lượng tử hoá lúc nạp, không cần convert tay.
        turbo)  d="$GOC/models/whisper-large-v3-turbo-ct2"; r="deepdml/faster-whisper-large-v3-turbo-ct2"; t=".";;
      esac
      if [ -s "$d/model.bin" ]; then echo "STT: $m đã có ($d)."; continue; fi
      echo "STT: tải $m → $d"
      taiModel "$d" "$r" "$t" || ok=1
    done
    exit $ok;;
esac

xong() { [ -x "$VENV/bin/python" ] && [ -f "$MODEL/model.bin" ]; }
if xong; then
  echo "STT: đã cài sẵn ($MODEL) — không tải lại."
  exit 0
fi

# ffmpeg: bridge dùng để đưa audio trình duyệt về 16 kHz mono.
command -v ffmpeg >/dev/null || {
  echo "THIẾU ffmpeg. Fedora: sudo dnf install -y ffmpeg-free"; exit 1; }

# Python: faster-whisper/ctranslate2 chưa có bánh xe cho 3.14 (máy Boss), nên
# ưu tiên 3.12 → 3.11 → 3.10 rồi mới tới python3 mặc định.
PY=""
for c in python3.12 python3.11 python3.10 python3; do
  command -v "$c" >/dev/null && { PY="$c"; break; }
done
[ -n "$PY" ] || { echo "THIẾU python3. Fedora: sudo dnf install -y python3.12"; exit 1; }

echo "STT 1/3 — lập venv bằng $PY…"
[ -x "$VENV/bin/python" ] || "$PY" -m venv "$VENV" || {
  echo "Không lập được venv. Fedora: sudo dnf install -y ${PY}-devel"; exit 1; }

echo "STT 2/3 — cài faster-whisper (CPU, không CUDA)…"
"$VENV/bin/pip" install -q --upgrade pip >/dev/null 2>&1
"$VENV/bin/pip" install -q faster-whisper || { echo "pip lỗi — xem lại mạng."; exit 1; }
"$VENV/bin/python" -c "import faster_whisper" || {
  echo "faster-whisper cài rồi mà không nạp được (python quá mới?). Thử: sudo dnf install -y python3.12"
  exit 1; }

echo "STT 3/3 — tải PhoWhisper-small ct2 (~465 MB, một lần)…"
taiModel "$MODEL" "$REPO" "$THUMUC" || exit 1

xong && echo "STT: xong. Giữ phím V trong trình duyệt để nói." || {
  echo "STT: cài chưa đủ."; exit 1; }
