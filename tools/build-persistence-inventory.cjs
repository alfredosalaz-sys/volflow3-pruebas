'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const secure = require(path.join(root, 'modules', 'secure-backup.js'));
const sourceDirs = ['modules'];
const extensions = new Set(['.js', '.cjs', '.html']);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : (extensions.has(path.extname(entry.name)) ? [full] : []);
  });
}

const files = sourceDirs.flatMap(dir => walk(path.join(root, dir))).concat([path.join(root, 'app.html')]);
const release = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
const literalKeys = new Map();
const dynamicPatterns = new Map();
const indexedDatabases = new Map();

function addLiteral(storage, key, file, line) {
  const id = `${storage}:${key}`;
  if (!literalKeys.has(id)) literalKeys.set(id, { storage, key, classification: secure.classifyKey(key), references: [] });
  literalKeys.get(id).references.push({ file: path.relative(root, file).replace(/\\/g, '/'), line });
}

function addPattern(storage, pattern, file, line) {
  const id = `${storage}:${pattern}`;
  if (!dynamicPatterns.has(id)) dynamicPatterns.set(id, { storage, pattern, references: [] });
  dynamicPatterns.get(id).references.push({ file: path.relative(root, file).replace(/\\/g, '/'), line });
}

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const constants = new Map(Array.from(text.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*['\"]([^'\"]+)['\"]/g)).map(match => [match[1], match[2]]));
  for (const [name, value] of constants) {
    if (/^(gordi_|voltium_)/.test(value)) {
      const line = lines.findIndex(item => item.includes(name) && item.includes(value));
      addLiteral('localStorage', value, file, line >= 0 ? line + 1 : 1);
    }
  }
  lines.forEach((line, index) => {
    for (const storage of ['localStorage', 'sessionStorage']) {
      const literal = new RegExp(`${storage}\\.(?:getItem|setItem|removeItem)\\(\\s*['\"]([^'\"]+)['\"]`, 'g');
      let match;
      while ((match = literal.exec(line))) addLiteral(storage, match[1], file, index + 1);
      const template = new RegExp(`${storage}\\.(?:getItem|setItem|removeItem)\\(\\s*\\x60([^\\x60]*\\$\\{[^\\x60]+\\}[^\\x60]*)\\x60`, 'g');
      while ((match = template.exec(line))) addPattern(storage, match[1].replace(/\$\{[^}]+\}/g, '*'), file, index + 1);
      const variable = new RegExp(`${storage}\\.(?:getItem|setItem|removeItem)\\(\\s*([A-Za-z_$][\\w$]*)\\s*[,)]`, 'g');
      while ((match = variable.exec(line))) {
        if (constants.has(match[1])) addLiteral(storage, constants.get(match[1]), file, index + 1);
        else addPattern(storage, `<dynamic:${match[1]}>`, file, index + 1);
      }
    }
    const dbRegex = /indexedDB\.open\(\s*([^,)]+)(?:,\s*([^)]+))?/g;
    let dbMatch;
    while ((dbMatch = dbRegex.exec(line))) {
      const expression = dbMatch[1].trim();
      const literal = expression.match(/^['\"]([^'\"]+)['\"]$/);
      const name = literal ? literal[1] : (constants.get(expression) || null);
      const id = `${path.relative(root, file)}:${name || expression}`;
      if (!indexedDatabases.has(id)) indexedDatabases.set(id, { name, expression, versions: [], references: [] });
      if (dbMatch[2]) indexedDatabases.get(id).versions.push(dbMatch[2].trim());
      indexedDatabases.get(id).references.push({ file: path.relative(root, file).replace(/\\/g, '/'), line: index + 1 });
    }
  });
}

const contract = {
  schema: 'voltflow-persistence-contract',
  schemaVersion: 1,
  generatedAt: `build:${release.build || 'unknown'}`,
  sourceDigest: crypto.createHash('sha256').update(files.sort().map(file => fs.readFileSync(file)).join('\n')).digest('hex'),
  classifications: {
    critical: 'Datos de negocio e historial que no pueden regenerarse.',
    secret: 'Credenciales, tokens, contraseñas y material de autenticación.',
    configuration: 'Preferencias y configuración transportable.',
    recreatable: 'Caché o marcadores que deben reconstruirse desde datos reales.',
    non_transportable: 'Permisos y handles que Chrome exige reautorizar.'
  },
  rules: {
    unknownFields: 'preserve',
    importedReadyMarkers: 'discard_and_rebuild',
    sessionSecrets: 'include_only_with_explicit_consent_and_restore_to_session',
    fileSystemHandles: 'never_serialize_reauthorize_manually',
    cloudSnapshots: 'deny_unencrypted'
  },
  literalKeys: Array.from(literalKeys.values()).sort((a, b) => `${a.storage}:${a.key}`.localeCompare(`${b.storage}:${b.key}`)),
  dynamicPatterns: Array.from(dynamicPatterns.values()).sort((a, b) => a.pattern.localeCompare(b.pattern)),
  indexedDB: Array.from(indexedDatabases.values()),
  supportedFormats: [
    { id: 'secure_v1', restore: 'transactional', secrets: 'AES-256-GCM' },
    { id: 'auto_disk_daily', restore: 'legacy_review_required', secrets: 'may_be_plaintext' },
    { id: 'full_backup_2_9_4', restore: 'legacy_review_required', secrets: 'may_be_plaintext' },
    { id: 'portable', restore: 'legacy_review_required', secrets: 'may_be_plaintext' },
    { id: 'safety_snapshot', restore: 'legacy_review_required', secrets: 'may_be_plaintext' },
    { id: 'legacy_full', restore: 'legacy_review_required', secrets: 'partial' }
  ]
};

const outDir = path.join(root, 'data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'persistence-contract.v1.json'), JSON.stringify(contract, null, 2) + '\n');
const report = {
  generatedAt: contract.generatedAt,
  valuesIncluded: false,
  literalKeyCount: contract.literalKeys.length,
  dynamicPatternCount: contract.dynamicPatterns.length,
  indexedDatabaseCount: contract.indexedDB.length,
  classes: contract.literalKeys.reduce((result, entry) => {
    result[entry.classification] = (result[entry.classification] || 0) + 1;
    return result;
  }, {}),
  uncoveredDynamicReferences: contract.dynamicPatterns.filter(item => item.pattern.startsWith('<dynamic:')).length,
  note: 'Las referencias dinámicas se conservan mediante enumeración en tiempo de ejecución; este informe no contiene valores.'
};
fs.writeFileSync(path.join(root, 'PERSISTENCE_COVERAGE_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Persistence inventory: ${report.literalKeyCount} literal keys, ${report.dynamicPatternCount} dynamic patterns, ${report.indexedDatabaseCount} IndexedDB expressions.`);
