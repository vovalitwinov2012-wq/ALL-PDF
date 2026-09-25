import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera } from 'lucide-react';
import { Dropzone } from '../../components/Dropzone';
import { FileList } from '../../components/FileList';
import { ResultCard } from '../../components/ResultCard';
import { imagesToPdf } from '../../features/pdf-core/pdfOps';
import { isTooBig } from '../../lib/utils';

async function fileToBytes(f: File): Promise<{ bytes: Uint8Array; mime: string }> {
  const mime = f.type;
  if (f.type.includes('heic') || f.type.includes('heif') || f.type.includes('tiff')) {
    throw new Error('unsupported-format');
  }
  if (f.type.includes('webp') || f.type.includes('bmp')) {
    // pdf-lib встраивает только JPG/PNG — перекодируем через canvas без потери видимого качества
    const url = URL.createObjectURL(f);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const el = new Image();
        el.onload = () => res(el);
        el.onerror = rej;
        el.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode-failed'))), 'image/jpeg', 0.92)
      );
      return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg' };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return { bytes: new Uint8Array(await f.arrayBuffer()), mime };
}

export function Img2PdfPage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [size, setSize] = useState<'fit' | 'a4'>('a4');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const add = (f: File[]) => {
    setError(null);
    setResult(null);
    const ok = f.filter((x) => !isTooBig(x));
    if (ok.length < f.length) setError(t('fileTooBig') as string);
    if (ok.length) setFiles((p) => [...p, ...ok]);
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
    } catch {
      setError(t('convertPage.unsupportedFormat') as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('convertPage.img2pdfTitle')}</h1>
      <Dropzone accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp'] }} onFiles={add} />
      <button
        onClick={() => cameraRef.current?.click()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/50 px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300"
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
          <button key={s} onClick={() => { setSize(s); setResult(null); }} className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${size === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
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
