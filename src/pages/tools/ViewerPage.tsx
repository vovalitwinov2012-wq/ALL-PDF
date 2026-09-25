import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('viewerPage.title')}</h1>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} onFiles={(f) => open(f[0])} />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('viewerPage.searchPh') as string}
          className="min-w-0 flex-1 rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
        {[1, 1.5, 2].map((s) => (
          <button key={s} onClick={() => { setScale(s); if (file) open(file, s); }} disabled={!file || busy}
            className={`rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-40 ${scale === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
            {Math.round(s * 100)}%
          </button>
        ))}
        <button onClick={() => file && open(file)} disabled={!file || busy} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? '…' : '→'}
        </button>
      </div>
      {hits.length > 0 && <p className="text-sm text-emerald-600">{t('viewerPage.found')}: {hits.join(', ')}</p>}
      {truncated && <p className="text-sm text-amber-600">{t('viewerPage.truncated', { n: MAX_PAGES })}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {urls.map((u, i) => (
          <figure key={i} className="rounded-2xl border bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
            <img src={u} alt={`page ${i + 1}`} className="rounded-xl" loading="lazy" />
            <figcaption className="p-1 text-center text-xs text-slate-500">— {i + 1} —</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
