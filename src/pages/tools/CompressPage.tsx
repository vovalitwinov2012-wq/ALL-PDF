import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dropzone } from '../../components/Dropzone';
import { FileChip } from '../../components/FileChip';
import { ResultCard } from '../../components/ResultCard';
import { formatBytes, isTooBig } from '../../lib/utils';
import { loadSetting, saveSetting } from '../../lib/settings';
import { compressPdf } from '../../features/pdf-core/pdfOps';
import { recompressPdf } from '../../features/pdf-core/pages';
import { jpegTranscode, rawTranscode } from '../../lib/compressImage';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

function deltaText(before: number, after: number): string {
  const p = Math.round((1 - after / before) * 100);
  return (p >= 0 ? '−' : '+') + Math.abs(p) + '%';
}

// Сила 1..100 → параметры движка. До 30 — только честное сжатие без потерь.
function paramsFor(strength: number): { quality: number; maxDim: number; pngToJpeg: boolean; losslessOnly: boolean } {
  if (strength <= 30) return { quality: 0.92, maxDim: 4000, pngToJpeg: false, losslessOnly: true };
  const k = (strength - 31) / 69;
  return {
    quality: 0.92 - k * 0.57,
    maxDim: strength < 60 ? 2500 : 1800,
    pngToJpeg: strength >= 50,
    losslessOnly: false
  };
}

async function renderFirstPage(bytes: Uint8Array): Promise<string | null> {
  try {
    const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    try {
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      return canvas.toDataURL('image/jpeg', 0.8);
    } finally {
      await pdf.destroy().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

export function CompressPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [strength, setStrengthState] = useState(() => {
    const s = loadSetting('compress.strength', 55);
    return typeof s === 'number' && s >= 1 && s <= 100 ? Math.round(s) : 55;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [shots, setShots] = useState<{ before: string; after: string } | null>(null);

  const setStrength = (s: number) => {
    const v = Math.min(100, Math.max(1, Math.round(s)));
    setStrengthState(v);
    saveSetting('compress.strength', v);
    setResult(null);
    setShots(null);
    setNote('');
  };

  const levelKey = strength <= 30 ? 'levelMild' : strength <= 70 ? 'levelMid' : 'levelStrong';

  const run = async () => {
    if (!file) return setError(t('needFiles') as string);
    setBusy(true);
    setError(null);
    setNote('');
    try {
      const raw = new Uint8Array(await file.arrayBuffer());
      const params = paramsFor(strength);
      // Шаг 1: честное сжатие без потерь — всегда
      const base = await compressPdf(raw);
      let out = base;
      if (!params.losslessOnly) {
        const { data, report } = await recompressPdf(
          base,
          { quality: params.quality, maxDim: params.maxDim, pngToJpeg: params.pngToJpeg },
          { jpeg: jpegTranscode, raw: rawTranscode }
        );
        out = data;
        if (report.processed > 0) {
          setNote(t('compressPage.recompressed', { n: report.processed }) as string);
        } else {
          setNote(t('compressPage.nothingToCompress') as string);
        }
      }
      setResult(out);
      const beforeUrl = await renderFirstPage(raw);
      const afterUrl = await renderFirstPage(out);
      if (beforeUrl && afterUrl) setShots({ before: beforeUrl, after: afterUrl });
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('compressPage.title')}</h1>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} subtitleKey="dropSubtitlePdf" onFiles={(f) => {
        const f0 = f[0];
        if (!f0) return;
        if (isTooBig(f0)) return setError(t('fileTooBig') as string);
        setError(null);
        setFile(f0);
        setResult(null);
        setShots(null);
        setNote('');
      }} />
      {error && <p className="animate-enter text-sm text-red-500 dark:text-red-400">{error}</p>}
      {file && <FileChip name={file.name} meta={formatBytes(file.size)} disabled={busy} onRemove={() => { setFile(null); setResult(null); setShots(null); setError(null); setNote(''); }} />}

      {file && (
        <div className="animate-enter space-y-3 rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">{t('compressPage.level')}</span>
            <span className="rounded-lg bg-indigo-100 px-2.5 py-1 text-sm font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{strength}%</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'presetLight', v: 15 },
              { key: 'presetMedium', v: 55 },
              { key: 'presetStrong', v: 85 }
            ] as const).map((p) => (
              <button
                key={p.key}
                disabled={busy}
                aria-pressed={strength === p.v}
                onClick={() => setStrength(p.v)}
                className={`min-h-[40px] flex-1 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 ${strength === p.v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
              >
                {t(`compressPage.${p.key}`)}
              </button>
            ))}
          </div>
          <input
            type="range" min={1} max={100} value={strength} disabled={busy}
            onChange={(e) => setStrength(Number(e.target.value))}
            aria-label={t('compressPage.level') as string}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>1% · {t('compressPage.scaleMin')}</span>
            <span>{t('compressPage.scaleMax')} · 100%</span>
          </div>
          <p className="animate-enter rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200" key={levelKey}>
            {t(`compressPage.${levelKey}`)}
          </p>
        </div>
      )}

      <button onClick={run} disabled={!file || busy} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50">
        {busy ? t('processing') : t('compressPage.do')}
      </button>
      {note && <p className="animate-enter text-sm text-slate-600 dark:text-slate-300">{note}</p>}
      {file && result && (
        <div className="animate-enter rounded-2xl border bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          {t('was')}: <b>{formatBytes(file.size)}</b> → {t('became')}: <b>{formatBytes(result.length)}</b> ({deltaText(file.size, result.length)})
        </div>
      )}
      {shots && (
        <div className="animate-enter grid grid-cols-2 gap-3">
          {([['before', shots.before], ['after', shots.after]] as const).map(([k, url]) => (
            <figure key={k} className="overflow-hidden rounded-xl border bg-white dark:border-slate-800 dark:bg-slate-900">
              <img src={url} alt={k} className="block w-full" loading="lazy" />
              <figcaption className="p-1.5 text-center text-xs font-semibold text-slate-500">{t(`compressPage.${k}`)}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {file && result && result.length >= file.size && (
        <p className="animate-enter text-sm text-amber-600 dark:text-amber-400">{t('compressPage.grew')}</p>
      )}
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="compressed.pdf" />}
    </div>
  );
}
