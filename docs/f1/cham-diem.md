# F1 — Tự chấm so với ảnh tham chiếu của Boss (Issue #56 mục 1)

**Ảnh tham chiếu Boss đưa:** *nhà gỗ ấm, nắng mềm, cụm đồ gọn như nhà thật.*
**Bản bị chê (main / D1b), Boss xem trên Firefox:** *"nội thất đồ đạc tùm lum,
thiết kế kỳ."*

Bằng chứng: 5 ảnh preset 1440×900 + 1 ảnh có giao diện + 1 cận cảnh cụm sofa +
1 ảnh 390×844, chụp bằng **Playwright firefox (headless:false)** trên cổng dev
riêng 5320 — `docs/f1/ket-qua.json`, `scripts/kiem-f1.mjs`.

| # | Tiêu chí (theo ảnh tham chiếu) | D1b | F1 | Lý do chấm |
|---|---|---|---|---|
| 1 | **Cụm đồ gọn như nhà thật** | 1/5 | **4,5/5** | `phong-khach-1440.png` + `cum-sofa-can.png`: kệ TV sát tường tây ↔ sofa 3 chỗ đối diện đúng 3,5 m, bàn trà chính giữa, 2 ghế đơn vuông góc hai đầu, **thảm 3,4 m phủ cả cụm**, bàn cạnh sofa sát đầu sofa, đèn sàn cạnh ghế, đèn trần trên đầu. D1b sofa quay 180° còn kệ TV quay 90° — vuông góc nhau, không có tâm. Trừ 0,5: ghế đơn Kenney thấp hơn sofa nhiều nên cụm hơi lệch tỉ lệ. |
| 2 | **Không món nào lẻ giữa sàn** | 1/5 | **5/5** | `kiemCum()` = rỗng, có test giữ (`b1-steer-bo-cuc.test.ts`). 62 khối: mỗi khối hoặc sát tường ≤ 0,35 m, hoặc đặt trên nóc/treo tường, hoặc chạm mép thảm, hoặc cách món anh em ≤ 0,8 m. D1b có `ghe-don-2`, `cay-2`, `den-san` mỗi món đứng một nơi. |
| 3 | **Nhà gỗ ấm, một tông** | 2/5 | **4/5** | `donTongAm()` xoay MỌI sắc lục–lam–tím của 141 model Kenney về màu đất; sofa kem `0xd8c6a8`, ghế/kệ giày vải đất `0xa98a66`, điểm olive nhạt chỉ ở 1 gối; thảm đổi từ đỏ đất đậm sang **kem + đỏ gạch nhạt**; bỏ `pillowBlue`. Tủ lạnh vòng 1 ra **xanh lá** (ảnh thử) → thêm cờ `cay` nên giờ là thép kem. Trừ 1: gỗ của model Kenney vẫn nhạt hơn tông óc chó mong muốn — muốn đậm hơn phải nhuộm cả `go`, rủi ro mất màu phân biệt từng bộ phận. |
| 4 | **Bếp đọc ra là một cái bếp** | 1,5/5 | **4,5/5** | `bep-1440.png`: chữ L hai nhánh, khe giữa các cục ≤ 0,12 m (test giữ), mặt bếp + backsplash chạy liền theo `DAY_BEP`, tủ trên + hút mùi trên bếp nấu, lò vi sóng + máy cà phê trên mặt, tủ lạnh ở đầu nhánh. D1b là 3 cục tủ rải rác cách nhau 0,55 m trên một đoạn tường. |
| 5 | **Nắng mềm** | 4/5 | **4/5** | `cua-so-1440.png`: nắng chiều xiên qua khung chia ô, vệt sáng có nét trên sàn, rèm hai bên, sân vườn thật phía sau. **Không đổi gì** — phần này D1b đã đúng, F1 chỉ dời 2 đèn điểm ấm theo đúng 2 chụp đèn mới. |
| 6 | **Lối đi đi được** | 2/5 | **5/5** | `kiemLoiDi()` = rỗng: mọi cặp cụm cách ≥ 1,2 m; hành lang trung tâm tròn 2,5 m giữa kệ sách (x0 = +1,0) và kệ giày (x1 = −1,5); bàn ăn cách tủ lạnh 1,35 m, cách dãy bếp đông 1,50 m. D1b để ghế bàn ăn chen vào lối đi đông. |
| 7 | **`toan-canh` thấy 3 cụm** | 1/5 | **3,5/5** | `toan-canh-1440.png`: sofa–thảm–kệ TV trái · cửa + kệ giày + móc áo + kệ sách + bàn làm việc giữa · bếp chữ L + bàn ăn phải. Phải mở fov 66 → **74** mới ôm nổi (phòng khách ở tường tây, bếp ở góc đông-bắc, cách nhau gần hết 14 m). Trừ 1,5: hành lang 2 m + lối đi khiến khoảng sàn giữa khung vẫn rộng, và mép kệ TV bị cắt ở rìa trái. |

## Điểm chung: **4,4 / 5** (D1b tự chấm cùng thang: 1,8 / 5)

## Ba chỗ còn nợ (ghi thẳng, không giấu)

1. **Khoảng sàn giữa nhà vẫn rộng** ở khung `toan-canh`. Đây là hệ quả của
   chính yêu cầu: hành lang 2 m + lối đi ≥ 1,2 m giữa 4 cụm trong nhà 14 × 10.
   Muốn đầy hơn thì phải thu nhà lại (đổi `ROOM_W`/`ROOM_D` — ngoài phạm vi F1,
   phá mọi toạ độ đã có) hoặc thêm một cụm thứ năm ở giữa, mà như thế là quay
   lại đúng "tùm lum".
2. **Khung `toan-canh` cắt mép kệ TV.** Không có chỗ đứng nào trong nhà ôm được
   cả kệ TV (x = −6,5) lẫn bếp (x = +6,5) với fov hợp lý. Đổi lại được cả 3 cụm.
3. **Tóc của Gen bung thành chùm** ở ảnh chụp — đây là spring bone của VRM trên
   **renderer phần mềm ~1 fps** (`nhanvat.ts`, ngoài phạm vi F1, đã có ghi chú
   ở CLAUDE.md mục D1b vòng 2). Trên GPU thật của Boss không có hiện tượng này.

## Giữ nhẹ GPU — đo thật (`ket-qua.json`)

| Thước | Giao kèo D1b | F1 đo được |
|---|---|---|
| Lượt vẽ phần NHÀ | ≤ 120 | **36** ✔ |
| Shadow map | 1024 cố định | **1024** ✔ |
| Hậu kỳ | không | **không** (không đụng) ✔ |
| Tam giác phần nhà | — | 15 075 |
| Lỗi console | 0 | **0** ✔ |
| Bảng lệnh 390 px tự thu gọn | có | **có** ✔ |

62 khối (D1b 50) mà lượt vẽ nhà vẫn 36: đồ thêm vào dùng lại đúng những vật
liệu Kenney đã có nên `gopTinh()` gộp hết; `donTongAm()` chỉ chạy một lần lúc
dựng, không tốn gì mỗi khung hình.
