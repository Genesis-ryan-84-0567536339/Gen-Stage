/**
 * nhanvat.ts — một nhân vật VRM trên sân khấu, có **máy trạng thái** rõ ràng
 * (`idle | walking | sitting | playing | speaking | emoting | building`) đúng
 * theo spec mục 1b, và mọi hành động trả về `Action` để dispatcher xếp hàng.
 *
 * ## Ba lớp chuyển động (A2 vòng 2)
 *
 * 1. **Lớp nền = clip CC0 thật** retarget sang `vrm.humanoid`
 *    (`src/behavior/chuyen-dong.ts`), phát bằng `THREE.AnimationMixer`, đổi
 *    dáng bằng crossfade 0,25 s. Thiếu file (`public/anim/`) thì rơi về dáng
 *    thủ tục cũ, app vẫn chạy.
 * 2. **Lớp cử chỉ** (`src/behavior/cu-chi.ts`) trộn lên lớp nền cho những cử
 *    chỉ bộ CC0 không có (vẫy, vỗ, gật, lắc, chống cằm, che miệng, gãi đầu,
 *    chỉ tay…). Hướng tay khai bằng hình học (`doCao`/`raTruoc`), không đoán
 *    dấu euler.
 * 3. **Lớp vi mô** luôn chạy: thở, chớp mắt, đổi chân, nhìn quanh, gật/cử chỉ
 *    nhịp khi nói — cộng thêm (additive) nên không bao giờ đứng hình.
 *
 * ## Thời gian là lời hứa
 *
 * Mọi hành động có thời lượng kết thúc bằng **hẹn giờ huỷ được**
 * (`hanhDongHenGio`), không phải bằng điều kiện trong `capNhat` — nên
 * `durationMs` đúng kể cả khi máy tụt xuống vài khung hình/giây. Phần nội suy
 * tư thế vẫn tính theo đồng hồ thật.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { Action, ActorState, DieuKhienBoi } from '../api/types';
import { BIEU_CAM, DAI_CLIP } from './noi-dung';
import { truotVaCham } from './bo-cuc';
import {
  hanhDong,
  hanhDongHenGio,
  hanhDongXongNgay,
  type HanhDongCoTay,
} from './hanh-dong';
import { DINH_NGHIA_EMOTE } from '../behavior/emotes';
// B2 (#20) — sổ nối sang lớp tiếng (`src/audio/`). File `so-tieng.ts` không
// phụ thuộc gì, nên nạp nó không kéo theo Web Audio hay lớp tiếng vào test.
import {
  dangChanWebSpeech,
  ghiMiengNhep,
  thoiLuongThat,
} from '../audio/so-tieng';
import { phatAmNgan } from '../behavior/am-thanh';
import { IDLE_STYLES, THONG_SO_IDLE, type IdleStyle } from '../behavior/idle-styles';
import {
  CU_CHI_CLIP,
  CU_CHI_EMOTE,
  cuChiNoi,
  doHuongGoc,
  nhomNoiTuCamXuc,
  tayBuong,
  trongSoCuChi,
  type BoXuong,
  type NhomNoi,
} from '../behavior/cu-chi';
import {
  LopNen,
  NEN_CLIP,
  NEN_EMOTE,
  napKho,
  type KhoChuyenDong,
} from '../behavior/chuyen-dong';

/** Cảm xúc (tên emote) → tâm trạng ngắn ảnh hưởng dáng chờ sau đó. */
const MOOD_TU_EMOTE: Record<string, string> = {
  vui: 'vui',
  'rat-vui': 'vui',
  'dong-y': 'vui',
  chao: 'vui',
  'thanh-cong': 'vui',
  buon: 'buon',
  'tu-choi': 'buon',
  'that-bai': 'buon',
  gian: 'gian',
  met: 'met',
};
/** Tâm trạng → độ nhân vào thở/đung đưa idle (xem `capNhat`). */
const NHAN_MOOD: Record<string, { tho: number; dungDua: number }> = {
  vui: { tho: 1.15, dungDua: 1.3 },
  buon: { tho: 0.75, dungDua: 0.55 },
  gian: { tho: 1.3, dungDua: 0.8 },
  met: { tho: 0.7, dungDua: 0.5 },
  'binh-thuong': { tho: 1, dungDua: 1 },
};
/** Tâm trạng mặc định — `dung()`/`actor.stop` trả về đúng giá trị này. */
export const MOOD_MAC_DINH = 'binh-thuong';

/**
 * Ngồi — **đo bằng xương thật**, không bằng hộp bao bind-pose (review PR #10
 * vòng 4 chỉ ra 4 vòng trước đều sai ở đúng chỗ này).
 *
 * `THREE.Box3.setFromObject(obj)` với `precise = false` nở hộp theo
 * `geometry.boundingBox` của `SkinnedMesh` — tức **bind-pose** — rồi nhân ma
 * trận world của *node mesh*. Animation chỉ đổi **xương**, không đổi ma trận
 * node, nên hộp đó y hệt nhau giữa ngồi và đứng: kẹp theo nó chỉ kẹp
 * `goc.position.y`, nhân vật không hạ xuống tí nào, hông treo ~40 cm trên mặt
 * ghế và mặt ghế cắt ngang bắp chân.
 *
 * Vòng 5 đo bằng `getWorldPosition` của chính các xương `hips` /
 * `leftUpperLeg` / `leftLowerLeg` / `leftFoot` / `leftToes` **sau khi mixer đã
 * cập nhật** (những số này *có* đổi theo tư thế) — xem `doTuThe()`, dùng
 * chung cho cả code lẫn `scripts/kiem-a2.mjs`. Hộp bao chính xác chỉ dùng để
 * ghi nhật ký, và luôn là `setFromObject(root, true)`.
 */
/** Mặt ghế mặc định (m) khi `actor.sit` không được truyền `seatY` (place lỗi cũ/không đo được). */
const MAT_GHE_MAC_DINH = 0.45;
/** Chặn dưới/trên cho độ dày đùi đo trên model (m) — xem `dayDui`. */
const DAY_DUI_MIN = 0.04;
const DAY_DUI_MAX = 0.15;
/** Ngưỡng sàn — bàn chân khi ngồi không được thấp hơn mức này. */
const NGUONG_SAN_NGOI = -0.01;
/**
 * G1 (#56) — **mặt sàn nhà** (m). Sàn của `phong.ts` là một `PlaneGeometry` ở
 * y = 0; thảm dày 0,6 cm nên đứng trên thảm vẫn nằm trong sai số ±1 cm.
 */
const MAT_SAN = 0;
/** Chặn trên cho khoảng xương-bàn-chân → ĐẾ giày đo trên model (m), tư thế ĐỨNG. */
const DE_CHAN_MAX = 0.09;
/**
 * G1 vòng 3 (#56, review 26/10) — chặn trên cho khoảng xương-chân → đế giày
 * đo ở **tư thế bất kỳ** (m).
 *
 * Vì sao phải có số riêng, cao hơn `DE_CHAN_MAX`: khoảng này KHÔNG phải bề dày
 * đế giày, nó là "điểm thấp nhất của bàn chân nằm dưới xương bàn chân bao
 * nhiêu", và nó đổi theo tư thế. Đứng: cổ chân thẳng, đế ngay dưới xương,
 * 0,033 m. Ngồi: cổ chân xoay nên gót/mũi đổ ra xa xương, đo thật 0,093 m.
 * Lấy hằng số của tư thế đứng mà trừ cho tư thế ngồi là lún 5,7 cm dưới sàn —
 * đúng lỗi CHẶN 1 của review.
 */
const DE_GIAY_TU_THE_MAX = 0.2;
/** Đo lại khoảng xương-chân → đế giày mỗi bấy nhiêu ms khi tư thế đang đổi. */
const CHU_KY_DO_DE = 80;
/**
 * G1 (#60) — **bước cố định của spring bone** (s). Tóc/váy tích phân Euler nửa
 * ẩn; `dt` của một khung hình nặng (tab vừa hiện lại, GC, đổi cảnh) có thể lên
 * cả giây và khi đó lực trọng trường · `dt` ném đuôi tóc đi rất xa trong MỘT
 * bước, rồi quán tính `1 − dragForce` giữ nó dao động mãi — đúng cái Boss thấy
 * là "tóc văng". Theo `physics-tuning`: mô phỏng ở nhịp CỐ ĐỊNH, khung hình dài
 * thì **chia bước**, không đưa thẳng `dt` lớn vào bộ tích phân.
 */
const DT_SPRING = 1 / 60;
/**
 * Trần số bước spring trong MỘT khung hình (khỏi treo máy sau khi tab ẩn lâu),
 * và trần thời gian mô phỏng trong một khung (s).
 *
 * G1 vòng 3 (#56, review 26/10 — CHẶN 2): bản trước để trần 4 bước **và** kẹp
 * `buoc = min(dt/soBuoc, DT_SPRING)`, nên khung hình dài 129 ms (bản build) /
 * 338 ms (dev) chỉ được mô phỏng 66,7 ms. Xương thì nhảy đủ 338 ms dáng nhảy
 * `Dance_Loop`, tóc chỉ chạy 1/5 chỗ đó ⇒ đuôi tóc **tụt lại sau đầu** đúng
 * khoảng cách đầu vừa đi: đo thật `lechToc` vọt 0,348 m ở t ≈ 200 ms rồi mới
 * đuổi kịp. Nhịp cố định chỉ chữa được giật khi nó **không ăn bớt thời gian**:
 * `24 × 1/60 = 0,4 s` nên mọi khung hình tới 400 ms được mô phỏng ĐỦ, với bước
 * luôn ≤ 1/60 s. Dài hơn 400 ms (tab vừa hiện lại) thì bỏ phần dư — thà tóc
 * chậm một khung còn hơn treo máy.
 */
const BUOC_SPRING_TOI_DA = 24;
const DT_SPRING_TOI_DA = 0.4;
/**
 * TRẦN DỊCH CHUYỂN MỘT KHUNG của mỗi xương tóc/vải (m).
 *
 * Vòng 3 đo được một **gai một khung** 0,112 m ở `ngac-nhien`: lúc bàn tay đưa
 * lên che miệng, collider của tay cắt vào chuỗi tóc và `_collision()` của
 * three-vrm đẩy đuôi ra khỏi hình cầu **trong đúng một bước**, không có trần
 * nào. Cùng khung đó `lechVay` cũng nhảy 0,018 → 0,079, nên biết là cú đẩy
 * của collider chứ không phải tóc bung.
 *
 * Chữa bằng trần TỐC ĐỘ hiển thị, không bằng tắt collider: mô phỏng vẫn chạy
 * đủ (tay vẫn gạt được tóc), nhưng dáng VẼ RA mỗi khung chỉ được rời dáng
 * khung trước tối đa bấy nhiêu mét ở đầu đoạn xương. Trạng thái bên trong
 * (`_currentTail`) không bị sửa, nên khi cú đẩy qua rồi tóc tự đuổi kịp trong
 * vài khung thay vì nhảy một phát.
 *
 * Cố tình KHÔNG nhân theo `dt`: chính những khung dài (nouveau khựng 130–400
 * ms) là chỗ sinh gai, nhân theo `dt` là mở trần đúng lúc cần siết nhất.
 */
const DICH_TOC_MOI_KHUNG = 0.03;
/**
 * Trần lực MỘT BƯỚC spring, theo tỉ lệ độ dài đoạn xương — xem `dongMocSpring`.
 * Điều kiện ổn định của tích phân Euler hiện: lực mỗi bước phải nhỏ so với
 * đoạn xương, không thì đuôi vượt qua tâm và phép chuẩn hoá lật hướng.
 */
const TRAN_LUC_BUOC = 0.3;
/** Bẫy `sb.update` trong bấy nhiêu khung hình đầu để bắt thư viện đổi cách gọi. */
const SO_KHUNG_BAY_SPRING = 12;
/**
 * G1 (#60) — **giữ tóc đúng dáng tác giả vẽ sau khi chibi hoá.**
 *
 * Chibi hoá nhân xương `head` lên 1,95, nên chùm tóc cũng to gấp đôi: với Gen,
 * đuôi tóc cách gốc đầu 0,75 m ở dáng gốc mà thân người chỉ cao 1,25 m. Cân
 * lực theo tỉ lệ (xem `dongMocSpring`) giữ đúng **tỉ số** lực/độ-dài của model
 * gốc, nhưng ở cỡ đó cân bằng của nó là tóc rủ THẲNG — đo thật: đuôi tóc trôi
 * ra 1,22 m, quét xuống dưới cả mặt sàn.
 *
 * Dáng đúng là dáng tác giả vẽ (`setInitState`), nên kéo cân bằng về phía đó:
 * cứng hơn, rủ nhẹ hơn. Tóc vẫn đung đưa theo cử động, chỉ không còn duỗi
 * thành rèm. Hai số này là **tỉ lệ so với model gốc**, không phải số tuyệt
 * đối — model nào cũng dùng được.
 */
const TOC_CUNG_THEM = 2.6;
const TOC_RU_BOT = 0.35;
/** Tóc không được quét xuống thấp hơn đế giày — chừa lề bấy nhiêu mét. */
const LE_TOC_TREN_SAN = 0.03;
/** Chờ bấy nhiêu giây cho tóc về dáng cân bằng rồi mới đóng lại mốc (xem `chotLaiMocToc`). */
const CHO_ON_TOC = 3;
/** Phần thân dưới (tính từ đế giày lên) phải KHÔNG có lọn tóc rủ tới. */
const TOC_CHUA_THAN_DUOI = 0.3;
/** Chặn dưới khi thu gọn chuỗi tóc (dưới mức này là tóc teo lạc khỏi mái). */
const THU_TOC_TOI_THIEU = 0.55;
/** Trục đứng + quay rỗng, dùng lại để không cấp phát mỗi khung hình. */
const LEN = /* @__PURE__ */ new THREE.Vector3(0, 1, 0);
/** Quaternion tạm cho trần tốc độ tóc (không cấp phát mỗi khung). */
const _qHam = /* @__PURE__ */ new THREE.Quaternion();
/** Lưới thưa hoá mây điểm đế giày (m) — 6 mm là dưới sai số hình học ta cần. */
const LUOI_MOC_DE = 0.006;
const KHONG_QUAY = /* @__PURE__ */ new THREE.Quaternion();
/** Thời gian VÀO của lớp cử chỉ emote/clip (ms) — trần tốc độ xoay thân/đầu. */
const VAO_CU_CHI_MS = 800;
/** Đầu gối khi ngồi phải cao hơn mặt ghế ít nhất bao nhiêu mét. */
const LE_DAU_GOI = 0.03;

/**
 * Chibi hoá bằng bone scale — **phải scale XƯƠNG RAW** (Issue #17).
 *
 * Bài học B1: bản A2 đặt `scale` lên rig **normalized** của three-vrm, và
 * `VRMHumanoidRig.update()` chỉ copy `quaternion` (+ `position` của `hips`)
 * sang xương raw — **không copy `scale`**. Tức toàn bộ bảng tỉ lệ A2 là
 * **no-op**: đo `rawHeadY` trước/sau không đổi một phần nghìn nào, nhân vật
 * vẫn tỉ lệ người thật. Bản này đặt scale lên chính xương đang dựng hình
 * (`getRawBoneNode`), nên nó có tác dụng thật — và vì thế phải tính theo tỉ lệ
 * **tuyệt đối**, không phải tỉ lệ cục bộ:
 *
 * Xương raw là một cây thật: scale của cha nhân xuống con. Lấy nguyên bảng cũ
 * (hips 0,84 × spine 0,74 × chest 0,74 × neck 0,66 × head 1,76 ≈ 0,53) thì đầu
 * **teo đi** thay vì phóng to. Nên ở đây khai tỉ lệ MONG MUỐN so với model
 * gốc, rồi `apDungChibi()` chia cho tỉ lệ của xương tổ tiên gần nhất để ra
 * scale cục bộ phải đặt.
 *
 * Mọi hệ số đều `setScalar` (scale ĐỀU, không hệ số âm) nên da/tóc không răng
 * cưa và pháp tuyến không lộn.
 */
/**
 * D1b (#48) — hai nhân vật phải CÙNG tầm vóc: khoảng cách **xương bàn chân → gốc
 * xương đầu** (m) sau chibi hoá. Xem `NhanVat.canDeuChibi()`.
 */
const CAO_XUONG_CHUAN = 1.01;

const CHIBI_TUYET_DOI: Partial<Record<TenXuong, number>> = {
  hips: 1,
  spine: 0.9,
  chest: 0.9,
  upperChest: 0.9,
  neck: 0.9,
  head: 1.95,
  leftShoulder: 0.92,
  rightShoulder: 0.92,
  leftUpperArm: 0.82,
  rightUpperArm: 0.82,
  leftLowerArm: 0.82,
  rightLowerArm: 0.82,
  leftHand: 1,
  rightHand: 1,
  leftUpperLeg: 0.6,
  rightUpperLeg: 0.6,
  leftLowerLeg: 0.6,
  rightLowerLeg: 0.6,
  leftFoot: 0.8,
  rightFoot: 0.8,
};

/** Tốc độ đi mặc định (m/s). */
export const TOC_DO_DI = 0.95;

/* ------------------------------------------------- B1: lái bằng vận tốc */

/**
 * Vận tốc tối đa khi lái bằng phím (`actor.steer`), m/s — Issue #18 mục 2.
 * Nhanh hơn `TOC_DO_DI` (0,95) vì đây là Boss tự điều khiển, không phải
 * nhân vật "đi làm việc" theo lệnh agent.
 */
export const TOC_DO_STEER = 1.6;
/**
 * Thời gian để vận tốc bám tới vận tốc yêu cầu (s) — gia tốc *và* giảm tốc
 * dùng cùng một hằng số, nên vào và ra đều mượt như nhau. 0,15 s = ~9 khung
 * hình ở 60 fps: đủ mềm để không "giật" khi nhấn/nhả, đủ nhanh để không
 * thành trượt băng.
 */
export const LERP_VAN_TOC = 0.12;
/**
 * F2 (#56 mục 2) — **PHANH riêng, nhanh hơn ga.** Boss chốt "nhả phím → dừng
 * êm ≤ 0,3 s". Với nội suy hàm mũ `1 − e^(−dt/τ)`, thời gian từ 1,6 m/s về
 * `NGUONG_PHANH` là `τ·ln(1,6/0,12)` — τ = 0,08 s cho ra ~0,21 s, dư biên an
 * toàn dưới 0,3 s. Dùng chung một τ cho cả ga và phanh (bản B1 cũ) thì hoặc
 * vào bị trễ, hoặc ra bị cắt cụt; tách hai hằng số là cách duy nhất giữ được
 * cả hai lời hứa.
 */
export const LERP_PHANH = 0.08;
/**
 * Trần thời gian một khung hình được tích phân cho phần lái (s). Vận tốc tối
 * đa 1,6 m/s × 0,2 s = 0,32 m — nhỏ hơn nửa bề dày của vật cản mỏng nhất
 * trong `bo-cuc.ts` (dãy tủ: 0,4 m) nên không bao giờ lọt xuyên.
 */
const BUOC_LAI_TOI_DA = 0.2;
/**
 * Đang PHANH mà chậm hơn ngưỡng này (m/s) thì cắt thẳng về 0 — không rê thêm
 * vài xăng-ti-mét. Chỉ dùng cho lúc phanh: đây là một **bậc nhảy vận tốc**,
 * chấp nhận được khi đang dừng lại (mắt không đọc ra) nhưng sẽ sai nếu đem
 * dùng làm ngưỡng "có đang đi hay không".
 */
const NGUONG_PHANH = 0.12;
/**
 * Trên ngưỡng này (m/s) mới coi là **đang đi**: chạy clip `walk`, nhún thân,
 * cập nhật hướng mặt.
 *
 * Tách khỏi `NGUONG_PHANH` sau review F2: một hằng số làm hai việc thì khung
 * đầu tăng tốc từ 0 (|v| còn < 0,12) bị coi là "không đi" → `state` nháy một
 * khung ở FPS cao. Ngưỡng "đang đi" phải thấp hơn hẳn ngưỡng "cắt phanh".
 */
const NGUONG_DI = 0.04;
/**
 * F2 — **tốc độ quay người tối đa khi lái** (rad/s).
 *
 * Bản B1 cũ xoay bằng `lech * min(1, dt*9)`: ở 1 FPS (máy kiểm swiftshader)
 * `dt*9 = 9` → kẹp về 1 → **quay tức thì**, nên mọi bằng chứng cũ không bao
 * giờ thấy cú lật; ở 60 FPS thì 180° hết ~0,3 s = 600°/s, mắt Boss đọc ra
 * thành "giật lia". Giờ xoay theo **thời gian thật** (hàm mũ) *và* kẹp trần
 * tốc độ góc: đổi hướng 180° luôn mất ~0,5 s bất kể FPS.
 */
const TOC_XOAY_LAI = Math.PI * 2;
/** Hằng thời gian bám hướng mặt khi lái (s). */
const LERP_XOAY_LAI = 0.1;

/**
 * Hệ số nội suy **độc lập FPS**: `1 − e^(−dt/τ)`.
 *
 * Vì sao không dùng `min(1, dt/τ)` như bản B1: `dt/τ` chỉ xấp xỉ đúng khi
 * `dt ≪ τ`. Ở 60 FPS (`dt` = 1/60, τ = 0,12) nó cho 0,139 còn công thức
 * đúng cho 0,130 — lệch 7 %; ở 10 FPS (`dt` = 0,1) nó cho 0,833 còn đúng là
 * 0,565 — lệch 47 %, tức **tốc độ hội tụ phụ thuộc FPS**. Đó chính là lý do
 * cùng một đoạn code cho cảm giác khác nhau giữa máy kiểm ~1 FPS và Firefox
 * GPU thật 60 FPS của Boss (Issue #56 mục 2).
 */
export function heSoBam(dt: number, tau: number): number {
  if (!(dt > 0)) return 0;
  if (!(tau > 0)) return 1;
  return 1 - Math.exp(-dt / tau);
}

/**
 * Chuẩn hoá hiệu hai góc về (−π, π].
 *
 * Kẹp đúng mốc π: `lech` đúng bằng ±π là **đối xứng**, quay trái hay phải
 * cũng xa như nhau. Nếu để trôi theo dấu của phép trừ thì hai khung liền
 * nhau có thể chọn hai chiều ngược nhau (nhiễu số học) → thân lắc qua lắc
 * lại. Chốt về `+π` cho **xác định**, không phụ thuộc nhiễu.
 */
export function lechGoc(goc: number, tu: number): number {
  let d = (goc - tu) % (Math.PI * 2);
  if (d <= -Math.PI) d += Math.PI * 2;
  if (d > Math.PI) d -= Math.PI * 2;
  return d;
}

/** Kết quả một khung lái (xem `buocLai`). */
export interface KhungLai {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Có DỊCH CHUYỂN thật trong khung này không (gate clip đi + nhún thân). */
  dangDi: boolean;
  /** Tốc độ THẬT của khung = quãng đi được / dt (≠ |v| khi đụng vật cản). */
  tocThat: number;
  chanX: boolean;
  chanZ: boolean;
}

/**
 * **Một khung lái, thuần tuý** — toàn bộ phần vật lý của `actor.steer`.
 *
 * Tách ra khỏi `NhanVat.capNhat` sau review F2 vì một lý do thực dụng: dựng
 * một `NhanVat` cần cả model VRM, nên trước đó **không có test nào chạm được
 * vào gốc va chạm** — giao kèo "đụng sofa thì về `idle`" chỉ tồn tại bằng lời
 * văn trong PR. Giờ hàm này không đụng `THREE`, không đụng DOM, nên
 * `f2-dieu-khien-muot.test.ts` lái thẳng vào hộp chắn thật của `bo-cuc.ts` và
 * chấm bằng số. `capNhat` chỉ còn là nơi *gọi* nó.
 *
 * @param mx,mz vận tốc MỤC TIÊU của khung (0, 0 = đang phanh)
 */
export function buocLai(
  x: number,
  z: number,
  vx: number,
  vz: number,
  mx: number,
  mz: number,
  dt: number,
): KhungLai {
  /**
   * Bám vận tốc bằng hàm mũ `1 − e^(−dt/τ)` (xem `heSoBam`), **ga và phanh
   * hai τ khác nhau**: vào mượt (0,12 s), nhả dừng gắt hơn (0,08 s) để kịp
   * lời hứa "nhả phím → dừng êm ≤ 0,3 s".
   */
  const phanh = mx === 0 && mz === 0;
  const k = heSoBam(dt, phanh ? LERP_PHANH : LERP_VAN_TOC);
  let nvx = vx + (mx - vx) * k;
  let nvz = vz + (mz - vz) * k;
  // đã nhả phím và chậm hơn ngưỡng → cắt hẳn, không rê thêm vài xăng-ti-mét
  if (phanh && Math.hypot(nvx, nvz) <= NGUONG_PHANH) {
    nvx = 0;
    nvz = 0;
  }

  // Kẹp trong phòng + trượt dọc bàn/kệ (`bo-cuc.ts`): giải TỪNG TRỤC nên đi
  // chéo vào mép bàn thì men theo mép chứ không dính cứng.
  const [nx, nz] = truotVaCham(x, z, x + nvx * dt, z + nvz * dt, BAN_KINH_THAN);
  const diX = nx - x;
  const diZ = nz - z;

  /**
   * **Vận tốc theo trục = quãng THẬT ĐÃ ĐI của trục đó, chia `dt`.**
   *
   * Bản B1 nhân `0,2` khi bị chặn. Nghe nhẹ nhàng nhưng tạo một **điểm cân
   * bằng bẩn**: mỗi khung ga kéo vận tốc lên, va chạm lại nhân 0,2, hai bên
   * gặp nhau ở một giá trị KHÁC 0 (đo trên Firefox GPU thật: 0,23 m/s) trong
   * khi toạ độ **không hề nhích** — đúng cái "chạy bộ tại chỗ" trước sofa mà
   * Boss thấy.
   *
   * Vòng F2 đầu sửa thành "xoá hẳn về 0", nhưng review chỉ ra nó sai kiểu
   * khác: chỉ cần kẹp mất 1 % của bước là **mất toàn bộ** vận tốc trục đó rồi
   * gây dựng lại từ 0 ở khung sau ⇒ trượt men mép bàn theo đường chéo giật
   * nhẹ theo chu kỳ.
   *
   * Quy tắc hiện tại không cần phân biệt "chặn hẳn" với "kẹp một phần": lấy
   * đúng quãng đã đi được. Chặn hoàn toàn ⇒ quãng 0 ⇒ vận tốc 0 (hết vận tốc
   * ảo); kẹp một phần ⇒ **giữ đúng phần đi được** (trượt mượt dọc mép). So
   * sánh theo tỉ lệ (`1 − 1e-9`) chứ không theo hằng số tuyệt đối: ở 60 FPS
   * một bước chỉ 0,027 m, ngưỡng tuyệt đối hoặc báo chặn oan (bản B1: "nửa
   * bước") hoặc không bao giờ báo (bản F2 đầu: trừ `1e-6` làm vế phải âm với
   * bước nhỏ).
   */
  let chanX = false;
  let chanZ = false;
  if (dt > 0) {
    if (Math.abs(diX) < Math.abs(nvx * dt) * (1 - 1e-9)) {
      nvx = diX / dt;
      chanX = true;
    }
    if (Math.abs(diZ) < Math.abs(nvz * dt) * (1 - 1e-9)) {
      nvz = diZ / dt;
      chanZ = true;
    }
  }

  /**
   * **"Đang đi" tính SAU va chạm, từ quãng thật.**
   *
   * Vòng F2 đầu đặt `dangDi = |v| > ngưỡng` *trước* khi giải va chạm, nên khi
   * ép vào sofa thì mỗi khung ga vẫn kéo `|v|` lên trước khi bị xoá ⇒ `dangDi`
   * luôn `true` ⇒ thân vẫn **nhún** (`position.y = |sin(phaBuoc)|·0,022`).
   * Vận tốc ảo đã hết, nhưng mắt Boss vẫn đọc ra "chạy bộ tại chỗ". Nguồn sự
   * thật duy nhất cho "có đi hay không" là **quãng đường khung này thật sự
   * dịch được**.
   */
  const tocThat = dt > 0 ? Math.hypot(diX, diZ) / dt : 0;
  return { x: nx, z: nz, vx: nvx, vz: nvz, dangDi: tocThat > NGUONG_DI, tocThat, chanX, chanZ };
}
/** Bán kính thân người khi kiểm va chạm với bàn/kệ (m). */
const BAN_KINH_THAN = 0.34;

type TenXuong = Parameters<NonNullable<VRM['humanoid']>['getNormalizedBoneNode']>[0];

/** Hành động có thời lượng + biết mình có bị cắt giữa chừng hay không. */
interface HanhDongCoCo extends HanhDongCoTay {
  cancelled: () => boolean;
}

/**
 * Hẹn giờ huỷ được, **nhớ mình bị cắt hay xong thật**.
 *
 * `hanh-dong.ts` là lõi A1 (không sửa) nên `done` vẫn resolve cả khi bị huỷ —
 * dispatcher cần thế để giải phóng hàng đợi. Cái thiếu là nơi gọi biết phân
 * biệt; `cancelled()` chính là chỗ đó: `.then()` sau emote, `actor.emoteDone`
 * và việc ghi `mood` đều kiểm cờ này trước khi làm gì (review PR #10 mục 1.3).
 */
function henGioCoCo(durationMs: number, ket: (biHuy: boolean) => void): HanhDongCoCo {
  let biCat = false;
  const hd = hanhDongHenGio(durationMs, (biHuy) => {
    if (biHuy) biCat = true;
    ket(biHuy);
  });
  return Object.assign(hd, { cancelled: () => biCat });
}

/** Hành động lái: như `henGioCoCo` nhưng **đẩy được hạn** (F2, Issue #56). */
interface HanhDongLai extends HanhDongCoCo {
  /** Đẩy hạn tự xong ra `ms` kể từ BÂY GIỜ (không tạo hành động mới). */
  giaHan(ms: number): void;
}

/**
 * Hẹn giờ **gia hạn được** cho `actor.steer` (F2, Issue #56 mục 2).
 *
 * `hanhDongHenGio` trong `stage/hanh-dong.ts` là lõi A1 — không sửa. Chỗ này
 * dựng riêng một hành động cùng hợp đồng (`durationMs`, `done`, `cancel`,
 * `cancelled`) nhưng thêm `giaHan`: phím giữ W 3 giây chỉ cần MỘT hành động
 * được đẩy hạn nhiều lần, thay vì 30 hành động xé-dựng-lại như bản B1.
 *
 * `durationMs` báo ra ngoài là hạn của *lần đặt đầu tiên* (dispatcher chỉ đọc
 * số này để ước lượng); `done` resolve đúng một lần, ở hạn CUỐI CÙNG.
 */
function henGioLai(durationMs: number, ket: (biHuy: boolean) => void): HanhDongLai {
  let hen: ReturnType<typeof setTimeout> | null = null;
  let xongRoi = false;
  let biCat = false;
  let giaiQuyet: () => void = () => undefined;
  const done = new Promise<void>((r) => {
    giaiQuyet = r;
  });
  const dong = (biHuy: boolean) => {
    if (xongRoi) return;
    xongRoi = true;
    if (hen !== null) clearTimeout(hen);
    hen = null;
    if (biHuy) biCat = true;
    ket(biHuy);
    giaiQuyet();
  };
  const dat = (ms: number) => {
    if (xongRoi) return;
    if (hen !== null) clearTimeout(hen);
    hen = setTimeout(() => {
      hen = null;
      dong(false);
    }, Math.max(0, ms));
  };
  dat(durationMs);
  return {
    durationMs,
    done,
    xong: () => dong(false),
    cancel: () => dong(true),
    cancelled: () => biCat,
    giaHan: (ms: number) => dat(ms),
  };
}

interface ClipDangChay {
  ten: string;
  /** Mốc bắt đầu theo đồng hồ thật (ms). */
  batDau: number;
  /** Thời lượng thật (ms). */
  dai: number;
  loop: boolean;
  hd: HanhDongCoTay;
  /** Độ mạnh 0–1 — chỉ `actor.emote` dùng, clip thường luôn 1. */
  manh?: number;
  /** Nhân tốc độ phát lớp nền. */
  tocDo?: number;
}

/** Một chuyến đi, nội suy theo đồng hồ thật. */
interface ChuyenDi {
  tu: THREE.Vector3;
  den: THREE.Vector3;
  batDau: number;
  dai: number;
  hd: HanhDongCoTay;
  tocDo: number;
}

/**
 * Một lần lái bằng vận tốc (`actor.steer`).
 *
 * KHÔNG nội suy theo đồng hồ như `ChuyenDi`: điều khiển bằng vận tốc thì mỗi
 * khung hình cộng `v·dt` — vị trí là *kết quả* của phím Boss đang giữ, không
 * phải lời hứa tính trước. Lời hứa duy nhất ở đây là `ms`: hết `ms` thì lệnh
 * hết hiệu lực và nhân vật giảm tốc về 0 (gọi lại để kéo dài).
 */
interface LanLai {
  /** Vận tốc yêu cầu (m/s). */
  vxMuc: number;
  vzMuc: number;
  /** Mốc đồng hồ thật (ms) mà lệnh hết hiệu lực. */
  han: number;
  hd: HanhDongLai;
  /** Token của lần lái này — steer mới thay steer cũ, token đổi. */
  token: number;
}

/** Một lần xoay người, nội suy theo đồng hồ thật. */
interface LanXoay {
  tu: number;
  den: number;
  batDau: number;
  dai: number;
  hd: HanhDongCoTay;
  /** Xoay do lệnh `actor.turnTo` (chiếm thân) hay chỉ là chỉnh hướng sau khi đi. */
  chiemThan: boolean;
}

const bayGio = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class NhanVat {
  readonly id: string;
  readonly ten: string;
  readonly vrm: VRM;
  /**
   * **Gốc nhân vật** — một `Group` BỌC NGOÀI `vrm.scene`, không phải chính nó.
   *
   * Lý do (C0, Issue #28 — Boss: *"đi ngược mà thân thể mặt mũi nhìn kỳ"*):
   * model **VRM 0.x** quay mặt ngược với VRM 1.0, `VRMUtils.rotateVRM0` sửa
   * bằng cách đặt `vrm.scene.rotation.y = Math.PI`. Nhưng cả sân khấu lại ghi
   * `goc.rotation.y` để quay người (`xoayVe`, steer, `actorSpawn`) — nếu `goc`
   * CHÍNH LÀ `vrm.scene` thì cú ghi đầu tiên **xoá sạch** 180° đó và nhân vật
   * đi lùi suốt đời. Tách hai việc ra hai node: Group giữ *hướng đi*, còn
   * `vrm.scene` bên trong giữ *bù trừ VRM0*, không ai ghi đè ai.
   */
  readonly goc: THREE.Object3D;
  /** Mục tiêu cho `vrm.lookAt`. */
  readonly diemNhin = new THREE.Object3D();

  /** Tên mục tiêu đang nhìn, để `stage.describe` trả về. */
  nhinTen: string | null = 'camera';
  /**
   * C0 (#28) — **thân** đang quay về đâu (`stage.describe().facingTarget`).
   * Chỉ mang tên khi quay về một mục tiêu CÓ TÊN (`camera`, id actor/place);
   * quay về toạ độ trần hoặc một góc số thì `null`.
   */
  huongVe: string | null = null;
  /** C0 (#28) — đang ở dáng LẮNG NGHE (gật nhẹ theo nhịp). */
  private ngheNgong = false;
  /** C0 (#28) — người nói đang hỏi → nghiêng đầu. */
  private ngheCauHoi = false;
  /** Model này là VRM 0.x (đã bù 180° trên `vrm.scene`) — bằng chứng số. */
  readonly vrm0: boolean;
  /** Mã prop đang cầm. */
  dangCam: string | null = null;
  /** Tay cầm. */
  tayCam: 'left' | 'right' = 'right';
  /** Tâm trạng — đổi khi chạy xong một `actor.emote`, tự rã về mặc định. */
  mood = MOOD_MAC_DINH;
  private hanMood = Infinity;

  /** Kiểu đứng chờ (`actor.idleStyle`). */
  idleKieu: IdleStyle = 'binh-thuong';

  // nhìn quanh khi idle (lớp hành vi nhỏ, không chiếm thân)
  private nhinQuanhHan = 0;
  private nhinQuanhYaw = 0;
  private nhinQuanhPitch = 0;
  private nhinQuanhYawMuc = 0;
  private nhinQuanhPitchMuc = 0;

  /** Giây trôi qua theo **đồng hồ thật**, không cộng dồn `dt`. */
  private t = 0;
  private t0 = bayGio();
  private trangThai: ActorState = 'idle';

  // chớp mắt
  private hanChop = 1.5;
  private dangChop = -1;

  // biểu cảm
  private bieuCam = 'neutral';
  private manhBieuCam = 0;
  private hanBieuCam = Infinity;

  // đi lại
  private di: ChuyenDi | null = null;
  private phaBuoc = 0;

  // xoay người
  private xoay: LanXoay | null = null;

  /* --- B1: lái bằng vận tốc (`actor.steer`) --- */
  /** Lệnh lái đang có hiệu lực (null = không ai lái). Tên khác method `lai()`. */
  private dangLai: LanLai | null = null;
  /** Vận tốc HIỆN TẠI (m/s) — lerp dần về `lai.vxMuc`, không nhảy bậc. */
  private vx = 0;
  private vz = 0;
  private demTokenLai = 0;
  /**
   * Cờ "đang THAY steer": `lai()` phải huỷ lệnh lái cũ (để token đổi) nhưng
   * KHÔNG được xoá vận tốc đang có — nếu xoá thì giữ phím W liên tục sẽ giật
   * về 0 mỗi 100 ms. Lệnh khác (`moveTo`, `sit`, `stop`) cắt steer thì vẫn
   * xoá vận tốc như thường.
   */
  private dangThaySteer = false;
  /** Ai điều khiển nhân vật này (`stage.describe` → `controlledBy`). */
  dieuKhienBoi: DieuKhienBoi = 'agent';

  // clip
  private clip: ClipDangChay | null = null;

  // ngồi
  private dangNgoi = false;
  /** Đang trong lúc chuyển sang ngồi / đứng lên (chọn dáng nền tương ứng). */
  private chuyenNgoi: 'sit' | 'stand' | null = null;

  /** Lớp nền chuyển động thật (null = chưa nạp được bộ clip). */
  private nen: LopNen | null = null;
  /** Bộ xương + hướng gốc, dựng một lần lúc nạp. */
  private xuongBo!: BoXuong;

  /**
   * Hành động đang **chiếm thân** (đi / xoay / clip / ngồi / đứng / nói).
   * Nguồn sự thật DUY NHẤT của `state`.
   */
  private viec: HanhDongCoTay | null = null;

  // nói
  private noiConLai = 0;
  private noiBatDau = 0;
  private nhomNoi: NhomNoi = 'binh-thuong';
  /** Chữ đang hiện trên bong bóng (null = không hiện). */
  bongBong: string | null = null;
  private hanBongBong = 0;
  private hdBong: HanhDongCoTay | null = null;

  /** Đồ vật đang gắn vào tay (do World gán). */
  objCam: THREE.Object3D | null = null;

  // B2 — nhép miệng theo âm thật: biên độ mới nhất + hạn dùng của nó.
  private bienDoAm = 0;
  private hanBienDoAm = 0;
  /** Đếm bước để xen `ih`/`ou` cho miệng đỡ máy móc. */
  private nhipMieng = 0;

  constructor(id: string, ten: string, vrm: VRM, chibi = true) {
    this.id = id;
    this.ten = ten;
    this.vrm = vrm;
    this.goc = new THREE.Group();
    this.goc.name = `actor:${id}`;
    this.goc.add(vrm.scene);
    // B2 — để lớp tiếng tìm đúng người mà nhép miệng (xem `so-tieng.ts`).
    ghiMiengNhep(id, this);

    /**
     * VRM 0.x quay mặt ngược VRM 1.0 → bù 180° **trên `vrm.scene`**, tức là
     * node CON của `goc`. `VRMUtils.rotateVRM0` tự kiểm `metaVersion === '0'`
     * nên gọi thẳng cũng an toàn cho model VRM 1.0 (không làm gì).
     */
    this.vrm0 = (vrm.meta as { metaVersion?: string }).metaVersion === '0';
    VRMUtils.rotateVRM0(vrm);

    vrm.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = false;
        m.frustumCulled = false;
      }
    });

    if (vrm.lookAt) {
      vrm.lookAt.target = this.diemNhin;
      vrm.lookAt.autoUpdate = true;
    }
    this.dungBoXuong();
    this.datDangDung();
    if (chibi) this.apDungChibi();
    // Đo nửa bề dày đùi trên chính model (sau chibi scale): một nửa khoảng
    // cách ngang giữa hai xương upperLeg. Dùng để đặt ĐÁY MÔNG đúng mặt ghế.
    this.goc.updateMatrixWorld(true);
    const chanT0 = this.xuongThat('leftUpperLeg');
    const chanP0 = this.xuongThat('rightUpperLeg');
    if (chanT0 && chanP0) {
      const a = chanT0.getWorldPosition(new THREE.Vector3());
      const b = chanP0.getWorldPosition(new THREE.Vector3());
      this.dayDui = THREE.MathUtils.clamp(a.distanceTo(b) * 0.5, DAY_DUI_MIN, DAY_DUI_MAX);
    }
    // KHÔNG đo mốc chân ở đây: trước lượt `vrm.update()` đầu tiên, xương raw
    // còn ở tư thế BIND (đo thật: bàn chân y = 0,49 m). Mốc thật chốt ở khung
    // hình thứ 3 trong `capNhat` (`chotDeChan`).
  }

  /** `y` thấp nhất của bàn chân/ngón chân trên xương RAW (tư thế hiện tại). */
  private doChanThapNhat(): number {
    const ds: number[] = [];
    for (const t of ['leftFoot', 'rightFoot', 'leftToes', 'rightToes'] as const) {
      const b = this.xuongThat(t);
      if (b) ds.push(b.getWorldPosition(new THREE.Vector3()).y);
    }
    return ds.length ? Math.min(...ds) : NaN;
  }

  /**
   * Số đo TƯ THẾ THẬT (m, không gian) — đọc sau khi mixer đã cập nhật xương,
   * nên các số này đổi theo tư thế (khác hẳn hộp bao bind-pose, xem ghi chú
   * đầu file). `scripts/kiem-a2.mjs` và code đặt chiều cao khi ngồi dùng
   * CHUNG hàm này để không bao giờ đo hai đại lượng khác nhau.
   *
   * - `hipsY` — tâm xương `hips`
   * - `kneeY` — đầu gối thấp nhất (`leftLowerLeg` / `rightLowerLeg`)
   * - `footY` — điểm thấp nhất của bàn chân/ngón chân
   * - `minY` — đáy hộp bao **chính xác** (`setFromObject(root, true)`, có
   *   biến dạng xương); chỉ tính khi `chinhXac` vì phải quét toàn bộ đỉnh.
   */
  doTuThe(chinhXac = true): {
    hipsY: number;
    kneeY: number;
    footY: number;
    minY: number;
    hipsYChuan: number;
  } {
    this.goc.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    const y = (t: TenXuong): number => {
      const b = this.xuongThat(t);
      return b ? b.getWorldPosition(v).y : NaN;
    };
    const yChuan = (t: TenXuong): number => {
      const b = this.xuong(t);
      return b ? b.getWorldPosition(v).y : NaN;
    };
    const nhoNhat = (ds: number[]): number => {
      const co = ds.filter((n) => Number.isFinite(n));
      return co.length ? Math.min(...co) : NaN;
    };
    const hipsY = y('hips');
    const kneeY = nhoNhat([y('leftLowerLeg'), y('rightLowerLeg')]);
    const footY = this.doChanThapNhat();
    const minY = chinhXac ? new THREE.Box3().setFromObject(this.goc, true).min.y : NaN;
    const l = (n: number) => (Number.isFinite(n) ? +n.toFixed(4) : NaN);
    return {
      hipsY: l(hipsY),
      kneeY: l(kneeY),
      footY: l(footY),
      minY: l(minY),
      hipsYChuan: l(yChuan('hips')),
    };
  }

  static async nap(
    id: string,
    ten: string,
    duongDan: string,
    chibi = true,
  ): Promise<NhanVat> {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const [gltf, kho] = await Promise.all([loader.loadAsync(duongDan), napKho()]);
    const vrm = gltf.userData.vrm as VRM;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.combineMorphs(vrm);
    const nv = new NhanVat(id, ten, vrm, chibi);
    nv.ganKhoChuyenDong(kho);
    return nv;
  }

  /** Cắm bộ clip thật vào nhân vật (bake riêng cho bộ xương của model này). */
  ganKhoChuyenDong(kho: KhoChuyenDong | null): void {
    if (!kho) return;
    const clips = kho.taoCho(this.vrm);
    if (clips.size === 0) return;
    this.nen = new LopNen(this.vrm, clips);
    this.nen.dat('idle');
  }

  /** Có đang dùng clip chuyển động thật không (cho `stage.describe`/bằng chứng). */
  get dungClipThat(): boolean {
    return this.nen?.coClip === true;
  }

  get dangNen(): string | null {
    return this.nen?.dangDung ?? null;
  }

  /**
   * Dựng bộ xương + **đo hướng gốc của tay trên chính model** (không đoán
   * T-pose): xương normalized có rotation 0 nên `position` của xương con chính
   * là hướng của xương cha. Nhờ vậy model A-pose hay T-pose đều ra đúng.
   */
  private dungBoXuong(): void {
    const g = (t: TenXuong) => this.xuong(t);
    const tayT = g('leftUpperArm');
    const tayP = g('rightUpperArm');
    const canhT = g('leftLowerArm');
    const canhP = g('rightLowerArm');
    const banTayT = g('leftHand');
    const banTayP = g('rightHand');
    this.xuongBo = {
      spine: g('spine'),
      chest: g('chest') ?? g('upperChest'),
      neck: g('neck'),
      head: g('head'),
      chanT: g('leftUpperLeg'),
      chanP: g('rightUpperLeg'),
      ongT: g('leftLowerLeg'),
      ongP: g('rightLowerLeg'),
      canhT,
      canhP,
      tayT,
      tayP,
      banTayT,
      banTayP,
      gocTayT: doHuongGoc(tayT, canhT),
      gocTayP: doHuongGoc(tayP, canhP),
      gocCanhT: doHuongGoc(canhT, banTayT),
      gocCanhP: doHuongGoc(canhP, banTayP),
      goc: this.goc,
    };
  }

  private tyLeChest = 1;
  /** D1b — đếm khung hình đã vẽ (cân tầm vóc + spring bone ở khung thứ 3). */
  private khungDaVe = 0;
  /** Đã áp chibi hoá lên xương raw chưa (bằng chứng Issue #17). */
  private daChibi = false;
  /**
   * Nửa bề dày đùi (m) **đo trên xương RAW của chính model**: lấy một nửa
   * khoảng cách ngang giữa hai xương `upperLeg` — đúng cỡ bán kính đùi của
   * model đang được dựng hình, không phải hằng số đoán cho người lớn (và
   * không phải số của rig normalized, thứ không hề được dựng hình). Đây là khoảng cách từ tâm
   * xương `hips` xuống đáy mông/đùi, tức lượng phải cộng vào `seatY` để có
   * `hips` mục tiêu khi ngồi.
   */
  private dayDui = 0.09;
  /** Cao độ mặt ghế (m) của place đang ngồi — set bởi `ngoi(seatY)`, đọc trong `capNhat`. */
  private seatYHienTai = MAT_GHE_MAC_DINH;
  /**
   * Dáng nền NGUYÊN BẢN (chỉ mixer, chưa cộng lớp cử chỉ) của khung trước —
   * xem khối reset trong `capNhat` để biết vì sao phải giữ.
   */
  private readonly nenGoc = new Map<THREE.Object3D, THREE.Quaternion>();
  /** Lúc bắt đầu `ngoi()` (ms) và `goc.position.y` lúc đó. */
  private ngoiTu = 0;
  private ngoiGocY = 0;
  /**
   * Khoảng từ **xương bàn chân/ngón thấp nhất** xuống **đế giày** (m), đo MỘT
   * lần trên chính model ở tư thế đứng (xem `chotDeChan`). Cắm chân xuống sàn
   * là đặt `xương thấp nhất = MAT_SAN + deChan`, không phải kẹp `bbox.min.y`
   * (bài học A2 vòng 4: hộp bao của `SkinnedMesh` là tư thế BIND, không đổi
   * theo tư thế, kẹp theo nó là kẹp nhầm một hằng số).
   */
  private deChan = 0.03;
  /**
   * G1 vòng 3 (#56) — khoảng xương-bàn-chân → **đế giày ở TƯ THẾ HIỆN TẠI** (m).
   *
   * Khác `deChan` ở chỗ: `deChan` chốt một lần ở tư thế ĐỨNG, còn số này được
   * đo lại (quét đỉnh mesh quanh bàn chân) mỗi `CHU_KY_DO_DE` ms trong lúc tư
   * thế đang đổi — tức khi ngồi và khi chuyển ngồi/đứng. Đứng yên thì nó bằng
   * đúng `deChan`, không quét gì.
   */
  private deChanTuThe = 0.03;
  /**
   * Mây điểm vùng giày của từng xương bàn chân/ngón, ghi bằng toạ độ CỤC BỘ
   * trong hệ xương đó (xem `chotMocDe`). Rỗng = model không quét được đỉnh nào
   * (sân khấu giả trong test) → rơi về lối dự phòng.
   */
  private mocDe: Array<{ bone: THREE.Object3D; diem: Float32Array }> = [];
  /** Mốc đồng hồ thật của lần quét đế giày gần nhất (ms). */
  private tDoDe = 0;
  /**
   * Đếm số lần `springBoneManager.update()` bị gọi TỪ TRONG `vrm.update()` —
   * phải luôn là 0 (xem `capNhatVrmKhongSpring`). Khác 0 = `@pixiv/three-vrm`
   * đã đổi cách gọi spring, thứ tự một khung hình của ta sai mà không có
   * exception nào. Phơi ra `doXuong()` + báo lỗi console một lần.
   */
  private springTrongUpdate = 0;
  /** Đã báo lỗi "spring chạy trong vrm.update" chưa (báo một lần, không spam). */
  private daBaoSpring = false;
  /** Số bước spring của khung hình vừa rồi (bằng chứng nhịp cố định). */
  private soBuocSpringCuoi = 0;
  /** Mốc đồng hồ thật của khung hình trước (ms) — cho mixer chạy đúng tốc độ. */
  private tKhungTruoc = 0;
  /** Mốc đồng hồ của khung trước, dùng cho MỌI phần (kể cả spring) — xem `capNhat`. */
  private tDongHoTruoc = 0;
  /** Mốc đồng hồ thật của khung trước, riêng cho phần LÁI (xem `capNhat`). */
  private tLaiTruoc = 0;
  /* --- F2 (#56): số đo chẩn đoán của khung lái vừa rồi (xem `vanToc()`) --- */
  private chanLaiX = false;
  private chanLaiZ = false;
  private dtLaiCuoi = 0;
  /**
   * F2 — **sổ ghi TỪNG KHUNG của lượt lái đang chạy** (bằng chứng số).
   *
   * Vì sao phải ghi ở đây chứ không để script Playwright lấy mẫu: vòng dò đầu
   * tiên gọi `stage.describe()` + `doXuong()` mỗi khung và **chính nó** kéo
   * FPS từ 60 xuống 8,5 — tức dụng cụ đo làm hỏng cái cần đo, rồi lại kết luận
   * về độ mượt từ số liệu đó. Giờ sân khấu tự ghi (vài phép gán mỗi khung,
   * không cấp phát), script chỉ đọc MỘT lần ở cuối qua `doXuong()`.
   *
   * Sổ được xoá khi một lượt lái bắt đầu từ lúc đứng yên, nên mỗi lần Boss
   * nhấn phím là một lượt sạch.
   */
  private soLai: Array<[number, number, number, number, number, number, number]> = [];
  private apDungChibi(): void {
    const h = this.vrm.humanoid;
    if (!h) return;
    // 1. gom các xương RAW có trong model + tỉ lệ tuyệt đối mong muốn
    const dat = new Map<THREE.Object3D, number>();
    const ds: Array<{ node: THREE.Object3D; ty: number }> = [];
    for (const [ten, ty] of Object.entries(CHIBI_TUYET_DOI)) {
      const node = h.getRawBoneNode(ten as TenXuong);
      if (node && ty !== undefined) {
        dat.set(node, ty);
        ds.push({ node, ty });
      }
    }
    // 2. scale CỤC BỘ = tỉ lệ mong muốn ÷ tỉ lệ của tổ tiên gần nhất cũng được
    //    khai (xương raw là cây thật: scale cha nhân xuống con).
    for (const { node, ty } of ds) {
      let cha: THREE.Object3D | null = node.parent;
      let tyCha = 1;
      while (cha) {
        const t = dat.get(cha);
        if (t !== undefined) {
          tyCha = t;
          break;
        }
        cha = cha.parent;
      }
      node.scale.setScalar(tyCha > 0.0001 ? ty / tyCha : ty);
    }
    this.daChibi = true;
    // Tóc/váy chạy bằng spring bone: `VRMSpringBoneJoint` ghi lại độ dài đoạn
    // xương lúc khởi tạo. Scale xương SAU đó mà không khởi tạo lại thì độ dài
    // cũ không khớp hình học mới → tóc bung ra thành chùm gai quanh đầu (thấy
    // rõ trên ảnh thử 25/10 với head ×1,95). Khởi tạo lại trạng thái gốc ngay
    // sau khi scale là hết.
    this.goc.updateMatrixWorld(true);
    (this.vrm.springBoneManager as { setInitState?: () => void } | undefined)?.setInitState?.();
    // Lớp thở cộng thêm vào `chest` chạy trên rig NORMALIZED (xem `capNhat`),
    // nơi `scale` không được copy xuống xương raw → giữ 1, đừng nhân tỉ lệ
    // chibi vào đó nữa (vòng A2 nhân vào mà không có tác dụng gì).
    this.tyLeChest = 1;
  }

  /**
   * D1b (#48) — **cân đều hai nhân vật**. Kiểm độc lập: Javis 1,656 m còn Gen
   * 1,522 m, đứng cạnh nhau như hai bộ truyện khác nhau. `CHIBI_TUYET_DOI` là
   * tỉ lệ *nhân lên xương gốc*, mà hai model VRM gốc vốn khác tầm vóc, nên
   * cùng một bảng tỉ lệ vẫn ra hai dáng.
   *
   * **Đo bằng XƯƠNG, không bằng hộp bao.** `Box3.setFromObject` trên
   * `SkinnedMesh` trả hộp của **tư thế bind**, không phản ánh chút nào việc
   * đã scale xương — đo thật: Gen có hộp bao cao 1,74 m trong khi gốc xương
   * `head` chỉ ở 0,96 m. Thước đúng là khoảng cách **xương bàn chân → gốc xương
   * đầu**, thứ duy nhất đổi theo chibi hoá và không bị tóc/váy làm nhiễu.
   */
  private canDeuChibi(): void {
    const h = this.vrm.humanoid;
    if (!h) return;
    const yXuong = (ten: TenXuong) =>
      h.getRawBoneNode(ten)?.getWorldPosition(new THREE.Vector3()).y ?? NaN;
    this.goc.updateMatrixWorld(true);
    const yDau = yXuong('head');
    const yChan = Math.min(
      ...['leftFoot', 'rightFoot', 'leftToes', 'rightToes']
        .map((t) => yXuong(t as TenXuong))
        .filter((v) => Number.isFinite(v)),
    );
    if (!Number.isFinite(yDau) || !Number.isFinite(yChan)) return;
    const caoXuong = yDau - yChan;
    if (caoXuong < 0.3) return;
    this.goc.scale.multiplyScalar(THREE.MathUtils.clamp(CAO_XUONG_CHUAN / caoXuong, 0.6, 1.6));
    this.goc.updateMatrixWorld(true);
  }

  /**
   * C0 (#28) — bật/tắt dáng **lắng nghe**: gật đầu nhẹ, nghiêng đầu khi người
   * nói đang hỏi. Lớp vi mô (xem `capNhat`), **không chiếm thân** — nghe là
   * việc làm song song với mọi việc khác.
   */
  datNgheNgong(bat: boolean, cauHoi = false): void {
    this.ngheNgong = bat;
    this.ngheCauHoi = bat && cauHoi;
  }

  /** Số đo tỉ lệ chibi trên XƯƠNG RAW — bằng chứng Issue #17 đã sửa thật. */
  doChibi(): Record<string, number | boolean> {
    const h = this.vrm.humanoid;
    this.goc.updateMatrixWorld(true);
    const yThat = (ten: TenXuong) =>
      h?.getRawBoneNode(ten)?.getWorldPosition(new THREE.Vector3()).y ?? NaN;
    const hop = new THREE.Box3().setFromObject(this.goc, true);
    const cao = hop.max.y - hop.min.y;
    const dauCao = hop.max.y - yThat('neck');
    const yChan = Math.min(
      ...['leftFoot', 'rightFoot', 'leftToes', 'rightToes']
        .map((t) => yThat(t as TenXuong))
        .filter((v) => Number.isFinite(v)),
    );
    return {
      daChibi: this.daChibi,
      // D1b: thước THẬT (hộp bao `caoTong` bên dưới là tư thế BIND, chỉ giữ
      // lại cho các bằng chứng cũ so sánh được).
      caoXuong: +(yThat('head') - yChan).toFixed(4),
      rawHeadY: +yThat('head').toFixed(4),
      rawNeckY: +yThat('neck').toFixed(4),
      rawHipsY: +yThat('hips').toFixed(4),
      caoTong: +cao.toFixed(4),
      dauCao: +dauCao.toFixed(4),
      tyLeDauNguoi: +(cao / dauCao).toFixed(3),
    };
  }

  /* ------------------------------------------------- G1 (#60): số đo TÓC */

  /**
   * Mốc REST của tóc/váy: với mỗi khớp spring bone, khoảng cách từ khớp đó tới
   * gốc xương `head` (m) đúng lúc `setInitState()` được gọi.
   *
   * Vì sao đo bằng **khoảng cách tới đầu** chứ không bằng toạ độ thế giới:
   * nhân vật đi lại và quay người suốt, toạ độ thế giới đổi liên tục một cách
   * hợp lệ; còn "tóc bung" nghĩa là chùm tóc **rời xa đầu** so với lúc nằm im.
   * Đại lượng đó bất biến với dịch chuyển/quay, nên so sánh được giữa idle,
   * đi và emote mà không cần trừ đi chuyển động của thân.
   */
  private tocMoc = new Map<THREE.Object3D, number>();

  /** Hệ số đã thu gọn chuỗi tóc (1 = không đụng) — xem `thuGonToc`. */
  private tyThuToc = 1;
  /** Thông số spring sau khi cân lực (bằng chứng số, phơi qua `doToc`). */
  private soSpring: Record<string, number> | null = null;
  /** Giây (đồng hồ nhân vật) lúc đóng mốc spring, và đã đóng lại mốc tóc chưa. */
  private tChotSpring = 0;
  private daChotLaiToc = false;
  /**
   * Trần tốc độ hiển thị của từng xương tóc/vải: `gocToiDa` radian mỗi khung,
   * quy từ `DICH_TOC_MOI_KHUNG` theo độ dài đoạn xương. `qHamTruoc` giữ dáng
   * của khung trước (cùng thứ tự).
   */
  private khopHam: Array<{ bone: THREE.Object3D; gocToiDa: number }> = [];
  private qHamTruoc: THREE.Quaternion[] = [];
  /** Số xương bị trần tốc độ cắt ở khung vừa rồi (bằng chứng số). */
  private soHamCat = 0;

  /** Các khớp spring bone của model (tóc, váy, phụ kiện). */
  private khopSpring(): THREE.Object3D[] {
    const sb = this.vrm.springBoneManager as { joints?: Iterable<{ bone?: THREE.Object3D }> } | undefined;
    if (!sb?.joints) return [];
    const ra: THREE.Object3D[] = [];
    for (const k of sb.joints) if (k?.bone) ra.push(k.bone);
    return ra;
  }

  /** Khớp này có nằm dưới xương `head` không (tức là TÓC, không phải váy)? */
  private duoiDau(node: THREE.Object3D): boolean {
    const dau = this.vrm.humanoid?.getRawBoneNode('head');
    if (!dau) return false;
    for (let p: THREE.Object3D | null = node; p; p = p.parent) if (p === dau) return true;
    return false;
  }

  /**
   * ĐÓNG LẠI MỐC TÓC khi tóc đã ổn định — G1 vòng 3 (#56 — CHẶN 2).
   *
   * `chotMocToc()` chạy ở khung hình thứ 3, lúc tóc còn ở **dáng tác giả vẽ**
   * (cuộn sát đầu); phải vài giây sau trọng trường mới kéo nó về dáng cân
   * bằng thật — chính ghi chú trong `thuGonToc` đã nói thế. Nghĩa là thước
   * `lechToc` của vòng 2 đo "lệch so với một dáng mà tóc KHÔNG BAO GIỜ ở":
   * đứng yên, không cử động gì, nó đã báo 0,030–0,058 m. Mốc Boss là 0,07 m,
   * nên hơn hai phần ba hạn mức bị tiêu vào cái lệch thường trực đó, và con số
   * trong lúc emote không còn nói được "tóc có văng hay không".
   *
   * Đóng lại mốc một lần khi: đã qua `CHO_ON_TOC` giây kể từ lúc đóng mốc
   * spring, và nhân vật đang ĐỨNG YÊN (không clip, không đi, không lái, không
   * ngồi) — tức tóc đang ở dáng cân bằng thật. Từ đó `lechToc` đúng nghĩa
   * "tóc rời dáng nghỉ của nó bao nhiêu mét".
   */
  private chotLaiMocToc(): void {
    if (this.daChotLaiToc || this.tChotSpring === 0) return;
    if (this.t - this.tChotSpring < CHO_ON_TOC) return;
    if (this.clip || this.di || this.dangLai || this.dangNgoi || this.chuyenNgoi) return;
    this.daChotLaiToc = true;
    this.chotMocToc();
  }

  /** Đóng mốc rest cho tóc — gọi NGAY SAU `setInitState()` + `reset()`. */
  private chotMocToc(): void {
    const dau = this.vrm.humanoid?.getRawBoneNode('head');
    if (!dau) return;
    this.goc.updateMatrixWorld(true);
    const vDau = dau.getWorldPosition(new THREE.Vector3());
    this.tocMoc.clear();
    const v = new THREE.Vector3();
    for (const b of this.khopSpring()) this.tocMoc.set(b, b.getWorldPosition(v).distanceTo(vDau));
  }

  /**
   * G1 (#60) — bằng chứng số cho "tóc sao loạn quá".
   *
   * `lechToc` = lệch LỚN NHẤT (m) giữa khoảng cách khớp-tóc → đầu ở tư thế
   * hiện tại và khoảng cách đó lúc đóng mốc rest. Tóc chạy đúng thì nó chỉ
   * đung đưa vài cm; tóc bung thì chùm tóc dựng ra xa đầu hàng chục cm.
   */
  doToc(): Record<string, unknown> {
    const dau = this.vrm.humanoid?.getRawBoneNode('head');
    const khop = this.khopSpring();
    if (!dau || khop.length === 0) {
      return { soKhop: khop.length, coMoc: this.tocMoc.size, lechToc: 0, lechVay: 0 };
    }
    this.goc.updateMatrixWorld(true);
    const vDau = dau.getWorldPosition(new THREE.Vector3());
    const v = new THREE.Vector3();
    let lechToc = 0;
    let lechVay = 0;
    let soToc = 0;
    let xaNhat = 0;
    for (const b of khop) {
      const moc = this.tocMoc.get(b);
      if (moc === undefined) continue;
      const nay = b.getWorldPosition(v).distanceTo(vDau);
      const lech = Math.abs(nay - moc);
      if (this.duoiDau(b)) {
        soToc += 1;
        if (lech > lechToc) lechToc = lech;
        if (nay > xaNhat) xaNhat = nay;
      } else if (lech > lechVay) lechVay = lech;
    }
    return {
      soKhop: khop.length,
      soToc,
      coMoc: this.tocMoc.size,
      lechToc: +lechToc.toFixed(4),
      tyThuToc: +this.tyThuToc.toFixed(4),
      lechVay: +lechVay.toFixed(4),
      xaDauNhat: +xaNhat.toFixed(4),
      tyLeGoc: +this.goc.scale.x.toFixed(4),
      mocDaOnDinh: this.daChotLaiToc,
      soKhopHam: this.khopHam.length,
      soHamCat: this.soHamCat,
      spring: this.soSpring,
    };
  }

  /* ----------------------------------------------------------- đọc trạng thái */

  get state(): ActorState {
    return this.trangThai;
  }

  get busy(): boolean {
    return this.viec !== null;
  }

  get bieuCamHienTai(): string {
    return this.manhBieuCam > 0.05 ? this.bieuCam : 'neutral';
  }

  /** Hướng mặt theo độ: 0 = nhìn về +Z (hướng camera mặc định). */
  get facing(): number {
    const d = ((this.goc.rotation.y * 180) / Math.PI) % 360;
    return Math.round((d + 360) % 360);
  }

  get bieuCamCoSan(): string[] {
    const m = this.vrm.expressionManager;
    return m ? m.expressions.map((e) => e.expressionName) : [];
  }

  /** Vị trí đầu trong không gian (đặt bong bóng chữ). */
  viTriDau(ra: THREE.Vector3): THREE.Vector3 {
    const dau = this.xuong('head');
    if (dau) dau.getWorldPosition(ra);
    else ra.copy(this.goc.position).add(new THREE.Vector3(0, 1.3, 0));
    return ra;
  }

  /**
   * Số đo xương trong không gian — dùng cho **bằng chứng số** (kiểm chiều giơ
   * tay: `y` bàn tay phải cao hơn `y` vai khi emote giơ tay) và đo tỉ lệ chibi.
   */
  doXuong(): Record<string, unknown> & { bbox: number[] } {
    const ra: Record<string, [number, number, number]> = {};
    const lay = (nhan: string, t: TenXuong) => {
      const b = this.xuong(t);
      if (!b) return;
      const v = b.getWorldPosition(new THREE.Vector3());
      ra[nhan] = [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)];
    };
    this.goc.updateMatrixWorld(true);
    lay('hips', 'hips');
    lay('neck', 'neck');
    lay('head', 'head');
    lay('vaiTrai', 'leftShoulder');
    lay('vaiPhai', 'rightShoulder');
    lay('tayTrenTrai', 'leftUpperArm');
    lay('tayTrenPhai', 'rightUpperArm');
    lay('banTayTrai', 'leftHand');
    lay('banTayPhai', 'rightHand');
    lay('chanTrai', 'leftFoot');
    lay('duiTrai', 'leftUpperLeg');
    lay('duiPhai', 'rightUpperLeg');
    lay('ongTrai', 'leftLowerLeg');
    lay('ongPhai', 'rightLowerLeg');
    lay('chanPhai', 'rightFoot');
    lay('ngonTrai', 'leftToes');
    lay('ngonPhai', 'rightToes');
    // `bbox` = hộp bao KHÔNG precise: nở theo `geometry.boundingBox` của
    // `SkinnedMesh`, tức BIND-POSE — chỉ dùng cho chiều cao/tỉ lệ chibi lúc
    // ĐỨNG, KHÔNG phản ánh tư thế (xem ghi chú đầu file). Số đo theo tư thế
    // thật nằm trong `tuThe` (`doTuThe()`), kể cả `minY` hộp bao chính xác.
    const b = new THREE.Box3().setFromObject(this.goc);
    return Object.assign(ra, {
      bbox: [b.min.y, b.max.y, b.min.x, b.max.x].map((v) => +v.toFixed(4)),
      tuThe: this.doTuThe(),
      vanToc: this.vanToc(),
      chibi: this.doChibi(),
      state: this.state,
      // C0 (#28) — bằng chứng "không đi ngược": `huongGoc` là hướng sân khấu
      // nghĩ nhân vật đang quay về (từ `facing`), `huongMat` là hướng MESH
      // thật sự quay về (lấy từ xương `hips` RAW, tức sau mọi bù trừ VRM0).
      // Hai vector này phải cùng chiều (tích vô hướng ≈ +1).
      vrm0: this.vrm0,
      huongGoc: this.huongGoc(),
      huongMat: this.huongMat(),
      gocY: +this.goc.position.y.toFixed(4),
      // G1 (#56) — cao độ MẶT ĐẾ GIÀY (m): thước thật của "chân chạm sàn".
      // `tuThe.minY` KHÔNG dùng được cho việc này ở model tóc dài (đuôi tóc
      // thấp hơn gót chân) — xem `chotDeChan()`.
      deChan: +this.deChan.toFixed(4),
      // vòng 3: mốc đế THEO TƯ THẾ hiện tại (đứng = `deChan`, ngồi = đo lại)
      deChanTuThe: +this.deChanTuThe.toFixed(4),
      // cao độ MẶT ĐẾ suy từ mốc trong hệ xương (null = model không có mốc)
      deGiayMoc: Number.isFinite(this.deGiayTheoMoc())
        ? +this.deGiayTheoMoc().toFixed(4)
        : null,
      soMocDe: this.mocDe.length,
      deGiayY: +(this.doChanThapNhat() - this.deChanTuThe).toFixed(4),
      /*
       * `deGiayQuet` — đế giày đo THUẦN HÌNH HỌC (quét đỉnh mesh quanh bàn
       * chân, không trừ hằng số nào). Chỉ tính khi tư thế đang đổi (ngồi /
       * chuyển ngồi-đứng), vì ở đó mới có chuyện mốc tư thế đứng sai; đứng/đi
       * /emote thì `null` để không cho dụng cụ đo làm hỏng cái cần đo (bài học
       * F2: gọi quét mỗi khung kéo FPS 60 → 8,5 rồi kết luận về độ mượt).
       */
      deGiayQuet:
        this.dangNgoi || this.chuyenNgoi ? +this.quetDayGiay().toFixed(4) : null,
      springTrongUpdate: this.springTrongUpdate,
      soBuocSpring: this.soBuocSpringCuoi,
      toc: this.doToc(),
      seatY: +this.seatYHienTai.toFixed(4),
      dayDui: +this.dayDui.toFixed(4),
      dangNgoiCo: this.dangNgoi,
      nenChanDoan: this.nen?.chanDoan() ?? null,
    });
  }

  /** Hướng sân khấu **nghĩ** nhân vật đang quay về (suy từ `goc.rotation.y`). */
  huongGoc(): [number, number] {
    const y = this.goc.rotation.y;
    return [+Math.sin(y).toFixed(4), +Math.cos(y).toFixed(4)];
  }

  /**
   * Hướng MẶT thật của model trong thế giới.
   *
   * Không đo bằng xương (`hips` của nhiều model VRM 0.x có sẵn 180° nướng vào
   * bind-pose, đo ra số nói dối). Đo bằng **`vrm.lookAt.faceFront`** — vector
   * do chính `@pixiv/three-vrm` đặt khi nạp file: `(0,0,+1)` cho VRM 1.0 và
   * `(0,0,-1)` cho VRM 0.x — rồi quay nó bằng ma trận thế giới của `vrm.scene`.
   *
   * Nhờ vậy số này bắt đúng lỗi Boss thấy ở C0: ai đó ghi đè
   * `vrm.scene.rotation.y` (xoá phần bù VRM0) là `huongMat` lật 180° so với
   * `huongGoc` ngay, dù xương vẫn y nguyên.
   */
  huongMat(): [number, number] {
    this.goc.updateMatrixWorld(true);
    const truoc = this.vrm.lookAt?.faceFront ?? new THREE.Vector3(0, 0, 1);
    const q = this.vrm.scene.getWorldQuaternion(new THREE.Quaternion());
    const v = truoc.clone().applyQuaternion(q).setY(0);
    if (v.lengthSq() < 1e-6) return this.huongGoc();
    v.normalize();
    return [+v.x.toFixed(4), +v.z.toFixed(4)];
  }

  /* ------------------------------------------------------------- hành động */

  private batDauViec(hd: HanhDongCoTay, trangThai: ActorState): void {
    this.viec = hd;
    this.trangThai = trangThai;
  }

  private traViec(hd: HanhDongCoTay): void {
    if (this.viec !== hd) return;
    this.viec = null;
    this.trangThai = this.dangNgoi ? 'sitting' : 'idle';
  }

  private huyViec(): void {
    const cu = this.viec;
    if (!cu) return;
    cu.cancel();
    if (this.viec === cu) {
      this.viec = null;
      this.trangThai = this.dangNgoi ? 'sitting' : 'idle';
    }
  }

  /**
   * Rời ghế. Không ghi mốc độ cao nào nữa: từ G1 (#56), hễ không ngồi thì mỗi
   * khung hình `camChanXuongSan()` tự đưa đế giày về mặt sàn, nên suốt clip
   * `Sitting_Exit` nhân vật đứng lên mà chân không rời sàn một phân.
   */
  private roiGhe(): void {
    this.dangNgoi = false;
  }

  /** Đi tới một điểm trên sàn. Tới nơi đúng `durationMs` đã hứa. */
  diToi(v: THREE.Vector3, speed?: number): Action {
    this.huyViec();
    this.roiGhe();

    const tu = new THREE.Vector3(this.goc.position.x, 0, this.goc.position.z);
    const den = new THREE.Vector3(v.x, 0, v.z);
    const kc = tu.distanceTo(den);
    if (kc < 0.04) return hanhDongXongNgay(0);

    const tocDo = speed && speed > 0 ? speed : TOC_DO_DI;
    const dai = (kc / tocDo) * 1000;
    let hd!: HanhDongCoTay;
    hd = hanhDong(dai, () => {
      this.di = null;
      this.phaBuoc = 0;
      this.traViec(hd);
    });
    this.di = { tu, den, batDau: bayGio(), dai, hd, tocDo };
    this.batDauViec(hd, 'walking');
    return hd;
  }

  /**
   * **Lái bằng vận tốc** (`actor.steer`) — Issue #18 mục 2.
   *
   * Khác `diToi` ở bản chất: `diToi` biết trước đích nên hứa được `durationMs`
   * và nội suy theo đồng hồ; `lai` không biết Boss sẽ giữ phím bao lâu, nên
   * mỗi khung hình chỉ cộng `v·dt` và **lời hứa duy nhất là `ms`**.
   *
   * Quy tắc (chốt ở B1, ghi trong spec):
   *   · Lệnh mới **thay** lệnh cũ, KHÔNG xếp hàng: `actor.steer` cố tình không
   *     khai `chiemActor` trong registry nên dispatcher không bao giờ xếp nó
   *     vào hàng đợi. Việc "chiếm thân" do chính `NhanVat.viec` giữ (nguồn sự
   *     thật của `state` theo CLAUDE.md), và mỗi lần lái có token riêng.
   *   · Vận tốc kẹp `TOC_DO_STEER` (1,6 m/s), bám tới vận tốc yêu cầu trong
   *     `LERP_VAN_TOC` (0,15 s) nên vào/ra đều mượt.
   *   · Hết `ms` thì lệnh hết hiệu lực nhưng thân vẫn **giảm tốc tiếp** cho
   *     tới khi dừng; `state` còn là `walking` suốt lúc đó (đúng nghĩa "đang
   *     đi"), chỉ về `idle` khi |v| đã về 0. `done` vẫn resolve đúng `ms` để
   *     dispatcher không bị giữ.
   */
  lai(vx: number, vz: number, ms: number): Action {
    const toc = Math.hypot(vx, vz);
    let mx = vx;
    let mz = vz;
    if (toc > TOC_DO_STEER) {
      mx = (vx / toc) * TOC_DO_STEER;
      mz = (vz / toc) * TOC_DO_STEER;
    }
    const dai = Math.max(0, ms);

    /**
     * F2 (#56 mục 2) — **GIA HẠN TẠI CHỖ khi vector không đổi.**
     *
     * Đây là gốc chính của "điều khiển loạn tùm lum" trên GPU thật. Bản B1
     * gửi một `actor.steer` mới mỗi 100 ms, và *mỗi* lệnh mới chạy trọn bộ
     * `huyViec()` + `roiGhe()` + `clip = null` + `batDauViec()`. Ở ~1 FPS
     * (máy kiểm) cả chục lệnh rơi vào **cùng một khung hình** nên chỉ lệnh
     * cuối để lại dấu — bằng chứng cũ sạch sẽ. Ở 60 FPS thì cứ 6 khung lại có
     * một cú xé-dựng-lại hành động: `viec` nhả rồi chiếm lại, `state` nhảy
     * `walking → idle → walking`, lớp clip bị xoá, và `han` cũ (180 ms) có lúc
     * hết trước khi lệnh sau kịp tới → vận tốc mục tiêu tụt về 0 rồi vọt lại.
     *
     * Sửa tận gốc: cùng một vector thì KHÔNG tạo lệnh mới — chỉ **đẩy `han`**
     * của lần lái đang chạy ra xa và trả lại đúng hành động đó. Phím chỉ còn
     * phải gia hạn (`src/ui/phim.ts`), không còn phải gối lệnh.
     */
    const L = this.dangLai;
    if (
      L &&
      this.viec === L.hd &&
      Math.abs(L.vxMuc - mx) < 1e-6 &&
      Math.abs(L.vzMuc - mz) < 1e-6
    ) {
      L.han = bayGio() + dai;
      L.hd.giaHan(dai);
      return L.hd;
    }

    // giữ vận tốc đang có khi THAY steer (xem `dangThaySteer`)
    this.dangThaySteer = true;
    this.huyViec();
    this.dangThaySteer = false;
    this.roiGhe();
    this.clip = null;
    this.xoay?.hd.cancel();
    this.xoay = null;

    const token = ++this.demTokenLai;
    const hd = henGioLai(dai, (biHuy) => {
      // Hết giờ bình thường: KHÔNG xoá `lai` — để `capNhat` giảm tốc về 0 rồi
      // mới nhả thân. Bị cắt: dừng ngay, nhường thân cho lệnh mới.
      if (!biHuy) return;
      if (this.dangLai?.token !== token) return;
      this.dangLai = null;
      if (!this.dangThaySteer) {
        this.vx = 0;
        this.vz = 0;
      }
    });
    // F2 — lượt lái mới bắt đầu từ lúc ĐỨNG YÊN → sổ bằng chứng sạch
    if (this.vx === 0 && this.vz === 0) this.soLai = [];
    this.dangLai = { vxMuc: mx, vzMuc: mz, han: bayGio() + dai, hd, token };
    this.batDauViec(hd, 'walking');
    return hd;
  }

  /** Vận tốc hiện tại (m/s) + tốc độ — bằng chứng số cho `kiem-b1.mjs`. */
  vanToc(): {
    vx: number;
    vz: number;
    toc: number;
    x: number;
    z: number;
    facing: number;
    chanX: boolean;
    chanZ: boolean;
    dt: number;
    lai: boolean;
    /**
     * Sổ từng khung của lượt lái hiện tại:
     * `[t ms, dt s, x, z, |v|, facing rad, chặn]` — `chặn` là cờ bit
     * (1 = trục X bị vật cản, 2 = trục Z). Xem `NhanVat.soLai`.
     */
    so: Array<[number, number, number, number, number, number, number]>;
  } {
    return {
      vx: +this.vx.toFixed(4),
      vz: +this.vz.toFixed(4),
      toc: +Math.hypot(this.vx, this.vz).toFixed(4),
      /**
       * F2 — toạ độ **KHÔNG làm tròn 2 số** như `stage.describe().pos`.
       * Vòng dò đầu tiên trên Firefox GPU thật suýt kết luận sai vì `pos` của
       * `describe` chỉ có 2 chữ số thập phân: 0,02 m/khung ở 60 FPS lọt hết
       * vào chữ số bị cắt, nên "đi rất chậm" và "đứng im" trông y như nhau.
       */
      x: +this.goc.position.x.toFixed(4),
      z: +this.goc.position.z.toFixed(4),
      facing: +this.goc.rotation.y.toFixed(4),
      chanX: this.chanLaiX,
      chanZ: this.chanLaiZ,
      dt: +this.dtLaiCuoi.toFixed(4),
      lai: this.dangLai !== null,
      so: this.soLai,
    };
  }

  /** Xoay người về một hướng (độ) hoặc một điểm. */
  xoayVe(muc: THREE.Vector3 | number, chiemThan = true): Action {
    const goc =
      typeof muc === 'number'
        ? (muc * Math.PI) / 180
        : Math.atan2(muc.x - this.goc.position.x, muc.z - this.goc.position.z);

    /**
     * C0 (#28) — **đang quay về gần đúng chỗ đó rồi thì đừng khởi động lại.**
     *
     * `actor.faceTo` được gọi MỖI NHỊP để giữ mặt về người nghe. Nếu mỗi lần
     * gọi đều huỷ cú quay cũ rồi bắt đầu lại từ đầu thì đường nội suy (ease
     * in-out) cứ về mốc 0 liên tục — nhân vật nhích vài độ rồi đứng im mãi,
     * thấy rất rõ trên máy kiểm ~1 fps. Chỉ quay lại khi MỤC TIÊU đổi thật.
     */
    if (!chiemThan && this.xoay && !this.xoay.chiemThan) {
      let dLech = goc - this.xoay.den;
      while (dLech > Math.PI) dLech -= Math.PI * 2;
      while (dLech < -Math.PI) dLech += Math.PI * 2;
      if (Math.abs(dLech) < 0.12) return this.xoay.hd;
    }

    if (chiemThan) this.huyViec();
    this.xoay?.hd.cancel();

    let lech = goc - this.goc.rotation.y;
    while (lech > Math.PI) lech -= Math.PI * 2;
    while (lech < -Math.PI) lech += Math.PI * 2;
    if (Math.abs(lech) < 0.02) return hanhDongXongNgay(0);

    const dai = Math.abs(lech) * 420 + 120;
    let hd!: HanhDongCoTay;
    hd = hanhDong(dai, () => {
      this.xoay = null;
      if (chiemThan) this.traViec(hd);
    });
    this.xoay = {
      tu: this.goc.rotation.y,
      den: this.goc.rotation.y + lech,
      batDau: bayGio(),
      dai,
      hd,
      chiemThan,
    };
    if (chiemThan) this.batDauViec(hd, 'playing');
    return hd;
  }

  /** Chơi một clip. `loop` thì `done` chỉ xong khi bị cắt. */
  choiClip(ten: string, loop = false, speed = 1): Action {
    const tocDo = Math.max(0.1, speed);
    const dai = (DAI_CLIP[ten] ?? 1500) / tocDo;

    if (ten === 'idle') {
      this.huyViec();
      this.clip = null;
      this.roiGhe();
      return hanhDongXongNgay(DAI_CLIP.idle);
    }
    if (ten === 'sit') return this.ngoi();
    if (ten === 'stand') return this.dungLen();

    this.huyViec();
    if (loop) {
      let hd!: HanhDongCoTay;
      hd = hanhDong(0, () => {
        if (this.clip?.hd === hd) this.clip = null;
        this.traViec(hd);
      });
      this.clip = { ten, batDau: bayGio(), dai, loop: true, hd, tocDo };
      this.batDauViec(hd, 'playing');
      return hd;
    }
    // hẹn giờ thật: `durationMs` đúng kể cả khi tụt khung hình
    let hd!: HanhDongCoCo;
    hd = henGioCoCo(dai, () => {
      if (this.clip?.hd === hd) this.clip = null;
      this.traViec(hd);
    });
    this.clip = { ten, batDau: bayGio(), dai, loop: false, hd, tocDo };
    this.batDauViec(hd, 'playing');
    return hd;
  }

  /** Đổi dáng đứng chờ (`actor.idleStyle`) — chỉ đổi hệ số, không chiếm thân. */
  datIdleStyle(kieu: string): void {
    if (!(IDLE_STYLES as readonly string[]).includes(kieu)) {
      throw new Error(`Không có idleStyle "${kieu}". Đang có: ${IDLE_STYLES.join(', ')}`);
    }
    this.idleKieu = kieu as IdleStyle;
  }

  /** Clip thô theo tên tự do (emote dùng) — kết thúc bằng hẹn giờ huỷ được. */
  private chayClipTho(ten: string, dai: number, manh = 1): HanhDongCoCo {
    this.huyViec();
    let hd!: HanhDongCoCo;
    hd = henGioCoCo(dai, () => {
      if (this.clip?.hd === hd) this.clip = null;
      this.traViec(hd);
    });
    this.clip = { ten, batDau: bayGio(), dai, loop: false, hd, manh };
    this.batDauViec(hd, 'emoting');
    return hd;
  }

  /**
   * Cảm xúc trọn gói (spec mục 3.2b): mặt + chuyển động cơ thể + âm ngắn +
   * (tuỳ chọn) nói — một lệnh.
   *
   * Bị cắt giữa chừng thì **không** dừng giọng của emote mới, **không** ghi
   * `mood`, và `actor.emote` bắn `actor.emoteCancelled` chứ không phải
   * `actor.emoteDone` (review PR #10 mục 1.3).
   */
  chayEmote(ten: string, intensity = 1, say?: string): Action {
    const dn = DINH_NGHIA_EMOTE[ten];
    if (!dn) throw new Error(`Không có emote "${ten}"`);
    const manh = THREE.MathUtils.clamp(intensity, 0, 1);
    const daiNoi = say ? uocThoiLuongNoi(say) : 0;
    const dai = Math.max(dn.durationMs, daiNoi);

    this.datBieuCam(dn.expression, dn.weightMat * (0.4 + manh * 0.6), dai + 350);
    phatAmNgan(dn.am, manh);

    if (say) {
      this.hdBong?.cancel();
      this.bongBong = say;
      this.hanBongBong = this.t + dai / 1000;
      this.noiConLai = dai / 1000;
      this.noiBatDau = this.t;
      this.nhomNoi = nhomNoiTuCamXuc(ten);
      doc(say);
    }

    const hd = this.chayClipTho(`emote:${ten}`, dai, manh);
    void hd.done.then(() => {
      if (hd.cancelled()) return;
      if (say) dungDoc();
      const moodMoi = MOOD_TU_EMOTE[ten];
      if (moodMoi) {
        this.mood = moodMoi;
        this.hanMood = this.t + 10 + Math.random() * 4;
      }
    });
    return hd;
  }

  /** `seatY` = cao độ mặt ghế (m) của place đang ngồi — xem `DinhNghiaPlace.seatY`. */
  ngoi(seatY = MAT_GHE_MAC_DINH): Action {
    this.huyViec();
    this.dangNgoi = true;
    this.seatYHienTai = seatY;
    this.chuyenNgoi = 'sit';
    // Mốc để hạ người + gập chân theo ĐỒNG HỒ THẬT, không theo số khung hình:
    // máy kiểm (swiftshader, không GPU) chỉ chạy ~1 fps nên lerp kiểu
    // `dt * k` mất hơn 10 s mới hội tụ — đúng lý do các vòng trước đo lúc tư
    // thế còn đang chạy dở.
    this.ngoiTu = bayGio();
    this.ngoiGocY = this.goc.position.y;
    let hd!: HanhDongCoTay;
    hd = hanhDongHenGio(DAI_CLIP.sit!, (biHuy) => {
      if (biHuy) this.roiGhe();
      if (this.chuyenNgoi === 'sit') this.chuyenNgoi = null;
      this.traViec(hd);
    });
    this.batDauViec(hd, 'playing');
    return hd;
  }

  /**
   * **Tư thế ngồi hình học** — chạy mỗi khung hình trong lúc ngồi, NGAY SAU
   * khi mixer đã ghi dáng nền (clip ngồi thật `Sitting_Enter` /
   * `Sitting_Idle_Loop` của bộ Quaternius CC0), và đo bằng **xương raw** (xem
   * `xuongThat`). Hai việc, theo đúng thứ tự:
   *
   *  1. `datChieuCaoNgoi` — dịch gốc nhân vật sao cho **đáy mông/đùi chạm mặt
   *     ghế**: `hips` cao hơn `seatY` đúng `dayDui`.
   *  2. `gapChanNgoi` — chỉnh 3 xương chân (đùi → cẳng chân → bàn chân) để
   *     **đầu gối nằm trên mặt ghế** (`seatY + LE_DAU_GOI`), **cẳng chân rủ
   *     thẳng xuống** trước mép ghế và **bàn chân phẳng**. Clip ngồi của bộ
   *     CC0 diễn đúng dáng ngồi nhưng không biết ghế của cảnh này cao bao
   *     nhiêu, nên hình học vẫn phải chỉnh theo `seatY` thật.
   *
   * Bàn chân **lơ lửng trên sàn là chấp nhận được** và được ghi rõ: kéo người
   * lên cho bàn chân chạm sàn thì mông rời mặt ghế — tức lặp lại đúng lỗi 4
   * vòng trước. Ở cảnh này ghế cao 0,497 m trong khi cẳng chân + bàn chân của
   * model chỉ dài ~0,44 m, nên với đầu gối đặt trên mặt ghế thì đế giày còn
   * cách sàn ~9 cm. Ngược lại, ghế THẤP hơn cẳng chân thì `gapChanNgoi` tự
   * nâng đầu gối lên để bàn chân không chui xuống dưới sàn
   * (`NGUONG_SAN_NGOI`).
   *
   * KHÔNG còn kẹp-vạn-năng `bbox.min.y ≥ −0,01` của vòng 4: kẹp đó đo hộp bao
   * **bind-pose** nên chỉ ép `goc.position.y ≈ 0`, vô hiệu hoá toàn bộ công
   * thức `seatY` (review PR #10 vòng 4 mục 2).
   */
  private datTuTheNgoi(): void {
    const u = muot(
      THREE.MathUtils.clamp((bayGio() - this.ngoiTu) / (DAI_CLIP.sit ?? 1200), 0, 1),
    );
    // Giải lặp 3 vòng trong CÙNG một khung hình: `humanoid.update()` mới đẩy
    // dáng normalized sang xương raw, mà phép đo phải lấy trên xương raw.
    for (let i = 0; i < 3; i++) {
      this.vrm.humanoid?.update();
      this.goc.updateMatrixWorld(true);
      this.datChieuCaoNgoi(u);
      this.gapChanNgoi(u);
    }
  }

  /** Dịch gốc để đáy mông/đùi chạm mặt ghế. `u` = độ hoàn tất chuyển sang ngồi. */
  private datChieuCaoNgoi(u: number): void {
    const hips = this.xuongThat('hips');
    if (!hips) return;
    const hipsY = hips.getWorldPosition(new THREE.Vector3()).y;
    const dich = this.goc.position.y + (this.seatYHienTai + this.dayDui - hipsY);
    this.goc.position.y = THREE.MathUtils.lerp(this.ngoiGocY, dich, u);
    this.goc.updateMatrixWorld(true);
  }

  /**
   * Gập chân cho đúng tư thế ngồi trên mặt ghế cao `seatY`.
   *
   * Cách làm không phụ thuộc quy ước trục (các vòng trước đoán dấu góc rồi
   * gập chân ra SAU): đo hướng thật của xương trong **không gian** rồi quay
   * nó tối thiểu sang hướng mong muốn (`Quaternion.setFromUnitVectors`), nên
   * không cần biết `rotation.x` dương là ra trước hay ra sau.
   */
  private gapChanNgoi(u: number): void {
    const truocNguoi = this.goc.getWorldDirection(new THREE.Vector3()).setY(0);
    if (truocNguoi.lengthSq() < 1e-8) return;
    truocNguoi.normalize();
    const phai = new THREE.Vector3().crossVectors(LEN, truocNguoi).normalize();
    for (const ben of ['left', 'right'] as const) {
      const dui = this.xuongThat(`${ben}UpperLeg`);
      const ong = this.xuongThat(`${ben}LowerLeg`);
      const chan = this.xuongThat(`${ben}Foot`);
      const ngon = this.xuongThat(`${ben}Toes`);
      if (!dui || !ong) continue;

      // 1) đùi: đầu gối lên đúng cao độ trên mặt ghế, giữ nguyên độ xoè ngang
      const pDui = dui.getWorldPosition(new THREE.Vector3());
      const pOng = ong.getWorldPosition(new THREE.Vector3());
      // Ghế THẤP hơn chiều dài cẳng chân thì nâng đầu gối lên cho bàn chân
      // không chui xuống dưới sàn — đùi khi đó hơi chếch lên, vẫn đúng dáng
      // ngồi. Ghế cao hơn (cảnh này) thì bàn chân lơ lửng, chấp nhận được.
      const daiOng = chan ? chan.getWorldPosition(new THREE.Vector3()).distanceTo(pOng) : 0;
      // G1 (#56): sàn thật của bàn chân là `MAT_SAN + deChanTuThe` (đế giày),
      // không phải y = 0 của xương — ghế thấp thì bàn chân đặt ĐÚNG mặt sàn
      // thay vì lún xuống. `NGUONG_SAN_NGOI` giữ lại làm lề âm 1 cm cho ghế
      // vừa sát.
      //
      // Vòng 3 (#56, review 26/10 — CHẶN 1): phải là `deChanTuThe` (đo lại
      // theo tư thế NGỒI), không phải `deChan` (hằng số tư thế ĐỨNG). Dùng
      // hằng số đứng 0,033 trong khi đế giày khi ngồi nằm 0,093 dưới xương
      // bàn chân ⇒ cả đôi giày lún 5,7 cm dưới ván sàn, mà thước `deGiayY`
      // cũng trừ đúng hằng số đó nên báo "đạt 2,2 mm".
      const sanChan = MAT_SAN + this.deChanTuThe + NGUONG_SAN_NGOI;
      const dauGoiY = Math.max(this.seatYHienTai + LE_DAU_GOI, daiOng + sanChan);
      this.quayXuongToi(`${ben}UpperLeg`, pOng.clone().sub(pDui), dauGoiY - pDui.y, truocNguoi, phai, u);

      // 2) cẳng chân: rủ THẲNG XUỐNG trước mép ghế
      this.vrm.humanoid?.update();
      this.goc.updateMatrixWorld(true);
      if (chan) {
        const p1 = ong.getWorldPosition(new THREE.Vector3());
        const p2 = chan.getWorldPosition(new THREE.Vector3());
        const v = p2.clone().sub(p1);
        this.quayXuongToi(`${ben}LowerLeg`, v, -v.length(), truocNguoi, phai, u);
      }

      // 3) bàn chân: phẳng, mũi hướng ra trước
      this.vrm.humanoid?.update();
      this.goc.updateMatrixWorld(true);
      if (chan && ngon) {
        const p1 = chan.getWorldPosition(new THREE.Vector3());
        const p2 = ngon.getWorldPosition(new THREE.Vector3());
        this.quayXuongToi(`${ben}Foot`, p2.clone().sub(p1), 0, truocNguoi, phai, u);
      }
    }
  }

  /**
   * Quay xương `ten` sao cho hướng tới xương con (`v`, đo trên xương RAW
   * trong không gian) có thành phần dọc đúng `yMuc`, giữ nguyên độ dài và
   * thành phần ngang sang hai bên, phần còn lại đẩy RA TRƯỚC mặt nhân vật.
   *
   * Phép quay là một quay **thế giới** nên áp được lên xương *normalized*
   * (chỗ duy nhất ghi được tư thế): rig normalized của three-vrm trùng hệ
   * trục thế giới, quay nó bao nhiêu thì xương raw quay đúng bấy nhiêu.
   * `u` = trọng số hoà vào (0 = y nguyên dáng clip, 1 = đúng hình học).
   */
  private quayXuongToi(
    ten: TenXuong,
    v: THREE.Vector3,
    yMuc: number,
    truoc: THREE.Vector3,
    phai: THREE.Vector3,
    u: number,
  ): void {
    const b = this.xuong(ten);
    const dai = v.length();
    if (!b || dai < 1e-4) return;
    const ngang = THREE.MathUtils.clamp(v.dot(phai), -dai * 0.9, dai * 0.9);
    const y = THREE.MathUtils.clamp(yMuc, -dai * 0.99, dai * 0.99);
    const raTruoc = Math.sqrt(Math.max(0, dai * dai - y * y - ngang * ngang));
    const moi = new THREE.Vector3()
      .addScaledVector(phai, ngang)
      .addScaledVector(truoc, raTruoc)
      .addScaledVector(LEN, y);
    if (moi.lengthSq() < 1e-8) return;
    const q = new THREE.Quaternion().setFromUnitVectors(v.clone().normalize(), moi.normalize());
    if (u < 1) q.slerpQuaternions(KHONG_QUAY, q, u);
    const qw = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(q);
    const qCha = b.parent
      ? b.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
      : new THREE.Quaternion();
    b.quaternion.copy(qCha.multiply(qw));
    b.updateMatrixWorld(true);
  }

  dungLen(): Action {
    this.huyViec();
    if (!this.dangNgoi) return hanhDongXongNgay(0);
    this.roiGhe();
    this.chuyenNgoi = 'stand';
    let hd!: HanhDongCoTay;
    hd = hanhDongHenGio(DAI_CLIP.stand!, () => {
      if (this.chuyenNgoi === 'stand') this.chuyenNgoi = null;
      this.traViec(hd);
    });
    this.batDauViec(hd, 'playing');
    return hd;
  }

  datBieuCam(ten: string, manh = 1, durationMs?: number): void {
    this.bieuCam = (BIEU_CAM as readonly string[]).includes(ten) ? ten : 'neutral';
    this.manhBieuCam = THREE.MathUtils.clamp(manh, 0, 1);
    this.hanBieuCam = durationMs && durationMs > 0 ? this.t + durationMs / 1000 : Infinity;
  }

  /** Hiện bong bóng chữ. */
  hienBongBong(chu: string, durationMs?: number): Action {
    this.hdBong?.cancel();
    const ms = durationMs && durationMs > 0 ? durationMs : uocThoiLuongNoi(chu);
    this.bongBong = chu;
    this.hanBongBong = this.t + ms / 1000;
    const hd = hanhDongHenGio(ms, () => {
      if (this.bongBong === chu) this.bongBong = null;
    });
    this.hdBong = hd;
    return hd;
  }

  /**
   * **B2 — nhép miệng theo biên độ âm THẬT** (`rms` 0–1), do
   * `src/audio/tts-client.ts` gọi mỗi 50 ms trong lúc phát mp3.
   *
   * Hàm này KHÔNG thay nhép miệng cũ: nó chỉ đặt biên độ kèm **hạn dùng**
   * 0,25 s. Còn mẫu mới thì miệng chạy theo âm; hết mẫu (câu xong, hoặc không
   * có bridge) thì `capNhat` tự quay về nhép theo độ dài chữ như A1.
   *
   * `rms = 0` là tín hiệu "thôi, trả miệng về mặc định".
   */
  nhepMiengTheoBienDo(rms: number): void {
    const v = Number.isFinite(rms) ? THREE.MathUtils.clamp(rms, 0, 1) : 0;
    this.bienDoAm = v;
    // 0,25 s = 5 nhịp lấy mẫu: trễ một hai nhịp thì miệng vẫn mượt, nhưng
    // tiếng tắt giữa câu là miệng đóng ngay chứ không há mãi.
    this.hanBienDoAm = v > 0 ? this.t + 0.25 : 0;
  }

  /**
   * Nói: bong bóng + nhép miệng + giọng trình duyệt nếu có.
   *
   * `camXuc` (spec 3.2b) đổi **cả cử chỉ**: mỗi nhóm cảm xúc một kiểu gật đầu
   * và cử chỉ nhịp tay khác nhau (`cuChiNoi` trong `cu-chi.ts`), và mắt nhìn
   * về người nghe (camera) nếu chưa ai chỉ mục tiêu khác.
   */
  noi(chu: string, voice?: string, camXuc?: string): Action {
    this.huyViec();
    this.hdBong?.cancel();
    const ms = uocThoiLuongNoi(chu);
    this.bongBong = chu;
    this.hanBongBong = this.t + ms / 1000;
    this.noiConLai = ms / 1000;
    this.noiBatDau = this.t;
    this.nhomNoi = nhomNoiTuCamXuc(camXuc);

    if (camXuc && this.nhinTen === null) {
      this.nhinTen = 'camera';
      if (this.vrm.lookAt) this.vrm.lookAt.target = this.diemNhin;
    }

    doc(chu, voice);

    let hd!: HanhDongCoTay;
    hd = hanhDongHenGio(ms, () => {
      this.noiConLai = 0;
      if (this.bongBong === chu) this.bongBong = null;
      dungDoc();
      this.traViec(hd);
    });
    this.batDauViec(hd, 'speaking');
    return hd;
  }

  /**
   * Dừng mọi hành động, về idle (giữ nguyên dáng ngồi nếu đang ngồi).
   *
   * Dọn **cả cảm xúc**: biểu cảm về `neutral` và `mood` về mặc định ngay lập
   * tức — không để mặt giận còn nguyên 1,5 s và `mood` kéo thêm 10–14 s như
   * vòng 1 (review PR #10 mục 1.2).
   */
  dung(): void {
    this.huyViec();
    this.dangLai = null;
    this.vx = 0;
    this.vz = 0;
    this.xoay?.hd.cancel();
    this.xoay = null;
    this.hdBong?.cancel();
    this.hdBong = null;
    this.di = null;
    this.clip = null;
    this.noiConLai = 0;
    this.bongBong = null;
    this.nhomNoi = 'binh-thuong';
    this.bienDoAm = 0; // B2 — hết mẫu âm, miệng về mặc định ngay
    this.hanBienDoAm = 0;
    dungDoc();
    this.datBieuCam('neutral', 0);
    this.mood = MOOD_MAC_DINH;
    this.hanMood = Infinity;
    const em = this.vrm.expressionManager;
    if (em) for (const ten of BIEU_CAM) if (ten !== 'neutral') em.setValue(ten, 0);
    this.trangThai = this.dangNgoi ? 'sitting' : 'idle';
  }

  /* ---------------------------------------------------------------- update */

  private xuong(ten: TenXuong) {
    return this.vrm.humanoid?.getNormalizedBoneNode(ten) ?? null;
  }

  /**
   * Xương **đang dựng hình thật** (raw). Khác `xuong()` (normalized) ở chỗ:
   * `VRMHumanoidRig.update()` của three-vrm chỉ copy `quaternion` (và
   * `position` của `hips`) từ rig normalized sang xương raw — **không copy
   * `scale`**. Mọi hình học (chiều dài chân, cao độ đầu gối, bàn chân) vì vậy
   * phải đo trên xương RAW; đo trên rig normalized ra số của một bộ xương
   * không hề được dựng hình.
   */
  private xuongThat(ten: TenXuong) {
    return this.vrm.humanoid?.getRawBoneNode(ten) ?? null;
  }

  /**
   * Các xương mà lớp cử chỉ/vi mô **cộng thêm** lên trên dáng nền — cần gốc
   * ổn định mỗi khung hình (xem `nenGoc` và khối reset trong `capNhat`).
   */
  private xuongLop(): THREE.Object3D[] {
    const x = this.xuongBo;
    return [
      x.spine,
      x.chest,
      x.neck,
      x.head,
      x.chanT,
      x.chanP,
      x.ongT,
      x.ongP,
      x.canhT,
      x.canhP,
      x.tayT,
      x.tayP,
      x.banTayT,
      x.banTayP,
    ].filter((b): b is THREE.Object3D => !!b);
  }

  /** Dáng đứng gốc khi KHÔNG có clip thật: tay buông tự nhiên. */
  private datDangDung() {
    tayBuong(this.xuongBo, 1);
    /*
     * Chân về dáng đứng. Chỉ có nghĩa ở LỚP DỰ PHÒNG (máy không nạp được bộ
     * clip CC0): `gapChanNgoi` ghi thẳng tư thế ngồi vào xương chân, mà lớp dự
     * phòng không có mixer nào xoá hộ. Thiếu dòng này thì đứng lên xong bàn
     * chân vẫn còn vặn theo dáng ngồi và đế giày hở khỏi sàn 5 cm — bắt được
     * bằng test "đứng lại thì về mốc cũ" (G1 vòng 3).
     */
    for (const t of [
      'leftUpperLeg',
      'rightUpperLeg',
      'leftLowerLeg',
      'rightLowerLeg',
      'leftFoot',
      'rightFoot',
      'leftToes',
      'rightToes',
    ] as const) {
      this.xuong(t)?.rotation.set(0, 0, 0);
    }
  }

  /** Dáng nền nào nên chạy lúc này (và tốc độ phát). */
  private chonDangNen(): { khoa: string; tocDo: number } {
    const st = THONG_SO_IDLE[this.idleKieu];
    const moodSo = NHAN_MOOD[this.mood] ?? NHAN_MOOD[MOOD_MAC_DINH]!;
    if (this.clip) {
      const ten = this.clip.ten;
      const khoa = ten.startsWith('emote:')
        ? (NEN_EMOTE[ten.slice('emote:'.length)] ?? 'idle')
        : (NEN_CLIP[ten] ?? 'idle');
      return { khoa, tocDo: this.clip.tocDo ?? 1 };
    }
    if (this.chuyenNgoi) return { khoa: this.chuyenNgoi, tocDo: 1 };
    if (this.di) return { khoa: 'walk', tocDo: this.di.tocDo / TOC_DO_DI };
    // Lái bằng vận tốc: blend walk/idle theo TỐC ĐỘ THẬT — chậm thì clip walk
    // phát chậm lại (đọc ra như bước nhỏ), dưới ngưỡng thì về idle.
    if (this.dangLai || Math.hypot(this.vx, this.vz) > NGUONG_DI) {
      const toc = Math.hypot(this.vx, this.vz);
      if (toc > NGUONG_DI) {
        return { khoa: 'walk', tocDo: THREE.MathUtils.clamp(toc / TOC_DO_DI, 0.45, 1.8) };
      }
    }
    if (this.trangThai === 'speaking') {
      return { khoa: this.dangNgoi ? 'noi-ngoi' : 'noi', tocDo: 1 };
    }
    if (this.dangNgoi) return { khoa: 'ngoi-giu', tocDo: 1 };
    return {
      khoa: 'idle',
      tocDo: THREE.MathUtils.clamp(st.tho * moodSo.tho, 0.55, 1.7),
    };
  }

  capNhat(dt: number): void {
    const nay = bayGio();
    this.t = (nay - this.t0) / 1000;
    const t = this.t;
    /*
     * dt THẬT của khung này theo ĐỒNG HỒ (s) — G1 vòng 3 (#56 — CHẶN 2).
     *
     * `World` truyền vào `dt = min(getDelta(), 1/20)`: trần 50 ms. Lớp clip
     * nền đã bỏ con số đó để tự đo đồng hồ (`dtThat` dưới đây), nhưng spring
     * bone thì vẫn ăn `dt` bị kẹp — nên trên khung hình 217–338 ms (Firefox +
     * nouveau), **xương nhảy đủ thời gian mà tóc chỉ chạy 50 ms**. Tóc tụt lại
     * sau đầu đúng khoảng đầu vừa đi rồi mới đuổi kịp: đo thật `lechToc` vọt
     * 0,348 m ở t ≈ 200 ms của emote `rat-vui`. Một bộ tích phân chỉ "nhịp cố
     * định" khi nó chạy ĐÚNG đồng hồ của phần còn lại.
     */
    const dtDongHo =
      this.tDongHoTruoc > 0 ? Math.min((nay - this.tDongHoTruoc) / 1000, 0.5) : dt;
    this.tDongHoTruoc = nay;

    // tâm trạng tạm (sau actor.emote) tự rã về mặc định
    if (t >= this.hanMood) {
      this.mood = MOOD_MAC_DINH;
      this.hanMood = Infinity;
    }
    const st = THONG_SO_IDLE[this.idleKieu];
    const moodSo = NHAN_MOOD[this.mood] ?? NHAN_MOOD[MOOD_MAC_DINH]!;
    const x = this.xuongBo;

    /* --- gốc cho các lớp cộng thêm (xem `xuongLop` + `nenGoc`) --- */
    const coNen = this.nen?.coClip === true;
    const boLop = this.xuongLop();
    if (coNen) {
      // KHÔNG set 0: `THREE.PropertyMixer.apply()` chỉ gọi `binding.setValue`
      // khi giá trị trộn ĐỔI so với lần ghi trước của chính nó. Clip tĩnh
      // (`Sitting_Idle_Loop` chỉ có 2 keyframe STEP, chân bất động) vì vậy
      // ngừng ghi xương sau khi crossfade xong — set 0 ở đây thì chân về tư
      // thế gốc (THẲNG ĐỨNG) và đứng im như thế mãi: đúng cái "ngồi xuyên
      // ghế, giày chạm sàn dưới gầm ghế" mà review vòng 4 thấy trên ảnh.
      // Thay vào đó trả xương về ĐÚNG dáng mixer ghi khung trước (gỡ phần
      // các lớp cộng thêm của khung trước), rồi để mixer ghi tiếp nếu có đổi.
      for (const b of boLop) {
        const q = this.nenGoc.get(b);
        if (q) b.quaternion.copy(q);
      }
    } else {
      for (const b of boLop) b.rotation.set(0, 0, 0);
    }
    if (x.chest) x.chest.scale.setScalar(this.tyLeChest);

    /* --- xoay người theo lệnh turnTo (nội suy theo đồng hồ thật) --- */
    if (this.xoay) {
      const xo = this.xoay;
      const u = Math.min(1, (nay - xo.batDau) / xo.dai);
      this.goc.rotation.y = xo.tu + (xo.den - xo.tu) * muot(u);
      if (u >= 1) {
        this.xoay = null;
        if (xo.chiemThan) this.traViec(xo.hd);
        xo.hd.xong();
      }
    }

    /* --- LÁI BẰNG VẬN TỐC (`actor.steer`) --- */
    let dangDi = false;
    if (this.dangLai || this.vx !== 0 || this.vz !== 0) {
      const L = this.dangLai;
      const hetHan = L === null || nay >= L.han;
      const mx = hetHan ? 0 : L!.vxMuc;
      const mz = hetHan ? 0 : L!.vzMuc;
      /**
       * Tích phân theo ĐỒNG HỒ THẬT, không theo `dt` của vòng dựng hình.
       *
       * `dt` đã bị kẹp 1/20 s ở `world.ts` (chống nhảy bậc khi tab bị ẩn). Trên
       * máy không GPU (~2 fps, đúng môi trường chụp bằng chứng) kẹp đó làm mỗi
       * khung chỉ tiến 50 ms trong khi đồng hồ đi 400 ms → nhân vật bò 0,2 m
       * trong 3 giây dù vận tốc báo 1,3 m/s. Đúng tinh thần "thời gian là lời
       * hứa" của CLAUDE.md: steer 1,6 m/s trong 1 s phải đi được ~1,6 m thật.
       *
       * Vẫn kẹp trần `BUOC_LAI_TOI_DA` để một khung hình không nhảy quá xa mà
       * lọt xuyên vật cản mỏng nhất trong `bo-cuc.ts`.
       */
      const dtLai =
        this.tLaiTruoc > 0
          ? Math.min((nay - this.tLaiTruoc) / 1000, BUOC_LAI_TOI_DA)
          : dt;
      this.tLaiTruoc = nay;
      /* --- F2: toàn bộ vật lý một khung nằm trong `buocLai` (thuần, test được) --- */
      const kq = buocLai(
        this.goc.position.x,
        this.goc.position.z,
        this.vx,
        this.vz,
        mx,
        mz,
        dtLai,
      );
      this.vx = kq.vx;
      this.vz = kq.vz;
      this.goc.position.x = kq.x;
      this.goc.position.z = kq.z;
      this.chanLaiX = kq.chanX;
      this.chanLaiZ = kq.chanZ;
      this.dtLaiCuoi = dtLai;
      const toc = Math.hypot(this.vx, this.vz);
      dangDi = kq.dangDi;

      if (toc === 0 && hetHan) {
        /* --- hết hiệu lực VÀ đã dừng hẳn: nhả thân --- */
        this.phaBuoc = 0;
        this.tLaiTruoc = 0;
        if (L) {
          this.dangLai = null;
          this.traViec(L.hd);
        } else if (this.trangThai === 'walking' && !this.di) {
          this.trangThai = this.dangNgoi ? 'sitting' : 'idle';
        }
      } else {
        /**
         * F2 vòng 2 — bị vật cản chặn CỨNG dù Boss **vẫn giữ phím** thì báo
         * `idle` ngay, không chờ `hetHan` (giữ phím là `hetHan` luôn `false`,
         * nên nhánh nhả thân ở trên không bao giờ tới lượt — đó là lý do
         * `state` mắc ở `walking` vĩnh viễn trước sofa).
         *
         * Cố ý **không** huỷ `dangLai` và không `traViec`: lệnh lái vẫn còn
         * chủ thân, nên lúc Boss xoay sang hướng thoáng là đi tiếp ngay trong
         * khung sau. Nếu huỷ thì mỗi lượt gia hạn 200 ms lại dựng một hành
         * động mới và `state` nháy `walking ↔ idle` 5 lần/giây — đúng cái tật
         * gối lệnh mà F2 vừa bỏ.
         */
        if (!dangDi && !this.di && this.trangThai === 'walking') {
          this.trangThai = this.dangNgoi ? 'sitting' : 'idle';
        } else if (dangDi && L && this.viec === L.hd && this.trangThai !== 'walking') {
          this.trangThai = 'walking';
        }
        // F2 vòng 2 — pha bước theo TỐC THẬT: sàn 0,35 cũ vẫn quay chân khi
        // đứng im. Đứng im thì pha về 0 để lần đi sau bắt đầu từ đầu bước.
        if (dangDi) this.phaBuoc += dtLai * 7.5 * Math.max(0.35, kq.tocThat / TOC_DO_DI);
        else this.phaBuoc = 0;

        /**
         * F2 — hướng mặt bám hướng ĐI theo **thời gian thật**, có trần tốc độ
         * góc. Quay theo vận tốc *mục tiêu* chứ không theo vận tốc hiện tại:
         * lúc vừa đổi phím A→D vận tốc còn đang qua 0, nếu lấy hướng của vận
         * tốc hiện tại thì hướng mặt quay loạn quanh điểm đó.
         */
        const hx = hetHan ? this.vx : mx;
        const hz = hetHan ? this.vz : mz;
        if (Math.hypot(hx, hz) > NGUONG_DI) {
          const goc = Math.atan2(hx, hz);
          const lech = lechGoc(goc, this.goc.rotation.y);
          const buoc = lech * heSoBam(dtLai, LERP_XOAY_LAI);
          const tran = TOC_XOAY_LAI * dtLai;
          this.goc.rotation.y +=
            Math.sign(buoc) * Math.min(Math.abs(buoc), tran, Math.abs(lech));
        }
      }
      /* --- F2: một dòng sổ bằng chứng cho khung lái này (xem `soLai`) --- */
      // Đầy thì NGỪNG ghi, không `shift()` mỗi khung (O(n) trong đường render).
      // Sổ reset mỗi lần Boss nhấn phím từ lúc đứng yên nên 900 khung là thừa.
      if (this.soLai.length < 900)
      this.soLai.push([
        +nay.toFixed(1),
        +dtLai.toFixed(4),
        +this.goc.position.x.toFixed(4),
        +this.goc.position.z.toFixed(4),
        +Math.hypot(this.vx, this.vz).toFixed(4),
        +this.goc.rotation.y.toFixed(4),
        (this.chanLaiX ? 1 : 0) + (this.chanLaiZ ? 2 : 0),
      ]);
    }

    /* --- đi lại: nội suy theo đồng hồ thật, tới nơi đúng durationMs --- */
    if (this.di) {
      const d = this.di;
      const u = Math.min(1, (nay - d.batDau) / d.dai);
      this.goc.position.x = d.tu.x + (d.den.x - d.tu.x) * u;
      this.goc.position.z = d.tu.z + (d.den.z - d.tu.z) * u;
      this.phaBuoc = ((nay - d.batDau) / 1000) * 7.5;

      if (u >= 1) {
        this.di = null;
        this.phaBuoc = 0;
        this.traViec(d.hd);
        d.hd.xong();
      } else {
        dangDi = true;
        // F2 — cùng một phép xoay độc lập FPS như phần lái (xem `heSoBam`):
        // `dt * 7` cũ quay tức thì ở FPS thấp và quay 600°/s ở 60 FPS.
        const goc = Math.atan2(d.den.x - d.tu.x, d.den.z - d.tu.z);
        const lech = lechGoc(goc, this.goc.rotation.y);
        const buoc = lech * heSoBam(dt, LERP_XOAY_LAI);
        const tran = TOC_XOAY_LAI * dt;
        this.goc.rotation.y +=
          Math.sign(buoc) * Math.min(Math.abs(buoc), tran, Math.abs(lech));
      }
    }

    /* --- LỚP 1: nền = clip CC0 thật, crossfade 0,25 s --- */
    if (coNen && this.nen) {
      const { khoa, tocDo } = this.chonDangNen();
      this.nen.dat(khoa, tocDo);
      // Mixer chạy theo ĐỒNG HỒ THẬT, không theo `dt` đã bị kẹp 1/20 s của
      // vòng dựng hình: trên máy không GPU (~1 fps) `dt` kẹp làm clip chạy
      // chậm gấp ~8 lần đồng hồ, nên `Sitting_Enter`/`Sitting_Exit` còn diễn
      // dở rất lâu sau khi hành động đã báo xong — ảnh/số đo bằng chứng toàn
      // chụp giữa chừng. Kẹp 0,5 s cho trường hợp tab bị treo/ẩn.
      const dtThat = this.tKhungTruoc > 0 ? Math.min((nay - this.tKhungTruoc) / 1000, 0.5) : dt;
      this.tKhungTruoc = nay;
      this.nen.capNhat(dtThat);
      // Chụp lại dáng nền NGUYÊN BẢN của khung này để khung sau trả về đúng
      // nó (xem ghi chú ở khối reset trên).
      for (const b of boLop) {
        const q = this.nenGoc.get(b);
        if (q) q.copy(b.quaternion);
        else this.nenGoc.set(b, b.quaternion.clone());
      }
    }

    /* --- dáng thủ tục dự phòng (chỉ khi KHÔNG có clip thật) --- */
    if (!coNen) {
      this.datDangDung();
      if (dangDi) {
        const s = Math.sin(this.phaBuoc);
        const c = Math.cos(this.phaBuoc);
        if (x.chanT) x.chanT.rotation.x = s * 0.52;
        if (x.chanP) x.chanP.rotation.x = -s * 0.52;
        if (x.ongT) x.ongT.rotation.x = Math.max(0, -s) * 0.6;
        if (x.ongP) x.ongP.rotation.x = Math.max(0, s) * 0.6;
        if (x.tayT) x.tayT.rotation.x += -s * 0.42;
        if (x.tayP) x.tayP.rotation.x += s * 0.42;
        if (x.spine) x.spine.rotation.z = c * 0.035;
      } else if (this.dangNgoi) {
        if (x.chanT) x.chanT.rotation.x = 1.42;
        if (x.chanP) x.chanP.rotation.x = 1.42;
        if (x.ongT) x.ongT.rotation.x = -1.5;
        if (x.ongP) x.ongP.rotation.x = -1.5;
        if (x.spine) x.spine.rotation.x = 0.08;
      } else {
        const bien = st.dungDua * moodSo.dungDua;
        const lac = Math.sin(t * 0.9);
        if (x.spine) x.spine.rotation.z = lac * 0.018 * bien;
        if (x.tayT) x.tayT.rotation.x += Math.sin(t * 0.8) * 0.05 * bien;
        if (x.tayP) x.tayP.rotation.x += Math.sin(t * 0.8 + 1.2) * 0.05 * bien;

        // đổi chân: trọng tâm chuyển dần qua lại, không bao giờ đứng im
        const chu1 = (2 * Math.PI) / st.doiChan;
        const chu2 = (2 * Math.PI) / (st.doiChan * 1.73);
        const doiChan = (Math.sin(t * chu1) * 0.6 + Math.sin(t * chu2 + 1.1) * 0.4) * bien;
        if (x.chanT) x.chanT.rotation.z += doiChan * 0.045;
        if (x.chanP) x.chanP.rotation.z -= doiChan * 0.045;
        if (x.ongT) x.ongT.rotation.x += Math.max(0, doiChan) * 0.08;
        if (x.ongP) x.ongP.rotation.x += Math.max(0, -doiChan) * 0.08;
        if (x.spine) x.spine.rotation.z += doiChan * 0.012;
      }
    }

    /*
     * --- độ cao thân ---
     *
     * NGỒI: hông bám mặt ghế (`datTuTheNgoi`). Mọi tư thế khác — đứng, đi,
     * emote, đang đứng lên khỏi ghế — **cắm chân xuống sàn** sau `vrm.update()`
     * ở cuối hàm (`camChanXuongSan`), nên ở đây không còn gì phải nội suy:
     * không nhún giả bằng `|sin(phaBuoc)|·0,022`, không lerp gốc về 0.
     *
     * Vì sao bản cũ treo người giữa không trung (Boss 26/10, #56): nhân vật
     * chibi hoá bằng cách scale XƯƠNG CHÂN xuống 0,6, nhưng `VRMHumanoidRig`
     * ghi `hips` của xương raw theo **vị trí hông của model GỐC** mỗi lượt
     * `vrm.update()` (`VRMHumanoidRig.update()`, nhánh `boneName === 'hips'`).
     * Hông bị ghim ở cao độ người lớn còn chân thì ngắn đi 40 % ⇒ bàn chân
     * treo 0,35–0,42 m trên sàn, đo thật trước khi sửa. Không có cách nào kẹp
     * trước được con số đó: nó chỉ biết SAU khi rig chép xuống xương raw.
     */
    if (this.dangNgoi) this.datTuTheNgoi();

    /* --- LỚP 3 (vi mô): dáng tâm trạng/kiểu idle, thở, nhìn quanh --- */
    if (x.chest) x.chest.rotation.z += st.gapVai;
    if (x.neck) x.neck.rotation.x += st.cuiDau;

    const tho = Math.sin(t * 1.55 * st.tho * moodSo.tho);
    if (x.spine) x.spine.rotation.x += tho * 0.028;
    if (x.chest) {
      x.chest.rotation.x += tho * 0.022;
      const p = (1 + tho * 0.012) * this.tyLeChest;
      x.chest.scale.set(p, (1 + tho * 0.008) * this.tyLeChest, p);
    }
    if (x.neck) x.neck.rotation.x += -tho * 0.016;

    if (t >= this.nhinQuanhHan) {
      this.nhinQuanhYawMuc = (Math.random() - 0.5) * 0.46;
      this.nhinQuanhPitchMuc = (Math.random() - 0.5) * 0.18;
      this.nhinQuanhHan = t + st.nhinQuanh * (0.6 + Math.random() * 0.9);
    }
    this.nhinQuanhYaw += (this.nhinQuanhYawMuc - this.nhinQuanhYaw) * Math.min(1, dt * 1.6);
    this.nhinQuanhPitch += (this.nhinQuanhPitchMuc - this.nhinQuanhPitch) * Math.min(1, dt * 1.6);
    const choNhinQuanh =
      this.trangThai === 'idle' && (this.nhinTen === 'camera' || this.nhinTen === null);
    if (choNhinQuanh) {
      if (x.head) {
        x.head.rotation.y += this.nhinQuanhYaw;
        x.head.rotation.x += this.nhinQuanhPitch;
      }
      if (x.neck) x.neck.rotation.y += this.nhinQuanhYaw * 0.4;
    }

    /* --- LỚP 2a': ĐANG NGHE — gật nhẹ theo nhịp, nghiêng đầu nếu là câu hỏi
       (C0 #28: ngôn ngữ cơ thể của người nghe, không chiếm thân) --- */
    if (this.ngheNgong && this.trangThai !== 'speaking') {
      const gat = Math.max(0, Math.sin(t * 2.1)) ** 2;
      if (x.head) {
        x.head.rotation.x += gat * 0.085;
        if (this.ngheCauHoi) x.head.rotation.z += 0.13;
      }
      if (x.neck) x.neck.rotation.x += gat * 0.035;
    }

    /* --- LỚP 2a: cử chỉ nhịp khi nói, KHÁC NHAU theo nhóm cảm xúc --- */
    if (this.trangThai === 'speaking') {
      const vao = THREE.MathUtils.clamp((t - this.noiBatDau) / 0.3, 0, 1);
      const ra = THREE.MathUtils.clamp(this.noiConLai / 0.3, 0, 1);
      cuChiNoi(x, this.nhomNoi, t, Math.min(vao, ra));
    }

    /* --- LỚP 2b: cử chỉ của clip/emote đang chạy (trộn, crossfade thật) --- */
    if (this.clip) {
      const c = this.clip;
      const troi = (nay - c.batDau) / 1000;
      const dai = Math.max(1, c.dai);
      const u = c.loop ? ((troi * 1000) % dai) / dai : Math.min(1, (troi * 1000) / dai);
      /*
       * G1 vòng 3 (#56 — CHẶN 2): VÀO EMOTE PHẢI CÓ TRẦN TỐC ĐỘ.
       *
       * `trongSoCuChi` mặc định vào trong 18 % thời lượng, tức emote 2,2 s thì
       * cả thân (spine 0,2 + chest 0,1 + neck 0,18 + head 0,18 rad với `buon`)
       * nghiêng xong trong 396 ms. Đuôi tóc của Nhi cách gốc đầu 1,09 m, nên
       * đầu nghiêng bấy nhiêu trong bấy nhiêu thời gian là đuôi tóc phải chạy
       * gần 0,2 m — spring không kịp, chuỗi cuộn lại và `lechToc` vọt (đo
       * thật: 0,118 m với `buon`, 0,085 m với `rat-vui`).
       *
       * Chữa bằng cách khai thời gian vào theo GIÂY, không theo phần trăm
       * thời lượng: cùng góc nghiêng mà chạy trong `VAO_CU_CHI_MS` thì tốc độ
       * góc giảm đúng tỉ lệ. Emote ngắn thì vẫn chặn trên ở 42 % thời lượng để
       * còn kịp diễn.
       */
      const vao = Math.min(0.42, Math.max(0.18, VAO_CU_CHI_MS / dai));
      // RA cũng phải có trần tốc độ: đo thật, đỉnh lệch tóc của `ngac-nhien`
      // nằm ở cuối emote, lúc thân rời dáng "giật mình" về idle.
      const ra = Math.min(0.42, Math.max(0.22, VAO_CU_CHI_MS / dai));
      const w = trongSoCuChi(u, c.loop, vao, ra) * (c.manh ?? 1);
      const ten = c.ten;
      const f = ten.startsWith('emote:')
        ? CU_CHI_EMOTE[ten.slice('emote:'.length)]
        : CU_CHI_CLIP[ten];
      f?.(x, { u, t: troi, w });
    }

    /* --- cầm đồ: gắn prop vào bàn tay --- */
    if (this.objCam) {
      const ban = this.tayCam === 'left' ? x.banTayT : x.banTayP;
      if (ban) {
        ban.updateWorldMatrix(true, false);
        ban.getWorldPosition(this.objCam.position);
        this.objCam.position.y += 0.02;
      }
    }

    /* --- mặt: chớp mắt, biểu cảm, nhép miệng --- */
    const em = this.vrm.expressionManager;
    if (em) {
      let chop = 0;
      if (this.dangChop >= 0) {
        this.dangChop += dt;
        const KEO_DAI = 0.14;
        if (this.dangChop >= KEO_DAI) {
          this.dangChop = -1;
          this.hanChop = t + (1.4 + Math.random() * 3.6) * st.chop;
        } else {
          chop = Math.sin((this.dangChop / KEO_DAI) * Math.PI);
        }
      } else if (t >= this.hanChop) {
        this.dangChop = 0;
      }
      em.setValue('blink', chop);

      if (t >= this.hanBieuCam) {
        this.bieuCam = 'neutral';
        this.manhBieuCam = 0;
        this.hanBieuCam = Infinity;
      }
      for (const ten of BIEU_CAM) {
        if (ten === 'neutral') continue;
        const muon = ten === this.bieuCam ? this.manhBieuCam : 0;
        const hienTai = em.getValue(ten) ?? 0;
        em.setValue(ten, hienTai + (muon - hienTai) * Math.min(1, dt * 6));
      }

      // B2 — còn mẫu biên độ thật thì miệng chạy theo âm; hết mẫu thì rơi về
      // đúng hai nhánh cũ của A1/A2 (không sửa dòng nào bên trong).
      if (t < this.hanBienDoAm) {
        this.noiConLai = Math.max(0, this.noiConLai - dt);
        // `aa` theo RMS (bình phương căn cho miệng mở dứt khoát hơn), thêm
        // `ih`/`ou` xen kẽ rất nhẹ — giọng Việt nhiều nguyên âm, chỉ há `aa`
        // nhìn như cá đớp.
        const m = Math.min(1, Math.pow(this.bienDoAm, 0.75) * 0.95);
        this.nhipMieng += dt;
        const xen = Math.sin(this.nhipMieng * 5.5);
        em.setValue('aa', m);
        em.setValue('ih', Math.max(0, xen) * m * 0.3);
        em.setValue('ou', Math.max(0, -xen) * m * 0.35);
      } else {
        if (this.bienDoAm !== 0) {
          this.bienDoAm = 0;
          em.setValue('ih', 0);
          em.setValue('ou', 0);
        }
        if (this.noiConLai > 0) {
          this.noiConLai -= dt;
          const m = (Math.sin(t * 19) * 0.5 + 0.5) * 0.55 + Math.abs(Math.sin(t * 7)) * 0.25;
          em.setValue('aa', m);
        } else {
          em.setValue('aa', Math.max(0, Math.sin(t * 0.7) - 0.86) * 1.4);
        }
      }
    }

    if (this.hanBongBong && t > this.hanBongBong) {
      this.bongBong = null;
      this.hanBongBong = 0;
    }

    /*
     * THỨ TỰ MỘT KHUNG HÌNH (G1 #56/#60) — đổi thứ tự là hỏng một trong ba:
     *   1. `vrm.update(dt)` **không có spring**: rig normalized chép xuống
     *      xương raw, biểu cảm + lookAt cập nhật;
     *   2. `camChanXuongSan()`: biết xương bàn chân thật đang ở đâu rồi mới
     *      hạ gốc cho đế chạm sàn;
     *   3. spring bone chạy **sau** cú hạ gốc, theo bước cố định.
     * Làm spring trước bước 2 thì mỗi khung hình đuôi tóc bị cả thân dịch
     * xuống 0,35 m ngay sau lưng nó (đuôi tóc lưu trong KHÔNG GIAN THẾ GIỚI)
     * → tóc bị giật ngược lên mỗi khung, đúng cái "tóc văng" Boss thấy.
     */
    this.capNhatVrmKhongSpring(dt);

    /*
     * D1b (#48) — ba việc phải làm MỘT LẦN, sau `vrm.update()` của vài khung
     * đầu, không ở hàm dựng: cân tầm vóc, chốt mốc đế chân, đóng mốc spring.
     * Lý do: `@pixiv/three-vrm` diễn hoạt trên rig **normalized** rồi mới chép
     * xuống xương RAW trong `vrm.update()`. Đo xương raw trước lượt update
     * đầu tiên là đo **tư thế bind** — đo thật: bàn chân ở y = 0,49 m, lấy số
     * đó mà scale thì nhân vật thành người khổng lồ cao đụng trần. Chờ 3 khung
     * hình là rig đã về tư thế idle thật, số đo mới đúng.
     */
    if (this.khungDaVe < 3) {
      this.khungDaVe++;
      if (this.khungDaVe === 3) {
        this.canDeuChibi();
        this.chotDeChan();
        this.chotMocDe();
        this.dongMocSpring();
      }
    }

    this.capNhatDeChanTuThe();
    this.chotLaiMocToc();
    if (!this.dangNgoi) this.camChanXuongSan();
    // spring chạy theo ĐỒNG HỒ THẬT, không theo `dt` đã bị `World` kẹp 1/20 s
    this.chaySpring(dtDongHo);
  }

  /**
   * `vrm.update(dt)` nhưng **để dành phần spring bone** cho `chaySpring()`.
   *
   * `VRM.update()` gọi thẳng `springBoneManager.update(delta)` ở cuối, không
   * có cờ tắt; cách duy nhất không phải fork thư viện là tháo cái quản lý ra
   * trong đúng lời gọi đó rồi gắn lại.
   */
  private capNhatVrmKhongSpring(dt: number): void {
    const vrm = this.vrm as unknown as { springBoneManager?: unknown };
    const sb = vrm.springBoneManager;
    /*
     * KHẲNG ĐỊNH (review 26/10, điểm mong manh 1): cách tháo-gắn này bám vào
     * chi tiết BÊN TRONG `VRM.update()`. Nếu thư viện gọi spring qua một tham
     * chiếu đã bắt trước đó thì spring vẫn chạy trong `vrm.update()`, tức
     * chạy TRƯỚC `camChanXuongSan()` — tóc giật ngược mỗi khung, không
     * exception, không test nào bắt. Nên trong vài khung đầu ta bẫy thẳng
     * `sb.update`: bị gọi ở đây một lần là hỏng TO (báo lỗi console + phơi số
     * ra `doXuong().springTrongUpdate`), không im lặng chạy sai.
     */
    const bay = this.khungDaVe <= SO_KHUNG_BAY_SPRING;
    const q = sb as { update?: (d: number) => void } | undefined;
    const goc = bay ? q?.update : undefined;
    if (q && goc) {
      q.update = (d: number): void => {
        this.springTrongUpdate += 1;
        goc.call(q, d);
      };
    }
    vrm.springBoneManager = undefined;
    try {
      this.vrm.update(dt);
    } finally {
      vrm.springBoneManager = sb;
      if (q && goc) q.update = goc;
    }
    if (this.springTrongUpdate > 0 && !this.daBaoSpring) {
      this.daBaoSpring = true;
      console.error(
        `[gen-stage] ${this.id}: @pixiv/three-vrm vẫn chạy spring bone TRONG ` +
          'vrm.update() dù springBoneManager đã tháo ra — thứ tự một khung ' +
          'hình của NhanVat.capNhat không còn đúng, tóc sẽ giật. Xem ' +
          'capNhatVrmKhongSpring().',
      );
    }
  }

  /**
   * CẮM CHÂN XUỐNG SÀN — đặt gốc theo **xương bàn chân thật sau `vrm.update()`**.
   *
   * Không kẹp theo `Box3.setFromObject` (bài học A2 vòng 4: hộp bao của
   * `SkinnedMesh` là tư thế BIND nên không đổi theo tư thế), và không cộng một
   * hằng số đoán trước: đo xương, lấy `deChan` đã chốt trên chính model, hiệu
   * số bao nhiêu thì dịch gốc bấy nhiêu.
   *
   * Vì bàn chân thấp nhất LUÔN nằm đúng mặt sàn, dáng đi tự có nhún (chân trụ
   * đứng yên, thân lên xuống theo đầu gối) — không cần `|sin|·0,022` giả nữa.
   */
  private camChanXuongSan(): void {
    this.goc.updateMatrixWorld(true);
    /*
     * Vòng 3 (#56): có mốc đế trong hệ xương thì cắm ĐÚNG MẶT ĐẾ xuống sàn,
     * không qua hằng số nào. Lúc đi, cổ chân xoay nên đế rời xa xương bàn
     * chân thêm ~1 cm so với lúc đứng: bản vòng 2 cộng hằng số của tư thế
     * đứng, đo thật có mẫu giày lún 1,2 cm dưới ván sàn.
     */
    const deY = this.deGiayTheoMoc();
    if (Number.isFinite(deY)) {
      this.goc.position.y += MAT_SAN - deY;
      this.goc.updateMatrixWorld(true);
      return;
    }
    const chanY = this.doChanThapNhat();
    if (!Number.isFinite(chanY)) return;
    this.goc.position.y += MAT_SAN + this.deChan - chanY;
    this.goc.updateMatrixWorld(true);
  }

  /**
   * Chốt `deChan` = xương bàn chân thấp nhất − **mặt đế giày**, đo MỘT lần.
   *
   * Không lấy `Box3.setFromObject(goc, true).min.y` làm mặt đế: model tóc dài
   * (Gen) có đuôi tóc **thấp hơn gót chân** — đo thật, đáy hộp bao của Gen nằm
   * 0,11 m dưới bàn chân, lấy số đó mà cắm xuống sàn thì cả người lún xuống
   * đúng bấy nhiêu. Đế giày phải đo bằng **chính các đỉnh quanh bàn chân**:
   * quét đỉnh của `SkinnedMesh` (đã biến dạng xương, `getVertexPosition`), chỉ
   * nhận đỉnh nằm trong bán kính 0,22 m quanh một xương bàn chân và không cao
   * hơn mắt cá quá 6 cm.
   *
   * Quét một lượt ở khung hình thứ 3 (vài ms), sau đó mỗi khung chỉ còn đọc
   * toạ độ 4 xương — không có chi phí thường trực.
   */
  private chotDeChan(): void {
    const day = this.quetDayGiay();
    const chanY = this.doChanThapNhat();
    if (!Number.isFinite(chanY) || !Number.isFinite(day)) return;
    this.deChan = THREE.MathUtils.clamp(chanY - day, 0, DE_CHAN_MAX);
    this.deChanTuThe = this.deChan;
  }

  /**
   * QUÉT ĐỈNH MESH quanh bàn chân → cao độ **đế giày thật** (world y) ở tư thế
   * hiện tại. Đây là phép đo hình học, không trừ hằng số nào: duyệt đỉnh của
   * mọi `SkinnedMesh` (đã biến dạng xương, `getVertexPosition`), chỉ nhận đỉnh
   * nằm trong bán kính 0,22 m quanh một xương bàn chân và không cao hơn xương
   * bàn chân quá 6 cm, rồi lấy `y` nhỏ nhất.
   */
  private quetDayGiay(): number {
    let day = Infinity;
    const so = this.quetVungGiay((v) => {
      if (v.y < day) day = v.y;
    });
    if (so > 0 && Number.isFinite(day)) return day;
    // không quét được đỉnh nào (model không phải SkinnedMesh) → hộp bao
    this.goc.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(this.goc, true).min.y;
  }

  /**
   * Quét đỉnh mesh quanh bàn chân → gọi `nhan(v, bone)` cho MỖI đỉnh thuộc
   * vùng "giày": nằm trong bán kính 0,22 m quanh một xương bàn chân/ngón và
   * không cao hơn xương bàn chân thấp nhất của bên đó quá 6 cm. `bone` là
   * xương gần nhất đỉnh đó — tức xương đang kéo nó đi.
   */
  private quetVungGiay(nhan: (v: THREE.Vector3, bone: THREE.Object3D) => void): number {
    this.goc.updateMatrixWorld(true);
    const ben = (['left', 'right'] as const)
      .map((b) => {
        const xs: THREE.Object3D[] = [];
        for (const t of [`${b}Foot`, `${b}Toes`] as const) {
          const x = this.xuongThat(t);
          if (x) xs.push(x);
        }
        const moc = xs.map((x) => x.getWorldPosition(new THREE.Vector3()));
        return { xuong: xs, moc, tran: moc.length ? Math.min(...moc.map((m) => m.y)) + 0.06 : 0 };
      })
      .filter((b) => b.moc.length > 0);
    if (ben.length === 0) return 0;

    const v = new THREE.Vector3();
    let soDinh = 0;
    let soNhan = 0;
    this.vrm.scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh || typeof m.getVertexPosition !== 'function') return;
      const pos = m.geometry.getAttribute('position');
      if (!pos) return;
      // trần an toàn: model dày đỉnh bất thường thì bỏ qua, dùng lối dự phòng
      if (soDinh + pos.count > 400000) return;
      for (let i = 0; i < pos.count; i += 1) {
        m.getVertexPosition(i, v);
        v.applyMatrix4(m.matrixWorld);
        for (const b of ben) {
          if (v.y > b.tran) continue;
          let gan: THREE.Object3D | null = null;
          let d2 = 0.22 * 0.22;
          for (let k = 0; k < b.moc.length; k += 1) {
            const c = b.moc[k]!;
            const d = (v.x - c.x) ** 2 + (v.z - c.z) ** 2;
            if (d <= d2) {
              d2 = d;
              gan = b.xuong[k]!;
            }
          }
          if (!gan) continue;
          soNhan += 1;
          nhan(v, gan);
          break;
        }
      }
      soDinh += pos.count;
    });
    return soNhan;
  }

  /**
   * CHỐT MÂY ĐIỂM ĐẾ GIÀY trong hệ **xương bàn chân** — G1 vòng 3 (#56).
   *
   * Vì sao phải là MÂY ĐIỂM, không phải một điểm thấp nhất: đôi giày là một
   * khối dài, cổ chân xoay thì điểm thấp nhất **đổi sang đỉnh khác** (đứng là
   * giữa đế, ngồi là mép gót). Thử bằng một điểm: lúc ngồi nó báo đế ở
   * −0,007 m trong khi đỉnh thấp nhất thật là −0,055 m — sai 4,8 cm, y như
   * dùng hằng số. Giữ cả vùng giày (thưa hoá về lưới 6 mm cho nhẹ) rồi mỗi
   * khung lấy `y` nhỏ nhất sau khi biến đổi là ĐÚNG với mọi góc xoay, giá
   * khoảng 4 phép nhân một điểm.
   */
  private chotMocDe(): void {
    const theo = new Map<THREE.Object3D, Map<string, THREE.Vector3>>();
    const tam = new THREE.Vector3();
    this.quetVungGiay((v, bone) => {
      let o = theo.get(bone);
      if (!o) {
        o = new Map();
        theo.set(bone, o);
      }
      bone.worldToLocal(tam.copy(v));
      const kh =
        `${Math.round(tam.x / LUOI_MOC_DE)}|` +
        `${Math.round(tam.y / LUOI_MOC_DE)}|` +
        `${Math.round(tam.z / LUOI_MOC_DE)}`;
      const cu = o.get(kh);
      if (!cu || tam.y < cu.y) o.set(kh, tam.clone());
    });
    this.mocDe = [];
    for (const [bone, o] of theo) {
      const diem = new Float32Array(o.size * 3);
      let i = 0;
      for (const p of o.values()) {
        diem[i] = p.x;
        diem[i + 1] = p.y;
        diem[i + 2] = p.z;
        i += 3;
      }
      this.mocDe.push({ bone, diem });
    }
  }

  /**
   * Cao độ ĐẾ GIÀY hiện tại (m) suy từ mây điểm trong hệ xương — đúng mọi tư
   * thế, và chỉ cần HÀNG `y` của `matrixWorld` nên 4 phép nhân một điểm.
   */
  private deGiayTheoMoc(): number {
    let y = Infinity;
    for (const m of this.mocDe) {
      const e = m.bone.matrixWorld.elements;
      const d = m.diem;
      for (let i = 0; i < d.length; i += 3) {
        const wy = e[1]! * d[i]! + e[5]! * d[i + 1]! + e[9]! * d[i + 2]! + e[13]!;
        if (wy < y) y = wy;
      }
    }
    return Number.isFinite(y) ? y : NaN;
  }

  /**
   * G1 vòng 3 (#56 — CHẶN 1 của review 26/10) — đo lại khoảng xương-chân →
   * đế giày **theo tư thế hiện thời**.
   *
   * Đứng/đi/emote: cổ chân gần như không xoay, mốc `deChan` chốt ở khung thứ 3
   * đúng tới ±0,3 mm (đo độc lập trong review), nên không quét gì — khỏi tốn.
   * Ngồi và lúc đang chuyển ngồi/đứng: cổ chân xoay, đế giày rời xa xương bàn
   * chân tới 9,3 cm, nên phải quét lại. Quét mỗi `CHU_KY_DO_DE` ms (không mỗi
   * khung hình) là đủ: tư thế ngồi hội tụ trong ~1,2 s.
   */
  private capNhatDeChanTuThe(): void {
    const deY = this.deGiayTheoMoc();
    const chanY = this.doChanThapNhat();
    if (Number.isFinite(deY) && Number.isFinite(chanY)) {
      this.deChanTuThe = THREE.MathUtils.clamp(chanY - deY, 0, DE_GIAY_TU_THE_MAX);
      return;
    }
    /*
     * LỐI DỰ PHÒNG — model không có `SkinnedMesh` nào (sân khấu giả trong
     * test, hoặc model lạ): không có mốc trong hệ xương thì quét lại theo chu
     * kỳ, và chỉ khi tư thế đang đổi (đứng yên thì mốc tư thế đứng vẫn đúng).
     */
    if (!this.dangNgoi && !this.chuyenNgoi) {
      this.deChanTuThe = this.deChan;
      return;
    }
    const nay = bayGio();
    if (nay - this.tDoDe < CHU_KY_DO_DE) return;
    this.tDoDe = nay;
    const day = this.quetDayGiay();
    const chan2 = this.doChanThapNhat();
    if (!Number.isFinite(chan2) || !Number.isFinite(day)) return;
    this.deChanTuThe = THREE.MathUtils.clamp(chan2 - day, 0, DE_GIAY_TU_THE_MAX);
  }

  /**
   * G1 (#60) — đóng mốc spring bone SAU khi đã scale xương + scale gốc, và
   * **cân lực theo tỉ lệ thật của từng khớp**.
   *
   * Vì sao phải cân lực: `VRMSpringBoneJoint.update()` cộng
   * `stiffness · dt` và `gravityPower · dt` vào đuôi tóc **bằng mét trong
   * không gian thế giới**, rồi chuẩn hoá về đúng độ dài đoạn xương. Chibi hoá
   * nhân xương `head` lên 1,95 (và `goc.scale` 0,93–1,12), nên cùng một tóc
   * nhưng đoạn xương dài gấp đôi, trong khi lực vẫn là số mét của model gốc →
   * tỉ số lực/độ-dài lệch đúng bấy nhiêu lần, đuôi tóc duỗi thẳng ra khỏi dáng
   * tác giả vẽ và quét ra xa đầu (đo thật trước khi sửa: lệch 0,25 m).
   * Nhân `stiffness`/`gravityPower`/`hitRadius` với đúng tỉ lệ thế giới của
   * khớp là đưa động lực học về **đúng dáng đã authored**, ở mọi cỡ.
   *
   * `center = goc`: quán tính tính trong hệ quy chiếu của nhân vật, nên đi lại
   * 1,6 m/s không quăng tóc ra sau; tóc vẫn đung đưa theo cử động đầu/thân.
   */
  private dongMocSpring(): void {
    const ham: Array<{ bone: THREE.Object3D; gocToiDa: number }> = [];
    const tt = {
      soKhop: 0,
      cungMin: Infinity,
      cungMax: 0,
      hamMin: Infinity,
      hamMax: 0,
      daiMin: Infinity,
      daiMax: 0,
      /** Lực một bước / độ dài đoạn xương, lớn nhất — >1 là mất ổn định. */
      lucTrenDai: 0,
    };
    this.goc.updateMatrixWorld(true);
    const sb = this.vrm.springBoneManager as
      | {
          joints?: Iterable<KhopSpring>;
          setInitState?: () => void;
          reset?: () => void;
        }
      | undefined;
    if (!sb) return;
    this.thuGonToc(sb.joints ?? []);
    // `center` phải đặt TRƯỚC `setInitState()`: hàm đó lưu đuôi tóc trong hệ
    // quy chiếu của `center`.
    for (const k of sb.joints ?? []) {
      if (!k?.bone) continue;
      // quán tính trong hệ quy chiếu NHÂN VẬT (xem ghi chú trên)
      try {
        k.center = this.goc;
      } catch {
        /* bản three-vrm không có `center` — bỏ qua, phần còn lại vẫn đúng */
      }
    }
    sb.setInitState?.();
    for (const k of sb.joints ?? []) {
      if (!k?.bone || !k.settings) continue;
      k.goc ??= {
        stiffness: k.settings.stiffness,
        gravityPower: k.settings.gravityPower,
        hitRadius: k.settings.hitRadius,
      };
      const ty = tyLeTheGioi(k.bone);
      /*
       * TRẦN LỰC MỘT BƯỚC — G1 vòng 3 (#56 — CHẶN 2).
       *
       * `VRMSpringBoneJoint.update()` cộng `stiffness · dt` vào đuôi đoạn rồi
       * **chuẩn hoá lại về đúng độ dài đoạn xương**. Đo thật thông số của Nhi
       * sau khi cân theo tỉ lệ chibi: `stiffness · (1/60) / độ-dài-đoạn` lên
       * tới **0,938** — tức mỗi bước đuôi bị ném đi gần bằng cả đoạn xương, sát
       * mép mất ổn định của tích phân Euler hiện. Hệ quả là `lechToc` không
       * còn là một hàm êm của cử động: cùng một emote, lượt này 0,06 m, lượt
       * sau 0,30 m, tuỳ khung hình rơi vào đâu — đúng kiểu "tóc văng" Boss
       * thấy và đúng chỗ review PR #70 đoán. Kẹp ở 30 % độ dài đoạn là điều
       * kiện ổn định, và là TỈ LỆ nên model nào cũng dùng được.
       */
      const dai = doDaiKhop(k);
      const tran =
        Number.isFinite(dai) && dai > 0 ? (TRAN_LUC_BUOC * dai) / DT_SPRING : Infinity;
      k.settings.stiffness = Math.min(k.goc.stiffness * ty * TOC_CUNG_THEM, tran);
      k.settings.gravityPower = Math.min(k.goc.gravityPower * ty * TOC_RU_BOT, tran);
      k.settings.hitRadius = k.goc.hitRadius * ty;
      ghiSo(tt, k.settings.stiffness, k.settings.dragForce ?? 0, dai);
      // trần tốc độ hiển thị: đổi mét/khung thành radian/khung của đoạn này
      const r = Number.isFinite(dai) && dai > 0 ? dai : 0.07;
      ham.push({
        bone: k.bone,
        gocToiDa: THREE.MathUtils.clamp(DICH_TOC_MOI_KHUNG / r, 0.02, Math.PI),
      });
    }
    this.khopHam = ham;
    this.qHamTruoc = ham.map(() => new THREE.Quaternion());
    this.soSpring = tt;
    sb.reset?.();
    this.chotMocToc();
    this.tChotSpring = this.t;
  }

  /**
   * THU GỌN CHUỖI TÓC cho vừa người chibi — G1 (#60).
   *
   * Tóc được bọc da theo xương dưới `head`, mà chibi hoá nhân `head` lên 1,95:
   * tóc dài của Gen vì thế dài ra gần gấp đôi, đo thật đuôi tóc cách gốc đầu
   * 1,33 m trên một thân người cao 1,25 m — quét xuyên qua mặt sàn, nhìn như
   * tóc "loạn" dù vật lý đã chạy đúng.
   *
   * Chữa bằng cách nhân tỉ lệ **chuỗi tóc** (gốc mỗi chuỗi spring nằm dưới
   * `head`) cho đúng hệ số để đuôi tóc dài nhất dừng trên đế giày. Mái tóc ôm
   * sọ vẫn bọc theo xương `head` nên không hở: chỉ các lọn RỦ bị rút ngắn.
   * Hệ số tự tính theo model, tóc ngắn (Javis) ra đúng 1 nên không đụng gì.
   */
  private thuGonToc(joints: Iterable<KhopSpring>): void {
    const dau = this.vrm.humanoid?.getRawBoneNode('head');
    if (!dau) return;
    const ds = [...joints].filter((k): k is KhopSpring & { bone: THREE.Object3D } =>
      !!k?.bone && this.duoiDau(k.bone),
    );
    if (ds.length === 0) return;
    const laSpring = new Set(ds.map((k) => k.bone));
    const gocChuoi = ds.filter((k) => !k.bone.parent || !laSpring.has(k.bone.parent));
    if (gocChuoi.length === 0) return;

    this.goc.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    const u = new THREE.Vector3();
    const dauY = dau.getWorldPosition(v).y;
    /*
     * Đo bằng ĐỘ DÀI CHUỖI, không bằng vị trí hiện thời: ở khung hình thứ 3
     * tóc vẫn đang ở dáng tác giả vẽ (cuộn sát đầu), phải vài giây sau trọng
     * trường mới kéo nó duỗi ra. Lấy vị trí lúc đó mà tính thì kết luận "tóc
     * chưa chạm sàn" rồi không thu gọn gì — đúng cái bẫy của vòng thử đầu.
     * Độ dài chuỗi là bao nhiêu thì chỗ thấp nhất tóc VỚI TỚI là bấy nhiêu.
     */
    let daiNhat = 0;
    for (const k of ds) {
      let dai = 0;
      let b: THREE.Object3D = k.bone;
      while (b.parent && laSpring.has(b.parent)) {
        dai += b.getWorldPosition(v).distanceTo(b.parent.getWorldPosition(u));
        b = b.parent;
      }
      if (dai > daiNhat) daiNhat = dai;
    }
    const deY = this.doChanThapNhat() - this.deChan;
    if (!(daiNhat > 0) || !Number.isFinite(deY)) return;

    /*
     * G1 vòng 3 (#56 — CHẶN 2): tóc được với tới mức nào không chỉ là "trên
     * mặt sàn" mà là **trên 1/3 dưới của thân người**.
     *
     * Vòng 2 chỉ chặn tóc không quét sàn, nên chuỗi tóc của Nhi dài 1,09 m
     * trên thân 1,25 m — tóc tới mắt cá. Cánh tay đòn đó biến mỗi cú xoay đầu
     * khi emote thành vài chục cm đường đi của đuôi tóc, nên `lechToc` không
     * thể ≤0,07 m dù spring chạy đúng đồng hồ và đúng điều kiện ổn định. Tóc
     * tới mắt cá cũng không phải tỉ lệ chibi (`tóc đúng cỡ` là đúng mục G1).
     * Chặn theo TỈ LỆ THÂN NGƯỜI nên model nào cũng dùng được.
     */
    const san = Math.max(
      deY + LE_TOC_TREN_SAN,
      deY + TOC_CHUA_THAN_DUOI * (dauY - deY),
    );
    if (dauY - daiNhat >= san) return; // tóc buông hết vẫn trên mức này — không đụng
    const k = THREE.MathUtils.clamp((dauY - san) / daiNhat, THU_TOC_TOI_THIEU, 1);
    for (const g of gocChuoi) g.bone.scale.multiplyScalar(k);
    this.tyThuToc = k;
    this.goc.updateMatrixWorld(true);
  }

  /**
   * Chạy spring bone theo **bước cố định**, chia bước khi khung hình dài.
   *
   * Vòng 3 (#56 — CHẶN 2): bước phải chia ĐỦ `dt`, không được kẹp tổng thời
   * gian. Bản trước mô phỏng nhiều nhất 66,7 ms mỗi khung, nên trên khung
   * 129–338 ms tóc chạy chậm 2–5 lần so với đồng hồ: xương nhảy đủ, tóc đứng
   * lại, `lechToc` vọt 0,348 m rồi mới đuổi kịp. Nay `soBuoc · buoc = dt` với
   * `buoc ≤ 1/60` cho tới khung 400 ms.
   */
  private chaySpring(dt: number): void {
    const sb = this.vrm.springBoneManager as { update?: (d: number) => void } | undefined;
    if (!sb?.update || !(dt > 0)) return;
    // Chưa đóng mốc xong (3 khung đầu) thì chưa chạy: mốc còn là tư thế bind.
    if (this.khungDaVe < 3) return;
    const tong = Math.min(dt, DT_SPRING_TOI_DA);
    const soBuoc = Math.min(BUOC_SPRING_TOI_DA, Math.max(1, Math.ceil(tong / DT_SPRING)));
    const buoc = tong / soBuoc;
    this.soBuocSpringCuoi = soBuoc;

    // dáng tóc/vải TRƯỚC khi mô phỏng khung này (cho trần tốc độ bên dưới)
    for (let i = 0; i < this.khopHam.length; i += 1) {
      this.qHamTruoc[i]!.copy(this.khopHam[i]!.bone.quaternion);
    }

    for (let i = 0; i < soBuoc; i += 1) sb.update(buoc);

    this.hamTocMoiKhung();
  }

  /**
   * TRẦN TỐC ĐỘ HIỂN THỊ của tóc/vải — xem `DICH_TOC_MOI_KHUNG`.
   *
   * Chạy SAU khi spring đã mô phỏng xong cả khung: xương nào rời dáng khung
   * trước quá trần thì xoay về đúng trần (`rotateTowards`). Không đụng trạng
   * thái bên trong của three-vrm, nên đây là trần **tốc độ vẽ**, không phải
   * đổi vật lý: cú đẩy của collider bàn tay vẫn tới, chỉ là tới trong vài
   * khung thay vì một khung.
   */
  private hamTocMoiKhung(): void {
    this.soHamCat = 0;
    if (this.khopHam.length === 0) return;
    let doi = false;
    for (let i = 0; i < this.khopHam.length; i += 1) {
      const h = this.khopHam[i]!;
      const q0 = this.qHamTruoc[i]!;
      _qHam.copy(h.bone.quaternion);
      if (q0.angleTo(_qHam) <= h.gocToiDa) continue;
      h.bone.quaternion.copy(q0).rotateTowards(_qHam, h.gocToiDa);
      h.bone.updateMatrix();
      this.soHamCat += 1;
      doi = true;
    }
    // `bone.matrixAutoUpdate = false` (three-vrm đặt), nên phải tự dựng lại
    // `matrixWorld` của cả cây sau khi sửa `quaternion`.
    if (doi) this.goc.updateMatrixWorld(true);
  }
}

/** Một khớp spring bone của `@pixiv/three-vrm`, phần này file cần đụng tới. */
interface KhopSpring {
  bone?: THREE.Object3D;
  /** Xương con làm đuôi đoạn (VRM 1.0); `null` với VRM 0.x. */
  child?: THREE.Object3D | null;
  /** Vị trí đuôi trong hệ xương — chỉ có SAU `setInitState()`. */
  initialLocalChildPosition?: THREE.Vector3;
  center?: THREE.Object3D | null;
  settings?: {
    stiffness: number;
    gravityPower: number;
    hitRadius: number;
    dragForce: number;
  };
  /** Bản gốc của `settings` trước khi cân theo tỉ lệ (ta tự gắn thêm). */
  goc?: { stiffness: number; gravityPower: number; hitRadius: number };
}

/**
 * Độ dài THẬT (m, thế giới) của đoạn xương một khớp spring — đúng cách
 * `VRMSpringBoneJoint._calcWorldSpaceBoneLength()` tính.
 */
function doDaiKhop(k: KhopSpring): number {
  const b = k.bone;
  if (!b) return NaN;
  const con = k.child ?? null;
  if (con) {
    return b
      .getWorldPosition(new THREE.Vector3())
      .distanceTo(con.getWorldPosition(new THREE.Vector3()));
  }
  const p = k.initialLocalChildPosition;
  if (!p || p.lengthSq() < 1e-12) return NaN;
  return p.length() * tyLeTheGioi(b);
}

/** Gom thống kê thông số spring (bằng chứng số cho `doToc`). */
function ghiSo(
  tt: Record<string, number>,
  cung: number,
  ham: number,
  dai: number,
): void {
  tt.soKhop = (tt.soKhop ?? 0) + 1;
  tt.cungMin = Math.min(tt.cungMin!, cung);
  tt.cungMax = Math.max(tt.cungMax!, cung);
  tt.hamMin = Math.min(tt.hamMin!, ham);
  tt.hamMax = Math.max(tt.hamMax!, ham);
  if (Number.isFinite(dai) && dai > 0) {
    tt.daiMin = Math.min(tt.daiMin!, dai);
    tt.daiMax = Math.max(tt.daiMax!, dai);
    tt.lucTrenDai = Math.max(tt.lucTrenDai!, (cung * DT_SPRING) / dai);
  }
}

/** Tỉ lệ (đều) của một node so với thế giới — tích scale của cả chuỗi cha. */
function tyLeTheGioi(node: THREE.Object3D): number {
  let ty = 1;
  for (let p: THREE.Object3D | null = node; p; p = p.parent) ty *= p.scale.x;
  return ty || 1;
}

/** Vào/ra mềm cho nội suy (ease-in-out). */
function muot(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

/* -------------------------------------------------------------- lời nói */

/**
 * Ước thời lượng nói theo độ dài chữ: ~13 ký tự/giây tiếng Việt, cộng 600 ms
 * đệm, kẹp trong 900–9000 ms.
 */
export function uocThoiLuongNoi(chu: string): number {
  // B2 — lớp tiếng đã tải mp3 thì `durationMs` là **thời lượng audio thật**,
  // không phải số đếm ký tự (spec: durationMs là lời hứa với agent).
  const that = thoiLuongThat(chu);
  if (that !== null) return that;
  const ms = 600 + (chu.trim().length / 13) * 1000;
  return Math.round(THREE.MathUtils.clamp(ms, 900, 9000));
}

interface GiongNoi {
  speak(u: unknown): void;
  cancel(): void;
  getVoices(): Array<{ name: string; lang: string }>;
}

function layGiong(): GiongNoi | null {
  const g = globalThis as { speechSynthesis?: GiongNoi; SpeechSynthesisUtterance?: unknown };
  return g.speechSynthesis && g.SpeechSynthesisUtterance ? g.speechSynthesis : null;
}

/** Đọc bằng Web Speech nếu trình duyệt có — không bao giờ chặn lệnh. */
function doc(chu: string, voice?: string): void {
  // B2 — đã có giọng edge-tts cho câu này thì Web Speech phải im (không thì
  // nói chồng hai tiếng). Bridge tắt → cờ hạ xuống → chạy đúng như A1.
  if (dangChanWebSpeech()) return;
  const ss = layGiong();
  if (!ss) return;
  try {
    const Ctor = (globalThis as unknown as {
      SpeechSynthesisUtterance: new (s: string) => Record<string, unknown>;
    }).SpeechSynthesisUtterance;
    const u = new Ctor(chu);
    u.lang = 'vi-VN';
    u.rate = 1.05;
    const ds = ss.getVoices();
    const chon =
      (voice ? ds.find((v) => `${v.name} (${v.lang})` === voice || v.name === voice) : null) ??
      ds.find((v) => v.lang.startsWith('vi'));
    if (chon) u.voice = chon;
    ss.cancel();
    ss.speak(u);
  } catch {
    // trình duyệt chặn giọng (chưa có tương tác người dùng) — bỏ qua
  }
}

function dungDoc(): void {
  try {
    layGiong()?.cancel();
  } catch {
    /* bỏ qua */
  }
}
