import { nativeImage, type NativeImage } from 'electron';

/** Draws a small "tray with arrow" glyph into a BGRA bitmap at the given pixel size. */
function glyph(size: number, rgb: [number, number, number]): Buffer {
  const buf = Buffer.alloc(size * size * 4);
  const s = size / 18;
  const line = Math.max(1, Math.round(1.6 * s));
  const set = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = rgb[2]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[0]; buf[i + 3] = 255;
  };
  const rect = (x0: number, y0: number, w: number, h: number) => {
    for (let y = Math.round(y0 * s); y < Math.round((y0 + h) * s); y++)
      for (let x = Math.round(x0 * s); x < Math.round((x0 + w) * s); x++) set(x, y);
  };
  const lw = line / s;
  // Tray: bottom bar and two side walls.
  rect(2, 15 - lw, 14, lw);
  rect(2, 10, lw, 5);
  rect(16 - lw, 10, lw, 5);
  // Arrow pointing down into the tray.
  rect(9 - lw / 2, 2, lw, 8);
  for (let i = 0; i <= Math.round(3 * s); i++) {
    const y = Math.round(10 * s) - i;
    for (let t = 0; t < line; t++) {
      set(Math.round(9 * s) - i - t, y);
      set(Math.round(9 * s) + i + t - 1, y);
    }
  }
  return buf;
}

export function trayIcon(): NativeImage {
  const mac = process.platform === 'darwin';
  // macOS uses a black template image that the system recolors; Windows needs a visible light glyph.
  const color: [number, number, number] = mac ? [0, 0, 0] : [235, 235, 235];
  const base = mac ? 18 : 16;
  const img = nativeImage.createFromBitmap(glyph(base, color), { width: base, height: base, scaleFactor: 1 });
  img.addRepresentation({ scaleFactor: 2, width: base * 2, height: base * 2, buffer: glyph(base * 2, color) });
  if (mac) img.setTemplateImage(true);
  return img;
}
