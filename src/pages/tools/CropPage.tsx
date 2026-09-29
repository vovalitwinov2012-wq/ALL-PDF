import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { BookOpen } from 'lucide-react';
import { Dropzone } from '../../components/Dropzone';
import { FileChip } from '../../components/FileChip';
import { ResultCard } from '../../components/ResultCard';
import { PdfOverlay, OverlayPageData } from '../../components/PdfOverlay';
import { isTooBig } from '../../lib/utils';
import { loadPdf } from '../../features/pdf-core/pdfOps';
import { cropPdf } from '../../features/pdf-core/pages';
import { CropMargins } from '../../features/pdf-core/pages';
import { cn } from '../../lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const DEFAULT_M: CropMargins = { top: 36, right: 36, bottom: 36, left: 36 };
const MIN_KEPT = 20;

interface CropPage extends OverlayPageData {
  wPt: number;
  hPt: number;
}

const clampPt = (v: number, max: number) => Math.min(Math.max(max, 0), Math.max(0, Math.round(v)));

// Тянущаяся рамка: края двигаются пальцем/мышью, числа пересчитываются сами.
function CropFrame({ m, wPt, hPt, onChange }: {
  m: CropMargins;
  wPt: number;
  hPt: number;
  onChange: (m: CropMargins) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { edge: keyof CropMargins; sx: number; sy: number; orig: CropMargins }>(null);

  const start = (edge: keyof CropMargins) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { edge, sx: e.clientX, sy: e.clientY, orig: { ...m } };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const dx = ((e.clientX - d.sx) / r.width) * wPt;
    const dy = ((e.clientY - d.sy) / r.height) * hPt;
    const o = d.orig;
    const next = { ...o };
    if (d.edge === 'left') next.left = clampPt(o.left + dx, wPt - o.right - MIN_KEPT);
    else if (d.edge === 'right') next.right = clampPt(o.right - dx, wPt - o.left - MIN_KEPT);
    else if (d.edge === 'top') next.top = clampPt(o.top + dy, hPt - o.bottom - MIN_KEPT);
    else next.bottom = clampPt(o.bottom - dy, hPt - o.top - MIN_KEPT);
    onChange(next);
  };
  const end = () => {
    drag.current = null;
  };

  const topP = Math.min(100, (m.top / hPt) * 100);
  const botP = Math.min(100, (m.bottom / hPt) * 100);
  const leftP = Math.min(100, (m.left / wPt) * 100);
  const rightP = Math.min(100, (m.right / wPt) * 100);

  const handle = 'absolute z-10 flex items-center justify-center rounded-full bg-white/95 text-[10px] font-bold text-indigo-700 shadow-lg touch-none select-none';

  return (
    <div ref={ref} className="absolute inset-0 touch-none" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <div className="absolute inset-x-0 top-0 bg-black/45" style={{ height: `${topP}%` }} />
      <div className="absolute inset-x-0 bottom-0 bg-black/45" style={{ height: `${botP}%` }} />
      <div className="absolute left-0 bg-black/45" style={{ top: `${topP}%`, bottom: `${botP}%`, width: `${leftP}%` }} />
      <div className="absolute right-0 bg-black/45" style={{ top: `${topP}%`, bottom: `${botP}%`, width: `${rightP}%` }} />
      <div
        className="absolute rounded border-2 border-dashed border-indigo-400"
        style={{ top: `${topP}%`, left: `${leftP}%`, right: `${rightP}%`, bottom: `${botP}%` }}
      />
      <div className={cn(handle, 'inset-x-8 h-8 cursor-ns-resize')} style={{ top: `${topP}%`, transform: 'translateY(-50%)' }}
        onPointerDown={start('top')}>{m.top}</div>
      <div className={cn(handle, 'inset-x-8 h-8 cursor-ns-resize')} style={{ bottom: `${botP}%`, transform: 'translateY(50%)' }}
        onPointerDown={start('bottom')}>{m.bottom}</div>
      <div className={cn(handle, 'w-8 cursor-ew-resize')} style={{ left: `${leftP}%`, top: `${topP}%`, bottom: `${botP}%`, transform: 'translateX(-50%)' }}
        onPointerDown={start('left')}>
        <span style={{ writingMode: 'vertical-rl' }}>{m.left}</span>
      </div>
      <div className={cn(handle, 'w-8 cursor-ew-resize')} style={{ right: `${rightP}%`, top: `${topP}%`, bottom: `${botP}%`, transform: 'translateX(50%)' }}
        onPointerDown={start('right')}>
        <span style={{ writingMode: 'vertical-rl' }}>{m.right}</span>
      </div>
    </div>
  );
}

export function CropPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<CropPage[]>([]);
  const [margins, setMargins] = useState<Record<number, CropMargins>>({});
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);

  const m: CropMargins = margins[active] ?? DEFAULT_M;

  const setM = (k: keyof CropMargins, v: number) => {
    setResult(null);
    setError(null);
    setMargins((p) => ({ ...p, [active]: { ...(p[active] ?? DEFAULT_M), [k]: Math.max(0, Math.floor(v) || 0) } }));
  };

  const setFrame = (pi: number, next: CropMargins) => {
    setResult(null);
    setMargins((p) => ({ ...p, [pi]: next }));
  };

  const open = async (f: File | undefined) => {
    if (!f) return;
    if (isTooBig(f)) {
      setFile(null);
      setPages([]);
      setMargins({});
      setResult(null);
      return setError(t('fileTooBig') as string);
    }
    setFile(f);
    setResult(null);
    setError(null);
    setPages([]);
    setMargins({});
    setActive(0);
    setChecking(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const count = (await loadPdf(bytes)).getPageCount();
      const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
      const n = Math.min(count, 30);
      const out: CropPage[] = [];
      const mm: Record<number, CropMargins> = {};
      for (let p = 1; p <= n; p++) {
        const pg = await pdf.getPage(p);
        const wPt = pg.view[2] - pg.view[0];
        const hPt = pg.view[3] - pg.view[1];
        const scale = Math.min(1.2, 560 / wPt);
        const viewport = pg.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await pg.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        out.push({ url: canvas.toDataURL('image/jpeg', 0.8), aspect: canvas.width / canvas.height, words: [], label: `page ${p}`, wPt, hPt });
        mm[p - 1] = { ...DEFAULT_M };
      }
      setPages(out);
      setMargins(mm);
    } catch {
      setError(t('failed') as string);
    } finally {
      setChecking(false);
    }
  };

  const toAll = () => {
    setResult(null);
    const cur = margins[active] ?? DEFAULT_M;
    const mm: Record<number, CropMargins> = {};
    pages.forEach((_, i) => { mm[i] = { ...cur }; });
    setMargins(mm);
  };

  const resetPage = () => {
    setResult(null);
    setMargins((p) => ({ ...p, [active]: { ...DEFAULT_M } }));
  };

  const run = async () => {
    if (!file) return setError(t('needFiles') as string);
    if (pages.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      let out: Uint8Array = new Uint8Array(await file.arrayBuffer());
      // Группируем страницы с одинаковыми полями — по одному проходу на группу
      const groups = new Map<string, { m: CropMargins; idx: number[] }>();
      pages.forEach((_, i) => {
        const mm = margins[i] ?? DEFAULT_M;
        const key = `${mm.top}|${mm.right}|${mm.bottom}|${mm.left}`;
        const g = groups.get(key);
        if (g) g.idx.push(i);
        else groups.set(key, { m: mm, idx: [i] });
      });
      for (const g of groups.values()) {
        out = await cropPdf(out, g.m, g.idx);
      }
      setResult(out);
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  const pageNav = (
    <div className="flex items-center gap-1">
      <button onClick={() => setActive((a) => Math.max(0, a - 1))} disabled={active === 0} aria-label="←"
        className="grid min-h-[40px] min-w-[40px] place-items-center rounded-lg bg-slate-100 text-lg disabled:opacity-40 dark:bg-slate-800">‹</button>
      <span className="min-w-[64px] px-1 text-center text-sm font-semibold">{pages.length === 0 ? '–' : `${active + 1} / ${pages.length}`}</span>
      <button onClick={() => setActive((a) => Math.min(pages.length - 1, a + 1))} disabled={active >= pages.length - 1} aria-label="→"
        className="grid min-h-[40px] min-w-[40px] place-items-center rounded-lg bg-slate-100 text-lg disabled:opacity-40 dark:bg-slate-800">›</button>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('crop.title')}</h1>
      <p className="text-sm text-slate-500">{t('crop.hint')}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy || checking} subtitleKey="dropSubtitlePdf" onFiles={(f) => open(f[0])} />
      {error && <p className="animate-enter text-sm text-red-500 dark:text-red-400">{error}</p>}
      {file && (
        <FileChip
          name={file.name}
          meta={pages.length > 0 ? `${pages.length} ${t('pagesShort')}` : undefined}
          disabled={busy}
          onRemove={() => { setFile(null); setPages([]); setMargins({}); setResult(null); setError(null); setOverlayOpen(false); }}
        />
      )}
      {checking && <div className="h-40 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />}

      {pages.length > 0 && (
        <>
          <button
            onClick={() => setOverlayOpen(true)}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99]"
          >
            <BookOpen className="h-5 w-5" /> {t('crop.openViewer')}
          </button>
          <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2">
              {pageNav}
              <button onClick={toAll} disabled={busy} className="min-h-[40px] rounded-xl bg-slate-100 px-3 text-xs font-semibold transition-colors disabled:opacity-40 dark:bg-slate-800">
                {t('crop.toAll')}
              </button>
              <button onClick={resetPage} disabled={busy} className="min-h-[40px] rounded-xl bg-slate-100 px-3 text-xs font-semibold transition-colors disabled:opacity-40 dark:bg-slate-800">
                {t('crop.resetPage')}
              </button>
            </div>
            <p className="mt-3 text-sm font-semibold">{t('crop.margins')} (pt) · {t('crop.perPage', { n: active + 1 })}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
                <label key={k} className="text-xs text-slate-500">
                  {t(`crop.${k}`)}
                  <input
                    type="number" min={0} value={m[k]} disabled={busy}
                    onChange={(e) => setM(k, Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
              ))}
            </div>
            <div className="relative mx-auto mt-3 w-full max-w-[220px] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800" style={{ aspectRatio: `${pages[active].wPt} / ${pages[active].hPt}` }}>
              <img src={pages[active].url} alt="preview" className="absolute inset-0 h-full w-full" />
              <div
                className="absolute rounded border-2 border-dashed border-indigo-500 bg-indigo-500/10"
                style={{
                  top: `${Math.min(100, (m.top / pages[active].hPt) * 100)}%`,
                  left: `${Math.min(100, (m.left / pages[active].wPt) * 100)}%`,
                  right: `${Math.min(100, (m.right / pages[active].wPt) * 100)}%`,
                  bottom: `${Math.min(100, (m.bottom / pages[active].hPt) * 100)}%`
                }}
              />
            </div>
          </div>
          <button onClick={run} disabled={!file || busy} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50">
            {busy ? t('processing') : t('crop.do')}
          </button>
        </>
      )}
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="cropped.pdf" />}

      {overlayOpen && pages.length > 0 && (
        <PdfOverlay
          title={file?.name ?? (t('crop.title') as string)}
          pages={pages}
          onClose={() => setOverlayOpen(false)}
          tapHint={t('crop.frameHint') as string}
          onPageTap={(pi) => setActive(pi)}
          pageOverlay={(pi) => (
            <CropFrame m={margins[pi] ?? DEFAULT_M} wPt={pages[pi].wPt} hPt={pages[pi].hPt} onChange={(next) => setFrame(pi, next)} />
          )}
          toolbar={
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/10 p-2">
              {pageNav}
              <button onClick={toAll} className="min-h-[44px] rounded-xl bg-white/15 px-3 text-xs font-semibold text-white">
                {t('crop.toAll')}
              </button>
              <button
                onClick={() => { setOverlayOpen(false); run(); }}
                disabled={busy}
                className="min-h-[44px] flex-1 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? t('processing') : t('crop.do')}
              </button>
            </div>
          }
        />
      )}
    </div>
  );
}
