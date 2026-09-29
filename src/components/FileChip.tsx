import { useTranslation } from 'react-i18next';

// Чип выбранного файла: имя + опциональный статус + кнопка удаления.
export function FileChip({ name, meta, onRemove, disabled = false }: {
  name: string;
  meta?: string;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="animate-enter flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
      <span className="min-w-0 flex-1 truncate" title={name}>
        📄 {name}{meta ? ` · ${meta}` : ''}
      </span>
      {onRemove && (
        <button
          onClick={onRemove}
          disabled={disabled}
          aria-label={t('remove') as string}
          className="grid min-h-[36px] min-w-[36px] shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:text-red-500 disabled:opacity-30"
        >
          ✕
        </button>
      )}
    </div>
  );
}
