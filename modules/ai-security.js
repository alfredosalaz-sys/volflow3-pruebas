// Security helpers for AI prompts and generated rich text.
(function () {
  'use strict';

  const ALLOWED_TAGS = new Set(['BR', 'P', 'DIV', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'A']);
  const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'META', 'LINK']);
  const SAFE_STYLE = /^(?:\s*(?:color|font-weight|font-style|text-decoration|text-decoration-color|text-underline-offset|margin|line-height|font-family|font-size)\s*:\s*[^;<>]+;?\s*)+$/i;

  function escapeAIText(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeAIData(value, maxLength = 2000) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, Math.max(0, maxLength));
  }

  function sanitizeAIHTMLFallback(value) {
    return String(value || '')
      .replace(/<(script|style|iframe|object|embed|svg|math|form|input|button|meta|link)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<(script|style|iframe|object|embed|svg|math|form|input|button|meta|link)\b[^>]*\/?\s*>/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s+(?:srcdoc|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s+href\s*=\s*(["'])\s*(?:javascript|data):[\s\S]*?\1/gi, '')
      .replace(/<(?!\/?(?:br|p|div|span|strong|b|em|i|u|ul|ol|li|a)\b)[^>]+>/gi, '');
  }

  function sanitizeAIHTML(value = '') {
    const source = String(value || '').slice(0, 100000);
    if (typeof DOMParser !== 'function') return sanitizeAIHTMLFallback(source);
    const doc = new DOMParser().parseFromString(`<div id="vf-ai-root">${source}</div>`, 'text/html');
    const root = doc.getElementById('vf-ai-root');
    if (!root) return '';

    [...root.querySelectorAll('*')].forEach(node => {
      if (DROP_TAGS.has(node.tagName)) {
        node.remove();
        return;
      }
      if (!ALLOWED_TAGS.has(node.tagName)) {
        node.replaceWith(...node.childNodes);
        return;
      }
      [...node.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        if (name === 'style' && SAFE_STYLE.test(attr.value)) return;
        if (node.tagName === 'A' && name === 'href' && /^(?:https?:|mailto:)/i.test(attr.value.trim())) return;
        node.removeAttribute(attr.name);
      });
      if (node.tagName === 'A' && node.hasAttribute('href')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
    return root.innerHTML;
  }

  function encodeAIInlineValue(value = '') {
    return encodeURIComponent(sanitizeAIData(value, 500)).replace(/'/g, '%27');
  }

  window.VoltflowAISecurity = Object.freeze({
    escapeText: escapeAIText,
    sanitizeData: sanitizeAIData,
    sanitizeHTML: sanitizeAIHTML,
    encodeInlineValue: encodeAIInlineValue,
  });
  window.escapeAIText = escapeAIText;
  window.sanitizeAIData = sanitizeAIData;
  window.sanitizeAIHTML = sanitizeAIHTML;
  window.encodeAIInlineValue = encodeAIInlineValue;
})();
