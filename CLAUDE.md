# Gen-Stage

Sân khấu 3D chạy trong trình duyệt: một không gian văn phòng nhỏ và nhân vật VRM
sinh động (chớp mắt, thở, nhìn theo chuột, đổi biểu cảm, đi lại giữa 2 bàn).
Stack: Vite + TypeScript + Three.js + `@pixiv/three-vrm`, không framework UI.
Mục tiêu đợt 0 (Issue #1): để Boss NHÌN thử trước khi chốt dự án.

## Lệnh

```bash
pnpm install              # cài phụ thuộc
pnpm assets               # tải asset (VRM + Kenney CC0) — chạy 1 lần sau khi clone
pnpm dev                  # chạy dev, mở http://localhost:5173
pnpm dev --host           # cho điện thoại cùng wifi vào xem
pnpm build                # tsc + vite build, phải không lỗi trước khi mở PR
pnpm preview              # xem thử bản build
```

## Quy ước

- **Không commit asset.** Mọi file 3D (`public/models/`, `public/kenney/`) đều nằm
  trong `.gitignore`; chỉ commit `scripts/fetch-assets.sh`. Không commit file > 5 MB.
- **Nguồn + giấy phép asset** ghi trong `assets/LICENSES.md`. Thêm asset mới thì
  phải thêm vào cả script tải lẫn file này.
- **Tiếng Việt**: giao diện, comment, commit, PR, báo cáo đều bằng tiếng Việt có dấu.
  Tên biến/hàm tiếng Việt không dấu cho phần nghiệp vụ cảnh (`phong`, `nhanVat`…),
  API của three.js giữ nguyên tiếng Anh.
- **Hiệu năng**: pixel ratio ≤ 2, shadow map 2048, chạy mượt trên điện thoại.
- Quy trình: Issue → branch → PR (`Refs #N`) → tự kiểm kèm bằng chứng → merge.
  Không merge khi chưa có ảnh/log chạy thật trong PR.

## Bố cục mã

| File | Việc |
| --- | --- |
| `src/main.ts` | renderer, camera/OrbitControls, ánh sáng, nút bấm, vòng lặp |
| `src/phong.ts` | dựng phòng: sàn, tường, cửa sổ, bàn ghế (Kenney hoặc fallback box bo tròn) |
| `src/nhanvat.ts` | nạp VRM + toàn bộ hoạt ảnh thủ công (procedural) |
| `scripts/fetch-assets.sh` | tải asset bằng curl, 3 lần thử, có fallback |
