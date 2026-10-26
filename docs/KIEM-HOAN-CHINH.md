# Bản kiểm hoàn chỉnh theo yêu cầu của Boss (27/10/2026)

Boss: "mọi thứ sơ sài quá, xem lại những thứ tôi yêu cầu". Mỗi dòng = một yêu cầu Boss đã nói, tiêu chí ĐẠT phải kiểm được trên bản đang chạy (Firefox, GPU thật), không tin tự khai. Cột Trạng thái do reviewer độc lập điền sau khi kiểm.

| # | Boss yêu cầu (nguyên văn rút gọn) | Tiêu chí ĐẠT | Trạng thái |
| --- | --- | --- | --- |
| 1 | Không gian = căn nhà đầy đủ nội thất, phong cách ấm như ảnh tham chiếu, không neon, không chói, không lộn xộn | 3 khu rõ, ≥25 món đồ đặt hợp lý, chất liệu gỗ/vải có vân, tranh/rèm/cây/đèn, ngoài cửa sổ có cảnh; luma mặt p95 ≤230; nhìn ảnh so cạnh ảnh tham chiếu đạt ≥3,5/5 (reviewer chấm) | |
| 2 | Nhân vật nam tên Javis, đẹp, không đi ngược, không "ghê"; nữ là Gen | Javis = VRoid nam anime, chibi cùng tỉ lệ Gen, đi đúng hướng, tay tự nhiên, không cháy trắng; tên hiện "Javis" | |
| 3 | Nhân vật giống ảnh tham chiếu (chibi stylized, mắt nhỏ) | Chờ Boss chọn: tự làm VRoid Studio hoặc lấy CC0 — ghi rõ chưa làm | Chờ Boss |
| 4 | Điều khiển mượt bằng phím (WASD) | Giữ W đi liên tục không giật, quay người mượt, dừng êm <0,5 s, không xuyên đồ, camera bám | |
| 5 | Nói bằng giọng: giữ V, nhận đúng tiếng Việt, ra lệnh cho MỌI nhân vật | 10 câu lệnh thật (TTS nam) → ≥9 đúng người nhận + đúng lệnh; trễ ≤4 s máy rảnh; chữ hiện ô chat để sửa | |
| 6 | Gen do agy làm não, đóng vai, nhận lệnh từ Owner, trả lời tiếng Việt | Gõ/nói "Gen, hôm nay làm gì" → agy trả lời trong ≤10 s bằng giọng nữ; "Gen, dựng connector Baserow" → màn hình chạy code + module vào tay Gen + nói; sau 5 phút im lặng vẫn còn não (brainConnected true) | |
| 7 | Gen phải quay lại tương tác như người khi gọi; nói với Sếp thì nhìn máy quay; nói với nhau thì nhìn nhau; cử chỉ tương xứng | Gọi → quay ≤300 ms + "Dạ"; đổi góc máy giữa câu mặt vẫn hướng máy quay (≤15°); "Javis nói với Gen" → nhìn nhau; gật khi nghe | |
| 8 | Giọng TTS chuẩn, không kỳ, không hai giọng chồng | Nghe 3 câu mỗi nhân vật: 1 giọng, rõ, không méo; `speechSynthesis.speaking` luôn false | |
| 9 | Không "chưa có não" vô cớ; hai tab không đá nhau | Mở 2 tab → tab cũ báo nhường, không lặp; im 3 phút → não vẫn nối | |
| 10 | Một lệnh bật tất cả, Boss không tự thiết lập | `pnpm start` từ máy sạch → ≤90 s mọi thứ chạy, Firefox mở; `pnpm stop` tắt sạch; biểu tượng trên máy | |
| 11 | Biểu cảm phải đi cùng cơ thể + giọng (không chỉ mặt) | 5 emote tiêu biểu: mặt + thân + âm cùng lúc, khác nhau rõ | |
| 12 | Màn hình hologram chạy code, kết tinh module cầm tay (giờ theo phong cách ấm) | "Gen, dựng X" → màn hình chạy chữ → hạt tụ → vật vào tay → cất lên kệ được | |
| 13 | Chạy được trên điện thoại | 390×844: bảng lệnh thu gọn, nút mic, FPS ≥25 (GPU thật) | |

Quy tắc: dòng nào không đạt → sửa trong cùng đợt E, không để "nợ sau" trừ dòng 3 (chờ Boss).
