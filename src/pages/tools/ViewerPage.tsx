import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dropzone } from '../../components/Dropzone';
import { isTooBig } from '../../lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PAGES = 20;

export function ViewerPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<number[]>([]);
  const [scale, setScale] = useState(1.5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async (f: File, zoom = scale, q = query) => {
    if (isTooBig(f)) {
      setFile(null);
      setUrls([]);
      return setError(t('fileTooBig') as string);
    }
    setFile(f);
    setBusy(true);
    setError(null);
    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      const n = Math.min(pdf.numPages, MAX_PAGES);
      setTruncated(pdf.numPages > MAX_PAGES);
      const out: string[] = [];
      const found: number[] = [];
      for (let p = 1; p <= n; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: zoom });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        out.push(canvas.toDataURL('image/jpeg', 0.85));
        if (q) {
          const txt = await page.getTextContent();
          const s = txt.items.map((it: unknown) => (it as { str: string }).str).join(' ').toLowerCase();
          if (s.includes(q.toLowerCase())) found.push(p);
        }
      }
      setUrls(out);
      setHits(found);
    } catch {
      setUrls([]);
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setFile(null);
    setUrls([]);
    setHits([]);
    setQuery('');
    setTruncated(false);
    setError(null);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('viewerPage.title')}</h1>
      <p className="text-xs text-slate-500">{t('viewerPage.hint', { n: MAX_PAGES })}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} subtitleKey="dropSubtitlePdf" onFiles={(f) => { if (f[0]) open(f[0]); }} />
      {error && <p className="animate-enter text-sm text-red-500">{error}</p>}
      {file && (
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
          <span className="min-w-0 flex-1 truncate">📄 {file.name}</span>
          <button onClick={close} disabled={busy} aria-label={t('remove') as string} className="grid min-h-[36px] min-w-[36px] shrink-0 place-items-center rounded-lg text-slate-400 hover:text-red-500 disabled:opacity-30">✕</button>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <input value={query} onChange={(e) => { setQuery(e.target.value); setHits([]); setError(null); }} placeholder={t('viewerPage.searchPh') as string}
          className="w-full min-w-0 rounded-xl border px-3 py-2.5 sm:flex-1 dark:border-slate-700 dark:bg-slate-900" />
        <div className="flex items-center gap-2">
          {[1, 1.5, 2].map((s) => (
            <button key={s} onClick={() => { setScale(s); if (file) open(file, s); }} disabled={!file || busy} aria-pressed={scale === s}
              className={`min-h-[40px] rounded-xl px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-40 ${scale === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
              {Math.round(s * 100)}%
            </button>
          ))}
          <button onClick={() => file && open(file)} disabled={!file || busy} title={t('viewerPage.searchPh') as string} aria-label={t('viewerPage.searchPh') as string}
            className="grid min-h-[40px] min-w-[48px] place-items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50">
            {busy ? '…' : <Search className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {hits.length > 0 && <p className="animate-enter text-sm text-emerald-600">{t('viewerPage.found')}: {hits.join(', ')}</p>}
      {truncated && <p className="text-sm text-amber-600">{t('viewerPage.truncated', { n: MAX_PAGES })}</p>}
      {busy && urls.length === 0 && (
        <div className="grid animate-pulse gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-[3/4] rounded-2xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {urls.map((u, i) => (
          <figure key={i} className="animate-enter rounded-2xl border bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
            <img src={u} alt={`page ${i + 1}`} className="h-auto w-full max-w-full rounded-xl" loading="lazy" />
            <figcaption className="p-1 text-center text-xs text-slate-500">— {i + 1} —</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
