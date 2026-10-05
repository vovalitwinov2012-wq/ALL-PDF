import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import JSZip from 'jszip';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dropzone } from '../../components/Dropzone';
import { FileChip } from '../../components/FileChip';
import { ResultCard } from '../../components/ResultCard';
import { parsePageRanges, isTooBig, downloadBytes } from '../../lib/utils';
import { splitPdf, loadPdf } from '../../features/pdf-core/pdfOps';
import { splitEvery } from '../../features/pdf-core/pages';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Mode = 'extract' | 'delete' | 'rotate' | 'singles' | 'chunks';

interface PreviewThumb {
  url: string;
  n: number;
  kept: boolean;
  rotated: boolean;
}

interface Preview {
  thumbs: PreviewThumb[];
  parts: Array<{ from: number; to: number }>;
  keptCount: number;
  total: number;
}

const MAX_PREVIEW_THUMBS = 30;

export function SplitPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('extract');
  const [ranges, setRanges] = useState('1-3');
  const [chunkN, setChunkN] = useState(5);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [resultName, setResultName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checked, setChecked] = useState(false);

  const multi = mode === 'singles' || mode === 'chunks';

  const touch = () => {
    setResult(null);
    setPreview(null);
    setChecked(false);
  };

  const pickFile = (f: File[]) => {
    const f0 = f[0];
    if (!f0) return;
    if (isTooBig(f0)) return setError(t('fileTooBig') as string);
    setError(null);
    setFile(f0);
    touch();
  };

  // «Проверить»: считаем, что получится, и показываем миниатюры — без создания файла
  const check = async () => {
    if (!file || checking) return;
    setChecking(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const count = (await loadPdf(bytes)).getPageCount();
      if (multi) {
        const size = mode === 'singles' ? 1 : Math.max(1, chunkN);
        const parts: Array<{ from: number; to: number }> = [];
        for (let s = 0; s < count; s += size) {
          parts.push({ from: s + 1, to: Math.min(count, s + size) });
        }
        setPreview({ thumbs: [], parts, keptCount: count, total: count });
        setChecked(true);
        return;
      }
      const idx = mode === 'rotate' ? [] : parsePageRanges(ranges, count);
      if (mode !== 'rotate' && idx.length === 0) {
        return setError(t('splitPage.empty') as string);
      }
      const keepSet = new Set(idx);
      const n = Math.min(count, MAX_PREVIEW_THUMBS);
      const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
      try {
        const thumbs: PreviewThumb[] = [];
        for (let p = 1; p <= n; p++) {
          const page = await pdf.getPage(p);
          const viewport = page.getViewport({ scale: 0.5 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
          const kept = mode === 'rotate' ? true : mode === 'extract' ? keepSet.has(p - 1) : !keepSet.has(p - 1);
          thumbs.push({ url: canvas.toDataURL('image/jpeg', 0.7), n: p, kept, rotated: mode === 'rotate' });
        }
        const keptCount = mode === 'rotate' ? count : mode === 'extract' ? idx.length : count - idx.length;
        setPreview({ thumbs, parts: [], keptCount, total: count });
        setChecked(true);
      } finally {
        await pdf.destroy().catch(() => undefined);
      }
    } catch {
      setError(t('failed') as string);
    } finally {
      setChecking(false);
    }
  };

  const run = async () => {
    if (!file) return setError(t('needFiles') as string);
    if (!checked) return setError(t('splitPage.checkFirst') as string);
    setBusy(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (multi) {
        const parts = await splitEvery(bytes, mode === 'singles' ? 1 : Math.max(1, chunkN));
        const zip = new JSZip();
        const base = file.name.replace(/\.pdf$/i, '');
        parts.forEach((p, i) => zip.file(`${base}-part${i + 1}.pdf`, p));
        const blob = await zip.generateAsync({ type: 'blob' });
        const zipBytes = new Uint8Array(await blob.arrayBuffer());
        const zipName = `${base}-split.zip`;
        downloadBytes(zipBytes, zipName, 'application/zip');
        setResult(zipBytes);
        setResultName(zipName);
      } else {
        const doc = await loadPdf(bytes);
        const idx = parsePageRanges(ranges, doc.getPageCount());
        setResult(await splitPdf(bytes, mode, idx));
        setResultName(`${file.name.replace(/\.pdf$/i, '')}-${mode}.pdf`);
      }
    } catch (e) {
      setError(t((e as Error).message === 'empty-result' ? 'splitPage.empty' : 'failed') as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('splitPage.title')}</h1>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} subtitleKey="dropSubtitlePdf" onFiles={pickFile} />
      {file && <FileChip name={file.name} disabled={busy} onRemove={() => { setFile(null); setResult(null); setError(null); touch(); }} />}
      <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="text-sm font-semibold">{t('splitPage.mode')}</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['extract', 'delete', 'rotate', 'singles', 'chunks'] as const).map((m) => (
            <button key={m} disabled={busy} aria-pressed={mode === m} onClick={() => { setMode(m); touch(); setError(null); }}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-40 ${mode === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
              {t(`splitPage.${m}`) as string}
            </button>
          ))}
        </div>
        {mode !== 'rotate' && !multi && (
          <input value={ranges} disabled={busy} onChange={(e) => { setRanges(e.target.value); touch(); }} placeholder={t('rangesPh') as string}
            className="mt-3 w-full rounded-xl border px-3 py-2 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800" />
        )}
        {mode === 'chunks' && (
          <label className="mt-3 block text-sm">
            {t('splitPage.everyN')}
            <input type="number" min={1} value={chunkN} disabled={busy} onChange={(e) => { setChunkN(Math.max(1, Number(e.target.value) || 1)); touch(); }}
              className="ml-2 w-24 rounded-xl border px-3 py-1.5 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800" />
          </label>
        )}
        {multi && <p className="mt-2 text-xs text-slate-500">{t('splitPage.zipNote')}</p>}

        {preview && (
          <div className="animate-enter mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
            <p className="text-sm font-semibold">
              {t('splitPage.previewTitle')} · {t('splitPage.previewSummary', { kept: preview.keptCount, total: preview.total })}
            </p>
            {preview.thumbs.length > 0 && (
              <div className="thin-scroll mt-2 flex gap-2 overflow-x-auto pb-1">
                {preview.thumbs.map((th) => (
                  <figure key={th.n} className={`relative w-20 shrink-0 overflow-hidden rounded-lg border-2 ${th.kept ? 'border-emerald-500' : 'border-red-400 opacity-40 grayscale'}`}>
                    <img src={th.url} alt={`page ${th.n}`} className="block w-full" loading="lazy" style={th.rotated ? { transform: 'rotate(90deg) scale(0.62)' } : undefined} />
                    <figcaption className={`absolute bottom-0 left-0 right-0 py-0.5 text-center text-[11px] font-bold text-white ${th.kept ? 'bg-emerald-600/90' : 'bg-red-600/90'}`}>
                      {th.n} {th.kept ? '✓' : '✕'}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
            {preview.parts.length > 0 && (
              <ul className="thin-scroll mt-2 max-h-40 space-y-1 overflow-auto text-sm">
                {preview.parts.map((pt, i) => (
                  <li key={i} className="rounded-lg bg-white px-3 py-1.5 dark:bg-slate-900">
                    {t('splitPage.partLabel', { n: i + 1, from: pt.from, to: pt.to })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={check} disabled={checking || busy || !file} className="min-h-[48px] rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-slate-300 active:scale-[0.99] disabled:opacity-50 dark:bg-slate-800 dark:hover:bg-slate-700">
            {checking ? t('processing') : t('splitPage.check')}
          </button>
          <button onClick={run} disabled={busy || !file || !checked} className="min-h-[48px] rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50">
            {busy ? t('processing') : t('splitPage.do')}
          </button>
        </div>
        {!checked && file && <p className="mt-2 text-xs text-slate-500">{t('splitPage.checkHint')}</p>}
        {error && <p className="animate-enter mt-2 text-sm text-red-500 dark:text-red-400">{error}</p>}
      </div>
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName={resultName || `${mode}.pdf`} mime={resultName.endsWith('.zip') ? 'application/zip' : 'application/pdf'} />}
    </div>
  );
}
