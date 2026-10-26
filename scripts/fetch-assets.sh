#!/usr/bin/env bash
# Tải asset miễn phí cho demo Gen-Stage (KHÔNG commit file nặng vào git).
# Dùng: bash scripts/fetch-assets.sh   (hoặc: pnpm assets)
# Nguồn + giấy phép: xem assets/LICENSES.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUB="$ROOT/public"
TMP="$ROOT/.asset-tmp"
mkdir -p "$PUB/models" "$PUB/kenney" "$TMP"

VRM_URL="https://raw.githubusercontent.com/pixiv/ChatVRM/main/public/AvatarSample_B.vrm"
VRM_OUT="$PUB/models/avatar.vrm"

# Nhân vật NAM cho `owner` (C0, Issue #28 — THAY "Biz Dude" low-poly của B1):
# VRoid **HairSample_Male** — nam, phong cách anime, CÙNG GU với `gen`
# (AvatarSample_B cũng là VRoid). Giấy phép **CC0** ghi ở HAI nơi độc lập:
#   1. metadata trong chính file VRM (`licenseName: "CC0"`, allowedUser: Everyone,
#      commercialUssage: Allow),
#   2. trang điều khoản chính thức của VRoid liệt kê ĐÍCH DANH tên này trong
#      mục "CC0 license models" (vroid.pixiv.help, bài 4402614652569).
# Vì là CC0 nên mirror (`madjin/vrm-samples`) không cần có file LICENSE riêng —
# đây đúng là lý do B1 từng phải loại `AvatarSample_A` (bản đó KHÔNG CC0).
OWNER_URL="https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/HairSample_Male.vrm"
OWNER_OUT="$PUB/models/owner.vrm"

KENNEY_URL="https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip"
KENNEY_ZIP="$TMP/kenney_furniture-kit.zip"

say() { printf '\n==> %s\n' "$*"; }

# --- 1. Nhân vật VRM (VRoid AvatarSample_B, CC0-ish / VRoid Hub sample license) ---
say "Tải nhân vật VRM"
if [ -s "$VRM_OUT" ]; then
  echo "    đã có $VRM_OUT, bỏ qua"
else
  ok=0
  for i in 1 2 3; do
    echo "    lần thử $i: $VRM_URL"
    if curl -fL --retry 2 --connect-timeout 20 -o "$VRM_OUT.part" "$VRM_URL"; then
      mv "$VRM_OUT.part" "$VRM_OUT"; ok=1; break
    fi
    sleep 2
  done
  if [ "$ok" -ne 1 ]; then
    rm -f "$VRM_OUT.part"
    echo "    !! Không tải được VRM. Tải tay 1 file VRM miễn phí rồi lưu thành:"
    echo "       $VRM_OUT"
    echo "       Nguồn dự phòng: https://hub.vroid.com/en/characters (sample), hoặc repo pixiv/three-vrm"
  fi
fi

# --- 1b. Nhân vật NAM anime cho owner (CC0, VRoid HairSample_Male) ---
say "Tải nhân vật NAM anime cho owner (VRoid HairSample_Male, CC0)"
if [ -s "$OWNER_OUT" ]; then
  echo "    đã có $OWNER_OUT, bỏ qua"
else
  ok=0
  for i in 1 2 3; do
    echo "    lần thử $i: $OWNER_URL"
    if curl -fL --retry 2 --connect-timeout 20 -o "$OWNER_OUT.part" "$OWNER_URL"; then
      mv "$OWNER_OUT.part" "$OWNER_OUT"; ok=1; break
    fi
    sleep 2
  done
  if [ "$ok" -ne 1 ]; then
    rm -f "$OWNER_OUT.part"
    echo "    !! Không tải được VRM nam. App sẽ tự dùng tạm models/avatar.vrm cho owner."
    echo "       Tải tay một VRM nam CC0 rồi lưu thành: $OWNER_OUT"
    echo "       Nguồn: https://github.com/madjin/vrm-samples (vroid/beta/HairSample_Male.vrm)"
  fi
fi

# --- 2. Nội thất Kenney Furniture Kit (CC0) ---
say "Tải nội thất Kenney Furniture Kit (CC0)"
if [ -n "$(ls -A "$PUB/kenney" 2>/dev/null)" ]; then
  echo "    đã có model trong $PUB/kenney, bỏ qua"
else
  ok=0
  for i in 1 2 3; do
    echo "    lần thử $i: $KENNEY_URL"
    if curl -fL --retry 2 --connect-timeout 20 -o "$KENNEY_ZIP" "$KENNEY_URL"; then ok=1; break; fi
    sleep 2
  done
  if [ "$ok" -eq 1 ]; then
    rm -rf "$TMP/kenney_unzip"; mkdir -p "$TMP/kenney_unzip"
    unzip -q -o "$KENNEY_ZIP" -d "$TMP/kenney_unzip"
    # Lấy đúng thư mục GLB (GLTF format), đổ phẳng vào public/kenney/
    find "$TMP/kenney_unzip" -type f -name '*.glb' -exec cp -f {} "$PUB/kenney/" \;
    cp -f "$TMP/kenney_unzip/License.txt" "$PUB/kenney/License.txt" 2>/dev/null || true
    echo "    xong: $(ls -1 "$PUB/kenney"/*.glb 2>/dev/null | wc -l) file .glb"
  else
    echo "    !! Không tải được Kenney sau 3 lần thử."
    echo "       Demo sẽ tự dựng bàn/ghế/màn hình bằng RoundedBoxGeometry màu pastel (fallback trong src/main.ts)."
  fi
fi

say "Dọn tạm"
rm -rf "$TMP"

say "Kết quả"
ls -la "$PUB/models" 2>/dev/null || true
echo "public/kenney: $(ls -1 "$PUB/kenney"/*.glb 2>/dev/null | wc -l) file .glb"
echo
echo "Xong. Chạy: pnpm dev"
