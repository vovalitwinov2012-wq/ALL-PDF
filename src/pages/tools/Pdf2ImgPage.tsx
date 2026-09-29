import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import JSZip from 'jszip';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dropzone } from '../../components/Dropzone';
import { FileChip } from '../../components/FileChip';
import { downloadBytes, isTooBig } from '../../lib/utils';
import { loadSetting, saveSetting } from '../../lib/settings';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface RenderedPage {
  blob: Blob;
  url: string;
  name: string;
}

const MAX_PAGES = 50;

export function Pdf2ImgPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'jpeg' | 'png'>(() => loadSetting('pdf2img.format', 'jpeg' as const));
  const [scale, setScale] = useState(() => loadSetting('pdf2img.scale', 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [zipBusy, setZipBusy] = useState(false);

  // Настройки/файл изменились — старые превью им уже не соответствуют
  const touch = () => {
    pages.forEach((p) => URL.revokeObjectURL(p.url));
    setPages([]);
    setTruncated(false);
    setError(null);
  };

  const pick = (f: File | undefined) => {
    if (!f) return;
    touch();
    if (isTooBig(f)) {
      setFile(null);
      return setError(t('fileTooBig') as string);
    }
    setError(null);
    setFile(f);
  };

  const run = async () => {
    if (!file) return setError(t('needFiles') as string);
    setBusy(true);
    setError(null);
    touch();
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      const n = Math.min(pdf.numPages, MAX_PAGES);
      setTruncated(pdf.numPages > MAX_PAGES);
      const ext = format === 'png' ? 'png' : 'jpg';
      const mime = format === 'png' ? 'image/png' : 'image/jpeg';
      const out: RenderedPage[] = [];
      setProgress([0, n]);
      for (let p = 1; p <= n; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        const blob: Blob = await new Promise((res, rej) =>
          canvas.toBlob((b) => (b ? res(b) : rej(new Error('canvas-empty'))), mime, 0.92)
        );
        const name = `${file.name.replace(/\.pdf$/i, '')}-p${p}.${ext}`;
        out.push({ blob, url: URL.createObjectURL(blob), name });
        setPages([...out]);
        setProgress([p, n]);
      }
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const downloadZip = async () => {
    if (zipBusy) return;
    setZipBusy(true);
    try {
      const zip = new JSZip();
      for (const p of pages) zip.file(p.name, await p.blob.arrayBuffer());
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBytes(new Uint8Array(await blob.arrayBuffer()), `${file?.name.replace(/\.pdf$/i, '') ?? 'pages'}.zip`, 'application/zip');
    } finally {
      setZipBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('convertPage.pdf2imgTitle')}</h1>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} subtitleKey="dropSubtitlePdf" onFiles={(f) => pick(f[0])} />
      {error && <p className="animate-enter text-sm text-red-500 dark:text-red-400">{error}</p>}
      {file && (
        <FileChip
          name={file.name}
          meta={busy && progress ? `${progress[0]}/${progress[1]}` : undefined}
          disabled={busy}
          onRemove={() => { setFile(null); touch(); }}
        />
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <span className="text-sm font-semibold">{t('convertPage.format')}:</span>
        {(['jpeg', 'png'] as const).map((f) => (
          <button key={f} disabled={busy} aria-pressed={format === f} onClick={() => { setFormat(f); saveSetting('pdf2img.format', f); touch(); }} className={`min-h-[40px] rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 ${format === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>{f}</button>
        ))}
        <span className="ml-2 text-sm font-semibold">{t('convertPage.scale')}:</span>
        {[1, 2, 3].map((s) => (
          <button key={s} disabled={busy} aria-pressed={scale === s} onClick={() => { setScale(s); saveSetting('pdf2img.scale', s); touch(); }} className={`min-h-[40px] rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 ${scale === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>{s}x</button>
        ))}
        <button onClick={run} disabled={!file || busy} className="min-h-[40px] rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 max-sm:w-full sm:ml-auto">
          {busy && progress ? `${t('processing')} ${progress[0]}/${progress[1]}` : busy ? t('processing') : t('convertPage.do')}
        </button>
        <p className="w-full text-xs text-slate-500">{t('convertPage.scaleHint')}</p>
        {scale === 3 && <p className="animate-enter w-full text-xs font-medium text-amber-600 dark:text-amber-400">{t('convertPage.scaleWarn')}</p>}
      </div>

      {truncated && <p className="text-sm text-amber-600 dark:text-amber-400">{t('convertPage.truncated', { n: MAX_PAGES })}</p>}

      {pages.length > 0 && (
        <>
          <button onClick={downloadZip} disabled={zipBusy} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50">
            {zipBusy ? t('processing') : <>{t('downloadAllZip')} · {pages.length}</>}
          </button>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pages.map((p, i) => (
              <a key={i} href={p.url} download={p.name} className="group animate-enter overflow-hidden rounded-xl border bg-white transition dark:border-slate-800 dark:bg-slate-900">
                <img src={p.url} alt={`page ${i + 1}`} className="h-auto w-full" loading="lazy" />
                <p className="truncate p-2 text-center text-xs text-slate-500 group-hover:text-indigo-600">{p.name} ↓</p>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
