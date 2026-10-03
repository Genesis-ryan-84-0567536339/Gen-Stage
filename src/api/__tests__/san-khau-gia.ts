/**
 * san-khau-gia.ts — sân khấu giả cho `pnpm test`.
 *
 * Thi công đúng giao diện `StageWorld` nhưng bằng số học thuần, không Three.js,
 * không WebGL: nhờ vậy test chạy dispatcher / hàng đợi / kịch bản trong Node và
 * khẳng định được rằng lệnh không hề phụ thuộc vào ruột cảnh.
 */
import type {
  Action,
  ActorSnapshot,
  PropSnapshot,
  StageState,
  StageWorld,
  ThamSoSpawnActor,
  ThamSoSpawnProp,
  Vec3,
} from '../types';
import { BIEU_CAM, CLIPS, EMOTES, PLACES, timPlace } from '../../stage/noi-dung';

interface ActorGia {
  id: string;
  name: string;
  pos: Vec3;
  facing: number;
  state: ActorSnapshot['state'];
  expression: string;
  holding: string | null;
  lookingAt: string | null;
  hd: { cancel: () => void } | null;
}

/** Mỗi hành động mất đúng `nhip` ms để test chạy nhanh và đoán được. */
export const NHIP_MS = 20;

export class SanKhauGia implements StageWorld {
  private actors = new Map<string, ActorGia>();
  private props = new Map<string, PropSnapshot>();
  /** Lịch sử lệnh sân khấu nhận được — test kiểm thứ tự bằng cái này. */
  readonly lichSu: string[] = [];
  den = 'sang';
  may = 'toan-canh';

  constructor(ids: string[] = ['lan']) {
    for (const id of ids) {
      this.actors.set(id, {
        id,
        name: id,
        pos: [0, 0, 0],
        facing: 0,
        state: 'idle',
        expression: 'neutral',
        holding: null,
        lookingAt: 'camera',
        hd: null,
      });
    }
  }

  private a(id: string): ActorGia {
    const x = this.actors.get(id);
    if (!x) throw new Error(`Không có actor "${id}"`);
    return x;
  }

  /** Hành động giả: xong sau `NHIP_MS`, huỷ được. */
  private hd(id: string, ten: string, trangThai: ActorSnapshot['state']): Action {
    this.lichSu.push(`${ten}:${id}`);
    const x = this.a(id);
    x.state = trangThai;
    let xong = false;
    let giaiQuyet: () => void = () => undefined;
    const done = new Promise<void>((r) => {
      giaiQuyet = r;
    });
    const ket = () => {
      if (xong) return;
      xong = true;
      clearTimeout(hen);
      if (x.state === trangThai) x.state = 'idle';
      x.hd = null;
      giaiQuyet();
    };
    const hen = setTimeout(ket, NHIP_MS);
    const action: Action = { durationMs: NHIP_MS, done, cancel: ket };
    x.hd = action;
    return action;
  }

  private viTri(to: string | Vec3): Vec3 {
    if (Array.isArray(to)) return to;
    const p = timPlace(to);
    if (p) return p.standAt ?? p.pos;
    const t = this.actors.get(to);
    if (t) return t.pos;
    const d = this.props.get(to);
    if (d) return d.pos;
    throw new Error(`Không biết "${to}" ở đâu`);
  }

  /* ------------------------------------------------------------ danh sách */

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
  coActor(id: string): boolean {
    return this.actors.has(id);
  }
  coProp(id: string): boolean {
    return this.props.has(id);
  }

  /* ---------------------------------------------------------------- actor */

  async actorSpawn(p: ThamSoSpawnActor): Promise<ActorSnapshot> {
    if (this.actors.has(p.id)) throw new Error(`Actor "${p.id}" đã có trên sân khấu`);
    this.actors.set(p.id, {
      id: p.id,
      name: p.name ?? p.id,
      pos: this.viTri(p.at ?? 'buc-trung-tam'),
      facing: 0,
      state: 'idle',
      expression: 'neutral',
      holding: null,
      lookingAt: 'camera',
      hd: null,
    });
    this.lichSu.push(`spawn:${p.id}`);
    return this.snap(this.a(p.id));
  }

  actorRemove(id: string): void {
    this.a(id);
    this.actors.delete(id);
    this.lichSu.push(`remove:${id}`);
  }

  actorMoveTo(id: string, to: string | Vec3): Action {
    const v = this.viTri(to);
    const hd = this.hd(id, 'moveTo', 'walking');
    void hd.done.then(() => {
      const x = this.actors.get(id);
      if (x) x.pos = v;
    });
    return hd;
  }

  actorLookAt(id: string, target: string | null): void {
    this.a(id).lookingAt = target;
    this.lichSu.push(`lookAt:${id}`);
  }

  actorTurnTo(id: string, target: string | Vec3): Action {
    const v = this.viTri(target);
    const x = this.a(id);
    const hd = this.hd(id, 'turnTo', 'playing');
    void hd.done.then(() => {
      x.facing = Math.round(
        ((Math.atan2(v[0] - x.pos[0], v[2] - x.pos[2]) * 180) / Math.PI + 360) % 360,
      );
    });
    return hd;
  }

  actorSit(id: string, seat: string): Action {
    const p = timPlace(seat);
    if (!p) throw new Error(`Không có place "${seat}"`);
    if (p.kind !== 'seat') throw new Error(`"${seat}" không phải ghế`);
    const hd = this.hd(id, 'sit', 'playing');
    void hd.done.then(() => {
      const x = this.actors.get(id);
      if (x) {
        x.pos = p.pos;
        x.state = 'sitting';
      }
    });
    return hd;
  }

  actorStand(id: string): Action {
    return this.hd(id, 'stand', 'playing');
  }

  actorPlay(id: string, clip: string): Action {
    if (!CLIPS.includes(clip as (typeof CLIPS)[number])) {
      throw new Error(`Không có clip "${clip}"`);
    }
    return this.hd(id, `play.${clip}`, 'playing');
  }

  actorStop(id: string): void {
    const x = this.a(id);
    x.hd?.cancel();
    x.state = 'idle';
    this.lichSu.push(`stop:${id}`);
  }

  actorExpress(id: string, expression: string): void {
    if (!(BIEU_CAM as readonly string[]).includes(expression)) {
      throw new Error(`Không có biểu cảm "${expression}"`);
    }
    this.a(id).expression = expression;
    this.lichSu.push(`express:${expression}`);
  }

  actorBubble(id: string): Action {
    return this.hd(id, 'bubble', 'speaking');
  }

  actorSay(id: string, text: string): Action {
    this.lichSu.push(`say:${text}`);
    return this.hd(id, 'say', 'speaking');
  }

  actorHold(id: string, prop: string, hand: 'left' | 'right'): void {
    if (!this.props.has(prop)) throw new Error(`Không có prop "${prop}"`);
    this.a(id).holding = prop;
    this.lichSu.push(`hold:${prop}:${hand}`);
  }

  actorDrop(id: string): string | null {
    const x = this.a(id);
    const p = x.holding;
    x.holding = null;
    return p;
  }

  actorInterrupt(id: string): void {
    const x = this.actors.get(id);
    if (!x) return;
    x.hd?.cancel();
    x.state = 'idle';
    this.lichSu.push(`interrupt:${id}`);
  }

  /* ----------------------------------------------------------------- prop */

  async propSpawn(p: ThamSoSpawnProp): Promise<PropSnapshot> {
    if (this.props.has(p.id)) throw new Error(`Prop "${p.id}" đã có trên sân khấu`);
    const snap: PropSnapshot = {
      id: p.id,
      kind: p.kind ?? 'prop',
      shape: p.shape ?? 'cube',
      at: typeof p.at === 'string' ? p.at : null,
      pos: this.viTri(p.at ?? 'ban-1'),
      state: {},
    };
    this.props.set(p.id, snap);
    return snap;
  }

  propRemove(id: string): void {
    if (!this.props.delete(id)) throw new Error(`Không có prop "${id}"`);
  }

  propMoveTo(id: string, to: string | Vec3): void {
    const d = this.props.get(id);
    if (!d) throw new Error(`Không có prop "${id}"`);
    d.pos = this.viTri(to);
    d.at = typeof to === 'string' ? to : null;
  }

  propSet(id: string, state: Record<string, unknown>): PropSnapshot {
    const d = this.props.get(id);
    if (!d) throw new Error(`Không có prop "${id}"`);
    d.state = { ...d.state, ...state };
    return d;
  }

  /* --------------------------------------------------------- cảnh + camera */

  sceneLight(preset: string): void {
    this.den = preset;
  }
  cameraFocus(target: string): void {
    this.viTri(target);
    this.may = `focus:${target}`;
  }
  cameraPreset(name: string): void {
    this.may = name;
  }

  async reset(): Promise<void> {
    this.actors.clear();
    this.props.clear();
    this.lichSu.length = 0;
    this.den = 'sang';
    this.may = 'toan-canh';
    await this.actorSpawn({ id: 'lan', name: 'lan', at: 'ban-1' });
  }

  /* ------------------------------------------------------------- describe */

  describe(): StageState {
    const dsActor = [...this.actors.values()].map((x) => this.snap(x));
    return {
      version: '0.1',
      time: { clock: '20:31', bossPresent: true, idleSec: 0 },
      actors: dsActor,
      places: PLACES.map((p) => ({
        id: p.id,
        pos: p.pos,
        kind: p.kind,
        occupiedBy: dsActor.find((a) => a.at === p.id)?.id ?? null,
      })),
      screens: [],
      props: [...this.props.values()],
      lastEvents: [],
      scene: { light: this.den },
    };
  }

  private snap(x: ActorGia): ActorSnapshot {
    const distances: Record<string, number> = {};
    for (const p of PLACES) distances[p.id] = Math.round(kc(x.pos, p.pos) * 100) / 100;
    for (const d of this.props.values()) {
      distances[d.id] = Math.round(kc(x.pos, d.pos) * 100) / 100;
    }
    let at: string | null = null;
    let gan = 0.9;
    for (const p of PLACES) {
      const k = Math.min(kc(x.pos, p.pos), p.standAt ? kc(x.pos, p.standAt) : Infinity);
      if (k <= gan) {
        gan = k;
        at = p.id;
      }
    }
    return {
      id: x.id,
      name: x.name,
      pos: x.pos,
      facing: x.facing,
      at,
      state: x.state,
      busy: x.state !== 'idle' && x.state !== 'sitting',
      mood: 'binh-thuong',
      expression: x.expression,
      holding: x.holding,
      lookingAt: x.lookingAt,
      distances,
      queued: 0,
    };
  }
}

function kc(a: Vec3, b: Vec3 | readonly number[]): number {
  const dx = a[0] - (b[0] ?? 0);
  const dz = a[2] - (b[2] ?? 0);
  return Math.sqrt(dx * dx + dz * dz);
}
