'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');
const files = [
  'app.html',
  'modules/inbox.js',
  'modules/init.js',
  'modules/search.js',
  'modules/ui.js',
  'modules/workflow.js',
];
const markers = ['\u00c2', '\u00c3', '\u00e2\u20ac', '\u00e2\u0153', '\u00e2\u2020', '\u00f0\u0178', '\ufffd'];
const cp1252Bytes = {
  '\u20ac': 0x80, '\u201a': 0x82, '\u0192': 0x83, '\u201e': 0x84,
  '\u2026': 0x85, '\u2020': 0x86, '\u2021': 0x87, '\u02c6': 0x88,
  '\u2030': 0x89, '\u0160': 0x8a, '\u2039': 0x8b, '\u0152': 0x8c,
  '\u017d': 0x8e, '\u2018': 0x91, '\u2019': 0x92, '\u201c': 0x93,
  '\u201d': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97,
  '\u02dc': 0x98, '\u2122': 0x99, '\u0161': 0x9a, '\u203a': 0x9b,
  '\u0153': 0x9c, '\u017e': 0x9e, '\u0178': 0x9f,
};
const decoder = new TextDecoder('utf-8', { fatal: true });
const suspicious = /[\u00c3\u00c2\u00e2\u00f0\u00c5]/;

function score(value) {
  return markers.reduce((total, marker) => total + value.split(marker).length - 1, 0);
}

function decodeChunk(chunk) {
  let decoded = chunk;
  for (let pass = 0; pass < 4 && suspicious.test(decoded); pass++) {
    const bytes = [];
    for (const char of decoded) {
      const code = char.charCodeAt(0);
      if (code <= 0xff) bytes.push(code);
      else if (Object.prototype.hasOwnProperty.call(cp1252Bytes, char)) bytes.push(cp1252Bytes[char]);
      else return decoded;
    }
    let next;
    try { next = decoder.decode(new Uint8Array(bytes)); }
    catch { return decoded; }
    if (!next || next === decoded || next.includes('\ufffd')) return decoded;
    decoded = next;
  }
  return decoded;
}

function repair(value) {
  let output = value;
  for (let pass = 0; pass < 4 && suspicious.test(output); pass++) {
    const next = output.replace(/[\u00c3\u00c2\u00e2\u00f0\u00c5](?:\u00a0|[^\s<>"'=])*/g, decodeChunk);
    if (next === output) break;
    output = next;
  }
  return output;
}

let failed = false;
for (const relative of files) {
  const filename = path.join(root, relative);
  const original = fs.readFileSync(filename, 'utf8');
  const repaired = repair(original);
  const before = score(original);
  const after = score(repaired);
  const changedLines = original.split(/\r?\n/).reduce((count, line, index) => (
    count + (line !== repaired.split(/\r?\n/)[index] ? 1 : 0)
  ), 0);
  console.log(`${relative}: markers ${before} -> ${after}; changed lines ${changedLines}`);
  if (after) {
    repaired.split(/\r?\n/).forEach((line, index) => {
      if (score(line)) console.log(`  remaining ${index + 1}: ${line.trim()}`);
    });
  }
  if (repaired.includes('\ufffd') || after !== 0 || (before > 0 && after >= before) || (before > 0 && repaired === original)) {
    failed = true;
    continue;
  }
  if (apply) fs.writeFileSync(filename, repaired, 'utf8');
}

if (failed) process.exitCode = 1;
else console.log(apply ? 'Mojibake repair applied' : 'Dry run OK; no files written');
