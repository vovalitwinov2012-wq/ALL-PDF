// Единый прогресс-бар: determinate (value 0..1) или indeterminate (value null).
export function ProgressBar({ value, label }: { value?: number | null; label?: string }) {
  const indeterminate = value === null || value === undefined || !Number.isFinite(value);
  const pct = indeterminate ? 0 : Math.min(1, Math.max(0, value as number));
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full bg-indigo-500 transition-all ${indeterminate ? 'w-1/4 animate-pulse' : ''}`}
          style={indeterminate ? undefined : { width: `${Math.round(pct * 100)}%` }}
        />
      </div>
      {label && <p className="mt-2 truncate text-xs text-slate-500">{label}</p>}
    </div>
  );
}
