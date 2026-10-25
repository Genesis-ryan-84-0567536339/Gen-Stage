/**
 * chuyen-dong.ts — **chuyển động thật**: nạp bộ clip CC0 rồi retarget sang bộ
 * xương `vrm.humanoid`, phát bằng `THREE.AnimationMixer` với crossfade thật.
 *
 * ## Nguồn
 *
 * Quaternius "Universal Animation Library" — **CC0 1.0**, lấy qua mirror
 * GitHub `J-Ponzo/gltf-universal-animation-library` (itch.io chặn curl bằng
 * Cloudflare challenge). Tải bằng `bash scripts/fetch-anim.sh` về
 * `public/anim/thu-vien.gltf` (gitignore — không commit asset). Giấy phép ghi
 * trong `assets/LICENSES.md` mục 3.
 *
 * ## Cách retarget (và vì sao đúng)
 *
 * Bộ xương nguồn là Rigify (`DEF-*`), bộ xương đích là `vrm.humanoid`
 * **normalized**: mọi xương normalized có `rotation = 0` ở tư thế gốc và hệ
 * trục trùng hệ thế giới (xem `three-vrm`: `VRMHumanoidRig._setupTransforms`
 * chỉ gán `position`). Vì vậy:
 *
 *   1. Lấy tư thế gốc của rig nguồn từ chính clip **`A_TPose`** có trong bộ
 *      (đã kiểm: ở clip này `y` bàn tay ≈ `y` vai, lệch 0.017 → đúng T-pose).
 *   2. Mỗi khung hình, với mỗi xương: `delta = qWorld(anim) · qWorld(A_TPose)⁻¹`
 *      — tức "xương này đã quay bao nhiêu so với tư thế gốc", trong hệ thế giới.
 *   3. Xương normalized của VRM nhận `local = delta(cha)⁻¹ · delta(con)`, với
 *      "cha" là xương humanoid gần nhất phía trên. Vì tư thế gốc là identity,
 *      quay thế giới của xương đích đúng bằng `delta` — khớp không bị vặn.
 *
 * Hướng trục: rig nguồn có bàn tay TRÁI ở +X và ngón chân hướng +Z, **cùng
 * quy ước VRM 1.0** nên không phải quay 180° quanh Y. Model VRM 0.x thì
 * `VRMUtils.rotateVRM0()` (gọi trong `nhanvat.ts`) đã quay 180° trước, bộ
 * xương normalized sau đó theo đúng quy ước VRM 1.0 → dùng chung đường này.
 *
 * Bỏ qua `position` của `hips` (clip trong bộ đều tại chỗ; di chuyển do
 * `NhanVat.diToi` lo, cộng thêm sẽ trượt chân).
 *
 * ## Clip spec nào không có trong bộ CC0
 *
 * Bộ 46 clip của Quaternius là action/RPG, không có wave/clap/nod/shake/think/
 * point/sleep/type. Những cái đó = **clip gần nhất làm nền + lớp cử chỉ thủ
 * tục nhỏ** (`cu-chi.ts`), ghi rõ trong bảng `DANG_NEN` / `NEN_CLIP` /
 * `NEN_EMOTE` dưới đây.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VRM } from '@pixiv/three-vrm';

type TenXuong = Parameters<NonNullable<VRM['humanoid']>['getNormalizedBoneNode']>[0];

/** Xương Rigify của bộ CC0 → xương `vrm.humanoid`. */
const ANH_XA_XUONG: Array<[string, TenXuong]> = [
  ['DEF-hips', 'hips'],
  ['DEF-spine.001', 'spine'],
  ['DEF-spine.002', 'chest'],
  ['DEF-spine.003', 'upperChest'],
  ['DEF-neck', 'neck'],
  ['DEF-head', 'head'],
  ['DEF-shoulder.L', 'leftShoulder'],
  ['DEF-upper_arm.L', 'leftUpperArm'],
  ['DEF-forearm.L', 'leftLowerArm'],
  ['DEF-hand.L', 'leftHand'],
  ['DEF-shoulder.R', 'rightShoulder'],
  ['DEF-upper_arm.R', 'rightUpperArm'],
  ['DEF-forearm.R', 'rightLowerArm'],
  ['DEF-hand.R', 'rightHand'],
  ['DEF-thigh.L', 'leftUpperLeg'],
  ['DEF-shin.L', 'leftLowerLeg'],
  ['DEF-foot.L', 'leftFoot'],
  ['DEF-toe.L', 'leftToes'],
  ['DEF-thigh.R', 'rightUpperLeg'],
  ['DEF-shin.R', 'rightLowerLeg'],
  ['DEF-foot.R', 'rightFoot'],
  ['DEF-toe.R', 'rightToes'],
  // ngón tay: có thì tốt (nắm đấm, bàn tay mở), thiếu thì bỏ qua
  ['DEF-thumb.01.L', 'leftThumbMetacarpal'],
  ['DEF-thumb.02.L', 'leftThumbProximal'],
  ['DEF-thumb.03.L', 'leftThumbDistal'],
  ['DEF-f_index.01.L', 'leftIndexProximal'],
  ['DEF-f_index.02.L', 'leftIndexIntermediate'],
  ['DEF-f_index.03.L', 'leftIndexDistal'],
  ['DEF-f_middle.01.L', 'leftMiddleProximal'],
  ['DEF-f_middle.02.L', 'leftMiddleIntermediate'],
  ['DEF-f_middle.03.L', 'leftMiddleDistal'],
  ['DEF-f_ring.01.L', 'leftRingProximal'],
  ['DEF-f_ring.02.L', 'leftRingIntermediate'],
  ['DEF-f_ring.03.L', 'leftRingDistal'],
  ['DEF-f_pinky.01.L', 'leftLittleProximal'],
  ['DEF-f_pinky.02.L', 'leftLittleIntermediate'],
  ['DEF-f_pinky.03.L', 'leftLittleDistal'],
  ['DEF-thumb.01.R', 'rightThumbMetacarpal'],
  ['DEF-thumb.02.R', 'rightThumbProximal'],
  ['DEF-thumb.03.R', 'rightThumbDistal'],
  ['DEF-f_index.01.R', 'rightIndexProximal'],
  ['DEF-f_index.02.R', 'rightIndexIntermediate'],
  ['DEF-f_index.03.R', 'rightIndexDistal'],
  ['DEF-f_middle.01.R', 'rightMiddleProximal'],
  ['DEF-f_middle.02.R', 'rightMiddleIntermediate'],
  ['DEF-f_middle.03.R', 'rightMiddleDistal'],
  ['DEF-f_ring.01.R', 'rightRingProximal'],
  ['DEF-f_ring.02.R', 'rightRingIntermediate'],
  ['DEF-f_ring.03.R', 'rightRingDistal'],
  ['DEF-f_pinky.01.R', 'rightLittleProximal'],
  ['DEF-f_pinky.02.R', 'rightLittleIntermediate'],
  ['DEF-f_pinky.03.R', 'rightLittleDistal'],
];

/** Xương humanoid → xương humanoid cha (để tính `delta(cha)⁻¹ · delta(con)`). */
const CHA: Partial<Record<string, TenXuong>> = {
  spine: 'hips',
  chest: 'spine',
  upperChest: 'chest',
  neck: 'upperChest',
  head: 'neck',
  leftShoulder: 'upperChest',
  leftUpperArm: 'leftShoulder',
  leftLowerArm: 'leftUpperArm',
  leftHand: 'leftLowerArm',
  rightShoulder: 'upperChest',
  rightUpperArm: 'rightShoulder',
  rightLowerArm: 'rightUpperArm',
  rightHand: 'rightLowerArm',
  leftUpperLeg: 'hips',
  leftLowerLeg: 'leftUpperLeg',
  leftFoot: 'leftLowerLeg',
  leftToes: 'leftFoot',
  rightUpperLeg: 'hips',
  rightLowerLeg: 'rightUpperLeg',
  rightFoot: 'rightLowerLeg',
  rightToes: 'rightFoot',
};
const NGON_CHA: Array<[RegExp, string]> = [
  [/^(left|right)(Thumb|Index|Middle|Ring|Little)Proximal$/, 'Hand'],
];

function xuongCha(ten: string): TenXuong | null {
  const t = CHA[ten];
  if (t) return t;
  for (const [re] of NGON_CHA) {
    if (re.test(ten)) return (ten.startsWith('left') ? 'leftHand' : 'rightHand') as TenXuong;
  }
  const m = /^(left|right)(Thumb|Index|Middle|Ring|Little)(Intermediate|Distal)$/.exec(ten);
  if (m) {
    const truoc = m[3] === 'Distal' ? 'Intermediate' : m[2] === 'Thumb' ? 'Metacarpal' : 'Proximal';
    return `${m[1]}${m[2]}${truoc}` as TenXuong;
  }
  if (/^(left|right)ThumbProximal$/.test(ten)) {
    return `${ten.slice(0, 5)}ThumbMetacarpal` as TenXuong;
  }
  return null;
}

/* ---------------------------------------------------------- bảng dáng nền */

export interface DangNen {
  /** Tên clip trong bộ CC0. */
  nguon: string;
  lap: boolean;
  /** Nhân tốc độ phát (1 = nguyên bản). */
  tocDo?: number;
}

/**
 * 12 dáng nền lấy từ clip CC0 thật. Mọi clip/emote của spec đều dựa trên một
 * trong số này (bảng `NEN_CLIP` / `NEN_EMOTE`), phần còn thiếu do `cu-chi.ts`
 * bù bằng lớp thủ tục nhỏ.
 */
export const DANG_NEN: Record<string, DangNen> = {
  idle: { nguon: 'Idle_Loop', lap: true },
  walk: { nguon: 'Walk_Loop', lap: true },
  sit: { nguon: 'Sitting_Enter', lap: false },
  stand: { nguon: 'Sitting_Exit', lap: false },
  'ngoi-giu': { nguon: 'Sitting_Idle_Loop', lap: true },
  noi: { nguon: 'Idle_Talking_Loop', lap: true },
  'noi-ngoi': { nguon: 'Sitting_Talking_Loop', lap: true },
  nhay: { nguon: 'Dance_Loop', lap: true },
  ban: { nguon: 'Driving_Loop', lap: true },
  dam: { nguon: 'Punch_Cross', lap: true },
  thup: { nguon: 'Crouch_Idle_Loop', lap: true },
  giat: { nguon: 'Hit_Chest', lap: false, tocDo: 0.5 },
};

/**
 * Clip spec → dáng nền. "bù" = phần `cu-chi.ts` thêm vào vì bộ CC0 không có.
 *
 * | clip | nền CC0 | bù thủ tục |
 * | --- | --- | --- |
 * | idle / walk / sit / stand | Idle_Loop / Walk_Loop / Sitting_Enter / Sitting_Exit | — (clip thật diễn đủ) |
 * | wave / clap / nod / shake | Idle_Talking_Loop | vẫy · vỗ · gật · lắc |
 * | think / point | Idle_Loop | chống cằm · chỉ tay |
 * | celebrate | Dance_Loop | hai tay quá đầu |
 * | type | Driving_Loop | gõ ngón |
 * | sleep | Sitting_Idle_Loop | đầu ngả, thở chậm |
 */
export const NEN_CLIP: Record<string, string> = {
  idle: 'idle',
  walk: 'walk',
  sit: 'sit',
  stand: 'stand',
  wave: 'noi',
  clap: 'noi',
  nod: 'noi',
  shake: 'noi',
  think: 'idle',
  point: 'idle',
  celebrate: 'nhay',
  type: 'ban',
  sleep: 'ngoi-giu',
};

/**
 * Emote → dáng nền.
 *
 * | emote | nền CC0 | bù thủ tục |
 * | --- | --- | --- |
 * | vui / rat-vui / thanh-cong | Dance_Loop | — · hai tay quá đầu · đấm tay lên trời |
 * | gian | Punch_Cross | lắc đầu, dậm chân |
 * | that-bai | Crouch_Idle_Loop | ôm đầu |
 * | ngac-nhien | Hit_Chest (×0.5) | tay che miệng |
 * | cham-chu | Driving_Loop | gõ nhịp tay |
 * | dong-y / tu-choi / chao | Idle_Talking_Loop | ngón cái · xua tay · vẫy tay |
 * | buon / suy-nghi / ra-lenh / boi-roi / met | Idle_Loop | sụp vai · chống cằm · chỉ tay · gãi đầu · vươn vai |
 */
export const NEN_EMOTE: Record<string, string> = {
  vui: 'nhay',
  'rat-vui': 'nhay',
  buon: 'idle',
  'ngac-nhien': 'giat',
  gian: 'dam',
  'suy-nghi': 'idle',
  'dong-y': 'noi',
  'tu-choi': 'noi',
  chao: 'noi',
  'ra-lenh': 'idle',
  'thanh-cong': 'nhay',
  'that-bai': 'thup',
  'boi-roi': 'idle',
  met: 'idle',
  'cham-chu': 'ban',
};

/** Thời gian crossfade giữa hai dáng nền (giây) — spec vòng 2: 0,25 s thật. */
export const CROSSFADE = 0.25;

const FPS_BAKE = 30;
const CLIP_GOC = 'A_TPose';

/* --------------------------------------------------------------- nạp kho */

/** Kho clip nguồn, nạp một lần cho cả app. */
export class KhoChuyenDong {
  private constructor(
    private readonly goc: THREE.Object3D,
    private readonly clips: Map<string, THREE.AnimationClip>,
    /** `DEF-*` → node trong rig nguồn. */
    private readonly nodeNguon: Map<string, THREE.Object3D>,
  ) {}

  /** Tên clip CC0 có trong kho (cho nhật ký/bằng chứng). */
  get tenClip(): string[] {
    return [...this.clips.keys()];
  }

  static async nap(url: string): Promise<KhoChuyenDong> {
    const gltf = await new GLTFLoader().loadAsync(url);
    const clips = new Map<string, THREE.AnimationClip>();
    for (const c of gltf.animations) clips.set(c.name, c);
    if (!clips.has(CLIP_GOC)) {
      throw new Error(
        `Bộ chuyển động thiếu clip tư thế gốc "${CLIP_GOC}" — không retarget an toàn được`,
      );
    }
    // GLTFLoader "làm sạch" tên node (bỏ dấu chấm): `DEF-upper_arm.L` thành
    // `DEF-upper_armL`. Lưu cả hai kiểu tên để tra cứu không hụt — hụt ở đây
    // là mất sạch tay/chân mà vẫn chạy (đúng lỗi gặp lúc làm vòng 2).
    const nodeNguon = new Map<string, THREE.Object3D>();
    gltf.scene.traverse((o) => nodeNguon.set(o.name, o));
    return new KhoChuyenDong(gltf.scene, clips, nodeNguon);
  }

  /**
   * Nướng (bake) toàn bộ `DANG_NEN` thành `AnimationClip` chạy được trên bộ
   * xương normalized của `vrm`. Trả về map theo khoá của `DANG_NEN`.
   */
  taoCho(vrm: VRM): Map<string, THREE.AnimationClip> {
    const hum = vrm.humanoid;
    const ra = new Map<string, THREE.AnimationClip>();
    if (!hum) return ra;

    // cặp xương dùng được trên model này
    const cap: Array<{ nguon: THREE.Object3D; ten: string; dich: THREE.Object3D }> = [];
    for (const [tenNguon, tenDich] of ANH_XA_XUONG) {
      const n =
        this.nodeNguon.get(tenNguon) ??
        this.nodeNguon.get(THREE.PropertyBinding.sanitizeNodeName(tenNguon));
      const d = hum.getNormalizedBoneNode(tenDich);
      if (n && d) cap.push({ nguon: n, ten: tenDich as string, dich: d });
    }
    if (cap.length < 10) {
      console.info(
        `[Gen-Stage] Chỉ khớp ${cap.length}/${ANH_XA_XUONG.length} xương với bộ chuyển động — ` +
          'bỏ clip thật, dùng chuyển động thủ tục.',
      );
      return ra;
    }

    const mixer = new THREE.AnimationMixer(this.goc);

    // 1) tư thế gốc: nghịch đảo quay-thế-giới ở clip A_TPose
    const nghichGoc = new Map<string, THREE.Quaternion>();
    this.datTuThe(mixer, this.clips.get(CLIP_GOC)!, 0);
    for (const c of cap) {
      nghichGoc.set(c.ten, c.nguon.getWorldQuaternion(new THREE.Quaternion()).invert());
    }

    // 2) bake từng dáng nền
    for (const [khoa, dn] of Object.entries(DANG_NEN)) {
      const clip = this.clips.get(dn.nguon);
      if (!clip) continue;
      ra.set(khoa, this.bake(mixer, clip, khoa, cap, nghichGoc));
    }

    mixer.stopAllAction();
    return ra;
  }

  private datTuThe(mixer: THREE.AnimationMixer, clip: THREE.AnimationClip, t: number): void {
    mixer.stopAllAction();
    const act = mixer.clipAction(clip);
    act.reset().play();
    mixer.setTime(t);
    this.goc.updateMatrixWorld(true);
  }

  private bake(
    mixer: THREE.AnimationMixer,
    clip: THREE.AnimationClip,
    khoa: string,
    cap: Array<{ nguon: THREE.Object3D; ten: string; dich: THREE.Object3D }>,
    nghichGoc: Map<string, THREE.Quaternion>,
  ): THREE.AnimationClip {
    const soKhung = Math.max(2, Math.round(clip.duration * FPS_BAKE) + 1);
    const thoiGian = new Float32Array(soKhung);
    /** delta theo khung hình, cho mọi xương. */
    const delta = new Map<string, THREE.Quaternion[]>();
    for (const c of cap) delta.set(c.ten, []);

    for (let i = 0; i < soKhung; i++) {
      const t = (i / (soKhung - 1)) * clip.duration;
      thoiGian[i] = t;
      this.datTuThe(mixer, clip, t);
      for (const c of cap) {
        const q = c.nguon.getWorldQuaternion(new THREE.Quaternion());
        delta.get(c.ten)!.push(q.multiply(nghichGoc.get(c.ten)!));
      }
    }

    const tracks: THREE.KeyframeTrack[] = [];
    const tam = new THREE.Quaternion();
    const xoan = new THREE.Quaternion();
    for (const c of cap) {
      const ds = delta.get(c.ten)!;
      const chaTen = xuongCha(c.ten);
      const dsCha = chaTen ? delta.get(chaTen as string) : undefined;
      const gt = new Float32Array(soKhung * 4);
      for (let i = 0; i < soKhung; i++) {
        if (dsCha) tam.copy(dsCha[i]!).invert().multiply(ds[i]!);
        else tam.copy(ds[i]!);
        if (c.ten === 'hips') {
          // Bỏ phần XOAY QUANH TRỤC ĐỨNG của hông: hướng mặt là việc của
          // `actor.turnTo` / `facing` trong `stage.describe`, không phải của
          // clip. Không bỏ thì clip idle tự quay người ~40° và `facing` nói dối.
          xoan.set(0, tam.y, 0, tam.w);
          if (xoan.lengthSq() < 1e-8) xoan.identity();
          else xoan.normalize();
          tam.multiply(xoan.invert());
        }
        gt[i * 4] = tam.x;
        gt[i * 4 + 1] = tam.y;
        gt[i * 4 + 2] = tam.z;
        gt[i * 4 + 3] = tam.w;
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${c.dich.name}.quaternion`, thoiGian, gt));
    }
    return new THREE.AnimationClip(`nen:${khoa}`, clip.duration, tracks);
  }
}

/* ------------------------------------------------- lớp nền của một nhân vật */

/**
 * Lớp nền của MỘT nhân vật: giữ `AnimationMixer`, đổi dáng nền bằng
 * `crossFadeTo` 0,25 s thật.
 */
export class LopNen {
  private readonly mixer: THREE.AnimationMixer;
  private readonly clips: Map<string, THREE.AnimationClip>;
  private hienTai: string | null = null;
  private act: THREE.AnimationAction | null = null;

  constructor(vrm: VRM, clips: Map<string, THREE.AnimationClip>) {
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    this.clips = clips;
  }

  get coClip(): boolean {
    return this.clips.size > 0;
  }

  get dangDung(): string | null {
    return this.hienTai;
  }

  /**
   * Đổi dáng nền. Gọi lại cùng khoá thì KHÔNG khởi động lại (trừ khi
   * `lamLai`), nên clip lặp chạy liền mạch.
   */
  dat(khoa: string, tocDo = 1, lamLai = false): void {
    const clip = this.clips.get(khoa);
    if (!clip) return;
    if (this.hienTai === khoa && !lamLai) {
      if (this.act) this.act.timeScale = tocDo * (DANG_NEN[khoa]?.tocDo ?? 1);
      return;
    }
    const dn = DANG_NEN[khoa];
    const moi = this.mixer.clipAction(clip);
    moi.enabled = true;
    moi.setLoop(dn?.lap ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    moi.clampWhenFinished = true;
    moi.timeScale = tocDo * (dn?.tocDo ?? 1);
    moi.reset();
    moi.play();
    if (this.act && this.act !== moi) {
      this.act.crossFadeTo(moi, CROSSFADE, false);
    } else {
      moi.fadeIn(CROSSFADE);
    }
    this.act = moi;
    this.hienTai = khoa;
  }

  capNhat(dt: number): void {
    this.mixer.update(dt);
  }

  huy(): void {
    this.mixer.stopAllAction();
  }
}

/* ---------------------------------------------------- nạp kho dùng chung */

let hua: Promise<KhoChuyenDong | null> | null = null;

/**
 * Nạp kho clip (một lần cho cả app). Thiếu file (chưa chạy
 * `scripts/fetch-anim.sh`) → trả `null` và app rơi về chuyển động thủ tục,
 * KHÔNG ném lỗi, không log `console.error`.
 */
export function napKho(url = 'anim/thu-vien.gltf'): Promise<KhoChuyenDong | null> {
  if (!hua) {
    hua = KhoChuyenDong.nap(url).catch(() => {
      console.info(
        '[Gen-Stage] Chưa thấy bộ chuyển động ở public/anim/ — dùng chuyển động thủ tục. ' +
          'Chạy `bash scripts/fetch-anim.sh` để bật clip thật (CC0).',
      );
      return null;
    });
  }
  return hua;
}
