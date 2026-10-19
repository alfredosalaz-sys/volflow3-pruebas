#!/usr/bin/env node
'use strict';
// Auditoría E2.1: casos sintéticos de identidad física. Solo lectura, ninguna red.
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(process.argv[2] || process.cwd());
const providers = require(path.join(root, 'modules/business-providers.js'));
function sample(address, provider, externalId) {
  return {
    id: `${provider}:${externalId}`,
    name: 'GESTORIA DE EJEMPLO',
    address, postalCode: '28013', locality: 'Madrid', province: '28',
    provider, externalIds: { [provider]: externalId }, matchedSectors: ['Gestorias'],
    website: 'https://ejemplo.test', phone: '910000000',
  };
}
const tests = [
  { name:'Diferentes unidades abreviadas al FINAL (1DR / 1IZ)',
    a:'Calle Mayor 10, 1DR', b:'Calle Mayor 10, 1IZ', want:2 },
  { name:'Diferentes puertas en notacion ordinal (1º D / 1º I)',
    a:'Calle Mayor 10, 1º D', b:'Calle Mayor 10, 1º I', want:2 },
  { name:'Bajo derecha / bajo izquierda',
    a:'Calle Mayor 10, bajo derecha', b:'Calle Mayor 10, bajo izquierda', want:2 },
  { name:'Bajo A / bajo B',
    a:'Calle Mayor 10, bajo A', b:'Calle Mayor 10, bajo B', want:2 },
  { name:'Control: locales explicitos 1 / 2 deben separarse',
    a:'Calle Mayor 10, local 1', b:'Calle Mayor 10, local 2', want:2 },
  { name:'Control: puertas explicitas A / B deben separarse',
    a:'Calle Mayor 10, puerta A', b:'Calle Mayor 10, puerta B', want:2 },
  { name:'Control: misma direccion exacta debe deduplicarse',
    a:'Calle Mayor 10, local 1', b:'Calle Mayor 10, local 1', want:1 },
];
let failed=0;
for (const t of tests) {
  const a=sample(t.a,'fuente_1', '0001');
  const b=sample(t.b,'fuente_2', '0002');
  const got=providers.deduplicateMultisource([a,b],{getMergeableSectors:r=>r.matchedSectors}).length;
  try { assert.equal(got,t.want); console.log('PASS',t.name); }
  catch { failed++; console.error('FAIL',t.name,`=> obtenidos=${got}; esperados=${t.want}`); }
}
console.log(`\nResumen: ${tests.length-failed}/${tests.length} pruebas superadas.`);
if(failed)process.exitCode=1;
