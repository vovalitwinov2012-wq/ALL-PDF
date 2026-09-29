import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { BookOpen, Upload, Trash2 } from 'lucide-react';
import { Dropzone } from '../../components/Dropzone';
import { FileChip } from '../../components/FileChip';
import { ResultCard } from '../../components/ResultCard';
import { PdfOverlay, OverlayPageData } from '../../components/PdfOverlay';
import { stampImages } from '../../features/pdf-core/pdfOps';
import { loadPdf } from '../../features/pdf-core/pdfOps';
import { isTooBig, downloadBytes } from '../../lib/utils';
import { loadSetting, saveSetting } from '../../lib/settings';
import { cn } from '../../lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const CW = 640;
const CH = 260;
const INK = '#1e1b4b';
const BASE_W_PT = 180;

interface Stroke {
  pts: Array<{ x: number; y: number }>;
  w: number;
}

interface LibItem {
  id: number;
  kind: 'sign' | 'stamp';
  name: string;
  url: string;
  bytes: Uint8Array;
  aspect: number;
  transparent: boolean;
}

interface Placement {
  key: number;
  itemId: number;
  fx: number; // центр, доли страницы
  fy: number;
  scale: number; // множитель к BASE_W_PT
}

interface SignPageInfo extends OverlayPageData {
  wPt: number;
  hPt: number;
  rotated: boolean;
}

let nextId = 1;

const LIB_KEY = 'sign.library';
const LIB_MAX_ITEMS = 20;
const LIB_MAX_BYTES = 200 * 1024; // большие PNG живут только до перезагрузки

interface StoredItem {
  id: number;
  kind: 'sign' | 'stamp';
  name: string;
  aspect: number;
  transparent: boolean;
  b64: string;
}

function b64encode(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode(...bytes.subarray(i, i + CH));
  }
  return btoa(s);
}

function b64decode(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function loadLibrary(): LibItem[] {
  const stored = loadSetting<StoredItem[]>(LIB_KEY, []);
  if (!Array.isArray(stored) || stored.length === 0) return [];
  const out: LibItem[] = [];
  for (const s of stored.slice(0, LIB_MAX_ITEMS)) {
    try {
      if (!s || typeof s.b64 !== 'string' || !s.b64) continue;
      const bytes = b64decode(s.b64);
      const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'image/png' }));
      out.push({
        id: typeof s.id === 'number' ? s.id : nextId++,
        kind: s.kind === 'stamp' ? 'stamp' : 'sign',
        name: String(s.name || 'PNG'),
        url,
        bytes,
        aspect: typeof s.aspect === 'number' && s.aspect > 0 ? s.aspect : 1,
        transparent: s.transparent !== false
      });
    } catch {
      // битый элемент — пропускаем
    }
  }
  const maxId = out.reduce((m, l) => Math.max(m, l.id), 0);
  nextId = Math.max(nextId, maxId + 1);
  return out;
}

function storeLibrary(items: LibItem[]): void {
  try {
    const stored: StoredItem[] = [];
    for (const l of items) {
      if (l.bytes.length > LIB_MAX_BYTES) continue; // тяжеловесы — только на сессию
      stored.push({ id: l.id, kind: l.kind, name: l.name, aspect: l.aspect, transparent: l.transparent, b64: b64encode(l.bytes) });
      if (stored.length >= LIB_MAX_ITEMS) break;
    }
    saveSetting(LIB_KEY, stored);
  } catch {
    // квота localStorage — библиотека просто не сохранится
  }
}

function decodeImage(bytes: Uint8Array): Promise<{ url: string; w: number; h: number; transparent: boolean }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'image/png' }));
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const cw = Math.min(400, w);
        const ch = Math.max(1, Math.round((cw / Math.max(1, w)) * h));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, cw, ch);
        const d = ctx.getImageData(0, 0, cw, ch).data;
        let transparent = false;
        for (let i = 3; i < d.length; i += 16) {
          if (d[i] < 250) {
            transparent = true;
            break;
          }
        }
        resolve({ url, w, h, transparent });
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode-failed'));
    };
    img.src = url;
  });
}

export function SignPage() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const curRef = useRef<Stroke | null>(null);
  const pngInput = useRef<HTMLInputElement>(null);
  const [pngKind, setPngKind] = useState<'sign' | 'stamp'>('sign');
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [lineW, setLineW] = useState(4);
  const [library, setLibrary] = useState<LibItem[]>(loadLibrary);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [warn, setWarn] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<SignPageInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [placements, setPlacements] = useState<Record<number, Placement[]>>({});
  const [selPlacement, setSelPlacement] = useState<{ pi: number; key: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const dragRef = useRef<null | { pi: number; key: number; sx: number; sy: number; ofx: number; ofy: number }>(null);

  const selected = library.find((l) => l.id === selectedId) ?? null;
  const placedCount = Object.values(placements).reduce((s, a) => s + a.length, 0);

  // Библиотека переживает перезагрузку (мелкие PNG — в localStorage)
  useEffect(() => {
    storeLibrary(library);
  }, [library]);

  // --- Рисование подписи ---
  const toCanvas = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * CW,
      y: ((e.clientY - r.top) / r.height) * CH
    };
  };

  const paintStroke = (ctx: CanvasRenderingContext2D, s: Stroke) => {
    if (s.pts.length === 1) {
      ctx.beginPath();
      ctx.arc(s.pts[0].x, s.pts[0].y, s.w / 2, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.lineWidth = s.w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.moveTo(s.pts[0].x, s.pts[0].y);
    for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y);
    ctx.stroke();
  };

  const clear = () => {
    strokesRef.current = [];
    curRef.current = null;
    setHasInk(false);
    const c = canvasRef.current;
    if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  };

  const undo = () => {
    strokesRef.current.pop();
    setHasInk(strokesRef.current.length > 0);
    const c = canvasRef.current;
    if (c) {
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      for (const s of strokesRef.current) paintStroke(ctx, s);
    }
  };

  const addDrawnToLibrary = async () => {
    const c = canvasRef.current;
    if (!c || !hasInk) return;
    const blob: Blob | null = await new Promise((res) => c.toBlob(res, 'image/png'));
    if (!blob) return;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    try {
      const dec = await decodeImage(bytes);
      const item: LibItem = {
        id: nextId++,
        kind: 'sign',
        name: `${t('signPage.tabSign')} ${library.filter((l) => l.kind === 'sign').length + 1}`,
        url: dec.url,
        bytes,
        aspect: dec.w / Math.max(1, dec.h),
        transparent: dec.transparent
      };
      setLibrary((p) => [...p, item]);
      setSelectedId(item.id);
      setWarn('');
      clear();
    } catch {
      setWarn(t('failed') as string);
    }
  };

  const addPngToLibrary = async (f: File | undefined) => {
    if (!f) return;
    if (isTooBig(f)) return setWarn(t('fileTooBig') as string);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const dec = await decodeImage(bytes);
      const item: LibItem = {
        id: nextId++,
        kind: pngKind,
        name: f.name.replace(/\.[^.]+$/, '') || (pngKind === 'sign' ? t('signPage.tabSign') : t('signPage.tabStamp')) as string,
        url: dec.url,
        bytes,
        aspect: dec.w / Math.max(1, dec.h),
        transparent: dec.transparent
      };
      setLibrary((p) => [...p, item]);
      setSelectedId(item.id);
      setWarn(dec.transparent ? '' : (t('signPage.opaqueWarn') as string));
    } catch {
      setWarn(t('signPage.badPng') as string);
    }
  };

  const removeItem = (id: number) => {
    const gone = library.find((l) => l.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    setLibrary((p) => p.filter((l) => l.id !== id));
    if (selectedId === id) setSelectedId(null);
    setPlacements((p) => {
      const next: Record<number, Placement[]> = {};
      for (const [pi, arr] of Object.entries(p)) {
        const kept = arr.filter((pl) => pl.itemId !== id);
        if (kept.length > 0) next[Number(pi)] = kept;
      }
      return next;
    });
    setSelPlacement(null);
  };

  // --- PDF ---
  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    if (isTooBig(f)) {
      setFile(null);
      setPages([]);
      setTotal(0);
      return setError(t('fileTooBig') as string);
    }
    setError(null);
    setFile(f);
    setResult(null);
    setPages([]);
    setTotal(0);
    setPlacements({});
    setSelPlacement(null);
    setLoading(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const count = (await loadPdf(bytes)).getPageCount();
      setTotal(count);
      const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
      const n = Math.min(count, 30);
      const out: SignPageInfo[] = [];
      for (let p = 1; p <= n; p++) {
        const pg = await pdf.getPage(p);
        const wPt = pg.view[2] - pg.view[0];
        const hPt = pg.view[3] - pg.view[1];
        const v1 = pg.getViewport({ scale: 1 });
        const rotated =
          Math.abs(wPt - hPt) > 1 && Math.abs(v1.width - hPt) < 1 && Math.abs(v1.height - wPt) < 1;
        const scale = Math.min(1.5, 640 / wPt);
        const viewport = pg.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await pg.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        out.push({ url: canvas.toDataURL('image/jpeg', 0.8), aspect: canvas.width / canvas.height, words: [], label: `page ${p}`, wPt, hPt, rotated });
      }
      setPages(out);
    } catch {
      setError(t('failed') as string);
    } finally {
      setLoading(false);
    }
  };

  // Тап по пустому месту — поставить выбранное; тянуть картинку — двигать
  const tapPage = (pi: number, fx: number, fy: number) => {
    if (!selected) {
      setWarn(t('signPage.emptyLibrary') as string);
      return;
    }
    const pl: Placement = { key: nextId++, itemId: selected.id, fx, fy, scale: 1 };
    setPlacements((p) => ({ ...p, [pi]: [...(p[pi] ?? []), pl] }));
    setSelPlacement({ pi, key: pl.key });
    setResult(null);
  };

  const dragStart = (pi: number, key: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const cur = (placements[pi] ?? []).find((x) => x.key === key);
    if (!cur) return;
    dragRef.current = { pi, key, sx: e.clientX, sy: e.clientY, ofx: cur.fx, ofy: cur.fy };
    setSelPlacement({ pi, key });
  };

  const dragMove = (pi: number) => (e: React.PointerEvent) => {
    const d = dragRef.current;
    const host = (e.currentTarget as HTMLElement).parentElement?.parentElement;
    if (!d || d.pi !== pi || !host) return;
    const r = host.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const fx = Math.min(1, Math.max(0, d.ofx + (e.clientX - d.sx) / r.width));
    const fy = Math.min(1, Math.max(0, d.ofy + (e.clientY - d.sy) / r.height));
    setPlacements((p) => ({ ...p, [pi]: (p[pi] ?? []).map((x) => (x.key === d.key ? { ...x, fx, fy } : x)) }));
  };

  const dragEnd = () => {
    dragRef.current = null;
  };

  const selPl = selPlacement ? (placements[selPlacement.pi] ?? []).find((x) => x.key === selPlacement.key) ?? null : null;
  const selItem = selPl ? library.find((l) => l.id === selPl.itemId) ?? null : null;

  const setSelScale = (s: number) => {
    if (!selPlacement) return;
    setResult(null);
    setPlacements((p) => ({
      ...p,
      [selPlacement.pi]: (p[selPlacement.pi] ?? []).map((x) => (x.key === selPlacement.key ? { ...x, scale: s } : x))
    }));
  };

  const deleteSel = () => {
    if (!selPlacement) return;
    setResult(null);
    setPlacements((p) => ({
      ...p,
      [selPlacement.pi]: (p[selPlacement.pi] ?? []).filter((x) => x.key !== selPlacement.key)
    }));
    setSelPlacement(null);
  };

  const placeAll = async () => {
    if (!file) return;
    if (placedCount === 0) return setError(t('signPage.nothingPlaced') as string);
    setBusy(true);
    setError(null);
    try {
      const pdfBytes = new Uint8Array(await file.arrayBuffer());
      const stamps: Array<{ pageIdx: number; pngBytes: Uint8Array; x: number; y: number; w: number; h: number }> = [];
      for (const [piStr, arr] of Object.entries(placements)) {
        const pi = Number(piStr);
        const info = pages[pi];
        if (!info) continue;
        for (const pl of arr) {
          const item = library.find((l) => l.id === pl.itemId);
          if (!item) continue;
          const w = BASE_W_PT * pl.scale;
          const h = w / Math.max(0.2, item.aspect);
          const cx = pl.fx * info.wPt;
          const cy = (1 - pl.fy) * info.hPt;
          stamps.push({ pageIdx: pi, pngBytes: item.bytes, x: cx - w / 2, y: cy - h / 2, w, h });
        }
      }
      setResult(await stampImages(pdfBytes, stamps));
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  const libCard = (kind: 'sign' | 'stamp') => (
    <div className="grid grid-cols-3 gap-2">
      {library.filter((l) => l.kind === kind).map((l) => (
        <div
          key={l.id}
          onClick={() => setSelectedId(l.id)}
          className={cn(
            'relative cursor-pointer rounded-xl border-2 bg-white p-1.5 transition dark:bg-slate-800',
            selectedId === l.id ? 'border-indigo-600' : 'border-transparent dark:border-slate-700'
          )}
        >
          <div className="flex h-16 items-center justify-center overflow-hidden rounded-lg bg-[repeating-conic-gradient(#e2e8f0_0_25%,#fff_0_50%)] bg-[length:16px_16px] dark:bg-[repeating-conic-gradient(#1e293b_0_25%,#0f172a_0_50%)]">
            <img src={l.url} alt={l.name} className="max-h-full max-w-full object-contain" />
          </div>
          <p className="mt-1 truncate text-center text-[11px] text-slate-500">{l.name}</p>
          <button
            onClick={(e) => { e.stopPropagation(); removeItem(l.id); }}
            aria-label={t('remove') as string}
            className="absolute right-0.5 top-0.5 grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-xs text-slate-400 hover:text-red-500 dark:bg-slate-900/90"
          >
            ✕
          </button>
        </div>
      ))}
      {library.filter((l) => l.kind === kind).length === 0 && (
        <p className="col-span-3 rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-400 dark:bg-slate-800">
          {t('signPage.emptyKind')}
        </p>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('signPage.title')}</h1>
      <p className="text-sm text-slate-500">{t('signPage.hint')}</p>

      <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold">{t('signPage.librarySign')}</p>
        <div className="mt-2">
          <p className="mb-1 text-xs font-semibold text-slate-500">{t('signPage.drawHere')}</p>
          <canvas
            ref={canvasRef}
            width={CW}
            height={CH}
            className="h-44 w-full touch-none rounded-2xl border-2 border-dashed border-indigo-300 bg-white sm:h-52 dark:border-indigo-700"
            onPointerDown={(e) => {
              setDrawing(true);
              setWarn('');
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              const s: Stroke = { pts: [toCanvas(e)], w: lineW };
              curRef.current = s;
              strokesRef.current.push(s);
              paintStroke(canvasRef.current!.getContext('2d')!, s);
              setHasInk(true);
            }}
            onPointerMove={(e) => {
              if (!drawing || !curRef.current) return;
              const ctx = canvasRef.current!.getContext('2d')!;
              const cur = curRef.current;
              const prev = cur.pts[cur.pts.length - 1];
              const next = toCanvas(e);
              cur.pts.push(next);
              ctx.beginPath();
              ctx.lineWidth = cur.w;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.strokeStyle = INK;
              ctx.moveTo(prev.x, prev.y);
              ctx.lineTo(next.x, next.y);
              ctx.stroke();
            }}
            onPointerUp={() => { setDrawing(false); curRef.current = null; }}
            onPointerCancel={() => { setDrawing(false); curRef.current = null; }}
            onPointerLeave={() => { setDrawing(false); curRef.current = null; }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {[3, 5, 8].map((w) => (
            <button key={w} onClick={() => setLineW(w)} aria-pressed={lineW === w}
              className={`min-h-[40px] rounded-xl px-3 py-1 text-sm font-semibold transition-colors ${lineW === w ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}>
              {t('signPage.lineW', { n: w })}
            </button>
          ))}
          <button onClick={undo} disabled={!hasInk} className="min-h-[40px] rounded-xl bg-slate-200 px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 dark:bg-slate-800">{t('signPage.undo')}</button>
          <button onClick={clear} disabled={!hasInk} className="min-h-[40px] rounded-xl bg-slate-200 px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 dark:bg-slate-800">{t('signPage.clearSign')}</button>
          <button onClick={addDrawnToLibrary} disabled={!hasInk} className="min-h-[40px] rounded-xl bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-40">
            {t('signPage.toLibrary')}
          </button>
        </div>
        <div className="mt-3">{libCard('sign')}</div>
      </div>

      <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold">{t('signPage.libraryStamp')}</p>
        <p className="mt-1 text-xs text-slate-500">{t('signPage.stampNote')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => { setPngKind('sign'); pngInput.current?.click(); }} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-300 px-3 text-sm font-semibold text-indigo-700 dark:border-indigo-700 dark:text-indigo-300">
            <Upload className="h-4 w-4" /> {t('signPage.uploadSign')}
          </button>
          <button onClick={() => { setPngKind('stamp'); pngInput.current?.click(); }} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-300 px-3 text-sm font-semibold text-indigo-700 dark:border-indigo-700 dark:text-indigo-300">
            <Upload className="h-4 w-4" /> {t('signPage.uploadStamp')}
          </button>
        </div>
        <input ref={pngInput} type="file" accept="image/png,image/*" className="hidden" onChange={(e) => { addPngToLibrary(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="mt-3">{libCard('stamp')}</div>
        <p className="mt-2 text-[11px] text-slate-400">{t('signPage.libraryNote')}</p>
      </div>

      {warn && <p className="animate-enter text-sm text-amber-600 dark:text-amber-400">{warn}</p>}

      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy || loading} subtitleKey="dropSubtitlePdf" onFiles={(f) => pickFile(f[0])} />
      {error && <p className="animate-enter text-sm text-red-500 dark:text-red-400">{error}</p>}
      {file && <FileChip name={file.name} meta={pages.length > 0 ? `${pages.length} ${t('pagesShort')}` : undefined} disabled={busy} onRemove={() => { setFile(null); setPages([]); setTotal(0); setPlacements({}); setSelPlacement(null); setResult(null); setError(null); setOverlayOpen(false); }} />}
      {total > pages.length && pages.length > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">{t('signPage.cappedNote', { shown: pages.length, total })}</p>
      )}
      {pages.some((p) => p.rotated) && (
        <p className="text-sm text-amber-600 dark:text-amber-400">{t('signPage.rotatedNote')}</p>
      )}
      {loading && <div className="h-40 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />}

      {pages.length > 0 && (
        <button
          onClick={() => setOverlayOpen(true)}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99]"
        >
          <BookOpen className="h-5 w-5" /> {t('signPage.openViewer')} · {t('signPage.placed', { n: placedCount })}
        </button>
      )}
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="signed.pdf" />}

      {overlayOpen && pages.length > 0 && (
        <PdfOverlay
          title={file?.name ?? (t('signPage.title') as string)}
          pages={pages}
          onClose={() => setOverlayOpen(false)}
          onPageTap={tapPage}
          tapHint={selected ? (t('signPage.tapPlaceHint', { name: selected.name }) as string) : (t('signPage.emptyLibrary') as string)}
          pageOverlay={(pi) => (
            <div className="absolute inset-0" onPointerMove={dragMove(pi)} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
              {(placements[pi] ?? []).map((pl) => {
                const item = library.find((l) => l.id === pl.itemId);
                if (!item) return null;
                const wPct = Math.min(95, ((BASE_W_PT * pl.scale) / pages[pi].wPt) * 100);
                const sel = selPlacement?.pi === pi && selPlacement?.key === pl.key;
                return (
                  <img
                    key={pl.key}
                    src={item.url}
                    alt={item.name}
                    draggable={false}
                    onPointerDown={dragStart(pi, pl.key)}
                    className={`absolute touch-none select-none ${sel ? 'ring-2 ring-indigo-400' : ''}`}
                    style={{
                      left: `${pl.fx * 100}%`,
                      top: `${pl.fy * 100}%`,
                      width: `${wPct}%`,
                      aspectRatio: `${item.aspect}`,
                      transform: 'translate(-50%, -50%)'
                    }}
                  />
                );
              })}
            </div>
          )}
          toolbar={
            <div className="space-y-2 rounded-xl bg-white/10 p-2">
              <div className="flex items-center gap-2">
                {selected ? (
                  <span className="min-w-0 flex-1 truncate text-sm text-white">✒ {selected.name}</span>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{t('signPage.emptyLibrary')}</span>
                )}
                <button
                  onClick={() => setOverlayOpen(false)}
                  className="min-h-[40px] shrink-0 rounded-xl bg-white/15 px-3 text-xs font-semibold text-white"
                >
                  {t('signPage.toLibraryBtn')}
                </button>
              </div>
              {selPl && selItem && (
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{selItem.name} · ×{selPl.scale.toFixed(1)}</span>
                  <input
                    type="range" min={0.3} max={2.5} step={0.1} value={selPl.scale}
                    onChange={(e) => setSelScale(Number(e.target.value))}
                    aria-label={t('signPage.size') as string}
                    className="min-w-0 flex-1 accent-indigo-400"
                  />
                  <button onClick={deleteSel} aria-label={t('remove') as string} className="grid min-h-[40px] min-w-[40px] shrink-0 place-items-center rounded-xl bg-white/15 text-white">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
              <button
                onClick={placeAll}
                disabled={busy || placedCount === 0}
                className="min-h-[48px] w-full rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50"
              >
                {busy ? t('processing') : `${t('signPage.place')} · ${placedCount}`}
              </button>
              {result && (
                <button
                  onClick={() => downloadBytes(result, 'signed.pdf', 'application/pdf')}
                  className="min-h-[44px] w-full rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white"
                >
                  {t('download')}
                </button>
              )}
            </div>
          }
        />
      )}
    </div>
  );
}
