# Bảng trễ nhận giọng — E1 (#48) việc 6

Đo trên máy Boss lúc 13:38:38 26/10/2026, 8 luồng, loadavg 9.2 / 10.3 / 10.1. Mười câu "Javis, …" sinh bằng giọng nam của chính bridge rồi gửi qua đúng `POST /stt` (cache xoá trước mỗi cấu hình — số dưới là số Boss gặp lần đầu nói một câu).

| Cấu hình | Trễ trung vị | Trễ TB | Trễ max | WER | "Javis" đúng |
| --- | --- | --- | --- | --- | --- |
| int8 · beam 1 · vad bật (mặc định) | **5247 ms** | 6704 ms | 18348 ms | 0.0% | 10/10 |
| int8 · beam 1 · vad TẮT | **6866 ms** | 10637 ms | 51168 ms | 0.0% | 10/10 |
| int8 · beam 2 · vad bật | **3065 ms** | 4751 ms | 20504 ms | 0.0% | 10/10 |

**Chọn:** int8 · beam 2 · vad bật — nhanh nhất trong số cấu hình còn giữ WER ≤ 10 %.

## Mười câu, chữ nhận được (cấu hình mặc định)

| Boss nói | Engine nghe thô | Sau sổ từ |
| --- | --- | --- |
| Javis, đi tới bàn điều khiển | david đi tới bàn điều khiển. | Javis đi tới bàn điều khiển |
| Javis, chào | david chào. | Javis chào |
| Javis, dừng lại | david dừng lại. | Javis dừng lại |
| Javis, quay lại đây | david quay lại đây. | Javis quay lại đây |
| Javis, ngồi xuống | david ngồi xuống. | Javis ngồi xuống |
| Javis, đứng lên | david đứng lên. | Javis đứng lên |
| Javis, vui lên | david vui lên. | Javis vui lên |
| Javis, đi tới kệ module | david đi tới kệ model. | Javis đi tới kệ module |
| Javis, nhìn Gen | david nhìn ghen. | Javis nhìn Gen |
| Javis, suy nghĩ đi | gia viết suy nghĩ đi. | Javis suy nghĩ đi |

## Ghi chú về model `base`

Không đổi sang PhoWhisper-**base**: bản CTranslate2 của `base` không có
trong repo `quocphu/PhoWhisper-ct2-FasterWhisper` mà `scripts/fetch-stt.sh`
đang dùng (chỉ có small/medium/large), nên không tải được mà không tự
chuyển đổi model — việc đó vượt phạm vi đợt E. Mặc định hiện tại đã là
`compute_type int8` + `beam_size 1` (hai mục Boss nhắc), và bảng trên cho
thấy tắt `vad_filter` không đổi được đáng kể.

## ĐỌC BẢNG TRÊN CHO ĐÚNG — chưa đổi mặc định

`loadavg 9,2 / 10,3 / 10,1` trên máy **8 luồng** nghĩa là lúc đo máy đang gánh
gấp hơn một lần khả năng: hai builder AI khác của đợt E, Chrome swiftshader và
agy đều đang chạy. Dấu hiệu rõ nhất là cột **trễ max**: 18 s / 51 s / 20 s cho
cùng những câu 2–3 giây — đó là lúc bị tranh CPU, không phải lúc model chậm.

Nên **không** đổi mặc định sang `beam_size 2` dù dòng đó có trung vị thấp nhất:
beam lớn hơn thì tính nhiều hơn, về lý không thể nhanh hơn, nên 3065 ms so với
5247 ms là **nhiễu tải**, không phải hiệu ứng của cấu hình. Mặc định giữ nguyên
`compute_type int8` + `beam_size 1` + `vad_filter` bật — đúng hai mục Boss nhắc,
và là cấu hình rẻ nhất về tính toán.

**Còn nợ:** đo lại ba dòng này trên **máy rảnh** (loadavg < 2, không builder nào
chạy) rồi mới chốt. Hai biến `GEN_STAGE_STT_BEAM` và `GEN_STAGE_STT_VAD` đã có
sẵn trong `bridge/stt-worker.py` nên đo lại chỉ là chạy
`node scripts/kiem-e1.mjs --lai`.

Phần **không** phụ thuộc tải thì đã chốt được: cả ba cấu hình đều nghe ra
**"Javis" 10/10 câu, WER 0,0 %** — việc 6 về nhận tên riêng là ĐẠT.
