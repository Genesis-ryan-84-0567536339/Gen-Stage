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
import { hanhDong, hanhDongXongNgay, type HanhDongCoTay } from './hanh-dong';

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
  /** Tâm trạng — A2 dùng, A1 giữ "binh-thuong". */
  mood = 'binh-thuong';

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

  // nói
  private noiConLai = 0;
  private hdNoi: HanhDongCoTay | null = null;
  /** Chữ đang hiện trên bong bóng (null = không hiện). */
  bongBong: string | null = null;
  private hanBongBong = 0;
  private hdBong: HanhDongCoTay | null = null;

  /** Đồ vật đang gắn vào tay (do World gán). */
  objCam: THREE.Object3D | null = null;

  constructor(id: string, ten: string, vrm: VRM) {
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
  }

  static async nap(id: string, ten: string, duongDan: string): Promise<NhanVat> {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(duongDan);
    const vrm = gltf.userData.vrm as VRM;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.combineMorphs(vrm);
    return new NhanVat(id, ten, vrm);
  }

  /* ----------------------------------------------------------- đọc trạng thái */

  get state(): ActorState {
    return this.trangThai;
  }

  get busy(): boolean {
    return this.trangThai !== 'idle' && this.trangThai !== 'sitting';
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

  /** Đi tới một điểm trên sàn. Tới nơi đúng `durationMs` đã hứa. */
  diToi(v: THREE.Vector3, speed?: number): Action {
    this.huyDi();
    this.dangNgoi = false;

    const tu = new THREE.Vector3(this.goc.position.x, 0, this.goc.position.z);
    const den = new THREE.Vector3(v.x, 0, v.z);
    const kc = tu.distanceTo(den);
    if (kc < 0.04) return hanhDongXongNgay(0);

    const tocDo = speed && speed > 0 ? speed : TOC_DO_DI;
    const dai = (kc / tocDo) * 1000;
    this.trangThai = 'walking';
    const hd = hanhDong(dai, () => {
      this.di = null;
      this.phaBuoc = 0;
      if (this.trangThai === 'walking') this.trangThai = 'idle';
    });
    this.di = { tu, den, batDau: bayGio(), dai, hd };
    return hd;
  }

  /** Xoay người về một hướng (độ) hoặc một điểm. */
  xoayVe(muc: THREE.Vector3 | number): Action {
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
    const hd = hanhDong(dai, () => {
      this.xoay = null;
    });
    this.xoay = {
      tu: this.goc.rotation.y,
      den: this.goc.rotation.y + lech,
      batDau: bayGio(),
      dai,
      hd,
    };
    return hd;
  }

  /** Chơi một clip. `loop` thì `done` chỉ xong khi bị cắt. */
  choiClip(ten: string, loop = false, speed = 1): Action {
    this.clip?.hd.cancel();
    const dai = (DAI_CLIP[ten] ?? 1500) / Math.max(0.1, speed);

    if (ten === 'idle') {
      this.clip = null;
      this.dangNgoi = false;
      if (!this.busy) this.trangThai = 'idle';
      return hanhDongXongNgay(DAI_CLIP.idle);
    }
    if (ten === 'sit') return this.ngoi();
    if (ten === 'stand') return this.dungLen();

    const hd = hanhDong(loop ? 0 : dai, () => {
      this.clip = null;
      if (this.trangThai === 'playing') this.trangThai = this.dangNgoi ? 'sitting' : 'idle';
    });
    this.clip = { ten, batDau: bayGio(), dai, loop, hd };
    this.trangThai = 'playing';
    return hd;
  }

  ngoi(): Action {
    this.clip?.hd.cancel();
    this.dangNgoi = true;
    const hd = hanhDong(DAI_CLIP.sit!, () => {
      this.trangThai = 'sitting';
    });
    this.trangThai = 'playing';
    // dáng ngồi đạt được bằng nội suy trong capNhat; kết thúc sau đúng thời lượng
    setTimeout(() => {
      this.trangThai = 'sitting';
      hd.xong();
    }, DAI_CLIP.sit);
    return hd;
  }

  dungLen(): Action {
    this.clip?.hd.cancel();
    if (!this.dangNgoi) {
      this.trangThai = 'idle';
      return hanhDongXongNgay(0);
    }
    this.dangNgoi = false;
    const hd = hanhDong(DAI_CLIP.stand!);
    this.trangThai = 'playing';
    setTimeout(() => {
      this.trangThai = 'idle';
      hd.xong();
    }, DAI_CLIP.stand);
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
    const hd = hanhDong(ms, () => {
      this.bongBong = null;
    });
    this.hdBong = hd;
    setTimeout(() => {
      this.bongBong = null;
      hd.xong();
    }, ms);
    return hd;
  }

  /**
   * Nói: bong bóng chữ + nhép miệng giả theo độ dài chữ + giọng trình duyệt
   * nếu có (không chặn). A2 thay bằng TTS thật + cử chỉ theo cảm xúc.
   */
  noi(chu: string, voice?: string): Action {
    this.hdNoi?.cancel();
    const ms = uocThoiLuongNoi(chu);
    this.bongBong = chu;
    this.hanBongBong = this.t + ms / 1000;
    this.noiConLai = ms / 1000;
    this.trangThai = 'speaking';

    doc(chu, voice);

    const hd = hanhDong(ms, () => {
      this.noiConLai = 0;
      this.bongBong = null;
      if (this.trangThai === 'speaking') this.trangThai = this.dangNgoi ? 'sitting' : 'idle';
      dungDoc();
    });
    this.hdNoi = hd;
    setTimeout(() => {
      this.noiConLai = 0;
      this.bongBong = null;
      if (this.trangThai === 'speaking') this.trangThai = this.dangNgoi ? 'sitting' : 'idle';
      hd.xong();
    }, ms);
    return hd;
  }

  /** Dừng mọi hành động, về idle (giữ nguyên dáng ngồi nếu đang ngồi). */
  dung(): void {
    this.huyDi();
    this.xoay?.hd.cancel();
    this.xoay = null;
    this.clip?.hd.cancel();
    this.hdNoi?.cancel();
    this.hdBong?.cancel();
    this.clip = null;
    this.noiConLai = 0;
    this.bongBong = null;
    dungDoc();
    this.trangThai = this.dangNgoi ? 'sitting' : 'idle';
  }

  private huyDi(): void {
    const cu = this.di;
    this.di = null;
    cu?.hd.cancel();
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
    if (x.chest) x.chest.scale.set(1, 1, 1);

    /* --- xoay người theo lệnh turnTo (nội suy theo đồng hồ thật) --- */
    if (this.xoay) {
      const x = this.xoay;
      const u = Math.min(1, (nay - x.batDau) / x.dai);
      this.goc.rotation.y = x.tu + (x.den - x.tu) * muot(u);
      if (u >= 1) {
        this.xoay = null;
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
        if (this.trangThai === 'walking') this.trangThai = 'idle';
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
      const lac = Math.sin(t * 0.9);
      if (x.spine) x.spine.rotation.z = lac * 0.018;
      if (x.tayT) x.tayT.rotation.x = Math.sin(t * 0.8) * 0.05;
      if (x.tayP) x.tayP.rotation.x = Math.sin(t * 0.8 + 1.2) * 0.05;
      if (x.canhT) x.canhT.rotation.x = -0.18;
      if (x.canhP) x.canhP.rotation.x = -0.18;
    }

    /* --- thở --- */
    const tho = Math.sin(t * 1.55);
    if (x.spine) x.spine.rotation.x += tho * 0.028;
    if (x.chest) {
      x.chest.rotation.x += tho * 0.022;
      const p = 1 + tho * 0.012;
      x.chest.scale.set(p, 1 + tho * 0.008, p);
    }
    if (x.neck) x.neck.rotation.x += -tho * 0.016;

    /* --- clip thủ công đè lên --- */
    if (this.clip) {
      const c = this.clip;
      const troi = (nay - c.batDau) / 1000;
      const u = c.loop ? ((troi * 1000) % c.dai) / c.dai : Math.min(1, (troi * 1000) / c.dai);
      apDungClip(c.ten, u, troi, x);
      if (!c.loop && troi * 1000 >= c.dai) {
        const hd = c.hd;
        this.clip = null;
        if (this.trangThai === 'playing') {
          this.trangThai = this.dangNgoi ? 'sitting' : 'idle';
        }
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
          this.hanChop = t + 1.4 + Math.random() * 3.6;
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
 * Áp một clip lên xương. `u` = 0…1 tiến độ clip, `t` = giây đã chạy.
 * A2 thay cả hàm này bằng `AnimationMixer` + file VRMA retarget.
 */
function apDungClip(ten: string, u: number, t: number, x: BoXuong): void {
  // vào/ra mềm để không bị giật ở hai đầu clip
  const w = Math.sin(Math.min(1, u) * Math.PI) * 0.35 + 0.65;

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
