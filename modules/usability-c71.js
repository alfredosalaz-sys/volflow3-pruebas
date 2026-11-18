(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VoltflowUsabilityC71 = api;
  if (root?.document) api.install(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const KEY = 'gordi_saved_lead_views_v1';
  const FIELDS = Object.freeze(['lead-search', 'filter-segment', 'filter-status', 'filter-source', 'filter-score-min', 'filter-date-range', 'filter-next-contact', 'sort-leads']);
  const QUICK = Object.freeze([
    { id: 'pending', label: 'Por contactar', values: { 'filter-status': 'Pendiente', 'sort-leads': 'score' } },
    { id: 'overdue', label: 'Seguimientos vencidos', values: { 'filter-next-contact': 'overdue', 'sort-leads': 'next_contact' } },
    { id: 'high-score', label: 'Prioridad alta', values: { 'filter-score-min': '70', 'sort-leads': 'score' } },
    { id: 'responses', label: 'Con respuesta', values: { 'filter-status': 'Respuesta del cliente', 'sort-leads': 'date' } }
  ]);
  function clean(value, max = 120) { return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
  function normalizeValues(values = {}) { return Object.fromEntries(FIELDS.map(field => [field, clean(values[field], 200)])); }
  function readViews(storage) {
    try {
      const parsed = JSON.parse(storage?.getItem?.(KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, 30).filter(item => item && item.id && item.name).map(item => ({ id: clean(item.id, 80), name: clean(item.name, 60), values: normalizeValues(item.values), updatedAt: item.updatedAt || null }));
    } catch { return []; }
  }
  function writeViews(storage, views) { storage.setItem(KEY, JSON.stringify(views.slice(0, 30))); return views; }
  function saveView(storage, name, values, now = new Date().toISOString()) {
    const label = clean(name, 60); if (!label) return { ok: false, reason: 'name_required' };
    const views = readViews(storage); const existing = views.find(item => item.name.toLowerCase() === label.toLowerCase());
    const item = { id: existing?.id || `view:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom'}`, name: label, values: normalizeValues(values), updatedAt: now };
    const next = [item, ...views.filter(view => view.id !== item.id)]; writeViews(storage, next); return { ok: true, item, views: next };
  }
  function deleteView(storage, id) { const next = readViews(storage).filter(view => view.id !== id); writeViews(storage, next); return next; }
  function capture(document) { return Object.fromEntries(FIELDS.map(id => [id, document.getElementById(id)?.value || ''])); }
  function applyValues(document, values) { for (const [id, value] of Object.entries(normalizeValues(values))) { const element = document.getElementById(id); if (element) element.value = value; } }
  function explainLead(lead = {}) {
    const evidence = [];
    if (lead.email) evidence.push('email corporativo disponible');
    if (lead.phone) evidence.push('telefono disponible');
    if (lead.decision_maker || lead.name) evidence.push('persona de contacto identificada');
    if (Number(lead.ratingCount) > 30) evidence.push('actividad publica con reseñas');
    if (lead.signal || (lead.signals || []).length) evidence.push('señales comerciales registradas');
    const confidence = Number(lead.contactEmailScore || lead.contactPhoneScore || lead.decision_maker_confidence || 0);
    return {
      score: Number.isFinite(Number(lead.score)) ? Number(lead.score) : null,
      scoreLabel: 'Puntuacion operativa; no equivale a probabilidad de contratacion',
      evidence,
      source: clean(lead.source || lead.provider || 'Origen no documentado', 100),
      sourceDate: lead.sourceUpdatedAt || lead.acquiredAt || lead.date || null,
      confidence: confidence > 0 ? Math.min(100, Math.max(0, confidence)) : null
    };
  }
  function node(document, tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text != null) element.textContent = String(text); return element; }
  function refresh(browser) { browser.renderLeads?.(); browser.sfUpdateChips?.('leads'); }
  function renderSavedViews(browser) {
    const host = browser.document.getElementById('leads-saved-views'); if (!host) return;
    host.replaceChildren(); const views = readViews(browser.localStorage);
    const quick = node(browser.document, 'div', 'c71-quick-views');
    for (const preset of QUICK) { const button = node(browser.document, 'button', 'c71-quick-view', preset.label); button.type = 'button'; button.onclick = () => { applyValues(browser.document, {}); applyValues(browser.document, preset.values); refresh(browser); }; quick.append(button); }
    const saved = node(browser.document, 'div', 'c71-saved-view-controls'); const select = node(browser.document, 'select'); select.setAttribute('aria-label', 'Vistas guardadas'); select.append(node(browser.document, 'option', '', 'Vistas guardadas'));
    for (const view of views) { const option = node(browser.document, 'option', '', view.name); option.value = view.id; select.append(option); }
    select.onchange = () => { const view = views.find(item => item.id === select.value); if (view) { applyValues(browser.document, view.values); refresh(browser); } };
    const save = node(browser.document, 'button', 'btn-outline', 'Guardar vista'); save.type = 'button'; save.onclick = () => { const name = browser.prompt('Nombre de la vista:'); if (!name) return; const result = saveView(browser.localStorage, name, capture(browser.document)); if (!result.ok) browser.showToast?.('No se pudo guardar la vista'); else { browser.showToast?.('Vista guardada'); renderSavedViews(browser); } };
    const remove = node(browser.document, 'button', 'btn-icon', 'Eliminar'); remove.type = 'button'; remove.title = 'Eliminar la vista seleccionada'; remove.disabled = !views.length; remove.onclick = () => { if (!select.value) return; deleteView(browser.localStorage, select.value); renderSavedViews(browser); browser.showToast?.('Vista eliminada'); };
    const work = node(browser.document, 'button', 'btn-outline', 'Trabajo comercial'); work.type = 'button'; work.onclick = () => browser.showView('commercial-integration-c7');
    saved.append(select, save, remove, work); host.append(quick, saved);
  }
  function renderLeadContext(browser, lead) {
    const host = browser.document.getElementById('lead-data-quality-c71'); if (!host) return;
    const info = explainLead(lead); host.replaceChildren(); const header = node(browser.document, 'div', 'c71-evidence-head'); header.append(node(browser.document, 'strong', '', 'Por que se prioriza'), node(browser.document, 'span', '', info.score == null ? 'Sin puntuacion' : `${info.score} puntos`));
    const description = node(browser.document, 'p', '', info.scoreLabel); const facts = node(browser.document, 'ul'); (info.evidence.length ? info.evidence : ['sin señales suficientes para explicar la prioridad']).forEach(value => facts.append(node(browser.document, 'li', '', value)));
    const provenance = node(browser.document, 'div', 'c71-provenance'); provenance.append(node(browser.document, 'span', '', `Origen: ${info.source}`), node(browser.document, 'span', '', info.sourceDate ? `Fecha: ${new Date(info.sourceDate).toLocaleDateString('es-ES')}` : 'Fecha no disponible'), node(browser.document, 'span', '', info.confidence == null ? 'Fiabilidad no cuantificada' : `Confianza declarada: ${info.confidence}%`));
    const actions = node(browser.document, 'div', 'c71-context-actions'); const work = node(browser.document, 'button', 'btn-outline', 'Ver trabajo pendiente'); work.type = 'button'; work.onclick = () => { browser.closeLead?.(); browser.showView('commercial-integration-c7'); }; const opportunities = node(browser.document, 'button', 'btn-outline', 'Ver oportunidades'); opportunities.type = 'button'; opportunities.onclick = () => { browser.closeLead?.(); browser.showView('opportunities'); }; actions.append(work, opportunities);
    host.append(header, description, facts, provenance, actions);
  }
  function install(browser) {
    browser.renderSavedLeadViewsC71 = () => renderSavedViews(browser);
    browser.renderLeadContextC71 = lead => renderLeadContext(browser, lead);
    browser.addEventListener?.('DOMContentLoaded', () => renderSavedViews(browser));
    browser.addEventListener?.('storage', event => { if (event.key === KEY) renderSavedViews(browser); });
    return { renderSavedViews: browser.renderSavedLeadViewsC71, renderLeadContext: browser.renderLeadContextC71 };
  }
  return Object.freeze({ KEY, FIELDS, QUICK, normalizeValues, readViews, saveView, deleteView, explainLead, install });
});
