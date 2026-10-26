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
KENNEY_STAMP="$PUB/kenney/.url"

say() { printf '\n==> %s\n' "$*"; }

# C3 (#40) — Boss: fetch-assets.sh bỏ qua owner.vrm CŨ (Biz Dude 2,2 MB) vì
# file đã tồn tại, nên sau khi đổi URL (C0) Boss vẫn thấy model cũ dù đã merge.
# Nay mỗi file tải ghi kèm `<file>.url` = URL vừa tải. Lần sau script so URL
# trong biến với URL trong stamp: khác nhau (hoặc thiếu stamp vì file có từ
# trước cơ chế này) → coi như chưa có, tải lại. Giống nhau → bỏ qua thật.
#
# Dùng: taiFileCoStamp <url> <out> <nhan>
taiFileCoStamp() {
  local url="$1" out="$2" nhan="$3" stamp="$2.url"
  if [ -s "$out" ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$url" ]; then
    echo "    đã có $out (đúng URL), bỏ qua"
    return 0
  fi
  if [ -s "$out" ]; then
    echo "    $out đã có nhưng URL khác stamp cũ (hoặc chưa có stamp) — tải lại"
  fi
  local ok=0
  for i in 1 2 3; do
    echo "    lần thử $i: $url"
    if curl -fL --retry 2 --connect-timeout 20 -o "$out.part" "$url"; then
      mv "$out.part" "$out"; echo -n "$url" > "$stamp"; ok=1; break
    fi
    sleep 2
  done
  if [ "$ok" -ne 1 ]; then
    rm -f "$out.part"
    echo "    !! Không tải được $nhan. Tải tay rồi lưu thành: $out"
    return 1
  fi
  return 0
}

# --- 1. Nhân vật VRM (VRoid AvatarSample_B, CC0-ish / VRoid Hub sample license) ---
say "Tải nhân vật VRM"
taiFileCoStamp "$VRM_URL" "$VRM_OUT" "VRM" || \
  echo "       Nguồn dự phòng: https://hub.vroid.com/en/characters (sample), hoặc repo pixiv/three-vrm"

# --- 1b. Nhân vật NAM anime cho owner (CC0, VRoid HairSample_Male) ---
say "Tải nhân vật NAM anime cho owner (VRoid HairSample_Male, CC0)"
taiFileCoStamp "$OWNER_URL" "$OWNER_OUT" "VRM nam" || {
  echo "       App sẽ tự dùng tạm models/avatar.vrm cho owner."
  echo "       Nguồn: https://github.com/madjin/vrm-samples (vroid/beta/HairSample_Male.vrm)"
}

# --- 2. Nội thất Kenney Furniture Kit (CC0) ---
say "Tải nội thất Kenney Furniture Kit (CC0)"
if [ -n "$(ls -A "$PUB/kenney" 2>/dev/null)" ] && [ -f "$KENNEY_STAMP" ] && [ "$(cat "$KENNEY_STAMP")" = "$KENNEY_URL" ]; then
  echo "    đã có model trong $PUB/kenney (đúng URL), bỏ qua"
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
    rm -f "$PUB/kenney"/*.glb
    # Lấy đúng thư mục GLB (GLTF format), đổ phẳng vào public/kenney/
    find "$TMP/kenney_unzip" -type f -name '*.glb' -exec cp -f {} "$PUB/kenney/" \;
    cp -f "$TMP/kenney_unzip/License.txt" "$PUB/kenney/License.txt" 2>/dev/null || true
    echo -n "$KENNEY_URL" > "$KENNEY_STAMP"
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
