import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropzone } from '../../components/Dropzone';
import { ResultCard } from '../../components/ResultCard';
import { placeSignature } from '../../features/pdf-core/pdfOps';

export function SignPage() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  };

  const isBlank = () => {
    const c = canvasRef.current!;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] !== 0) return false;
    }
    return true;
  };

  const place = async () => {
    if (!file || !canvasRef.current) return;
    setError(null);
    if (isBlank()) return setError(t('signPage.drawFirst') as string);
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
      <canvas
        ref={canvasRef}
        width={640}
        height={220}
        className="w-full touch-none rounded-2xl border-2 border-dashed border-indigo-300 bg-white dark:bg-slate-900"
        onPointerDown={(e) => { setDrawing(true); (e.target as HTMLElement).setPointerCapture(e.pointerId); const p = pos(e); canvasRef.current!.getContext('2d')!.beginPath(); canvasRef.current!.getContext('2d')!.moveTo((p.x / canvasRef.current!.getBoundingClientRect().width) * 640, (p.y / canvasRef.current!.getBoundingClientRect().height) * 220); }}
        onPointerMove={(e) => {
          if (!drawing) return;
          const ctx = canvasRef.current!.getContext('2d')!;
          ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#1e1b4b';
          const p = pos(e);
          ctx.lineTo((p.x / canvasRef.current!.getBoundingClientRect().width) * 640, (p.y / canvasRef.current!.getBoundingClientRect().height) * 220);
          ctx.stroke();
        }}
        onPointerUp={() => setDrawing(false)}
        onPointerCancel={() => setDrawing(false)}
        onPointerLeave={() => setDrawing(false)}
      />
      <div className="flex gap-2">
        <button onClick={clear} className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold dark:bg-slate-800">{t('signPage.clearSign')}</button>
      </div>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} onFiles={(f) => { setFile(f[0]); setResult(null); }} />
      <button onClick={place} disabled={!file || busy} className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">
        {busy ? t('processing') : t('signPage.place')}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="signed.pdf" />}
    </div>
  );
}
