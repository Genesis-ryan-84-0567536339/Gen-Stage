/**
 * nhanvat.ts — một nhân vật VRM trên sân khấu, có **máy trạng thái** rõ ràng
 * (`idle | walking | sitting | playing | speaking | emoting | building`) đúng
 * theo spec mục 1b, và mọi hành động trả về `Action` để dispatcher xếp hàng.
 *
 * Hoạt ảnh A1 làm thủ công (procedural) trên xương humanoid: chưa có file
 * chuyển động thật — A2 thay bằng thư viện retarget VRMA, giữ nguyên tên clip
 * nên lệnh và UI không phải sửa.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { Action, ActorState } from '../api/types';
import { BIEU_CAM, DAI_CLIP } from './noi-dung';
import {
  hanhDong,
  hanhDongHenGio,
  hanhDongXongNgay,
  type HanhDongCoTay,
} from './hanh-dong';
import { DINH_NGHIA_EMOTE } from '../behavior/emotes';
import { phatAmNgan } from '../behavior/am-thanh';
import { IDLE_STYLES, THONG_SO_IDLE, type IdleStyle } from '../behavior/idle-styles';

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

/**
 * Chibi hoá nhân vật bằng bone scale (spec A2 mục 4): phóng đầu, rút thân —
 * không cần model chibi riêng, Boss thay bằng VRM chibi thật lúc nào cũng được
 * vì đây chỉ là hệ số nhân lên xương sẵn có, không đụng mesh/skin.
 */
const TY_LE_CHIBI: Partial<Record<TenXuong, number>> = {
  head: 1.38,
  neck: 0.74,
  chest: 0.78,
  upperChest: 0.8,
  spine: 0.8,
  hips: 0.88,
  leftUpperArm: 0.76,
  rightUpperArm: 0.76,
  leftLowerArm: 0.78,
  rightLowerArm: 0.78,
  leftHand: 1.08,
  rightHand: 1.08,
  leftUpperLeg: 0.68,
  rightUpperLeg: 0.68,
  leftLowerLeg: 0.7,
  rightLowerLeg: 0.7,
  leftFoot: 1.05,
  rightFoot: 1.05,
};

/** Tay buông xuống bao nhiêu radian so với T-pose. */
const TAY_BUONG = 1.26;
/** Tốc độ đi mặc định (m/s). */
export const TOC_DO_DI = 0.95;

type TenXuong = Parameters<NonNullable<VRM['humanoid']>['getNormalizedBoneNode']>[0];

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
}

/** Một chuyến đi, nội suy theo đồng hồ thật. */
interface ChuyenDi {
  tu: THREE.Vector3;
  den: THREE.Vector3;
  batDau: number;
  dai: number;
  hd: HanhDongCoTay;
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
  readonly goc: THREE.Object3D;
  /** Mục tiêu cho `vrm.lookAt`. */
  readonly diemNhin = new THREE.Object3D();

  /** Tên mục tiêu đang nhìn, để `stage.describe` trả về. */
  nhinTen: string | null = 'camera';
  /** Mã prop đang cầm. */
  dangCam: string | null = null;
  /** Tay cầm. */
  tayCam: 'left' | 'right' = 'right';
  /** Tâm trạng — đổi khi chạy xong một `actor.emote`, tự rã về "binh-thuong". */
  mood = 'binh-thuong';
  private hanMood = Infinity;

  /** Kiểu đứng chờ (`actor.idleStyle`). */
  idleKieu: IdleStyle = 'binh-thuong';

  // nhìn quanh khi idle (lớp hành vi nhỏ, không chiếm thân)
  private nhinQuanhHan = 0;
  private nhinQuanhYaw = 0;
  private nhinQuanhPitch = 0;
  private nhinQuanhYawMuc = 0;
  private nhinQuanhPitchMuc = 0;

  /**
   * Giây trôi qua theo **đồng hồ thật**, không cộng dồn `dt`.
   *
   * Lý do: máy yếu (hoặc trình duyệt headless lúc kiểm thử) tụt xuống vài khung
   * hình/giây; nếu đo bằng `dt` cộng dồn thì một bước đi 4 giây có thể kéo 40
   * giây thật, tức `durationMs` trả cho agent thành lời nói dối. Mọi hành động
   * có thời lượng vì vậy nội suy theo đồng hồ, chỉ phần làm mượt mới dùng `dt`.
   */
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

  // clip
  private clip: ClipDangChay | null = null;

  // ngồi
  private dangNgoi = false;

  /**
   * Hành động đang **chiếm thân** (đi / xoay / clip / ngồi / đứng / nói).
   *
   * Đây là nguồn sự thật DUY NHẤT của `state`: còn `viec` thì `state` khác
   * `idle`, hết `viec` thì về `idle`/`sitting`. Mọi hẹn giờ đều kiểm "mình còn
   * là `viec` hiện tại không" trước khi ghi trạng thái, nên một hành động bị
   * cắt không bao giờ ghi đè trạng thái của hành động mới.
   */
  private viec: HanhDongCoTay | null = null;

  // nói
  private noiConLai = 0;
  /** Chữ đang hiện trên bong bóng (null = không hiện). */
  bongBong: string | null = null;
  private hanBongBong = 0;
  private hdBong: HanhDongCoTay | null = null;

  /** Đồ vật đang gắn vào tay (do World gán). */
  objCam: THREE.Object3D | null = null;

  constructor(id: string, ten: string, vrm: VRM, chibi = true) {
    this.id = id;
    this.ten = ten;
    this.vrm = vrm;
    this.goc = vrm.scene;
    this.goc.name = `actor:${id}`;

    const phienBan = (vrm.meta as { metaVersion?: string }).metaVersion;
    if (phienBan === '0') VRMUtils.rotateVRM0(vrm);

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
    this.datDangDung();
    if (chibi) this.apDungChibi();
  }

  static async nap(
    id: string,
    ten: string,
    duongDan: string,
    chibi = true,
  ): Promise<NhanVat> {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(duongDan);
    const vrm = gltf.userData.vrm as VRM;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.combineMorphs(vrm);
    return new NhanVat(id, ten, vrm, chibi);
  }

  /**
   * Phóng đầu, rút thân bằng bone scale (spec A2 mục 4) — không cần model
   * chibi riêng. Chạy một lần lúc nạp; `tyLeChest` lưu riêng vì `capNhat` vẽ
   * thở bằng cách GHI ĐÈ scale của `chest` mỗi khung hình (phải nhân thêm hệ
   * số chibi vào đó, không thì thở xong là mất chibi).
   */
  private tyLeChest = 1;
  private apDungChibi(): void {
    for (const [xuong, ty] of Object.entries(TY_LE_CHIBI)) {
      this.xuong(xuong as TenXuong)?.scale.setScalar(ty!);
    }
    this.tyLeChest = TY_LE_CHIBI.chest ?? 1;
  }

  /* ----------------------------------------------------------- đọc trạng thái */

  get state(): ActorState {
    return this.trangThai;
  }

  /** Có hành động chiếm thân đang chạy không. */
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

  /* ------------------------------------------------------------- hành động */

  /** Nhận một hành động mới làm chủ thân: cắt hành động cũ trước. */
  private batDauViec(hd: HanhDongCoTay, trangThai: ActorState): void {
    this.viec = hd;
    this.trangThai = trangThai;
  }

  /** Trả thân về trạng thái nghỉ — chỉ khi `hd` vẫn là hành động hiện tại. */
  private traViec(hd: HanhDongCoTay): void {
    if (this.viec !== hd) return;
    this.viec = null;
    this.trangThai = this.dangNgoi ? 'sitting' : 'idle';
  }

  /** Cắt hành động đang chiếm thân (nếu có). */
  private huyViec(): void {
    const cu = this.viec;
    if (!cu) return;
    cu.cancel();
    if (this.viec === cu) {
      this.viec = null;
      this.trangThai = this.dangNgoi ? 'sitting' : 'idle';
    }
  }

  /** Đi tới một điểm trên sàn. Tới nơi đúng `durationMs` đã hứa. */
  diToi(v: THREE.Vector3, speed?: number): Action {
    this.huyViec();
    this.dangNgoi = false;

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
    this.di = { tu, den, batDau: bayGio(), dai, hd };
    this.batDauViec(hd, 'walking');
    return hd;
  }

  /**
   * Xoay người về một hướng (độ) hoặc một điểm.
   * `chiemThan = false` dành cho việc tự chỉnh hướng sau khi đi tới nơi — nó
   * không được làm actor "bận" thêm sau khi lệnh `moveTo` đã xong.
   */
  xoayVe(muc: THREE.Vector3 | number, chiemThan = true): Action {
    if (chiemThan) this.huyViec();
    this.xoay?.hd.cancel();
    const goc =
      typeof muc === 'number'
        ? (muc * Math.PI) / 180
        : Math.atan2(muc.x - this.goc.position.x, muc.z - this.goc.position.z);

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
    const dai = (DAI_CLIP[ten] ?? 1500) / Math.max(0.1, speed);

    if (ten === 'idle') {
      this.huyViec();
      this.clip = null;
      this.dangNgoi = false;
      return hanhDongXongNgay(DAI_CLIP.idle);
    }
    if (ten === 'sit') return this.ngoi();
    if (ten === 'stand') return this.dungLen();

    this.huyViec();
    let hd!: HanhDongCoTay;
    hd = hanhDong(loop ? 0 : dai, () => {
      this.clip = null;
      this.traViec(hd);
    });
    this.clip = { ten, batDau: bayGio(), dai, loop, hd };
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

  /** Clip thô theo tên tự do (emote dùng, không qua danh sách `CLIPS`). */
  private chayClipTho(ten: string, dai: number, manh = 1): HanhDongCoTay {
    this.huyViec();
    let hd!: HanhDongCoTay;
    hd = hanhDong(dai, () => {
      this.clip = null;
      this.traViec(hd);
    });
    this.clip = { ten, batDau: bayGio(), dai, loop: false, hd, manh };
    this.batDauViec(hd, 'emoting');
    return hd;
  }

  /**
   * Cảm xúc trọn gói (spec mục 3.2b): mặt + chuỗi chuyển động cơ thể + âm
   * ngắn + (tuỳ chọn) nói — một lệnh, không ghép tay nhiều lệnh.
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
      doc(say);
    }

    const hd = this.chayClipTho(`emote:${ten}`, dai, manh);
    void hd.done.then(() => {
      if (say) dungDoc();
      const moodMoi = MOOD_TU_EMOTE[ten];
      if (moodMoi) {
        this.mood = moodMoi;
        this.hanMood = this.t + 10 + Math.random() * 4;
      }
    });
    return hd;
  }

  ngoi(): Action {
    this.huyViec();
    this.dangNgoi = true;
    // dáng ngồi đạt được bằng nội suy trong capNhat; hẹn giờ huỷ được, và bị
    // cắt giữa chừng thì đứng lại chứ không kẹt ở trạng thái "đang ngồi"
    let hd!: HanhDongCoTay;
    hd = hanhDongHenGio(DAI_CLIP.sit!, (biHuy) => {
      if (biHuy) this.dangNgoi = false;
      this.traViec(hd);
    });
    this.batDauViec(hd, 'playing');
    return hd;
  }

  dungLen(): Action {
    this.huyViec();
    if (!this.dangNgoi) return hanhDongXongNgay(0);
    this.dangNgoi = false;
    let hd!: HanhDongCoTay;
    hd = hanhDongHenGio(DAI_CLIP.stand!, () => this.traViec(hd));
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
    // chỉ xoá đúng câu của mình: hẹn cũ không được xoá oan bong bóng mới
    const hd = hanhDongHenGio(ms, () => {
      if (this.bongBong === chu) this.bongBong = null;
    });
    this.hdBong = hd;
    return hd;
  }

  /**
   * Nói: bong bóng chữ + nhép miệng giả theo độ dài chữ + giọng trình duyệt
   * nếu có (không chặn). A2 thay bằng TTS thật + cử chỉ theo cảm xúc.
   */
  noi(chu: string, voice?: string): Action {
    this.huyViec();
    this.hdBong?.cancel();
    const ms = uocThoiLuongNoi(chu);
    this.bongBong = chu;
    this.hanBongBong = this.t + ms / 1000;
    this.noiConLai = ms / 1000;

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

  /** Dừng mọi hành động, về idle (giữ nguyên dáng ngồi nếu đang ngồi). */
  dung(): void {
    this.huyViec();
    this.xoay?.hd.cancel();
    this.xoay = null;
    this.hdBong?.cancel();
    this.hdBong = null;
    this.di = null;
    this.clip = null;
    this.noiConLai = 0;
    this.bongBong = null;
    dungDoc();
    this.trangThai = this.dangNgoi ? 'sitting' : 'idle';
  }

  /* ---------------------------------------------------------------- update */

  private xuong(ten: TenXuong) {
    return this.vrm.humanoid?.getNormalizedBoneNode(ten) ?? null;
  }

  private datDangDung() {
    const tayT = this.xuong('leftUpperArm');
    const tayP = this.xuong('rightUpperArm');
    if (tayT) tayT.rotation.set(0, 0, -TAY_BUONG);
    if (tayP) tayP.rotation.set(0, 0, TAY_BUONG);
  }

  capNhat(dt: number): void {
    const nay = bayGio();
    this.t = (nay - this.t0) / 1000;
    const t = this.t;

    // tâm trạng tạm (sau actor.emote) tự rã về "binh-thuong"
    if (t >= this.hanMood) {
      this.mood = 'binh-thuong';
      this.hanMood = Infinity;
    }
    const st = THONG_SO_IDLE[this.idleKieu];
    const moodSo = NHAN_MOOD[this.mood] ?? NHAN_MOOD['binh-thuong']!;

    /* --- reset xương về dáng đứng --- */
    this.datDangDung();
    const x = {
      spine: this.xuong('spine'),
      chest: this.xuong('chest') ?? this.xuong('upperChest'),
      neck: this.xuong('neck'),
      head: this.xuong('head'),
      chanT: this.xuong('leftUpperLeg'),
      chanP: this.xuong('rightUpperLeg'),
      ongT: this.xuong('leftLowerLeg'),
      ongP: this.xuong('rightLowerLeg'),
      canhT: this.xuong('leftLowerArm'),
      canhP: this.xuong('rightLowerArm'),
      tayT: this.xuong('leftUpperArm'),
      tayP: this.xuong('rightUpperArm'),
      banTayT: this.xuong('leftHand'),
      banTayP: this.xuong('rightHand'),
    };
    for (const b of [
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
      x.banTayT,
      x.banTayP,
    ]) {
      b?.rotation.set(0, 0, 0);
    }
    if (x.chest) x.chest.scale.setScalar(this.tyLeChest);

    /* --- xoay người theo lệnh turnTo (nội suy theo đồng hồ thật) --- */
    if (this.xoay) {
      const x = this.xoay;
      const u = Math.min(1, (nay - x.batDau) / x.dai);
      this.goc.rotation.y = x.tu + (x.den - x.tu) * muot(u);
      if (u >= 1) {
        this.xoay = null;
        if (x.chiemThan) this.traViec(x.hd);
        x.hd.xong();
      }
    }

    /* --- đi lại: nội suy theo đồng hồ thật, tới nơi đúng durationMs đã hứa --- */
    let dangDi = false;
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
        // quay người về hướng đi
        const goc = Math.atan2(d.den.x - d.tu.x, d.den.z - d.tu.z);
        let lech = goc - this.goc.rotation.y;
        while (lech > Math.PI) lech -= Math.PI * 2;
        while (lech < -Math.PI) lech += Math.PI * 2;
        this.goc.rotation.y += lech * Math.min(1, dt * 7);
      }
    }

    /* --- dáng đi / dáng đứng cơ bản --- */
    if (dangDi) {
      const s = Math.sin(this.phaBuoc);
      const c = Math.cos(this.phaBuoc);
      if (x.chanT) x.chanT.rotation.x = s * 0.52;
      if (x.chanP) x.chanP.rotation.x = -s * 0.52;
      if (x.ongT) x.ongT.rotation.x = Math.max(0, -s) * 0.6;
      if (x.ongP) x.ongP.rotation.x = Math.max(0, s) * 0.6;
      if (x.tayT) x.tayT.rotation.x = -s * 0.42;
      if (x.tayP) x.tayP.rotation.x = s * 0.42;
      if (x.canhT) x.canhT.rotation.x = -0.22 - Math.max(0, -s) * 0.3;
      if (x.canhP) x.canhP.rotation.x = -0.22 - Math.max(0, s) * 0.3;
      if (x.spine) x.spine.rotation.z = c * 0.035;
      this.goc.position.y = Math.abs(s) * 0.022;
    } else if (this.dangNgoi) {
      // dáng ngồi: hạ người, gập hông và đầu gối
      this.goc.position.y = THREE.MathUtils.lerp(this.goc.position.y, -0.32, Math.min(1, dt * 6));
      const g = 1;
      if (x.chanT) x.chanT.rotation.x = 1.42 * g;
      if (x.chanP) x.chanP.rotation.x = 1.42 * g;
      if (x.ongT) x.ongT.rotation.x = -1.5 * g;
      if (x.ongP) x.ongP.rotation.x = -1.5 * g;
      if (x.spine) x.spine.rotation.x = 0.08;
      if (x.canhT) x.canhT.rotation.x = -0.35;
      if (x.canhP) x.canhP.rotation.x = -0.35;
    } else {
      this.goc.position.y = THREE.MathUtils.lerp(this.goc.position.y, 0, Math.min(1, dt * 8));
      const bien = st.dungDua * moodSo.dungDua;
      const lac = Math.sin(t * 0.9);
      if (x.spine) x.spine.rotation.z = lac * 0.018 * bien;
      if (x.tayT) x.tayT.rotation.x = Math.sin(t * 0.8) * 0.05 * bien;
      if (x.tayP) x.tayP.rotation.x = Math.sin(t * 0.8 + 1.2) * 0.05 * bien;
      if (x.canhT) x.canhT.rotation.x = -0.18;
      if (x.canhP) x.canhP.rotation.x = -0.18;

      /* --- đổi chân: trọng tâm chuyển dần qua lại, không bao giờ đứng
         im một dáng — hai dao động lệch tần số để không lặp máy móc. */
      const chu1 = (2 * Math.PI) / st.doiChan;
      const chu2 = (2 * Math.PI) / (st.doiChan * 1.73);
      const doiChan = (Math.sin(t * chu1) * 0.6 + Math.sin(t * chu2 + 1.1) * 0.4) * bien;
      if (x.chanT) x.chanT.rotation.z += doiChan * 0.045;
      if (x.chanP) x.chanP.rotation.z -= doiChan * 0.045;
      if (x.ongT) x.ongT.rotation.x += Math.max(0, doiChan) * 0.08;
      if (x.ongP) x.ongP.rotation.x += Math.max(0, -doiChan) * 0.08;
      if (x.spine) x.spine.rotation.z += doiChan * 0.012;
    }

    /* --- dáng tâm trạng/kiểu idle: vai hạ hay nhô, đầu cúi hay ngẩng — áp
       mọi lúc (cả khi đi/ngồi/nói), không chỉ lúc đứng im. */
    if (x.chest) x.chest.rotation.z += st.gapVai;
    if (x.neck) x.neck.rotation.x += st.cuiDau;

    /* --- thở --- */
    const tho = Math.sin(t * 1.55 * st.tho * moodSo.tho);
    if (x.spine) x.spine.rotation.x += tho * 0.028;
    if (x.chest) {
      x.chest.rotation.x += tho * 0.022;
      const p = (1 + tho * 0.012) * this.tyLeChest;
      x.chest.scale.set(p, (1 + tho * 0.008) * this.tyLeChest, p);
    }
    if (x.neck) x.neck.rotation.x += -tho * 0.016;

    /* --- nhìn quanh khi idle thật (không chiếm thân, không cãi lệnh
       actor.lookAt khi Boss/agent đã chỉ một mục tiêu cụ thể) --- */
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

    /* --- gật đầu + cử chỉ nhịp tay khi đang nói (actor.say) --- */
    if (this.trangThai === 'speaking') {
      if (x.head) {
        x.head.rotation.x += Math.sin(t * 5.1) * 0.045 + Math.sin(t * 1.6) * 0.03;
        x.head.rotation.z += Math.sin(t * 0.85) * 0.035;
      }
      const nhip = Math.max(0, Math.sin(t * 3.1)) ** 3;
      if (Math.sin(t * 0.37) > 0) {
        if (x.canhP) x.canhP.rotation.x -= nhip * 0.22;
        if (x.tayP) x.tayP.rotation.z -= nhip * 0.07;
      } else {
        if (x.canhT) x.canhT.rotation.x -= nhip * 0.22;
        if (x.tayT) x.tayT.rotation.z += nhip * 0.07;
      }
    }

    /* --- clip thủ công đè lên --- */
    if (this.clip) {
      const c = this.clip;
      const troi = (nay - c.batDau) / 1000;
      const u = c.loop ? ((troi * 1000) % c.dai) / c.dai : Math.min(1, (troi * 1000) / c.dai);
      apDungClip(c.ten, u, troi, x, c.manh ?? 1);
      if (!c.loop && troi * 1000 >= c.dai) {
        const hd = c.hd;
        this.clip = null;
        this.traViec(hd);
        hd.xong();
      }
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

      // nhép miệng giả: dao động nhanh khi đang nói, hé nhẹ khi im
      if (this.noiConLai > 0) {
        this.noiConLai -= dt;
        const m = (Math.sin(t * 19) * 0.5 + 0.5) * 0.55 + Math.abs(Math.sin(t * 7)) * 0.25;
        em.setValue('aa', m);
      } else {
        em.setValue('aa', Math.max(0, Math.sin(t * 0.7) - 0.86) * 1.4);
      }
    }

    if (this.hanBongBong && t > this.hanBongBong) {
      this.bongBong = null;
      this.hanBongBong = 0;
    }

    this.vrm.update(dt);
  }
}

/** Vào/ra mềm cho nội suy (ease-in-out). */
function muot(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

/* ---------------------------------------------------------- clip thủ công */

type BoXuong = Record<string, THREE.Object3D | null>;

/**
 * Áp một clip lên xương. `u` = 0…1 tiến độ clip, `t` = giây đã chạy, `manh`
 * = độ mạnh 0–1 (chỉ `actor.emote` dùng, clip thường luôn 1).
 *
 * Không tìm được nguồn chuyển động thật miễn phí khớp đủ 13 clip + 15 emote
 * của spec trong thời gian làm A2 (xem `scripts/fetch-anim.sh` — có mirror
 * CC0 thật của Quaternius nhưng bộ clip của họ là hành động/chiến đấu, không
 * có wave/clap/nod/think…) nên **toàn bộ vẫn thủ tục**, làm kỹ hơn A1: mỗi
 * emote một dáng riêng, không dùng chung một vài khuôn cho 15 cái.
 */
function apDungClip(ten: string, u: number, t: number, x: BoXuong, manh = 1): void {
  // vào/ra mềm để không bị giật ở hai đầu clip
  const w = Math.sin(Math.min(1, u) * Math.PI) * 0.35 + 0.65;

  if (ten.startsWith('emote:')) {
    apDungEmote(ten.slice('emote:'.length), u, t, x, w, manh);
    return;
  }

  switch (ten) {
    case 'wave': {
      const v = Math.sin(t * 11);
      x.tayT?.rotation.set(0.12, 0, 0.62);
      x.canhT?.rotation.set(v * 0.42, 0, 1.18);
      x.banTayT?.rotation.set(0, 0, v * 0.38);
      break;
    }
    case 'nod': {
      const v = Math.sin(t * 6.2);
      if (x.head) x.head.rotation.x += v * 0.3 * w;
      if (x.neck) x.neck.rotation.x += v * 0.12 * w;
      break;
    }
    case 'shake': {
      const v = Math.sin(t * 7.5);
      if (x.head) x.head.rotation.y += v * 0.38 * w;
      if (x.neck) x.neck.rotation.y += v * 0.14 * w;
      break;
    }
    case 'think': {
      // tay chống cằm, mắt nhìn lên, gật gù chậm
      x.tayP?.rotation.set(-0.1, 0, 1.05);
      x.canhP?.rotation.set(-1.75, 0, 0.5);
      if (x.head) {
        x.head.rotation.x += -0.22 * w;
        x.head.rotation.y += Math.sin(t * 1.6) * 0.1 * w;
      }
      break;
    }
    case 'clap': {
      const v = Math.abs(Math.sin(t * 8));
      x.tayT?.rotation.set(0.1, 0, 0.95);
      x.tayP?.rotation.set(0.1, 0, -0.95);
      x.canhT?.rotation.set(-1.25, 0, 0.5 + v * 0.3);
      x.canhP?.rotation.set(-1.25, 0, -0.5 - v * 0.3);
      break;
    }
    case 'point': {
      x.tayP?.rotation.set(-1.12 * w, 0, 1.2 - 0.9 * w);
      x.canhP?.rotation.set(-0.12, 0, 0);
      if (x.head) x.head.rotation.y += -0.12 * w;
      break;
    }
    case 'celebrate': {
      const v = Math.sin(t * 9);
      x.tayT?.rotation.set(-0.2, 0, -0.35 + 0.1 * v);
      x.tayP?.rotation.set(-0.2, 0, 0.35 - 0.1 * v);
      x.canhT?.rotation.set(-0.5, 0, 0.3);
      x.canhP?.rotation.set(-0.5, 0, -0.3);
      if (x.spine) x.spine.rotation.x += -0.1 * w;
      break;
    }
    case 'type': {
      const v = Math.sin(t * 16);
      x.tayT?.rotation.set(0.25, 0, 1.08);
      x.tayP?.rotation.set(0.25, 0, -1.08);
      x.canhT?.rotation.set(-1.35 + v * 0.06, 0, 0.3);
      x.canhP?.rotation.set(-1.35 - v * 0.06, 0, -0.3);
      if (x.head) x.head.rotation.x += 0.18 * w;
      break;
    }
    case 'sleep': {
      if (x.head) x.head.rotation.z += 0.3 * w;
      if (x.neck) x.neck.rotation.x += 0.16 * w;
      if (x.spine) x.spine.rotation.x += 0.1 * w;
      break;
    }
    case 'walk':
      // dáng đi đã có trong capNhat; clip "walk" chỉ nhấn thêm nhịp tay
      if (x.tayT) x.tayT.rotation.x += Math.sin(t * 7.5) * -0.2;
      if (x.tayP) x.tayP.rotation.x += Math.sin(t * 7.5) * 0.2;
      break;
    default:
      break;
  }
}

/**
 * Dáng cơ thể của 15 emote (spec mục 3.2b) — mặt đã do `actor.emote` đặt
 * riêng (`datBieuCam`), đây chỉ là phần cơ thể. `manh` 0–1 nhân biên độ,
 * `w` vào/ra mềm hai đầu đã tính sẵn ở `apDungClip`.
 */
function apDungEmote(ten: string, u: number, t: number, x: BoXuong, w: number, manh: number): void {
  const m = w * manh;
  switch (ten) {
    case 'vui': {
      const v = Math.sin(t * 9);
      x.tayT?.rotation.set(-0.3 * m, 0, -0.5 + 0.15 * v * m);
      x.tayP?.rotation.set(-0.3 * m, 0, 0.5 - 0.15 * v * m);
      x.canhT?.rotation.set(-0.3, 0, 0.25);
      x.canhP?.rotation.set(-0.3, 0, -0.25);
      if (x.spine) x.spine.rotation.x += -0.06 * m + Math.sin(t * 9) * 0.03 * m;
      break;
    }
    case 'rat-vui': {
      // 2 tay giơ cao quá đầu vẫy (z nâng gần đứng), lắc người + quay đầu
      const v = Math.sin(t * 13);
      x.tayT?.rotation.set(-0.2 * m, 0, -1.9 * m + v * 0.12);
      x.tayP?.rotation.set(-0.2 * m, 0, 1.9 * m - v * 0.12);
      x.canhT?.rotation.set(-0.2, 0, 0.15 + v * 0.1);
      x.canhP?.rotation.set(-0.2, 0, -0.15 - v * 0.1);
      if (x.spine) x.spine.rotation.x += -0.1 * m + Math.abs(Math.sin(t * 13)) * 0.06 * m;
      if (x.head) x.head.rotation.y += Math.sin(t * 6) * 0.2 * m;
      break;
    }
    case 'buon': {
      // tay buông nguyên dáng đứng (không chạm tayT/tayP) — chỉ vai sụp, đầu cúi
      if (x.spine) x.spine.rotation.x += 0.22 * m;
      if (x.chest) x.chest.rotation.x += 0.1 * m;
      if (x.neck) x.neck.rotation.x += 0.2 * m;
      if (x.head) x.head.rotation.x += 0.18 * m;
      break;
    }
    case 'ngac-nhien': {
      // tay đưa lên che miệng: nâng cánh tay bằng z (giống "wave" nhưng cao
      // hơn), gập cẳng tay mạnh để bàn tay gập về phía mặt — không dùng x để
      // "nâng" (x ở rig này là đưa tay ra TRƯỚC, không phải lên)
      if (x.spine) x.spine.rotation.x += -0.14 * m;
      x.tayP?.rotation.set(-0.15 * m, 0, 1.55 * m);
      x.canhP?.rotation.set(-2.05, 0, 0.25);
      if (x.head) x.head.rotation.x += -0.1 * m;
      break;
    }
    case 'gian': {
      // nắm tay trước ngực + dậm chân + lắc đầu (khoanh tay thật dễ gãy
      // khớp với rig này nên đổi sang nắm tay — vẫn rõ "giận", an toàn hơn)
      x.tayT?.rotation.set(-0.2 * m, 0, 0.55);
      x.tayP?.rotation.set(-0.2 * m, 0, -0.55);
      x.canhT?.rotation.set(-1.7, 0, 0.35);
      x.canhP?.rotation.set(-1.7, 0, -0.35);
      const dam = Math.max(0, Math.sin(t * 6)) ** 4;
      if (x.chanP) x.chanP.rotation.x += -dam * 0.12 * m;
      if (x.head) x.head.rotation.y += Math.sin(t * 7) * 0.16 * m;
      break;
    }
    case 'suy-nghi': {
      x.tayP?.rotation.set(-0.1, 0, 1.05);
      x.canhP?.rotation.set(-1.75, 0, 0.5);
      if (x.head) {
        x.head.rotation.x += -0.2 * m;
        x.head.rotation.y += Math.sin(t * 1.4) * 0.12 * m;
      }
      break;
    }
    case 'dong-y': {
      // 2 gật dứt khoát trong trọn thời lượng clip (không phụ thuộc loop)
      const v = Math.sin(Math.min(1, u) * Math.PI * 4);
      if (x.head) x.head.rotation.x += v * 0.32 * m;
      if (x.neck) x.neck.rotation.x += v * 0.12 * m;
      x.tayP?.rotation.set(-0.75 * m, 0, 0.3 * m);
      x.canhP?.rotation.set(-1.5, 0, 0.1);
      break;
    }
    case 'tu-choi': {
      const v = Math.sin(t * 7);
      if (x.head) x.head.rotation.y += v * 0.32 * m;
      x.tayT?.rotation.set(-0.15 * m, 0, 0.85 * m);
      x.canhT?.rotation.set(-0.5 + v * 0.1, 0, 0.15);
      break;
    }
    case 'chao': {
      const v = Math.sin(t * 10);
      x.tayT?.rotation.set(0.12, 0, 0.62);
      x.canhT?.rotation.set(v * 0.4, 0, 1.15);
      if (x.spine) x.spine.rotation.x += 0.12 * m;
      if (x.neck) x.neck.rotation.x += 0.08 * m;
      break;
    }
    case 'ra-lenh': {
      x.tayP?.rotation.set(-1.1 * m, 0, 0.3);
      x.canhP?.rotation.set(-0.1, 0, 0);
      if (x.spine) x.spine.rotation.x += -0.05 * m;
      if (x.head) x.head.rotation.x += -0.04 * m;
      break;
    }
    case 'thanh-cong': {
      // đấm tay lên trời: z nâng tay gần như thẳng đứng, x gần 0 (không đưa
      // ra trước), cẳng tay gần thẳng để nắm đấm ở trên cao
      const v = Math.sin(t * 10);
      x.tayP?.rotation.set(-0.25 * m, 0, 2.05 * m);
      x.canhP?.rotation.set(-0.1, 0, 0.05);
      if (x.spine) x.spine.rotation.x += -0.1 * m + Math.max(0, v) * 0.05 * m;
      break;
    }
    case 'that-bai': {
      // ôm đầu, ngồi thụp (gập gối, không rời chân khỏi sàn) — hai tay nâng
      // lên ôm đầu bằng z (như ngac-nhien, đối xứng hai bên)
      x.tayT?.rotation.set(-0.1 * m, 0, 1.1 * m);
      x.tayP?.rotation.set(-0.1 * m, 0, -1.1 * m);
      x.canhT?.rotation.set(-2.4, 0, 0.35);
      x.canhP?.rotation.set(-2.4, 0, -0.35);
      if (x.chanT) x.chanT.rotation.x += 0.35 * m;
      if (x.chanP) x.chanP.rotation.x += 0.35 * m;
      if (x.ongT) x.ongT.rotation.x += -0.4 * m;
      if (x.ongP) x.ongP.rotation.x += -0.4 * m;
      if (x.spine) x.spine.rotation.x += 0.25 * m;
      if (x.head) x.head.rotation.x += 0.15 * m;
      break;
    }
    case 'boi-roi': {
      // gãi đầu: tay nâng cao bằng z, cẳng tay gập mạnh để bàn tay chạm đầu
      const v = Math.sin(t * 2.2);
      x.tayP?.rotation.set(-0.15 * m, 0, 1.7 * m);
      x.canhP?.rotation.set(-2.1, 0, 0.3);
      if (x.head) x.head.rotation.y += v * 0.2 * m;
      break;
    }
    case 'met': {
      // vươn vai rồi ngáp: tay mở ra ở nửa đầu, đầu ngả sau ở nửa cuối
      const vuon = Math.sin(Math.min(1, u) * Math.PI);
      x.tayT?.rotation.set(-0.9 * vuon * m, 0, -0.6 * vuon);
      x.tayP?.rotation.set(-0.9 * vuon * m, 0, 0.6 * vuon);
      x.canhT?.rotation.set(-0.3, 0, 0.15);
      x.canhP?.rotation.set(-0.3, 0, -0.15);
      if (x.head) x.head.rotation.x += -0.28 * m * Math.sin(Math.min(1, u * 1.4) * Math.PI);
      if (x.spine) x.spine.rotation.x += -0.08 * m * vuon;
      break;
    }
    case 'cham-chu': {
      // một tay gõ nhịp trước bàn — CHỈ một bên (bài học từ bản trước: đặt cả
      // 2 tay cùng dấu x làm tay xoè rộng ra ngoài thay vì ra trước, hiện
      // chưa rõ vì sao — một bên như "point"/"wave" (đã kiểm bằng ảnh, đúng
      // hướng) thì an toàn, còn bên kia giữ dáng đứng mặc định)
      const v = Math.sin(t * 7);
      x.tayP?.rotation.set(-0.85 + v * 0.03, 0, 0.3);
      x.canhP?.rotation.set(-1.3, 0, 0.1);
      if (x.head) x.head.rotation.x += 0.14 * m;
      break;
    }
    default:
      break;
  }
}

/* -------------------------------------------------------------- lời nói */

/**
 * Ước thời lượng nói theo độ dài chữ: ~13 ký tự/giây tiếng Việt, cộng 600 ms
 * đệm, kẹp trong 900–9000 ms. Dùng số ước thay vì đo giọng thật để `durationMs`
 * luôn trả về ngay và kịch bản chạy giống nhau trên mọi máy.
 */
export function uocThoiLuongNoi(chu: string): number {
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
    // trình duyệt chặn giọng (chưa có tương tác người dùng) — bỏ qua, không log lỗi
  }
}

function dungDoc(): void {
  try {
    layGiong()?.cancel();
  } catch {
    /* bỏ qua */
  }
}
