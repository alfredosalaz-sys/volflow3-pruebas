'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const errors = [];
const v = JSON.parse(read('version.json'));
const app = read('app.html');
const index = read('index.html');
const build = String(v.build || '');
if (!/^\d{4}\.\d{2}\.\d{2}\.\d{4}$/.test(build)) errors.push('Build invalida en version.json');
if (!app.includes(`GORDI_APP_BUILD = '${build}'`)) errors.push('app.html no declara el build esperado');
if (!index.includes(`app.html?build=${build}`)) errors.push('index.html no apunta al build esperado');
const assets = [...app.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(m => m[1]).filter(u => /^(?:modules\/|styles\/|workers\/)/.test(u));
for (const u of assets) {
  const [file, query = ''] = u.split('?');
  if (!fs.existsSync(path.join(root, file))) errors.push(`Falta recurso local: ${file}`);
  if (query && /(?:^|&)v=/.test(query) && !query.split('&').includes(`v=${build}`)) errors.push(`Build incoherente: ${u}`);
}
if (!app.includes('modules/state.js')) errors.push('No aparece state.js en app.html');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Release integrity OK: version=${v.version}, build=${build}, resources=${assets.length}`);
