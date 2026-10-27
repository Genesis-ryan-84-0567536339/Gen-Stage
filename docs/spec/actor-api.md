# Gen-Stage Actor API — spec v0.1 (bản nháp để chốt)

Mục tiêu: **một bộ lệnh cố định** điều khiển nhân vật, đồ vật, camera, lời nói trên sân khấu 3D.
Mọi đường vào (nút bấm trên giao diện, ô dán kịch bản, MCP cho agent) đều đi qua **cùng một bộ phân phối lệnh**, nên:

- Boss bấm tay được gì → agent gọi được đúng cái đó, không lệch.
- Agent mới (agy CLI, Claude, Gen) connect vào, gọi `stage.bootstrap` một lần là có đủ sách hướng dẫn, không phải mò.

## 1. Kiến trúc

```
Giao diện (nút + ô kịch bản) ─┐
                              ├─► Dispatcher (1 hàm duy nhất: run(cmd, args)) ─► Sân khấu Three.js
Bridge Node (WebSocket) ──────┘
   ▲
   │ MCP (stdio / HTTP) — đăng ký vào Gen-hub làm connector `gen-stage`
   │
Agent (agy CLI / Claude / Gen)
```

- Gói lệnh: `{ "id": "a1", "cmd": "actor.moveTo", "args": { "actor": "lan", "to": "ban-2" } }`
- Trả lời: `{ "id": "a1", "ok": true, "result": {...} }` hoặc `{ "id": "a1", "ok": false, "error": "..." }`
- Sự kiện từ sân khấu gửi ngược lên agent: `{ "event": "actor.arrived", "data": {...} }`
- Mọi lệnh có hiệu ứng theo thời gian (đi, nói, chạy kịch bản) trả về ngay kèm `durationMs`, và bắn sự kiện khi xong.

## 1b. Số liệu hóa không gian (Boss quyết 03/10: AI gắn sau, nhưng mọi thứ phải đo được trước)

Não AI chỉ điều khiển tốt khi **đọc được thế giới bằng số**. `stage.describe` vì thế trả về đầy đủ, luôn cùng một khuôn:

```json
{
  "version": "0.1",
  "time": { "clock": "20:31", "bossPresent": true, "idleSec": 12 },
  "actors": [
    { "id": "gen", "pos": [1.2, 0, -0.8], "facing": 90, "at": "buc-trung-tam",
      "nearest": { "place": "buc-trung-tam", "distance": 0.2 },
      "state": "idle", "busy": false, "mood": "binh-thuong", "expression": "neutral",
      "holding": null, "lookingAt": "camera",
      "distances": { "ban-dieu-khien": 1.6, "ke-module": 3.2, "main": 1.1 } }
  ],
  "places": [ { "id": "ban-dieu-khien", "pos": [0,0,-2], "kind": "desk", "occupiedBy": null } ],
  "screens": [ { "id": "main", "pos": [0,1.6,-2.5], "showing": "code", "streaming": true, "lines": 42 } ],
  "props": [ { "id": "connector-baserow", "kind": "module", "shape": "book", "at": "ke-module" } ],
  "lastEvents": [ { "t": 1699..., "event": "module.built", "data": { "id": "connector-baserow" } } ]
}
```

Quy ước đo: mét, gốc tọa độ giữa phòng, `facing` độ (0 = hướng camera mặc định). `distances` tính sẵn để não không phải tự tính.

**Sửa spec (04/10, từ review A1):** `at` chỉ mang tên place khi actor **đã đứng yên tại đó**; đang `walking` thì `at: null`, kể cả khi đi ngang qua một place khác — "đang ở đâu" phải là câu trả lời dứt khoát, không để não phải đoán giữa "tới rồi" và "đi ngang". Bù lại, mỗi actor luôn có `nearest: { place, distance }` (place gần nhất, luôn có giá trị) để biết mình đang ở gần cái gì. Mỗi actor là một **máy trạng thái** rõ: `idle | walking | sitting | playing | speaking | emoting | building`; `busy=true` thì lệnh mới vào hàng đợi (hoặc `{ interrupt: true }` để cắt).

Mọi lệnh đi qua dispatcher đều được **ghi nhật ký** `{ t, cmd, args, ok, durationMs }` (xuất JSON) → bằng chứng kiểm thử, và sau này là dữ liệu để AI học cách Boss ra lệnh.

Kết luận thiết kế: khi A xong, "gắn não" = viết 1 skill cho agent CLI gồm 3 câu: gọi `stage_bootstrap`, đọc `stage_describe`, chọn lệnh. Không phải việc lớn.

## 2. Khái niệm

| Tên | Nghĩa |
| --- | --- |
| **actor** | Nhân vật VRM, có `id` ngắn (`lan`, `minh`) |
| **place** | Điểm đặt tên trên sân khấu: `ban-dieu-khien`, `buc-trung-tam`, `ke-module`, `cua` |
| **prop** | Đồ vật: thiết bị, cốc, tài liệu… có `id` |
| **screen** | Màn hình hologram 3D, có `id` (`main`, `left`, `right`) |
| **module** | Vật thể kết tinh sau khi "tạo lập" xong (sách, khối, công cụ), cầm tay được, cũng là prop |
| **clip** | Chuyển động có tên: `idle`, `walk`, `wave`, `type`, `nod`, `shake`, `think`, `clap`, `point`, `celebrate`, `sleep`, `sit`, `stand` |
| **expression** | Biểu cảm VRM: `neutral`, `happy`, `angry`, `sad`, `relaxed`, `surprised` (+ `blink`, `aa/ih/ou/ee/oh` cho miệng) |

## 3. Bộ lệnh (v0.1, cố định — thêm thì tăng version, không đổi nghĩa lệnh cũ)

### 3.1 Meta
| Lệnh | Args | Kết quả |
| --- | --- | --- |
| `stage.bootstrap` | — | Toàn bộ sách hướng dẫn: version, danh sách lệnh + mô tả + ví dụ, actors, places, props, clips, expressions, voices. **Agent gọi đầu tiên.** |
| `stage.describe` | — | Trạng thái hiện tại: mỗi actor đang ở đâu, làm gì, biểu cảm gì; props ở đâu |
| `stage.reset` | — | Về trạng thái ban đầu |

### 3.2 Nhân vật
| Lệnh | Args | Ghi chú |
| --- | --- | --- |
| `actor.spawn` | `{ id, model, name?, at, controlledBy? }` | `model` = tên file VRM trong kho; `at` = place hoặc `{x,y,z}`; **Sửa spec (25/10, B1):** `controlledBy: "owner" \| "agent"` (mặc định `agent`) — xem mục 3.2c |
| `actor.remove` | `{ id }` | |
| `actor.list` | — | |
| `actor.moveTo` | `{ actor, to, speed? }` | Tự chơi `walk`, tới nơi về `idle`, sự kiện `actor.arrived` |
| `actor.steer` | `{ actor, vx, vz, ms? }` | **Sửa spec (25/10, B1 — Issue #18):** lái bằng **vận tốc** (m/s) trong `ms` ms rồi tự dừng êm; gọi lại để kéo dài. Sự kiện `actor.steerDone`. Xem mục 3.2c |
| `actor.lookAt` | `{ actor, target }` | target = actor id, prop id, place, `camera`, `cursor`, `null` |
| `actor.turnTo` | `{ actor, target }` | xoay người |
| `actor.sit` | `{ actor, seat }` | seat = place loại ghế |
| `actor.stand` | `{ actor }` | |
| `actor.play` | `{ actor, clip, loop?, speed? }` | sự kiện `actor.clipDone` khi hết (nếu không loop) |
| `actor.stop` | `{ actor }` | về `idle` |
| `actor.express` | `{ actor, expression, weight?, durationMs? }` | weight 0–1, mặc định 1; durationMs = tự về neutral sau đó |
| `actor.say` | `{ actor, text, emotion?, voice? }` | TTS + nhép miệng + bong bóng chữ; trả `durationMs`; sự kiện `actor.sayDone`. **Sửa spec (B2 #20):** `voice` nhận `"nu"` \| `"nam"` \| tên giọng đầy đủ (vd `vi-VN-HoaiMyNeural`); bỏ trống thì theo actor — `owner` → **nam**, còn lại → **nữ**. Giọng là edge-tts `vi-VN` thật qua bridge, `durationMs` = **thời lượng audio thật**; bridge tắt thì rơi về Web Speech `vi-VN` như cũ **Sửa spec (B3 #21):** nếu actor có `controlledBy: "owner"` thì lệnh bắn thêm **`user.text { actor, text }`** — đó là cách não nghe được Sếp (Space, ô chat, hay agent gọi hộ đều như nhau). Gen nói thì KHÔNG bắn, để não không tự nghe lời mình |
| `actor.bubble` | `{ actor, text, durationMs? }` | chỉ chữ, không tiếng |
| `actor.hold` | `{ actor, prop, hand }` | cầm đồ vật (`left`/`right`) |
| `actor.drop` | `{ actor }` | |

### 3.2b Cảm xúc = gói (Boss quyết 03/10: mặt + cơ thể + giọng đi cùng nhau)

Nguyên tắc: **không lệnh nào chỉ đổi mặt**. `actor.express` giữ cho việc tinh chỉnh, nhưng lệnh chính để dùng là `actor.emote` và `actor.say` có `emotion`.

| Lệnh | Args | Ghi chú |
| --- | --- | --- |
| `actor.emote` | `{ actor, emote, intensity?: 0–1, say?: text }` | Chạy **cả gói**: biểu cảm mặt + chuỗi chuyển động cơ thể + âm thanh ngắn + (tùy chọn) nói. Sự kiện `actor.emoteDone` |
| `actor.say` | thêm `emotion` | Khi nói: mặt theo cảm xúc, đầu gật/nghiêng, tay làm cử chỉ nhịp (beat gesture) ngẫu nhiên hợp với cảm xúc, mắt nhìn người nghe, miệng nhép theo âm |
| `actor.idleStyle` | `{ actor, style: "binh-thuong" \| "hao-hung" \| "met" \| "cang-thang" \| "cham-chu" }` — **Sửa spec (25/10, B1):** thêm `cham-chu` (dáng dán mắt vào màn hình, dùng cho `gen` ở bàn điều khiển) | Đổi dáng đứng chờ: thở nhanh/chậm, đổi chân, nhìn quanh, gãi đầu… để nhân vật không bao giờ đứng im |

**Thư viện emote v0.1** (mỗi emote = mặt + chuyển động + âm; agent chỉ cần gọi tên):

| emote | Mặt | Cơ thể | Âm |
| --- | --- | --- | --- |
| `vui` | happy | nhún người, vỗ tay hoặc giơ 2 tay, lắc lư | "yay" ngắn |
| `rat-vui` | happy max | nhảy lên, xoay người, vẫy 2 tay | reo |
| `buon` | sad | vai sụp, cúi đầu, tay buông, lùi nửa bước | thở dài |
| `ngac-nhien` | surprised | giật lùi, tay đưa lên che miệng, mắt mở to | "ồ" |
| `gian` | angry | khoanh tay, dậm chân, lắc đầu | hừ |
| `suy-nghi` | neutral + nheo mắt | tay chống cằm, nhìn lên, gật gù chậm | "hmm" |
| `dong-y` | happy nhẹ | gật đầu 2 lần, giơ ngón cái | "ok" |
| `tu-choi` | sad nhẹ | lắc đầu, xua tay | |
| `chao` | happy | vẫy tay, hơi cúi người | "chào" |
| `ra-lenh` | neutral quyết đoán | chỉ tay về phía màn hình, đứng thẳng | tiếng quét |
| `thanh-cong` | happy | đấm tay lên trời, quay về phía camera | thành công |
| `that-bai` | sad | ôm đầu, ngồi thụp | lỗi |
| `boi-roi` | surprised nhẹ | gãi đầu, nhìn quanh | |
| `met` | relaxed | vươn vai, ngáp | ngáp |
| `cham-chu` | neutral | nhìn chằm màn hình, gõ nhịp tay | |

Thêm emote mới = thêm 1 dòng cấu hình (mặt, danh sách clip, âm), không sửa code lõi. `stage.bootstrap` liệt kê đủ emote hiện có.

Chuyển động cơ thể lấy từ Mixamo (miễn phí) đổi sang VRMA bằng `fbx2vrma-converter`; chuyển động nhỏ (gật, nghiêng đầu, cử chỉ nhịp, thở, đổi chân) làm thủ tục bằng code, trộn chồng lên clip chính (additive) để không bị cứng.

### 3.2c Điều khiển tay: `actor.steer` + `controlledBy` (Sửa spec 25/10 — B1, Issue #18)

Boss xem lab vòng 2 và chốt: **"điều khiển chạy không mượt"**. Nguyên nhân là
phím WASD gửi `actor.moveTo` tới một đích tích luỹ rồi cắt ngang lệnh trước mỗi
nhịp — vận tốc nhảy bậc từng nhịp, nhả phím thì nhân vật còn lết tới đích cũ.
v0.1 vì vậy thêm **một** lệnh, không đổi nghĩa lệnh nào có sẵn:

| Lệnh | Args | Nghĩa |
| --- | --- | --- |
| `actor.steer` | `{ actor, vx, vz, ms? }` | Đi theo vận tốc `[vx, vz]` (m/s, trục phòng) trong `ms` ms (mặc định 150, tối đa 5000), rồi **giảm tốc êm về 0**. Trả `durationMs = ms`, bắn `actor.steerDone`. |

Giao kèo của `actor.steer` (khác mọi lệnh khác, cố ý):

- **Không xếp hàng.** Lệnh steer mới **thay** lệnh cũ ngay lập tức — không có
  `cmd.queued`, không cần `interrupt: true`. Giữ phím W thì cứ 100 ms một lệnh
  bay vào; xếp hàng thì nhả phím rồi nhân vật vẫn lết hết hàng đợi.
- **Vẫn chiếm thân.** Đang steer thì `state: "walking"`, `busy: true`, và `at`
  **luôn `null`** (giao kèo mục 1b không đổi); `nearest` vẫn luôn có. Hết `ms`
  và vận tốc về 0 thì `state` trở lại `idle`/`sitting`.
- **Lệnh khác cắt được steer**: `actor.moveTo`/`sit`/`play`/`stop` chiếm thân
  như thường và steer đang chạy bị huỷ ngay.
- **Giới hạn vật lý do sân khấu giữ**, không phải do bên gọi: tốc độ kẹp
  **1,6 m/s**, gia tốc/giảm tốc nội suy trong **0,15 s**, mặt quay theo hướng
  đi (slerp), kẹp trong phòng và **không đi xuyên bàn/kệ** (hộp AABB trong
  `src/stage/bo-cuc.ts`). Agent gửi `vx: 99` chỉ nhận được 1,6 m/s.

`stage.describe` thêm cho MỖI actor:

```json
{ "id": "owner", "controlledBy": "owner" }
```

`controlledBy: "owner" | "agent"` — `owner` là nhân vật Boss lái bằng phím
(mặc định `agent`). Chỉ là **thông tin ai lái mặc định**: lệnh nào cũng gọi
được lên cả hai, agent không bị cấm điều khiển `owner`. `actor.spawn` nhận
thêm tham số cùng tên.

Góc máy thêm **`theo-owner`** (xem mục 3.3): bám mượt theo nhân vật có
`controlledBy: "owner"`, giữ nguyên góc 3/4 nhìn xuống.

### 3.2d Phản xạ xã hội (Sửa spec 26/10 — C0, Issue #28)

Boss thử bản B3 và chốt hai câu: *"nhân vật nam nhìn kỳ"* và **"gọi Gen không
quay lại trả lời — nó phải biết quay lại tương tác như người"**. Nguyên nhân
không phải lỗi lệnh: mọi cái Gen làm đều do **não** quyết, mà não nằm ngoài
trình duyệt (MCP, nghĩ, gọi tool) nên mất hàng giây. Người thật quay đầu lại
**trước khi** nghĩ xong câu trả lời.

v0.1 vì vậy thêm một lớp **phản xạ** chạy trong sân khấu, KHÔNG thêm lệnh nào:

| Kích thích | Phản xạ | Số đo |
| --- | --- | --- |
| `user.text` (Owner gõ/nói) | `actor.lookAt owner` + `actor.turnTo owner` + `actor.emote chu-y` | bắt đầu ≤ **300 ms** |
| não im sau `user.text` | Gen nói **câu đệm** ngắn ngẫu nhiên bằng giọng ("Dạ, Sếp?", "Em nghe ạ"…) | sau **1 500 ms** |
| não `actor.say` tới | **cắt** câu đệm, nhường chỗ ngay | — |
| Owner vào gần | `actor.lookAt owner` | **≤ 2,5 m** |
| Owner đứng gần lâu | quay người + `actor.emote chao` **đúng một lần** | **> 4 s** |
| Owner đi xa | thả nhìn, về việc đang làm | **> 4 m** (có trễ, khỏi rung) |
| Gen đang nói | luôn nhìn Owner; nói xong **giữ nhìn 2 s** rồi thả | **2 000 ms** |

Giao kèo (thi công: `src/behavior/phan-xa.ts`):

- **Mọi phản xạ đi qua dispatcher**, nguồn `phan-xa` — nhật ký phân biệt được
  ngay cái gì do phản xạ, cái gì do não. Không có đường tắt vào sân khấu.
- **Ưu tiên thấp nhất.** Phản xạ chỉ ra lệnh chiếm thân khi Gen đang RẢNH
  (`busy: false`); đang chạy lệnh của não thì nó chỉ `lookAt` (không chiếm
  thân) và im. Ngoại lệ **duy nhất**: chính câu đệm của nó.
- **Cắt câu đệm KHÔNG dùng `actor.stop` / `interrupt: true`.** Hai cửa đó gọi
  `catNgang`, mà `catNgang` **xoá sạch hàng đợi** → giết luôn câu của não vừa
  xếp hàng sau câu đệm (đúng cái đang muốn nhường chỗ). Phản xạ huỷ thẳng hành
  động đang chạy của sân khấu, dispatcher thấy `done` thì tự xả hàng đợi.
- **Emote mới `chu-y`** (ngẩng đầu, hơi nghiêng) vào bảng emote → tổng **16**.
  Thời lượng 800 ms, cố ý ngắn hơn hạn 1,5 s để không chắn chỗ câu của não.

`stage.describe` thêm **một trường**:

```json
{ "brainConnected": false }
```

`brainConnected` = bridge đang có ≥ 1 client MCP nối. Bridge đếm hai nguồn:
tiến trình MCP **stdio** tự xưng `?role=nao` khi nối ws, và bản MCP **HTTP**
(chạy trong chính bridge) tính theo *yêu cầu MCP gần nhất* trong 60 s — vì nó
luôn sẵn sàng kể cả khi chưa não nào gọi, đếm theo kết nối là nói dối. Bridge
đẩy sự kiện `bridge.brain { count, connected }` xuống trình duyệt; **không có
bridge = `false`**.

Khi `brainConnected` là `false`, Gen trả lời bằng **não rule-based tối thiểu
trong app** (chào / hỏi tên / còn lại → *"Em chưa có não, Sếp bật agy nhé"*) —
để Gen **không bao giờ im lặng**, kể cả lúc Boss chưa bật `agy`.

#### Ai là "người nghe" (Sửa spec 26/10 — C0 vòng 2)

Boss xem lại và chốt thêm: **với nhân vật trong sân khấu, Sếp = người xem qua
màn hình = MÁY QUAY**. Người trong phòng mà Boss lái bằng WASD là **Javis**
(avatar của Sếp), không phải Sếp. Lẫn hai cái này là Gen quay lưng vào khán giả
để nói chuyện với một cái avatar đứng im.

| Tình huống | Javis (`owner`) | Gen |
| --- | --- | --- |
| Sếp gõ/nói (`user.text`, `to` mặc định `camera`) | quay về Gen (người nói hướng về người nghe) | mắt + thân về **máy quay**, emote `chu-y`, bật dáng lắng nghe |
| …và Javis đứng **> 3 m** | như trên | **liếc** Javis 700 ms rồi mới về máy quay |
| Gen trả lời (`actor.say` không có `to`) | — | mặt về máy quay, **giữ mỗi khung hình** kể cả khi đổi `camera.preset`; nói xong giữ 2 s |
| `actor.say { actor: "owner", to: "gen" }` | quay về Gen | quay về Javis, gật/chú ý — hai bên **nhìn nhau**; nói xong Gen liếc máy quay |

Hai thứ mới trong bộ lệnh (v0.1, không đổi nghĩa lệnh cũ):

| Lệnh / tham số | Nghĩa |
| --- | --- |
| `actor.say` + `to?: actorId \| "camera"` | Nói **với ai**. Mặc định `camera` = Sếp đang xem. Người nói tự quay mặt về người nghe; người nghe (nếu là actor) vào dáng lắng nghe. `user.text` và `actor.sayDone` mang theo `to`. |
| `actor.faceTo { actor, target }` | Quay người về mục tiêu **KHÔNG chiếm thân, không xếp hàng**. `actor.turnTo` chiếm thân nên gọi lúc đang nói chỉ xếp hàng chạy sau khi nói xong — đúng lúc hết cần. Đây là lệnh "giữ hướng", gọi được mỗi nhịp. |
| `actor.listen { actor, on?, question? }` | **Sửa spec 29/10 — I1, Issue #74.** Bật/tắt **dáng lắng nghe** (gật đầu nhẹ theo nhịp, nghiêng đầu khi `question`). Cũng **không chiếm thân, không xếp hàng**, nên dùng được cả khi actor đang bận việc khác. Bắn `actor.listening { actor, on, question }`. Trước I1 dáng này chỉ đặt được từ bên trong sân khấu (`actor.say` tự bật cho người nghe) nên **không có mốc thời gian nào đo được**; giờ nó là một lệnh như mọi lệnh khác, vào nhật ký, và phản xạ dùng chính nó cho cái "gật ngay trong 300 ms". |

`stage.describe` thêm hai thứ:

```json
{
  "actors": [{ "id": "gen", "facingTarget": "camera", "lookingAt": "camera" }],
  "camera": { "preset": "toan-canh", "pos": [0, 3.4, 9.2] }
}
```

`facingTarget` là **thân** đang quay về đâu (`"camera"`, id actor, hay `null` khi
quay về toạ độ trần) — khác `lookingAt` (mắt + đầu). Cặp này cộng với
`camera.pos` là đủ để não biết Gen đang nói với ai và "quay về phía Sếp" nghĩa
là quay về đâu.

Ngôn ngữ cơ thể đi kèm (`src/stage/nhanvat.ts`, lớp vi mô — không chiếm thân):
**gật đầu nhẹ khi đang nghe**, **nghiêng đầu khi người nói đang hỏi** (hết câu
bằng `?`, hoặc "không / chưa / gì / nào / sao / đâu / hả / nhỉ" — tiếng Việt hay
hỏi mà không có dấu hỏi). Cử chỉ tay khi nói vốn khai theo **hệ của thân**
(`src/behavior/cu-chi.ts`), nên khi thân đã hướng về người nghe thì tay cũng tự
chỉ về phía người nghe — không có bảng cử chỉ thứ hai để lệch nhau.


### 3.3 Đồ vật, cảnh, camera
| Lệnh | Args |
| --- | --- |
| `prop.spawn` / `prop.remove` / `prop.list` | `{ id, model, at }` |
| `prop.moveTo` | `{ prop, to }` |
| `prop.set` | `{ prop, state }` — vd màn hình `{ screen: "on", text: "Đang chạy test…" }` |
| `scene.light` | `{ preset: "sang" \| "toi" \| "am" }` |
| `camera.focus` | `{ target, distance? }` |
| `camera.preset` | `{ name: "toan-canh" \| "theo-owner" \| "ban-dieu-khien" \| "ban-1" \| "ban-2" \| "hop" \| "truoc-mat" }` — **Sửa spec (25/10, B1):** thêm `theo-owner` (bám mượt nhân vật `controlledBy: "owner"`) |

### 3.4b Phòng lab viễn tưởng: màn hình hologram, chế tạo module (Boss quyết 03/10)

Bối cảnh chốt: **phòng nghiên cứu khoa học viễn tưởng**, không phải văn phòng. Sàn tối có vân sáng, kính, ánh neon, hậu kỳ phát sáng (bloom). Nhân vật đứng giữa, ra lệnh cho các màn hình 3D lớn.

| Lệnh | Args | Ghi chú |
| --- | --- | --- |
| `screen.spawn` / `screen.remove` | `{ id, at, size?, tilt? }` | Tấm hologram trong suốt phát sáng, lơ lửng |
| `screen.show` | `{ screen, kind: "text" \| "code" \| "log" \| "chart" \| "image", content }` | Hiện nội dung tĩnh |
| `screen.stream` | `{ screen, kind, chunks[] \| source }` | Chữ/code chạy dần như đang được gõ; agent có thể đẩy từng mẩu khi đang sinh |
| `screen.clear` | `{ screen }` | |
| `screen.focus` | `{ screen }` | Bay tới trước mặt nhân vật/camera |
| `module.build` | `{ id, shape: "book" \| "cube" \| "tool" \| "crystal" \| "orb", label, from?: screen, durationMs? }` | **Hiệu ứng kết tinh**: hạt sáng/khối voxel từ màn hình tụ lại thành vật thể rồi rơi vào tay nhân vật (tự gọi `actor.hold`). Trả về prop id. Sự kiện `module.built`. **Sửa spec (B3 #21):** module rơi vào tay actor **`controlledBy: "agent"`** đầu tiên (người đang làm việc), không phải `actorIds()[0]` — từ B1 nhân vật đầu tiên là `owner`, để nguyên thì Gen làm xong mà module nằm trên tay Sếp |
| `module.open` | `{ module }` | Mở ra thành màn hình nhỏ hiện nội dung bên trong |
| `module.store` | `{ module, to: place }` | Đặt lên kệ/bàn lưu trữ |
| `fx.play` | `{ name: "scan" \| "pulse" \| "alert" \| "success", at?, durationMs? }` | Hiệu ứng ánh sáng/âm ngắn |

Mẫu kịch bản "ra lệnh → lập trình → kết tinh module":

```json
{ "cmd": "script.run", "args": { "steps": [
  { "cmd": "actor.say",      "args": { "actor": "gen", "text": "Bắt đầu dựng connector Baserow." } },
  { "cmd": "actor.play",     "args": { "actor": "gen", "clip": "point" } },
  { "cmd": "screen.focus",   "args": { "screen": "main" } },
  { "cmd": "screen.stream",  "args": { "screen": "main", "kind": "code", "source": "agent" } },
  { "waitFor": "screen.streamDone" },
  { "cmd": "fx.play",        "args": { "name": "success" } },
  { "cmd": "module.build",   "args": { "id": "connector-baserow", "shape": "book", "label": "Baserow", "from": "main" } },
  { "waitFor": "module.built" },
  { "cmd": "actor.express",  "args": { "actor": "gen", "expression": "happy" } },
  { "cmd": "actor.say",      "args": { "actor": "gen", "text": "Xong rồi Sếp, module đây." } }
]}}
```

Sự kiện thêm: `screen.streamDone`, `module.built`.

Ghi chú kỹ thuật (để biết là làm được, không phải phần Boss cần đọc): màn hình = mặt phẳng trong suốt + CanvasTexture vẽ chữ, viền phát sáng qua UnrealBloomPass; kết tinh = hệ hạt (Points) nội suy từ vị trí ngẫu nhiên về bề mặt mô hình đích rồi hoán đổi sang mô hình thật; tất cả có sẵn trong Three.js, không cần thư viện thêm.

### 3.4 Kịch bản
| Lệnh | Args |
| --- | --- |
| `script.run` | `{ steps: Step[], mode?: "sequential" \| "parallel" }` — Step = bất kỳ lệnh nào ở trên, thêm `wait` (ms) và `waitFor` (tên sự kiện) |
| `script.stop` | — |

Ví dụ kịch bản Boss dán vào ô kịch bản (hoặc agent gửi):

```json
{ "cmd": "script.run", "args": { "steps": [
  { "cmd": "actor.moveTo", "args": { "actor": "lan", "to": "ban-2" } },
  { "waitFor": "actor.arrived" },
  { "cmd": "actor.express", "args": { "actor": "lan", "expression": "happy" } },
  { "cmd": "actor.say", "args": { "actor": "lan", "text": "Sếp ơi, test xanh rồi!" } },
  { "cmd": "actor.play", "args": { "actor": "lan", "clip": "celebrate" } }
]}}
```

### 3.2e Phản ứng tức thì ba tầng (Sửa spec 29/10 — I1, Issue #74)

Boss 29/10: *"các nhân vật phải đưa ra phản ứng và hành vi tức thì ngay sau khi
nhận lệnh để tăng trải nghiệm chân thực trong quá trình nó suy nghĩ"*.

C0 (mục 3.2d) chỉ phản ứng khi **đã có chữ**. Giọng nói mất 3–18 s để thành chữ
và câu đệm còn chờ thêm 1,5 s, nên Boss nói xong là nhìn một nhân vật đứng im
hàng chục giây. I1 chia khoảng chờ đó thành ba tầng, **không thêm lệnh nào cho
não phải học** (chỉ `actor.listen` ở bảng trên, và một sự kiện mới):

| Tầng | Mốc | Nhi làm gì |
| --- | --- | --- |
| 0 | `user.listening { on: true }` — Boss vừa bấm mic, **chưa có chữ** | `actor.lookAt camera` **≤150 ms** (chạy đồng bộ trong handler, không chờ nhịp quét) + `actor.listen` + `actor.emote chu-y` nhẹ |
| 0b | `user.listening { on: false, dangNhanDang: true }` — STT đang chạy | `actor.emote suy-nghi` nhẹ (đang nhẩm), vẫn hướng về Boss |
| 1 | `user.text` / `user.speech` — đã có chữ | gật (`actor.listen`, ≤300 ms) + `actor.faceTo` + mặt ngẩng (`actor.express`) + **câu đệm bắt đầu phát ≤400 ms** (mốc chờ não hạ 1500 → **200 ms**) |
| 2 | từ khi có chữ tới lệnh đầu của não | vòng "đang nghĩ": đổi tư thế mỗi **4,5 s** rồi nhìn lại Boss; **6 s** một câu nối ("Em đang nghĩ ạ…"); **20 s** câu "Hơi lâu, Sếp chờ em chút." Não mở miệng là **cắt ngay** và về dáng chú ý |

Bốn giao kèo bắt buộc của tầng 2 (chỗ dễ sai nhất):

1. **Một giọng duy nhất, XUYÊN NHÂN VẬT** (sửa 27/10 sau review PR #75). Mọi
   câu/tư thế-có-tiếng của Nhi chỉ phát khi **không còn ai** trên sân khấu
   đang nói — phản xạ giữ sổ `aiDangNoi` từ `actor.sayStart`/`sayDone` của mọi
   actor. `actor.say` bắn `user.text` ở **đầu câu** của Nam, nên không có cửa
   này là Nhi chen vào giữa câu Nam (đo ở tầng audio: đỉnh 2 giọng). Gật/nhìn
   (không tiếng) vẫn tức thì, và câu đệm được **hoãn** tới khi Nam dứt lời chứ
   không bị bỏ. Thêm một lý do nữa phải chờ Nhi rảnh: hàng đợi là FIFO, nên
   một câu nối *xếp hàng* sẽ chạy **trước** câu trả lời thật của não.
1b. **Tầng 2 có trần**: 30 s (`tranTangHaiMs`) thì nói một câu kết rồi về nhịp
   thường; `bridge.disconnected` và `bridge.brain { count: 0 }` là hai cửa sập
   tắt ngay. Không có trần thì não chết giữa đường là Nhi quay tư thế mãi mãi.
2. **Khi bận chỉ cho lệnh nhìn.** Nhi đang chạy việc của não (`moveTo`,
   `play`…) thì phản xạ chỉ `actor.lookAt` + `actor.listen` — không `faceTo`,
   không emote, không nói, **không chạm hàng đợi**.
3. **Cắt bằng `world.actorInterrupt`, không bao giờ `actor.stop`/`interrupt:
   true`** (xem mục 3.2d): hai cửa đó xoá sạch hàng đợi → giết luôn câu của
   não vừa xếp hàng sau câu chêm.
4. **Câu chêm được phép nhường chỗ cho CHÍNH MÌNH, không cho ai khác.** Tư thế
   nghĩ đang chạy mà tới hạn câu đệm thì cắt tư thế đó; đang NÓI thì hoãn câu
   sau; đang làm việc của não thì im.

**Nam** (nhân vật `owner`): Boss gõ/nói = Nam nói, nên Nam **không** tự phản ứng
với chính mình. Khi Nhi nói, Nam quay mắt + thân về Nhi; Nhi **nói xong** thì
Nam gật nhẹ 1,2 s. Cả hai chỉ làm khi Nam đang rảnh — Boss có thể đang lái anh
ta bằng WASD.

### 3.5 Sự kiện sân khấu → agent
`actor.arrived`, `actor.steerDone`, `actor.clipDone`, `actor.sayDone`, `actor.emoteDone`, `script.done`, `user.speech` (Boss nói, đã chuyển thành chữ), `user.click` (Boss bấm vào actor/prop), `user.text` (Boss gõ).

**Sửa spec (29/10, I1 — Issue #74):** thêm **`user.listening { on, dangNhanDang }`**
— Boss **bắt đầu/kết thúc nói**, bắn từ `src/audio/mic.ts`, trước khi có chữ.
Ba mốc: `{on:true}` lúc `MediaRecorder` chạy, `{on:false, dangNhanDang:true}`
lúc gửi audio lên STT, `{on:false, dangNhanDang:false}` khi lượt nói đóng (có
chữ, không ra chữ, hay lỗi). Não đọc được nó qua `stage_events` để biết Sếp
đang nói mà đừng chen vào. Thêm `actor.listening { actor, on, question }` do
`actor.listen` bắn.

**Sửa spec (26/10, C0 — Issue #28):** thêm `bridge.brain { count, connected }` —
bridge báo số client MCP đang nối, đi **xuống** sân khấu (hướng ngược với mọi
sự kiện khác). Đây là nguồn duy nhất của `stage.describe().brainConnected`.

**Sửa spec (25/10, B3 — Issue #21):** `user.text` có **đúng một nguồn**: lệnh
`actor.say` chạy lên nhân vật `controlledBy: "owner"`. Nhờ vậy ba cửa của Boss
(phím `Space`, ô chat dưới màn hình, bảng lệnh) đều bắn cùng một sự kiện mà
không cửa nào phải tự nhớ bắn — và não chỉ cần nghe một cái tên.

### 3.6 Lệnh giọng: gọi tên rồi ra lệnh (Sửa spec 26/10 — C2, Issue #32)

Boss 26/10: *"làm thật hoàn thiện là tôi có thể dùng giọng nói để ra lệnh cho
tất cả nhân vật trong giao diện, nhân vật nam tên Javis"*.

v0.1 **không thêm lệnh nào**: lệnh giọng là một **lớp dịch** đứng trước
dispatcher (`src/behavior/hieu-lenh.ts` + bảng ngữ pháp `ngu-phap.ts`), nghe
`user.text` / `user.speech` rồi gọi đúng bộ lệnh có sẵn với nguồn `giong`.
Không LLM, không gọi mạng, chạy trong trình duyệt.

**Tên nhân vật.** Nhân vật nam có **tên hiển thị "Javis"**; `id` vẫn là `owner`
(đổi id là phá `controlledBy`, phím WASD, camera `theo-owner`, nguồn `user.text`
và mọi tool MCP). Bảng tên + bí danh giọng nằm trong `src/stage/noi-dung.ts`
(`TEN_HIEN_THI`, `BI_DANH_NHAN_VAT`), nên `stage.describe().actors[].name` trả
`"Javis"` và bong bóng chữ cũng vậy. Gen giữ tên `Gen`.

**Người nhận.** Lớp này tách người nhận trước khi đọc mệnh lệnh:

| Sếp gọi | Người nhận |
| --- | --- |
| `Javis…` (kể cả "Ja-vít", "Gia vít", "Jarvis") | `owner` |
| `Gen…` (kể cả "Ghen", "Gien") | `gen` |
| `mọi người` · `cả hai` · `tất cả` · `hai người` | **cả hai**, Javis diễn trước |
| không gọi tên | `gen` (mặc định) |

Có hai tên trong câu ("Gen, nhìn Javis") thì **tên sớm nhất** là người nhận,
tên còn lại là mục tiêu của lệnh.

**Ngữ pháp là DỮ LIỆU.** `BANG_MAU_CAU` trong `src/behavior/ngu-phap.ts`: mỗi
dòng gồm các cách nói (viết **không dấu**, slot `<place>` / `<emote>` /
`<man hinh>` / `<module>` / `<muc tieu>` / `<ten>` / `<loi>`), mô tả, câu ví dụ,
và hàm sinh lệnh. Danh sách place / emote / màn hình / module **không chôn
trong bảng** — lấy động từ `stage.bootstrap`, nên thêm place là lệnh giọng tự
biết. Tab **"Giọng"** trên bảng lệnh sinh thẳng từ bảng này (spec mục 4: không
viết tay dòng nào).

Nhóm lệnh hiểu được: đi tới `<place>` · lại đây · quay lại · nhìn `<ai>` ·
ngồi / ngồi `<ghế>` · đứng lên · dừng · `<emote>` (15 emote, có đồng nghĩa:
"vui lên", "ăn mừng", "bất ngờ"…) · mở/tắt màn hình `<main/trái/phải>` ·
dựng / kết tinh `<tên>` · cầm / cất module `<tên>` · đổi góc máy · dựng lại sân
khấu · nói "`<câu>`" · **nói với `<ai>` "`<câu>`"**.

**Nói với ai (đồng bộ C0 — phản xạ nhìn người đang nói).** `actor.say` nhận
thêm `to?: actorId | "camera"` (mặc định `camera`, tức nói với Sếp). Lệnh giọng
dịch: *"Javis, nói với Gen «…»"* → `actor.say { actor: "owner", text, to: "gen" }`;
câu **xác nhận ngắn** ("Dạ" / "Rõ Sếp") luôn dùng `to: "camera"`. `validate.ts`
**chặn tham số lạ**, nên lớp hiểu lệnh chỉ gửi `to` khi registry thật sự có
tham số đó — nhánh C0 chưa merge thì nó tự bỏ `to`, lệnh vẫn chạy đúng.

**Chịu lỗi STT.** Câu của Sếp và mẫu câu đều được **bỏ dấu** trước khi so, mỗi
từ cho lệch **Levenshtein ≤ 2** (từ ≤ 3 ký tự phải đúng y, 4–5 ký tự lệch ≤ 1),
và **số đếm bằng chữ** tính như chữ số ("bàn một" = `ban-1`). Từ lạ giữa câu bị
bỏ qua có trừ điểm, nên "Javis ơi, đi tới cái bàn điều khiển giúp em nhé" vẫn
khớp `di toi <place>`. Mẫu **cụ thể hơn** luôn thắng ("dựng lại sân khấu" ≠
"dừng lại").

**Khớp rồi thì sao.** Nhân vật xác nhận ngắn bằng **giọng** ("Dạ" / "Rõ Sếp" /
"Vâng ạ") kèm **nhắc lại lệnh đã hiểu** trong bong bóng chữ ("Rõ Sếp, đi tới
bàn điều khiển"), rồi lệnh thật chạy qua `dispatcher.run(cmd, args, 'giong')` —
xếp hàng, nhật ký, kiểm tham số y như mọi đường vào khác. Giọng theo actor:
Javis → **nam**, Gen → **nữ** (mục 3.2, B2).

**KHÔNG bắn `user.text` hai lần.** Lớp này không bắn lại sự kiện nào. Khớp được
thì nó:

1. thêm **`handled: true`** vào chính `data` của `user.text`/`user.speech` đang
   chảy (đánh dấu **đồng bộ**, trước khi sự kiện ra tới bridge/MCP), và
2. bắn thêm **`user.command`** `{ text, actors, cmd, args, mau, matched, nhacLai }`.

> **Giao kèo cho não (C-não, `scripts/nao-demo.mjs`, skill agy):** bỏ qua mọi
> `user.text` / `user.speech` có `handled: true` — câu đó đã thành lệnh và nhân
> vật đã làm xong. Chỉ trả lời những câu **không** có cờ đó.

**Không khớp mẫu nào** (câu tự do):

- người nhận là **Gen** → giữ nguyên luồng mục 3.5: `user.text` chảy tới não
  qua `stage_events`, lớp này không chạm vào (không `handled`, không
  `user.command`);
- người nhận là **Javis** → Javis không có não, nên lớp này cho Javis nói
  *"Em chưa hiểu lệnh này, Sếp nói rõ hơn ạ"* (giọng nam) và đánh dấu `handled`
  để não không trả lời chồng lên.

**`stage.describe` thêm `lastCommand`:**

```json
{ "lastCommand": { "text": "Javis, đi tới bàn điều khiển", "actor": "owner",
                   "cmd": "actor.moveTo", "matched": true, "t": 1761000000000 } }
```

`matched: false` nghĩa là câu đó là câu tự do (đã chuyển cho não, hoặc Javis
nói chưa hiểu).

## 4. Giao diện test thủ công (bắt buộc có từ đợt A)
- Bảng bên phải liệt kê **tự động** mọi lệnh từ `stage.bootstrap` → mỗi lệnh 1 form nhỏ + nút Chạy. Không viết tay nút nào.
- Ô "Kịch bản": dán JSON (hoặc dạng ngắn 1 dòng/1 lệnh: `lan moveTo ban-2`) → Chạy.
- Nhật ký lệnh/sự kiện cuộn ở dưới, sao chép được để gửi cho tôi.

## 5. MCP cho agent
- Bridge Node phơi MCP tools **1:1 với bộ lệnh** (tool `stage_bootstrap`, `actor_moveTo`…), cộng tool `stage_events` để đọc sự kiện mới.
- Đăng ký vào Gen-hub làm connector `gen-stage`. Hướng dẫn kèm theo (`docs/BOOTSTRAP-AGENT.md`) chỉ có 1 câu: *"Gọi `stage_bootstrap` trước, làm theo nó."*

**Sửa spec (25/10, B3 — Issue #21):** thi công trong `bridge/mcp.ts`, chốt thêm 4 điều.

1. **Tool sinh tự động từ registry, không viết tay.** Lệnh `a.b` → tool `a_b`
   (MCP không cho dấu chấm trong tên tool); `inputSchema` dịch từ `params`
   (kiểu, `enum` khi giá trị cố định, `min`/`max`, danh sách bắt buộc,
   `additionalProperties: false` vì `validate.ts` từ chối tham số lạ);
   `description` = `desc` + danh sách `events` + `example.args`. Tham số kiểu
   `vec3`/`target`/`json` khai **một kiểu duy nhất là chuỗi** — `validate.ts`
   đọc được `"x, y, z"` và JSON dạng chuỗi, nên não không phải đoán giữa nhiều
   dạng. Hệ quả: **số tool = số lệnh + 1**, thêm lệnh vào Actor API là có tool
   mới ngay (có test giữ đúng con số này).
2. **`stage_events { since?, waitMs? }`** — long-poll. Mỗi sự kiện mang `seq`
   tăng dần; trả `{ events, latest }`, lượt sau truyền `since: latest`. `waitMs`
   > 0 thì chờ tới khi có sự kiện mới (trả **ngay** lúc đó, không ngồi hết hạn),
   trần 60 000 ms. Giữ 500 sự kiện gần nhất.
3. **`stage_bootstrap` qua MCP trả thêm khoá `huongDanAgent`** — một đoạn dặn
   vai diễn (bạn là Gen, chỉ điều khiển actor `gen`, không lái `owner`, trả lời
   bằng `actor_say` tiếng Việt câu ngắn, diễn bằng emote/screen/module). Bản
   `stage.bootstrap` gọi thẳng qua ws/UI **không đổi**.
4. **Hai đường vào, cùng một ruột**: stdio (`pnpm mcp`, cho `agy mcp add`) và
   HTTP streamable (`pnpm bridge` → `127.0.0.1:8789/mcp`, không giữ phiên). Cả
   hai đều là **client ws của bridge**, không có đường tắt riêng vào dispatcher.
   Bảo mật y hệt ws: chỉ `127.0.0.1`; mở ra ngoài phải có `GEN_STAGE_TOKEN` và
   mọi yêu cầu mang `Authorization: Bearer <token>`.

## 6. Ngoài phạm vi v0.1
Nhiều người xem cùng lúc, vật lý, chỉnh ngoại hình trong game (làm bằng VRoid Studio rồi nạp VRM), giọng nói thời gian thực hai chiều (đợt C).

## 7. Tiêu chí chốt spec
Boss đọc xong, bấm thử được từng dòng trong bảng lệnh trên giao diện, và tôi/agy gọi qua MCP cho cùng kết quả. Lệnh nào Boss thấy thiếu → thêm vào spec trước, code sau.
