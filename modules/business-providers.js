// Voltflow3 business discovery providers
// Contract shared by real-time free providers and static open-data indexes.
(function(global) {
  'use strict';

  const SOURCE_TYPES = Object.freeze({
    REAL_TIME: 'real_time',
    STATIC_INDEX: 'static_index',
    IMPORTABLE_DATASET: 'importable_dataset',
    ENRICHMENT: 'enrichment',
    DISABLED: 'disabled',
  });

  const PROVIDER_STATUS = Object.freeze({
    AVAILABLE: 'available',
    UNAVAILABLE: 'unavailable',
    LIMITED: 'limited',
    BLOCKED: 'blocked',
    PENDING_CONFIGURATION: 'pending_configuration',
  });

  const DEFAULT_INDEX_MANIFEST_URL = 'data/business-indexes/manifest.json';

  function getManifestSchemaVersion(manifest = {}) {
    const version = Number(manifest.schemaVersion || 1);
    return Number.isInteger(version) && version > 0 ? version : 1;
  }

  function getPartitionRecordCount(partition = {}) {
    return Number.isInteger(partition.recordCount) ? partition.recordCount : (partition.count || 0);
  }

  function getPartitionLegacySectors(partition = {}) {
    if (Array.isArray(partition.sectors)) return partition.sectors;
    if (Array.isArray(partition.legacySectors)) return partition.legacySectors;
    return [];
  }

  const SOURCE_CATALOG = {
    osm_overpass: {
      id: 'osm_overpass',
      name: 'OpenStreetMap Overpass',
      sourceType: SOURCE_TYPES.REAL_TIME,
      license: 'ODbL 1.0',
      attribution: '© OpenStreetMap contributors',
      verifiedFree: true,
      cors: 'yes',
      credentials: false,
      operational: true,
    },
    diba_gia: {
      id: 'diba_gia',
      name: 'Diputacio de Barcelona GIA',
      sourceType: SOURCE_TYPES.REAL_TIME,
      license: 'CC BY 4.0',
      attribution: 'Diputacio de Barcelona / ajuntaments titulars',
      verifiedFree: true,
      cors: 'yes',
      credentials: false,
      operational: true,
      endpoint: 'https://do.diba.cat/api/dataset/establiments',
    },
    overture_places_static: {
      id: 'overture_places_static',
      name: 'Overture Maps Places index',
      sourceType: SOURCE_TYPES.IMPORTABLE_DATASET,
      license: 'CDLA Permissive 2.0 / source-specific notices',
      attribution: 'Overture Maps Foundation and source contributors',
      verifiedFree: true,
      cors: 'static_files',
      credentials: false,
      operational: false,
      reason: 'Requires offline ETL to generate browser-sized indexes.',
    },
    foursquare_os_places_static: {
      id: 'foursquare_os_places_static',
      name: 'Foursquare OS Places index',
      sourceType: SOURCE_TYPES.IMPORTABLE_DATASET,
      license: 'Apache-2.0 with Foursquare NOTICE',
      attribution: 'Foursquare Labs, Inc.',
      verifiedFree: true,
      cors: 'static_files',
      credentials: true,
      operational: false,
      reason: 'Requires Places Portal access token for dataset download before static index generation.',
    },
    madrid_open_data_static: {
      id: 'madrid_open_data_static',
      name: 'Ayuntamiento de Madrid Censo de Locales index',
      sourceType: SOURCE_TYPES.IMPORTABLE_DATASET,
      license: 'Open data municipal; verify terms in datos.madrid.es',
      attribution: 'Ayuntamiento de Madrid',
      verifiedFree: true,
      cors: 'static_files',
      credentials: false,
      operational: false,
      reason: 'Dataset is large; generate local partitions with ETL before browser use.',
    },
    geofabrik_osm_static: {
      id: 'geofabrik_osm_static',
      name: 'Geofabrik OSM local extract index',
      sourceType: SOURCE_TYPES.IMPORTABLE_DATASET,
      license: 'ODbL 1.0',
      attribution: '© OpenStreetMap contributors / Geofabrik extract',
      verifiedFree: true,
      cors: 'static_files',
      credentials: false,
      operational: false,
      reason: 'Same source as OSM, useful for local availability, not independent coverage.',
    },
    alltheplaces_static: {
      id: 'alltheplaces_static',
      name: 'AllThePlaces index',
      sourceType: SOURCE_TYPES.IMPORTABLE_DATASET,
      license: 'Pending verification per spider/output',
      attribution: 'AllThePlaces and original store sources',
      verifiedFree: false,
      cors: 'static_files',
      credentials: false,
      operational: false,
      reason: 'License and terms must be verified before automatic activation.',
    },
  };

  const CATEGORY_RULES = {
    Dental: [/dent/i, /odont/i],
    Medico: [/clinic|doctor|medical|health|sanitari|metge|medic/i],
    Estetico: [/beauty|bellesa|peluquer|estetic|spa/i],
    Deportivo: [/gym|fitness|sport|deport|esport/i],
    Gestorias: [/gestor|assessor|asesor|administrative and support|contab|fiscal|laboral/i],
    Arquitectos: [/arquitect|architecture|architect/i],
    Aparejadores: [/aparejador|arquitect.*tecnic|technical architect|edificaci/i],
    AdministradoresFincas: [/administraci[oó].*fincas|comunidades|property management/i],
    Inmobiliarias: [/estate|inmobili|real estate|immobili/i],
    Industrial: [/manufactur|industrial|fabricaci|taller|metal|construcci|logistic|warehouse/i],
    Retail: [/retail|comerc|shop|botiga|tienda|store/i],
    Hoteles: [/hotel|hostal|allotjament|lodging|tourism/i],
    Educativo: [/school|educa|univers|academ|colleg|formaci/i],
    Residencias: [/nursing|residenc|sociosanit|geriatr/i],
    Oficinas: [/office|oficina|serveis|servicios|professional/i],
  };

  function normalizeText(value = '') {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(sl|sa|slu|sau|sll|slp|sc|cb|ltd|sociedad|limitada|anonima)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function similarityRatio(a = '', b = '') {
    a = normalizeText(a);
    b = normalizeText(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
    const aw = new Set(a.split(' ').filter(w => w.length > 2));
    const bw = new Set(b.split(' ').filter(w => w.length > 2));
    if (!aw.size || !bw.size) return 0;
    const inter = [...aw].filter(w => bw.has(w)).length;
    return inter / Math.max(aw.size, bw.size);
  }

  function normalizePhone(value = '') {
    return String(value || '').replace(/[^\d]/g, '').replace(/^34/, '').slice(-9);
  }

  function extractDomainSafe(value = '') {
    try {
      if (!value) return '';
      const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
      return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      return '';
    }
  }

  function extractStreetNumber(value = '') {
    const withoutPostcodes = String(value || '').replace(/\b\d{5}\b/g, ' ');
    const numbers = withoutPostcodes.match(/\b\d{1,4}[a-z]?\b/gi) || [];
    return numbers.length ? numbers[0].toLowerCase() : '';
  }

  function extractAddressUnitMap(value = '') {
    const text = String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const units = new Map();
    const patterns = [
      ['unit', /\b(?:local|loc)\.?\s*(?:n(?:um(?:ero)?)?\.?\s*)?([a-z0-9ºª°-]+)/g],
      ['door', /\b(?:puerta|pta)\.?\s*([a-z0-9ºª°-]+)/g],
      ['floor', /\b(?:piso|planta)\.?\s*([a-z0-9ºª°-]+)/g],
      ['stair', /\b(?:escalera|escala|esc)\.?\s*([a-z0-9ºª°-]+)/g],
      ['building', /\b(?:portal|bloque)\.?\s*([a-z0-9ºª°-]+)/g],
    ];
    const canonical = (type, value) => {
      const token = String(value || '').replace(/[.\s_-]+/g, '').replace(/[ºª°]$/g, '');
      if (type === 'floor' && /^(?:bajo|bajos|baix|baixos|bj|bjo)$/.test(token)) return 'ground-floor';
      if (type === 'door') {
        if (/^(?:d|dr|dcha|derecha|dreta)$/.test(token)) return 'right';
        if (/^(?:i|iz|izq|izda|izquierda|esquerra)$/.test(token)) return 'left';
      }
      return token;
    };
    const add = (type, token) => {
      const normalized = canonical(type, token);
      if (!normalized) return;
      if (!units.has(type)) units.set(type, new Set());
      units.get(type).add(normalized);
    };
    for (const [type, pattern] of patterns) {
      for (const match of text.matchAll(pattern)) add(type, match[1]);
    }
    const ground = text.match(/\b(?:bajo|bajos|baix|baixos|bj|bjo)\.?\s*(derecha|dcha|dr|dreta|izquierda|izda|izq|iz|esquerra|[a-z])?\b/);
    if (ground) {
      add('floor', 'ground-floor');
      if (ground[1]) add('door', ground[1]);
    }
    for (const segment of text.split(',').slice(1)) {
      const token = segment.trim().replace(/\s+/g, '');
      const ordinal = token.match(/^(\d{1,2})(?:º|ª|°|o)(dr|dcha|derecha|iz|izq|izda|izquierda|[a-z])?$/);
      if (ordinal) {
        add('floor', ordinal[1]);
        if (ordinal[2]) add('door', ordinal[2]);
        continue;
      }
      const compact = token.match(/^(\d{1,2})(dr|dcha|derecha|iz|izq|izda|izquierda|[a-z])$/);
      if (compact) {
        add('floor', compact[1]);
        add('door', compact[2]);
        continue;
      }
      if (/^(?:dr|dcha|derecha|iz|izq|izda|izquierda|[a-z])$/.test(token)) add('door', token);
    }
    return units;
  }

  function extractAddressUnits(value = '') {
    return [...new Set([...extractAddressUnitMap(value).values()].flatMap(values => [...values]))].sort();
  }

  function hasConflictingAddressUnits(a = {}, b = {}) {
    const mapA = extractAddressUnitMap(a.address || '');
    const mapB = extractAddressUnitMap(b.address || '');
    if (!mapA.size || !mapB.size) return false;
    for (const [type, valuesA] of mapA) {
      const valuesB = mapB.get(type);
      if (valuesB && ![...valuesA].some(value => valuesB.has(value))) return true;
    }
    const unitsA = extractAddressUnits(a.address || '');
    const unitsB = extractAddressUnits(b.address || '');
    return !unitsA.some(unit => unitsB.includes(unit));
  }

  function makeRecordId(providerId, externalId, name, address) {
    return `${providerId}:${externalId || normalizeText(`${name}|${address}`).slice(0, 80)}`;
  }

  function splitLatLng(value = '') {
    const parts = String(value || '').split(',').map(x => parseFloat(x.trim()));
    if (parts.length !== 2 || parts.some(n => !Number.isFinite(n))) return { lat: null, lng: null };
    return { lat: parts[0], lng: parts[1] };
  }

  function classifyRecord(record, segment) {
    const text = normalizeText([
      record.name,
      record.category,
      record.activity,
      record.types,
      ...(record.classifications || []),
    ].join(' '));
    const rules = CATEGORY_RULES[segment] || [];
    if (!rules.length) return { relevance: 'doubtful', evidences: ['sector_without_specific_mapping'] };
    const matched = rules.filter(rx => rx.test(text)).map(rx => String(rx));
    if (matched.length) return { relevance: 'strong', evidences: matched };
    return { relevance: 'doubtful', evidences: [], negativeEvidences: ['no_direct_category_match'] };
  }

  function normalizeDibaElement(el = {}, context = {}) {
    const addr = el.adreca || {};
    const coords = splitLatLng(addr.localitzacio);
    const name = el.nom_comercial || el.rao_social_nom || '';
    const activity = el.descripcio_activitat || el.descripcio_CCAE || el.descripcio_nace || '';
    const source = SOURCE_CATALOG.diba_gia;
    const record = {
      id: makeRecordId('diba_gia', el.id, name, addr.adreca_completa),
      externalIds: { diba_gia: el.id, municipalActivityId: el.id_ac || '' },
      name,
      normalizedName: normalizeText(name),
      legalName: el.rao_social_nom || '',
      taxIdPresent: !!el.rao_social_nif,
      address: addr.adreca_completa || '',
      postalCode: addr.codi_postal || '',
      locality: addr.nom_municipi || '',
      province: 'Barcelona',
      lat: coords.lat,
      lng: coords.lng,
      phones: [],
      phone: '',
      website: '',
      emails: [],
      email: '',
      category: activity,
      activity,
      classifications: [el.sector_economic, el.descripcio_nace, el.descripcio_CCAE].filter(Boolean),
      sourceSector: '',
      segment: '',
      matchedSectors: [],
      foundBy: source.name,
      provider: source.id,
      source: source.id,
      dataSource: source.name,
      dateObtained: new Date().toISOString(),
      dateUpdated: el.data_modificacio || el.data_llic || '',
      confidence: el.nom_comercial ? 0.78 : 0.62,
      license: source.license,
      attribution: source.attribution,
      provenance: [{
        provider: source.id,
        externalId: el.id || '',
        fields: ['name', 'address', 'category', 'coordinates', 'updatedAt'],
        license: source.license,
      }],
      signals: ['Fuente: Diputacio de Barcelona GIA'],
      enrichSource: ['DIBA-GIA'],
      scrapeDiagnostics: [],
      requiresReview: !el.nom_comercial,
    };
    const cls = classifyRecord(record, context.segment || '');
    record.sectorRelevance = cls.relevance;
    record.sectorEvidence = cls.evidences || [];
    record.sectorNegativeEvidence = cls.negativeEvidences || [];
    record.requiresSectorReview = cls.relevance !== 'strong';
    if (cls.relevance === 'strong' && context.segment) record.matchedSectors = [context.segment];
    return record;
  }

  function normalizeStaticRecord(raw = {}, providerId = 'static_index', context = {}) {
    const source = SOURCE_CATALOG[providerId] || { id: providerId, name: providerId, license: raw.license || '', attribution: raw.attribution || '' };
    const phones = [raw.phone, ...(raw.phones || [])].filter(Boolean);
    const emails = [raw.email, ...(raw.emails || [])].filter(Boolean);
    const record = {
      ...raw,
      id: raw.id || makeRecordId(providerId, raw.externalId, raw.name, raw.address),
      externalIds: { ...(raw.externalIds || {}), [providerId]: raw.externalId || raw.id || '' },
      normalizedName: normalizeText(raw.name || ''),
      phones,
      phone: raw.phone || phones[0] || '',
      emails,
      email: raw.email || emails[0] || '',
      sourceSector: raw.sourceSector || raw.segment || '',
      segment: raw.segment || raw.sourceSector || '',
      matchedSectors: Array.isArray(raw.matchedSectors) ? raw.matchedSectors : [],
      foundBy: source.name,
      provider: providerId,
      source: providerId,
      dataSource: source.name,
      dateObtained: raw.dateObtained || new Date().toISOString(),
      confidence: raw.confidence ?? 0.7,
      license: raw.license || source.license || '',
      attribution: raw.attribution || source.attribution || '',
      provenance: raw.provenance || [{
        provider: providerId,
        externalId: raw.externalId || raw.id || '',
        fields: Object.keys(raw).slice(0, 20),
        license: raw.license || source.license || '',
      }],
      signals: raw.signals || [`Fuente: ${source.name}`],
      enrichSource: raw.enrichSource || [source.name],
      scrapeDiagnostics: raw.scrapeDiagnostics || [],
    };
    const cls = classifyRecord(record, context.segment || '');
    record.sectorRelevance = raw.sectorRelevance || cls.relevance;
    record.sectorEvidence = raw.sectorEvidence || cls.evidences || [];
    record.sectorNegativeEvidence = raw.sectorNegativeEvidence || cls.negativeEvidences || [];
    record.requiresSectorReview = record.sectorRelevance !== 'strong';
    if (record.sectorRelevance === 'strong' && context.segment && !record.matchedSectors.includes(context.segment)) {
      record.matchedSectors = [...record.matchedSectors, context.segment];
    }
    return record;
  }

  function isLikelyDuplicate(a = {}, b = {}) {
    const sameExternal = Object.entries(a.externalIds || {}).some(([k, v]) => v && b.externalIds?.[k] === v);
    if (sameExternal) return true;
    if (hasConflictingAddressUnits(a, b)) return false;
    const domainA = extractDomainSafe(a.website || '');
    const domainB = extractDomainSafe(b.website || '');
    const phoneA = normalizePhone(a.phone || a.phones?.[0] || '');
    const phoneB = normalizePhone(b.phone || b.phones?.[0] || '');
    const nameA = normalizeText(a.name || '');
    const nameB = normalizeText(b.name || '');
    const addressA = normalizeText(a.address || '');
    const addressB = normalizeText(b.address || '');
    const nameScore = similarityRatio(nameA, nameB);
    const addressScore = similarityRatio(addressA, addressB);
    const numberA = extractStreetNumber(a.address || '');
    const numberB = extractStreetNumber(b.address || '');
    if (nameA && nameB && nameA === nameB && addressA && addressB && addressA === addressB) return true;
    if (
      nameA && nameB && nameA === nameB &&
      (a.postalCode || '') === (b.postalCode || '') &&
      numberA && numberB && numberA === numberB &&
      addressScore >= 0.55
    ) return true;
    if (
      nameScore >= 0.92 &&
      addressScore >= 0.82 &&
      (a.postalCode || '') === (b.postalCode || '') &&
      numberA && numberB && numberA === numberB
    ) return true;
    const sharedContact = (domainA && domainB && domainA === domainB) || (phoneA && phoneB && phoneA === phoneB);
    if (
      sharedContact && nameScore >= 0.88 && addressScore >= 0.72 &&
      (a.postalCode || '') === (b.postalCode || '') &&
      (!numberA || !numberB || numberA === numberB)
    ) return true;
    return false;
  }

  function branchSnapshot(record = {}) {
    if (!record.address && !record.postalCode && record.lat == null && record.lng == null) return null;
    return {
      address: record.address || '',
      postalCode: record.postalCode || '',
      locality: record.locality || '',
      province: record.province || '',
      lat: record.lat ?? null,
      lng: record.lng ?? null,
      provider: record.provider || record.source || '',
    };
  }

  function mergeRecords(existing = {}, incoming = {}, getMergeableSectors) {
    const merged = { ...existing };
    const prefer = (field) => {
      if (merged[field]) return;
      if (incoming[field]) merged[field] = incoming[field];
    };
    ['name', 'address', 'postalCode', 'locality', 'province', 'website', 'phone', 'email', 'lat', 'lng', 'category', 'activity', 'dateUpdated'].forEach(prefer);
    merged.phones = [...new Set([...(existing.phones || []), existing.phone, ...(incoming.phones || []), incoming.phone].filter(Boolean))];
    merged.emails = [...new Set([...(existing.emails || []), existing.email, ...(incoming.emails || []), incoming.email].filter(Boolean))];
    merged.externalIds = { ...(existing.externalIds || {}), ...(incoming.externalIds || {}) };
    merged.provenance = [...(existing.provenance || []), ...(incoming.provenance || [])];
    merged.sources = [...new Set([...(existing.sources || []), existing.provider, incoming.provider].filter(Boolean))];
    const branches = [...(existing.branches || []), ...(incoming.branches || []), branchSnapshot(existing), branchSnapshot(incoming)]
      .filter(Boolean)
      .filter((branch, index, all) => index === all.findIndex(other =>
        normalizeText(other.address) === normalizeText(branch.address) &&
        String(other.postalCode || '') === String(branch.postalCode || '') &&
        String(other.provider || '') === String(branch.provider || '')
      ));
    merged.branches = branches;
    const sectorsA = typeof getMergeableSectors === 'function' ? getMergeableSectors(existing) : (existing.matchedSectors || []);
    const sectorsB = typeof getMergeableSectors === 'function' ? getMergeableSectors(incoming) : (incoming.matchedSectors || []);
    merged.matchedSectors = [...new Set([...sectorsA, ...sectorsB].filter(Boolean))];
    merged.duplicateCount = (existing.duplicateCount || 0) + 1;
    merged.duplicateReasons = [...new Set([...(existing.duplicateReasons || []), 'multisource_match'])];
    merged.signals = [...new Set([...(existing.signals || []), ...(incoming.signals || [])])];
    merged.enrichSource = [...new Set([...(existing.enrichSource || []), ...(incoming.enrichSource || [])])];
    return merged;
  }

  function duplicateBucketKey(record = {}) {
    const postcode = String(record.postalCode || '').trim();
    const number = extractStreetNumber(record.address || '');
    if (postcode && number) return `${postcode}|${number}`;
    const domain = extractDomainSafe(record.website || '');
    if (domain) return `domain|${domain}`;
    const phone = normalizePhone(record.phone || record.phones?.[0] || '');
    if (phone) return `phone|${phone}`;
    return '';
  }

  function duplicateBucketKeys(record = {}) {
    const keys = [];
    const postcode = String(record.postalCode || '').trim();
    const number = extractStreetNumber(record.address || '');
    const domain = extractDomainSafe(record.website || '');
    const phone = normalizePhone(record.phone || record.phones?.[0] || '');
    if (postcode && number) keys.push(`${postcode}|${number}`);
    if (domain) keys.push(`domain|${domain}`);
    if (phone) keys.push(`phone|${phone}`);
    return [...new Set(keys)];
  }

  function deduplicateMultisource(records = [], opts = {}) {
    const out = [];
    const buckets = new Map();
    for (const record of records) {
      const bucketKeys = duplicateBucketKeys(record);
      const candidateIndexes = bucketKeys.length
        ? [...new Set(bucketKeys.flatMap(key => buckets.get(key) || []))]
        : out.map((_, index) => index);
      const idx = candidateIndexes.find(index => isLikelyDuplicate(out[index], record)) ?? -1;
      if (idx === -1) out.push(record);
      else out[idx] = mergeRecords(out[idx], record, opts.getMergeableSectors);
      const finalIndex = idx === -1 ? out.length - 1 : idx;
      for (const finalBucketKey of duplicateBucketKeys(out[finalIndex])) {
        const bucket = buckets.get(finalBucketKey) || [];
        if (!bucket.includes(finalIndex)) bucket.push(finalIndex);
        buckets.set(finalBucketKey, bucket);
      }
    }
    return out;
  }

  async function loadJson(url, fetchImpl = fetch) {
    const res = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function locationMatches(record, location) {
    const loc = normalizeText(location);
    if (!loc) return true;
    if (/^\d{5}$/.test(String(location).trim())) return String(record.postalCode || '') === String(location).trim();
    const geographicValues = [record.locality, record.province, record.address]
      .map(normalizeText)
      .filter(Boolean);
    if (!geographicValues.length) return false;
    return geographicValues.some(value => value.includes(loc) || (loc.length >= 4 && loc.includes(value)));
  }

  async function searchStaticIndexes(params = {}, opts = {}) {
    const fetchImpl = opts.fetch || fetch;
    const manifestUrl = opts.manifestUrl || DEFAULT_INDEX_MANIFEST_URL;
    let manifest;
    try {
      manifest = await loadJson(manifestUrl, fetchImpl);
    } catch (err) {
      return { status: PROVIDER_STATUS.UNAVAILABLE, reason: 'manifest_not_found', records: [], diagnostics: { error: err.message } };
    }
    const providerIds = opts.providerIds || Object.keys(manifest.providers || {});
    const candidates = [];
    const loaded = [];
    for (const providerId of providerIds) {
      const provider = manifest.providers?.[providerId];
      if (!provider || provider.enabled === false) continue;
      const partitions = provider.partitions || [];
      for (const part of partitions) {
        const locationIsPostcode = /^\d{5}$/.test(String(params.location || '').trim());
        if (locationIsPostcode && part.postalPrefix && !String(params.location || '').startsWith(String(part.postalPrefix))) continue;
        if (!locationIsPostcode && part.locality && normalizeText(params.location) && !normalizeText(part.locality).includes(normalizeText(params.location))) continue;
        const legacySectors = getPartitionLegacySectors(part);
        if (legacySectors.length && params.segment && !legacySectors.includes(params.segment)) continue;
        try {
          const data = await loadJson(part.file, fetchImpl);
          const rows = Array.isArray(data.records) ? data.records : Array.isArray(data) ? data : [];
          loaded.push({ providerId, file: part.file, count: rows.length, declaredCount: getPartitionRecordCount(part) });
          rows
            .map(row => normalizeStaticRecord(row, providerId, { segment: params.segment }))
            .filter(row => locationMatches(row, params.location))
            .filter(row => {
              if (!params.segment) return true;
              if (Array.isArray(row.matchedSectors) && row.matchedSectors.includes(params.segment)) return true;
              return classifyRecord(row, params.segment).relevance === 'strong';
            })
            .forEach(row => candidates.push(row));
        } catch (err) {
          loaded.push({ providerId, file: part.file, error: err.message });
        }
      }
    }
    return {
      status: candidates.length ? PROVIDER_STATUS.AVAILABLE : PROVIDER_STATUS.UNAVAILABLE,
      records: candidates.slice(0, params.maxResults || 50),
      diagnostics: {
        loaded,
        manifestSchemaVersion: getManifestSchemaVersion(manifest),
        manifestVersion: manifest.datasetRelease || manifest.version || '',
      },
      licenseMetadata: manifest.licenseMetadata || {},
    };
  }

  global.VoltflowBusinessProviders = {
    SOURCE_TYPES,
    PROVIDER_STATUS,
    SOURCE_CATALOG,
    CATEGORY_RULES,
    getManifestSchemaVersion,
    getPartitionRecordCount,
    getPartitionLegacySectors,
    normalizeText,
    similarityRatio,
    normalizePhone,
    extractDomainSafe,
    extractStreetNumber,
    extractAddressUnits,
    hasConflictingAddressUnits,
    normalizeDibaElement,
    normalizeStaticRecord,
    classifyRecord,
    deduplicateMultisource,
    mergeRecords,
    isLikelyDuplicate,
    duplicateBucketKey,
    duplicateBucketKeys,
    searchStaticIndexes,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.VoltflowBusinessProviders;
  }
})(typeof window !== 'undefined' ? window : globalThis);
