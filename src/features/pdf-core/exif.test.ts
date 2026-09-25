import { describe, expect, it } from 'vitest';
import { getJpegOrientation, needsRotation } from './exif';

// Минимальный JPEG: SOI + APP1(Exif, orientation) + EOI
function jpegWithOrientation(o: number, little = true): Uint8Array {
  const tiff = little
    ? [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, o, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    : [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, o, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const exif = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const len = 2 + exif.length;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...exif, 0xff, 0xd9]);
}

describe('exif', () => {
  it('reads orientation LE and BE', () => {
    expect(getJpegOrientation(jpegWithOrientation(6))).toBe(6);
    expect(getJpegOrientation(jpegWithOrientation(3, false))).toBe(3);
    expect(getJpegOrientation(jpegWithOrientation(1))).toBe(1);
  });
  it('defaults to 1 without exif or for non-jpeg', () => {
    expect(getJpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBe(1);
    expect(getJpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1);
    expect(getJpegOrientation(new Uint8Array([]))).toBe(1);
  });
  it('flags only 3/6/8 for rotation', () => {
    expect(needsRotation(6)).toBe(true);
    expect(needsRotation(8)).toBe(true);
    expect(needsRotation(3)).toBe(true);
    expect(needsRotation(1)).toBe(false);
  });
});
