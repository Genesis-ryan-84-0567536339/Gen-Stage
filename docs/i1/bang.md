| Thước đo (Issue #74) | Lời hứa | Đo thật | Kết |
| --- | --- | --- | --- |
| t(`user.listening on`) → t(`actor.lookAt` Nhi) | ≤150 ms | **7 ms** | ✅ |
| t(`user.text`) → t(gật, `actor.listening`) | ≤300 ms | **9 ms** | ✅ |
| t(**Nam dứt lời**) → t(câu đệm bắt đầu phát) | ≤400 ms | **null ms** | ❌ |
| câu đệm bắt đầu **sau** khi Nam dứt lời | bắt buộc | **—** | ❌ |
| não trễ 8 s: đổi tư thế | ≥1 | **1** | ✅ |
| não trễ 8 s: câu nối | đúng 1 | **1** (câu "hơi lâu" 0) | ✅ |
| **giọng thật cùng phát** (não 8 s) | đỉnh 1 | **2** | ❌ |
| **giọng thật cùng phát** (não 2 s, lúc cắt) | đỉnh 1 | **2** | ❌ |
| **giọng thật cùng phát** (trần tầng 2) | đỉnh 1 | **1** | ✅ |
| não trả lời ở 2 s: câu nối | 0 | **0** | ✅ |
| não trả lời ở 2 s: não nói sau lệnh | ngay | **4 ms** | ✅ |
| đang việc của não: `lookAt` | ≤300 ms | **9 ms** | ✅ |
| đang việc của não: hàng đợi | không mất | **queued 1**, 0 `cmd.interrupted` cho Nhi | ✅ |
| trần tầng 2: câu kết sau 30 s | đúng 1 | **0** | ❌ |
| trần tầng 2: emote phản xạ 35 s → 60 s | ngừng tăng | **0 → 0** | ✅ |
| trần tầng 2: nhịp thường sống lại | Nhi thả mắt | **lookingAt "camera"** | ❌ |
| `r.ok` mọi lệnh | 100 % | **95/95** | ✅ |
| console | 0 lỗi | **0** | ✅ |

STT giọng thật qua MediaRecorder của Firefox: «Nhi ơi hôm nay thế nào» (tin 0.952, trễ 29563 ms).
Cổng riêng 8970-8973 + web 5397; không đụng 5173/8787-8790 của Boss.
Đỉnh giọng đo bằng móc AudioBufferSourceNode.start/ended — chỉ lớp TTS dùng node đó.
FPS lượt này 2/2 (llvmpipe) — CỐ Ý không đưa vào bảng: số renderer phần mềm không nói được gì về mượt (Cửa 1).
