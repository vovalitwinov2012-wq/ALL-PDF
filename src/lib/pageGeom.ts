// Геометрия страниц PDF: повёрнутые на 90/270 страницы рендерятся
// транспонированными относительно media box — рамка/подпись в окне
// и вжигание в неповёрнутых координатах тогда расходятся.
export function isRotatedPage(viewW: number, viewH: number, vpW: number, vpH: number): boolean {
  return Math.abs(viewW - viewH) > 1 && Math.abs(vpW - viewH) < 1 && Math.abs(vpH - viewW) < 1;
}
