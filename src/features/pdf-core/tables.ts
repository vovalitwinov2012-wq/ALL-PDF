// Эвристика «таблицы в CSV» (beta): группируем текстовые фрагменты
// по строкам (Y) и колонкам (X). Хорошо работает на простых отчетах,
// на сложной верстке требует ручной проверки.

export interface TextItem {
  str: string;
  x: number;
  y: number;
}

export function itemsToCsv(items: TextItem[], rowTol = 4, colGap = 12): string {
  const rows = new Map<number, TextItem[]>();
  for (const it of items) {
    if (!it.str.trim()) continue;
    let bucket: number | null = null;
    for (const y of rows.keys()) {
      if (Math.abs(y - it.y) <= rowTol) {
        bucket = y;
        break;
      }
    }
    if (bucket === null) {
      rows.set(it.y, [it]);
    } else {
      rows.get(bucket)!.push(it);
    }
  }
  const sorted = [...rows.entries()].sort((a, b) => b[0] - a[0]); // Y сверху вниз
  const lines: string[] = [];
  for (const [, cells] of sorted) {
    const ordered = cells.slice().sort((a, b) => a.x - b.x);
    // Склеиваем близкие по X фрагменты в одну ячейку, далекие — в разные
    const cols: string[] = [];
    let cur = '';
    let lastX = -Infinity;
    for (const c of ordered) {
      if (cur && c.x - lastX > colGap) {
        cols.push(cur.trim());
        cur = '';
      }
      cur += (cur ? ' ' : '') + c.str;
      lastX = c.x + c.str.length * 4;
    }
    if (cur) cols.push(cur.trim());
    lines.push(cols.map(csvCell).join(';'));
  }
  return lines.join('\n');
}

function csvCell(s: string): string {
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
