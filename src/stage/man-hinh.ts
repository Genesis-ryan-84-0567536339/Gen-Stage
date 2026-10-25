/**
 * man-hinh.ts — màn hình hologram A3 (spec mục 3.4b).
 *
 * Tấm phẳng trong suốt phát sáng, vẽ nội dung bằng `CanvasTexture` (text/code/
 * log/chart/image), có scan-line chạy dọc và viền phát sáng (bắt sáng qua
 * `UnrealBloomPass` ở `world.ts`). `screen.stream` chạy chữ dần bằng cách nối
 * `content` rồi vẽ lại canvas; `source: "agent"` nối qua `screenAppend()` từ
 * `window.stage.feed(screen, chunk)` (nối dây ở `main.ts`).
 */
import * as THREE from 'three';

const DOI_MAU: Record<string, { vien: number; chu: number; nen: number }> = {
  text: { vien: 0x5fe0ff, chu: 0xdfffff, nen: 0x02181f },
  code: { vien: 0x5fe0ff, chu: 0x9dffb0, nen: 0x02181f },
  log: { vien: 0xff9d5f, chu: 0xffd9a8, nen: 0x1f1002 },
  chart: { vien: 0x5fe0ff, chu: 0xdfffff, nen: 0x02181f },
  image: { vien: 0x5fe0ff, chu: 0xdfffff, nen: 0x041018 },
};

/** Vị trí + góc mặc định của 3 màn hình cố định của lab, quanh `ban-dieu-khien`. */
export const MAC_DINH_MAN_HINH: Record<string, { pos: THREE.Vector3; rotY: number }> = {
  main: { pos: new THREE.Vector3(0, 1.82, -3.18), rotY: 0 },
  left: { pos: new THREE.Vector3(-1.4, 1.62, -3.0), rotY: 0.34 },
  right: { pos: new THREE.Vector3(1.4, 1.62, -3.0), rotY: -0.34 },
};

export class ManHinh {
  readonly id: string;
  readonly group = new THREE.Group();
  readonly panel: THREE.Mesh;
  readonly khung: THREE.LineSegments;
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
  private flicker = 0;

  constructor(id: string, size = 2.2, pos = new THREE.Vector3(), rotY = 0, tilt = 0) {
    this.id = id;
    this.docked = { pos: pos.clone(), rotY };

    this.canvas.width = 1024;
    this.canvas.height = 640;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;

    const h = size * (this.canvas.height / this.canvas.width);
    this.mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(size, h), this.mat);
    this.group.add(this.panel);

    const vienGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(size * 1.015, h * 1.03));
    this.khung = new THREE.LineSegments(
      vienGeo,
      new THREE.LineBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0.85 }),
    );
    this.group.add(this.khung);

    // chân đế hologram mỏng, phát sáng nhẹ dưới màn hình
    const chan = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.09, 0.05, 16),
      new THREE.MeshBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0.5, toneMapped: false }),
    );
    chan.position.y = -h / 2 - 0.06;
    this.group.add(chan);

    this.group.position.copy(pos);
    this.group.rotation.y = rotY;
    this.group.rotation.x = (tilt * Math.PI) / 180;

    this.ve();
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

  /** Nhịp hoạt hình: scan-line + nhấp nháy hologram nhẹ. */
  capNhat(dt: number): void {
    this.tGian += dt;
    this.flicker = 0.92 + Math.sin(this.tGian * 9) * 0.04 + (Math.random() - 0.5) * 0.015;
    this.mat.opacity = 0.9 * this.flicker;
    (this.khung.material as THREE.LineBasicMaterial).opacity = 0.75 * this.flicker;
    if (this.streaming && Math.floor(this.tGian * 6) % 2 === 0) this.ve(); // con trỏ nhấp nháy khi stream
  }

  dat(bloomDuocBat: boolean): void {
    // khi tắt bloom vì FPS thấp, tăng nhẹ độ sáng nền để viền vẫn rõ
    this.mat.opacity = bloomDuocBat ? this.mat.opacity : Math.min(1, this.mat.opacity + 0.05);
  }

  dispose(): void {
    this.panel.geometry.dispose();
    this.khung.geometry.dispose();
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

    if (!this.kind || !this.noiDung) {
      c.font = '600 28px "Courier New", monospace';
      c.globalAlpha = 0.5;
      c.fillText('— trống —', 28, 24);
      c.globalAlpha = 1;
    } else if (this.kind === 'chart') {
      this.veChart(c, w, h, bang);
    } else if (this.kind === 'image') {
      this.veImage(c, w, h, bang);
    } else {
      this.veChu(c, w, h, bang);
    }

    // scan-line quét dọc, chạy theo thời gian
    const yQuet = ((this.tGian * 140) % (h + 80)) - 40;
    const qg = c.createLinearGradient(0, yQuet - 40, 0, yQuet + 40);
    qg.addColorStop(0, rgba(bang.vien, 0));
    qg.addColorStop(0.5, rgba(bang.vien, 0.16));
    qg.addColorStop(1, rgba(bang.vien, 0));
    c.fillStyle = qg;
    c.fillRect(0, 0, w, h);

    this.tex.needsUpdate = true;
  }

  private veChu(
    c: CanvasRenderingContext2D,
    _w: number,
    h: number,
    bang: { vien: number; chu: number },
  ): void {
    const coChu = this.kind === 'code' || this.kind === 'log';
    c.font = `${coChu ? '400' : '600'} 26px "Courier New", monospace`;
    const lePhai = 32;
    const caoDong = 32;
    const soHang = Math.floor((h - 48) / caoDong);
    const dong = this.noiDung.split('\n');
    // cuộn: chỉ hiện `soHang` dòng cuối, giống terminal
    const hien = dong.slice(Math.max(0, dong.length - soHang));
    hien.forEach((d, i) => {
      if (this.kind === 'log') {
        if (/lỗi|error|fail/i.test(d)) c.fillStyle = 'rgba(255,110,110,0.95)';
        else if (/ok|xong|success|✓/i.test(d)) c.fillStyle = 'rgba(140,255,170,0.95)';
        else c.fillStyle = rgba(bang.chu, 0.9);
      } else {
        c.fillStyle = rgba(bang.chu, 0.92);
      }
      c.fillText(d.slice(0, 90), lePhai, 24 + i * caoDong);
    });
    if (this.streaming && Math.floor(this.tGian * 3) % 2 === 0) {
      const dongCuoi = hien[hien.length - 1] ?? '';
      const x = lePhai + c.measureText(dongCuoi.slice(0, 90)).width + 4;
      const y = 24 + (hien.length - 1) * caoDong;
      c.fillStyle = rgba(bang.vien, 0.95);
      c.fillRect(x, y, 14, 24);
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
