import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera } from 'lucide-react';
import { Dropzone } from '../../components/Dropzone';
import { FileList } from '../../components/FileList';
import { ResultCard } from '../../components/ResultCard';
import { imagesToPdf } from '../../features/pdf-core/pdfOps';
import { getJpegOrientation, needsRotation } from '../../features/pdf-core/exif';
import { isTooBig } from '../../lib/utils';

function sniffKind(bytes: Uint8Array): 'png' | 'jpg' | 'unknown' {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  return 'unknown';
}

function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((res, rej) => {
    const el = new Image();
    el.onload = () => {
      URL.revokeObjectURL(url);
      res(el);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error('decode-failed'));
    };
    el.src = url;
  });
}

async function toJpegBytes(img: HTMLImageElement): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode-failed'))), 'image/jpeg', 0.92)
  );
  return new Uint8Array(await blob.arrayBuffer());
}

/** Поворачиваем canvas'ом только фото с EXIF-ориентацией 3/6/8, остальные встраиваем байт-в-байт. */
async function normalizeRotation(blob: Blob, orientation: number): Promise<{ bytes: Uint8Array; mime: string }> {
  const img = await decodeImage(blob);
  const swap = orientation === 6 || orientation === 8;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? img.naturalHeight : img.naturalWidth;
  canvas.height = swap ? img.naturalWidth : img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  if (orientation === 6) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  } else if (orientation === 8) {
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
  } else {
    ctx.translate(canvas.width, canvas.height);
    ctx.rotate(Math.PI);
  }
  ctx.drawImage(img, 0, 0);
  const out: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode-failed'))), 'image/jpeg', 0.92)
  );
  return { bytes: new Uint8Array(await out.arrayBuffer()), mime: 'image/jpeg' };
}

async function fileToBytes(f: File): Promise<{ bytes: Uint8Array; mime: string }> {
  const t = (f.type || '').toLowerCase();
  const name = f.name.toLowerCase();
  if (t.includes('heic') || t.includes('heif') || t.includes('tiff') || /\.hei[cf]$|\.tiff?$/.test(name)) {
    throw new Error('unsupported-format');
  }
  const bytes = new Uint8Array(await f.arrayBuffer());
  const kind = sniffKind(bytes);
  if (kind === 'png') return { bytes, mime: 'image/png' };
  if (kind === 'jpg') {
    const o = getJpegOrientation(bytes);
    if (!needsRotation(o)) return { bytes, mime: 'image/jpeg' };
    return normalizeRotation(new Blob([bytes as unknown as BlobPart], { type: 'image/jpeg' }), o);
  }
  if (t.includes('webp') || t.includes('bmp') || /\.webp$|\.bmp$/.test(name)) {
    // pdf-lib встраивает только JPG/PNG — перекодируем через canvas
    return { bytes: await toJpegBytes(await decodeImage(new Blob([bytes as unknown as BlobPart]))), mime: 'image/jpeg' };
  }
  throw new Error('bad-image');
}

export function Img2PdfPage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [size, setSize] = useState<'fit' | 'a4'>('a4');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const MAX_PHOTOS = 50;

  const add = (f: File[]) => {
    setError(null);
    setResult(null);
    const oversized = f.filter((x) => isTooBig(x));
    const ok = f.filter((x) => !isTooBig(x));
    const merged = [...files, ...ok].slice(0, MAX_PHOTOS);
    if (oversized.length > 0) setError(t('fileTooBig') as string);
    else if ([...files, ...ok].length > MAX_PHOTOS) setError(t('cappedFiles', { n: MAX_PHOTOS }) as string);
    setFiles(merged);
  };

  const move = (i: number, dir: -1 | 1) => {
    setResult(null);
    setFiles((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const copy = [...p];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };

  const run = async () => {
    setError(null);
    if (!files.length) return setError(t('needFiles') as string);
    setBusy(true);
    try {
      const imgs = await Promise.all(files.map(fileToBytes));
      setResult(await imagesToPdf(imgs, size));
    } catch (e) {
      setError(t((e as Error).message === 'unsupported-format' ? 'convertPage.unsupportedFormat' : 'failed') as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('convertPage.img2pdfTitle')}</h1>
      <Dropzone accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp'] }} disabled={busy} onFiles={add} />
      <button
        onClick={() => cameraRef.current?.click()}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/50 px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300"
      >
        <Camera className="h-5 w-5" /> {t('takePhoto')}
      </button>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) add([...e.target.files]);
          e.target.value = '';
        }}
      />
      <FileList files={files} onMove={move} onRemove={(i) => { setResult(null); setFiles((p) => p.filter((_, x) => x !== i)); }} onClear={() => { setFiles([]); setResult(null); }} />
      <div className="flex gap-2">
        {(['fit', 'a4'] as const).map((s) => (
          <button key={s} disabled={busy} onClick={() => { setSize(s); setResult(null); }} className={`rounded-xl px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${size === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
            {t(`convertPage.${s}`) as string}
          </button>
        ))}
        <button onClick={run} disabled={busy} className="flex-1 rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50">
          {busy ? t('processing') : t('convertPage.do')}
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="images.pdf" />}
    </div>
  );
}
