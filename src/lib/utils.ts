export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / Math.pow(1024, i);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime = 'application/pdf'): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 500);
}

export function parsePageRanges(input: string, max: number): number[] {
  // "1-3,5" -> [0,1,2,4]
  const out = new Set<number>();
  for (const part of input.split(',')) {
    const t = part.trim();
    if (!t) continue;
    if (t.includes('-')) {
      const [a, b] = t.split('-').map((x) => parseInt(x.trim(), 10));
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const lo = Math.max(1, Math.min(a, b));
        const hi = Math.min(max, Math.max(a, b));
        for (let p = lo; p <= hi; p++) out.add(p - 1);
      }
    } else {
      const p = parseInt(t, 10);
      if (Number.isFinite(p) && p >= 1 && p <= max) out.add(p - 1);
    }
  }
  return [...out].sort((x, y) => x - y);
}

export const LIMITS = {
  maxFileBytes: 50 * 1024 * 1024,
  maxFiles: 20
};

export function assertLimits(files: File[]): string | null {
  if (files.length > LIMITS.maxFiles) return 'tooManyFiles';
  for (const f of files) {
    if (f.size > LIMITS.maxFileBytes) return 'fileTooBig';
  }
  return null;
}

export function isTooBig(f: File): boolean {
  return f.size > LIMITS.maxFileBytes;
}
