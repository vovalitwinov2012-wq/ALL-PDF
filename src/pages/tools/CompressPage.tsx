import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropzone } from '../../components/Dropzone';
import { ResultCard } from '../../components/ResultCard';
import { formatBytes, isTooBig } from '../../lib/utils';
import { compressPdf } from '../../features/pdf-core/pdfOps';

function deltaText(before: number, after: number): string {
  const p = Math.round((1 - after / before) * 100);
  return (p >= 0 ? '−' : '+') + Math.abs(p) + '%';
}

export function CompressPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);

  const run = async () => {
    if (!file) return setError(t('needFiles') as string);
    setBusy(true);
    setError(null);
    try {
      const out = await compressPdf(new Uint8Array(await file.arrayBuffer()));
      setResult(out);
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('compressPage.title')}</h1>
      <p className="text-xs text-slate-500">{t('compressPage.note')}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} subtitleKey="dropSubtitlePdf" onFiles={(f) => {
        const f0 = f[0];
        if (!f0) return;
        if (isTooBig(f0)) return setError(t('fileTooBig') as string);
        setError(null);
        setFile(f0);
        setResult(null);
      }} />
      {file && (
        <div className="flex items-center gap-2 rounded-2xl border bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="min-w-0 flex-1 truncate">
            {t('was')}: <b>{formatBytes(file.size)}</b>
            {result && <> → {t('became')}: <b>{formatBytes(result.length)}</b> ({deltaText(file.size, result.length)})</>}
          </span>
          <button onClick={() => { setFile(null); setResult(null); setError(null); }} disabled={busy} aria-label={t('remove') as string} className="grid min-h-[36px] min-w-[36px] shrink-0 place-items-center rounded-lg text-slate-400 hover:text-red-500 disabled:opacity-30">✕</button>
        </div>
      )}
      <button onClick={run} disabled={!file || busy} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50">
        {busy ? t('processing') : t('compressPage.do')}
      </button>
      {error && <p className="animate-enter text-sm text-red-500">{error}</p>}
      {file && result && result.length >= file.size && (
        <p className="animate-enter text-sm text-amber-600">{t('compressPage.grew')}</p>
      )}
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="compressed.pdf" />}
    </div>
  );
}
