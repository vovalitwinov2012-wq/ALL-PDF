import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { needsUnicodeFont, textFont, __setFontBytesProvider } from './fonts';

afterEach(() => __setFontBytesProvider(null));

describe('needsUnicodeFont', () => {
  it('латиница — стандартный шрифт', () => {
    expect(needsUnicodeFont('ALL PDF 123')).toBe(false);
    expect(needsUnicodeFont('Café naïve')).toBe(false);
  });
  it('кириллица и прочее — юникод-шрифт', () => {
    expect(needsUnicodeFont('СОГЛАСОВАНО')).toBe(true);
    expect(needsUnicodeFont('Hello, мир!')).toBe(true);
  });
});

describe('textFont', () => {
  it('латиница не трогает сеть', async () => {
    const doc = await PDFDocument.create();
    const load = vi.fn(async () => new Uint8Array());
    __setFontBytesProvider(load);
    const font = await textFont(doc, 'Page 1 / 2', false);
    font.widthOfTextAtSize('Page', 12);
    expect(load).not.toHaveBeenCalled();
  });
  it('кириллица вжигается реальным шрифтом без исключений', async () => {
    __setFontBytesProvider(async (url) =>
      new Uint8Array(readFileSync(url.includes('Bold') ? 'src/assets/fonts/DejaVuSans-Bold.ttf' : 'src/assets/fonts/DejaVuSans.ttf'))
    );
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 200]);
    const font = await textFont(doc, 'СОГЛАСОВАНО', true);
    page.drawText('СОГЛАСОВАНО', { x: 20, y: 100, size: 16, font });
    const bytes = await doc.save();
    const back = await PDFDocument.load(bytes);
    expect(back.getPageCount()).toBe(1);
  });
});
