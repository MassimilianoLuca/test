// Dashboard amministratore: legge i reclami dalla Web App Apps Script (URL in config.js)
// usando il token amministratore, calcola i KPI e permette di aggiornare lo stato.
const STATUSES = ['Aperto', 'In lavorazione', 'Chiuso - accolto', 'Chiuso - respinto'];
const DAY = 24 * 60 * 60 * 1000;
const TOKEN_KEY = 'claims-admin-token';
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

const $ = (id) => document.getElementById(id);
const PAGE_SIZE = 25;
const state = { claims: [], demo: false, token: '', current: null, shown: PAGE_SIZE };

// ---------- API ----------

async function api(action, payload = {}) {
  if (!window.CLAIMS_API_URL) throw new Error('CLAIMS_API_URL non configurato in config.js');
  const res = await fetch(window.CLAIMS_API_URL, {
    method: 'POST',
    body: JSON.stringify({ action, token: state.token, ...payload }),
  });
  const result = await res.json();
  if (!result.ok) throw new Error(result.error);
  return result;
}

async function load() {
  if (state.demo) return render();
  $('data-source').textContent = 'Caricamento…';
  const { claims } = await api('list');
  state.claims = claims;
  $('data-source').textContent = 'Aggiornato alle ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  render();
}

// ---------- Accesso ----------

function showDashboard() {
  $('login').hidden = true;
  $('dashboard').hidden = false;
  $('session').hidden = false;
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  state.token = $('token').value.trim();
  state.demo = false;
  try {
    await load();
    try { sessionStorage.setItem(TOKEN_KEY, state.token); } catch {}
    showDashboard();
    $('login-error').hidden = true;
  } catch (err) {
    $('login-error').textContent = 'Accesso non riuscito: ' + err.message;
    $('login-error').hidden = false;
  }
});

$('demo-btn').addEventListener('click', () => {
  state.demo = true;
  state.claims = demoClaims();
  $('data-source').textContent = 'Dati di esempio';
  showDashboard();
  render();
});

$('logout-btn').addEventListener('click', () => {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
  location.reload();
});

$('refresh-btn').addEventListener('click', () => load().catch((err) => alert(err.message)));

// ---------- Filtri ----------

function fillSelect(select, values) {
  const current = select.value;
  select.length = 1;
  for (const v of values) select.add(new Option(v, v));
  select.value = values.includes(current) ? current : '';
}

function periodStart() {
  const p = $('f-period').value;
  const today = startOfDay(new Date());
  if (p === 'all') return null;
  if (p === 'ytd') return new Date(today.getFullYear(), 0, 1);
  return new Date(today - (Number(p) - 1) * DAY);
}

function filtered() {
  const start = periodStart();
  const division = $('f-division').value;
  const plant = $('f-plant').value;
  const status = $('f-status').value;
  const q = $('f-search').value.trim().toLowerCase();
  return state.claims.filter((c) => {
    if (start && claimDate(c) < start) return false;
    if (division && c['Divisione'] !== division) return false;
    if (plant && c['Stabilimento'] !== plant) return false;
    if (status && c['Stato'] !== status) return false;
    if (q && ![c['ID'], c['Ragione sociale'], c['Articolo'], c['Batch nr'], c['DDT nr'], c['Referente']]
      .some((v) => String(v || '').toLowerCase().includes(q))) return false;
    return true;
  });
}

for (const id of ['f-period', 'f-division', 'f-plant', 'f-status', 'f-search']) {
  $(id).addEventListener('input', () => {
    state.shown = PAGE_SIZE;
    render();
  });
}

// ---------- Calcoli ----------

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return y ? new Date(y, m - 1, d) : null;
}

function claimDate(c) { return parseDate(c['Data reclamo']) || parseDate(c['Ricevuto il']); }
function isClosed(c) { return String(c['Stato']).startsWith('Chiuso'); }

function ageDays(c) {
  const end = isClosed(c) ? parseDate(c['Data chiusura']) : startOfDay(new Date());
  return end ? Math.max(0, Math.round((end - claimDate(c)) / DAY)) : null;
}

function formatDate(s) {
  const d = parseDate(s);
  return d ? d.toLocaleDateString('it-IT') : '';
}

function pct(part, total) { return total ? Math.round((part / total) * 100) + '%' : '–'; }

function countBy(list, key) {
  const counts = new Map();
  for (const c of list) {
    const k = c[key] || '(vuoto)';
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

// ---------- Render ----------

function render() {
  fillSelect($('f-division'), [...new Set(state.claims.map((c) => c['Divisione']).filter(Boolean))].sort());
  fillSelect($('f-plant'), [...new Set(state.claims.map((c) => c['Stabilimento']).filter(Boolean))].sort());
  fillSelect($('f-status'), STATUSES);

  const list = filtered();
  renderKpis(list);
  renderMonths(list);
  renderBars($('chart-division'), countBy(list, 'Divisione'));
  renderBars($('chart-plant'), countBy(list, 'Stabilimento'));
  renderBars($('chart-status'), STATUSES.map((s) => [s, list.filter((c) => c['Stato'] === s).length]));
  renderBars($('chart-client'), countBy(list, 'Ragione sociale').slice(0, 6));
  renderBars($('chart-product'), countBy(list, 'Articolo').slice(0, 6));
  renderTable(list);
}

function renderKpis(list) {
  const open = list.filter((c) => !isClosed(c));
  const stale = open.filter((c) => ageDays(c) > 30);
  const closed = list.filter(isClosed);
  const closeDays = closed.map(ageDays).filter((d) => d !== null);
  const avgClose = closeDays.length ? (closeDays.reduce((a, b) => a + b, 0) / closeDays.length).toFixed(1) : '–';
  const accepted = closed.filter((c) => c['Stato'] === 'Chiuso - accolto').length;
  const replacement = list.filter((c) => c['Richiesta sostituzione'] === 'Sì').length;
  const documented = list.filter((c) => c['Foto'] === 'Sì' || c['Campioni'] === 'Sì').length;

  const tiles = [
    ['Reclami', list.length, 'nel periodo selezionato'],
    ['Aperti', open.length, stale.length + ' da oltre 30 giorni'],
    ['Tempo medio di chiusura', avgClose, closeDays.length ? 'giorni, su ' + closeDays.length + ' chiusi' : 'nessun reclamo chiuso'],
    ['Accolti', pct(accepted, closed.length), accepted + ' su ' + closed.length + ' chiusi'],
    ['Richiesta sostituzione', pct(replacement, list.length), replacement + ' reclami'],
    ['Con foto o campioni', pct(documented, list.length), documented + ' reclami documentati'],
  ];
  $('kpis').replaceChildren(...tiles.map(([label, value, sub]) => {
    const el = document.createElement('div');
    el.className = 'kpi';
    el.innerHTML = '<div class="label"></div><div class="value"></div><div class="sub"></div>';
    el.querySelector('.label').textContent = label;
    el.querySelector('.value').textContent = value;
    el.querySelector('.sub').textContent = sub;
    return el;
  }));
}

function renderMonths(list) {
  const container = $('chart-month');
  const dates = list.map(claimDate).filter(Boolean);
  const start = periodStart() || (dates.length ? new Date(Math.min(...dates)) : new Date());
  const now = new Date();
  const months = [];
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= now; d.setMonth(d.getMonth() + 1)) {
    months.push({ y: d.getFullYear(), m: d.getMonth(), n: 0 });
  }
  for (const d of dates) {
    const bucket = months.find((b) => b.y === d.getFullYear() && b.m === d.getMonth());
    if (bucket) bucket.n++;
  }
  const max = Math.max(1, ...months.map((b) => b.n));
  const label = (b) => MONTHS[b.m] + (b.m === 0 || months.length <= 12 ? ' ' + String(b.y).slice(2) : '');

  container.replaceChildren(...months.map((b) => {
    const col = document.createElement('div');
    col.className = 'vbar';
    col.dataset.tip = `${MONTHS[b.m]} ${b.y}: ${b.n} reclam${b.n === 1 ? 'o' : 'i'}`;
    const showNum = months.length <= 18 && b.n > 0;
    col.innerHTML = (showNum ? `<span class="num">${b.n}</span>` : '') +
      `<div class="bar" style="height:${(b.n / max) * 100}%"></div>`;
    return col;
  }));

  let labels = container.nextElementSibling;
  if (!labels || !labels.classList.contains('vlabels')) {
    labels = document.createElement('div');
    labels.className = 'vlabels';
    container.after(labels);
  }
  const every = Math.ceil(months.length / 12);
  labels.replaceChildren(...months.map((b, i) => {
    const span = document.createElement('span');
    span.textContent = i % every === 0 ? label(b) : '';
    return span;
  }));
}

function renderBars(container, entries) {
  if (!entries.some(([, n]) => n)) {
    container.innerHTML = '<p class="empty">Nessun dato</p>';
    return;
  }
  const max = Math.max(...entries.map(([, n]) => n));
  container.replaceChildren(...entries.map(([name, n]) => {
    const row = document.createElement('div');
    row.className = 'hbar';
    row.dataset.tip = `${name}: ${n}`;
    row.innerHTML = '<span class="name"></span><span class="track"><span class="bar"></span><span class="num"></span></span>';
    row.querySelector('.name').textContent = name;
    row.querySelector('.bar').style.width = `calc(${(n / max) * 100}% - 40px)`;
    row.querySelector('.num').textContent = n;
    return row;
  }));
}

function statusBadge(status) {
  const span = document.createElement('span');
  span.className = 'badge status-' + String(status).toLowerCase().replace(/[^a-z]+/g, '-');
  span.textContent = status;
  return span;
}

function renderTable(list) {
  $('count').textContent = `(${list.length})`;
  const sorted = [...list].sort((a, b) => claimDate(b) - claimDate(a));
  const more = $('more-btn');
  more.hidden = sorted.length <= state.shown;
  more.textContent = `Mostra altri (${sorted.length - state.shown})`;
  const rows = sorted.slice(0, state.shown).map((c) => {
    const tr = document.createElement('tr');
    const cells = [c['ID'], formatDate(c['Data reclamo']), c['Ragione sociale'], c['Articolo'],
      c['Batch nr'], c['Divisione'], c['Stabilimento']];
    for (const v of cells) tr.appendChild(Object.assign(document.createElement('td'), { textContent: v || '' }));
    tr.appendChild(document.createElement('td')).appendChild(statusBadge(c['Stato']));
    tr.appendChild(Object.assign(document.createElement('td'), { className: 'num', textContent: ageDays(c) ?? '' }));
    tr.addEventListener('click', () => openDetail(c));
    return tr;
  });
  const tbody = $('claims-table').tBodies[0];
  if (rows.length) {
    tbody.replaceChildren(...rows);
  } else {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">Nessun reclamo con questi filtri</td></tr>';
  }
}

$('more-btn').addEventListener('click', () => {
  state.shown += PAGE_SIZE;
  renderTable(filtered());
});

// ---------- Tooltip ----------

const tooltip = $('tooltip');
document.addEventListener('mousemove', (e) => {
  const target = e.target.closest('[data-tip]');
  if (!target) { tooltip.hidden = true; return; }
  tooltip.textContent = target.dataset.tip;
  tooltip.hidden = false;
  const x = Math.min(e.clientX + 12, window.innerWidth - tooltip.offsetWidth - 8);
  tooltip.style.left = x + 'px';
  tooltip.style.top = (e.clientY - tooltip.offsetHeight - 10) + 'px';
});

// ---------- Dettaglio ----------

const DETAIL_FIELDS = ['Data reclamo', 'Ricevuto il', 'Ragione sociale', 'Referente', 'email', 'Telefono',
  'Divisione', 'Stabilimento', 'Articolo', 'Quantità', 'Batch nr', 'DDT nr', 'Data DDT', 'Fattura nr',
  'Data fattura', 'Descrizione problematica', 'Foto', 'Link foto', 'Campioni', 'Richiesta sostituzione', 'Data chiusura'];

function openDetail(c) {
  state.current = c;
  $('detail-title').textContent = c['ID'];
  const dl = $('detail-fields');
  dl.replaceChildren();
  for (const f of DETAIL_FIELDS) {
    let v = c[f];
    if (!v) continue;
    const dd = document.createElement('dd');
    if (f === 'Link foto') {
      dd.appendChild(Object.assign(document.createElement('a'), { href: v, target: '_blank', rel: 'noopener', textContent: 'Apri foto' }));
    } else if (f === 'email') {
      dd.appendChild(Object.assign(document.createElement('a'), { href: 'mailto:' + v, textContent: v }));
    } else {
      dd.textContent = f.startsWith('Data') ? formatDate(v) : f === 'Ricevuto il' ? new Date(v).toLocaleString('it-IT') : v;
    }
    dl.append(Object.assign(document.createElement('dt'), { textContent: f === 'email' ? 'Email' : f }), dd);
  }
  const select = $('detail-status');
  select.replaceChildren(...STATUSES.map((s) => new Option(s, s)));
  select.value = c['Stato'];
  $('detail-notes').value = c['Note interne'] || '';
  $('detail-error').hidden = true;
  $('detail').showModal();
}

$('detail-save').addEventListener('click', async () => {
  const c = state.current;
  const changes = { 'Stato': $('detail-status').value, 'Note interne': $('detail-notes').value };
  const button = $('detail-save');
  button.disabled = true;
  try {
    if (!state.demo) await api('update', { id: c['ID'], changes });
    const wasClosed = isClosed(c);
    Object.assign(c, changes);
    if (isClosed(c) && !wasClosed) c['Data chiusura'] = new Date().toISOString().slice(0, 10);
    if (!isClosed(c)) c['Data chiusura'] = '';
    $('detail').close();
    render();
  } catch (err) {
    $('detail-error').textContent = 'Salvataggio non riuscito: ' + err.message;
    $('detail-error').hidden = false;
  } finally {
    button.disabled = false;
  }
});

// ---------- Esporta CSV ----------

$('export-btn').addEventListener('click', () => {
  const list = filtered();
  const columns = ['ID', 'Stato', 'Data chiusura', 'Note interne', ...DETAIL_FIELDS.filter((f) => f !== 'Data chiusura')];
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = [columns.map(esc).join(';'), ...list.map((c) => columns.map((k) => esc(c[k])).join(';'))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `reclami-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(url);
});

// ---------- Dati di esempio ----------

function demoClaims() {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const clients = ['APIS SRL', 'Tessitura Rossi SpA', 'Grafiche Bianchi', 'Adesivi Nord Srl', 'Stampa Veloce', 'Etichette Italia', 'Lanificio Verdi'];
  const products = ['SEP47M 165 G', 'TRF120 90 G', 'ADH33 200 G', 'GRP80 110 G', 'TXL55 140 G', 'SEP47M 120 G'];
  const divisions = ['Industrial Adhesives', 'Industrial Adhesives', 'Graphic Arts', 'Textile'];
  const plants = ['Diatecx (sede / headquarter)', 'Diatecx (sede / headquarter)', 'GAM', 'Carpi', 'Empoli'];
  const problems = ['La carta presenta piega, quindi inutilizzabile.', 'Adesivo non uniforme sul supporto.',
    'Bobina danneggiata durante il trasporto.', 'Grammatura non conforme.', 'Distacco del coating in fase di stampa.'];
  const today = startOfDay(new Date());
  const claims = [];
  for (let i = 1; i <= 140; i++) {
    const date = new Date(today - Math.floor(rand() * rand() * 540) * DAY);
    const age = Math.round((today - date) / DAY);
    let status = 'Aperto';
    if (age > 45 || rand() < age / 60) status = rand() < 0.65 ? 'Chiuso - accolto' : 'Chiuso - respinto';
    else if (rand() < 0.5) status = 'In lavorazione';
    const closeDate = status.startsWith('Chiuso') ? new Date(Math.min(+today, +date + (3 + Math.floor(rand() * 30)) * DAY)) : null;
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const photo = rand() < 0.75 ? 'Sì' : 'No';
    claims.push({
      'ID': `REC-${date.getFullYear()}-${String(i).padStart(4, '0')}`,
      'Ricevuto il': date.toISOString(),
      'Stato': status,
      'Data chiusura': closeDate ? iso(closeDate) : '',
      'Note interne': '',
      'Ragione sociale': pick(clients),
      'Data reclamo': iso(date),
      'Referente': pick(['Sig. Lorenza', 'Ing. Conti', 'Dott.ssa Neri', 'Sig. Galli']),
      'email': 'qualita@example.com',
      'Divisione': pick(divisions),
      'Stabilimento': pick(plants),
      'Articolo': pick(products),
      'Quantità': String(1 + Math.floor(rand() * 40)),
      'Batch nr': `26C00${400 + Math.floor(rand() * 99)}/${1 + Math.floor(rand() * 9)}`,
      'DDT nr': `DDT26VI00${100000 + Math.floor(rand() * 9000)}`,
      'Descrizione problematica': pick(problems),
      'Foto': photo,
      'Campioni': rand() < 0.5 ? 'Sì' : 'No',
      'Richiesta sostituzione': rand() < 0.55 ? 'Sì' : 'No',
    });
  }
  return claims;
}

// ---------- Avvio ----------

try {
  const saved = sessionStorage.getItem(TOKEN_KEY);
  if (saved && window.CLAIMS_API_URL) {
    state.token = saved;
    load().then(showDashboard).catch(() => sessionStorage.removeItem(TOKEN_KEY));
  }
} catch {}
