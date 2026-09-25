import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Dropzone } from '../../components/Dropzone';
import { downloadBytes } from '../../lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function Pdf2TextPage() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      let out = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        out += `\n\n===== Page ${p} =====\n` + content.items.map((it: unknown) => (it as { str: string }).str).join(' ');
      }
      setText(out.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('convertPage.pdf2textTitle')}</h1>
      <Dropzone accept={{ 'application/pdf': ['.pdf'] }} multiple={false} onFiles={(f) => setFile(f[0])} />
      <button onClick={run} disabled={!file || busy} className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">
        {busy ? t('processing') : t('convertPage.do')}
      </button>
      {text && (
        <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">{t('convertPage.resultText')} · {text.length} chars</span>
            <button onClick={() => downloadBytes(new TextEncoder().encode(text), (file?.name ?? 'doc').replace(/\.pdf$/i, '') + '.txt', 'text/plain')}
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">{t('download')} .txt</button>
          </div>
          <textarea value={text} readOnly rows={14} className="thin-scroll w-full rounded-xl border bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800" />
        </div>
      )}
    </div>
  );
}
