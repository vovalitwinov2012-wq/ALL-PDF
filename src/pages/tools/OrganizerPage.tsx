import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { RotateCw, Trash2, Undo2 } from 'lucide-react';
import { Dropzone } from '../../components/Dropzone';
import { ResultCard } from '../../components/ResultCard';
import { isTooBig } from '../../lib/utils';
import { loadPdf } from '../../features/pdf-core/pdfOps';
import { organizePdf } from '../../features/pdf-core/pages';
import { cn } from '../../lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_THUMBS = 100;

interface Thumb {
  src: number;
  rot: 0 | 90 | 180 | 270;
  deleted: boolean;
  url: string;
}

export function OrganizerPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [dragSrc, setDragSrc] = useState<number | null>(null);

  const open = async (f: File) => {
    if (isTooBig(f)) return setError(t('fileTooBig') as string);
    setError(null);
    setResult(null);
    setSelected(new Set());
    setBusy(true);
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      const doc = await loadPdf(data);
      const n = Math.min(doc.getPageCount(), MAX_THUMBS);
      setTruncated(doc.getPageCount() > MAX_THUMBS);
      const pdf = await pdfjs.getDocument({ data: data.slice() }).promise;
      const out: Thumb[] = [];
      for (let p = 1; p <= n; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 0.45 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        out.push({ src: p - 1, rot: 0, deleted: false, url: canvas.toDataURL('image/jpeg', 0.7) });
      }
      setFile(f);
      setBytes(data);
      setThumbs(out);
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (i: number) => {
    setResult(null);
    setSelected((p) => {
      const c = new Set(p);
      if (c.has(i)) c.delete(i);
      else c.add(i);
      return c;
    });
  };

  const rotateSel = () => {
    setResult(null);
    setThumbs((p) => p.map((th, i) => (selected.has(i) ? { ...th, rot: ((th.rot + 90) % 360) as Thumb['rot'] } : th)));
  };

  const deleteSel = () => {
    setResult(null);
    setThumbs((p) => p.map((th, i) => (selected.has(i) ? { ...th, deleted: true } : th)));
    setSelected(new Set());
  };

  const restoreAll = () => {
    setResult(null);
    setThumbs((p) => p.map((th) => ({ ...th, deleted: false })));
  };

  const drop = (to: number) => {
    if (dragSrc === null || dragSrc === to) return;
    setResult(null);
    setThumbs((p) => {
      const copy = [...p];
      const [moved] = copy.splice(dragSrc, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
    setDragSrc(null);
  };

  const build = async (onlySelected: boolean) => {
    if (!bytes) return;
    setBusy(true);
    setError(null);
    try {
      const plan = thumbs
        .map((th, i) => ({ th, i }))
        .filter(({ th, i }) => !th.deleted && (!onlySelected || selected.has(i)))
        .map(({ th }) => ({ src: th.src, rot: th.rot }));
      setResult(await organizePdf(bytes, plan));
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  const alive = thumbs.filter((th) => !th.deleted).length;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('organizer.title')}</h1>
      <p className="text-sm text-slate-500">{t('organizer.hint')}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} onFiles={(f) => open(f[0])} />
      {error && <p className="text-sm text-red-500">{error}</p>}
      {truncated && <p className="text-sm text-amber-600">{t('organizer.truncated', { n: MAX_THUMBS })}</p>}

      {thumbs.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
            <span className="font-semibold">{t('organizer.selected', { n: selected.size, total: alive })}</span>
            <button onClick={rotateSel} disabled={selected.size === 0 || busy} className="inline-flex items-center gap-1 rounded-xl bg-indigo-100 px-3 py-1.5 font-semibold text-indigo-700 disabled:opacity-40 dark:bg-indigo-950 dark:text-indigo-300">
              <RotateCw className="h-4 w-4" /> {t('organizer.rotate')}
            </button>
            <button onClick={deleteSel} disabled={selected.size === 0 || busy} className="inline-flex items-center gap-1 rounded-xl bg-red-100 px-3 py-1.5 font-semibold text-red-700 disabled:opacity-40 dark:bg-red-950 dark:text-red-300">
              <Trash2 className="h-4 w-4" /> {t('organizer.delete')}
            </button>
            <button onClick={restoreAll} disabled={busy} className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 font-semibold disabled:opacity-40 dark:bg-slate-800">
              <Undo2 className="h-4 w-4" /> {t('organizer.restore')}
            </button>
            <button onClick={() => build(false)} disabled={busy || alive === 0} className="ml-auto rounded-xl bg-indigo-600 px-4 py-1.5 font-semibold text-white disabled:opacity-50">
              {busy ? t('processing') : t('organizer.save')}
            </button>
            <button onClick={() => build(true)} disabled={busy || selected.size === 0} className="rounded-xl bg-emerald-600 px-4 py-1.5 font-semibold text-white disabled:opacity-50">
              {t('organizer.extractSel')}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {thumbs.map((th, i) => (
              <div
                key={`${th.src}-${i}`}
                draggable={!busy}
                onDragStart={() => setDragSrc(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(i)}
                onClick={() => toggle(i)}
                className={cn(
                  'cursor-pointer rounded-xl border-2 bg-white p-1.5 transition dark:bg-slate-900',
                  selected.has(i) ? 'border-indigo-500' : 'border-transparent dark:border-slate-800',
                  th.deleted && 'opacity-30 grayscale'
                )}
              >
                <img
                  src={th.url}
                  alt={`page ${th.src + 1}`}
                  loading="lazy"
                  className="w-full rounded-lg"
                  style={{ transform: `rotate(${th.rot}deg)` }}
                />
                <p className="py-1 text-center text-xs text-slate-500">
                  {th.src + 1}{th.rot ? ` ⟳${th.rot}°` : ''}{th.deleted ? ` · ${t('organizer.deleted')}` : ''}
                </p>
              </div>
            ))}
          </div>
          {file && <p className="text-xs text-slate-400">{file.name}</p>}
        </>
      )}
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="organized.pdf" />}
    </div>
  );
}
