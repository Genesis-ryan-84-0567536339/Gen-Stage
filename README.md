# Gen-Stage

Sân khấu 3D trong trình duyệt: văn phòng nhỏ + nhân vật VRM sinh động.
Vite · TypeScript · Three.js · `@pixiv/three-vrm`.

## Chạy thử

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
