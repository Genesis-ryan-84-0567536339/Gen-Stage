# Dự phóng đợt B (theo QD-14) — nộp Boss duyệt 25/10/2026

Mục tiêu: **Owner (Boss) điều khiển nhân vật nam, nhân vật nữ "Gen" do agy CLI làm não, hai bên nói chuyện bằng tiếng Việt có giọng.**

## 1. Workflow và thứ tự
| # | Workflow | Giao gì | Trạng thái |
| --- | --- | --- | --- |
| B1 | Bố cục gọn, điều khiển mượt, 2 nhân vật | `actor.steer` liên tục, bố cục 3 vùng theo lưới, VRM nam `owner`, nữ `gen`, `controlledBy`, camera theo owner | **Đang chạy** (sửa theo góp ý Boss, không chờ duyệt) |
| B2 | Giọng tiếng Việt chuẩn cho mọi nhân vật | Dịch vụ TTS trong bridge (edge-tts giọng vi-VN HoaiMy/NamMinh, miễn phí, chất lượng neural) → audio stream về trình duyệt; `actor.say` phát giọng thật + nhép miệng theo biên độ; cache câu; fallback Web Speech | Chờ duyệt |
| B3 | Não cho Gen qua MCP | Bridge phơi MCP tools 1:1 với Actor API (+ `stage_events`), skill 3 câu cho agy; vòng: Owner nói (Space hoặc STT) → sự kiện `user.speech` → agy đọc `stage_describe` → chọn lệnh → Gen diễn + nói; đăng ký connector `gen-stage` vào Gen-hub khi Boss mở lại Gen-hub | Chờ duyệt |

## 2. Đội agent
Thi công Opus cho cả 3 (điều khiển mượt, âm thanh đồng bộ, giao thức MCP đều cần hiểu sâu); review Opus 1 vòng; trần **3 vòng sửa/lỗi**, quá thì tách Issue riêng, không giữ PR.

## 3. Token ước tính (dựa đợt A thật: builder 250–500k/workflow, review 110–200k)
| | Thi công | Review | Cộng |
| --- | --- | --- | --- |
| B1 | 450k | 150k | ~600k |
| B2 | 400k | 150k | ~550k |
| B3 | 500k | 200k | ~700k |
| **Tổng** | | | **~1,85M**, dự phòng tối đa 2,4M |

## 4. Thời gian máy
B1 ~75 phút · B2 ~60 phút · B3 ~90 phút · review ~15 phút/cái → **~4,5 giờ**.

## 5. Boss cần làm
Duyệt B2 + B3 bằng 1 câu. Tùy chọn: tạo 2 nhân vật (nam/nữ) trong VRoid Studio, xuất VRM gửi tôi.

## 6. Điều kiện xong đợt B
Boss mở Firefox: điều khiển nhân vật nam đi mượt bằng WASD, bấm Space nói "Gen, dựng connector Baserow" → Gen quay lại, trả lời bằng giọng Việt, ra lệnh màn hình chạy code, kết tinh module đưa Boss; cả hai nói tiếng Việt rõ; agy là não thật (log agy thấy lệnh MCP).
