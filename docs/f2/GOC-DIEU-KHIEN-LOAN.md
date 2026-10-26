# F2 (#56 mục 2) — vì sao "điều khiển loạn tùm lum" trên GPU thật

Boss báo điều khiển loạn khi mở **Firefox + GPU thật**. Mọi bằng chứng B1/D1b
trước đó chụp trên **Chromium + swiftshader (~1 FPS)** và đều "sạch". Tài liệu
này ghi lại cái gì đã che mắt bằng chứng cũ, và từng gốc đã sửa ra sao.

## Vì sao ~1 FPS che hết lỗi

Gần như mọi chỗ làm mượt trong repo viết dạng:

```ts
x += (muc - x) * Math.min(1, dt * k);   // hoặc min(1, dt / tau)
```

Ở `dt ≈ 1 s`, `dt * k` và `dt / tau` đều **vượt 1 rồi bị kẹp về 1** → bám
**tức thì**. Nghĩa là trên máy kiểm, mọi bộ làm mượt đều biến thành "nhảy
thẳng tới đích": không trễ, không vọt, không giật — và cũng **không kiểm được
gì**. Lên 60 FPS cùng dòng code mới thực sự nội suy, và lúc đó mấy tật dưới
đây hiện ra.

Phụ lục số: với `τ = 0,12 s`, hệ số đúng là `1 − e^(−dt/τ)`.

| FPS | `dt`     | `min(1, dt/τ)` | `1 − e^(−dt/τ)` | lệch |
|-----|----------|----------------|-----------------|------|
| 144 | 6,9 ms   | 0,058          | 0,056           | 3 %  |
| 60  | 16,7 ms  | 0,139          | 0,130           | 7 %  |
| 10  | 100 ms   | 0,833          | 0,565           | 47 % |
| 1   | 1 000 ms | 1,000 (kẹp)    | 1,000           | —    |

## Bốn gốc, đo được trên Firefox GPU thật

### 1. Phím gối lệnh `steer` 100/180 ms → vận tốc nhảy bậc

`src/ui/phim.ts` gửi một `actor.steer` **mới** mỗi 100 ms với hiệu lực 180 ms.
Mỗi lệnh mới chạy trọn `huyViec()` + `roiGhe()` + `clip = null` +
`batDauViec()`. Ở ~1 FPS cả chục lệnh rơi vào **cùng một khung** nên chỉ lệnh
cuối để lại dấu. Ở 60 FPS thì cứ 6 khung lại xé-dựng-lại hành động một lần, và
180 ms chỉ hơn nhịp 100 ms có 80 ms — một lượt GC là hạn cũ hết trước khi lệnh
sau tới, vận tốc mục tiêu tụt về 0 rồi vọt lại.

Đo được (vòng dò đầu tiên, lúc **đang giữ** một phím, không nhả):

```
t=13408  |v|=1.5997
t=13503  |v|=0.3200   ← hạn cũ hết, mục tiêu về 0
t=13600  |v|=1.1477   ← lệnh mới tới, ga lại
```

**Sửa:** `NhanVat.lai()` nhận ra vector không đổi thì **gia hạn tại chỗ** (đẩy
`han`, trả lại đúng `Action` cũ, không xé hành động). Phím gửi `ms = 700` và
gia hạn mỗi 200 ms — dư 3,5 lần biên an toàn. Nhả phím / `blur` /
`visibilitychange` gửi lệnh dừng **ngay trong cùng tick**, không chờ nhịp.

### 2. Va chạm nhân `0,2` → "chạy bộ tại chỗ"

`capNhat` cũ: `if (bị chặn) this.vz *= 0.2`. Mỗi khung ga kéo vận tốc lên, va
chạm lại nhân 0,2; hai bên gặp nhau ở một **điểm cân bằng khác 0** trong khi
toạ độ không hề nhích.

Đo được: owner spawn ở (−4,5; 2,6), cách mép sofa 0,26 m. Giữ W:

```
z: 2.600 → 2.573 → 2.420 → 2.420 → 2.420 → … (đứng im vĩnh viễn)
|v|: 0.53 → 1.35 → 0.31 → 0.24 → 0.23 → 0.23 …   state = walking mãi
```

Chân guồng, người đứng im, `state` mắc ở `walking`. Đây gần như chắc chắn là
cái Boss thấy đầu tiên khi bấm W.

**Sửa:** chặn trục nào thì **xoá hẳn** thành phần vận tốc trục đó (0, không
phải ×0,2) — vẫn trượt tự do theo trục còn lại, và chặn cả hai trục thì `|v|`
về 0 thật → `idle`. Ngưỡng so sánh đổi từ "nửa bước" sang `1e-6`: ở 60 FPS một
bước chỉ 0,027 m nên ngưỡng nửa bước **báo chặn oan**, tức tự sinh giật ở đúng
cái FPS cao mà Boss dùng.

### 3. Xoay người `dt * 9` → lật 600 °/s

`rotation.y += lech * min(1, dt * 9)`: ở 1 FPS kẹp về 1 = **quay tức thì** (nên
bằng chứng cũ không bao giờ thấy); ở 60 FPS, 180° hết ~0,3 s = 600 °/s. Thêm
nữa, `lech` đúng bằng ±π là đối xứng — hai khung liền nhau có thể chọn hai
chiều ngược nhau theo nhiễu số học → thân lắc.

**Sửa:** xoay theo thời gian thật (`1 − e^(−dt/τ)`, τ = 0,1 s) **và** kẹp trần
tốc độ góc 2π rad/s; `lechGoc()` chốt mốc π về `+π` cho xác định. Quay theo
vận tốc **mục tiêu**, không theo vận tốc hiện tại (lúc đổi A→D vận tốc đi qua
0, lấy hướng của nó thì mặt quay loạn quanh điểm đó). Áp cùng cách cho cả
`actor.moveTo` (`dt * 7`).

### 4. Camera `theo-owner` lerp bậc một → luôn đuổi theo

`camera.position.lerp(dich, min(1, dt * 2.6))`: không độc lập FPS, và lọc bậc
một thì trễ xác lập = `v / k` = 1,6/2,6 = **0,62 m** khi nhân vật đi 1,6 m/s.

**Sửa:** lò xo **giảm chấn tới hạn** (`buocLoXo`, semi-implicit nên ổn định ở
mọi `dt`, damping tới hạn nên **không bao giờ vọt quá → không dội → không
rung**). ω = 9 rad/s ⇒ trễ `2v/ω` = 0,36 m. Đo trên Firefox GPU thật: 309
khung camera, **1** lần đổi chiều (ngưỡng cho phép 3).

## Những nghi vấn ĐÃ kiểm và KHÔNG phải gốc

- **WASD bắt khi focus ô chat** — không tái hiện: `dangGoChu()` của bản B1 đã
  chặn đúng (`INPUT`/`TEXTAREA`/`contentEditable`). Vẫn gia cố thêm: soi
  `shadowRoot`, bỏ qua `isComposing` (bộ gõ telex dùng `w`, `s`, `d` làm nguyên
  liệu chữ), và **dừng nhân vật** khi Boss đang giữ phím rồi nhảy vào ô nhập —
  vì `keyup` sau đó rơi vào ô nhập, không về tới sân khấu.
- **Mất `keyup` khi đổi tab → đi mãi** — bản B1 đã xoá tập phím khi `blur`,
  nhưng lệnh dừng phải **chờ nhịp 100 ms**, mà tab bị ẩn thì `setInterval` bị
  hạ xuống ~1 lần/giây. Giờ gửi ngay tại handler, cộng `visibilitychange` và
  `pagehide`.
- **Cả Gen lẫn owner nhận steer** — không: phím đọc `controlledBy === 'owner'`
  qua `stage.describe`, chỉ một actor.

## Thước FPS `?fps=1` báo sai (gộp vào F2)

Boss thấy "FPS trung bình 60.0 / 1% xấu nhất NaN" trên renderer ~1 FPS. Gốc
nằm trong `src/ui/do-fps.ts` bản D1b:

1. `trungBinh([])` **trả về `1000/60`** — một con số bịa. Khi khung đầu mất hơn
   10 giây (biên dịch shader trên renderer phần mềm là chuyện thường), vòng đo
   kết thúc với đúng 1 mẫu, `slice(1)` ra mảng rỗng → in "60.0";
2. cắt warmup theo **phần trăm** (`floor(n·0,1)`) nên `n` nhỏ là cắt sạch;
3. phân vị `floor(n·0,99) − 1` lệch một bậc, và `NaN` khi mảng rỗng.

**Sửa:** tách phần tính thành `chotFps()` (test được), cắt warmup theo **thời
gian** (0,5 s) và chỉ khi còn ≥ 8 mẫu, phân vị theo nearest-rank
`ceil(0,99·n) − 1`, đo tới khi **đủ cả thời gian và đủ khung** (trần 40 s), và
**thiếu mẫu thì nói thiếu mẫu** chứ không bịa số. Thẻ giờ hiện thêm *số khung
đếm được* và *thời gian khung đỉnh* (ms).

Đo trên máy này (Firefox, GTX 780M / nouveau, 1280×800, cửa sổ Playwright):

```
khung đếm được  158 trong 10.03s
FPS trung bình  17.8
FPS 1% xấu nhất 7.5  (khung 134 ms)
```

## Đo lại

```bash
node scripts/kiem-f2.mjs --lai     # Firefox GPU thật, ghi docs/f2/
npx vitest run src/api/__tests__/f2-dieu-khien-muot.test.ts
```

Test đơn vị kiểm **cùng một giao kèo ở 1 / 10 / 60 / 144 FPS** — đó là chỗ
bằng chứng cũ hổng, và là chỗ phải canh để không tái phạm.
