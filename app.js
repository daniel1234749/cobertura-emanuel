// ---------- State ----------
let rows = [];
let sortKey = 'familia';
let sortDir = 'asc';
let filters = { search: '', familias: new Set(), sucursal: '', estados: new Set() };
let excludedKeys = new Set(); // rows manually removed from the current report/print, not from the data

// ---------- Elements ----------
const tbody = document.getElementById('table-body');
const emptyState = document.getElementById('empty-state');
const rowCountEl = document.getElementById('row-count');
const clockEl = document.getElementById('clock');
const lastUpdatedEl = document.getElementById('last-updated');
const searchInput = document.getElementById('search');
const sucursalSelect = document.getElementById('filter-sucursal');
const btnReset = document.getElementById('btn-reset');
const statButtons = document.querySelectorAll('.stat');
const btnPrint = document.getElementById('btn-print');
const btnExport = document.getElementById('btn-export');
const printTitleEl = document.getElementById('print-title');
const excludedNoteEl = document.getElementById('excluded-note');
const excludedCountEl = document.getElementById('excluded-count');
const btnRestore = document.getElementById('btn-restore');
const themeToggle = document.getElementById('theme-toggle');

const estadoToggle = document.getElementById('estado-toggle');
const estadoPanel = document.getElementById('estado-panel');
const estadoCheckboxes = estadoPanel.querySelectorAll('input[type="checkbox"]');
const estadoDone = document.getElementById('estado-done');

const familiaToggle = document.getElementById('familia-toggle');
const familiaPanel = document.getElementById('familia-panel');
const familiaOptions = document.getElementById('familia-options');
const familiaDone = document.getElementById('familia-done');
const familiaSearch = document.getElementById('familia-search');

// ---------- Theme (dark/light) ----------
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'light' ? '☀️' : '🌙';
  try{ localStorage.setItem('panel-reposicion-theme', theme); }catch(err){ /* ignore */ }
}

function initTheme(){
  let saved = 'dark';
  try{ saved = localStorage.getItem('panel-reposicion-theme') || 'dark'; }catch(err){ /* ignore */ }
  applyTheme(saved);
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
});

initTheme();

// ---------- Clock ----------
function tickClock(){
  const now = new Date();
  clockEl.textContent = now.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}
tickClock();
setInterval(tickClock, 1000);

// ---------- Load data ----------
async function loadData(){
  try{
    const res = await fetch('data.json', { cache: 'no-store' });
    if(!res.ok) throw new Error('No se pudo leer data.json');
    rows = await res.json();

    // El servidor (Live Server o GitHub Pages) informa cuándo se modificó
    // el archivo por última vez, sin que haga falta escribirlo a mano.
    const lastModified = res.headers.get('last-modified');
    if(lastModified){
      const d = new Date(lastModified);
      const stamp = d.toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      lastUpdatedEl.textContent = `Última actualización: ${stamp}`;
    }else{
      lastUpdatedEl.textContent = '';
    }
  }catch(err){
    console.warn('No se pudo cargar data.json (¿estás abriendo el archivo directo, sin servidor? Usá Live Server).', err);
    rows = [];
  }
  init();
}

// ---------- Row identity (for exclude/restore) ----------
function rowKey(r){
  return `${r.codigos}||${r.sucursal}`;
}

// ---------- Init: populate filter dropdowns ----------
function populateSelect(el, values){
  const current = el.value;
  el.innerHTML = '<option value="">' + el.firstElementChild.textContent + '</option>';
  [...new Set(values)].filter(Boolean).sort().forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    el.appendChild(opt);
  });
  el.value = current;
}

function populateFamiliaOptions(values){
  const unique = [...new Set(values)].filter(Boolean).sort();
  familiaOptions.innerHTML = unique.map(v => `
    <label><input type="checkbox" value="${v}" ${filters.familias.has(v) ? 'checked' : ''}> ${v}</label>
  `).join('');
  familiaOptions.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if(cb.checked) filters.familias.add(cb.value);
      else filters.familias.delete(cb.value);
      render();
    });
  });
}

function filterFamiliaOptions(query){
  const q = query.trim().toLowerCase();
  familiaOptions.querySelectorAll('label').forEach(label => {
    const text = label.textContent.trim().toLowerCase();
    label.style.display = text.includes(q) ? 'flex' : 'none';
  });
}

function init(){
  populateFamiliaOptions(rows.map(r => r.familia));
  populateSelect(sucursalSelect, rows.map(r => r.sucursal));
  render();
}

// ---------- Filtering ----------
function estadoKey(estado){
  if(!estado) return '';
  if(estado.startsWith('QUIEBRE')) return 'QUIEBRE';
  if(estado.startsWith('CRITICO')) return 'CRITICO';
  if(estado.startsWith('ALERTA')) return 'ALERTA';
  return 'OK';
}

function applyFilters(data){
  const q = filters.search.trim().toLowerCase();
  return data.filter(r => {
    if(filters.familias.size > 0 && !filters.familias.has(r.familia)) return false;
    if(filters.sucursal && r.sucursal !== filters.sucursal) return false;
    if(filters.estados.size > 0 && !filters.estados.has(estadoKey(r.estado))) return false;
    if(excludedKeys.has(rowKey(r))) return false;
    if(q){
      const hay = `${r.codigos} ${r.productos}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---------- Sorting ----------
function applySort(data){
  const numeric = ['ventas_30dias','stock_actual','stock_centro_distribucion','dias_cobertura_aprox'];

  function getVal(row, key){
    let v = row[key];
    if(numeric.includes(key)){
      return (v === null || v === undefined) ? -Infinity : v;
    }
    return (v ?? '').toString().toLowerCase();
  }

  return [...data].sort((a,b) => {
    // Nivel 1: la columna elegida (por defecto, Familia)
    let va = getVal(a, sortKey), vb = getVal(b, sortKey);
    if(va < vb) return sortDir === 'asc' ? -1 : 1;
    if(va > vb) return sortDir === 'asc' ? 1 : -1;

    // Nivel 2 (desempate): agrupa por familia manteniendo el orden por urgencia
    // (Stock CD, de mayor a menor) dentro de cada grupo, salvo que ya estés
    // ordenando explícitamente por esa misma columna.
    if(sortKey !== 'stock_centro_distribucion'){
      const ca = getVal(a, 'stock_centro_distribucion');
      const cb = getVal(b, 'stock_centro_distribucion');
      if(ca !== cb) return cb - ca;
    }

    // Nivel 3 (último desempate): por producto, para un orden estable y prolijo
    const pa = getVal(a, 'productos'), pb = getVal(b, 'productos');
    if(pa < pb) return -1;
    if(pa > pb) return 1;
    return 0;
  });
}

// ---------- Render ----------
function fmtNum(v){
  if(v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if(Number.isNaN(n)) return '—';
  return n.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

function fmtUxb(v){
  if(v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if(Number.isNaN(n)) return '—';
  return n === 1 ? '1' : n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

function badgeFor(estado){
  const key = estadoKey(estado);
  const map = {
    QUIEBRE: ['badge--quiebre','Quiebre'],
    CRITICO: ['badge--critico','Crítico'],
    ALERTA: ['badge--alerta','Alerta'],
    OK: ['badge--ok','OK']
  };
  const [cls, label] = map[key] || ['badge--ok', estado];
  return `<span class="badge ${cls}">${label}</span>`;
}

function rowColor(estado){
  const key = estadoKey(estado);
  if(key === 'QUIEBRE') return 'var(--red)';
  if(key === 'CRITICO') return 'var(--orange)';
  if(key === 'ALERTA') return 'var(--yellow)';
  return 'transparent';
}

function render(){
  const filtered = applyFilters(rows);
  const sorted = applySort(filtered);

  tbody.innerHTML = sorted.map(r => `
    <tr class="row-flag" style="--row-color:${rowColor(r.estado)}" data-row-key="${rowKey(r)}">
      <td>${badgeFor(r.estado)}</td>
      <td>${r.familia ?? '—'}</td>
      <td class="td-mono">${r.codigos ?? ''}</td>
      <td class="td-producto">${r.productos ?? ''}</td>
      <td class="td-num td-uxb">${fmtUxb(r.uxb)}</td>
      <td>${r.sucursal ?? ''}</td>
      <td class="td-num">${fmtNum(r.ventas_30dias)}</td>
      <td class="td-num ${r.stock_actual < 0 ? 'negative' : ''}">${fmtNum(r.stock_actual)}</td>
      <td class="td-num td-cd">${fmtNum(r.stock_centro_distribucion)}</td>
      <td class="td-num ${r.dias_cobertura_aprox < 0 ? 'negative' : ''}">${fmtNum(r.dias_cobertura_aprox)}</td>
      <td class="td-remove no-print"><button type="button" class="btn-remove" data-remove-key="${rowKey(r)}" title="Quitar del reporte">×</button></td>
    </tr>
  `).join('');

  emptyState.hidden = sorted.length !== 0;
  rowCountEl.textContent = `${sorted.length} fila${sorted.length === 1 ? '' : 's'}`;

  excludedNoteEl.hidden = excludedKeys.size === 0;
  excludedCountEl.textContent = excludedKeys.size;

  updateStats(rows);
  updateSortHeaders();
  updateEstadoToggleLabel();
  updateFamiliaToggleLabel();
}

function updateStats(all){
  const count = key => all.filter(r => estadoKey(r.estado) === key).length;
  document.getElementById('count-quiebre').textContent = count('QUIEBRE');
  document.getElementById('count-critico').textContent = count('CRITICO');
  document.getElementById('count-alerta').textContent = count('ALERTA');
  document.getElementById('count-total').textContent = all.length;

  statButtons.forEach(btn => {
    const val = btn.dataset.filterEstado;
    const active = val === '' ? filters.estados.size === 0 : filters.estados.has(val);
    btn.classList.toggle('is-active', active && val !== '');
  });
}

function updateSortHeaders(){
  document.querySelectorAll('thead th').forEach(th => {
    th.classList.remove('sorted-asc','sorted-desc');
    if(th.dataset.key === sortKey){
      th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }
  });
}

function updateEstadoToggleLabel(){
  const n = filters.estados.size;
  if(n === 0){ estadoToggle.textContent = 'Todos'; return; }
  if(n === 1){
    const labels = { QUIEBRE: 'Quiebre', CRITICO: 'Crítico', ALERTA: 'Alerta' };
    estadoToggle.textContent = labels[[...filters.estados][0]];
    return;
  }
  estadoToggle.textContent = `${n} estados seleccionados`;
}

function updateFamiliaToggleLabel(){
  const n = filters.familias.size;
  if(n === 0){ familiaToggle.textContent = 'Todas'; return; }
  if(n === 1){ familiaToggle.textContent = [...filters.familias][0]; return; }
  familiaToggle.textContent = `${n} familias seleccionadas`;
}

// ---------- Events: basic filters ----------
searchInput.addEventListener('input', e => { filters.search = e.target.value; render(); });
sucursalSelect.addEventListener('change', e => { filters.sucursal = e.target.value; render(); });

btnReset.addEventListener('click', () => {
  filters = { search: '', familias: new Set(), sucursal: '', estados: new Set() };
  searchInput.value = ''; sucursalSelect.value = '';
  estadoCheckboxes.forEach(cb => cb.checked = false);
  populateFamiliaOptions(rows.map(r => r.familia));
  render();
});

// ---------- Events: multi-select familia dropdown ----------
familiaToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  familiaPanel.hidden = !familiaPanel.hidden;
  if(!familiaPanel.hidden) familiaSearch.value = '';
  filterFamiliaOptions('');
});

familiaSearch.addEventListener('input', (e) => filterFamiliaOptions(e.target.value));
familiaSearch.addEventListener('click', (e) => e.stopPropagation());

familiaDone.addEventListener('click', () => {
  familiaPanel.hidden = true;
});

// ---------- Events: multi-select estado dropdown ----------
estadoToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  estadoPanel.hidden = !estadoPanel.hidden;
});

estadoCheckboxes.forEach(cb => {
  cb.addEventListener('change', () => {
    if(cb.checked) filters.estados.add(cb.value);
    else filters.estados.delete(cb.value);
    render();
  });
});

document.addEventListener('click', (e) => {
  if(!estadoPanel.hidden && !e.target.closest('.multiselect')){
    estadoPanel.hidden = true;
  }
  if(!familiaPanel.hidden && !e.target.closest('.multiselect')){
    familiaPanel.hidden = true;
  }
});

document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){
    if(!estadoPanel.hidden) estadoPanel.hidden = true;
    if(!familiaPanel.hidden) familiaPanel.hidden = true;
  }
});

estadoDone.addEventListener('click', () => {
  estadoPanel.hidden = true;
});

// Stat cards toggle membership in the estado set (allows combining, e.g. Crítico + Alerta)
statButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const val = btn.dataset.filterEstado;
    if(val === ''){
      filters.estados.clear();
    }else if(filters.estados.has(val)){
      filters.estados.delete(val);
    }else{
      filters.estados.add(val);
    }
    estadoCheckboxes.forEach(cb => { cb.checked = filters.estados.has(cb.value); });
    render();
  });
});

// ---------- Events: sorting ----------
document.querySelectorAll('thead th[data-key]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    if(sortKey === key){
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    }else{
      sortKey = key;
      sortDir = key === 'productos' || key === 'familia' || key === 'sucursal' || key === 'estado' ? 'asc' : 'desc';
    }
    render();
  });
});

// ---------- Events: exclude / restore rows from the report ----------
tbody.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-remove');
  if(!btn) return;
  excludedKeys.add(btn.dataset.removeKey);
  render();
});

btnRestore.addEventListener('click', () => {
  excludedKeys.clear();
  render();
});

// ---------- Events: export to Excel ----------
function excelNum(v){
  if(v === null || v === undefined || v === '') return '';
  const s = String(v).trim().toUpperCase();
  if(s === 'NULL' || s === '[NULL]' || s === 'NAN' || s === 'UNDEFINED') return '';
  const n = Number(v);
  return Number.isNaN(n) ? '' : n;
}

btnExport.addEventListener('click', () => {
  if(typeof XLSX === 'undefined'){
    alert('No se pudo cargar la librería de exportación (revisá tu conexión a internet).');
    return;
  }

  const filtered = applyFilters(rows);
  const sorted = applySort(filtered);
  const estadoLabels = { QUIEBRE: 'Quiebre', CRITICO: 'Crítico', ALERTA: 'Alerta', OK: 'OK' };

  const data = sorted.map(r => ({
    'Estado': estadoLabels[estadoKey(r.estado)] || r.estado || '',
    'Familia': r.familia ?? '',
    'Código': r.codigos ?? '',
    'Producto': r.productos ?? '',
    'UxB': excelNum(r.uxb),
    'Sucursal': r.sucursal ?? '',
    'Ventas 30d': excelNum(r.ventas_30dias),
    'Stock sucursal': excelNum(r.stock_actual),
    'Stock CD': excelNum(r.stock_centro_distribucion),
    'Días cobertura': excelNum(r.dias_cobertura_aprox)
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 10 }, { wch: 18 }, { wch: 10 }, { wch: 40 }, { wch: 6 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reposición');

  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  XLSX.writeFile(wb, `panel-reposicion-${stamp}.xlsx`);
});

// ---------- Events: print ----------
btnPrint.addEventListener('click', () => {
  const parts = [];
  if(filters.estados.size > 0){
    const labels = { QUIEBRE: 'Quiebre', CRITICO: 'Crítico', ALERTA: 'Alerta' };
    parts.push(`Estado: ${[...filters.estados].map(k => labels[k]).join(' + ')}`);
  }
  if(filters.familias.size > 0) parts.push(`Familia: ${[...filters.familias].join(' + ')}`);
  if(filters.sucursal) parts.push(`Sucursal: ${filters.sucursal}`);
  if(filters.search) parts.push(`Búsqueda: "${filters.search}"`);
  if(excludedKeys.size > 0) parts.push(`${excludedKeys.size} fila(s) excluida(s) manualmente`);
  const filterText = parts.length ? ` — ${parts.join(' · ')}` : ' — todas las filas';
  const now = new Date().toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  printTitleEl.textContent = `Panel de Reposición (${now})${filterText}`;
  window.print();
});

// ---------- Start ----------
loadData();