# F3 — Voice chat trên Firefox (Issue #56 mục 3)

Boss, Firefox + GPU thật: **"voice chat không nghe"**.

## Nguyên nhân gốc — một câu

Trên Firefox, `getUserMedia()` **treo ở hộp hỏi quyền** cho tới khi Boss trả
lời; mic của Gen-Stage là **đẩy-để-nói**, nên Boss nhả phím V **trước khi** kịp
bấm "Cho phép" — bản cũ gặp `batLuc === 0` thì đóng mic và `return` **không
một dòng nào**. Và trên `http://localhost` Firefox **không nhớ quyền**, nên
lượt sau lại hỏi lại y thế: vòng lặp không bao giờ ra chữ.

Đo thật trên bản **trước khi sửa** (Playwright Firefox `firefox-1543`, cửa sổ
thật, `http://localhost`):

```
navigator.permissions.query({name:'microphone'}) → "prompt"
giữ V → getUserMedia() gọi lúc t=18618 ms … KHÔNG BAO GIỜ trả lời
nút 🎤 không đổi màu · 0 mẫu RMS · 0 byte gửi · ô chat trống
KHÔNG toast, KHÔNG lỗi console — chết lặng hoàn toàn
```

**Không phải** lỗi mic, ffmpeg, opus hay CORS: khi quyền đã có sẵn, cùng bản mã
đó chạy trọn vẹn trên Firefox (71 mẫu RMS, 81 417 byte opus, `POST /stt` 233 ms).

Vì sao C1 (#31) không bắt được: bằng chứng C1 chạy **Chromium** với
`--use-fake-ui-for-media-stream` — cờ đó cho quyền ngay, nên nó không bao giờ
gặp hộp hỏi quyền.

## Đã sửa gì

1. **Xin quyền mic ở nút "🔊 Bật tiếng"** (`src/audio/nut-tieng.ts` →
   `xinQuyenMic()` trong `src/audio/mic.ts`): một cú bấm Boss vẫn phải làm cho
   tiếng của Gen, giờ xin luôn quyền mic — hộp hỏi quyền hiện lúc Boss rảnh
   tay, không phải lúc đang giữ phím V. Nút vẫn hiện ở phiên sau nếu quyền mic
   còn thiếu.
2. **Firefox không nhớ quyền → giữ mic sẵn cả phiên**, track `enabled = false`
   ngoài lúc ghi (không nghe lén). Lượt nói sau: **0 lần** `getUserMedia`, 0
   hộp hỏi quyền, 0 ms trễ. Nếu Firefox có nhớ thì đóng mic lại, mở mỗi lượt
   ~30 ms.
3. **Không còn đường chết lặng**: mỗi bước ghi `console.info('[mic]', …)` và
   vào `window.stage.micDo().buoc`; nhả phím giữa lúc hỏi quyền thì mic được
   **giữ lại** + toast "bấm lần nữa để nói"; bị chặn / không có mic đều có một
   dòng hướng dẫn riêng.
4. **Ô chat có dòng trạng thái** (`#o-chat-tt`): `🎤 đang nghe…` →
   `⏳ đang nhận dạng…` → `nghe được: «…»`.
5. **Nút 🎤 nhận cả `touchstart/touchend`** (trình duyệt không có Pointer
   Events), chống bắn hai lần bằng cờ `dangMo`.
6. `bridge/stt.ts` khai thêm `Access-Control-Allow-Methods` +
   `Access-Control-Max-Age` — `audio/ogg; codecs=opus` của Firefox không an
   toàn theo CORS nên mỗi lượt nói đều có preflight.

## Hai cạm bẫy đã đo, ghi lại cho đợt sau

- **`MediaRecorder.mimeType` trả chuỗi RỖNG sau `stop()`** trên Firefox 147 —
  phải đọc ngay sau `start()`, không thì `Content-Type` gửi lên bridge thành
  `application/octet-stream` và số đo `dangBlob` trống.
- **Firefox không có cách nạp file vào mic giả** như
  `--use-file-for-fake-audio-capture` của Chrome
  (`media.navigator.streams.fake` chỉ cho một tiếng bíp), và Playwright Firefox
  **không hỗ trợ** `permissions: ['microphone']`. Nên `scripts/kiem-f3.mjs`
  bọc `getUserMedia`: vẫn gọi bản thật của Firefox (luồng quyền là thật) rồi
  thay nguồn âm bằng wav TTS của chính bridge.

## Bằng chứng

`node scripts/kiem-f3.mjs` (CHẠY MỘT LẦN, cờ `docs/f3/.da-chay`, cổng riêng
**8894-8897 + 5302** — không đụng 8787-8790/5173 của Boss). Kết quả lượt chạy:
**24/24 bước đạt**, 0 lỗi console.

| File | Nội dung |
| --- | --- |
| `00-tai-hien-treo.png` | Phần A — giữ V mà quyền còn treo, ô chat trống |
| `01-dang-nghe.png` | ô chat: "🎤 đang nghe…", nút 🎤 đỏ |
| `02-dang-nhan-dang.png` | ô chat: "⏳ đang nhận dạng…" |
| `03-nghe-duoc.png` | ô chat: "nghe được: «Gen ơi chào sếp»" |
| `04-toan-canh-1440.png` · `05-mobile-390.png` | bố cục 1440 và 390 px |
| `06-tu-choi-quyen.png` | toast hướng dẫn khi Firefox chặn mic |
| `nhat-ky-kiem-f3.json` | số đo từng bước, log `[mic]`, sự kiện |

Số chính: ô chat nhận đúng **"Gen ơi chào sếp"** (tin 0,955 · trễ 4487 ms ·
80 128 byte `audio/ogg; codecs=opus` · 71 mẫu RMS), `user.text` + `user.speech`
bắn đủ, và **`getUserMedia` gọi đúng 1 lần** cho cả hai lượt nói.

**Không có ảnh hộp hỏi quyền của Firefox**, và đó là giới hạn thật: hộp đó là
giao diện trình duyệt nên `page.screenshot()` không thấy, còn chụp cả màn hình
thì phiên GNOME Wayland trả ảnh đen. Bằng chứng thay thế là số: `getUserMedia`
có pha `goi` mà không bao giờ có `duoc`/`loi`.

## Boss phải làm gì

Mở trang → bấm **"🔊 Bật tiếng"** góc trên phải → Firefox hỏi quyền mic →
**Cho phép**. Xong. Từ đó giữ phím **V** (hoặc giữ nút 🎤 cạnh ô chat) để nói.
