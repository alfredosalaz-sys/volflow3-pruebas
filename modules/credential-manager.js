(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VoltflowCredentialManager = api;
  if (root?.document) api.install(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SERVICE_REGISTRY = Object.freeze([
    Object.freeze({ id: 'gemini', group: 'ai', label: 'Gemini Free', description: 'Modelo permitido: gemini-2.5-flash-lite', fields: Object.freeze([{ name: 'key', label: 'API key', storageKey: 'gordi_gemini_key', required: true, type: 'password' }]), links: Object.freeze([{ label: 'Crear clave', href: 'https://ai.google.dev/gemini-api/docs/api-key' }]) }),
    Object.freeze({ id: 'groq', group: 'ai', label: 'Groq Free', description: 'Respaldo de IA sujeto a los límites gratuitos del proveedor', fields: Object.freeze([{ name: 'key', label: 'API key', storageKey: 'gordi_groq_key', required: true, type: 'password' }]), links: Object.freeze([{ label: 'Crear clave', href: 'https://console.groq.com/keys' }]) }),
    Object.freeze({ id: 'openrouter', group: 'ai', label: 'OpenRouter Free', description: 'Último respaldo, limitado a modelos :free', fields: Object.freeze([{ name: 'key', label: 'API key', storageKey: 'gordi_openrouter_key', required: true, type: 'password' }]), links: Object.freeze([{ label: 'Crear clave', href: 'https://openrouter.ai/settings/keys' }]) }),
    Object.freeze({ id: 'emailjs', group: 'email', label: 'EmailJS', description: 'Envío directo de alertas por EmailJS', fields: Object.freeze([
      { name: 'toEmail', label: 'Email de destino', storageKey: 'gordi_ejs_to', required: true, type: 'email', domId: 'ejs-to-email' },
      { name: 'serviceId', label: 'Service ID', storageKey: 'gordi_ejs_service', required: true, type: 'text', domId: 'ejs-service-id' },
      { name: 'templateId', label: 'Template ID', storageKey: 'gordi_ejs_template', required: true, type: 'text', domId: 'ejs-template-id' },
      { name: 'publicKey', label: 'Public Key', storageKey: 'gordi_ejs_key', required: true, type: 'password', domId: 'ejs-public-key' }
    ]), links: Object.freeze([{ label: 'Crear cuenta', href: 'https://dashboard.emailjs.com/admin' }]) }),
    Object.freeze({ id: 'gmail', group: 'email', label: 'Gmail OAuth', description: 'Autorización Google para enviar alertas', fields: Object.freeze([
      { name: 'email', label: 'Email de destino', storageKey: 'gordi_gmail_email', required: true, type: 'email', domId: 'gmail-alert-email' },
      { name: 'clientId', label: 'OAuth Client ID', storageKey: 'gordi_gmail_client_id', required: true, type: 'text', domId: 'gmail-client-id' }
    ]), links: Object.freeze([{ label: 'Crear credenciales', href: 'https://console.cloud.google.com/apis/credentials' }]) }),
    Object.freeze({ id: 'sheets', group: 'data', label: 'Google Sheets', description: 'Sincronización opcional con una hoja propia', fields: Object.freeze([
      { name: 'spreadsheetId', label: 'Spreadsheet ID', storageKey: 'gordi_sheets_id', required: true, type: 'text', domId: 'sheets-id-input' },
      { name: 'clientId', label: 'OAuth Client ID', storageKey: 'gordi_sheets_client_id', required: true, type: 'text', domId: 'sheets-client-input' }
    ]), links: Object.freeze([
      { label: 'Crear hoja', href: 'https://sheets.google.com/create' },
      { label: 'Crear OAuth', href: 'https://console.cloud.google.com/apis/credentials' }
    ]) })
  ]);

  const SERVICE_BY_ID = Object.freeze(Object.fromEntries(SERVICE_REGISTRY.map(service => [service.id, service])));
  const AI_IDS = new Set(['gemini', 'groq', 'openrouter']);

  function environment(input = {}) {
    const browser = input.browser || (typeof globalThis !== 'undefined' ? globalThis : {});
    return {
      browser,
      localStorage: input.localStorage || browser.localStorage,
      sessionStorage: input.sessionStorage || browser.sessionStorage,
      gateway: input.gateway || browser.VoltflowAIGateway,
      now: input.now || (() => Date.now()),
      confirm: input.confirm || browser.confirm?.bind(browser) || (() => true)
    };
  }

  function read(storage, key) {
    return String(storage?.getItem?.(key) || '').trim();
  }

  function missingFields(service, env) {
    return service.fields.filter(field => field.required && !read(env.localStorage, field.storageKey));
  }

  function result(status, configured, connected, detail) {
    return { status, configured, connected, detail };
  }

  function getServiceState(id, input = {}) {
    const service = SERVICE_BY_ID[id];
    if (!service) return result('not_configured', false, false, 'Servicio desconocido');
    const env = environment(input);
    if (AI_IDS.has(id)) {
      const storageKey = service.fields[0].storageKey;
      const metadata = env.gateway?.keyMetadata?.(id);
      const configured = !!metadata?.configured || !!read(env.sessionStorage, storageKey) || !!read(env.localStorage, storageKey);
      if (!configured) return result('not_configured', false, false, 'Sin clave');
      const live = env.gateway?.status?.()?.[id] || {};
      if (live.ok) return result('connected', true, true, 'Autorizado para esta sesión');
      if (live.reason === 'session_confirmation_required' || live.reason === 'session_confirmation_expired' || live.reason === 'key_not_confirmed_for_session') {
        return result('session_authorization_required', true, false, 'Clave guardada; falta autorizar esta sesión');
      }
      return result('configured_unverified', true, false, 'Clave guardada; conexión no verificada');
    }

    const missing = missingFields(service, env);
    const present = service.fields.length - missing.length;
    if (!present) return result('not_configured', false, false, 'Sin configurar');
    if (missing.length) return result('incomplete', false, false, `Faltan ${missing.map(field => field.label).join(' y ')}`);

    if (id === 'emailjs') return result('configured_unverified', true, false, 'Configuración completa; envío no verificado');
    if (id === 'gmail') {
      const token = read(env.localStorage, 'gordi_gmail_token');
      if (!token) return result('configured_unverified', true, false, 'Credenciales guardadas; falta autorizar Google');
      const timestamp = Number(read(env.localStorage, 'gordi_gmail_token_ts') || 0);
      if (!timestamp || env.now() - timestamp >= 3_500_000) return result('token_expired', true, false, 'Autorización caducada; vuelve a conectar');
      return result('connected', true, true, 'Autorización activa');
    }
    if (id === 'sheets') {
      const token = read(env.localStorage, 'gordi_sheets_token');
      if (!token) return result('configured_unverified', true, false, 'Hoja configurada; falta autorizar Google');
      const expiry = Number(read(env.localStorage, 'gordi_sheets_token_expiry') || 0);
      if (!expiry || expiry <= env.now()) return result('token_expired', true, false, 'Autorización caducada; vuelve a conectar');
      return result('connected', true, true, 'Hoja conectada');
    }
    return result('configured_unverified', true, false, 'Configuración guardada');
  }

  function saveService(id, values = {}, input = {}) {
    const service = SERVICE_BY_ID[id];
    if (!service) return { ok: false, reason: 'unknown_service' };
    const env = environment(input);
    if (AI_IDS.has(id)) {
      const key = String(values.key || '').trim();
      if (!key) return { ok: false, reason: 'missing_key' };
      if (!env.gateway?.setKey) return { ok: false, reason: 'gateway_unavailable' };
      return env.gateway.setKey(id, key, { persistence: values.persistent ? 'persistent' : 'session' });
    }
    const normalized = Object.fromEntries(service.fields.map(field => {
      const supplied = String(values[field.name] || '').trim();
      const value = !supplied && field.type === 'password' ? read(env.localStorage, field.storageKey) : supplied;
      return [field.name, value];
    }));
    const missing = service.fields.filter(field => field.required && !normalized[field.name]);
    if (missing.length) return { ok: false, reason: 'missing_fields', fields: missing.map(field => field.name) };
    for (const field of service.fields) env.localStorage?.setItem?.(field.storageKey, normalized[field.name]);
    if (id === 'emailjs') env.localStorage?.setItem?.('gordi_email_method', 'emailjs');
    return { ok: true };
  }

  function removeService(id, input = {}) {
    const service = SERVICE_BY_ID[id];
    if (!service) return { ok: false, reason: 'unknown_service' };
    const env = environment(input);
    if (AI_IDS.has(id)) return env.gateway?.removeKey?.(id) || { ok: false, reason: 'gateway_unavailable' };
    const extraKeys = {
      emailjs: ['gordi_email_method'],
      gmail: ['gordi_gmail_token', 'gordi_gmail_token_ts', 'gordi_gmail_enabled'],
      sheets: ['gordi_sheets_token', 'gordi_sheets_token_expiry', 'gordi_sheets_last_sync']
    }[id] || [];
    for (const key of [...service.fields.map(field => field.storageKey), ...extraKeys]) env.localStorage?.removeItem?.(key);
    return { ok: true };
  }

  function element(document, tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text != null) item.textContent = String(text);
    return item;
  }

  const GROUPS = Object.freeze([
    { id: 'ai', label: 'IA gratuita', description: 'Redacción, clasificación y asistente. Solo modelos gratuitos permitidos.' },
    { id: 'email', label: 'Envío de correo', description: 'EmailJS como método directo o Gmail mediante OAuth.' },
    { id: 'data', label: 'Datos', description: 'Sincronización opcional con una hoja propiedad del usuario.' }
  ]);
  const STATUS_LABELS = Object.freeze({
    not_configured: 'Sin configurar', incomplete: 'Incompleta', configured_unverified: 'Configurada · no verificada',
    session_authorization_required: 'Requiere autorización', connected: 'Conectada', token_expired: 'Autorización caducada'
  });

  function install(browser) {
    const document = browser.document;
    const env = () => environment({ browser });
    const render = () => {
      const host = document.getElementById('credential-manager-root');
      if (!host) return false;
      host.replaceChildren();

      const header = element(document, 'header', 'credential-manager-header');
      const copy = element(document, 'div');
      copy.append(element(document, 'p', 'credential-manager-kicker', 'Control central de credenciales'), element(document, 'h2', '', 'Servicios por función'), element(document, 'p', '', 'Solo aparecen las integraciones que Voltflow utiliza actualmente.'));
      header.append(copy, element(document, 'span', 'credential-manager-zero', 'ZERO_COST_MODE activo'));
      host.append(header);

      const grid = element(document, 'div', 'credential-manager-groups');
      for (const group of GROUPS) {
        const section = element(document, 'section', 'credential-manager-group');
        section.dataset.credentialGroup = group.id;
        section.append(element(document, 'h3', '', group.label), element(document, 'p', 'credential-manager-group-copy', group.description));
        for (const service of SERVICE_REGISTRY.filter(item => item.group === group.id)) {
          const state = getServiceState(service.id, env());
          const card = element(document, 'article', `credential-manager-service is-${state.status}`);
          card.dataset.credentialService = service.id;
          const top = element(document, 'div', 'credential-manager-service-top');
          top.append(element(document, 'strong', '', service.label), element(document, 'span', 'credential-manager-status', STATUS_LABELS[state.status] || state.status));
          card.append(top, element(document, 'p', 'credential-manager-description', service.description), element(document, 'small', 'credential-manager-detail', state.detail));

          const actions = element(document, 'div', 'credential-manager-actions');
          const configure = element(document, 'button', 'btn-primary btn-sm', 'Configurar');
          configure.type = 'button';
          actions.append(configure);
          if (AI_IDS.has(service.id) && state.configured) {
            const authorize = element(document, 'button', 'btn-outline btn-sm', state.connected ? 'Revocar sesión' : 'Autorizar sesión');
            authorize.type = 'button';
            authorize.onclick = () => { state.connected ? browser.revokeAIFreeAccount?.(service.id) : browser.confirmAIFreeAccount?.(service.id); render(); };
            actions.append(authorize);
          }
          if (service.id === 'emailjs' && state.configured) {
            const test = element(document, 'button', 'btn-outline btn-sm', 'Enviar prueba'); test.type = 'button'; test.onclick = async () => { await browser.testEmailJsAlert?.(); render(); }; actions.append(test);
          }
          if (service.id === 'gmail' && state.configured) {
            const connect = element(document, 'button', 'btn-outline btn-sm', 'Autorizar Google'); connect.type = 'button'; connect.onclick = () => browser.gmailOAuthInit?.(); actions.append(connect);
            const test = element(document, 'button', 'btn-outline btn-sm', 'Enviar prueba'); test.type = 'button'; test.onclick = async () => { await browser.testGmailAlert?.(); render(); }; actions.append(test);
          }
          if (service.id === 'sheets' && state.configured) {
            const connect = element(document, 'button', 'btn-outline btn-sm', 'Autorizar Google'); connect.type = 'button'; connect.onclick = () => browser.initSheetsOAuth?.(false); actions.append(connect);
          }
          for (const link of service.links) {
            const anchor = element(document, 'a', 'btn-outline btn-sm credential-manager-external', link.label);
            anchor.href = link.href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.dataset.createLink = service.id; actions.append(anchor);
          }
          if (state.configured) {
            const remove = element(document, 'button', 'btn-outline btn-sm credential-manager-remove', 'Eliminar'); remove.type = 'button';
            remove.onclick = () => { if (!browser.confirm?.(`¿Eliminar la configuración de ${service.label}?`)) return; removeService(service.id, env()); browser.showToast?.(`${service.label}: configuración eliminada`); render(); };
            actions.append(remove);
          }
          card.append(actions);

          const form = element(document, 'form', 'credential-manager-form');
          form.hidden = true;
          for (const field of service.fields) {
            const label = element(document, 'label', 'credential-manager-field');
            label.append(element(document, 'span', '', field.label));
            const input = element(document, 'input'); input.name = field.name; input.type = field.type; input.autocomplete = field.type === 'password' ? 'new-password' : 'off';
            if (field.type === 'password') input.placeholder = read(env().localStorage, field.storageKey) || read(env().sessionStorage, field.storageKey) ? 'Guardada · deja vacío para conservarla' : 'Introduce la credencial';
            else input.value = read(env().localStorage, field.storageKey);
            label.append(input); form.append(label);
          }
          if (AI_IDS.has(service.id)) {
            const persist = element(document, 'label', 'credential-manager-persist'); const checkbox = element(document, 'input'); checkbox.type = 'checkbox'; checkbox.name = 'persistent'; persist.append(checkbox, element(document, 'span', '', 'Conservar entre sesiones')); form.append(persist);
          }
          const formActions = element(document, 'div', 'credential-manager-form-actions');
          const cancel = element(document, 'button', 'btn-outline btn-sm', 'Cancelar'); cancel.type = 'button'; cancel.onclick = () => { form.hidden = true; configure.setAttribute('aria-expanded', 'false'); };
          const save = element(document, 'button', 'btn-primary btn-sm', 'Guardar'); save.type = 'submit';
          formActions.append(cancel, save); form.append(formActions);
          const message = element(document, 'div', 'credential-manager-form-message'); form.append(message);
          configure.setAttribute('aria-expanded', 'false'); configure.onclick = () => { form.hidden = !form.hidden; configure.setAttribute('aria-expanded', String(!form.hidden)); if (!form.hidden) form.querySelector('input')?.focus(); };
          form.onsubmit = event => {
            event.preventDefault();
            const values = Object.fromEntries(new browser.FormData(form).entries()); values.persistent = form.elements.persistent?.checked === true;
            if (values.persistent && !browser.confirm?.('La clave persistente quedará guardada en este navegador. ¿Continuar?')) return;
            const saved = saveService(service.id, values, env());
            if (!saved.ok) { message.textContent = saved.reason === 'missing_fields' || saved.reason === 'missing_key' ? 'Completa los campos obligatorios.' : `No se pudo guardar: ${saved.reason}`; return; }
            if (service.id === 'emailjs') browser.emailjs?.init?.({ publicKey: read(env().localStorage, 'gordi_ejs_key') });
            browser.showToast?.(`${service.label}: configuración guardada`); render();
          };
          card.append(form); section.append(card);
        }
        grid.append(section);
      }
      host.append(grid);
      const notice = element(document, 'p', 'credential-manager-notice');
      notice.append(element(document, 'strong', '', 'Protección de credenciales. '), document.createTextNode('Las claves pertenecen al usuario y permanecen en el almacenamiento del navegador y origen actuales. Nunca deben incluirse en los archivos que se suban a GitHub.'));
      host.append(notice);
      return true;
    };
    browser.renderCredentialManager = render;
    browser.addEventListener?.('storage', event => {
      if (String(event.key || '').startsWith('gordi_') && document.getElementById('settings-view')?.classList.contains('active')) render();
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true }); else render();
    return { render };
  }

  return Object.freeze({ SERVICE_REGISTRY, getServiceState, saveService, removeService, install });
});
