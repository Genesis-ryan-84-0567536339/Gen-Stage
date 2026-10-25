# Quyết định C2 — Hiểu lệnh giọng cho mọi nhân vật (26/10, Issue #32)

Những chốt chặn đã trả giá bằng code thật, ghi lại để đợt sau không làm lại từ
đầu. Spec: `docs/spec/actor-api.md` mục **3.6**. Kết quả chạy thật:
`docs/c2/ket-qua.md`.

- **Lệnh giọng KHÔNG thêm lệnh nào vào Actor API.** Nó là một lớp dịch đứng
  trước dispatcher: câu tiếng Việt → `dispatcher.run(cmd, args, 'giong')`. Nhờ
  vậy Sếp nói được đúng những gì Sếp bấm được, và mọi lệnh giọng vẫn có nhật ký,
  kiểm tham số, hàng đợi như lệnh của agent.

- **Ngữ pháp là DỮ LIỆU, danh sách là ĐỘNG.** Mẫu câu + từ đồng nghĩa nằm trong
  bảng `BANG_MAU_CAU` (`src/behavior/ngu-phap.ts`); còn place / emote / màn hình
  / module thì **lấy từ `stage.bootstrap`** lúc chạy. Thêm một place vào
  `noi-dung.ts` là lệnh giọng và tab "Giọng" tự biết, không sửa máy khớp.

- **Quyết định khớp phải ĐỒNG BỘ, giải nghĩa thì có thể chậm.** Bus phát
  `user.text` đồng bộ tới mọi người nghe, kể cả cầu nối ws đẩy sang não; muốn
  đánh dấu `handled: true` kịp lúc thì không được `await` gì trước đó. Vì vậy:
  danh sách place/emote/… **giữ sẵn trong bộ đệm** (tự nạp lại theo sự kiện sân
  khấu), còn thứ phải đo tươi (Sếp đang đứng đâu, ghế nào gần, góc máy kế tiếp)
  thì để **sentinel** `@cho-sep` / `@ghe-gan-nhat` / `@goc-may-ke` và giải nghĩa
  ở bước gọi lệnh.

- **Không bắn `user.text` hai lần.** Lớp này không bắn lại sự kiện nào: nó thêm
  `handled: true` vào chính `data` của sự kiện đang chảy, và bắn thêm
  `user.command` cho ai muốn nghe "lệnh đã hiểu". Não lọc bằng `handled` — ghi
  thành giao kèo trong spec 3.6, vì nếu não không lọc thì Sếp nhận hai câu trả
  lời cho một câu nói.

- **Lớp hiểu lệnh phải bật TRƯỚC cầu nối ws** (`src/main.ts`): bridge đăng ký
  người nghe `'*'` lúc mở WebSocket, nên thứ tự đăng ký quyết định cờ `handled`
  có kịp ra ngoài hay không.

- **Nhân vật tự nói thì phải tự nhận ra.** Javis là nhân vật `controlledBy:
  "owner"`, mà `actor.say` lên nhân vật đó **bắn `user.text`** (giao kèo B3).
  Javis xác nhận "Rõ Sếp" → sinh ra một `user.text` mới → lớp hiểu lệnh lại
  nghe. Chặn bằng sổ `tuNoi`: câu nào lớp này vừa cho nhân vật nói thì lần nghe
  lại chỉ đánh dấu `handled` rồi bỏ, không xử lý vòng hai.

- **Điểm khớp: slot có danh sách đáng 3, slot tự do đáng 1.** Mẫu `dung <ten>`
  (dựng module) ăn hết phần còn lại của câu, nên nếu chấm bằng nhau thì "làm gì"
  cũng thành `module.build`. Cho slot tự do 1 điểm là mẫu có từ khoá thật luôn
  thắng, và "dựng lại sân khấu" (4 từ khoá) thắng "dừng lại" (2 từ khoá).

- **Bỏ dấu là con dao hai lưỡi.** `dựng` / `đứng` / `dừng` cùng về `dung`, nên
  ba mẫu đó phải phân biệt bằng **từ đi kèm** (`dung len`, `dung lai`,
  `dung <ten>`), không bằng dấu. Tương tự: đã bỏ `ca nha` khỏi nhóm "mọi người"
  (nằm ngay trong lời thoại Sếp hay đọc: *nói "chào cả nhà"*) và bỏ `nghi di`
  khỏi nhóm "dừng" (lẫn với emote "suy nghĩ đi").

- **Fuzzy có ngưỡng theo độ dài từ.** Lệch ≤ 2 ký tự chỉ áp cho từ từ 6 ký tự
  trở lên; 4–5 ký tự cho lệch 1; ≤ 3 ký tự phải đúng y — không thì "bàn" khớp
  "bốn", "đi" khớp "đó".

- **Tên hiển thị đổi, `id` không đổi.** Nhân vật nam tên **Javis** nhưng `id`
  vẫn là `owner`: `controlledBy`, phím WASD, camera `theo-owner`, nguồn
  `user.text` và 42 tool MCP đều viết theo id đó. Bảng tên nằm trong
  `src/stage/noi-dung.ts` (`TEN_HIEN_THI`), `world.ts` chỉ đọc bảng.
