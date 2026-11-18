// VOLTFLOW3 — fallbacks locales deterministas para ZERO_COST_MODE
(function installVoltflowAIFallbacks(root) {
  'use strict';

  function clean(value, max = 180) {
    return String(value ?? '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/(?:ignora|omite)\s+(?:todas?\s+)?(?:las?\s+)?instrucciones?[^.\n]*/gi, ' ')
      .replace(/(?:revela|muestra)\s+(?:los?\s+)?secretos?[^.\n]*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  function companyName(lead = {}) {
    return clean(lead.company || lead.name || 'tu empresa', 80) || 'tu empresa';
  }

  function contactName(lead = {}) {
    return clean(lead.name || '', 50);
  }

  function greeting(lead = {}) {
    const name = contactName(lead);
    return name ? `Hola ${name}` : 'Hola';
  }

  function subjects(lead = {}) {
    const company = companyName(lead);
    const segment = clean(lead.segment || 'tu actividad', 60);
    return [
      `Una idea para ${company}`,
      `Mejora operativa para ${company}`,
      `${company}: propuesta para ${segment}`,
    ];
  }

  function email(lead = {}, options = {}) {
    const company = companyName(lead);
    const pain = clean(options.pain || lead.pain || 'mejorar la eficiencia y reducir incidencias', 120);
    const bodyText = `${greeting(lead)},\n\nHe revisado la actividad de ${company} y creo que podemos ayudaros a ${pain}. En Voltflow trabajamos con propuestas concretas y adaptadas a cada instalación.\n\nSi te encaja, podemos comentarlo en una llamada breve y revisar si existe una mejora clara para vuestro caso.\n\nUn saludo.`;
    return { subject: subjects(lead)[0], bodyText, provenance: 'local_template' };
  }

  function whatsapp(lead = {}) {
    return `${greeting(lead)}, soy del equipo de Voltflow. He revisado la actividad de ${companyName(lead)} y quería proponerte una breve conversación para detectar posibles mejoras. ¿Qué momento te vendría bien?`;
  }

  function calendar(lead = {}) {
    const company = companyName(lead);
    return [
      { dayOffset: 0, channel: 'email', action: `Primer contacto con ${company}` },
      { dayOffset: 3, channel: 'phone', action: `Seguimiento breve con ${company}` },
      { dayOffset: 7, channel: 'email', action: `Cierre de seguimiento con ${company}` },
    ];
  }

  function weeklyPlan(leads = []) {
    const items = (Array.isArray(leads) ? leads : [])
      .slice()
      .sort((a, b) => Number(b.opportunityScore || b.score || 0) - Number(a.opportunityScore || a.score || 0))
      .slice(0, 10)
      .map((lead, index) => ({
        priority: index + 1,
        leadId: clean(lead.id || '', 80),
        company: companyName(lead),
        action: lead.status === 'Seguimiento' ? 'Completar seguimiento pendiente' : 'Preparar primer contacto',
      }));
    if (!items.length) items.push({ priority: 1, leadId: '', company: 'Cartera', action: 'Revisar y priorizar los leads pendientes' });
    return { title: 'Plan semanal local', items, provenance: 'local_template' };
  }

  function reply(input = {}) {
    const lead = input.lead || input;
    const topic = clean(input.topic || input.subject || 'tu mensaje', 100);
    return `${greeting(lead)},\n\nGracias por escribirnos sobre ${topic}. Hemos tomado nota y podemos revisarlo contigo para concretar el siguiente paso.\n\nUn saludo.`;
  }

  function leadProfile(lead = {}) {
    const company = companyName(lead);
    const segment = clean(lead.segment || 'actividad no clasificada', 80);
    return {
      summary: `${company} pertenece al segmento ${segment}. El perfil se ha construido únicamente con los datos guardados en Voltflow.`,
      recommendedActions: ['Verificar los datos de contacto', 'Confirmar la necesidad principal', 'Registrar el próximo paso'],
      provenance: 'local_template',
    };
  }

  function opportunityScan(leads = []) {
    return ranking(leads).slice(0, 5).map((lead, index) => ({
      leadId: clean(lead.id || '', 80),
      company: companyName(lead),
      priority: index + 1,
      reason: Number(lead.opportunityScore || lead.score || 0) > 0 ? 'Puntuación comercial existente' : 'Revisión manual recomendada',
    }));
  }

  function ranking(leads = []) {
    return (Array.isArray(leads) ? leads : [])
      .slice()
      .sort((a, b) => Number(b.opportunityScore || b.score || 0) - Number(a.opportunityScore || a.score || 0));
  }

  function cleanInbound(raw = '') {
    const text = String(raw || '')
      .replace(/^(?:From|De|To|Para|Subject|Asunto|Date|Fecha):.*$/gim, '')
      .split(/(?:-{2,}\s*(?:Original Message|Mensaje original)\s*-{2,}|\nOn .+ wrote:)/i)[0];
    return clean(text, 3000);
  }

  async function generate(prompt, options = {}, localFallback = '') {
    const purpose = options.purpose || 'default';
    const localText = () => {
      const value = typeof localFallback === 'function' ? localFallback() : localFallback;
      return typeof value === 'string' ? value : JSON.stringify(value ?? '');
    };
    const gateway = root.VoltflowAIGateway;
    if (!gateway?.generate) {
      return { text: localText(), provider: 'local', purpose, local: true, reason: 'NO_FREE_PROVIDER' };
    }
    try {
      const result = await gateway.generate(String(prompt || ''), options);
      if (!result || typeof result.text !== 'string' || !result.text.trim()) throw new Error('INVALID_AI_RESPONSE');
      return { text: result.text, provider: result.provider || 'unknown', purpose, local: false };
    } catch (error) {
      return {
        text: localText(), provider: 'local', purpose, local: true,
        reason: String(error?.code || error?.message || 'AI_UNAVAILABLE').slice(0, 120),
      };
    }
  }

  root.VoltflowAIFallbacks = Object.freeze({
    clean, subjects, email, whatsapp, calendar, weeklyPlan, reply,
    leadProfile, opportunityScan, ranking, cleanInbound, generate,
  });
})(typeof window !== 'undefined' ? window : globalThis);
