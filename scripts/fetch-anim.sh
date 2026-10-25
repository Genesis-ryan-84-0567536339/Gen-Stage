#!/usr/bin/env bash
# fetch-anim.sh — A2 vòng 2: tải bộ chuyển động **thật** CC0 về `public/anim/`.
#
# Nguồn: Quaternius "Universal Animation Library" (CC0 1.0), lấy qua mirror
# GitHub tải được bằng script (itch.io chặn curl bằng Cloudflare challenge):
#   https://github.com/J-Ponzo/gltf-universal-animation-library
# 46 clip, bộ xương Rigify (`DEF-*`), có sẵn clip `A_TPose` làm **tư thế gốc**
# — nhờ đó retarget sang `vrm.humanoid` tính được chính xác (xem
# `src/behavior/chuyen-dong.ts`: delta = worldQ(anim) · worldQ(A_TPose)⁻¹).
#
# Đã kiểm hướng trục của rig nguồn (script phân tích offline, 25/10): bàn tay
# TRÁI ở +X, ngón chân hướng +Z → **cùng quy ước với VRM 1.0** (trái = +X,
# mặt hướng +Z) nên KHÔNG phải quay 180° quanh Y. Model VRM 0.x thì
# `VRMUtils.rotateVRM0()` (đã gọi trong `nhanvat.ts`) lo việc quay 180° trước,
# sau đó bộ xương normalized về đúng quy ước VRM 1.0 — retarget dùng chung.
#
# Clip nào spec cần mà thư viện KHÔNG có (wave, clap, nod, shake, think,
# point, sleep, type…) thì lấy clip gần nhất làm nền + một lớp cử chỉ thủ tục
# nhỏ chồng lên (`src/behavior/cu-chi.ts`) — bảng ghép ghi trong
# `src/behavior/chuyen-dong.ts` (`NGUON`) và `assets/LICENSES.md` mục 3.
#
# Dùng: bash scripts/fetch-anim.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$ROOT/.asset-tmp/anim"
OUT="$ROOT/public/anim"
REPO="https://github.com/J-Ponzo/gltf-universal-animation-library.git"
SRC="$TMP/gltf-universal-animation-library"

say() { printf '\n==> %s\n' "$*"; }

mkdir -p "$TMP" "$OUT"

say "Tải Quaternius Universal Animation Library (CC0) — mirror GitHub"
if [ -d "$SRC/.git" ]; then
  echo "    đã có $SRC, bỏ qua clone (xoá thư mục nếu muốn tải lại)"
else
  git clone --depth 1 "$REPO" "$SRC"
fi

say "Chép bộ clip vào public/anim/ (gitignore — không commit asset)"
cp -f "$SRC/glTF/AnimationLibrary_Godot_Standard.gltf" "$OUT/thu-vien.gltf"
cp -f "$SRC/glTF/AnimationLibrary_Godot_Standard.bin" "$OUT/AnimationLibrary_Godot_Standard.bin"
cp -f "$SRC/LICENSE" "$OUT/LICENSE-CC0.txt"
ls -la "$OUT"

say "Xong"
echo "    46 clip CC0 đã có ở public/anim/thu-vien.gltf"
echo "    App tự nạp lúc spawn nhân vật; thiếu file thì rơi về chuyển động thủ tục."
echo "    Giấy phép: CC0 1.0 Universal — xem $OUT/LICENSE-CC0.txt và assets/LICENSES.md"
