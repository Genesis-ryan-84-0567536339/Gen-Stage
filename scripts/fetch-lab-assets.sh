#!/usr/bin/env bash
# Tải asset CC0 cho lab viễn tưởng A3 (KHÔNG commit file nặng vào git).
# Dùng: bash scripts/fetch-lab-assets.sh   (hoặc: pnpm assets:lab)
# Không tải được (mất mạng, link đổi) thì cảnh vẫn chạy — world.ts/phong.ts
# tự dựng mọi vật bằng geometry + vật liệu emissive khi không thấy .glb nào
# trong public/kenney-sci-fi/. Nguồn + giấy phép: xem assets/LICENSES.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUB="$ROOT/public/kenney-sci-fi"
TMP="$ROOT/.asset-tmp-lab"
mkdir -p "$PUB" "$TMP"

# Kenney "Space Kit" — CC0, cùng nhà với Furniture Kit đã dùng ở A1.
SPACE_URL="https://kenney.nl/media/pages/assets/space-kit/20874c75ac-1677698978/kenney_space-kit.zip"
SPACE_ZIP="$TMP/kenney_space-kit.zip"

say() { printf '\n==> %s\n' "$*"; }

say "Tải Kenney Space Kit (CC0) cho lab viễn tưởng"
if [ -n "$(ls -A "$PUB" 2>/dev/null)" ]; then
  echo "    đã có model trong $PUB, bỏ qua"
else
  ok=0
  for i in 1 2 3; do
    echo "    lần thử $i: $SPACE_URL"
    if curl -fL --retry 2 --connect-timeout 20 -o "$SPACE_ZIP" "$SPACE_URL"; then ok=1; break; fi
    sleep 2
  done
  if [ "$ok" -eq 1 ]; then
    rm -rf "$TMP/unzip"; mkdir -p "$TMP/unzip"
    unzip -q -o "$SPACE_ZIP" -d "$TMP/unzip"
    find "$TMP/unzip" -type f -name '*.glb' -exec cp -f {} "$PUB/" \;
    cp -f "$TMP/unzip/License.txt" "$PUB/License.txt" 2>/dev/null || true
    echo "    xong: $(ls -1 "$PUB"/*.glb 2>/dev/null | wc -l) file .glb"
  else
    echo "    !! Không tải được Space Kit sau 3 lần thử."
    echo "       Lab vẫn chạy: phong.ts tự dựng bàn điều khiển cong, bệ trung tâm,"
    echo "       kệ module, cột kính bằng RoundedBoxGeometry + vật liệu emissive."
  fi
fi

say "Dọn tạm"
rm -rf "$TMP"

say "Kết quả"
echo "public/kenney-sci-fi: $(ls -1 "$PUB"/*.glb 2>/dev/null | wc -l) file .glb"
echo
echo "Xong. Chạy: pnpm dev"
