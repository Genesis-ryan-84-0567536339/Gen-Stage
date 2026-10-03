# Gen-Stage — Tầm nhìn: một AI sống và làm việc trong 3D như con người

Bản nháp 03/10/2026, Claude đề xuất, chờ Boss chốt.

## Khác biệt cốt lõi
Chatbot có hình = **chỉ phản ứng khi được hỏi**. Gen-Stage = nhân vật **tự có việc để làm, tự có nhịp sống, có trí nhớ, có thái độ**, và Boss bước vào phòng lab là thấy nó đang làm dở việc gì đó thật.

## 6 tầng làm nên "sống"

1. **Thân thể (đã có nền)**: VRM chibi, 15 emote gói mặt+cơ thể+giọng, chuyển động Mixamo, không bao giờ đứng im (idleStyle).
2. **Giác quan**: nghe Boss nói (STT), thấy Boss bấm vào đâu, biết giờ trong ngày, biết Boss đang ở đó hay đã rời đi (tab ẩn / im lâu), đọc được trạng thái thật của hệ thống Genesis (CI đỏ, PR mới, việc P1 trong Kho).
3. **Việc thật, không diễn**: mỗi hành động trên sân khấu gắn với một việc thật qua Gen-hub: màn hình hologram chạy **log thật** của agy đang code; module kết tinh = **PR vừa merge / skill vừa tạo thật**; kệ module = Tài sản `TS-` trong Kho. Không có "giả vờ làm việc".
4. **Vòng tự chủ (quan trọng nhất)**: cứ N phút não (agy CLI qua MCP) tự hỏi: "có việc gì trong Kho cho tôi? CI có đỏ không? Boss có nhắn gì? Không có gì → làm việc nền (dọn tài liệu, đọc tin, tập luyện)". Nhân vật vì thế luôn **đang làm gì đó**, Boss không gọi vẫn thấy nó bận.
5. **Trí nhớ + tính cách**: nhớ hôm qua Boss nói gì (đọc/ghi Kho Ryan, bảng Phiên/Việc), có tên, có cách nói riêng (persona "Gen"), có tâm trạng đổi theo kết quả việc (test xanh → hào hứng; lỗi 3 lần → bối rối, hỏi Boss). Tâm trạng ảnh hưởng idleStyle và cách nói.
6. **Nhịp ngày**: sáng chào + báo cáo 3 việc hôm nay (lấy từ Kho), chiều đỉnh việc, tối tổng kết, ghi Phiên vào Kho rồi "nghỉ" (đèn lab tối dần). Boss vào giờ lạ thì nó ngạc nhiên.

## Trải nghiệm mẫu (1 phút)
Boss mở app lúc 20:30. Lab tối nhẹ, Gen đang đứng trước màn hình giữa, chữ chạy. Thấy Boss, Gen quay lại, emote `chao`: "Sếp về rồi. Em đang chạy test cho PR #12 của Gen-hub, còn 2 case." Boss nói: "Xong thì đóng gói thành skill." Gen gật (`dong-y`), chỉ tay (`ra-lenh`), màn hình phải mở log agy thật. 40 giây sau fx `success`, màn hình tụ hạt → module "skill: kho-sync" rơi vào tay Gen (`thanh-cong`): "Xong, em cất lên kệ, đã ghi TS-31 vào Kho." Boss hỏi "mai làm gì?", Gen mở màn hình trái: 3 việc P1 từ Kho.

## Kiến trúc (giữ đúng những gì đã chốt)
```
Boss ⇄ Giao diện 3D (Three.js + three-vrm, Actor API v0.1)
            ⇅ WebSocket
       Bridge Node = MCP server "gen-stage"  ⇄  Gen-hub (connector)
            ⇅                                      ⇅
       Não: agy CLI (skill "song-trong-lab")   Kho Ryan / GitHub / CI / gen-workplace
       Giọng: STT trình duyệt · TTS edge-tts → Google/ElevenLabs khi cần hay hơn
```
Não không viết trong app; app chỉ là **thân thể + giác quan + sân khấu**. Đổi não (agy → Claude → Gen) không phải sửa app.

## Lộ trình đề xuất (dự phóng QD-14 nộp riêng trước khi thi công)
- **A — Thân thể + sân khấu lab**: lab viễn tưởng, Actor API v0.1 đủ lệnh, UI test tự sinh, 15 emote có Mixamo, nhân vật chibi.
- **B — Não + việc thật**: bridge MCP đăng ký Gen-hub, agy làm não, màn hình chạy log thật, module = artifact thật, đọc/ghi Kho.
- **C — Giác quan + nhịp sống**: STT/TTS hai chiều, vòng tự chủ N phút, trí nhớ, nhịp ngày, tâm trạng.
- **D — Đóng gói**: Capacitor Android, nhiều nhân vật (mỗi agent một người), phòng họp.

## Thước đo "xịn"
Boss để app chạy 1 ngày không chạm → tối xem lại thấy Gen đã làm ít nhất 1 việc thật có ghi trong Kho, và Boss **muốn** quay lại nói chuyện với nó.
