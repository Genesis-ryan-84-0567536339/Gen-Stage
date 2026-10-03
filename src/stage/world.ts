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
import type {
  Action,
  ActorSnapshot,
  PlaceSnapshot,
  PropSnapshot,
  ScreenSnapshot,
  StageState,
  StageWorld,
  ThamSoSpawnActor,
  ThamSoSpawnProp,
  Vec3,
} from '../api/types';
import type { EventBus } from '../events';
import { dungPhong } from './phong';
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
import { noiTiep } from './hanh-dong';

const MAU_KEM = 0xfdf3e3;
/** Bán kính coi là "đang ở" một place. */
const BAN_KINH_AT = 0.9;
export const ACTOR_MAC_DINH = { id: 'lan', ten: 'Lan', model: 'models/avatar.vrm' };

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

  private troi!: THREE.HemisphereLight;
  private nang!: THREE.DirectionalLight;
  private vien!: THREE.DirectionalLight;
  private denPreset = 'sang';

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

    this.scene.background = new THREE.Color(MAU_KEM);
    this.scene.fog = new THREE.Fog(MAU_KEM, 14, 30);

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

    this.dungAnhSang();
    this.datGocMay();
  }

  /* ------------------------------------------------------------ dựng cảnh */

  private dungAnhSang(): void {
    this.troi = new THREE.HemisphereLight(0xfff3dd, 0xcdb79a, 0.62);
    this.scene.add(this.troi);

    this.nang = new THREE.DirectionalLight(0xffe0ae, 1.45);
    this.nang.position.set(5.2, 6.4, 3.0);
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

    this.vien = new THREE.DirectionalLight(0xbfd8ff, 0.3);
    this.vien.position.set(-4.5, 3.2, -2.5);
    this.scene.add(this.vien);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.22;
  }

  /** Nạp phòng + nhân vật mặc định. Gọi một lần lúc khởi động. */
  async napCanh(tienTrinh?: (chu: string) => void): Promise<{ dungKenney: boolean }> {
    tienTrinh?.('Đang dựng văn phòng…');
    const phong = await dungPhong(this.scene);

    tienTrinh?.('Đang nạp nhân vật…');
    await this.actorSpawn({
      id: ACTOR_MAC_DINH.id,
      name: ACTOR_MAC_DINH.ten,
      model: ACTOR_MAC_DINH.model,
      at: 'ban-1',
    });

    return { dungKenney: phong.dungKenney };
  }

  /* ----------------------------------------------------------- vòng lặp */

  batDauVe(): void {
    this.renderer.setAnimationLoop(() => this.motKhung());
    window.addEventListener('resize', () => {
      this.datGocMay();
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    if (this.tamTuBay) {
      const k = Math.min(1, dt * 3.2);
      this.camera.position.lerp(this.tamTuBay.vt, k);
      this.controls.target.lerp(this.tamTuBay.tam, k);
      if (this.camera.position.distanceTo(this.tamTuBay.vt) < 0.02) this.tamTuBay = null;
    }

    this.capNhatBongBong();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
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

  /** A1 chưa có màn hình hologram (A3 làm) — trả rỗng, không bịa. */
  screenIds(): string[] {
    return [];
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

  sceneLight(preset: string): void {
    if (!(PRESET_DEN as readonly string[]).includes(preset)) {
      throw new Error(`Không có preset đèn "${preset}". Có: ${PRESET_DEN.join(', ')}`);
    }
    this.denPreset = preset;
    const bg = this.scene.background as THREE.Color;
    switch (preset) {
      case 'sang':
        this.troi.intensity = 0.62;
        this.nang.intensity = 1.45;
        this.nang.color.setHex(0xffe0ae);
        this.vien.intensity = 0.3;
        bg.setHex(MAU_KEM);
        this.renderer.toneMappingExposure = 0.92;
        break;
      case 'toi':
        this.troi.intensity = 0.14;
        this.nang.intensity = 0.3;
        this.nang.color.setHex(0x9fb6ff);
        this.vien.intensity = 0.5;
        bg.setHex(0x1d2330);
        this.renderer.toneMappingExposure = 0.78;
        break;
      case 'am':
        this.troi.intensity = 0.34;
        this.nang.intensity = 0.95;
        this.nang.color.setHex(0xffb366);
        this.vien.intensity = 0.14;
        bg.setHex(0x3b2a20);
        this.renderer.toneMappingExposure = 0.88;
        break;
    }
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(bg);
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

  async reset(): Promise<void> {
    for (const id of [...this.actors.keys()]) this.actorRemove(id);
    for (const id of [...this.props.keys()]) this.propRemove(id);
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
      screens: [] as ScreenSnapshot[],
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
    roughness: 0.42,
    metalness: 0.08,
    emissive: new THREE.Color(mau[shape] ?? 0x8fb8e8).multiplyScalar(0.35),
    emissiveIntensity: 0.5,
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
