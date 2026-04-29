/* ═══════════════════════════════════════════
   WAREHOUSE PWA — app.js
   ═══════════════════════════════════════════ */

'use strict';

// ─── STORAGE ────────────────────────────────
const DB = {
  KEY_ENTRIES:   'wh_entries',
  KEY_EMPLOYEES: 'wh_employees',
  KEY_MODELS:    'wh_models',
  KEY_COLORS:    'wh_colors',
  KEY_SIZES:     'wh_sizes',

  load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  save(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }
};

// ─── STATE ──────────────────────────────────
const state = {
  entries:   DB.load(DB.KEY_ENTRIES,   []),
  employees: DB.load(DB.KEY_EMPLOYEES, ['Алина', 'Борис', 'Светлана']),
  models:    DB.load(DB.KEY_MODELS,    ['Модель А', 'Модель Б', 'Модель В']),
  colors:    DB.load(DB.KEY_COLORS,    ['Чёрный', 'Белый', 'Синий', 'Красный', 'Серый']),
  sizes:     DB.load(DB.KEY_SIZES,     ['XS', 'S', 'M', 'L', 'XL', 'XXL', '40', '42', '44', '46', '48', '50']),
  currentTab:    'add',
  currentPeriod: 'today',
  historyFilters: { search: '', employee: '', model: '', size: '', from: '', to: '' }
};

function persist() {
  DB.save(DB.KEY_ENTRIES,   state.entries);
  DB.save(DB.KEY_EMPLOYEES, state.employees);
  DB.save(DB.KEY_MODELS,    state.models);
  DB.save(DB.KEY_COLORS,    state.colors);
  DB.save(DB.KEY_SIZES,     state.sizes);
}

// ─── HELPERS ────────────────────────────────
function normalizeSize(s) { return String(s).trim().toUpperCase(); }

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function fmt(date) {
  return new Date(date).toLocaleString('ru', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

function fmtDate(date) {
  return new Date(date).toLocaleDateString('ru', { day: '2-digit', month: '2-digit' });
}

function groupSum(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const k = keyFn(item);
    map.set(k, (map.get(k) || 0) + Number(item.quantity));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function periodFilter(entries, period) {
  const now = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today   = startOf(now);

  return entries.filter(e => {
    const t = new Date(e.createdAt).getTime();
    if (period === 'today') return t >= today;
    if (period === 'week') {
      const w = new Date(now);
      w.setDate(w.getDate() - 6);
      return t >= startOf(w);
    }
    if (period === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return t >= m;
    }
    return true;
  });
}

function totalQty(entries) { return entries.reduce((s, e) => s + Number(e.quantity), 0); }

// ─── TAB SWITCHING ──────────────────────────
const tabs    = document.querySelectorAll('.tab');
const screens = document.querySelectorAll('.screen');

function switchTab(name) {
  state.currentTab = name;
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  screens.forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));

  if (name === 'history')  renderHistory();
  if (name === 'stats')    renderStats();
  if (name === 'settings') renderSettings();
  updateTopbar();
}

tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

// ─── TOPBAR ─────────────────────────────────
function updateTopbar() {
  document.getElementById('topbar-meta').textContent =
    `${state.entries.length} зап · ${totalQty(state.entries)} шт`;
}

// ─── MODAL ──────────────────────────────────
let modalResolve = null;

function openModal(title, placeholder = '') {
  return new Promise(resolve => {
    modalResolve = resolve;
    document.getElementById('modal-title').textContent  = title;
    document.getElementById('modal-input').value        = '';
    document.getElementById('modal-input').placeholder  = placeholder;
    document.getElementById('modal-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('modal-input').focus(), 50);
  });
}

function closeModal(val) {
  document.getElementById('modal-overlay').classList.add('hidden');
  if (modalResolve) { modalResolve(val); modalResolve = null; }
}

document.getElementById('modal-ok').addEventListener('click', () =>
  closeModal(document.getElementById('modal-input').value.trim()));
document.getElementById('modal-cancel').addEventListener('click', () => closeModal(null));
document.getElementById('modal-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') closeModal(document.getElementById('modal-input').value.trim());
});

// ─── ADD SCREEN ─────────────────────────────
function buildSelect(id, items, placeholder = '— выберите —') {
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach(v => sel.insertAdjacentHTML('beforeend', `<option value="${esc(v)}">${esc(v)}</option>`));
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function buildQuickBtns(containerId, items, inputId) {
  const c = document.getElementById(containerId);
  const inp = document.getElementById(inputId);
  c.innerHTML = '';
  items.forEach(v => {
    const b = document.createElement('button');
    b.className = 'quick-btn';
    b.textContent = v;
    b.type = 'button';
    b.addEventListener('click', () => { inp.value = v; });
    c.appendChild(b);
  });
}

function refreshAddForm() {
  buildSelect('f-employee', state.employees, '— выберите сотрудника —');
  buildSelect('f-model',    state.models,    '— выберите модель —');
  buildQuickBtns('quick-colors', state.colors, 'f-color');
  buildQuickBtns('quick-sizes',  state.sizes,  'f-size');
}

refreshAddForm();

document.getElementById('btn-add-employee').addEventListener('click', async () => {
  const v = await openModal('Новый сотрудник', 'Имя сотрудника');
  if (v && !state.employees.includes(v)) {
    state.employees.push(v);
    persist();
    refreshAddForm();
    document.getElementById('f-employee').value = v;
  }
});

document.getElementById('btn-add-model').addEventListener('click', async () => {
  const v = await openModal('Новая модель', 'Название модели');
  if (v && !state.models.includes(v)) {
    state.models.push(v);
    persist();
    refreshAddForm();
    document.getElementById('f-model').value = v;
  }
});

document.getElementById('btn-save').addEventListener('click', () => {
  const employee = document.getElementById('f-employee').value.trim();
  const model    = document.getElementById('f-model').value.trim();
  const color    = document.getElementById('f-color').value.trim();
  const size     = normalizeSize(document.getElementById('f-size').value);
  const quantity = parseInt(document.getElementById('f-qty').value, 10);
  const note     = document.getElementById('f-note').value.trim();

  if (!employee) { showToast('Выберите сотрудника'); return; }
  if (!model)    { showToast('Выберите модель');     return; }
  if (!size)     { showToast('Укажите размер');      return; }
  if (!quantity || quantity < 1) { showToast('Укажите количество > 0'); return; }

  const entry = { id: genId(), createdAt: new Date().toISOString(), employee, model, color, size, quantity, note };
  state.entries.unshift(entry);
  persist();
  updateTopbar();
  showToast('✓ Сохранено');
  document.getElementById('f-qty').value  = '';
  document.getElementById('f-note').value = '';
  document.getElementById('f-size').value = '';
  document.getElementById('f-color').value = '';
});

document.getElementById('btn-clear').addEventListener('click', () => {
  ['f-employee','f-model','f-color','f-size','f-qty','f-note'].forEach(id => {
    const el = document.getElementById(id);
    el.value = '';
  });
});

function showToast(msg) {
  const area = document.getElementById('toast');
  area.innerHTML = '';
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  area.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

// ─── HISTORY SCREEN ─────────────────────────
function filteredEntries() {
  const { search, employee, model, size, from, to } = state.historyFilters;
  let list = [...state.entries];

  if (employee) list = list.filter(e => e.employee === employee);
  if (model)    list = list.filter(e => e.model    === model);
  if (size)     list = list.filter(e => normalizeSize(e.size) === normalizeSize(size));

  if (from) {
    const f = new Date(from).getTime();
    list = list.filter(e => new Date(e.createdAt).getTime() >= f);
  }
  if (to) {
    const t = new Date(to).getTime() + 86400000;
    list = list.filter(e => new Date(e.createdAt).getTime() < t);
  }

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(e =>
      [e.employee, e.model, e.color, e.size, e.note, String(e.quantity)]
        .some(f => f && String(f).toLowerCase().includes(q))
    );
  }

  return list;
}

function renderHistory() {
  // Fill filter selects
  const empSel   = document.getElementById('h-filter-emp');
  const modelSel = document.getElementById('h-filter-model');
  const sizeSel  = document.getElementById('h-filter-size');

  const preserve = (sel, key) => {
    const cur = sel.value;
    sel.innerHTML = `<option value="">Все ${key === 'emp' ? 'сотрудники' : key === 'model' ? 'модели' : 'размеры'}</option>`;
    return cur;
  };

  const curEmp   = preserve(empSel, 'emp');
  const curModel = preserve(modelSel, 'model');
  const curSize  = preserve(sizeSel, 'size');

  state.employees.forEach(v => empSel.insertAdjacentHTML('beforeend', `<option value="${esc(v)}">${esc(v)}</option>`));
  state.models.forEach(v => modelSel.insertAdjacentHTML('beforeend', `<option value="${esc(v)}">${esc(v)}</option>`));

  // unique sizes from entries
  const allSizes = [...new Set(state.entries.map(e => normalizeSize(e.size)).filter(Boolean))].sort();
  allSizes.forEach(v => sizeSel.insertAdjacentHTML('beforeend', `<option value="${esc(v)}">${esc(v)}</option>`));

  empSel.value   = curEmp;
  modelSel.value = curModel;
  sizeSel.value  = curSize;

  const list = filteredEntries();

  // Summary
  const uniqEmp  = new Set(list.map(e => e.employee)).size;
  const uniqMod  = new Set(list.map(e => e.model)).size;
  const uniqSize = new Set(list.map(e => normalizeSize(e.size))).size;
  const qty      = totalQty(list);

  document.getElementById('history-summary').innerHTML = `
    <div class="summary-card"><div class="summary-val">${list.length}</div><div class="summary-label">Записей</div></div>
    <div class="summary-card"><div class="summary-val">${qty}</div><div class="summary-label">Всего шт</div></div>
    <div class="summary-card"><div class="summary-val">${uniqEmp}</div><div class="summary-label">Сотрудн.</div></div>
    <div class="summary-card"><div class="summary-val">${uniqMod}</div><div class="summary-label">Моделей</div></div>
    <div class="summary-card"><div class="summary-val">${uniqSize}</div><div class="summary-label">Размеров</div></div>
    <div class="summary-card"><div class="summary-val">${uniqSize > 0 ? Math.round(qty / list.length) : 0}</div><div class="summary-label">Ср. кол-во</div></div>
  `;

  // List
  const container = document.getElementById('history-list');
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">📭</span>Нет записей по заданным фильтрам</div>`;
    return;
  }

  container.innerHTML = list.map(e => `
    <div class="entry-card" data-id="${esc(e.id)}">
      <div class="entry-main">
        <div class="entry-top">
          <span class="entry-employee">${esc(e.employee)}</span>
          <span class="entry-model">${esc(e.model)}</span>
        </div>
        <div class="entry-row2">
          <span class="entry-size">${esc(e.size)}</span>
          ${e.color ? `<span class="entry-color">${esc(e.color)}</span>` : ''}
          <span class="entry-qty">× ${e.quantity} шт</span>
        </div>
        ${e.note ? `<div class="entry-note">${esc(e.note)}</div>` : ''}
        <div class="entry-date">${fmt(e.createdAt)}</div>
      </div>
      <div class="entry-actions">
        <button class="btn-delete" data-id="${esc(e.id)}">✕</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Удалить запись?')) {
        state.entries = state.entries.filter(e => e.id !== btn.dataset.id);
        persist();
        updateTopbar();
        renderHistory();
      }
    });
  });
}

// History event listeners
document.getElementById('h-search').addEventListener('input', e => {
  state.historyFilters.search = e.target.value;
  renderHistory();
});
document.getElementById('h-filter-emp').addEventListener('change', e => {
  state.historyFilters.employee = e.target.value;
  renderHistory();
});
document.getElementById('h-filter-model').addEventListener('change', e => {
  state.historyFilters.model = e.target.value;
  renderHistory();
});
document.getElementById('h-filter-size').addEventListener('change', e => {
  state.historyFilters.size = e.target.value;
  renderHistory();
});
document.getElementById('h-date-from').addEventListener('change', e => {
  state.historyFilters.from = e.target.value;
  renderHistory();
});
document.getElementById('h-date-to').addEventListener('change', e => {
  state.historyFilters.to = e.target.value;
  renderHistory();
});
document.getElementById('btn-reset-filters').addEventListener('click', () => {
  state.historyFilters = { search: '', employee: '', model: '', size: '', from: '', to: '' };
  document.getElementById('h-search').value     = '';
  document.getElementById('h-filter-emp').value = '';
  document.getElementById('h-filter-model').value = '';
  document.getElementById('h-filter-size').value = '';
  document.getElementById('h-date-from').value  = '';
  document.getElementById('h-date-to').value    = '';
  renderHistory();
});

// ─── EXPORT / IMPORT ────────────────────────
document.getElementById('btn-export-csv').addEventListener('click', () => {
  const list = filteredEntries();
  const rows = [['ID','Дата','Сотрудник','Модель','Цвет','Размер','Количество','Комментарий']];
  list.forEach(e => rows.push([e.id, e.createdAt, e.employee, e.model, e.color, e.size, e.quantity, e.note]));
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile('warehouse-export.csv', csv, 'text/csv');
});

document.getElementById('btn-export-json').addEventListener('click', () => {
  downloadFile('warehouse-backup.json', JSON.stringify({ entries: state.entries, employees: state.employees, models: state.models, colors: state.colors, sizes: state.sizes }, null, 2), 'application/json');
});

document.getElementById('import-json').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (Array.isArray(data.entries)) {
        if (confirm(`Импортировать ${data.entries.length} записей? Это добавит данные к существующим.`)) {
          const existIds = new Set(state.entries.map(e => e.id));
          data.entries.forEach(e => { if (!existIds.has(e.id)) state.entries.push(e); });
          if (data.employees) state.employees = [...new Set([...state.employees, ...data.employees])];
          if (data.models)    state.models    = [...new Set([...state.models, ...data.models])];
          if (data.colors)    state.colors    = [...new Set([...state.colors, ...data.colors])];
          if (data.sizes)     state.sizes     = [...new Set([...state.sizes, ...data.sizes])];
          persist();
          updateTopbar();
          refreshAddForm();
          renderHistory();
          showToast('✓ Импорт выполнен');
        }
      }
    } catch { showToast('Ошибка чтения файла'); }
    e.target.value = '';
  };
  reader.readAsText(file);
});

function downloadFile(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── STATS SCREEN ───────────────────────────
function renderStats() {
  const entries = periodFilter(state.entries, state.currentPeriod);
  const container = document.getElementById('stats-content');

  if (!entries.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">📊</span>Нет данных за выбранный период</div>`;
    return;
  }

  const qty      = totalQty(entries);
  const uniqEmp  = new Set(entries.map(e => e.employee)).size;
  const uniqMod  = new Set(entries.map(e => e.model)).size;
  const uniqSize = new Set(entries.map(e => normalizeSize(e.size))).size;

  // KPIs
  const kpiHtml = `
    <div class="stat-block">
      <div class="stat-block-title">Общая информация</div>
      <div class="stat-kpi-grid">
        <div class="stat-kpi"><div class="stat-kpi-val">${qty}</div><div class="stat-kpi-label">Всего шт</div></div>
        <div class="stat-kpi"><div class="stat-kpi-val">${entries.length}</div><div class="stat-kpi-label">Записей</div></div>
        <div class="stat-kpi"><div class="stat-kpi-val">${uniqEmp}</div><div class="stat-kpi-label">Сотрудн.</div></div>
        <div class="stat-kpi"><div class="stat-kpi-val">${uniqMod}</div><div class="stat-kpi-label">Моделей</div></div>
        <div class="stat-kpi"><div class="stat-kpi-val">${uniqSize}</div><div class="stat-kpi-label">Размеров</div></div>
        <div class="stat-kpi"><div class="stat-kpi-val">${entries.length ? Math.round(qty/entries.length) : 0}</div><div class="stat-kpi-label">Ср./запись</div></div>
      </div>
    </div>
  `;

  // Bar list helper
  function barList(data, maxVal) {
    return data.map(([label, val]) => `
      <div class="bar-item">
        <div class="bar-label" title="${esc(label)}">${esc(label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(val/maxVal*100)}%"></div></div>
        <div class="bar-val">${val}</div>
      </div>
    `).join('');
  }

  // Top employees
  const topEmp = groupSum(entries, e => e.employee).slice(0, 8);
  const empHtml = `
    <div class="stat-block">
      <div class="stat-block-title">Топ сотрудников</div>
      <div class="bar-list">${topEmp.length ? barList(topEmp, topEmp[0][1]) : '<div class="empty-state">Нет данных</div>'}</div>
    </div>
  `;

  // Top models
  const topModel = groupSum(entries, e => e.model).slice(0, 8);
  const modelHtml = `
    <div class="stat-block">
      <div class="stat-block-title">Топ моделей</div>
      <div class="bar-list">${topModel.length ? barList(topModel, topModel[0][1]) : '<div class="empty-state">Нет данных</div>'}</div>
    </div>
  `;

  // Top sizes
  const topSizes = groupSum(entries, e => normalizeSize(e.size)).slice(0, 15);
  const sizesHtml = `
    <div class="stat-block">
      <div class="stat-block-title">🔥 Топ размеров</div>
      <div class="bar-list">${topSizes.length ? barList(topSizes, topSizes[0][1]) : '<div class="empty-state">Нет данных</div>'}</div>
    </div>
  `;

  // Sizes per model — KEY FEATURE
  const modelNames = [...new Set(entries.map(e => e.model))];
  const modelsSizeHtml = modelNames.map(modelName => {
    const modelEntries = entries.filter(e => e.model === modelName);
    const sizeMap = groupSum(modelEntries, e => normalizeSize(e.size));
    const modelTotal = totalQty(modelEntries);

    const chips = sizeMap.map(([sz, qt]) => `
      <div class="size-chip">
        <div class="size-chip-size">${esc(sz)}</div>
        <div class="size-chip-qty">${qt} шт</div>
      </div>
    `).join('');

    return `<div class="model-sizes-block">
      <div class="model-sizes-header">${esc(modelName)} <span>итого ${modelTotal} шт</span></div>
      <div class="size-chips">${chips}</div>
    </div>`;
  }).join('<div class="model-divider"></div>');

  const sizesPerModelHtml = `
    <div class="stat-block">
      <div class="stat-block-title">Размеры по моделям</div>
      ${modelsSizeHtml || '<div class="empty-state">Нет данных</div>'}
    </div>
  `;

  // Chart: last 14 days
  const chartHtml = buildChartHtml(entries);

  container.innerHTML = kpiHtml + empHtml + modelHtml + sizesHtml + sizesPerModelHtml + chartHtml;
}

function buildChartHtml(entries) {
  const days = 14;
  const now = new Date();
  const dayData = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    const qty = entries.filter(e => {
      const t = new Date(e.createdAt).getTime();
      return t >= d.getTime() && t < next.getTime();
    }).reduce((s, e) => s + Number(e.quantity), 0);
    dayData.push({ label: fmtDate(d), qty });
  }

  const maxQty = Math.max(...dayData.map(d => d.qty), 1);

  const bars = dayData.map(d => {
    const h = Math.round((d.qty / maxQty) * 72);
    return `
      <div class="chart-bar-wrap" title="${d.label}: ${d.qty} шт">
        <div class="chart-bar" style="height:${h}px"></div>
        <div class="chart-day-label">${d.label.split('.')[0]}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="stat-block">
      <div class="stat-block-title">Динамика (последние ${days} дней)</div>
      <div class="chart-wrap">
        <div class="chart-canvas-area">${bars}</div>
      </div>
    </div>
  `;
}

// Period buttons
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentPeriod = btn.dataset.period;
    renderStats();
  });
});

// ─── SETTINGS SCREEN ────────────────────────
function renderSettings() {
  renderTagEditor('colors-editor',    state.colors,    'colors');
  renderTagEditor('sizes-editor',     state.sizes,     'sizes');
  renderTagEditor('employees-editor', state.employees, 'employees');
  renderTagEditor('models-editor',    state.models,    'models');
}

function renderTagEditor(containerId, arr, key) {
  const c = document.getElementById(containerId);
  c.innerHTML = arr.map((v, i) => `
    <div class="tag-item">
      <span>${esc(v)}</span>
      <button class="tag-remove" data-key="${key}" data-idx="${i}">×</button>
    </div>
  `).join('');

  c.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.key;
      const i = parseInt(btn.dataset.idx, 10);
      state[k].splice(i, 1);
      persist();
      refreshAddForm();
      renderTagEditor(containerId, state[k], k);
    });
  });
}

function addTagFromInput(inputId, stateKey, editorId) {
  const inp = document.getElementById(inputId);
  const v = inp.value.trim();
  if (!v) return;
  if (!state[stateKey].includes(v)) {
    state[stateKey].push(v);
    persist();
    refreshAddForm();
    renderTagEditor(editorId, state[stateKey], stateKey);
  }
  inp.value = '';
}

document.getElementById('btn-add-color').addEventListener('click', () => addTagFromInput('new-color', 'colors', 'colors-editor'));
document.getElementById('btn-add-size').addEventListener('click',  () => addTagFromInput('new-size',  'sizes',  'sizes-editor'));
document.getElementById('btn-add-employee-s').addEventListener('click', () => addTagFromInput('new-employee', 'employees', 'employees-editor'));
document.getElementById('btn-add-model-s').addEventListener('click', () => addTagFromInput('new-model', 'models', 'models-editor'));

['new-color','new-size','new-employee','new-model'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const map = { 'new-color': ['colors','colors-editor'], 'new-size': ['sizes','sizes-editor'],
                  'new-employee': ['employees','employees-editor'], 'new-model': ['models','models-editor'] };
    const [k, editor] = map[id];
    addTagFromInput(id, k, editor);
  });
});

document.getElementById('btn-clear-all').addEventListener('click', () => {
  if (confirm(`Удалить ВСЕ ${state.entries.length} записей? Это действие необратимо.`)) {
    state.entries = [];
    persist();
    updateTopbar();
    showToast('Все записи удалены');
  }
});

// ─── PWA INSTALL BANNER ──────────────────────
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  const banner = document.createElement('div');
  banner.className = 'install-banner';
  banner.innerHTML = `
    <span>📦 Установить приложение</span>
    <div class="install-banner-btns">
      <button class="banner-btn" id="banner-install">Установить</button>
      <button class="banner-btn" id="banner-dismiss">✕</button>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById('banner-install').addEventListener('click', async () => {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    banner.remove();
    deferredPrompt = null;
  });

  document.getElementById('banner-dismiss').addEventListener('click', () => banner.remove());
});

// ─── SERVICE WORKER ──────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ─── INIT ────────────────────────────────────
updateTopbar();
