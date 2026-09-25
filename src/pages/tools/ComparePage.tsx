import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dropzone } from '../../components/Dropzone';
import { isTooBig } from '../../lib/utils';
import { diffLines, countChanges, DiffLine } from '../../features/pdf-core/diff';
import { cn } from '../../lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

async function pageTexts(file: File, maxPages: number): Promise<string[][]> {
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const n = Math.min(pdf.numPages, maxPages);
  const out: string[][] = [];
  for (let p = 1; p <= n; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const lines = new Map<number, Array<{ x: number; s: string }>>();
    for (const raw of content.items as Array<{ str: string; transform: number[] }>) {
      if (!raw.str.trim()) continue;
      const y = Math.round(raw.transform[5]);
      const arr = lines.get(y) ?? [];
      arr.push({ x: raw.transform[4], s: raw.str });
      lines.set(y, arr);
    }
    const ordered = [...lines.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, arr]) => arr.sort((x, y) => x.x - y.x).map((c) => c.s).join(' '));
    out.push(ordered);
  }
  return out;
}

const MAX_PAGES = 30;

export function ComparePage() {
  const { t } = useTranslation();
  const [a, setA] = useState<File | null>(null);
  const [b, setB] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<Array<{ diff: DiffLine[]; added: number; removed: number }>>([]);
  const [truncated, setTruncated] = useState(false);
  const [hideSame, setHideSame] = useState(true);

  const pick = (f: File, slot: 'a' | 'b') => {
    if (isTooBig(f)) return setError(t('fileTooBig') as string);
    setError(null);
    setPages([]);
    if (slot === 'a') setA(f);
    else setB(f);
  };

  const run = async () => {
    if (!a || !b) return setError(t('compare.needTwo') as string);
    setBusy(true);
    setError(null);
    try {
      const [ta, tb] = await Promise.all([pageTexts(a, MAX_PAGES), pageTexts(b, MAX_PAGES)]);
      setTruncated(ta.length === MAX_PAGES || tb.length === MAX_PAGES);
      const n = Math.max(ta.length, tb.length);
      const out = [];
      for (let i = 0; i < n; i++) {
        const diff = diffLines(ta[i] ?? [], tb[i] ?? []);
        out.push({ diff, ...countChanges(diff) });
      }
      setPages(out);
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  const totalAdded = pages.reduce((s, p) => s + p.added, 0);
  const totalRemoved = pages.reduce((s, p) => s + p.removed, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('compare.title')}</h1>
      <p className="text-sm text-slate-500">{t('compare.hint')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-sm font-semibold">A {a && <span className="font-normal text-slate-500">· {a.name}</span>}</p>
          <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} onFiles={(f) => pick(f[0], 'a')} />
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold">B {b && <span className="font-normal text-slate-500">· {b.name}</span>}</p>
          <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} onFiles={(f) => pick(f[0], 'b')} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={run} disabled={!a || !b || busy} className="rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">
          {busy ? t('processing') : t('compare.do')}
        </button>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={hideSame} onChange={(e) => setHideSame(e.target.checked)} />
          {t('compare.hideSame')}
        </label>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {truncated && <p className="text-sm text-amber-600">{t('compare.truncated', { n: MAX_PAGES })}</p>}
      {pages.length > 0 && (
        <div className="rounded-2xl border bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-3 font-semibold">
            {t('compare.summary', { added: totalAdded, removed: totalRemoved })}
          </p>
          {pages.map((p, i) => {
            const visible = p.diff.filter((l) => !hideSame || l.type !== 'same');
            if (visible.length === 0) return null;
            return (
              <details key={i} className="mb-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800" open={p.added + p.removed > 0}>
                <summary className="cursor-pointer font-semibold">
                  {t('compare.page', { n: i + 1 })} · <span className="text-emerald-600">+{p.added}</span> <span className="text-red-500">−{p.removed}</span>
                </summary>
                <div className="mt-2 space-y-0.5 font-mono text-xs">
                  {visible.map((l, j) => (
                    <p
                      key={j}
                      className={cn(
                        'rounded px-2 py-0.5',
                        l.type === 'add' && 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
                        l.type === 'del' && 'bg-red-100 text-red-900 line-through dark:bg-red-950 dark:text-red-200',
                        l.type === 'same' && 'text-slate-500'
                      )}
                    >
                      {l.type === 'add' ? '+ ' : l.type === 'del' ? '− ' : '  '}{l.text || ' '}
                    </p>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
