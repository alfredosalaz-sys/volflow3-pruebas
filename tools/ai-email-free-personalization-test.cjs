const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const source = fs.readFileSync(path.join(root, 'modules', 'ai-email.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'modules', 'ui.js'), 'utf8');
let capturedPrompt = '';

const context = {
  console,
  localStorage: { getItem() { return null; }, setItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {} },
  document: { getElementById() { return null; }, querySelectorAll() { return []; }, execCommand() {} },
  window: { location: {}, open() {} },
  navigator: {},
  Blob,
  ClipboardItem: function ClipboardItem() {},
  Date,
  JSON,
  Math,
  Promise,
  setTimeout,
  clearTimeout,
  getProfile: () => ({ name: 'Ana Comercial', email: 'ana@voltium.example' }),
  buildFirmaText: () => 'Ana Comercial | Voltium Madrid',
  buildSaludo: () => 'Hola',
  SEGMENT_TONE: {
    Dental: { tone: 'profesional', pain: 'continuidad operativa', values: 'confianza', avoid: 'promesas absolutas' },
    Default: { tone: 'profesional', pain: 'eficiencia', values: 'confianza', avoid: 'promesas absolutas' },
  },
  AI_ROUTER: {
    async call(prompt, key, options) {
      capturedPrompt = prompt;
      assert.strictEqual(options.purpose, 'email_body_generation');
      assert.ok(options.maxOutputTokens <= 2000);
      return JSON.stringify({
        subjects: ['Propuesta para Clinica Prueba', 'Continuidad para su clinica', 'Una mejora prudente'],
        body: 'Hola,<br><br>He revisado la informacion disponible de Clinica Prueba en Madrid.<br><br>{{FIRMA}}',
        insight: 'Se utilizaron exclusivamente empresa, localidad y sector aportados.',
      });
    },
  },
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'modules/ai-email.js' });

(async () => {
  const lead = {
    id: 'synthetic-1',
    company: 'Clinica Prueba',
    name: 'Responsable',
    segment: 'Dental',
    address: 'Madrid',
    description: 'Clinica dental con informacion sintetica',
    website: 'https://example.invalid',
    signals: [],
    techStack: [],
  };
  const result = await vm.runInContext(
    `generateEmailWithClaude(${JSON.stringify(lead)}, {reviews:[],rating:null,ratingCount:0}, '', {}, '')`,
    context
  );
  assert(capturedPrompt.includes('Clinica Prueba'), 'El prompt no contiene la empresa');
  assert(capturedPrompt.includes('Dental'), 'El prompt no contiene el sector');
  assert(capturedPrompt.includes('Madrid'), 'El prompt no contiene la localidad');
  assert(capturedPrompt.includes('No inventes noticias, cargos, problemas'), 'Falta la regla contra invenciones');
  assert(result.body.includes('Clinica Prueba'));
  assert(result.body.includes('Ana Comercial | Voltium Madrid'));
  assert(Array.isArray(result.subjects) && result.subjects.length === 3);
  assert(/id="ai-body-editor"[\s\S]{0,200}contenteditable="true"/.test(app), 'El correo no queda editable');
  assert(/onclick="regenerateAiEmail\(\)"/.test(app), 'Falta regeneracion antes del envio');
  assert(/onclick="sendAiEmail\(\)"/.test(app), 'Falta aprobacion explicita antes de abrir el cliente de correo');
  assert(/purpose:\s*'email_subject_regeneration'/.test(ui), 'La mejora de asunto no usa el router gratuito');
  assert(/purpose:\s*'email_followup_generation'/.test(ui), 'El seguimiento no usa el router gratuito');
  assert(!/Ciudad:\s*\$\{lead\.address\s*\|\|\s*'Madrid'\}/.test(source + ui),
    'Una ubicacion ausente no puede convertirse en Madrid');
  console.log('AI email personalization PASS: real lead fields, editable draft, regeneration and explicit send');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
