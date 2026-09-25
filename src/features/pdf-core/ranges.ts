export function parseRangesToIndices(input: string, max: number): number[] {
  const out = new Set<number>();
  for (const part of input.split(',')) {
    const t = part.trim();
    if (!t) continue;
    if (t.includes('-')) {
      const [aStr, bStr] = t.split('-').map((x) => x.trim());
      const a = aStr === '' ? NaN : parseInt(aStr, 10);
      const b = bStr === '' ? NaN : parseInt(bStr, 10);
      // Поддерживаем открытые диапазоны: "-3" = 1..3, "5-" = 5..max
      const lo = Number.isFinite(a) ? Math.max(1, Math.min(a, max)) : 1;
      const hi = Number.isFinite(b) ? Math.min(max, Math.max(b, 1)) : max;
      if (!Number.isFinite(a) && !Number.isFinite(b)) continue;
      const from = Math.min(lo, hi);
      const to = Math.max(lo, hi);
      for (let p = from; p <= to; p++) out.add(p - 1);
    } else {
      const p = parseInt(t, 10);
      if (Number.isFinite(p) && p >= 1 && p <= max) out.add(p - 1);
    }
  }
  return [...out].sort((x, y) => x - y);
}
