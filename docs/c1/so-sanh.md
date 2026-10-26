# C1 — chọn engine nhận dạng giọng Việt (Issue #31)

Đo **trên máy Boss**, không lấy số từ bài báo hay README của ai.

| | |
| --- | --- |
| CPU | Intel i7-4771 (Haswell, 4 lõi / 8 luồng, AVX2, **không AVX-512**) |
| GPU | NVE4 / nouveau → **không có CUDA dùng được** |
| RAM | 31 GB |
| Hệ | Fedora, Firefox là trình duyệt chính (**không có Web Speech API**) |
| Bộ thử | 10 câu lệnh tiếng Việt × 2 giọng (Hoài My + Nam Minh) = **20 wav 16 kHz**, sinh bằng đúng `bridge/tts.ts` của dự án |
| WER | khoảng cách sửa **theo từ**, chuẩn hoá bỏ dấu câu + chữ thường, **giữ dấu tiếng Việt** |

Sinh lại bộ thử và đo lại:

```bash
pnpm exec tsx scripts/do-stt.mjs mau                 # 20 wav vào .cache/stt/mau/
pnpm exec tsx scripts/do-stt.mjs cham <ten> <tsv>    # chấm WER/trễ một engine
node scripts/kiem-c1.mjs --lai                       # đo lại qua đúng POST /stt
```

## 1. Bảng đo

WER cột **thô** là chữ engine trả ra; cột **+ sổ từ** là sau `bridge/so-tu.ts`
(sửa tên riêng — xem mục 3). Trễ là thời gian cho **một câu**, model đã nạp sẵn
trong tiến trình (đúng cảnh `pnpm bridge` chạy thật), tải máy `load average`
6–17 vì có hai builder khác chạy song song.

| Engine | Cỡ model | WER thô | WER + sổ từ | Trễ TB | Trễ p95 | Kết |
| --- | --- | --- | --- | --- | --- | --- |
| **PhoWhisper-small ct2 int8** (faster-whisper) | 465 MB | 47,4 % | **5,3 %** | ~3,2 s | 13,5 s | ✅ **chọn** |
| faster-whisper small int8 (whisper đa ngôn ngữ) | 465 MB | 47,4 % | 17,1 % | ~4,0 s | 42,9 s | ❌ kém tiếng Việt |
| PhoWhisper-base ct2 int8 | 145 MB | 84,2 % | 67,1 % | ~3,0 s | 24,3 s | ❌ sai quá nhiều |
| Vosk `vosk-model-vn-0.4` | 78 MB | 56,6 % | 26,3 % | **0,24 s** | 0,65 s | ❌ nhanh nhưng sai |
| whisper.cpp small q5_1 | 182 MB | — | — | **14,6 s** | — | ❌ loại vì trễ |
| whisper.cpp large-v3-turbo q5_0 | 547 MB | — | — | **77,6 s** | — | ❌ loại vì trễ |
| PhoWhisper-medium ct2 int8 | 1,5 GB | — | — | ~10 s (ước theo cỡ) | — | ❌ loại vì trễ |

**Số chốt của bản chọn, đo qua đúng `POST /stt`** (20 câu, thợ đã hâm máy, cache
đã xoá trước khi đo):

| | lúc máy rảnh (load 6–7) | lúc máy bận (load ~14) |
| --- | --- | --- |
| WER | **7,9 %** (6/76 từ sai) | **7,9 %** — WER không phụ thuộc tải |
| Trễ trung vị | **3,22 s** ✅ | 7,69 s ❌ |
| Trễ trung bình | 3,95 s | 7,25 s |
| Trễ p95 | 18,5 s (câu đầu) | 18,6 s (câu đầu) |
| Độ tin trung bình | 0,95 | 0,95 |

`docs/c1/nhat-ky-kiem-c1.json` là lượt **máy bận** (load average 13,9 trên 8
luồng, hai builder AI khác đang chạy cùng máy): 13/14 bước đạt, bước duy nhất
không đạt là **mốc trễ**. Cột "máy rảnh" là cùng đúng bản code này, đo 15 phút
trước đó khi load 6–7. Chạy lại khi máy chỉ có Gen-Stage:
`node scripts/kiem-c1.mjs --lai`.

6 từ còn sai, cả 6 đều là một từ tiếng Việt thường engine nghe chệch, **không
phải tên riêng**: `cất` → `tức` / `các` (2 lần), `kết tinh` → `kết tinh mua đồn`,
`chào Gen` → `chào gang`, và một chữ `thóp` chen vào giữa. Boss sửa trong ô chat
được trước khi gửi (xem `src/audio/mic.ts`).

## 2. Vì sao loại từng lựa chọn

**whisper.cpp** — build từ nguồn (`ggml-org/whisper.cpp`, CPU, 8 luồng). Loại vì
**trễ**, không vì chất lượng: `small` q5_1 mất **14,6 s** một câu 3,5 s;
`large-v3-turbo` q5_0 mất **77,6 s**. Cùng cỡ model, CTranslate2 int8 nhanh hơn
whisper.cpp trên máy này **~4 lần** (3,2 s so với 14,6 s) — Haswell không có
AVX-512, mà ct2 int8 dùng GEMM số nguyên hiệu quả hơn nhiều so với ggml q5.
Và `large-v3-turbo` vẫn nghe "connector Baserow" thành "con nét to ba su rào",
tức **nâng cỡ model không chữa được** chuyện tên riêng (mục 3).

**faster-whisper small (whisper gốc, đa ngôn ngữ)** — WER sau sổ từ 17,1 % so với
5,3 % của PhoWhisper cùng cỡ. Nó nghe sai cả những câu rất thường: "cất module
lên kệ" → "Tức mồ đung lên kẹt", "bàn điều khiển" → "bàn điều khỉnh". PhoWhisper
là Whisper đã tinh chỉnh trên 844 giờ tiếng Việt (VinAI) nên hơn hẳn ở đúng việc
cần.

**PhoWhisper-base** — WER 67 % sau sổ từ. Nhanh hơn `small` không đáng kể (3,0 s
so với 3,2 s, vì cả hai đều phải chạy encoder trên cửa sổ 30 s) mà sai gấp 12
lần. Không có lý do chọn.

**Vosk `vosk-model-vn-0.4`** — nhanh **13 lần** (0,24 s) và đây là lựa chọn duy
nhất chạy được theo luồng thời gian thật. Nhưng WER 26 % sau sổ từ: nó nghe
"dừng lại" → "nhìn lại", "quay lại đây" → "quay lại đi" — sai **động từ lệnh**,
tức sai đúng chỗ không được sai. (Vosk có nhận dạng theo **văn phạm giới hạn**,
sẽ gần 0 % nếu khoá vào 10 câu mẫu — nhưng Boss nói tự do với Gen, khoá văn phạm
là tự bịt tai với mọi câu ngoài danh sách. Để lại cho đợt sau nếu cần "từ đánh
thức" nghe liên tục.)

**PhoWhisper-medium** — có bản ct2 int8 tải được (1,5 GB) nhưng cỡ gấp 3 `small`
nên trễ ~10 s trên CPU này. Vượt mốc 4 s, không đo tiếp.

## 3. Phát hiện quan trọng nhất: sai là do VỐN TỪ, không do âm học

Mọi engine đo được đều nghe **đúng** câu lệnh tiếng Việt thường:

```
đi tới bàn điều khiển   ✓      quay lại đây     ✓
mở màn hình chính       ✓      nói lại lần nữa  ✓      dừng lại  ✓
```

và **không engine nào** nghe ra tên riêng của dự án:

```
Gen                → ghen / gên / gang / gan
connector          → con nét to / cần nét / công nghệ
Baserow            → ba su rau / ba xu đâu / basura / ba sao
module             → mô đun / mua đùng / model
Kho Ryan           → kho rayon / kho raion / khoai rai ầng
```

Đó là **tên ngoài vốn từ** của model, nên:

- nâng cỡ model **không** chữa được (large-v3-turbo vẫn sai y thế, chỉ chậm hơn 24 lần);
- `initial_prompt` làm **tệ hơn**: PhoWhisper-small được mồi danh sách từ thì
  sinh ra câu không có thật ("video này sẽ diễn ra nhất thế giới của bạn nhé");
- `hotwords` của faster-whisper cũng làm tệ hơn ("kết tinh" → "thái tình").

Nên chỗ chữa là **sau** nhận dạng: `bridge/so-tu.ts` — sổ từ nhà. WER
47,4 % → **5,3 %**. Cách làm, và mấy cái bẫy đo thật mới thấy:

| Điều | Vì sao |
| --- | --- |
| Từ **dài** (≥ 4 ký tự khi bỏ dấu) khớp **mờ** theo khoảng cách sửa trên "dạng nghe" (bỏ dấu, bỏ khoảng trắng), ngưỡng 0,34 | `con nét to` → `connector` mà không phải kể trước từng cách nghe sai. Thêm connector mới = thêm một dòng |
| Từ **ngắn** (`Gen`) chỉ khớp theo **danh sách đồng âm** khai tay | 3 ký tự thì khớp mờ bắt cả `gần`, `đến` |
| **Không** khai từ Việt thường vào sổ | Bản đầu khai `tuc` là đồng âm của `kết tinh` → "cất module lên kệ" thành "kết tinh module lên kệ". Khai `màn hình` → "mở màn hình chính" **mất chữ "mở"** |
| **Không** nới ngưỡng cho tên nước ngoài, mà khai đồng âm | Nới `Kho Ryan` lên 0,5 thì "khó bảo ghê" thành "Kho Ryan Gen" |
| Hoà điểm thì lấy cửa sổ **ngắn** hơn | `mô đun lên` và `mô đun` đều cách `module` 2 ký tự → lấy dài là mất chữ `lên` |
| Bỏ `ghê`, `đen`, `kem`, `game`, `gian` khỏi đồng âm của `Gen` | Thà bỏ sót một cách nghe sai hơn sửa bừa câu Boss nói đúng (WER 3,9 % → 5,3 %, đổi lấy không có dương tính giả) |

Tất cả các bẫy trên đều có test giữ trong `src/api/__tests__/c1-stt.test.ts`.

## 4. Vì sao trễ nhảy từ 3 s lên 15 s

Hai thứ, cả hai đã xử lý hoặc đã ghi rõ:

1. **Thợ nguội** (đã xử lý). 6 câu đầu sau khi bật bridge mất 10–24 s rồi mới về
   3,1 s: ct2 mmap `model.bin` 465 MB và nạp trang theo nhu cầu, cộng bể luồng
   OpenMP và model VAD Silero nạp lười. `bridge/stt-worker.py` giờ **đọc trước**
   cả `model.bin` vào page cache rồi chạy 4 lượt hâm máy trước khi báo "sẵn
   sàng" — Boss không chịu khoản này.
2. **Tranh CPU** (không xử lý được, chỉ ghi). Whisper dùng 4 luồng; lúc đo máy
   đang có hai builder AI khác + Chrome + agy, `load average` 6–17 trên 8 luồng.
   Câu nào trúng lúc tải cao thì 10–15 s. Vì vậy bảng chốt bằng **trung vị**, và
   `docs/c1/nhat-ky-kiem-c1.json` ghi kèm `loadavg` để đọc số cho đúng.

Trễ **không** phụ thuộc độ dài câu nhiều như tưởng: câu 1,9 s và câu 3,5 s đều
~3,1 s, vì Whisper luôn chạy encoder trên cửa sổ đệm 30 s. Nên cắt im lặng
(`src/audio/vad.ts`) tiết kiệm ở **giải mã** và ở **chất lượng** (bớt chỗ cho
model nghe ra câu không có), không ở encoder.

Một bẫy đo thật: cắt đầu câu quá tay thì **mất phụ âm đầu** — thử cắt 200 ms
thấy "dừng lại" → "đừng lại", "mở màn hình" → "ở màn hình", "đi tới" → "khi
tới". Vì thế VAD chừa lại `chuaMs = 120` ms mỗi đầu.

## 5. Chốt

- **Engine**: PhoWhisper-small (VinAI) bản CTranslate2 int8, chạy qua
  `faster-whisper` trong venv `.cache/stt/venv`, 4 luồng CPU.
- **Cài**: `bash scripts/fetch-stt.sh` (một lần, 465 MB vào `.cache/stt/`, không
  commit). `scripts/chay.sh` gọi sẵn.
- **Đường đi**: `src/audio/mic.ts` → `POST /stt` (`bridge/stt.ts`, cổng 8790) →
  ffmpeg 16 kHz mono → thợ python → `bridge/so-tu.ts` → ô chat → `actor.say`
  owner → `user.text` + `user.speech`.
- **Giấy phép**: PhoWhisper (VinAI) Apache-2.0 · faster-whisper MIT ·
  CTranslate2 MIT · whisper.cpp MIT · Vosk Apache-2.0. Không thư viện copyleft
  nào vào bridge (cùng nguyên tắc với `bridge/tts.ts`).
