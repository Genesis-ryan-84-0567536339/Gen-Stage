/**
 * chat-lieu.ts — **CHẤT LIỆU** của căn nhà (D1b, Issue #48).
 *
 * Boss 26/10 sau D1: "cảnh còn trống và thô — gỗ/vải phải có vân, chi tiết
 * nhỏ, nắng chiều mềm như ảnh tham chiếu". File này gom mọi texture sinh bằng
 * canvas (procedural, không tải ảnh ngoài, không thêm phụ thuộc) + hai hàm
 * **phủ lại vật liệu** cho model Kenney đang là màu phẳng.
 *
 * Nguyên tắc sống còn (CLAUDE.md): **không nhân màu hai lần**. Vì thế có hai
 * loại texture khác hẳn nhau:
 *   · texture **MANG MÀU** (sàn ván gỗ, thảm hoa văn, vườn): dùng làm `map`
 *     thì `color` phải để trắng.
 *   · texture **VÂN TRUNG TÍNH** (`vanGo`, `vanVai`, `vanKimLoai`): trung bình
 *     ≈ trắng, chỉ mang hạt/sớ. Nhân vào `color` sẵn có của model Kenney nên
 *     model giữ đúng màu gốc mà hết phẳng lì. Đây là cách duy nhất phủ vân lên
 *     140 model Kenney mà không phải tự tô lại từng cái.
 */
import * as THREE from 'three';

/* --------------------------------------------------------------- tiện ích */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext('2d')!];
}

function tex(cv: HTMLCanvasElement, lap: [number, number], srgb = true): THREE.Texture {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(lap[0], lap[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Số ngẫu nhiên LẶP LẠI ĐƯỢC — cùng một hạt giống cho ra cùng một căn nhà. */
function ngauNhien(hat: number): () => number {
  let s = hat >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------ texture MANG MÀU */

/**
 * Sàn **ván gỗ 12 cm**: mỗi ván một tông nâu hơi khác, khe tối giữa hai ván,
 * mạch ngang chia đoạn, vân dọc chạy theo thớ. Ô texture = 2,4 m × 2,4 m nên
 * 20 ván lọt đúng vào 2,4 m (0,12 m/ván).
 */
export function sanVanGo(): { map: THREE.Texture; rough: THREE.Texture } {
  const N = 1024;
  const [cv, g] = canvas(N, N);
  const [cvR, gR] = canvas(N, N);
  const rnd = ngauNhien(20261026);
  const soVan = 20; // 2,4 m / 0,12 m
  const caoVan = N / soVan;

  g.fillStyle = '#a9794b';
  g.fillRect(0, 0, N, N);
  gR.fillStyle = '#9a9a9a'; // roughness nền ~0,60
  gR.fillRect(0, 0, N, N);

  for (let i = 0; i < soVan; i++) {
    const y0 = i * caoVan;
    // biến thiên màu từng ván: ±16 độ sáng, hơi lệch cả sắc
    const l = (rnd() - 0.5) * 32;
    const am = (rnd() - 0.5) * 10;
    g.fillStyle = `rgb(${Math.round(176 + l + am)}, ${Math.round(130 + l * 0.72)}, ${Math.round(86 + l * 0.42 - am * 0.4)})`;
    g.fillRect(0, y0, N, caoVan);

    // mạch ngang chia ván thành đoạn dài khác nhau (sàn thật không liền mạch)
    let x = rnd() * N * 0.6;
    while (x < N) {
      g.fillStyle = 'rgba(62,40,20,0.55)';
      g.fillRect(x, y0 + 1, 2, caoVan - 2);
      gR.fillStyle = 'rgba(210,210,210,0.8)';
      gR.fillRect(x, y0 + 1, 2, caoVan - 2);
      x += N * (0.35 + rnd() * 0.5);
    }

    // vân dọc theo thớ gỗ — đường cong mảnh, đậm nhạt khác nhau
    for (let k = 0; k < 9; k++) {
      const yy = y0 + 3 + rnd() * (caoVan - 6);
      g.strokeStyle = `rgba(96,62,32,${0.08 + rnd() * 0.16})`;
      g.lineWidth = 0.8 + rnd() * 1.6;
      g.beginPath();
      g.moveTo(0, yy);
      let cy = yy;
      for (let xx = 0; xx <= N; xx += 24) {
        cy += (rnd() - 0.5) * 3.2;
        g.lineTo(xx, Math.max(y0 + 1, Math.min(y0 + caoVan - 1, cy)));
      }
      g.stroke();
    }

    // KHE giữa hai ván — tối và hơi nhám hơn, đây là thứ cho ra "ván", không
    // phải "mặt gỗ liền" như bản D1.
    g.fillStyle = 'rgba(54,34,16,0.62)';
    g.fillRect(0, y0, N, 2);
    gR.fillStyle = 'rgba(225,225,225,0.9)';
    gR.fillRect(0, y0, N, 2);
  }

  return {
    map: tex(cv, [14 / 2.4, 10 / 2.4]),
    rough: tex(cvR, [14 / 2.4, 10 / 2.4], false),
  };
}

/** Tường sơn kem ấm — vân sơn rất mịn, chỉ để hết "nhựa". */
export function tuongKem(): THREE.Texture {
  const [cv, g] = canvas(256, 256);
  const rnd = ngauNhien(7);
  g.fillStyle = '#f0e4d0';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    g.fillStyle = `rgba(136,112,78,${rnd() * 0.035})`;
    g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  return tex(cv, [14 / 3, 2.8 / 1.5]);
}

/** Thảm **hoa văn**: nền đất nung + viền + ô trám + rìa tua. */
export function thamHoaVan(): THREE.Texture {
  const N = 512;
  const [cv, g] = canvas(N, N);
  g.fillStyle = '#9c5c45';
  g.fillRect(0, 0, N, N);
  // viền ngoài
  g.strokeStyle = '#e8cfa6';
  g.lineWidth = 14;
  g.strokeRect(26, 26, N - 52, N - 52);
  g.strokeStyle = '#6d3b2c';
  g.lineWidth = 5;
  g.strokeRect(46, 46, N - 92, N - 92);
  // ô trám giữa thảm
  g.save();
  g.translate(N / 2, N / 2);
  for (const [r, mau] of [
    [150, '#e8cfa6'],
    [104, '#c88a5e'],
    [58, '#e8cfa6'],
  ] as const) {
    g.beginPath();
    g.moveTo(0, -r);
    g.lineTo(r * 0.72, 0);
    g.lineTo(0, r);
    g.lineTo(-r * 0.72, 0);
    g.closePath();
    g.fillStyle = mau;
    g.fill();
  }
  g.restore();
  // chấm trang trí 4 góc
  for (const [x, y] of [
    [96, 96],
    [N - 96, 96],
    [96, N - 96],
    [N - 96, N - 96],
  ] as const) {
    g.fillStyle = '#e8cfa6';
    g.beginPath();
    g.arc(x, y, 17, 0, Math.PI * 2);
    g.fill();
  }
  const t = tex(cv, [1, 1]);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Tranh treo tường — 3 bố cục trừu tượng ấm, chọn theo `kieu`. */
export function tranhTuong(kieu: number): THREE.Texture {
  const [cv, g] = canvas(256, 320);
  const rnd = ngauNhien(900 + kieu * 31);
  g.fillStyle = '#f3e7d2';
  g.fillRect(0, 0, 256, 320);
  if (kieu % 3 === 0) {
    // đồi núi hoàng hôn
    g.fillStyle = '#f7c98d';
    g.fillRect(0, 0, 256, 200);
    g.fillStyle = '#e8975c';
    g.beginPath();
    g.arc(170, 120, 36, 0, Math.PI * 2);
    g.fill();
    for (const [y, mau] of [
      [196, '#8a6a4a'],
      [228, '#6b5238'],
      [262, '#4d3a28'],
    ] as const) {
      g.fillStyle = mau;
      g.beginPath();
      g.moveTo(0, 320);
      g.lineTo(0, y);
      for (let x = 0; x <= 256; x += 32) g.lineTo(x, y - rnd() * 34);
      g.lineTo(256, 320);
      g.fill();
    }
  } else if (kieu % 3 === 1) {
    // mảng màu đất xếp lớp
    for (let i = 0; i < 7; i++) {
      g.fillStyle = `rgb(${160 + rnd() * 70}, ${110 + rnd() * 60}, ${80 + rnd() * 40})`;
      g.fillRect(24 + rnd() * 40, 30 + i * 38, 180 - rnd() * 60, 30);
    }
  } else {
    // nhành lá đơn sắc
    g.strokeStyle = '#4f6b43';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(128, 300);
    g.lineTo(128, 60);
    g.stroke();
    for (let i = 0; i < 9; i++) {
      const y = 86 + i * 24;
      const r = 42 - i * 3;
      for (const s of [-1, 1]) {
        g.fillStyle = '#5c7a4c';
        g.beginPath();
        g.ellipse(128 + s * r * 0.5, y, r * 0.45, 11, s * 0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const t = tex(cv, [1, 1]);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Bảng ghim: nền bần + mấy tờ giấy màu ghim lệch nhau. */
export function bangGhim(): THREE.Texture {
  const [cv, g] = canvas(320, 240);
  const rnd = ngauNhien(4242);
  g.fillStyle = '#c69a62';
  g.fillRect(0, 0, 320, 240);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(90,60,30,${rnd() * 0.12})`;
    g.fillRect(rnd() * 320, rnd() * 240, 2, 2);
  }
  for (const [x, y, w, h, mau] of [
    [26, 24, 84, 68, '#f6f0df'],
    [132, 34, 76, 58, '#ffe9a8'],
    [224, 22, 72, 80, '#dbe9f6'],
    [40, 126, 96, 76, '#ffd9c4'],
    [164, 122, 120, 86, '#f6f0df'],
  ] as const) {
    g.save();
    g.translate(x + w / 2, y + h / 2);
    g.rotate((rnd() - 0.5) * 0.2);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(-w / 2 + 3, -h / 2 + 3, w, h);
    g.fillStyle = mau;
    g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = 'rgba(90,80,60,0.45)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.moveTo(-w / 2 + 8, -h / 2 + 14 + k * 12);
      g.lineTo(w / 2 - 10 - rnd() * 20, -h / 2 + 14 + k * 12);
      g.stroke();
    }
    g.fillStyle = '#cc4b3a';
    g.beginPath();
    g.arc(0, -h / 2 + 6, 4, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const t = tex(cv, [1, 1]);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/**
 * Bầu trời chiều — nền cho SÂN VƯỜN ngoài cửa sổ (cây/hàng rào là hình khối
 * thật dựng trong `phong.ts`, không còn vẽ dẹt lên một tấm như D1).
 */
export function troiChieu(): THREE.Texture {
  const [cv, g] = canvas(512, 384);
  const rnd = ngauNhien(31337);
  const grad = g.createLinearGradient(0, 0, 0, 384);
  grad.addColorStop(0, '#93c2dc');
  grad.addColorStop(0.55, '#ffdcb0');
  grad.addColorStop(1, '#ffc994');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 384);
  // mây mềm
  for (let i = 0; i < 16; i++) {
    const x = rnd() * 512;
    const y = 30 + rnd() * 150;
    const r = 30 + rnd() * 60;
    const gr = g.createRadialGradient(x, y, 2, x, y, r);
    gr.addColorStop(0, `rgba(255,243,226,${0.1 + rnd() * 0.13})`);
    gr.addColorStop(1, 'rgba(255,246,232,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = tex(cv, [1, 1]);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Cỏ sân vườn — xanh ấm, lốm đốm, nhìn từ xa qua cửa sổ. */
export function coSanVuon(): THREE.Texture {
  const [cv, g] = canvas(256, 256);
  const rnd = ngauNhien(55);
  g.fillStyle = '#6f8a4a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const l = rnd();
    g.fillStyle = `rgba(${Math.round(90 + l * 70)},${Math.round(120 + l * 60)},${Math.round(60 + l * 40)},0.6)`;
    g.fillRect(rnd() * 256, rnd() * 256, 3, 2);
  }
  return tex(cv, [8, 8]);
}

/* ------------------------------------------- texture VÂN (trung tính ≈ trắng) */

/** Vân gỗ trung tính — nhân lên màu gốc của model Kenney, không đổi tông. */
export function vanGo(): THREE.Texture {
  const [cv, g] = canvas(256, 256);
  const rnd = ngauNhien(101);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 44; k++) {
    const y = rnd() * 256;
    g.strokeStyle = `rgba(140,110,80,${0.05 + rnd() * 0.12})`;
    g.lineWidth = 0.7 + rnd() * 2.2;
    g.beginPath();
    g.moveTo(0, y);
    let cy = y;
    for (let x = 0; x <= 256; x += 16) {
      cy += (rnd() - 0.5) * 4;
      g.lineTo(x, cy);
    }
    g.stroke();
  }
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `rgba(255,255,255,${rnd() * 0.25})`;
    g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  return tex(cv, [2, 2], false);
}

/** Vân **vải dệt** trung tính — sợi ngang/dọc đan nhau, thấy rõ ở cận cảnh. */
export function vanVai(): THREE.Texture {
  const [cv, g] = canvas(128, 128);
  const rnd = ngauNhien(202);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  // Tương phản ĐẬM hơn bản vòng 1 (0,13/0,22/0,11): tần số vân vải đã hạ về
  // 0,6 ô/m nên sợi dệt to ra, phải đậm tương ứng mới "đọc" được ở 1440 px.
  for (let i = 0; i < 128; i += 4) {
    g.fillStyle = 'rgba(112,100,84,0.26)';
    g.fillRect(i, 0, 2, 128);
    g.fillStyle = 'rgba(255,255,255,0.34)';
    g.fillRect(i + 2, 0, 2, 128);
  }
  for (let j = 0; j < 128; j += 4) {
    g.fillStyle = 'rgba(112,100,84,0.22)';
    g.fillRect(0, j, 128, 2);
  }
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(86,76,62,${rnd() * 0.18})`;
    g.fillRect(rnd() * 128, rnd() * 128, 1, 1);
  }
  return tex(cv, [6, 6], false);
}

/** Vân kim loại chải trung tính. */
export function vanKimLoai(): THREE.Texture {
  const [cv, g] = canvas(128, 128);
  const rnd = ngauNhien(303);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    const y = rnd() * 128;
    g.strokeStyle = `rgba(150,150,150,${rnd() * 0.12})`;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(128, y + (rnd() - 0.5));
    g.stroke();
  }
  return tex(cv, [3, 3], false);
}

/* ----------------------------------------------------- phủ lại vật liệu */

export type NhomChatLieu = 'go' | 'vai' | 'kim-loai' | 'tham' | 'nham';

const KHO_VAN: Partial<Record<NhomChatLieu, THREE.Texture>> = {};

function vanCua(nhom: NhomChatLieu): THREE.Texture | null {
  if (nhom === 'tham') return null;
  if (!KHO_VAN[nhom]) {
    KHO_VAN[nhom] =
      nhom === 'vai' ? vanVai() : nhom === 'kim-loai' ? vanKimLoai() : vanGo();
  }
  return KHO_VAN[nhom]!;
}

/** Độ nhám / độ kim loại theo nhóm — số thật của vật liệu, không phải cảm tính. */
const THONG_SO: Record<NhomChatLieu, { nham: number; kim: number }> = {
  go: { nham: 0.6, kim: 0 },
  vai: { nham: 0.95, kim: 0 },
  'kim-loai': { nham: 0.35, kim: 0.55 },
  tham: { nham: 0.98, kim: 0 },
  nham: { nham: 0.85, kim: 0 },
};

/**
 * Kho vật liệu dẫn xuất — khoá theo `(vật liệu gốc, nhóm, màu nhuộm)`.
 *
 * Đây là chỗ **tiết kiệm draw call**: nếu mỗi mesh tự `clone()` vật liệu thì
 * 40 món đồ Kenney ra 150 vật liệu khác nhau, không gộp được gì. Dùng chung
 * một bản cho mọi mesh cùng gốc + cùng nhóm thì `gopTinh()` trong `phong.ts`
 * gộp được cả trăm mesh tĩnh xuống vài chục lượt vẽ.
 */
const KHO_VAT_LIEU = new Map<string, THREE.Material>();

/**
 * Model Kenney **đã có `map`**: đó là một **atlas bảng màu** (mỗi mặt trỏ vào
 * một ô vài pixel), nên không thể thay `map` bằng vân — thay là mất sạch màu
 * phân biệt từng bộ phận, mà để nguyên thì khối phẳng lì (đúng điểm kiểm độc
 * lập chấm "sofa/ghế/bàn là khối phẳng").
 *
 * Cách rẻ nhất mà vẫn thật: tiêm một dòng vào shader chuẩn của three —
 * **nhân** màu khuếch tán với vân, lấy toạ độ vân từ **vị trí đỉnh trong
 * không gian model** (không dùng `uv` atlas). Không thêm pass, không thêm
 * render target, chỉ một lần `texture2D` thêm trên mỗi điểm ảnh.
 */
function phuVanLenMap(
  mat: THREE.MeshStandardMaterial,
  van: THREE.Texture,
  tanSo: number,
): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.vanMap = { value: van };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vVanUv;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvVanUv = vec2(position.x + position.z, position.y - position.z) * ${tanSo.toFixed(3)};`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D vanMap;\nvarying vec2 vVanUv;')
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\ndiffuseColor.rgb *= texture2D(vanMap, vVanUv).rgb;',
      );
  };
  // Hai vật liệu cùng `onBeforeCompile` khác nhau phải biên dịch riêng.
  mat.customProgramCacheKey = () => `van-${van.uuid}-${tanSo}`;
  mat.needsUpdate = true;
}

/**
 * TẦN SỐ VÂN (số ô texture trên mỗi mét) theo nhóm chất liệu.
 *
 * Kiểm độc lập PR #51: "`* 1.6` làm vân quá mịn, sofa/ghế/tủ vẫn là khối màu
 * phẳng ở 1440 px" → vải hạ về **0,6** (một ô vân ≈ 1,7 m: sợi dệt to bằng
 * đúng cỡ nhìn thấy được), gỗ giữ 1,6 (sớ gỗ mịn mới ra gỗ), kim loại 1,2.
 */
const TAN_SO_VAN: Record<NhomChatLieu, number> = {
  go: 1.6,
  vai: 0.6,
  'kim-loai': 1.2,
  tham: 1,
  nham: 1.0,
};

function nhuom(mat: THREE.MeshStandardMaterial, mauDich: number): void {
  const dich = new THREE.Color(mauDich);
  const hslD = { h: 0, s: 0, l: 0 };
  dich.getHSL(hslD);
  const hsl = { h: 0, s: 0, l: 0 };
  mat.color.getHSL(hsl);
  // chân gỗ / khung tối / kim loại xám: KHÔNG nhuộm — chỉ mảng vải lớn mới đổi
  if (hsl.l < 0.22 || hsl.s < 0.06) return;
  mat.color.setHSL(hslD.h, hslD.s, THREE.MathUtils.clamp(hsl.l * 0.5 + hslD.l * 0.6, 0.12, 0.7));
}

/**
 * Phủ **vân + độ nhám** (và nhuộm vải nếu có `mauVai`) lên một model Kenney
 * đang là màu phẳng.
 *
 * KHÔNG đụng `color` khi không có `mauVai`: vân là texture trung tính (trung
 * bình ≈ trắng) nên `color × map` vẫn ra đúng màu gốc, chỉ thêm sớ. Đây là chỗ
 * bài học "vật liệu không nhân màu hai lần" (CLAUDE.md) thành lợi thế thay vì
 * cạm bẫy — và là cách phủ chất liệu cho 140 model CC0 mà không tô tay cái nào.
 */
export function apChatLieu(obj: THREE.Object3D, nhom: NhomChatLieu, mauVai?: number): void {
  const van = vanCua(nhom);
  const ts = THONG_SO[nhom];
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const doi = (vl: THREE.Material): THREE.Material => {
      const goc = vl as THREE.MeshStandardMaterial;
      if (!goc || !('roughness' in goc)) return vl;
      const khoa = `${goc.uuid}|${nhom}|${mauVai ?? ''}`;
      const co = KHO_VAT_LIEU.get(khoa);
      if (co) return co;
      const ban = goc.clone();
      /*
       * LUÔN phủ vân bằng shader, KHÔNG gán `map = van` nữa (PR #51 vòng 2).
       * Lý do: model Kenney Furniture Kit không có kênh UV dùng được (vật liệu
       * là màu phẳng, không atlas) — gán `map` thì mọi đỉnh lấy cùng một điểm
       * texture, ra đúng "khối màu phẳng" mà kiểm độc lập chấm. Phủ bằng toạ
       * độ ĐỈNH thì vân hiện trên mọi model, không phụ thuộc UV, và vẫn chỉ
       * tốn thêm MỘT lần `texture2D` trên mỗi điểm ảnh.
       */
      if (van) phuVanLenMap(ban, van, TAN_SO_VAN[nhom]);
      ban.roughness = ts.nham;
      ban.metalness = ts.kim;
      if (mauVai !== undefined) nhuom(ban, mauVai);
      ban.needsUpdate = true;
      KHO_VAT_LIEU.set(khoa, ban);
      return ban;
    };
    m.material = Array.isArray(m.material)
      ? m.material.map(doi)
      : doi(m.material as THREE.Material);
  });
}
