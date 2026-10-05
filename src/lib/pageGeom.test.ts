import { describe, expect, it } from 'vitest';
import { isRotatedPage } from './pageGeom';

describe('isRotatedPage', () => {
  it('обычные страницы не помечает', () => {
    expect(isRotatedPage(595, 842, 595, 842)).toBe(false); // портрет
    expect(isRotatedPage(842, 595, 842, 595)).toBe(false); // альбом
    expect(isRotatedPage(500, 500, 500, 500)).toBe(false); // квадрат
  });
  it('ловит поворот 90/270', () => {
    expect(isRotatedPage(595, 842, 842, 595)).toBe(true);
  });
});
