# F1 — Sơ đồ bố cục căn nhà 14 × 10 m (Issue #56 mục 1)

Boss xem bản main (D1b) trên Firefox: **"nội thất đồ đạc tùm lum, thiết kế kỳ"**.
Ảnh tham chiếu Boss: *nhà gỗ ấm, nắng mềm, cụm đồ gọn như nhà thật.*

Tài liệu này là **thiết kế vẽ trước khi sửa code** — bản vẽ của kiến trúc sư nội
thất. `src/stage/bo-cuc.ts` phải khớp đúng sơ đồ này; test `b1-steer-bo-cuc`
kiểm lại bằng số.

---

## 1. Chẩn đoán bản D1b: vì sao "tùm lum, thiết kế kỳ"

| # | Lỗi bố cục ở D1b | Hệ quả Boss thấy |
|---|---|---|
| 1 | **Sofa và kệ TV không nhìn nhau.** Sofa `(-4,5; 1,5)` quay 180° (mặt về −Z), kệ TV `(-6,5; −0,5)` quay 90° (mặt về +X) → hai món vuông góc, cách nhau 3,2 m chéo. | "Thiết kế kỳ" — phòng khách không có tâm. |
| 2 | **Đồ đứng lẻ giữa sàn.** `ghe-don-2 (-3; 3)`, `cay-2 (-2; 4)`, `den-san (-1,5; 1)` đều cách mọi món khác > 1,3 m, không chung thảm, không sát tường. | "Đồ đạc tùm lum". |
| 3 | **Bếp không phải bếp.** 3 tủ dưới rải rác trên tường đông ở z = 0,5 / 2,0 / 4,0 — khe hở 0,55 m giữa các cục, không có góc chữ L. | Nhìn như 3 cái tủ bị bỏ quên. |
| 4 | **Bàn ăn sát bếp 0,9 m**, ghế thứ 4 `(4,5; 2,5)` chen vào lối đi đông. | Chật, không kéo ghế ra được. |
| 5 | **Lạc tông màu.** `mauVai` olive lạnh `0x7d7247` cho sofa **và** ghế làm việc **và** ghế đơn 2; model `pillowBlue` (gối xanh dương); cây Kenney giữ xanh lục chói nguyên bản. | "Màu lạc tông". |
| 6 | **Thảm 2,6 m chỉ nằm dưới sofa**, không chạm bàn trà (bàn ở z = 0,5, thảm phủ z 1,5 ± 0,94). | Cụm rời ra, không "đọc" thành một phòng. |

---

## 2. Nguyên tắc sửa (3 điều, kiểm được bằng số)

1. **Mỗi món hoặc SÁT TƯỜNG (≤ 0,35 m) hoặc THUỘC MỘT CỤM** (nằm trong/chạm
   mép thảm, hoặc cách món anh em ≤ 0,8 m). Không món nào lẻ giữa sàn.
2. **Lối đi ≥ 1,2 m** giữa hai cụm; **hành lang trung tâm 2 m** (`|x| ≤ 1`)
   luôn trống suốt từ cửa tới cửa sổ.
3. **Một tông duy nhất:** gỗ óc chó ấm → vải màu đất/kem → điểm xanh olive
   nhạt. Không xanh dương ở bất cứ đâu; cây xanh lục dịu `0x6f8f5a`.

---

## 3. Sơ đồ 2D (nhìn từ trên xuống)

Trục: `x` ngang (−7 … +7), `z` dọc (−5 … +5). Theo tên gọi của repo từ D1:
**tường BẮC là `z = −5`** (có cửa ra vào), **tường NAM là `z = +5`** (cửa sổ lớn),
tây = `x` âm, đông = `x` dương. Một ký tự ≈ 0,25 m.

```
            T Ư Ờ N G   B Ắ C  (z = -5)              cửa ra vào ở x = 0
   x=-7                        x=0                         x=+7
    ┌───────────────────────────┬─┬───────────────────────────┐
    │ [tranh3]  móc kệ   thảm   │ │ KỆ   BÀN LÀM VIỆC   TỦ TỦ │ z=-5
    │          áo  giày  chùi   │ │SÁCH  ┌──────────┐   BẾP GÓC│
    │ ░cây2░    ▓▓   ▒▒▒▒       │ │ ███  │ màn+bàn  │   ███ ███│ z=-4
    │                           │ │      │   phím   │        ██│
    │                        ╷  │ │       ○ ghế2         BỒN██│ z=-3
    │ [t1]                   ╵  │ │                     RỬA ██│
    │  ╷    ┌───┐                 │ │                      BẾP██│ z=-2
    │  │ ⌂  │ghế│                 │ │     B Ế P   C H Ữ   NẤU ██│
    │ KỆ    │đơn│   đèn           │ │         L            TỦ ██│ z=-1
    │ TV ░░░░░░░░░░░░░░░░░░░      │ │                     DƯỚI██│
    │ ▓▓ ░░░░ T H Ả M ░░░░░ ┃sofa │ │                    TỦ LẠNH│ z=0
    │ ▓▓ ░░░░ ╔═════╗ ░░░░░ ┃ 3   │ │      ○ ghế1              │
    │ ▓▓ ░░░░ ║bàn  ║ ░░░░░ ┃ chỗ │ │   ┌────────┐             │ z=+1
    │ [t2]░░░ ║trà  ║ ░░░░░ ┃     │ │ ○─┤ BÀN ĂN ├─○           │ z=+2
    │    ░░░░ ╚═════╝ ░░░░░ ┃  ▭  │ │   └────────┘             │
    │    ░░░░░░░░░░░░░░░░░░ ┃ bàn │ │      ○ ghế                │ z=+3
    │        ┌───┐          ┃ cạnh│ │                           │
    │        │ghế│                 │ │                      ░cây4│ z=+4
    │ ░cây1░ │đơn│                 │ │     ▓▓▓TỦ BÁT▓▓▓    ░░░░░│
    └────────┴───┴──────┬─────────┴─┴───────────────────────────┘ z=+5
            T Ư Ờ N G   N A M        ╰─ CỬA SỔ LỚN 4 m + rèm hai bên
                                        (x = -3 … +1, tâm x = -1)

    ░ = thảm / cây     ▓ = đồ sát tường     █ = tủ bếp     ○ = ghế
    ┃ = sofa 3 chỗ     ⌂ = TV trên kệ       ▭ = bàn cạnh sofa + đèn
    │ │ = HÀNH LANG TRUNG TÂM 2 m (|x| ≤ 1) — luôn trống
```

---

## 4. Bốn cụm — toạ độ và lý do

### 4.1 PHÒNG KHÁCH — một cụm chặt quanh thảm (x −7 … −2,5 · z −1 … +3)

| Món | Tâm `(x, z)` | Quay | Vì sao ở đó |
|---|---|---|---|
| `ke-tivi` | (−6,5 ; 1,0) | 90° (mặt +X) | **Sát tường tây**, mặt hướng vào phòng. Màn hình `tivi` đã được `man-hinh.ts` neo sẵn lên nóc kệ — KHÔNG khai thêm khối TV ở đây (vòng 1 khai thêm → hai cái TV chồng nhau). |
| `tranh-1` / `tranh-2` | (−7 ; −0,5) / (−7 ; 2,5) | 90° | Treo tường tây **hai bên TV** (`datY` 1,5). |
| `sofa` 3 chỗ | (−3,0 ; 1,0) | 270° (mặt −X) | **Đối diện đúng kệ TV**, cách 3,2 m — khoảng nhìn TV thật. |
| `goi-1` / `goi-2` | (−3,0 ; 0,5) / (−3,0 ; 1,5) | 270° | Trên mặt ngồi sofa (`datY` 0,42). |
| `ban-tra` | (−4,5 ; 1,0) | 0° | **Chính giữa** sofa ↔ TV; cách mặt sofa 0,45 m. |
| `ghe-don-1` | (−4,5 ; −0,5) | 25° | **Vuông góc sofa**, đầu bắc cụm; cách bàn trà 0,7 m. |
| `ghe-don-2` | (−4,5 ; 2,5) | 205° | Vuông góc sofa, đầu nam cụm; đối xứng ghế 1. |
| `tham` 3,4 m | (−4,5 ; 1,0) | 0° | **Phủ cả cụm**: x −6,2…−2,8 · z −0,2…+2,2 → chạm chân TV, chân sofa, cả bàn trà. |
| `den-san` | (−5,5 ; −1,0) | 0° | **Cạnh ghế đơn 1** (0,8 m) — đúng chỗ đèn đọc sách. |
| `ban-canh-sofa` + `den-ban-sofa` | (−3,0 ; 2,5) | 270° | Áp sát đầu sofa (khe 0,07 m) — tay với tới. |
| `cay-1` / `cay-2` | (−6,5 ; 4,0) / (−6,5 ; −3,5) | 0° | **Hai góc** tây-nam và tây-bắc, không giữa sàn. |
| `tranh-3` | (−5,0 ; −5) | 0° | Tường bắc phòng khách. |
| `den-tran-khach` | (−4,5 ; 1,0) | — | Đèn trần `datY` 2,4 m ngay trên cụm (trần 2,8 m). |

> **Một khác biệt với đề bài, có lý do.** Đề: *"sofa sát tường tây, kệ TV đối
> diện sofa sát tường"*. Trong nhà này **không có tường nào đối diện tường tây**
> — phía đông phòng khách là hành lang 2 m (không thể dựng tường, sẽ chặn cửa
> sổ ↔ cửa). Chọn giải pháp của kiến trúc sư: **kệ TV sát tường tây** (tường
> dài 10 m, chắc chắn), **sofa đối diện đúng nó**, lưng sofa làm ranh giới mềm
> với hành lang, và **thảm 3,4 m phủ cả cụm** nên sofa KHÔNG lẻ giữa sàn —
> đúng điều kiện "hoặc sát tường, hoặc thuộc một cụm". Tranh vì thế treo hai
> bên TV trên tường tây thay vì trên sofa.

### 4.2 GÓC LÀM VIỆC — sát tường bắc, cạnh hành lang (x 1,0 … 3,65)

| Món | Tâm | Quay | Ghi chú |
|---|---|---|---|
| `ke-module` (kệ sách) | (1,5 ; −4,5) | 0° | **Sát tường bắc**, mép tây x = 1,0 = đúng rìa hành lang. |
| `sach-ke-1` … `-4` | (1,5 ; −4,5) | 0° | 4 chồng sách trên 3 tầng kệ (`datY` 1,24 / 0,82 / 0,40) — vòng 1 chỉ 2 chồng, kệ nhìn trống. |
| `ban-dieu-khien` | (3,0 ; −4,5) | 0° | Sát tường bắc, **liền kệ sách** (khe 0,35 m) → một cụm. |
| `man-hinh-ban` | trên bàn | 0° | Màn hình dựng ở rìa sau bàn. |
| `ban-phim`, `chuot`, `den-ban`, `sach-ban`, `coc-ban` | trên bàn | | Bày mặt bàn. |
| `ghe-2` | (3,0 ; −3,5) | 180° | Quay mặt vào bàn. |
| `bang-ghim` | (3,0 ; −5) | 0° | **Treo tường ngay trên bàn** (`datY` 1,35). |

### 4.3 BẾP CHỮ L — góc đông-bắc (x 4,9 … 7 · z −5 … 0)

Hai nhánh liền mạch, khe giữa các cục ≤ 0,1 m (D1b hở 0,55 m):

* **Nhánh bắc** (z = −4,5, mặt +Z): `tu-bep` (5,5) → `tu-bep-goc` (6,5, tủ góc trong).
* **Nhánh đông** (x = 6,5, mặt −X): `tu-duoi-1` bồn rửa (z −3,5) → `bep-nau`
  (−2,5) → `tu-duoi-2` (−1,5) → **`tu-lanh` ở đầu nhánh** (−0,5).
* **Trên tường:** `tu-tren-1/2/3` (`datY` 1,5) + `hut-mui` trên bếp nấu (`datY` 1,55).
* **Mặt bếp + backsplash liền** chạy theo đúng hai nhánh — `DAY_BEP` trong
  `bo-cuc.ts`, `phong.ts` đọc hằng số (D1b viết số tay z −1,6…2,6, lệch hẳn).
* **Trên mặt:** `lo-vi-song` (trên `tu-bep`), `may-ca-phe` (trên `tu-duoi-2`).

### 4.4 BÀN ĂN + TỦ BÁT — cách bếp 1,35 m (x 2,8 … 5,6 · z 1 … 4,8)

| Món | Tâm | Khoảng cách |
|---|---|---|
| `tham-an` 2,4 m | (4,0 ; 2,0) | Thảm dưới cả cụm ăn — neo bàn + 4 ghế, và lấp khoảng sàn trống giữa nhà. |
| `ban-an` tròn 1,3 m | (4,0 ; 2,0) | Mép bắc z = 1,35 → **tủ lạnh z = 0,0: 1,35 m ≥ 1,2 m** ✔ |
| `den-tran-an` | (4,0 ; 2,0) | Đèn trần trên bàn ăn (`datY` 2,4 m). |
| 4 ghế: `ghe-1`, `ban-an-ghe-2/3/4` | (4;1) (4;3) (3;2) (5;2) | Vòng quanh bàn, không món nào có hộp chắn. |
| `binh-hoa`, `trai-cay` | trên bàn | |
| `tu-bat-dia` + `binh-hoa-tu` | (5,0 ; 4,5) | **Sát tường nam** — neo cụm ăn về phía nam. |
| `cay-4` | (6,5 ; 4,5) | Góc đông-nam. |
| `tranh-4` | (6,0 ; +5) | Tường nam trên tủ bát. |

### 4.5 HÀNH LANG — vào từ cửa, kệ giày + móc áo sát tường bắc

| Món | Tâm | Ghi chú |
|---|---|---|
| `cua` | (0 ; −5) | Không có hộp chắn — phải đi qua được. |
| `ke-giay` (ghế băng) | (−2,0 ; −4,5) | Sát tường bắc, **mép đông x = −1,5** → không lấn hành lang. |
| `moc-ao` | (−3,0 ; −4,5) | Liền kệ giày (một cụm đón khách). |
| `tham-cua` | (−1,5 ; −4,0) | Trước kệ giày, ngay trong lòng cửa. |

---

## 5. Kiểm lối đi (đo trên hộp chắn, không đo bằng mắt)

| Lối đi | Hai mép | Rộng |
|---|---|---|
| Hành lang trung tâm | `ke-module` x0 = +1,0 ↔ `ke-giay` x1 = −1,5 | **2,5 m** (yêu cầu 2) |
| Phòng khách ↔ hành lang | `sofa` x1 = −2,55 ↔ x = −1 | **1,55 m** |
| Bàn trà ↔ kệ TV | x −5,1 ↔ −6,22 | **1,12 m** (lối đi trong cụm, không phải lối đi chính) |
| Góc làm việc ↔ bếp | `ban-dieu-khien` x1 = 3,65 ↔ `tu-bep` x0 = 5,0 | **1,35 m** |
| Bàn ăn ↔ bếp (bắc) | `ban-an` z0 = 1,35 ↔ `tu-lanh` z1 = 0,0 | **1,35 m** |
| Bàn ăn ↔ dãy bếp đông | `ban-an` x1 = 4,65 ↔ x0 = 6,15 | **1,50 m** |
| Bàn ăn ↔ tủ bát (nam) | z 2,65 ↔ 4,2 | **1,55 m** |

---

## 6. Một tông màu (chat-lieu.ts)

```
gỗ óc chó ấm     0x6b4a2f   mặt bàn, bàn trà, bàn cạnh sofa
gỗ sáng ấm       0x8a6a44   chân tường, bệ cửa sổ, mặt bếp
vải KEM          0xd8c6a8   sofa 3 chỗ  (D1b: olive lạnh 0x7d7247)
vải ĐẤT          0xa98a66   2 ghế đơn, ghế ăn, ghế làm việc, kệ giày
điểm OLIVE nhạt  0x7d8a5e   chỉ 1 gối tựa + 1 gối (điểm nhấn, không phủ cả phòng)
gối nâu vàng     0xb08a4e
thảm             kem #e8cfa6 + đỏ gạch nhạt #9c5c45 (thamHoaVan, giữ)
cây xanh lục dịu 0x6f8f5a   ép bằng donTongAm()
```

**Chặn xanh dương ở GỐC:** `apChatLieu()` chạy `donTongAm()` cho mọi vật liệu
Kenney. Mọi sắc **lục → lam → tím (hue 65°–290°)** bị **xoay về màu đất**
`0xa98a66`; vàng/cam/đỏ/nâu (ngoài khoảng đó) để yên; xám/trắng/đen
(`s < 0,08`: khung kim loại, chân gỗ tối) cũng để yên. Một hàm, chặn được cả
141 model CC0 mà không phải tô tay cái nào. Model `pillowBlue` đã bỏ khỏi bảng.

**Ngoại lệ duy nhất là CÂY** — khối khai `cay: true` thì sắc xanh lục được giữ
là xanh lục, chỉ hạ chói về `0x6f8f5a`. Vòng 1 không có cờ này nên nhánh "xanh
lục → xanh lục dịu" tóm luôn `kitchenFridgeLarge` (model Kenney vốn xanh ngọc)
→ **tủ lạnh xanh lá** giữa bếp gỗ ấm, thấy rõ ở ảnh thử F1 vòng 1.

## 7. Giữ nhẹ GPU (giao kèo D1b)

* Bóng **cố định 1024**, không hậu kỳ — **không sửa gì** trong F1.
* Đồ nhỏ (`chan` không khai và `cao` < 0,9 m) **không đổ bóng**, chỉ nhận bóng.
* `donTongAm()` chỉ đổi `material.color` một lần lúc dựng → **0 chi phí mỗi khung hình**.
* Mặt bếp + backsplash: 4 hộp (2 nhánh × 2) dùng chung 2 vật liệu → `gopTinh()` gộp hết.
* Mục tiêu đo: **lượt vẽ nhà ≤ 120**.

## 7b. Góc máy

| Preset | Máy đứng | Nhắm | Thấy gì |
|---|---|---|---|
| `toan-canh` | (1,0 ; 1,92 ; 4,3) **fov 74** | (−0,5 ; 0,82 ; −3,9) | **Cả 3 cụm trong một khung**: sofa–thảm–kệ TV trái · cửa + kệ giày + móc áo + kệ sách + bàn làm việc giữa · bếp chữ L + bàn ăn phải. |
| `phong-khach` | (−1,5 ; 1,9 ; 4,2) | (−4,9 ; 0,9 ; 0,9) | Sofa ↔ bàn trà ↔ kệ TV, 2 ghế đơn, thảm, đèn sàn. |
| `ban-lam-viec` | (0,5 ; 1,7 ; −1,7) | (2,3 ; 1,0 ; −4,5) | Kệ sách + bàn + màn hình + bảng ghim + ghế. |
| `bep` | (4,0 ; 2,0 ; 1,1) | (6,3 ; 0,95 ; −3,3) | **Cả hai nhánh chữ L** + tủ trên + hút mùi + tủ lạnh. |
| `cua-so` | (−1,0 ; 1,45 ; 1,6) | (−1,0 ; 1,1 ; 4,8) | Cửa sổ lớn + rèm hai bên + sân vườn. |

`toan-canh` phải mở lên **fov 74** (D1b là 66): phòng khách ở tường TÂY còn bếp
ở góc ĐÔNG-BẮC, hai cụm cách nhau gần hết bề ngang 14 m — với fov 66 (hfov 92°)
không có chỗ đứng nào trong nhà ôm được cả hai. D1b đứng ở góc tây-nam nhìn
đông-bắc nên cụm phòng khách nằm **sau lưng camera**: Boss mở app ra chỉ thấy
sàn trống với mấy cái tủ bếp.

## 8. Giao kèo KHÔNG đổi

* **Mọi `id` place giữ nguyên** (`ban-dieu-khien`, `ban-1`, `ban-2`, `ghe-1`,
  `ghe-2`, `buc-trung-tam`, `cua`, `ke-module`, `sofa`, `ban-an`, `bep`,
  `cua-so`) — chỉ toạ độ đi theo sơ đồ mới.
* `hopChan` / `truotVaCham` / `biChan` / `kepTrongPhong`: **API không đổi**
  (F2 steer, F3 mic không bị ảnh hưởng).
* Không đụng `theo-owner`, không đụng mic.
