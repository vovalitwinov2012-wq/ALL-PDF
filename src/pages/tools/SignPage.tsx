import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dropzone } from '../../components/Dropzone';
import { FileChip } from '../../components/FileChip';
import { ResultCard } from '../../components/ResultCard';
import { placeSignature } from '../../features/pdf-core/pdfOps';
import { loadPdf } from '../../features/pdf-core/pdfOps';
import { isTooBig } from '../../lib/utils';
import { cn } from '../../lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

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
  const [sigUrl, setSigUrl] = useState('');
  const [pos, setPos] = useState<'bl' | 'br' | 'tl' | 'tr'>('br');
  const [sigScale, setSigScale] = useState(1);
  const [pagePrev, setPagePrev] = useState<{ url: string; wPt: number; hPt: number } | null>(null);
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

  const syncSigUrl = () => {
    const c = canvasRef.current;
    if (c) setSigUrl(strokesRef.current.length > 0 ? c.toDataURL('image/png') : '');
  };

  const clear = () => {
    strokesRef.current = [];
    curRef.current = null;
    setHasInk(false);
    setResult(null);
    redraw();
    setSigUrl('');
  };

  const undo = () => {
    strokesRef.current.pop();
    setHasInk(strokesRef.current.length > 0);
    setResult(null);
    redraw();
    syncSigUrl();
  };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    if (isTooBig(f)) {
      setFile(null);
      setPagePrev(null);
      return setError(t('fileTooBig') as string);
    }
    setError(null);
    setFile(f);
    setResult(null);
    setPagePrev(null);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const count = (await loadPdf(bytes)).getPageCount();
      const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
      const pdfPage = await pdf.getPage(count);
      const wPt = pdfPage.view[2] - pdfPage.view[0];
      const hPt = pdfPage.view[3] - pdfPage.view[1];
      const scale = Math.min(1.2, 480 / wPt);
      const viewport = pdfPage.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await pdfPage.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      setPagePrev({ url: canvas.toDataURL('image/jpeg', 0.8), wPt, hPt });
    } catch {
      setPagePrev(null);
    }
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
      const h = pos === 'bl' || pos === 'tl' ? 'left' : 'right';
      const v = pos === 'tl' || pos === 'tr' ? 'top' : 'bottom';
      setResult(await placeSignature(pdfBytes, png, { h, v, scale: sigScale }));
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  // Позиция оверлея в превью — та же геометрия, что в placeSignature (поля 40/60pt)
  const overlayStyle = (): React.CSSProperties | null => {
    if (!pagePrev || !sigUrl) return null;
    const { wPt, hPt } = pagePrev;
    const wPct = Math.min(90, ((180 * sigScale) / wPt) * 100);
    const style: React.CSSProperties = { width: `${wPct}%`, aspectRatio: `${CW} / ${CH}` };
    if (pos === 'br' || pos === 'tr') style.right = `${(40 / wPt) * 100}%`;
    else style.left = `${(40 / wPt) * 100}%`;
    if (pos === 'bl' || pos === 'br') style.bottom = `${(60 / hPt) * 100}%`;
    else style.top = `${(60 / hPt) * 100}%`;
    return style;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('signPage.title')}</h1>
      <p className="text-sm text-slate-500">{t('signPage.hint')}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} subtitleKey="dropSubtitlePdf" onFiles={(f) => pickFile(f[0])} />
      {file && <FileChip name={file.name} disabled={busy} onRemove={() => { setFile(null); setPagePrev(null); setResult(null); setError(null); }} />}
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
          onPointerUp={() => { setDrawing(false); curRef.current = null; syncSigUrl(); }}
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
      {pagePrev && (
        <div className="animate-enter rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-2 text-sm font-semibold">{t('signPage.preview')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">{t('signPage.position')}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(['tl', 'tr', 'bl', 'br'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPos(p)}
                    aria-pressed={pos === p}
                    className={cn(
                      'min-h-[40px] rounded-lg border px-2 text-xs font-semibold transition-colors dark:border-slate-700',
                      pos === p ? 'border-indigo-600 bg-indigo-600 text-white' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800'
                    )}
                  >
                    {t(`signPage.pos_${p}`)}
                  </button>
                ))}
              </div>
              <p className="mb-1 mt-3 text-xs font-semibold text-slate-500">{t('signPage.size')}</p>
              <div className="flex gap-1.5">
                {[0.7, 1, 1.4].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSigScale(s)}
                    aria-pressed={sigScale === s}
                    className={cn(
                      'min-h-[40px] flex-1 rounded-lg text-xs font-semibold transition-colors',
                      sigScale === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'
                    )}
                  >
                    ×{s}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[240px] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800" style={{ aspectRatio: `${pagePrev.wPt} / ${pagePrev.hPt}` }}>
              <img src={pagePrev.url} alt="last page" className="absolute inset-0 h-full w-full" />
              {overlayStyle() && (
                <img src={sigUrl} alt="" className="absolute" style={overlayStyle()!} />
              )}
            </div>
          </div>
        </div>
      )}
      {error && <p className="animate-enter text-sm text-red-500 dark:text-red-400">{error}</p>}
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="signed.pdf" />}
    </div>
  );
}
