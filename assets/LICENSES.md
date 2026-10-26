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

## 1b. Nhân vật NAM `owner` — VRoid "HairSample_Male" → `public/models/owner.vrm`

B1 (Issue #18) dùng "Biz Dude" (CC0, 100 Avatars R3). **C0 (Issue #28) đổi**: Boss
thử xong nói *"nhân vật nam nhìn kỳ"* — Biz Dude là model low-poly kiểu người
thật, đứng cạnh `gen` (VRoid, anime) thì lệch gu, và chibi hoá càng làm lệch tỉ lệ.

| Mục | Nội dung |
| --- | --- |
| Nguồn tải | `https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/HairSample_Male.vrm` (tải bằng `pnpm assets`, ~17,6 MB, HTTP 200 không cần đăng nhập) |
| Tác giả | VRoid Project / pixiv Inc. (sample model của VRoid Studio) |
| Định dạng | VRM 0.x (`VRM` 0.0), 54 xương humanoid, 14 vật liệu MToon (toon shading), blendshape đủ `a i u e o blink angry fun joy sorrow` |
| Giấy phép | **CC0** |

Quyền đọc trực tiếp từ metadata của chính file (`extensions.VRM.meta`):

- `title`: `HairSample_Male` · `licenseName`: **`CC0`**
- `allowedUserName`: `Everyone` · `commercialUssageName`: `Allow`
- `violentUssageName`: `Allow` · `sexualUssageName`: `Allow`

**Vì sao lần này nhận, mà B1 lại loại `AvatarSample_A`** (cùng mirror
`madjin/vrm-samples`, mirror đó **không có file LICENSE**):

- `AvatarSample_A/B/C` **không phải CC0**. Trang điều khoản chính thức của VRoid
  nói thẳng: *"The license to these sample models is not CC0."*, và cấm
  *"Distributing a sample model or its VRM file to a third party by setting the
  'Redistribution and alteration' conditions of use to 'Copyright Disclaimer
  (CC0)'"*. Với loại này thì quyền phân phối lại phụ thuộc vào nguồn — mirror
  không có LICENSE là không đủ rõ, nên B1 loại là đúng.
- `HairSample_Male` thì **được chính VRoid liệt kê đích danh là CC0**:
  bài <https://vroid.pixiv.help/hc/en-us/articles/4402614652569>, mục
  *"▼CC0 license models … ・HairSample_Male ・HairSample_Female ・β Ver
  AvatarSample_1–4"*. CC0 = từ bỏ bản quyền, **ai mirror cũng hợp lệ**, nên việc
  repo mirror không có file LICENSE không còn là vấn đề. Giấy phép còn được ghi
  lặp lại trong metadata của chính file (bảng trên), kiểm được offline.

Điều khoản sample model của VRoid (để đối chiếu, trích nguyên văn):
*"This model's .vroid and VRM files can be used by anyone in any kind of activity,
be it for-profit or not."* · *"Import and use as an avatar or character on apps and
platforms supporting the VRM format."* · *"There is no need to credit the original
creator when using this sample model."* — nguồn:
<https://vroid.pixiv.help/hc/en-us/articles/4402394424089> và
<https://vroid.com/en/studio/guidelines>.

Ứng viên đã so và loại (C0):

| Ứng viên | Vì sao loại |
| --- | --- |
| `pixiv/ChatVRM` `public/` | chỉ có **đúng một** file VRM: `AvatarSample_B` (nữ) — không có bản nam nào |
| `AvatarSample_A` / `AvatarSample_C` (nam, anime, đẹp) | `licenseName: "Other"`, VRoid nói rõ **không phải CC0**; tải chính thức phải qua VRoid Hub (đăng nhập + đồng ý ToS), `curl` không lấy được |
| `Sakurada_Fumiriya.vrm` (nam anime, CC0 trong metadata) | CC0 **chỉ** ghi trong file, tên này **không** nằm trong danh sách CC0 trên trang VRoid → bằng chứng yếu hơn. Giữ làm dự phòng nếu Boss thích tạo hình này hơn. |
| `ToxSam/open-source-avatars` (toàn bộ 100 Avatars R1–R3, toxsam, vipe-heroes…) | đã duyệt hết: low-poly / voxel / chibi PFP, **không có nam anime kiểu VRoid** |
| `Seed-san` (VirtualCast, VRM Public License 1.0) | `creditNotation: "required"` (bắt buộc ghi công) và tạo hình trung tính giới tính |

Thiếu file này (chưa chạy `pnpm assets`) thì `World.actorSpawn` tự rơi về
`models/avatar.vrm` kèm cảnh báo console — cảnh vẫn dựng, vẫn điều khiển được.

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

### 3c. Clip NGỒI của bộ này TĨNH — hệ quả phải biết

`Sitting_Enter` (1,29 s) / `Sitting_Exit` (1,00 s) / `Sitting_Idle_Loop`
(1,67 s) đều có dáng ngồi đúng, nhưng `Sitting_Idle_Loop` **chỉ có 2 keyframe,
nội suy STEP** — tức chân bất động suốt clip. Hai hệ quả đã cắn thật (PR #10):

1. `THREE.PropertyMixer.apply()` chỉ ghi xuống scene graph khi giá trị trộn
   **đổi** so với lần ghi trước của chính nó, nên với clip tĩnh mixer ngừng ghi
   xương ngay sau khi crossfade xong. Code nào reset xương về 0 mỗi khung hình
   (cho lớp cử chỉ cộng thêm) sẽ **xoá sạch dáng ngồi** — chân duỗi thẳng đứng
   và đứng im như thế mãi. Cách tránh: giữ lại dáng nền khung trước rồi trả về
   trước khi mixer chạy (`NhanVat.nenGoc`).
2. Clip không biết ghế của cảnh cao bao nhiêu, nên hình học chân vẫn phải
   chỉnh theo `seatY` thật của place (`NhanVat.gapChanNgoi`).

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

## C1 — nhận dạng giọng tiếng Việt (Issue #31)

Không commit, tải bằng `bash scripts/fetch-stt.sh` vào `.cache/stt/`.

| Thứ | Nguồn | Giấy phép |
| --- | --- | --- |
| PhoWhisper-small (model) | VinAI Research — `vinai/PhoWhisper-small` | Apache-2.0 |
| Bản CTranslate2 của model trên | `quocphu/PhoWhisper-ct2-FasterWhisper` (HuggingFace, tải không cần đăng nhập) | Apache-2.0 (theo model gốc) |
| `faster-whisper` (thư viện python) | SYSTRAN/faster-whisper | MIT |
| `ctranslate2` | OpenNMT | MIT |

Đã so với whisper.cpp (MIT) và Vosk `vosk-model-vn-0.4` (Apache-2.0) nhưng
**không dùng** — xem `docs/c1/so-sanh.md`. Không có thư viện copyleft nào vào
bridge, cùng nguyên tắc với `bridge/tts.ts`.
