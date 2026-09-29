// Canvas-транскодеры для рекомпрессии картинок (только браузер).
// Ядро (pages.ts/recompressPdf) вызывает их через инъекцию — там нет DOM.
export async function jpegTranscode(
  bytes: Uint8Array,
  opts: { quality: number; maxDim: number }
): Promise<{ bytes: Uint8Array; w: number; h: number } | null> {
  try {
    const bmp = await createImageBitmap(new Blob([bytes as unknown as BlobPart], { type: 'image/jpeg' }));
    const k = Math.min(1, opts.maxDim / Math.max(1, Math.max(bmp.width, bmp.height)));
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const out: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', opts.quality));
    if (!out) return null;
    return { bytes: new Uint8Array(await out.arrayBuffer()), w, h };
  } catch {
    return null;
  }
}

export async function rawTranscode(
  raw: { data: Uint8Array; w: number; h: number; components: 1 | 3 },
  quality: number
): Promise<{ bytes: Uint8Array; w: number; h: number } | null> {
  try {
    if (raw.w * raw.h > 30_000_000) return null;
    const rgba = new Uint8ClampedArray(raw.w * raw.h * 4);
    if (raw.components === 3) {
      for (let i = 0, j = 0; i < raw.data.length; i += 3, j += 4) {
        rgba[j] = raw.data[i];
        rgba[j + 1] = raw.data[i + 1];
        rgba[j + 2] = raw.data[i + 2];
        rgba[j + 3] = 255;
      }
    } else {
      for (let i = 0, j = 0; i < raw.data.length; i++, j += 4) {
        rgba[j] = rgba[j + 1] = rgba[j + 2] = raw.data[i];
        rgba[j + 3] = 255;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = raw.w;
    canvas.height = raw.h;
    canvas.getContext('2d')!.putImageData(new ImageData(rgba, raw.w, raw.h), 0, 0);
    const out: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!out) return null;
    return { bytes: new Uint8Array(await out.arrayBuffer()), w: raw.w, h: raw.h };
  } catch {
    return null;
  }
}
