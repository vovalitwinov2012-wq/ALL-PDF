import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import JSZip from 'jszip';
import { Dropzone } from '../../components/Dropzone';
import { downloadBytes, formatBytes, isTooBig } from '../../lib/utils';
import { extractImages, ExtractedImage } from '../../features/pdf-core/pages';

async function rawToPngBlob(img: ExtractedImage): Promise<Blob> {
  if (img.kind === 'jpg') throw new Error('not-raw');
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  const rgba = new Uint8ClampedArray(img.width * img.height * 4);
  const n = img.width * img.height;
  if (img.components === 3) {
    for (let i = 0; i < n; i++) {
      rgba[i * 4] = img.data[i * 3];
      rgba[i * 4 + 1] = img.data[i * 3 + 1];
      rgba[i * 4 + 2] = img.data[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
  } else {
    for (let i = 0; i < n; i++) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = img.data[i];
      rgba[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode-failed'))), 'image/png')
  );
  return blob;
}

interface Found {
  name: string;
  blob: Blob;
  url: string;
  size: number;
}

export function ImagesPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Found[]>([]);
  const [empty, setEmpty] = useState(false);

  const run = async (f: File) => {
    if (isTooBig(f)) return setError(t('fileTooBig') as string);
    found.forEach((x) => URL.revokeObjectURL(x.url));
    setFile(f);
    setError(null);
    setEmpty(false);
    setFound([]);
    setBusy(true);
    try {
      const list = await extractImages(new Uint8Array(await f.arrayBuffer()));
      const out: Found[] = [];
      for (const img of list) {
        const blob =
          img.kind === 'jpg'
            ? new Blob([img.data as unknown as BlobPart], { type: 'image/jpeg' })
            : await rawToPngBlob(img);
        out.push({ name: img.name, blob, url: URL.createObjectURL(blob), size: img.kind === 'jpg' ? img.data.length : blob.size });
      }
      setFound(out);
      if (out.length === 0) setEmpty(true);
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    for (const f of found) zip.file(f.name, await f.blob.arrayBuffer());
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBytes(new Uint8Array(await blob.arrayBuffer()), `${file?.name.replace(/\.pdf$/i, '') ?? 'images'}-images.zip`, 'application/zip');
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('images.title')}</h1>
      <p className="text-sm text-slate-500">{t('images.hint')}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} onFiles={(f) => run(f[0])} />
      {error && <p className="text-sm text-red-500">{error}</p>}
      {empty && <p className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">{t('images.empty')}</p>}
      {found.length > 0 && (
        <>
          <button onClick={downloadZip} className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700">
            {t('downloadAllZip')} · {found.length}
          </button>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {found.map((f, i) => (
              <a key={i} href={f.url} download={f.name} className="overflow-hidden rounded-xl border bg-white dark:border-slate-800 dark:bg-slate-900">
                <img src={f.url} alt={f.name} loading="lazy" className="h-32 w-full bg-slate-100 object-contain dark:bg-slate-800" />
                <p className="p-2 text-center text-xs text-slate-500">{f.name} · {formatBytes(f.size)} ↓</p>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
