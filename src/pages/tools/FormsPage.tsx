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
    }
  };

  const setVal = (name: string, v: FieldValue) => {
    setResult(null);
    setValues((p) => ({ ...p, [name]: v }));
  };

  const fill = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await fillForm(new Uint8Array(await file.arrayBuffer()), values, flattenAfter));
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  const flattenOnly = async () => {
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
      {error && <p className="text-sm text-red-500">{error}</p>}

      {fields !== null && fields.length === 0 && (
        <p className="rounded-2xl border bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          {t('formsPage.noFields')}
        </p>
      )}

      {fields !== null && fields.length > 0 && (
        <div className="space-y-2 rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-semibold">{t('formsPage.foundFields', { n: fields.length })}</p>
          <div className="thin-scroll max-h-80 space-y-2 overflow-auto">
            {fields.map((f) => (
              <label key={f.name} className="block rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
                <span className="mb-1 block truncate font-medium" title={f.name}>{f.name}</span>
                {f.type === 'text' && (
                  f.multiline ? (
                    <textarea
                      value={values[f.name]?.text ?? ''} disabled={busy} rows={2}
                      onChange={(e) => setVal(f.name, { text: e.target.value })}
                      className="w-full rounded-lg border bg-white px-2.5 py-1.5 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900"
                    />
                  ) : (
                    <input
                      value={values[f.name]?.text ?? ''} disabled={busy}
                      onChange={(e) => setVal(f.name, { text: e.target.value })}
                      className="w-full rounded-lg border bg-white px-2.5 py-1.5 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900"
                    />
                  )
                )}
                {f.type === 'check' && (
                  <input
                    type="checkbox" checked={values[f.name]?.checked ?? false} disabled={busy}
                    onChange={(e) => setVal(f.name, { checked: e.target.checked })}
                    className="h-5 w-5"
                  />
                )}
                {(f.type === 'radio' || f.type === 'select') && (
                  <select
                    value={values[f.name]?.select ?? ''} disabled={busy}
                    onChange={(e) => setVal(f.name, { select: e.target.value })}
                    className="w-full rounded-lg border bg-white px-2.5 py-1.5 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="">—</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
                {f.type === 'unknown' && <span className="text-xs text-slate-400">{t('formsPage.unsupported')}</span>}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={flattenAfter} onChange={(e) => setFlattenAfter(e.target.checked)} />
            {t('formsPage.flattenAfter')}
          </label>
          <button onClick={fill} disabled={!file || busy} className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">
            {busy ? t('processing') : t('formsPage.fill')}
          </button>
        </div>
      )}

      <button onClick={flattenOnly} disabled={!file || busy} className="w-full rounded-xl bg-slate-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">
        {t('formsPage.flatten')}
      </button>
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="form-filled.pdf" />}
    </div>
  );
}
