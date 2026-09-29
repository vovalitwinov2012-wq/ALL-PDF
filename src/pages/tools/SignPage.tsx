import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropzone } from '../../components/Dropzone';
import { ResultCard } from '../../components/ResultCard';
import { placeSignature } from '../../features/pdf-core/pdfOps';
import { isTooBig } from '../../lib/utils';

const CW = 640;
const CH = 260;
const INK = '#1e1b4b';

interface Stroke {
  pts: Array<{ x: number; y: number }>;
  w: number;
}

export function SignPage() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const curRef = useRef<Stroke | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [lineW, setLineW] = useState(4);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);

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

  const redraw = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of strokesRef.current) paintStroke(ctx, s);
  };

  const clear = () => {
    strokesRef.current = [];
    curRef.current = null;
    setHasInk(false);
    setResult(null);
    redraw();
  };

  const undo = () => {
    strokesRef.current.pop();
    setHasInk(strokesRef.current.length > 0);
    setResult(null);
    redraw();
  };

  const place = async () => {
    if (!file || !canvasRef.current) return;
    setError(null);
    if (!hasInk) return setError(t('signPage.drawFirst') as string);
    setBusy(true);
    try {
      const blob: Blob = await new Promise((res, rej) =>
        canvasRef.current!.toBlob((b) => (b ? res(b) : rej(new Error('encode-failed'))), 'image/png')
      );
      const png = new Uint8Array(await blob.arrayBuffer());
      const pdfBytes = new Uint8Array(await file.arrayBuffer());
      setResult(await placeSignature(pdfBytes, png));
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('signPage.title')}</h1>
      <p className="text-sm text-slate-500">{t('signPage.hint')}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} subtitleKey="dropSubtitlePdf" onFiles={(f) => {
        const f0 = f[0];
        if (!f0) return;
        if (isTooBig(f0)) return setError(t('fileTooBig') as string);
        setError(null);
        setFile(f0);
        setResult(null);
      }} />
      {file && (
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
          <span className="min-w-0 flex-1 truncate">📄 {file.name}</span>
          <button onClick={() => { setFile(null); setResult(null); setError(null); }} disabled={busy} aria-label={t('remove') as string} className="grid min-h-[36px] min-w-[36px] shrink-0 place-items-center rounded-lg text-slate-400 hover:text-red-500 disabled:opacity-30">✕</button>
        </div>
      )}
      <div>
        <p className="mb-1 text-sm font-semibold">{t('signPage.drawHere')}</p>
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          className="h-52 w-full touch-none rounded-2xl border-2 border-dashed border-indigo-300 bg-white sm:h-60 dark:border-indigo-700"
          onPointerDown={(e) => {
            setDrawing(true);
            setResult(null);
            setError(null);
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
      <div className="flex flex-wrap items-center gap-2">
        {[3, 5, 8].map((w) => (
          <button key={w} onClick={() => setLineW(w)} aria-pressed={lineW === w}
            className={`min-h-[40px] rounded-xl px-3 py-1 text-sm font-semibold transition-colors ${lineW === w ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}>
            {t('signPage.lineW', { n: w })}
          </button>
        ))}
        <button onClick={undo} disabled={!hasInk} className="min-h-[40px] rounded-xl bg-slate-200 px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 dark:bg-slate-800">{t('signPage.undo')}</button>
        <button onClick={clear} disabled={!hasInk} className="min-h-[40px] rounded-xl bg-slate-200 px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 dark:bg-slate-800">{t('signPage.clearSign')}</button>
      </div>
      <button onClick={place} disabled={!file || !hasInk || busy} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50">
        {busy ? t('processing') : t('signPage.place')}
      </button>
      {error && <p className="animate-enter text-sm text-red-500">{error}</p>}
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="signed.pdf" />}
    </div>
  );
}
