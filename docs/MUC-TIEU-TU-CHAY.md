# Mục tiêu tự chạy (Boss 28/10: "tự goal và tự chạy lại khi reload quota")

Bất kỳ phiên Claude nào mở repo này đều ĐỌC file này trước, rồi làm theo, không chờ Boss nhắc.

## Mục tiêu đích (không đổi)
Boss mở Firefox một tab `http://localhost:5173`, không phải chạm terminal: căn nhà ấm gọn, Nam (Boss lái, WASD mượt) và Nhi (não agy) đứng chạm sàn, tóc ổn, không trần; nói bằng giọng thật được hiểu ≥4/5 và nhân vật làm đúng; hỏi gì Nhi trả lời bằng giọng trong ≤10 s, nhìn máy quay; nhẹ GPU. Đo bằng `docs/KIEM-HOAN-CHINH.md` + Cửa 2 trong `docs/CONG-CHAT-LUONG.md`.

## Vòng lặp mỗi lần thức dậy (quota mở lại / phiên mới / cron)
1. `gh pr list --state open` + `git worktree list` + agent đang chạy (nếu có) → nhánh nào dở: nối lại từ chỗ dở (không làm lại), builder chết thì mở builder mới cùng worktree.
2. PR có review "Merge được" → rebase lên main, test/build, merge, dọn worktree. PR "Chưa" → giao sửa đúng lỗi chặn.
3. Khi không còn PR mở: chạy **Cửa 2 — đi một vòng như Boss** trên main (Firefox thật). Mục KHÔNG → mở Issue + builder. Tất cả ĐẠT → bật lại stack (`bash scripts/chay.sh tat && bash scripts/chay.sh`) và báo Boss MỘT lần kèm bảng.
4. Hết việc → đọc `docs/KIEM-TOAN-SKILL.md` (kiểm toán theo skill game dev) làm P1 trước, rồi Issue mở theo nhãn ưu tiên.
5. Ghi sổ `~/LinuxDataB/claude-note.md` mỗi bước.

## Trạng thái (cập nhật mỗi lần thức)
- 28/10 11:50: đang chạy G1 (trần/chân/tóc), G2 (tên Nhi/Nam), G3 (STT giọng thật), vòng Cửa 2 trên main 3c392e0, kiểm toán skill. Chưa có PR mở.
