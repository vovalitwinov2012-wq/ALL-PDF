import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import JSZip from 'jszip';
import { Dropzone } from '../../components/Dropzone';
import { ResultCard } from '../../components/ResultCard';
import { parsePageRanges, isTooBig, downloadBytes } from '../../lib/utils';
import { splitPdf, loadPdf } from '../../features/pdf-core/pdfOps';
import { splitEvery } from '../../features/pdf-core/pages';

type Mode = 'extract' | 'delete' | 'rotate' | 'singles' | 'chunks';

export function SplitPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('extract');
  const [ranges, setRanges] = useState('1-3');
  const [chunkN, setChunkN] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);

  const multi = mode === 'singles' || mode === 'chunks';

  const run = async () => {
    if (!file) return setError(t('needFiles') as string);
    setBusy(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (multi) {
        const parts = await splitEvery(bytes, mode === 'singles' ? 1 : Math.max(1, chunkN));
        const zip = new JSZip();
        const base = file.name.replace(/\.pdf$/i, '');
        parts.forEach((p, i) => zip.file(`${base}-part${i + 1}.pdf`, p));
        const blob = await zip.generateAsync({ type: 'blob' });
        downloadBytes(new Uint8Array(await blob.arrayBuffer()), `${base}-split.zip`, 'application/zip');
        setResult(null);
      } else {
        const doc = await loadPdf(bytes);
        const idx = parsePageRanges(ranges, doc.getPageCount());
        setResult(await splitPdf(bytes, mode, idx));
      }
    } catch (e) {
      setError(t((e as Error).message === 'empty-result' ? 'splitPage.empty' : 'failed') as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('splitPage.title')}</h1>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} onFiles={(f) => {
        if (isTooBig(f[0])) return setError(t('fileTooBig') as string);
        setError(null);
        setFile(f[0]);
        setResult(null);
      }} />
      {file && <p className="text-sm">📄 {file.name}</p>}
      <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="text-sm font-semibold">{t('splitPage.mode')}</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['extract', 'delete', 'rotate', 'singles', 'chunks'] as const).map((m) => (
            <button key={m} disabled={busy} onClick={() => { setMode(m); setResult(null); }}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${mode === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
              {t(`splitPage.${m}`) as string}
            </button>
          ))}
        </div>
        {mode !== 'rotate' && !multi && (
          <input value={ranges} disabled={busy} onChange={(e) => { setRanges(e.target.value); setResult(null); }} placeholder={t('rangesPh') as string}
            className="mt-3 w-full rounded-xl border px-3 py-2 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800" />
        )}
        {mode === 'chunks' && (
          <label className="mt-3 block text-sm">
            {t('splitPage.everyN')}
            <input type="number" min={1} value={chunkN} disabled={busy} onChange={(e) => setChunkN(Math.max(1, Number(e.target.value) || 1))}
              className="ml-2 w-24 rounded-xl border px-3 py-1.5 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800" />
          </label>
        )}
        {multi && <p className="mt-2 text-xs text-slate-500">{t('splitPage.zipNote')}</p>}
        <button onClick={run} disabled={busy} className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">
          {busy ? t('processing') : t('splitPage.do')}
        </button>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </div>
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName={`${mode}.pdf`} />}
    </div>
  );
}
