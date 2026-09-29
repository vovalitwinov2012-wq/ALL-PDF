import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, ZoomIn, ZoomOut, ChevronUp, ChevronDown } from 'lucide-react';

// Слово с боксом в долях страницы (0..1) — масштабонезависимо.
export interface OverlayWord {
  x: number;
  y: number;
  w: number;
  h: number;
  str: string;
}

export interface OverlayPageData {
  url: string;
  aspect: number; // width / height, для скелетона
  words: OverlayWord[];
  label: string;
}

interface Match {
  page: number;
  word: number;
}

export function PdfOverlay({ title, pages, toolbar, headerActions, noTextHint, onNeedOcr, onClose, onPageTap, tapHint, pageOverlay, initialZoom = 100 }: {
  title: string;
  pages: OverlayPageData[];
  toolbar?: React.ReactNode;
  headerActions?: React.ReactNode;
  noTextHint?: string;
  onNeedOcr?: () => void;
  onClose: () => void;
  onPageTap?: (pageIdx: number, fx: number, fy: number) => void;
  tapHint?: string;
  pageOverlay?: (pageIdx: number) => React.ReactNode;
  initialZoom?: number;
}) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(initialZoom);
  const [zoomText, setZoomText] = useState(String(initialZoom));
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const [curPage, setCurPage] = useState(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const matchRefs = useRef(new Map<string, HTMLDivElement | null>());
  const inputRef = useRef<HTMLInputElement>(null);

  const hasText = useMemo(() => pages.some((p) => p.words.length > 0), [pages]);

  const matches: Match[] = useMemo(() => {
    const q = applied.trim().toLowerCase();
    if (!q) return [];
    const out: Match[] = [];
    pages.forEach((p, pi) => {
      p.words.forEach((w, wi) => {
        if (w.str.toLowerCase().includes(q)) out.push({ page: pi, word: wi });
      });
    });
    return out;
  }, [applied, pages]);

  useEffect(() => {
    setMatchIdx(0);
  }, [applied]);

  // Первый Enter: скроллим к первому совпадению уже после отрисовки подсветки
  useEffect(() => {
    if (!applied.trim() || matches.length === 0) return;
    const m = matches[0];
    setCurPage(m.page + 1);
    requestAnimationFrame(() => {
      matchRefs.current.get(`${m.page}:${m.word}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  // Блокируем скролл страницы под окном; Escape в поле ввода — только снять фокус
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        el.blur();
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const clampZoom = (z: number) => Math.min(300, Math.max(50, Math.round(z)));
  const applyZoom = (z: number) => {
    const c = clampZoom(z);
    setZoom(c);
    setZoomText(String(c));
  };

  const gotoMatch = (idx: number) => {
    if (matches.length === 0) return;
    const n = ((idx % matches.length) + matches.length) % matches.length;
    setMatchIdx(n);
    const m = matches[n];
    setCurPage(m.page + 1);
    requestAnimationFrame(() => {
      matchRefs.current.get(`${m.page}:${m.word}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

  const submitSearch = () => {
    setApplied(query);
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop + el.clientHeight * 0.3;
    let cur = 1;
    pageRefs.current.forEach((ref, i) => {
      if (ref && ref.offsetTop <= top) cur = i + 1;
    });
    setCurPage(cur);
  };

  const matchKey = (m: Match) => `${m.page}:${m.word}`;
  const isCurrent = (pi: number, wi: number) =>
    matches.length > 0 && matches[matchIdx] && matches[matchIdx].page === pi && matches[matchIdx].word === wi;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center gap-2 border-b border-white/10 bg-slate-900 px-3 py-2 text-white">
        <button onClick={onClose} aria-label={t('overlay.close') as string} className="grid min-h-[40px] min-w-[40px] shrink-0 place-items-center rounded-xl hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</p>
        <span className="shrink-0 text-xs text-slate-400">{curPage} / {pages.length}</span>
        {headerActions}
        <button
          onClick={() => { setSearchOpen((v) => !v); setTimeout(() => inputRef.current?.focus(), 50); }}
          aria-label={t('overlay.search') as string}
          aria-pressed={searchOpen}
          className={`grid min-h-[40px] min-w-[40px] shrink-0 place-items-center rounded-xl ${searchOpen ? 'bg-indigo-600' : 'hover:bg-white/10'}`}
        >
          <Search className="h-5 w-5" />
        </button>
      </div>

      {searchOpen && (
        <div className="border-b border-white/10 bg-slate-900 px-3 py-2">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); }}
              placeholder={t('overlay.searchPh') as string}
              className="min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-800 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-500"
            />
            <button onClick={submitSearch} className="min-h-[40px] shrink-0 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white">
              {t('overlay.find')}
            </button>
            {matches.length > 0 && (
              <>
                <span className="shrink-0 text-xs text-slate-300">{matchIdx + 1}/{matches.length}</span>
                <button onClick={() => gotoMatch(matchIdx - 1)} aria-label="↑" className="grid min-h-[40px] min-w-[40px] place-items-center rounded-xl hover:bg-white/10 text-white"><ChevronUp className="h-5 w-5" /></button>
                <button onClick={() => gotoMatch(matchIdx + 1)} aria-label="↓" className="grid min-h-[40px] min-w-[40px] place-items-center rounded-xl hover:bg-white/10 text-white"><ChevronDown className="h-5 w-5" /></button>
              </>
            )}
          </div>
          {applied.trim() && matches.length === 0 && (
            <p className="mt-1.5 text-xs text-slate-400">{t('overlay.noMatches')}</p>
          )}
          {!hasText && (
            <p className="mt-1.5 text-xs text-amber-300">
              {noTextHint ?? (t('overlay.noText') as string)}{' '}
              {onNeedOcr && (
                <button onClick={onNeedOcr} className="font-semibold text-indigo-300 underline">{t('overlay.openOcr')}</button>
              )}
            </p>
          )}
        </div>
      )}

      <div ref={scrollRef} onScroll={onScroll} className="thin-scroll min-h-0 flex-1 overflow-auto p-3">
        {tapHint && onPageTap && (
          <p className="mx-auto mb-2 max-w-3xl rounded-xl bg-indigo-600/90 px-3 py-2 text-center text-xs font-semibold text-white">{tapHint}</p>
        )}
        <div className="mx-auto space-y-3" style={{ width: `${zoom}%`, maxWidth: zoom <= 100 ? '720px' : undefined }}>
          {pages.map((p, pi) => (
            <div
              key={pi}
              ref={(el) => { pageRefs.current[pi] = el; }}
              onClick={onPageTap ? (e) => {
                const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const fx = (e.clientX - r.left) / r.width;
                const fy = (e.clientY - r.top) / r.height;
                onPageTap(pi, Math.min(1, Math.max(0, fx)), Math.min(1, Math.max(0, fy)));
              } : undefined}
              className={`relative overflow-hidden rounded-lg bg-white shadow-2xl ${onPageTap ? 'cursor-crosshair' : ''}`}
              style={{ aspectRatio: `${p.aspect}` }}
            >
              <img src={p.url} alt={p.label} className="absolute inset-0 h-full w-full" draggable={false} />
              {pageOverlay && (
                <div className="absolute inset-0">
                  {pageOverlay(pi)}
                </div>
              )}
              {p.words.map((w, wi) => {
                const hit = applied.trim() && w.str.toLowerCase().includes(applied.trim().toLowerCase());
                if (!hit) return null;
                const cur = isCurrent(pi, wi);
                return (
                  <div
                    key={wi}
                    ref={(el) => { matchRefs.current.set(`${pi}:${wi}`, el); }}
                    className={`absolute rounded-[2px] ${cur ? 'bg-orange-500/70 ring-2 ring-orange-300' : 'bg-yellow-400/50'}`}
                    style={{ left: `${w.x * 100}%`, top: `${w.y * 100}%`, width: `${Math.max(0.5, w.w * 100)}%`, height: `${Math.max(0.6, w.h * 100)}%` }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 bg-slate-900 px-3 py-2">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button onClick={() => applyZoom(zoom - 25)} aria-label="−" className="grid min-h-[40px] min-w-[40px] shrink-0 place-items-center rounded-xl text-white hover:bg-white/10">
            <ZoomOut className="h-5 w-5" />
          </button>
          <input
            type="range" min={50} max={300} step={5} value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            aria-label={t('overlay.zoom') as string}
            className="min-w-0 flex-1 accent-indigo-500"
          />
          <button onClick={() => applyZoom(zoom + 25)} aria-label="+" className="grid min-h-[40px] min-w-[40px] shrink-0 place-items-center rounded-xl text-white hover:bg-white/10">
            <ZoomIn className="h-5 w-5" />
          </button>
          <div className="flex shrink-0 items-center">
            <input
              value={zoomText}
              inputMode="numeric"
              onChange={(e) => setZoomText(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
              onBlur={() => applyZoom(Number(zoomText) || 100)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              aria-label={t('overlay.zoom') as string}
              className="w-14 rounded-lg border border-white/15 bg-slate-800 px-1 py-2 text-center text-sm text-white outline-none focus:border-indigo-500"
            />
            <span className="pl-1 text-sm text-slate-400">%</span>
          </div>
        </div>
        {toolbar && <div className="mx-auto mt-2 max-w-3xl">{toolbar}</div>}
      </div>
    </div>
  );
}
