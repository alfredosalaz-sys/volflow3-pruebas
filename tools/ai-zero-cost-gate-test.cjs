const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const modulesDir = path.join(root, 'modules');
const routerPath = path.join(modulesDir, 'ai-router.js');
const routerSource = fs.readFileSync(routerPath, 'utf8');
const searchSource = fs.readFileSync(path.join(modulesDir, 'search.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.html'), 'utf8');

const providerEndpoints = [
  'generativelanguage.googleapis.com',
  'api.groq.com/openai',
  'openrouter.ai/api',
];

for (const file of fs.readdirSync(modulesDir).filter(name => name.endsWith('.js') && name !== 'ai-router.js')) {
  const source = fs.readFileSync(path.join(modulesDir, file), 'utf8');
  for (const endpoint of providerEndpoints) {
    assert(!source.includes(endpoint), `${file} contiene una salida directa a ${endpoint}`);
  }
}

assert.strictEqual((routerSource.match(/\bfetch\(endpoint, requestOptions\)/g) || []).length, 1,
  'La pasarela debe contener una unica salida fetch para proveedores IA');
assert(!/generateSessionIntel\s*\(tempSearchResults/.test(searchSource),
  'La inteligencia de sesion no debe ejecutarse automaticamente');
assert(/adapter\.id === 'static_open_data'[\s\S]{0,120}opts\.returnAfterLocalResults/.test(searchSource),
  'El buscador debe poder finalizar tras obtener resultados del indice local');
assert(/<option value="none" selected>Descubrimiento local\/gratuito \(recomendado\)<\/option>/.test(appSource),
  'El descubrimiento local debe ser el modo predeterminado');

const storageValues = new Map([
  ['gordi_gemini_key', 'synthetic-gemini-key'],
  ['gordi_groq_key', 'synthetic-groq-key'],
  ['gordi_openrouter_key', 'synthetic-openrouter-key'],
]);
const storage = {
  getItem: key => storageValues.get(key) || null,
  setItem: (key, value) => storageValues.set(key, String(value)),
  removeItem: key => storageValues.delete(key),
};
let networkCalls = 0;
let fetchMode = 'success';
const networkRequests = [];
const mockResponse = (status, data, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: name => headers[String(name).toLowerCase()] || null },
  async json() { return data; },
});
const context = {
  console,
  localStorage: storage,
  sessionStorage: storage,
  fetch: async (url, options = {}) => {
    networkCalls += 1;
    networkRequests.push({ url: String(url), headers: options.headers || {}, body: options.body || '' });
    if (fetchMode === 'pending') {
      return new Promise((resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
      });
    }
    if (fetchMode === 'malformed') {
      return { ...mockResponse(200, {}), async json() { throw new SyntaxError('malformed'); } };
    }
    if (fetchMode === 'fallback' && String(url).includes('generativelanguage.googleapis.com')) {
      return mockResponse(429, { error: { code: 429 } }, { 'retry-after': '60' });
    }
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return mockResponse(200, {
        candidates: [{ content: { parts: [{ text: 'gemini-free-ok' }] } }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7 },
      }, {
        'x-ratelimit-limit-requests': '15',
        'x-ratelimit-remaining-requests': '14',
        'x-ratelimit-limit-tokens': '100000',
        'x-ratelimit-remaining-tokens': '99981',
        'x-ratelimit-reset-requests': '60s',
      });
    }
    if (String(url).includes('api.groq.com')) {
      return mockResponse(200, { choices: [{ message: { content: 'groq-free-fallback-ok' } }] });
    }
    return mockResponse(200, { choices: [{ message: { content: 'openrouter-free-ok' } }] });
  },
  document: { addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } },
  navigator: {},
  location: { href: 'http://127.0.0.1/', search: '' },
  AbortSignal,
  AbortController,
  DOMException,
  Blob,
  URL,
  URLSearchParams,
  Date,
  JSON,
  Math,
  Promise,
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
  getGeminiKey: () => storage.getItem('gordi_gemini_key'),
  showToast() {},
  renderDashboardCharts() {},
  openLeadDetail() {},
  renderLeads() {},
  resetSearchBtn() {},
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(routerSource, context, { filename: routerPath });

async function expectBlocked(expression, provider, reason) {
  let error;
  try {
    await vm.runInContext(expression, context);
  } catch (caught) {
    error = caught;
  }
  assert(error, `${provider} no fue bloqueado`);
  assert.strictEqual(error.code, 'AI_ZERO_COST_BLOCKED', `${provider} devolvio un error no auditable`);
  assert.strictEqual(error.provider, provider);
  assert.strictEqual(error.reason, reason);
}

(async () => {
  await expectBlocked("aiGatewayFetch('unknown','free-model','synthetic-key',{}, {purpose:'test'})", 'unknown', 'provider_not_registered');
  await expectBlocked("aiGatewayFetch('gemini','gemini-2.5-flash-lite','synthetic-gemini-key',{}, {purpose:'test'})", 'gemini', 'session_confirmation_required');
  assert.strictEqual(networkCalls, 0, 'Se intento una llamada de red pese al bloqueo estricto');

  for (const provider of ['gemini', 'groq', 'openrouter']) {
    const approval = context.VoltflowAIGateway.approve(provider, context.VoltflowAIGateway.getKey(provider), {
      freePlan: true,
      billingDisabled: true,
      browserRiskAccepted: true,
      dataProcessingAccepted: true,
    });
    assert.strictEqual(approval.ok, true, `${provider} no acepta confirmacion completa`);
  }

  vm.runInContext("{ const old=aiSessionApprovals.get('gemini'); aiSessionApprovals.set('gemini', Object.freeze({...old, expiresAt:0})); }", context);
  await expectBlocked("aiGatewayFetch('gemini','gemini-2.5-flash-lite','synthetic-gemini-key',{}, {purpose:'test'})", 'gemini', 'session_confirmation_expired');
  context.VoltflowAIGateway.approve('gemini', 'synthetic-gemini-key', {
    freePlan: true, billingDisabled: true, browserRiskAccepted: true, dataProcessingAccepted: true,
  });

  await expectBlocked("aiGatewayFetch('gemini','gemini-2.5-pro','synthetic-gemini-key',{}, {purpose:'test'})", 'gemini', 'paid_or_unverified_model_blocked');
  await expectBlocked("aiGatewayFetch('gemini','gemini-2.5-flash-lite','different-key',{}, {purpose:'test'})", 'gemini', 'key_not_confirmed_for_session');
  await expectBlocked("aiGatewayFetch('gemini','gemini-2.5-flash-lite','synthetic-gemini-key',{body:JSON.stringify({tools:[{googleSearch:{}}]})}, {purpose:'test'})", 'gemini', 'billable_or_unverified_tool_blocked');
  await expectBlocked("aiGatewayFetch('gemini','gemini-2.5-flash-lite','synthetic-gemini-key',{body:JSON.stringify({web_search_options:{}})}, {purpose:'test'})", 'gemini', 'billable_or_unverified_tool_blocked');
  await expectBlocked("aiGatewayFetch('groq','openai/gpt-oss-20b','synthetic-groq-key',{body:JSON.stringify({model:'openai/gpt-oss-20b',max_tokens:2001})}, {purpose:'test'})", 'groq', 'output_limit_exceeded');
  assert.strictEqual(networkCalls, 0, 'Una ruta no permitida alcanzo la red');

  vm.runInContext("aiRuntime.inFlight.set('groq', 1)", context);
  await expectBlocked("aiGatewayFetch('groq','openai/gpt-oss-20b','synthetic-groq-key',{}, {purpose:'test'})", 'groq', 'concurrency_limit');
  vm.runInContext("aiRuntime.inFlight.set('groq', 0)", context);
  vm.runInContext("sessionStorage.setItem(aiMinuteKey('openrouter'), JSON.stringify([Date.now(), Date.now()]))", context);
  await expectBlocked("aiGatewayFetch('openrouter','openrouter/free','synthetic-openrouter-key',{}, {purpose:'test'})", 'openrouter', 'minute_limit');
  vm.runInContext("sessionStorage.setItem(aiMinuteKey('openrouter'), '[]')", context);

  const errorCategories = vm.runInContext("[400,401,402,403,404,408,429,503].map(classifyAIError)", context);
  assert.deepStrictEqual(Array.from(errorCategories), [
    'bad_request', 'invalid_credentials', 'payment_required', 'forbidden_or_billing',
    'model_or_endpoint_missing', 'timeout', 'quota_or_rate_limit', 'provider_unavailable',
  ]);

  vm.runInContext("{ const k=aiZeroCostWindowKeys('gemini'); localStorage.setItem(k.day,'20'); }", context);
  await expectBlocked("aiGatewayFetch('gemini','gemini-2.5-flash-lite','synthetic-gemini-key',{}, {purpose:'test'})", 'gemini', 'day_limit');
  vm.runInContext("{ const k=aiZeroCostWindowKeys('gemini'); localStorage.setItem(k.day,'0'); }", context);

  const direct = await vm.runInContext("AI_ROUTER.call('synthetic prompt','synthetic-gemini-key',{purpose:'test'})", context);
  assert.strictEqual(direct, 'gemini-free-ok');
  assert.strictEqual(vm.runInContext('AI_ROUTER._lastProvider', context), 'gemini');
  assert(!networkRequests[0].url.includes('synthetic-gemini-key'), 'La clave Gemini no debe viajar en la URL');
  assert.strictEqual(networkRequests[0].headers['x-goog-api-key'], 'synthetic-gemini-key');
  const geminiTelemetry = context.VoltflowAIGateway.telemetry('gemini', 'gemini-2.5-flash-lite');
  assert.strictEqual(geminiTelemetry.reportedQuota.requestsRemaining, 14);
  assert.strictEqual(geminiTelemetry.reportedQuota.tokensRemaining, 99981);
  assert.strictEqual(geminiTelemetry.reportedInputTokens, 12);
  assert.strictEqual(geminiTelemetry.reportedOutputTokens, 7);
  assert.strictEqual(geminiTelemetry.reportedQuotaSource, 'response_headers');

  fetchMode = 'fallback';
  vm.runInContext("AI_ROUTER._limited = {}; AI_ROUTER._limitTimers = {};", context);
  const fallback = await vm.runInContext("AI_ROUTER.call('synthetic prompt','synthetic-gemini-key',{purpose:'test'})", context);
  assert.strictEqual(fallback, 'groq-free-fallback-ok');
  assert.strictEqual(vm.runInContext('AI_ROUTER._lastProvider', context), 'groq');
  assert.strictEqual(networkCalls, 3, 'El fallback debe usar una llamada directa y dos intentos controlados');

  context.VoltflowAIGateway.setSelection({ mode: 'manual', provider: 'groq', model: 'openai/gpt-oss-20b' });
  fetchMode = 'success';
  const manual = await vm.runInContext("AI_ROUTER.call('manual prompt','',{purpose:'summary'})", context);
  assert.strictEqual(manual, 'groq-free-fallback-ok');
  assert.strictEqual(vm.runInContext('AI_ROUTER._lastProvider', context), 'groq');

  fetchMode = 'pending';
  const pending = vm.runInContext("AI_ROUTER.call('cancel prompt','',{purpose:'cancellation_test'})", context);
  context.VoltflowAIGateway.cancel('cancellation_test');
  await assert.rejects(pending, error => error?.name === 'AbortError');

  fetchMode = 'malformed';
  const beforeMalformed = networkCalls;
  await assert.rejects(
    vm.runInContext("AI_ROUTER.call('malformed prompt','',{purpose:'data_extraction'})", context),
    error => error?.category === 'malformed_response'
  );
  assert.strictEqual(networkCalls, beforeMalformed + 1, 'Una respuesta malformada no debe repetirse mediante fallback');

  context.VoltflowAIGateway.setPrivacy('anonymous_only');
  await expectBlocked("AI_ROUTER.call('private prompt','',{purpose:'summary',containsPersonalData:true})", 'all', 'privacy_policy_blocked');
  assert.strictEqual(networkCalls, 6, 'La politica de privacidad no debe alcanzar la red');
  context.VoltflowAIGateway.setPrivacy('business_minimal');

  storage.setItem('gordi_ai_selection_mode', 'corrupt-value');
  assert.strictEqual(context.VoltflowAIGateway.getSelection().mode, 'automatic', 'Una preferencia corrupta debe volver al modo seguro automatico');

  context.VoltflowAIGateway.revoke('gemini');
  await expectBlocked("aiGatewayFetch('gemini','gemini-2.5-flash-lite','synthetic-gemini-key',{}, {purpose:'test'})", 'gemini', 'session_confirmation_required');
  assert.strictEqual(networkCalls, 6, 'Un proveedor revocado no debe alcanzar la red');
  console.log('AI zero-cost gate PASS: confirmation, free generation, paid blocking and 429 fallback');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
