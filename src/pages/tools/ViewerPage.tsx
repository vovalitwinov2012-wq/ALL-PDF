import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dropzone } from '../../components/Dropzone';
import { FileChip } from '../../components/FileChip';
import { ProgressBar } from '../../components/ProgressBar';
import { PdfOverlay, OverlayPageData } from '../../components/PdfOverlay';
import { isTooBig } from '../../lib/utils';
import { wordsToFractions } from '../../lib/pageWords';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PAGES = 50;
const RENDER_SCALE = 2;

export function ViewerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<OverlayPageData[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const openSeq = useRef(0);

  const open = async (f: File | undefined) => {
    if (!f) return;
    if (isTooBig(f)) {
      setFile(null);
      setPages([]);
      return setError(t('fileTooBig') as string);
    }
    const seq = ++openSeq.current;
    setFile(f);
    setBusy(true);
    setError(null);
    setProgress([0, 1]);
    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      if (openSeq.current !== seq) return; // пока грузился, файл убрали или выбрали другой
      const n = Math.min(pdf.numPages, MAX_PAGES);
      setTruncated(pdf.numPages > MAX_PAGES);
      setProgress([0, n]);
      const out: OverlayPageData[] = [];
      for (let p = 1; p <= n; p++) {
        if (openSeq.current !== seq) return;
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        const words = await wordsToFractions(page, viewport, canvas.width, canvas.height);
        out.push({
          url: canvas.toDataURL('image/jpeg', 0.85),
          aspect: canvas.width / canvas.height,
          words,
          label: `page ${p}`
        });
        setProgress([p, n]);
      }
      if (openSeq.current !== seq) return;
      setPages(out);
      setOverlayOpen(true);
    } catch {
      if (openSeq.current !== seq) return;
      setPages([]);
      setError(t('failed') as string);
    } finally {
      if (openSeq.current === seq) {
        setBusy(false);
        setProgress(null);
      }
    }
  };

  const close = () => {
    openSeq.current++; // отменяем летящую загрузку: призраков не будет
    setBusy(false);
    setProgress(null);
    setFile(null);
    setPages([]);
    setTruncated(false);
    setError(null);
    setOverlayOpen(false);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('viewerPage.title')}</h1>
      <p className="text-xs text-slate-500">{t('viewerPage.hint', { n: MAX_PAGES })}</p>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} subtitleKey="dropSubtitlePdf" onFiles={(f) => open(f[0])} />
      {error && <p className="animate-enter text-sm text-red-500 dark:text-red-400">{error}</p>}
      {file && <FileChip name={file.name} disabled={busy} onRemove={close} />}
      {busy && progress && <ProgressBar value={progress[0] / Math.max(1, progress[1])} label={`${t('processing')} ${progress[0]}/${progress[1]}`} />}
      {truncated && <p className="text-sm text-amber-600 dark:text-amber-400">{t('viewerPage.truncated', { n: MAX_PAGES })}</p>}
      {pages.length > 0 && !busy && (
        <button
          onClick={() => setOverlayOpen(true)}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99]"
        >
          <BookOpen className="h-5 w-5" /> {t('viewerPage.openViewer')} · {pages.length}
        </button>
      )}
      {overlayOpen && pages.length > 0 && (
        <PdfOverlay
          title={file?.name ?? (t('viewerPage.title') as string)}
          pages={pages}
          onClose={() => setOverlayOpen(false)}
          onNeedOcr={() => { setOverlayOpen(false); navigate('/ocr'); }}
        />
      )}
    </div>
  );
}
