# Dự phóng đợt A (theo QD-14) — nộp Boss duyệt 04/10/2026

Mục tiêu đợt A: **bộ khiển + không gian lab + bộ hành vi nhân vật hoàn chỉnh, test tay được trên giao diện, chưa gắn não.**

## 1. Số đợt và thứ tự
Đợt A chia 3 workflow chạy nối tiếp (mỗi cái 1 PR, review rồi mới qua cái sau):

| # | Workflow | Giao gì |
| --- | --- | --- |
| A1 | **Lõi điều khiển** | Dispatcher duy nhất, Actor API v0.1 nhóm meta/actor/prop/camera/script, `stage.describe` chuẩn số liệu, UI test tự sinh từ bootstrap, ô kịch bản, nhật ký lệnh JSON, bridge WebSocket khung (chưa MCP) |
| A2 | **Bộ hành vi** | Pipeline chuyển động (Quaternius Universal Animation Library CC0 → retarget VRM; Mixamo là dự phòng vì cần Boss tải tay do Adobe bắt đăng nhập), 15 emote gói mặt+cơ thể+âm, idleStyle, `actor.say` có cử chỉ + nhép miệng (TTS tạm bằng Web Speech của trình duyệt), nhân vật chibi (VRM chibi CC0 hoặc Boss tạo từ VRoid Studio) |
| A3 | **Lab viễn tưởng** | Cảnh lab, bloom, màn hình hologram `screen.*`, kết tinh `module.build`, `fx.*`, camera preset, mobile mượt |

Sau A: đợt B (não + việc thật qua Gen-hub), C (giác quan + nhịp sống), D (đóng gói). Mỗi đợt nộp dự phóng riêng.

## 2. Đội ngũ agent mỗi workflow
| Vai | Model | Việc |
| --- | --- | --- |
| Thiết kế / điều phối | Fable (phiên chính) | Spec đã xong; chỉ giao việc, quyết định, tổng hợp |
| Thi công | Sonnet 5 (A1: có khuôn rõ) · Opus 5 (A2 + A3: chuyển động và hình ảnh là chỗ dễ nửa mùa — Boss yêu cầu 04/10) | Code trên worktree riêng, tự chụp ảnh + log bằng Playwright làm bằng chứng |
| Review trước merge | Opus 5, 1 vòng đầy đủ | Đối chiếu spec, bấm thử từng lệnh trên UI thật |
| Kiểm trạng thái / đọc log | Haiku 4.5 | CI, console, so ảnh |

## 3. Ước tính token (dựa số liệu thật đợt 0: thi công Opus 175k cho 1 cảnh đơn giản không review; nghiên cứu 89k)
| Workflow | Thi công | Review Opus | Haiku + điều phối | Cộng |
| --- | --- | --- | --- | --- |
| A1 | 350k (Sonnet) | 150k | 50k | **~550k** |
| A2 | 450k (Opus) | 150k | 50k | **~650k** |
| A3 | 550k (Opus) | 120k | 50k | **~720k** |
| **Tổng đợt A** | | | | **~2.0M** (A là đợt lớn gộp 3 workflow; cả A1 Opus nữa thì ~2.3M) |

Dự phòng rủi ro +30% nếu retarget VRM hoặc Vite/three-vrm phát sinh lỗi lạ: tối đa ~2.6M.

## 4. Thời gian máy chạy
A1 ~45 phút · A2 ~70 phút · A3 ~50 phút · review mỗi cái ~15 phút → **~3,5 giờ** tổng, có thể chạy xuyên đêm, Boss sáng xem.

## 5. Boss cần làm
- Duyệt dự phóng này (1 câu).
- Tùy chọn: tạo nhân vật chibi trong VRoid Studio (Steam) xuất VRM gửi tôi; không có thì tôi dùng VRM chibi CC0 tìm được, Boss thay sau.

## 6. Điều kiện "xong" đợt A
Cửa chất lượng: Claude tự bấm từng lệnh trên app thật, chụp ảnh; nhìn cứng/xấu → trả lại làm tiếp, không tính xong. Boss chỉ xem bản đã qua cửa.
Boss mở app: lab viễn tưởng, nhân vật chibi không đứng im; bảng lệnh tự sinh, bấm từng lệnh trong spec đều chạy; dán kịch bản mẫu "ra lệnh → lập trình → kết tinh module" chạy trọn; `stage.describe` trả số liệu đúng khuôn; nhật ký lệnh xuất được; chạy mượt trên điện thoại.
