# Nguồn & giấy phép asset (Gen-Stage — demo đợt 0)

Toàn bộ asset **không commit vào git** (xem `.gitignore`). Tải lại bằng:

```bash
bash scripts/fetch-assets.sh   # hoặc: pnpm assets
```

---

## 1. Nhân vật — `AvatarSample_B.vrm` → `public/models/avatar.vrm`

| Mục | Nội dung |
| --- | --- |
| Nguồn tải | `https://raw.githubusercontent.com/pixiv/ChatVRM/main/public/AvatarSample_B.vrm` (repo `pixiv/ChatVRM`) |
| Tác giả | VRoid Project |
| Bản quyền | pixiv Inc. |
| Định dạng | VRM 1.0 (`VRMC_vrm` 1.0 + `VRMC_springBone`), ~21 MB |
| Giấy phép | VRM License 1.0 — https://vrm.dev/licenses/1.0/ |
| Điều khoản gốc | https://vroid.pixiv.help/hc/ja/articles/4402394424089-AvatarSample-A-B-C |

Quyền ghi trong metadata của chính file VRM (đọc trực tiếp từ file):

- `avatarPermission`: `everyone` — ai cũng được dùng
- `commercialUsage`: `corporation` — cho phép dùng thương mại (kể cả doanh nghiệp)
- `allowRedistribution`: `true` — cho phép phân phối lại
- `modification`: `allowModificationRedistribution` — cho phép sửa và phân phối bản sửa
- `creditNotation`: `unnecessary` — không bắt buộc ghi credit
- `allowAntisocialOrHateUsage`: `false` — **cấm** dùng cho nội dung phản xã hội / thù hận

## 2. Nội thất — Kenney "Furniture Kit" → `public/kenney/*.glb`

| Mục | Nội dung |
| --- | --- |
| Trang gốc | https://kenney.nl/assets/furniture-kit |
| Link zip trực tiếp | `https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip` (~4.9 MB) |
| Tác giả | Kenney (kenney.nl) |
| Giấy phép | **CC0 1.0 Universal** (public domain) — không bắt buộc ghi credit, dùng thương mại tự do |
| Dùng gì | 140 file `.glb` trong `Models/GLTF format/`; demo dùng: `desk`, `chairDesk`, `computerScreen`, `computerKeyboard`, `computerMouse`, `pottedPlant`, `plantSmall1/2/3`, `bookcaseOpen`, `rugRounded`, `lampRoundFloor`, `cabinetTelevisionDrawer`, `loungeSofa` |

File `License.txt` gốc của Kenney được copy sang `public/kenney/License.txt` khi tải.

## 2b. Lab viễn tưởng (A3) — Kenney "Space Kit" → `public/kenney-sci-fi/*.glb`

| Mục | Nội dung |
| --- | --- |
| Trang gốc | https://kenney.nl/assets/space-kit |
| Link zip trực tiếp | `https://kenney.nl/media/pages/assets/space-kit/20874c75ac-1677698978/kenney_space-kit.zip` (~6.4 MB) |
| Tải bằng | `bash scripts/fetch-lab-assets.sh` (hoặc `pnpm assets:lab`) |
| Tác giả | Kenney (kenney.nl) |
| Giấy phép | **CC0 1.0 Universal** (public domain) |
| Dùng gì | `desk_computerCorner` (bàn điều khiển cong), `desk_chairStool`/`desk_chair` (ghế), `platform_center`/`platform_large` (bệ trung tâm), `pipe_supportHigh`/`pipe_ringHigh` (cột kính/ống phát sáng), `structure`/`structure_closed` (kệ module), `rock_crystals*` (tinh thể trang trí), `gate_simple` (khung cửa) |

File `License.txt` gốc của Kenney được copy sang `public/kenney-sci-fi/License.txt` khi tải.
Không tải được thì `src/stage/phong.ts` tự dựng toàn bộ bằng `RoundedBoxGeometry` + vật liệu
emissive (cyan/cam), không bịa asset.

## 3. Chuyển động — Quaternius "Universal Animation Library" → `public/anim/`

**Đã dùng thật từ A2 vòng 2.** Tải bằng `bash scripts/fetch-anim.sh`, không commit (gitignore).

| Mục | Nội dung |
| --- | --- |
| Trang gốc | https://quaternius.com — "Universal Animation Library" (bản FREE) |
| Nguồn tải bằng script | `https://github.com/J-Ponzo/gltf-universal-animation-library` (mirror glTF; itch.io chặn curl bằng Cloudflare challenge) |
| Tác giả | Quaternius |
| Giấy phép | **CC0 1.0 Universal** (public domain) — bản `LICENSE` trong repo mirror, chép sang `public/anim/LICENSE-CC0.txt` khi tải |
| Định dạng | `.gltf` + `.bin` (~4 MB), 46 animation clip, bộ xương Rigify (`DEF-*`) |
| Dùng gì | 12 clip làm **dáng nền**: `Idle_Loop`, `Walk_Loop`, `Sitting_Enter`, `Sitting_Exit`, `Sitting_Idle_Loop`, `Idle_Talking_Loop`, `Sitting_Talking_Loop`, `Dance_Loop`, `Driving_Loop`, `Punch_Cross`, `Crouch_Idle_Loop`, `Hit_Chest` (+ `A_TPose` làm tư thế gốc để retarget) |

Retarget sang `vrm.humanoid` làm trong `src/behavior/chuyen-dong.ts` (giải thích
cách tính ở đầu file), phát bằng `THREE.AnimationMixer`, crossfade 0,25 s.

### 3b. Clip spec nào KHÔNG có trong bộ CC0

Bộ 46 clip của Quaternius là action/RPG nên **không có** `wave`, `clap`, `nod`,
`shake`, `think`, `point`, `sleep`, `type`, và các cử chỉ emote kiểu che miệng /
gãi đầu / chống cằm / giơ ngón cái. Những cái đó = **clip gần nhất làm nền +
lớp cử chỉ thủ tục nhỏ** (`src/behavior/cu-chi.ts`), bảng ghép đầy đủ ghi trong
`NEN_CLIP` / `NEN_EMOTE` (`src/behavior/chuyen-dong.ts`). Ví dụ: `wave` = nền
`Idle_Talking_Loop` + tay vẫy thủ tục; `that-bai` = nền `Crouch_Idle_Loop`
(ngồi thụp thật) + ôm đầu thủ tục.

Không có file `.vrma` nào được dùng.

## 4. Thư viện

| Thư viện | Phiên bản | Giấy phép |
| --- | --- | --- |
| `three` | 0.186.1 | MIT |
| `@pixiv/three-vrm` | 3.5.5 (peer `three >= 0.137`) | MIT |
| `vite` | 8.x | MIT |

Sàn gỗ, tường pastel, cửa sổ phát sáng, bầu trời: tự sinh bằng code (canvas texture + vật liệu), không dùng asset ngoài.
