import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { UploadCloud } from 'lucide-react';
import { cn } from '../lib/utils';

export function Dropzone({ accept, multiple = true, disabled = false, onFiles }: {
  accept?: Record<string, string[]>;
  multiple?: boolean;
  disabled?: boolean;
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
        'cursor-pointer rounded-2xl border-2 border-dashed border-indigo-200 bg-white/70 p-8 text-center transition dark:border-indigo-900 dark:bg-slate-900/60',
        isDragActive && 'dropzone-active',
        disabled && 'cursor-wait opacity-60'
      )}
    >
      <input {...getInputProps()} />
      <UploadCloud className="mx-auto mb-3 h-10 w-10 text-indigo-500" />
      <p className="font-semibold">{t('dropTitle')}</p>
      <p className="mt-1 text-sm text-slate-500">{t('dropSubtitle')}</p>
      {rejected && <p className="mt-2 text-sm font-medium text-amber-600">{t('wrongType')}</p>}
    </div>
  );
}
