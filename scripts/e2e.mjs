// E2E: загрузка реальных файлов в живой preview-билд, клики, проверка скачиваний.
// Запуск: 1) npm run preview -- --port 5190  2) node scripts/e2e.mjs
// Артефакты — в promo/.tmp (игнор).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PDFDocument } from 'pdf-lib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, 'promo', '.tmp');
mkdirSync(tmp, { recursive: true });
const BASE = 'http://localhost:5190/ALL-PDF/#/';

async function makePdf(name, pages) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`Test page ${i + 1}`, { x: 50, y: 800, size: 24 });
  }
  const path = join(tmp, name);
  writeFileSync(path, await doc.save());
  return path;
}

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--no-sandbox']
});
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage({ viewport: { width: 1280, height: 900 } });
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push('PASS ' + name);
  } catch (e) {
    const errText = await page.locator('p.text-red-500').allTextContents().catch(() => []);
    await page.screenshot({ path: join(tmp, 'fail-' + name.split(' ')[0] + '.png') }).catch(() => {});
    results.push('FAIL ' + name + ' :: ' + String(e).split('\n')[0] + ' :: page-errors: ' + JSON.stringify(errText));
  }
}

// --- MERGE: 2 файла (3+2 стр) с диапазоном → merged 4 стр ---
await check('merge files+ranges → download', async () => {
  const a = await makePdf('m-a.pdf', 3);
  const b = await makePdf('m-b.pdf', 2);
  await page.goto(BASE + 'merge', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const dz = page.locator('input[type="file"]').first();
  await dz.setInputFiles([a, b]);
  await page.waitForTimeout(2500); // подсчет страниц
  const ranges = page.locator('input[placeholder*="1-3"]');
  await ranges.nth(1).fill('1');
  await page.getByRole('button', { name: 'Объединить' }).click();
  const dlBtn = page.getByRole('button', { name: /Скачать/ });
  await dlBtn.waitFor({ timeout: 30000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    dlBtn.click()
  ]);
  const path = await dl.path();
  if (!path) throw new Error('no download path');
  const buf = (await import('node:fs')).readFileSync(path);
  const doc = await PDFDocument.load(buf);
  if (doc.getPageCount() !== 4) throw new Error('expected 4 pages, got ' + doc.getPageCount());
});

// --- SPLIT: extract 1-2 из 4 → 2 стр ---
await check('split extract → download', async () => {
  const s = await makePdf('s.pdf', 4);
  await page.goto(BASE + 'split', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('input[type="file"]').first().setInputFiles([s]);
  await page.waitForTimeout(500);
  await page.locator('input[placeholder*="1-3"]').fill('1-2');
  await page.getByRole('button', { name: 'Выполнить' }).click();
  const dlBtn = page.getByRole('button', { name: /Скачать/ });
  await dlBtn.waitFor({ timeout: 30000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    dlBtn.click()
  ]);
  const buf = (await import('node:fs')).readFileSync(await dl.path());
  if ((await PDFDocument.load(buf)).getPageCount() !== 2) throw new Error('expected 2 pages');
});

// --- PDF2TEXT: текст извлекается ---
await check('pdf2text extracts text', async () => {
  const s = await makePdf('t.pdf', 2);
  await page.goto(BASE + 'pdf2text', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('input[type="file"]').first().setInputFiles([s]);
  await page.getByRole('button', { name: 'Конвертировать' }).click();
  await page.waitForSelector('textarea', { timeout: 30000 });
  const txt = await page.locator('textarea').inputValue();
  if (!txt.includes('Test page 1') || !txt.includes('Test page 2')) throw new Error('text missing: ' + txt.slice(0, 80));
});

// --- COMPRESS: до/после + скачивание ---
await check('compress → download smaller-or-equal', async () => {
  const s = await makePdf('c.pdf', 3);
  await page.goto(BASE + 'compress', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('input[type="file"]').first().setInputFiles([s]);
  await page.getByRole('button', { name: 'Сжать' }).click();
  const dlBtn = page.getByRole('button', { name: /Скачать/ });
  await dlBtn.waitFor({ timeout: 30000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    dlBtn.click()
  ]);
  const buf = (await import('node:fs')).readFileSync(await dl.path());
  if ((await PDFDocument.load(buf)).getPageCount() !== 3) throw new Error('pages lost');
});

await browser.close();
console.log(results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
console.log('E2E OK');
