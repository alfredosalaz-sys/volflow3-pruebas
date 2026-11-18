// ============ ESTADO ============
let leads = [];
let emailHistory = [];
let campaigns = [];
let emailTemplates = {};
let tempImportLeads = [];
let tempSearchResults = [];
let selectedLeadIds = new Set();
let undoBuffer = null;
let undoTimer = null;
let searchHistoryList = [];
let objectives = { leads: 20, emails: 10, replies: 3 };
let scrapingQualityLog = [];

// Acceso explicito al estado lexico para persistencia y reconciliacion entre pestanas.
// No expone setters globales ni convierte las colecciones internas en propiedades de window.
window.VoltflowStateAccess = Object.freeze({
    getCollection(key) {
        if (key === 'gordi_leads') return leads;
        if (key === 'gordi_email_history') return emailHistory;
        if (key === 'gordi_campaigns') return campaigns;
        if (key === 'gordi_search_history') return searchHistoryList;
        return null;
    }
});

// 🏛️ ARQUITECTURA: Bus de Eventos Simple
// Permite que los módulos se comuniquen sin estar acoplados
const VoltiumEvents = {
    _events: {},
    on(event, callback) {
        if (!this._events[event]) this._events[event] = [];
        this._events[event].push(callback);
    },
    emit(event, data) {
        if (!this._events[event]) return;
        this._events[event].forEach(callback => callback(data));
    }
};

// Helper para notificar cambios de estado
function notifyStateChange(module, detail = {}) {
    VoltiumEvents.emit('state:changed', { module, ...detail });
}

function getGeminiKey() {
    try {
        const sessionKey = sessionStorage.getItem('gordi_gemini_key');
        if (sessionKey) return sessionKey;
    } catch {}
    return localStorage.getItem('gordi_gemini_key') || localStorage.getItem('gordi_claude_key') || '';
}
