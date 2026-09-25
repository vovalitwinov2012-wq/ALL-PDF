import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { compressPdf, mergePdfs, stampTextAt } from './pdfOps';

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return doc.save();
}

describe('pdfOps', () => {
  it('merges with per-file ranges', async () => {
    const a = await makePdf(3);
    const b = await makePdf(2);
    const out = await mergePdfs([a, b], ['', '1']);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(4);
  });

  it('stamps text at position without changing page count', async () => {
    const out = await stampTextAt(await makePdf(2), 'Hello', {
      pages: [1],
      h: 'right',
      v: 'bottom',
      size: 12
    });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it('compresses without losing pages', async () => {
    const out = await compressPdf(await makePdf(5));
    expect((await PDFDocument.load(out)).getPageCount()).toBe(5);
  });
});
