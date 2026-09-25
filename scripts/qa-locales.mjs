// QA: сверка ключей t('...') в коде с ru/en словарями.
// Запуск: node scripts/qa-locales.mjs (exit 1, если есть missing)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f)) files.push(p);
  }
})('src');

const staticKeys = new Set();
const dynPrefixes = new Set();
for (const f of files) {
  const code = readFileSync(f, 'utf8');
  const re1 = /\bt\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re1.exec(code)) !== null) staticKeys.add(m[1]);
  const re2 = /\bt\(\s*`([^`$]+)/g;
  while ((m = re2.exec(code)) !== null) dynPrefixes.add(m[1]);
}

const flat = (o, p = '', out = {}) => {
  for (const k of Object.keys(o)) {
    const key = p ? p + '.' + k : k;
    if (o[k] && typeof o[k] === 'object') flat(o[k], key, out);
    else out[key] = true;
  }
  return out;
};

let fail = 0;
for (const lng of ['ru', 'en']) {
  const json = flat(JSON.parse(readFileSync('src/i18n/locales/' + lng + '.json', 'utf8')));
  const keys = Object.keys(json);
  const missing = [...staticKeys].filter((k) => !json[k] && ![...dynPrefixes].some((dp) => k.startsWith(dp)));
  const uncoveredDyn = [...dynPrefixes].filter((dp) => !keys.some((k) => k.startsWith(dp)));
  const unused = keys.filter(
    (k) => !staticKeys.has(k) && ![...dynPrefixes].some((dp) => k.startsWith(dp))
  );
  console.log('=== ' + lng + ' ===');
  console.log('MISSING(' + missing.length + '): ' + JSON.stringify(missing));
  console.log('DYN-UNCOVERED(' + dynPrefixes.size + ' prefixes): ' + JSON.stringify(uncoveredDyn));
  console.log('UNUSED(' + unused.length + '): ' + JSON.stringify(unused));
  if (missing.length > 0 || uncoveredDyn.length > 0) fail = 1;
}
// Проверка динамических значений: какие литералы подставляются в t(`prefix.${x}`)
console.log('--- dynamic call sites ---');
for (const f of files) {
  const code = readFileSync(f, 'utf8');
  const re = /\bt\(`([^`]+)`/g;
  let m;
  while ((m = re.exec(code)) !== null) console.log(f + ' :: t(`' + m[1] + '`)');
}
process.exit(fail);
