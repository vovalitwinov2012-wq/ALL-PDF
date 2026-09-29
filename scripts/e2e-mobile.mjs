// E2E-mobile: прогон всех инструментов на ширине телефона 390px.
// Проверки: нет горизонтального переполнения, нет ошибок консоли,
// ключевые сценарии (merge/split/pdf2text/compress) со скачиванием.
// Скриншотный регресс: --baseline пишет эталоны, обычный запуск сравнивает.
// Запуск: 1) npm run preview -- --port 5190  2) node scripts/e2e-mobile.mjs [--baseline]
// Артефакты — в promo/.tmp (игнор).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, 'promo', '.tmp', 'mobile');
const baseDir = join(tmp, 'baseline');
mkdirSync(tmp, { recursive: true });
mkdirSync(baseDir, { recursive: true });
const BASE = 'http://localhost:5190/ALL-PDF/#/';
const WANT_BASELINE = process.argv.includes('--baseline');
const MAX_DIFF_RATIO = 0.005; // 0.5% пикселей

const ROUTES = ['home', 'viewer', 'merge', 'split', 'organizer', 'compress', 'img2pdf', 'pdf2img', 'pdf2text', 'ocr', 'images', 'edit', 'shapes', 'crop', 'repair', 'compare', 'tables', 'forms', 'sign', 'protect'];

async function makePdf(name, pages) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`Mobile test page ${i + 1}`, { x: 50, y: 800, size: 24 });
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
const page = await ctx.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2
});
const results = [];
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
});
page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 160)));

async function check(name, fn) {
  consoleErrors.length = 0;
  try {
    await fn();
    if (consoleErrors.length > 0) throw new Error('console errors: ' + JSON.stringify(consoleErrors.slice(0, 2)));
    results.push('PASS ' + name);
  } catch (e) {
    await page.screenshot({ path: join(tmp, 'fail-' + name.split(' ')[0] + '.png') }).catch(() => {});
    results.push('FAIL ' + name + ' :: ' + String(e).split('\n')[0]);
  }
}

function compareShot(name, path) {
  const base = join(baseDir, name + '.png');
  if (WANT_BASELINE || !existsSync(base)) {
    writeFileSync(base, readFileSync(path));
    return 'baseline-written';
  }
  const a = PNG.sync.read(readFileSync(base));
  const b = PNG.sync.read(readFileSync(path));
  if (a.width !== b.width || a.height !== b.height) return `size-changed ${a.width}x${a.height} -> ${b.width}x${b.height}`;
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  const ratio = n / (a.width * a.height);
  if (ratio > MAX_DIFF_RATIO) {
    writeFileSync(join(tmp, 'diff-' + name + '.png'), PNG.sync.write(diff));
    return `pixels-changed ${(ratio * 100).toFixed(2)}%`;
  }
  return null;
}

// --- Все маршруты: переполнение + скриншот ---
for (const r of ROUTES) {
  await check('route ' + r, async () => {
    await page.goto(r === 'home' ? BASE.replace('#/', '') : BASE + r, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error('horizontal overflow ' + overflow + 'px');
    const shot = join(tmp, r + '.png');
    await page.screenshot({ path: shot, fullPage: true });
    const cmp = compareShot(r, shot);
    if (cmp === 'baseline-written') return;
    if (cmp) throw new Error(cmp);
  });
}

// --- MERGE: 2 файла → 4 стр + скачивание ---
await check('merge mobile → download', async () => {
  const a = await makePdf('mm-a.pdf', 3);
  const b = await makePdf('mm-b.pdf', 2);
  await page.goto(BASE + 'merge', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('input[type="file"]').first().setInputFiles([a, b]);
  await page.waitForTimeout(2500);
  await page.locator('input[placeholder*="1-3"]').nth(1).fill('1');
  await page.getByRole('button', { name: 'Объединить' }).click();
  const dlBtn = page.getByRole('button', { name: /Скачать/ });
  await dlBtn.waitFor({ timeout: 30000 });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), dlBtn.click()]);
  const doc = await PDFDocument.load(readFileSync(await dl.path()));
  if (doc.getPageCount() !== 4) throw new Error('expected 4 pages, got ' + doc.getPageCount());
});

// --- SPLIT: extract 1-2 из 4 ---
await check('split mobile → download', async () => {
  const s = await makePdf('ms.pdf', 4);
  await page.goto(BASE + 'split', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('input[type="file"]').first().setInputFiles([s]);
  await page.waitForTimeout(500);
  await page.locator('input[placeholder*="1-3"]').fill('1-2');
  await page.getByRole('button', { name: 'Проверить' }).click();
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Выполнить' }).click();
  const dlBtn = page.getByRole('button', { name: /Скачать/ });
  await dlBtn.waitFor({ timeout: 30000 });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), dlBtn.click()]);
  if ((await PDFDocument.load(readFileSync(await dl.path()))).getPageCount() !== 2) throw new Error('expected 2 pages');
});

// --- PDF2TEXT ---
await check('pdf2text mobile extracts', async () => {
  const s = await makePdf('mt.pdf', 2);
  await page.goto(BASE + 'pdf2text', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('input[type="file"]').first().setInputFiles([s]);
  await page.getByRole('button', { name: 'Конвертировать' }).click();
  await page.waitForSelector('textarea', { timeout: 30000 });
  const txt = await page.locator('textarea').inputValue();
  if (!txt.includes('Mobile test page 1')) throw new Error('text missing');
});

// --- COMPRESS ---
await check('compress mobile → download', async () => {
  const s = await makePdf('mc.pdf', 3);
  await page.goto(BASE + 'compress', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('input[type="file"]').first().setInputFiles([s]);
  await page.getByRole('button', { name: 'Сжать' }).click();
  const dlBtn = page.getByRole('button', { name: /Скачать/ });
  await dlBtn.waitFor({ timeout: 30000 });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), dlBtn.click()]);
  if ((await PDFDocument.load(readFileSync(await dl.path()))).getPageCount() !== 3) throw new Error('pages lost');
});

await browser.close();
console.log(results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
console.log(WANT_BASELINE ? 'E2E-MOBILE BASELINE OK' : 'E2E-MOBILE OK');
