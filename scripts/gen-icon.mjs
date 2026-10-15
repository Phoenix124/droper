// Renders assets/icon.png (1024x1024) without external tools: rounded gradient tile with a tray glyph.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const S = 1024;
const px = Buffer.alloc(S * S * 4);

function crc32(buf) {
  let c, crc = ~0;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function roundedRectAlpha(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const d = Math.hypot(x - cx, y - cy);
  return Math.max(0, Math.min(1, r - d + 0.5));
}

function blend(i, r, g, b, a) {
  const ia = 1 - a;
  px[i] = px[i] * ia + r * a;
  px[i + 1] = px[i + 1] * ia + g * a;
  px[i + 2] = px[i + 2] * ia + b * a;
  px[i + 3] = Math.min(255, px[i + 3] + 255 * a);
}

const M = 100; // macOS icon grid margin
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const a = roundedRectAlpha(x, y, M, M, S - M, S - M, 185);
    if (a <= 0) continue;
    const t = (y - M) / (S - 2 * M);
    blend(i, 40 + 30 * t, 120 - 40 * t, 255 - 40 * t, a);
    // Tray: U shape.
    const tray =
      roundedRectAlpha(x, y, 260, 600, 764, 680, 40) ||
      roundedRectAlpha(x, y, 260, 470, 340, 680, 40) ||
      roundedRectAlpha(x, y, 684, 470, 764, 680, 40);
    // Arrow: shaft and head.
    const shaft = roundedRectAlpha(x, y, 472, 250, 552, 470, 30);
    const head = y >= 420 && y <= 560 && Math.abs(x - 512) <= (560 - y) * 1.1 ? 1 : 0;
    const glyph = Math.max(tray, shaft, head);
    if (glyph > 0) blend(i, 255, 255, 255, glyph * a);
  }
}

const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
mkdirSync(new URL('../assets', import.meta.url), { recursive: true });
writeFileSync(new URL('../assets/icon.png', import.meta.url), png);
console.log('assets/icon.png', png.length, 'bytes');
