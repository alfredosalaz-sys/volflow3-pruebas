'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const allFiles = process.argv.includes('--all');
const rootArg = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const root = path.resolve(rootArg || path.join(__dirname, '..'));
const appPath = path.join(root, 'app.html');
const files = new Set(allFiles ? [] : ['app.html', 'index.html', 'version.json']);
const app = fs.readFileSync(appPath, 'utf8');

if (!allFiles) {
  for (const match of app.matchAll(/(?:src|href)="([^"?#]+)[^"]*"/g)) {
    const relative = match[1].replace(/\\/g, '/');
    const filePath = path.join(root, relative);
    if (!/^(?:https?:|data:|#)/.test(relative) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      files.add(relative);
    }
  }
}

function addTree(relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  if (!fs.existsSync(directory)) return;
  for (const name of fs.readdirSync(directory)) {
    const filePath = path.join(directory, name);
    const relative = path.relative(root, filePath).replace(/\\/g, '/');
    if (relative === 'MANIFEST_SHA256.txt' || relative.startsWith('.git/')) continue;
    if (fs.statSync(filePath).isDirectory()) addTree(relative);
    else files.add(relative);
  }
}

if (allFiles) addTree('.');
else addTree('data/business-indexes');
const lines = [...files].sort().map(relative => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
  return `${hash}  ${relative}`;
});
fs.writeFileSync(path.join(root, 'MANIFEST_SHA256.txt'), `${lines.join('\n')}\n`);
console.log(`SHA256 manifest generated: ${lines.length} files`);
