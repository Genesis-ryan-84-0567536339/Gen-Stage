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
set -u
cd "$(dirname "$0")/.."

GOC=".cache/stt"
VENV="$GOC/venv"
MODEL="$GOC/models/PhoWhisper-small-ct2"
# Bản ct2 của PhoWhisper-small (VinAI) — tải được, không cần đăng nhập.
REPO="quocphu/PhoWhisper-ct2-FasterWhisper"
THUMUC="PhoWhisper-small-ct2-fasterWhisper"
TEP="config.json model.bin preprocessor_config.json tokenizer.json vocabulary.json"

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
mkdir -p "$MODEL"
for f in $TEP; do
  [ -s "$MODEL/$f" ] && continue
  curl -fL --retry 3 --progress-bar \
    -o "$MODEL/$f" "https://huggingface.co/$REPO/resolve/main/$THUMUC/$f" || {
      rm -f "$MODEL/$f"; echo "Tải $f lỗi."; exit 1; }
done

xong && echo "STT: xong. Giữ phím V trong trình duyệt để nói." || {
  echo "STT: cài chưa đủ."; exit 1; }
