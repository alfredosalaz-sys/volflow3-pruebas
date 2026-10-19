const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
  'app.html',
  ...fs.readdirSync(path.join(root, 'modules'))
    .filter(name => name.endsWith('.js'))
    .map(name => path.join('modules', name)),
];

const badVisiblePrefixes = [
  /^x(?:[\w}`&"'~]|\uFE0F|\s)+[A-ZÁÉÍÓÚÑ¿]/,
  /^S0\uFE0F?\s+[A-ZÁÉÍÓÚÑ¿]/,
  /^º\s+[A-ZÁÉÍÓÚÑ¿]/,
];

const directTextTag = /<(h[1-6]|button|label|option|a|span|p)[^>]*>([^<]{1,240})<\/\1>/g;
const errors = [];

for (const rel of files) {
  const fullPath = path.join(root, rel);
  const text = fs.readFileSync(fullPath, 'utf8');

  for (const match of text.matchAll(directTextTag)) {
    const clean = match[2].replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    if (badVisiblePrefixes.some(regex => regex.test(clean))) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      errors.push(`${rel}:${line} texto visible sospechoso: ${clean}`);
    }
  }

  for (const marker of ['Â', 'Ã', 'â€', 'âœ', 'â†', 'ðŸ', '\uFFFD']) {
    if (text.includes(marker)) errors.push(`${rel}: marcador de codificacion sospechoso ${JSON.stringify(marker)}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('quality-check OK');
