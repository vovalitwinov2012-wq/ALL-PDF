import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dropzone } from '../../components/Dropzone';
import { FileChip } from '../../components/FileChip';
import { downloadBytes, isTooBig } from '../../lib/utils';
import { itemsToCsv, TextItem } from '../../features/pdf-core/tables';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function TablesPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [csv, setCsv] = useState('');

  const run = async (f: File | undefined) => {
    if (!f || busy) return;
    if (isTooBig(f)) {
      setFile(null);
      setCsv('');
      setEmpty(false);
      return setError(t('fileTooBig') as string);
    }
    setFile(f);
    setError(null);
    setEmpty(false);
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
        if (table.trim()) parts.push(`${t('tables.pageMark', { n: p })}\n${table}`);
      }
      const out = parts.join('\n\n');
      setCsv(out);
      if (!out) setEmpty(true);
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
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} subtitleKey="dropSubtitlePdf" onFiles={(f) => run(f[0])} />
      {error && <p className="animate-enter text-sm text-red-500 dark:text-red-400">{error}</p>}
      {file && (
        <FileChip
          name={file.name}
          meta={busy ? (t('processing') as string) : undefined}
          disabled={busy}
          onRemove={() => { setFile(null); setCsv(''); setEmpty(false); setError(null); }}
        />
      )}
      {empty && <p className="animate-enter rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">{t('tables.empty')}</p>}
      {csv && (
        <div className="animate-enter rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t('tables.result')}</span>
            <button
              onClick={() => downloadBytes(new TextEncoder().encode(csv), (file?.name ?? 'doc').replace(/\.pdf$/i, '') + '.csv', 'text/csv')}
              className="min-h-[40px] rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 active:scale-[0.98]"
            >
              {t('download')} .csv
            </button>
          </div>
          <textarea value={csv} readOnly rows={14} className="thin-scroll w-full rounded-xl border bg-slate-50 p-3 font-mono text-xs sm:text-sm dark:border-slate-700 dark:bg-slate-800" />
        </div>
      )}
    </div>
  );
}
