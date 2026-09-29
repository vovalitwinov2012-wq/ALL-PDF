import { useTranslation } from 'react-i18next';
import { formatBytes } from '../lib/utils';
import { X, FileText, Image as ImageIcon, ArrowUp, ArrowDown } from 'lucide-react';

export function FileList({ files, onRemove, onClear, onMove, disabled = false }: {
  files: File[];
  onRemove: (i: number) => void;
  onClear: () => void;
  onMove?: (i: number, dir: -1 | 1) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  if (files.length === 0) return null;
  return (
    <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{t('files')} · {files.length}</span>
        <button onClick={onClear} disabled={disabled} className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:text-red-500 disabled:opacity-40">{t('clear')}</button>
      </div>
      <ul className="thin-scroll max-h-56 space-y-2 overflow-auto">
        {files.map((f, i) => (
          <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-2 py-1.5 text-sm dark:bg-slate-800">
            {f.type.includes('image') ? <ImageIcon className="h-4 w-4 shrink-0 text-indigo-500" /> : <FileText className="h-4 w-4 shrink-0 text-indigo-500" />}
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">{formatBytes(f.size)}</span>
            {onMove && (
              <>
                <button onClick={() => onMove(i, -1)} disabled={disabled || i === 0} aria-label={t('moveUp') as string} className="grid min-h-[36px] min-w-[36px] place-items-center rounded-lg text-slate-400 hover:text-indigo-500 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button onClick={() => onMove(i, 1)} disabled={disabled || i === files.length - 1} aria-label={t('moveDown') as string} className="grid min-h-[36px] min-w-[36px] place-items-center rounded-lg text-slate-400 hover:text-indigo-500 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              </>
            )}
            <button onClick={() => onRemove(i)} disabled={disabled} aria-label={t('remove') as string} className="grid min-h-[36px] min-w-[36px] place-items-center rounded-lg text-slate-400 hover:text-red-500 disabled:opacity-30"><X className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
