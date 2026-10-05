import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dropzone } from '../../components/Dropzone';
import { FileChip } from '../../components/FileChip';
import { ProgressBar } from '../../components/ProgressBar';
import { downloadBytes, isTooBig } from '../../lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function Pdf2TextPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);

  const run = async () => {
    if (!file) return setError(t('needFiles') as string);
    setBusy(true);
    setError(null);
    setEmpty(false);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      try {
        let out = '';
        setProgress([0, pdf.numPages]);
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          const text = content.items.map((it: unknown) => (it as { str: string }).str).join(' ').trim();
          if (text) out += (out ? '\n\n' : '') + text;
          setProgress([p, pdf.numPages]);
        }
        const trimmed = out.trim();
        setText(trimmed);
        if (!trimmed) setEmpty(true);
      } finally {
        await pdf.destroy().catch(() => undefined);
      }
    } catch {
      setError(t('failed') as string);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('convertPage.pdf2textTitle')}</h1>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} disabled={busy} subtitleKey="dropSubtitlePdf" onFiles={(f) => {
        const f0 = f[0];
        if (!f0) return;
        if (isTooBig(f0)) return setError(t('fileTooBig') as string);
        setError(null);
        setEmpty(false);
        setText('');
        setFile(f0);
      }} />
      {file && (
        <FileChip
          name={file.name}
          meta={busy && progress ? `${progress[0]}/${progress[1]}` : undefined}
          disabled={busy}
          onRemove={() => { setFile(null); setText(''); setEmpty(false); setError(null); }}
        />
      )}
      <button onClick={run} disabled={!file || busy} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50">
        {busy && progress ? `${t('processing')} ${progress[0]}/${progress[1]}` : busy ? t('processing') : t('convertPage.do')}
      </button>
      {busy && progress && <ProgressBar value={progress[0] / progress[1]} />}
      {error && <p className="animate-enter text-sm text-red-500 dark:text-red-400">{error}</p>}
      {empty && <p className="animate-enter rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">{t('convertPage.noText')}</p>}
      {text && (
        <div className="animate-enter rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t('convertPage.resultText')} · {text.length} {t('convertPage.chars')}</span>
            <button onClick={() => downloadBytes(new TextEncoder().encode(text), (file?.name ?? 'doc').replace(/\.pdf$/i, '') + '.txt', 'text/plain')}
              className="min-h-[40px] rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 active:scale-[0.98]">{t('download')} .txt</button>
          </div>
          <textarea value={text} readOnly rows={14} className="thin-scroll w-full rounded-xl border bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800" />
        </div>
      )}
    </div>
  );
}
