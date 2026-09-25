import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { downloadBytes, formatBytes } from '../lib/utils';

export function ResultCard({ title, bytes, fileName, mime }: { title: string; bytes: Uint8Array; fileName: string; mime?: string }) {
  const { t } = useTranslation();
  const save = () => downloadBytes(bytes, fileName, mime);
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">✓ {title} · {formatBytes(bytes.length)}</p>
      <button
        onClick={save}
        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        <Download className="h-4 w-4" /> {t('download')} · {fileName}
      </button>
    </div>
  );
}
