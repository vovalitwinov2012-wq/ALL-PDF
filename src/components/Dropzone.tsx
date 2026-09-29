import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { UploadCloud } from 'lucide-react';
import { cn } from '../lib/utils';

export function Dropzone({ accept, multiple = true, disabled = false, subtitleKey = 'dropSubtitle', onFiles }: {
  accept?: Record<string, string[]>;
  multiple?: boolean;
  disabled?: boolean;
  subtitleKey?: string;
  onFiles: (f: File[]) => void;
}) {
  const { t } = useTranslation();
  const [rejected, setRejected] = useState(false);
  const onDrop = useCallback((accepted: File[]) => {
    setRejected(false);
    onFiles(accepted);
  }, [onFiles]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected: () => setRejected(true),
    accept,
    multiple,
    disabled
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        'cursor-pointer rounded-2xl border-2 border-dashed border-indigo-200 bg-white/70 p-5 text-center transition-colors sm:p-8 dark:border-indigo-900 dark:bg-slate-900/60',
        isDragActive && 'dropzone-active',
        disabled && 'cursor-wait opacity-60'
      )}
    >
      <input {...getInputProps()} />
      <UploadCloud className="mx-auto mb-2 h-9 w-9 text-indigo-500 sm:mb-3 sm:h-10 sm:w-10" />
      <p className="font-semibold">{t('dropTitle')}</p>
      <p className="mt-1 text-sm text-slate-500">{t(subtitleKey)}</p>
      {rejected && <p className="mt-2 text-sm font-medium text-amber-600">{t('wrongType')}</p>}
    </div>
  );
}
