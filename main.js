import './style.css'

const API_BASE = import.meta.env.VITE_API_URL || 'https://recuperadora-api-sii.nojauc.easypanel.host';
const API_KEY = 'mi_llave_secreta_123';

// Selectores UI
const scoutBtn = document.getElementById('scout-btn');
const closeBtn = document.getElementById('close-session-btn');
const loader = document.getElementById('loader');
const resultsDisplay = document.getElementById('results-display');
const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const f29Screenshot = document.getElementById('f29-screenshot');

// Navegación (Tabs)
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view-section');

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const targetId = item.getAttribute('data-view');
        if (!targetId) return;

        // Update Nav UI
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        // Switch View
        views.forEach(v => {
            v.style.display = (v.id === targetId) ? 'block' : 'none';
        });

        // Initialize Live Agent view if selected
        if (targetId === 'view-live-agent') {
            initLiveChat();
        }
    });
});

// --- ASISTENTE INTERACTIVO (Chat Real-Time) ---
const liveChatInput = document.getElementById('live-chat-input');
const liveChatSendBtn = document.getElementById('live-chat-send-btn');
const liveChatContainer = document.getElementById('live-chat-container');
const liveActivityLog = document.getElementById('live-activity-log');

let liveSocket = null;
let liveState = 'WAITING_RUT'; // WAITING_RUT, WAITING_PASS, RUNNING, FINISHED
let tempCredentials = { rut: '', clave: '' };

function initLiveChat() {
    // Solo saludar si es la primera vez (contenedor vacío salvo el msj inicial estático)
    // El HTML ya tiene el mensaje de bienvenida, así que no necesitamos inyectarlo aquí.
    if (liveChatInput) liveChatInput.focus();
}

function addLiveBubble(text, role = 'assistant', isHtml = false) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    if (isHtml) {
        bubble.innerHTML = text;
    } else {
        bubble.innerText = text;
    }

    // Si es un log del sistema
    if (role === 'system') {
        bubble.style.fontSize = '0.85rem';
        bubble.style.background = 'rgba(0,0,0,0.3)';
        bubble.style.color = '#4ade80';
        bubble.style.fontFamily = 'monospace';
        bubble.style.marginTop = '0.5rem';
        bubble.style.marginBottom = '0.5rem';
    }

    if (liveChatContainer) {
        liveChatContainer.appendChild(bubble);
        liveChatContainer.scrollTop = liveChatContainer.scrollHeight;
    }
}

function handleUserLiveInput() {
    const text = liveChatInput.value.trim();
    if (!text) return;

    // Mostrar mensaje del usuario
    addLiveBubble(text, 'user');
    liveChatInput.value = '';

    // Máquina de Estados Simplificada
    if (liveState === 'WAITING_RUT') {
        tempCredentials.rut = text;

        // Validación básica
        if (!text.includes('-') && text.length < 8) {
            addLiveBubble("El RUT parece inválido. Intenta formato 12345678-k", 'assistant');
            return;
        }

        liveState = 'WAITING_PASS';
        setTimeout(() => {
            addLiveBubble(`RUT ${tempCredentials.rut} recibido.`, 'system');
            addLiveBubble(`Ahora ingresa la <strong>Clave Tributaria</strong> para conectarnos al SII:`, 'assistant', true);
            liveChatInput.type = 'password';
        }, 400);

    } else if (liveState === 'WAITING_PASS') {
        tempCredentials.clave = text;
        liveChatInput.type = 'text';
        liveChatInput.disabled = true;
        liveChatSendBtn.disabled = true;

        addLiveBubble("****************", 'user'); // Masked echo was managed by input type logic above mainly

        addLiveBubble("Credenciales recibidas. Iniciando agente...", 'system');
        liveState = 'RUNNING';

        startLiveSession(tempCredentials.rut, tempCredentials.clave);

    } else if (liveState === 'RUNNING') {
        // Ignorar

    } else if (liveState === 'FINISHED') {
        const message = text;

        // 1. Mostrar msj usuario
        addLiveBubble(message, 'user');

        // UI Loading State
        liveChatInput.disabled = true;
        liveChatSendBtn.disabled = true;

        // 2. Llamar al endpoint de IA
        fetch(`${API_BASE}/sii/chat-interaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                rut: tempCredentials.rut, // Usamos el RUT capturado en el flujo
                message: message,
                history: [] // Por ahora sin historial complejo, o podríamos mantener uno local
            })
        })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    addLiveBubble(data.reply, 'assistant');
                } else {
                    addLiveBubble("Hubo un error al procesar tu pregunta.", 'assistant');
                }
            })
            .catch(err => {
                console.error(err);
                addLiveBubble("Error de conexión con el cerebro del asistente.", 'assistant');
            })
            .finally(() => {
                liveChatInput.disabled = false;
                liveChatSendBtn.disabled = false;
                liveChatInput.focus();
            });
    }
}

if (liveChatSendBtn) {
    liveChatSendBtn.addEventListener('click', handleUserLiveInput);
    liveChatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleUserLiveInput();
    });
}

function startLiveSession(rut, clave) {
    let wsUrl;
    if (typeof API_BASE !== 'undefined') {
        let tempUrl = API_BASE.replace(/^http/, 'ws');
        if (tempUrl.startsWith('//')) {
            wsUrl = (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + tempUrl;
        } else {
            wsUrl = tempUrl;
        }
        wsUrl = wsUrl.replace(/\/$/, '') + '/ws/live-agent';
    } else {
        wsUrl = 'ws://localhost:8001/ws/live-agent';
    }

    try {
        liveSocket = new WebSocket(wsUrl);

        liveSocket.onopen = () => {
            if (liveActivityLog) {
                liveActivityLog.style.display = 'block';
                liveActivityLog.innerText = '> Conectado al servidor WebSocket.';
            }

            liveSocket.send(JSON.stringify({
                command: "start_live_scout",
                rut: rut,
                clave: clave
            }));

            addLiveBubble("Conexión establecida. El agente está entrando al portal...", 'assistant');
        };

        liveSocket.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'log') {
                if (liveActivityLog) liveActivityLog.innerText = `> ${data.text}`; // Log técnico abajo

                // Filtro para el chat: Solo hitos importantes
                const text = data.text.toLowerCase();
                let shouldShow = false;
                let icon = '⚙️';

                if (data.log_type === 'success') { shouldShow = true; icon = '✅'; }
                if (data.log_type === 'error') { shouldShow = true; icon = '❌'; }
                if (text.includes('entrando') || text.includes('buscando') || text.includes('detectado')) { shouldShow = true; }

                if (shouldShow) {
                    addLiveBubble(`${icon} ${data.text}`, 'system');
                }

                // Finalización
                if (data.log_type === 'success' && text.includes('finalizado')) {
                    liveState = 'FINISHED';
                    liveChatInput.disabled = false;
                    liveChatSendBtn.disabled = false;

                    // Si viene payload con datitos, mostramos tarjeta
                    if (data.payload && data.payload.datos) {
                        const d = data.payload.datos;

                        // Formateador robusto: Si no es número, asume 0
                        const clp = (val) => {
                            const num = Number(val);
                            if (isNaN(num)) return '$0';
                            return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(num);
                        };

                        const summaryHtml = `
                        <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 1rem; margin-top: 0.5rem; font-family: 'Inter', sans-serif;">
                            <h3 style="color: #34d399; margin: 0 0 0.5rem 0; font-size: 0.95rem;">📊 Resumen F29 Propuesto</h3>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.85rem; color: #e2e8f0;">
                                <div>IVA Débito:</div><div style="text-align: right; font-weight: bold;">${clp(d['538'] || 0)}</div>
                                <div>IVA Crédito:</div><div style="text-align: right; font-weight: bold;">${clp(d['537'] || 0)}</div>
                                <div>Remanente Ant.:</div><div style="text-align: right;">${clp(d['504'] || 0)}</div>
                                <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px; margin-top: 4px; color: #fff;">Total a Pagar:</div>
                                <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px; margin-top: 4px; text-align: right; font-weight: bold; color: ${(d['91'] > 0) ? '#fca5a5' : '#34d399'};">
                                    ${clp(d['91'] || 0)}
                                </div>
                            </div>
                        </div>
                        <br>
                        He extraído estos datos clave. ¿Deseas analizar alguna partida en especial?
                        `;
                        addLiveBubble(summaryHtml, 'assistant', true);
                    } else {
                        addLiveBubble("Proceso completo. He revisado la propuesta. ¿Tienes alguna duda?", 'assistant');
                    }

                    liveChatInput.focus();
                }

                // Error crítico
                if (data.log_type === 'error' && (text.includes('falló') || text.includes('incorrecta'))) {
                    liveState = 'WAITING_RUT';
                    liveChatInput.disabled = false;
                    liveChatSendBtn.disabled = false;
                    addLiveBubble("No se pudo completar el acceso. Verifiquemos los datos. Ingresa el RUT nuevamente:", 'assistant');
                    liveChatInput.type = 'text';
                }
            }
        };

        liveSocket.onerror = (error) => {
            console.error("WS Error:", error);
            addLiveBubble("Error de conexión con el servidor.", 'system');
            liveChatInput.disabled = false;
            liveChatSendBtn.disabled = false;
        };

    } catch (e) {
        addLiveBubble(`Error interno: ${e.message}`, 'error');
    }
}


// --- LÓGICA DASHBOARD (Vieja) ---
let chatHistory = [];
const fmt = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);

function addChatBubble(text, role) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    // Reemplazar saltos de línea con <br>
    bubble.innerHTML = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
    chatContainer.appendChild(bubble);

    // Auto-scroll
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function startScouting() {
    const rut = document.getElementById('rut').value;
    const clave = document.getElementById('clave').value;
    const periodVal = document.getElementById('periodo').value.split('-');

    loader.style.display = 'flex';
    resultsDisplay.style.display = 'none';
    scoutBtn.disabled = true;

    // Limpiar chat anterior
    chatContainer.innerHTML = '';
    chatHistory = [];

    try {
        const response = await fetch(`${API_BASE}/sii/f29-scouting`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                rut,
                clave,
                anio: periodVal[1],
                mes: periodVal[0],
                es_propuesta: true
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            displayResults(data);
        } else {
            alert('Error: ' + (data.detail || 'Fallo en la conexión con el SII'));
        }
    } catch (err) {
        console.error(err);
        alert('Error crítico al conectar con el servidor.');
    } finally {
        loader.style.display = 'none';
        scoutBtn.disabled = false;
    }
}

function displayResults(data) {
    const s = data.scouting.propuesta;

    if (s && s['538']) document.getElementById('val-538').textContent = fmt(s['538']);
    if (s && s['537']) document.getElementById('val-537').textContent = fmt(s['537']);
    if (s && s['504']) document.getElementById('val-504').textContent = fmt(s['504']);

    // Mostrar mensaje inicial del Bot
    if (data.analisis_ia) {
        addChatBubble(data.analisis_ia, 'assistant');
        // Guardar en historial
        chatHistory.push({ role: "assistant", content: data.analisis_ia });
    }

    resultsDisplay.style.display = 'flex';
    document.getElementById('status-text').textContent = 'Activa';
    document.getElementById('status-text').style.color = '#34d399';

    // Habilitar chat
    chatInput.disabled = false;
    chatSendBtn.disabled = false;
}

async function sendChatMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    const rut = document.getElementById('rut').value;

    // 1. Mostrar mensaje del usuario
    addChatBubble(message, 'user');
    chatInput.value = '';
    chatInput.disabled = true;
    chatSendBtn.disabled = true;

    try {
        // 2. Enviar a backend con historial
        const response = await fetch(`${API_BASE}/sii/chat-interaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                rut,
                message,
                history: chatHistory
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            const reply = data.reply;
            addChatBubble(reply, 'assistant');

            // Actualizar historial local
            chatHistory.push({ role: "user", content: message });
            chatHistory.push({ role: "assistant", content: reply });
        } else {
            addChatBubble("⚠️ Hubo un error al procesar tu mensaje.", 'assistant');
        }

    } catch (err) {
        console.error(err);
        addChatBubble("⚠️ Error de conexión con el Asistente.", 'assistant');
    } finally {
        chatInput.disabled = false;
        chatSendBtn.disabled = false;
        chatInput.focus();
    }
}

async function closeSession() {
    const rut = document.getElementById('rut').value;
    try {
        await fetch(`${API_BASE}/sii/session-close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({ rut, clave: "" })
        });
        alert('Sesión cerrada correctamente.');
        location.reload();
    } catch (err) {
        alert('Error al cerrar la sesión.');
    }
}

// Event Listeners
if (scoutBtn) scoutBtn.addEventListener('click', startScouting);
if (closeBtn) closeBtn.addEventListener('click', closeSession);
if (chatSendBtn) chatSendBtn.addEventListener('click', sendChatMessage);

// Enviar con Enter
if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
}

const logoEl = document.getElementById('app-logo');
if (logoEl) logoEl.src = "/logo.png";
