/**
 * man-hinh.ts — màn hình MÁY TÍNH/TV ấm (D1, Issue #43 — thay hologram A3).
 *
 * Boss 26/10: "không scan-line neon, không viền phát sáng" — khung tối gỗ/
 * nhựa đen ấm, nội dung chữ trắng-kem, KHÔNG scan-line, KHÔNG đi qua
 * `batSang()` (bloom chọn lọc): đây không còn là vật phát sáng, chỉ là một
 * tấm nền tối có chữ sáng vẽ bằng `CanvasTexture`. Giữ nguyên hợp đồng
 * `screen.*` (tham số, sự kiện) — chỉ đổi DIỆN MẠO.
 */
import * as THREE from 'three';
import { KHOI_CANH } from './bo-cuc';

/** Cao của trụ chân đế (m) — dùng cả khi dựng và khi tính `beDuoi()`. */
const CHAN_CAO = 0.05;
/** Khe giữa đáy panel và đỉnh trụ chân (m). */
const CHAN_HO = 0.06;

const DOI_MAU: Record<string, { vien: number; chu: number; nen: number }> = {
  text: { vien: 0xd8c9a8, chu: 0xf5ead2, nen: 0x1c140c },
  code: { vien: 0xd8c9a8, chu: 0xc9e8c0, nen: 0x161108 },
  log: { vien: 0xe0a86a, chu: 0xffd9a8, nen: 0x241608 },
  chart: { vien: 0xd8c9a8, chu: 0xf5ead2, nen: 0x1c140c },
  image: { vien: 0xd8c9a8, chu: 0xf5ead2, nen: 0x18130c },
};

/**
 * Vị trí + góc mặc định của 2 màn hình — tính từ bảng bố cục (`bo-cuc.ts`):
 *   · `may-tinh` = màn hình trên bàn làm việc (`ban-dieu-khien`).
 *   · `tivi` = TV trên kệ phòng khách (`ke-tivi`).
 */
function tuKhoi(
  id: string,
  dy: number,
  lech: number,
  size: number,
): MacDinhManHinh {
  const k = KHOI_CANH.find((q) => q.id === id)!;
  const rad = (k.quay * Math.PI) / 180;
  const dx = Math.sin(rad) * lech;
  const dz = Math.cos(rad) * lech;
  return {
    pos: new THREE.Vector3(k.tai[0] + dx, dy, k.tai[1] + dz),
    rotY: rad,
    size,
    doTren: id,
  };
}

export interface MacDinhManHinh {
  pos: THREE.Vector3;
  rotY: number;
  size: number;
  /**
   * E2 (#48 mục 3) — **khối đỡ bên dưới**: `world.screenSpawn` đo mặt trên
   * THẬT của khối này trong cảnh (`khoi:<id>`, Box3) rồi hạ chân màn hình
   * đứng đúng lên đó. `pos.y` ở trên chỉ còn là **dự phòng** cho lúc chưa
   * dựng phòng (test dùng sân khấu giả): model Kenney được chuẩn hoá theo
   * `rong`/`cao` nên chiều cao mặt bàn KHÔNG đoán được từ bảng bố cục.
   */
  doTren?: string;
}

export const MAC_DINH_MAN_HINH: Record<string, MacDinhManHinh> = {
  // màn hình máy tính trên bàn — cỡ thật ~0,55 m, không phải tấm hologram lớn
  'may-tinh': tuKhoi('ban-dieu-khien', 1.1, 0.25, 0.55),
  // TV treo trên kệ phòng khách — cỡ thật ~1,1 m
  tivi: tuKhoi('ke-tivi', 0.95, 0.35, 1.1),
};

export class ManHinh {
  readonly id: string;
  readonly group = new THREE.Group();
  readonly panel: THREE.Mesh;
  readonly khung: THREE.LineSegments;
  private chan: THREE.Mesh;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private mat: THREE.MeshBasicMaterial;

  kind: string | null = null;
  noiDung = '';
  streaming = false;
  /** Nơi "đậu" (dock) để `screen.focus` bay về lại được. */
  readonly docked: { pos: THREE.Vector3; rotY: number };

  private tGian = 0;
  /** Bề ngang panel (m) — `World.screenFocus` cần để tính chỗ đặt vừa khung. */
  private readonly size: number;

  constructor(id: string, size = 2.2, pos = new THREE.Vector3(), rotY = 0, tilt = 0) {
    this.id = id;
    this.size = size;
    this.docked = { pos: pos.clone(), rotY };

    this.canvas.width = 1024;
    this.canvas.height = 640;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;

    const h = size * (this.canvas.height / this.canvas.width);
    // D1: KHÔNG `toneMapped: false` (không còn giả đồ phát sáng) — màn hình
    // vẽ chữ sáng trên nền tối, nhưng là vật liệu THƯỜNG, ăn đèn như mọi đồ
    // nội thất khác. KHÔNG `batSang()` — không còn trong danh sách bloom.
    this.mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      transparent: true,
      opacity: 0.97,
      side: THREE.DoubleSide,
    });
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(size, h), this.mat);
    this.group.add(this.panel);

    // khung tối gỗ/nhựa đen ấm quanh màn hình — không viền phát sáng neon.
    const vienGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(size * 1.06, h * 1.1));
    this.khung = new THREE.LineSegments(
      vienGeo,
      new THREE.LineBasicMaterial({ color: 0x2a2018, transparent: true, opacity: 0.9 }),
    );
    this.group.add(this.khung);

    // chân đế gỗ/nhựa mờ — KHÔNG phát sáng (khác bản hologram cũ).
    this.chan = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.09, CHAN_CAO, 16),
      new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.6 }),
    );
    this.chan.position.y = -h / 2 - CHAN_HO - CHAN_CAO / 2;
    this.group.add(this.chan);

    this.group.position.copy(pos);
    this.group.rotation.y = rotY;
    this.group.rotation.x = (tilt * Math.PI) / 180;

    this.ve();
  }

  /** Bề ngang panel tính theo mét. */
  beRong(): number {
    return this.size;
  }

  /** Bề cao panel tính theo mét (theo tỉ lệ canvas). */
  beCao(): number {
    return this.size * (this.canvas.height / this.canvas.width);
  }

  /**
   * Khoảng cách từ gốc nhóm xuống điểm THẤP NHẤT của màn hình (đáy chân đế).
   *
   * `world.screenSpawn` cộng số này vào mặt bàn đo được để màn hình đứng đúng
   * trên mặt bàn — không nổi lơ lửng, không chìm (E2, #48 mục 3).
   */
  beDuoi(): number {
    return this.beCao() / 2 + CHAN_HO + CHAN_CAO;
  }

  /** Nội dung tĩnh — thay toàn bộ. */
  hien(kind: string, content: string): void {
    this.kind = kind;
    this.noiDung = content;
    this.streaming = false;
    this.ve();
  }

  batDauStream(kind: string): void {
    this.kind = kind;
    this.noiDung = '';
    this.streaming = true;
    this.ve();
  }

  noi(chunk: string): void {
    this.noiDung += chunk;
    this.ve();
  }

  ketThucStream(): void {
    this.streaming = false;
    this.ve();
  }

  xoa(): void {
    this.kind = null;
    this.noiDung = '';
    this.streaming = false;
    this.ve();
  }

  soDong(): number {
    return this.noiDung.length ? this.noiDung.split('\n').length : 0;
  }

  /** Nhịp hoạt hình: KHÔNG còn flicker hologram (D1 — màn hình ấm, tĩnh). */
  capNhat(dt: number): void {
    this.tGian += dt;
    if (this.streaming && Math.floor(this.tGian * 6) % 2 === 0) this.ve(); // con trỏ nhấp nháy khi stream
  }

  dat(_bloomDuocBat: boolean): void {
    // D1: màn hình không còn phụ thuộc bloom (không ở danh sách bloom chọn
    // lọc nữa) — giữ phương thức để `world.ts` gọi không lỗi, không làm gì.
  }

  dispose(): void {
    this.panel.geometry.dispose();
    this.khung.geometry.dispose();
    (this.khung.material as THREE.Material).dispose();
    this.chan.geometry.dispose();
    (this.chan.material as THREE.Material).dispose();
    this.mat.dispose();
    this.tex.dispose();
  }

  /* ----------------------------------------------------------- vẽ canvas */

  private ve(): void {
    const c = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const bang = DOI_MAU[this.kind ?? 'text'] ?? DOI_MAU.text!;

    c.clearRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgba(bang.nen, 0.82));
    g.addColorStop(1, rgba(bang.nen, 0.94));
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);

    // viền trong
    c.strokeStyle = rgba(bang.vien, 0.9);
    c.lineWidth = 4;
    c.strokeRect(4, 4, w - 8, h - 8);

    c.fillStyle = rgba(bang.chu, 0.95);
    c.textBaseline = 'top';

    if (!this.noiDung) {
      /**
       * E2 (#48 mục 3) — phân biệt **trống** với **đang chờ nội dung**.
       *
       * Bản cũ vẽ "— trống —" cho cả hai trường hợp, nên một màn hình vừa
       * `screen.stream { source: "agent" }` mà agent chưa đẩy mẩu nào (hoặc
       * `screen.focus` một màn hình chưa ai ghi gì) trông y như màn hình tắt
       * — đúng cái Boss nhìn thấy và nghĩ là lỗi. Giờ: đang stream thì ghi
       * "đang nhận…" + con trỏ nhấp nháy, thật trống thì mới "— trống —".
       */
      const cho = this.streaming;
      c.font = '600 28px "Courier New", monospace';
      c.globalAlpha = cho ? 0.85 : 0.5;
      const nhan = cho ? 'đang nhận…' : '— trống —';
      c.fillText(nhan, 28, 24);
      c.globalAlpha = 1;
      if (cho && Math.floor(this.tGian * 3) % 2 === 0) {
        c.fillStyle = rgba(bang.vien, 0.95);
        c.fillRect(28 + c.measureText(nhan).width + 8, 22, 16, 30);
      }
    } else if (this.kind === 'chart') {
      this.veChart(c, w, h, bang);
    } else if (this.kind === 'image') {
      this.veImage(c, w, h, bang);
    } else {
      this.veChu(c, w, h, bang);
    }

    this.tex.needsUpdate = true;
  }

  private veChu(
    c: CanvasRenderingContext2D,
    _w: number,
    h: number,
    bang: { vien: number; chu: number },
  ): void {
    const coChu = this.kind === 'code' || this.kind === 'log';
    // 34px (từ 26px) + lineHeight 42 (từ 32) để đọc được ở 390×844 (spec mục 5).
    c.font = `${coChu ? '400' : '600'} 34px "Courier New", monospace`;
    const lePhai = 32;
    const caoDong = 42;
    const soHang = Math.floor((h - 48) / caoDong);
    const dong = this.noiDung.split('\n');
    // cuộn: chỉ hiện `soHang` dòng cuối, giống terminal
    const hien = dong.slice(Math.max(0, dong.length - soHang));
    hien.forEach((d, i) => {
      if (this.kind === 'log') {
        if (/lỗi|error|fail/i.test(d)) c.fillStyle = 'rgba(255,130,130,1)';
        else if (/ok|xong|success|✓/i.test(d)) c.fillStyle = 'rgba(160,255,185,1)';
        else c.fillStyle = rgba(bang.chu, 1);
      } else {
        c.fillStyle = rgba(bang.chu, 1);
      }
      c.fillText(d.slice(0, 64), lePhai, 24 + i * caoDong);
    });
    if (this.streaming && Math.floor(this.tGian * 3) % 2 === 0) {
      const dongCuoi = hien[hien.length - 1] ?? '';
      const x = lePhai + c.measureText(dongCuoi.slice(0, 64)).width + 4;
      const y = 24 + (hien.length - 1) * caoDong;
      c.fillStyle = rgba(bang.vien, 0.95);
      c.fillRect(x, y, 16, 30);
    }
  }

  private veChart(
    c: CanvasRenderingContext2D,
    w: number,
    h: number,
    bang: { vien: number; chu: number },
  ): void {
    const so = this.noiDung
      .split(/[,\n]/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (so.length === 0) {
      c.font = '500 24px "Courier New", monospace';
      c.fillText(this.noiDung.slice(0, 60), 28, 24);
      return;
    }
    const max = Math.max(...so, 1);
    const le = 48;
    const rong = (w - le * 2) / so.length;
    so.forEach((v, i) => {
      const cao = ((h - 90) * v) / max;
      const x = le + i * rong + rong * 0.15;
      const yg = c.createLinearGradient(0, h - 50 - cao, 0, h - 50);
      yg.addColorStop(0, rgba(bang.vien, 0.95));
      yg.addColorStop(1, rgba(bang.vien, 0.35));
      c.fillStyle = yg;
      c.fillRect(x, h - 50 - cao, rong * 0.7, cao);
      c.fillStyle = rgba(bang.chu, 0.9);
      c.font = '400 18px "Courier New", monospace';
      c.fillText(String(v), x, h - 46 - cao - 20 < 10 ? 10 : h - 46 - cao - 20);
    });
    c.strokeStyle = rgba(bang.vien, 0.6);
    c.beginPath();
    c.moveTo(le, h - 50);
    c.lineTo(w - le, h - 50);
    c.stroke();
  }

  private veImage(
    c: CanvasRenderingContext2D,
    w: number,
    h: number,
    bang: { vien: number; chu: number },
  ): void {
    // A3 chưa nạp ảnh thật — vẽ khung "ảnh" placeholder giữ đúng hợp đồng kind
    const pad = 40;
    const gradient = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, rgba(bang.vien, 0.35));
    gradient.addColorStop(1, rgba(bang.vien, 0.05));
    c.fillStyle = gradient;
    c.fillRect(pad, pad, w - pad * 2, h - pad * 2);
    c.strokeStyle = rgba(bang.vien, 0.7);
    c.setLineDash([14, 10]);
    c.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    c.setLineDash([]);
    c.font = '500 24px "Courier New", monospace';
    c.fillStyle = rgba(bang.chu, 0.85);
    c.fillText(`[ảnh] ${this.noiDung.slice(0, 48)}`, pad + 20, pad + 24);
  }
}

function rgba(hex: number, a: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r},${g},${b},${a})`;
}
