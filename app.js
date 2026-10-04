/* app.js — Colación ATC: captura de audio, reconocimiento (local / nube), extracción y pantalla. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const P = window.ColacionParser;

  // ---------- Ajustes ----------
  const DEFAULTS = {
    callsign: 'D-KPPA', onlyMine: true, mode: 'auto', localLang: 'es-ES', cloudLang: '', vad: -45,
    openaiKey: '', sttModel: 'gpt-4o-transcribe', useLlm: true, anthropicKey: '', anthropicModel: 'claude-haiku-4-5', theme: 'night',
  };
  let S = Object.assign({}, DEFAULTS);
  try { Object.assign(S, JSON.parse(localStorage.getItem('colacion.settings') || '{}')); } catch (e) {}
  function saveSettings() { try { localStorage.setItem('colacion.settings', JSON.stringify(S)); } catch (e) {} }

  const FIELDS = ['callsign', 'mode', 'localLang', 'cloudLang', 'vad', 'openaiKey', 'sttModel', 'anthropicKey', 'anthropicModel'];
  const CHECKS = ['onlyMine', 'useLlm'];
  function loadForm() {
    for (const f of FIELDS) $(f).value = S[f];
    for (const c of CHECKS) $(c).checked = !!S[c];
    $('vadVal').textContent = S.vad;
  }
  function readForm() {
    for (const f of FIELDS) S[f] = $(f).value.trim ? $(f).value.trim() : $(f).value;
    for (const c of CHECKS) S[c] = $(c).checked;
    S.vad = Number(S.vad);
    $('vadVal').textContent = S.vad;
    saveSettings();
  }
  $('settings').addEventListener('input', readForm);
  $('settings').addEventListener('change', readForm);
  $('settingsBtn').onclick = () => { loadForm(); $('settings').classList.remove('hidden'); };
  $('closeSettings').onclick = () => $('settings').classList.add('hidden');
  $('settings').addEventListener('click', (e) => { if (e.target === $('settings')) $('settings').classList.add('hidden'); });

  function applyTheme() { document.documentElement.dataset.theme = S.theme === 'day' ? 'day' : ''; $('themeBtn').textContent = S.theme === 'day' ? '☾' : '☀︎'; }
  $('themeBtn').onclick = () => { S.theme = S.theme === 'day' ? 'night' : 'day'; saveSettings(); applyTheme(); };
  applyTheme();

  // ---------- Registro ----------
  function log(msg) {
    const t = new Date().toTimeString().slice(0, 8);
    const el = $('log'); el.textContent = (t + ' ' + msg + '\n' + el.textContent).slice(0, 4000);
    console.log('[colacion]', msg);
  }

  // ---------- Estado ----------
  let running = false, engine = null; // 'cloud' | 'local'
  const history = [];
  const active = {}; // valores vigentes por clave
  let wakeLock = null;

  function setEngineTag(t) { const el = $('engineTag'); if (el) el.textContent = t; }
  function setStatus(label, dotClass) { $('modeLabel').textContent = label; $('dot').className = 'dot ' + (dotClass || ''); }

  // ---------- Presentación ----------
  const ACTIVE_KEYS = ['runway', 'qnh', 'qfe', 'squawk', 'altitude', 'level', 'heading', 'freq', 'speed'];
  function tile(it, extraClass) {
    const d = document.createElement('div');
    d.className = 'tile ' + (it.sev || 'ok') + (it.group === 'clr' ? ' clr' : '') + (extraClass ? ' ' + extraClass : '');
    const l = document.createElement('div'); l.className = 'l'; l.textContent = it.label;
    const v = document.createElement('div'); v.className = 'v' + (String(it.value || '').length > 8 ? ' txt' : ''); v.textContent = it.value || '';
    d.appendChild(l); if (it.value) d.appendChild(v);
    if (it.group === 'clr' && !it.value) { l.className = 'v txt'; l.style.fontSize = '30px'; }
    return d;
  }
  function fmtTime(d) { return d.toTimeString().slice(0, 8); }

  function showTransmission(tx) {
    const res = tx.res;
    $('nowTime').textContent = fmtTime(tx.time);
    const badge = $('addrBadge');
    badge.classList.remove('hidden');
    badge.className = 'badge ' + res.addressed;
    badge.textContent = res.addressed === 'yes' ? 'PARA TI' : res.addressed === 'no' ? 'OTRO TRÁFICO' : 'SIN INDICATIVO';
    const tr = $('transcript'); tr.textContent = tx.text; tr.className = 'transcript' + (S.onlyMine && res.addressed === 'no' ? ' other' : '');
    const tiles = $('nowTiles'); tiles.innerHTML = '';
    const dim = S.onlyMine && res.addressed === 'no';
    for (const it of res.items) tiles.appendChild(tile(it, dim ? 'stale' : 'new'));
    const info = $('nowInfo'); info.innerHTML = '';
    for (const i of res.info) { const s = document.createElement('span'); const b = document.createElement('b'); b.textContent = i.label; s.appendChild(b); s.appendChild(document.createTextNode(i.value)); info.appendChild(s); }
    if (res.readback && !dim) { $('readback').classList.remove('hidden'); $('readbackText').textContent = res.readback; } else $('readback').classList.add('hidden');
    if (!res.items.length && !res.info.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = dim ? 'Transmisión para otro tráfico.' : 'Sin elementos de colación detectados.'; tiles.appendChild(e); }
  }
  function updateActive(res) {
    if (S.onlyMine && res.addressed === 'no') return;
    let changed = false;
    for (const it of res.items) if (ACTIVE_KEYS.includes(it.key)) { active[it.key] = Object.assign({}, it, { t: Date.now() }); changed = true; }
    if (res.runway && !res.items.some((i) => i.key === 'runway')) { active.runway = { key: 'runway', label: res.lang === 'en' ? 'RUNWAY' : 'PISTA', value: res.runway, sev: 'ok', t: Date.now() }; changed = true; }
    for (const i of res.info) if (i.key === 'wind') { active.wind = { key: 'wind', label: i.label, value: i.value, sev: 'ok', t: Date.now() }; changed = true; }
    if (changed) renderActive();
  }
  function renderActive() {
    const el = $('activeTiles'); el.innerHTML = '';
    const order = ['runway', 'qnh', 'qfe', 'squawk', 'altitude', 'level', 'heading', 'freq', 'speed', 'wind'];
    const keys = order.filter((k) => active[k]);
    if (!keys.length) { el.innerHTML = '<div class="empty">Sin datos todavía.</div>'; return; }
    const now = Date.now();
    for (const k of keys) { const it = active[k]; const t = tile(Object.assign({}, it, { sev: 'ok' }), now - it.t > 20 * 60000 ? 'stale' : ''); el.appendChild(t); }
  }
  function renderHistory() {
    const ul = $('hist'); ul.innerHTML = '';
    for (const tx of history.slice(-40).reverse()) {
      const li = document.createElement('li'); li.className = tx.res.addressed;
      const b = document.createElement('i'); b.className = 'b';
      const t = document.createElement('time'); t.textContent = fmtTime(tx.time);
      const s = document.createElement('span'); s.textContent = tx.text;
      li.append(b, t, s); li.onclick = () => showTransmission(tx); ul.appendChild(li);
    }
  }

  // ---------- Procesado de una transmisión ----------
  async function handleTranscript(text, source) {
    text = (text || '').trim();
    if (!text || text.length < 3) return;
    const res = P.extract(text, { callsign: S.callsign, lang: S.cloudLang || undefined });
    const tx = { time: new Date(), text, res, source };
    history.push(tx); showTransmission(tx); updateActive(res); renderHistory();
    log(`[${source}] ${text}`);
    if (S.useLlm && navigator.onLine && (S.anthropicKey || S.openaiKey)) {
      setEngineTag('reglas · consultando LLM…');
      try {
        const prev = history.slice(-4, -1).map((h) => h.text);
        const llm = await llmExtract(text, res.lang, prev);
        if (llm && Array.isArray(llm.items)) {
          const merged = mergeResults(res, llm);
          tx.res = merged; tx.engine = 'llm';
          if (history[history.length - 1] === tx) { showTransmission(tx); updateActive(merged); }
          renderHistory();
          setEngineTag(S.anthropicKey ? 'Claude' : 'GPT');
        }
      } catch (e) { log('LLM: ' + e.message); setEngineTag('reglas (LLM falló)'); }
    } else setEngineTag('reglas');
  }
  // El LLM manda: sus items y su colación sustituyen a las reglas; las reglas solo rellenan huecos.
  const CLR_KEYS = new Set(['startup', 'taxi', 'hold', 'lineup', 'enter', 'enterbt', 'backtrack', 'cross', 'takeoff', 'land', 'tng', 'vacate', 'join', 'extend', 'proceed', 'turnok', 'goaround', 'stop', 'route', 'report', 'other', 'app', 'contapp', 'lowpass', 'ident', 'orbit', 'intent', 'standby', 'goahead']);
  function mergeResults(rules, llm) {
    const out = Object.assign({}, rules);
    const items = [];
    for (const it of llm.items) {
      if (!it || !it.key || !(it.label || it.value)) continue;
      const base = rules.items.find((r) => r.key === it.key) || {};
      items.push({ key: it.key, group: CLR_KEYS.has(it.key) ? 'clr' : 'data', label: String(it.label || it.key).toUpperCase(), value: it.value != null ? String(it.value) : '', sev: it.sev || base.sev || 'ok' });
    }
    out.items = items.length ? items : rules.items;
    if (Array.isArray(llm.info)) out.info = llm.info.map((i) => ({ key: i.key || 'info', label: String(i.label || '').toUpperCase(), value: String(i.value || '') }));
    if (llm.addressed && ['yes', 'no', 'unknown'].includes(llm.addressed)) out.addressed = llm.addressed;
    if (typeof llm.lang === 'string') out.lang = llm.lang;
    out.readback = typeof llm.readback === 'string' ? llm.readback : rules.readback;
    return out;
  }

  const LLM_SYSTEM = `Eres un asistente de radiotelefonía aeronáutica (OACI, fraseología en español y en inglés). Recibes la transcripción (posiblemente con errores de reconocimiento de voz) de UNA transmisión de un controlador o AFIS. Devuelve SOLO un JSON con esta forma:
{"lang":"es|en","addressed":"yes|no|unknown","items":[{"key":"startup|takeoff|land|tng|hold|lineup|enter|enterbt|taxi|cross|backtrack|vacate|join|extend|proceed|turnok|intent|report|goaround|stop|runway|altitude|level|heading|speed|squawk|qnh|qfe|freq|other","label":"TEXTO CORTO EN MAYÚSCULAS","value":"valor corto (23, 1018, 7000, 3500 ft, 180°, 118.5) o vacío","readback":"repetición literal de la instrucción del controlador (sin pasarla a primera persona)","sev":"go|warn|crit|ok"}],"info":[{"key":"wind|traffic|other","label":"VIENTO","value":"240° / 8 kt"}],"readback":"colación completa: repite literalmente las instrucciones del controlador en el mismo orden, sin viento ni recibido, y termina con el indicativo del piloto"}
Reglas: "addressed" es yes si la transmisión va dirigida al indicativo del piloto (completo o abreviado, p. ej. Kilo Papa Papa Alfa / Papa Papa Alfa para D-KPPA), no si va dirigida a otro indicativo, unknown si no hay indicativo. Incluye en items solo lo que debe colacionarse (autorizaciones, pista, altitudes/niveles, rumbos, velocidad, código transpondedor, QNH/QFE, frecuencias, instrucciones de notificación). El viento y el tráfico van en info. Corrige errores evidentes del reconocedor (p. ej. "cune hache" = QNH, "escuok" = squawk). Fraseología habitual en aeródromos españoles (p. ej. León): "puesta en marcha aprobada", "pista en servicio 23", "autorizado a rodar punto de espera pista 23, vía calle C", "autorizado a entrar y backtrack pista 23", "aprobado viraje izquierda", "notifique alcanzando punto S1", "continúe ascenso para 5500 ft", "proceda para el campo", "entre en circuito de tráfico, notifique en viento en cola izquierda pista 23", "extienda viento en cola", "llame en base", "abandone por calle B", "continúe rodaje a plataforma". El viento puede venir compacto (24010KT) y el QNH como Q1024. El piloto colaciona repitiendo la instrucción en primera persona o tal cual ("Autorizado a despegar pista 23, notificaré punto S1") y termina con su indicativo; "recibido"/"copiado" no se colacionan. sev: crit para mantenga posición/pare/motor y al aire, go para autorizaciones de despegue/aterrizaje/aproximación, warn para alinee/retroceda/cruce, ok para el resto.`;

  async function llmExtract(text, lang, prev) {
    const SYS = window.FRASEOLOGIA || LLM_SYSTEM;
    const ctx = prev && prev.length ? `\nTransmisiones anteriores (solo contexto, NO las colaciones): ${prev.map((p) => '"' + p + '"').join(' | ')}` : '';
    const user = `Indicativo del piloto: ${S.callsign} (abreviado: ${P.callsignVariants(S.callsign).join(' / ')})${ctx}\nTransmisión a colacionar: "${text}"\nResponde solo con el JSON.`;
    if (S.anthropicKey) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': S.anthropicKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: S.anthropicModel || 'claude-haiku-4-5', max_tokens: 800, temperature: 0, system: [{ type: 'text', text: SYS, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: user }] }),
      });
      if (!r.ok) throw new Error('Anthropic ' + r.status + ' ' + (await r.text()).slice(0, 200));
      const j = await r.json();
      return parseJson(j.content.map((c) => c.text || '').join(''));
    }
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + S.openaiKey },
      body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }] }),
    });
    if (!r.ok) throw new Error('OpenAI ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    return parseJson(j.choices[0].message.content);
  }
  function parseJson(s) { const m = s.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }

  // ---------- Motor NUBE: getUserMedia + VAD + WAV + OpenAI ----------
  const cloud = { ctx: null, stream: null, proc: null, src: null, sink: null, buf: [], pre: [], speaking: false, silence: 0, voiced: 0, level: -100, samples: 0 };
  const TARGET_SR = 16000, PRE_MS = 400, END_MS = 700, MIN_MS = 350, MAX_MS = 30000;

  async function startCloud() {
    if (!S.openaiKey) throw new Error('Falta la OpenAI API key en Ajustes.');
    cloud.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    cloud.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await cloud.ctx.resume();
    cloud.src = cloud.ctx.createMediaStreamSource(cloud.stream);
    cloud.proc = cloud.ctx.createScriptProcessor(4096, 1, 1);
    cloud.sink = cloud.ctx.createGain(); cloud.sink.gain.value = 0;
    cloud.src.connect(cloud.proc); cloud.proc.connect(cloud.sink); cloud.sink.connect(cloud.ctx.destination);
    const inSR = cloud.ctx.sampleRate, ratio = inSR / TARGET_SR;
    cloud.buf = []; cloud.pre = []; cloud.speaking = false; cloud.silence = 0; cloud.voiced = 0; cloud.samples = 0;
    cloud.proc.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      // nivel
      let sum = 0; for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length); const db = 20 * Math.log10(rms + 1e-9); cloud.level = db;
      // remuestreo simple a 16 kHz
      const outLen = Math.floor(input.length / ratio); const out = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) { const a = Math.floor(i * ratio), b = Math.min(input.length - 1, Math.floor((i + 1) * ratio)); let s = 0, c = 0; for (let k = a; k < b; k++) { s += input[k]; c++; } out[i] = c ? s / c : input[a]; }
      const ms = (input.length / inSR) * 1000;
      const hot = db > S.vad;
      updateMeter(db, hot);
      if (!cloud.speaking) {
        cloud.pre.push(out); let preMs = cloud.pre.length * ms; while (preMs > PRE_MS) { cloud.pre.shift(); preMs -= ms; }
        if (hot) { cloud.voiced += ms; if (cloud.voiced >= 60) { cloud.speaking = true; cloud.buf = cloud.pre.slice(); cloud.pre = []; cloud.silence = 0; cloud.samples = cloud.buf.reduce((n, x) => n + x.length, 0); setStatus('Nube · grabando', 'busy'); } }
        else cloud.voiced = 0;
      } else {
        cloud.buf.push(out); cloud.samples += out.length;
        if (hot) cloud.silence = 0; else cloud.silence += ms;
        const durMs = (cloud.samples / TARGET_SR) * 1000;
        if (cloud.silence >= END_MS || durMs >= MAX_MS) {
          const chunks = cloud.buf; cloud.buf = []; cloud.speaking = false; cloud.voiced = 0; cloud.samples = 0;
          setStatus('Nube · escuchando', 'on');
          const dur = durMs - Math.min(cloud.silence, END_MS);
          if (dur >= MIN_MS) transcribeChunks(chunks, dur).catch((e) => log('STT: ' + e.message));
        }
      }
    };
    engine = 'cloud'; setStatus('Nube · escuchando', 'on');
    log('Motor nube iniciado (' + inSR + ' Hz → 16 kHz)');
  }
  function stopCloud() {
    try { cloud.proc && (cloud.proc.onaudioprocess = null); cloud.proc && cloud.proc.disconnect(); cloud.src && cloud.src.disconnect(); cloud.sink && cloud.sink.disconnect(); } catch (e) {}
    try { cloud.stream && cloud.stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    try { cloud.ctx && cloud.ctx.close(); } catch (e) {}
    cloud.ctx = cloud.stream = cloud.proc = cloud.src = cloud.sink = null; updateMeter(-100, false);
  }
  function updateMeter(db, hot) {
    const pct = Math.max(0, Math.min(100, ((db + 70) / 60) * 100));
    const m = $('meter'); m.firstElementChild.style.width = pct + '%'; m.classList.toggle('hot', !!hot);
  }
  function encodeWav(chunks, sr) {
    const n = chunks.reduce((a, c) => a + c.length, 0);
    const ab = new ArrayBuffer(44 + n * 2); const v = new DataView(ab);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    let o = 44; for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) { const s = Math.max(-1, Math.min(1, c[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return new Blob([ab], { type: 'audio/wav' });
  }
  let inflight = 0;
  async function transcribeChunks(chunks, durMs) {
    const blob = encodeWav(chunks, TARGET_SR);
    inflight++; setStatus('Nube · transcribiendo (' + inflight + ')', 'busy');
    try {
      const fd = new FormData();
      fd.append('file', blob, 'tx.wav'); fd.append('model', S.sttModel || 'gpt-4o-transcribe');
      fd.append('prompt', 'Comunicaciones aeronáuticas ATC (torre, AFIS, aproximación). Fraseología OACI en español o inglés. Indicativo ' + S.callsign + ' (' + P.spellCallsign(S.callsign) + '). Términos: pista, QNH, responda, squawk, rumbo, viento, nudos, pies, nivel de vuelo, autorizado a despegar, autorizado a aterrizar, mantenga posición, alinee y mantenga, punto de espera, notifique, contacte, decimal, Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu.');
      if (S.cloudLang) fd.append('language', S.cloudLang);
      fd.append('response_format', 'json'); fd.append('temperature', '0');
      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: 'Bearer ' + S.openaiKey }, body: fd });
      if (!r.ok) throw new Error('OpenAI STT ' + r.status + ' ' + (await r.text()).slice(0, 200));
      const j = await r.json();
      const text = (j.text || '').trim();
      log(`audio ${(durMs / 1000).toFixed(1)}s → "${text}"`);
      if (text && !/^(\.|\s|-)*$/.test(text)) await handleTranscript(text, 'nube');
    } finally { inflight--; if (running && engine === 'cloud') setStatus(cloud.speaking ? 'Nube · grabando' : 'Nube · escuchando', cloud.speaking ? 'busy' : 'on'); }
  }

  // ---------- Motor LOCAL: Web Speech API ----------
  const local = { rec: null, restartTimer: null };
  function startLocal() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) throw new Error('Este navegador no tiene reconocimiento de voz local. Usa Safari en iPhone o el modo nube.');
    const rec = new SR();
    rec.lang = S.localLang || 'es-ES'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) handleTranscript(r[0].transcript, 'local');
        else interim += r[0].transcript;
      }
      if (interim) { const tr = $('transcript'); tr.textContent = interim; tr.className = 'transcript interim'; }
    };
    rec.onerror = (e) => { log('local error: ' + e.error); if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { stop(); alert('Safari no ha dado permiso de micrófono al reconocedor local.'); } };
    rec.onend = () => { if (running && engine === 'local') { local.restartTimer = setTimeout(() => { try { rec.start(); } catch (e) { log('restart: ' + e.message); } }, 250); } };
    rec.onaudiostart = () => setStatus('Local · escuchando (' + rec.lang + ')', 'on');
    rec.start();
    local.rec = rec; engine = 'local'; setStatus('Local · iniciando', 'busy');
    log('Motor local iniciado (' + rec.lang + ')');
  }
  function stopLocal() {
    clearTimeout(local.restartTimer);
    if (local.rec) { try { local.rec.onend = null; local.rec.stop(); } catch (e) {} local.rec = null; }
  }

  // ---------- Arranque / parada ----------
  function chooseEngine() {
    if (S.mode === 'local') return 'local';
    if (S.mode === 'cloud') return 'cloud';
    return navigator.onLine && S.openaiKey ? 'cloud' : 'local';
  }
  async function start() {
    if (running) return;
    running = true; $('startBtn').textContent = 'PARAR'; $('startBtn').classList.add('stop');
    try {
      const eng = chooseEngine();
      if (eng === 'cloud') await startCloud(); else startLocal();
      try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { log('wake lock no disponible'); }
    } catch (e) { log('Error al iniciar: ' + e.message); alert(e.message); stop(); }
  }
  function stop() {
    running = false; $('startBtn').textContent = 'ESCUCHAR'; $('startBtn').classList.remove('stop');
    stopCloud(); stopLocal(); engine = null; setStatus('Parado', '');
    try { wakeLock && wakeLock.release(); } catch (e) {} wakeLock = null;
  }
  $('startBtn').onclick = () => (running ? stop() : start());

  async function switchEngineIfNeeded() {
    if (!running || S.mode !== 'auto') return;
    const want = chooseEngine();
    if (want !== engine) { log('Cambio de motor → ' + want); stopCloud(); stopLocal(); try { if (want === 'cloud') await startCloud(); else startLocal(); } catch (e) { log(e.message); } }
  }
  window.addEventListener('online', switchEngineIfNeeded);
  window.addEventListener('offline', switchEngineIfNeeded);
  document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && running && !wakeLock) { try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} } });

  // ---------- Simulación y utilidades ----------
  $('simBtn').onclick = () => { const t = $('simText').value.trim(); if (t) { handleTranscript(t, 'sim'); $('settings').classList.add('hidden'); } };
  $('clearBtn').onclick = () => { history.length = 0; for (const k in active) delete active[k]; renderActive(); renderHistory(); $('nowTiles').innerHTML = ''; $('nowInfo').innerHTML = ''; $('readback').classList.add('hidden'); $('addrBadge').classList.add('hidden'); $('transcript').textContent = 'Historial borrado.'; };

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch((e) => log('SW: ' + e.message));
  loadForm(); renderActive();
  window.Colacion = { handleTranscript, settings: S };
})();
