// Скриншоты приложения для promo-постов (папка promo/ — в .gitignore).
// Запуск: 1) npm run preview -- --port 5190  2) node scripts/shot.mjs
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://localhost:5190/ALL-PDF/#/';

const PAGES = [
  { route: '', dir: '_start', full: true },
  { route: 'viewer', dir: 'viewer' },
  { route: 'merge', dir: 'merge' },
  { route: 'split', dir: 'split' },
  { route: 'organizer', dir: 'organizer' },
  { route: 'compress', dir: 'compress' },
  { route: 'img2pdf', dir: 'img2pdf' },
  { route: 'pdf2img', dir: 'pdf2img' },
  { route: 'pdf2text', dir: 'pdf2text' },
  { route: 'ocr', dir: 'ocr' },
  { route: 'images', dir: 'images' },
  { route: 'edit', dir: 'edit' },
  { route: 'shapes', dir: 'shapes' },
  { route: 'crop', dir: 'crop' },
  { route: 'repair', dir: 'repair' },
  { route: 'compare', dir: 'compare' },
  { route: 'tables', dir: 'tables' },
  { route: 'forms', dir: 'forms' },
  { route: 'sign', dir: 'sign' },
  { route: 'protect', dir: 'protect' },
  { route: 'about', dir: 'about' }
];

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--no-sandbox', '--force-device-scale-factor=1']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

for (const p of PAGES) {
  const dir = join(root, 'promo', p.dir);
  mkdirSync(dir, { recursive: true });
  await page.goto(BASE + p.route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: join(dir, 'shot-1.png'), fullPage: !!p.full });
  console.log('shot:', p.dir);
}
await browser.close();
console.log('shots done');
