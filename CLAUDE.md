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
pnpm bridge               # bridge: ws lệnh (8787) + giọng tiếng Việt (8788) + MCP HTTP (8789)
pnpm mcp                  # MCP qua stdio cho agy CLI (`agy mcp add gen-stage …`)
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
bash scripts/fetch-anim.sh    # tải bộ chuyển động CC0 (Quaternius) về public/anim/ — chạy 1 lần sau khi clone
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
| `src/ui/o-chat.ts` | **B3** — ô chat dưới màn hình: Enter = `actor.say` lên nhân vật `owner`, y như `Space` |
| `skills/gen-stage-nao/SKILL.md` | **B3** — skill cho agy CLI: vòng `stage_events` → `stage_describe` → 1–3 lệnh → `actor_say` |
| `scripts/nao-demo.mjs` | **B3** — não mẫu rule-based (không LLM) chạy qua MCP stdio thật, làm bằng chứng vòng kín khi không có agy |
| `bridge/tts.ts` | **B2** — giọng tiếng Việt: `GET /tts` (cổng 8788) gọi thẳng WebSocket Edge, trả mp3, cache `.cache/tts/<sha1>.mp3` |
| `src/audio/tts-client.ts` | **B2** — tải + giải mã mp3, đo `durationMs` thật, phát bằng Web Audio, đẩy biên độ RMS mỗi 50 ms sang nhân vật |
| `src/audio/so-tieng.ts` | **B2** — sổ nối sân khấu ↔ lớp tiếng (không phụ thuộc gì): sổ miệng, thời lượng thật, cờ chặn Web Speech |
| `src/audio/nut-tieng.ts` | **B2** — nút "🔊 Bật tiếng" mở khoá autoplay, nhớ bằng `localStorage` |
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
