/**
 * types.ts — khuôn dữ liệu của Actor API v0.1 (spec `docs/spec/actor-api.md`).
 *
 * Mọi đường vào sân khấu (nút trên UI, ô kịch bản, bridge WebSocket, sau này là
 * MCP) đều dùng đúng ba kiểu này: `Command` vào, `Result` ra, `StageEvent` bắn
 * ngược lên. Không ai được tự tạo kiểu riêng.
 */

/** Toạ độ mét, gốc giữa phòng: `[x, y, z]`. */
export type Vec3 = [number, number, number];

/** Gói lệnh gửi vào dispatcher. */
export interface Command {
  /** Mã do bên gọi đặt, trả lại y nguyên trong `Result` để ghép cặp. */
  id?: string;
  cmd: string;
  args?: Readonly<Record<string, unknown>>;
}

export interface ResultOk<T = unknown> {
  id?: string;
  ok: true;
  result: T;
}

export interface ResultErr {
  id?: string;
  ok: false;
  error: string;
}

export type Result<T = unknown> = ResultOk<T> | ResultErr;

/** Sự kiện sân khấu bắn ngược lên agent / UI. */
export interface StageEvent<T = Record<string, unknown>> {
  /** Mốc thời gian `Date.now()`. */
  t: number;
  event: string;
  data: T;
}

/* ------------------------------------------------------------ mô tả lệnh */

/** Kiểu dữ liệu một tham số — quyết định cả cách kiểm tra lẫn ô nhập trên UI. */
export type ParamType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'vec3'
  | 'target'
  | 'json';

/**
 * Nguồn danh sách gợi ý cho tham số: lấy từ trạng thái sân khấu lúc chạy, nên
 * UI luôn hiện đúng actor/place/prop đang có, không hard-code.
 */
export type NguonGoiY =
  | 'actors'
  | 'places'
  | 'props'
  | 'screens'
  | 'clips'
  | 'expressions'
  | 'emotes'
  | 'targets';

export interface ParamSpec {
  name: string;
  type: ParamType;
  /** Mô tả tiếng Việt, hiện làm nhãn trên UI và trong `stage.bootstrap`. */
  desc: string;
  required?: boolean;
  /** Danh sách giá trị cố định (type `enum`). */
  values?: readonly string[];
  /** Danh sách giá trị động, lấy lúc chạy. */
  goiY?: NguonGoiY;
  /** `enum` + `goiY` + cho phép gõ tự do (vd `to` nhận place hoặc toạ độ). */
  tuDo?: boolean;
  min?: number;
  max?: number;
  default?: unknown;
}

/** Hàm xử lý một lệnh. */
export type CommandHandler = (
  args: Record<string, unknown>,
  ctx: CommandCtx,
) => CommandOutcome | Promise<CommandOutcome>;

/**
 * Kết quả thô của handler.
 * `done` dành cho lệnh có hiệu ứng theo thời gian: lệnh trả về NGAY kèm
 * `durationMs`, còn `done` để dispatcher biết khi nào actor rảnh mà chạy tiếp
 * hàng đợi; `cancel` để `interrupt` cắt giữa đường.
 */
export interface CommandOutcome {
  result: Record<string, unknown>;
  durationMs?: number;
  done?: Promise<void>;
  cancel?: () => void;
}

export interface CommandSpec {
  cmd: string;
  /** Nhóm để UI gom bảng: `stage`, `actor`, `prop`, `scene`, `camera`, `script`… */
  group: string;
  desc: string;
  params: readonly ParamSpec[];
  /** Ví dụ chạy được, `stage.bootstrap` trả về nguyên văn cho agent học. */
  example: Command;
  /**
   * Lệnh chiếm actor: khi actor đang `busy` thì lệnh mới vào hàng đợi, trừ khi
   * có `interrupt: true`. Giá trị là tên tham số chứa id actor.
   */
  chiemActor?: string;
  /**
   * Sự kiện lệnh này có thể bắn ra. `stage.bootstrap` gom lại từ đây, nên thêm
   * lệnh mới là danh sách sự kiện tự đúng — không có bảng viết tay nào.
   */
  events?: readonly string[];
  /** Lệnh chưa làm trong A1 (A2/A3) — vẫn đăng ký để bootstrap liệt kê đủ. */
  stub?: 'A2' | 'A3';
  handler: CommandHandler;
}

/** Bối cảnh handler nhận được. */
export interface CommandCtx {
  world: StageWorld;
  bus: EventBusLike;
  /** Gọi lệnh khác (kịch bản dùng). */
  run: (cmd: string, args?: Record<string, unknown>) => Promise<Result>;
  registry: RegistryLike;
  /** Trạng thái hàng đợi của dispatcher theo actor (cho `stage.describe`). */
  hangDoi: () => Record<string, { busy: boolean; queued: number }>;
  /** Cắt hành động đang chạy + xoá hàng đợi của actor (`actor.stop` dùng). */
  catNgang: (actor: string) => number;
}

/* ------------------------------------------------------- trạng thái sân khấu */

export type ActorState =
  | 'idle'
  | 'walking'
  | 'sitting'
  | 'playing'
  | 'speaking'
  | 'emoting'
  | 'building';

export interface ActorSnapshot {
  id: string;
  name: string;
  pos: Vec3;
  /** Độ, 0 = hướng camera mặc định, tăng theo chiều kim đồng hồ nhìn từ trên. */
  facing: number;
  /**
   * Place actor **đang đứng tại**, và chỉ khi đã đứng yên ở đó: còn đang di
   * chuyển thì luôn `null`, dù có đi ngang qua một place khác.
   *
   * Lý do: "đang ở đâu" phải là một câu trả lời dứt khoát cho não AI. Nếu vừa
   * `walking` vừa `at: "ban-1"` thì agent không biết nên coi là đã tới nơi hay
   * chưa. Muốn biết đang gần cái gì thì đọc `nearest`.
   */
  at: string | null;
  /** Place gần nhất, LUÔN có, kể cả khi đang đi hay đứng giữa phòng. */
  nearest: { place: string | null; distance: number };
  state: ActorState;
  busy: boolean;
  mood: string;
  expression: string;
  holding: string | null;
  lookingAt: string | null;
  /** Khoảng cách mét tới mọi place + screen, tính sẵn. */
  distances: Record<string, number>;
  /** Số lệnh đang xếp hàng chờ actor này. */
  queued: number;
}

export interface PlaceSnapshot {
  id: string;
  pos: Vec3;
  kind: string;
  occupiedBy: string | null;
}

export interface ScreenSnapshot {
  id: string;
  pos: Vec3;
  showing: string | null;
  streaming: boolean;
  lines: number;
}

export interface PropSnapshot {
  id: string;
  kind: string;
  shape: string;
  at: string | null;
  pos: Vec3;
  state: Record<string, unknown>;
}

export interface StageState {
  version: string;
  time: { clock: string; bossPresent: boolean; idleSec: number };
  actors: ActorSnapshot[];
  places: PlaceSnapshot[];
  screens: ScreenSnapshot[];
  props: PropSnapshot[];
  lastEvents: StageEvent[];
  /** Ánh sáng cảnh hiện tại (preset của `scene.light`). */
  scene?: { light: string };
}

/* --------------------------------------------------------------- sân khấu */

/** Một hành động có thời lượng trên sân khấu. */
export interface Action {
  durationMs: number;
  done: Promise<void>;
  cancel: () => void;
}

export interface ThamSoSpawnActor {
  id: string;
  model?: string;
  name?: string;
  at?: string | Vec3;
}

export interface ThamSoSpawnProp {
  id: string;
  model?: string;
  kind?: string;
  shape?: string;
  at?: string | Vec3;
}

/**
 * Giao diện sân khấu mà lệnh nhìn thấy.
 *
 * Tách riêng khỏi phần dựng Three.js để (a) A2/A3 thay ruột mà không sửa lệnh,
 * (b) `pnpm test` chạy dispatcher bằng sân khấu giả, không cần WebGL.
 */
export interface StageWorld {
  describe(): StageState;

  /* danh sách để UI/bootstrap sinh ô chọn */
  actorIds(): string[];
  placeIds(): string[];
  propIds(): string[];
  screenIds(): string[];
  clips(): string[];
  expressions(): string[];
  emotes(): string[];

  /* nhân vật */
  actorSpawn(p: ThamSoSpawnActor): Promise<ActorSnapshot>;
  actorRemove(id: string): void;
  actorMoveTo(id: string, to: string | Vec3, speed?: number): Action;
  actorLookAt(id: string, target: string | null): void;
  actorTurnTo(id: string, target: string | Vec3): Action;
  actorSit(id: string, seat: string): Action;
  actorStand(id: string): Action;
  actorPlay(id: string, clip: string, loop?: boolean, speed?: number): Action;
  actorStop(id: string): void;
  actorExpress(
    id: string,
    expression: string,
    weight?: number,
    durationMs?: number,
  ): void;
  actorBubble(id: string, text: string, durationMs?: number): Action;
  actorSay(
    id: string,
    text: string,
    emotion?: string,
    voice?: string,
  ): Action;
  actorHold(id: string, prop: string, hand: 'left' | 'right'): void;
  actorDrop(id: string): string | null;
  /** Cắt hành động đang chạy của actor (dùng cho `interrupt: true`). */
  actorInterrupt(id: string): void;
  coActor(id: string): boolean;

  /* đồ vật */
  propSpawn(p: ThamSoSpawnProp): Promise<PropSnapshot>;
  propRemove(id: string): void;
  propMoveTo(id: string, to: string | Vec3): void;
  propSet(id: string, state: Record<string, unknown>): PropSnapshot;
  coProp(id: string): boolean;

  /* cảnh + camera */
  sceneLight(preset: string): void;
  cameraFocus(target: string, distance?: number): void;
  cameraPreset(name: string): void;

  reset(): Promise<void>;
}

/* ------------------------------------------------------------- phụ trợ */

export type HuyDangKy = () => void;

export interface EventBusLike {
  emit(event: string, data?: Record<string, unknown>): StageEvent;
  on(
    event: string,
    fn: (e: StageEvent) => void,
  ): HuyDangKy;
  once(event: string): Promise<StageEvent>;
  recent(n?: number): StageEvent[];
}

export interface RegistryLike {
  get(cmd: string): CommandSpec | undefined;
  all(): CommandSpec[];
  groups(): string[];
  /** Mọi sự kiện có thể gặp, gom từ `CommandSpec.events` + sự kiện hệ thống. */
  suKien(): string[];
}
