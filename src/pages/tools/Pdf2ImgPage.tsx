import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import JSZip from 'jszip';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dropzone } from '../../components/Dropzone';
import { downloadBytes } from '../../lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface RenderedPage {
  blob: Blob;
  url: string;
  name: string;
}

const MAX_PAGES = 50;

export function Pdf2ImgPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'jpeg' | 'png'>('jpeg');
  const [scale, setScale] = useState(2);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [truncated, setTruncated] = useState(false);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    pages.forEach((p) => URL.revokeObjectURL(p.url));
    setPages([]);
    setTruncated(false);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      const n = Math.min(pdf.numPages, MAX_PAGES);
      setTruncated(pdf.numPages > MAX_PAGES);
      const ext = format === 'png' ? 'png' : 'jpg';
      const mime = format === 'png' ? 'image/png' : 'image/jpeg';
      const out: RenderedPage[] = [];
      for (let p = 1; p <= n; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        const blob: Blob = await new Promise((res, rej) =>
          canvas.toBlob((b) => (b ? res(b) : rej(new Error('canvas-empty'))), mime, 0.92)
        );
        const name = `${file.name.replace(/\.pdf$/i, '')}-p${p}.${ext}`;
        out.push({ blob, url: URL.createObjectURL(blob), name });
        setPages([...out]);
      }
    } finally {
      setBusy(false);
    }
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    for (const p of pages) zip.file(p.name, await p.blob.arrayBuffer());
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBytes(new Uint8Array(await blob.arrayBuffer()), `${file?.name.replace(/\.pdf$/i, '') ?? 'pages'}.zip`, 'application/zip');
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('convertPage.pdf2imgTitle')}</h1>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} onFiles={(f) => setFile(f[0])} />
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <span className="text-sm font-semibold">{t('convertPage.format')}:</span>
        {(['jpeg', 'png'] as const).map((f) => (
          <button key={f} onClick={() => setFormat(f)} className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${format === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>{f}</button>
        ))}
        <span className="ml-2 text-sm font-semibold">{t('convertPage.scale')}:</span>
        {[1, 2, 3].map((s) => (
          <button key={s} onClick={() => setScale(s)} className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${scale === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>{s}x</button>
        ))}
        <button onClick={run} disabled={!file || busy} className="ml-auto rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? t('processing') : t('convertPage.do')}
        </button>
      </div>

      {truncated && <p className="text-sm text-amber-600">{t('convertPage.truncated', { n: MAX_PAGES })}</p>}

      {pages.length > 0 && (
        <>
          <button onClick={downloadZip} className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700">
            {t('downloadAllZip')} · {pages.length}
          </button>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pages.map((p, i) => (
              <a key={i} href={p.url} download={p.name} className="group overflow-hidden rounded-xl border bg-white dark:border-slate-800 dark:bg-slate-900">
                <img src={p.url} alt={`page ${i + 1}`} className="w-full" loading="lazy" />
                <p className="p-2 text-center text-xs text-slate-500 group-hover:text-indigo-600">{p.name} ↓</p>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
