import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  compressPdf,
  flattenPdf,
  imagesToPdf,
  listFormFields,
  mergePdfs,
  placeSignature,
  sanitizePdf,
  setMetadata,
  splitPdf,
  stampText,
  stampTextAt
} from './pdfOps';

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return doc.save();
}

// PNG 1x1 без mime — имитация файлов с телефонов, где file.type пустой
const TINY_PNG = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  )
);

describe('pdfOps', () => {
  it('merges with per-file ranges', async () => {
    const a = await makePdf(3);
    const b = await makePdf(2);
    const out = await mergePdfs([a, b], ['', '1']);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(4);
  });

  it('merge throws on empty result instead of corrupt pdf', async () => {
    const a = await makePdf(3);
    await expect(mergePdfs([a], ['99'])).rejects.toThrow('empty-result');
  });

  it('splits extract/delete/rotate', async () => {
    const src = await makePdf(4);
    expect((await PDFDocument.load(await splitPdf(src, 'extract', [0, 2]))).getPageCount()).toBe(2);
    expect((await PDFDocument.load(await splitPdf(src, 'delete', [0]))).getPageCount()).toBe(3);
    expect((await PDFDocument.load(await splitPdf(src, 'rotate', []))).getPageCount()).toBe(4);
    await expect(splitPdf(src, 'extract', [99])).rejects.toThrow('empty-result');
    await expect(splitPdf(src, 'delete', [0, 1, 2, 3])).rejects.toThrow('empty-result');
  });

  it('embeds PNG by magic bytes even without mime', async () => {
    const out = await imagesToPdf([{ bytes: TINY_PNG, mime: '' }], 'fit');
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
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

  it('watermark and page numbers keep pages', async () => {
    expect((await PDFDocument.load(await stampText(await makePdf(2), 'W', { watermark: true }))).getPageCount()).toBe(2);
    expect((await PDFDocument.load(await stampText(await makePdf(2), 'P', { pageNumbers: true }))).getPageCount()).toBe(2);
  });

  it('metadata roundtrip', async () => {
    const out = await setMetadata(await makePdf(1), 'Title', 'Author');
    const doc = await PDFDocument.load(out);
    expect(doc.getTitle()).toBe('Title');
    expect(doc.getAuthor()).toBe('Author');
    const clean = await sanitizePdf(out);
    expect(await listFormFields(clean)).toEqual([]);
  });

  it('flatten and signature roundtrip', async () => {
    const flat = await flattenPdf(await makePdf(1));
    expect((await PDFDocument.load(flat)).getPageCount()).toBe(1);
    const signed = await placeSignature(await makePdf(1), TINY_PNG);
    expect((await PDFDocument.load(signed)).getPageCount()).toBe(1);
  });

  it('compresses without losing pages', async () => {
    const out = await compressPdf(await makePdf(5));
    expect((await PDFDocument.load(out)).getPageCount()).toBe(5);
  });
});
