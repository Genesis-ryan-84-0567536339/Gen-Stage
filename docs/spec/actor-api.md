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
| `actor.spawn` | `{ id, model, name?, at }` | `model` = tên file VRM trong kho; `at` = place hoặc `{x,y,z}` |
| `actor.remove` | `{ id }` | |
| `actor.list` | — | |
| `actor.moveTo` | `{ actor, to, speed? }` | Tự chơi `walk`, tới nơi về `idle`, sự kiện `actor.arrived` |
| `actor.lookAt` | `{ actor, target }` | target = actor id, prop id, place, `camera`, `cursor`, `null` |
| `actor.turnTo` | `{ actor, target }` | xoay người |
| `actor.sit` | `{ actor, seat }` | seat = place loại ghế |
| `actor.stand` | `{ actor }` | |
| `actor.play` | `{ actor, clip, loop?, speed? }` | sự kiện `actor.clipDone` khi hết (nếu không loop) |
| `actor.stop` | `{ actor }` | về `idle` |
| `actor.express` | `{ actor, expression, weight?, durationMs? }` | weight 0–1, mặc định 1; durationMs = tự về neutral sau đó |
| `actor.say` | `{ actor, text, emotion?, voice? }` | TTS + nhép miệng + bong bóng chữ; trả `durationMs`; sự kiện `actor.sayDone` |
| `actor.bubble` | `{ actor, text, durationMs? }` | chỉ chữ, không tiếng |
| `actor.hold` | `{ actor, prop, hand }` | cầm đồ vật (`left`/`right`) |
| `actor.drop` | `{ actor }` | |

### 3.2b Cảm xúc = gói (Boss quyết 03/10: mặt + cơ thể + giọng đi cùng nhau)

Nguyên tắc: **không lệnh nào chỉ đổi mặt**. `actor.express` giữ cho việc tinh chỉnh, nhưng lệnh chính để dùng là `actor.emote` và `actor.say` có `emotion`.

| Lệnh | Args | Ghi chú |
| --- | --- | --- |
| `actor.emote` | `{ actor, emote, intensity?: 0–1, say?: text }` | Chạy **cả gói**: biểu cảm mặt + chuỗi chuyển động cơ thể + âm thanh ngắn + (tùy chọn) nói. Sự kiện `actor.emoteDone` |
| `actor.say` | thêm `emotion` | Khi nói: mặt theo cảm xúc, đầu gật/nghiêng, tay làm cử chỉ nhịp (beat gesture) ngẫu nhiên hợp với cảm xúc, mắt nhìn người nghe, miệng nhép theo âm |
| `actor.idleStyle` | `{ actor, style: "binh-thuong" \| "hao-hung" \| "met" \| "cang-thang" }` | Đổi dáng đứng chờ: thở nhanh/chậm, đổi chân, nhìn quanh, gãi đầu… để nhân vật không bao giờ đứng im |

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

### 3.3 Đồ vật, cảnh, camera
| Lệnh | Args |
| --- | --- |
| `prop.spawn` / `prop.remove` / `prop.list` | `{ id, model, at }` |
| `prop.moveTo` | `{ prop, to }` |
| `prop.set` | `{ prop, state }` — vd màn hình `{ screen: "on", text: "Đang chạy test…" }` |
| `scene.light` | `{ preset: "sang" \| "toi" \| "am" }` |
| `camera.focus` | `{ target, distance? }` |
| `camera.preset` | `{ name: "toan-canh" \| "ban-1" \| "hop" }` |

### 3.4b Phòng lab viễn tưởng: màn hình hologram, chế tạo module (Boss quyết 03/10)

Bối cảnh chốt: **phòng nghiên cứu khoa học viễn tưởng**, không phải văn phòng. Sàn tối có vân sáng, kính, ánh neon, hậu kỳ phát sáng (bloom). Nhân vật đứng giữa, ra lệnh cho các màn hình 3D lớn.

| Lệnh | Args | Ghi chú |
| --- | --- | --- |
| `screen.spawn` / `screen.remove` | `{ id, at, size?, tilt? }` | Tấm hologram trong suốt phát sáng, lơ lửng |
| `screen.show` | `{ screen, kind: "text" \| "code" \| "log" \| "chart" \| "image", content }` | Hiện nội dung tĩnh |
| `screen.stream` | `{ screen, kind, chunks[] \| source }` | Chữ/code chạy dần như đang được gõ; agent có thể đẩy từng mẩu khi đang sinh |
| `screen.clear` | `{ screen }` | |
| `screen.focus` | `{ screen }` | Bay tới trước mặt nhân vật/camera |
| `module.build` | `{ id, shape: "book" \| "cube" \| "tool" \| "crystal" \| "orb", label, from?: screen, durationMs? }` | **Hiệu ứng kết tinh**: hạt sáng/khối voxel từ màn hình tụ lại thành vật thể rồi rơi vào tay nhân vật (tự gọi `actor.hold`). Trả về prop id. Sự kiện `module.built` |
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

### 3.5 Sự kiện sân khấu → agent
`actor.arrived`, `actor.clipDone`, `actor.sayDone`, `actor.emoteDone`, `script.done`, `user.speech` (Boss nói, đã chuyển thành chữ), `user.click` (Boss bấm vào actor/prop), `user.text` (Boss gõ).

## 4. Giao diện test thủ công (bắt buộc có từ đợt A)
- Bảng bên phải liệt kê **tự động** mọi lệnh từ `stage.bootstrap` → mỗi lệnh 1 form nhỏ + nút Chạy. Không viết tay nút nào.
- Ô "Kịch bản": dán JSON (hoặc dạng ngắn 1 dòng/1 lệnh: `lan moveTo ban-2`) → Chạy.
- Nhật ký lệnh/sự kiện cuộn ở dưới, sao chép được để gửi cho tôi.

## 5. MCP cho agent
- Bridge Node phơi MCP tools **1:1 với bộ lệnh** (tool `stage_bootstrap`, `actor_moveTo`…), cộng tool `stage_events` để đọc sự kiện mới.
- Đăng ký vào Gen-hub làm connector `gen-stage`. Hướng dẫn kèm theo (`docs/BOOTSTRAP-AGENT.md`) chỉ có 1 câu: *"Gọi `stage_bootstrap` trước, làm theo nó."*

## 6. Ngoài phạm vi v0.1
Nhiều người xem cùng lúc, vật lý, chỉnh ngoại hình trong game (làm bằng VRoid Studio rồi nạp VRM), giọng nói thời gian thực hai chiều (đợt C).

## 7. Tiêu chí chốt spec
Boss đọc xong, bấm thử được từng dòng trong bảng lệnh trên giao diện, và tôi/agy gọi qua MCP cho cùng kết quả. Lệnh nào Boss thấy thiếu → thêm vào spec trước, code sau.
