import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dropzone } from '../../components/Dropzone';
import { ProgressBar } from '../../components/ProgressBar';
import { downloadBytes, isTooBig } from '../../lib/utils';
import { diffLines, countChanges, DiffLine } from '../../features/pdf-core/diff';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface BoxLine {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'same' | 'add' | 'del';
}

interface CmpSide {
  url: string;
  aspect: number;
  lines: BoxLine[];
  ocr: boolean;
}

interface CmpPair {
  a: CmpSide;
  b: CmpSide;
  diff: DiffLine[];
  added: number;
  removed: number;
}

const MAX_PAGES = 20;
const RENDER_SCALE = 1.2;

// Строки текстового слоя с боксами в долях страницы
async function textLines(
  page: pdfjs.PDFPageProxy,
  viewport: pdfjs.PageViewport,
  cw: number,
  ch: number
): Promise<Omit<BoxLine, 'kind'>[]> {
  const content = await page.getTextContent();
  const items: Array<{ str: string; x: number; y: number; w: number; h: number }> = [];
  for (const raw of content.items as Array<{ str: string; transform: number[] }>) {
    const str = (raw.str ?? '').trim();
    if (!str) continue;
    const tx = pdfjs.Util.transform(viewport.transform, raw.transform as [number, number, number, number, number, number]);
    const fontH = Math.hypot(tx[2], tx[3]);
    if (fontH <= 0) continue;
    items.push({
      str,
      x: tx[4] / cw,
      y: (tx[5] - fontH) / ch,
      w: (str.length * fontH * 0.55) / cw,
      h: fontH / ch
    });
  }
  // Группируем в строки по горизонтальным полосам
  const bands = new Map<number, typeof items>();
  for (const it of items) {
    const band = Math.round((it.y * ch) / 6);
    const arr = bands.get(band) ?? [];
    arr.push(it);
    bands.set(band, arr);
  }
  return [...bands.values()]
    .sort((p, q) => p[0].y - q[0].y)
    .map((arr) => {
      const sorted = arr.sort((p, q) => p.x - q.x);
      const x = Math.min(...sorted.map((i) => i.x));
      const end = Math.max(...sorted.map((i) => i.x + i.w));
      return {
        text: sorted.map((i) => i.str).join(' '),
        x: Math.max(0, x),
        y: Math.max(0, sorted[0].y),
        w: Math.max(0.004, end - x),
        h: Math.max(0.004, Math.max(...sorted.map((i) => i.h)))
      };
    });
}

// Нет текстового слоя — распознаём страницу OCR и берём боксы строк
async function ocrLines(
  worker: { recognize: (url: string) => Promise<{ data: { lines: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }> } }> },
  imgUrl: string,
  imgW: number,
  imgH: number
): Promise<Omit<BoxLine, 'kind'>[]> {
  const { data } = await worker.recognize(imgUrl);
  return (data.lines ?? [])
    .map((l) => ({
      text: (l.text ?? '').trim(),
      x: l.bbox.x0 / imgW,
      y: l.bbox.y0 / imgH,
      w: (l.bbox.x1 - l.bbox.x0) / imgW,
      h: (l.bbox.y1 - l.bbox.y0) / imgH
    }))
    .filter((l) => l.text);
}

interface BuiltSide extends CmpSide {
  texts: string[];
}

async function buildSide(
  file: File,
  ocrWorker: { recognize: (url: string) => Promise<never> } | null,
  setStatus: (s: string) => void,
  t: (k: string, o?: Record<string, unknown>) => unknown
): Promise<BuiltSide[]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const n = Math.min(pdf.numPages, MAX_PAGES);
  const out: BuiltSide[] = [];
  for (let p = 1; p <= n; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    const url = canvas.toDataURL('image/jpeg', 0.82);
    let lines = await textLines(page, viewport, canvas.width, canvas.height);
    let ocr = false;
    if (lines.length === 0 && ocrWorker) {
      setStatus(t('compare.stOcr', { n: p }) as string);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lines = await ocrLines(ocrWorker as any, url, canvas.width, canvas.height);
      ocr = lines.length > 0;
    }
    out.push({
      url,
      aspect: canvas.width / canvas.height,
      lines: lines.map((l) => ({ ...l, kind: 'same' as const })),
      ocr,
      texts: lines.map((l) => l.text)
    });
  }
  return out;
}

export function ComparePage() {
  const { t } = useTranslation();
  const [a, setA] = useState<File | null>(null);
  const [b, setB] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pairs, setPairs] = useState<CmpPair[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [hideSame, setHideSame] = useState(false);
  const [changeIdx, setChangeIdx] = useState(0);
  const changeRefs = useRef(new Map<string, HTMLDivElement | null>());

  const pick = (f: File | undefined, slot: 'a' | 'b') => {
    if (!f) return;
    if (isTooBig(f)) return setError(t('fileTooBig') as string);
    setError(null);
    setPairs([]);
    setTruncated(false);
    setChangeIdx(0);
    if (slot === 'a') setA(f);
    else setB(f);
  };

  const clearSlot = (slot: 'a' | 'b') => {
    setError(null);
    setPairs([]);
    setTruncated(false);
    if (slot === 'a') setA(null);
    else setB(null);
  };

  const run = async () => {
    if (!a || !b) return setError(t('compare.needTwo') as string);
    setBusy(true);
    setError(null);
    setPairs([]);
    setChangeIdx(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ocrWorker: any = null;
    try {
      setStatus(t('compare.stRender') as string);
      const [sa, sb] = await Promise.all([buildSide(a, null, setStatus, t), buildSide(b, null, setStatus, t)]);
      // Если где-то нет текста — поднимаем OCR-движок один раз на оба файла
      const needOcr = [...sa, ...sb].some((s) => s.texts.length === 0);
      if (needOcr) {
        const { createWorker } = await import('tesseract.js');
        ocrWorker = await createWorker(['rus', 'eng']);
      }
      const sidesA = needOcr ? await buildSide(a, ocrWorker, setStatus, t) : sa;
      const sidesB = needOcr ? await buildSide(b, ocrWorker, setStatus, t) : sb;
      setTruncated(sidesA.length === MAX_PAGES || sidesB.length === MAX_PAGES);
      const n = Math.max(sidesA.length, sidesB.length);
      const out: CmpPair[] = [];
      for (let i = 0; i < n; i++) {
        const A = sidesA[i] ?? { url: '', aspect: 1, lines: [], ocr: false, texts: [] };
        const B = sidesB[i] ?? { url: '', aspect: 1, lines: [], ocr: false, texts: [] };
        const diff = diffLines(A.texts, B.texts);
        // Разносим типы диффа обратно по боксам строк
        let ia = 0;
        let ib = 0;
        for (const l of diff) {
          if (l.type === 'same' || l.type === 'del') {
            if (A.lines[ia]) A.lines[ia].kind = l.type;
            ia++;
          }
          if (l.type === 'same' || l.type === 'add') {
            if (B.lines[ib]) B.lines[ib].kind = l.type;
            ib++;
          }
        }
        out.push({ a: A, b: B, diff, ...countChanges(diff) });
      }
      setPairs(out);
      setStatus('');
    } catch {
      setError(t('failed') as string);
    } finally {
      try {
        await ocrWorker?.terminate();
      } catch {
        // уже мёртв — нормально
      }
      setBusy(false);
      setStatus('');
    }
  };

  const totalAdded = pairs.reduce((s, p) => s + p.added, 0);
  const totalRemoved = pairs.reduce((s, p) => s + p.removed, 0);
  const totalSame = pairs.reduce((s, p) => s + p.diff.filter((l) => l.type === 'same').length, 0);
  const totalLines = totalAdded + totalRemoved + totalSame;
  const matchPct = totalLines === 0 ? 100 : Math.round((totalSame / totalLines) * 100);

  // Якоря отличий для навигации: первая changed-строка каждой стороны
  const changes: Array<{ pi: number; side: 'a' | 'b' }> = [];
  pairs.forEach((p, pi) => {
    if (p.a.lines.some((l) => l.kind !== 'same')) changes.push({ pi, side: 'a' });
    if (p.b.lines.some((l) => l.kind !== 'same')) changes.push({ pi, side: 'b' });
  });

  const gotoChange = (idx: number) => {
    if (changes.length === 0) return;
    const n = ((idx % changes.length) + changes.length) % changes.length;
    setChangeIdx(n);
    const c = changes[n];
    requestAnimationFrame(() => {
      changeRefs.current.get(`${c.pi}:${c.side}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

  const downloadDiff = () => {
    const lines: string[] = [
      `# ${a?.name ?? 'A'} vs ${b?.name ?? 'B'}`,
      t('compare.summary', { added: totalAdded, removed: totalRemoved }) as string,
      ''
    ];
    pairs.forEach((p, i) => {
      const visible = p.diff.filter((l) => !hideSame || l.type !== 'same');
      if (visible.length === 0) return;
      lines.push(`## ${t('compare.page', { n: i + 1 })}`);
      for (const l of visible) {
        lines.push(`${l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '} ${l.text}`);
      }
      lines.push('');
    });
    downloadBytes(new TextEncoder().encode(lines.join('\n')), 'compare.md', 'text/markdown');
  };

  const renderSide = (side: CmpSide, pi: number, tag: 'a' | 'b') => {
    if (!side.url) {
      return (
        <div className="grid min-h-[200px] place-items-center rounded-xl bg-slate-100 text-sm text-slate-400 dark:bg-slate-800">
          — {pi + 1} —
        </div>
      );
    }
    const hasChange = side.lines.some((l) => l.kind !== 'same');
    return (
      <div
        ref={(el) => { changeRefs.current.set(`${pi}:${tag}`, el); }}
        className="relative overflow-hidden rounded-xl border bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
        style={{ aspectRatio: `${side.aspect}` }}
      >
        <img src={side.url} alt={`page ${pi + 1}`} className="absolute inset-0 h-full w-full" loading="lazy" draggable={false} />
        {side.lines.map((l, li) => {
          if (l.kind === 'same' && hideSame) return null;
          const cls =
            l.kind === 'same'
              ? 'bg-emerald-500/25 ring-1 ring-emerald-500/40'
              : l.kind === 'add'
                ? 'bg-emerald-500/45 ring-1 ring-emerald-600/60'
                : 'bg-red-500/45 ring-1 ring-red-600/60';
          return (
            <div
              key={li}
              className={`absolute rounded-[2px] ${cls}`}
              style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%`, width: `${Math.max(0.6, l.w * 100)}%`, height: `${Math.max(0.8, l.h * 100)}%` }}
            />
          );
        })}
        {side.ocr && (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-bold text-white">OCR</span>
        )}
        {hasChange && (
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white/60" />
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('compare.title')}</h1>
      <p className="text-sm text-slate-500">{t('compare.hint', { n: MAX_PAGES })}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['a', 'b'] as const).map((slot) => {
          const f = slot === 'a' ? a : b;
          return (
            <div key={slot} className="min-w-0">
              <div className="mb-1 flex min-w-0 items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {t(`compare.slot${slot.toUpperCase()}`)}{f && <span className="font-normal text-slate-500"> · {f.name}</span>}
                </p>
                {f && (
                  <button onClick={() => clearSlot(slot)} disabled={busy} aria-label={t('remove') as string} className="grid min-h-[32px] min-w-[32px] shrink-0 place-items-center rounded-lg text-slate-400 hover:text-red-500 disabled:opacity-30">✕</button>
                )}
              </div>
              <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} subtitleKey="dropSubtitlePdf" onFiles={(fl) => pick(fl[0], slot)} />
            </div>
          );
        })}
      </div>
      <button onClick={run} disabled={!a || !b || busy} className="w-full rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50 sm:w-auto sm:min-w-[220px]">
        {busy ? t('processing') : t('compare.do')}
      </button>
      {error && <p className="animate-enter text-sm text-red-500 dark:text-red-400">{error}</p>}
      {truncated && <p className="text-sm text-amber-600 dark:text-amber-400">{t('compare.truncated', { n: MAX_PAGES })}</p>}
      {busy && (
        <div className="animate-enter rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <ProgressBar value={null} label={status || (t('processing') as string)} />
        </div>
      )}

      {pairs.length > 0 && (
        <div className="animate-enter space-y-3 rounded-2xl border bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 font-semibold">
              {t('compare.summary', { added: totalAdded, removed: totalRemoved })} · {t('compare.matchPct', { n: matchPct })}
            </p>
            <button
              onClick={downloadDiff}
              className="min-h-[40px] rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 active:scale-[0.98]"
            >
              {t('compare.export')}
            </button>
          </div>
          {changes.length === 0 ? (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              {t('compare.noChanges')}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => gotoChange(changeIdx - 1)} className="grid min-h-[40px] min-w-[40px] place-items-center rounded-xl bg-slate-100 text-lg disabled:opacity-40 dark:bg-slate-800">‹</button>
              <button onClick={() => gotoChange(changeIdx + 1)} className="grid min-h-[40px] min-w-[40px] place-items-center rounded-xl bg-slate-100 text-lg disabled:opacity-40 dark:bg-slate-800">›</button>
              <span className="text-xs text-slate-500">{t('compare.changePos', { n: changes.length === 0 ? 0 : changeIdx + 1, total: changes.length })}</span>
              <label className="ml-auto flex min-h-[40px] items-center gap-2 text-sm">
                <input type="checkbox" checked={hideSame} onChange={(e) => setHideSame(e.target.checked)} className="h-5 w-5" />
                {t('compare.hideSame')}
              </label>
            </div>
          )}
          {pairs.map((p, i) => (
            <div key={i}>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                {t('compare.page', { n: i + 1 })} · <span className="text-emerald-600 dark:text-emerald-400">+{p.added}</span>{' '}
                <span className="text-red-500 dark:text-red-400">−{p.removed}</span>
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 truncate text-xs font-semibold text-slate-500">{t('compare.slotA')}</p>
                  {renderSide(p.a, i, 'a')}
                </div>
                <div>
                  <p className="mb-1 truncate text-xs font-semibold text-slate-500">{t('compare.slotB')}</p>
                  {renderSide(p.b, i, 'b')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
