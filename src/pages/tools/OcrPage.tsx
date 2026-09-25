import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dropzone } from '../../components/Dropzone';
import { FileList } from '../../components/FileList';
import { downloadBytes, isTooBig } from '../../lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface OcrResult {
  name: string;
  text: string;
}

const MAX_OCR_PAGES = 10;
const MAX_IMAGES = 20;

async function pdfPagesToImages(file: File): Promise<Array<{ name: string; blob: Blob }>> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const n = Math.min(pdf.numPages, MAX_OCR_PAGES);
  const out: Array<{ name: string; blob: Blob }> = [];
  for (let p = 1; p <= n; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('canvas-empty'))), 'image/png')
    );
    out.push({ name: `${file.name} — стр. ${p}`, blob });
  }
  return out;
}

export function OcrPage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [lang, setLang] = useState<'rus' | 'eng' | 'both'>('rus');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<OcrResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const add = (f: File[]) => {
    setError(null);
    setNote('');
    setResults([]);
    const ok = f.filter((x) => !isTooBig(x));
    const merged = [...files, ...ok].slice(0, MAX_OCR_PAGES);
    if ([...files, ...ok].length > MAX_OCR_PAGES || ok.length < f.length) {
      setNote(t('ocr.capped', { n: MAX_OCR_PAGES }) as string);
    }
    setFiles(merged);
  };

  const run = async () => {
    setError(null);
    setResults([]);
    if (files.length === 0) return setError(t('needFiles') as string);
    setBusy(true);
    setProgress(0);
    try {
      const { createWorker } = await import('tesseract.js');
      const langs = lang === 'both' ? ['rus', 'eng'] : [lang];
      setStatus(t('ocr.loading') as string);
      const worker = await createWorker(langs, undefined, {
        logger: (m: { status: string; progress: number }) => {
          if (typeof m.progress === 'number') setProgress(m.progress);
          setStatus(m.status);
        }
      });

      // Собираем картинки: фото напрямую, PDF постранично
      let images: Array<{ name: string; blob: Blob }> = [];
      for (const f of files.slice(0, MAX_OCR_PAGES)) {
        if (f.type === 'application/pdf') {
          images.push(...(await pdfPagesToImages(f)));
        } else {
          images.push({ name: f.name, blob: f });
        }
      }
      if (images.length > MAX_IMAGES) {
        images = images.slice(0, MAX_IMAGES);
        setNote(t('ocr.capped', { n: MAX_IMAGES }) as string);
      }

      const out: OcrResult[] = [];
      try {
        for (let i = 0; i < images.length; i++) {
          setStatus(`${t('ocr.recognizing')} ${i + 1}/${images.length}`);
          const url = URL.createObjectURL(images[i].blob);
          try {
            const { data } = await worker.recognize(url);
            out.push({ name: images[i].name, text: data.text.trim() });
          } finally {
            URL.revokeObjectURL(url);
          }
          setResults([...out]);
        }
      } finally {
        await worker.terminate();
      }
      setStatus('');
    } catch {
      setError(t('ocr.failed') as string);
    } finally {
      setBusy(false);
    }
  };

  const downloadAll = () => {
    const text = results.map((r) => `===== ${r.name} =====\n${r.text}`).join('\n\n');
    downloadBytes(new TextEncoder().encode(text), 'ocr-result.txt', 'text/plain');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('ocr.title')}</h1>
      <p className="text-sm text-slate-500">{t('ocr.hint')}</p>

      <Dropzone
        accept={{ 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp'] }}
        onFiles={add}
      />
      {note && <p className="text-sm text-amber-600">{note}</p>}
      <FileList files={files} onRemove={(i) => setFiles((p) => p.filter((_, x) => x !== i))} onClear={() => { setFiles([]); setResults([]); }} />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <span className="text-sm font-semibold">{t('ocr.language')}:</span>
        {(['rus', 'eng', 'both'] as const).map((l) => (
          <button
            key={l}
            onClick={() => { setLang(l); setResults([]); }}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${lang === l ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
          >
            {t(`ocr.${l}`) as string}
          </button>
        ))}
        <button onClick={run} disabled={busy} className="ml-auto rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? t('processing') : t('ocr.do')}
        </button>
      </div>

      {busy && (
        <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">{status}</p>
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {results.length > 0 && (
        <div className="space-y-3 rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{t('ready')} · {results.length}</span>
            <button onClick={downloadAll} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">
              {t('download')} .txt
            </button>
          </div>
          {results.map((r, i) => (
            <details key={i} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800" open={i === 0}>
              <summary className="cursor-pointer font-semibold">{r.name}</summary>
              <p className="mt-2 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{r.text || '—'}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
