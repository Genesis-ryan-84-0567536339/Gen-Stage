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

## 3. Animation (VRMA)

**Chưa dùng.** Không tìm được file `.vrma` miễn phí có link tải ổn định tại thời điểm làm demo,
nên toàn bộ chuyển động (đi, đung đưa tay/chân, thở, chớp mắt, vẫy tay) là **thủ tục (procedural)**
— tính bằng code trong `src/main.ts` qua `vrm.humanoid.getNormalizedBoneNode(...)`.

## 4. Thư viện

| Thư viện | Phiên bản | Giấy phép |
| --- | --- | --- |
| `three` | 0.186.1 | MIT |
| `@pixiv/three-vrm` | 3.5.5 (peer `three >= 0.137`) | MIT |
| `vite` | 8.x | MIT |

Sàn gỗ, tường pastel, cửa sổ phát sáng, bầu trời: tự sinh bằng code (canvas texture + vật liệu), không dùng asset ngoài.
