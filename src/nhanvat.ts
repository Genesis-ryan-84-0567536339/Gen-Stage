/**
 * nhanvat.ts — nạp nhân vật VRM và làm cho nó "sống":
 *  - chớp mắt ngẫu nhiên (expression `blink`)
 *  - thở (nhấp nhô nhẹ xương spine/chest)
 *  - nhìn theo con trỏ / ngón tay (vrm.lookAt.target)
 *  - đổi biểu cảm theo chu kỳ (happy / surprised / neutral)
 *  - đi qua lại giữa 2 bàn, đung đưa tay chân bằng xương humanoid (procedural,
 *    vì chưa có file .vrma miễn phí ổn định — xem assets/LICENSES.md)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

/** Tay buông xuống bao nhiêu radian so với T-pose. */
const TAY_BUONG = 1.26;
/** Tốc độ đi (m/s). */
const TOC_DO_DI = 0.95;

type BieuCam = 'neutral' | 'happy' | 'surprised' | 'relaxed';

export class NhanVat {
  readonly vrm: VRM;
  readonly goc: THREE.Object3D;

  /** Mục tiêu cho lookAt (nhìn theo chuột). */
  readonly diemNhin = new THREE.Object3D();

  private t = 0;

  // chớp mắt
  private hanChop = 1.5;
  private dangChop = -1;

  // biểu cảm
  private bieuCam: BieuCam = 'neutral';
  private manhBieuCam = 0;
  private hanBieuCam = 4;
  private giuBieuCam = 0;

  // vẫy tay
  private vayConLai = 0;

  // đi lại
  private dich: THREE.Vector3 | null = null;
  private phaBuoc = 0;
  private dangDi = false;

  /** Hướng nhìn "trước mặt" của model trong hệ toạ độ cục bộ. */
  private huongTruoc = new THREE.Vector3(0, 0, 1);

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.goc = vrm.scene;

    // VRM 0.x quay ngược 180° so với VRM 1.0 → chuẩn hoá lại.
    const phienBan = (vrm.meta as { metaVersion?: string }).metaVersion;
    if (phienBan === '0') {
      VRMUtils.rotateVRM0(vrm);
    }

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

  static async nap(duongDan: string): Promise<NhanVat> {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(duongDan);
    const vrm = gltf.userData.vrm as VRM;

    // Tối ưu hiệu năng theo hướng dẫn của three-vrm.
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.combineMorphs(vrm);

    return new NhanVat(vrm);
  }

  /** Danh sách tên biểu cảm mà model này thật sự có (để log / kiểm tra). */
  get bieuCamCoSan(): string[] {
    const m = this.vrm.expressionManager;
    return m ? m.expressions.map((e) => e.expressionName) : [];
  }

  private xuong(ten: Parameters<NonNullable<VRM['humanoid']>['getNormalizedBoneNode']>[0]) {
    return this.vrm.humanoid?.getNormalizedBoneNode(ten) ?? null;
  }

  /** Đặt dáng đứng mặc định: tay buông xuống, hơi khép. */
  private datDangDung() {
    const tayT = this.xuong('leftUpperArm');
    const tayP = this.xuong('rightUpperArm');
    if (tayT) tayT.rotation.set(0, 0, -TAY_BUONG);
    if (tayP) tayP.rotation.set(0, 0, TAY_BUONG);
  }

  /* ------------------------------------------------------- hành động */

  vayTay() {
    this.vayConLai = 2.6;
    this.datBieuCam('happy', 0.85, 2.6);
  }

  datBieuCam(ten: BieuCam, manh = 1, giay = 3) {
    this.bieuCam = ten;
    this.manhBieuCam = manh;
    this.giuBieuCam = giay;
    this.hanBieuCam = this.t + giay;
  }

  /** Ra lệnh đi tới một điểm trên sàn. */
  diToi(v: THREE.Vector3) {
    this.dich = v.clone();
  }

  get dangDiChuyen() {
    return this.dangDi;
  }

  /* ---------------------------------------------------------- update */

  capNhat(dt: number) {
    this.t += dt;
    const t = this.t;

    /* --- reset các xương mình điều khiển về dáng đứng --- */
    this.datDangDung();
    const spine = this.xuong('spine');
    const chest = this.xuong('chest') ?? this.xuong('upperChest');
    const neck = this.xuong('neck');
    const chanT = this.xuong('leftUpperLeg');
    const chanP = this.xuong('rightUpperLeg');
    const ongT = this.xuong('leftLowerLeg');
    const ongP = this.xuong('rightLowerLeg');
    const canhT = this.xuong('leftLowerArm');
    const canhP = this.xuong('rightLowerArm');
    const tayT = this.xuong('leftUpperArm');
    const tayP = this.xuong('rightUpperArm');
    const banTayT = this.xuong('leftHand');
    for (const b of [spine, chest, neck, chanT, chanP, ongT, ongP, canhT, canhP, banTayT]) {
      b?.rotation.set(0, 0, 0);
    }

    /* --- đi lại --- */
    this.dangDi = false;
    if (this.dich) {
      const viTri = this.goc.position;
      const d = new THREE.Vector3().subVectors(this.dich, viTri);
      d.y = 0;
      const kc = d.length();
      if (kc < 0.04) {
        this.dich = null;
        this.phaBuoc = 0;
      } else {
        this.dangDi = true;
        d.normalize();

        // quay người về hướng đi (mượt)
        const gocMuon = Math.atan2(d.x, d.z) + (this.huongTruoc.z > 0 ? 0 : Math.PI);
        let lech = gocMuon - this.goc.rotation.y;
        while (lech > Math.PI) lech -= Math.PI * 2;
        while (lech < -Math.PI) lech += Math.PI * 2;
        this.goc.rotation.y += lech * Math.min(1, dt * 7);

        const buoc = Math.min(kc, TOC_DO_DI * dt);
        viTri.addScaledVector(d, buoc);
        this.phaBuoc += dt * 7.5;
      }
    }

    /* --- chân tay: đung đưa khi đi, lắc nhẹ khi đứng --- */
    if (this.dangDi) {
      const s = Math.sin(this.phaBuoc);
      const c = Math.cos(this.phaBuoc);
      if (chanT) chanT.rotation.x = s * 0.52;
      if (chanP) chanP.rotation.x = -s * 0.52;
      if (ongT) ongT.rotation.x = Math.max(0, -s) * 0.6;
      if (ongP) ongP.rotation.x = Math.max(0, s) * 0.6;
      if (tayT) tayT.rotation.x = -s * 0.42;
      if (tayP) tayP.rotation.x = s * 0.42;
      if (canhT) canhT.rotation.x = -0.22 - Math.max(0, -s) * 0.3;
      if (canhP) canhP.rotation.x = -0.22 - Math.max(0, s) * 0.3;
      if (spine) spine.rotation.z = c * 0.035;
      // nhấp nhô thân theo bước
      this.goc.position.y = Math.abs(Math.sin(this.phaBuoc)) * 0.022;
    } else {
      this.goc.position.y = 0;
      const lac = Math.sin(t * 0.9);
      if (spine) spine.rotation.z = lac * 0.018;
      if (tayT) tayT.rotation.x = Math.sin(t * 0.8) * 0.05;
      if (tayP) tayP.rotation.x = Math.sin(t * 0.8 + 1.2) * 0.05;
      if (canhT) canhT.rotation.x = -0.18;
      if (canhP) canhP.rotation.x = -0.18;
    }

    /* --- thở: spine + chest nhấp nhô, kèm phồng nhẹ --- */
    const tho = Math.sin(t * 1.55);
    if (spine) spine.rotation.x += tho * 0.028;
    if (chest) {
      chest.rotation.x += tho * 0.022;
      const p = 1 + tho * 0.012;
      chest.scale.set(p, 1 + tho * 0.008, p);
    }
    if (neck) neck.rotation.x += -tho * 0.016;

    /* --- vẫy tay (ghi đè tay trái) --- */
    if (this.vayConLai > 0) {
      this.vayConLai -= dt;
      const v = Math.sin(t * 11);
      // +Z trên trục Z của xương = nâng tay lên (tư thế nghỉ của VRM là chữ T)
      if (tayT) tayT.rotation.set(0.12, 0, 0.62);
      if (canhT) canhT.rotation.set(v * 0.42, 0, 1.18);
      if (banTayT) banTayT.rotation.set(0, 0, v * 0.38);
    }

    /* --- chớp mắt ngẫu nhiên --- */
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

      /* --- đổi biểu cảm theo chu kỳ --- */
      if (t >= this.hanBieuCam) {
        const vong: BieuCam[] = ['neutral', 'happy', 'neutral', 'surprised', 'relaxed'];
        const ke = vong[Math.floor(Math.random() * vong.length)];
        const manh = ke === 'surprised' ? 0.75 : ke === 'neutral' ? 0 : 0.65;
        this.datBieuCam(ke, manh, 3 + Math.random() * 3);
      }
      // tắt các biểu cảm khác, chỉ bật cái đang chọn (mượt dần)
      for (const ten of ['happy', 'surprised', 'relaxed', 'angry', 'sad'] as const) {
        const muon = ten === this.bieuCam ? this.manhBieuCam : 0;
        const hienTai = em.getValue(ten) ?? 0;
        em.setValue(ten, hienTai + (muon - hienTai) * Math.min(1, dt * 6));
      }
      // mấp môi nhẹ cho đỡ "tượng"
      em.setValue('aa', Math.max(0, Math.sin(t * 0.7) - 0.86) * 1.4);

      void this.giuBieuCam;
    }

    this.vrm.update(dt);
  }
}
