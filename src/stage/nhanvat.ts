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
 * Chibi hoá bằng bone scale (spec A2 mục 4): phóng đầu, rút thân/chân để tỉ
 * lệ đầu/người về khoảng **1/2,5–1/3** (vòng 1 chỉ đạt ~1/4,5 — review PR #10
 * mục 2.4). Mọi hệ số đều `setScalar` (scale ĐỀU, không bóp méo trục) và
 * không có hệ số âm, nên da/tóc không bị răng cưa hay lộn mặt pháp tuyến.
 */
const TY_LE_CHIBI: Partial<Record<TenXuong, number>> = {
  head: 1.76,
  neck: 0.66,
  chest: 0.74,
  upperChest: 0.76,
  spine: 0.74,
  hips: 0.84,
  leftUpperArm: 0.74,
  rightUpperArm: 0.74,
  leftLowerArm: 0.76,
  rightLowerArm: 0.76,
  leftHand: 1.12,
  rightHand: 1.12,
  leftUpperLeg: 0.58,
  rightUpperLeg: 0.58,
  leftLowerLeg: 0.6,
  rightLowerLeg: 0.6,
  leftFoot: 1.05,
  rightFoot: 1.05,
};

/** Tốc độ đi mặc định (m/s). */
export const TOC_DO_DI = 0.95;

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
    this.dungBoXuong();
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
  doXuong(): Record<string, [number, number, number]> & { bbox: number[] } {
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
    const b = new THREE.Box3().setFromObject(this.goc);
    return Object.assign(ra, {
      bbox: [b.min.y, b.max.y, b.min.x, b.max.x].map((v) => +v.toFixed(4)),
    });
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
    this.di = { tu, den, batDau: bayGio(), dai, hd, tocDo };
    this.batDauViec(hd, 'walking');
    return hd;
  }

  /** Xoay người về một hướng (độ) hoặc một điểm. */
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
    const tocDo = Math.max(0.1, speed);
    const dai = (DAI_CLIP[ten] ?? 1500) / tocDo;

    if (ten === 'idle') {
      this.huyViec();
      this.clip = null;
      this.dangNgoi = false;
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

  ngoi(): Action {
    this.huyViec();
    this.dangNgoi = true;
    this.chuyenNgoi = 'sit';
    let hd!: HanhDongCoTay;
    hd = hanhDongHenGio(DAI_CLIP.sit!, (biHuy) => {
      if (biHuy) this.dangNgoi = false;
      if (this.chuyenNgoi === 'sit') this.chuyenNgoi = null;
      this.traViec(hd);
    });
    this.batDauViec(hd, 'playing');
    return hd;
  }

  dungLen(): Action {
    this.huyViec();
    if (!this.dangNgoi) return hanhDongXongNgay(0);
    this.dangNgoi = false;
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
    this.xoay?.hd.cancel();
    this.xoay = null;
    this.hdBong?.cancel();
    this.hdBong = null;
    this.di = null;
    this.clip = null;
    this.noiConLai = 0;
    this.bongBong = null;
    this.nhomNoi = 'binh-thuong';
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

  /** Dáng đứng gốc khi KHÔNG có clip thật: tay buông tự nhiên. */
  private datDangDung() {
    tayBuong(this.xuongBo, 1);
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

    // tâm trạng tạm (sau actor.emote) tự rã về mặc định
    if (t >= this.hanMood) {
      this.mood = MOOD_MAC_DINH;
      this.hanMood = Infinity;
    }
    const st = THONG_SO_IDLE[this.idleKieu];
    const moodSo = NHAN_MOOD[this.mood] ?? NHAN_MOOD[MOOD_MAC_DINH]!;
    const x = this.xuongBo;

    /* --- reset xương về 0 (lớp nền hoặc dáng thủ tục sẽ ghi lại ngay) --- */
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
      x.tayT,
      x.tayP,
      x.banTayT,
      x.banTayP,
    ]) {
      b?.rotation.set(0, 0, 0);
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

    /* --- đi lại: nội suy theo đồng hồ thật, tới nơi đúng durationMs --- */
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
        const goc = Math.atan2(d.den.x - d.tu.x, d.den.z - d.tu.z);
        let lech = goc - this.goc.rotation.y;
        while (lech > Math.PI) lech -= Math.PI * 2;
        while (lech < -Math.PI) lech += Math.PI * 2;
        this.goc.rotation.y += lech * Math.min(1, dt * 7);
      }
    }

    /* --- LỚP 1: nền = clip CC0 thật, crossfade 0,25 s --- */
    const coNen = this.nen?.coClip === true;
    if (coNen && this.nen) {
      const { khoa, tocDo } = this.chonDangNen();
      this.nen.dat(khoa, tocDo);
      this.nen.capNhat(dt);
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

    /* --- độ cao thân: nhún khi đi, hạ xuống khi ngồi --- */
    if (dangDi) {
      this.goc.position.y = Math.abs(Math.sin(this.phaBuoc)) * 0.022;
    } else if (this.dangNgoi) {
      this.goc.position.y = THREE.MathUtils.lerp(this.goc.position.y, -0.32, Math.min(1, dt * 6));
    } else {
      this.goc.position.y = THREE.MathUtils.lerp(this.goc.position.y, 0, Math.min(1, dt * 8));
    }

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
      const w = trongSoCuChi(u, c.loop) * (c.manh ?? 1);
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

/* -------------------------------------------------------------- lời nói */

/**
 * Ước thời lượng nói theo độ dài chữ: ~13 ký tự/giây tiếng Việt, cộng 600 ms
 * đệm, kẹp trong 900–9000 ms.
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
