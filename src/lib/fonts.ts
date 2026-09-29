// Шрифты для вжигания текста: стандартный Helvetica знает только WinAnsi
// (кириллица в нём — исключение WinAnsi cannot encode). Если в строке есть
// символы вне Latin-1 — подгружаем DejaVu Sans (кириллица+латиница) через
// fontkit и встраиваем сабсетом: в файл попадают только нужные глифы.
import { PDFDocument, PDFFont, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import regularUrl from '../assets/fonts/DejaVuSans.ttf?url';
import boldUrl from '../assets/fonts/DejaVuSans-Bold.ttf?url';

/** true, если стандартный шрифт PDF строку не потянет (кириллица, CJK и т.п.). */
export function needsUnicodeFont(text: string): boolean {
  return /[^\u0000-\u00FF]/.test(text);
}

const readyDocs = new WeakSet<PDFDocument>();
const bytesCache = new Map<string, Uint8Array>();
const fontCache = new WeakMap<PDFDocument, Map<string, PDFFont>>();
let bytesProvider: ((url: string) => Promise<Uint8Array>) | null = null;

/** Только для тестов: подменить загрузку TTF (в браузере — всегда fetch). */
export function __setFontBytesProvider(fn: ((url: string) => Promise<Uint8Array>) | null): void {
  bytesProvider = fn;
  bytesCache.clear();
}

async function fontBytes(url: string): Promise<Uint8Array> {
  if (bytesProvider) return bytesProvider(url);
  let b = bytesCache.get(url);
  if (!b) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('font-load-failed');
    b = new Uint8Array(await res.arrayBuffer());
    bytesCache.set(url, b);
  }
  return b;
}

/** Шрифт для строки: быстрый Helvetica для латиницы, DejaVu-сабсет для остального. */
export async function textFont(doc: PDFDocument, text: string, bold: boolean): Promise<PDFFont> {
  const uni = needsUnicodeFont(text);
  const key = `${bold ? 'b' : 'r'}:${uni ? 'u' : 'l'}`;
  let perDoc = fontCache.get(doc);
  if (!perDoc) {
    perDoc = new Map();
    fontCache.set(doc, perDoc);
  }
  const hit = perDoc.get(key);
  if (hit) return hit;
  let font: PDFFont;
  if (!uni) {
    font = await doc.embedFont(bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
  } else {
    if (!readyDocs.has(doc)) {
      doc.registerFontkit(fontkit);
      readyDocs.add(doc);
    }
    font = await doc.embedFont(await fontBytes(bold ? boldUrl : regularUrl), { subset: true });
  }
  perDoc.set(key, font);
  return font;
}
