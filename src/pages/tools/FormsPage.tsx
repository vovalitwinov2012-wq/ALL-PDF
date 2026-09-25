import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropzone } from '../../components/Dropzone';
import { ResultCard } from '../../components/ResultCard';
import { flattenPdf, listFormFields, loadPdf } from '../../features/pdf-core/pdfOps';
import { isTooBig } from '../../lib/utils';

export function FormsPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);

  const inspect = async (f: File) => {
    if (isTooBig(f)) {
      setFile(null);
      setFields(null);
      setResult(null);
      return setError(t('fileTooBig') as string);
    }
    setError(null);
    setFile(f);
    setResult(null);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      // garbage.pdf переименованным мусором давал «полей нет» — проверяем, что это вообще PDF
      await loadPdf(bytes);
      setFields(await listFormFields(bytes));
    } catch {
      setFile(null);
      setFields(null);
      setError(t('failed') as string);
    }
  };

  const flatten = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await flattenPdf(new Uint8Array(await file.arrayBuffer())));
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('formsPage.title')}</h1>
      <p className="text-sm text-slate-500">{t('formsPage.hint')}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} onFiles={(f) => inspect(f[0])} />
      {fields !== null && (
        <div className="rounded-2xl border bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          {fields.length === 0 ? (
            <p className="text-slate-500">{t('formsPage.noFields')}</p>
          ) : (
            <>
              <p className="mb-2 font-semibold">{t('formsPage.foundFields', { n: fields.length })}</p>
              <ul className="thin-scroll max-h-48 list-disc space-y-1 overflow-auto pl-5">
                {fields.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
      <button onClick={flatten} disabled={!file || busy} className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">
        {busy ? t('processing') : t('formsPage.flatten')}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="flattened.pdf" />}
    </div>
  );
}
