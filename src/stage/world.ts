/**
 * world.ts — sân khấu thật bằng Three.js: renderer, camera, ánh sáng, phòng,
 * danh sách actor / place / prop, bong bóng chữ, vòng lặp vẽ.
 *
 * Đây là **bản thi công** của giao diện `StageWorld` (xem `src/api/types.ts`).
 * Lệnh trong `src/api/commands/` không biết gì về Three.js — nhờ vậy A2/A3 đổi
 * ruột cảnh mà không phải sửa dispatcher, UI hay bridge, và `pnpm test` chạy
 * dispatcher bằng sân khấu giả không cần WebGL.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { VRMUtils } from '@pixiv/three-vrm';
import type {
  Action,
  ActorSnapshot,
  PlaceSnapshot,
  PropSnapshot,
  ScreenSnapshot,
  StageState,
  StageWorld,
  ThamSoModuleBuild,
  ThamSoSpawnActor,
  ThamSoSpawnProp,
  ThamSoSpawnScreen,
  Vec3,
} from '../api/types';
import type { EventBus } from '../events';
import {
  denDiem,
  dungPhong,
  KICH_THUOC_PHONG,
  KICH_THUOC_SAU,
  MAU_CAM,
  MAU_CYAN,
  MAU_DEN_AM,
} from './phong';
import { NhanVat, TOC_DO_DI, uocThoiLuongNoi } from './nhanvat';
import {
  BIEU_CAM,
  CLIPS,
  DAI_CLIP,
  EMOTES,
  layMatGhe,
  PLACES,
  PRESET_DEN,
  PRESET_MAY,
  TEN_HIEN_THI,
  timPlace,
  type DinhNghiaPlace,
} from './noi-dung';
import { noiTiep, hanhDongHenGio } from './hanh-dong';
import { ManHinh, MAC_DINH_MAN_HINH } from './man-hinh';
import { KetTinh, maySurfacePoints } from '../fx/hat-ket-tinh';
import { taoHieuUng, type HieuUng } from '../fx/hieu-ung';
// C0 (#28) — sổ "có não nối hay chưa" do bridge ghi vào (xem `src/behavior/so-nao.ts`).
import { coNao } from '../behavior/so-nao';

/**
 * Nền ngoài khung cửa/khoảng hở (D1): trời chiều ấm nhạt — thấy khi camera
 * lùi ra quá mép nhà. Không còn xám-xanh "Tron" của lab.
 */
const MAU_NEN_LAB = 0xdce6ea;
/** Bán kính coi là "đang ở" một place. */
const BAN_KINH_AT = 0.9;
/**
 * Hai nhân vật mặc định của sân khấu (B1, Issue #18 mục 3).
 *
 * `owner` = Boss điều khiển bằng phím (VRM NAM, `public/models/owner.vrm`),
 * spawn trên bục trung tâm. `gen` = nhân vật nữ cũ (`lan` đổi id thành `gen`
 * theo đúng tên trong spec mục 3.4b), đứng ở bàn điều khiển, idle `cham-chu`,
 * để đợt B3 gắn não agy.
 *
 * Thiếu `owner.vrm` (chưa chạy `pnpm assets`) thì `actorSpawn` tự rơi về
 * `models/avatar.vrm` chứ không làm sập cảnh — xem `napCanh`.
 */
// C2 (#32): tên hiển thị lấy từ BẢNG `TEN_HIEN_THI` trong `noi-dung.ts`
// (G2, 28/10: Gen → "Nhi", Javis → "Nam"); `id` vẫn là `owner`/`gen`.
export const OWNER = { id: 'owner', ten: TEN_HIEN_THI.owner, model: 'models/owner.vrm' } as const;
export const GEN = { id: 'gen', ten: TEN_HIEN_THI.gen, model: 'models/avatar.vrm' } as const;
/** Giữ tên cũ cho mã/kịch bản A1–A3 còn tham chiếu: nay trỏ vào `gen`. */
export const ACTOR_MAC_DINH = { id: GEN.id, ten: GEN.ten, model: GEN.model };

/**
 * FPS trung bình dưới mức này quá 2 s thì **hạ chất lượng** (D1b, Boss: "tối
 * ưu đồ hoạ, đừng đòi GPU lớn"): tắt bóng đổ của đèn chính và hạ pixel ratio
 * về 1. Trước D1b số này dùng để tắt bloom — D1b đã BỎ HẲN bloom nên nó
 * chuyển sang canh hai thứ còn đắt nhất trong cảnh.
 */
const FPS_HA_CHAT_LUONG = 24;

/** Bóng đổ MẶC ĐỊNH — cố định, không gate theo `maxTextureSize` (PR #51 vòng 2). */
const BONG_CO_BAN = 1024;
/** Bóng đổ bản "máy khoẻ" — chỉ bật khi đo thật đạt mốc dưới đây. */
const BONG_MANH = 2048;
/** FPS phải đạt mức này LIÊN TỤC `BONG_CAN_MS` mới cho nâng bóng lên 2048. */
const FPS_NANG_BONG = 50;
const BONG_CAN_MS = 5000;

interface DoVat {
  id: string;
  kind: string;
  shape: string;
  obj: THREE.Object3D;
  state: Record<string, unknown>;
  camBoi: string | null;
}

type GocMay = { vt: THREE.Vector3; tam: THREE.Vector3; fov: number };

/**
 * Góc máy "toàn cảnh" cho CĂN NHÀ 14 × 10 m, trần 2,8 m (D1 #43 → **F1 #56**).
 *
 * F1 đổi chỗ đứng: máy ở góc ĐÔNG-NAM trong nhà, nhìn chéo về tây-bắc. Bản
 * D1b đứng ở góc TÂY-nam nhìn về đông-bắc → cả cụm phòng khách (và kệ TV sát
 * tường tây) nằm **sau lưng camera**, Boss chỉ thấy sàn trống với mấy cái tủ
 * bếp. Góc mới thấy **cả 3 cụm trong một khung**: bàn ăn + bếp chữ L bên phải,
 * góc làm việc chính giữa phía xa, cụm sofa–thảm–kệ TV bên trái.
 */
const MAY_NGANG: GocMay = {
  vt: new THREE.Vector3(1.0, 1.92, 4.3),
  tam: new THREE.Vector3(-0.5, 0.82, -3.9),
  fov: 74,
};
/**
 * Khung DỌC 390 × 844 (điện thoại): khung đứng thì hfov rất hẹp — ôm 3 cụm là
 * bất khả. F1 đổi hẳn mục tiêu: nhắm vào **một cụm phòng khách** (sofa ↔ bàn
 * trà ↔ kệ TV) để màn hình hẹp vẫn thấy một căn phòng có hồn, thay vì khung
 * ngang bị cắt còn một dải sàn trống như bản D1b.
 */
/**
 * Lệch camera so với chủ khi bám (`theo-owner`): chéo 3/4 sau-phải, cao 2 m
 * — nhà trần thấp (2,8 m) nên lệch thấp hơn hẳn bản lab.
 */
const LECH_THEO_OWNER = /* @__PURE__ */ new THREE.Vector3(1.8, 2.0, 2.6);
/**
 * F2 (#56 mục 2) — **tần số riêng của lò xo camera bám** (rad/s).
 *
 * Bản B1 bám bằng `position.lerp(dich, min(1, dt*2,6))`. Hai tật:
 *   1. `dt*k` không độc lập FPS (xem `heSoBam` trong `nhanvat.ts`), nên cùng
 *      code cho cảm giác khác nhau giữa máy kiểm ~1 FPS và 60 FPS của Boss;
 *   2. lọc bậc một thì **luôn trễ tỉ lệ với tốc độ**: đo trên Firefox GPU
 *      thật, nhân vật đi 1,6 m/s thì camera tụt lại ~0,6 m so với vị trí lệch
 *      mong muốn, và bám "đuổi theo" chứ không "đi cùng".
 *
 * Giờ dùng **lò xo giảm chấn tới hạn** (critically damped): tích phân nửa ẩn
 * (semi-implicit) nên ổn định ở mọi `dt`, và vì damping = tới hạn nên KHÔNG
 * bao giờ vọt quá rồi dội lại — tức không rung.
 *
 * Chọn ω = 9 rad/s bằng số, không bằng cảm giác: với lò xo tới hạn bám một
 * mục tiêu chạy ĐỀU tốc độ `v`, độ trễ xác lập đúng bằng `2v/ω`. Nhân vật lái
 * 1,6 m/s ⇒ trễ 0,36 m — camera đi *cùng* nhân vật (bản lerp cũ `dt·2,6` trễ
 * `v/2,6` = 0,62 m, tức luôn *đuổi theo*). Tăng ω nữa thì camera bám cứng vào
 * từng bước chân, lúc đó chính nhịp bước lại thành rung.
 */
export const OMEGA_MAY = 9;
/** Trần `dt` cho lò xo camera (s) — tab bị ẩn quay lại thì bám chứ không nhảy. */
const DT_MAY_TOI_DA = 1 / 15;

/**
 * Một bước lò xo giảm chấn tới hạn cho `v` tiến tới `muc`, có mang `vel`.
 *
 * Công thức semi-implicit (ổn định vô điều kiện):
 *   `vel ← (vel + ω²·dt·(muc − v)) / (1 + 2ω·dt + ω²·dt²)`, rồi `v ← v + vel·dt`.
 * Xuất ra ngoài để test đo được (`src/api/__tests__/f2-dieu-khien-muot.test.ts`).
 */
export function buocLoXo(
  v: THREE.Vector3,
  vel: THREE.Vector3,
  muc: THREE.Vector3,
  omega: number,
  dt: number,
): void {
  if (!(dt > 0)) return;
  const w2 = omega * omega;
  const chia = 1 + 2 * omega * dt + w2 * dt * dt;
  vel.x = (vel.x + w2 * dt * (muc.x - v.x)) / chia;
  vel.y = (vel.y + w2 * dt * (muc.y - v.y)) / chia;
  vel.z = (vel.z + w2 * dt * (muc.z - v.z)) / chia;
  v.addScaledVector(vel, dt);
}

const MAY_DOC: GocMay = {
  vt: new THREE.Vector3(-1.3, 1.62, 4.3),
  tam: new THREE.Vector3(-4.9, 0.85, 0.9),
  fov: 76,
};

export class World implements StageWorld {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private bus: EventBus;
  private actors = new Map<string, NhanVat>();
  private props = new Map<string, DoVat>();
  private bongBongLop: HTMLElement;
  private bongBongEl = new Map<string, HTMLElement>();

  /* A3 — màn hình hologram, hiệu ứng kết tinh, fx ngắn */
  private screens = new Map<string, ManHinh>();
  /** E2 — khối đỡ + mặt trên ĐO ĐƯỢC của từng màn hình (xem `ScreenSnapshot.restsOn`). */
  private doDungManHinh = new Map<string, { block: string; surfaceY: number }>();
  private ketTinhDangChay = new Map<string, KetTinh>();
  private fxDangChay: HieuUng[] = [];

  private troi!: THREE.HemisphereLight;
  private nang!: THREE.DirectionalLight;
  private vien!: THREE.DirectionalLight;
  private denPreset = 'sang';
  /** C0 (#28) — góc máy hiện tại, để `stage.describe().camera.preset` nói thật. */
  private mayPreset = 'toan-canh';

  /*
   * D1b (Issue #48) — **KHÔNG CÒN HẬU KỲ**. Boss 26/10: "tối ưu đồ hoạ, đừng
   * đòi GPU lớn… đẹp đến từ ánh sáng + màu + chất liệu + bố cục, không từ hậu
   * kỳ". Cả hai `EffectComposer` (bloom chọn lọc của C3 #40), `UnrealBloomPass`
   * và lượt tô-đen-rồi-trả-lại vật liệu mỗi khung hình đã BỎ HẲN: giờ
   * `renderer.render(scene, camera)` một lượt, không render target trung gian,
   * không full-screen pass nào.
   *
   * Cái mất: viền sáng quanh chụp đèn. Cái được: 2 lượt render + 5 lượt blur
   * mỗi khung hình biến mất, và `batSang()` trở thành vô hại (chỉ bật một bit
   * layer, không ai đọc) nên `phong.ts`/`fx/*.ts` không phải sửa.
   */
  private fpsThapTu = 0;
  private daHaChatLuong = false;
  /** ms FPS đã liên tục ≥ `FPS_NANG_BONG` (gate nâng bóng 1024 → 2048). */
  private fpsCaoTu = 0;
  /** Đã nâng bóng lên 2048 chưa — nâng MỘT LẦN, không nhảy qua nhảy lại. */
  private daNangBong = false;
  /** Hai đèn điểm ấm (đèn sàn + đèn bàn) — D1b, không bóng đổ, tầm ngắn. */
  private denAm: THREE.PointLight[] = [];

  private dongHo = new THREE.Timer();
  private chuotNDC = new THREE.Vector2(0, 0);
  private diemChuot = new THREE.Vector3();
  private tamTuBay: { vt: THREE.Vector3; tam: THREE.Vector3 } | null = null;
  /**
   * Preset `theo-owner`: id actor camera đang BÁM (null = không bám).
   *
   * Khác `tamTuBay` (bay một lần tới chỗ cố định rồi thôi): mỗi khung hình
   * tính lại đích theo vị trí chủ rồi lerp — nên nhân vật đi tới đâu camera
   * theo tới đó mà vẫn giữ đúng góc 3/4 nhìn xuống.
   */
  private theoOwner: string | null = null;
  /* --- F2: trạng thái lò xo camera bám (xem `buocLoXo`) --- */
  private readonly mayVel = new THREE.Vector3();
  private readonly mayTamVel = new THREE.Vector3();
  private readonly mayDich = new THREE.Vector3();
  private readonly mayTam = new THREE.Vector3();
  /**
   * F2 — **sổ ghi từng khung của camera bám** (bằng chứng "không rung").
   *
   * `[t ms, dt s, cam.x, cam.z, |vel|]`. Ghi tại chỗ, không cấp phát; script
   * bằng chứng đọc một lần qua `doHieuNang().soMay` thay vì lấy mẫu mỗi khung
   * (lấy mẫu từ ngoài kéo FPS 60 → 8,5, tức làm hỏng đúng cái đang đo).
   */
  private soMay: Array<[number, number, number, number, number]> = [];
  private bossDaXoay = false;
  private lanCuoiBossHoatDong = Date.now();

  constructor(canvas: HTMLCanvasElement, bus: EventBus, bongBongLop: HTMLElement) {
    this.bus = bus;
    this.bongBongLop = bongBongLop;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // D1b: pixel ratio ≤ 1,5 (bản cũ ≤ 2 — trên điện thoại 3x là gấp đôi số
    // điểm ảnh phải tô mà mắt gần như không thấy khác).
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // C3 (#40) hạ 1.1 → 1.0; D1b (#48) hạ tiếp 1.0 → 0.86: kiểm độc lập đo
    // luma TOÀN CẢNH p95 246–250 (cháy mảng sáng), mốc đặt lại là 215–225.
    this.renderer.toneMappingExposure = 0.86;

    this.scene.background = new THREE.Color(MAU_NEN_LAB);
    // fog rất nhẹ (0.015): cho chiều sâu, KHÔNG làm mờ khối ở cuối phòng 16 m
    this.scene.fog = new THREE.FogExp2(MAU_NEN_LAB, 0.015);

    this.camera = new THREE.PerspectiveCamera(
      MAY_NGANG.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      120,
    );
    this.camera.position.copy(MAY_NGANG.vt);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(MAY_NGANG.tam);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 1.5;
    // phòng 16 m: phải cho lùi xa hơn nhiều so với bản 7,2 m (cũ 9,5)
    this.controls.maxDistance = 26;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minPolarAngle = Math.PI * 0.12;
    this.controls.enablePan = false;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.addEventListener('start', () => {
      this.bossDaXoay = true;
      this.tamTuBay = null;
      this.lanCuoiBossHoatDong = Date.now();
    });

    this.dungAnhSang();
    this.datGocMay();
  }

  /* ------------------------------------------------------------ dựng cảnh */

  /** Render MỘT lượt thẳng ra màn hình — D1b bỏ hẳn hậu kỳ (xem ghi chú trên). */
  private veMotKhung(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Dàn đèn "sáng có khối" (Boss 25/10, Issue #11). Bản cũ hemi 0.85 / dir 0.8
   * lạnh ngắt cho ra ảnh kiểu Tron. Bản này:
   *   · hemisphere 1.2 — nền sáng đều, khối không chìm vào nền;
   * D1 (Issue #43) — NẮNG CHIỀU qua cửa sổ nam, thay "sáng có khối" của lab:
   *   · hemisphere trời xanh nhạt / đất ấm (không còn xanh-đen lạnh);
   *   · directional ẤM 1.0 (~3200 K, 0xffe0b0) từ phía nam-trên (cửa sổ),
   *     bóng mềm PCFSoft bó sát khung nhà mới (14×10 m, không còn 16×16);
   *   · fill ấm rất nhẹ phía bắc để mép đồ không đen tịt.
   * Đèn bàn/đèn sàn (rất nhẹ, có bloom) nằm trong `phong.ts`, không thuộc dàn
   * đèn cảnh nên `scene.light` không đổi chúng.
   */
  private dungAnhSang(): void {
    // D1b: hemisphere ẤM hẳn (trời vàng nhạt / sàn gỗ nâu) — bản D1 để trời
    // xanh lạnh 0xcfe3ef nên mảng tối trong nhà ngả xanh, trái hẳn ảnh tham
    // chiếu "nhà gỗ ấm, nắng chiều mềm".
    this.troi = new THREE.HemisphereLight(0xffe9c8, 0x9c7f5c, 0.95);
    this.scene.add(this.troi);

    // "Nắng chiều": đặt phía NAM (z dương, phía cửa sổ) và cao, chiếu chếch
    // vào trong nhà — mô phỏng ánh nắng xiên qua cửa sổ lớn buổi chiều.
    this.nang = new THREE.DirectionalLight(0xffd79a, 1.15);
    // Hạ thấp + đẩy chéo: mặt trời chiều xuống thấp thì VỆT NẮNG qua cửa sổ
    // dài hẳn ra giữa sàn (bản D1 đèn cao 7 m gần như thẳng đứng, bóng ngắn
    // cụt — đúng chỗ Boss kêu "thô").
    this.nang.position.set(-4.5, 4.6, 11.0);
    this.nang.castShadow = true;
    /*
     * BÓNG CỐ ĐỊNH 1024 (Boss 27/10: "đừng đòi GPU lớn"; kiểm độc lập PR #51
     * vòng 1 chặn đúng chỗ này). Bản cũ gate theo `maxTextureSize >= 8192` —
     * vô dụng: swiftshader cũng báo 8192, GPU tích hợp báo 16384, nên nhánh
     * 2048 LUÔN trúng và 1024 không bao giờ chạy.
     *
     * Chỉ nâng lên 2048 khi ĐO THẬT đạt ≥ 50 FPS liên tục 5 s (xem
     * `theoDoiFps`) — tức máy thừa sức, không phải vì bảng thông số.
     */
    this.nang.shadow.mapSize.set(BONG_CO_BAN, BONG_CO_BAN);
    // Khoảng near/far PHẢI bó sát cảnh: phòng giờ chỉ 14×10 m (không còn
    // 16×16), đèn cách điểm xa nhất trong nhà ~18 m → 5…22 là vừa đủ, không
    // loãng depth (bài học 25/10, vẫn đúng với khung nhà mới).
    this.nang.shadow.camera.near = 3;
    this.nang.shadow.camera.far = 26;
    const nuaRong = KICH_THUOC_PHONG / 2 + 1.5;
    const nuaSau = KICH_THUOC_SAU / 2 + 1.5;
    this.nang.shadow.camera.left = -nuaRong;
    this.nang.shadow.camera.right = nuaRong;
    this.nang.shadow.camera.top = nuaSau;
    this.nang.shadow.camera.bottom = -nuaSau;
    this.nang.shadow.bias = -0.0015;
    this.nang.shadow.normalBias = 0.05;
    this.nang.shadow.radius = 2.5;
    this.scene.add(this.nang);

    this.vien = new THREE.DirectionalLight(MAU_CAM, 0.22);
    this.vien.position.set(0, 4.2, -5.0);
    this.scene.add(this.vien);

    /*
     * Hai đèn ĐIỂM ẤM (D1b) — đúng hai chụp đèn có thật trong cảnh: đèn sàn
     * phòng khách và đèn bàn làm việc. Tầm ngắn (4 m), cường độ thấp, KHÔNG
     * đổ bóng: chúng chỉ để góc phòng xa cửa sổ không chết tối, không phải để
     * chói. Hai point light không bóng gần như miễn phí trên GPU yếu.
     */
    this.denAm = [
      // F1 (#56): hai chụp đèn CÓ THẬT trong cảnh đã dời theo bố cục mới —
      // đèn sàn cạnh ghế đơn phòng khách (−5,5; −1,0) và đèn bàn làm việc
      // (3,0; −4,5). Bản D1b vẫn chiếu vào chỗ cũ (−1,5; 1,0) tức giữa hành
      // lang trống, nên phòng khách tối mà hành lang lại sáng vô cớ.
      denDiem(MAU_DEN_AM, 6.5, 4.2, -5.5, 1.45, -1.0),
      denDiem(MAU_DEN_AM, 5.0, 3.6, 3.0, 1.15, -4.3),
    ];
    for (const d of this.denAm) this.scene.add(d);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    // 0.25: môi trường chỉ để mép khối không đen tịt. Bản thử 0.42 cộng với
    // hemisphere 1.1 làm cảnh bệt như phủ sương sữa — mất hết khối.
    this.scene.environmentIntensity = 0.25;
  }

  /** Nạp phòng + nhân vật mặc định + 2 màn hình (máy tính + TV). Gọi một lần lúc khởi động. */
  async napCanh(tienTrinh?: (chu: string) => void): Promise<{ dungKenney: boolean }> {
    tienTrinh?.('Đang dựng căn nhà…');
    const phong = await dungPhong(this.scene);

    tienTrinh?.('Đang nạp nhân vật…');
    // 1) Boss (nam) trên bục trung tâm, quay mặt về camera — phím WASD lái người này
    await this.actorSpawn({
      id: OWNER.id,
      name: OWNER.ten,
      model: OWNER.model,
      at: 'buc-trung-tam',
      controlledBy: 'owner',
    });
    // 2) Gen (nữ) đứng ở bàn điều khiển, dáng chờ `cham-chu` (Issue #18 mục 3)
    await this.actorSpawn({
      id: GEN.id,
      name: GEN.ten,
      model: GEN.model,
      at: 'ban-dieu-khien',
      controlledBy: 'agent',
    });
    this.actorIdleStyle(GEN.id, 'cham-chu');
    this.actorLookAt(GEN.id, 'ban-dieu-khien');

    tienTrinh?.('Đang dựng màn hình…');
    for (const id of Object.keys(MAC_DINH_MAN_HINH)) await this.screenSpawn({ id });

    return { dungKenney: phong.dungKenney };
  }

  /* ----------------------------------------------------------- vòng lặp */

  batDauVe(): void {
    this.renderer.setAnimationLoop(() => this.motKhung());
    window.addEventListener('resize', () => {
      this.datGocMay();
      this.renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, this.daHaChatLuong ? 1 : 1.5),
      );
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    window.addEventListener('pointermove', (e) => {
      this.chuotNDC.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
      this.lanCuoiBossHoatDong = Date.now();
    });
    window.addEventListener('keydown', () => {
      this.lanCuoiBossHoatDong = Date.now();
    });
  }

  private motKhung(): void {
    this.dongHo.update();
    const dt = Math.min(this.dongHo.getDelta(), 1 / 20);

    // điểm con trỏ chiếu ra không gian, cách camera 2,4 m
    this.diemChuot
      .set(this.chuotNDC.x, this.chuotNDC.y, 0.5)
      .unproject(this.camera)
      .sub(this.camera.position)
      .normalize()
      .multiplyScalar(2.4)
      .add(this.camera.position);

    for (const nv of this.actors.values()) {
      if (nv.nhinTen === 'cursor') nv.diemNhin.position.copy(this.diemChuot);
      else if (nv.nhinTen === 'camera') nv.diemNhin.position.copy(this.camera.position);
      else if (nv.nhinTen) {
        const v = this.viTriMucTieu(nv.nhinTen);
        if (v) nv.diemNhin.position.set(v[0], v[1] + 1.25, v[2]);
      }
      nv.capNhat(dt);
    }

    /* --- camera bám owner (preset `theo-owner`) --- */
    if (this.theoOwner) {
      const nv = this.actors.get(this.theoOwner);
      if (!nv) {
        this.theoOwner = null;
      } else {
        const p = nv.goc.position;
        this.mayDich.set(p.x, 0, p.z).add(LECH_THEO_OWNER);
        this.mayTam.set(p.x, 1.1, p.z);
        /**
         * F2 — lò xo giảm chấn tới hạn cho CẢ vị trí và tâm ngắm, dùng **cùng
         * một** `dt` và `omega` nên hiệu (vị trí − tâm) không bị méo giữa hai
         * khung: đó mới là điều mắt đọc ra thành "rung". Xem `buocLoXo`.
         */
        const dtMay = Math.min(dt, DT_MAY_TOI_DA);
        buocLoXo(this.camera.position, this.mayVel, this.mayDich, OMEGA_MAY, dtMay);
        buocLoXo(this.controls.target, this.mayTamVel, this.mayTam, OMEGA_MAY, dtMay);
        // Đầy thì NGỪNG ghi (xem ghi chú cùng loại ở `NhanVat.soLai`).
        if (this.soMay.length < 900)
        this.soMay.push([
          +performance.now().toFixed(1),
          +dtMay.toFixed(4),
          +this.camera.position.x.toFixed(4),
          +this.camera.position.z.toFixed(4),
          +this.mayVel.length().toFixed(4),
        ]);
      }
    } else if (this.mayVel.lengthSq() > 0 || this.mayTamVel.lengthSq() > 0 || this.soMay.length) {
      // rời preset `theo-owner` → bỏ quán tính, đừng để lò xo kéo thêm
      this.mayVel.set(0, 0, 0);
      this.mayTamVel.set(0, 0, 0);
      // …và **xoá sổ**: `doHieuNang()` luôn trả `soMay`, để sổ cũ lại thì
      // người đọc sau có thể chấm điểm camera trên một lượt bám khác hẳn.
      this.soMay = [];
    }

    if (this.tamTuBay) {
      const k = Math.min(1, dt * 3.2);
      this.camera.position.lerp(this.tamTuBay.vt, k);
      this.controls.target.lerp(this.tamTuBay.tam, k);
      if (this.camera.position.distanceTo(this.tamTuBay.vt) < 0.02) this.tamTuBay = null;
    }

    for (const mh of this.screens.values()) mh.capNhat(dt);

    for (const [id, kt] of [...this.ketTinhDangChay]) {
      if (kt.capNhat()) this.ketTinhDangChay.delete(id);
    }
    this.fxDangChay = this.fxDangChay.filter((hu) => !hu.capNhat());

    this.capNhatBongBong();
    this.controls.update();
    this.veMotKhung();
    this.theoDoiFps(dt);
  }

  /**
   * Hiệu năng (spec mục 5, siết lại ở D1b): FPS tụt dưới ngưỡng quá 2 s thì
   * **hạ chất lượng** — tắt bóng đổ của đèn nắng và hạ pixel ratio về 1. Lên
   * lại quá ngưỡng + 8 thì trả về như cũ. Không còn bloom để mà tắt.
   */
  private theoDoiFps(dt: number): void {
    if (dt <= 0) return;
    const fps = 1 / dt;
    if (fps < FPS_HA_CHAT_LUONG) {
      this.fpsThapTu += dt * 1000;
      if (this.fpsThapTu > 2000) this.haChatLuong(true);
    } else {
      this.fpsThapTu = 0;
      if (fps > FPS_HA_CHAT_LUONG + 8) this.haChatLuong(false);
    }

    /*
     * Cổng NÂNG BÓNG (PR #51 vòng 2): 1024 là mặc định cho mọi máy. Chỉ khi
     * khung hình thật đạt ≥ 50 FPS liên tục 5 s mới đổi sang 2048 — đo thật,
     * không đoán theo `maxTextureSize`. Tụt xuống dưới mốc thì đồng hồ reset,
     * nên máy yếu không bao giờ chạm tới nhánh này.
     */
    if (!this.daNangBong && !this.daHaChatLuong) {
      if (fps >= FPS_NANG_BONG) {
        this.fpsCaoTu += dt * 1000;
        if (this.fpsCaoTu >= BONG_CAN_MS) {
          this.daNangBong = true;
          this.nang.shadow.mapSize.set(BONG_MANH, BONG_MANH);
          // phải huỷ render target cũ, three mới cấp lại đúng kích thước mới
          this.nang.shadow.map?.dispose();
          this.nang.shadow.map = null;
        }
      } else {
        this.fpsCaoTu = 0;
      }
    }
  }

  /** Kích thước shadow map đang dùng (bằng chứng số cho PR, không đoán). */
  coBong(): number {
    return this.nang.shadow.mapSize.x;
  }

  /** Bật/tắt chế độ tiết kiệm (bóng đổ + pixel ratio) — D1b. */
  private haChatLuong(ha: boolean): void {
    if (this.daHaChatLuong === ha) return;
    this.daHaChatLuong = ha;
    this.nang.castShadow = !ha;
    this.renderer.shadowMap.enabled = !ha;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, ha ? 1 : 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Chiếu một điểm thế giới ra toạ độ ĐIỂM ẢNH trên khung hình.
   *
   * D1b (#48): bằng chứng luma mặt phải đo **đúng vùng mặt**, không phải một
   * ô vuông giữa ảnh đoán mò như bản D1 — cho script biết mặt nhân vật rơi
   * vào đâu trên ảnh vừa chụp.
   */
  chieuDiem(p: Vec3): { x: number; y: number } {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  /**
   * Số lượt vẽ / tam giác — bằng chứng hiệu năng cho PR.
   *
   * PR #51 vòng 2: TÁCH phần **nhà** và phần **VRM**. Không ước lượng bằng
   * công thức: vẽ một khung với VRM ẩn rồi đọc `renderer.info` → `callsNha`
   * là số thật; phần VRM là hiệu số. Mốc tự áp: **nhà ≤ 120 lượt vẽ** (VRM là
   * model người thật, nhiều mesh, không thuộc phần mỹ thuật căn nhà).
   */
  doHieuNang(): Record<string, unknown> {
    const gocActor: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (o.name.startsWith('actor:')) gocActor.push(o);
    });
    this.renderer.render(this.scene, this.camera);
    const tongCalls = this.renderer.info.render.calls;
    const tongTri = this.renderer.info.render.triangles;
    const hien = gocActor.map((o) => o.visible);
    for (const o of gocActor) o.visible = false;
    this.renderer.render(this.scene, this.camera);
    const callsNha = this.renderer.info.render.calls;
    const triNha = this.renderer.info.render.triangles;
    gocActor.forEach((o, i) => (o.visible = hien[i]));
    this.renderer.render(this.scene, this.camera);

    const r = this.renderer.info.render;
    let mesh = 0;
    const theoGoc: Record<string, number> = {};
    const vl = new Set<string>();
    this.scene.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      mesh++;
      const m = o as THREE.Mesh;
      const ds = Array.isArray(m.material) ? m.material : [m.material];
      for (const x of ds) {
        if (!x) continue;
        vl.add(x.uuid);
      }
      let p: THREE.Object3D | null = o;
      let ten = o.name || '(không tên)';
      while (p) {
        if (p.name) ten = p.name;
        p = p.parent;
      }
      theoGoc[ten] = (theoGoc[ten] ?? 0) + 1;
    });
    return {
      calls: r.calls,
      triangles: r.triangles,
      callsNha,
      callsVrm: Math.max(0, tongCalls - callsNha),
      trianglesNha: triNha,
      trianglesVrm: Math.max(0, tongTri - triNha),
      coBong: this.coBong(),
      pixelRatio: this.renderer.getPixelRatio(),
      mesh,
      vatLieu: vl.size,
      theoGoc,
      // F2 — sổ camera bám (xem `soMay`); rỗng khi không ở preset `theo-owner`
      soMay: this.soMay,
    };
  }

  private datGocMay(): void {
    const tyLe = window.innerWidth / window.innerHeight;
    const t = THREE.MathUtils.clamp((1.3 - tyLe) / (1.3 - 0.6), 0, 1);
    this.camera.fov = THREE.MathUtils.lerp(MAY_NGANG.fov, MAY_DOC.fov, t);
    this.camera.aspect = tyLe;
    this.camera.updateProjectionMatrix();
    if (!this.bossDaXoay && !this.tamTuBay) {
      this.camera.position.lerpVectors(MAY_NGANG.vt, MAY_DOC.vt, t);
      this.controls.target.lerpVectors(MAY_NGANG.tam, MAY_DOC.tam, t);
    }
    this.controls.update();
  }

  /* --------------------------------------------------------- bong bóng chữ */

  private capNhatBongBong(): void {
    const v = new THREE.Vector3();
    for (const [id, nv] of this.actors) {
      let el = this.bongBongEl.get(id);
      if (!nv.bongBong) {
        if (el) el.classList.remove('hien');
        continue;
      }
      if (!el) {
        el = document.createElement('div');
        el.className = 'bong-bong';
        this.bongBongLop.appendChild(el);
        this.bongBongEl.set(id, el);
      }
      if (el.dataset.chu !== nv.bongBong) {
        el.dataset.chu = nv.bongBong;
        el.innerHTML = `<b></b><span></span>`;
        el.querySelector('b')!.textContent = nv.ten;
        el.querySelector('span')!.textContent = nv.bongBong;
      }
      nv.viTriDau(v);
      v.y += 0.34;
      v.project(this.camera);
      const x = (v.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
      el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.classList.toggle('hien', v.z < 1);
    }
  }

  /* ------------------------------------------------------------- tra cứu */

  private nv(id: string): NhanVat {
    const a = this.actors.get(id);
    if (!a) throw new Error(`Không có actor "${id}"`);
    return a;
  }

  coActor(id: string): boolean {
    return this.actors.has(id);
  }

  coProp(id: string): boolean {
    return this.props.has(id);
  }

  actorIds(): string[] {
    return [...this.actors.keys()];
  }

  placeIds(): string[] {
    return PLACES.map((p) => p.id);
  }

  propIds(): string[] {
    return [...this.props.keys()];
  }

  screenIds(): string[] {
    return [...this.screens.keys()];
  }

  coScreen(id: string): boolean {
    return this.screens.has(id);
  }

  clips(): string[] {
    return [...CLIPS];
  }

  expressions(): string[] {
    return [...BIEU_CAM];
  }

  emotes(): string[] {
    return [...EMOTES];
  }

  /** Toạ độ của một mục tiêu bất kỳ (place / actor / prop / camera). */
  private viTriMucTieu(ten: string | Vec3): Vec3 | null {
    if (Array.isArray(ten)) return ten;
    if (ten === 'camera') {
      return [this.camera.position.x, this.camera.position.y, this.camera.position.z];
    }
    if (ten === 'cursor') return [this.diemChuot.x, this.diemChuot.y, this.diemChuot.z];
    const p = timPlace(ten);
    if (p) return p.pos;
    const a = this.actors.get(ten);
    if (a) return [a.goc.position.x, a.goc.position.y, a.goc.position.z];
    const d = this.props.get(ten);
    if (d) return [d.obj.position.x, d.obj.position.y, d.obj.position.z];
    const mh = this.screens.get(ten);
    if (mh) return [mh.group.position.x, mh.group.position.y, mh.group.position.z];
    return null;
  }

  /** Nơi actor nên đứng khi được gọi tới mục tiêu này. */
  private choDung(ten: string | Vec3): { v: THREE.Vector3; place: DinhNghiaPlace | null } {
    if (Array.isArray(ten)) return { v: new THREE.Vector3(ten[0], 0, ten[2]), place: null };
    const p = timPlace(ten);
    if (p) {
      const d = p.standAt ?? p.pos;
      return { v: new THREE.Vector3(d[0], 0, d[2]), place: p };
    }
    const v = this.viTriMucTieu(ten);
    if (!v) throw new Error(`Không biết "${ten}" ở đâu (place/actor/prop/toạ độ)`);
    return { v: new THREE.Vector3(v[0], 0, v[2]), place: null };
  }

  /* --------------------------------------------------------------- actor */

  async actorSpawn(p: ThamSoSpawnActor): Promise<ActorSnapshot> {
    if (!p.id.trim()) throw new Error('"id" không được rỗng');
    if (this.actors.has(p.id)) throw new Error(`Actor "${p.id}" đã có trên sân khấu`);

    const duongDan = p.model ?? ACTOR_MAC_DINH.model;
    let nv: NhanVat;
    try {
      nv = await NhanVat.nap(p.id, p.name ?? p.id, duongDan);
    } catch (e) {
      // Thiếu đúng file VRM đã yêu cầu (vd chưa tải `owner.vrm`) thì rơi về
      // avatar mặc định và nói rõ ở console — cảnh vẫn dựng xong, Boss vẫn
      // điều khiển được, chỉ là nhân vật chưa đúng model.
      if (duongDan === ACTOR_MAC_DINH.model) throw e;
      console.warn(
        `[Gen-Stage] Không nạp được "${duongDan}" (${e instanceof Error ? e.message : e}) — ` +
          `dùng tạm "${ACTOR_MAC_DINH.model}". Chạy: bash scripts/fetch-assets.sh`,
      );
      nv = await NhanVat.nap(p.id, p.name ?? p.id, ACTOR_MAC_DINH.model);
    }
    nv.dieuKhienBoi = p.controlledBy ?? 'agent';
    this.scene.add(nv.goc);
    this.scene.add(nv.diemNhin);

    const { v, place } = this.choDung(p.at ?? 'buc-trung-tam');
    nv.goc.position.copy(v);
    nv.goc.rotation.y = ((place?.facing ?? 20) * Math.PI) / 180;
    this.actors.set(p.id, nv);

    const snap = this.snapActor(nv);
    return snap;
  }

  actorRemove(id: string): void {
    const nv = this.nv(id);
    nv.dung();
    this.scene.remove(nv.goc);
    this.scene.remove(nv.diemNhin);
    // rò rỉ nặng nhất nếu thiếu: mỗi actorRemove (và mỗi stage.reset gọi lại
    // actorSpawn ngay sau) nạp một avatar VRM mới mà không dọn avatar cũ —
    // skinned mesh + skeleton + toàn bộ texture rò vĩnh viễn theo phiên.
    VRMUtils.deepDispose(nv.vrm.scene);
    this.actors.delete(id);
    const el = this.bongBongEl.get(id);
    if (el) {
      el.remove();
      this.bongBongEl.delete(id);
    }
  }

  actorMoveTo(id: string, to: string | Vec3, speed?: number): Action {
    const nv = this.nv(id);
    const { v, place } = this.choDung(to);
    const hd = nv.diToi(v, speed);
    if (place?.facing !== undefined) {
      // chỉnh hướng sau khi tới nơi: KHÔNG chiếm thân, vì lệnh moveTo đã xong
      void hd.done.then(() => {
        if (this.actors.get(id) === nv) nv.xoayVe(place.facing!, false);
      });
    }
    return hd;
  }

  /**
   * `actor.steer` — lái bằng vận tốc (Issue #18 mục 2).
   *
   * Không kẹp toạ độ ở đây: việc kẹp trong phòng + trượt dọc bàn/kệ nằm trong
   * `NhanVat.capNhat` (dùng `bo-cuc.ts`), vì nó phải xảy ra **mỗi khung hình**
   * theo vận tốc thật, không phải một lần lúc nhận lệnh.
   */
  actorSteer(id: string, vx: number, vz: number, ms: number): Action {
    return this.nv(id).lai(vx, vz, ms);
  }

  actorLookAt(id: string, target: string | null): void {
    const nv = this.nv(id);
    if (target === null) {
      nv.nhinTen = null;
      if (nv.vrm.lookAt) nv.vrm.lookAt.target = undefined;
      return;
    }
    if (nv.vrm.lookAt) nv.vrm.lookAt.target = nv.diemNhin;
    if (target !== 'camera' && target !== 'cursor' && !this.viTriMucTieu(target)) {
      throw new Error(`Không biết "${target}" ở đâu`);
    }
    nv.nhinTen = target;
  }

  actorTurnTo(id: string, target: string | Vec3): Action {
    const nv = this.nv(id);
    const v = this.viTriMucTieu(target);
    if (!v) throw new Error(`Không biết "${String(target)}" ở đâu`);
    nv.huongVe = typeof target === 'string' ? target : null;
    return nv.xoayVe(new THREE.Vector3(v[0], 0, v[2]));
  }

  /**
   * C0 (#28) — quay người **không chiếm thân** (`xoayVe(..., false)`).
   *
   * Dùng để GIỮ hướng về người nghe trong suốt câu nói: `actor.say` đã chiếm
   * thân nên một `actor.turnTo` lúc đó chỉ xếp hàng chờ nói xong — đúng lúc
   * không còn cần nữa. Gọi lại mỗi nhịp thì mặt bám theo máy quay kể cả khi
   * Boss đổi `camera.preset` giữa chừng.
   */
  actorFaceTo(id: string, target: string | Vec3): void {
    const nv = this.nv(id);
    const v = this.viTriMucTieu(target);
    if (!v) throw new Error(`Không biết "${String(target)}" ở đâu`);
    nv.huongVe = typeof target === 'string' ? target : null;
    nv.xoayVe(new THREE.Vector3(v[0], 0, v[2]), false);
  }

  actorNgheNgong(id: string, bat: boolean, cauHoi = false): void {
    this.nv(id).datNgheNgong(bat, cauHoi);
  }

  actorSit(id: string, seat: string): Action {
    const nv = this.nv(id);
    const p = timPlace(seat);
    if (!p) throw new Error(`Không có place "${seat}"`);
    if (p.kind !== 'seat') {
      throw new Error(
        `"${seat}" là loại "${p.kind}", không phải ghế. Ghế đang có: ${PLACES.filter(
          (q) => q.kind === 'seat',
        )
          .map((q) => q.id)
          .join(', ')}`,
      );
    }
    const dich = new THREE.Vector3(p.pos[0], 0, p.pos[2]);
    const kc = dich.distanceTo(
      new THREE.Vector3(nv.goc.position.x, 0, nv.goc.position.z),
    );
    const uoc = (kc / TOC_DO_DI) * 1000 + DAI_CLIP.sit! + 400;
    const matGhe = layMatGhe(seat);
    return noiTiep(
      [
        () => nv.diToi(dich),
        () => nv.xoayVe(p.facing ?? 180),
        () => nv.ngoi(matGhe),
      ],
      Math.round(uoc),
    );
  }

  actorStand(id: string): Action {
    return this.nv(id).dungLen();
  }

  actorPlay(id: string, clip: string, loop = false, speed = 1): Action {
    if (!CLIPS.includes(clip as (typeof CLIPS)[number])) {
      throw new Error(`Không có clip "${clip}". Đang có: ${CLIPS.join(', ')}`);
    }
    return this.nv(id).choiClip(clip, loop, speed);
  }

  actorStop(id: string): void {
    this.nv(id).dung();
  }

  actorExpress(id: string, expression: string, weight = 1, durationMs?: number): void {
    const nv = this.nv(id);
    if (!(BIEU_CAM as readonly string[]).includes(expression)) {
      throw new Error(`Không có biểu cảm "${expression}". Đang có: ${BIEU_CAM.join(', ')}`);
    }
    nv.datBieuCam(expression, weight, durationMs);
  }

  actorBubble(id: string, text: string, durationMs?: number): Action {
    return this.nv(id).hienBongBong(text, durationMs);
  }

  actorSay(id: string, text: string, emotion?: string, voice?: string): Action {
    const nv = this.nv(id);
    // A1: cảm xúc chỉ ánh sang biểu cảm mặt; A2 làm trọn gói mặt + cơ thể + âm
    if (emotion) nv.datBieuCam(bieuCamTuCamXuc(emotion), 0.8, uocThoiLuongNoi(text) + 600);
    // A2 vòng 2: `emotion` đổi cả CỬ CHỈ (đầu + nhịp tay theo nhóm cảm xúc)
    // và hướng mắt về người nghe, không chỉ đổi mặt — spec mục 3.2b.
    return nv.noi(text, voice, emotion);
  }

  actorHold(id: string, prop: string, hand: 'left' | 'right'): void {
    const nv = this.nv(id);
    const d = this.props.get(prop);
    if (!d) throw new Error(`Không có prop "${prop}"`);
    if (d.camBoi && d.camBoi !== id) {
      throw new Error(`Prop "${prop}" đang do "${d.camBoi}" cầm`);
    }
    if (nv.dangCam && nv.dangCam !== prop) {
      throw new Error(`"${id}" đang cầm "${nv.dangCam}", gọi actor.drop trước`);
    }
    d.camBoi = id;
    d.state = { ...d.state, at: null };
    nv.dangCam = prop;
    nv.tayCam = hand;
    nv.objCam = d.obj;
  }

  actorDrop(id: string): string | null {
    const nv = this.nv(id);
    const prop = nv.dangCam;
    if (!prop) return null;
    const d = this.props.get(prop);
    if (d) {
      d.camBoi = null;
      d.obj.position.set(nv.goc.position.x + 0.3, 0.1, nv.goc.position.z + 0.2);
    }
    nv.dangCam = null;
    nv.objCam = null;
    return prop;
  }

  actorEmote(id: string, emote: string, intensity = 1, say?: string): Action {
    if (!(EMOTES as readonly string[]).includes(emote)) {
      throw new Error(`Không có emote "${emote}". Đang có: ${EMOTES.join(', ')}`);
    }
    return this.nv(id).chayEmote(emote, intensity, say);
  }

  /**
   * Số đo xương trong không gian + bộ clip thật đang dùng — **bằng chứng số**
   * cho `scripts/kiem-a2.mjs` (kiểm `y` bàn tay > `y` vai khi giơ tay, đo tỉ
   * lệ chibi). Không nằm trong Actor API, chỉ phơi qua `window.stage`.
   */
  doXuongActor(id: string): Record<string, unknown> {
    const nv = this.nv(id);
    return {
      actor: id,
      state: nv.state,
      clipThat: nv.dungClipThat,
      dangNen: nv.dangNen,
      ...nv.doXuong(),
    };
  }

  actorIdleStyle(id: string, style: string): void {
    this.nv(id).datIdleStyle(style);
  }

  actorInterrupt(id: string): void {
    this.actors.get(id)?.dung();
  }

  /* ---------------------------------------------------------------- prop */

  async propSpawn(p: ThamSoSpawnProp): Promise<PropSnapshot> {
    if (!p.id.trim()) throw new Error('"id" không được rỗng');
    if (this.props.has(p.id)) throw new Error(`Prop "${p.id}" đã có trên sân khấu`);
    const shape = p.shape ?? 'cube';
    const obj = dungHinhProp(shape);
    obj.name = `prop:${p.id}`;
    this.scene.add(obj);

    const d: DoVat = {
      id: p.id,
      kind: p.kind ?? 'prop',
      shape,
      obj,
      state: {},
      camBoi: null,
    };
    this.props.set(p.id, d);
    this.propMoveTo(p.id, p.at ?? 'ban-1');
    return this.snapProp(d);
  }

  propRemove(id: string): void {
    const d = this.props.get(id);
    if (!d) throw new Error(`Không có prop "${id}"`);
    for (const nv of this.actors.values()) {
      if (nv.dangCam === id) {
        nv.dangCam = null;
        nv.objCam = null;
      }
    }
    this.scene.remove(d.obj);
    // module (`moduleBuild`) gắn thêm 1 sprite nhãn (CanvasTexture riêng) vào
    // obj — dispose đệ quy cả cây, không chỉ mesh gốc, để không rò texture/geo.
    dispose3D(d.obj);
    this.props.delete(id);
  }

  propMoveTo(id: string, to: string | Vec3): void {
    const d = this.props.get(id);
    if (!d) throw new Error(`Không có prop "${id}"`);
    if (d.camBoi) {
      const nv = this.actors.get(d.camBoi);
      if (nv) {
        nv.dangCam = null;
        nv.objCam = null;
      }
      d.camBoi = null;
    }
    if (Array.isArray(to)) {
      d.obj.position.set(to[0], to[1], to[2]);
      d.state = { ...d.state, at: null };
      return;
    }
    const p = timPlace(to);
    if (p) {
      // đặt lên mặt bàn/kệ nếu là bàn, không thì đặt trên sàn
      const caoDat = p.kind === 'desk' ? 0.8 : p.kind === 'shelf' ? 0.95 : 0.1;
      d.obj.position.set(p.pos[0], caoDat, p.pos[2]);
      d.state = { ...d.state, at: p.id };
      return;
    }
    const v = this.viTriMucTieu(to);
    if (!v) throw new Error(`Không biết "${to}" ở đâu`);
    d.obj.position.set(v[0], Math.max(0.1, v[1]), v[2]);
    d.state = { ...d.state, at: null };
  }

  propSet(id: string, state: Record<string, unknown>): PropSnapshot {
    const d = this.props.get(id);
    if (!d) throw new Error(`Không có prop "${id}"`);
    d.state = { ...d.state, ...state };

    // trạng thái hiểu được thì thể hiện luôn ra hình
    const mat = (d.obj as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (mat) {
      if (state.screen === 'on') mat.emissiveIntensity = 1.4;
      else if (state.screen === 'off') mat.emissiveIntensity = 0.1;
      if (typeof state.color === 'string') {
        try {
          mat.color.set(state.color);
        } catch {
          throw new Error(`"color" không hợp lệ: ${state.color}`);
        }
      }
    }
    if (state.visible === false) d.obj.visible = false;
    if (state.visible === true) d.obj.visible = true;

    return this.snapProp(d);
  }

  /* ------------------------------------------------------- cảnh + camera */

  /** 3 preset đèn lab (spec 3.3): `sang` làm việc · `toi` nghỉ/ban đêm · `am` cảnh báo/ấm cúng. */
  sceneLight(preset: string): void {
    if (!(PRESET_DEN as readonly string[]).includes(preset)) {
      throw new Error(`Không có preset đèn "${preset}". Có: ${PRESET_DEN.join(', ')}`);
    }
    this.denPreset = preset;
    const bg = this.scene.background as THREE.Color;
    switch (preset) {
      case 'sang':
        this.troi.intensity = 1.2;
        this.nang.intensity = 1.0;
        this.nang.color.setHex(0xffe0b0);
        this.vien.intensity = 0.3;
        bg.setHex(MAU_NEN_LAB);
        // C3 (#40) 1.1 → 1.0; D1b (#48) → 0.86 (xem constructor).
        this.renderer.toneMappingExposure = 0.86;
        break;
      case 'toi':
        this.troi.intensity = 0.34;
        this.nang.intensity = 0.22;
        this.nang.color.setHex(0x6f9ec8);
        this.vien.intensity = 0.45;
        bg.setHex(0x060a0f);
        this.renderer.toneMappingExposure = 0.8;
        break;
      case 'am':
        this.troi.intensity = 0.8;
        this.nang.intensity = 0.8;
        this.nang.color.setHex(MAU_CAM);
        this.vien.intensity = 0.25;
        bg.setHex(0x1c1208);
        this.renderer.toneMappingExposure = 0.86;
        break;
    }
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.copy(bg);
  }

  cameraFocus(target: string, distance = 3.0): void {
    this.theoOwner = null;
    const v = this.viTriMucTieu(target);
    if (!v) throw new Error(`Không biết "${target}" ở đâu`);
    const tam = new THREE.Vector3(v[0], v[1] + 1.1, v[2]);
    // đứng chéo 35° trước mặt mục tiêu, cao hơn một chút
    const huong = new THREE.Vector3(0.55, 0.42, 1).normalize().multiplyScalar(distance);
    this.bossDaXoay = true;
    this.tamTuBay = { vt: tam.clone().add(huong), tam };
  }

  /**
   * Đặt góc máy **thủ công, tức thì** (không bay lerp) — dùng cho ảnh bằng
   * chứng trong `scripts/kiem-a2.mjs`. `camera.focus` không dùng được cho
   * việc này: nó bay dần (lerp `dt·3,2`) và `distance` thực tế không tới đúng
   * khoảng cách yêu cầu, nên mọi ảnh bằng chứng trước đây hoặc chụp giữa lúc
   * camera còn bay, hoặc actor lọt ra ngoài khung (review PR #10 vòng 4).
   * Không nằm trong Actor/Scene API, chỉ phơi qua `window.stage.datMay`.
   */
  datMayThu(vt: Vec3, tam: Vec3): void {
    this.theoOwner = null;
    this.tamTuBay = null;
    this.bossDaXoay = true;
    this.camera.position.set(vt[0], vt[1], vt[2]);
    this.controls.target.set(tam[0], tam[1], tam[2]);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  cameraPreset(name: string): void {
    if (!(PRESET_MAY as readonly string[]).includes(name)) {
      throw new Error(`Không có góc máy "${name}". Có: ${PRESET_MAY.join(', ')}`);
    }
    this.mayPreset = name;
    this.theoOwner = null;
    if (name === 'theo-owner') {
      // bám nhân vật có controlledBy = 'owner' (không có thì actor đầu tiên)
      const chu =
        [...this.actors.values()].find((nv) => nv.dieuKhienBoi === 'owner') ??
        [...this.actors.values()][0];
      if (!chu) throw new Error('Chưa có nhân vật nào để camera bám theo');
      this.theoOwner = chu.id;
      this.bossDaXoay = true;
      this.tamTuBay = null;
      return;
    }
    if (name === 'toan-canh') {
      this.bossDaXoay = false;
      this.tamTuBay = { vt: MAY_NGANG.vt.clone(), tam: MAY_NGANG.tam.clone() };
      return;
    }
    if (name === 'truoc-mat') {
      // chính diện, thấy trọn người: lấy hộp bao của actor đầu tiên rồi lùi
      // camera đủ xa theo đúng hướng mặt nhân vật đang nhìn tới.
      const nv = [...this.actors.values()][0];
      this.bossDaXoay = true;
      if (!nv) {
        this.tamTuBay = {
          vt: new THREE.Vector3(0, 1.1, 3.2),
          tam: new THREE.Vector3(0, 0.9, 0),
        };
        return;
      }
      nv.goc.updateMatrixWorld(true);
      const hop = new THREE.Box3().setFromObject(nv.goc);
      const giua = (hop.min.y + hop.max.y) / 2;
      const cao = Math.max(0.6, hop.max.y - hop.min.y);
      const xa = cao * 1.45 + 0.35;
      // hướng mặt THẬT: clip nền xoay hông nên chỉ lấy `goc.rotation.y` là
      // lệch — lấy quay thế giới của xương hips rồi bỏ phần ngẩng/nghiêng.
      const hips = nv.vrm.humanoid?.getNormalizedBoneNode('hips');
      const q = (hips ?? nv.goc).getWorldQuaternion(new THREE.Quaternion());
      const truoc = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      truoc.y = 0;
      if (truoc.lengthSq() < 1e-4) truoc.set(Math.sin(nv.goc.rotation.y), 0, Math.cos(nv.goc.rotation.y));
      const huong = truoc.normalize().multiplyScalar(xa);
      this.tamTuBay = {
        vt: new THREE.Vector3(nv.goc.position.x, giua + cao * 0.1, nv.goc.position.z).add(huong),
        tam: new THREE.Vector3(nv.goc.position.x, giua, nv.goc.position.z),
      };
      return;
    }
    if (name === 'hop') {
      this.bossDaXoay = true;
      this.tamTuBay = {
        vt: new THREE.Vector3(0, 2.3, 4.2),
        tam: new THREE.Vector3(0, 1.1, 0.4),
      };
      return;
    }
    /**
     * D1 (Issue #43) — 4 góc máy căn nhà khai TAY (không rơi vào
     * `cameraFocus` chung): offset chéo cố định của `cameraFocus` cộng vào
     * mục tiêu, mà `cua-so`/`bep` nằm sát tường/cửa sổ nam — offset đó đẩy
     * camera xuyên ra ngoài tường. Toạ độ chọn tay, đứng trong nhà, nhìn
     * đúng hướng nội thất của khu đó.
     */
    /*
     * F1 (#56): 3 khung khu đóng lại cho ĐÚNG cụm mới (`docs/f1/so-do.md`).
     * Bản D1b nhắm vào toạ độ D1: khung `bep` ngắm (4,5; 2,6) — nay là giữa
     * cụm bàn ăn, bếp đã sang góc đông-bắc; khung `ban-lam-viec` ngắm x 4,3
     * trong khi bàn đã dời về x 3.
     */
    if (name === 'phong-khach') {
      // đứng phía nam cụm, nhìn chéo tây-bắc: thấy trọn sofa ↔ bàn trà ↔ kệ TV
      this.bossDaXoay = true;
      this.tamTuBay = {
        vt: new THREE.Vector3(-1.5, 1.9, 4.2),
        tam: new THREE.Vector3(-4.9, 0.9, 0.9),
      };
      return;
    }
    if (name === 'ban-lam-viec') {
      // kệ sách + bàn + ghế + bảng ghim trong một khung
      this.bossDaXoay = true;
      this.tamTuBay = {
        vt: new THREE.Vector3(0.5, 1.7, -1.7),
        tam: new THREE.Vector3(2.3, 1.0, -4.5),
      };
      return;
    }
    if (name === 'bep') {
      // đứng trong lòng chữ L, nhìn chéo đông-bắc: thấy CẢ HAI nhánh + tủ lạnh
      this.bossDaXoay = true;
      this.tamTuBay = {
        vt: new THREE.Vector3(4.0, 2.0, 1.1),
        tam: new THREE.Vector3(6.3, 0.95, -3.3),
      };
      return;
    }
    if (name === 'cua-so') {
      this.bossDaXoay = true;
      this.tamTuBay = {
        vt: new THREE.Vector3(-1.0, 1.45, 1.6),
        tam: new THREE.Vector3(-1.0, 1.1, 4.8),
      };
      return;
    }
    this.cameraFocus(name, 3.4);
  }

  /* ------------------------------------------------- A3: màn hình hologram */

  async screenSpawn(p: ThamSoSpawnScreen): Promise<ScreenSnapshot> {
    if (!p.id.trim()) throw new Error('"id" không được rỗng');
    if (this.screens.has(p.id)) throw new Error(`Màn hình "${p.id}" đã có`);

    const mac = MAC_DINH_MAN_HINH[p.id as keyof typeof MAC_DINH_MAN_HINH];
    let pos: THREE.Vector3;
    let rotY: number;
    if (p.at !== undefined) {
      const v = this.viTriMucTieu(p.at);
      if (!v) throw new Error(`Không biết "${String(p.at)}" ở đâu`);
      pos = new THREE.Vector3(v[0], Math.max(1.2, v[1] + 1.35), v[2]);
      rotY = Math.PI; // mặt hướng về phía bục trung tâm / phòng
    } else if (mac) {
      pos = mac.pos;
      rotY = mac.rotY;
    } else {
      pos = new THREE.Vector3(0, 1.75, -1.0 - this.screens.size * 0.6);
      rotY = 0;
    }

    const mh = new ManHinh(p.id, p.size ?? mac?.size ?? 0.6, pos, rotY, p.tilt ?? 0);
    /**
     * E2 (#48 mục 3) — **đặt đúng lên mặt bàn**, không nổi không chìm.
     *
     * Toạ độ ngang vẫn lấy từ bảng bố cục (`bo-cuc.ts`), nhưng chiều cao mặt
     * bàn thì KHÔNG đoán được từ bảng: model Kenney được chuẩn hoá theo
     * `rong`/`cao` lúc dựng phòng, nên mặt trên thật chỉ biết sau khi đo khối
     * trong cảnh. Đo xong thì hạ chân màn hình đúng lên mặt đó.
     */
    if (p.at === undefined && mac?.doTren) {
      const mat = this.matTrenKhoi(mac.doTren);
      if (mat !== null) {
        mh.group.position.y = mat + mh.beDuoi();
        this.doDungManHinh.set(p.id, { block: mac.doTren, surfaceY: tronMm(mat) });
        // chỗ "đậu" cũng phải là chỗ ĐÃ hạ, không thì `screen.focus` bay về
        // lại đúng cái độ cao lơ lửng cũ.
        mh.docked.pos.y = mh.group.position.y;
      }
    }
    this.scene.add(mh.group);
    this.screens.set(p.id, mh);
    return this.snapScreen(mh);
  }

  screenRemove(id: string): void {
    const mh = this.screens.get(id);
    if (!mh) throw new Error(`Không có màn hình "${id}"`);
    this.scene.remove(mh.group);
    mh.dispose();
    this.screens.delete(id);
    this.doDungManHinh.delete(id);
  }

  /**
   * Mặt TRÊN (y lớn nhất) của một khối nội thất đã dựng, tính bằng mét —
   * `null` khi chưa dựng phòng (test chạy sân khấu giả) hoặc không có khối.
   * `phong.ts` đặt tên nhóm mỗi khối là `khoi:<id>` (nguồn sự thật duy nhất).
   */
  private matTrenKhoi(id: string): number | null {
    const g = this.scene.getObjectByName(`khoi:${id}`);
    if (!g) return null;
    const hop = new THREE.Box3().setFromObject(g);
    if (hop.isEmpty()) return null;
    return hop.max.y;
  }

  private manHinh(id: string): ManHinh {
    const mh = this.screens.get(id);
    if (!mh) throw new Error(`Không có màn hình "${id}"`);
    return mh;
  }

  screenShow(id: string, kind: string, content: string): void {
    this.manHinh(id).hien(kind, content);
  }

  screenStartStream(id: string, kind: string): void {
    this.manHinh(id).batDauStream(kind);
  }

  screenAppend(id: string, chunk: string): void {
    this.manHinh(id).noi(chunk);
  }

  screenEndStream(id: string): void {
    this.manHinh(id).ketThucStream();
  }

  screenClear(id: string): void {
    this.manHinh(id).xoa();
  }

  screenContent(id: string): string {
    return this.manHinh(id).noiDung;
  }

  /**
   * Kéo một màn hình ra trước mặt máy quay.
   *
   * Bản cũ đặt cứng tại (0, 1.72, 0.55) — đúng với phòng 7,2 m nhưng sang
   * phòng 16 m (máy lùi xa hơn) thì panel bé xíu, còn ở khung dọc 390 px thì
   * dễ tràn mép. Giờ tính vị trí TỪ máy quay: lấy hfov thật của khung hình
   * hiện tại rồi đặt panel ở khoảng cách sao cho bề ngang panel chiếm ~74 %
   * bề ngang khung — luôn vừa khít, cả 1440×900 lẫn 390×844.
   */
  screenFocus(id: string): Action {
    const mh = this.manHinh(id);
    const dich = this.choPanelTruocMay(mh.beRong());
    const huongMay = new THREE.Vector3()
      .subVectors(this.camera.position, dich)
      .setY(0);
    const rotDich = Math.atan2(huongMay.x, huongMay.z);
    const tu = { pos: mh.group.position.clone(), rot: mh.group.rotation.y };
    const dai = 650;
    let huy = false;
    const batDau = Date.now();
    const hd = hanhDongHenGio(dai, () => {
      if (!huy) {
        mh.group.position.copy(dich);
        mh.group.rotation.y = rotDich;
      }
    });
    const capNhat = () => {
      if (huy) return;
      const t = Math.min(1, (Date.now() - batDau) / dai);
      mh.group.position.lerpVectors(tu.pos, dich, t);
      mh.group.rotation.y = THREE.MathUtils.lerp(tu.rot, rotDich, t);
      if (t < 1) requestAnimationFrame(capNhat);
    };
    requestAnimationFrame(capNhat);
    const cancelGoc = hd.cancel;
    return {
      durationMs: hd.durationMs,
      done: hd.done,
      cancel: () => {
        huy = true;
        cancelGoc();
      },
    };
  }

  /**
   * Điểm đặt panel rộng `beRong` mét sao cho vừa khung hình hiện tại: giải
   * `beRong * 1/0.74 = 2 * d * tan(hfov/2)` ra khoảng cách `d`, rồi đi theo
   * hướng nhìn ngang của máy quay. Nhờ vậy `screen.focus` không tràn khung
   * 390 px (yêu cầu Boss 25/10) mà cũng không bé li ti trên màn rộng.
   */
  private choPanelTruocMay(beRong: number): THREE.Vector3 {
    const vfov = (this.camera.fov * Math.PI) / 180;
    const tanNua = Math.tan(vfov / 2) * this.camera.aspect;
    const d = THREE.MathUtils.clamp(beRong / 0.74 / (2 * tanNua), 1.8, 9);
    // Đi theo TRỤC NHÌN THẬT (có cả thành phần y), không phải hướng ngang: máy
    // đứng cao 4,8 m và chúi xuống, nên nếu đặt panel ở độ cao 1,6 m thì nó rơi
    // xuống mép dưới khung 390 px (ảnh thử 25/10) thay vì nằm giữa khung.
    const truoc = new THREE.Vector3()
      .subVectors(this.controls.target, this.camera.position)
      .normalize();
    const vt = this.camera.position.clone().add(truoc.multiplyScalar(d));
    vt.y = Math.max(1.2, vt.y);
    return vt;
  }

  private snapScreen(mh: ManHinh): ScreenSnapshot {
    const do_ = this.doDungManHinh.get(mh.id) ?? null;
    return {
      id: mh.id,
      pos: [tron(mh.group.position.x), tron(mh.group.position.y), tron(mh.group.position.z)],
      showing: mh.kind,
      streaming: mh.streaming,
      lines: mh.soDong(),
      chars: mh.noiDung.length,
      bottomY: tronMm(mh.group.position.y - mh.beDuoi()),
      restsOn: do_,
    };
  }

  /* ------------------------------------------------------- A3: module + fx */

  moduleBuild(p: ThamSoModuleBuild): Action {
    if (this.props.has(p.id)) throw new Error(`Prop "${p.id}" đã có trên sân khấu`);
    const durationMs = Math.max(400, p.durationMs ?? 2600);

    const obj = dungHinhProp(p.shape);
    obj.name = `prop:${p.id}`;
    obj.visible = false;
    obj.scale.setScalar(0.001);
    this.scene.add(obj);

    const nhan = dungNhanModule(p.label);
    nhan.position.y = 0.2;
    obj.add(nhan);

    const d: DoVat = {
      id: p.id,
      kind: 'module',
      shape: p.shape,
      obj,
      state: { label: p.label, building: true, from: p.from ?? null },
      camBoi: null,
    };
    this.props.set(p.id, d);

    // đích: giữa bục trung tâm, cao ngang tay — nơi vật "rơi vào tay nhân vật"
    const dich = timPlace('buc-trung-tam')!;
    const tamDich = new THREE.Vector3(dich.pos[0], 1.05, dich.pos[2]);
    obj.position.copy(tamDich);

    const nguon = p.from ? this.viTriMucTieu(p.from) : null;
    const tuDiem = nguon
      ? new THREE.Vector3(nguon[0], nguon[1], nguon[2])
      : tamDich.clone().add(new THREE.Vector3(0, 0.6, 0));

    // lấy mẫu thô bề mặt hình đích (toạ độ cục bộ, tâm 0,0,0) — `KetTinh` tự
    // cộng `tamDich` để ra toạ độ thật trong scene, không hardcode hình dạng
    const diemDich = maySurfacePoints((obj as THREE.Mesh).geometry, 400);

    let huy = false;
    const kt = new KetTinh({
      scene: this.scene,
      tu: tuDiem,
      mauChinh: p.shape === 'crystal' || p.shape === 'orb' ? MAU_CYAN : MAU_CAM,
      diemDich,
      tamDich,
      durationMs,
      khiXong: () => {
        if (huy) return;
        obj.visible = true;
        obj.scale.setScalar(1);
        d.state = { ...d.state, building: false };
      },
    });
    this.ketTinhDangChay.set(p.id, kt);

    const done = new Promise<void>((resolve) => {
      const kiemTra = () => {
        if (!this.ketTinhDangChay.has(p.id)) {
          resolve();
          return;
        }
        setTimeout(kiemTra, 40);
      };
      kiemTra();
    });

    return {
      durationMs,
      done,
      cancel: () => {
        huy = true;
        kt.huy();
        this.ketTinhDangChay.delete(p.id);
        // E2 — huỷ giữa đường mà module đã vào tay ai thì phải trả tay người
        // đó về rỗng, không để `dangCam` trỏ vào prop vừa bị xoá.
        if (d.camBoi) {
          const nv = this.actors.get(d.camBoi);
          if (nv) {
            nv.dangCam = null;
            nv.objCam = null;
          }
          d.camBoi = null;
        }
        this.scene.remove(obj);
        this.props.delete(p.id);
      },
    };
  }

  fxPlay(name: string, at?: string | Vec3, durationMs?: number): Action {
    const v = at !== undefined ? this.viTriMucTieu(at) : null;
    const tam = v
      ? new THREE.Vector3(v[0], v[1] + 1.2, v[2])
      : (() => {
          const bt = timPlace('buc-trung-tam')!;
          return new THREE.Vector3(bt.pos[0], 1.3, bt.pos[2]);
        })();

    const hu = taoHieuUng(this.scene, name, tam, durationMs);
    this.fxDangChay.push(hu);
    const dai = durationMs ?? 1000;
    // `hanhDongHenGio` dùng hẹn giờ HUỶ ĐƯỢC (clearTimeout khi cancel) — bản
    // cũ tự tạo setTimeout rời, cancel() không clear nên hẹn giờ vẫn rò và
    // resolve `done` muộn sau khi hành động đã bị cắt (trái bất biến CLAUDE.md).
    return hanhDongHenGio(dai, () => {
      hu.huy();
      this.fxDangChay = this.fxDangChay.filter((x) => x !== hu);
    });
  }

  async reset(): Promise<void> {
    for (const id of [...this.actors.keys()]) this.actorRemove(id);
    for (const id of [...this.props.keys()]) this.propRemove(id);
    for (const id of [...this.screens.keys()]) this.screenRemove(id);
    for (const kt of this.ketTinhDangChay.values()) kt.huy();
    this.ketTinhDangChay.clear();
    for (const hu of this.fxDangChay) hu.huy();
    this.fxDangChay = [];
    this.sceneLight('sang');
    this.bossDaXoay = false;
    this.tamTuBay = { vt: MAY_NGANG.vt.clone(), tam: MAY_NGANG.tam.clone() };
    this.bus.emit('stage.resetting', {});
    this.theoOwner = null;
    await this.actorSpawn({
      id: OWNER.id,
      name: OWNER.ten,
      model: OWNER.model,
      at: 'buc-trung-tam',
      controlledBy: 'owner',
    });
    await this.actorSpawn({
      id: GEN.id,
      name: GEN.ten,
      model: GEN.model,
      at: 'ban-dieu-khien',
      controlledBy: 'agent',
    });
    this.actorIdleStyle(GEN.id, 'cham-chu');
    this.actorLookAt(GEN.id, 'ban-dieu-khien');
    for (const id of Object.keys(MAC_DINH_MAN_HINH)) await this.screenSpawn({ id });
  }

  /* -------------------------------------------------------------- describe */

  describe(): StageState {
    const now = new Date();
    const dsActor = [...this.actors.values()].map((nv) => this.snapActor(nv));
    return {
      version: '0.1',
      time: {
        clock: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        bossPresent: document.visibilityState === 'visible',
        idleSec: Math.round((Date.now() - this.lanCuoiBossHoatDong) / 1000),
      },
      actors: dsActor,
      places: this.snapPlaces(dsActor),
      screens: [...this.screens.values()].map((mh) => this.snapScreen(mh)),
      props: [...this.props.values()].map((d) => this.snapProp(d)),
      lastEvents: this.bus.recent(10),
      scene: { light: this.denPreset },
      // C0 (#28) — máy quay LÀ chỗ Sếp đang đứng xem; não cần toạ độ này để
      // biết "quay về phía Sếp" là quay về đâu.
      camera: {
        preset: this.mayPreset,
        pos: [tron(this.camera.position.x), tron(this.camera.position.y), tron(this.camera.position.z)],
      },
      // C0 (#28) — số do bridge báo xuống, sân khấu chỉ đọc lại (`so-nao.ts`)
      brainConnected: coNao(),
    };
  }

  /**
   * `occupiedBy` lấy từ chính `at` của actor (place gần nhất của người đó), nên
   * một actor không bao giờ bị tính là đang chiếm hai place cùng lúc.
   */
  private snapPlaces(dsActor: ActorSnapshot[]): PlaceSnapshot[] {
    return PLACES.map((p) => ({
      id: p.id,
      pos: p.pos,
      kind: p.kind,
      occupiedBy: dsActor.find((a) => a.at === p.id)?.id ?? null,
    }));
  }

  private snapActor(nv: NhanVat): ActorSnapshot {
    const distances: Record<string, number> = {};
    for (const p of PLACES) {
      distances[p.id] = tron(khoangCach(nv.goc.position, p.pos));
    }
    for (const d of this.props.values()) {
      distances[d.id] = tron(
        khoangCach(nv.goc.position, [d.obj.position.x, d.obj.position.y, d.obj.position.z]),
      );
    }

    // place gần nhất — luôn tính, không phụ thuộc trạng thái
    let ganNhat: string | null = null;
    let gan = Infinity;
    for (const p of PLACES) {
      const kc = Math.min(
        khoangCach(nv.goc.position, p.pos),
        p.standAt ? khoangCach(nv.goc.position, p.standAt) : Infinity,
      );
      if (kc < gan) {
        gan = kc;
        ganNhat = p.id;
      }
    }
    // `at` chỉ có giá trị khi đã đứng yên tại chỗ: đang đi thì luôn null
    const dangDiChuyen = nv.state === 'walking';
    const at = !dangDiChuyen && gan <= BAN_KINH_AT ? ganNhat : null;

    return {
      id: nv.id,
      name: nv.ten,
      pos: [tron(nv.goc.position.x), tron(nv.goc.position.y), tron(nv.goc.position.z)],
      facing: nv.facing,
      at,
      nearest: { place: ganNhat, distance: tron(gan) },
      state: nv.state,
      busy: nv.busy,
      mood: nv.mood,
      expression: nv.bieuCamHienTai,
      /**
       * E2 (#48 mục 3) — **một nguồn sự thật**: `holding` suy ra từ chính
       * bảng prop (`camBoi`), không đọc `nv.dangCam`. Hai cờ song song từng
       * lệch nhau (module bị `moduleBuild().cancel()` xoá khỏi bảng prop mà
       * `dangCam` của nhân vật vẫn trỏ vào nó), nên `describe()` nói một đằng
       * `props[].state.heldBy` nói một nẻo. Giờ hai trường LUÔN khớp vì cùng
       * đọc một chỗ.
       */
      holding: this.propDangCam(nv.id),
      lookingAt: nv.nhinTen,
      distances,
      queued: 0,
      controlledBy: nv.dieuKhienBoi,
      facingTarget: nv.huongVe,
    };
  }

  /** Prop mà actor này đang cầm theo BẢNG PROP (`camBoi`) — nguồn sự thật. */
  private propDangCam(actorId: string): string | null {
    for (const d of this.props.values()) if (d.camBoi === actorId) return d.id;
    return null;
  }

  private snapProp(d: DoVat): PropSnapshot {
    return {
      id: d.id,
      kind: d.kind,
      shape: d.shape,
      at: (d.state.at as string | undefined) ?? null,
      pos: [tron(d.obj.position.x), tron(d.obj.position.y), tron(d.obj.position.z)],
      state: { ...d.state, heldBy: d.camBoi },
    };
  }
}

/* ------------------------------------------------------------- phụ trợ */

function tron(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Tròn tới mm — chiều cao mặt bàn cần 3 số lẻ mới kiểm được "không nổi không chìm". */
function tronMm(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Tên map chứa texture trên vật liệu — dọn hết để không rò GPU memory. */
const TEN_MAP_VAT_LIEU = [
  'map',
  'emissiveMap',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'alphaMap',
  'aoMap',
  'bumpMap',
] as const;

function disposeVatLieu(mat: THREE.Material): void {
  const m = mat as unknown as Record<string, { dispose?: () => void } | undefined>;
  for (const ten of TEN_MAP_VAT_LIEU) m[ten]?.dispose?.();
  mat.dispose();
}

/**
 * Dispose đệ quy cả cây Object3D: geometry + material + texture của mọi
 * mesh/sprite con. Dùng cho `propRemove` — `module.build` gắn thêm sprite
 * nhãn (CanvasTexture riêng) vào prop nên không thể chỉ dispose mesh gốc.
 */
function dispose3D(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const geo = (o as THREE.Mesh | THREE.Sprite).geometry as THREE.BufferGeometry | undefined;
    geo?.dispose();
    const mat = (o as THREE.Mesh | THREE.Sprite).material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    if (Array.isArray(mat)) mat.forEach(disposeVatLieu);
    else if (mat) disposeVatLieu(mat);
  });
}

function khoangCach(a: THREE.Vector3, b: Vec3 | readonly number[]): number {
  const dx = a.x - (b[0] ?? 0);
  const dz = a.z - (b[2] ?? 0);
  return Math.sqrt(dx * dx + dz * dz);
}

/** Cảm xúc (tên emote) → biểu cảm VRM gần nhất. A2 thay bằng gói đầy đủ. */
function bieuCamTuCamXuc(emotion: string): string {
  const bang: Record<string, string> = {
    vui: 'happy',
    'rat-vui': 'happy',
    'dong-y': 'happy',
    chao: 'happy',
    'thanh-cong': 'happy',
    buon: 'sad',
    'tu-choi': 'sad',
    'that-bai': 'sad',
    gian: 'angry',
    'ngac-nhien': 'surprised',
    'boi-roi': 'surprised',
    met: 'relaxed',
    'suy-nghi': 'neutral',
    'ra-lenh': 'neutral',
    'cham-chu': 'neutral',
  };
  if (bang[emotion]) return bang[emotion];
  return (BIEU_CAM as readonly string[]).includes(emotion) ? emotion : 'neutral';
}

/**
 * Hình khối cho prop A1: đủ để lệnh chạy thật và nhìn ra vật thể.
 * A3 thay bằng model + hiệu ứng kết tinh.
 */
function dungHinhProp(shape: string): THREE.Mesh {
  const mau: Record<string, number> = {
    book: 0xd7a35c,
    cube: 0x8fb8e8,
    tool: 0x9aa4b2,
    crystal: 0x9be8e0,
    orb: 0xe8a0c8,
  };
  const mat = new THREE.MeshStandardMaterial({
    color: mau[shape] ?? 0x8fb8e8,
    roughness: 0.3,
    metalness: 0.15,
    emissive: new THREE.Color(mau[shape] ?? 0x8fb8e8).multiplyScalar(0.6),
    emissiveIntensity: 0.9,
  });

  let geo: THREE.BufferGeometry;
  switch (shape) {
    case 'book':
      geo = new RoundedBoxGeometry(0.2, 0.26, 0.05, 2, 0.012);
      break;
    case 'crystal':
      geo = new THREE.OctahedronGeometry(0.13, 0);
      break;
    case 'orb':
      geo = new THREE.SphereGeometry(0.12, 24, 16);
      break;
    case 'tool':
      geo = new THREE.CylinderGeometry(0.035, 0.055, 0.26, 12);
      break;
    default:
      geo = new RoundedBoxGeometry(0.18, 0.18, 0.18, 3, 0.02);
  }
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Nhãn chữ nổi trên module (sprite luôn quay về camera) — spec 3.4b: "emissive + nhãn". */
function dungNhanModule(label: string): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(6,16,20,0.78)';
  g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = 'rgba(95,224,255,0.9)';
  g.lineWidth = 3;
  g.strokeRect(2, 2, cv.width - 4, cv.height - 4);
  g.fillStyle = '#eafcff';
  g.font = '600 28px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label.slice(0, 18), cv.width / 2, cv.height / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(0.5, 0.125, 1);
  return sp;
}
