| Thước đo (Issue #74) | Lời hứa | Đo thật | Kết |
| --- | --- | --- | --- |
| t(`user.listening on`) → t(`actor.lookAt` Nhi) | ≤150 ms | **8 ms** | ✅ |
| t(`user.text`) → t(gật, `actor.listening`) | ≤300 ms | **17 ms** | ✅ |
| t(`user.text`) → t(câu đệm bắt đầu phát) | ≤400 ms | **259 ms** | ✅ |
| não trễ 8 s: đổi tư thế | ≥1 | **1** | ✅ |
| não trễ 8 s: câu nối | đúng 1 | **1** (câu "hơi lâu" 0) | ✅ |
| não trễ 8 s: chồng giọng | đỉnh 1 | **1** | ✅ |
| não trả lời ở 2 s: câu nối | 0 | **0** | ✅ |
| não trả lời ở 2 s: não nói sau lệnh | ngay | **8 ms** | ✅ |
| đang việc của não: `lookAt` | ≤300 ms | **6 ms** | ✅ |
| đang việc của não: hàng đợi | không mất | **queued 1**, 0 `cmd.interrupted` cho Nhi | ✅ |
| `r.ok` mọi lệnh | 100 % | **75/75** | ✅ |
| FPS chờ não vs rảnh | không tụt | **2 / 1 fps** | ✅ |
| console | 0 lỗi | **0** | ✅ |

STT giọng thật qua MediaRecorder của Firefox: «Nhi ơi hôm nay thế nào nhi ơi hồi» (tin 0.919, trễ 51209 ms).
Cổng riêng 8970-8973 + web 5397; không đụng 5173/8787-8790 của Boss.
