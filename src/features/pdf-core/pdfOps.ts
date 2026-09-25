import { PDFDocument, degrees, rgb, StandardFonts, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown } from 'pdf-lib';

export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

export async function mergePdfs(files: Uint8Array[], ranges?: string[]): Promise<Uint8Array> {
  const { parseRangesToIndices } = await import('./ranges');
  const out = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    const src = await loadPdf(files[i]);
    const count = src.getPageCount();
    const idx = ranges?.[i] ? parseRangesToIndices(ranges[i], count) : src.getPageIndices();
    if (idx.length === 0) continue;
    const pages = await out.copyPages(src, idx);
    pages.forEach((p) => out.addPage(p));
  }
  if (out.getPageCount() === 0) throw new Error('empty-result');
  return out.save();
}

export async function splitPdf(
  bytes: Uint8Array,
  mode: 'extract' | 'delete' | 'rotate',
  indices: number[]
): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  const count = src.getPageCount();
  const out = await PDFDocument.create();
  if (mode === 'rotate') {
    const keep = await out.copyPages(src, src.getPageIndices());
    keep.forEach((p) => {
      p.setRotation(degrees((p.getRotation().angle + 90) % 360));
      out.addPage(p);
    });
    return out.save();
  }
  const set = new Set(indices);
  const wanted = src.getPageIndices().filter((ix) => (mode === 'extract' ? set.has(ix) : !set.has(ix)));
  if (mode === 'delete' && wanted.length === 0) throw new Error('empty-result');
  const pages = await out.copyPages(src, wanted.length ? wanted : []);
  // guard: never return 0-page pdf
  if (pages.length === 0 && mode === 'extract') throw new Error('empty-result');
  pages.forEach((p) => out.addPage(p));
  void count;
  return out.save();
}

export async function reorderDelete(bytes: Uint8Array, order: number[]): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, order);
  pages.forEach((p) => out.addPage(p));
  return out.save();
}

export async function compressPdf(bytes: Uint8Array): Promise<Uint8Array> {
  // Честное локальное сжатие без потери контента:
  // pdf-lib при save уже дедуплицирует объекты; плюс чистим метаданные.
  const src = await loadPdf(bytes);
  src.setTitle('');
  src.setAuthor('');
  src.setSubject('');
  src.setKeywords([]);
  src.setProducer('ALL PDF (local)');
  src.setCreator('ALL PDF (local)');
  return src.save({ useObjectStreams: true });
}

function isPng(bytes: Uint8Array): boolean {
  // Сигнатура PNG, не доверяем file.type (на части телефонов он пустой)
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

export async function imagesToPdf(images: Array<{ bytes: Uint8Array; mime: string }>, pageSize: 'fit' | 'a4'): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const img of images) {
    const png = img.mime.includes('png') || isPng(img.bytes);
    const embedded = png ? await out.embedPng(img.bytes) : await out.embedJpg(img.bytes);
    let w = embedded.width;
    let h = embedded.height;
    if (pageSize === 'a4') {
      const page = out.addPage([595.28, 841.89]);
      const scale = Math.min(page.getWidth() / w, page.getHeight() / h);
      page.drawImage(embedded, {
        x: (page.getWidth() - w * scale) / 2,
        y: (page.getHeight() - h * scale) / 2,
        width: w * scale,
        height: h * scale
      });
    } else {
      // Ограничиваем гигантские фото, иначе страница в 4000+ pt ломает вьюверы
      const MAX = 1440;
      const k = Math.min(1, MAX / Math.max(w, h));
      w *= k;
      h *= k;
      const page = out.addPage([w, h]);
      page.drawImage(embedded, { x: 0, y: 0, width: w, height: h });
    }
  }
  if (out.getPageCount() === 0) throw new Error('empty-result');
  return out.save();
}

export async function stampText(
  bytes: Uint8Array,
  text: string,
  opts?: { watermark?: boolean; pageNumbers?: boolean }
): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  const font = await src.embedFont(StandardFonts.HelveticaBold);
  const pages = src.getPages();
  pages.forEach((p, i) => {
    const { width, height } = p.getSize();
    if (opts?.watermark) {
      p.drawText(text, {
        x: width / 2 - text.length * 5,
        y: height / 2,
        size: 42,
        font,
        color: rgb(0.39, 0.4, 0.95),
        opacity: 0.18,
        rotate: degrees(30)
      });
    } else if (opts?.pageNumbers) {
      const label = `${text} ${i + 1} / ${pages.length}`;
      p.drawText(label, { x: width / 2 - 50, y: 24, size: 11, font, color: rgb(0.3, 0.3, 0.35) });
    } else {
      p.drawText(text, { x: 48, y: height - 64, size: 16, font, color: rgb(0.1, 0.1, 0.12) });
    }
  });
  return src.save();
}

export async function stampTextAt(
  bytes: Uint8Array,
  text: string,
  opts: { pages: 'all' | number[]; h: 'left' | 'center' | 'right'; v: 'top' | 'middle' | 'bottom'; size: number }
): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  const font = await src.embedFont(StandardFonts.Helvetica);
  const widthOf = (s: string) => font.widthOfTextAtSize(s, opts.size);
  src.getPages().forEach((p, i) => {
    if (opts.pages !== 'all' && !opts.pages.includes(i)) return;
    const { width, height } = p.getSize();
    const margin = 48;
    const x =
      opts.h === 'left' ? margin : opts.h === 'right' ? width - margin - widthOf(text) : width / 2 - widthOf(text) / 2;
    const y =
      opts.v === 'top' ? height - margin : opts.v === 'bottom' ? margin : height / 2;
    p.drawText(text, { x: Math.max(8, x), y: Math.max(8, y), size: opts.size, font, color: rgb(0.1, 0.1, 0.12) });
  });
  return src.save();
}

export async function setMetadata(bytes: Uint8Array, title: string, author: string): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  if (title) src.setTitle(title);
  if (author) src.setAuthor(author);
  src.setProducer('ALL PDF (local)');
  return src.save();
}

export async function sanitizePdf(bytes: Uint8Array): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  src.setTitle('');
  src.setAuthor('');
  src.setSubject('');
  src.setKeywords([]);
  src.setProducer('ALL PDF');
  src.setCreator('ALL PDF');
  return src.save({ useObjectStreams: true });
}

export async function protectPdf(bytes: Uint8Array, _userPass: string, _ownerPass: string): Promise<Uint8Array> {
  // pdf-lib из коробки не шифрует. Честно: делаем копию с пометкой producer,
  // а интерфейс предупреждает пользователя, что это не настоящее AES-шифрование.
  // Чтобы не вводить в заблуждение, UI обязан показать дисклеймер.
  const src = await loadPdf(bytes);
  src.setProducer('ALL PDF (local copy — not AES-encrypted)');
  void _userPass;
  void _ownerPass;
  return src.save();
}

export async function flattenPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  try {
    const form = src.getForm();
    form.flatten();
  } catch {
    // форм нет — просто пересохраняем
  }
  return src.save();
}

export async function listFormFields(bytes: Uint8Array): Promise<string[]> {
  try {
    const src = await loadPdf(bytes);
    const form = src.getForm();
    return form.getFields().map((f) => f.getName());
  } catch {
    return [];
  }
}

export interface FormFieldInfo {
  name: string;
  type: 'text' | 'check' | 'radio' | 'select' | 'unknown';
  value: string;
  checked: boolean;
  options: string[];
  multiline: boolean;
}

/** Подробности полей для UI заполнения. XFA/отсутствующие формы → []. */
export async function getFormFields(bytes: Uint8Array): Promise<FormFieldInfo[]> {
  try {
    const src = await loadPdf(bytes);
    const form = src.getForm();
    return form.getFields().map((f) => {
      const name = f.getName();
      if (f instanceof PDFTextField) {
        return { name, type: 'text', value: f.getText() ?? '', checked: false, options: [], multiline: f.isMultiline() };
      }
      if (f instanceof PDFCheckBox) {
        return { name, type: 'check', value: '', checked: f.isChecked(), options: [], multiline: false };
      }
      if (f instanceof PDFRadioGroup) {
        return { name, type: 'radio', value: f.getSelected() ?? '', checked: false, options: f.getOptions(), multiline: false };
      }
      if (f instanceof PDFDropdown) {
        const sel = f.getSelected();
        return { name, type: 'select', value: Array.isArray(sel) ? sel[0] ?? '' : sel ?? '', checked: false, options: f.getOptions(), multiline: false };
      }
      return { name, type: 'unknown', value: '', checked: false, options: [], multiline: false };
    });
  } catch {
    return [];
  }
}

export type FieldValue = { text?: string; checked?: boolean; select?: string };

/** Заполнить форму значениями. flatten=true — сплющить после заполнения. */
export async function fillForm(
  bytes: Uint8Array,
  values: Record<string, FieldValue>,
  flatten = false
): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  const form = src.getForm();
  for (const field of form.getFields()) {
    const v = values[field.getName()];
    if (!v) continue;
    try {
      if (field instanceof PDFTextField && v.text !== undefined) field.setText(v.text);
      else if (field instanceof PDFCheckBox && v.checked !== undefined) {
        if (v.checked) field.check();
        else field.uncheck();
      } else if (field instanceof PDFRadioGroup && v.select) field.select(v.select);
      else if (field instanceof PDFDropdown && v.select) field.select(v.select);
    } catch {
      // отдельное кривое поле не должно ронять всё заполнение
    }
  }
  try {
    const font = await src.embedFont(StandardFonts.Helvetica);
    form.updateFieldAppearances(font);
  } catch {
    // старые формы без виджетов — пропускаем
  }
  if (flatten) {
    try {
      form.flatten();
    } catch {
      // ignore
    }
  }
  return src.save();
}

export async function placeSignature(bytes: Uint8Array, pngBytes: Uint8Array): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  const png = await src.embedPng(pngBytes);
  const pages = src.getPages();
  const last = pages[pages.length - 1];
  const { width } = last.getSize();
  const w = 180;
  const h = (png.height / png.width) * w;
  last.drawImage(png, { x: width - w - 40, y: 60, width: w, height: h });
  return src.save();
}
