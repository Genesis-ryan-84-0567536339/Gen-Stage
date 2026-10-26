#!/usr/bin/env bash
# cai-dat.sh — CÀI MỘT LẦN cho máy sạch (E1, Issue #48 việc 10).
#
#   bash scripts/cai-dat.sh
#
# Vì sao tách khỏi `chay.sh`: Boss yêu cầu "một lệnh bật tất cả, ≤90 s". Trên
# máy sạch thì không có cách nào ≤90 s — phải tải **46 MB asset + ~930 MB bộ
# nhận dạng giọng** (model PhoWhisper 483 MB + venv faster-whisper). Nên chia
# đúng hai việc:
#
#   cai-dat.sh  — chạy MỘT LẦN, tải hết phần nặng, tạo biểu tượng. Lâu bao nhiêu
#                 cũng được, Boss đi uống nước.
#   chay.sh     — chạy MỖI NGÀY, không tải gì nữa, ≤90 s.
#
# Chạy lại được bao nhiêu lần cũng không sao: mọi bước đều tự thoát khi đã đủ.
set -u
cd "$(dirname "$0")/.."
GOC="$PWD"

buoc() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

buoc "1/5 · phụ thuộc Node"
if ! command -v pnpm >/dev/null; then
  echo "THIẾU pnpm. Cài bằng:  npm i -g pnpm   (hoặc: corepack enable)"
  exit 1
fi
pnpm install

buoc "2/5 · asset 3D (VRM + Kenney CC0 + bộ chuyển động)"
bash scripts/fetch-assets.sh
bash scripts/fetch-lab-assets.sh
bash scripts/fetch-anim.sh

buoc "3/5 · nhận dạng giọng Việt (nặng — model ~483 MB)"
bash scripts/fetch-stt.sh

buoc "4/5 · biểu tượng trên máy"
DICH="$HOME/.local/share/applications"
mkdir -p "$DICH"
if [ -f gen-stage.desktop ]; then
  # Thay @GOC@ bằng đường dẫn thật của repo này. Dùng `|` làm dấu phân cách để
  # đường dẫn có dấu `/` (và khoảng trắng như "Games 3d") không phá lệnh sed.
  sed "s|@GOC@|$GOC|g" gen-stage.desktop > "$DICH/gen-stage.desktop"
  chmod +x "$DICH/gen-stage.desktop"
  command -v update-desktop-database >/dev/null && update-desktop-database "$DICH" 2>/dev/null
  echo "Đã tạo $DICH/gen-stage.desktop → tìm \"Gen-Stage\" trong danh sách ứng dụng."
else
  echo "Không thấy gen-stage.desktop trong repo — bỏ qua biểu tượng."
fi

buoc "5/5 · kiểm nhanh"
node -e 'process.exit(0)' && echo "node OK"
[ -d public/models ] && echo "asset OK" || echo "CHÚ Ý: chưa thấy public/models"
[ -f .cache/stt/models/PhoWhisper-small-ct2/model.bin ] && echo "STT OK" || echo "CHÚ Ý: chưa có model STT"

# Cờ này là lời hứa với `chay.sh`: phần nặng đã cài xong, lần sau khỏi dò lại.
mkdir -p .cache && date -Is > .cache/da-cai-dat

printf '\n\033[1mXong.\033[0m Bật bằng:  pnpm start   (hoặc bấm biểu tượng Gen-Stage)\n'
