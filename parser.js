/* parser.js — Extractor de elementos de colación en transmisiones ATC (español / inglés).
 * Funciona en navegador (window.ColacionParser) y en Node (module.exports). Sin dependencias.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ColacionParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Normalización ----------
  const NUM_WORDS = {
    // dígitos ES
    cero: { v: 0, k: 'd' }, uno: { v: 1, k: 'd' }, una: { v: 1, k: 'd' }, un: { v: 1, k: 'd' }, dos: { v: 2, k: 'd' }, tres: { v: 3, k: 'd' },
    cuatro: { v: 4, k: 'd' }, cinco: { v: 5, k: 'd' }, seis: { v: 6, k: 'd' }, siete: { v: 7, k: 'd' }, ocho: { v: 8, k: 'd' }, nueve: { v: 9, k: 'd' },
    // dígitos EN (incluida pronunciación ICAO)
    zero: { v: 0, k: 'd' }, oh: { v: 0, k: 'd' }, one: { v: 1, k: 'd' }, two: { v: 2, k: 'd' }, three: { v: 3, k: 'd' }, tree: { v: 3, k: 'd' },
    four: { v: 4, k: 'd' }, fower: { v: 4, k: 'd' }, five: { v: 5, k: 'd' }, fife: { v: 5, k: 'd' }, six: { v: 6, k: 'd' }, seven: { v: 7, k: 'd' },
    eight: { v: 8, k: 'd' }, nine: { v: 9, k: 'd' }, niner: { v: 9, k: 'd' },
    // decenas / especiales ES
    diez: { v: 10, k: 't' }, once: { v: 11, k: 't' }, doce: { v: 12, k: 't' }, trece: { v: 13, k: 't' }, catorce: { v: 14, k: 't' }, quince: { v: 15, k: 't' },
    dieciseis: { v: 16, k: 't' }, diecisiete: { v: 17, k: 't' }, dieciocho: { v: 18, k: 't' }, diecinueve: { v: 19, k: 't' },
    veinte: { v: 20, k: 't' }, veintiuno: { v: 21, k: 't' }, veintidos: { v: 22, k: 't' }, veintitres: { v: 23, k: 't' }, veinticuatro: { v: 24, k: 't' },
    veinticinco: { v: 25, k: 't' }, veintiseis: { v: 26, k: 't' }, veintisiete: { v: 27, k: 't' }, veintiocho: { v: 28, k: 't' }, veintinueve: { v: 29, k: 't' },
    treinta: { v: 30, k: 't' }, cuarenta: { v: 40, k: 't' }, cincuenta: { v: 50, k: 't' }, sesenta: { v: 60, k: 't' }, setenta: { v: 70, k: 't' }, ochenta: { v: 80, k: 't' }, noventa: { v: 90, k: 't' },
    cien: { v: 100, k: 'h' }, ciento: { v: 100, k: 'h' }, doscientos: { v: 200, k: 'h' }, trescientos: { v: 300, k: 'h' }, cuatrocientos: { v: 400, k: 'h' },
    quinientos: { v: 500, k: 'h' }, seiscientos: { v: 600, k: 'h' }, setecientos: { v: 700, k: 'h' }, ochocientos: { v: 800, k: 'h' }, novecientos: { v: 900, k: 'h' },
    mil: { v: 1000, k: 'm' },
    // decenas / especiales EN
    ten: { v: 10, k: 't' }, eleven: { v: 11, k: 't' }, twelve: { v: 12, k: 't' }, thirteen: { v: 13, k: 't' }, fourteen: { v: 14, k: 't' }, fifteen: { v: 15, k: 't' },
    sixteen: { v: 16, k: 't' }, seventeen: { v: 17, k: 't' }, eighteen: { v: 18, k: 't' }, nineteen: { v: 19, k: 't' },
    twenty: { v: 20, k: 't' }, thirty: { v: 30, k: 't' }, forty: { v: 40, k: 't' }, fifty: { v: 50, k: 't' }, sixty: { v: 60, k: 't' }, seventy: { v: 70, k: 't' }, eighty: { v: 80, k: 't' }, ninety: { v: 90, k: 't' },
    hundred: { v: 100, k: 'hm' }, thousand: { v: 1000, k: 'm' },
  };
  const DECIMAL_WORDS = new Set(['decimal', 'coma', 'punto', 'point']);
  const JOIN_WORDS = new Set(['y', 'and']); // "treinta y cinco", "one hundred and fifty"

  const PHONETIC = {
    alfa: 'A', alpha: 'A', bravo: 'B', charlie: 'C', charly: 'C', delta: 'D', echo: 'E', eco: 'E', foxtrot: 'F', fox: 'F', golf: 'G', hotel: 'H',
    india: 'I', juliet: 'J', juliett: 'J', julieta: 'J', kilo: 'K', lima: 'L', mike: 'M', maik: 'M', november: 'N', noviembre: 'N', oscar: 'O', papa: 'P',
    quebec: 'Q', romeo: 'R', sierra: 'S', tango: 'T', uniform: 'U', uniforme: 'U', victor: 'V', whiskey: 'W', whisky: 'W', xray: 'X', yankee: 'Y', yanqui: 'Y', zulu: 'Z',
  };

  // Correcciones frecuentes del reconocedor de voz
  const FIXES = [
    [/\bq\s*n\s*h\b/g, 'qnh'], [/\bcu\s*ene\s*hache\b/g, 'qnh'], [/\bque\s*ene\s*hache\b/g, 'qnh'], [/\bqu[eé]\s*n\s*h\b/g, 'qnh'],
    [/\bcunh\b/g, 'qnh'], [/\bcuene\b/g, 'qnh'], [/\bq\s*f\s*e\b/g, 'qfe'],
    [/\bsquak\b/g, 'squawk'], [/\bsquack\b/g, 'squawk'], [/\bescuok\b/g, 'squawk'],
    [/\btake\s*off\b/g, 'takeoff'], [/\btouch\s*and\s*go\b/g, 'touch and go'],
    [/\bx-?ray\b/g, 'xray'],
    [/\bflight\s*level\b/g, 'fl'], [/\bnivel\s+de\s+vuelo\b/g, 'nivel'],
    [/\bpunto\s+de\s+espera\b/g, 'punto-de-espera'], [/\bholding\s+point\b/g, 'holding-point'],
    [/\bviento\s+en\s+cola\b/g, 'viento-en-cola'], [/\bviento\s+cruzado\b/g, 'viento-cruzado'], [/\bcorta\s+final\b/g, 'corta-final'],
    [/\bpista\s+libre\b/g, 'pista-libre'], [/\ben\s+el\s+aire\b/g, 'en-el-aire'],
    [/\bmotor\s+y\s+al\s+aire\b/g, 'motor-y-al-aire'], [/\bgo\s*around\b/g, 'go-around'],
    [/\bline\s+up\b/g, 'line-up'],
  ];

  function stripAccents(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n');
  }

  // Convierte "uno cero uno ocho" -> "1018", "tres mil quinientos" -> "3500", "uno uno ocho decimal cinco" -> "118.5"
  function mergeNumbers(tokens) {
    const out = [];
    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      const isNumTok = (x) => /^\d+(?:\.\d+)?$/.test(x) || NUM_WORDS[x];
      if (!isNumTok(t)) { out.push(t); i++; continue; }
      // recoger grupo
      const group = [];
      let j = i;
      while (j < tokens.length) {
        const x = tokens[j];
        if (isNumTok(x)) { group.push(x); j++; continue; }
        if ((DECIMAL_WORDS.has(x) || JOIN_WORDS.has(x)) && j + 1 < tokens.length && isNumTok(tokens[j + 1]) && group.length) { group.push(x); j++; continue; }
        break;
      }
      out.push(evalGroup(group));
      i = j;
    }
    return out;
  }

  function evalGroup(group) {
    // separa por palabra decimal
    const parts = [[]];
    for (const g of group) {
      if (DECIMAL_WORDS.has(g)) parts.push([]);
      else if (JOIN_WORDS.has(g)) continue;
      else if (/^\d+\.\d+$/.test(g)) { const [a, b] = g.split('.'); parts[parts.length - 1].push(a); parts.push([b]); }
      else parts[parts.length - 1].push(g);
    }
    return parts.map(evalInteger).join('.');
  }

  function evalInteger(items) {
    if (!items.length) return '';
    // ¿todo dígitos sueltos o números literales? -> concatenar (uno cero uno ocho -> 1018 ; "118" "5" no llega aquí)
    const allDigits = items.every((x) => (NUM_WORDS[x] && NUM_WORDS[x].k === 'd') || /^\d+$/.test(x));
    if (allDigits) return items.map((x) => (NUM_WORDS[x] ? String(NUM_WORDS[x].v) : x)).join('');
    let total = 0, cur = '';
    const flush = () => { const n = cur === '' ? 0 : parseInt(cur, 10); cur = ''; return n; };
    let acc = 0; // valor acumulado por debajo de mil
    for (const x of items) {
      if (/^\d+$/.test(x)) { cur += x; continue; }
      const w = NUM_WORDS[x];
      if (!w) continue;
      if (w.k === 'd') { cur += String(w.v); continue; }
      if (w.k === 't') { acc += flush() + w.v; continue; }
      if (w.k === 'h') { acc += flush() + w.v; continue; } // quinientos
      if (w.k === 'hm') { const n = flush(); acc += (n || 1) * 100; continue; } // "five hundred"
      if (w.k === 'm') { const n = flush(); const base = acc + n; total += (base || 1) * 1000; acc = 0; continue; }
    }
    return String(total + acc + flush());
  }

  function normalize(text) {
    let s = stripAccents(String(text || '').toLowerCase());
    s = s.replace(/(\d)[,](\d)/g, '$1.$2');          // 118,5 -> 118.5
    s = s.replace(/\b1\.0(\d\d)\b/g, '10$1');         // 1.018 -> 1018 (QNH escrito con punto de millar)
    s = s.replace(/[¿?¡!;:"()]/g, ' ').replace(/[.,](?=\s|$)/g, ' , ').replace(/-/g, ' ');
    for (const [re, rep] of FIXES) s = s.replace(re, rep);
    const tokens = s.split(/\s+/).filter(Boolean);
    return mergeNumbers(tokens).join(' ');
  }

  // ---------- Idioma ----------
  const ES_HINTS = ['pista', 'autorizado', 'mantenga', 'ruede', 'viento', 'responda', 'rumbo', 'suba', 'descienda', 'notifique', 'contacte', 'comunique', 'con', 'nudos', 'pies', 'buenos', 'buenas', 'recibido', 'colacion', 'alinee', 'espere', 'cruce', 'aterrizar', 'despegar', 'aproximacion', 'torre', 'grados', 'nivel'];
  const EN_HINTS = ['runway', 'cleared', 'hold', 'taxi', 'wind', 'squawk', 'heading', 'climb', 'descend', 'report', 'contact', 'knots', 'feet', 'good', 'roger', 'readback', 'line', 'wait', 'cross', 'land', 'takeoff', 'approach', 'tower', 'degrees', 'maintain', 'position', 'the', 'and', 'to', 'go-around', 'say', 'again', 'short', 'via', 'left', 'right', 'downwind'];
  function detectLang(n) {
    const words = new Set(n.split(' '));
    let es = 0, en = 0;
    for (const w of ES_HINTS) if (words.has(w)) es++;
    for (const w of EN_HINTS) if (words.has(w)) en++;
    return en > es ? 'en' : 'es';
  }

  // ---------- Indicativo ----------
  function callsignVariants(callsign) {
    const letters = String(callsign || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!letters) return [];
    const v = new Set([letters]);
    if (letters.length >= 3) { v.add(letters.slice(-3)); v.add(letters[0] + letters.slice(-2)); }
    return [...v].filter((x) => x.length >= 2);
  }
  function phoneticString(n) {
    // devuelve cadena de letras a partir de palabras fonéticas y letras sueltas, marcando límites de grupo
    const toks = n.split(' ');
    const groups = [];
    let cur = '';
    for (const t of toks) {
      const L = PHONETIC[t] || (/^[b-df-np-tv-xz]$/.test(t) ? t.toUpperCase() : null);
      if (L) cur += L;
      else { if (cur) groups.push(cur); cur = ''; }
    }
    if (cur) groups.push(cur);
    return groups;
  }
  function detectAddressed(n, callsign) {
    const variants = callsignVariants(callsign);
    if (!variants.length) return 'unknown';
    const groups = phoneticString(n);
    const joined = groups.join('|');
    for (const v of variants) if (groups.some((g) => g.includes(v))) return 'yes';
    // el reconocedor puede escribir el indicativo como palabra: "dkppa", "d kppa"
    const raw = n.replace(/\s+/g, '').toUpperCase();
    if (raw.includes(variants[0])) return 'yes';
    const other = groups.some((g) => g.length >= 3);
    return other ? 'no' : (joined ? 'unknown' : 'unknown');
  }

  // ---------- Extracción ----------
  const RWY_SIDE = { izquierda: 'L', derecha: 'R', centro: 'C', central: 'C', left: 'L', right: 'R', center: 'C', centre: 'C', l: 'L', r: 'R', c: 'C' };

  function fmtFreq(f) {
    let [a, b = ''] = f.split('.');
    b = (b + '000').slice(0, 3).replace(/0+$/, '');
    if (b === '') b = '0';
    return a + '.' + b;
  }
  function cap(s) { return s.replace(/\b[a-z]/g, (c) => c.toUpperCase()); }

  function extract(text, opts) {
    opts = opts || {};
    const n = normalize(text);
    const lang = opts.lang || detectLang(n);
    const es = lang === 'es';
    const items = [];      // elementos a colacionar
    const info = [];       // información útil que no se colaciona (viento, tráfico)
    const seen = new Set();
    const push = (arr, it) => { const k = it.key + '|' + it.value; if (seen.has(k)) return; seen.add(k); arr.push(it); };
    let m;

    // Pista(s)
    const rwyRe = /\b(?:pista|runway|rwy)\s+(?:en\s+uso\s+|in\s+use\s+)?(\d{1,2})(?:\s+(izquierda|derecha|centro|central|left|right|center|centre))?\b/g;
    const runways = [];
    while ((m = rwyRe.exec(n))) { const r = m[1].padStart(2, '0') + (m[2] ? RWY_SIDE[m[2]] : ''); if (!runways.includes(r)) runways.push(r); }
    const rwyStr = runways.join(' / ');

    // Autorizaciones e instrucciones
    const C = (key, labelEs, labelEn, rbEs, rbEn, sev) => ({ key, label: es ? labelEs : labelEn, readback: es ? rbEs : rbEn, sev: sev || 'ok' });
    const rw = rwyStr ? ' ' + rwyStr : '';
    const rwSp = rwyStr.replace(/(\d)(\d)/g, '$1 $2');
    const rwEs = rwyStr ? ' pista ' + rwSp : '', rwEn = rwyStr ? ' runway ' + rwSp : '';
    const RW_KEYS = new Set(['takeoff', 'land', 'tng', 'enter', 'lineup', 'backtrack', 'cross', 'join', 'hold', 'taxi']);
    const rules = [
      [/\b(?:cancele|cancelo|cancel)\b.*\b(?:despegue|takeoff)\b|\b(?:pare|deténgase|stop)\s+(?:inmediatamente|immediately)\b/, () => C('stop', 'PARE INMEDIATAMENTE', 'STOP IMMEDIATELY', 'paro', 'stopping', 'crit')],
      [/\bmotor-y-al-aire\b|\bgo-around\b|\bfrustre\b/, () => C('goaround', 'MOTOR Y AL AIRE', 'GO AROUND', 'motor y al aire', 'going around', 'crit')],
      [/\bautorizad[oa]\s+(?:a\s+|para\s+)?despeg(?:ar|ue)\b|\bcleared\s+(?:for\s+)?(?:immediate\s+)?takeoff\b/, () => C('takeoff', 'AUTORIZADO A DESPEGAR' + rw, 'CLEARED FOR TAKEOFF' + rw, 'autorizado a despegar' + rwEs, 'cleared for takeoff' + rwEn, 'go')],
      [/\bautorizad[oa]\s+(?:a\s+|para\s+)?aterriz(?:ar|aje)\b|\bcleared\s+to\s+land\b/, () => C('land', 'AUTORIZADO A ATERRIZAR' + rw, 'CLEARED TO LAND' + rw, 'autorizado a aterrizar' + rwEs, 'cleared to land' + rwEn, 'go')],
      [/\bautorizad[oa]\s+(?:a\s+|para\s+)?toque y despegue\b|\bcleared\s+(?:for\s+)?touch and go\b|\bcleared\s+(?:for\s+)?(?:the\s+)?option\b/, () => C('tng', 'AUTORIZADO TOQUE Y DESPEGUE' + rw, 'CLEARED TOUCH AND GO' + rw, 'autorizado toque y despegue' + rwEs, 'cleared touch and go' + rwEn, 'go')],
      [/\bautorizad[oa]\s+(?:a\s+)?(?:baja\s+)?pasada\b|\bcleared\s+(?:for\s+)?low\s+(?:pass|approach)\b/, () => C('lowpass', 'AUTORIZADO PASADA BAJA' + rw, 'CLEARED LOW PASS' + rw, 'autorizado pasada baja', 'cleared low pass', 'go')],
      [/\bautorizad[oa]\s+(?:a\s+)?(?:entrar\s+(?:en\s+)?(?:la\s+)?pista|ocupar\s+(?:la\s+)?pista)\b|\bcleared\s+to\s+enter\s+(?:the\s+)?runway\b/, () => C('enter', 'AUTORIZADO A ENTRAR EN PISTA' + rw, 'CLEARED TO ENTER RUNWAY' + rw, 'autorizado a entrar en pista' + (rwyStr ? ' ' + rwSp : ''), 'cleared to enter runway' + (rwyStr ? ' ' + rwSp : ''), 'go')],
      [/\b(?:alinee|alineese|alinie|entre y mantenga|line-up)\b/, () => C('lineup', 'ALINEE Y MANTENGA' + rw, 'LINE UP AND WAIT' + rw, 'alineo y mantengo' + rwEs, 'lining up and waiting' + rwEn, 'warn')],
      [/\bmantenga\s+(?:la\s+)?posicion\b|\bhold\s+position\b/, () => C('hold', 'MANTENGA POSICIÓN', 'HOLD POSITION', 'mantengo posicion', 'holding position', 'crit')],
      [/\bhold\s+short\b|\bmantenga\s+corto\b|\bmantenga\s+antes\s+de\b|\bmantenga\s+fuera\s+de\s+(?:la\s+)?pista\b/, () => C('hold', 'MANTENGA CORTO DE PISTA' + rw, 'HOLD SHORT RUNWAY' + rw, 'mantengo corto de pista' + (rwyStr ? ' ' + rwSp : ''), 'holding short runway' + (rwyStr ? ' ' + rwSp : ''), 'crit')],
      [/\bretroceda\b|\bbacktrack\b/, () => C('backtrack', 'RETROCEDA POR PISTA' + rw, 'BACKTRACK RUNWAY' + rw, 'retrocedo por pista' + (rwyStr ? ' ' + rwSp : ''), 'backtrack runway' + (rwyStr ? ' ' + rwSp : ''), 'warn')],
      [/\bcruce\s+(?:la\s+)?pista\b|\bcross\s+runway\b/, () => C('cross', 'CRUCE PISTA' + rw, 'CROSS RUNWAY' + rw, 'cruzo pista' + (rwyStr ? ' ' + rwSp : ''), 'crossing runway' + (rwyStr ? ' ' + rwSp : ''), 'warn')],
      [/\b(?:abandone|libere|desaloje)\s+(?:la\s+)?pista\b|\bvacate\b/, () => C('vacate', 'ABANDONE PISTA', 'VACATE RUNWAY', 'abandono pista', 'vacating', 'ok')],
      [/\b(?:ruede|rodar|taxi)\b\s*((?:al|a|hasta|via|por|to|hacia|en)\s+)?(.{3,70}?)(?=\s*(?:,|\bqnh\b|\bviento\b|\bwind\b|\bresponda\b|\bsquawk\b|\bnotifique\b|\breport\b|\bcontact|\bmantenga\b|\bhold\b|$))/, (mm) => { const prep = (mm[1] || '').trim(); const dest = ((prep ? prep + ' ' : '') + mm[2]).replace(/-/g, ' ').trim(); return C('taxi', 'RUEDE ' + dest.toUpperCase(), 'TAXI ' + dest.toUpperCase(), 'ruedo ' + dest, 'taxi ' + dest, 'ok'); }],
      [/\b(?:incorporese|incorpore|entre|unase|join)\s+(?:en\s+|el\s+|al\s+|a\s+|the\s+)?(?:circuito\s+(?:de\s+)?(?:trafico\s+)?)?(?:en\s+|por\s+|via\s+)?(viento-en-cola|viento-cruzado|base|corta-final|final|(?:left|right)\s+(?:downwind|base)|downwind|overhead)\s*(izquierda|derecha|left|right)?(?:\s+pista\s+\d{1,2})?/, (mm) => { const leg = (mm[1] + (mm[2] ? ' ' + mm[2] : '')).replace(/-/g, ' '); return C('join', 'INCORPÓRESE ' + leg.toUpperCase() + rw, 'JOIN ' + leg.toUpperCase() + rw, 'me incorporo ' + leg + rwEs, 'joining ' + leg + rwEn, 'ok'); }],
      [/\b(?:notifique|reporte|report)\s+(.{2,40}?)(?=\s*(?:,|\bqnh\b|\bviento\b|\bwind\b|\bresponda\b|\bsquawk\b|\bcontact|\bpista\b|\brunway\b|$))/, (mm) => { const w = mm[1].replace(/-/g, ' ').trim(); return C('report', 'NOTIFIQUE ' + w.toUpperCase(), 'REPORT ' + w.toUpperCase(), 'notificare ' + w, 'wilco, report ' + w, 'ok'); }],
      [/\b(?:continue|continua)\s+(?:la\s+)?(?:aproximacion|approach)\b/, () => C('contapp', 'CONTINÚE APROXIMACIÓN', 'CONTINUE APPROACH', 'continuo aproximacion', 'continuing approach', 'ok')],
      [/\bautorizad[oa]\s+(?:a\s+|para\s+)?(?:la\s+)?aproximacion\b|\bcleared\s+(?:for\s+)?(?:the\s+)?(?:\w+\s+)?approach\b/, () => C('app', 'AUTORIZADO APROXIMACIÓN', 'CLEARED APPROACH', 'autorizado aproximacion', 'cleared approach', 'go')],
      [/\b(?:espere|stand ?by|standby)\b/, () => C('standby', 'ESPERE', 'STAND BY', '', '', 'ok')],
      [/\bsquawk\s+ident\b|\bresponda\s+ident\b|\bpulse\s+ident\b/, () => C('ident', 'IDENT', 'IDENT', 'ident', 'ident', 'ok')],
      [/\b(?:orbite|orbit)\s*(izquierda|derecha|left|right)?/, (mm) => C('orbit', 'ORBITE ' + (mm[1] || '').toUpperCase(), 'ORBIT ' + (mm[1] || '').toUpperCase(), 'orbito ' + (mm[1] || ''), 'orbiting ' + (mm[1] || ''), 'warn')],
    ];
    const clearances = [];
    for (const [re, mk] of rules) { const mm = re.exec(n); if (mm) clearances.push(mk(mm)); }
    for (const c of clearances) push(items, { key: c.key, group: 'clr', label: c.label.replace(/\s+$/, ''), value: '', readback: c.readback, sev: c.sev });

    // Altitud / nivel
    const altRe = /\b(suba|ascienda|ascender|descienda|descender|mantenga|climb|descend|maintain)?\b[^,]{0,25}?\b(\d{3,5})\s*(?:pies|feet|ft)\b(?:\s*(?:qnh|on qnh)\s*(\d{4}))?/;
    if ((m = altRe.exec(n))) {
      const verb = m[1] || '';
      let vEs = 'ALTITUD', vEn = 'ALTITUDE', rbEs = 'altitud', rbEn = 'altitude';
      if (/suba|asc|climb/.test(verb)) { vEs = 'SUBA A'; vEn = 'CLIMB'; rbEs = 'subo a'; rbEn = 'climb'; }
      else if (/desc/.test(verb)) { vEs = 'DESCIENDA A'; vEn = 'DESCEND'; rbEs = 'desciendo a'; rbEn = 'descend'; }
      else if (/mantenga|maintain/.test(verb)) { vEs = 'MANTENGA'; vEn = 'MAINTAIN'; rbEs = 'mantengo'; rbEn = 'maintain'; }
      push(items, { key: 'altitude', group: 'nav', label: es ? vEs : vEn, value: m[2] + ' ft', readback: (es ? rbEs : rbEn) + ' ' + m[2] + (es ? ' pies' : ' feet'), sev: 'ok' });
    }
    const flRe = /\b(suba|ascienda|descienda|mantenga|climb|descend|maintain)?\b[^,]{0,25}?\b(?:nivel|fl)\s*(\d{2,3})\b/;
    if ((m = flRe.exec(n))) {
      const verb = m[1] || '';
      let l = es ? 'NIVEL' : 'FLIGHT LEVEL', rb = es ? 'nivel' : 'flight level';
      if (/suba|asc|climb/.test(verb)) { l = es ? 'SUBA A NIVEL' : 'CLIMB FL'; rb = es ? 'subo a nivel' : 'climb flight level'; }
      else if (/desc/.test(verb)) { l = es ? 'DESCIENDA A NIVEL' : 'DESCEND FL'; rb = es ? 'desciendo a nivel' : 'descend flight level'; }
      else if (/mantenga|maintain/.test(verb)) { l = es ? 'MANTENGA NIVEL' : 'MAINTAIN FL'; rb = es ? 'mantengo nivel' : 'maintain flight level'; }
      push(items, { key: 'level', group: 'nav', label: l, value: 'FL' + m[2].padStart(3, '0'), readback: rb + ' ' + m[2].split('').join(' '), sev: 'ok' });
    }

    // Rumbo
    const hdgRe = /\b(?:(vire|gire|turn)\s+(?:a\s+la\s+|a\s+)?(izquierda|derecha|left|right)\s+)?(?:rumbo|heading|hdg)\s+(\d{3}|de pista|runway heading)\b/;
    if ((m = hdgRe.exec(n))) {
      const dir = m[2] ? (es ? (/izq|left/.test(m[2]) ? 'VIRE IZQUIERDA ' : 'VIRE DERECHA ') : (/izq|left/.test(m[2]) ? 'TURN LEFT ' : 'TURN RIGHT ')) : '';
      const val = /\d/.test(m[3]) ? m[3] + '°' : (es ? 'DE PISTA' : 'RUNWAY HDG');
      push(items, { key: 'heading', group: 'nav', label: dir + (es ? 'RUMBO' : 'HEADING'), value: val, readback: (m[2] ? (es ? (/izq|left/.test(m[2]) ? 'viro izquierda ' : 'viro derecha ') : (/izq|left/.test(m[2]) ? 'left ' : 'right ')) : '') + (es ? 'rumbo ' : 'heading ') + (/\d/.test(m[3]) ? m[3].split('').join(' ') : (es ? 'de pista' : 'runway heading')), sev: 'ok' });
    } else if ((m = /\b(vire|gire|turn)\s+(?:a\s+la\s+|a\s+)?(izquierda|derecha|left|right)\b(?:\s+(\d{1,3})\s*(?:grados|degrees))?/.exec(n))) {
      const left = /izq|left/.test(m[2]);
      push(items, { key: 'heading', group: 'nav', label: es ? (left ? 'VIRE IZQUIERDA' : 'VIRE DERECHA') : (left ? 'TURN LEFT' : 'TURN RIGHT'), value: m[3] ? m[3] + '°' : '', readback: es ? (left ? 'viro izquierda' : 'viro derecha') + (m[3] ? ' ' + m[3] + ' grados' : '') : (left ? 'turning left' : 'turning right') + (m[3] ? ' ' + m[3] + ' degrees' : ''), sev: 'ok' });
    }

    // Transponder
    if ((m = /\b(?:responda|squawk|transponder|transpondedor|codigo|code)\s+(?:a\s+)?(\d{4})\b/.exec(n))) {
      push(items, { key: 'squawk', group: 'data', label: es ? 'RESPONDA' : 'SQUAWK', value: m[1], readback: (es ? 'respondo ' : 'squawk ') + m[1].split('').join(' '), sev: 'ok' });
    }

    // QNH / QFE
    if ((m = /\bqnh\s+(\d{3,4})\b/.exec(n))) push(items, { key: 'qnh', group: 'data', label: 'QNH', value: m[1], readback: 'qnh ' + m[1].split('').join(' '), sev: 'ok' });
    if ((m = /\bqfe\s+(\d{3,4})\b/.exec(n))) push(items, { key: 'qfe', group: 'data', label: 'QFE', value: m[1], readback: 'qfe ' + m[1].split('').join(' '), sev: 'ok' });

    // Frecuencia
    const freqRe = /\b(1[1-3]\d(?:\.\d{1,3})?)\b/g;
    const freqs = [];
    while ((m = freqRe.exec(n))) { if (m[1].includes('.') || /\b(?:contact|contacte|comunique|llame|frecuencia|frequency|en|on)\s+1[1-3]\d\b/.test(n.slice(Math.max(0, m.index - 12), m.index + 4))) freqs.push({ f: m[1], idx: m.index }); }
    if (freqs.length) {
      const f = freqs[freqs.length - 1];
      const before = n.slice(0, f.idx);
      let station = '';
      const st = /\b(?:contacte|comunique|llame|contact|pase|cambie|monitor|monitorice|escuche)\s+(?:con\s+|a\s+|la\s+|al\s+)?(.{3,40}?)\s*(?:en\s+|on\s+|frecuencia\s+|frequency\s+|,\s*)?$/.exec(before);
      if (st) station = cap(st[1].replace(/\b(?:en|on|frecuencia|frequency)\s*$/, '').trim());
      const fv = fmtFreq(f.f);
      push(items, { key: 'freq', group: 'data', label: (station ? station.toUpperCase() : (es ? 'FRECUENCIA' : 'FREQUENCY')), value: fv, readback: (station ? station.toLowerCase() + ' ' : '') + fv.replace('.', es ? ' decimal ' : ' decimal ').split(/(?<=\d)(?=\d)/).join(' '), sev: 'ok' });
    }

    // Pista como elemento propio (si no está ya implícita en una autorización)
    if (rwyStr && !clearances.some((c) => RW_KEYS.has(c.key))) {
      push(items, { key: 'runway', group: 'nav', label: es ? 'PISTA' : 'RUNWAY', value: rwyStr, readback: (es ? 'pista ' : 'runway ') + rwSp, sev: 'ok' });
    }

    // Velocidad
    if ((m = /\b(?:velocidad|speed)\s+(\d{2,3})\s*(?:nudos|knots|kt)?\b/.exec(n))) push(items, { key: 'speed', group: 'nav', label: es ? 'VELOCIDAD' : 'SPEED', value: m[1] + ' kt', readback: (es ? 'velocidad ' : 'speed ') + m[1], sev: 'ok' });

    // Viento (información)
    if ((m = /\b(?:viento|wind)\s+(?:de\s+|del\s+)?(?:(\d{3})\s*(?:grados|degrees)?|(calma|calm|variable))\s*(?:(\d{1,2})\s*(?:nudos|knots|kt|kts)?)?(?:\s*(?:rachas|racheado|gusting|gusts?)\s*(?:de\s+)?(\d{1,2}))?/.exec(n))) {
      let v = m[2] ? (es ? (m[2] === 'calm' ? 'CALMA' : m[2].toUpperCase()) : (m[2] === 'calma' ? 'CALM' : m[2].toUpperCase())) : m[1] + '°';
      if (m[3]) v += ' ' + m[3] + ' kt'; if (m[4]) v += ' G' + m[4];
      info.push({ key: 'wind', label: es ? 'VIENTO' : 'WIND', value: v });
    }
    // Tráfico (información)
    if ((m = /\b(?:trafico|traffic)\b\s*(?:es\s+|is\s+|a\s+)?(.{4,60}?)(?=\s*(?:,|\bnotifique\b|\breport\b|$))/.exec(n))) info.push({ key: 'traffic', label: es ? 'TRÁFICO' : 'TRAFFIC', value: m[1].replace(/-/g, ' ').toUpperCase() });
    // Temperatura / altitud de transición
    if ((m = /\b(?:altitud de transicion|transition altitude)\s+(\d{4,5})/.exec(n))) info.push({ key: 'ta', label: es ? 'ALT. TRANSICIÓN' : 'TRANSITION ALT', value: m[1] + ' ft' });
    if ((m = /\b(?:nivel de transicion|transition level)\s+(\d{2,3})/.exec(n))) info.push({ key: 'tl', label: es ? 'NIVEL TRANSICIÓN' : 'TRANSITION LEVEL', value: 'FL' + m[1] });

    const addressed = detectAddressed(n, opts.callsign);
    const readback = buildReadback(items, lang, opts.callsign);
    return { lang, addressed, items, info, readback, runway: rwyStr, normalized: n };
  }

  const ORDER = ['stop', 'goaround', 'hold', 'takeoff', 'land', 'tng', 'lowpass', 'enter', 'lineup', 'backtrack', 'cross', 'vacate', 'taxi', 'join', 'app', 'contapp', 'runway', 'altitude', 'level', 'heading', 'speed', 'squawk', 'qnh', 'qfe', 'freq', 'report', 'ident', 'orbit', 'standby'];
  function spellCallsign(callsign, lang) {
    const letters = String(callsign || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const names = { A: 'Alfa', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray', Y: 'Yankee', Z: 'Zulu' };
    return letters.split('').map((c) => names[c] || c).join(' ');
  }
  function buildReadback(items, lang, callsign) {
    const sorted = [...items].filter((i) => i.readback).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
    const parts = sorted.map((i) => i.readback);
    if (!parts.length) return '';
    let s = parts.join(', ');
    s = s.charAt(0).toUpperCase() + s.slice(1);
    if (callsign) s += ', ' + spellCallsign(callsign, lang);
    return s;
  }

  return { normalize, extract, detectLang, detectAddressed, callsignVariants, spellCallsign, buildReadback, ORDER };
});
