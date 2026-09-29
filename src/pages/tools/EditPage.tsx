import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { BookOpen } from 'lucide-react';
import { Dropzone } from '../../components/Dropzone';
import { FileChip } from '../../components/FileChip';
import { ResultCard } from '../../components/ResultCard';
import { PdfOverlay, OverlayPageData } from '../../components/PdfOverlay';
import { stampText, stampTextAt, setMetadata, loadPdf } from '../../features/pdf-core/pdfOps';
import { stampBates } from '../../features/pdf-core/pages';
import { isTooBig, downloadBytes } from '../../lib/utils';
import { loadSetting, saveSetting } from '../../lib/settings';
import { wordsToFractions } from '../../lib/pageWords';
import { cn } from '../../lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type H = 'left' | 'center' | 'right';
type V = 'top' | 'middle' | 'bottom';

const STAMPS = ['stamp_agreed', 'stamp_copy', 'stamp_secret', 'stamp_draft', 'stamp_paid'] as const;

const POSITIONS: Array<{ h: H; v: V }> = [
  { h: 'left', v: 'top' }, { h: 'center', v: 'top' }, { h: 'right', v: 'top' },
  { h: 'left', v: 'middle' }, { h: 'center', v: 'middle' }, { h: 'right', v: 'middle' },
  { h: 'left', v: 'bottom' }, { h: 'center', v: 'bottom' }, { h: 'right', v: 'bottom' }
];

export function EditPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [text, setText] = useState('ALL PDF');
  const [page, setPage] = useState('1');
  const [allPages, setAllPages] = useState(false);
  const [pos, setPosState] = useState<{ h: H; v: V }>(() => {
    const p = loadSetting<{ h: string; v: string }>('edit.pos', { h: 'center', v: 'top' });
    const h = (['left', 'center', 'right'].includes(p?.h) ? p.h : 'center') as H;
    const v = (['top', 'middle', 'bottom'].includes(p?.v) ? p.v : 'top') as V;
    return { h, v };
  });
  const [size, setSizeState] = useState(() => {
    const s = loadSetting('edit.size', 16);
    return typeof s === 'number' && s >= 8 && s <= 48 ? s : 16;
  });
  const setPos = (p: { h: H; v: V }) => {
    setPosState(p);
    saveSetting('edit.pos', p);
  };
  const setSize = (s: number | ((p: number) => number)) => {
    setSizeState((prev) => (typeof s === 'function' ? (s as (p: number) => number)(prev) : s));
  };
  // Размер переживает перезагрузку; пишем в эффекте, а не в апдейтере (StrictMode дублирует апдейтеры)
  useEffect(() => {
    saveSetting('edit.size', size);
  }, [size]);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [batesPrefix, setBatesPrefix] = useState('DOC-');
  const [batesStart, setBatesStart] = useState(1);
  const [batesPad, setBatesPad] = useState(6);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [overlayPages, setOverlayPages] = useState<OverlayPageData[]>([]);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const openSeq = useRef(0);

  // Настройки изменились — показанный ранее результат и ошибки им уже не соответствуют
  useEffect(() => {
    setResult(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, page, allPages, pos, size, title, author, batesPrefix, batesStart, batesPad]);

  const open = async (f: File | undefined) => {
    if (!f) return;
    if (isTooBig(f)) {
      setFile(null);
      setPageCount(null);
      setResult(null);
      setOverlayPages([]);
      return setError(t('fileTooBig') as string);
    }
    const seq = ++openSeq.current;
    setFile(f);
    setResult(null);
    setError(null);
    setOverlayPages([]);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const doc = await loadPdf(bytes);
      if (openSeq.current !== seq) return; // пока грузился, выбрали другой файл
      setPageCount(doc.getPageCount());
      // Страницы для окна: тап ставит штамп прямо в нужное место
      const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
      const n = Math.min(doc.getPageCount(), 30);
      const out: OverlayPageData[] = [];
      for (let p = 1; p <= n; p++) {
        if (openSeq.current !== seq) return;
        const pg = await pdf.getPage(p);
        const viewport = pg.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await pg.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        const words = await wordsToFractions(pg, viewport, canvas.width, canvas.height);
        out.push({ url: canvas.toDataURL('image/jpeg', 0.8), aspect: canvas.width / canvas.height, words, label: `page ${p}` });
      }
      if (openSeq.current !== seq) return;
      setOverlayPages(out);
    } catch {
      if (openSeq.current !== seq) return;
      setPageCount(null);
    }
  };

  // Тап по странице в окне: страница + позиция штампа выбираются сами
  const tapToPlace = (pi: number, fx: number, fy: number) => {
    setPage(String(pi + 1));
    setAllPages(false);
    setPos({
      h: fx < 0.33 ? 'left' : fx > 0.66 ? 'right' : 'center',
      v: fy < 0.33 ? 'top' : fy > 0.66 ? 'bottom' : 'middle'
    });
  };

  // null — ввод непонятен или номер вне диапазона: молча штамповать весь документ нельзя
  const parsePages = (): number[] | 'all' | null => {
    if (allPages) return 'all';
    if (!pageCount) return null;
    if (page.trim() === '') return null;
    const n = parseInt(page, 10);
    if (!Number.isFinite(n) || n < 1 || n > pageCount) return null;
    return [n - 1];
  };

  const apply = async (kind: 'stamp' | 'watermark' | 'numbers' | 'meta' | 'bates') => {
    if (!file) return;
    if (kind === 'stamp' && parsePages() === null) return setError(t('editPage.badPages', { n: pageCount ?? '…' }) as string);
    setBusy(true);
    setActive(kind);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let out: Uint8Array;
      if (kind === 'meta') out = await setMetadata(bytes, title, author);
      else if (kind === 'watermark') out = await stampText(bytes, text || 'ALL PDF', { watermark: true });
      else if (kind === 'numbers') out = await stampText(bytes, text || 'Page', { pageNumbers: true });
      else if (kind === 'bates') out = await stampBates(bytes, { prefix: batesPrefix, start: Math.max(0, batesStart), pad: batesPad });
      else {
        const pages = parsePages();
        if (pages === null) return setError(t('editPage.badPages', { n: pageCount ?? '…' }) as string);
        out = await stampTextAt(bytes, text || 'ALL PDF', { pages, h: pos.h, v: pos.v, size });
      }
      setResult(out);
    } catch {
      setError(t('editPage.failed') as string);
    } finally {
      setBusy(false);
      setActive(null);
    }
  };

  const actLabel = (kind: string, key: string) => (busy && active === kind ? t('processing') : t(key));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('editPage.title')}</h1>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} subtitleKey="dropSubtitlePdf" onFiles={(f) => open(f[0])} />
      {file && (
        <FileChip
          name={file.name}
          meta={pageCount !== null ? `${pageCount} ${t('pagesShort')}` : undefined}
          disabled={busy}
          onRemove={() => { setFile(null); setPageCount(null); setResult(null); setError(null); setOverlayPages([]); setOverlayOpen(false); }}
        />
      )}
      {overlayPages.length > 0 && (
        <button
          onClick={() => setOverlayOpen(true)}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99]"
        >
          <BookOpen className="h-5 w-5" /> {t('editPage.openViewer')}
        </button>
      )}
      {pageCount !== null && pageCount > overlayPages.length && overlayPages.length > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">{t('editPage.cappedNote', { shown: overlayPages.length, total: pageCount })}</p>
      )}

      <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="text-sm font-semibold">{t('editPage.text')}</label>
        <input value={text} disabled={busy} onChange={(e) => setText(e.target.value)} placeholder={t('editPage.textPh') as string}
          className="mt-2 w-full rounded-xl border px-3 py-2.5 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800" />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {STAMPS.map((s) => (
            <button key={s} disabled={busy} onClick={() => setText(t(`editPage.${s}`) as string)}
              className="rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-semibold transition-colors hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:hover:bg-slate-700">
              {t(`editPage.${s}`)}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold text-slate-500">{t('editPage.page')}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input value={page} onChange={(e) => setPage(e.target.value)} disabled={allPages || busy} inputMode="numeric"
                className="w-20 rounded-xl border px-3 py-2 text-sm disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800" />
              <label className="flex min-h-[40px] items-center gap-1.5 text-xs">
                <input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} className="h-4 w-4" />
                {t('editPage.allPages')}
              </label>
            </div>
            {pageCount !== null && <p className="mt-1 text-xs text-slate-400">{t('pages')}: {pageCount}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">{t('editPage.position')}</p>
            <div className="mt-1 grid w-36 grid-cols-3 gap-1.5">
              {POSITIONS.map((p) => (
                <button
                  key={`${p.h}-${p.v}`}
                  onClick={() => setPos(p)}
                  aria-label={`${t(`editPage.pos_${p.h}`)} · ${t(`editPage.posV_${p.v}`)}`}
                  className={cn(
                    'h-9 rounded-md border transition-colors dark:border-slate-700',
                    pos.h === p.h && pos.v === p.v ? 'border-indigo-600 bg-indigo-500' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800'
                  )}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">{t('editPage.size')}: {size}</p>
            <div className="mt-1 flex items-center gap-1">
              <button onClick={() => setSize((s) => Math.max(8, s - 2))} aria-label="−" className="grid min-h-[36px] min-w-[36px] place-items-center rounded-lg bg-slate-100 text-lg leading-none dark:bg-slate-800">−</button>
              <input type="range" min={8} max={48} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-full flex-1" aria-label={t('editPage.size') as string} />
              <button onClick={() => setSize((s) => Math.min(48, s + 2))} aria-label="+" className="grid min-h-[36px] min-w-[36px] place-items-center rounded-lg bg-slate-100 text-lg leading-none dark:bg-slate-800">+</button>
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-400">{t('editPage.allPagesNote')}</p>
        <div className="mt-2 overflow-hidden rounded-xl border dark:border-slate-700">
          <div className="relative h-28 bg-slate-50 dark:bg-slate-800">
            <span
              className={cn(
                'absolute max-w-[90%] truncate font-bold text-slate-800 dark:text-slate-100',
                pos.h === 'left' ? 'left-2' : pos.h === 'right' ? 'right-2' : 'left-1/2 -translate-x-1/2',
                pos.v === 'top' ? 'top-2' : pos.v === 'bottom' ? 'bottom-2' : 'top-1/2 -translate-y-1/2',
                pos.h === 'center' && pos.v === 'middle' && '-translate-x-1/2 -translate-y-1/2'
              )}
              style={{ fontSize: Math.min(34, Math.max(10, Math.round(size * 1.2))) }}
            >
              {text || 'ALL PDF'}
            </span>
          </div>
          <p className="bg-white px-3 py-1.5 text-xs text-slate-500 dark:bg-slate-900">{t('editPage.stampPreview')}</p>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button disabled={!file || busy} onClick={() => apply('stamp')} className="min-h-[44px] rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50">{actLabel('stamp', 'editPage.addText')}</button>
          <button disabled={!file || busy} onClick={() => apply('watermark')} className="min-h-[44px] rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 active:scale-[0.98] disabled:opacity-50">{actLabel('watermark', 'editPage.watermark')}</button>
          <button disabled={!file || busy} onClick={() => apply('numbers')} className="min-h-[44px] rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50">{actLabel('numbers', 'editPage.pageNumbers')}</button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold">{t('editPage.batesTitle')}</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-xs text-slate-500">
            {t('editPage.prefix')}
            <input value={batesPrefix} disabled={busy} onChange={(e) => setBatesPrefix(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800" />
          </label>
          <label className="text-xs text-slate-500">
            {t('editPage.startFrom')}
            <input type="number" min={0} value={batesStart} disabled={busy} onChange={(e) => setBatesStart(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800" />
          </label>
          <label className="text-xs text-slate-500">
            {t('editPage.pad')}
            <input type="number" min={1} max={10} value={batesPad} disabled={busy} onChange={(e) => setBatesPad(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800" />
          </label>
        </div>
        <button disabled={!file || busy} onClick={() => apply('bates')} className="mt-2 min-h-[44px] w-full rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50">
          {actLabel('bates', 'editPage.addBates')}
        </button>
      </div>
      <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} placeholder={t('editPage.titleMeta') as string} className="rounded-xl border px-3 py-2.5 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800" />
          <input value={author} disabled={busy} onChange={(e) => setAuthor(e.target.value)} placeholder={t('editPage.author') as string} className="rounded-xl border px-3 py-2.5 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800" />
        </div>
        <button disabled={!file || busy} onClick={() => apply('meta')} className="mt-2 min-h-[44px] w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 active:scale-[0.99] disabled:opacity-50 dark:bg-slate-700">
          {actLabel('meta', 'editPage.applyMeta')}
        </button>
      </div>
      {error && <p className="animate-enter text-sm text-red-500 dark:text-red-400">{error}</p>}
      {result && <ResultCard title={t('ready') as string} bytes={result} fileName="edited.pdf" />}
      {overlayOpen && overlayPages.length > 0 && (
        <PdfOverlay
          title={file?.name ?? (t('editPage.title') as string)}
          pages={overlayPages}
          onClose={() => setOverlayOpen(false)}
          onPageTap={tapToPlace}
          tapHint={t('editPage.tapHint') as string}
          toolbar={
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/10 p-2">
              <span className="min-w-0 flex-1 truncate text-sm text-white">
                {text || 'ALL PDF'} · {allPages ? t('editPage.allPages') : `${t('editPage.page')} ${page || '…'} · ${t(`editPage.pos_${pos.h}`)} ${t(`editPage.posV_${pos.v}`)}`}
              </span>
              <button
                onClick={() => apply('stamp')}
                disabled={!file || busy}
                className="min-h-[44px] rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50"
              >
                {busy && active === 'stamp' ? t('processing') : t('editPage.addText')}
              </button>
              {result && (
                <button
                  onClick={() => downloadBytes(result, 'edited.pdf', 'application/pdf')}
                  className="min-h-[44px] rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 active:scale-[0.98]"
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
