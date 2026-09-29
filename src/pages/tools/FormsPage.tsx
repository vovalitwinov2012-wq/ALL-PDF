import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropzone } from '../../components/Dropzone';
import { ResultCard } from '../../components/ResultCard';
import { flattenPdf, getFormFields, fillForm, loadPdf, FormFieldInfo, FieldValue } from '../../features/pdf-core/pdfOps';
import { isTooBig } from '../../lib/utils';

export function FormsPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<FormFieldInfo[] | null>(null);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [flattenAfter, setFlattenAfter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<'fill' | 'flatten' | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);

  const inspect = async (f: File | undefined) => {
    if (!f) return;
    if (isTooBig(f)) {
      setFile(null);
      setFields(null);
      setResult(null);
      return setError(t('fileTooBig') as string);
    }
    setError(null);
    setFile(f);
    setResult(null);
    setFields(null);
    setInspecting(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      await loadPdf(bytes); // проверяем, что это вообще PDF
      const list = await getFormFields(bytes);
      setFields(list);
      const init: Record<string, FieldValue> = {};
      for (const fld of list) {
        if (fld.type === 'text') init[fld.name] = { text: fld.value };
        else if (fld.type === 'check') init[fld.name] = { checked: fld.checked };
        else if (fld.type === 'radio' || fld.type === 'select') init[fld.name] = { select: fld.value };
      }
      setValues(init);
    } catch {
      setFile(null);
      setFields(null);
      setError(t('failed') as string);
    } finally {
      setInspecting(false);
    }
  };

  const setVal = (name: string, v: FieldValue) => {
    setResult(null);
    setValues((p) => ({ ...p, [name]: v }));
  };

  const fill = async () => {
    if (!file) return;
    setBusy(true);
    setActive('fill');
    setError(null);
    try {
      setResult(await fillForm(new Uint8Array(await file.arrayBuffer()), values, flattenAfter));
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
      setActive(null);
    }
  };

  const flattenOnly = async () => {
    if (!file) return;
    setBusy(true);
    setActive('flatten');
    setError(null);
    try {
      setResult(await flattenPdf(new Uint8Array(await file.arrayBuffer())));
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
      setActive(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('formsPage.title')}</h1>
      <p className="text-sm text-slate-500">{t('formsPage.hint')}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy || inspecting} subtitleKey="dropSubtitlePdf" onFiles={(f) => inspect(f[0])} />
      {error && <p className="animate-enter text-sm text-red-500">{error}</p>}
      {file && (
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
          <span className="min-w-0 flex-1 truncate">📄 {file.name}</span>
          <button onClick={() => { setFile(null); setFields(null); setResult(null); setError(null); }} disabled={busy || inspecting} aria-label={t('remove') as string} className="grid min-h-[36px] min-w-[36px] shrink-0 place-items-center rounded-lg text-slate-400 hover:text-red-500 disabled:opacity-30">✕</button>
        </div>
      )}
      {inspecting && <div className="h-24 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />}

      {fields !== null && fields.length === 0 && (
        <p className="animate-enter rounded-2xl border bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          {t('formsPage.noFields')}
        </p>
      )}

      {fields !== null && fields.length > 0 && (
        <div className="animate-enter space-y-2 rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-semibold">{t('formsPage.foundFields', { n: fields.length })}</p>
          <div className="thin-scroll max-h-80 space-y-2 overflow-auto">
            {fields.map((f) => (
              <label key={f.name} className="block rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
                <span className="mb-1 block truncate font-medium" title={f.name}>{f.name} <span className="font-normal text-slate-400">[{f.type}]</span></span>
                {f.type === 'text' && (
                  f.multiline ? (
                    <textarea
                      value={values[f.name]?.text ?? ''} disabled={busy} rows={2}
                      onChange={(e) => setVal(f.name, { text: e.target.value })}
                      className="w-full rounded-lg border bg-white px-2.5 py-2 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900"
                    />
                  ) : (
                    <input
                      value={values[f.name]?.text ?? ''} disabled={busy}
                      onChange={(e) => setVal(f.name, { text: e.target.value })}
                      className="w-full rounded-lg border bg-white px-2.5 py-2 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900"
                    />
                  )
                )}
                {f.type === 'check' && (
                  <input
                    type="checkbox" checked={values[f.name]?.checked ?? false} disabled={busy}
                    onChange={(e) => setVal(f.name, { checked: e.target.checked })}
                    className="h-6 w-6"
                    aria-label={f.name}
                  />
                )}
                {(f.type === 'radio' || f.type === 'select') && (
                  <select
                    value={values[f.name]?.select ?? ''} disabled={busy}
                    onChange={(e) => setVal(f.name, { select: e.target.value })}
                    className="w-full rounded-lg border bg-white px-2.5 py-2 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="">—</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
                {f.type === 'unknown' && <span className="text-xs text-slate-400">{t('formsPage.unsupported')}</span>}
              </label>
            ))}
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" checked={flattenAfter} onChange={(e) => setFlattenAfter(e.target.checked)} className="h-5 w-5" />
            {t('formsPage.flattenAfter')}
          </label>
          <button onClick={fill} disabled={!file || busy} className="min-h-[48px] w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50">
            {busy && active === 'fill' ? t('processing') : t('formsPage.fill')}
          </button>
        </div>
      )}

      {file && (
        <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500">{t('formsPage.flattenHint')}</p>
          <button onClick={flattenOnly} disabled={!file || busy} className="mt-2 min-h-[48px] w-full rounded-xl bg-slate-700 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-slate-800 active:scale-[0.99] disabled:opacity-50">
            {busy && active === 'flatten' ? t('processing') : t('formsPage.flatten')}
          </button>
        </div>
      )}
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="form-filled.pdf" />}
    </div>
  );
}
