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

assert.strictEqual((routerSource.match(/\bfetch\(endpoint, options\)/g) || []).length, 1,
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
const context = {
  console,
  localStorage: storage,
  sessionStorage: storage,
  fetch: async () => { networkCalls += 1; throw new Error('NETWORK_MUST_NOT_RUN'); },
  document: { addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } },
  navigator: {},
  location: { href: 'http://127.0.0.1/', search: '' },
  AbortSignal,
  Blob,
  URL,
  URLSearchParams,
  Date,
  JSON,
  Math,
  Promise,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
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

async function expectBlocked(expression, provider) {
  let error;
  try {
    await vm.runInContext(expression, context);
  } catch (caught) {
    error = caught;
  }
  assert(error, `${provider} no fue bloqueado`);
  assert.strictEqual(error.code, 'AI_ZERO_COST_BLOCKED', `${provider} devolvio un error no auditable`);
  assert.strictEqual(error.provider, provider);
  assert.strictEqual(error.reason, 'external_cost_control_not_verified');
}

(async () => {
  await expectBlocked("aiGatewayFetch('gemini','gemini-2.0-flash','synthetic',{}, {purpose:'test'})", 'gemini');
  await expectBlocked("aiGatewayFetch('groq','llama-3.3-70b-versatile','synthetic',{}, {purpose:'test'})", 'groq');
  await expectBlocked("aiGatewayFetch('openrouter','meta-llama/llama-3.3-70b-instruct:free','synthetic',{}, {purpose:'test'})", 'openrouter');
  await expectBlocked("AI_ROUTER.call('synthetic prompt','synthetic-gemini-key')", 'openrouter');
  assert.strictEqual(networkCalls, 0, 'Se intento una llamada de red pese al bloqueo estricto');
  console.log('AI zero-cost gate PASS: 0 network calls; Gemini, Groq and OpenRouter blocked closed');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
