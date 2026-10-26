# G3 — nhận dạng giọng THẬT của Boss (Issue #62, review #67)

Boss 28/10: **"nhận diện giọng nói tào lao quá"**. Tài liệu này là số đo trả
lời câu đó, và lý do chọn cấu hình.

## 0. Vì sao số của C1 đẹp mà vô dụng

`docs/c1/so-sanh.md` chốt WER **7,9 %**. Số đó đúng — trên **giọng TTS**:
Hoài My / Nam Minh, tốc độ mặc định, không nhiễu, băng rộng, phát âm chuẩn
từng dấu. Boss thì nói nhanh, câu tự nhiên, qua mic laptop, trong phòng có
quạt. Đó là hai tín hiệu khác hẳn nhau.

Và **không ai từng đo được trên giọng Boss**, vì bridge không giữ âm:

```
$ ls .cache/stt/cache/ | wc -l     # 16 tệp .json — chỉ có CHỮ
$ find .cache/stt -name '*.ogg'    # 0 tệp — không có ÂM nào
```

Nên việc đầu tiên của G3 không phải đổi model, mà là **mở sổ thu** (mục 4).

## 1. Bảng so engine trên bộ "bẩn"

Bộ thử: 30 câu TTS **làm bẩn như mic laptop** (`node scripts/do-stt.mjs ban`)
— 20 câu lệnh + 10 câu đời thường lấy từ log giọng thật trong Issue #62. Cách
làm bẩn, và vì sao từng bước (tốc độ +20…40 %, lọc 300–3400 Hz, nhiễu hồng
~−30 dBFS, reverb, nén động cắt đỉnh): chú thích đầu `scripts/do-stt.mjs`.

Đo bằng **đúng thợ của bridge** (`bridge/stt-worker.py`, nạp model một lần,
hâm máy 4 lượt, 8 luồng) qua `node scripts/do-stt.mjs chay <tên> <model>`.

| Engine | Cỡ | WER cả bộ | WER câu lệnh | WER đời thường | Trễ TB | Trễ trung vị | p95 | loadavg lúc đo | Kết |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **PhoWhisper-small ct2 int8** | 465 MB | 31,8 % | 42,3 % | 16,7 % | 4,30 s | **3,90 s** | 6,15 s | 2,4–6,4 | ✅ **giữ** |
| PhoWhisper-medium ct2 int8 | 1,5 GB | 31,1 % | 43,6 % | 13,0 % | 15,33 s | 13,82 s | 29,9 s | 6,4 | ❌ trễ ×3,5 |
| PhoWhisper-large ct2 int8 | 2,9 GB | **26,5 %** | **34,6 %** | 14,8 % | 23,10 s | 21,71 s | 39,9 s | 11,2 | ❌ trễ ×5,6 |
| whisper large-v3-turbo ct2 int8 | 1,6 GB | 62,9 % | 64,1 % | 61,1 % | 15,95 s | 14,12 s | 19,4 s | 17,7 | ❌ sai gấp đôi |

> **Đọc bảng cho đúng**: `loadavg` khác nhau vì G1/G2 chạy song song trên cùng
> máy 8 luồng. WER **không** phụ thuộc tải (đo lại ở C1 mục 4 đã xác nhận), còn
> trễ thì có — nên cột trễ của large/turbo là số **bi quan**. Kể cả chia đôi,
> large vẫn ~11 s và turbo ~7 s: cả hai vẫn vượt mốc 5 s.

Ba điều bảng này nói ra:

**1. Nâng cỡ model gần như không chữa được, và chữa thì quá đắt.** Medium gấp 3
cỡ small mà WER **31,1 % so với 31,8 %** — chênh 0,7 điểm, trễ ×3,5. Large có
hơn thật (**26,5 %**, bớt 5,3 điểm, và câu lệnh từ 42,3 % xuống 34,6 %) nhưng
trễ ×5,6 — 21,7 s cho một câu nói. Đây là hình đã gặp ở C1 mục 3 với tên riêng,
chỉ khác chỗ nghẽn: lần này cái làm engine nghe sai là **âm học** (băng hẹp,
nhiễu, nói nhanh), và thêm tham số cho model không sinh lại được thông tin đã
mất ở micro.

**2. Whisper đa ngôn ngữ vẫn kém PhoWhisper ở tiếng Việt — kém gấp đôi.**
`large-v3-turbo` WER **62,9 %**, tệ hơn cả `PhoWhisper-base` của C1. Nó nhanh
hơn large (15,9 s so với 23,1 s, đúng như tên "turbo") nhưng nhanh mà nghe sai
hai phần ba thì vô nghĩa. C1 đã đo đúng kết luận này ở cỡ `small`; G3 xác nhận
nó vẫn đúng ở cỡ `large`.

**3. Câu đời thường DỄ nghe hơn câu lệnh** — ở mọi engine PhoWhisper (16,7 % so
với 42,3 % ở small). Nghe ngược với trực giác, nhưng đúng: câu lệnh chứa toàn
**tên riêng** của dự án ("connector Baserow", "module", "kệ module") — đúng cái
`bridge/so-tu.ts` sinh ra để chữa — còn câu đời thường thì toàn từ Việt thường
mà model đã biết rất rõ. Nên WER cao ở câu lệnh **không** đáng lo bằng con số
nó hiện ra: phần lớn là tên riêng, và sổ từ nhà xử lý được.

Hệ quả cho hướng sửa: tiền nên đổ vào **tín hiệu vào** (ràng buộc mic, VAD
chừa lề, nói cho Boss biết đang nghe bằng mic nào) và vào **lớp hiểu lệnh**
(mẫu đời thường, luật gọi tên) — chứ không vào model lớn hơn. Hai mục dưới là
số đo của đúng hai chỗ đó.

### Vì sao KHÔNG làm "2 tầng" (small trả nhanh, bộ lớn chốt lại)

Issue #62 gợi ý hai tầng. Số đo nói là **không nên**, ít nhất chưa:

- Tầng lớn phải **hơn hẳn** mới bù được rắc rối. Medium hơn 0,7 điểm WER — đổi
  một câu `user.text` sửa lại (kèm cờ `revised`) mà mọi lớp nghe sự kiện phải
  học cách xử lý, để lấy 0,7 điểm, là lỗ.
- Tầng lớn chạy **song song** với small thì hai bên tranh 8 luồng, làm chậm cả
  tầng nhanh — đúng chuyện `docs/c1/so-sanh.md` mục 4 đã đo (trễ ×2 khi máy có
  việc khác).
- Câu đã **chạy rồi** mới sửa thì Gen phải hoàn tác hành động vừa diễn. Đó là
  rủi ro lớn hơn nhiều so với 0,7 điểm WER.

Giữ cửa mở: `scripts/do-stt.mjs chay` đo lại bằng một lệnh khi có bộ mẫu giọng
thật của Boss (mục 4). Nếu trên giọng thật mà bộ lớn hơn **rõ rệt**, hai tầng
đáng làm lại — nhưng quyết định đó phải dựa trên số của giọng Boss, không phải
số của TTS.

## 2. Gọi tên "Nhi" / "Nam" bằng giọng (review #67)

Review độc lập #67: gọi tên mới chỉ **5/10** đúng người. Đo lại end-to-end qua
**đúng hai lớp sản phẩm đi qua** (`node scripts/do-stt.mjs ten` rồi `do-ten`):
wav bẩn → thợ → `bridge/so-tu.ts` → `src/behavior/hieu-lenh.ts` → *ai là người
nhận*. WER không trả lời được câu này: nghe "Nhi" thành "nia" chỉ tính **một**
từ sai, mà hậu quả là cả câu lệnh chạy sang nhân vật khác.

| | trước G3 (#67 đo) | sau G3 | mốc |
| --- | --- | --- | --- |
| 10 câu gọi tên → **đúng người** | 5/10 | **8/10** | ≥ 8/10 ✅ |
| 6 câu từ thường → nhầm thành gọi tên | — | **0/6** | 0 ✅ |

Số đầy đủ từng câu: `.cache/stt/ketqua/ten-small-int8.json`. Hai câu còn trượt,
ghi lại nguyên văn vì chúng cho thấy **giới hạn thật**, không phải chỗ quên:

```
«Nam à đứng lên đi»  → engine nghe "nam tài đính lên đi"  → không gọi ai
«Nhi nhìn Nam»       → engine nghe "nhi nhĩ nam"          → không gọi ai
```

Cả hai đều là ca tiếng gọi/động từ bị **nhoè vào nhau** ("à đứng" → "tài
đính", "nhìn" → "nhĩ"). Chữa được bằng cách nới cổng động từ, nhưng nới là
"nam tài giỏi" / "nam nhi" (một từ Hán-Việt có thật) cũng thành lời gọi. Hai
câu này rơi về người nhận mặc định — Boss nói lại một lần là xong — trong khi
nới cổng thì mỗi câu đời thường có chữ "nam" đều có thể bắt nhân vật diễn.
Chọn bỏ sót.

Ba nguyên nhân và cách sửa — chi tiết trong chú thích
`NGHE_NHAM_TEN` (`src/behavior/ngu-phap.ts`) và `suaTenDauCau`
(`bridge/so-tu.ts`):

1. **"Nhi" dài 3 ký tự → ngưỡng fuzzy là 0** (`nguong()`): `nia`/`nghi`/`ni`/
   `nhì` trượt hết. Fuzzy không cứu được, phải khai cách nghe chệch.
2. **Luật cũ đòi dấu phẩy** ("Nam, mở đèn"). Giọng nói không bao giờ có dấu
   phẩy — STT trả một dòng chữ liền — nên "Nam đi tới bếp" không ai nhận là
   gọi. Luật mới: tên ở **đầu câu** + theo sau là tín hiệu gọi ("ơi"/"à") hoặc
   một **động từ lệnh**.
3. **Bí danh `gien` + fuzzy ≤1 ký tự bắt luôn `mien`** → "miền nam mùa này mưa
   nhiều" thành gọi Nhi. Bỏ `gien`.

Bốn ràng buộc giữ luật mới khỏi ăn vào câu thường, mỗi cái chặn một ca đo
được (test: `src/behavior/__tests__/g3-goi-ten-giong.test.ts`):

| Ràng buộc | Ca nó chặn |
| --- | --- |
| chỉ nhận ở **đầu câu** | "đi về phía nam", "miền nam…" |
| phải có **động từ lệnh / "ơi"** ngay sau | "nam châm hút sắt", "nhí nhảnh quá" |
| động từ ở cổng so **khớp y, không fuzzy** | `cham` cách `chao` đúng 1 ký tự → "nam châm" lọt nếu fuzzy |
| cách nghe chệch trùng hẳn từ thường (`nghi`) cần động từ **không mơ hồ** | "nghỉ đi cho đỡ mệt" |

Và `TIN_HIEU_GOI` **không** chứa `nay`: "**năm nay** nhà mình đi du lịch" khớp
ngay `nam` + `nay` ở hai ô đầu. Mất một cách gọi ít dùng ("Nhi này"), đổi lấy
không nhận bừa một câu đời thường rất hay gặp.

Nguyên tắc chung: **thà bỏ sót một lời gọi** (câu rơi về người nhận mặc định)
hơn là bắt nhân vật diễn giữa lúc Boss đang nói chuyện.

## 3. Câu đời thường (việc 5 của #62)

Log thật 28/10 cho thấy lớp hiểu lệnh chỉ bắt mẫu kiểu tài liệu:

| Boss nói | Engine nghe | Trước G3 |
| --- | --- | --- |
| "tôi kêu hai bạn qua ghế ngồi đi" | "…qua hồi đi mà dính dáng hồi đi" | trượt |
| "Gen ơi, qua ghế ngồi đi" | "dạ nơi qua ghế ngồi đi" | trượt |
| "tôi kêu bạn đi kiếm chỗ ngồi" | **nghe đúng từng chữ** | vẫn trượt |

Câu thứ ba là câu đáng chú ý nhất: engine nghe **đúng**, mà lệnh vẫn mất. Gốc
là cách tính điểm — mỗi từ không dùng tới bị trừ 0,7 (`diemThat`), nên hai ba
từ đệm đầu câu ("tôi kêu…") đủ đẩy mẫu xuống dưới ngưỡng 1,5. Vì thế
`keu`/`bao`/`nho` được khai thành **từ khoá của mẫu** chứ không để máy bỏ qua.

15 câu đời thường, mốc Issue ≥ 12 đúng: **15/15**
(`src/behavior/__tests__/g3-ngu-phap.test.ts`, và chạy lại qua đúng cửa ô chat
trong `scripts/kiem-g3.mjs`).

Câu **có tên mà không mẫu nào khớp** (như dòng 1 ở bảng trên, engine nghe nát)
thì `user.text` mang thêm `hint: 'co-the-la-lenh'` để não trả lời ngắn và hỏi
lại. **Chỉ thêm một trường**, không đổi luồng, không tự đoán lệnh: đoán sai là
Nhi làm sai việc, còn hỏi lại một câu thì không mất gì.

## 4. Sổ thu giọng thật — thứ phải có trước mọi số đo sau này

Từ G3, mỗi lượt Boss nói để lại trong `.cache/stt/thu/` (vòng **50** tệp, nằm
trong `.gitignore` — giọng Boss là dữ liệu riêng, KHÔNG vào repo):

```
<ts>.ogg     đúng byte MediaRecorder gửi (chưa qua ffmpeg)
<ts>.json    chữ + chữ thô + độ tin + dải cắt VAD + model đã dùng
```

Và dòng "nghe được: «…»" ở ô chat có nút **"✎ Sửa"**: Boss chữa chữ nghe sai →
`POST /stt/mau` ghi cặp `(giọng thật, chữ đúng)` vào `.cache/stt/mau/`. Bộ kiểm
chuẩn **tự dài ra mỗi lần Boss sửa** — không ai phải ngồi thu mẫu riêng.

**Cách Boss góp một câu** (một dòng): nói một câu → thấy chữ sai trong ô chat →
bấm **✎ Sửa** → gõ lại chữ đúng → bấm **✓ Lưu mẫu**.

Khi có mẫu thật rồi, đo lại trên **giọng Boss** bằng:

```bash
node scripts/do-stt.mjs thu                           # dựng bộ từ .cache/stt/mau
node scripts/do-stt.mjs chay small-that --bo .cache/stt/mau
bash scripts/fetch-stt.sh bo-do                       # tải medium/large/turbo để so
node scripts/do-stt.mjs chay medium-that .cache/stt/models/PhoWhisper-medium-ct2 \
  --bo .cache/stt/mau
```

Mọi lượt đo ghi kèm `loadavg`: cùng một bản code, trễ trung vị đi từ 3,2 s lên
7,7 s chỉ vì máy có builder khác chạy (`docs/c1/so-sanh.md` mục 4). Không ghi
tải máy là đọc bảng trễ sai.

## 5. Tín hiệu vào — bốn chỗ sửa ở tầng mic

| Sửa | Vì sao (số đo / log thật) |
| --- | --- |
| `getUserMedia` xin thêm **16 kHz mono** | engine chỉ nhận dạng đó; lấy đúng từ mic bớt một lần lấy mẫu lại. Dạng **trần**, không `exact`: `exact` làm mic cũ ném `OverconstrainedError` và Boss mất hẳn mic |
| VAD chừa **200 ms** mỗi đầu (trước 120) | log thật: "Gen ơi, qua ghế ngồi đi" → **"dạ nơi** qua ghế ngồi đi" — mất hẳn tiếng gọi. Giọng Boss vào câu ngay khi vừa bấm nên phụ âm đầu nằm TRƯỚC mép RMS. 200 ms im thêm không đổi trễ: Whisper luôn chạy encoder trên cửa sổ 30 s |
| **Toast tên thiết bị mic**, một lần/phiên | laptop Boss có mic trong máy + webcam + tai nghe; Firefox lấy "mặc định hệ thống" và cái đó đổi theo lần cắm cuối. Mic trong thân máy cách miệng 50 cm thì model nào cũng sai — đây là chỗ Boss **tự** thấy được |
| **Chạm nhanh = bật/tắt** thay vì bỏ lượt | bản cũ coi mọi lượt < 250 ms là "bấm lỡ" rồi **im**. Skill `input-systems`: hành động chỉ-giữ phải có bản bật/tắt tương đương, và mọi lượt vào phải có phản hồi |

## 6. Chốt

- **Engine giữ nguyên**: PhoWhisper-small ct2 int8. Bộ lớn hơn **không** hơn
  về WER trên giọng bẩn mà trễ gấp 3,5 lần.
- **Không làm 2 tầng** lúc này — lý do ở mục 1.
- Tiền đổ vào **tín hiệu vào** (mục 5) và **lớp hiểu lệnh** (mục 2, 3).
- Việc còn lại thuộc Boss: **góp 10 câu giọng thật** bằng nút "✎ Sửa" (mục 4).
  Sau đó chạy lại bảng mục 1 trên bộ `.cache/stt/mau` — chỉ lúc đó mới có số
  đo thật sự của giọng Boss.
- Bằng chứng chạy máy thật: **21/21 bước đạt** —
  `docs/g3/nhat-ky-kiem-g3.json` + ảnh cùng thư mục (`node scripts/kiem-g3.mjs`,
  Firefox thật, mic giả đọc wav TTS qua `MediaRecorder` thật, cổng 8940-8943 +
  web 5380). Trong đó: có tệp audio thô trong `.cache/stt/thu/`, nút "✎ Sửa"
  ghi đủ cặp `.ogg`/`.txt`/`.json` vào `.cache/stt/mau/`, ràng buộc mic đúng cả
  5 cờ, toast tên thiết bị, **15/15** câu đời thường ra đúng hành động, câu nát
  mang `hint: 'co-the-la-lenh'`, console 0 lỗi.

  Một số trong nhật ký đó **đừng đọc như trễ thật**: trễ 32 s của lượt nói là
  vì `loadavg 9,6` (G1/G2 chạy song song) **và** vì script xoá sạch
  `.cache/stt/cache` trước khi đo nên thợ phải nạp model từ đầu. Trễ Boss gặp
  là cột "trung vị" ở bảng mục 1 (3,90 s).
