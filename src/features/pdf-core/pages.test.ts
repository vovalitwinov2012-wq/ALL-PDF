import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { cropPdf, splitEvery, repairPdf, stampBates, extractImages, organizePdf, drawShapes } from './pages';
import { diffLines, countChanges } from './diff';
import { itemsToCsv } from './tables';

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return doc.save();
}

describe('pages', () => {
  it('crops margins via CropBox', async () => {
    const out = await cropPdf(await makePdf(2), { top: 50, right: 40, bottom: 30, left: 20 }, 'all');
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    const box = doc.getPage(0).node.CropBox();
    expect(box).toBeTruthy();
  });

  it('rejects negative margins', async () => {
    await expect(cropPdf(await makePdf(1), { top: -1, right: 0, bottom: 0, left: 0 }, 'all')).rejects.toThrow('bad-margins');
  });

  it('splits every N pages', async () => {
    const parts = await splitEvery(await makePdf(5), 2);
    expect(parts.length).toBe(3);
    expect((await PDFDocument.load(parts[0])).getPageCount()).toBe(2);
    expect((await PDFDocument.load(parts[2])).getPageCount()).toBe(1);
  });

  it('repairs and reports pages', async () => {
    const { data, pages } = await repairPdf(await makePdf(3));
    expect(pages).toBe(3);
    expect((await PDFDocument.load(data)).getPageCount()).toBe(3);
  });

  it('stamps bates numbers', async () => {
    const out = await stampBates(await makePdf(2), { prefix: 'CASE-', start: 7, pad: 5 });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it('organizes: reorder + rotate + delete', async () => {
    const out = await organizePdf(await makePdf(3), [
      { src: 2, rot: 90 },
      { src: 0, rot: 0 }
    ]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    await expect(organizePdf(await makePdf(1), [])).rejects.toThrow('empty-result');
  });

  it('burns shapes without changing page count', async () => {
    const out = await drawShapes(await makePdf(1), {
      0: [
        { kind: 'rect', x: 10, y: 10, w: 100, h: 50, color: { r: 1, g: 0, b: 0 }, width: 2 },
        { kind: 'ellipse', cx: 200, cy: 200, rx: 30, ry: 20, color: { r: 0, g: 0, b: 1 }, width: 3 },
        { kind: 'line', x1: 0, y1: 0, x2: 50, y2: 50, color: { r: 0, g: 0, b: 0 }, width: 2 },
        { kind: 'arrow', x1: 0, y1: 100, x2: 100, y2: 100, color: { r: 0, g: 0, b: 0 }, width: 2 },
        { kind: 'highlight', x: 10, y: 300, w: 200, h: 20 },
        { kind: 'redact', x: 10, y: 400, w: 200, h: 20 }
      ]
    });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });

  it('extracts zero images from blank pdf', async () => {
    expect(await extractImages(await makePdf(1))).toEqual([]);
  });

  it('extracts embedded PNG (flate) image', async () => {
    const tiny = new Uint8Array(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      )
    );
    const doc = await PDFDocument.create();
    const png = await doc.embedPng(tiny);
    const page = doc.addPage([200, 200]);
    page.drawImage(png, { x: 0, y: 0, width: 100, height: 100 });
    const found = await extractImages(await doc.save());
    expect(found.length).toBe(1);
    expect(found[0].kind).toBe('raw');
    if (found[0].kind === 'raw') {
      expect(found[0].width).toBe(1);
      expect(found[0].data.length).toBeGreaterThan(0);
    }
  });
});

describe('diff', () => {
  it('finds added and removed lines', () => {
    const d = diffLines(['a', 'b', 'c'], ['a', 'x', 'c', 'd']);
    const { added, removed } = countChanges(d);
    expect(added).toBe(2);
    expect(removed).toBe(1);
    expect(d.filter((l) => l.type === 'same').length).toBe(2);
  });

  it('empty vs empty', () => {
    expect(diffLines([], [])).toEqual([]);
  });
});

describe('tables', () => {
  it('groups items into rows and columns', () => {
    const csv = itemsToCsv([
      { str: 'Name', x: 10, y: 100 },
      { str: 'Qty', x: 200, y: 100 },
      { str: 'Apples', x: 10, y: 80 },
      { str: '5', x: 200, y: 80 }
    ]);
    expect(csv).toBe('Name;Qty\nApples;5');
  });

  it('quotes cells with semicolons', () => {
    const csv = itemsToCsv([{ str: 'a;b', x: 10, y: 100 }]);
    expect(csv).toBe('"a;b"');
  });
});
