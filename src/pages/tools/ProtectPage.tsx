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
  const [active, setActive] = useState<'enc' | 'dec' | 'san' | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [resultName, setResultName] = useState('protected.pdf');
  const [note, setNote] = useState('');

  const touch = () => {
    setResult(null);
    setNote('');
  };

  const pick = (f: File | undefined) => {
    if (!f) return;
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
    setActive('enc');
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
      setResultName(`${file.name.replace(/\.pdf$/i, '')}-encrypted.pdf`);
      setNote(t('protectPage.encDone') as string);
    } catch {
      setError(t('protectPage.encFailed') as string);
    } finally {
      setBusy(false);
      setActive(null);
      setStatus('');
    }
  };

  const decrypt = async () => {
    if (!file) return;
    if (!decPass) return setError(t('protectPage.needPass') as string);
    setBusy(true);
    setActive('dec');
    setError(null);
    setStatus(t('protectPage.loadingEngine') as string);
    try {
      const out = await qpdfDecrypt(new Uint8Array(await file.arrayBuffer()), decPass);
      setResult(out);
      setResultName(`${file.name.replace(/\.pdf$/i, '')}-decrypted.pdf`);
      setNote(t('protectPage.decDone') as string);
    } catch {
      setError(t('protectPage.decFailed') as string);
    } finally {
      setBusy(false);
      setActive(null);
      setStatus('');
    }
  };

  const sanitize = async () => {
    if (!file) return;
    setBusy(true);
    setActive('san');
    setError(null);
    try {
      setResult(await sanitizePdf(new Uint8Array(await file.arrayBuffer())));
      setResultName(`${file.name.replace(/\.pdf$/i, '')}-clean.pdf`);
      setNote(t('protectPage.sanitizeDone') as string);
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
      setActive(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('protectPage.title')}</h1>
      <p className="text-sm text-slate-500">{t('protectPage.hint')}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} subtitleKey="dropSubtitlePdf" onFiles={(f) => pick(f[0])} />
      {file && (
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
          <span className="min-w-0 flex-1 truncate">📄 {file.name}</span>
          <button onClick={() => { setFile(null); setResult(null); setNote(''); setError(null); }} disabled={busy} aria-label={t('remove') as string} className="grid min-h-[36px] min-w-[36px] shrink-0 place-items-center rounded-lg text-slate-400 hover:text-red-500 disabled:opacity-30">✕</button>
        </div>
      )}

      <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold">{t('protectPage.encryptTitle')}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            type="password" value={userPass} disabled={busy}
            onChange={(e) => { setUserPass(e.target.value); touch(); }}
            placeholder={t('protectPage.userPass') as string}
            className="rounded-xl border px-3 py-2.5 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
          />
          <input
            type="password" value={ownerPass} disabled={busy}
            onChange={(e) => { setOwnerPass(e.target.value); touch(); }}
            placeholder={t('protectPage.ownerPass') as string}
            className="rounded-xl border px-3 py-2.5 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">AES-</span>
          {([128, 256] as const).map((b) => (
            <button key={b} disabled={busy} aria-pressed={bits === b} onClick={() => { setBits(b); touch(); }}
              className={`min-h-[40px] rounded-xl px-3 py-1.5 font-semibold transition-colors disabled:opacity-40 ${bits === b ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
              {b}
            </button>
          ))}
          <label className="ml-1 flex min-h-[44px] items-center gap-2">
            <input type="checkbox" checked={restrict} onChange={(e) => { setRestrict(e.target.checked); touch(); }} className="h-5 w-5" />
            {t('protectPage.restrict')}
          </label>
        </div>
        <button onClick={encrypt} disabled={!file || busy} className="mt-3 min-h-[48px] w-full rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50">
          {busy && active === 'enc' ? (status || t('processing')) : t('protectPage.doProtect')}
        </button>
      </div>

      <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold">{t('protectPage.decryptTitle')}</p>
        <input
          type="password" value={decPass} disabled={busy}
          onChange={(e) => { setDecPass(e.target.value); touch(); }}
          placeholder={t('protectPage.curPass') as string}
          className="mt-2 w-full rounded-xl border px-3 py-2.5 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
        />
        <button onClick={decrypt} disabled={!file || busy} className="mt-3 min-h-[48px] w-full rounded-xl bg-slate-700 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 active:scale-[0.99] disabled:opacity-50">
          {busy && active === 'dec' ? (status || t('processing')) : t('protectPage.doDecrypt')}
        </button>
      </div>

      <button onClick={sanitize} disabled={!file || busy} className="min-h-[48px] w-full rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 active:scale-[0.99] disabled:opacity-50 dark:bg-slate-700">
        {busy && active === 'san' ? t('processing') : t('protectPage.sanitize')}
      </button>

      {note && <p className="animate-enter text-sm text-amber-600">{note}</p>}
      {error && <p className="animate-enter text-sm text-red-500">{error}</p>}
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName={resultName} />}
    </div>
  );
}
