#!/usr/bin/env node
// Auditoría independiente E2. No realiza llamadas a la red ni modifica el proyecto auditado.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(process.argv[2] || process.cwd());
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures.push({name, reason: error.message}); console.error(`FAIL ${name}: ${error.message}`); }
};
const corpus = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/business-coverage/corpus.v1.json'), 'utf8'));
check('No fusionar establecimientos oficiales con unidades distintas', () => {
  const rows = corpus.observations.filter(r => r.sourceId === 'madrid_open_data_activities' && ['280001783','280001784'].includes(r.establishmentId) && r.samplingRole==='source-query');
  assert.equal(rows.length, 2, 'Se esperaban las dos observaciones oficiales de COBOS');
  assert.notEqual(rows[0].address, rows[1].address, 'Los domicilios de unidad deben distinguirse');
  const records=rows.map(r=>({id:r.observationId,name:r.name,address:r.address,postalCode:r.postalCode,locality:r.city,province:r.provinceCode,lat:r.lat,lng:r.lng,provider:r.sourceId,externalIds:{[r.sourceId]:r.establishmentId},matchedSectors:r.canonicalSectorIds,provenance:[{sourceId:r.sourceId,sameEstablishmentGroup:r.labels.sameEstablishmentGroup,observationId:r.observationId}]}));
  const providers=require(path.join(root, 'modules/business-providers.js'));
  const result=providers.deduplicateMultisource(records,{getMergeableSectors:r=>r.matchedSectors||[]});
  assert.equal(result.length, 2, `Deduplicó dos locales como ${result.length}`);
});
check('Construcción del corpus idéntica con UTC y Europe/Madrid',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'voltflow-e2-tz-audit-'));
  try {
    fs.mkdirSync(path.join(temp,'tools'),{recursive:true});
    for(const f of ['build-business-coverage-corpus.cjs','business-coverage-sources.cjs'])
      fs.copyFileSync(path.join(root,'tools',f),path.join(temp,'tools',f));
    fs.cpSync(path.join(root,'tests/fixtures/business-coverage'),path.join(temp,'tests/fixtures/business-coverage'),{recursive:true});
    const output=path.join(temp,'tests/fixtures/business-coverage/corpus.v1.json');
    const hashes={};
    for(const tz of ['UTC','Europe/Madrid']) {
      const run=cp.spawnSync(process.execPath,[path.join(temp,'tools/build-business-coverage-corpus.cjs')],{cwd:temp,env:{...process.env,TZ:tz},timeout:20000,encoding:'utf8'});
      assert.equal(run.status,0,`Fallo en ${tz}: ${run.stderr||run.stdout}`);
      hashes[tz]=crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex');
    }
    assert.equal(hashes.UTC, hashes['Europe/Madrid'],`Hashes diferentes: UTC=${hashes.UTC}; Madrid=${hashes['Europe/Madrid']}`);
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
});
if(failures.length){console.error(`\nRegresiones E2 pendientes: ${failures.length}/2. No avanzar a E3.`);process.exitCode=1;}
else console.log('\nRegresiones E2 adicionales superadas: 2/2. Continuar con el quality gate completo.');
