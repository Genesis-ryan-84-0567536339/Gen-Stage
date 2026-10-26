/**
 * lib-png.mjs — giải mã PNG 8-bit (RGB/RGBA, không interlace) THUẦN NODE
 * (chỉ dùng `zlib` có sẵn, không cài thêm gói) — dùng cho đo luma trong
 * `kiem-c3.mjs` mà không cần giữ trang trình duyệt sống (tránh Chrome bị
 * OOM-kill giữa chừng trên máy đang chạy nhiều tiến trình khác của Sếp).
 */
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

export function decodePng(filePath) {
  const buf = readFileSync(filePath);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`không phải PNG: ${filePath}`);
  let off = 8;
  let width = 0,
    height = 0,
    bitDepth = 0,
    colorType = 0,
    interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 8 + len + 4;
  }
  if (bitDepth !== 8) throw new Error(`chỉ hỗ trợ bitDepth 8, gặp ${bitDepth}`);
  if (interlace !== 0) throw new Error('không hỗ trợ PNG interlace');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`colorType ${colorType} không hỗ trợ`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let rawOff = 0;
  let prevRowStart = -1;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOff++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const b = raw[rawOff + x];
      const a = x >= channels ? out[rowStart + x - channels] : 0;
      const bPix = prevRowStart >= 0 ? out[prevRowStart + x] : 0;
      const c = x >= channels && prevRowStart >= 0 ? out[prevRowStart + x - channels] : 0;
      let v;
      switch (filterType) {
        case 0:
          v = b;
          break;
        case 1:
          v = (b + a) & 0xff;
          break;
        case 2:
          v = (b + bPix) & 0xff;
          break;
        case 3:
          v = (b + ((a + bPix) >> 1)) & 0xff;
          break;
        case 4: {
          const p = a + bPix - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - bPix);
          const pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? bPix : c;
          v = (b + pr) & 0xff;
          break;
        }
        default:
          throw new Error(`filter type lạ: ${filterType}`);
      }
      out[rowStart + x] = v;
    }
    rawOff += stride;
    prevRowStart = rowStart;
  }
  return { width, height, channels, data: out };
}

/** Luma (Rec.709) cho một vùng crop {x,y,w,h}; mặc định cả ảnh. */
export function lumaStats(filePath, box) {
  const img = decodePng(filePath);
  const b = box ?? { x: 0, y: 0, w: img.width, h: img.height };
  const x0 = Math.max(0, Math.min(img.width - 1, b.x));
  const y0 = Math.max(0, Math.min(img.height - 1, b.y));
  const x1 = Math.max(x0 + 1, Math.min(img.width, b.x + b.w));
  const y1 = Math.max(y0 + 1, Math.min(img.height, b.y + b.h));
  const lumas = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * img.channels;
      const r = img.data[i];
      const g = img.data[i + 1];
      const bl = img.data[i + 2];
      lumas.push(0.2126 * r + 0.7152 * g + 0.0722 * bl);
    }
  }
  lumas.sort((a, c) => a - c);
  const pct = (p) => lumas[Math.min(lumas.length - 1, Math.max(0, Math.floor(p * lumas.length)))];
  return {
    n: lumas.length,
    p5: +pct(0.05).toFixed(1),
    p50: +pct(0.5).toFixed(1),
    p95: +pct(0.95).toFixed(1),
    p99: +pct(0.99).toFixed(1),
    max: +lumas[lumas.length - 1].toFixed(1),
  };
}
