import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropzone } from '../../components/Dropzone';
import { ResultCard } from '../../components/ResultCard';
import { isTooBig, parsePageRanges } from '../../lib/utils';
import { loadPdf } from '../../features/pdf-core/pdfOps';
import { cropPdf } from '../../features/pdf-core/pages';
import { CropMargins } from '../../features/pdf-core/pages';

export function CropPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [m, setM] = useState<CropMargins>({ top: 36, right: 36, bottom: 36, left: 36 });
  const [ranges, setRanges] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);

  const open = async (f: File) => {
    if (isTooBig(f)) return setError(t('fileTooBig') as string);
    setFile(f);
    setResult(null);
    setError(null);
    try {
      setPageCount((await loadPdf(new Uint8Array(await f.arrayBuffer()))).getPageCount());
    } catch {
      setPageCount(null);
    }
  };

  const set = (k: keyof CropMargins, v: number) => {
    setResult(null);
    setM((p) => ({ ...p, [k]: Math.max(0, Math.floor(v) || 0) }));
  };

  const run = async () => {
    if (!file) return setError(t('needFiles') as string);
    setBusy(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pages = ranges.trim() && pageCount ? parsePageRanges(ranges, pageCount) : 'all';
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
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} onFiles={(f) => open(f[0])} />
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
          onChange={(e) => { setRanges(e.target.value); setResult(null); }}
          placeholder={pageCount ? `${t('crop.pagesPh')} (${t('allPages')}: ${pageCount})` : (t('crop.pagesPh') as string)}
          className="mt-3 w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
        />
        <button onClick={run} disabled={!file || busy} className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">
          {busy ? t('processing') : t('crop.do')}
        </button>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </div>
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="cropped.pdf" />}
    </div>
  );
}
