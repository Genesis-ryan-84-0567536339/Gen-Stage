# Gen-Stage

Sân khấu 3D chạy trong trình duyệt, điều khiển bằng **một bộ lệnh cố định**
(Actor API v0.1 — `docs/spec/actor-api.md`). Mọi đường vào (nút trên giao diện,
ô kịch bản, bridge WebSocket, sau này là MCP cho agent) đi qua **cùng một
dispatcher**, nên Boss bấm tay được gì thì agent gọi được đúng cái đó.

Stack: Vite + TypeScript (strict) + Three.js + `@pixiv/three-vrm`, không
framework UI. Đợt A (`docs/du-phong-dot-A.md`): A1 lõi điều khiển (Issue #5) →
A2 bộ hành vi → A3 lab viễn tưởng.

## Lệnh

```bash
pnpm install              # cài phụ thuộc
pnpm assets                # tải asset (VRM + Kenney Furniture Kit CC0) — 1 lần sau khi clone
pnpm assets:lab             # tải Kenney Space Kit CC0 cho lab A3 (public/kenney-sci-fi/)
pnpm dev                  # chạy dev, mở http://localhost:5173
pnpm dev --host           # cho điện thoại cùng wifi vào xem
pnpm build                # tsc + vite build, phải không lỗi trước khi mở PR
pnpm test                 # vitest: dispatcher, hàng đợi, kịch bản, stage.describe, A3 screen/module/fx
pnpm bridge               # bridge: ws lệnh (8787) + giọng Việt (8788) + MCP HTTP (8789) + nhận giọng (8790)
pnpm mcp                  # MCP qua stdio cho agy CLI (`agy mcp add gen-stage …`)
pnpm nao                  # DRIVER não: nghe user.text qua ws → nuôi agy đang ấm trong tmux
pnpm nao-demo             # não mẫu rule-based (không LLM) nối MCP stdio — vòng kín khi không có agy
pnpm preview              # xem thử bản build

node scripts/kiem-a1.mjs      # bằng chứng A1: bấm từng lệnh + chụp ảnh vào docs/a1/
node scripts/kiem-a3.mjs      # bằng chứng A3: screen/module/fx/preset + kịch bản mẫu + FPS vào docs/a3/
node scripts/kiem-lab2.mjs    # bằng chứng lab rộng-sáng-gọn + điều khiển phím vào docs/lab2/
node scripts/kiem-bridge.mjs  # bằng chứng bridge: moveTo qua ws → nhận actor.arrived
node scripts/kiem-b2.mjs      # bằng chứng B2: giọng tiếng Việt + nhép miệng theo âm vào docs/b2/
node scripts/kiem-a2.mjs      # bằng chứng A2: 15 emote + 13 clip + say + idleStyle, ảnh/video/log số vào docs/a2/
node scripts/kiem-a2.mjs --chi-anh  # bản NHANH lúc đang làm (chỉ ảnh + số đo, không quay video, không đo FPS)
node scripts/kiem-b1.mjs      # bằng chứng B1: bố cục 3 vùng + steer mượt + owner/gen vào docs/b1/ (CHẠY MỘT LẦN)
node scripts/kiem-b3.mjs      # bằng chứng B3: Owner gõ → MCP → Gen diễn + nói, vào docs/b3/ (CHẠY MỘT LẦN)
node scripts/kiem-nao.mjs     # bằng chứng DRIVER: Sếp gõ → driver → agy thật → Gen nói, đo độ trễ, vào docs/nao/ (CHẠY MỘT LẦN)
node scripts/kiem-mo-phong-loi-cu.mjs  # mô phỏng nguyên nhân gốc #37 (naoHttpDen hết hạn, ws không hề rớt) vào docs/nao/mo-phong-loi-cu.*
node scripts/kiem-reconnect.mjs        # bằng chứng heartbeat + backoff + watchdog (#37): driver sống 10 phút, giết bridge giữa chừng, vào docs/nao/reconnect.* (CHẠY MỘT LẦN)
node scripts/kiem-c0.mjs      # bằng chứng C0: phản xạ xã hội + nhân vật nam anime, vào docs/c0/ (CHẠY MỘT LẦN)
node scripts/kiem-c1.mjs      # bằng chứng C1: giữ V nói → bridge nhận chữ → user.speech → Gen phản ứng, vào docs/c1/ (CHẠY MỘT LẦN)
bash scripts/fetch-anim.sh    # tải bộ chuyển động CC0 (Quaternius) về public/anim/ — chạy 1 lần sau khi clone
bash scripts/fetch-stt.sh     # C1: venv + model PhoWhisper-small ct2 vào .cache/stt/ — chạy 1 lần (chay.sh gọi sẵn)
```

## Quy ước

- **Không commit asset.** Mọi file 3D (`public/models/`, `public/kenney/`) đều nằm
  trong `.gitignore`; chỉ commit `scripts/fetch-assets.sh`. Không commit file > 5 MB.
- **Nguồn + giấy phép asset** ghi trong `assets/LICENSES.md`. Thêm asset mới thì
  phải thêm vào cả script tải lẫn file này.
- **Tiếng Việt**: giao diện, comment, commit, PR, báo cáo đều bằng tiếng Việt có dấu.
  Tên biến/hàm tiếng Việt không dấu cho phần nghiệp vụ cảnh (`phong`, `nhanVat`…);
  **tên lệnh, tên tham số, khoá JSON trong Actor API giữ nguyên tiếng Anh** theo
  spec (`actor.moveTo`, `durationMs`, `distances`) — đổi là phá hợp đồng với agent.
- **Hiệu năng**: pixel ratio ≤ 2, shadow map 2048, chạy mượt trên điện thoại.
  Khung bóng của đèn chính phải **bó sát cảnh** (`shadow.camera.near/far`): để
  khoảng near/far rộng quá thì depth loãng và cả mặt sàn tự che bóng chính mình.
- **Không viết số euler cho xương tay.** Mọi cử chỉ dùng tay đi qua
  `huongTay(ben, doCao, raTruoc)` / `tay(...)` trong `src/behavior/cu-chi.ts`:
  `doCao` 0 = buông, 0.5 = ngang vai, 1 = quá đầu. Hướng gốc của xương tay
  **đo trên chính model** (`doHuongGoc`), không giả định T-pose. Vòng 1 đoán
  dấu `rotation.z` nên 4 emote giơ tay thành ép tay vào hông.
- **Kích thước asset tính bằng mét, không bằng hệ số scale chung**: `phong.ts`
  chuẩn hoá mỗi model Kenney về chiều cao/bề ngang thật (`layCao`/`layRong`).
  Một hệ số chung cho mọi model làm kệ/cột phình lên 6–8 m chắn khung hình.
- **Vật liệu không nhân màu hai lần**: `map` đã mang màu thì đừng đặt thêm
  `color` tối — tường từng đen kịt vì map × color.
- **Thời gian là lời hứa**: mọi hành động có thời lượng nội suy theo đồng hồ
  thật (không cộng dồn `dt`) và dùng hẹn giờ **huỷ được**, để `durationMs` trả
  cho agent luôn đúng kể cả khi máy tụt xuống vài khung hình/giây.
- **Một nguồn sự thật cho trạng thái**: `NhanVat.viec` (hành động đang chiếm
  thân) quyết định `state`; `Dispatcher.dangChay` quyết định `busy`/`queued`.
  Không nơi nào khác được tự ghi `trangThai`, và mọi hẹn giờ phải kiểm "mình còn
  là hành động hiện tại không" trước khi ghi.
- **Nhận diện hành động bằng token, không bằng tên lệnh** — cắt `actor.play`
  bằng đúng `actor.play` là chuyện thường ở A2.
- **Bố cục cảnh nằm trong BẢNG, không trong code dựng** (`src/stage/bo-cuc.ts`).
  `phong.ts` chỉ đọc bảng rồi dựng. Mọi toạ độ trên lưới nửa ô 0,5 m, có test
  canh lưới + canh hành lang ≥ 3 m. Thêm đồ = thêm một dòng vào bảng.
- **Chuẩn hoá model Kenney phải kẹp CẢ HAI chiều.** Chỉ chuẩn theo chiều cao
  thì model bè ngang (`structure`, `desk_computerCorner`) phình ra 3–4 m — dùng
  `rongToiDa` trong bảng bố cục.
- **Chibi hoá phải đặt scale lên XƯƠNG RAW** (`getRawBoneNode`), và vì xương
  raw là cây thật nên bảng tỉ lệ là **tuyệt đối**, chia cho tổ tiên gần nhất mới
  ra scale cục bộ. Scale rig normalized là **no-op** (Issue #17). Scale xong
  phải gọi `springBoneManager.setInitState()` không thì tóc bung thành chùm gai.
- **`at` là câu trả lời dứt khoát**: chỉ mang tên place khi actor đã đứng yên
  tại đó; đang `walking` thì luôn `null`, kể cả khi đi ngang qua place khác.
  Muốn biết "đang gần cái gì" thì đọc `nearest: { place, distance }` (luôn có).
- Quy trình: Issue → branch → PR (`Refs #N`) → tự kiểm kèm bằng chứng → merge.
  Không merge khi chưa có ảnh/log chạy thật trong PR.

## Bố cục mã

Ba tầng, không được gọi ngược: **lệnh** không biết Three.js, **sân khấu** không
biết registry, **giao diện** không gọi thẳng vào sân khấu.

| Thư mục / file | Việc |
| --- | --- |
| `src/api/types.ts` | Khuôn dữ liệu duy nhất: `Command`, `Result`, `StageEvent`, `StageState`, và giao diện `StageWorld` |
| `src/api/registry.ts` | Sổ đăng ký lệnh (tên, mô tả, tham số, ví dụ) → nguồn cho `stage.bootstrap` và bảng lệnh UI |
| `src/api/validate.ts` | Kiểm + chuẩn hoá tham số trước khi chạm sân khấu |
| `src/api/dispatcher.ts` | **Một hàm `run(cmd, args)`** cho mọi đường vào: kiểm tham số, hàng đợi khi actor bận, `interrupt`, nhật ký |
| `src/api/commands/*.ts` | Mỗi nhóm một file: `stage`, `actor`, `prop`, `scene`, `camera`, `script`, `screen`, `module`, `fx` (A3), `stubs` (rỗng — mọi lệnh v0.1 đã thi công thật) |
| `src/stage/world.ts` | Thi công `StageWorld` bằng Three.js: renderer, camera, đèn, bloom (A3), actor, prop, màn hình hologram, bong bóng chữ, vòng lặp |
| `src/stage/nhanvat.ts` | Một nhân vật VRM: máy trạng thái + 3 lớp chuyển động (clip thật → cử chỉ → vi mô) + nhép miệng |
| `src/behavior/chuyen-dong.ts` | Nạp bộ clip CC0, **retarget sang `vrm.humanoid`**, `AnimationMixer` + crossfade 0,25 s; bảng `DANG_NEN`/`NEN_CLIP`/`NEN_EMOTE` |
| `src/behavior/cu-chi.ts` | Lớp cử chỉ thủ tục trộn lên clip thật; **hướng tay khai bằng hình học** (`huongTay(doCao, raTruoc)`), không viết số euler |
| `src/stage/bo-cuc.ts` | **BẢNG BỐ CỤC** (B1): cái gì đặt ở đâu theo lưới 1 m (3 vùng), hộp chắn đường + `truotVaCham` cho `actor.steer`. Dữ liệu thuần, KHÔNG import three |
| `src/stage/phong.ts` | Dựng LAB VIỄN TƯỞNG (A3): phòng 16 × 16 m, trần 5,6 m, sàn vân sáng, bục trung tâm, bàn điều khiển cong, kệ module, máy phát, trần đèn dải (Kenney Space Kit chuẩn hoá theo mét, hoặc fallback geometry emissive) |
| `src/stage/man-hinh.ts` | Màn hình hologram A3: CanvasTexture + scan-line, stream chữ chạy dần |
| `src/fx/*.ts` | A3: hiệu ứng kết tinh module (`hat-ket-tinh.ts`) + `fx.play` (`hieu-ung.ts`) |
| `src/stage/noi-dung.ts` | Dữ liệu cảnh v0.1: places (gồm `ban-dieu-khien` A3), clips, biểu cảm, emote, preset đèn/máy quay (gồm `truoc-mat` A2) |
| `src/stage/hanh-dong.ts` | Tiện ích `Action` (hành động có `durationMs` + `done` + `cancel`) |
| `src/ui/panel.ts` | Bảng lệnh **tự sinh** từ `stage.bootstrap` — không viết tay nút nào |
| `src/ui/script-box.ts` | Ô kịch bản: JSON hoặc dạng ngắn `gen moveTo ban-2` |
| `src/ui/log-view.ts` | Nhật ký cuộn + Sao chép / Xuất JSON |
| `src/ui/phim.ts` | Điều khiển bằng phím (WASD/1–0/Space/C/E/R/?) — **mọi phím gọi `dispatcher.run`**, tắt khi con trỏ đang ở ô nhập. B1: WASD gửi `actor.steer` mỗi 100 ms cho actor `controlledBy: "owner"` |
| `src/events.ts` · `src/log.ts` | Bus sự kiện · nhật ký JSON mọi lệnh và sự kiện |
| `src/bridge-client.ts` | Nối trình duyệt với bridge (mặc định bật, tắt bằng `?bridge=0`) |
| `bridge/server.ts` | Bridge WebSocket Node — mặc định chỉ nghe `127.0.0.1`; mở ra ngoài phải có `--host` + `GEN_STAGE_TOKEN`. Bật luôn TTS (8788) và MCP HTTP (8789) |
| `bridge/mcp.ts` | **B3** — MCP server: tool **sinh tự động** từ registry (`a.b` → `a_b`) + `stage_events` (long-poll). Hai cửa: stdio (`pnpm mcp`) và HTTP streamable `127.0.0.1:8789/mcp`. Cả hai nói với sân khấu bằng **vai client ws** của bridge |
| `src/behavior/phan-xa.ts` | **C0** — PHẢN XẠ XÃ HỘI: máy trạng thái chạy trong trình duyệt, không chờ não. Mọi hành động đi qua dispatcher, nguồn `phan-xa`, ưu tiên thấp nhất |
| `src/behavior/so-nao.ts` | **C0** — sổ "có mấy client MCP đang nối" (bridge ghi vào, `stage.describe` đọc ra) |
| `src/ui/o-chat.ts` | **B3** — ô chat dưới màn hình: Enter = `actor.say` lên nhân vật `owner`, y như `Space` |
| `skills/gen-stage-nao/SKILL.md` | **B3** — skill cho agy CLI: vòng `stage_events` → `stage_describe` → 1–3 lệnh → `actor_say` |
| `scripts/nao-agy.mjs` | **DRIVER NÃO** — vòng lặp nằm ở đây, không ở agy: nghe `user.text` qua ws, phản xạ ≤300 ms, gộp câu 800 ms, hàng đợi 1 lượt, bơm một dòng vào agy đang ấm trong tmux |
| `scripts/nao-demo.mjs` | **B3** — não mẫu rule-based (không LLM) chạy qua MCP stdio thật, làm bằng chứng vòng kín khi không có agy |
| `bridge/tts.ts` | **B2** — giọng tiếng Việt: `GET /tts` (cổng 8788) gọi thẳng WebSocket Edge, trả mp3, cache `.cache/tts/<sha1>.mp3` |
| `src/audio/tts-client.ts` | **B2** — tải + giải mã mp3, đo `durationMs` thật, phát bằng Web Audio, đẩy biên độ RMS mỗi 50 ms sang nhân vật |
| `src/audio/so-tieng.ts` | **B2** — sổ nối sân khấu ↔ lớp tiếng (không phụ thuộc gì): sổ miệng, thời lượng thật, cờ chặn Web Speech |
| `src/audio/nut-tieng.ts` | **B2** — nút "🔊 Bật tiếng" mở khoá autoplay, nhớ bằng `localStorage` |
| `bridge/stt.ts` | **C1** — nhận dạng giọng Việt: `POST /stt` (cổng 8790) → ffmpeg 16 kHz mono → thợ python (PhoWhisper-small ct2 int8) → `{ text, confidence, durationMs, goiGen }`, cache `.cache/stt/cache/<sha1>.json` |
| `bridge/stt-worker.py` | **C1** — thợ nhận dạng chạy mãi: nạp model + hâm máy một lần lúc bật bridge, mỗi dòng stdin là một wav |
| `bridge/so-tu.ts` | **C1** — SỔ TỪ NHÀ: sửa tên riêng (`Gen`, `connector`, `Baserow`, `module`, `Kho Ryan`) sau nhận dạng. Hạ WER 47 % → 5 %; khớp mờ cho tên dài, đồng âm khai tay cho tên ngắn |
| `src/audio/mic.ts` | **C1** — giữ phím **V** (hoặc giữ nút 🎤) để nói: `MediaRecorder` + đo RMS → `POST /stt` → chữ vào ô chat 1,5 s cho Boss sửa |
| `src/audio/vad.ts` | **C1** — cắt im lặng đầu/cuối theo RMS (ngưỡng tương đối theo đỉnh, chừa 120 ms mỗi đầu). Không phụ thuộc DOM |
| `src/audio/so-giong.ts` | **C1** — sổ nối mic ↔ `commands/actor.ts`: phiếu dùng một lần để `actor.say` biết câu này Boss NÓI chứ không gõ |
| `scripts/do-stt.mjs` | **C1** — bàn đo: sinh 20 wav bằng TTS của bridge, chấm WER/độ trễ từng engine (`docs/c1/so-sanh.md`) |
| `src/api/__tests__/` | `san-khau-gia.ts` (sân khấu giả, không WebGL) + test dispatcher/describe/script/A3 |

### Thêm một lệnh mới

1. Viết `CommandSpec` trong đúng file `src/api/commands/<nhóm>.ts` (có `desc`,
   `params`, `example`; khai `chiemActor: 'actor'` nếu lệnh có thời lượng; khai
   `events: [...]` cho mọi sự kiện lệnh bắn ra — `stage.bootstrap` gom từ đây).
2. Nếu cần động tới cảnh: thêm phương thức vào `StageWorld` (`src/api/types.ts`),
   thi công ở `src/stage/world.ts`, và thêm bản giả ở `san-khau-gia.ts`.
3. Hết. `stage.bootstrap`, bảng lệnh UI, ô kịch bản dạng ngắn và bridge tự biết.

## Phạm vi đã làm / chưa làm

- **A1 (xong)**: dispatcher, `stage.*`, `actor.*` (trừ `emote`/`idleStyle`),
  `prop.*`, `scene.light`, `camera.*`, `script.*`, bảng lệnh tự sinh, nhật ký,
  bridge WebSocket. `actor.say` = bong bóng + nhép miệng giả + Web Speech nếu có.
- **A2 (xong, vòng 2)**: `actor.emote` (15 emote, `src/behavior/emotes.ts`) +
  `actor.idleStyle` (4 kiểu, `src/behavior/idle-styles.ts`) thi công thật —
  không còn là stub. Lớp hành vi nhỏ luôn chạy khi idle (thở, đổi chân, nhìn
  quanh) + khi nói (gật/nghiêng đầu, cử chỉ nhịp tay) trong `NhanVat.capNhat`.
  `actor.say` có `emotion` → mặt + **4 nhóm cử chỉ** theo cảm xúc (giữ nguyên
  hành vi A1 khi không truyền `emotion`). Nhân vật chibi bằng bone scale (không
  đổi model mặc định, không tìm được VRM chibi CC0 nguồn rõ — xem `TY_LE_CHIBI`
  trong `nhanvat.ts`), tỉ lệ đầu/người ~1/2,9. **Chuyển động nền là clip CC0
  THẬT đã retarget** (`src/behavior/chuyen-dong.ts`), cử chỉ bộ CC0 không có
  thì bù bằng lớp thủ tục (`src/behavior/cu-chi.ts`) — xem "Quyết định A2 vòng
  2" bên dưới.
- **A3 (xong)**: cảnh lab viễn tưởng (`phong.ts`, Kenney Space Kit CC0 hoặc
  fallback emissive), `UnrealBloomPass` nửa độ phân giải + tự tắt khi FPS thấp,
  `screen.*` (hologram, CanvasTexture, stream theo `chunks` hoặc `source:"agent"`
  qua `window.stage.feed`), `module.build` (kết tinh hạt `src/fx/hat-ket-tinh.ts`
  + tự `actor.hold` qua dispatcher) + `module.open`/`module.store`, `fx.play`
  (`src/fx/hieu-ung.ts`), `camera.preset` thêm `ban-dieu-khien`.
- **Lab vòng 2 — rộng/sáng/gọn + phím (xong, #11 #14)**: phòng **16 × 16 m**,
  trần 5,6 m, `buc-trung-tam` về đúng gốc toạ độ, camera `toan-canh` lùi ra,
  bỏ bàn gỗ + ghế văn phòng cũ (place `ban-*`/`ghe-*` giữ nguyên làm mốc test),
  Kenney chuẩn hoá theo mét, và **điều khiển bằng phím** (`src/ui/phim.ts`:
  WASD/1–0/Space/C/E/R/?) — mọi phím đi qua `dispatcher.run`.

- **B1 (xong, #18)**: `src/stage/bo-cuc.ts` (bảng bố cục 3 vùng theo lưới 1 m,
  hành lang 3,2 m, dãy tủ sát tường sau), **`actor.steer`** (lái bằng vận tốc,
  KHÔNG xếp hàng, kẹp 1,6 m/s, lerp 0,15 s, trượt dọc bàn/kệ), phím WASD gửi
  steer mỗi 100 ms qua dispatcher, camera preset **`theo-owner`**, hai nhân vật
  mặc định **`owner` (VRM nam CC0) + `gen`** (nữ, `idleStyle: cham-chu` ở bàn
  điều khiển), `stage.describe` thêm **`controlledBy`**, và chibi hoá xương raw
  (Issue #17 — tỉ lệ đầu/người đo thật ~1/2,5–1/2,8).

- **B3 (xong, #21)**: `bridge/mcp.ts` — **42 tool = 41 lệnh + `stage_events`**,
  sinh thẳng từ registry nên thêm lệnh là có tool mới; `stage_bootstrap` qua MCP
  trả thêm `huongDanAgent` (vai diễn của Gen); `actor.say` lên nhân vật
  `controlledBy: "owner"` bắn **`user.text`** → vòng hội thoại Owner ⇄ Gen;
  **ô chat** dưới màn hình (`src/ui/o-chat.ts`); `docs/BOOTSTRAP-AGENT.md` +
  `skills/gen-stage-nao/SKILL.md` cho agy; `scripts/nao-demo.mjs` (não mẫu
  không LLM). Đã chạy thật **cả hai não**: agy CLI (8 tool call MCP, log
  `docs/b3/agy-tool-calls.json`) và nao-demo (16 tool call,
  `docs/b3/nao-demo-log.json`).

- **C0 (xong, #28)**: `src/behavior/phan-xa.ts` — Sếp gõ là Gen **quay lại + đáp
  trong ≤ 300 ms**, không chờ não; câu đệm ở mốc 1,5 s, bị cắt khi não nói;
  Owner vào 2,5 m thì nhìn theo, > 4 s thì chào nhẹ một lần; não không nối thì
  trả lời bằng **não rule-based tối thiểu trong app**. Thêm emote `chu-y`
  (tổng 16), lệnh **`actor.faceTo`** (quay người không chiếm thân), tham số
  **`actor.say { to }`** (nói với ai; mặc định `camera` = Sếp đang xem), và
  `stage.describe` thêm **`brainConnected`**, **`facingTarget`**, **`camera`**.
  Nhân vật nam đổi sang **VRoid HairSample_Male (CC0)** — nam, anime, cùng gu
  với Gen; tên hiện là **Javis** (avatar của Sếp trong phòng).

`src/api/commands/stubs.ts` giờ **rỗng**: cả A2 lẫn A3 đã thi công thật, không
còn lệnh nào trả `ok:false` kiểu "chưa làm". File được giữ lại làm chỗ khai
lệnh mới cho các đợt sau — `stage.bootstrap` vẫn liệt kê đủ bộ v0.1.

## Quyết định A2 vòng 2 (25/10 — sau review PR #10)

- **Chuyển động là clip THẬT.** Bộ CC0 Quaternius "Universal Animation Library"
  (mirror `J-Ponzo/gltf-universal-animation-library`) tải về `public/anim/`
  bằng `scripts/fetch-anim.sh`, retarget sang `vrm.humanoid` normalized trong
  `src/behavior/chuyen-dong.ts` (dùng clip `A_TPose` làm tư thế gốc), phát bằng
  `THREE.AnimationMixer`, **crossfade 0,25 s**. Thiếu file thì app tự rơi về
  chuyển động thủ tục, không lỗi. Clip spec bộ CC0 không có (wave, clap, nod,
  shake, think, point, sleep, type và các cử chỉ emote) = **clip gần nhất làm
  nền + lớp cử chỉ thủ tục**, bảng ghép trong `NEN_CLIP` / `NEN_EMOTE`.
- **Hông không tự quay.** Khi bake, phần xoay quanh trục đứng của `hips` bị bỏ:
  hướng mặt là việc của `actor.turnTo`, nếu để clip quay thì `facing` trong
  `stage.describe` nói dối.
- **`done` vẫn resolve khi bị huỷ** (dispatcher lõi A1 cần thế để giải phóng
  hàng đợi), nhưng `Action` có thêm `cancelled()`. Nơi nào dọn dẹp sau hành
  động phải kiểm cờ này: emote bị cắt KHÔNG tắt giọng của emote mới, KHÔNG ghi
  `mood`, và bắn `actor.emoteCancelled` thay cho `actor.emoteDone`.
- **`actor.stop` dọn cả cảm xúc**: biểu cảm về `neutral`, `mood` về
  `binh-thuong` ngay trong `NhanVat.dung()`.
- **Emote/clip kết thúc bằng hẹn giờ huỷ được**, không bằng điều kiện trong
  `capNhat` — `durationMs` đúng kể cả khi tụt khung hình (đo thật: hứa 2600 ms,
  thật 2601 ms trên renderer phần mềm ~3 fps).
- **`actor.say` + `emotion` có 4 nhóm cử chỉ khác nhau** (vui / buồn / giận /
  ngạc nhiên + mặc định) trong `cuChiNoi`, và nhìn về người nghe (camera).
- **Góc máy `truoc-mat`** (thêm vào `PRESET_MAY`): chính diện, thấy trọn người
  — bắt buộc cho ảnh bằng chứng emote.
- **Chibi**: tỉ lệ đầu/người ~**1/2,9** (đo thật trong `nhat-ky-kiem-a2.json`),
  toàn bộ bằng `setScalar` (scale đều, không hệ số âm) nên da/tóc không răng cưa.

## Quyết định A2 (bổ sung, không sửa mục trên)

- **`busy` còn `true` đúng MỘT nhịp (một microtask) tại thời điểm sự kiện
  `actor.arrived`/`actor.clipDone`/`actor.emoteDone`… bắn ra** — đã kiểm bằng
  Playwright thật (`stage.describe()` gọi ngay trong handler của sự kiện vẫn
  thấy `busy: true`, dù `state` đã là `idle`). Nguyên nhân: `dispatcher.ts`
  (lõi A1, A2 không được sửa) gắn `.then()` giải phóng hàng đợi SAU `.then()`
  bắn sự kiện trong `commands/actor.ts` — cùng một Promise `done`, nhưng hai
  `.then()` chạy theo đúng thứ tự gắn vào, không cùng nhịp. **Quyết định: giữ
  nguyên, không sửa dispatcher.** Agent/script cần biết "thân đã rảnh chưa"
  ngay trong handler sự kiện thì đọc `state` (đã đúng ngay lúc đó), không đọc
  `busy`; muốn `busy` đúng thì đợi thêm một `await Promise.resolve()` hoặc gọi
  `stage.describe()` ở lượt sau.
- **Nhân vật chibi**: không tìm được VRM chibi CC0 nguồn rõ ràng kịp A2 (đã
  tra `toxsam/open-source-avatars`, `MJMoonbow/VRMavatars`, `madjin/vrm-samples`
  — không có model gắn nhãn chibi/giấy phép rõ). Theo đúng phương án dự phòng
  trong spec: chibi hoá bằng bone scale (`TY_LE_CHIBI` trong `nhanvat.ts`),
  áp cho MỌI model nạp (kể cả `AvatarSample_B.vrm` mặc định) — Boss thay bằng
  VRM chibi thật lúc nào cũng được, code tự nhân hệ số lên bộ xương có sẵn.

## Quyết định B2 — giọng tiếng Việt (25/10, Issue #20)

- **Không dùng thư viện edge-tts nào.** `@andresaya/edge-tts` là
  **GPL-3.0-only**, `edge-tts-universal` là **AGPL-3.0** — copyleft, nối vào
  bridge là kéo cả Gen-Stage theo giấy phép đó. Giao thức Edge chỉ gồm một URL
  có `Sec-MS-GEC` (SHA-256 của mốc thời gian Windows làm tròn 5 phút + token
  công khai), một khung `speech.config`, một khung SSML, rồi các khung nhị phân
  `Path:audio` tới `turn.end` — tự viết trong `bridge/tts.ts` bằng `ws` +
  `node:crypto` **có sẵn**, không thêm phụ thuộc, không khoá API.
  Cạm bẫy đã đo: thiếu header `Cookie: MUID=…` hoặc `Accept-Encoding` thì dịch
  vụ trả **HTTP 200 thay vì 101** ("Unexpected server response: 200").
- **`durationMs` là thời lượng audio THẬT.** `actor.say` tải + giải mã mp3
  **trước** khi nhân vật mở miệng, rồi báo số đo vào `src/audio/so-tieng.ts`;
  `uocThoiLuongNoi` đọc số đó thay cho công thức đếm ký tự. Nhờ vậy bong bóng
  chữ, hẹn giờ hành động và `durationMs` trả cho agent **cùng một con số**
  (đo thật: 5616 ms audio vs 5446 ms nếu đếm chữ).
- **Biên độ tính sẵn từ `AudioBuffer`, không đọc `AnalyserNode`.** Envelope RMS
  mỗi 50 ms lấy thẳng từ mẫu PCM đã giải mã rồi phát theo đồng hồ, nên nhép
  miệng vẫn đúng trên máy **không có thiết bị âm thanh** (Playwright headless,
  `--mute-audio`) — bằng chứng B2 đo được 30/30 mẫu RMS > 0, đỉnh 0,89.
- **Nhép miệng cũ không bị thay, chỉ bị nhường chỗ.** `nhepMiengTheoBienDo(rms)`
  đặt biên độ kèm **hạn dùng 0,25 s**; hết mẫu là `capNhat` tự quay về đúng hai
  nhánh A1/A2 (nhép theo độ dài chữ). `aa` theo RMS, thêm `ih`/`ou` xen kẽ nhẹ
  — giọng Việt nhiều nguyên âm, chỉ há `aa` thì nhìn như cá đớp.
- **Giọng theo actor, không theo lệnh gọi**: `owner` → **nam**
  (`vi-VN-NamMinhNeural`), còn lại → **nữ** (`vi-VN-HoaiMyNeural`).
  `actor.say` nhận `voice: "nu" | "nam" | <tên giọng>` và **trả về giọng đã
  chọn** trong `result.voice`, để agent đọc log biết câu đó phát bằng giọng nào.
- **Bridge tắt không phải lỗi.** `chuanBi` trả `null`, hạ cờ chặn Web Speech →
  `NhanVat.noi` chạy đúng như A1 (Web Speech `vi-VN`, không có giọng Việt thì
  nhép theo độ dài chữ). Toast nhắc `pnpm bridge` hiện **một lần mỗi phiên**,
  và không gọi lại bridge cho tới khi tải lại trang.
- **Autoplay**: Chrome chặn tiếng tới khi có cú bấm thật. Nút "🔊 Bật tiếng"
  góc trên (`src/audio/nut-tieng.ts`) `resume()` AudioContext trong chính
  handler của cú bấm, rồi nhớ vào `localStorage` — phiên sau không hiện nút
  nữa, chỉ cần cú tương tác đầu tiên bất kỳ là tự mở khoá. Script bằng chứng
  gọi `window.stage.batTieng()` + cờ `--autoplay-policy=no-user-gesture-required`.

## Quyết định B3 — não cho Gen qua MCP (25/10, Issue #21)

- **MCP là ảnh chiếu của registry, không phải bộ lệnh thứ hai.** Tool sinh
  bằng vòng lặp trên `registry.all()`; chỉ `stage_events` khai tay vì nó không
  phải lệnh sân khấu mà là cửa để não *nghe*. Test giữ bất biến
  **số tool = số lệnh + 1** — thêm lệnh mà quên gì đó là test đỏ ngay.
- **MCP không có đường riêng vào dispatcher.** Cả stdio lẫn HTTP đều nối vào
  bridge bằng **vai client ws**, kể cả bản HTTP chạy *trong chính tiến trình
  bridge*. Chậm hơn vài mili giây, đổi lại không bao giờ lệch hành vi với
  đường ws mà Boss vẫn dùng (hàng đợi, timeout, token y hệt).
- **`user.text` có đúng một nguồn**: `actor.say` lên nhân vật `controlledBy:
  "owner"`. Space, ô chat và bảng lệnh đều chảy qua đó, nên không cửa nào phải
  tự nhớ bắn sự kiện, và não chỉ nghe một cái tên.
- **Tham số `vec3`/`target`/`json` khai là chuỗi trong JSON Schema.**
  `validate.ts` đọc được cả mảng, object lẫn `"x, y, z"`, nhưng khai nhiều kiểu
  thì client MCP khó tính (và não) phải đoán; một kiểu + mô tả rõ là xong.
- **Module rơi vào tay người LÀM**, không phải tay Boss: `module.build` chọn
  actor `controlledBy: "agent"` đầu tiên. A3 lấy `actorIds()[0]`, mà từ B1
  nhân vật đầu tiên là `owner`.
- **Cạm bẫy đã đo: client MCP stdio KHÔNG truyền biến môi trường tuỳ ý.**
  `StdioClientTransport` chỉ cho con thừa hưởng một danh sách an toàn, nên
  `GEN_STAGE_PORT` bị rơi và `bridge/mcp.ts` lặng lẽ nối về 8787 — não nghe mãi
  không thấy câu nào mà không báo lỗi gì. Phải truyền `env` tay (xem
  `scripts/nao-demo.mjs`), và khi `agy mcp add` bản stdio với cổng khác mặc
  định thì phải khai `--env`.
- **agy giữ cấu hình MCP ở `~/.gemini/config/mcp_config.json`** (khoá
  `serverUrl` cho bản http), thêm bằng `agy mcp add gen-stage http://127.0.0.1:8789/mcp`.
- **Bằng chứng chạy trên bộ cổng riêng 8797/8798/8799** vì máy Boss thường đã
  có `pnpm bridge` thật ở 8787 — script bằng chứng không được dùng chung lẫn
  giết bridge đó.

## Quyết định DRIVER NÃO — agy tự lắng nghe sự kiện (26/10, Refs #21)

- **Vòng lặp nằm ở driver, không ở agy.** Bản cũ bật
  `agy --prompt-interactive "$(cat SKILL.md)"` trong tmux rồi bỏ đó: agy chào
  một lượt rồi về dấu nhắc `>` **chờ người gõ trong terminal**, nó không tự lặp
  `stage_events`. Sếp gõ trong Firefox thì không ai nghe → "nó chưa trả lời".
  `scripts/nao-agy.mjs` đảo vai: driver là cái vòng lặp (client ws của bridge),
  agy chỉ là cái não được gọi một lượt mỗi câu.
- **Giữ agy ẤM trong tmux, không gọi `agy -p` mỗi câu.** Đo thật trên máy Boss,
  Gemini 3.8 Flash low:

  | Phương án | Khởi động | Một lượt (prompt rỗng) | Một lượt thật (2–3 tool MCP) |
  | --- | --- | --- | --- |
  | A. `agy -p` mỗi câu | 8–12 s **mỗi lần** | 8,1 / 10,9 / 11,8 s | 15–25 s |
  | B. tmux ấm + `send-keys` | một lần | 3,4 / 3,6 / 5,2 s | **5,5 / 5,6 s** |

  Đo trọn vòng "Sếp gõ → Gen bắt đầu nói" (`docs/nao/nhat-ky-kiem-nao.json`):
  phản xạ **71–99 ms**, câu trả lời đầu **5554 / 5566 ms**, lượt thứ ba xếp
  hàng sau lượt hai nên 19,6 s — đúng như thiết kế hàng đợi một-lượt.

  `agy -p` phải nối lại cả 3 server MCP mỗi lần chạy — đó là phần 8–12 s đó.
  Mặc định là B; A giữ làm dự phòng (`GEN_STAGE_NAO_CHE_DO=print`).
- **Phản xạ tách khỏi suy nghĩ.** Driver bắn `actor.turnTo owner` +
  `actor.emote suy-nghi` ngay từ **sự kiện thô**, trước cả cửa sổ gộp 800 ms —
  đo được **71–87 ms**. Sếp thấy Gen quay sang và nghĩ ngay, trong lúc não còn
  đang chạy 6 s nữa.
- **`actor_say` TRƯỚC, diễn SAU.** Nhắc đầu phiên dặn gọi `actor_say` đầu tiên
  rồi mới `screen_*`/`module_*`; nhờ vậy "câu trả lời đầu" là 6,2–6,9 s thay vì
  phải chờ hết 3 lệnh diễn.
- **Nhắc phải ngắn.** SKILL.md rút gọn ≤40 dòng (bỏ frontmatter, bỏ mục "Vòng
  lặp" — driver lo việc đó, bỏ khối code), và `stage_describe` rút còn
  gen + owner + screens + modules + **5 sự kiện cuối**, không mang theo bảng
  khoảng cách tới mọi place.
- **Mốc "Sếp nghe được tiếng" là sự kiện mới `actor.sayStart`** (bắn đúng lúc
  bong bóng chữ hiện ra, sau khi tải tiếng). `actor.sayDone` chỉ nói "đã nói
  xong" nên không đo được độ trễ. Driver dùng mốc này để tắt hẹn "xin Sếp chờ"
  và để biết não có mở miệng hay không.
- **Câu đã có lớp hiểu lệnh xử lý thì não KHÔNG nghĩ lại** (đồng bộ C2, PR #33):
  driver bỏ qua `user.text`/`user.speech` mang `handled: true`, và không nghe
  `user.command`. "Javis, đi tới bàn điều khiển" → lớp lệnh lo, tốn 0 token;
  "Gen, hôm nay làm gì" → không lệnh nào khớp, đến lượt agy. Driver nghe
  `user.speech` (C1 — nói bằng miệng) y hệt `user.text`.
- **Ba cái chặn vòng lặp**: (1) bỏ `user.text` của `gen`; (2) hàng đợi tối đa
  **một** lượt agy cùng lúc; (3) gộp câu 800 ms. Thiếu cái nào cũng ra hai bong
  bóng chen nhau và hai lần tốn quota.
- **Gộp câu 800 ms ít khi bắn trong thực tế, và đó là đúng.** `actor.say`
  **chiếm** actor, nên câu thứ hai của Sếp nằm chờ owner nói xong (2–3 s) rồi
  `user.text` mới bắn — quá cửa sổ gộp. Nó chỉ bắn khi hai câu tới thật sát:
  Sếp gõ tiếp khi mình còn đang nói (`interrupt: true`), hoặc `user.speech` đẩy
  liền mấy mẩu. Giữ cửa sổ gộp vì nó là cái lưới, không phải cái cổng.
- **agy chạy trong thư mục RỖNG (`.cache/nao-agy`), kèm `AGENTS.md` vai diễn.**
  Cạm bẫy đã đo: mở agy ngay trong repo thì nó đọc `CLAUDE.md` rồi tự đi chạy
  `tsc`, `ls`, `cat package.json`; mở trong thư mục trắng thì plugin toàn cục
  `pro-agent-harness` của Boss bắt nó `git init` + dựng `docs/ssot/`. Một
  `AGENTS.md`/`GEMINI.md` ngay tại chỗ là chỉ dẫn gần nhất nên nó thắng; phần
  bootstrap của plugin vẫn chạy **một lần** lúc ấm, không chen vào từng lượt.
- **Bận/rảnh đọc bằng `tmux capture-pane`**: khung agy để dòng `esc to cancel`
  ở cuối khi còn nghĩ. Bơm chữ bằng `send-keys -l` (literal) rồi `Enter` riêng,
  và **mỗi lượt phải là MỘT dòng** — gặp `\n` là tmux bấm Enter giữa câu.
- **`localhost` → `127.0.0.1` trong `src/bridge-client.ts`.** Chrome thử `::1`
  trước, mà bridge chỉ nghe `127.0.0.1`, nên mỗi lần nối ném một
  `ERR_CONNECTION_REFUSED` ra console rồi mới nối lại bằng IPv4 — console đầy
  lỗi giả dù vẫn nối được.
- **Bằng chứng tự dọn**: `scripts/kiem-nao.mjs` thêm MCP tạm `gen-stage-thu`
  (trỏ 8799) vào cấu hình agy và **xoá ở cuối**, dùng session tmux riêng
  `gen-stage-nao-thu`, và giải phóng đúng 3 cổng 8797–8799 của mình trước khi
  bật — không bao giờ chạm 8787–8789 lẫn `gen-stage`/`gen-stage-nao` của Boss.
## Quyết định C0 — phản xạ xã hội + nhân vật nam anime (26/10, Issue #28)

- **Sếp KHÔNG phải nhân vật trong phòng.** Với Gen, Sếp là người xem qua màn
  hình, tức là **máy quay**; người Boss lái bằng WASD là **Javis** (avatar).
  Lẫn hai cái này là Gen quay lưng vào khán giả để nói với một avatar đứng im.
  `actor.say` mặc định `to: "camera"`, `stage.describe` trả `camera.pos` +
  `facingTarget` để não biết đường mà quay.
- **Phản xạ là tuỷ sống, không phải não.** Chạy trong trình duyệt, không chờ
  MCP; mọi lệnh vẫn qua dispatcher với nguồn `phan-xa` (nhật ký phân biệt
  được). **Ưu tiên thấp nhất**: chỉ ra lệnh chiếm thân khi Gen rảnh.
- **Cắt câu đệm KHÔNG dùng `actor.stop` / `interrupt: true`.** Hai cửa đó gọi
  `catNgang`, mà `catNgang` **xoá sạch hàng đợi** → giết luôn câu của não vừa
  xếp hàng sau câu đệm. Phản xạ gọi thẳng `world.actorInterrupt(gen)`: huỷ
  đúng hành động đang chạy, dispatcher thấy `done` thì tự xả hàng đợi.
- **`actor.turnTo` vô dụng khi đang nói** (chiếm thân → xếp hàng chạy sau khi
  nói xong, đúng lúc hết cần). Vì thế có **`actor.faceTo`**: quay người không
  chiếm thân, gọi được mỗi nhịp để giữ mặt về người nghe kể cả khi Boss đổi
  `camera.preset` giữa câu.
- **`xoayVe` không được khởi động lại khi mục tiêu chưa đổi.** `faceTo` gọi mỗi
  nhịp mà lần nào cũng huỷ cú quay cũ thì đường nội suy ease-in-out cứ về mốc 0
  — nhân vật nhích vài độ rồi đứng im (rõ nhất trên máy kiểm ~1 fps). Nay chỉ
  quay lại khi mục tiêu lệch > 0,12 rad so với cú quay đang chạy.
- **Gốc nhân vật là một `Group` BỌC NGOÀI `vrm.scene`, không phải chính nó.**
  Model VRM 0.x cần `VRMUtils.rotateVRM0` (đặt `vrm.scene.rotation.y = π`),
  nhưng cả sân khấu lại ghi `goc.rotation.y` để quay người → cú ghi đầu tiên
  xoá sạch 180° đó và nhân vật **đi lùi suốt đời** (đúng cái Boss thấy). Tách
  hai việc ra hai node: Group giữ *hướng đi*, `vrm.scene` giữ *bù trừ VRM0*.
- **Delta chuyển động phải liên hợp 180° cho model VRM 0.x.** Bộ xương
  normalized của `@pixiv/three-vrm` lấy trục theo hệ của chính file: VRM 1.0
  nhìn +Z, VRM 0.x nhìn −Z. Đắp thẳng delta (đo trên bộ Quaternius, hệ +Z) lên
  model VRM0 thì cánh tay nhận đúng góc nhưng **ngược dấu z** → hai tay giơ
  thẳng lên trời và ở nguyên đó sau cú đi đầu tiên (đo thật: bàn tay y = 1,85 m
  trong khi vai y = 1,42 m). `rotateVRM0` KHÔNG sửa chỗ này — nó chỉ xoay
  `vrm.scene`. Liên hợp Ry(180°) = đổi dấu x và z của quaternion, làm ngay lúc
  bake trong `chuyen-dong.ts`. Có bước kiểm số trong `kiem-c0.mjs`.
- **`brainConnected` đếm hai nguồn khác nhau**: tiến trình MCP **stdio** tự
  xưng `?role=nao` khi nối ws (đếm được chính xác), còn bản MCP **HTTP** chạy
  trong chính bridge thì tính theo *yêu cầu MCP gần nhất* trong 60 s — nó luôn
  giữ sẵn một kết nối ws dù chưa não nào gọi, đếm theo kết nối là nói dối.
  Bridge đẩy `bridge.brain` **xuống** sân khấu (chiều ngược với mọi sự kiện
  khác); không có bridge = `false`.
- **Nhân vật nam: VRoid `HairSample_Male`, CC0.** B1 từng loại `AvatarSample_A`
  vì mirror không có LICENSE — đúng, vì A/B/C **không phải CC0** (trang VRoid
  nói thẳng "The license to these sample models is not CC0"). `HairSample_Male`
  thì được VRoid liệt kê **đích danh** trong danh sách CC0, mà CC0 thì ai mirror
  cũng hợp lệ — nên mirror thiếu LICENSE không còn là vấn đề. Chi tiết +
  ứng viên đã loại: `assets/LICENSES.md` mục 1b.
- **Máy kiểm chạy ~1 fps (swiftshader)**, nên: đo độ trễ phản xạ bằng **nhật ký
  lệnh** chứ không bằng `facing` trên khung hình; và `actor.steer` 300 ms hết
  hạn trước cả khung hình kế tiếp — script bằng chứng phải dùng nhịp 2,5 s.
## Quyết định C1 — nhận dạng giọng Việt (26/10, Issue #31)

Số đo đầy đủ và lý do loại từng lựa chọn: **`docs/c1/so-sanh.md`**.

- **Nhận dạng ở bridge, không ở trình duyệt.** Boss dùng Firefox trên Fedora →
  không có Web Speech API. Máy không có CUDA dùng được → CPU.
- **Engine: PhoWhisper-small (VinAI) bản CTranslate2 int8** qua `faster-whisper`.
  Đo thật trên máy Boss: whisper.cpp `small` mất **14,6 s** một câu và
  `large-v3-turbo` mất **77,6 s** (loại vì trễ); Vosk nhanh 0,24 s nhưng sai
  **động từ lệnh** ("dừng lại" → "nhìn lại"); whisper gốc đa ngôn ngữ cùng cỡ
  kém PhoWhisper 3 lần về WER tiếng Việt.
- **Sai là do VỐN TỪ, không do âm học.** Mọi engine nghe đúng câu lệnh tiếng
  Việt thường nhưng **không engine nào** nghe ra `Gen`, `connector`, `Baserow`,
  `module`, `Kho Ryan`. Nâng cỡ model không chữa được (`large-v3-turbo` vẫn
  sai y thế, chỉ chậm hơn 24 lần), `initial_prompt` và `hotwords` làm **tệ
  hơn** (model sinh câu không có thật). Chỗ chữa là `bridge/so-tu.ts` — sổ từ
  nhà, WER **47,4 % → 5,3 %**. Sổ chỉ chứa **tên riêng**: khai từ Việt thường
  vào là nó sửa bừa câu Boss nói đúng ("cất module" → "kết tinh module").
- **Thợ python chạy mãi + hâm máy.** Nạp model mất 3–6 s và 6 câu đầu mất
  10–24 s (ct2 mmap model 465 MB, nạp trang lười; VAD Silero nạp lười). Thợ
  đọc trước cả `model.bin` vào page cache rồi chạy 4 lượt hâm trước khi báo
  "sẵn sàng" — Boss không chịu khoản đó.
- **Chữ nhận được KHÔNG tự gửi ngay**: đổ vào ô chat 1,5 s để Boss sửa (Enter
  gửi ngay, Esc bỏ, gõ một ký tự là huỷ hẹn tự gửi). Tin cậy < 0,6 thì **không**
  tự gửi — thà Boss bấm thêm Enter hơn là Gen dựng sai connector.
- **Mic đi đúng cửa ô chat** (`oChat.gui`), không gọi thẳng dispatcher: Boss nói
  hay gõ đều ra một `actor.say` lên nhân vật `owner` → cùng `user.text`.
  `user.speech` thêm vào nhờ **phiếu dùng một lần** trong `src/audio/so-giong.ts`,
  nên không phải thêm tham số lạ vào `actor.say` mà mọi agent phải học.
- **Cắt im lặng phải chừa lề.** Đo thật: cắt 200 ms đầu làm mất phụ âm đầu —
  "dừng lại" → "đừng lại", "mở màn hình" → "ở màn hình". VAD chừa 120 ms mỗi đầu.
- **Cạm bẫy Chrome**: `--use-file-for-fake-audio-capture` với đường có **khoảng
  trắng** làm Chrome tự tắt sau 4 s, không một dòng lỗi. Thư mục dự án của Boss
  có khoảng trắng, nên `scripts/kiem-c1.mjs` chép wav sang `/tmp` trước.

## Quyết định HEARTBEAT + RECONNECT + WATCHDOG (26/10, Issue #37)

Báo cáo E2E: "`scripts/nao-agy.mjs` rớt kết nối ws tới bridge âm thầm sau vài
phút → `brainConnected` về 0, Gen nói 'chưa có não', không có dòng log nào."

- **Nguyên nhân gốc KHÔNG phải ws rớt tầng mạng — là driver không hề tự xưng
  "não".** `noiSanKhau()` (bản trước #37) nối bridge **không có** `?role=nao`,
  nên `naoWs` (bộ đếm "não đang nối" trong `bridge/server.ts`) không bao giờ
  thấy nó. `brainConnected` khi đó chỉ sống nhờ MỘT nguồn khác: mỗi lần agy gọi
  một tool MCP qua HTTP, bridge đặt `naoHttpDen = now + 60000 ms`
  (`GEN_STAGE_BRAIN_TTL`). Driver chỉ gọi agy **một lượt mỗi câu Sếp nói**
  (không polling) — Sếp im hơn 60 giây (rất bình thường) là đồng hồ đó hết
  hạn, bridge tự bắn `bridge.brain {connected:false}` cho sân khấu, **không hề
  có sự kiện `close`/`error` nào** (ws của driver vẫn `OPEN` 100 %) → không một
  dòng log. Tái hiện sống bằng `scripts/kiem-mo-phong-loi-cu.mjs` (rút TTL
  xuống vài giây để "mô phỏng" vài phút im lặng, không cần chờ thật):
  `brainConnected` về `false` đúng lúc, `readyState` ws vẫn `1` suốt.
  **Sửa cốt lõi: driver nối `?role=nao`** — còn sống là còn được tính, không
  phụ thuộc agy có vừa gọi tool trong 60 s gần nhất hay không.
- **Cạm bẫy thứ hai, nặng hơn, lộ ra khi ĐO THẬT bằng chứng 10 phút:** hẹn giờ
  nối lại (`henNoiLai = setTimeout(noi, cho)`) bản đầu có `.unref()` (bắt
  chước bản cũ). Lúc driver **rảnh** (không lượt não nào đang chạy, `cheDo:
  print` không có tmux nào giữ event loop) và ws vừa chết, cái hẹn giờ unref
  đó là handle **DUY NHẤT** còn sống — unref nó thì Node thấy "chẳng còn gì để
  làm" và **tự thoát sạch** (code 0, không crash, không log). Không phải driver
  mất kết nối — **cả tiến trình biến mất**. Bỏ `.unref()` ở cả hẹn giờ nối lại
  lẫn nhịp tim; đo lại 10 phút: driver sống hết giờ, không thoát.
- **Heartbeat ứng dụng hai chiều, không phải ping/pong tầng WebSocket.** Trình
  duyệt không cho script gửi ping tầng giao thức, và tầng ứng dụng thì log
  được lý do. Mỗi 15 s (`GEN_STAGE_NAO_NHIP_TIM`) driver gửi `{ping}`, bridge
  trả `{pong}` ngay (`bridge/server.ts` xử lý trước cả khi đòi `cmd`, không ghi
  vào nhật ký `→`). Quá 35 s (`GEN_STAGE_NAO_QUA_HAN_TIM`, > 2 nhịp) không
  thấy pong nào → driver tự `terminate()` để `close` CHẮC CHẮN bắn, thay vì
  treo ở `readyState=OPEN` giả.
- **Backoff nối lại tăng dần 1 s → 10 s (`tinhBackoff`), không giới hạn số lần
  thử** — không còn hẹn cố định 1,5 s (dễ dội bridge lúc nó mới bật lại chưa
  kịp nghe cổng, đã đo thấy `ECONNREFUSED` ở lần thử đầu khi bridge mới restart
  dưới 1 giây). Bộ đếm lần thử **reset về 0 mỗi lần mở lại thành công** — một
  lần mất kế tiếp lại tính từ 1 s, không cộng dồn vô hạn.
- **Mỗi lần mất/nối lại đều ghi log kèm lý do** (mã đóng ws + lần thử thứ mấy +
  đợi bao lâu) ở cả hai đầu: driver (`MẤT KẾT NỐI bridge (mã … · …) — nối lại
  lần N sau … ms`) và bridge (`client ngắt… mã … · …`). Bản cũ không ghi gì ở
  cả hai phía — khớp đúng "không có dòng log nào" trong báo cáo.
- **Mất bridge rồi phục hồi → Gen báo ĐÚNG MỘT LẦN** ("Em vừa mất kết nối não,
  giờ đã nối lại ạ"), không lặp lại mỗi lần ping lỡ nhịp hay mỗi lần mở lại
  không thành công. Không làm "hàng đợi câu Sếp gõ lúc mất kết nối" (nhánh kia
  của đề bài): bridge không giữ buffer sự kiện cho một não đang offline, nên
  câu gõ đúng lúc driver mất kết nối vẫn mất — chấp nhận được vì bridge/sân
  khấu không hề rớt, chỉ driver rớt, và ô chat vẫn hiện câu đó cho Sếp thấy.
- **`goi()` hết khe nứt "rụng giữa `choMo()` và `ws.send()`"** (đã bị PR #34
  review chỉ ra): khoá biến `ws` vào một hằng cục bộ trước khi gửi, bọc
  `ws.send` trong try/catch — không còn ném `TypeError` làm rơi cả lượt não.
- **Watchdog tiến trình trong `scripts/chay.sh`**: một vòng `while true` nhẹ
  trong nohup bọc `node scripts/nao-agy.mjs` — driver crash là tự bật lại ngay
  (log `[watchdog HH:MM:SS] driver não thoát (mã …) — bật lại sau 2 s`).
  `pkill -f "scripts/nao-agy.mjs"` ở nhánh `tat` khớp CẢ dòng lệnh của vòng lặp
  lẫn tiến trình node con, nên tắt là tắt thật, không tự sống lại.
- **Cạm bẫy đo bằng chứng: `tsx` (cả qua `npx` lẫn gọi thẳng) tự sinh thêm MỘT
  tiến trình node con** (nạp `--require preflight.cjs --import loader.mjs`).
  `kill -9` đúng PID mà `spawn()` trả về chỉ giết cái vỏ — bridge thật (con)
  vẫn sống, giữ cổng (`EADDRINUSE` khi bật lại, ping vẫn được trả lời sau khi
  "giết" vì chẳng ai chết). `scripts/kiem-reconnect.mjs` dùng `detached: true`
  rồi giết bằng PID ÂM (`kill(-pid)`, cả process group) để giết thật.
## Quyết định D1 — căn nhà ấm, bỏ lab neon (26/10, Issue #43)

- **Scene + ánh sáng đổi, Actor API KHÔNG đổi.** `bo-cuc.ts` thay toàn bộ bảng
  3 vùng lab (`dieu-khien`/`kho`/`tuong-sau`, bục trung tâm, bàn cong ghép 5
  mảnh) bằng một **căn nhà 1 tầng 14 × 10 m** (`phong-khach`/`ban-lam-viec`/
  `bep` + hành lang trung tâm rộng `HANH_LANG = 2 m` nối cửa ↔ cửa sổ). Place
  id cũ giữ nguyên, chỉ đổi ý nghĩa: `buc-trung-tam` → thảm phòng khách,
  `ban-dieu-khien` → bàn làm việc, `ke-module` → kệ sách, `cua` → cửa ra vào,
  `ghe-1`/`ghe-2` → ghế ăn/ghế làm việc. Thêm `sofa`, `ban-an`, `bep`, `cua-so`.
- **Ánh sáng "nắng chiều" ĐÃ CÓ SẴN từ C3 (#40)** — directional ấm
  (0xffe0b0, ~giống 3200 K) + bóng mềm PCFSoft + bloom chọn lọc gần như không
  bật cho gì ngoài đèn sàn/đèn bàn đã tồn tại từ trước, D1 chỉ cần đổi hướng
  đèn (chiếu từ phía tường nam có cửa sổ), thu hẹp khung bóng (`shadow.camera`)
  theo kích thước nhà mới 14×10 (thay vì 16×16), và đổi màu hemisphere đất
  thành nâu ấm thay xanh-đen lạnh. Không viết lại hệ bloom.
- **Màn hình hologram → màn hình máy tính/TV ấm**: `man-hinh.ts` bỏ hẳn
  scan-line + viền phát sáng (`batSang()`), khung tối gỗ/nhựa đen, chữ
  trắng-kem. Kích cỡ tách theo loại (máy tính ~0,55 m, TV ~1,1 m) qua
  `MAC_DINH_MAN_HINH[...].size` — bản lab cũ dùng chung 2,2 m cho mọi hologram,
  với màn hình bàn làm việc thì to như một bức tường (ảnh thử D1 vòng 1).
- **`camera.preset` 4 góc nhà MỚI (`phong-khach`/`ban-lam-viec`/`bep`/
  `cua-so`) khai TAY toạ độ trong `world.ts`, không rơi vào `cameraFocus`
  chung.** `cameraFocus` cộng một offset chéo CỐ ĐỊNH vào mục tiêu — với mục
  tiêu nằm sát tường/cửa sổ (như `cua-so`) offset đó đẩy camera xuyên ra ngoài
  nhà. Toạ độ chọn tay, đứng trong nhà, nhìn đúng hướng nội thất khu đó.
- **Bài học bố cục nhà (khác lab — khoảng cách thật, không phải hộp lớn)**:
  đặt `standAt` của một place quá gần nội thất KHÔNG có `chan` (ghế) làm nhân
  vật đứng chồng lên mẫu ghế (ảnh thử D1 vòng 1: Gen đứng trên ghế làm việc).
  Phải cách tối thiểu 0,8 m. Tương tự chỗ đứng mặc định `buc-trung-tam` từng
  trùng mép hộp chắn của sofa — nhân vật "đứng xuyên" sofa.
- **Camera bay (`tamTuBay`, lerp `dt · 3,2`, `dt` kẹp ≤ 1/20 s) KHÔNG đủ thời
  gian "tới nơi" trên renderer phần mềm (~1 fps đo được)**: chờ 1,5–1,6 s chỉ
  đi được ~30 % quãng đường (đo thật trong `kiem-d1.mjs`), ảnh chụp bị kẹt
  giữa hai góc máy. Bằng chứng D1 gọi `camera.preset` (để `stage.describe()`
  đúng tên) RỒI `datMay(vt, tam)` — đúng toạ độ đã khai trong
  `world.ts cameraPreset()` — để đặt máy TỨC THÌ, cùng cách `kiem-c3.mjs` chụp
  cận mặt. Đây là vấn đề của renderer phần mềm lúc kiểm, không phải bug thật.
- **`fx.*`/`module.build` đổi màu qua đúng 2 hằng `MAU_CAM`/`MAU_CYAN` trong
  `phong.ts`** (giờ là cam/vàng ấm, không còn cam/cyan neon) — không phải sửa
  từng chỗ dùng màu trong `hat-ket-tinh.ts`/`world.ts`, chỉ `hieu-ung.ts`
  (`MAU_FX`) cần đổi riêng vì không import từ `phong.ts`.
- **Bảng lệnh mobile (390 px) phủ kín màn hình khi mở trang — hành vi CÓ TỪ
  TRƯỚC D1** (`#bang.thu-gon` + nút `›` đã có trong `style.css`/`panel.ts`,
  chỉ mặc định mở), không phải lỗi do đổi cảnh — ngoài phạm vi D1, ghi lại cho
  đợt sau nếu Boss muốn mặc định thu gọn trên màn hình hẹp.
- Bằng chứng: `scripts/kiem-d1.mjs` (CHẠY MỘT LẦN, cờ `docs/d1/.da-chay`) — 5
  ảnh preset 1440, 1 ảnh 390×844, cận mặt Javis/Gen dưới nắng, màn hình đang
  stream, module đang kết tinh, bảng luma (mặt p95 ≤ 230 — đo thật: Javis
  166,3, Gen 177,2), FPS tương đối (~1 fps, cùng tầm lab cũ trên swiftshader),
  console 0 lỗi.

## Quyết định E2 — màn hình giữ nội dung, module vào tay, nhìn nhau (26/10, Refs #48)

Bằng chứng: `node scripts/kiem-e2.mjs` (CHẠY MỘT LẦN, cờ `docs/e2/.da-chay`) —
cổng riêng vite 5220 + stub TTS 8851, **không đụng** 5173/8787-8790 của Boss.

- **Màn hình KHÔNG hề mất nội dung sau `screen.stream`** — đo lại trên bản
  thật: chunks lẫn `source:"agent"` đều giữ `showing`/`lines`/`chars` đúng,
  pixel vùng màn hình đổi 4053 điểm sau khi stream 6 mẩu code. Cái reviewer
  thấy ("— trống —", `lines: 0`) là **màn hình chưa có nội dung**, không phải
  texture chết: `screen.focus` một màn hình trắng, hoặc `screen.stream
  { source:"agent" }` mà não không `feed` mẩu nào (đúng cảnh dòng 6 — não bị
  chặn ở 2 lệnh), đều vẽ ra y hệt màn hình tắt. `man-hinh.ts` giờ phân biệt
  hai trạng thái: **đang stream mà chưa có chữ → "đang nhận…" + con trỏ**,
  thật trống mới "— trống —".
- **`actors[].holding` suy ra TỪ bảng prop (`camBoi`)**, không đọc
  `NhanVat.dangCam` nữa — `describe()` và `props[].state.heldBy` giờ cùng đọc
  một chỗ nên không thể lệch. (Chỗ lệch thật đã tìm ra: `moduleBuild().cancel()`
  xoá prop khỏi bảng mà không trả tay người đang cầm.)
- **`module.build` phải THỬ LẠI `actor.hold`.** Bản cũ gọi đúng một lần rồi
  nuốt lỗi; nhân vật đang nói/đi là module ở lại sàn vĩnh viễn trong khi sự
  kiện vẫn báo "built". Nay thử tới 6 lần cách nhau 450 ms và báo `heldBy` +
  `error` thật lên `module.built`. Đo trên renderer phần mềm: module vào tay
  sau **8,0 s** kể từ lệnh (hiệu ứng kết tinh cần nhiều khung hình) — vì thế
  mọi script bằng chứng phải **chờ theo điều kiện**, không `sleep` cố định.
- **Màn hình đứng đúng trên mặt bàn, đo chứ không đoán.** Chiều cao mặt bàn
  KHÔNG suy ra được từ `bo-cuc.ts` (model Kenney chuẩn hoá theo `rong`/`cao`
  lúc dựng), nên `screenSpawn` đo `Box3` của khối `khoi:<id>` trong cảnh rồi hạ
  chân màn hình đúng lên đó. `ScreenSnapshot` thêm `bottomY` + `restsOn` để
  kiểm được bằng số: đo thật `bottomY = 0,53 m` = mặt bàn `0,53 m`, lệch 0.
- **Hai nhân vật nhìn nhau: nguồn sự thật là `actor.say`, không phải
  `user.text`.** Người nghe giờ quay **cả thân** (`actorFaceTo`), không chỉ
  mắt — đó là lý do "Javis nói với Gen" mà Gen vẫn đứng hướng máy quay. Và
  phản xạ lấy cặp hội thoại từ **`actor.sayStart` (đã mang thêm `to`)**: lớp
  hiểu lệnh đánh dấu `handled: true` cho mọi câu nó khớp, nên nghe `user.text`
  thì phản xạ bị bỏ qua đúng trường hợp cần nhất. Đo thật: giữa câu **0,3°**
  cho cả hai, **vẫn 0,3° sau khi đổi `camera.preset` giữa câu**.
- **Nói xong người nghe liếc máy quay** (`actor.say` đổi mắt người nghe về
  `camera`, phản xạ giữ cú liếc `liecMs = 700 ms`). Cú liếc chỉ sống dưới 1
  giây rồi Gen vào câu trả lời của mình, nên **không đo được bằng một lần
  `describe()`** — bằng chứng lấy mẫu 60 ms/lần trong trang: liếc sau **30 ms**
  kể từ `actor.sayDone` của Javis.
- **Phản xạ im khi câu không gửi cho Gen** (`to` khác `camera` và khác id của
  Gen): không câu đệm, không não rule-based. Đo thật với nhân vật thứ ba (Lan).
- **`choSauBridge` là CỬA ĐỂ SẴN cho E1** (`ThamSoPhanXa`): trả `true` trong
  khoảng chờ sau `bridge.connected` thì phản xạ không nói "Em chưa có não".
  Mặc định `() => false` — hành vi E2 không đổi, E1 chỉ nối dây ở `main.ts`.
