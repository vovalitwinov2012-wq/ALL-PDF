import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropzone } from '../../components/Dropzone';
import { ResultCard } from '../../components/ResultCard';
import { stampText, stampTextAt, setMetadata, loadPdf } from '../../features/pdf-core/pdfOps';
import { isTooBig } from '../../lib/utils';
import { cn } from '../../lib/utils';

type H = 'left' | 'center' | 'right';
type V = 'top' | 'middle' | 'bottom';

const POSITIONS: Array<{ h: H; v: V }> = [
  { h: 'left', v: 'top' }, { h: 'center', v: 'top' }, { h: 'right', v: 'top' },
  { h: 'left', v: 'middle' }, { h: 'center', v: 'middle' }, { h: 'right', v: 'middle' },
  { h: 'left', v: 'bottom' }, { h: 'center', v: 'bottom' }, { h: 'right', v: 'bottom' }
];

export function EditPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [text, setText] = useState('ALL PDF');
  const [page, setPage] = useState('1');
  const [allPages, setAllPages] = useState(false);
  const [pos, setPos] = useState<{ h: H; v: V }>({ h: 'center', v: 'top' });
  const [size, setSize] = useState(16);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);

  // Настройки изменились — показанный ранее результат им уже не соответствует
  useEffect(() => {
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, page, allPages, pos, size, title, author]);

  const open = async (f: File) => {
    if (isTooBig(f)) return setError(t('fileTooBig') as string);
    setFile(f);
    setResult(null);
    setError(null);
    try {
      const doc = await loadPdf(new Uint8Array(await f.arrayBuffer()));
      setPageCount(doc.getPageCount());
    } catch {
      setPageCount(null);
    }
  };

  const parsePages = (): number[] | 'all' => {
    if (allPages || !pageCount) return 'all';
    const n = parseInt(page, 10);
    if (!Number.isFinite(n)) return 'all';
    const clamped = Math.min(Math.max(1, n), pageCount);
    return [clamped - 1];
  };

  const apply = async (kind: 'stamp' | 'watermark' | 'numbers' | 'meta') => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let out: Uint8Array;
      if (kind === 'meta') out = await setMetadata(bytes, title, author);
      else if (kind === 'watermark') out = await stampText(bytes, text || 'ALL PDF', { watermark: true });
      else if (kind === 'numbers') out = await stampText(bytes, text || 'Page', { pageNumbers: true });
      else out = await stampTextAt(bytes, text || 'ALL PDF', { pages: parsePages(), h: pos.h, v: pos.v, size });
      setResult(out);
    } catch {
      setError(t('editPage.failed') as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('editPage.title')}</h1>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} onFiles={(f) => open(f[0])} />

      <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="text-sm font-semibold">{t('editPage.text')}</label>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('editPage.textPh') as string}
          className="mt-2 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold text-slate-500">{t('editPage.page')}</p>
            <div className="mt-1 flex items-center gap-2">
              <input value={page} onChange={(e) => setPage(e.target.value)} disabled={allPages} inputMode="numeric"
                className="w-20 rounded-xl border px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800" />
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} />
                {t('editPage.allPages')}
              </label>
            </div>
            {pageCount !== null && <p className="mt-1 text-xs text-slate-400">{t('pages')}: {pageCount}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">{t('editPage.position')}</p>
            <div className="mt-1 grid w-24 grid-cols-3 gap-1">
              {POSITIONS.map((p) => (
                <button
                  key={`${p.h}-${p.v}`}
                  onClick={() => setPos(p)}
                  aria-label={`${p.h} ${p.v}`}
                  className={cn(
                    'h-6 rounded-md border dark:border-slate-700',
                    pos.h === p.h && pos.v === p.v ? 'border-indigo-600 bg-indigo-500' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800'
                  )}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">{t('editPage.size')}: {size}</p>
            <input type="range" min={8} max={48} value={size} onChange={(e) => setSize(Number(e.target.value))} className="mt-2 w-full" />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button disabled={!file || busy} onClick={() => apply('stamp')} className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t('editPage.addText')}</button>
          <button disabled={!file || busy} onClick={() => apply('watermark')} className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t('editPage.watermark')}</button>
          <button disabled={!file || busy} onClick={() => apply('numbers')} className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t('editPage.pageNumbers')}</button>
        </div>
        <p className="mt-2 text-xs text-slate-400">{t('editPage.allPagesNote')}</p>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </div>

      <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('editPage.titleMeta') as string} className="rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder={t('editPage.author') as string} className="rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
        </div>
        <button disabled={!file || busy} onClick={() => apply('meta')} className="mt-2 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-700">
          {t('editPage.applyMeta')}
        </button>
      </div>
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="edited.pdf" />}
    </div>
  );
}
