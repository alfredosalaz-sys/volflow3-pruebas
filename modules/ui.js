function copyEmail(email, event) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  return copyToClipboard(email, `Email: ${email}`);
}


// ============ FONT SIZE ============
function setFontSize(scale, silent) {
  document.documentElement.style.setProperty('--font-scale', scale);
  if (!silent) localStorage.setItem('gordi_font_scale', scale);
}

// ============ BULK SELECTION ============
function toggleLeadSelect(cb) {
  const id = String(cb.getAttribute('data-id'));
  if (cb.checked) selectedLeadIds.add(id);
  else selectedLeadIds.delete(id);
  updateBulkBar();
}
function toggleAllLeadsCheck(checked) {
  const list = getFilteredLeads();
  list.forEach(l => {
    if (checked) selectedLeadIds.add(String(l.id));
    else selectedLeadIds.delete(String(l.id));
  });
  document.querySelectorAll('.lead-cb').forEach(cb => cb.checked = checked);
  updateBulkBar();
}
function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const cnt = document.getElementById('bulk-count');
  if (!bar) return;
  if (selectedLeadIds.size > 0) {
    bar.classList.add('show');
    cnt.textContent = selectedLeadIds.size + ' seleccionado' + (selectedLeadIds.size !== 1 ? 's' : '');
  } else {
    bar.classList.remove('show');
  }
}
function clearBulkSelection() {
  selectedLeadIds.clear();
  document.querySelectorAll('.lead-cb').forEach(cb => cb.checked = false);
  const all = document.getElementById('check-all-leads');
  if (all) all.checked = false;
  updateBulkBar();
}
function bulkChangeStatus(newStatus) {
  selectedLeadIds.forEach(id => {
    const l = leads.find(x => String(x.id) === id);
    if (l) {
      const old = l.status;
      l.status = newStatus;
      l.status_date = new Date().toISOString();
      addActivityLog(l.id, `Cambio en lote: ${old} -> ${newStatus}`);
    }
  });
  saveLeads();
  clearBulkSelection();
  renderAll();
  showToast(`Estado actualizado a "${newStatus}"`);
}
function bulkExport() {
  const selected = leads.filter(l => selectedLeadIds.has(String(l.id)));
  if (!selected.length) return;
  let csv = 'Nombre,Empresa,Email,Teléfono,Segmento,Score,Estado\n';
  selected.forEach(l => { csv += `"${l.name}","${l.company}","${l.email||''}","${l.phone||''}","${l.segment}",${l.score},"${l.status}"\n`; });
  downloadCSV(csv, 'leads_seleccionados.csv');
  clearBulkSelection();
}

// ============ EXPORT FILTERED ============
function exportFilteredData() {
  const list = getFilteredLeads();
  if (!list.length) { alert('No hay leads para exportar.'); return; }
  const esc = v => `"${String(v||'').replace(/"/g,"'")}"`;
  let csv = 'Nombre,Empresa,Email,Teléfono,Segmento,Señal,Score,Estado,Web,Decisor,Rating,Nº Reseñas,Instagram,LinkedIn,Año Dominio,Año Fundación,Estado Legal,Fuentes Enriquecimiento,Señales,Presupuesto,Próximo contacto,Etiquetas\n';
  list.forEach(l => {
    csv += [
      esc(l.name), esc(l.company), esc(l.email), esc(l.phone),
      esc(l.segment), esc(l.signal), l.score, esc(l.status),
      esc(l.website), esc(l.decision_maker),
      l.rating || '', l.ratingCount || '',
      esc(l.instagram), esc(l.linkedin),
      l.domainYear || '', l.incorporationYear || '',
      esc(l.legalStatus), esc((l.enrichSource||[]).join(' | ')),
      esc((l.signals||[]).join(' | ')),
      l.budget||0, esc(l.next_contact), esc((l.tags||[]).join(';'))
    ].join(',') + '\n';
  });
  downloadCSV(csv, `leads_gordi_enriquecidos_${new Date().toISOString().slice(0,10)}.csv`);
}

// ============ TODAY PANEL ============
function renderTodayPanel() {
  const el = document.getElementById('today-content');
  const label = document.getElementById('today-date-label');
  if (!el) return;
  const today = new Date(); today.setHours(0,0,0,0);
  if (label) label.textContent = today.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });

  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); weekStart.setHours(0,0,0,0);
  const dueToday = [];
  const urgent = [];
  let leadsThisWeek = 0;
  let emailsThisWeek = 0;
  for (const lead of leads) {
    if (!lead.archived && lead.next_contact && new Date(lead.next_contact) <= today) dueToday.push(lead);
    if (!lead.archived && lead.score >= 75 && lead.status === 'Pendiente') urgent.push(lead);
    if (lead.date && new Date(lead.date) >= weekStart) leadsThisWeek++;
  }
  const sentHistory = typeof getConfirmedCommercialHistory === 'function' ? getConfirmedCommercialHistory() : [];
  for (const email of sentHistory) {
    if (email.date && new Date(email.date) >= weekStart) emailsThisWeek++;
  }

  const cards = [];

  // Card: seguimientos hoy
  if (dueToday.length) {
    cards.push(`<div class="today-action-card">
      <div class="today-action-header" style="color:var(--primary)">📅 Seguimientos hoy <span style="color:var(--text-muted);font-weight:400">(${dueToday.length})</span></div>
      ${dueToday.slice(0,4).map(l => `
        <div class="today-lead-row">
          <span class="today-lead-name" onclick="openLeadDetail('${l.id}')">${l.company}</span>
          <span style="font-size:.65rem;color:var(--text-dim)">${l.status}</span>
          ${l.email ? `<button class="today-mini-btn" onclick="copyToClipboard('${l.email}', 'Email: ${l.email}')" title="Copiar email">⧉</button>` : ''}
          ${l.email ? `<button class="today-mini-btn success" onclick="generateEmail('${l.id}')">✉️ Email</button>` : ''}
          <button class="today-mini-btn" onclick="todayPostpone('${l.id}')">+1d</button>
          <button class="today-mini-btn" onclick="openLeadDetail('${l.id}')">Ver -></button>
        </div>`).join('')}
      ${dueToday.length > 4 ? `<div style="font-size:.7rem;color:var(--text-dim);margin-top:.35rem">+${dueToday.length-4} más — <span style="cursor:pointer;color:var(--primary)" onclick="showView('leads')">ver todos</span></div>` : ''}
    </div>`);
  }

  // Card: urgentes sin contactar
  if (urgent.length) {
    cards.push(`<div class="today-action-card">
      <div class="today-action-header" style="color:var(--warning)">🔥 Alta prioridad sin contactar <span style="color:var(--text-muted);font-weight:400">(${urgent.length})</span></div>
      ${urgent.slice(0,3).map(l => `
        <div class="today-lead-row">
          <span class="today-lead-name" onclick="openLeadDetail('${l.id}')">${l.company}</span>
          <span style="font-size:.65rem;color:var(--warning)">${l.score}pts</span>
          ${l.email ? `<button class="today-mini-btn" onclick="copyToClipboard('${l.email}', 'Email: ${l.email}')" title="Copiar email">⧉</button>` : ''}
          ${l.email ? `<button class="today-mini-btn success" onclick="generateEmail('${l.id}')">✉️ Email</button>` : ''}
          <button class="today-mini-btn" onclick="openAiEmailModal('${l.id}')">✨ IA</button>
          <button class="today-mini-btn danger" onclick="markNotInterested('${l.id}');renderTodayPanel()">✖</button>
        </div>`).join('')}
    </div>`);
  }

  // Card: resumen semana
  cards.push(`<div class="today-action-card">
    <div class="today-action-header" style="color:var(--success)">📈 Esta semana</div>
    <div style="display:flex;gap:1.5rem;margin-top:.1rem">
      <div style="text-align:center">
        <div style="font-size:1.4rem;font-weight:700;color:var(--primary)">${leadsThisWeek}</div>
        <div style="font-size:.68rem;color:var(--text-muted)">leads nuevos</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:1.4rem;font-weight:700;color:var(--success)">${emailsThisWeek}</div>
        <div style="font-size:.68rem;color:var(--text-muted)">emails enviados</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:1.4rem;font-weight:700;color:var(--warning)">${dueToday.length}</div>
        <div style="font-size:.68rem;color:var(--text-muted)">pendientes hoy</div>
      </div>
    </div>
    <div style="margin-top:.6rem;display:flex;gap:.4rem;flex-wrap:wrap">
      <button class="today-mini-btn" onclick="showView('leads');toggleLeadForm()">+ Nuevo lead</button>
      <button class="today-mini-btn" onclick="showView('kanban')">📋 Pipeline</button>
      <button class="today-mini-btn" onclick="showView('planner')">🔍 Buscar empresas</button>
      <button class="today-mini-btn" onclick="openFocusMode()" style="background:rgba(10,132,255,.1);border-color:var(--primary);color:var(--primary)">⚡ Modo Enfoque</button>
    </div>
  </div>`);

  el.style.gridTemplateColumns = cards.length >= 3 ? 'repeat(auto-fit,minmax(240px,1fr))' : 'repeat(auto-fit,minmax(200px,1fr))';
  el.innerHTML = cards.length ? cards.join('') : '<div class="today-action-card" style="grid-column:1/-1"><div style="font-size:.82rem;color:var(--success);text-align:center;padding:.5rem">✅ Todo al día — no hay acciones pendientes para hoy</div></div>';
}

function todayPostpone(leadId) {
  const lead = leads.find(l => l.id == leadId);
  if (!lead) return;
  const d = new Date(lead.next_contact);
  d.setDate(d.getDate() + 1);
  lead.next_contact = d.toISOString().slice(0,10);
  addActivityLog(leadId, `📅 Seguimiento pospuesto a ${lead.next_contact}`);
  saveLeads();
  renderTodayPanel();
  showToast(`Pospuesto a ${d.toLocaleDateString('es-ES')}`);
}

// ============ FUNNEL CHART ============
function renderFunnelChart() {
  const el = document.getElementById('funnel-chart');
  if (!el) return;
  let totalCount = 0;
  let contactedCount = 0;
  let emailedCount = 0;
  let respondedCount = 0;
  let closedCount = 0;
  const contactedStatuses = new Set(['Contactado','Respuesta del cliente','Visita','Entrega de presupuesto','Cerrado']);
  const emailedStatuses = new Set(['Visita','Respuesta del cliente','Entrega de presupuesto','Cerrado']);
  const respondedStatuses = new Set(['Respuesta del cliente','Visita','Entrega de presupuesto','Cerrado']);
  for (const lead of leads) {
    if (!lead.archived) totalCount++;
    if (contactedStatuses.has(lead.status)) contactedCount++;
    if (emailedStatuses.has(lead.status)) emailedCount++;
    if (respondedStatuses.has(lead.status)) respondedCount++;
    if (lead.status === 'Cerrado') closedCount++;
  }
  const total = totalCount || 1;
  const steps = [
    { label: 'Total leads',    count: totalCount,    color: '#0A84FF' },
    { label: 'Contactados',    count: contactedCount, color: '#5E5CE6' },
    { label: 'Emails enviados',count: emailedCount, color: '#f59e0b' },
    { label: 'Respondidos',    count: respondedCount, color: '#10d97c' },
    { label: 'Cerrados',       count: closedCount, color: '#34d399' },
  ];
  el.innerHTML = steps.map(s => `
    <div class="funnel-step" onclick="showView('leads')">
      <span class="funnel-val" style="color:${s.color}">${s.count}</span>
      <div class="funnel-bar-outer"><div class="funnel-bar-inner" style="width:${Math.round(s.count/total*100)}%;background:${s.color}"></div></div>
      <span class="funnel-label">${s.label}</span>
    </div>`).join('');
}

// ============ PIPELINE VALUE ============
function renderPipelineValue() {
  const el = document.getElementById('pipeline-value-panel');
  if (!el) return;
  let activeCount = 0;
  let total = 0;
  let closed = 0;
  for (const lead of leads) {
    const budget = Number(lead.budget) || 0;
    if (!budget) continue;
    if (!lead.archived && lead.status !== 'Cerrado' && lead.status !== 'No interesa') {
      activeCount++;
      total += budget;
    }
    if (lead.status === 'Cerrado') closed += budget;
  }
  el.innerHTML = `
    <div class="pipeline-value">${total.toLocaleString('es-ES')}€</div>
    <div style="font-size:.75rem;color:var(--text-muted);margin-top:.25rem">${activeCount} leads con presupuesto · ${total > 0 ? Math.round(total/activeCount).toLocaleString('es-ES')+'€ media' : '—'}</div>
    ${closed > 0 ? `<div style="font-size:.78rem;color:var(--success);margin-top:.4rem">✅ ${closed.toLocaleString('es-ES')}€ cerrados</div>` : ''}
    <div style="font-size:.7rem;color:var(--text-dim);margin-top:.5rem">Añade presupuesto estimado en cada lead para ver el valor del pipeline</div>`;
}

// ============ STREAK ============
function updateStreakData() {
  const today = new Date().toISOString().slice(0,10);
  let streak = JSON.parse(localStorage.getItem('gordi_streak') || '{"days":0,"lastDay":"","count":0}');
  if (streak.lastDay === today) { streak.count++; }
  else if (streak.lastDay === new Date(Date.now()-86400000).toISOString().slice(0,10)) {
    streak.days++;  streak.count = 1; streak.lastDay = today;
  } else {
    streak.days = 1; streak.count = 1; streak.lastDay = today;
  }
  localStorage.setItem('gordi_streak', JSON.stringify(streak));
}
function renderStreakPanel() {
  const el = document.getElementById('streak-panel');
  if (!el) return;
  const streak = JSON.parse(localStorage.getItem('gordi_streak') || '{"days":0}');
  const days = streak.days || 0;
  el.innerHTML = `<div style="display:flex;align-items:center;gap:1rem">
    <div class="streak-badge">🔥 ${days} día${days!==1?'s':''} de racha</div>
    <div style="font-size:.75rem;color:var(--text-muted)">${days >= 7 ? '¡Semana completa! 🏆' : days >= 3 ? 'Buen ritmo 👍' : 'Empieza tu racha'}</div>
  </div>`;
}

// ============ HEATMAP ============
function renderHeatmap() {
  const el = document.getElementById('heatmap-panel');
  if (!el) return;
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0,7));
  }
  const actByMonth = {};
  leads.forEach(l => { const m = (l.date||'').slice(0,7); if (m) actByMonth[m] = (actByMonth[m]||0) + 1; });
  emailHistory.forEach(e => { const m = (e.date||'').slice(0,7); if (m) actByMonth[m] = (actByMonth[m]||0) + 1; });
  const max = Math.max(...months.map(m => actByMonth[m]||0), 1);
  el.innerHTML = '<div class="heatmap-grid">' + months.map(m => {
    const v = actByMonth[m] || 0;
    const level = v === 0 ? 0 : v <= max*0.25 ? 1 : v <= max*0.5 ? 2 : v <= max*0.75 ? 3 : 4;
    return `<div class="heatmap-cell heatmap-${level}" data-tip="${m}: ${v} acciones" title="${m}: ${v} acciones"></div>`;
  }).join('') + '</div><div style="font-size:.65rem;color:var(--text-dim);margin-top:.3rem">Últimos 12 meses</div>';
}

// ============ OBJECTIVES ============
function openObjectivesModal() {
  document.getElementById('obj-leads').value = objectives.leads;
  document.getElementById('obj-emails').value = objectives.emails;
  document.getElementById('obj-replies').value = objectives.replies;
  document.getElementById('objectives-modal').style.display = 'flex';
}
function closeObjectivesModal() { document.getElementById('objectives-modal').style.display = 'none'; }
async function saveObjectives() {
  objectives = {
    leads: parseInt(document.getElementById('obj-leads').value) || 20,
    emails: parseInt(document.getElementById('obj-emails').value) || 10,
    replies: parseInt(document.getElementById('obj-replies').value) || 3
  };
  try {
    await persistCriticalData('gordi_objectives', objectives, { label: 'objetivos' });
    closeObjectivesModal();
    renderObjectivesPanel();
    showToast('Objetivos guardados ✓');
  } catch {
    showToast('No se pudieron confirmar los objetivos. Quedan pendientes de recuperacion.');
  }
}
function renderObjectivesPanel() {
  const el = document.getElementById('objectives-panel');
  if (!el) return;
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); weekStart.setHours(0,0,0,0);
  let leadsW = 0;
  let emailsW = 0;
  let repliesW = 0;
  for (const lead of leads) {
    if (lead.date && new Date(lead.date) >= weekStart) leadsW++;
    if (lead.status === 'Respuesta del cliente' && lead.status_date && new Date(lead.status_date) >= weekStart) repliesW++;
  }
  const sentHistory = typeof getConfirmedCommercialHistory === 'function' ? getConfirmedCommercialHistory() : [];
  for (const email of sentHistory) {
    if (email.date && new Date(email.date) >= weekStart) emailsW++;
  }
  const items = [
    { label:'Leads nuevos', val:leadsW, target:objectives.leads, icon:'👥' },
    { label:'Emails enviados', val:emailsW, target:objectives.emails, icon:'✉️' },
    { label:'Respuestas', val:repliesW, target:objectives.replies, icon:'💬' },
  ];
  el.innerHTML = items.map(it => {
    const pct = Math.min(Math.round(it.val / Math.max(it.target,1) * 100), 100);
    const col = pct >= 100 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--primary)';
    return `<div style="margin-bottom:.6rem">
      <div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:.2rem">
        <span style="color:var(--text-muted)">${it.icon} ${it.label}</span>
        <span style="color:${col};font-weight:700">${it.val} / ${it.target}</span>
      </div>
      <div class="objective-bar"><div class="objective-fill" style="width:${pct}%;background:${col}"></div></div>
    </div>`;
  }).join('');
}

// ============ SEARCH HISTORY ============
function saveSearchHistory(segment, location) {
  const key = `${segment} — ${location}`;
  searchHistoryList = [key, ...searchHistoryList.filter(k => k !== key)].slice(0,5);
  if (typeof persistCriticalData === 'function') {
    persistCriticalData('gordi_search_history', searchHistoryList, { label: 'historial de busquedas' }).catch(() => {});
  } else {
    localStorage.setItem('gordi_search_history', JSON.stringify(searchHistoryList));
  }
  renderSearchHistory();
}
function renderSearchHistory() {
  const el = document.getElementById('search-history-bar');
  if (!el || !searchHistoryList.length) return;
  el.innerHTML = '<span style="font-size:.68rem;color:var(--text-dim);margin-right:.25rem">Recientes:</span>' +
    searchHistoryList.map(item => {
      const label = typeof item === 'string'
        ? item
        : [item.segment || item.sector || item.query || 'Busqueda', item.location || ''].filter(Boolean).join(' - ');
      const rawSeg = typeof item === 'string' ? label.split(' — ')[0] : (item.segment || item.sector || item.query || '');
      const rawLoc = typeof item === 'string' ? (label.split(' — ')[1] || '') : (item.location || '');
      return `<span class="sh-pill" onclick="applySearchHistory('${encodeURIComponent(rawSeg)}','${encodeURIComponent(rawLoc)}')">${cleanVisibleText(label)}</span>`;
    }).join('');
}
function applySearchHistory(seg, loc) {
  const segEl = document.getElementById('plan-segment');
  const locEl = document.getElementById('plan-location');
  if (segEl) segEl.value = decodeURIComponent(seg);
  if (locEl) locEl.value = decodeURIComponent(loc);
}

function renderPlan() {
  try { renderSearchHistory(); } catch {}
  try { sfUpdateChips('search'); } catch {}
}

// ============ AI EMAIL EXTRAS ============
async function regenerateSubjectOnly() {
  const lead = leads.find(l => l.id == aiCurrentLeadId);
  if (!lead) return;
  const btn = event.target;
  btn.textContent = '⏳ Generando...'; btn.disabled = true;
  try {
    // Usar Gemini para generar asuntos de email
    const text = await AI_ROUTER.call(
      `Genera 3 asuntos de email comercial cortos y directos para contactar a ${lead.company} (sector ${lead.segment}). Usa solo estos datos y no inventes informacion sobre la empresa. Devuelve solo los 3 asuntos numerados, sin mas texto.`,
      undefined,
      { purpose: 'email_subject_regeneration', temperature: 0.65, maxOutputTokens: 300 }
    );
    const subjects = text.split('\n').filter(l => l.trim() && /^\d/.test(l.trim())).slice(0,3);
    if (subjects.length) {
      const chosen = prompt('Elige un asunto (pega el que prefieras):\n\n' + subjects.join('\n'));
      if (chosen) document.getElementById('ai-subject-out').value = chosen.replace(/^\d+[\.\)]\s*/, '').trim();
    }
  } catch(e) { showToast('Error generando asuntos'); }
  btn.textContent = '🔄 Nuevo asunto'; btn.disabled = false;
}

async function saveAiEmailAsTemplate() {
  const lead = leads.find(l => l.id == aiCurrentLeadId);
  if (!lead) return;
  const subject = document.getElementById('ai-subject-out').value;
  const body = document.getElementById('ai-body-editor').innerText;
  const key = lead.segment || 'Default';
  if (!emailTemplates[key]) emailTemplates[key] = {};
  emailTemplates[key].subjectA = subject;
  emailTemplates[key].body = body;
  try {
    await persistTemplates('plantillas');
    showToast(`Plantilla guardada para sector ${key} ✓`);
  } catch {
    showToast('No se pudo confirmar la plantilla.');
  }
}

function checkSpam(subject) {
  const spamWords = ['gratis','free','oferta','urgente','descuento','!','€€','$$','100%','garantizado','ganador'];
  const hits = spamWords.filter(w => subject.toLowerCase().includes(w));
  const el = document.getElementById('spam-check-result');
  if (!el) return;
  if (hits.length === 0) el.innerHTML = '<span class="spam-ok">✅ Asunto sin palabras de spam</span>';
  else if (hits.length <= 2) el.innerHTML = `<span class="spam-warn">⚠️ Palabras de riesgo: ${hits.join(', ')}</span>`;
  else el.innerHTML = `<span class="spam-bad">🚫 Alto riesgo de spam: ${hits.join(', ')}</span>`;
}

function updateEmailWordCount() {
  const editor = document.getElementById('ai-body-editor');
  const el = document.getElementById('ai-word-count');
  if (!editor || !el) return;
  const words = editor.innerText.trim().split(/\s+/).filter(Boolean).length;
  el.className = 'word-count' + (words > 250 ? ' over' : '');
  el.textContent = `${words} palabras${words > 250 ? ' (recomendado: <220)' : ''}`;
  // Check spam on subject change
  const subj = document.getElementById('ai-subject-out');
  if (subj) checkSpam(subj.value);
}

async function generateFollowupEmail(id) {
  const lead = leads.find(l => l.id == id);
  if (!lead) return;
  const daysInStatus = lead.status_date ? Math.floor((Date.now()-new Date(lead.status_date))/86400000) : 7;
  closeAiModal();
  const modal = document.getElementById('ai-email-modal');
  modal.style.display = 'flex';
  document.getElementById('ai-loading').style.display = 'block';
  document.getElementById('ai-result').style.display = 'none';
  document.getElementById('ai-modal-title').innerText = `↩️ Seguimiento para ${lead.company}`;
  try {
    // Recuperar historial de contacto con este lead
    const sentHistory = typeof getConfirmedCommercialHistory === 'function' ? getConfirmedCommercialHistory() : [];
    const prevHistory = sentHistory.filter(h => h.leadId == lead.id || h.email === lead.email);
    const lastEmail = prevHistory[0];
    const emailCount = prevHistory.length;
    const lastSubject = lastEmail?.subject || '';
    const segmentToneFollow = SEGMENT_TONE[lead.segment] || SEGMENT_TONE['Default'];

    const followupPrompt = `Eres un experto en ventas B2B para Voltium Madrid (empresa de reformas). Debes escribir un email de seguimiento que consiga respuesta.

CONTEXTO DEL LEAD:
- Empresa: ${lead.company} | Sector: ${lead.segment} | Ciudad: ${lead.address || 'No disponible'}
- Estado actual: ${lead.status} | Score: ${lead.score || '?'}
- Días sin respuesta: ${daysInStatus}
- Emails previos enviados: ${emailCount}
- Último asunto enviado: "${lastSubject}"
- Señales del lead: ${(lead.signals||[]).slice(0,3).join(' · ') || 'sin señales'}
- Nota Google: ${lead.rating ? lead.rating + '/5 (' + lead.ratingCount + ' reseñas)' : 'sin datos'}
${lead.decision_maker ? '- Decisor: ' + lead.decision_maker : ''}

TONO DEL SECTOR: ${segmentToneFollow.tone}
DOLOR PRINCIPAL: ${segmentToneFollow.pain}
ÁNGULO DE VENTA: ${segmentToneFollow.angle}
PROHIBIDO: ${segmentToneFollow.forbidden}

REGLAS DEL SEGUIMIENTO:
- Usa exclusivamente los datos de este prompt. No inventes hechos, problemas, cargos, obras ni cifras de la empresa.
${daysInStatus <= 4 ? `- Han pasado SOLO ${daysInStatus} días. El tono debe ser muy breve y ligero — apenas un recordatorio amable. No dar la lata.` :
  daysInStatus <= 10 ? `- Han pasado ${daysInStatus} días. Aporta UN dato nuevo o ángulo diferente al primer email. No repetir lo mismo.` :
  `- Han pasado ${daysInStatus} días. Este es posiblemente el último intento. Abre una puerta de salida elegante ("si no es el momento...") pero con un CTA claro.`}
- NUNCA mencionar el asunto anterior ni decir "como te dije"
- NUNCA: "solo quería recordarte", "espero que todo vaya bien", frases de relleno
- SÍ: empezar con algo que aporte valor (un dato, una pregunta, un ángulo nuevo)
- Longitud: ${daysInStatus <= 4 ? '50-70' : '80-120'} palabras máximo en el cuerpo
- Formato HTML con <br><br> entre párrafos, <strong> solo en el CTA
- Genera 2 opciones de asunto: uno directo, uno de curiosidad/pregunta

Responde ÚNICAMENTE JSON válido:
{"subjects":["asunto directo","asunto pregunta/curiosidad"],"body":"HTML del email","tactic":"en 1 frase: qué táctica usaste y por qué para este caso concreto"}`;

    let text = await AI_ROUTER.call(followupPrompt, undefined, {
      purpose: 'email_followup_generation',
      temperature: 0.75,
      maxOutputTokens: 1500,
    });
    text = text.replace(/```json|```/g,'').trim();
    const result = JSON.parse(text);
    document.getElementById('ai-loading').style.display = 'none';
    document.getElementById('ai-result').style.display = 'block';
    // Show subject options if we have multiple
    const followSubjects = result.subjects || [result.subject];
    const subjectList = document.getElementById('ai-subjects-list');
    const subjectLabels = ['🎯 Directo', '❓ Pregunta'];
    if (subjectList) {
      subjectList.innerHTML = followSubjects.map((s, i) => `
        <div onclick="selectAiSubject(this, decodeURIComponent('${encodeAIInlineValue(s)}'))"
          style="cursor:pointer;padding:.5rem .75rem;border-radius:8px;border:1px solid var(--glass-border);
          background:var(--glass);font-size:.82rem;display:flex;gap:.5rem;align-items:center;justify-content:space-between;transition:border-color .15s"
          class="subject-option${i===0?' selected-subject':''}">
          <div style="display:flex;gap:.5rem;align-items:flex-start;flex:1">
            <span style="font-size:.7rem;color:var(--text-muted);white-space:nowrap;padding-top:1px">${subjectLabels[i]||'✏️'}</span>
            <span>${escapeAIText(s)}</span>
          </div>
          <button onclick="event.stopPropagation();copySubjectOption(decodeURIComponent('${encodeAIInlineValue(s)}'))" title="Copiar asunto"
            style="background:none;border:none;cursor:pointer;font-size:.75rem;color:var(--text-dim);padding:.1rem .3rem;border-radius:4px;flex-shrink:0;transition:color .15s"
            onmouseover="this.style.color='var(--primary)'" onmouseout="this.style.color='var(--text-dim)'">📋</button>
        </div>`).join('');
    }
    document.getElementById('ai-subject-out').value = followSubjects[0] || '';
    document.getElementById('ai-body-editor').innerHTML = typeof textToEditorHtml === 'function'
      ? textToEditorHtml(result.body || '')
      : sanitizeAIHTML(result.body || '');
    if (result.tactic) {
      document.getElementById('ai-reviews-insight').innerHTML =
        `<strong style="color:var(--primary)">🧠 Táctica usada:</strong> ${escapeAIText(result.tactic)}`;
      document.getElementById('ai-reviews-insight').style.display = 'block';
    }
  } catch(e) {
    document.getElementById('ai-loading').style.display = 'none';
    document.getElementById('ai-error').style.display = 'block';
    document.getElementById('ai-error-msg').textContent = 'Error: ' + e.message;
  }
}

// ============ PIN PROTECTION ============
function checkPin() {
  let pin;
  try {
    pin = localStorage.getItem('gordi_pin');
  } catch (e) {
    console.error('Error al acceder a localStorage para el PIN:', e);
    return; // Fallback gracefully if localStorage is unavailable
  }
  if (!pin) return;
  const input = prompt('🔒 Voltflow — Introduce tu PIN:');
  if (input !== pin) {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0f1e;color:#ef4444;font-family:sans-serif;font-size:1.2rem">🔒 PIN incorrecto. Recarga para intentarlo de nuevo.</div>';
    throw new Error('PIN incorrecto');
  }
}
function savePin() {
  const pin = document.getElementById('pin-input').value;
  if (pin && !/^\d{4}$/.test(pin)) { showToast('El PIN debe ser exactamente 4 dígitos'); return; }
  if (pin) { localStorage.setItem('gordi_pin', pin); document.getElementById('pin-status').innerHTML = '<span style="color:var(--success)">✅ PIN guardado</span>'; }
  else { localStorage.removeItem('gordi_pin'); document.getElementById('pin-status').innerHTML = '<span style="color:var(--text-muted)">PIN eliminado</span>'; }
}
function removePin() {
  localStorage.removeItem('gordi_pin');
  document.getElementById('pin-input').value = '';
  document.getElementById('pin-status').innerHTML = '<span style="color:var(--text-muted)">PIN eliminado</span>';
}

// ============ BACKUP / RESTORE ============
// exportDataSnapshot está definida en modules/init.js (versión authoritative
// con todas las claves gordi_gh_* y VOLTFLOW_DATA_KEYS completo)

// ─── EXPORTAR / IMPORTAR DATOS PORTÁTILES ENTRE VERSIONES ────────────────────
function exportPortableData() {
  return createSecureBackupNow();
  /* Legacy plaintext export retained as unreachable format documentation. */
  const snapshot = exportDataSnapshot();
  const leadsCount = (() => { try { return JSON.parse(snapshot.gordi_leads || '[]').length; } catch { return 0; } })();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `voltflow_datos_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(` Datos exportados (${leadsCount} leads + configuración)`);
}

// ─── IMPORTAR DESDE VERSIÓN ANTERIOR (lee localStorage directamente) ─────────
function openImportFromLocalStorage() {
  // Leer todos los datos gordi_ que hay en el localStorage ahora mismo
  const leadsRaw     = localStorage.getItem('gordi_leads');
  const historyRaw   = localStorage.getItem('gordi_email_history');
  const campaignsRaw = localStorage.getItem('gordi_campaigns');

  const leadsData    = (() => { try { return JSON.parse(leadsRaw || '[]'); } catch { return []; } })();
  const historyData  = (() => { try { return JSON.parse(historyRaw || '[]'); } catch { return []; } })();
  const campsData    = (() => { try { return JSON.parse(campaignsRaw || '[]'); } catch { return []; } })();

  const hasConfig = !!(
    localStorage.getItem('gordi_api_key') ||
    getGeminiKey() ||
    localStorage.getItem('gordi_user_name')
  );

  // Detectar todas las claves gordi_ presentes (incluyendo caché de enriquecimiento)
  const allGordiKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('gordi_')) allGordiKeys.push(k);
  }

  if (allGordiKeys.length === 0) {
    showToast('ℹ️ No se encontraron datos de Voltflow en este navegador');
    return;
  }

  // Análisis de duplicados con los leads actuales en memoria
  const normN = n => (n||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,25);
  let newCount = 0, dupCount = 0;
  for (const l of leadsData) {
    const dup = leads.find(ex =>
      (l.placeId && ex.placeId && l.placeId === ex.placeId) ||
      normN(ex.company) === normN(l.company)
    );
    if (dup) dupCount++; else newCount++;
  }

  // Detectar fecha del dato más reciente
  let lastActivity = null;
  for (const l of leadsData) {
    const d = new Date(l.date || 0);
    if (!lastActivity || d > lastActivity) lastActivity = d;
  }
  const lastStr = lastActivity
    ? lastActivity.toLocaleDateString('es-ES', {day:'2-digit', month:'short', year:'numeric'})
    : '—';

  // Calcular peso total
  let totalBytes = 0;
  for (const k of allGordiKeys) totalBytes += (localStorage.getItem(k)||'').length * 2;
  const totalKb = Math.round(totalBytes / 1024);

  document.getElementById('import-modal-overlay').style.display = 'flex';
  document.getElementById('import-modal-content').innerHTML = `
    <div style="padding:1.5rem;display:grid;gap:1.25rem">

      <!-- Cabecera: qué se ha encontrado -->
      <div style="background:rgba(10,132,255,.06);border:1px solid rgba(10,132,255,.15);border-radius:10px;padding:1rem 1.25rem">
        <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;color:var(--primary);font-weight:700;margin-bottom:.6rem">🔍 Datos encontrados en este navegador</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.45rem .75rem;font-size:.82rem">
          <div><span style="color:var(--text-muted)">Leads guardados:</span> <strong style="color:var(--text)">${leadsData.length}</strong></div>
          <div><span style="color:var(--text-muted)">Emails en historial:</span> <strong style="color:var(--text)">${historyData.length}</strong></div>
          <div><span style="color:var(--text-muted)">Campañas:</span> <strong style="color:var(--text)">${campsData.length}</strong></div>
          <div><span style="color:var(--text-muted)">Configuración:</span> <strong style="color:${hasConfig?'var(--success)':'var(--text-dim)'}">${hasConfig?'✅ Incluida':'—'}</strong></div>
          <div><span style="color:var(--text-muted)">Último lead añadido:</span> <strong style="color:var(--text)">${lastStr}</strong></div>
          <div><span style="color:var(--text-muted)">Peso total:</span> <strong style="color:var(--text-muted)">${totalKb} KB</strong></div>
        </div>
      </div>

      <!-- Contadores grandes -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem">
        <div style="background:var(--bg3);border:1px solid var(--glass-border);border-radius:10px;padding:.85rem;text-align:center">
          <div style="font-family:'Syne',sans-serif;font-size:1.6rem;font-weight:800;color:var(--primary)">${leadsData.length}</div>
          <div style="font-size:.7rem;color:var(--text-muted);margin-top:2px">Leads en storage</div>
        </div>
        <div style="background:var(--bg3);border:1px solid var(--glass-border);border-radius:10px;padding:.85rem;text-align:center">
          <div style="font-family:'Syne',sans-serif;font-size:1.6rem;font-weight:800;color:var(--warning)">${leads.length}</div>
          <div style="font-size:.7rem;color:var(--text-muted);margin-top:2px">Leads en memoria</div>
        </div>
        <div style="background:var(--bg3);border:1px solid var(--glass-border);border-radius:10px;padding:.85rem;text-align:center">
          <div style="font-family:'Syne',sans-serif;font-size:1.6rem;font-weight:800;color:var(--success)">${newCount}</div>
          <div style="font-size:.7rem;color:var(--text-muted);margin-top:2px">Leads nuevos</div>
        </div>
      </div>

      ${leadsData.length > 0 && leads.length > 0 ? `
      <div style="background:rgba(16,217,124,.05);border:1px solid rgba(16,217,124,.15);border-radius:8px;padding:.75rem 1rem;font-size:.8rem">
        <strong style="color:var(--success)">🔍 Análisis:</strong>
        <span style="color:var(--text-muted)"> ${newCount} leads <strong style="color:var(--success)">nuevos</strong> · ${dupCount} posibles <strong style="color:var(--warning)">duplicados</strong></span>
      </div>` : ''}

      ${leadsData.length === 0 ? `
      <div style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:.75rem 1rem;font-size:.82rem;color:var(--danger)">
        ⚠️ No se encontraron leads en el storage. Es posible que los datos estén en un navegador o perfil diferente.
      </div>` : ''}

      <!-- Opciones -->
      <div style="display:grid;gap:.75rem">
        <div style="font-size:.78rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.08em">¿Cómo quieres importar?</div>

        ${leads.length > 0 && leadsData.length > 0 ? `
        <button onclick="executeLocalImport('merge')" style="display:flex;align-items:flex-start;gap:.85rem;background:rgba(16,217,124,.07);border:1px solid rgba(16,217,124,.2);border-radius:10px;padding:.9rem 1.1rem;cursor:pointer;text-align:left;transition:all .2s;width:100%" onmouseover="this.style.borderColor='var(--success)'" onmouseout="this.style.borderColor='rgba(16,217,124,.2)'">
          <span style="font-size:1.3rem;flex-shrink:0">
          <div>
            <div style="font-weight:700;color:var(--success);font-size:.88rem;margin-bottom:2px">Combinar <span style="font-weight:400;color:var(--text-muted);font-size:.78rem">(recomendado)</span></div>
            <div style="font-size:.75rem;color:var(--text-muted);line-height:1.5">Añade los ${newCount} leads nuevos a los ${leads.length} que ya tienes en memoria. Los ${dupCount} duplicados se ignoran. No se pierde nada.</div>
          </div>
        </button>` : ''}

        ${leadsData.length > 0 ? `
        <button onclick="executeLocalImport('replace')" style="display:flex;align-items:flex-start;gap:.85rem;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.15);border-radius:10px;padding:.9rem 1.1rem;cursor:pointer;text-align:left;transition:all .2s;width:100%" onmouseover="this.style.borderColor='var(--warning)'" onmouseout="this.style.borderColor='rgba(245,158,11,.15)'">
          <span style="font-size:1.3rem;flex-shrink:0">🔄</span>
          <div>
            <div style="font-weight:700;color:var(--warning);font-size:.88rem;margin-bottom:2px">Cargar todo desde storage</div>
            <div style="font-size:.75rem;color:var(--text-muted);line-height:1.5">Carga los ${leadsData.length} leads y todos los datos guardados en el navegador como estado actual. ${leads.length > 0 ? `<strong style="color:var(--danger)">Reemplaza los ${leads.length} leads en memoria.</strong>` : ''}</div>
          </div>
        </button>` : ''}

        ${hasConfig ? `
        <button onclick="executeLocalImport('config_only')" style="display:flex;align-items:flex-start;gap:.85rem;background:rgba(94,92,230,.06);border:1px solid rgba(94,92,230,.15);border-radius:10px;padding:.9rem 1.1rem;cursor:pointer;text-align:left;transition:all .2s;width:100%" onmouseover="this.style.borderColor='var(--secondary)'" onmouseout="this.style.borderColor='rgba(94,92,230,.15)'">
          <span style="font-size:1.3rem;flex-shrink:0">⚙️</span>
          <div>
            <div style="font-weight:700;color:var(--secondary);font-size:.88rem;margin-bottom:2px">Solo configuración</div>
            <div style="font-size:.75rem;color:var(--text-muted);line-height:1.5">Trae solo las API keys, perfil y plantillas. Los leads no se tocan.</div>
          </div>
        </button>` : ''}

        <button onclick="closeImportModal()" style="background:var(--glass);border:1px solid var(--glass-border);border-radius:10px;padding:.75rem;cursor:pointer;color:var(--text-muted);font-size:.83rem;transition:all .2s" onmouseover="this.style.borderColor='var(--glass-hover)'" onmouseout="this.style.borderColor='var(--glass-border)'">
          Cancelar
        </button>
      </div>
    </div>`;
}

async function executeLocalImport(mode) {
  const normN = n => (n||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,25);
  const CONFIG_KEYS = ['gordi_api_key','gordi_gemini_key','gordi_hunter_key','gordi_apollo_key',
    'gordi_user_name','gordi_user_email','gordi_user_company','gordi_user_phone','gordi_user_web',
    'gordi_user_logo','gordi_templates','gordi_objectives','gordi_pin'];

  const leadsData  = (() => { try { return JSON.parse(localStorage.getItem('gordi_leads') || '[]'); } catch { return []; } })();
  const histData   = (() => { try { return JSON.parse(localStorage.getItem('gordi_email_history') || '[]'); } catch { return []; } })();
  const campsData  = (() => { try { return JSON.parse(localStorage.getItem('gordi_campaigns') || '[]'); } catch { return []; } })();

  const safety = typeof createSafetySnapshot === 'function'
    ? createSafetySnapshot(`before_local_import_${mode}`)
    : null;
  if (mode === 'replace' && !confirm(`Vas a reemplazar los datos actuales por los datos del storage.\n\nSnapshot de seguridad: ${safety ? 'creado' : 'no disponible'}.\n\nContinuar?`)) {
    return;
  }

  if (mode === 'merge') {
    const merged = [...leads];
    let added = 0;
    for (const l of leadsData) {
      const dup = leads.find(ex =>
        (l.placeId && ex.placeId && l.placeId === ex.placeId) ||
        normN(ex.company) === normN(l.company)
      );
      if (!dup) { merged.push(l); added++; }
    }
    leads = merged;
    // Historial: añadir los que no estén ya
    const exIds = new Set(emailHistory.map(h => h.id || (h.date + h.email)));
    const newHist = histData.filter(h => !exIds.has(h.id || (h.date + h.email)));
    emailHistory = [...emailHistory, ...newHist];
    // Campañas: añadir las nuevas
    const exCampIds = new Set(campaigns.map(c => c.id));
    campaigns = [...campaigns, ...campsData.filter(c => !exCampIds.has(c.id))];
    await persistBusinessState({ leads, emailHistory, campaigns }, { label: 'importacion local' });
    renderAll(); renderDashboardCharts(); renderTracking(); renderCampaigns();
    closeImportModal();
    showToast(`✅ Combinado: +${added} leads nuevos importados`);

  } else if (mode === 'replace') {
    leads = leadsData;
    emailHistory = histData;
    campaigns = campsData;
    await persistBusinessState({ leads, emailHistory, campaigns }, { label: 'importacion local' });
    renderAll(); renderDashboardCharts(); renderTracking(); renderCampaigns();
    closeImportModal();
    showToast(`✅ ${leads.length} leads cargados desde el storage`);

  } else if (mode === 'config_only') {
    for (const key of CONFIG_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) localStorage.setItem(key, val);
    }
    loadAllData();
    closeImportModal();
    showToast('✅ Configuración cargada (leads sin cambios)');
  }
}

function closeImportModal() {
  document.getElementById('import-modal-overlay').style.display = 'none';
}

function buildSnapshotFromFullBackup(data) {
  return {
    _voltflow_version: data.version || VOLTFLOW_VERSION || 'backup',
    _exported: data.date || new Date().toISOString(),
    gordi_leads: JSON.stringify(data.leads || []),
    gordi_email_history: JSON.stringify(data.emailHistory || []),
    gordi_campaigns: JSON.stringify(data.campaigns || []),
    gordi_objectives: JSON.stringify(data.objectives || {}),
    gordi_templates: JSON.stringify(data.templates || {})
  };
}

function openSafetySnapshotsModal() {
  const items = typeof listSafetySnapshots === 'function' ? listSafetySnapshots() : [];
  const rows = items.length ? items.map(item => {
    const date = new Date(item.date).toLocaleString('es-ES');
    const reason = (item.reason || 'manual').replace(/_/g, ' ');
    const summary = item.summary || {};
    return `
      <div style="display:grid;grid-template-columns:1fr auto;gap:.75rem;align-items:center;padding:.85rem;border:1px solid var(--glass-border);border-radius:10px;background:var(--bg3)">
        <div>
          <div style="font-weight:700;color:var(--text);font-size:.9rem">${date}</div>
          <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px">${reason} · ${summary.leads || 0} leads · ${summary.keys || 0} claves</div>
        </div>
        <button class="btn btn-small secondary" onclick="restoreSafetySnapshot('${item.id}')">Restaurar</button>
      </div>`;
  }).join('') : `
    <div style="padding:1rem;border:1px solid var(--glass-border);border-radius:10px;background:var(--bg3);color:var(--text-muted);font-size:.85rem">
      Todavia no hay snapshots automaticos. Se crean antes de importar, restaurar, sincronizar o abrir una version nueva.
    </div>`;

  document.getElementById('import-modal-overlay').style.display = 'flex';
  document.getElementById('import-modal-content').innerHTML = `
    <div style="padding:1.5rem;display:grid;gap:1rem">
      <div style="display:flex;justify-content:space-between;gap:1rem;align-items:center">
        <div>
          <h3 style="margin:0;color:var(--text)">Snapshots de seguridad</h3>
          <p style="margin:.25rem 0 0;color:var(--text-muted);font-size:.82rem">Ultimos ${items.length} puntos de recuperacion guardados en este navegador.</p>
        </div>
        <button onclick="closeImportModal()" class="btn btn-small ghost">Cerrar</button>
      </div>
      <div style="display:grid;gap:.65rem;max-height:420px;overflow:auto">${rows}</div>
      <div style="display:flex;gap:.6rem;justify-content:flex-end;flex-wrap:wrap">
        <button onclick="createSafetySnapshot('manual'); openSafetySnapshotsModal();" class="btn secondary">Crear punto interno</button>
        <button onclick="createSecureBackupNow()" class="btn primary">Crear copia externa cifrada</button>
      </div>
    </div>`;
}

// Banner de bienvenida tras migración automática en primer arranque
function showMigrationBanner(log) {
  const existing = document.getElementById('migration-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'migration-banner';
  banner.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9000;
    background:linear-gradient(135deg,rgba(15,23,41,.98),rgba(21,30,53,.98));
    border:1px solid rgba(10,132,255,.3);border-radius:16px;
    padding:1.1rem 1.3rem;max-width:360px;
    box-shadow:0 16px 48px rgba(0,0,0,.6);
    animation:slideInRight .35s cubic-bezier(.16,1,.3,1);
  `;

  const apiTxt  = log.hasApiKeys ? '<span style="color:var(--success)">✅ API keys</span>' : '';
  const profTxt = log.hasProfile ? '<span style="color:var(--success)">✅ Perfil</span>'    : '';
  const extras  = [apiTxt, profTxt].filter(Boolean).join(' · ');

  banner.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:.85rem">
      <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">⚡</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:.9rem;color:var(--text);margin-bottom:.2rem">¡Voltflow v${VOLTFLOW_VERSION} listo!</div>
        <div style="font-size:.78rem;color:var(--text-muted);line-height:1.5">
          Datos cargados automáticamente desde la versión anterior:
        </div>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.5rem">
          <span style="background:rgba(10,132,255,.12);border:1px solid rgba(10,132,255,.2);border-radius:20px;padding:2px 9px;font-size:.72rem;color:var(--primary);font-weight:600">
            ${log.leads} leads
          </span>
          ${log.emails > 0 ? `<span style="background:rgba(94,92,230,.12);border:1px solid rgba(94,92,230,.2);border-radius:20px;padding:2px 9px;font-size:.72rem;color:#a78bfc;font-weight:600">${log.emails} emails</span>` : ''}
          ${log.campaigns > 0 ? `<span style="background:rgba(16,217,124,.1);border:1px solid rgba(16,217,124,.2);border-radius:20px;padding:2px 9px;font-size:.72rem;color:var(--success);font-weight:600">${log.campaigns} campañas</span>` : ''}
        </div>
        ${extras ? `<div style="font-size:.72rem;margin-top:.4rem;display:flex;gap:.5rem;flex-wrap:wrap">${extras}</div>` : ''}
      </div>
      <button onclick="document.getElementById('migration-banner').remove()" style="background:none;border:none;color:var(--text-dim);font-size:1rem;cursor:pointer;padding:0;flex-shrink:0;line-height:1;margin-top:-2px" title="Cerrar">✖</button>
    </div>
  `;

  // Añadir keyframe si no existe
  if (!document.getElementById('migration-banner-style')) {
    const st = document.createElement('style');
    st.id = 'migration-banner-style';
    st.textContent = `@keyframes slideInRight { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:none; } }`;
    document.head.appendChild(st);
  }

  document.body.appendChild(banner);

  // Auto-cerrar a los 8 segundos
  setTimeout(() => {
    if (banner.parentNode) {
      banner.style.transition = 'opacity .4s, transform .4s';
      banner.style.opacity = '0';
      banner.style.transform = 'translateX(40px)';
      setTimeout(() => banner.remove(), 400);
    }
  }, 8000);
}

async function createSecureBackupNow() {
  if (!window.VoltflowSecureBackup) {
    showToast('El módulo de copia cifrada no está disponible');
    return;
  }
  const password = prompt('Contraseña maestra para cifrar la copia (mínimo 12 caracteres). No se guardará en Voltflow:');
  if (password === null) return;
  if (password.length < 12) {
    alert('La contraseña debe tener al menos 12 caracteres. No uses el PIN de acceso.');
    return;
  }
  const confirmation = prompt('Repite la contraseña maestra:');
  if (confirmation !== password) {
    alert('Las contraseñas no coinciden. No se ha creado ninguna copia.');
    return;
  }
  const includeSessionSecrets = confirm('¿Incluir también credenciales temporales de esta sesión?\n\nSolo elige Aceptar si quieres transportarlas expresamente. Al restaurar seguirán siendo temporales.');
  try {
    showToast('Preparando y cifrando la copia completa...');
    const result = await VoltflowSecureBackup.createBrowserBackup(password, {
      includeSessionSecrets,
      tabsCoordinated: document.visibilityState === 'visible'
    });
    const bytes = VoltflowSecureBackup.downloadContainer(result.container, result.filename);
    localStorage.setItem('gordi_last_external_backup_created', JSON.stringify({
      createdAt: result.payload.createdAt,
      filename: result.filename,
      bytes,
      verifiedFromDisk: false,
      secretsEncrypted: result.payload.manifest.inventory.totals.secrets
    }));
    renderSecureBackupStatus();
    alert('Copia cifrada descargada. Para considerarla verificada, pulsa “Comprobar copia” y selecciona el archivo descargado.');
  } catch (error) {
    console.error('Secure backup failed:', error);
    alert('No se pudo crear una copia consistente: ' + error.message);
  }
}

async function verifySecureBackup(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file || !window.VoltflowSecureBackup) return;
  const password = prompt('Contraseña maestra de esta copia:');
  if (password === null) return;
  try {
    const report = await VoltflowSecureBackup.verifyBackupFile(file, password);
    localStorage.setItem('gordi_last_external_backup_verified', JSON.stringify({
      verifiedAt: new Date().toISOString(),
      createdAt: report.createdAt,
      filename: file.name,
      bytes: report.bytes,
      secretsEncrypted: report.secrets,
      build: report.build,
      verifiedFromDisk: true
    }));
    renderSecureBackupStatus();
    alert('Copia verificada desde el archivo: cifrado, contraseña e integridad por secciones correctos.');
  } catch (error) {
    alert('La copia no es válida: ' + error.message);
  }
}

function renderSecureBackupStatus() {
  const element = document.getElementById('secure-backup-status');
  if (!element) return;
  let created = null;
  let verified = null;
  let restored = null;
  try { created = JSON.parse(localStorage.getItem('gordi_last_external_backup_created') || 'null'); } catch {}
  try { verified = JSON.parse(localStorage.getItem('gordi_last_external_backup_verified') || 'null'); } catch {}
  try { restored = JSON.parse(localStorage.getItem('gordi_last_verified_restore') || 'null'); } catch {}
  const verifiedText = verified
    ? `Última copia externa verificada: ${new Date(verified.verifiedAt).toLocaleString('es-ES')} · ${verified.filename} · ${Math.round((verified.bytes || 0) / 1024)} KB`
    : (created ? 'La última descarga todavía no se ha comprobado desde disco.' : 'Aún no hay una copia externa verificada.');
  const restoreText = restored
    ? `Última restauración completada: ${new Date(restored.restoredAt).toLocaleString('es-ES')}`
    : 'No consta una restauración completa probada en este origen.';
  element.innerHTML = `<strong style="color:${verified ? 'var(--success)' : 'var(--warning)'}">Estado de mis datos</strong><br>${verifiedText}<br>${restoreText}<br><span style="color:var(--text-dim)">Las copias internas no sustituyen una copia externa verificada.</span>`;
}

async function restoreSecureBackupFile(file) {
  const password = prompt('Contraseña maestra de la copia:');
  if (password === null) return;
  try {
    const parsed = JSON.parse(await file.text());
    const preview = await VoltflowSecureBackup.decryptContainer(parsed, password);
    const totals = preview.manifest.inventory.totals;
    if (!confirm(`Restaurar la copia del ${new Date(preview.createdAt).toLocaleString('es-ES')}?\n\nClaves locales: ${totals.localStorage}\nSecretos cifrados: ${totals.secrets}\n\nSe preparará un rollback antes de modificar los datos.`)) return;
    const restoreSession = Object.keys(preview.data.sessionStorage || {}).length > 0 && confirm('La copia contiene datos temporales de sesión. ¿Restaurarlos solo en esta sesión?');
    await VoltflowSecureBackup.restoreBrowserPayload(preview, password, { restoreSession, restorePersistentSecrets: true });
    if (typeof reloadDataFromStorage === 'function') reloadDataFromStorage();
    if (typeof renderAll === 'function') renderAll();
    renderSecureBackupStatus();
    alert('Restauración completa verificada. Los permisos OAuth y de carpetas pueden requerir autorización de nuevo.');
  } catch (error) {
    alert('No se modificaron los datos o se revirtió la operación: ' + error.message);
  }
}

async function exportFullBackup() {
  return createSecureBackupNow();
}

async function exportLegacyFullBackup() {
  let portableSnapshot = null;
  try {
    portableSnapshot = typeof exportCurrentDataSnapshot === 'function'
      ? await exportCurrentDataSnapshot()
      : (typeof exportDataSnapshot === 'function' ? exportDataSnapshot() : null);
  } catch {
    showToast('No se puede exportar una copia consistente: hay escrituras pendientes o fallo de IndexedDB.');
    return;
  }
  const integrity = portableSnapshot && typeof validateDataSnapshot === 'function'
    ? validateDataSnapshot(portableSnapshot).summary
    : null;
  const data = {
    version: '2.0', date: new Date().toISOString(),
    leads, emailHistory, campaigns, objectives,
    templates: emailTemplates,
    portableSnapshot,
    integrity
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `gordi_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast('Backup exportado ✓');
}

function openPasteRecoveryModal() {
  const old = document.getElementById('paste-recovery-modal');
  if (old) old.remove();
  const modal = document.createElement('div');
  modal.id = 'paste-recovery-modal';
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="width:min(720px,100%);background:var(--bg-card);border:1px solid var(--glass-border);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.45);overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid var(--glass-border)">
        <h3 style="margin:0;font-size:1rem">Pegar backup o datos portatiles</h3>
        <p style="margin:.35rem 0 0;color:var(--text-muted);font-size:.8rem;line-height:1.45">Pega aqui el JSON exportado desde otra URL o version. Se validara igual que un archivo de backup.</p>
      </div>
      <div style="padding:18px 20px">
        <textarea id="paste-recovery-json" spellcheck="false" placeholder='{"gordi_leads":"[...]"}' style="width:100%;height:260px;box-sizing:border-box;background:var(--glass);border:1px solid var(--glass-border);border-radius:10px;color:var(--text);padding:12px;font-family:ui-monospace,Consolas,monospace;font-size:.78rem;line-height:1.45;resize:vertical"></textarea>
      </div>
      <div style="padding:14px 20px;border-top:1px solid var(--glass-border);display:flex;justify-content:flex-end;gap:.6rem;flex-wrap:wrap">
        <button class="btn-outline" onclick="document.getElementById('paste-recovery-modal')?.remove()">Cancelar</button>
        <button class="btn-primary" onclick="restoreBackupFromPastedJson()">Validar y restaurar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('paste-recovery-json')?.focus(), 50);
}

function restoreBackupFromPastedJson() {
  const textarea = document.getElementById('paste-recovery-json');
  const raw = textarea?.value?.trim();
  if (!raw) { showToast('Pega primero el JSON del backup'); return; }
  try {
    JSON.parse(raw);
  } catch (e) {
    alert('JSON no valido: ' + e.message);
    return;
  }
  const file = new File([raw], 'voltflow_pasted_backup.json', { type: 'application/json' });
  document.getElementById('paste-recovery-modal')?.remove();
  historicalImportFromFile({ target: { files: [file] } });
}

let historicalImportSession = null;

async function historicalImportFromFile(event) {
  const file = event.target.files && event.target.files[0];
  if (event.target && 'value' in event.target) event.target.value = '';
  if (!file || !window.VoltflowHistoricalImport || !window.VoltflowSecureBackup) return;
  try {
    const source = JSON.parse(await file.text());
    const format = VoltflowHistoricalImport.detectFormat(source, VoltflowSecureBackup);
    if (format === 'unknown') throw new Error('Formato historico no reconocido');
    let sourcePassword = '';
    if (format === 'secure_v1') {
      sourcePassword = prompt('Contrasena maestra de la copia historica:');
      if (sourcePassword === null) return;
    }
    const currentPayload = await VoltflowSecureBackup.captureBrowserPayload({ includeSessionSecrets: true, tabsCoordinated: false });
    const baseOptions = {
      sourcePassword,
      secure: VoltflowSecureBackup,
      commercial: window.CommercialCommunications || null,
      secretResolutions: {},
      currentPayload
    };
    let plan = await VoltflowHistoricalImport.analyze(currentPayload.data.localStorage, source, baseOptions);
    for (const conflict of plan.secretConflicts.filter(item => item.resolution === 'requires_explicit_choice')) {
      const useImported = confirm(`La credencial ${conflict.key} existe tanto ahora como en la copia.\n\nAceptar: usar la credencial importada.\nCancelar: conservar la actual.\n\nLos valores permanecen ocultos.`);
      baseOptions.secretResolutions[conflict.key] = useImported ? 'use_imported' : 'keep_current';
    }
    plan = await VoltflowHistoricalImport.analyze(currentPayload.data.localStorage, source, baseOptions);
    historicalImportSession = { file, source, plan, currentPayload, safetyProof: null, safetyPassword: null };
    renderHistoricalImportPreview();
  } catch (error) {
    alert('No se modificaron los datos: ' + error.message);
  }
}

function renderHistoricalImportPreview() {
  const session = historicalImportSession;
  if (!session) return;
  document.getElementById('historical-import-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'historical-import-modal';
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
  const report = VoltflowHistoricalImport.publicReport(session.plan);
  const count = key => report.after.arrays[key] || 0;
  modal.innerHTML = `
    <div style="width:min(760px,100%);max-height:90vh;overflow:auto;background:var(--bg-card);border:1px solid var(--glass-border);border-radius:8px">
      <div style="padding:18px 20px;border-bottom:1px solid var(--glass-border)">
        <h3 style="margin:0;font-size:1rem">Recuperacion historica segura</h3>
        <p id="historical-source-summary" style="margin:.35rem 0 0;color:var(--text-muted);font-size:.8rem"></p>
      </div>
      <div style="padding:18px 20px;font-size:.82rem;line-height:1.55">
        <div><strong>Resultado previsto:</strong> <span id="historical-result-summary"></span></div>
        <div id="historical-conflict-summary"></div>
        <div id="historical-plaintext-warning" style="display:none;color:var(--warning);margin-top:.7rem"></div>
        <div style="margin-top:.8rem;color:var(--text-muted)">Antes de aplicar, crea una copia cifrada del estado actual y selecciona desde disco ese mismo archivo para comprobarla. La importacion se ejecutara con staging, validacion y rollback.</div>
        <div id="historical-safety-status" style="margin-top:.8rem;color:var(--warning)">Copia externa del estado actual pendiente de verificacion.</div>
      </div>
      <div style="padding:14px 20px;border-top:1px solid var(--glass-border);display:flex;gap:.6rem;justify-content:flex-end;flex-wrap:wrap">
        <button class="btn-outline" onclick="document.getElementById('historical-import-modal')?.remove();historicalImportSession=null">Cancelar</button>
        <button class="btn-outline" onclick="createSecureBackupNow()">1. Crear copia actual</button>
        <button class="btn-outline" onclick="document.getElementById('historical-safety-file').click()">2. Comprobar copia actual</button>
        <button class="btn-primary" id="historical-apply-button" onclick="applyHistoricalImport()" disabled>3. Fusionar datos</button>
        <input type="file" id="historical-safety-file" accept=".vfbackup,.json" style="display:none" onchange="verifyHistoricalSafetyBackup(event)">
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('historical-source-summary').textContent =
    `${String(report.format || 'desconocido')} · version ${String(report.sourceVersion || 'desconocida')} · analisis sin cambios`;
  document.getElementById('historical-result-summary').textContent =
    `${count('gordi_leads')} empresas/leads, ${count('gordi_email_history')} comunicaciones y ${count('gordi_campaigns')} campanas.`;
  document.getElementById('historical-conflict-summary').textContent =
    `Conflictos conservados: ${report.conflicts.length}. Credenciales resueltas expresamente: ${report.secretConflicts.length}. Permisos antiguos bloqueados: ${report.blockedPermissions.length}.`;
  if (report.plaintextSecretKeys.length) {
    const warning = document.getElementById('historical-plaintext-warning');
    warning.textContent = `La copia antigua contiene ${report.plaintextSecretKeys.length} credenciales en texto claro. Se procesaran solo en este navegador; crea despues una copia cifrada nueva.`;
    warning.style.display = 'block';
  }
}

async function verifyHistoricalSafetyBackup(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file || !historicalImportSession) return;
  const password = prompt('Contrasena maestra de la copia actual:');
  if (password === null) return;
  try {
    const proof = await VoltflowHistoricalImport.verifySafetyBackupFile(file, password, {
      secure: VoltflowSecureBackup
    });
    historicalImportSession.safetyProof = proof;
    historicalImportSession.safetyPassword = password;
    document.getElementById('historical-safety-status').textContent = `Copia actual verificada desde disco: ${proof.filename}`;
    document.getElementById('historical-safety-status').style.color = 'var(--success)';
    document.getElementById('historical-apply-button').disabled = false;
  } catch (error) {
    alert('La copia no corresponde al estado actual o no es valida: ' + error.message);
  }
}

async function applyHistoricalImport() {
  const session = historicalImportSession;
  if (!session || !session.safetyProof || !session.safetyPassword) return;
  if (!confirm('Fusionar ahora los datos historicos analizados? No se sustituiran colecciones completas y se conservara rollback.')) return;
  try {
    const result = await VoltflowHistoricalImport.commit(session.plan, session.safetyPassword, session.safetyProof, {
      secure: VoltflowSecureBackup
    });
    if (!result.ok) {
      const controlledError = new Error(result.code || 'HISTORICAL_IMPORT_NOT_APPLIED');
      controlledError.code = result.code;
      throw controlledError;
    }
    const report = VoltflowHistoricalImport.publicReport(session.plan);
    localStorage.setItem('gordi_last_historical_import_report', JSON.stringify({
      completedAt: new Date().toISOString(), transactionId: result.transactionId,
      sourceFingerprint: result.sourceFingerprint, summary: report.after,
      conflicts: report.conflicts.length, secretConflicts: report.secretConflicts.length
    }));
    historicalImportSession = null;
    document.getElementById('historical-import-modal')?.remove();
    if (typeof reloadDataFromStorage === 'function') reloadDataFromStorage();
    alert('Fusion historica completada y verificada. Crea una nueva copia cifrada para conservar el estado combinado fuera del navegador.');
  } catch (error) {
    if (['IMPORT_PLAN_STALE_REANALYSIS_REQUIRED', 'IMPORT_PLAN_COMPLETE_STATE_REANALYSIS_REQUIRED', 'CONCURRENT_WRITE_DETECTED_IMPORT_ABORTED', 'CONCURRENT_WRITE_ROLLED_BACK'].includes(error.code || error.message)) {
      historicalImportSession = null;
      document.getElementById('historical-import-modal')?.remove();
      alert('Los datos cambiaron desde la vista previa. No se aplico la importacion. Selecciona de nuevo el archivo para repetir el analisis y la aprobacion sobre el estado actual.');
      return;
    }
    alert('La fusion no se completo o fue revertida: ' + error.message);
  }
}

function restoreBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);

      if (data && data.format === 'voltflow-secure-backup') {
        await restoreSecureBackupFile(file);
        return;
      }

      if (data && data.backupType === 'auto_disk_daily' && data.portableSnapshot) {
        const validation = typeof validateDataSnapshot === 'function'
          ? validateDataSnapshot(data.portableSnapshot, typeof getCurrentDataSummary === 'function' ? getCurrentDataSummary() : null)
          : { ok: true, warnings: [] };
        if (!validation.ok) {
          alert('Backup automático corrupto o incompatible:\n- ' + validation.errors.join('\n- '));
          return;
        }
        if (!confirm(`Restaurar la copia automática del ${new Date(data.createdAt || data.date || 0).toLocaleString('es-ES')}?\n\nSe conservará un punto de recuperación antes de aplicar los datos.`)) return;
        if (typeof importDataSnapshotAsync !== 'function') throw new Error('Importador de snapshots no disponible');
        await importDataSnapshotAsync(data.portableSnapshot, true, { reason: 'before_restore_auto_disk_daily' });
        if (window.VoltflowStorage && typeof VoltflowStorage.rebuildReadyMarker === 'function') await VoltflowStorage.rebuildReadyMarker();
        if (typeof reloadDataFromStorage === 'function') reloadDataFromStorage();
        showToast('Backup automático histórico restaurado');
        return;
      }

      // ── Formato A: backup completo  { leads:[...], emailHistory:[...], ... }
      // Generado por "Backup completo (JSON)" en Voltflow2 / app.html
      if (data.leads && Array.isArray(data.leads)) {
        const backupSnapshot = data.portableSnapshot || buildSnapshotFromFullBackup(data);
        const validation = typeof validateDataSnapshot === 'function'
          ? validateDataSnapshot(backupSnapshot, typeof getCurrentDataSummary === 'function' ? getCurrentDataSummary() : null)
          : { ok: true, warnings: [] };
        if (!validation.ok) {
          alert('Backup corrupto o incompatible:\n- ' + validation.errors.join('\n- '));
          return;
        }
        const dateStr = data.date
          ? new Date(data.date).toLocaleDateString('es-ES')
          : 'fecha desconocida';
        const warnings = validation.warnings && validation.warnings.length ? `\n\nAvisos:\n- ${validation.warnings.join('\n- ')}` : '';
        if (!confirm(`Restaurar backup del ${dateStr}?\nSe cargaran ${data.leads.length} leads.\nSe creara un snapshot de seguridad antes de reemplazar los datos actuales.${warnings}`)) return;
        if (data.portableSnapshot && typeof importDataSnapshotAsync === 'function') {
          await importDataSnapshotAsync(data.portableSnapshot, true, { reason: 'before_restore_full_backup' });
          if (typeof reloadDataFromStorage === 'function') reloadDataFromStorage();
          showToast(`✅ Backup completo restaurado: ${validation.summary.leads} leads`);
          return;
        }
        if (typeof createSafetySnapshot === 'function') createSafetySnapshot('before_restore_legacy_backup');

        leads        = data.leads        || [];
        emailHistory = data.emailHistory || [];
        campaigns    = data.campaigns    || [];
        objectives   = data.objectives   || objectives;
        if (data.templates) {
          const base = (typeof defaultTemplates !== 'undefined') ? defaultTemplates : {};
          emailTemplates = { ...base, ...data.templates };
        }
        await persistBusinessState({ leads, emailHistory, campaigns, objectives, templates: emailTemplates }, { label: 'restauracion de backup' });
        renderAll(); renderDashboardCharts();
        if (typeof renderTracking     === 'function') renderTracking();
        if (typeof renderCampaigns    === 'function') renderCampaigns();
        if (typeof renderTemplateList === 'function') renderTemplateList();
        showToast(`✅ Backup restaurado: ${leads.length} leads`);
        return;
      }

      // ── Formato B: snapshot portátil del index.html antiguo ──────────────────
      // Generado por "Exportar datos portátiles" — estructura:
      // { _voltflow_version:"x", _exported:"...", gordi_leads:"[...]", ... }
      if (data.gordi_leads !== undefined || data._voltflow_version || data._exported) {
        const validation = typeof validateDataSnapshot === 'function'
          ? validateDataSnapshot(data, typeof getCurrentDataSummary === 'function' ? getCurrentDataSummary() : null)
          : { ok: true, warnings: [] };
        if (!validation.ok) {
          alert('Archivo corrupto o incompatible:\n- ' + validation.errors.join('\n- '));
          return;
        }
        let parsedLeads = [];
        try { parsedLeads = JSON.parse(data.gordi_leads || '[]'); } catch {}
        const dateStr = data._exported
          ? new Date(data._exported).toLocaleDateString('es-ES')
          : 'fecha desconocida';
        const warnings = validation.warnings && validation.warnings.length ? `\n\nAvisos:\n- ${validation.warnings.join('\n- ')}` : '';
        if (!confirm(`Restaurar datos portatiles del ${dateStr}?\nSe cargaran ${parsedLeads.length} leads.\nSe creara un snapshot de seguridad antes de reemplazar los datos actuales.${warnings}`)) return;
        if (typeof createSafetySnapshot === 'function') createSafetySnapshot('before_restore_portable_snapshot');

        // Volcar todas las claves gordi_* al localStorage
        let restored = 0;
        for (const [key, val] of Object.entries(data)) {
          if (key.startsWith('_')) continue;
          if (typeof val === 'string' && !(typeof VOLTFLOW_SNAPSHOT_EXCLUDED_KEYS !== 'undefined' && VOLTFLOW_SNAPSHOT_EXCLUDED_KEYS.has(key))) { localStorage.setItem(key, val); restored++; }
        }

        // Recargar estado en memoria desde el localStorage recién poblado
        try { leads        = JSON.parse(localStorage.getItem('gordi_leads')         || '[]'); } catch { leads = []; }
        try { emailHistory = JSON.parse(localStorage.getItem('gordi_email_history') || '[]'); } catch { emailHistory = []; }
        try { campaigns    = JSON.parse(localStorage.getItem('gordi_campaigns')     || '[]'); } catch { campaigns = []; }
        try { objectives   = JSON.parse(localStorage.getItem('gordi_objectives')    || '[]'); } catch {}
        const tplRaw = localStorage.getItem('gordi_templates');
        if (tplRaw) {
          try {
            const base = (typeof defaultTemplates !== 'undefined') ? defaultTemplates : {};
            emailTemplates = { ...base, ...JSON.parse(tplRaw) };
          } catch {}
        }

        renderAll(); renderDashboardCharts();
        if (typeof renderTracking     === 'function') renderTracking();
        if (typeof renderCampaigns    === 'function') renderCampaigns();
        if (typeof renderTemplateList === 'function') renderTemplateList();
        showToast(`✅ Datos portátiles restaurados: ${leads.length} leads`);
        return;
      }

      alert('Archivo no reconocido.\nUsa un "Backup completo" (gordi_backup_*.json) o un "Exportar datos portátiles" (voltflow_datos_*.json) generado por Voltflow.');

    } catch(err) {
      alert('Error al leer el archivo: ' + err.message + '\nAsegúrate de que es un JSON válido exportado desde Voltflow.');
    }
  };
  reader.readAsText(file);
}
function autoWeeklyBackup() {
  const last = localStorage.getItem('gordi_last_backup');
  const now = Date.now();
  if (!last || now - parseInt(last) > 7 * 86400000) {
    localStorage.setItem('gordi_last_backup', now.toString());
    if (leads.length > 0) {
      if (typeof createSafetySnapshot === 'function') {
        const item = createSafetySnapshot('auto_weekly', { maxBytes: 1200000 });
        if (item) localStorage.setItem('gordi_auto_backup', JSON.stringify({ version:'2.0', date:item.date, snapshotId:item.id, summary:item.summary }));
      } else {
        const data = { version:'2.0', date:new Date().toISOString(), leads, emailHistory, campaigns };
        localStorage.setItem('gordi_auto_backup', JSON.stringify(data));
      }
      if (!localStorage.getItem('gordi_backup_export_reminded')) {
        localStorage.setItem('gordi_backup_export_reminded', now.toString());
        setTimeout(() => showToast('Consejo: exporta un backup JSON para conservar una copia fuera del navegador'), 1200);
      }
    }
  }
}

// ============ CLEAN OBSOLETE ============
function cleanObsoleteLeads() {
  const cutoff = Date.now() - 90 * 86400000;
  const old = leads.filter(l => !l.archived && l.status === 'Pendiente' && new Date(l.date) < cutoff);
  if (!old.length) { showToast('No hay leads obsoletos (>90 días en Pendiente)'); return; }
  if (!confirm(`Hay ${old.length} leads en "Pendiente" hace más de 90 días. ¿Archivarlos todos?`)) return;
  old.forEach(l => l.archived = true);
  saveLeads();
  renderAll();
  showToast(`${old.length} leads archivados ✓`);
}

// ============ STORAGE INFO ============
function updateStorageInfo() {
  const el = document.getElementById('storage-info-text');
  const fill = document.getElementById('storage-fill');
  const idbEl = document.getElementById('indexeddb-status');
  if (typeof renderDiskBackupStatus === 'function') renderDiskBackupStatus();
  renderSecureBackupStatus();
  if (!el) return;
  let total = 0;
  for (let k in localStorage) { if (k.startsWith('gordi_')) total += (localStorage[k]||'').length * 2; }
  const kb = Math.round(total / 1024);
  const maxKb = 5120;
  const pct = Math.min(Math.round(kb / maxKb * 100), 100);
  const idbReady = window.VoltflowStorage && VoltflowStorage.isReadySync();
  el.textContent = `Espacio localStorage usado: ${kb} KB de ${maxKb} KB (${leads.length} leads · ${emailHistory.length} emails)`;
  if (idbEl) {
    idbEl.innerHTML = idbReady
      ? `<strong style="color:var(--success)">IndexedDB activo</strong> · datos grandes en almacenamiento escalable · localStorage original conservado`
      : `<strong style="color:var(--warning)">IndexedDB no activado</strong> · localStorage sigue siendo la fuente principal`;
  }
  if (fill) fill.style.width = pct + '%';
  if (fill) fill.style.background = pct > 80 ? 'var(--danger)' : pct > 60 ? 'var(--warning)' : '';
}

async function migrateStorageToIndexedDB() {
  if (!window.VoltflowStorage) {
    showToast('IndexedDB no esta disponible en este navegador');
    return;
  }
  const summary = typeof getCurrentDataSummary === 'function' ? getCurrentDataSummary() : { leads: leads.length, emails: emailHistory.length };
  const msg = `Activar almacenamiento grande?\n\nSe copiaran a IndexedDB:\n- ${summary.leads || 0} leads\n- ${summary.emails || 0} emails\n- ${summary.searches || 0} busquedas\n\nNo se borrara localStorage. Tras verificar la copia, el CRM cargara desde IndexedDB.`;
  if (!confirm(msg)) return;
  try {
    showToast('Copiando datos a IndexedDB...');
    const manifest = await VoltflowStorage.migrateFromLocalStorage({ source: 'settings-manual' });
    await hydrateVoltiumIndexedDBIfAvailable();
    renderActiveView();
    updateStorageInfo();
    const counts = manifest.expected || {};
    showToast(`IndexedDB activado: ${counts.leads?.count || 0} leads verificados`);
  } catch (err) {
    console.error('Migracion IndexedDB fallida:', err);
    showToast('No se pudo activar IndexedDB. No se han borrado datos.');
  }
}

// ============ API ERROR LOG ============
function logApiError(msg) {
  let log = JSON.parse(localStorage.getItem('gordi_api_log') || '[]');
  log.unshift({ msg, date: new Date().toISOString() });
  log = log.slice(0, 50);
  localStorage.setItem('gordi_api_log', JSON.stringify(log));
  renderApiLog();
}
function renderApiLog() {
  const el = document.getElementById('api-error-log');
  if (!el) return;
  const log = JSON.parse(localStorage.getItem('gordi_api_log') || '[]');
  el.innerHTML = log.length ? log.map(e => `<div style="border-bottom:1px solid var(--glass-border);padding:.2rem 0;"><span style="color:var(--text-dim)">${new Date(e.date).toLocaleString('es-ES')}</span> — ${e.msg}</div>`).join('') : 'Sin errores registrados ✓';
}
function clearApiLog() { localStorage.removeItem('gordi_api_log'); renderApiLog(); showToast('Log limpiado'); }

// ============ TUTORIAL ============
const tutorialSteps = [
  { icon:'⚡', title:'Bienvenido a Voltflow', body:'Tu herramienta de prospección B2B para Voltium Madrid. En 5 pasos aprenderás todo lo que necesitas saber.' },
  { icon:'🔍', title:'Busca empresas con IA', body:'Ve a "Buscar Empresas", introduce una zona y sector. Voltflow encontrará empresas reales con email, teléfono y decisor usando Google Maps.' },
  { icon:'✨', title:'Email hiperpersonalizado', body:'Abre cualquier lead y pulsa ✨ IA. Voltflow analiza las reseñas de Google de esa empresa y escribe un email que menciona sus problemas concretos.' },
  { icon:'📋', title:'Pipeline Kanban', body:'Usa el Kanban para gestionar visualmente en qué estado está cada empresa. Arrastra las tarjetas entre columnas conforme avanza la conversación.' },
  { icon:'🎯', title:'Configura las APIs', body:'Para activar la búsqueda de empresas necesitas una Google Maps API Key (console.cloud.google.com). Para el email IA, una Gemini Key gratis en aistudio.google.com/apikey.' },
];
let tutStep = 0;
function showTutorial() {
  tutStep = 0;
  renderTutorialStep();
  document.getElementById('tutorial-overlay').style.display = 'flex';
}
function renderTutorialStep() {
  const s = tutorialSteps[tutStep];
  document.getElementById('tutorial-icon').textContent = s.icon;
  document.getElementById('tutorial-title').textContent = s.title;
  document.getElementById('tutorial-body').textContent = s.body;
  document.getElementById('tutorial-dots').innerHTML = tutorialSteps.map((_,i) => `<div class="tutorial-dot${i===tutStep?' active':''}"></div>`).join('');
  document.getElementById('tutorial-prev').style.display = tutStep > 0 ? 'inline-flex' : 'none';
  document.getElementById('tutorial-next').textContent = tutStep < tutorialSteps.length - 1 ? 'Siguiente ->' : '¡Empezar!';
}
function nextTutorial() {
  if (tutStep < tutorialSteps.length - 1) { tutStep++; renderTutorialStep(); }
  else closeTutorial();
}
function prevTutorial() { if (tutStep > 0) { tutStep--; renderTutorialStep(); } }
function closeTutorial() {
  document.getElementById('tutorial-overlay').style.display = 'none';
  localStorage.setItem('gordi_tutorial_done', '1');
}

// ============ SOURCE TRACKING UPDATE ============
// Patch importSelectedSearch to add source
const _origImportSearch = importSelectedSearch;
// Already has source:'search' in the new saveLead - handled inline

// ============ RENDER DASHBOARD OVERRIDE ============
function renderDashboardCharts() {
  const measure = typeof voltflowMeasureTask === 'function'
    ? voltflowMeasureTask
    : (_name, fn) => fn();
  measure('dashboard:segment-chart', renderSegmentChart);
  measure('dashboard:top-leads', renderTopLeads);
  measure('dashboard:conversion-metrics', renderConversionMetrics);
  measure('dashboard:sector-performance', renderSectorPerformance);
  measure('dashboard:intel-panel', renderIntelPanel);
  measure('dashboard:smart-alert', renderSmartAlert);
  measure('dashboard:funnel-chart', renderFunnelChart);
  measure('dashboard:pipeline-value', renderPipelineValue);
  measure('dashboard:streak-panel', renderStreakPanel);
  measure('dashboard:heatmap', renderHeatmap);
  measure('dashboard:objectives-panel', renderObjectivesPanel);
  measure('dashboard:today-panel', renderTodayPanel);
  measure('dashboard:api-log', renderApiLog);
  measure('dashboard:storage-info', updateStorageInfo);
  measure('dashboard:daily-stats', renderDailyStats);
  measure('dashboard:sanitize-markup', sanitizeDashboardMarkup);
}

function renderDailyStats() {
  const container = document.getElementById('daily-stats-panel');
  if (!container) return;
  const days = 30;
  const map = {};
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map[key] = { added: 0, contacted: 0, converted: 0 };
  }
  leads.forEach(l => {
    if (l.archived) return;
    const day = (l.date || '').slice(0, 10);
    if (map[day]) map[day].added++;
    if (l.status === 'Contactado' || l.status === 'En negociación' || l.status === 'Cerrado') {
      const actDay = (l.activity || []).find(a => a.action && a.action.toLowerCase().includes('email'));
      const cDay = actDay ? actDay.date.slice(0, 10) : day;
      if (map[cDay]) map[cDay].contacted++;
    }
    if (l.status === 'Cerrado') { if (map[day]) map[day].converted++; }
  });
  const sorted = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  const maxVal = Math.max(...sorted.map(([,v]) => v.added), 1);
  const totalAdded = sorted.reduce((s,[,v]) => s + v.added, 0);
  const totalContacted = sorted.reduce((s,[,v]) => s + v.contacted, 0);
  const totalConverted = sorted.reduce((s,[,v]) => s + v.converted, 0);
  const avgPerDay = (totalAdded / days).toFixed(1);
  const bestDay = sorted.reduce((best, cur) => cur[1].added > best[1].added ? cur : best, sorted[0]);
  let html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:.75rem;margin-bottom:1.25rem">'
    + '<div style="background:var(--glass);border-radius:10px;padding:.75rem;text-align:center"><div style="font-size:1.4rem;font-weight:700;color:var(--primary)">' + totalAdded + '</div><div style="font-size:.72rem;color:var(--text-muted);margin-top:.2rem">Leads añadidos</div></div>'
    + '<div style="background:var(--glass);border-radius:10px;padding:.75rem;text-align:center"><div style="font-size:1.4rem;font-weight:700;color:var(--success)">' + totalContacted + '</div><div style="font-size:.72rem;color:var(--text-muted);margin-top:.2rem">Contactados</div></div>'
    + '<div style="background:var(--glass);border-radius:10px;padding:.75rem;text-align:center"><div style="font-size:1.4rem;font-weight:700;color:#a78bfa">' + totalConverted + '</div><div style="font-size:.72rem;color:var(--text-muted);margin-top:.2rem">Cerrados</div></div>'
    + '<div style="background:var(--glass);border-radius:10px;padding:.75rem;text-align:center"><div style="font-size:1.4rem;font-weight:700;color:#f59e0b">' + avgPerDay + '</div><div style="font-size:.72rem;color:var(--text-muted);margin-top:.2rem">Media/día</div></div>'
    + '<div style="background:var(--glass);border-radius:10px;padding:.75rem;text-align:center"><div style="font-size:1.1rem;font-weight:700;color:#f472b6">' + bestDay[0].slice(5) + '</div><div style="font-size:.72rem;color:var(--text-muted);margin-top:.2rem">Mejor día (' + bestDay[1].added + ')</div></div>'
    + '</div>';
  html += '<div style="display:flex;align-items:flex-end;gap:3px;height:88px;overflow-x:auto;padding-bottom:.5rem">';
  const todayKey = now.toISOString().slice(0, 10);
  sorted.forEach(([date, val]) => {
    const h = Math.max(4, Math.round((val.added / maxVal) * 76));
    const isToday = date === todayKey;
    const color = isToday ? 'var(--primary)' : val.added > 0 ? 'rgba(10,132,255,0.45)' : 'var(--glass)';
    const lbl = isToday ? '<div style="font-size:.55rem;color:var(--primary);margin-top:2px">hoy</div>'
      : val.added > 0 ? '<div style="font-size:.55rem;color:var(--text-dim);margin-top:2px">' + val.added + '</div>'
      : '<div style="font-size:.55rem;color:transparent;margin-top:2px">0</div>';
    html += '<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:18px" title="' + date + ': ' + val.added + ' leads">'
      + '<div style="width:100%;background:' + color + ';height:' + h + 'px;border-radius:3px 3px 0 0"></div>' + lbl + '</div>';
  });
  html += '</div><div style="display:flex;justify-content:space-between;font-size:.65rem;color:var(--text-dim);margin-top:.25rem"><span>' + sorted[0][0].slice(5) + '</span><span>' + sorted[sorted.length-1][0].slice(5) + '</span></div>';
  const last7 = sorted.slice(-7).reverse();
  const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  html += '<div style="margin-top:1rem"><div style="font-size:.72rem;font-weight:600;color:var(--text-muted);margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.06em">Últimos 7 días</div><div style="display:grid;gap:.35rem">';
  last7.forEach(([date, val]) => {
    const isToday = date === todayKey;
    const pct = Math.round((val.added / maxVal) * 100);
    const diaSemana = dias[new Date(date + 'T12:00:00').getDay()];
    const label = isToday ? '🔵 Hoy' : diaSemana + ' ' + date.slice(5);
    const barColor = isToday ? 'var(--primary)' : 'var(--success)';
    html += '<div style="display:grid;grid-template-columns:65px 1fr 45px;align-items:center;gap:.5rem">'
      + '<div style="font-size:.72rem;color:' + (isToday ? 'var(--primary)' : 'var(--text-muted)') + ';font-weight:' + (isToday ? 700 : 400) + '">' + label + '</div>'
      + '<div style="background:var(--glass);border-radius:4px;height:8px;overflow:hidden"><div style="width:' + pct + '%;background:' + barColor + ';height:100%;border-radius:4px"></div></div>'
      + '<div style="font-size:.72rem;color:var(--text-muted);text-align:right">' + val.added + ' lead' + (val.added !== 1 ? 's' : '') + '</div>'
      + '</div>';
  });
  html += '</div></div>';
  container.innerHTML = html;
}


/**
 * Popula dinámicamente todos los selectores de segmentos en la aplicación.
 * Centraliza la fuente de verdad en SEGMENT_LABELS (email-templates.js).
 */
function populateSegmentDropdowns() {
  const segments = Object.keys(SEGMENT_LABELS);
  
  // 1. Selector en formulario de nuevo lead
  const leadSel = document.getElementById('lead-segment');
  if (leadSel) {
    const cur = leadSel.value;
    leadSel.innerHTML = '<option value="" disabled selected>Selecciona sector...</option>' + 
      segments.map(seg => `<option value="${seg}">${SEGMENT_LABELS[seg]}</option>`).join('');
    if (cur && segments.includes(cur)) leadSel.value = cur;
  }

  // 2. Filtro en la vista de leads
  const filterSel = document.getElementById('filter-segment');
  if (filterSel) {
    const cur = filterSel.value;
    filterSel.innerHTML = '<option value="">Todos los sectores</option>' + 
      segments.map(seg => `<option value="${seg}">${SEGMENT_LABELS[seg]}</option>`).join('');
    if (cur && segments.includes(cur)) filterSel.value = cur;
  }

  // 3. Selector en plan de acción
  const planSel = document.getElementById('plan-segment');
  if (planSel) {
    const cur = planSel.value;
    planSel.innerHTML = segments.map(seg => `<option value="${seg}">${SEGMENT_LABELS[seg]}</option>`).join('');
    if (cur && segments.includes(cur)) planSel.value = cur;
  }
  if (typeof renderMultiSectorPicker === 'function') renderMultiSectorPicker();

  // 4. Selector en creación de campaña
  const campSel = document.getElementById('camp-segment');
  if (campSel) {
    const cur = campSel.value;
    campSel.innerHTML = '<option value="Todos">Todos los segmentos</option>' + 
      segments.map(seg => `<option value="${seg}">${SEGMENT_LABELS[seg]}</option>`).join('');
    if (cur && (cur === 'Todos' || segments.includes(cur))) campSel.value = cur;
  }

  [
    { id: 'kanban-filter-seg', empty: 'Todos los sectores' },
    { id: 'tracking-filter-seg', empty: 'Todos los sectores' },
    { id: 'campaigns-filter-seg', empty: 'Todos los sectores', extra: '<option value="Todos">Todos</option>' },
  ].forEach(cfg => {
    const sel = document.getElementById(cfg.id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = `<option value="">${cfg.empty}</option>${cfg.extra || ''}` +
      segments.map(seg => `<option value="${seg}">${SEGMENT_LABELS[seg]}</option>`).join('');
    if (cur && (cur === 'Todos' || segments.includes(cur))) sel.value = cur;
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE MAPS AUTO-INIT
// En el monolito index.html, loadGoogleMapsScript() se llamaba al guardar la
// API Key. En la versión modular esa llamada se perdió al separar init.js.
// Esta función lo resuelve: se ejecuta al arrancar (si ya hay key guardada)
// y también puede llamarse desde init.js / saveApiKey() tras guardar una key.
// ══════════════════════════════════════════════════════════════════════════════
function ensureGoogleMapsLoaded() {
  if (typeof isZeroCostMode !== 'function' || isZeroCostMode()) return false;
  const apiKey = localStorage.getItem('gordi_api_key');
  if (!apiKey) return false;
  if (typeof loadGoogleMapsScript === 'function') {
    return loadGoogleMapsScript(apiKey);
  }
  return false;
}


function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:2rem;right:2rem;background:var(--bg2);border:1px solid var(--glass-border);color:var(--text);padding:.75rem 1.25rem;border-radius:10px;font-size:.83rem;z-index:9999;animation:fadeIn .3s ease;box-shadow:0 8px 24px rgba(0,0,0,.4)`;
  t.innerText = cleanVisibleText(msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

async function copyToClipboard(text, message = 'Copiado al portapapeles') {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Copy: ${cleanVisibleText(message)}`);
  } catch (err) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast(`Copy: ${cleanVisibleText(message)}`);
    } catch (copyErr) {
      console.error('Error al copiar:', copyErr);
    }
    document.body.removeChild(textArea);
  }
}

function toggleLightMode() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('gordi_light_mode', isLight ? '1' : '0');
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = isLight ? 'Claro' : 'Oscuro';
}

function applyLightMode(on) {
  if (on) document.body.classList.add('light-mode');
  else document.body.classList.remove('light-mode');
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = on ? 'Claro' : 'Oscuro';
}


const VISIBLE_TEXT_MOJIBAKE_RE = /[\u00c3\u00c2\u00e2\u00f0\u00c5\u0192]/;
const TEXT_NORMALIZE_BATCH_MS = 8;
const TEXT_NORMALIZE_MAX_QUEUE = 200;
let _textNormalizeQueue = [];
let _textNormalizeQueued = new WeakSet();
let _textNormalizeScheduled = false;
let _textNormalizeObserver = null;

function rootMayNeedTextNormalization(root) {
  if (!root) return false;
  if (root.nodeType === Node.TEXT_NODE) return VISIBLE_TEXT_MOJIBAKE_RE.test(root.nodeValue || '');
  if (root.nodeType !== Node.ELEMENT_NODE && root !== document.body) return false;
  if (VISIBLE_TEXT_MOJIBAKE_RE.test(root.textContent || '')) return true;
  if (!root.querySelectorAll) return false;
  const attrNodes = [];
  if (root.matches?.('[title], [aria-label], [placeholder], [alt], [data-tooltip]')) attrNodes.push(root);
  root.querySelectorAll('[title], [aria-label], [placeholder], [alt], [data-tooltip]').forEach(el => attrNodes.push(el));
  return attrNodes.some(el => ['title', 'aria-label', 'placeholder', 'alt', 'data-tooltip']
    .some(attr => el.hasAttribute(attr) && VISIBLE_TEXT_MOJIBAKE_RE.test(el.getAttribute(attr) || '')));
}

function normalizeVisibleTextNodes(root = document.body, deadline = null) {
  if (!root || !rootMayNeedTextNormalization(root)) return;
  const scope = root.nodeType === Node.TEXT_NODE ? root.parentElement : root;
  if (!scope) return;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || ['SCRIPT','STYLE','TEXTAREA','INPUT','CODE','PRE'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return VISIBLE_TEXT_MOJIBAKE_RE.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  let node;
  while ((node = walker.nextNode())) {
    const cleaned = cleanVisibleText(node.nodeValue);
    if (cleaned !== node.nodeValue) node.nodeValue = cleaned;
    if (deadline && performance.now() > deadline.time) {
      scheduleVisibleTextNormalization(scope);
      return;
    }
  }

  if (!scope.querySelectorAll) return;
  const attrNodes = [];
  if (scope.matches?.('[title], [aria-label], [placeholder], [alt], [data-tooltip]')) attrNodes.push(scope);
  scope.querySelectorAll('[title], [aria-label], [placeholder], [alt], [data-tooltip]').forEach(el => attrNodes.push(el));
  attrNodes.forEach(el => {
    ['title', 'aria-label', 'placeholder', 'alt', 'data-tooltip'].forEach(attr => {
      if (!el.hasAttribute(attr)) return;
      const value = el.getAttribute(attr);
      if (!VISIBLE_TEXT_MOJIBAKE_RE.test(value || '')) return;
      const cleaned = cleanVisibleText(value);
      if (cleaned !== value) el.setAttribute(attr, cleaned);
    }, { purpose: 'ui_subject_regeneration' });
  });
}

function scheduleTextNormalizeDrain() {
  if (_textNormalizeScheduled) return;
  _textNormalizeScheduled = true;
  const run = () => {
    _textNormalizeScheduled = false;
    const deadline = { time: performance.now() + TEXT_NORMALIZE_BATCH_MS };
    while (_textNormalizeQueue.length && performance.now() <= deadline.time) {
      const root = _textNormalizeQueue.shift();
      if (root && root.nodeType === Node.ELEMENT_NODE) _textNormalizeQueued.delete(root);
      normalizeVisibleTextNodes(root, deadline);
    }
    if (_textNormalizeQueue.length) scheduleTextNormalizeDrain();
  };
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 600 });
  else setTimeout(run, 60);
}

function scheduleVisibleTextNormalization(root = document.body) {
  if (!root || !rootMayNeedTextNormalization(root)) return;
  if (root.nodeType === Node.ELEMENT_NODE && _textNormalizeQueued.has(root)) return;
  if (root.nodeType === Node.ELEMENT_NODE) _textNormalizeQueued.add(root);
  _textNormalizeQueue.push(root);
  if (_textNormalizeQueue.length > TEXT_NORMALIZE_MAX_QUEUE) {
    _textNormalizeQueue = [document.body];
    _textNormalizeQueued = new WeakSet();
  }
  scheduleTextNormalizeDrain();
}

function initVisibleTextNormalization() {
  scheduleVisibleTextNormalization();
  if (typeof MutationObserver === 'function' && !_textNormalizeObserver) {
    _textNormalizeObserver = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
            scheduleVisibleTextNormalization(node);
          }
        });
      });
    }, { purpose: 'ui_followup_generation' });
    _textNormalizeObserver.observe(document.body, { childList: true, subtree: true });
  }
}

function sanitizeDashboardMarkup() {
  const ids = [
    'segment-chart',
    'top-leads-list',
    'conversion-metrics',
    'sector-performance',
    'intel-content',
    'smart-alert',
    'funnel-chart',
    'pipeline-value',
    'pipeline-value-panel',
    'streak-panel',
    'heatmap-panel',
    'objectives-panel',
    'today-content',
    'api-log',
    'storage-info',
    'daily-stats-panel',
    'recent-activity'
  ];

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el || typeof el.innerHTML !== 'string') return;
    const cleaned = cleanVisibleText(el.innerHTML);
    if (cleaned !== el.innerHTML) el.innerHTML = cleaned;
  });

  scheduleVisibleTextNormalization();
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(ensureGoogleMapsLoaded, 500);
  initVisibleTextNormalization();
});

function cleanVisibleText(value) {
  let text = String(value ?? '');
  if (!VISIBLE_TEXT_MOJIBAKE_RE.test(text)) return text;
  const hasMojibake = str => /[\u00c3\u00c2\u00e2\u00f0\u00c5\u0192]/.test(str);
  const cp1252Bytes = {
    '\u20ac': 0x80, '\u201a': 0x82, '\u0192': 0x83, '\u201e': 0x84,
    '\u2026': 0x85, '\u2020': 0x86, '\u2021': 0x87, '\u02c6': 0x88,
    '\u2030': 0x89, '\u0160': 0x8a, '\u2039': 0x8b, '\u0152': 0x8c,
    '\u017d': 0x8e, '\u2018': 0x91, '\u2019': 0x92, '\u201c': 0x93,
    '\u201d': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97,
    '\u02dc': 0x98, '\u2122': 0x99, '\u0161': 0x9a, '\u203a': 0x9b,
    '\u0153': 0x9c, '\u017e': 0x9e, '\u0178': 0x9f
  };
  const decoder = typeof TextDecoder !== 'undefined'
    ? new TextDecoder('utf-8', { fatal: false })
    : null;

  const decodeChunk = chunk => {
    let decoded = chunk;
    for (let i = 0; i < 4 && hasMojibake(decoded); i++) {
      const bytes = [];
      let encodable = true;
      for (const ch of decoded) {
        const code = ch.charCodeAt(0);
        if (code <= 0xff) bytes.push(code);
        else if (Object.prototype.hasOwnProperty.call(cp1252Bytes, ch)) bytes.push(cp1252Bytes[ch]);
        else { encodable = false; break; }
      }
      if (!encodable || !decoder) break;
      const next = decoder.decode(new Uint8Array(bytes));
      if (!next || next === decoded) break;
      decoded = next;
    }
    return decoded;
  };

  for (let i = 0; i < 3 && hasMojibake(text); i++) {
    const next = text.replace(/[\u00c3\u00c2\u00e2\u00f0\u00c5][^\s<>"'=()]*/g, decodeChunk);
    if (next === text) break;
    text = next;
  }
  return text;
}
