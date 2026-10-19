#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const HARD_LIMITS = Object.freeze({
  maxManifestBytes: 250 * 1024,
  maxPartitionBytes: 1024 * 1024,
  maxPartitionRecords: 10000,
});

const REQUIRED_LEGACY_SECTORS = Object.freeze([
  'Oficinas', 'Gestorias', 'Arquitectos', 'Aparejadores',
  'AdministradoresFincas', 'Inmobiliarias', 'Retail', 'Industrial',
  'Hoteles', 'Educativo', 'Deportivo', 'Cultural', 'Comercial',
  'Residencias', 'Dental', 'Medico', 'Estetico',
]);

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SENSITIVE_KEY_PATTERN = /^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret|client[_-]?secret)$/i;
const SENSITIVE_VALUE_PATTERNS = [
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\bgsk_[0-9A-Za-z]{16,}\b/,
  /\b(?:sk|ghp|github_pat)_[0-9A-Za-z_-]{16,}\b/,
  /\bBearer\s+[0-9A-Za-z._~-]{12,}\b/i,
];

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validDateTime(value) {
  return typeof value === 'string' && value.includes('T') && Number.isFinite(Date.parse(value));
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function validateCatalog(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const manifestRelative = String(options.manifest || 'data/business-indexes/manifest.json').replace(/\\/g, '/');
  const errors = [];
  const warnings = [];
  const checked = { partitions: 0, records: 0, providers: 0, sectors: 0, provinces: 0, municipalities: 0 };
  const fail = (code, location, message) => errors.push({ code, location, message });
  const warn = (code, location, message) => warnings.push({ code, location, message });

  function resolveSafe(relative, location, requiredParent = root) {
    if (typeof relative !== 'string' || !relative.trim()) {
      fail('PATH_REQUIRED', location, 'La ruta debe ser una cadena no vacia.');
      return null;
    }
    const normalized = relative.replace(/\\/g, '/');
    if (path.isAbsolute(relative) || normalized.split('/').includes('..')) {
      fail('PATH_UNSAFE', location, `Ruta absoluta o traversal no permitido: ${relative}`);
      return null;
    }
    const resolved = path.resolve(root, normalized);
    if (!inside(root, resolved) || !inside(requiredParent, resolved)) {
      fail('PATH_OUTSIDE_ROOT', location, `La ruta sale del directorio permitido: ${relative}`);
      return null;
    }
    return resolved;
  }

  function readJson(filePath, location, maxBytes) {
    if (!filePath || !fs.existsSync(filePath)) {
      fail('FILE_MISSING', location, `No existe ${filePath || 'la referencia indicada'}.`);
      return null;
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      fail('FILE_NOT_REGULAR', location, 'La referencia no apunta a un archivo regular.');
      return null;
    }
    if (Number.isFinite(maxBytes) && stat.size > maxBytes) {
      fail('FILE_TOO_LARGE', location, `${stat.size} bytes exceden el limite ${maxBytes}.`);
    }
    try {
      return { value: JSON.parse(fs.readFileSync(filePath, 'utf8')), stat };
    } catch (error) {
      fail('JSON_INVALID', location, error.message);
      return null;
    }
  }

  function findSecrets(value, location, seen = new Set()) {
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return;
    if (typeof value === 'string') {
      if (SENSITIVE_VALUE_PATTERNS.some(pattern => pattern.test(value))) {
        fail('SECRET_VALUE', location, 'Se detecto un patron compatible con una credencial.');
      }
      return;
    }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      const childLocation = `${location}.${key}`;
      if (SENSITIVE_KEY_PATTERN.test(key) && child != null && String(child).trim()) {
        fail('SECRET_FIELD', childLocation, 'Los catalogos no pueden contener credenciales.');
      }
      findSecrets(child, childLocation, seen);
    }
  }

  const manifestPath = resolveSafe(manifestRelative, 'manifest');
  const manifestRead = readJson(manifestPath, 'manifest', HARD_LIMITS.maxManifestBytes);
  if (!manifestRead) return { ok: false, root, manifest: manifestRelative, errors, warnings, checked };
  const manifest = manifestRead.value;
  findSecrets(manifest, 'manifest');

  if (!isObject(manifest)) fail('MANIFEST_TYPE', 'manifest', 'El manifiesto debe ser un objeto JSON.');
  if (manifest.schemaVersion !== 2) fail('SCHEMA_VERSION', 'manifest.schemaVersion', 'E1 exige schemaVersion 2.');
  if (typeof manifest.datasetRelease !== 'string' || !manifest.datasetRelease.trim()) {
    fail('DATASET_RELEASE', 'manifest.datasetRelease', 'datasetRelease es obligatorio.');
  }
  if (!validDateTime(manifest.generatedAt)) fail('DATETIME_INVALID', 'manifest.generatedAt', 'generatedAt debe ser ISO 8601.');
  if (!VERSION_PATTERN.test(String(manifest.taxonomyVersion || ''))) fail('VERSION_INVALID', 'manifest.taxonomyVersion', 'Version semantica invalida.');
  if (!VERSION_PATTERN.test(String(manifest.geographyVersion || ''))) fail('VERSION_INVALID', 'manifest.geographyVersion', 'Version semantica invalida.');

  const appVersionPath = path.join(root, 'version.json');
  if (fs.existsSync(appVersionPath)) {
    try {
      const appVersion = JSON.parse(fs.readFileSync(appVersionPath, 'utf8'));
      if (String(manifest.datasetRelease) === String(appVersion.build || '')) {
        fail('DATASET_RELEASE_EQUALS_BUILD', 'manifest.datasetRelease', 'La version del dataset no puede suplantar el build de la aplicacion.');
      }
    } catch (error) {
      warn('APP_VERSION_UNREADABLE', 'version.json', error.message);
    }
  }

  const limits = isObject(manifest.limits) ? manifest.limits : {};
  for (const [name, hardLimit] of Object.entries(HARD_LIMITS)) {
    const value = limits[name];
    if (!Number.isInteger(value) || value < 1 || value > hardLimit) {
      fail('LIMIT_INVALID', `manifest.limits.${name}`, `Debe ser entero entre 1 y ${hardLimit}.`);
    }
  }
  const effective = {
    maxManifestBytes: Number.isInteger(limits.maxManifestBytes) ? Math.min(limits.maxManifestBytes, HARD_LIMITS.maxManifestBytes) : HARD_LIMITS.maxManifestBytes,
    maxPartitionBytes: Number.isInteger(limits.maxPartitionBytes) ? Math.min(limits.maxPartitionBytes, HARD_LIMITS.maxPartitionBytes) : HARD_LIMITS.maxPartitionBytes,
    maxPartitionRecords: Number.isInteger(limits.maxPartitionRecords) ? Math.min(limits.maxPartitionRecords, HARD_LIMITS.maxPartitionRecords) : HARD_LIMITS.maxPartitionRecords,
  };
  if (manifestRead.stat.size > effective.maxManifestBytes) {
    fail('MANIFEST_TOO_LARGE', 'manifest', `${manifestRead.stat.size} bytes exceden ${effective.maxManifestBytes}.`);
  }

  function readReference(reference, versionField, location) {
    if (!isObject(reference)) {
      fail('REFERENCE_INVALID', location, 'La referencia debe incluir file y version.');
      return null;
    }
    if (!VERSION_PATTERN.test(String(reference.version || ''))) fail('VERSION_INVALID', `${location}.version`, 'Version semantica invalida.');
    if (reference.version !== manifest[versionField]) fail('VERSION_MISMATCH', location, `No coincide con ${versionField}.`);
    const filePath = resolveSafe(reference.file, `${location}.file`);
    const result = readJson(filePath, location, HARD_LIMITS.maxPartitionBytes);
    if (result) findSecrets(result.value, location);
    return result?.value || null;
  }

  const businessIndexesRoot = path.resolve(root, 'data/business-indexes');
  const taxonomy = readReference(manifest.taxonomy, 'taxonomyVersion', 'taxonomy');
  const geography = readReference(manifest.geography, 'geographyVersion', 'geography');
  if (!isObject(manifest.schema) || manifest.schema.version !== '2.0.0') {
    fail('SCHEMA_REFERENCE_INVALID', 'manifest.schema', 'La referencia al esquema debe declarar version 2.0.0.');
  } else {
    const schemaPath = resolveSafe(manifest.schema.file, 'manifest.schema.file', businessIndexesRoot);
    const schemaRead = readJson(schemaPath, 'manifest.schema', HARD_LIMITS.maxPartitionBytes);
    if (schemaRead && schemaRead.value?.properties?.schemaVersion?.const !== 2) {
      fail('SCHEMA_DOCUMENT_INVALID', 'manifest.schema', 'El documento referenciado no define schemaVersion 2.');
    }
  }
  const familyIds = new Set();
  const sectorIds = new Set();
  const sectorFamilies = new Map();
  const legacyValues = new Set();

  if (taxonomy) {
    if (taxonomy.schemaVersion !== 1) fail('TAXONOMY_SCHEMA', 'taxonomy.schemaVersion', 'La taxonomia v1 debe declarar schemaVersion 1.');
    if (taxonomy.taxonomyVersion !== manifest.taxonomyVersion) fail('VERSION_MISMATCH', 'taxonomy.taxonomyVersion', 'No coincide con el manifiesto.');
    if (!Array.isArray(taxonomy.families) || !taxonomy.families.length) fail('FAMILIES_REQUIRED', 'taxonomy.families', 'Debe existir al menos una familia.');
    for (const [index, family] of (taxonomy.families || []).entries()) {
      const location = `taxonomy.families[${index}]`;
      if (!isObject(family) || !ID_PATTERN.test(String(family.id || ''))) fail('ID_INVALID', `${location}.id`, 'ID ASCII estable invalido.');
      else if (familyIds.has(family.id)) fail('DUPLICATE_ID', `${location}.id`, `Familia duplicada: ${family.id}.`);
      else familyIds.add(family.id);
      if (typeof family.label !== 'string' || !family.label.trim()) fail('LABEL_REQUIRED', `${location}.label`, 'La etiqueta es obligatoria.');
    }
    if (!Array.isArray(taxonomy.sectors) || !taxonomy.sectors.length) fail('SECTORS_REQUIRED', 'taxonomy.sectors', 'Debe existir al menos un sector.');
    for (const [index, sector] of (taxonomy.sectors || []).entries()) {
      const location = `taxonomy.sectors[${index}]`;
      if (!isObject(sector) || !ID_PATTERN.test(String(sector.id || ''))) fail('ID_INVALID', `${location}.id`, 'ID ASCII estable invalido.');
      else if (sectorIds.has(sector.id)) fail('DUPLICATE_ID', `${location}.id`, `Sector duplicado: ${sector.id}.`);
      else sectorIds.add(sector.id);
      if (!familyIds.has(sector.familyId)) fail('UNKNOWN_FAMILY', `${location}.familyId`, `Familia desconocida: ${sector.familyId}.`);
      else sectorFamilies.set(sector.id, sector.familyId);
      if (typeof sector.label !== 'string' || !sector.label.trim()) fail('LABEL_REQUIRED', `${location}.label`, 'La etiqueta es obligatoria.');
      if (!Array.isArray(sector.legacyValues) || !sector.legacyValues.length) fail('LEGACY_VALUES_REQUIRED', `${location}.legacyValues`, 'Debe conservar al menos un valor heredado.');
      for (const legacy of sector.legacyValues || []) {
        if (typeof legacy !== 'string' || !legacy.trim()) fail('LEGACY_VALUE_INVALID', `${location}.legacyValues`, 'Valor heredado vacio.');
        else if (legacyValues.has(legacy)) fail('DUPLICATE_LEGACY_VALUE', `${location}.legacyValues`, `Valor heredado ambiguo: ${legacy}.`);
        else legacyValues.add(legacy);
      }
      if (!Array.isArray(sector.aliases)) fail('ALIASES_INVALID', `${location}.aliases`, 'aliases debe ser un array.');
      if (!isObject(sector.sourceMappings)) fail('SOURCE_MAPPINGS_INVALID', `${location}.sourceMappings`, 'sourceMappings debe ser un objeto.');
      if (!['active', 'deprecated'].includes(sector.status)) fail('SECTOR_STATUS_INVALID', `${location}.status`, 'Estado de sector invalido.');
      if (Object.prototype.hasOwnProperty.call(sector, 'requestedSector')) {
        fail('QUERY_CONTAMINATION_FIELD', location, 'El sector solicitado no puede formar parte de la evidencia taxonomica.');
      }
    }
    for (const legacy of REQUIRED_LEGACY_SECTORS) {
      if (!legacyValues.has(legacy)) fail('LEGACY_SECTOR_MISSING', 'taxonomy.sectors', `Falta el sector heredado ${legacy}.`);
    }
    const redirects = isObject(taxonomy.redirects) ? taxonomy.redirects : {};
    for (const [from, to] of Object.entries(redirects)) {
      if (!ID_PATTERN.test(from) || !ID_PATTERN.test(String(to))) fail('REDIRECT_INVALID', `taxonomy.redirects.${from}`, 'Redirect con ID invalido.');
      if (!sectorIds.has(to) && !Object.prototype.hasOwnProperty.call(redirects, to)) fail('REDIRECT_TARGET_UNKNOWN', `taxonomy.redirects.${from}`, `Destino desconocido: ${to}.`);
      const visited = new Set([from]);
      let cursor = to;
      while (Object.prototype.hasOwnProperty.call(redirects, cursor)) {
        if (visited.has(cursor)) { fail('REDIRECT_CYCLE', `taxonomy.redirects.${from}`, 'Ciclo de redirects detectado.'); break; }
        visited.add(cursor);
        cursor = redirects[cursor];
      }
    }
    checked.sectors = sectorIds.size;
  }

  const provinceCodes = new Set();
  const municipalityCodes = new Map();
  if (geography) {
    if (geography.schemaVersion !== 1) fail('GEOGRAPHY_SCHEMA', 'geography.schemaVersion', 'La geografia v1 debe declarar schemaVersion 1.');
    if (geography.geographyVersion !== manifest.geographyVersion) fail('VERSION_MISMATCH', 'geography.geographyVersion', 'No coincide con el manifiesto.');
    for (const [index, province] of (geography.provinces || []).entries()) {
      const location = `geography.provinces[${index}]`;
      if (!/^\d{2}$/.test(String(province?.code || '')) || Number(province.code) < 1 || Number(province.code) > 52) fail('PROVINCE_CODE_INVALID', `${location}.code`, 'Codigo provincial INE invalido.');
      else if (provinceCodes.has(province.code)) fail('DUPLICATE_ID', `${location}.code`, `Provincia duplicada: ${province.code}.`);
      else provinceCodes.add(province.code);
      if (typeof province?.name !== 'string' || !province.name.trim()) fail('NAME_REQUIRED', `${location}.name`, 'Nombre provincial obligatorio.');
      if (!Array.isArray(province?.aliases)) fail('ALIASES_INVALID', `${location}.aliases`, 'aliases debe ser un array.');
    }
    for (let code = 1; code <= 52; code++) {
      const expected = String(code).padStart(2, '0');
      if (!provinceCodes.has(expected)) fail('PROVINCE_MISSING', 'geography.provinces', `Falta la provincia ${expected}.`);
    }
    for (const [index, municipality] of (geography.municipalities || []).entries()) {
      const location = `geography.municipalities[${index}]`;
      const code = String(municipality?.code || '');
      if (!/^\d{5}$/.test(code)) fail('MUNICIPALITY_CODE_INVALID', `${location}.code`, 'Codigo municipal INE invalido.');
      else if (municipalityCodes.has(code)) fail('DUPLICATE_ID', `${location}.code`, `Municipio duplicado: ${code}.`);
      else municipalityCodes.set(code, municipality.provinceCode);
      if (!provinceCodes.has(municipality?.provinceCode)) fail('UNKNOWN_PROVINCE', `${location}.provinceCode`, `Provincia desconocida: ${municipality?.provinceCode}.`);
      if (code.slice(0, 2) !== municipality?.provinceCode) fail('MUNICIPALITY_PROVINCE_MISMATCH', location, 'El municipio no pertenece al codigo provincial declarado.');
      if (typeof municipality?.name !== 'string' || !municipality.name.trim()) fail('NAME_REQUIRED', `${location}.name`, 'Nombre municipal obligatorio.');
      if (!Array.isArray(municipality?.aliases)) fail('ALIASES_INVALID', `${location}.aliases`, 'aliases debe ser un array.');
    }
    checked.provinces = provinceCodes.size;
    checked.municipalities = municipalityCodes.size;
  }

  const licenses = isObject(manifest.licenses) ? manifest.licenses : {};
  const attributions = isObject(manifest.attributions) ? manifest.attributions : {};
  if (!Object.keys(licenses).length) fail('LICENSES_REQUIRED', 'manifest.licenses', 'Debe existir un registro de licencias.');
  if (!Object.keys(attributions).length) fail('ATTRIBUTIONS_REQUIRED', 'manifest.attributions', 'Debe existir un registro de atribuciones.');
  for (const [licenseId, license] of Object.entries(licenses)) {
    if (!ID_PATTERN.test(licenseId) || !isObject(license) || !license.name || !license.url || !license.status) {
      fail('LICENSE_INVALID', `manifest.licenses.${licenseId}`, 'La licencia debe tener ID estable, name, url y status.');
    }
  }
  for (const [attributionId, attribution] of Object.entries(attributions)) {
    if (!ID_PATTERN.test(attributionId) || !isObject(attribution) || !attribution.text) {
      fail('ATTRIBUTION_INVALID', `manifest.attributions.${attributionId}`, 'La atribucion debe tener ID estable y text.');
    }
  }

  function checkLegalRefs(item, location) {
    if (!item?.licenseId || !Object.prototype.hasOwnProperty.call(licenses, item.licenseId)) fail('UNKNOWN_LICENSE', `${location}.licenseId`, `Licencia desconocida: ${item?.licenseId || ''}.`);
    if (!item?.attributionId || !Object.prototype.hasOwnProperty.call(attributions, item.attributionId)) fail('UNKNOWN_ATTRIBUTION', `${location}.attributionId`, `Atribucion desconocida: ${item?.attributionId || ''}.`);
  }

  const partitionFiles = new Set();
  const sourceRecordIds = new Set();
  if (!isObject(manifest.providers)) fail('PROVIDERS_REQUIRED', 'manifest.providers', 'providers debe ser un objeto.');
  for (const [providerId, provider] of Object.entries(manifest.providers || {})) {
    const providerLocation = `manifest.providers.${providerId}`;
    checked.providers++;
    if (!ID_PATTERN.test(providerId.replace(/_/g, '-'))) fail('PROVIDER_ID_INVALID', providerLocation, 'ID de proveedor invalido.');
    if (!isObject(provider)) { fail('PROVIDER_INVALID', providerLocation, 'Proveedor invalido.'); continue; }
    if (typeof provider.enabled !== 'boolean') fail('PROVIDER_ENABLED_INVALID', `${providerLocation}.enabled`, 'enabled debe ser booleano.');
    checkLegalRefs(provider, providerLocation);
    if (!Array.isArray(provider.partitions)) { fail('PARTITIONS_INVALID', `${providerLocation}.partitions`, 'partitions debe ser un array.'); continue; }
    for (const [index, partition] of provider.partitions.entries()) {
      const location = `${providerLocation}.partitions[${index}]`;
      checked.partitions++;
      if (!isObject(partition)) { fail('PARTITION_INVALID', location, 'Particion invalida.'); continue; }
      if (partitionFiles.has(partition.file)) fail('DUPLICATE_PARTITION', `${location}.file`, `Particion repetida: ${partition.file}.`);
      else partitionFiles.add(partition.file);
      if (partition.country !== 'ES') fail('COUNTRY_INVALID', `${location}.country`, 'Solo se admite country ES.');
      if (!provinceCodes.has(partition.provinceCode)) fail('UNKNOWN_PROVINCE', `${location}.provinceCode`, `Provincia desconocida: ${partition.provinceCode}.`);
      if (!Array.isArray(partition.municipalityCodes) || !partition.municipalityCodes.length) fail('MUNICIPALITIES_REQUIRED', `${location}.municipalityCodes`, 'Debe declarar municipios.');
      for (const code of partition.municipalityCodes || []) {
        if (!municipalityCodes.has(code)) fail('UNKNOWN_MUNICIPALITY', `${location}.municipalityCodes`, `Municipio desconocido: ${code}.`);
        else if (municipalityCodes.get(code) !== partition.provinceCode) fail('MUNICIPALITY_PROVINCE_MISMATCH', location, `El municipio ${code} no pertenece a ${partition.provinceCode}.`);
      }
      if (!Array.isArray(partition.sectorIds) || !partition.sectorIds.length) fail('SECTORS_REQUIRED', `${location}.sectorIds`, 'Debe declarar sectores.');
      const expectedFamilies = new Set();
      for (const sectorId of partition.sectorIds || []) {
        if (!sectorIds.has(sectorId)) fail('UNKNOWN_SECTOR', `${location}.sectorIds`, `Sector desconocido: ${sectorId}.`);
        else expectedFamilies.add(sectorFamilies.get(sectorId));
      }
      if (!Array.isArray(partition.sectorFamilies) || !partition.sectorFamilies.length) fail('FAMILIES_REQUIRED', `${location}.sectorFamilies`, 'Debe declarar familias sectoriales.');
      const declaredFamilies = new Set(partition.sectorFamilies || []);
      for (const familyId of declaredFamilies) if (!familyIds.has(familyId)) fail('UNKNOWN_FAMILY', `${location}.sectorFamilies`, `Familia desconocida: ${familyId}.`);
      if ([...expectedFamilies].some(familyId => !declaredFamilies.has(familyId)) || [...declaredFamilies].some(familyId => !expectedFamilies.has(familyId))) {
        fail('SECTOR_FAMILY_MISMATCH', `${location}.sectorFamilies`, 'Las familias no coinciden con los sectores declarados.');
      }
      if (!validDateTime(partition.sourceUpdatedAt)) fail('DATETIME_INVALID', `${location}.sourceUpdatedAt`, 'Fecha de fuente invalida.');
      if (!validDateTime(partition.generatedAt)) fail('DATETIME_INVALID', `${location}.generatedAt`, 'Fecha de generacion invalida.');
      checkLegalRefs(partition, location);
      if (!SHA256_PATTERN.test(String(partition.sha256 || ''))) fail('SHA256_INVALID', `${location}.sha256`, 'SHA256 debe tener 64 caracteres hexadecimales en minuscula.');
      if (!Number.isInteger(partition.bytes) || partition.bytes < 1 || partition.bytes > effective.maxPartitionBytes) fail('PARTITION_SIZE_INVALID', `${location}.bytes`, 'Tamano declarado invalido o excesivo.');
      if (!Number.isInteger(partition.recordCount) || partition.recordCount < 0 || partition.recordCount > effective.maxPartitionRecords) fail('RECORD_COUNT_INVALID', `${location}.recordCount`, 'Numero de registros invalido o excesivo.');

      const partitionPath = resolveSafe(partition.file, `${location}.file`, businessIndexesRoot);
      if (!partitionPath || !fs.existsSync(partitionPath)) { if (partitionPath) fail('FILE_MISSING', `${location}.file`, `No existe ${partition.file}.`); continue; }
      const raw = fs.readFileSync(partitionPath);
      if (raw.length > effective.maxPartitionBytes) fail('PARTITION_TOO_LARGE', location, `${raw.length} bytes exceden ${effective.maxPartitionBytes}.`);
      if (partition.bytes !== raw.length) fail('SIZE_MISMATCH', `${location}.bytes`, `Declarado ${partition.bytes}; real ${raw.length}.`);
      const actualHash = sha256(raw);
      if (partition.sha256 !== actualHash) fail('HASH_MISMATCH', `${location}.sha256`, `Declarado ${partition.sha256}; real ${actualHash}.`);
      let payload;
      try { payload = JSON.parse(raw.toString('utf8')); }
      catch (error) { fail('JSON_INVALID', partition.file, error.message); continue; }
      findSecrets(payload, partition.file);
      const records = Array.isArray(payload) ? payload : payload?.records;
      if (!Array.isArray(records)) { fail('RECORDS_INVALID', partition.file, 'La particion debe contener un array records.'); continue; }
      if (partition.recordCount !== records.length) fail('RECORD_COUNT_MISMATCH', `${location}.recordCount`, `Declarado ${partition.recordCount}; real ${records.length}.`);
      if (records.length > effective.maxPartitionRecords) fail('TOO_MANY_RECORDS', partition.file, `La particion contiene ${records.length} registros.`);
      checked.records += records.length;
      const recordSchemaVersion = partition.recordSchemaVersion || payload?.recordSchemaVersion || 1;
      for (const [recordIndex, record] of records.entries()) {
        const recordLocation = `${partition.file}.records[${recordIndex}]`;
        if (!isObject(record)) { fail('RECORD_INVALID', recordLocation, 'El registro debe ser un objeto.'); continue; }
        const sourceId = record.sourceId || record.sourceProvider || record.provider || providerId;
        const sourceRecordId = record.sourceRecordId || record.externalId || record.id;
        if (!sourceId || !sourceRecordId || !(record.name || record.legalName)) {
          fail('SOURCE_IDENTITY_MISSING', recordLocation, 'Faltan sourceId, sourceRecordId o nombre minimo.');
        } else {
          const compoundId = `${sourceId}:${sourceRecordId}`;
          if (sourceRecordIds.has(compoundId)) fail('DUPLICATE_SOURCE_RECORD', recordLocation, `Identidad de origen duplicada: ${compoundId}.`);
          else sourceRecordIds.add(compoundId);
        }
        if (recordSchemaVersion >= 2) {
          if (Object.prototype.hasOwnProperty.call(record, 'requestedSector')) {
            fail('QUERY_CONTAMINATION_FIELD', recordLocation, 'El sector solicitado no puede almacenarse como evidencia del registro.');
          }
          if (record.entityKind !== 'establishment') fail('ENTITY_KIND_INVALID', `${recordLocation}.entityKind`, 'E1 indexa establecimientos, no entidades juridicas.');
          if (record.country !== 'ES') fail('COUNTRY_INVALID', `${recordLocation}.country`, 'El registro debe declarar ES.');
          if (record.provinceCode !== partition.provinceCode) fail('RECORD_PROVINCE_MISMATCH', `${recordLocation}.provinceCode`, 'Provincia incompatible con la particion.');
          if (!partition.municipalityCodes.includes(record.municipalityCode)) fail('RECORD_MUNICIPALITY_MISMATCH', `${recordLocation}.municipalityCode`, 'Municipio incompatible con la particion.');
          if (!Array.isArray(record.sectorIds) || !record.sectorIds.length || record.sectorIds.some(id => !partition.sectorIds.includes(id))) {
            fail('RECORD_SECTOR_MISMATCH', `${recordLocation}.sectorIds`, 'Sectores incompatibles con la particion.');
          }
        }
      }
    }
  }

  return { ok: errors.length === 0, root, manifest: manifestRelative, errors, warnings, checked };
}

function formatResult(result) {
  const lines = [];
  for (const issue of result.errors) lines.push(`ERROR ${issue.code} ${issue.location}: ${issue.message}`);
  for (const issue of result.warnings) lines.push(`WARN ${issue.code} ${issue.location}: ${issue.message}`);
  const counts = result.checked;
  lines.push(`${result.ok ? 'Business catalog v2 OK' : 'Business catalog v2 FAILED'}: ${counts.providers} providers, ${counts.partitions} partitions, ${counts.records} records, ${counts.sectors} sectors, ${counts.provinces} provinces, ${counts.municipalities} municipalities.`);
  return lines.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const positional = args.filter(arg => !arg.startsWith('--'));
  const result = validateCatalog({ root: positional[0], manifest: positional[1] });
  console.log(json ? JSON.stringify(result, null, 2) : formatResult(result));
  process.exitCode = result.ok ? 0 : 1;
}

module.exports = { HARD_LIMITS, REQUIRED_LEGACY_SECTORS, validateCatalog, formatResult };
