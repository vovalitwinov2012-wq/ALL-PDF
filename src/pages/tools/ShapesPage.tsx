import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Square, Circle, Minus, ArrowRight, Highlighter, Ban, Undo2, Trash2 } from 'lucide-react';
import { Dropzone } from '../../components/Dropzone';
import { ResultCard } from '../../components/ResultCard';
import { isTooBig, cn } from '../../lib/utils';
import { loadPdf } from '../../features/pdf-core/pdfOps';
import { drawShapes, Shape, ShapeColor } from '../../features/pdf-core/pages';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Tool = 'rect' | 'ellipse' | 'line' | 'arrow' | 'highlight' | 'redact';

const COLORS: Array<{ name: string; c: ShapeColor }> = [
  { name: 'red', c: { r: 0.85, g: 0.15, b: 0.15 } },
  { name: 'blue', c: { r: 0.15, g: 0.35, b: 0.9 } },
  { name: 'green', c: { r: 0.1, g: 0.6, b: 0.25 } },
  { name: 'black', c: { r: 0.1, g: 0.1, b: 0.1 } }
];

const TOOLS: Array<{ id: Tool; icon: typeof Square }> = [
  { id: 'rect', icon: Square },
  { id: 'ellipse', icon: Circle },
  { id: 'line', icon: Minus },
  { id: 'arrow', icon: ArrowRight },
  { id: 'highlight', icon: Highlighter },
  { id: 'redact', icon: Ban }
];

interface VPoint {
  x: number;
  y: number;
}

export function ShapesPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(0);
  const [img, setImg] = useState('');
  const [vp, setVp] = useState<{ w: number; h: number; toPdf: (x: number, y: number) => [number, number]; toView: (x: number, y: number) => [number, number] } | null>(null);
  const [tool, setTool] = useState<Tool>('rect');
  const [color, setColor] = useState<ShapeColor>(COLORS[0].c);
  const [width, setWidth] = useState(3);
  const [shapes, setShapes] = useState<Record<number, Shape[]>>({});
  const [draft, setDraft] = useState<{ a: VPoint; b: VPoint } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [zoom, setZoom] = useState(1);
  const [dzoom, setDzoom] = useState(1);
  const [toast, setToast] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navSeq = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<null | { d0: number; f0: number; cx: number; cy: number; sl: number; st: number }>(null);
  const pinchF = useRef(1);
  const lastPointer = useRef('mouse');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 1800);
  };

  const renderPage = async (data: Uint8Array, idx: number, z = 1) => {
    const seq = ++navSeq.current;
    const pdf = await pdfjs.getDocument({ data: data.slice() }).promise;
    const pg = await pdf.getPage(idx + 1);
    const v1 = pg.getViewport({ scale: 1 });
    const scale = Math.min(2, 760 / v1.width) * z;
    const viewport = pg.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await pg.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    if (navSeq.current !== seq) return; // пока рендерилось, ушли на другую страницу
    setImg(canvas.toDataURL('image/jpeg', 0.85));
    setVp({
      w: canvas.width,
      h: canvas.height,
      toPdf: (x, y) => {
        const p = viewport.convertToPdfPoint(x, y) as [number, number];
        return [p[0], p[1]];
      },
      toView: (x, y) => {
        const p = viewport.convertToViewportPoint(x, y) as [number, number];
        return [p[0], p[1]];
      }
    });
  };

  const open = async (f: File | undefined) => {
    if (!f) return;
    if (isTooBig(f)) {
      setFile(null);
      setBytes(null);
      setImg('');
      setVp(null);
      setShapes({});
      setPageCount(0);
      return setError(t('fileTooBig') as string);
    }
    setError(null);
    setResult(null);
    setShapes({});
    setZoom(1);
    setDzoom(1);
    pinchF.current = 1;
    gesture.current = null;
    pointers.current.clear();
    setBusy(true);
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      const n = (await loadPdf(data)).getPageCount();
      setFile(f);
      setBytes(data);
      setPageCount(n);
      setPage(0);
      await renderPage(data, 0, 1);
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  const gotoPage = async (idx: number) => {
    if (!bytes || busy || idx < 0 || idx >= pageCount || idx === page) return;
    setPage(idx);
    setDraft(null);
    setResult(null);
    await renderPage(bytes, idx, zoom);
  };

  const changeZoom = async (z: number) => {
    const nz = Math.min(2.5, Math.max(1, z));
    setZoom(nz);
    if (bytes && !busy) await renderPage(bytes, page, nz);
  };

  const local = (e: React.PointerEvent): VPoint => {
    const r = boxRef.current!.getBoundingClientRect();
    const sx = (vp?.w ?? 1) / r.width;
    const sy = (vp?.h ?? 1) / r.height;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  };

  const commit = (a: VPoint, b: VPoint) => {
    if (!vp) return;
    const [x1, y1] = vp.toPdf(a.x, a.y);
    const [x2, y2] = vp.toPdf(b.x, b.y);
    // Порог отсева под палец больше: дрожание пальца не должно давать ложных штрихов
    const MIN = lastPointer.current === 'mouse' ? 3 : 7;
    if (Math.hypot(x2 - x1, y2 - y1) < MIN && (tool === 'line' || tool === 'arrow')) {
      flashToast(t('shapes.tooSmall') as string);
      return;
    }
    let s: Shape;
    if (tool === 'rect' || tool === 'highlight' || tool === 'redact') {
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      if (w < MIN || h < MIN) {
        flashToast(t('shapes.tooSmall') as string);
        return;
      }
      s = tool === 'rect' ? { kind: 'rect', x, y, w, h, color, width } : { kind: tool, x, y, w, h };
    } else if (tool === 'ellipse') {
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      if (rx < MIN || ry < MIN) {
        flashToast(t('shapes.tooSmall') as string);
        return;
      }
      s = { kind: 'ellipse', cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx, ry, color, width };
    } else {
      s = { kind: tool, x1, y1, x2, y2, color, width };
    }
    setResult(null);
    setShapes((p) => ({ ...p, [page]: [...(p[page] ?? []), s] }));
  };

  const undo = () => {
    setResult(null);
    setShapes((p) => ({ ...p, [page]: (p[page] ?? []).slice(0, -1) }));
  };

  const clearPage = () => {
    setResult(null);
    setShapes((p) => ({ ...p, [page]: [] }));
  };

  const apply = async () => {
    if (!bytes) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await drawShapes(bytes, shapes));
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  // Один палец — рисуем, два — щипок (масштаб) + панорама.
  const onSvgDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastPointer.current = (e.nativeEvent as PointerEvent).pointerType || 'mouse';
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      gesture.current = {
        d0: Math.max(1, dist2(p1, p2)),
        f0: pinchF.current,
        cx: (p1.x + p2.x) / 2,
        cy: (p1.y + p2.y) / 2,
        sl: scrollRef.current?.scrollLeft ?? 0,
        st: scrollRef.current?.scrollTop ?? 0
      };
      setDraft(null);
      return;
    }
    if (pointers.current.size > 2) return;
    setDraft({ a: local(e), b: local(e) });
  };

  const onSvgMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g && pointers.current.size >= 2 && vp && boxRef.current) {
      const [p1, p2] = [...pointers.current.values()];
      const f = Math.min(3, Math.max(1, (g.f0 * Math.max(1, dist2(p1, p2))) / g.d0));
      pinchF.current = f;
      boxRef.current.style.width = `${vp.w * f}px`;
      const cx = (p1.x + p2.x) / 2;
      const cy = (p1.y + p2.y) / 2;
      if (scrollRef.current) {
        scrollRef.current.scrollLeft = g.sl - (cx - g.cx);
        scrollRef.current.scrollTop = g.st - (cy - g.cy);
      }
      return;
    }
    if (draft) setDraft({ a: draft.a, b: local(e) });
  };

  const onSvgUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (gesture.current && pointers.current.size < 2) {
      setDzoom(pinchF.current);
      gesture.current = null;
      setDraft(null);
      return;
    }
    if (draft) {
      commit(draft.a, local(e));
      setDraft(null);
    }
  };

  const totalShapes = Object.values(shapes).reduce((s, a) => s + a.length, 0);

  const toSvg = (s: Shape): React.ReactNode => {
    if (!vp) return null;
    const P = (x: number, y: number): [number, number] => vp.toView(x, y);
    const css = (c: ShapeColor) => `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
    if (s.kind === 'rect') {
      const [x, y] = P(s.x, s.y + s.h);
      const [x2, y2] = P(s.x + s.w, s.y);
      return <rect x={x} y={y} width={x2 - x} height={y2 - y} fill="none" stroke={css(s.color)} strokeWidth={s.width} />;
    }
    if (s.kind === 'highlight' || s.kind === 'redact') {
      const [x, y] = P(s.x, s.y + s.h);
      const [x2, y2] = P(s.x + s.w, s.y);
      return <rect x={x} y={y} width={x2 - x} height={y2 - y} fill={s.kind === 'redact' ? '#000' : 'rgba(255,235,59,0.45)'} />;
    }
    if (s.kind === 'ellipse') {
      const [cx, cy] = P(s.cx, s.cy);
      const [ex] = P(s.cx + s.rx, s.cy);
      const [, ey] = P(s.cx, s.cy + s.ry);
      return <ellipse cx={cx} cy={cy} rx={Math.abs(ex - cx)} ry={Math.abs(ey - cy)} fill="none" stroke={css(s.color)} strokeWidth={s.width} />;
    }
    const [x1, y1] = P(s.x1, s.y1);
    const [x2, y2] = P(s.x2, s.y2);
    if (s.kind === 'line') return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={css(s.color)} strokeWidth={s.width} />;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const L = Math.max(10, s.width * 5);
    const h1x = x2 - L * Math.cos(ang + Math.PI / 6);
    const h1y = y2 - L * Math.sin(ang + Math.PI / 6);
    const h2x = x2 - L * Math.cos(ang - Math.PI / 6);
    const h2y = y2 - L * Math.sin(ang - Math.PI / 6);
    return (
      <g stroke={css(s.color)} strokeWidth={s.width}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
        <line x1={x2} y1={y2} x2={h1x} y2={h1y} />
        <line x1={x2} y1={y2} x2={h2x} y2={h2y} />
      </g>
    );
  };

  const draftSvg = () => {
    if (!draft || !vp) return null;
    const w = Math.abs(draft.b.x - draft.a.x);
    const h = Math.abs(draft.b.y - draft.a.y);
    if (tool === 'ellipse') {
      return <ellipse cx={(draft.a.x + draft.b.x) / 2} cy={(draft.a.y + draft.b.y) / 2} rx={w / 2} ry={h / 2} fill="none" stroke="#4f46e5" strokeWidth={2} strokeDasharray="5 3" />;
    }
    if (tool === 'line' || tool === 'arrow') {
      return <line x1={draft.a.x} y1={draft.a.y} x2={draft.b.x} y2={draft.b.y} stroke="#4f46e5" strokeWidth={2} strokeDasharray="5 3" />;
    }
    return <rect x={Math.min(draft.a.x, draft.b.x)} y={Math.min(draft.a.y, draft.b.y)} width={w} height={h} fill={tool === 'redact' ? 'rgba(0,0,0,0.6)' : 'rgba(99,102,241,0.15)'} stroke="#4f46e5" strokeWidth={2} strokeDasharray="5 3" />;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('shapes.title')}</h1>
      <p className="text-sm text-slate-500">{t('shapes.hint')}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} subtitleKey="dropSubtitlePdf" onFiles={(f) => open(f[0])} />
      {error && <p className="animate-enter text-sm text-red-500 dark:text-red-400">{error}</p>}
      {busy && !img && <div className="aspect-[3/4] animate-pulse rounded-2xl bg-slate-200 sm:aspect-[4/3] dark:bg-slate-800" />}

      {img && vp && (
        <>
          <div className="space-y-2 rounded-2xl border bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <button onClick={() => gotoPage(page - 1)} disabled={page === 0 || busy} aria-label={t('moveUp') as string} className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg bg-slate-100 text-lg disabled:opacity-40 dark:bg-slate-800">←</button>
                <span className="min-w-[64px] px-1 text-center text-sm font-semibold">{page + 1} / {pageCount}</span>
                <button onClick={() => gotoPage(page + 1)} disabled={page >= pageCount - 1 || busy} aria-label={t('moveDown') as string} className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg bg-slate-100 text-lg disabled:opacity-40 dark:bg-slate-800">→</button>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => changeZoom(zoom - 0.5)} disabled={busy || zoom <= 1} aria-label="−" className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg bg-slate-100 text-lg disabled:opacity-40 dark:bg-slate-800">−</button>
                <span className="min-w-[52px] text-center text-sm font-semibold">{Math.round(zoom * 100)}%</span>
                <button onClick={() => changeZoom(zoom + 0.5)} disabled={busy || zoom >= 2.5} aria-label="+" className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg bg-slate-100 text-lg disabled:opacity-40 dark:bg-slate-800">+</button>
              </div>
              <button onClick={undo} disabled={(shapes[page]?.length ?? 0) === 0} aria-label={t('shapes.undo') as string} title={t('shapes.undo') as string} className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg bg-slate-100 transition-colors disabled:opacity-40 dark:bg-slate-800">
                <Undo2 className="h-4 w-4" />
              </button>
              <button onClick={clearPage} disabled={(shapes[page]?.length ?? 0) === 0} aria-label={t('shapes.clear') as string} title={t('shapes.clear') as string} className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg bg-slate-100 transition-colors disabled:opacity-40 dark:bg-slate-800">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {TOOLS.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTool(id)}
                  title={t(`shapes.tool_${id}`) as string}
                  aria-label={t(`shapes.tool_${id}`) as string}
                  aria-pressed={tool === id}
                  className={cn('grid min-h-[44px] min-w-[44px] place-items-center rounded-xl transition-colors', tool === id ? 'bg-indigo-600 text-white' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800')}
                >
                  <Icon className="h-5 w-5" />
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                {COLORS.map(({ name, c }) => (
                  <button
                    key={name}
                    onClick={() => setColor(c)}
                    aria-label={t(`shapes.color_${name}`) as string}
                    title={t(`shapes.color_${name}`) as string}
                    aria-pressed={color === c}
                    className={cn('h-9 w-9 rounded-full border-[3px] transition', color === c ? 'border-indigo-600' : 'border-slate-200 dark:border-slate-700')}
                    style={{ backgroundColor: `rgb(${c.r * 255},${c.g * 255},${c.b * 255})` }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1 text-sm">
                {[2, 4, 6].map((w) => (
                  <button key={w} onClick={() => setWidth(w)} aria-pressed={width === w} className={cn('min-h-[40px] rounded-lg px-3 py-1 transition-colors', width === w ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800')}>{w}</button>
                ))}
              </div>
              <span className="w-full text-xs text-slate-500 sm:w-auto">
                {t(`shapes.tool_${tool}`)} · {t(`shapes.color_${COLORS.find((x) => x.c === color)?.name ?? 'red'}`)} · {width}
              </span>
            </div>
            <button onClick={apply} disabled={busy || totalShapes === 0} className="min-h-[48px] w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50">
              {busy ? t('processing') : t('shapes.apply', { n: totalShapes })}
            </button>
          </div>

          {tool === 'redact' && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">{t('shapes.redactNote')}</p>
          )}

          <div ref={scrollRef} className="thin-scroll overflow-auto rounded-xl border dark:border-slate-800">
            <div ref={boxRef} className="relative mx-auto touch-none select-none" style={{ width: vp.w * dzoom }}>
              <img src={img} alt={`page ${page + 1}`} draggable={false} className="block w-full" />
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox={`0 0 ${vp.w} ${vp.h}`}
                onPointerDown={onSvgDown}
                onPointerMove={onSvgMove}
                onPointerUp={onSvgUp}
                onPointerCancel={onSvgUp}
              >
                {(shapes[page] ?? []).map((s, i) => <g key={i}>{toSvg(s)}</g>)}
                {draftSvg()}
              </svg>
            </div>
          </div>
          {toast && <p className="animate-enter text-center text-xs text-slate-500">{toast}</p>}
        </>
      )}
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="shapes.pdf" />}
    </div>
  );
}
