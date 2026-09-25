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
    if (!file) return;
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
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} onFiles={(f) => {
        if (isTooBig(f[0])) return setError(t('fileTooBig') as string);
        setError(null);
        setFile(f[0]);
        setResult(null);
      }} />
      {file && (
        <div className="rounded-2xl border bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          {t('was')}: <b>{formatBytes(file.size)}</b>
          {result && <> → {t('became')}: <b>{formatBytes(result.length)}</b> ({deltaText(file.size, result.length)})</>}
        </div>
      )}
      <button onClick={run} disabled={!file || busy} className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">
        {busy ? t('processing') : t('compressPage.do')}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <p className="text-xs text-slate-500">{t('compressPage.note')}</p>
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="compressed.pdf" />}
    </div>
  );
}
