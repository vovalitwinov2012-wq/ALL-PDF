// Минимальный EXIF-парсер: достаем orientation из JPEG, чтобы
// портретные фото с телефона не встраивались боком.
export function getJpegOrientation(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let off = 2;
  while (off + 4 <= bytes.length) {
    if (bytes[off] !== 0xff) break;
    const marker = bytes[off + 1];
    if (marker === 0xda || marker === 0xd9) break; // SOS / EOI — дальше данных нет
    const len = (bytes[off + 2] << 8) | bytes[off + 3];
    if (len < 2 || off + 2 + len > bytes.length) break;
    if (
      marker === 0xe1 &&
      len > 8 &&
      bytes[off + 4] === 0x45 && // 'E'
      bytes[off + 5] === 0x78 && // 'x'
      bytes[off + 6] === 0x69 && // 'i'
      bytes[off + 7] === 0x66 && // 'f'
      bytes[off + 8] === 0x00 &&
      bytes[off + 9] === 0x00
    ) {
      const o = readOrientation(bytes, off + 10, len - 8);
      if (o >= 1 && o <= 8) return o;
    }
    off += 2 + len;
  }
  return 1;
}

function readOrientation(bytes: Uint8Array, tiffStart: number, tiffLen: number): number {
  if (tiffLen < 8) return 1;
  const little = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
  const big = bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d;
  if (!little && !big) return 1;
  const u16 = (p: number) => (little ? bytes[p] | (bytes[p + 1] << 8) : (bytes[p] << 8) | bytes[p + 1]);
  const u32 = (p: number) =>
    little
      ? bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24)
      : (bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3];
  if (u16(tiffStart + 2) !== 42) return 1;
  const ifd = tiffStart + u32(tiffStart + 4);
  if (ifd < tiffStart || ifd + 2 > tiffStart + tiffLen) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > tiffStart + tiffLen) break;
    if (u16(e) === 0x0112) return u16(e + 8); // orientation — SHORT, значение в первых 2 байтах
  }
  return 1;
}

/** Нужен ли поворот canvas'ом (ориентации 3/6/8). Зеркальные 2/4/5/7 встречаются крайне редко — оставляем как есть. */
export function needsRotation(orientation: number): boolean {
  return orientation === 3 || orientation === 6 || orientation === 8;
}
