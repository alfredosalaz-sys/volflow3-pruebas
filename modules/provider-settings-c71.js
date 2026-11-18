(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VoltflowProviderSettingsC71 = api;
  if (root?.document) api.install(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const SCHEMA = 'voltflow-provider-settings-c71';
  const PROVIDER_LABELS = Object.freeze({ gemini: 'Gemini Free', groq: 'Groq Free', openrouter: 'OpenRouter Free' });
  const REASON_LABELS = Object.freeze({
    provider_disabled: 'Desactivado', session_confirmation_required: 'Requiere autorizacion de sesion',
    session_confirmation_expired: 'Autorizacion caducada', key_not_confirmed_for_session: 'Clave cambiada; vuelve a autorizar',
    missing_key: 'Sin clave', minute_limit: 'Limite local por minuto', session_limit: 'Limite local de sesion',
    day_limit: 'Limite local diario', month_limit: 'Limite local mensual', provider_cooldown: 'En espera tras limite',
    concurrency_limit: 'Solicitud en curso', paid_or_unverified_model_blocked: 'Modelo no permitido'
  });
  const LEGACY_INTEGRATIONS = Object.freeze([
    { id: 'google_places', label: 'Google Places', key: 'gordi_api_key', policy: 'Bloqueado por ZERO_COST_MODE' },
    { id: 'hunter', label: 'Hunter.io', key: 'gordi_hunter_key', policy: 'Configuracion heredada; no activacion automatica' },
    { id: 'apollo', label: 'Apollo.io', key: 'gordi_apollo_key', policy: 'Configuracion heredada; no activacion automatica' },
    { id: 'github', label: 'GitHub', key: 'gordi_gh_token', policy: 'Snapshots en claro bloqueados' },
    { id: 'jsonbin', label: 'JSONBin', key: 'gordi_jsonbin_key', policy: 'Snapshots en claro bloqueados' },
    { id: 'sheets', label: 'Google Sheets', key: 'gordi_sheets_token', policy: 'Requiere autorizacion independiente' }
  ]);
  const NO_KEY_SERVICES = Object.freeze([
    { label: 'Indices locales', status: 'Disponible sin clave' },
    { label: 'OpenStreetMap / Overpass', status: 'Sin clave; enriquecimiento opcional' },
    { label: 'DIBA GIA', status: 'Sin clave; en cuarentena geografica' },
    { label: 'Plantillas locales', status: 'Disponible sin IA ni red' }
  ]);

  function node(document, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = String(text);
    return element;
  }
  function statusText(item) {
    if (!item.configured) return 'Sin clave';
    if (!item.enabled) return 'Desactivado';
    if (!item.ok) return REASON_LABELS[item.reason] || `Bloqueado: ${item.reason || 'sin autorizacion'}`;
    if (item.limited) return 'Limite temporal';
    return 'Autorizado para esta sesion';
  }
  function movePriority(settings, provider, direction) {
    const priority = [...settings.priority];
    const index = priority.indexOf(provider);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= priority.length) return settings;
    [priority[index], priority[next]] = [priority[next], priority[index]];
    return { ...settings, priority };
  }
  function integrationInventory(storage) {
    return LEGACY_INTEGRATIONS.map(item => ({
      id: item.id, label: item.label, configured: !!storage?.getItem?.(item.key), policy: item.policy
    }));
  }
  function providerSnapshot(gateway) {
    const status = gateway?.status?.() || {};
    const settings = gateway?.getProviderSettings?.() || { priority: [], providers: {} };
    return settings.priority.map((provider, index) => ({ provider, priority: index + 1, settings: settings.providers[provider], status: status[provider] || {} }));
  }

  function install(browser) {
    const render = () => {
      const host = browser.document.getElementById('provider-settings-c71-root');
      const gateway = browser.VoltflowAIGateway;
      if (!host) return;
      host.replaceChildren();
      const header = node(browser.document, 'header', 'c71-provider-header');
      const title = node(browser.document, 'div');
      title.append(node(browser.document, 'p', 'c71-kicker', 'Coste cero y privacidad'), node(browser.document, 'h1', '', 'Inteligencia y proveedores'), node(browser.document, 'p', 'c71-subtitle', 'Claves, autorizaciones y prioridades en un unico lugar.'));
      const zero = node(browser.document, 'span', 'c71-zero-seal', 'ZERO_COST_MODE activo');
      header.append(title, zero); host.append(header);
      if (!gateway) { host.append(node(browser.document, 'div', 'c71-provider-error', 'La pasarela de IA no esta disponible. No se habilito ningun proveedor.')); return; }

      const notice = node(browser.document, 'section', 'c71-policy-strip');
      notice.append(node(browser.document, 'strong', '', 'Guardar una clave no autoriza llamadas.'), node(browser.document, 'span', '', 'Cada proveedor requiere aprobacion por sesion. Voltflow no puede verificar la facturacion de tu cuenta ni confirma un coste real de 0 EUR.'));
      host.append(notice);

      const list = node(browser.document, 'section', 'c71-provider-list');
      for (const item of providerSnapshot(gateway)) {
        const cfg = gateway.providers[item.provider];
        const row = node(browser.document, 'article', `c71-provider-row ${item.status.ok ? 'is-ready' : 'is-blocked'}`);
        row.dataset.provider = item.provider;
        const identity = node(browser.document, 'div', 'c71-provider-identity');
        identity.append(node(browser.document, 'span', 'c71-priority', String(item.priority).padStart(2, '0')), node(browser.document, 'strong', '', PROVIDER_LABELS[item.provider] || item.provider), node(browser.document, 'small', '', cfg.officialPlan));
        const state = node(browser.document, 'div', 'c71-provider-state');
        state.append(node(browser.document, 'span', `c71-status ${item.status.ok ? 'is-ready' : 'is-blocked'}`, statusText({ ...item.status, enabled: item.settings?.enabled !== false })), node(browser.document, 'small', '', item.status.configured ? `${item.status.masked} - ${item.status.persistence === 'persistent' ? 'guardada en este navegador' : 'solo esta sesion'}` : 'No hay credencial almacenada'));
        const model = node(browser.document, 'div', 'c71-provider-model');
        model.append(node(browser.document, 'span', '', 'Modelo permitido'), node(browser.document, 'code', '', item.settings?.model || cfg.model), node(browser.document, 'small', '', `Limites locales: ${cfg.localLimits.minute}/min, ${cfg.localLimits.day}/dia. No son cuota confirmada del proveedor.`));
        const keyArea = node(browser.document, 'div', 'c71-key-editor');
        const input = node(browser.document, 'input'); input.type = 'password'; input.autocomplete = 'off'; input.placeholder = 'Introducir o reemplazar clave'; input.setAttribute('aria-label', `Clave ${PROVIDER_LABELS[item.provider]}`);
        const reveal = node(browser.document, 'button', 'btn-icon', 'Ver'); reveal.type = 'button'; reveal.title = 'Mostrar u ocultar la clave escrita'; reveal.onclick = () => { input.type = input.type === 'password' ? 'text' : 'password'; reveal.textContent = input.type === 'password' ? 'Ver' : 'Ocultar'; };
        const persistentLabel = node(browser.document, 'label', 'c71-persist-choice'); const persistent = node(browser.document, 'input'); persistent.type = 'checkbox'; persistentLabel.append(persistent, node(browser.document, 'span', '', 'Conservar entre sesiones'));
        const save = node(browser.document, 'button', 'btn-primary', 'Guardar'); save.type = 'button'; save.onclick = () => {
          if (persistent.checked && !browser.confirm('Una clave persistente queda accesible para scripts y extensiones con acceso a esta pagina. Se incluira solo en backups completos cifrados. Confirmas que deseas conservarla?')) return;
          const result = gateway.setKey(item.provider, input.value, { persistence: persistent.checked ? 'persistent' : 'session' });
          if (!result.ok) { browser.showToast?.(`Clave no guardada: ${result.reason}`); return; }
          input.value = ''; browser.showToast?.('Clave guardada y proveedor bloqueado hasta nueva autorizacion'); render();
        };
        const remove = node(browser.document, 'button', 'btn-outline', 'Eliminar'); remove.type = 'button'; remove.disabled = !item.status.configured; remove.onclick = () => { if (!browser.confirm(`Eliminar la clave de ${PROVIDER_LABELS[item.provider]} de sesion y almacenamiento persistente?`)) return; gateway.removeKey(item.provider); render(); };
        keyArea.append(input, reveal, persistentLabel, save, remove);
        const controls = node(browser.document, 'div', 'c71-provider-controls');
        const enabledLabel = node(browser.document, 'label', 'c71-toggle'); const enabled = node(browser.document, 'input'); enabled.type = 'checkbox'; enabled.checked = item.settings?.enabled !== false; enabled.onchange = () => { const settings = gateway.getProviderSettings(); settings.providers[item.provider].enabled = enabled.checked; gateway.setProviderSettings(settings); render(); }; enabledLabel.append(enabled, node(browser.document, 'span', '', 'Disponible para seleccion'));
        const up = node(browser.document, 'button', 'btn-icon', 'Subir'); up.type = 'button'; up.title = 'Aumentar prioridad'; up.disabled = item.priority === 1; up.onclick = () => { gateway.setProviderSettings(movePriority(gateway.getProviderSettings(), item.provider, -1)); render(); };
        const down = node(browser.document, 'button', 'btn-icon', 'Bajar'); down.type = 'button'; down.title = 'Reducir prioridad'; down.disabled = item.priority === gateway.getProviderSettings().priority.length; down.onclick = () => { gateway.setProviderSettings(movePriority(gateway.getProviderSettings(), item.provider, 1)); render(); };
        const approve = node(browser.document, 'button', 'btn-outline', item.status.ok ? 'Revocar sesion' : 'Autorizar sesion'); approve.type = 'button'; approve.disabled = !item.status.configured || item.settings?.enabled === false; approve.onclick = () => { if (item.status.ok) browser.revokeAIFreeAccount?.(item.provider); else browser.confirmAIFreeAccount?.(item.provider); render(); };
        controls.append(enabledLabel, up, down, approve);
        const telemetry = item.status.telemetry || {}; const observed = node(browser.document, 'div', 'c71-provider-observed');
        observed.append(node(browser.document, 'span', '', telemetry.reportedQuotaSource === 'response_headers' ? 'Cuota observada en respuesta del proveedor' : 'Sin cuota confirmada por proveedor'), node(browser.document, 'small', '', telemetry.lastError ? `Ultimo error: ${telemetry.lastError}` : 'Conexion no verificada desde esta pantalla'));
        row.append(identity, state, model, keyArea, controls, observed); list.append(row);
      }
      host.append(list);

      const lower = node(browser.document, 'div', 'c71-provider-lower');
      const noKey = node(browser.document, 'section', 'c71-provider-section'); noKey.append(node(browser.document, 'h2', '', 'Servicios sin clave'));
      for (const item of NO_KEY_SERVICES) { const row = node(browser.document, 'div', 'c71-simple-row'); row.append(node(browser.document, 'strong', '', item.label), node(browser.document, 'span', '', item.status)); noKey.append(row); }
      const inherited = node(browser.document, 'section', 'c71-provider-section'); inherited.append(node(browser.document, 'h2', '', 'Integraciones heredadas'));
      for (const item of integrationInventory(browser.localStorage)) { const row = node(browser.document, 'div', 'c71-simple-row'); const copy = node(browser.document, 'div'); copy.append(node(browser.document, 'strong', '', item.label), node(browser.document, 'small', '', item.policy)); row.append(copy, node(browser.document, 'span', item.configured ? 'is-configured' : '', item.configured ? 'Configurada' : 'Sin credencial')); inherited.append(row); }
      const legacy = node(browser.document, 'button', 'btn-outline', 'Abrir ajustes avanzados'); legacy.type = 'button'; legacy.onclick = () => browser.showView('settings'); inherited.append(legacy);
      lower.append(noKey, inherited); host.append(lower);
    };
    browser.renderProviderSettingsC71 = render;
    browser.addEventListener?.('storage', event => { if (event.key === 'gordi_ai_provider_settings_v1' && browser.document.getElementById('provider-settings-view')?.classList.contains('active')) render(); });
    return { render };
  }

  return Object.freeze({ SCHEMA, PROVIDER_LABELS, LEGACY_INTEGRATIONS, NO_KEY_SERVICES, statusText, movePriority, integrationInventory, providerSnapshot, install });
});
