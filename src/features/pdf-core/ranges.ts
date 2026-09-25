export function parseRangesToIndices(input: string, max: number): number[] {
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
