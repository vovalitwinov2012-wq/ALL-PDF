import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropzone } from '../../components/Dropzone';
import { ResultCard } from '../../components/ResultCard';
import { sanitizePdf } from '../../features/pdf-core/pdfOps';
import { qpdfEncrypt, qpdfDecrypt } from '../../features/pdf-core/qpdf';
import { isTooBig } from '../../lib/utils';

export function ProtectPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [userPass, setUserPass] = useState('');
  const [ownerPass, setOwnerPass] = useState('');
  const [decPass, setDecPass] = useState('');
  const [bits, setBits] = useState<128 | 256>(256);
  const [restrict, setRestrict] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [note, setNote] = useState('');

  const pick = (f: File) => {
    if (isTooBig(f)) {
      setFile(null);
      setResult(null);
      setNote('');
      return setError(t('fileTooBig') as string);
    }
    setFile(f);
    setResult(null);
    setNote('');
    setError(null);
  };

  const encrypt = async () => {
    if (!file) return;
    if (!userPass && !ownerPass) return setError(t('protectPage.needPass') as string);
    setBusy(true);
    setError(null);
    setStatus(t('protectPage.loadingEngine') as string);
    try {
      const out = await qpdfEncrypt(new Uint8Array(await file.arrayBuffer()), {
        userPassword: userPass,
        ownerPassword: ownerPass || userPass,
        bits,
        restrictAll: restrict
      });
      setResult(out);
      setNote(t('protectPage.encDone') as string);
    } catch {
      setError(t('protectPage.encFailed') as string);
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  const decrypt = async () => {
    if (!file) return;
    if (!decPass) return setError(t('protectPage.needPass') as string);
    setBusy(true);
    setError(null);
    setStatus(t('protectPage.loadingEngine') as string);
    try {
      const out = await qpdfDecrypt(new Uint8Array(await file.arrayBuffer()), decPass);
      setResult(out);
      setNote(t('protectPage.decDone') as string);
    } catch {
      setError(t('protectPage.decFailed') as string);
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  const sanitize = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await sanitizePdf(new Uint8Array(await file.arrayBuffer())));
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
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} onFiles={(f) => pick(f[0])} />

      <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold">{t('protectPage.encryptTitle')}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            type="password" value={userPass} disabled={busy}
            onChange={(e) => { setUserPass(e.target.value); setResult(null); }}
            placeholder={t('protectPage.userPass') as string}
            className="rounded-xl border px-3 py-2 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
          />
          <input
            type="password" value={ownerPass} disabled={busy}
            onChange={(e) => { setOwnerPass(e.target.value); setResult(null); }}
            placeholder={t('protectPage.ownerPass') as string}
            className="rounded-xl border px-3 py-2 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">AES-</span>
          {([128, 256] as const).map((b) => (
            <button key={b} disabled={busy} onClick={() => setBits(b)}
              className={`rounded-xl px-3 py-1 font-semibold disabled:opacity-40 ${bits === b ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
              {b}
            </button>
          ))}
          <label className="ml-1 flex items-center gap-1.5">
            <input type="checkbox" checked={restrict} onChange={(e) => setRestrict(e.target.checked)} />
            {t('protectPage.restrict')}
          </label>
        </div>
        <button onClick={encrypt} disabled={!file || busy} className="mt-3 w-full rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? (status || t('processing')) : t('protectPage.doProtect')}
        </button>
      </div>

      <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold">{t('protectPage.decryptTitle')}</p>
        <input
          type="password" value={decPass} disabled={busy}
          onChange={(e) => { setDecPass(e.target.value); setResult(null); }}
          placeholder={t('protectPage.curPass') as string}
          className="mt-2 w-full rounded-xl border px-3 py-2 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
        />
        <button onClick={decrypt} disabled={!file || busy} className="mt-3 w-full rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? (status || t('processing')) : t('protectPage.doDecrypt')}
        </button>
      </div>

      <button onClick={sanitize} disabled={!file || busy} className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-700">
        {t('protectPage.sanitize')}
      </button>

      {note && <p className="text-xs text-amber-600">{note}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="protected.pdf" />}
    </div>
  );
}
