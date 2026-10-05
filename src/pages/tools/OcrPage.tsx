import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dropzone } from '../../components/Dropzone';
import { FileList } from '../../components/FileList';
import { ProgressBar } from '../../components/ProgressBar';
import { ResultCard } from '../../components/ResultCard';
import { downloadBytes, isTooBig } from '../../lib/utils';
import { loadSetting, saveSetting } from '../../lib/settings';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface OcrResult {
  name: string;
  text: string;
}

const MAX_OCR_PAGES = 10;
const MAX_IMAGES = 20;

// Часть браузеров отдает пустой file.type — определяем PDF и по расширению
function isPdfFile(f: File): boolean {
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
}

function mapStatus(t: (k: string) => unknown, s: string): string {
  if (s.includes('language')) return t('ocr.stLang') as string;
  if (s.includes('initializing') || s.includes('initialized') || s.includes('loaded')) return t('ocr.stInit') as string;
  if (s.includes('recognizing')) return t('ocr.recognizing') as string;
  return t('ocr.stCore') as string;
}

async function pdfPagesToImages(file: File): Promise<Array<{ name: string; blob: Blob }>> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  try {
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
  } finally {
    await pdf.destroy().catch(() => undefined);
  }
}

export function OcrPage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [lang, setLang] = useState<'rus' | 'eng' | 'both'>(() => loadSetting('ocr.lang', 'rus' as const));
  const [outMode, setOutMode] = useState<'txt' | 'pdf'>(() => loadSetting('ocr.outMode', 'txt' as const));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<OcrResult[]>([]);
  const [pdfResult, setPdfResult] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [stopped, setStopped] = useState(false);
  const cancelRef = useRef(false);
  const workerRef = useRef<{ terminate: () => Promise<unknown> } | null>(null);
  const pdfPartsRef = useRef<Uint8Array[]>([]);
  const doneRef = useRef(0);
  const runKeyRef = useRef('');

  const clearResults = () => {
    setError(null);
    setNote('');
    setStopped(false);
    setResults([]);
    setPdfResult(null);
    pdfPartsRef.current = [];
    doneRef.current = 0;
    runKeyRef.current = '';
  };

  const runKey = () =>
    files.map((f) => `${f.name}:${f.size}`).join('|') + `#${lang}#${outMode}`;

  const add = (f: File[]) => {
    setError(null);
    setNote('');
    setResults([]);
    setPdfResult(null);
    const ok = f.filter((x) => !isTooBig(x));
    const merged = [...files, ...ok].slice(0, MAX_OCR_PAGES);
    if ([...files, ...ok].length > MAX_OCR_PAGES || ok.length < f.length) {
      setNote(t('ocr.capped', { n: MAX_OCR_PAGES }) as string);
    }
    setFiles(merged);
  };

  const run = async (resume = false) => {
    if (files.length === 0) return setError(t('needFiles') as string);
    // Продолжение возможно только если файлы и настройки не менялись с остановки
    const canResume = resume && stopped && runKeyRef.current === runKey() && (results.length > 0 || pdfPartsRef.current.length > 0);
    // Порядок картинок детерминирован: пропускаем уже готовые
    const startIdx = canResume ? results.length + pdfPartsRef.current.length : 0;
    setError(null);
    if (!canResume) {
      setNote('');
      setResults([]);
      setPdfResult(null);
      pdfPartsRef.current = [];
    }
    setStopped(false);
    cancelRef.current = false;
    doneRef.current = canResume ? startIdx : 0;
    setBusy(true);
    setProgress(0);
    try {
      const { createWorker } = await import('tesseract.js');
      const langs = lang === 'both' ? ['rus', 'eng'] : [lang];
      setStatus(t('ocr.loading') as string);
      const worker = await createWorker(langs, undefined, {
        logger: (m: { status: string; progress: number }) => {
          if (cancelRef.current) return;
          if (m.status === 'recognizing text' && typeof m.progress === 'number') setProgress(m.progress);
          setStatus(mapStatus(t, m.status));
        }
      });
      workerRef.current = worker;

      // Собираем картинки: фото напрямую, PDF постранично
      setStatus(t('ocr.preparing') as string);
      let images: Array<{ name: string; blob: Blob }> = [];
      for (const f of files.slice(0, MAX_OCR_PAGES)) {
        if (cancelRef.current) break;
        if (isPdfFile(f)) {
          images.push(...(await pdfPagesToImages(f)));
        } else {
          images.push({ name: f.name, blob: f });
        }
      }
      if (images.length > MAX_IMAGES) {
        images = images.slice(0, MAX_IMAGES);
        setNote(t('ocr.capped', { n: MAX_IMAGES }) as string);
      }

      // При продолжении пропускаем уже готовые: порядок картинок детерминирован
      const out: OcrResult[] = canResume ? [...results] : [];
      const pdfParts: Uint8Array[] = canResume ? [...pdfPartsRef.current] : [];
      const wantPdf = outMode === 'pdf';
      try {
        for (let i = startIdx; i < images.length; i++) {
          if (cancelRef.current) break;
          setStatus(`${t('ocr.recognizing')} ${i + 1}/${images.length}`);
          const url = URL.createObjectURL(images[i].blob);
          try {
            const { data } = await worker.recognize(
              url,
              { pdfTitle: images[i].name },
              wantPdf ? { text: false, pdf: true } : undefined
            );
            if (wantPdf && data.pdf) pdfParts.push(new Uint8Array(data.pdf));
            else out.push({ name: images[i].name, text: data.text.trim() });
          } finally {
            URL.revokeObjectURL(url);
          }
          setResults([...out]);
          pdfPartsRef.current = [...pdfParts];
          doneRef.current = i + 1;
        }
      } finally {
        workerRef.current = null;
        try {
          await worker.terminate();
        } catch {
          // уже остановлен кнопкой «Отмена» — нормально
        }
      }
      runKeyRef.current = runKey();
      if (cancelRef.current) {
        setStopped(true);
        setStatus('');
        return;
      }
      if (wantPdf) {
        if (pdfParts.length === 0) throw new Error('no-pdf');
        const { mergePdfs } = await import('../../features/pdf-core/pdfOps');
        setPdfResult(await mergePdfs(pdfParts));
      }
      setStatus('');
    } catch {
      if (cancelRef.current) {
        // Остановлено кнопкой: частичные результаты сохраняем, ошибку не показываем
        runKeyRef.current = runKey();
        setStopped(true);
        setStatus('');
        return;
      }
      runKeyRef.current = runKey();
      // Частичные результаты уже на экране — предлагаем продолжить с места остановки
      setStopped(doneRef.current > 0);
      setError(t('ocr.failed') as string);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    cancelRef.current = true;
    setStatus(t('ocr.cancelling') as string);
    // Мгновенная остановка: убиваем воркер, recognize упадёт в catch выше
    try {
      await workerRef.current?.terminate();
    } catch {
      // воркер уже мёртв или ещё не создан
    }
    workerRef.current = null;
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
        disabled={busy}
        onFiles={add}
      />
      {note && <p className="animate-enter text-sm text-amber-600 dark:text-amber-400">{note}</p>}
      <FileList files={files} disabled={busy} onRemove={(i) => { setFiles((p) => p.filter((_, x) => x !== i)); clearResults(); }} onClear={() => { setFiles([]); clearResults(); }} />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <span className="text-sm font-semibold">{t('ocr.language')}:</span>
        {(['rus', 'eng', 'both'] as const).map((l) => (
          <button
            key={l}
            disabled={busy}
            aria-pressed={lang === l}
            onClick={() => { setLang(l); saveSetting('ocr.lang', l); clearResults(); }}
            className={`min-h-[40px] rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 ${lang === l ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
          >
            {t(`ocr.${l}`) as string}
          </button>
        ))}
        <button onClick={() => run()} disabled={busy || files.length === 0} className="min-h-[40px] rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 max-sm:w-full sm:ml-auto">
          {busy ? t('processing') : t('ocr.do')}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <span className="text-sm font-semibold">{t('ocr.output')}:</span>
        {(['txt', 'pdf'] as const).map((m) => (
          <button
            key={m}
            disabled={busy}
            aria-pressed={outMode === m}
            onClick={() => { setOutMode(m); saveSetting('ocr.outMode', m); clearResults(); }}
            className={`min-h-[40px] rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 ${outMode === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
          >
            {t(`ocr.out_${m}`) as string}
          </button>
        ))}
      </div>

      {busy && (
        <div className="animate-enter rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <ProgressBar value={progress} />
          <div className="mt-2 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-xs text-slate-500">{status}</p>
            <button onClick={cancel} className="min-h-[36px] shrink-0 rounded-xl bg-slate-100 px-3 text-xs font-semibold transition-colors dark:bg-slate-800">{t('ocr.cancel')}</button>
          </div>
        </div>
      )}
      {error && <p className="animate-enter text-sm text-red-500 dark:text-red-400">{error}</p>}
      {stopped && !busy && (
        <button onClick={() => run(true)} className="animate-enter min-h-[48px] w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 active:scale-[0.99]">
          {t('ocr.resume')}
        </button>
      )}
      {pdfResult && <ResultCard title={t('ready') as string} bytes={pdfResult} fileName="searchable.pdf" />}

      {results.length > 0 && (
        <div className="animate-enter space-y-3 rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t('ready')} · {results.length}</span>
            <button onClick={downloadAll} className="min-h-[40px] rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 active:scale-[0.98]">
              {t('download')} .txt
            </button>
          </div>
          {results.map((r, i) => (
            <details key={i} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800" open={i === 0}>
              <summary className="cursor-pointer truncate py-1 font-semibold" title={r.name}>{r.name}</summary>
              <p className="mt-2 break-words whitespace-pre-wrap text-slate-700 dark:text-slate-200">{r.text || '—'}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
