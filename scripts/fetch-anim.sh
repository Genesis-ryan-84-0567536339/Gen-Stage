#!/usr/bin/env bash
# fetch-anim.sh — A2: tìm/tải nguồn chuyển động thật CC0 để retarget sang VRM.
#
# KẾT LUẬN (ghi rõ theo yêu cầu "bí 3–4 lần → ghi, đi tiếp"): bộ CLIP V0.1
# dùng trong Gen-Stage (`src/stage/nhanvat.ts`, `src/behavior/emotes.ts`) vẫn
# là THỦ TỤC (procedural), không phải file chuyển động thật retarget. Lý do:
#
# 1. Quaternius "Universal Animation Library" — đúng nguồn Boss chỉ định,
#    CC0 — nhưng itch.io chặn tải bằng curl/script (Cloudflare "challenge",
#    xem thử: `curl -I https://quaternius.itch.io/universal-animation-library`
#    → HTTP qua `cf-mitigated: challenge`, cần trình duyệt thật + JS).
# 2. Mirror GitHub giấy phép CC0 rõ ràng CÓ tồn tại và tải được bằng script:
#      https://github.com/J-Ponzo/gltf-universal-animation-library
#    (bản FREE, .gltf, CC0 1.0 — xem LICENSE trong repo đó). Đã tải thử và
#    đọc 46 animation clip trong file glTF (`Idle_Loop`, `Walk_Loop`,
#    `Jog_Fwd_Loop`, `Sitting_Enter/Idle_Loop/Exit`, `Sitting_Talking_Loop`,
#    `Idle_Talking_Loop`, `Dance_Loop`, `Interact`, `Punch_*`, `Sword_*`,
#    `Pistol_*`, `Spell_*`, `Swim_*`, `Roll`, `Jump_*`…).
# 3. VẤN ĐỀ: bộ 46 clip đó nhắm action/RPG (chiến đấu, bắn, phép thuật, bơi),
#    KHÔNG có wave/clap/nod/shake/think/point/celebrate/type/sleep — 9/13 clip
#    trong spec (mục 2) không có nguồn thật tương ứng trong chính thư viện
#    Boss chỉ định. Chỉ `idle`, `walk`, `sit`/`stand` là khớp tên.
# 4. Dù khớp tên, retarget đúng còn cần: (a) ánh xạ ~50 tên xương Quaternius
#    → tên xương chuẩn VRM humanoid, (b) bù lệch tư thế gốc (rest-pose offset)
#    giữa rig nguồn và `vrm.humanoid` normalized bones — làm sai bước này thì
#    khớp bị vặn/gãy (xấu hơn thủ tục, phá chính tiêu chí "nhìn SỐNG"). Trong
#    thời lượng A2 không đủ để làm VÀ tự kiểm bằng mắt cho an toàn từng xương
#    một cho cả 4 clip khớp tên, nên A2 CHƯA bật.
#
# QUYẾT ĐỊNH: toàn bộ 13 clip + 15 emote của A2 là procedural, làm KỸ hơn A1
# (xem `apDungEmote` trong `nhanvat.ts`): lớp hành vi nhỏ luôn chạy (thở, đổi
# chân, nhìn quanh, chớp mắt, gật/cử chỉ khi nói) + mỗi emote một dáng riêng.
#
# ĐỂ ĐỢT SAU (A3 hoặc đợt B) BẬT THẬT: file mirror CC0 tải được ở trên dùng
# được cho `idle`/`walk`/`sit`/`stand` nếu ai đó làm kỹ bước (a)+(b); script
# này tải sẵn file glTF về `.asset-tmp/` để người làm sau không phải tìm lại
# nguồn — KHÔNG tự động retarget (chưa có, xem mục 4).
#
# Dùng: bash scripts/fetch-anim.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$ROOT/.asset-tmp/anim"
mkdir -p "$TMP"

MIRROR_REPO="https://github.com/J-Ponzo/gltf-universal-animation-library.git"
OUT="$TMP/gltf-universal-animation-library"

say() { printf '\n==> %s\n' "$*"; }

say "Tải mirror CC0 của Quaternius Universal Animation Library (chỉ tham khảo — A2 CHƯA dùng)"
if [ -d "$OUT/.git" ]; then
  echo "    đã có $OUT, bỏ qua (xoá thư mục nếu muốn tải lại)"
else
  if git clone --depth 1 "$MIRROR_REPO" "$OUT" 2>/dev/null; then
    echo "    xong: $OUT"
    find "$OUT/glTF" -maxdepth 1 -type f 2>/dev/null
  else
    echo "    !! Không clone được (mạng chặn hoặc repo đổi chỗ)."
    echo "       Thử tay: git clone $MIRROR_REPO"
  fi
fi

say "Giấy phép"
echo "    CC0 1.0 Universal — xem $OUT/LICENSE sau khi tải."
echo "    Ghi vào assets/LICENSES.md mục 3 khi có ai bật retarget thật."

say "Kết luận"
echo "    A2 dùng chuyển động THỦ TỤC (procedural) cho toàn bộ 13 clip + 15 emote."
echo "    Xem phần chú thích đầu file này để biết lý do và việc còn lại."
