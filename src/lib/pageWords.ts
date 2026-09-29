import * as pdfjs from 'pdfjs-dist';
import type { OverlayWord } from '../components/PdfOverlay';

// Слова текстового слоя с боксами в долях страницы (0..1).
// Точность бокса — уровень подсветки поиска: ширина аппроксимируется
// по длине строки (~0.55em на символ), высоты достаточно для highlight-полосы.
export async function wordsToFractions(
  page: pdfjs.PDFPageProxy,
  viewport: pdfjs.PageViewport,
  canvasW: number,
  canvasH: number
): Promise<OverlayWord[]> {
  const out: OverlayWord[] = [];
  try {
    const content = await page.getTextContent();
    for (const raw of content.items as Array<{ str: string; transform: number[] }>) {
      const str = (raw.str ?? '').trim();
      if (!str) continue;
      const tx = pdfjs.Util.transform(
        viewport.transform,
        raw.transform as [number, number, number, number, number, number]
      );
      const fontH = Math.hypot(tx[2], tx[3]);
      if (fontH <= 0 || canvasW <= 0 || canvasH <= 0) continue;
      const x = tx[4] / canvasW;
      const yTop = (tx[5] - fontH) / canvasH;
      const w = (str.length * fontH * 0.55) / canvasW;
      const h = fontH / canvasH;
      out.push({
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, yTop)),
        w: Math.min(1, Math.max(0.004, w)),
        h: Math.min(1, Math.max(0.004, h)),
        str
      });
    }
  } catch {
    return [];
  }
  return out;
}
