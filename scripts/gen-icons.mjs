// Генератор PWA-иконок ALL PDF без внешних зависимостей.
// Рисуем градиентный скругленный квадрат + белый «лист» с полосками текста,
// кодируем PNG вручную (zlib из Node.js).
// Запуск: node scripts/gen-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });

// ---------- CRC32 ----------
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(w, h, rgba) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter: None
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * stride + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- Рисование ----------
function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
const INDIGO = [99, 102, 241];
const VIOLET = [168, 85, 247];

function rrCover(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return 0;
  if (r <= 0) return 1;
  const nx = Math.min(Math.max(x, x0 + r), x1 - r);
  const ny = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - nx;
  const dy = y - ny;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d === 0) return 1;
  const t = r - d + 0.5;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

function render(size, { fullBleed = false, sheetScale = 1 } = {}) {
  const buf = new Uint8ClampedArray(size * size * 4);
  const put = (x, y, r, g, b, a) => {
    const i = (y * size + x) * 4;
    const sa = a / 255;
    buf[i] = r * sa + buf[i] * (1 - sa);
    buf[i + 1] = g * sa + buf[i + 1] * (1 - sa);
    buf[i + 2] = b * sa + buf[i + 2] * (1 - sa);
    buf[i + 3] = Math.min(255, buf[i + 3] + a);
  };
  // Фон: градиент
  const m = fullBleed ? 0 : size * 0.04;
  const br = fullBleed ? 0 : size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = rrCover(x + 0.5, y + 0.5, m, m, size - m, size - m, br);
      if (c <= 0) continue;
      const t = (x + y) / (2 * size);
      const [r, g, b] = lerp(INDIGO, VIOLET, t);
      put(x, y, r, g, b, Math.round(255 * c));
    }
  }
  // Лист документа
  const cx = size / 2;
  const sw = size * 0.4 * sheetScale;
  const sh = size * 0.52 * sheetScale;
  const sx0 = cx - sw / 2;
  const sy0 = size * 0.5 - sh / 2;
  const sr = size * 0.05 * sheetScale;
  for (let y = Math.floor(sy0); y < sy0 + sh; y++) {
    for (let x = Math.floor(sx0); x < sx0 + sw; x++) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const c = rrCover(x + 0.5, y + 0.5, sx0, sy0, sx0 + sw, sy0 + sh, sr);
      if (c <= 0) continue;
      put(x, y, 255, 255, 255, Math.round(255 * c));
    }
  }
  // Полоски «текста»
  const bw = sw * 0.62;
  const bh = Math.max(2, size * 0.035 * sheetScale);
  const bx0 = cx - bw / 2;
  for (let row = 0; row < 3; row++) {
    const by0 = sy0 + sh * 0.24 + row * sh * 0.18;
    const w = row === 2 ? bw * 0.6 : bw;
    for (let y = Math.floor(by0); y < by0 + bh; y++) {
      for (let x = Math.floor(bx0); x < bx0 + w; x++) {
        put(x, y, 99, 102, 241, 255);
      }
    }
  }
  return buf;
}

const jobs = [
  ['pwa-192x192.png', 192, {}],
  ['pwa-512x512.png', 512, {}],
  ['pwa-maskable-512x512.png', 512, { fullBleed: true, sheetScale: 0.62 }],
  ['apple-touch-icon.png', 180, { fullBleed: true, sheetScale: 0.8 }]
];
for (const [name, size, opts] of jobs) {
  const png = encodePng(size, size, render(size, opts));
  writeFileSync(join(outDir, name), png);
  console.log(`${name}: ${(png.length / 1024).toFixed(1)} KB`);
}
console.log('icons done');
