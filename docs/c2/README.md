# C2 — Hiểu lệnh giọng cho mọi nhân vật (Issue #32)

Sếp gọi tên rồi ra lệnh bằng tiếng Việt; nhân vật xác nhận ngắn bằng giọng rồi
làm ngay. Câu nào không phải mệnh lệnh thì vẫn về não như cũ.

| File | Việc |
| --- | --- |
| `ket-qua.md` | Bảng kết quả: vòng kín trên app thật + 30 câu + 5 câu lỗi STT |
| `quyet-dinh.md` | Những chốt chặn đã trả giá bằng code thật |
| `nhat-ky-kiem-c2.json` | Số đo đầy đủ: sự kiện, lệnh, giọng, lỗi console |
| `bang-30-cau.json` · `bang-loi-stt.json` | Bảng chấm điểm do `pnpm test` sinh |
| `01…06-*.png` | Ảnh chạy thật (1440 px và 390 px) |

Chạy lại bằng chứng: `node scripts/kiem-c2.mjs --lai` (cờ khoá `.da-chay` cho
chạy một lần; bridge dùng bộ cổng riêng từ 8797 trở lên, tự tìm chỗ trống nên
không đụng bridge thật của Sếp ở 8787–8789).

Mã nguồn: `src/behavior/ngu-phap.ts` (bảng mẫu câu — **dữ liệu**),
`src/behavior/hieu-lenh.ts` (máy khớp + chạy lệnh), tab "Giọng" trong
`src/ui/panel.ts`. Spec: `docs/spec/actor-api.md` mục **3.6**.
