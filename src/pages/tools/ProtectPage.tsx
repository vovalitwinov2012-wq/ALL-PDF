import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropzone } from '../../components/Dropzone';
import { ResultCard } from '../../components/ResultCard';
import { sanitizePdf, protectPdf } from '../../features/pdf-core/pdfOps';
import { isTooBig } from '../../lib/utils';

export function ProtectPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [userPass, setUserPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [note, setNote] = useState('');

  const protect = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const out = await protectPdf(bytes, userPass, userPass);
      setResult(out);
      setNote(t('protectPage.stubNote') as string);
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  const sanitize = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setResult(await sanitizePdf(bytes));
      setNote(t('protectPage.sanitizeDone') as string);
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('protectPage.title')}</h1>
      <p className="text-sm text-slate-500">{t('protectPage.hint')}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} onFiles={(f) => {
        if (isTooBig(f[0])) {
          setFile(null);
          setResult(null);
          return setNote(t('fileTooBig') as string);
        }
        setFile(f[0]);
        setResult(null);
        setNote('');
      }} />
      <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="text-sm font-semibold">{t('protectPage.userPass')}</label>
        <input type="password" value={userPass} onChange={(e) => { setUserPass(e.target.value); setResult(null); }}
          className="mt-2 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button onClick={protect} disabled={!file || busy} className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t('protectPage.doProtect')}</button>
          <button onClick={sanitize} disabled={!file || busy} className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t('protectPage.sanitize')}</button>
        </div>
        {note && <p className="mt-2 text-xs text-amber-600">{note}</p>}
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </div>
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="protected.pdf" />}
    </div>
  );
}
