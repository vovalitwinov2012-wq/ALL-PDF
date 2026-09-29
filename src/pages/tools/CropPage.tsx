import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dropzone } from '../../components/Dropzone';
import { FileChip } from '../../components/FileChip';
import { ResultCard } from '../../components/ResultCard';
import { isTooBig, parsePageRanges } from '../../lib/utils';
import { loadPdf } from '../../features/pdf-core/pdfOps';
import { cropPdf } from '../../features/pdf-core/pages';
import { CropMargins } from '../../features/pdf-core/pages';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface Preview {
  url: string;
  wPt: number;
  hPt: number;
}

export function CropPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [m, setM] = useState<CropMargins>({ top: 36, right: 36, bottom: 36, left: 36 });
  const [ranges, setRanges] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const open = async (f: File | undefined) => {
    if (!f) return;
    if (isTooBig(f)) {
      setFile(null);
      setPageCount(null);
      setResult(null);
      setPreview(null);
      return setError(t('fileTooBig') as string);
    }
    setFile(f);
    setResult(null);
    setError(null);
    setPreview(null);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const doc = await loadPdf(bytes);
      setPageCount(doc.getPageCount());
      // Превью первой страницы, чтобы резать не вслепую
      const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
      const page = await pdf.getPage(1);
      const wPt = page.view[2] - page.view[0];
      const hPt = page.view[3] - page.view[1];
      const scale = Math.min(1.5, 560 / wPt);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      setPreview({ url: canvas.toDataURL('image/jpeg', 0.8), wPt, hPt });
    } catch {
      setPageCount(null);
    }
  };

  const set = (k: keyof CropMargins, v: number) => {
    setResult(null);
    setError(null);
    setM((p) => ({ ...p, [k]: Math.max(0, Math.floor(v) || 0) }));
  };

  const run = async () => {
    if (!file) return setError(t('needFiles') as string);
    setBusy(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const trimmed = ranges.trim();
      const pages = trimmed && pageCount ? parsePageRanges(trimmed, pageCount) : 'all';
      if (Array.isArray(pages) && pages.length === 0) {
        setBusy(false);
        return setError(t('crop.badRange', { n: pageCount }) as string);
      }
      setResult(await cropPdf(bytes, m, pages));
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('crop.title')}</h1>
      <p className="text-sm text-slate-500">{t('crop.hint')}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} subtitleKey="dropSubtitlePdf" onFiles={(f) => open(f[0])} />
      {file && (
        <FileChip
          name={file.name}
          meta={pageCount !== null ? `${pageCount} ${t('pagesShort')}` : undefined}
          disabled={busy}
          onRemove={() => { setFile(null); setPageCount(null); setResult(null); setError(null); }}
        />
      )}
      {preview && (
        <div className="animate-enter rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-2 text-sm font-semibold">{t('crop.preview')}</p>
          <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800" style={{ aspectRatio: `${preview.wPt} / ${preview.hPt}` }}>
            <img src={preview.url} alt="preview" className="absolute inset-0 h-full w-full" />
            <div
              className="absolute rounded border-2 border-dashed border-indigo-500 bg-indigo-500/10 transition-all"
              style={{
                top: `${Math.min(100, (m.top / preview.hPt) * 100)}%`,
                left: `${Math.min(100, (m.left / preview.wPt) * 100)}%`,
                right: `${Math.min(100, (m.right / preview.wPt) * 100)}%`,
                bottom: `${Math.min(100, (m.bottom / preview.hPt) * 100)}%`
              }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">{t('crop.previewHint')}</p>
        </div>
      )}
      <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold">{t('crop.margins')} (pt)</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
            <label key={k} className="text-xs text-slate-500">
              {t(`crop.${k}`)}
              <input
                type="number" min={0} value={m[k]} disabled={busy}
                onChange={(e) => set(k, Number(e.target.value))}
                className="mt-1 w-full rounded-xl border px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
          ))}
        </div>
        <input
          value={ranges} disabled={busy}
          onChange={(e) => { setRanges(e.target.value); setResult(null); setError(null); }}
          placeholder={pageCount ? `${t('crop.pagesPh')} (${t('allPages')}: ${pageCount})` : (t('crop.pagesPh') as string)}
          className="mt-3 w-full rounded-xl border px-3 py-2.5 text-sm disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
        />
        <button onClick={run} disabled={!file || busy} className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50">
          {busy ? t('processing') : t('crop.do')}
        </button>
        {error && <p className="animate-enter mt-2 text-sm text-red-500 dark:text-red-400">{error}</p>}
      </div>
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="cropped.pdf" />}
    </div>
  );
}
