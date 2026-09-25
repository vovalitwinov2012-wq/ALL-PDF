import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFArray, PDFNumber, PDFRef, StandardFonts, rgb } from 'pdf-lib';
import { inflate } from 'pako';

export interface CropMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Обрезка полей страницы через CropBox. pages='all' или индексы. Возвращает новый PDF. */
export async function cropPdf(
  bytes: Uint8Array,
  margins: CropMargins,
  pages: 'all' | number[]
): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const { top, right, bottom, left } = margins;
  if (top < 0 || right < 0 || bottom < 0 || left < 0) throw new Error('bad-margins');
  src.getPages().forEach((p, i) => {
    if (pages !== 'all' && !pages.includes(i)) return;
    const { width, height } = p.getSize();
    const x0 = Math.min(left, width - 1);
    const y0 = Math.min(bottom, height - 1);
    const x1 = Math.max(x0 + 1, width - right);
    const y1 = Math.max(y0 + 1, height - top);
    p.node.set(
      PDFName.of('CropBox'),
      src.context.obj([x0, y0, x1, y1])
    );
  });
  return src.save();
}

/** Разбить на части по N страниц. Возвращает массив PDF. */
export async function splitEvery(bytes: Uint8Array, n: number): Promise<Uint8Array[]> {
  if (!Number.isFinite(n) || n < 1) throw new Error('bad-n');
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const indices = src.getPageIndices();
  const out: Uint8Array[] = [];
  for (let s = 0; s < indices.length; s += n) {
    const chunk = indices.slice(s, s + n);
    const doc = await PDFDocument.create();
    (await doc.copyPages(src, chunk)).forEach((p) => doc.addPage(p));
    out.push(await doc.save());
  }
  if (out.length === 0) throw new Error('empty-result');
  return out;
}

/** Перестройка битого xref: load+save. Возвращает байты и число страниц. */
export async function repairPdf(bytes: Uint8Array): Promise<{ data: Uint8Array; pages: number }> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = src.getPageCount();
  if (pages === 0) throw new Error('empty-result');
  return { data: await src.save({ useObjectStreams: true }), pages };
}

export interface BatesOptions {
  prefix: string;
  start: number;
  pad: number;
}

/** Нумерация Бейтса: PREFIX-000001 на каждой странице внизу по центру. */
export async function stampBates(bytes: Uint8Array, opts: BatesOptions): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await src.embedFont(StandardFonts.Helvetica);
  src.getPages().forEach((p, i) => {
    const { width } = p.getSize();
    const label = `${opts.prefix}${String(opts.start + i).padStart(Math.max(1, opts.pad), '0')}`;
    p.drawText(label, {
      x: width / 2 - font.widthOfTextAtSize(label, 11) / 2,
      y: 24,
      size: 11,
      font,
      color: rgb(0.2, 0.2, 0.25)
    });
  });
  return src.save();
}

export type ExtractedImage =
  | { kind: 'jpg'; name: string; data: Uint8Array }
  | { kind: 'raw'; name: string; width: number; height: number; components: 1 | 3; data: Uint8Array };

function nameOf(obj: { toString(): string }): string {
  const s = obj.toString();
  return s.startsWith('/') ? s.slice(1) : s;
}

/**
 * Извлечение встроенных картинок (best-effort):
 * - DCTDecode → готовый JPEG;
 * - FlateDecode 8bit RGB/Gray без предикторов → сырые пиксели (UI превращает в PNG).
 * CMYK, Indexed, маски и предикторы пропускаются.
 */
export async function extractImages(bytes: Uint8Array): Promise<ExtractedImage[]> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const deref = (obj: unknown): unknown => (obj instanceof PDFRef ? src.context.lookup(obj) : obj);
  const out: ExtractedImage[] = [];
  let counter = 0;
  for (const page of src.getPages()) {
    const res = page.node.Resources();
    const xobjRaw = res?.get(PDFName.of('XObject'));
    const xobj = deref(xobjRaw);
    if (!(xobj instanceof PDFDict)) continue;
    for (const key of xobj.keys()) {
      let stream: unknown;
      try {
        stream = deref(xobj.get(key));
      } catch {
        continue;
      }
      if (!(stream instanceof PDFRawStream)) continue;
      const subtype = deref(stream.dict.get(PDFName.of('Subtype')));
      if (!subtype || nameOf(subtype as { toString(): string }) !== 'Image') continue;
      const filterObj = deref(stream.dict.get(PDFName.of('Filter')));
      const filters: string[] = [];
      if (filterObj instanceof PDFName) filters.push(nameOf(filterObj));
      else if (filterObj instanceof PDFArray) {
        for (let i = 0; i < filterObj.size(); i++) {
          const f = deref(filterObj.get(i));
          if (f instanceof PDFName) filters.push(nameOf(f));
        }
      }
      counter++;
      const base = `p${src.getPages().indexOf(page) + 1}-${key.toString().replace('/', '') || 'img' + counter}`;
      try {
        if (filters.includes('DCTDecode')) {
          out.push({ kind: 'jpg', name: `${base}.jpg`, data: stream.contents });
        } else if (filters.includes('FlateDecode')) {
          const raw = decodeFlateImage(src, stream);
          if (raw) out.push({ ...raw, name: `${base}.png` });
        }
      } catch {
        // битую картинку пропускаем, остальные достаем
      }
    }
  }
  return out;
}

function decodeFlateImage(
  src: PDFDocument,
  stream: PDFRawStream
): { kind: 'raw'; width: number; height: number; components: 1 | 3; data: Uint8Array } | null {
  const dict = stream.dict;
  const deref = (obj: unknown): unknown => (obj instanceof PDFRef ? src.context.lookup(obj) : obj);
  const num = (key: string): number | null => {
    const v = deref(dict.get(PDFName.of(key)));
    return v instanceof PDFNumber ? v.asNumber() : null;
  };
  const width = num('Width');
  const height = num('Height');
  const bpc = num('BitsPerComponent');
  if (!width || !height || bpc !== 8 || width * height > 50_000_000) return null;
  const cs = deref(dict.get(PDFName.of('ColorSpace')));
  let components: 1 | 3 | null = null;
  if (cs instanceof PDFName) {
    const n = nameOf(cs);
    if (n === 'DeviceRGB') components = 3;
    else if (n === 'DeviceGray') components = 1;
    else return null;
  } else {
    return null; // Indexed / ICCBased / Separation — пропускаем
  }
  // Предикторы PNG ломают прямолинейную распаковку — пропускаем
  const parms = deref(dict.get(PDFName.of('DecodeParms')));
  if (parms instanceof PDFDict) {
    const pred = deref(parms.get(PDFName.of('Predictor')));
    if (pred instanceof PDFNumber && pred.asNumber() !== 1) return null;
  } else if (parms instanceof PDFArray && parms.size() > 0) {
    return null;
  }
  const data = inflate(stream.contents);
  if (data.length < width * height * components) return null;
  return { kind: 'raw', width, height, components, data: data.slice(0, width * height * components) };
}

/** Пересборка страниц: порядок + доворот + удаление. plan — финальный список. */
export async function organizePdf(
  bytes: Uint8Array,
  plan: Array<{ src: number; rot: 0 | 90 | 180 | 270 }>
): Promise<Uint8Array> {
  if (plan.length === 0) throw new Error('empty-result');
  const { degrees } = await import('pdf-lib');
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const count = src.getPageCount();
  const clean = plan.filter((p) => p.src >= 0 && p.src < count);
  if (clean.length === 0) throw new Error('empty-result');
  const out = await PDFDocument.create();
  for (const item of clean) {
    const [copied] = await out.copyPages(src, [item.src]);
    const cur = copied.getRotation().angle;
    copied.setRotation(degrees((cur + item.rot) % 360));
    out.addPage(copied);
  }
  return out.save();
}

export interface ShapeColor {
  r: number;
  g: number;
  b: number;
}

export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; color: ShapeColor; width: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; color: ShapeColor; width: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; color: ShapeColor; width: number }
  | { kind: 'arrow'; x1: number; y1: number; x2: number; y2: number; color: ShapeColor; width: number }
  | { kind: 'highlight'; x: number; y: number; w: number; h: number }
  | { kind: 'redact'; x: number; y: number; w: number; h: number };

/** Вжигание фигур в страницы. Координаты — пункты PDF (начало слева-снизу). */
export async function drawShapes(bytes: Uint8Array, perPage: Record<number, Shape[]>): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const { rgb: toRgb } = await import('pdf-lib');
  for (const [pageIdx, shapes] of Object.entries(perPage)) {
    const p = src.getPages()[Number(pageIdx)];
    if (!p) continue;
    for (const s of shapes) {
      if (s.kind === 'rect' || s.kind === 'redact') {
        const fill = s.kind === 'redact';
        p.drawRectangle({
          x: s.x,
          y: s.y,
          width: s.w,
          height: s.h,
          borderColor: fill ? undefined : toRgb(s.color.r, s.color.g, s.color.b),
          borderWidth: fill ? 0 : s.width,
          color: fill ? toRgb(0, 0, 0) : undefined,
          opacity: fill ? 1 : 0.9
        });
      } else if (s.kind === 'highlight') {
        p.drawRectangle({ x: s.x, y: s.y, width: s.w, height: s.h, color: toRgb(1, 0.95, 0.4), opacity: 0.4, borderWidth: 0 });
      } else if (s.kind === 'ellipse') {
        p.drawEllipse({
          x: s.cx,
          y: s.cy,
          xScale: Math.max(1, s.rx),
          yScale: Math.max(1, s.ry),
          borderColor: toRgb(s.color.r, s.color.g, s.color.b),
          borderWidth: s.width,
          opacity: 0.9
        });
      } else {
        const c = toRgb(s.color.r, s.color.g, s.color.b);
        p.drawLine({ start: { x: s.x1, y: s.y1 }, end: { x: s.x2, y: s.y2 }, thickness: s.width, color: c, opacity: 0.95 });
        if (s.kind === 'arrow') {
          const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
          const L = Math.max(10, s.width * 5);
          for (const da of [Math.PI / 6, -Math.PI / 6]) {
            p.drawLine({
              start: { x: s.x2, y: s.y2 },
              end: { x: s.x2 - L * Math.cos(ang + da), y: s.y2 - L * Math.sin(ang + da) },
              thickness: s.width,
              color: c,
              opacity: 0.95
            });
          }
        }
      }
    }
  }
  return src.save();
}
