# Gen-Stage

> **Phiên mới / quota mở lại: đọc `docs/MUC-TIEU-TU-CHAY.md` TRƯỚC và tự chạy vòng lặp trong đó, không chờ Boss nhắc.** Cổng chất lượng: `docs/CONG-CHAT-LUONG.md`.
> **G2 (28/10):** tên hiển thị đổi Gen → **Nhi**, Javis → **Nam** (id kỹ
> thuật vẫn `gen`/`owner` — xem `TEN_HIEN_THI` trong `src/stage/noi-dung.ts`).

Sân khấu 3D chạy trong trình duyệt, điều khiển bằng **một bộ lệnh cố định**
(Actor API v0.1 — `docs/spec/actor-api.md`). Mọi đường vào (nút trên giao diện,
ô kịch bản, bridge WebSocket, sau này là MCP cho agent) đi qua **cùng một
dispatcher**, nên Boss bấm tay được gì thì agent gọi được đúng cái đó.

Stack: Vite + TypeScript (strict) + Three.js + `@pixiv/three-vrm`, không
framework UI. Đợt A (`docs/du-phong-dot-A.md`): A1 lõi điều khiển (Issue #5) →
A2 bộ hành vi → A3 lab viễn tưởng.

## Lệnh

```bash
bash scripts/cai-dat.sh   # CÀI MỘT LẦN cho máy sạch: deps + asset + model giọng + biểu tượng
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
node scripts/kiem-d1b.mjs     # bằng chứng D1b: mỹ thuật + hiệu năng (calls/tam giác/FPS) vào docs/d1b/ (CHẠY MỘT LẦN)
bash scripts/fetch-anim.sh    # tải bộ chuyển động CC0 (Quaternius) về public/anim/ — chạy 1 lần sau khi clone
bash scripts/fetch-stt.sh     # C1: venv + model PhoWhisper-small ct2 vào .cache/stt/ — chạy 1 lần (cai-dat.sh gọi sẵn)
node scripts/kiem-f2.mjs      # bằng chứng F2: điều khiển mượt trên FIREFOX + GPU THẬT, vào docs/f2/ (CHẠY MỘT LẦN)
node scripts/kiem-g1.mjs      # bằng chứng G1: bỏ trần + chân chạm sàn + tóc, FIREFOX thật, vào docs/g1/ (CHẠY MỘT LẦN)
node scripts/kiem-g1-ngoi.mjs # bằng chứng G1 mục NGỒI: nội thất cỡ chibi, chân chạm sàn khi ngồi (cổng 5363)
node scripts/kiem-e1.mjs      # bằng chứng E1: UI 390 px, não diễn thật, /tts retry, hiểu "Javis", cài 1 lệnh, vào docs/e1/ (CHẠY MỘT LẦN)
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
- **Hiệu năng**: pixel ratio ≤ 1,5, **shadow map 1024 CỐ ĐỊNH** (chỉ lên 2048 khi
  đo thật ≥ 50 FPS liên tục 5 s — không gate theo `maxTextureSize`), chạy mượt
  trên điện thoại.
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
| `src/ui/phim.ts` | Điều khiển bằng phím (WASD/1–0/Space/C/E/R/?) — **mọi phím gọi `dispatcher.run`**, tắt khi con trỏ đang ở ô nhập. **F2 (#56)**: WASD gửi MỘT `actor.steer` (`ms` 700) rồi **gia hạn** mỗi 200 ms cho actor `controlledBy: "owner"`; nhả phím / `blur` / `visibilitychange` là dừng NGAY |
| `src/events.ts` · `src/log.ts` | Bus sự kiện · nhật ký JSON mọi lệnh và sự kiện |
| `src/bridge-client.ts` | Nối trình duyệt với bridge (mặc định bật, tắt bằng `?bridge=0`) |
| `bridge/server.ts` | Bridge WebSocket Node — mặc định chỉ nghe `127.0.0.1`; mở ra ngoài phải có `--host` + `GEN_STAGE_TOKEN`. Bật luôn TTS (8788) và MCP HTTP (8789) |
| `bridge/mcp.ts` | **B3** — MCP server: tool **sinh tự động** từ registry (`a.b` → `a_b`) + `stage_events` (long-poll). Hai cửa: stdio (`pnpm mcp`) và HTTP streamable `127.0.0.1:8789/mcp`. Cả hai nói với sân khấu bằng **vai client ws** của bridge |
| `src/behavior/phan-xa.ts` | **C0** — PHẢN XẠ XÃ HỘI: máy trạng thái chạy trong trình duyệt, không chờ não. Mọi hành động đi qua dispatcher, nguồn `phan-xa`, ưu tiên thấp nhất |
| `src/behavior/so-nao.ts` | **C0** — sổ "có mấy client MCP đang nối" (bridge ghi vào, `stage.describe` đọc ra) |
| `src/ui/o-chat.ts` | **B3** — ô chat dưới màn hình: Enter = `actor.say` lên nhân vật `owner`, y như `Space` |
| `skills/gen-stage-nao/SKILL.md` | **B3** — skill cho agy CLI: vòng `stage_events` → `stage_describe` → 1–3 lệnh → `actor_say` |
| `scripts/nao-agy.mjs` | **DRIVER NÃO** — vòng lặp nằm ở đây, không ở agy: nghe `user.text` qua ws, phản xạ ≤300 ms, gộp câu 800 ms, hàng đợi 1 lượt, bơm một dòng vào agy đang ấm trong tmux |
| `src/api/commands/demo.ts` | **E1 (#48)** — lệnh gói **`module.demo`**: một lời gọi chạy trọn chuỗi `screen.focus` → `screen.stream` → `module.build` → `actor.emote` → `actor.say`, qua `ctx.run` nên không thêm phương thức `StageWorld` nào |
| `scripts/cai-dat.sh` · `gen-stage.desktop` | **E1 (#48)** — cài một lần (asset + model giọng 930 MB) và tạo biểu tượng `~/.local/share/applications/gen-stage.desktop`. `chay.sh` chỉ BẬT |
| `scripts/nao-demo.mjs` | **B3** — não mẫu rule-based (không LLM) chạy qua MCP stdio thật, làm bằng chứng vòng kín khi không có agy |
| `bridge/tts.ts` | **B2** — giọng tiếng Việt: `GET /tts` (cổng 8788) gọi thẳng WebSocket Edge, trả mp3, cache `.cache/tts/<sha1>.mp3` |
| `src/audio/tts-client.ts` | **B2** — tải + giải mã mp3, đo `durationMs` thật, phát bằng Web Audio, đẩy biên độ RMS mỗi 50 ms sang nhân vật |
| `src/audio/so-tieng.ts` | **B2** — sổ nối sân khấu ↔ lớp tiếng (không phụ thuộc gì): sổ miệng, thời lượng thật, cờ chặn Web Speech |
| `src/audio/nut-tieng.ts` | **B2** — nút "🔊 Bật tiếng" mở khoá autoplay, nhớ bằng `localStorage` |
| `bridge/stt.ts` | **C1** — nhận dạng giọng Việt: `POST /stt` (cổng 8790) → ffmpeg 16 kHz mono → thợ python (PhoWhisper-small ct2 int8) → `{ text, confidence, durationMs, goiGen }`, cache `.cache/stt/cache/<sha1>.json` |
| `bridge/stt-worker.py` | **C1** — thợ nhận dạng chạy mãi: nạp model + hâm máy một lần lúc bật bridge, mỗi dòng stdin là một wav |
| `bridge/so-tu.ts` | **C1** — SỔ TỪ NHÀ: sửa tên riêng (`Gen`, `connector`, `Baserow`, `module`, `Kho Ryan`) sau nhận dạng. Hạ WER 47 % → 5 %; khớp mờ cho tên dài, đồng âm khai tay cho tên ngắn. **G3 (#67)** thêm `suaTenDauCau()`: viết đúng "Nhi"/"Nam" khi tên ở ĐẦU câu + theo sau là động từ lệnh (không khai vào `SO_TU` — sổ đó viết đè ở bất kỳ đâu, mà `nghi` cũng là "nghĩ") |
| `src/audio/mic.ts` | **C1** — giữ phím **V** (hoặc giữ nút 🎤) để nói: `MediaRecorder` + đo RMS → `POST /stt` → chữ vào ô chat 1,5 s cho Boss sửa |
| `src/audio/vad.ts` | **C1** — cắt im lặng đầu/cuối theo RMS (ngưỡng tương đối theo đỉnh, chừa **200 ms** mỗi đầu từ **G3 #62** — giọng thật vào câu ngay khi vừa bấm, 120 ms làm mất phụ âm đầu). Không phụ thuộc DOM |
| `src/audio/so-giong.ts` | **C1** — sổ nối mic ↔ `commands/actor.ts`: phiếu dùng một lần để `actor.say` biết câu này Boss NÓI chứ không gõ |
| `scripts/do-stt.mjs` | **C1** — bàn đo: sinh 20 wav bằng TTS của bridge, chấm WER/độ trễ từng engine (`docs/c1/so-sanh.md`). **G3 (#62)**: `ban` sinh bộ TTS **làm bẩn như mic laptop**, `ten` + `do-ten` đo **đúng người nhận** end-to-end, `thu` dựng bộ từ giọng thật, `chay <tên> <model>` chạy đúng thợ của bridge (`docs/g3/ket-qua.md`) |
| `scripts/kiem-g3.mjs` | **G3 (#62)** — bằng chứng trên Firefox thật: bridge lưu audio thô mỗi lượt, nút "✎ Sửa" ghi cặp (giọng, chữ đúng), ràng buộc mic, 15 câu đời thường. Chạy **một lần** (cờ `docs/g3/.da-chay`) |
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

## Quyết định G3 — giọng THẬT của Boss (28/10, Issue #62 · review #67)

Số đo đầy đủ: **`docs/g3/ket-qua.md`**. Boss: *"nhận diện giọng nói tào lao
quá"*.

- **Số của C1 (WER 7,9 %) đúng nhưng vô dụng**: đo trên giọng TTS — sạch,
  chậm, chuẩn dấu, băng rộng. Trên bộ TTS **làm bẩn như mic laptop** (nói
  nhanh +20…40 %, lọc 300–3400 Hz, nhiễu hồng −30 dBFS, reverb, nén động):
  WER **31,8 %**. Đó mới là con số Boss nghe thấy.
- **Và trước G3 KHÔNG THỂ đo trên giọng Boss**: bridge chỉ giữ chữ
  (`.cache/stt/cache/*.json`), không giữ âm — 16 tệp json, 0 tệp audio. Nên
  việc đầu tiên là **mở sổ thu** (`.cache/stt/thu/<ts>.ogg` + `.json`, vòng 50
  tệp) và nút **"✎ Sửa"** ở ô chat ghi cặp `(giọng thật, chữ đúng)` vào
  `.cache/stt/mau/`. Bộ kiểm chuẩn tự dài ra mỗi lần Boss sửa.
- **Nâng cỡ model KHÔNG chữa được.** PhoWhisper-medium (gấp 3 cỡ): WER 31,1 %
  so với 31,8 % — chênh 0,7 điểm, mà trễ trung vị 13,8 s so với 3,9 s (**3,5
  lần**, vượt mốc 5 s). Cùng hình với C1 mục 3, khác chỗ nghẽn: lần này cái
  làm engine nghe sai là **âm học**, và thêm tham số cho model không sinh ra
  thông tin đã mất ở micro. → **giữ PhoWhisper-small**, đổ tiền vào tín hiệu
  vào và lớp hiểu lệnh.
- **KHÔNG làm 2 tầng** (small trả nhanh, bộ lớn chốt lại) dù Issue gợi ý: lấy
  0,7 điểm WER mà phải thêm `user.text` sửa lại cho mọi lớp nghe sự kiện học,
  tranh CPU với tầng nhanh, và hoàn tác hành động Nhi vừa diễn — lỗ. Cửa còn
  mở: đo lại bằng một lệnh khi có bộ mẫu giọng thật.
- **Gọi tên bằng GIỌNG phải dựa vào VỊ TRÍ, không dựa vào dấu phẩy.** Review
  #67: gọi tên mới chỉ 5/10 đúng người. "Nhi" dài 3 ký tự nên ngưỡng fuzzy là
  **0** (`nia`/`nghi`/`ni` trượt hết), và giọng nói **không bao giờ có dấu
  phẩy** nên luật "gọi trần + phẩy" vô nghĩa. Luật mới: tên ở **đầu câu** +
  theo sau là "ơi"/"à" hoặc một **động từ lệnh**. Động từ ở cổng so **khớp y,
  không fuzzy** — fuzzy thì `cham` cách `chao` 1 ký tự và "nam châm hút sắt"
  lọt. Cách nghe chệch trùng hẳn từ thường (`nghi` = "nghỉ") cần động từ không
  mơ hồ. `TIN_HIEU_GOI` không chứa `nay` vì "**năm nay** nhà mình…" khớp ngay.
  **Thà bỏ sót một lời gọi hơn là bắt nhân vật diễn giữa câu Boss nói chuyện.**
- **Bỏ bí danh `gien`**: fuzzy ≤1 ký tự bắt luôn `mien` → "miền nam" thành gọi
  Nhi.
- **Câu đời thường phải khai `kêu`/`bảo`/`nhờ` thành TỪ KHOÁ của mẫu**, không
  để máy bỏ qua: mỗi từ không dùng tới bị trừ 0,7 điểm (`diemThat`) nên hai ba
  từ đệm đầu câu đẩy mẫu xuống dưới ngưỡng 1,5 — đó là lý do "tôi kêu bạn đi
  kiếm chỗ ngồi" **nghe đúng từng chữ mà vẫn mất lệnh**.
- **Câu có tên mà không khớp mẫu → `user.text` mang `hint: 'co-the-la-lenh'`**.
  Chỉ thêm một trường, không đổi luồng, không tự đoán: đoán sai là Nhi làm sai
  việc, hỏi lại một câu thì không mất gì.
- **Mic**: xin thêm 16 kHz mono (dạng **trần**, không `exact` — `exact` làm mic
  cũ ném `OverconstrainedError` và Boss mất hẳn mic); VAD chừa **200 ms** thay
  120 (log thật: "Gen ơi, qua ghế ngồi đi" → "**dạ nơi** qua ghế ngồi đi");
  **toast tên thiết bị mic** một lần/phiên (laptop có 3 mic, Firefox lấy "mặc
  định hệ thống"); **chạm nhanh = bật/tắt** thay vì bỏ lượt im lặng (skill
  `input-systems`: hành động chỉ-giữ phải có bản bật/tắt tương đương).

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
## Quyết định E1 — UI điện thoại, não diễn thật, TTS bền, hiểu "Javis" (26/10, Issue #48)

Năm cái dưới đây đều **đã đo thấy sai** trên bản chạy thật (bảng kiểm độc lập
trong comment cuối của #48), nên mỗi cái có một test giữ trong
`src/api/__tests__/e1-ui-nao-tts-giong.test.ts` (và `scripts/__tests__/nao-agy.test.mjs`).

- **Bảng lệnh không bao giờ rộng 100vw.** Bản cũ đặt `--bang-rong: 100vw` trong
  khối ≤760 px: mở bảng là sân khấu 3D biến mất sạch. Lời hứa mới được giữ ở
  **ba chỗ cùng lúc**, cố ý không dồn một chỗ: `index.html` khai sẵn
  `class="thu-gon"` (không loé bảng trong lúc chờ JS), `style.css` kẹp
  `--bang-rong: min(86vw, 340px)` (mở hết vẫn còn dải 3D), và `src/ui/index.ts`
  theo `matchMedia('(max-width: 899px)')` — **thu lại khi màn hẹp đi**, không
  chỉ lúc nạp trang. Nút kéo bảng và nút 🎤 lên 44 px (mốc chạm WCAG 2.5.5).
- **Trần "diễn tối đa 2 lệnh" là nguyên nhân gốc của "não chỉ nói".** Chuỗi
  dựng connector cần 5 lệnh, nên cái trần trong `promptDau` làm não không bao
  giờ diễn xong (`props: []`, `holding: null`, `lines: 0`). Bỏ trần, **và**
  thêm lệnh gói `module.demo` để đường ngắn nhất cũng là đường đúng: não gọi
  `actor_say` rồi `module_demo` — hai lệnh, vẫn trong tầm một lượt agy.
- **`screen: "main"` là id chết.** Id thật đọc từ `MAC_DINH_MAN_HINH`:
  `may-tinh`, `tivi`. `MAN_HINH_THAT` trong `scripts/nao-agy.mjs` là nguồn duy
  nhất cho nhắc đầu phiên **và** `AGENTS.md` (cùng một `promptDau`), nên sửa
  một chỗ là cả hai đúng. Ví dụ của `module.demo` **cố ý bỏ trống `screen`** —
  viết cứng một id vào ví dụ là dựng lại đúng cái bẫy đó.
- **Lỗi tạm của Edge TTS không được thành 502 của ta.** Đo thật: 2/10 lượt
  `/tts` liên tiếp trả 502, và đúng lượt trả lời đầu của não dính 502 → Gen
  câm. `goiEdgeThuLai` thử lại 2 lần (backoff 300/800 ms), và `hamCauDem` hâm
  **8 câu đệm/đáp cố định** ngay lúc bridge bật — mấy câu hay dùng nhất không
  bao giờ phải chờ Edge nữa. Hàm thử lại nhận `goi`/`nghi` tiêm được nên test
  không cần mạng.
- **Hai lớp tên riêng phải khớp nhau.** PhoWhisper không bao giờ nghe ra
  "Javis" (nó ra `david`/`gia viết`), nên cần CẢ `bridge/so-tu.ts` (sửa chữ)
  LẪN `BI_DANH_NHAN_VAT.owner` (tách người nhận). Thiếu một bên là câu vẫn
  chạy sang Gen — đúng lỗi đo được. Khai `david` là an toàn (tiếng Việt không
  có từ nào đọc thành thế), khác hẳn chuyện khai `ghê` cho `Gen`.
- **"Chưa có não" phải đợi mới được nói.** Hai lớp: bridge gửi `bridge.brain`
  là **gói đầu tiên** sân khấu nhận (trước `bridge.stageOnline`), và phản xạ
  chờ `choXacNhanNaoMs = 3000` kể từ `bridge.connected` rồi **đọc lại**
  `coNao()` trong hẹn giờ — não tới trong lúc chờ thì câu đó bị bỏ, không phát
  ra tiếng nào.
- **Giết theo PID, không `fuser -k` cổng mù.** Bản cũ giết bất cứ tiến trình
  nào giữ 8787-8790/5173, kể cả thứ không phải của Gen-Stage. Giờ mỗi tiến
  trình `chay.sh` bật đều ghi PID vào `.cache/pid/<tên>.pid`, và `tat` **đối
  chiếu `/proc/<pid>/cmdline`** trước khi giết (PID có thể đã bị hệ điều hành
  cấp lại cho người khác), rồi giết cả cây (watchdog là bash, node là con).
  Cổng đổi được bằng biến môi trường (`GEN_STAGE_PORT`, `GEN_STAGE_WEB_PORT`…)
  nên bằng chứng chạy bộ riêng 8840-8843/5210 mà không chạm bộ của Boss.
- **`pnpm start` ≤90 s chỉ đúng khi đã cài.** Trên máy sạch phải tải 46 MB
  asset + ~930 MB bộ nhận giọng — không có cách nào ≤90 s. Nên tách
  `scripts/cai-dat.sh` (một lần, lâu bao nhiêu cũng được, tạo luôn biểu tượng
  từ `gen-stage.desktop` trong repo) khỏi `scripts/chay.sh` (mỗi ngày, không
  tải gì nữa). `chay.sh` nhận ra đã cài bằng cờ `.cache/da-cai-dat`; chưa cài
  thì vẫn chạy được, chỉ chậm lần đầu.
## Quyết định D1b — mỹ thuật căn nhà + tối ưu đồ hoạ (26/10, Issue #48)

Boss sau D1: "cảnh còn **trống và thô**" → rồi ngay sau đó: "**tối ưu đồ hoạ,
đừng đòi GPU lớn**". Hai yêu cầu đó kéo ngược nhau, và cách giải là: **đẹp
bằng ánh sáng + màu + chất liệu + bố cục, KHÔNG bằng hậu kỳ**.

- **BỎ HẲN HẬU KỲ.** Không SSAO, không DOF, không vignette, và **gỡ luôn bloom
  chọn lọc của C3 (#40)**: hai `EffectComposer`, `UnrealBloomPass`, `mixPass`
  và lượt "tô đen mọi vật rồi trả lại vật liệu" mỗi khung hình đã đi hết. Giờ
  `veMotKhung()` chỉ còn `renderer.render(scene, camera)`. `batSang()` ở
  `bloom-layer.ts` giữ nguyên nhưng thành **vô hại** (chỉ bật một bit layer,
  không ai đọc) nên `phong.ts`/`fx/*.ts` không phải sửa dòng nào.
- **Ngân sách GPU tự đặt, đo bằng số** (`window.stage.hieuNang()` →
  `renderer.info.render`): pixel ratio ≤ **1,5** (cũ 2), **một** đèn đổ bóng
  với shadow map **1024** (2048 chỉ khi `renderer.capabilities.maxTextureSize
  ≥ 8192`), texture procedural ≤ **1024 px** và dùng chung một bản, đồ nhỏ
  **không đổ bóng** (chỉ `receiveShadow`), hàng rào + tán cây sân vườn dùng
  `InstancedMesh`. FPS tụt < 24 quá 2 s thì `haChatLuong()` tắt bóng đổ + hạ
  pixel ratio về 1 (thay cho "tự tắt bloom" cũ).
- **`gopTinh()` gộp mesh tĩnh theo (vật liệu, có đổ bóng hay không)** sau khi
  dựng xong nhà. Mấu chốt làm nó có tác dụng nằm ở `chat-lieu.ts`: vật liệu
  dẫn xuất được **cache theo `(vật liệu gốc, nhóm, màu nhuộm)`** chứ không
  `clone()` mỗi mesh một bản — clone mỗi mesh thì mỗi mesh một vật liệu, không
  gộp được gì. Đo thật: **nhà 116 mesh**; phần còn lại là VRM nhân vật
  (`owner` 131 mesh, `gen` 18 — có từ trước D1b, không đụng).
  **Chưa đạt mốc `calls ≤ 150`** (đo 461): hơn 2/3 số mesh của cảnh là của
  model VRM, gộp chúng thì mất skinning + morph target của mặt. Ghi nợ.
- **Chất liệu phủ lên Kenney bằng texture VÂN TRUNG TÍNH** (`vanGo`/`vanVai`/
  `vanKimLoai`, trung bình ≈ trắng): nhân vào `color` sẵn có của model nên
  model giữ đúng màu gốc mà hết phẳng lì — đúng bài học "vật liệu không nhân
  màu hai lần", lần này dùng làm lợi thế. Texture **mang màu** (sàn ván gỗ
  12 cm, thảm hoa văn, tranh, bảng ghim, cỏ, trời) thì `color` phải để trắng.
  `nhuom()` chỉ đổi những vật liệu đủ sáng + đủ bão hoà (mảng vải lớn), bỏ qua
  chân gỗ/khung tối — nhờ vậy nhuộm sofa sang olive mà chân sofa không đổi màu.
- **Thảm KHÔNG dùng model Kenney.** UV của Kenney là **atlas bảng màu** (mỗi
  mặt trỏ vào một ô vài pixel): dán hoa văn lên đó ra một mảng màu trơn. Thảm
  dựng bằng một tấm phẳng UV 0…1 của riêng mình.
- **Bảng bố cục nhận 4 trường mới** (vẫn là dữ liệu thuần): `datY` (đồ treo
  tường), `tren` (đặt lên **nóc đo được** của khối khác — mặt bàn Kenney mỗi
  model một cao độ, không được viết số tay), `lech` (đồ nhỏ bày lệch khỏi tâm
  ô lưới; `kiemLuoi()` vẫn soi `tai` nên lưới 0,5 m của nội thất lớn còn
  nguyên), `chat`/`mauVai`. Thêm **26 khối**: 2 ghế đơn, gối, sách/cốc bàn
  trà, 3 tranh, bàn cạnh sofa + đèn bàn, cây thứ ba, bàn phím/chuột/đèn/sách/
  cốc/bảng ghim ở bàn làm việc, tủ trên/dưới + bồn rửa + hút mùi + lò vi sóng
  + máy cà phê ở bếp, bình hoa + đĩa trái cây trên bàn ăn, kệ giày + móc áo +
  thảm chùi chân ở hành lang. Test mới: **không hộp chắn nào chồng nhau**,
  mọi hộp nằm trong nhà, `tren` chỉ trỏ tới khối đứng trước.
- **Ghế Kenney từng bị chuẩn hoá `cao: 0.46`** — đó là cao độ MẶT NGỒI, không
  phải chiều cao ghế → ghế ăn bé như ghế búp bê (thấy rõ ở ảnh D1b vòng 1).
  Sửa thành chiều cao thật 0,88–0,9 m, và `datSeatY` đo mặt ngồi ≈ **55 % chiều
  cao ghế** (kẹp ≤ 0,52 m) thay cho `min(bbox.max.y, 0.55)`.
- **Ngoài cửa sổ là SÂN VƯỜN thật** (cỏ, hàng rào, 8 bụi cây, rồi mới tới phông
  trời chiều ở xa), không còn một tấm ảnh dán lên mặt kính. **Khung chia ô của
  cửa sổ đổ bóng** — vệt nắng chiều có nét trên sàn là điểm nhấn của cả cảnh.
- **Bụi nắng phải là hạt TRÒN.** `PointsMaterial` không có `map` cho ra **ô
  vuông xám** lổn nhổn giữa không khí (ảnh D1b vòng 1). Thêm một texture 32 px
  gradient tròn + `AdditiveBlending`.
- **Bảng lệnh mobile: phải nghe cả `resize`.** Code cũ chỉ kiểm `innerWidth <
  900` **một lần lúc dựng**, nên mở trang ở 1440 px rồi thu cửa sổ (hoặc ảnh
  bằng chứng đổi viewport) thì bảng vẫn mở che kín màn 390 px — đúng cái Boss
  thấy ở D1, không phải tại cảnh. Thêm listener, và **không đè lên ý Boss** khi
  Boss đã tự bấm nút mở/đóng.
- **Cạm bẫy đo bằng chứng**: máy kiểm chạy ~0,8 fps, **một khung hình > 1
  giây**, nên handler `resize` không kịp chạy trong 600 ms — phải chờ 3 s mới
  đọc được `#bang.thu-gon`.
- **Luma mặt phải đo ĐÚNG VÙNG DA.** Bản D1 lấy một ô vuông 380 px giữa ảnh;
  D1b chiếu xương `head` ra điểm ảnh (`window.stage.chieuDiem()`) rồi lấy hộp
  **thấp hơn gốc xương 6,8 cm, rộng 7,8 cm** — gốc xương `head` của VRM nằm ở
  chân sọ, lấy hộp quanh nó là trùm tóc đen (đo thật: p5 = 1,4 trong khi mặt
  sáng bình thường).

### Vòng 2 — sau kiểm độc lập trên main (chấm cảnh 2,0/5)

- **Model Kenney đã có `map` thì KHÔNG thay `map` được.** `map` của Kenney là
  **atlas bảng màu** (mỗi mặt trỏ vào một ô vài pixel) — thay bằng vân là mất
  sạch màu phân biệt từng bộ phận, để nguyên thì khối phẳng lì (đúng điểm bị
  chấm "sofa/ghế/bàn là khối phẳng"). Cách rẻ mà thật: `onBeforeCompile` tiêm
  một dòng vào shader chuẩn — **nhân** màu khuếch tán với vân, toạ độ vân lấy
  từ **vị trí đỉnh trong không gian model** (không dùng `uv` atlas). Không
  thêm pass, không thêm render target, chỉ một `texture2D` nữa mỗi điểm ảnh.
  Phải khai `customProgramCacheKey` không thì three dùng lại chương trình đã
  biên dịch của vật liệu khác.
- **Luma toàn cảnh**: `toneMappingExposure` 1,0 → **0,86**, nắng 1,35 → 1,15,
  hemisphere 1,05 → 0,95 (và màu đất hemisphere sáng lên 0x9c7f5c cho trần
  khỏi nâu xỉn — trần hứng đúng màu ĐẤT của hemisphere vì pháp tuyến quay
  xuống). Mốc mới có trong script bằng chứng: toàn cảnh p95 ∈ [205, 230].
- **Chiều cao nhân vật KHÔNG đo bằng hộp bao.** `Box3.setFromObject` trên
  `SkinnedMesh` trả hộp **tư thế bind**, không phản ánh gì việc đã scale
  xương: đo thật Gen có hộp bao 1,74 m trong khi gốc xương `head` chỉ ở
  0,96 m. Thước đúng là **xương bàn chân → gốc xương đầu** (`caoXuong`, thêm
  vào `doChibi()`), chuẩn hoá về **1,01 m** — đúng số của Javis, nên Javis
  không đổi gì còn Gen về bằng. Kết quả: 1,013 vs 1,007 (trước: 1,656 vs
  1,522 theo thước hộp bao).
- **Cân tầm vóc + đóng mốc spring bone phải làm ở KHUNG HÌNH THỨ 3, sau
  `vrm.update()`** — không phải trong hàm dựng. `@pixiv/three-vrm` diễn hoạt
  trên rig **normalized** rồi mới chép xuống xương RAW trong `vrm.update()`;
  đọc xương raw trước lượt update đầu là đọc **tư thế bind** (đo thật: bàn
  chân ở y = 0,49 m) → scale theo số đó ra một ông khổng lồ đụng trần. Đây
  cũng là chỗ gọi lại `springBoneManager.setInitState()` + `reset()` cho tóc
  Gen hết văng/xuyên vai.
- **Góc `toan-canh` đặt ở ngang tầm mắt, chéo từ góc phòng khách sang bếp**
  (`vt (-6,0, 1,82, 4,2)` → `tam (2,5, 1,0, -1,6)`, fov 66): thấy đủ 3 khu, và
  **cả Javis lẫn Gen nằm quanh trục giữa khung**, không rơi vào dải 390 px bên
  phải mà bảng lệnh che. Đặt máy cao sát trần thì trần chiếm 40 % khung hình —
  phòng chỉ cao 2,8 m, máy càng cao càng thấy trần.
- Thêm: màn hình `may-tinh` hạ xuống **đứng trên mặt bàn** (tâm panel 0,97 m);
  kệ sách đổi sang `bookcaseOpen` + **2 chồng sách trên kệ**; ngoài vườn thêm
  **2 mái nhà hàng xóm** (tường + mái dốc + ô cửa sáng đèn) và tán cây 3 lớp
  thay quả cầu mờ; bụi nắng co về đúng luồng nắng cửa sổ (48 hạt, 0,022 m).
- Bằng chứng: `scripts/kiem-d1b.mjs` (CHẠY MỘT LẦN, cờ `docs/d1b/.da-chay`,
  cổng riêng **5252**).

### Vòng 3 — sau kiểm độc lập PR #51 (3 điểm chặn)

- **Shadow map 1024 là CỐ ĐỊNH, không gate theo `maxTextureSize`.** Gate cũ
  (`>= 8192` thì 2048) vô dụng: swiftshader cũng báo 8192, GPU tích hợp báo
  16384 → nhánh 2048 **luôn** trúng, 1024 không bao giờ chạy. Nay chỉ nâng khi
  **đo thật** ≥ 50 FPS liên tục 5 s (`theoDoiFps`), nâng một lần, không nhảy
  qua nhảy lại.
- **Draw call phần nhà: 190 → 39.** Nút thắt KHÔNG phải số mesh mà là
  **`color`**: 119 vật liệu Kenney khác nhau *chỉ ở `color`* nên khoá gộp theo
  `vl.uuid` không gộp được gì. Vòng 3 **nướng `color` vào màu đỉnh**
  (`chuanHoaThuocTinh`) rồi gộp theo chữ ký vật liệu BỎ MÀU (`khoaGop`: texture
  + nhám + kim + trong suốt + chữ ký shader + cờ đổ bóng), vật liệu gộp để
  `color` trắng + `vertexColors` → không nhân màu hai lần. Nhà còn **34 mesh**
  (trước 122). Cạm bẫy: `Material.copy()` **không** mang theo `onBeforeCompile`
  / `customProgramCacheKey` (thuộc tính riêng) — quên chép tay là mất sạch vân.
  Tường cũng bỏ `khongGop` (7 mảnh chung một vật liệu → 1 mesh).
- **Model Kenney KHÔNG có UV dùng được.** Vòng 2 gán `ban.map = van` cho model
  không có `map` → mọi đỉnh lấy cùng một điểm texture = **khối màu phẳng**
  (đúng điểm kiểm độc lập chấm). Nay **luôn** phủ vân bằng `onBeforeCompile`
  với toạ độ lấy từ vị trí đỉnh; tần số theo nhóm (`TAN_SO_VAN`): gỗ 1,6 · vải
  **0,6** · kim loại 1,2, và vân vải tăng tương phản cho khớp tần số mới.
- **FPS phải đo trên GPU thật.** Script bằng chứng chạy swiftshader, nhiễu
  ±40 % — LỚN HƠN mọi chênh lệch D1/D1b nên không kết luận được gì. Thêm thước
  trong app: mở **`?fps=1`** (`src/ui/do-fps.ts`) → đếm 10 s rồi chốt FPS trung
  bình / 1 % xấu nhất / lượt vẽ nhà / lượt vẽ VRM / cỡ shadow map. Thước chính
  của PR vẫn là **calls / triangles / shadow size**.
- `window.stage.hieuNang()` **tách `callsNha` và `callsVrm`** bằng cách vẽ một
  khung với VRM ẩn rồi đọc `renderer.info` — số thật, không ước lượng.
- Luma cảnh đo **cả khung đã ẩn giao diện**, bỏ ô cắt tay `{300,110,720,560}`.
  Cờ `docs/d1b/.da-chay` ra khỏi git (`.gitignore`), script nhận `--lai`, và
  ảnh bằng chứng được nén về ≤ 1280 px (docs/d1b: 4,5 MB → 1,6 MB).
- `bloom-layer.ts` + mọi `batSang()` đã xoá hẳn (bloom bỏ từ vòng 1, chỉ còn là
  bit layer không ai đọc).

## Quyết định F2 — điều khiển mượt trên GPU thật (26/10, Issue #56 mục 2)

Boss: "điều khiển loạn tùm lum" khi mở **Firefox + GPU thật**, trong khi mọi
bằng chứng B1/D1b (Chromium + **swiftshader, ~1 FPS**) đều sạch. Gốc, số đo
và cách tái hiện: **`docs/f2/GOC-DIEU-KHIEN-LOAN.md`**.

- **~1 FPS CHE LỖI, không phải phát hiện lỗi.** Gần như mọi chỗ làm mượt trong
  repo viết dạng `x += (muc − x) * min(1, dt * k)`. Ở `dt ≈ 1 s` thì `dt*k`
  vượt 1 rồi **bị kẹp về 1** → bám **tức thì**: không trễ, không vọt, không
  giật, và **không kiểm được gì**. Lên 60 FPS mới thực sự nội suy. Từ nay mọi
  giao kèo về độ mượt phải có test chạy ở **nhiều FPS** (1/10/60/144), và
  bằng chứng về cảm giác điều khiển phải đo trên **Firefox GPU thật**
  (`scripts/kiem-f2.mjs`), không đo trên swiftshader.
- **Nội suy theo thời gian dùng `heSoBam(dt, τ) = 1 − e^(−dt/τ)`**
  (`src/stage/nhanvat.ts`, xuất ra để test). `min(1, dt/τ)` lệch 7 % ở 60 FPS
  và **47 % ở 10 FPS** — tức tốc độ hội tụ phụ thuộc FPS.
- **Gọi lại `actor.steer` CÙNG vector là GIA HẠN, không phải lệnh mới.**
  `NhanVat.lai()` so (vx, vz) với lần lái đang chạy; khớp thì đẩy `han` và trả
  lại đúng `Action` cũ. Bản B1 gửi lệnh mới mỗi 100 ms, mỗi lệnh chạy trọn
  `huyViec()` + `clip = null` + `batDauViec()` → `state` nháy
  `walking → idle → walking` 10 lần/giây, và hiệu lực 180 ms chỉ hơn nhịp
  100 ms có 80 ms nên một lượt GC là vận tốc tụt về 0 rồi vọt lại (đo được:
  1,60 → 0,32 → 1,15 m/s trong 3 khung liền). Mặc định `ms` của `actor.steer`
  đổi 150 → **700**; bên gọi nên gia hạn **thưa** (200 ms), đừng gối dày.
- **Đụng vật cản: vận tốc trục = QUÃNG THẬT ĐÃ ĐI của trục đó chia `dt`.**
  Bản B1 nhân 0,2 → **điểm cân bằng khác 0** (0,23 m/s mà toạ độ không nhích
  = "chạy bộ tại chỗ"). Bản F2 vòng 1 xoá hẳn về 0 → mất cả vận tốc khi chỉ bị
  kẹp 1 % của bước, trượt dọc mép bàn giật theo chu kỳ. Một quy tắc lo cả hai:
  chặn hoàn toàn ⇒ quãng 0 ⇒ vận tốc 0; kẹp một phần ⇒ giữ đúng phần đi được.
  So "bị chặn" theo **tỉ lệ** (`1 − 1e-9`), không theo hằng số tuyệt đối: ở 60
  FPS một bước chỉ 0,027 m nên ngưỡng tuyệt đối hoặc báo chặn oan ("nửa bước"
  của B1) hoặc không bao giờ báo (trừ `1e-6` làm vế phải âm).
- **"Đang đi" tính SAU va chạm, từ quãng thật của khung — không từ `|v|`.**
  Vòng F2 đầu đọc `|v|` *trước* va chạm nên ép vào sofa thì `|v|` = 0, toạ độ
  đứng im, mà `state` vẫn `walking` vĩnh viễn ⇒ clip đi vẫn chạy, thân vẫn
  nhún: **sửa nửa gốc, mắt Boss vẫn thấy chạy tại chỗ**. Ba chỗ cùng sai một
  kiểu — `dangDi`, nhánh nhả thân bị `hetHan` chặn (giữ phím thì `hetHan` luôn
  `false`), và sàn 0,35 của `phaBuoc`. Bị chặn cứng thì báo `idle` **ngay**,
  nhưng cố ý **không** huỷ `dangLai`: lệnh lái vẫn giữ thân nên xoay sang
  hướng thoáng là đi tiếp; huỷ thì `state` nháy `walking ↔ idle` theo nhịp gia
  hạn.
- **Một hằng số đừng làm hai việc.** `NGUONG_PHANH` (0,12 m/s, chỉ lúc phanh)
  tách khỏi `NGUONG_DI` (0,04 m/s: clip đi, nhún thân, hướng mặt). Gộp làm một
  thì khung đầu tăng tốc từ 0 bị coi là đứng im ⇒ `state` nháy ở FPS cao.
- **Vật lý một khung lái nằm trong hàm THUẦN `buocLai()`** (`nhanvat.ts`),
  `capNhat` chỉ gọi. Lý do rất thực dụng: dựng `NhanVat` cần model VRM, nên
  trước đó **không test nào chạm được vào gốc va chạm** — và đó đúng là gốc bị
  sửa nửa vời. Giao kèo nào không có test thì sớm muộn cũng chỉ còn là lời văn
  trong PR.
- **Quay người có trần tốc độ góc** (`TOC_XOAY_LAI` = 2π rad/s) ngoài nội suy
  theo thời gian, và quay theo vận tốc **mục tiêu** chứ không theo vận tốc
  hiện tại (đổi A→D thì vận tốc đi qua 0, lấy hướng của nó là quay loạn).
  `lechGoc()` chốt mốc ±π về `+π` cho **xác định** — để nhiễu số học không làm
  hai khung liền nhau chọn hai chiều ngược nhau.
- **Camera `theo-owner` dùng lò xo giảm chấn TỚI HẠN** (`buocLoXo` trong
  `world.ts`, semi-implicit nên ổn định ở mọi `dt`; tới hạn nên không vọt quá
  → không dội → không rung). ω = 9 rad/s: trễ xác lập `2v/ω` = 0,36 m khi đi
  1,6 m/s, so với `v/k` = 0,62 m của lerp bậc một cũ.
- **Dừng là việc của handler, không phải của nhịp.** `keyup` / `blur` /
  `visibilitychange` / `pagehide` gửi lệnh vận tốc 0 **ngay trong cùng tick**.
  Bản B1 chờ nhịp 100 ms, mà tab bị ẩn thì trình duyệt hạ `setInterval` xuống
  ~1 lần/giây → lệnh dừng tới muộn cả giây. `HIEU_LUC_STEER` 0,7 s là dây an
  toàn cuối nếu cả lệnh đó cũng không đi được.
- **Phanh có hằng số riêng** (`LERP_PHANH` 0,08 s, ga 0,12 s): một τ chung thì
  hoặc vào trễ, hoặc ra cụt. Nhả phím → dừng trong **0,21 s** (lời hứa ≤ 0,3 s).
- **`dangGoChu()` soi cả `shadowRoot`, và `keydown` bỏ qua `isComposing`** —
  bộ gõ telex dùng `w`, `s`, `d` làm nguyên liệu chữ. Đang giữ phím mà nhảy
  vào ô nhập thì **dừng nhân vật**: `keyup` sau đó rơi vào ô nhập, không về
  tới sân khấu.
- **Thước FPS `?fps=1` từng bịa số.** `trungBinh([])` trả `1000/60` → in
  "FPS trung bình 60.0" khi không có mẫu nào, và phân vị trên mảng rỗng → NaN;
  khung đầu mất > 10 s trên renderer phần mềm là rơi đúng vào đó. Nay phần
  tính tách ra `chotFps()` (test được), cắt warmup theo **thời gian** (0,5 s)
  và chỉ khi còn ≥ 8 mẫu, phân vị nearest-rank, đo tới khi **đủ cả thời gian
  lẫn đủ khung** (trần 40 s), và **thiếu mẫu thì nói thiếu mẫu**. Thẻ hiện
  thêm số khung đếm được + thời gian khung đỉnh (ms).
- **Sân khấu TỰ GHI SỔ từng khung** (`NhanVat.soLai`, `World.soMay`), script
  bằng chứng đọc một lần ở cuối. Vòng dò đầu tiên lấy mẫu bằng
  `stage.describe()` + `doXuong()` mỗi khung và **tự kéo FPS 60 → 8,5** —
  dụng cụ đo làm hỏng đúng cái cần đo. Cũng vì thế `vanToc()` trả `x`/`z`
  **4 chữ số**: `describe().pos` làm tròn 2 chữ số, mà 0,027 m/khung ở 60 FPS
  lọt hết vào chữ số bị cắt nên "đi rất chậm" trông y hệt "đứng im".
- **Bằng chứng phải chạy ĐÚNG CHỖ TẬT XẢY RA.** Mục
  `2-khong-chay-bo-tai-cho` vòng đầu chấm trên hai lượt đã được lái ra **chỗ
  trống** nên đạt một cách tầm thường, trong khi tật chỉ hiện khi **ép vào vật
  cản mà vẫn giữ phím**. Mục `7-ep-vat-can-*` giờ ép vào **tường phòng** (luôn
  có, không phụ thuộc F1 dọn đồ) và **đòi cờ `chặn ≠ 0`** để không thể đạt vì
  đi trong chỗ trống; va chạm với từng món đồ do test đơn vị lo, tự dò hộp từ
  `hopChan()` thay vì ghi cứng toạ độ sofa (ghi cứng là rebase qua F1 #57 đỏ
  ngay, dù giao kèo chẳng liên quan sofa nằm đâu).
- **Cạm bẫy môi trường đã đo**: (1) Playwright **Firefox + Wayland + nouveau**
  làm tiến trình GPU gãy ("Exiting due to channel error") — chạy qua X11
  (`MOZ_ENABLE_WAYLAND=0`), WebGL vẫn là GPU thật; (2) `recordVideo` của
  Playwright với Firefox ra file **1,0 giây** cho cả 25 giây thao tác — quay
  bằng `ffmpeg -f x11grab` thay vào; (3) ngưỡng "nhả phím → dừng ≤ 0,3 s" khi
  chấm trên máy thật phải **cộng 2 khung hình đo từ chính sổ**, không thì đang
  đo tốc độ GPU của máy kiểm chứ không đo đường cong phanh.

## Quy tắc đo trên Firefox thật (Boss 27/10: "bị gì mà cứ mở tắt trình duyệt hoài vậy")
- Mỗi lượt đo mở Firefox **đúng một lần** (một browser/context/page), tải lại bằng `reload/goto`, đóng khi xong hẳn. Không chạy lặp script "cho chắc".
- **Một lúc chỉ một agent** dùng Firefox thật: trước khi mở, `pgrep -f '^[^ ]*firefox-1543/firefox/firefox'` (NEO ĐẦU DÒNG vào argv[0] — mọi mẫu không neo như `pgrep -f firefox-1543` hay `pgrep -f 'firefox-1543/firefox/firefox'` đều tự khớp chính vòng chờ `bash -c` của mình và của agent khác → cả đội chờ nhau mãi, đã xảy ra 2 lần 27/10) phải trống; phần không cần trình duyệt (đọc code, test, build, merge-tree, viết script) làm trước trong lúc chờ.
- Lý do: cửa sổ nhấp nháy làm phiền Boss, và nouveau gãy (`kernel rejected pushbuf`) khi ≥3 phiên Firefox GPU cùng lúc.
## Quyết định G1 — bỏ trần, chân chạm sàn, tóc đúng cỡ (26/10, Issue #56)

Boss xem bản main (F1+F2+F3) trên **Firefox GPU thật**: "không cần làm trần nhà
vì nhìn rất vướng" và "các nhân vật đang **toàn đi trên không trung**".
Bằng chứng: `node scripts/kiem-g1.mjs` (CHẠY MỘT LẦN, cờ `docs/g1/.da-chay`,
cổng riêng **5362**); số đo trước khi sửa ở `docs/g1/do-truoc/`.

- **GỐC của "đi trên không trung": `VRMHumanoidRig.update()` GHIM hông.** Mỗi
  lượt `vrm.update()`, three-vrm ghi `hips` của xương RAW theo **vị trí hông
  của model GỐC** (nhánh `boneName === 'hips'`). Chibi hoá nhân xương chân
  xuống 0,6 nhưng hông vẫn bị kéo về cao độ người lớn ⇒ bàn chân treo
  **0,35–0,42 m** trên sàn (đo thật trên Firefox: `footY` owner 0,3805 ·
  gen 0,4200; đáy hộp bao 0,3469 / 0,3709). Không thể tính trước con số đó —
  nó chỉ biết SAU khi rig chép xuống xương raw.
- **Cắm chân xuống sàn SAU `vrm.update()`, ở MỌI trạng thái không ngồi.** Bản
  cũ chỉ ground-snap trong đúng nhánh `chuyenNgoi === 'stand'`; nhánh đứng/đi/
  emote thì nội suy `goc.position.y` về 0 hoặc nhún `|sin|·0,022` — mà 0 là cao
  độ của cái gốc đang treo. Nay `capNhat` gọi `camChanXuongSan()` mỗi khung:
  đo xương bàn chân/ngón thấp nhất rồi dịch gốc đúng hiệu số. Dáng đi vì thế
  **tự có nhún** (chân trụ đứng yên, thân lên xuống theo đầu gối) — bỏ hẳn cú
  nhún giả. Đo sau khi sửa: đế giày **0,0000 m** ở idle/đi/emote/vừa dừng/sau
  khi đứng lên, cả hai nhân vật.
- **Mốc đế giày đo bằng ĐỈNH QUANH BÀN CHÂN, không bằng `Box3`.** Hộp bao của
  `SkinnedMesh` là tư thế BIND (bài học A2 vòng 4) nên không kẹp theo nó; mà
  hộp bao *chính xác* cũng sai cho model tóc dài: đuôi tóc Gen thấp hơn gót
  chân 0,11 m, lấy đáy hộp làm mặt đế thì cả người lún xuống bấy nhiêu.
  `chotDeChan()` quét đỉnh `SkinnedMesh` (`getVertexPosition`, đã biến dạng
  xương) **một lần ở khung thứ 3**, chỉ nhận đỉnh trong bán kính 0,22 m quanh
  xương bàn chân — ra `deChan` 0,033 m (Javis) / 0,049 m (Gen). Thước này phơi
  ra `doXuong().deGiayY` để script bằng chứng chấm được.
- **NỘI THẤT LÀ CỦA NGƯỜI CHIBI, nên phải hạ về cỡ của họ.** Ngồi đúng tư thế
  thì hông bám mặt ghế — và với ghế Kenney cao 0,45 m trên người chibi cao
  ~1,25 m (chân 0,554 m), bàn chân **đung đưa 0,24 m** trên sàn. Sếp chốt:
  nội thất phải vừa hai nhân vật. Hạ trong `bo-cuc.ts` bằng đúng trường
  `cao`/`rongToiDa` (không đụng code dựng):

  | món | trước | sau | kết quả đo |
  | --- | --- | --- | --- |
  | ghế ăn ×4, ghế làm việc, sofa, 2 ghế đơn | cao 0,78–0,9 | **cao 0,47** | mặt ngồi **0,2585 m** |
  | bàn ăn | rộng 1,3 | **cao 0,58** · rộng ≤1,05 | — |
  | bàn làm việc | rộng 1,35 | **cao 0,60** · rộng ≤1,12 | mặt bàn **0,586 m** |
  | bàn trà · bàn cạnh sofa · đèn sàn/đèn bàn | 0,38 · 0,5 · 1,5 · 0,42 | 0,26 · 0,34 · 1,05 · 0,30 | — |

  **Mặt ngồi 0,30–0,32 m (số Sếp nhắm) là BẤT KHẢ nếu muốn chân chạm sàn**:
  cẳng chân chibi dài 0,25 m, đế giày 0,033 m, dáng ngồi giữ đầu gối cao hơn
  mặt ghế 0,03 m (`LE_DAU_GOI`) ⇒ mặt ghế phải ≤ 0,253 m. Đo thật ở 0,30 m:
  bàn chân treo 4,7–5,2 cm. Chốt **0,2585 m** → đế giày **0,0022 m**, hông
  0,3433 m (trên mặt ghế 0,085 m = nửa bề dày đùi), đầu gối 0,2885 m.
  Giao kèo cũ (không thủng sàn) **nâng thành** chạm sàn ±2 cm cho cả ba chỗ
  ngồi `ghe-1`/`ghe-2`/`sofa`: `node scripts/kiem-g1-ngoi.mjs` (cổng 5363,
  18/18 mục, `docs/g1/bang-ngoi.txt`).
- **Đồ nhỏ lại thì cụm phải SIẾT theo, không thì món đứng lẻ.** Bàn trà
  −4,5 → −4,0; 2 ghế đơn z ±1,5 → ±1,0 quanh bàn trà; đèn sàn theo ghế đơn về
  [−5, 0] (và đèn điểm ấm trong `world.ts` dời theo — chúng là MỘT chụp đèn).
  Test F1 "không món nào đứng lẻ giữa sàn" bắt đúng chỗ này.
- **`matTrenKhoi()` phải đọc SỔ ĐO LÚC DỰNG, không đo lại trên cảnh.** Sau
  `gopTinh()` nhóm `khoi:<id>` rỗng nên `Box3` ra `null` → E2 rơi về cao độ
  ghi cứng 0,97 m của bàn CŨ và màn hình `may-tinh` lơ lửng 37 cm trên mặt bàn
  mới. `dungPhong()` nay trả `noc: Map<id, mặt trên>` cho `World`. Đo lại:
  `bottomY` 0,586 = `surfaceY` 0,586, lệch 0.
- **TÓC: ba tật chồng nhau, sửa cả ba.** Đo trước: lệch dáng của Gen
  **0,26 m** và gần như không đổi theo thời gian (tóc duỗi hẳn ra khỏi dáng
  tác giả vẽ, không phải đung đưa).
  1. **Lực spring bone tính bằng MÉT trong không gian thế giới**
     (`stiffness · dt`, `gravityPower · dt`) nên chibi hoá (head ×1,95,
     `goc.scale` 0,93–1,12) làm lệch tỉ số lực/độ-dài. `dongMocSpring()` nhân
     `stiffness`/`gravityPower`/`hitRadius` với **tỉ lệ thế giới của chính
     khớp đó**, rồi mới `setInitState()` + `reset()`.
  2. **Quán tính tính trong không gian thế giới** ⇒ đi 1,6 m/s là tóc bị quăng
     lại phía sau. Đặt `joint.center = goc` (API sẵn có của three-vrm): quán
     tính tính trong hệ quy chiếu nhân vật.
  3. **`dt` thẳng từ khung hình** ⇒ một khung nặng là một cú ném. Spring chạy
     **bước cố định 1/60 s**, chia tối đa 4 bước/khung (`physics-tuning`:
     mô phỏng nhịp cố định, đừng đưa `dt` lớn vào bộ tích phân Euler).
  Thứ tự một khung hình: `vrm.update(dt)` **không spring** (tháo
  `springBoneManager` trong đúng lời gọi đó) → `camChanXuongSan()` → spring.
  Chạy spring trước khi hạ gốc thì mỗi khung đuôi tóc bị cả thân dịch 0,35 m
  ngay sau lưng nó. Kết quả: lệch dáng **≤ 0,065 m** ở mọi trạng thái.
- **Tóc dài phải THU GỌN cho vừa người chibi.** Head ×1,95 kéo theo cả chùm
  tóc: chuỗi tóc của Gen dài 1,33 m trên thân người 1,25 m, quét xuyên mặt sàn
  dù vật lý đã đúng. `thuGonToc()` nhân tỉ lệ **gốc mỗi chuỗi spring dưới
  `head`** cho vừa (Gen 0,82; Javis tóc ngắn ra đúng 1 nên không đụng). Phải
  tính theo **ĐỘ DÀI CHUỖI**, không theo vị trí hiện thời: ở khung thứ 3 tóc
  vẫn ở dáng cuộn sát đầu, đo vị trí thì kết luận "chưa chạm sàn" rồi không
  làm gì.
- **BỎ TRẦN**: xoá tấm trần `PlaneGeometry` ở y = 2,8, 4 thanh phào viền trần,
  và 2 đèn âm trần (`den-tran-khach`, `den-tran-an`) khỏi bảng bố cục. Tường
  vẫn cao 2,8 m, chân tường gỗ giữ nguyên. Bỏ trần **không** làm cảnh sáng
  lên (hemisphere không bị hình học chặn, mặt trời ở ngoài cửa sổ nam) — đo
  thật luma cả khung 5 preset: p95 **200–213** (mốc ≤ 235), p50 134–190.
- **Hở trần thì phải có phông trời.** `phongTroi()` — một ống trụ hở hai đầu
  bán kính 30 m, `MeshBasicMaterial` + `fog: false`, dán đúng texture
  `troiChieu()` của sân vườn nên trời trong nhà liền mạch với trời ngoài cửa
  sổ; 1 lượt vẽ. Đáy ống kéo xuống **−2 m** (dưới cả mặt cỏ): tia nhìn chếch
  nhẹ lên đi gần như ngang suốt 30 m nên chạm ống ở cao độ rất thấp — bản thử
  bắt đầu từ 2,6 m để lộ một dải nền ngay trên mép tường. Và `MAU_NEN_LAB`
  đổi từ xám-xanh lạnh `0xdce6ea` sang kem ấm `0xf0ddc0` cho chỗ nào phông
  trời chưa phủ tới cũng không cắt màu.
- **Test giữ giao kèo**: `src/api/__tests__/g1-chan-cham-san.test.ts` dựng một
  **VRM giả tái hiện đúng cơ chế ghim hông**, rồi đòi đế giày về mặt sàn ở
  đứng/đi, đòi thân KHÔNG đi theo chân đang nhấc (không kẹp cứng theo bbox),
  và đòi mốc đế đo sau khi cân tầm vóc. Gỡ `camChanXuongSan()` là 4/5 test đỏ.
- **Cạm bẫy đo bằng chứng (lặp lại bài học F2)**: (1) nouveau + Firefox thỉnh
  thoảng gãy tiến trình GPU giữa chừng ("channel error") hoặc trả **texture
  hỏng** (tường đen, cỏ nhiễu màu) — chạy lại bằng `--lai` rồi **nhìn ảnh**
  trước khi tin; (2) sai tên tham số trong script bằng chứng (`place` thay vì
  `seat`, `name` thay vì `emote`) bị `.catch` nuốt mất ⇒ mục "ngồi"/"emote"
  chấm trên một nhân vật đang đứng im và ĐẠT một cách vô nghĩa — nay
  `chayLenh()` ném lỗi khi lệnh rớt, và có hẳn mục `2-ngoi-that-su-ngoi`;
  (3) ảnh bằng chứng nén sang `.jpg` ≤1280 px sau khi chạy (14 MB → 1,8 MB).
