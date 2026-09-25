import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wrench } from 'lucide-react';
import { Dropzone } from '../../components/Dropzone';
import { ResultCard } from '../../components/ResultCard';
import { formatBytes, isTooBig } from '../../lib/utils';
import { repairPdf } from '../../features/pdf-core/pages';

export function RepairPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [info, setInfo] = useState<{ pages: number; before: number; after: number } | null>(null);

  const run = async (f: File) => {
    if (isTooBig(f)) return setError(t('fileTooBig') as string);
    setFile(f);
    setError(null);
    setResult(null);
    setInfo(null);
    setBusy(true);
    try {
      const { data, pages } = await repairPdf(new Uint8Array(await f.arrayBuffer()));
      setResult(data);
      setInfo({ pages, before: f.size, after: data.length });
    } catch {
      setError(t('repair.failed') as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('repair.title')}</h1>
      <p className="text-sm text-slate-500">{t('repair.hint')}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} onFiles={(f) => run(f[0])} />
      {busy && (
        <p className="inline-flex items-center gap-2 text-sm text-slate-500">
          <Wrench className="h-4 w-4 animate-spin" /> {t('processing')}
        </p>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {info && (
        <div className="rounded-2xl border bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          {t('pages')}: <b>{info.pages}</b> · {t('was')}: <b>{formatBytes(info.before)}</b> → {t('became')}: <b>{formatBytes(info.after)}</b>
        </div>
      )}
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName={(file?.name.replace(/\.pdf$/i, '') ?? 'doc') + '-fixed.pdf'} />}
    </div>
  );
}
