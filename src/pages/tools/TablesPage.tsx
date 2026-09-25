import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dropzone } from '../../components/Dropzone';
import { downloadBytes, isTooBig } from '../../lib/utils';
import { itemsToCsv, TextItem } from '../../features/pdf-core/tables';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function TablesPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csv, setCsv] = useState('');

  const run = async (f: File) => {
    if (isTooBig(f)) return setError(t('fileTooBig') as string);
    setFile(f);
    setError(null);
    setCsv('');
    setBusy(true);
    try {
      const pdf = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
      const parts: string[] = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const items: TextItem[] = (content.items as Array<{ str: string; transform: number[] }>)
          .filter((it) => it.str.trim())
          .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));
        const table = itemsToCsv(items);
        if (table.trim()) parts.push(`--- page ${p} ---\n${table}`);
      }
      const out = parts.join('\n\n');
      setCsv(out);
      if (!out) setError(t('tables.empty') as string);
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('tables.title')}</h1>
      <p className="text-sm text-slate-500">{t('tables.hint')}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} onFiles={(f) => run(f[0])} />
      {error && <p className="text-sm text-red-500">{error}</p>}
      {csv && (
        <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">{t('tables.result')}</span>
            <button
              onClick={() => downloadBytes(new TextEncoder().encode(csv), (file?.name ?? 'doc').replace(/\.pdf$/i, '') + '.csv', 'text/csv')}
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white"
            >
              {t('download')} .csv
            </button>
          </div>
          <textarea value={csv} readOnly rows={14} className="thin-scroll w-full rounded-xl border bg-slate-50 p-3 font-mono text-xs dark:border-slate-700 dark:bg-slate-800" />
        </div>
      )}
    </div>
  );
}
