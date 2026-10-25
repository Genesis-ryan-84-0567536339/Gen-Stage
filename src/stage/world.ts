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
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
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
import { dungPhong, haiSuongBuc, MAU_CAM, MAU_CYAN } from './phong';
import { NhanVat, TOC_DO_DI, uocThoiLuongNoi } from './nhanvat';
import {
  BIEU_CAM,
  CLIPS,
  DAI_CLIP,
  EMOTES,
  PLACES,
  PRESET_DEN,
  PRESET_MAY,
  timPlace,
  type DinhNghiaPlace,
} from './noi-dung';
import { noiTiep, hanhDongHenGio } from './hanh-dong';
import { ManHinh, MAC_DINH_MAN_HINH } from './man-hinh';
import { KetTinh, maySurfacePoints } from '../fx/hat-ket-tinh';
import { taoHieuUng, type HieuUng } from '../fx/hieu-ung';

/** Lab viễn tưởng: tông tối, cyan + điểm cam (spec 3.4b). */
const MAU_NEN_LAB = 0x070b10;
/** Bán kính coi là "đang ở" một place. */
const BAN_KINH_AT = 0.9;
export const ACTOR_MAC_DINH = { id: 'lan', ten: 'Lan', model: 'models/avatar.vrm' };

/** FPS trung bình dưới mức này trong > 2 s thì tự tắt bloom. */
const FPS_TU_TAT_BLOOM = 24;

interface DoVat {
  id: string;
  kind: string;
  shape: string;
  obj: THREE.Object3D;
  state: Record<string, unknown>;
  camBoi: string | null;
}

type GocMay = { vt: THREE.Vector3; tam: THREE.Vector3; fov: number };

const MAY_NGANG: GocMay = {
  vt: new THREE.Vector3(3.05, 2.75, 5.95),
  tam: new THREE.Vector3(0.1, 1.05, -1.0),
  fov: 38,
};
const MAY_DOC: GocMay = {
  vt: new THREE.Vector3(1.45, 2.55, 6.5),
  tam: new THREE.Vector3(-0.85, 1.0, -1.2),
  fov: 56,
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
  private ketTinhDangChay = new Map<string, KetTinh>();
  private fxDangChay: HieuUng[] = [];

  private troi!: THREE.HemisphereLight;
  private nang!: THREE.DirectionalLight;
  private vien!: THREE.DirectionalLight;
  private denPreset = 'sang';

  /* A3 — hậu kỳ (bloom) + tự tắt khi FPS thấp (spec mục 5) */
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private bloomDangBat = true;
  private fpsThapTu = 0;

  private dongHo = new THREE.Timer();
  private chuotNDC = new THREE.Vector2(0, 0);
  private diemChuot = new THREE.Vector3();
  private tamTuBay: { vt: THREE.Vector3; tam: THREE.Vector3 } | null = null;
  private bossDaXoay = false;
  private lanCuoiBossHoatDong = Date.now();

  constructor(canvas: HTMLCanvasElement, bus: EventBus, bongBongLop: HTMLElement) {
    this.bus = bus;
    this.bongBongLop = bongBongLop;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;

    this.scene.background = new THREE.Color(MAU_NEN_LAB);
    this.scene.fog = new THREE.FogExp2(MAU_NEN_LAB, 0.05);

    this.camera = new THREE.PerspectiveCamera(
      38,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.copy(MAY_NGANG.vt);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(MAY_NGANG.tam);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 9.5;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minPolarAngle = Math.PI * 0.12;
    this.controls.enablePan = false;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.addEventListener('start', () => {
      this.bossDaXoay = true;
      this.tamTuBay = null;
      this.lanCuoiBossHoatDong = Date.now();
    });

    this.dungHauKy();
    this.dungAnhSang();
    this.datGocMay();
  }

  /* ------------------------------------------------------------ dựng cảnh */

  /**
   * Hậu kỳ A3: `UnrealBloomPass` nửa độ phân giải (hiệu năng, spec mục 5) +
   * `OutputPass` (ACES/sRGB đã khai ở renderer). Tắt được bằng `coBloom`
   * khi FPS tụt (`motKhung` tự gọi), không cần dựng lại composer.
   */
  private dungHauKy(): void {
    this.composer = new EffectComposer(this.renderer);
    const kichThuoc = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // threshold cao + strength vừa phải: chỉ viền/đèn thật sự sáng mới nở ra,
    // nhân vật đứng dưới ánh sáng thường không bị "cháy" (yêu cầu spec mục 1).
    this.bloom = new UnrealBloomPass(kichThuoc, 0.3, 0.35, 0.92);
    this.bloom.resolution.set(
      Math.max(1, Math.floor(kichThuoc.x / 2)),
      Math.max(1, Math.floor(kichThuoc.y / 2)),
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /** Bật/tắt bloom (giữ composer, chỉ đổi cường độ — rẻ hơn dựng lại pass). */
  private coBloom(bat: boolean): void {
    if (this.bloomDangBat === bat) return;
    this.bloomDangBat = bat;
    this.bloom.strength = bat ? 0.3 : 0;
  }

  private dungAnhSang(): void {
    // lab tối, ánh sáng chính từ bục trung tâm + đèn dải trần + viền cyan/cam
    this.troi = new THREE.HemisphereLight(0x3a6a7a, 0x0a0f14, 0.5);
    this.scene.add(this.troi);

    this.nang = new THREE.DirectionalLight(0x9fd8ff, 0.55);
    this.nang.position.set(2.2, 4.4, 1.2);
    this.nang.castShadow = true;
    this.nang.shadow.mapSize.set(2048, 2048);
    this.nang.shadow.camera.near = 0.5;
    this.nang.shadow.camera.far = 22;
    this.nang.shadow.camera.left = -6;
    this.nang.shadow.camera.right = 6;
    this.nang.shadow.camera.top = 6;
    this.nang.shadow.camera.bottom = -6;
    this.nang.shadow.bias = -0.0006;
    this.nang.shadow.normalBias = 0.022;
    this.nang.shadow.radius = 2.5;
    this.scene.add(this.nang);

    this.vien = new THREE.DirectionalLight(MAU_CAM, 0.35);
    this.vien.position.set(-3.5, 2.6, -2.0);
    this.scene.add(this.vien);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.14;
  }

  /** Nạp phòng + nhân vật mặc định + 3 màn hình hologram cố định. Gọi một lần lúc khởi động. */
  async napCanh(tienTrinh?: (chu: string) => void): Promise<{ dungKenney: boolean }> {
    tienTrinh?.('Đang dựng lab viễn tưởng…');
    const phong = await dungPhong(this.scene);
    haiSuongBuc(this.scene);

    tienTrinh?.('Đang nạp nhân vật…');
    await this.actorSpawn({
      id: ACTOR_MAC_DINH.id,
      name: ACTOR_MAC_DINH.ten,
      model: ACTOR_MAC_DINH.model,
      at: 'ban-1',
    });

    tienTrinh?.('Đang dựng màn hình hologram…');
    for (const id of Object.keys(MAC_DINH_MAN_HINH)) await this.screenSpawn({ id });

    return { dungKenney: phong.dungKenney };
  }

  /* ----------------------------------------------------------- vòng lặp */

  batDauVe(): void {
    this.renderer.setAnimationLoop(() => this.motKhung());
    window.addEventListener('resize', () => {
      this.datGocMay();
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this.bloom.resolution.set(
        Math.max(1, Math.floor(window.innerWidth / 2)),
        Math.max(1, Math.floor(window.innerHeight / 2)),
      );
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
    this.composer.render();
    this.theoDoiFps(dt);
  }

  /** Hiệu năng (spec mục 5): FPS tụt dưới ngưỡng quá 2 s thì tự tắt bloom. */
  private theoDoiFps(dt: number): void {
    if (dt <= 0) return;
    const fps = 1 / dt;
    if (fps < FPS_TU_TAT_BLOOM) {
      this.fpsThapTu += dt * 1000;
      if (this.fpsThapTu > 2000) this.coBloom(false);
    } else {
      this.fpsThapTu = 0;
      if (fps > FPS_TU_TAT_BLOOM + 8) this.coBloom(true);
    }
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

    const nv = await NhanVat.nap(p.id, p.name ?? p.id, p.model ?? ACTOR_MAC_DINH.model);
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
    return nv.xoayVe(new THREE.Vector3(v[0], 0, v[2]));
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
    return noiTiep(
      [
        () => nv.diToi(dich),
        () => nv.xoayVe(p.facing ?? 180),
        () => nv.ngoi(),
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
    return nv.noi(text, voice);
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
        this.troi.intensity = 0.5;
        this.nang.intensity = 0.55;
        this.nang.color.setHex(0x9fd8ff);
        this.vien.intensity = 0.35;
        bg.setHex(MAU_NEN_LAB);
        this.renderer.toneMappingExposure = 0.92;
        break;
      case 'toi':
        this.troi.intensity = 0.16;
        this.nang.intensity = 0.12;
        this.nang.color.setHex(0x3f6fa0);
        this.vien.intensity = 0.5;
        bg.setHex(0x030508);
        this.renderer.toneMappingExposure = 0.85;
        break;
      case 'am':
        this.troi.intensity = 0.3;
        this.nang.intensity = 0.4;
        this.nang.color.setHex(MAU_CAM);
        this.vien.intensity = 0.2;
        bg.setHex(0x120a06);
        this.renderer.toneMappingExposure = 0.95;
        break;
    }
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.copy(bg);
  }

  cameraFocus(target: string, distance = 2.6): void {
    const v = this.viTriMucTieu(target);
    if (!v) throw new Error(`Không biết "${target}" ở đâu`);
    const tam = new THREE.Vector3(v[0], v[1] + 1.1, v[2]);
    // đứng chéo 35° trước mặt mục tiêu, cao hơn một chút
    const huong = new THREE.Vector3(0.55, 0.42, 1).normalize().multiplyScalar(distance);
    this.bossDaXoay = true;
    this.tamTuBay = { vt: tam.clone().add(huong), tam };
  }

  cameraPreset(name: string): void {
    if (!(PRESET_MAY as readonly string[]).includes(name)) {
      throw new Error(`Không có góc máy "${name}". Có: ${PRESET_MAY.join(', ')}`);
    }
    if (name === 'toan-canh') {
      this.bossDaXoay = false;
      this.tamTuBay = { vt: MAY_NGANG.vt.clone(), tam: MAY_NGANG.tam.clone() };
      return;
    }
    if (name === 'hop') {
      this.bossDaXoay = true;
      this.tamTuBay = {
        vt: new THREE.Vector3(0, 2.0, 2.6),
        tam: new THREE.Vector3(0, 1.1, -1.2),
      };
      return;
    }
    this.cameraFocus(name, 2.4);
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

    const mh = new ManHinh(p.id, p.size ?? 2.2, pos, rotY, p.tilt ?? -4);
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

  screenFocus(id: string): Action {
    const mh = this.manHinh(id);
    const dich = new THREE.Vector3(0, 1.72, 0.55);
    const rotDich = 0;
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

  private snapScreen(mh: ManHinh): ScreenSnapshot {
    return {
      id: mh.id,
      pos: [tron(mh.group.position.x), tron(mh.group.position.y), tron(mh.group.position.z)],
      showing: mh.kind,
      streaming: mh.streaming,
      lines: mh.soDong(),
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
    await this.actorSpawn({
      id: ACTOR_MAC_DINH.id,
      name: ACTOR_MAC_DINH.ten,
      model: ACTOR_MAC_DINH.model,
      at: 'ban-1',
    });
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
      holding: nv.dangCam,
      lookingAt: nv.nhinTen,
      distances,
      queued: 0,
    };
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
