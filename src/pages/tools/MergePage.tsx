import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, X } from 'lucide-react';
import { Dropzone } from '../../components/Dropzone';
import { ResultCard } from '../../components/ResultCard';
import { assertLimits, formatBytes } from '../../lib/utils';
import { loadPdf, mergePdfs } from '../../features/pdf-core/pdfOps';

interface MergeItem {
  id: number;
  file: File;
  pages: number | null;
  range: string;
}

let nextId = 1;

export function MergePage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<MergeItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);

  const addFiles = async (added: File[]) => {
    setError(null);
    setResult(null);
    const lim = assertLimits([...items.map((i) => i.file), ...added]);
    if (lim) return setError(t(lim) as string);
    const fresh: MergeItem[] = added.map((file) => ({ id: nextId++, file, pages: null, range: '' }));
    setItems((p) => [...p, ...fresh]);
    // Подгружаем число страниц для каждого файла — удобно задавать диапазоны
    for (const item of fresh) {
      try {
        const doc = await loadPdf(new Uint8Array(await item.file.arrayBuffer()));
        setItems((p) => p.map((x) => (x.id === item.id ? { ...x, pages: doc.getPageCount() } : x)));
      } catch {
        setItems((p) => p.map((x) => (x.id === item.id ? { ...x, pages: 0 } : x)));
      }
    }
  };

  const move = (id: number, dir: -1 | 1) => {
    // Порядок изменился — старый результат больше не соответствует настройкам
    setResult(null);
    setItems((p) => {
      const i = p.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const copy = [...p];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };

  const run = async () => {
    setError(null);
    if (items.length === 0) return setError(t('needFiles') as string);
    if (items.some((i) => i.pages === 0)) return setError(t('mergePage.badFile') as string);
    setBusy(true);
    try {
      const bufs = await Promise.all(items.map(async (i) => new Uint8Array(await i.file.arrayBuffer())));
      const ranges = items.map((i) => i.range.trim());
      const out = await mergePdfs(bufs, ranges);
      setResult(out);
    } catch {
      setError(t('mergePage.failed') as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('mergePage.title')}</h1>
      <p className="text-sm text-slate-500">{t('mergePage.hint')}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} onFiles={addFiles} />

      {items.length > 0 && (
        <div className="space-y-2 rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{t('files')} · {items.length}</span>
            <button onClick={() => { setItems([]); setResult(null); }} className="text-xs text-slate-500 hover:text-red-500">{t('clear')}</button>
          </div>
          <ul className="thin-scroll max-h-80 space-y-2 overflow-auto">
            {items.map((item, pos) => (
              <li key={item.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div className="flex items-center gap-1.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {pos + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.file.name}</span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {item.pages === null ? '…' : item.pages === 0 ? '⚠' : `${item.pages} ${t('pagesShort')}`}
                    {' · '}{formatBytes(item.file.size)}
                  </span>
                  <button onClick={() => move(item.id, -1)} disabled={pos === 0} aria-label={t('moveUp') as string} className="rounded-lg p-1 hover:bg-slate-200 disabled:opacity-30 dark:hover:bg-slate-700">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button onClick={() => move(item.id, 1)} disabled={pos === items.length - 1} aria-label={t('moveDown') as string} className="rounded-lg p-1 hover:bg-slate-200 disabled:opacity-30 dark:hover:bg-slate-700">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button onClick={() => { setResult(null); setItems((p) => p.filter((x) => x.id !== item.id)); }} aria-label="remove" className="rounded-lg p-1 text-slate-400 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <input
                  value={item.range}
                  onChange={(e) => { setResult(null); setItems((p) => p.map((x) => (x.id === item.id ? { ...x, range: e.target.value } : x))); }}
                  placeholder={item.pages ? `${t('rangesPh')} (${t('allPages')}: ${item.pages})` : (t('rangesPh') as string)}
                  className="mt-2 w-full rounded-lg border bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </li>
            ))}
          </ul>
          <button onClick={run} disabled={busy}
            className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? t('processing') : t('mergePage.doMerge')}
          </button>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      )}

      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="merged.pdf" />}
    </div>
  );
}
