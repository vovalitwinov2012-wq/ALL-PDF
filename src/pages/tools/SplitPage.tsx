import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropzone } from '../../components/Dropzone';
import { ResultCard } from '../../components/ResultCard';
import { parsePageRanges } from '../../lib/utils';
import { splitPdf, loadPdf } from '../../features/pdf-core/pdfOps';

export function SplitPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'extract' | 'delete' | 'rotate'>('extract');
  const [ranges, setRanges] = useState('1-3');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);

  const run = async () => {
    if (!file) return setError(t('needFiles') as string);
    setBusy(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await loadPdf(bytes);
      const idx = parsePageRanges(ranges, doc.getPageCount());
      const out = await splitPdf(bytes, mode, idx);
      setResult(out);
    } catch (e) {
      setError(t((e as Error).message === 'empty-result' ? 'splitPage.empty' : 'failed') as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('splitPage.title')}</h1>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} onFiles={(f) => { setFile(f[0]); setResult(null); }} />
      {file && <p className="text-sm">📄 {file.name}</p>}
      <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="text-sm font-semibold">{t('splitPage.mode')}</label>
        <div className="mt-2 flex gap-2">
          {(['extract', 'delete', 'rotate'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${mode === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
              {t(`splitPage.${m}`) as string}
            </button>
          ))}
        </div>
        {mode !== 'rotate' && (
          <input value={ranges} onChange={(e) => setRanges(e.target.value)} placeholder={t('rangesPh') as string}
            className="mt-3 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
        )}
        <button onClick={run} disabled={busy} className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">
          {busy ? t('processing') : t('splitPage.do')}
        </button>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </div>
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName={`${mode}.pdf`} />}
    </div>
  );
}
