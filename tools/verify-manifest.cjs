'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const manifestPath = path.join(root, 'MANIFEST_SHA256.txt');
const lines = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/).filter(Boolean);
const seen = new Set();
const errors = [];

for (const line of lines) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/i);
  if (!match) {
    errors.push(`Formato invalido: ${line}`);
    continue;
  }
  const expected = match[1].toLowerCase();
  const relative = match[2].replace(/\\/g, '/');
  const filePath = path.resolve(root, relative);
  if (seen.has(relative)) errors.push(`Entrada duplicada: ${relative}`);
  seen.add(relative);
  if (filePath === manifestPath || !filePath.startsWith(root + path.sep)) {
    errors.push(`Ruta no permitida: ${relative}`);
    continue;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    errors.push(`Archivo ausente: ${relative}`);
    continue;
  }
  const actual = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  if (actual !== expected) errors.push(`SHA256 incorrecto: ${relative}`);
}

if (!lines.length) errors.push('Manifiesto vacio');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`SHA256 manifest OK: ${lines.length} files`);
