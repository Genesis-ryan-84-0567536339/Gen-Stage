# Cổng chất lượng trước khi báo Boss (28/10/2026 — Boss: "tự xem xét mọi thứ cho hợp lý, đừng bắt tôi nhắc")

Mọi PR trước khi merge và MỖI lần bật lại stack cho Boss phải qua đủ 3 cửa. Thiếu cửa nào thì không báo "xong".

## Cửa 1 — Review độc lập (Opus) đúng phạm vi PR
Như hiện nay: chạy thật trên Playwright **Firefox** (`firefox-1543`, headless:false, GPU thật), không swiftshader cho bất cứ số nào về mượt/FPS/tóc/chân.

## Cửa 2 — "Đi một vòng như Boss" trên bản đã gộp (bắt buộc, trước khi bật cho Boss)
Một agent mở `http://localhost:<cổng riêng>` bằng Firefox thật, KHÔNG biết PR vừa sửa gì, làm đúng những gì Boss làm, ghi ĐẠT/KHÔNG + ảnh:
1. Mở trang → bảng lệnh không che 3D (390 và 1440); không "chưa có não" 10 s đầu.
2. Nhìn 5 preset: trần không vướng; không món lẻ; không cháy trắng; nhân vật đứng **chân chạm sàn** (đo xương bàn chân); tóc không bung (đo đầu tóc); hai nhân vật tỉ lệ bằng nhau.
2b. **J1 (#78) — vùng giữa trống, tóc gọn**: ở `toan-canh`, hình chữ nhật giữa
   nhà (x −3…3 · z −2,5…2,5 = 6 × 5 m) KHÔNG có món nội thất nào; mọi món lớn
   mép sau cách tường ≤ 0,15 m; tóc cả hai nhân vật không dài quá lưng trên
   (chuỗi tóc ≤ 0,45 m) và không quét qua mặt/vai khi quay đầu nhanh — xem ảnh
   3 góc × 2 nhân vật và bảng lệch tóc của `scripts/kiem-j1.mjs`.
3. Lái WASD 5 s mỗi hướng: tốc độ đều, dừng êm, đụng đồ dừng thật, camera không lắc.
4. Bấm Bật tiếng → quyền mic → giữ V nói 5 câu **giọng thật** (dùng bộ mẫu `.cache/stt/mau` nếu có, không thì TTS làm bẩn): chữ nghe ≥4/5 đúng ý; hành động đúng ≥4/5.
5. Gõ 3 câu: lệnh cố định (Nam đi tới bàn), câu tự do (Nhi hôm nay làm gì) → não trả lời ≤10 s bằng giọng, nhìn máy quay; "Nam nói với Nhi …" → nhìn nhau.
6. "Nhi, dựng connector X" → màn hình chạy chữ, module vào tay Nhi, cất lên kệ.
7. Nghe 3 câu: một giọng, không méo, không chồng.
8. `?fps=1` 10 s: số hợp lý; `hieuNang()` calls nhà ≤120, bóng 1024.
9. Để yên 3 phút → não vẫn nối; mở tab 2 → tab 1 nhường, không lặp.
10. Console 0 lỗi suốt vòng.

## Cửa 3 — Tự soát tổng thể
Trước khi báo, Claude đọc lại `docs/KIEM-HOAN-CHINH.md` + mọi yêu cầu Boss từng nói trong phiên, liệt kê cái gì ĐÃ đạt/CHƯA đạt bằng số, và nói thẳng cái chưa đạt. Không gửi Boss thử cái mình chưa tự thử.

## Nguyên tắc
- Không bao giờ dùng số đo swiftshader để kết luận về mượt, tóc, chân, FPS.
- Không bao giờ đo nhận giọng chỉ bằng TTS sạch; phải có giọng thật hoặc TTS làm bẩn (tốc độ ×1,25, nhiễu, lọc băng).
- Một lỗi Boss báo = thêm một mục vào Cửa 2 vĩnh viễn.
