const P = require('../parser.js');
const CS = 'D-KPPA';
let fails = 0, total = 0;
function has(res, key, value) {
  const it = res.items.find((i) => i.key === key);
  if (!it) return `falta ${key}`;
  if (value !== undefined && !String(it.value + ' ' + it.label).includes(value)) return `${key}: esperado "${value}", obtenido label="${it.label}" value="${it.value}"`;
  return null;
}
function t(text, checks, opts) {
  total++;
  const res = P.extract(text, Object.assign({ callsign: CS }, opts || {}));
  const errs = [];
  for (const c of checks) {
    if (typeof c === 'function') { const e = c(res); if (e) errs.push(e); }
    else { const e = has(res, c[0], c[1]); if (e) errs.push(e); }
  }
  if (errs.length) { fails++; console.log('✗', text, '\n   ', errs.join(' | '), '\n    norm:', res.normalized, '\n    items:', JSON.stringify(res.items.map((i) => [i.key, i.label, i.value]))); }
  else console.log('✓', text, '\n    →', res.readback, `[${res.lang}/${res.addressed}]`);
}

// --- Normalización numérica
const n = P.normalize;
console.assert(n('uno cero uno ocho') === '1018', n('uno cero uno ocho'));
console.assert(n('tres mil quinientos pies') === '3500 pies', n('tres mil quinientos pies'));
console.assert(n('uno uno ocho decimal cinco') === '118.5', n('uno uno ocho decimal cinco'));
console.assert(n('one zero thousand feet') === '10000 feet', n('one zero thousand feet'));
console.assert(n('two thousand five hundred feet') === '2500 feet', n('two thousand five hundred feet'));
console.assert(n('treinta y cinco') === '35', n('treinta y cinco'));
console.assert(n('pista veintitrés') === 'pista 23', n('pista veintitrés'));
console.assert(n('QNH 1.018') === 'qnh 1018', n('QNH 1.018'));
console.assert(n('118,500') === '118.500', n('118,500'));
console.assert(n('Q N H uno cero dos cero') === 'qnh 1020', n('Q N H uno cero dos cero'));

// --- Español
t('Delta Kilo Papa Papa Alfa, León Torre, buenos días, pista en uso 23, viento 240 grados 8 nudos, QNH 1018, responda 7001',
  [['runway', '23'], ['qnh', '1018'], ['squawk', '7001'], (r) => r.addressed === 'yes' ? null : 'addressed ' + r.addressed, (r) => r.info.find((i) => i.key === 'wind' && i.value.includes('240')) ? null : 'viento']);
t('Kilo Papa Papa Alfa, ruede al punto de espera pista 23 vía Bravo, QNH uno cero uno ocho',
  [['taxi', 'PUNTO DE ESPERA'], ['qnh', '1018'], (r) => r.addressed === 'yes' ? null : 'addressed']);
t('Papa Papa Alfa, mantenga posición, tráfico en corta final', [['hold'], (r) => r.info.find((i) => i.key === 'traffic') ? null : 'trafico', (r) => r.addressed === 'yes' ? null : 'addr ' + r.addressed]);
t('Papa Papa Alfa, alinee y mantenga pista 23', [['lineup', '23']]);
t('Papa Papa Alfa, viento 250 grados 10 nudos, pista 23, autorizado a despegar', [['takeoff', '23'], (r) => r.items.find((i) => i.key === 'hold') ? 'hold falso' : null]);
t('Kilo Papa Papa Alfa, después del despegue vire izquierda rumbo 180, suba a 3500 pies', [['heading', '180'], ['altitude', '3500']]);
t('Papa Papa Alfa, contacte con Madrid Aproximación en 118 decimal 5', [['freq', '118.5'], (r) => /MADRID APROXIMACION/.test(r.items.find((i) => i.key === 'freq').label) ? null : 'estación: ' + r.items.find((i) => i.key === 'freq').label]);
t('Papa Papa Alfa, comunique con Torre uno uno ocho decimal siete cinco', [['freq', '118.75']]);
t('Delta Kilo Papa Papa Alfa, descienda a 2500 pies QNH 1020, notifique final pista 23', [['altitude', '2500'], ['qnh', '1020'], ['report', 'FINAL'], ['runway', '23']]);
t('Papa Papa Alfa, incorpórese en viento en cola derecha pista 23, notifique viento en cola', [['join', 'VIENTO EN COLA DERECHA'], ['report', 'VIENTO EN COLA']]);
t('Papa Papa Alfa, pista 23, viento calma, autorizado a aterrizar', [['land', '23'], (r) => r.info.find((i) => i.key === 'wind' && /CALMA/.test(i.value)) ? null : 'viento calma']);
t('Papa Papa Alfa, autorizado toque y despegue pista 23', [['tng', '23']]);
t('Papa Papa Alfa, motor y al aire, tráfico en pista', [['goaround']]);
t('Papa Papa Alfa, abandone pista por la primera a la izquierda, contacte rodadura 121.9', [['vacate'], ['freq', '121.9']]);
t('Papa Papa Alfa, suba a nivel de vuelo 65, responda 4321', [['level', 'FL065'], ['squawk', '4321']]);
t('Papa Papa Alfa, cruce pista 05, notifique pista libre', [['cross', '05'], ['report', 'PISTA LIBRE']]);
t('Papa Papa Alfa, mantenga corto de pista 23', [['hold']]);
t('Papa Papa Alfa, retroceda por pista 23 y alinee', [['backtrack', '23'], ['lineup']]);
t('Papa Papa Alfa, espere', [['standby']]);
t('Echo Charlie Alfa Bravo Charlie, autorizado a despegar pista 23', [(r) => r.addressed === 'no' ? null : 'debería ser no, es ' + r.addressed]);
t('Papa Papa Alfa, vire a la derecha rumbo 090, mantenga 4000 pies', [['heading', '090'], ['altitude', '4000']]);
t('Papa Papa Alfa, pista dos tres, viento dos cuatro cero grados ocho nudos, autorizado a despegar', [['takeoff', '23']]);
t('DKPPA, cancele despegue, repito, cancele despegue, mantenga posición', [['stop'], ['hold'], (r) => r.addressed === 'yes' ? null : 'addr ' + r.addressed]);
t('Papa Papa Alfa, altitud de transición 6000 pies, nivel de transición 75', [(r) => r.info.length === 2 ? null : 'info ' + JSON.stringify(r.info)]);

// --- Inglés
t('Delta Kilo Papa Papa Alpha, Madrid Approach, squawk 4562, QNH 1015', [['squawk', '4562'], ['qnh', '1015'], (r) => r.lang === 'en' ? null : 'lang']);
t('Papa Papa Alpha, runway two three, wind two four zero degrees eight knots, cleared for takeoff', [['takeoff', '23'], (r) => r.lang === 'en' ? null : 'lang']);
t('Papa Papa Alpha, hold short of runway two three', [['hold']]);
t('Papa Papa Alpha, line up and wait runway 23', [['lineup', '23']]);
t('Papa Papa Alpha, climb to three thousand five hundred feet, turn right heading zero niner zero', [['altitude', '3500'], ['heading', '090']]);
t('Papa Papa Alpha, contact Madrid Approach one one eight decimal five', [['freq', '118.5']]);
t('Papa Papa Alpha, taxi to holding point runway 23 via bravo, QNH one zero one eight', [['taxi', 'HOLDING POINT'], ['qnh', '1018']]);
t('Papa Papa Alpha, join left downwind runway 23, report downwind', [['join', 'LEFT DOWNWIND'], ['report', 'DOWNWIND']]);
t('Papa Papa Alpha, wind calm, runway 23, cleared to land', [['land', '23']]);
t('Papa Papa Alpha, go around, I say again go around', [['goaround']]);
t('Papa Papa Alpha, descend flight level six five, squawk ident', [['level', 'FL065'], ['ident']]);
t('Papa Papa Alpha, cleared touch and go runway 23', [['tng', '23']]);

console.log(`\n${total - fails}/${total} OK`);
process.exit(fails ? 1 : 0);
