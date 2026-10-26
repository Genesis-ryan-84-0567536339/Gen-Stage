# Gen-Stage

Sân khấu 3D trong trình duyệt: văn phòng nhỏ + nhân vật VRM sinh động.
Vite · TypeScript · Three.js · `@pixiv/three-vrm`.

## Chạy thử

Lần đầu trên máy mới — **một lệnh**, chạy một lần (tải asset 46 MB + bộ nhận
giọng Việt ~930 MB, và tạo biểu tượng **Gen-Stage** trong danh sách ứng dụng):

```bash
pnpm cai-dat
```

Từ đó về sau — **một lệnh**, bật tất cả (cầu nối + sân khấu + não của Gen +
mở trình duyệt), không tải gì nữa:

```bash
pnpm start       # bật · pnpm stop để tắt sạch
```

Chỉ muốn bản dev trần:

```bash
pnpm install
pnpm assets      # tải VRM + nội thất Kenney (CC0) — xem assets/LICENSES.md
pnpm dev         # http://localhost:5173
```

## Cho agent làm não nhân vật

```bash
pnpm bridge      # ws 8787 + giọng Việt 8788 + MCP 8789
pnpm dev         # rồi mở http://localhost:5173/?bridge=1
```

Nối não (agy CLI): [`docs/BOOTSTRAP-AGENT.md`](./docs/BOOTSTRAP-AGENT.md) —
một câu: *gọi `stage_bootstrap` trước, làm theo nó*.

Xem trên điện thoại cùng wifi: `pnpm dev --host` rồi mở địa chỉ `http://<IP máy>:5173`.

Chi tiết quy ước: [`CLAUDE.md`](./CLAUDE.md) · giấy phép asset: [`assets/LICENSES.md`](./assets/LICENSES.md)
