import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// GitHub Pages SPA fallback: копируем index.html -> 404.html
const dist = join(process.cwd(), 'dist');
const index = join(dist, 'index.html');
const notFound = join(dist, '404.html');
if (existsSync(index)) {
  copyFileSync(index, notFound);
  console.log('pages-fallback: 404.html created');
}
// .nojekyll чтобы Pages не резал файлы с подчеркиванием
import { writeFileSync } from 'node:fs';
const nojekyll = join(dist, '.nojekyll');
if (!existsSync(dist)) mkdirSync(dist, { recursive: true });
writeFileSync(nojekyll, '');
console.log('pages-fallback: .nojekyll created');
