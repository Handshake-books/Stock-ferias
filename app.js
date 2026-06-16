/* ══════════════════════════════════════════════════════════
   CALCULADORA STOCK FERIAS v10 — reescritura limpia
══════════════════════════════════════════════════════════ */

const STATE = { catalogo: [], ferias: [], feriaId: null };

const TIPOS = {
  postal: { label: 'Caja postal',     nombreBase: 'Caja',   limite: 10, headClass: 'postal',
    hint: 'Por debajo de 10 kg accedes a tarifas de paquete estándar. A partir de ahí el precio sube de forma significativa.' },
  avion:  { label: 'Maleta de avión', nombreBase: 'Maleta', limite: 23, headClass: 'avion',
    hint: 'El límite habitual de equipaje facturado es 23 kg. Recuerda incluir el peso de la maleta vacía.' },
};

// ─────────────────────────────────────────────
// PERSISTENCIA
// ─────────────────────────────────────────────
function guardar() {
  localStorage.setItem('sfv10_catalogo', JSON.stringify(STATE.catalogo));
  localStorage.setItem('sfv10_ferias',   JSON.stringify(STATE.ferias));
}
function cargar() {
  try {
    const c = localStorage.getItem('sfv10_catalogo');
    const f = localStorage.getItem('sfv10_ferias');
    if (c) STATE.catalogo = JSON.parse(c);
    if (f) STATE.ferias   = JSON.parse(f);
  } catch(e) { console.warn(e); }
}

// ─────────────────────────────────────────────
// FORMATO
// ─────────────────────────────────────────────
function fmtN(n, dec) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
const fmtE   = n => fmtN(n, 2) + '\u00a0€';
const fmtKg  = n => fmtN(n, 2) + '\u00a0kg';
const fmtUds = n => fmtN(n, 0) + '\u00a0uds.';
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// ─────────────────────────────────────────────
// CÁLCULOS — fuente única de verdad
// ─────────────────────────────────────────────
function feriaActiva()  { return STATE.ferias.find(f => f.id === STATE.feriaId) || null; }
function catById(id)    { return STATE.catalogo.find(p => p.id === id) || null; }

function calcStock(feria) {
  let uds = 0, valor = 0, pesoKg = 0;
  (feria.stock||[]).forEach(s => {
    uds    += s.qty;
    valor  += s.precio * s.qty;
    pesoKg += s.pesoKg * s.qty;
  });
  return { uds, valor, pesoKg };
}

// Total de unidades asignadas de un stock item en TODOS los paquetes
function totalAsignado(feria, stockId) {
  return (feria.paquetes||[]).reduce((sum, p) =>
    sum + ((p.asignaciones||{})[stockId]||0), 0);
}

// Unidades sin asignar a ningún paquete (global)
function sinAsignarItem(feria, stockId) {
  const s = (feria.stock||[]).find(x => x.id === stockId);
  if (!s) return 0;
  return Math.max(0, s.qty - totalAsignado(feria, stockId));
}

function calcPaquete(feria, paq) {
  let pesoKg = 0, valor = 0, uds = 0;
  const asig = paq.asignaciones||{};
  (feria.stock||[]).forEach(s => {
    const q = asig[s.id]||0;
    pesoKg += s.pesoKg * q;
    valor  += s.precio * q;
    uds    += q;
  });
  const pesoVacio = parseFloat(paq.pesoVacioKg)||0;
  return { pesoContenido: pesoKg, pesoTotal: pesoKg + pesoVacio, valor, uds };
}

function stockSinAsignar(feria) {
  return (feria.stock||[])
    .map(s => ({ ...s, sinAsignar: sinAsignarItem(feria, s.id) }))
    .filter(s => s.sinAsignar > 0);
}

function catalogoDisponible(feria) {
  const enStock = new Set((feria.stock||[]).map(s => s.catalogoId));
  return STATE.catalogo.filter(p => !enStock.has(p.id));
}

function nombrePaquete(feria, paq) {
  const tipo = TIPOS[paq.tipo]||TIPOS.postal;
  const idx  = (feria.paquetes||[])
    .filter(p => p.tipo === paq.tipo)
    .findIndex(p => p.id === paq.id);
  return `${tipo.nombreBase} ${idx + 1}`;
}

// ─────────────────────────────────────────────
// SPINNERS — repetición continua y Shift×10
// ─────────────────────────────────────────────
function attachSpin(btn, getVal, setVal) {
  let timer = null, fast = null;

  function stop() {
    clearTimeout(timer);
    clearInterval(fast);
    timer = fast = null;
  }

  function step(e) {
    const shift  = e && e.shiftKey ? 10 : 1;
    const delta  = parseInt(btn.dataset.spin || btn.dataset.rspin) * shift;
    const newVal = Math.max(0, (parseInt(getVal())||0) + delta);
    setVal(newVal);
    return delta;
  }

  btn.addEventListener('mousedown', e => {
    e.preventDefault();
    const delta = step(e);
    // Repetición: arrancar después de 380ms, luego cada 80ms
    timer = setTimeout(() => {
      fast = setInterval(() => {
        const newVal = Math.max(0, (parseInt(getVal())||0) + delta);
        setVal(newVal);
      }, 80);
    }, 380);
  });
  btn.addEventListener('touchstart', e => {
    e.preventDefault();
    step(e);
    const delta = parseInt(btn.dataset.spin || btn.dataset.rspin);
    timer = setTimeout(() => {
      fast = setInterval(() => {
        const newVal = Math.max(0, (parseInt(getVal())||0) + delta);
        setVal(newVal);
      }, 80);
    }, 380);
  }, { passive: false });

  ['mouseup','mouseleave','touchend','touchcancel'].forEach(ev =>
    btn.addEventListener(ev, stop));
}

function attachKeyboard(inp, setVal) {
  inp.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const step  = e.shiftKey ? 10 : 1;
    const delta = e.key === 'ArrowUp' ? step : -step;
    setVal(Math.max(0, (parseInt(inp.value)||0) + delta));
  });
  inp.addEventListener('change', e =>
    setVal(Math.max(0, parseInt(e.target.value)||0)));
}

// ─────────────────────────────────────────────
// ACTUALIZACIONES DOM PARCIALES
// Estas funciones modifican solo los elementos calculados sin destruir el DOM
// ─────────────────────────────────────────────

// Actualiza columna "sin repartir" en la tabla de stock
function actualizarCeldasSinRep(feria) {
  (feria.stock||[]).forEach(s => {
    const sinRep = sinAsignarItem(feria, s.id);
    const el = document.querySelector(`[data-sinrep="${s.id}"]`);
    if (!el) return;
    const cls  = sinRep === 0 ? 'ok' : sinRep === s.qty ? 'bad' : 'warn';
    const text = sinRep === 0 ? '✓' : String(sinRep);
    el.className  = `cell-sinrep ${cls}`;
    el.textContent = text;
  });
}

// Actualiza columna "sin repartir" en TODOS los paquetes visibles del DOM
function actualizarProgresiones(feria) {
  (feria.stock||[]).forEach(s => {
    const sinRep   = sinAsignarItem(feria, s.id);
    const overItem = totalAsignado(feria, s.id) > s.qty;
    const cls  = overItem ? 'over' : sinRep === 0 ? 'ok' : 'warn';
    const text = overItem ? '⚠' : sinRep === 0 ? '✓' : String(sinRep);

    document.querySelectorAll(`[data-prog-sid="${s.id}"]`).forEach(el => {
      el.className  = `reparto-progress ${cls}`;
      el.textContent = text;
    });
  });
}

// Actualiza la cabecera y barra de peso de UN paquete en el DOM
function actualizarCabeceraPaquete(feria, paq, block) {
  if (!block) return;
  const stats  = calcPaquete(feria, paq);
  const limite = parseFloat(paq.limiteKg)||null;
  const over   = limite && stats.pesoTotal > limite;
  const near   = limite && !over && stats.pesoTotal/limite > 0.85;
  const barC   = over ? 'var(--red)' : near ? 'var(--orange)' : 'var(--green)';

  // Peso y valor en cabecera
  const statVals = block.querySelectorAll('.co-head-stat-val');
  if (statVals[0]) { statVals[0].textContent = fmtKg(stats.pesoTotal); statVals[0].style.color = barC; }
  if (statVals[1]) statVals[1].textContent = fmtE(stats.valor);

  // Badge de estado
  let badgeText = '', badgeClass = '';
  if (over)        { badgeText = '⚠ Sobrepeso';    badgeClass = 'over'; }
  else if (near)   { badgeText = '⚠ Casi lleno';   badgeClass = 'warn'; }
  else if (limite) { badgeText = '✓ Espacio libre'; badgeClass = 'ok'; }

  let badge = block.querySelector('.co-status-badge');
  if (badgeText) {
    if (!badge) {
      badge = document.createElement('span');
      const removeBtn = block.querySelector('.co-head-remove');
      removeBtn?.parentNode.insertBefore(badge, removeBtn);
    }
    badge.className  = `co-status-badge ${badgeClass}`;
    badge.textContent = badgeText;
  } else if (badge) {
    badge.remove();
  }

  // Barra de peso
  if (limite) {
    const pct = Math.min((stats.pesoTotal/limite)*100, 100);
    const fill = block.querySelector('.bar-fill');
    if (fill) { fill.style.width = pct+'%'; fill.style.background = barC; }

    const barVal = block.querySelector('.co-bar-value');
    if (barVal) { barVal.textContent = fmtKg(stats.pesoTotal)+' / '+fmtKg(limite); barVal.style.color = barC; }

    const barLabel = block.querySelector('.co-bar-label');
    if (barLabel) barLabel.textContent = over ? '⚠ Sobrepeso' : near ? 'Casi en el límite' : 'Peso del paquete';

    const spans = block.querySelectorAll('.co-bar-labels span');
    if (spans[1]) spans[1].textContent = !over ? fmtKg(limite-stats.pesoTotal)+' libres' : '';
  }
}

// ─────────────────────────────────────────────
// NAVEGACIÓN
// ─────────────────────────────────────────────
function cambiarVista(vista) {
  document.querySelectorAll('.view').forEach(v =>
    v.classList.toggle('hidden', v.id !== `view-${vista}`));
  document.querySelectorAll('.nav-btn[data-view]').forEach(b =>
    b.classList.toggle('active', b.dataset.view === vista));
  if (vista === 'catalogo') renderCatalogo();
  if (vista === 'ferias')   renderDetalle();
}

// ─────────────────────────────────────────────
// RENDER: Lista ferias
// ─────────────────────────────────────────────
function renderFeriasList() {
  const list  = document.getElementById('ferias-list');
  const empty = document.getElementById('ferias-empty');
  list.innerHTML = '';

  if (!STATE.ferias.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  [...STATE.ferias].sort((a,b) => b.id.localeCompare(a.id)).forEach(f => {
    const calc   = calcStock(f);
    const hasSt  = (f.stock||[]).length > 0;
    const hasPaq = (f.paquetes||[]).length > 0;
    const sinA   = hasSt ? stockSinAsignar(f) : [];
    const allOk  = hasSt && hasPaq && sinA.length === 0;

    const div = document.createElement('div');
    div.className = 'feria-item' + (f.id === STATE.feriaId ? ' active' : '');
    div.innerHTML = `
      <div class="feria-item-name">${esc(f.nombre)||'Sin nombre'}</div>
      <div class="feria-item-meta">${fmtE(calc.valor)}</div>
      <div class="feria-item-status">
        <div class="status-dot ${hasSt?'done':''}"></div>
        <div class="status-dot ${hasPaq?'done':''}"></div>
        <div class="status-dot ${allOk?'done':hasPaq?'partial':''}"></div>
      </div>`;
    div.addEventListener('click', () => seleccionarFeria(f.id));
    list.appendChild(div);
  });
}

// ─────────────────────────────────────────────
// RENDER: Detalle completo
// ─────────────────────────────────────────────
function renderDetalle() {
  const feria = feriaActiva();
  const hasF  = !!feria;

  document.getElementById('detail-empty').classList.toggle('hidden', hasF);
  document.getElementById('col-stock-content').classList.toggle('hidden', !hasF);
  document.getElementById('col-reparto-content').classList.toggle('hidden', !hasF);
  document.getElementById('reparto-empty-global').classList.toggle('hidden', hasF);

  if (!feria) return;

  document.getElementById('feria-nombre').value   = feria.nombre   || '';
  document.getElementById('feria-objetivo').value = feria.objetivo || '';

  renderKPIs(feria);
  renderStockTabla(feria);
  renderPaquetes(feria);
  renderChecklist(feria);
}

// ─────────────────────────────────────────────
// RENDER: KPIs
// ─────────────────────────────────────────────
function renderKPIs(feria) {
  const c   = calcStock(feria);
  const obj = parseFloat(feria.objetivo);

  document.getElementById('kpi-uds').textContent   = fmtUds(c.uds);
  document.getElementById('kpi-valor').textContent = fmtE(c.valor);
  document.getElementById('kpi-peso').textContent  = fmtKg(c.pesoKg);

  const ratioEl = document.getElementById('kpi-ratio');
  const alerta  = document.getElementById('alerta-ratio');

  if (obj > 0) {
    const r = c.valor / obj;
    ratioEl.textContent = fmtN(r, 2) + '×';
    ratioEl.className   = 'kpi-value ' + (r > 2 ? 'red' : r > 1.5 ? 'orange' : 'green');
    if (r > 2) {
      alerta.classList.remove('hidden');
      alerta.textContent = `⚠ El stock (${fmtE(c.valor)}) supera el doble del objetivo (${fmtE(obj)}). El coste de enviarlo de vuelta puede comerse el margen.`;
    } else {
      alerta.classList.add('hidden');
    }
  } else {
    ratioEl.textContent = '—';
    ratioEl.className   = 'kpi-value';
    alerta.classList.add('hidden');
  }
}

// ─────────────────────────────────────────────
// RENDER: Tabla de stock
// ─────────────────────────────────────────────
function renderStockTabla(feria) {
  const tbody   = document.getElementById('stock-tbody');
  const empty   = document.getElementById('stock-empty');
  const headers = document.getElementById('stock-headers');
  const blocked = document.getElementById('stock-blocked');
  const addBtn  = document.getElementById('btn-add-stock');
  tbody.innerHTML = '';

  if (!STATE.catalogo.length) {
    blocked.classList.remove('hidden');
    headers.style.display = 'none';
    empty.classList.add('hidden');
    addBtn.style.display  = 'none';
    return;
  }
  blocked.classList.add('hidden');
  addBtn.style.display = '';

  if (!(feria.stock||[]).length) {
    empty.classList.remove('hidden');
    headers.style.display = 'none';
    actualizarSelectStock(feria);
    return;
  }

  empty.classList.add('hidden');
  headers.style.display = 'grid';

  (feria.stock||[]).forEach(s => {
    const sinRep   = sinAsignarItem(feria, s.id);
    const sinClass = sinRep === 0 ? 'ok' : sinRep === s.qty ? 'bad' : 'warn';
    const sinText  = sinRep === 0 ? '✓' : String(sinRep);

    const row = document.createElement('div');
    row.className = 'stock-row';
    row.innerHTML = `
      <div class="cell-name">
        <span title="${esc(s.nombre)}">${esc(s.nombre)}</span>
      </div>
      <div class="cell-num-wrap">
        <button class="spin-btn" data-spin="-1">−</button>
        <input class="spin-input" type="number" min="0" value="${s.qty}" />
        <button class="spin-btn" data-spin="1">+</button>
      </div>
      <div class="cell-readonly" data-calc-valor="${s.id}">${fmtE(s.precio * s.qty)}</div>
      <div class="cell-readonly muted" data-calc-peso="${s.id}">${fmtKg(s.pesoKg * s.qty)}</div>
      <div class="cell-sinrep ${sinClass}" data-sinrep="${s.id}">${sinText}</div>
      <button class="row-remove" data-remove-sid="${s.id}" title="Quitar">✕</button>`;
    tbody.appendChild(row);

    const inp  = row.querySelector('.spin-input');
    const getV = () => inp.value;
    const setV = v => {
      inp.value = v;
      actualizarCampoStock(s.id, 'qty', v);
    };
    row.querySelectorAll('[data-spin]').forEach(btn => attachSpin(btn, getV, setV));
    attachKeyboard(inp, setV);
    row.querySelector('[data-remove-sid]').addEventListener('click', () => quitarStock(s.id));
  });

  actualizarSelectStock(feria);
}

// ─────────────────────────────────────────────
// RENDER: Paquetes
// ─────────────────────────────────────────────
function renderPaquetes(feria) {
  const wrap    = document.getElementById('contenedores-wrap');
  const blocked = document.getElementById('reparto-blocked');
  const addBtn  = document.getElementById('btn-add-contenedor');
  wrap.innerHTML = '';

  const hasStock = (feria.stock||[]).length > 0;
  blocked.classList.toggle('hidden', hasStock);
  addBtn.style.display = hasStock ? '' : 'none';
  if (!hasStock) return;

  (feria.paquetes||[]).forEach(paq => wrap.appendChild(buildPaquete(feria, paq)));
}

function buildPaquete(feria, paq) {
  const tipo   = TIPOS[paq.tipo]||TIPOS.postal;
  const stats  = calcPaquete(feria, paq);
  const limite = parseFloat(paq.limiteKg)||null;
  const over   = limite && stats.pesoTotal > limite;
  const near   = limite && !over && stats.pesoTotal/limite > 0.85;
  const barC   = over ? 'var(--red)' : near ? 'var(--orange)' : 'var(--green)';
  const isOpen = paq.open !== false;
  const nombre = nombrePaquete(feria, paq);

  let badgeText = '', badgeClass = '';
  if (over)        { badgeText = '⚠ Sobrepeso';    badgeClass = 'over'; }
  else if (near)   { badgeText = '⚠ Casi lleno';   badgeClass = 'warn'; }
  else if (limite) { badgeText = '✓ Espacio libre'; badgeClass = 'ok'; }

  // Filas de reparto
  const repartoRows = (feria.stock||[]).map(s => {
    const enEste  = (paq.asignaciones||{})[s.id]||0;
    const totAsig = totalAsignado(feria, s.id);
    const sinRep  = Math.max(0, s.qty - totAsig);
    const over_   = totAsig > s.qty;
    const cls     = over_ ? 'over' : sinRep === 0 ? 'ok' : 'warn';
    const text    = over_ ? '⚠' : sinRep === 0 ? '✓' : String(sinRep);

    // maxPerm = máximo que puede ir en este paquete sin superar el stock total
    const enOtros = totAsig - enEste;
    const maxPerm = Math.max(0, s.qty - enOtros);

    return `<div class="reparto-row">
      <div class="reparto-name" title="${esc(s.nombre)}">${esc(s.nombre)}</div>
      <div class="cell-num-wrap" style="height:30px">
        <button class="spin-btn" data-rspin="-1">−</button>
        <input class="spin-input" type="number" min="0" max="${maxPerm}" value="${enEste}" />
        <button class="spin-btn" data-rspin="1">+</button>
      </div>
      <div class="reparto-progress ${cls}" data-prog-sid="${s.id}">${text}</div>
    </div>`;
  }).join('');

  const block = document.createElement('div');
  block.className = 'contenedor-block';
  block.dataset.paqid = paq.id;

  block.innerHTML = `
    <div class="co-head">
      <div class="co-toggle-zone" data-toggle="${paq.id}">
        <span class="co-toggle-arrow ${isOpen?'open':''}">▶</span>
        <div style="min-width:0">
          <div class="co-head-name">${nombre}</div>
          <div class="co-head-tipo">${tipo.label}</div>
        </div>
      </div>
      <div class="co-head-stats">
        <div class="co-head-stat">
          <div class="co-head-stat-val" style="color:${barC}">${fmtKg(stats.pesoTotal)}</div>
          <div class="co-head-stat-label">Peso total</div>
        </div>
        <div class="co-head-stat">
          <div class="co-head-stat-val">${fmtE(stats.valor)}</div>
          <div class="co-head-stat-label">Valor</div>
        </div>
      </div>
      ${badgeText ? `<span class="co-status-badge ${badgeClass}">${badgeText}</span>` : ''}
      <button class="co-head-remove" data-paqid="${paq.id}" title="Eliminar paquete">✕</button>
    </div>

    <div class="co-body ${isOpen?'open':''}">
      <div class="co-config">
        <div class="tipo-row">
          <span class="tipo-label-txt">Tipo</span>
          <button class="tipo-btn ${paq.tipo==='postal'?'sel-postal':''}" data-tipo="postal" data-paqid="${paq.id}">📦 Caja postal</button>
          <button class="tipo-btn ${paq.tipo==='avion'?'sel-avion':''}"  data-tipo="avion"  data-paqid="${paq.id}">✈ Maleta de avión</button>
        </div>
        <div class="tipo-hint">${tipo.hint}</div>
        <div class="co-peso-inline">
          <div class="meta-chip">
            <span class="meta-chip-label">Peso vacío</span>
            <input type="number" min="0" step="0.1" value="${paq.pesoVacioKg||0}" data-field-paq="pesoVacioKg" data-paqid="${paq.id}" />
            <span class="meta-chip-label">kg</span>
          </div>
          <div class="meta-chip">
            <span class="meta-chip-label">Límite</span>
            <input type="number" min="0" step="0.5" value="${paq.limiteKg||''}" placeholder="${tipo.limite}" data-field-paq="limiteKg" data-paqid="${paq.id}" />
            <span class="meta-chip-label">kg</span>
          </div>
        </div>
      </div>

      ${limite ? `
      <div class="co-peso-bar-wrap">
        <div class="co-bar-header">
          <span class="co-bar-label">${over?'⚠ Sobrepeso':near?'Casi en el límite':'Peso del paquete'}</span>
          <span class="co-bar-value" style="color:${barC}">${fmtKg(stats.pesoTotal)} / ${fmtKg(limite)}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${Math.min((stats.pesoTotal/limite)*100,100)}%;background:${barC}"></div>
        </div>
        <div class="co-bar-labels">
          <span>0 kg</span>
          <span>${!over?fmtKg(limite-stats.pesoTotal)+' libres':''}</span>
          <span>Límite ${fmtKg(limite)}</span>
        </div>
      </div>` : ''}

      <div class="co-reparto">
        <div class="reparto-col-headers">
          <span>Título</span>
          <span>Uds. en este paquete</span>
          <span>Sin repartir</span>
        </div>
        ${repartoRows}
      </div>
    </div>`;

  // ── Eventos del bloque ──

  // Toggle colapsar/expandir
  block.querySelector('[data-toggle]').addEventListener('click', () => {
    const f = feriaActiva();
    const p = f?.paquetes.find(x => x.id === paq.id);
    if (!p) return;
    p.open = !p.open;
    guardar();
    block.querySelector('.co-toggle-arrow').classList.toggle('open', p.open);
    block.querySelector('.co-body').classList.toggle('open', p.open);
  });

  // Tipo de paquete
  block.querySelectorAll('[data-tipo]').forEach(btn =>
    btn.addEventListener('click', e => {
      const f = feriaActiva();
      const p = f?.paquetes.find(x => x.id === e.target.dataset.paqid);
      if (!p) return;
      p.tipo     = e.target.dataset.tipo;
      p.limiteKg = TIPOS[p.tipo].limite;
      guardar();
      // Re-render solo este paquete (tipo cambia mucho del layout)
      const newBlock = buildPaquete(f, p);
      block.replaceWith(newBlock);
      renderChecklist(f);
      renderFeriasList();
    }));

  // Peso vacío y límite
  block.querySelectorAll('[data-field-paq]').forEach(inp =>
    inp.addEventListener('change', e => {
      const f = feriaActiva();
      const p = f?.paquetes.find(x => x.id === e.target.dataset.paqid);
      if (!p) return;
      const val = parseFloat(e.target.value);
      p[e.target.dataset.fieldPaq] = isNaN(val) ? null : val;
      guardar();
      actualizarCabeceraPaquete(f, p, block);
      renderChecklist(f);
    }));

  // Spinners de reparto — SIN re-render del DOM
  block.querySelectorAll('.reparto-row').forEach((row, rowIdx) => {
    const inp    = row.querySelector('.spin-input');
    const s      = feria.stock[rowIdx]; // mismo orden que repartoRows
    if (!s || !inp) return;

    const applyRasig = rawVal => {
      const f = feriaActiva(); if (!f) return;
      const p = f.paquetes.find(x => x.id === paq.id); if (!p) return;
      const st = f.stock.find(x => x.id === s.id); if (!st) return;
      if (!p.asignaciones) p.asignaciones = {};

      // Calcular límite real: stock total menos lo asignado en OTROS paquetes
      const enOtros = (f.paquetes||[])
        .filter(x => x.id !== p.id)
        .reduce((sum, x) => sum + ((x.asignaciones||{})[st.id]||0), 0);
      const maxPerm = Math.max(0, st.qty - enOtros);
      const finalVal = Math.max(0, Math.min(rawVal, maxPerm));

      p.asignaciones[st.id] = finalVal;
      inp.value = finalVal;
      guardar();

      // Actualizar UI sin re-render:
      renderKPIs(f);                       // KPIs globales
      actualizarCeldasSinRep(f);           // col "sin repartir" en tabla stock
      actualizarProgresiones(f);           // col "sin repartir" en TODOS los paquetes
      actualizarCabeceraPaquete(f, p, block); // cabecera + barra de este paquete
      renderChecklist(f);
      renderFeriasList();
    };

    const getV = () => inp.value;
    row.querySelectorAll('[data-rspin]').forEach(btn => attachSpin(btn, getV, applyRasig));
    attachKeyboard(inp, applyRasig);
  });

  // Eliminar paquete
  block.querySelector('[data-paqid].co-head-remove').addEventListener('click', e => {
    e.stopPropagation();
    if (!confirm('¿Eliminar este paquete? Las asignaciones se perderán.')) return;
    const f = feriaActiva(); if (!f) return;
    f.paquetes = f.paquetes.filter(x => x.id !== paq.id);
    // Limpiar asignaciones del paquete eliminado no es necesario (ya no existe)
    guardar();
    renderPaquetes(f);
    actualizarCeldasSinRep(f);
    renderChecklist(f);
    renderFeriasList();
  });

  return block;
}

// ─────────────────────────────────────────────
// RENDER: Checklist de estado
// ─────────────────────────────────────────────
function renderChecklist(feria) {
  const card = document.getElementById('checklist-card');
  const rows = document.getElementById('checklist-rows');
  if (!feria) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');

  const calc   = calcStock(feria);
  const hasSt  = (feria.stock||[]).length > 0;
  const hasPaq = (feria.paquetes||[]).length > 0;
  const sinA   = stockSinAsignar(feria);
  const obj    = parseFloat(feria.objetivo);
  const ratio  = obj > 0 ? calc.valor / obj : null;
  const overW  = (feria.paquetes||[]).some(p => {
    const l = parseFloat(p.limiteKg);
    return l > 0 && calcPaquete(feria, p).pesoTotal > l;
  });

  const items = [];

  // Stock
  if (!hasSt) {
    items.push({ status:'idle', icon:'○', label:'Sin stock definido', detail:'Añade títulos en la fase 1' });
  } else {
    items.push({ status:'ok', icon:'✓', label:'Stock definido', detail:`${fmtUds(calc.uds)} · ${fmtE(calc.valor)} · ${fmtKg(calc.pesoKg)}` });
  }

  // Ratio stock / objetivo
  if (ratio !== null) {
    const exceso = calc.valor - obj;
    if (ratio > 2) {
      const exEuro = fmtE(calc.valor - obj * 2);
      items.push({ status:'bad', icon:'⚠',
        label:`Stock ${fmtN(ratio,2)}× el objetivo — ${exEuro} de exceso`,
        detail:'Si no lo vendes todo, ese exceso es lo mínimo que pagarás de vuelta' });
    } else if (ratio > 1.5) {
      items.push({ status:'warn', icon:'⚠',
        label:`Stock ${fmtN(ratio,2)}× el objetivo — algo alto`,
        detail:`Llevas ${fmtE(exceso)} más de lo que esperas vender` });
    } else if (ratio >= 0.8) {
      items.push({ status:'ok', icon:'✓',
        label:`Buen equilibrio — ${fmtN(ratio,2)}× el objetivo`,
        detail:`${fmtE(exceso > 0 ? exceso : 0)} de margen sobre el objetivo` });
    } else {
      items.push({ status:'warn', icon:'⚠',
        label:`Stock bajo — solo el ${Math.round(ratio*100)}% del objetivo`,
        detail:`Puede que no tengas suficiente para cubrir la demanda` });
    }
  } else {
    items.push({ status:'idle', icon:'○',
      label:'Sin objetivo de ventas', detail:'Introdúcelo para calibrar cuánto stock llevar' });
  }

  // Paquetes
  if (!hasPaq) {
    items.push({ status:'idle', icon:'○', label:'Sin paquetes creados', detail:'Añade paquetes en la fase 2' });
  } else {
    items.push({ status:'ok', icon:'✓', label:`${feria.paquetes.length} paquete${feria.paquetes.length!==1?'s':''} creados`, detail:'' });
  }

  // Asignación
  if (hasPaq && hasSt) {
    if (sinA.length === 0) {
      items.push({ status:'ok', icon:'✓', label:'Todas las unidades repartidas', detail:'Listo para imprimir' });
    } else {
      const totalSA = sinA.reduce((s,x) => s + x.sinAsignar, 0);
      items.push({ status:'warn', icon:'⚠',
        label:`${fmtUds(totalSA)} sin asignar a ningún paquete`,
        detail: sinA.slice(0,3).map(s=>`${s.nombre}: ${s.sinAsignar}`).join(' · ') + (sinA.length>3?'…':'') });
    }
  }

  // Sobrepeso
  if (overW) {
    items.push({ status:'bad', icon:'⚠', label:'Algún paquete supera su límite de peso', detail:'Revisa los paquetes marcados en rojo' });
  } else if (hasPaq) {
    items.push({ status:'ok', icon:'✓', label:'Todos los paquetes dentro del límite', detail:'' });
  }

  rows.innerHTML = items.map(it => `
    <div class="checklist-row ${it.status}">
      <span class="checklist-icon">${it.icon}</span>
      <span class="checklist-label">${it.label}</span>
      ${it.detail ? `<span class="checklist-detail">${it.detail}</span>` : ''}
    </div>`).join('');
}

// ─────────────────────────────────────────────
// RENDER: Catálogo
// ─────────────────────────────────────────────
function renderCatalogo() {
  const rowsEl  = document.getElementById('catalogo-rows');
  const empty   = document.getElementById('catalogo-empty');
  const headers = document.getElementById('cat-headers');
  rowsEl.innerHTML = '';

  if (!STATE.catalogo.length) {
    empty.classList.remove('hidden');
    headers.style.display = 'none';
    return;
  }
  empty.classList.add('hidden');
  headers.style.display = 'grid';

  STATE.catalogo.forEach(p => {
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `
      <div class="cell-name">
        <input type="text" value="${esc(p.nombre)}" data-field="nombre" data-pid="${p.id}"
          placeholder="Nombre del título"
          style="font-size:12px;font-weight:600;padding:7px 0;border:none;background:transparent;outline:none;width:100%;font-family:Inter,system-ui,sans-serif;color:var(--text)" />
      </div>
      <div class="cell-num">
        <input type="number" min="0" step="0.01" value="${fmtN(p.precio,2).replace(',','.')}" data-field="precio" data-pid="${p.id}" />
        <span class="cell-unit">€</span>
      </div>
      <div class="cell-num">
        <input type="number" min="0" step="0.001" value="${fmtN(p.pesoKg,3).replace(',','.')}" data-field="pesoKg" data-pid="${p.id}" />
        <span class="cell-unit">kg</span>
      </div>
      <button class="row-remove" data-remove-pid="${p.id}" title="Eliminar">✕</button>`;
    rowsEl.appendChild(row);
  });

  rowsEl.querySelectorAll('input[data-field]').forEach(inp =>
    inp.addEventListener('change', e =>
      actualizarProducto(e.target.dataset.pid, e.target.dataset.field, e.target.value)));
  rowsEl.querySelectorAll('[data-remove-pid]').forEach(btn =>
    btn.addEventListener('click', e => eliminarProducto(e.target.dataset.removePid)));
}

// ─────────────────────────────────────────────
// ACCIONES: Ferias
// ─────────────────────────────────────────────
function seleccionarFeria(id) {
  STATE.feriaId = id;
  renderFeriasList();
  renderDetalle();
}

function nuevaFeria() {
  const f = { id:uid(), nombre:'', objetivo:null, stock:[], paquetes:[] };
  STATE.ferias.push(f);
  guardar();
  seleccionarFeria(f.id);
  setTimeout(() => document.getElementById('feria-nombre')?.focus(), 60);
}

function borrarFeria() {
  const f = feriaActiva();
  if (!f || !confirm(`¿Borrar la feria "${f.nombre||'sin nombre'}"?`)) return;
  STATE.ferias  = STATE.ferias.filter(x => x.id !== f.id);
  STATE.feriaId = STATE.ferias.length ? STATE.ferias[0].id : null;
  guardar();
  renderFeriasList();
  renderDetalle();
}

// ─────────────────────────────────────────────
// ACCIONES: Stock
// ─────────────────────────────────────────────
function actualizarSelectStock(feria) {
  const sel = document.getElementById('stock-add-select');
  if (!sel) return;
  const disponibles = catalogoDisponible(feria);
  sel.innerHTML = '<option value="">— elige un título —</option>';
  disponibles.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.nombre}  (${fmtN(p.precio,2)} € · ${fmtN(p.pesoKg,3)} kg)`;
    sel.appendChild(opt);
  });
}

function abrirSelectStock() {
  const feria = feriaActiva(); if (!feria) return;
  if (!STATE.catalogo.length) { cambiarVista('catalogo'); return; }
  if (!catalogoDisponible(feria).length) return;

  actualizarSelectStock(feria);
  const sel  = document.getElementById('stock-add-select');
  const btn  = document.getElementById('btn-add-stock');
  const rect = btn.getBoundingClientRect();
  sel.style.cssText = `position:fixed;top:${rect.bottom}px;left:${rect.left}px;width:${rect.width}px;opacity:0;pointer-events:auto;z-index:9999;font-size:16px`;
  sel.focus();
  try { sel.showPicker(); } catch(e) { sel.click(); }
}

function quitarStock(sid) {
  const feria = feriaActiva(); if (!feria) return;
  feria.stock = (feria.stock||[]).filter(s => s.id !== sid);
  (feria.paquetes||[]).forEach(p => { if (p.asignaciones) delete p.asignaciones[sid]; });
  guardar();
  renderStockTabla(feria);
  renderKPIs(feria);
  renderPaquetes(feria);
  renderChecklist(feria);
  renderFeriasList();
}

function actualizarCampoStock(sid, field, val) {
  const feria = feriaActiva(); if (!feria) return;
  const s = (feria.stock||[]).find(x => x.id === sid); if (!s) return;
  if (field === 'qty') s.qty = Math.max(0, parseInt(val)||0);
  guardar();

  // Actualizar solo las celdas calculadas de esta fila
  const vEl = document.querySelector(`[data-calc-valor="${sid}"]`);
  const pEl = document.querySelector(`[data-calc-peso="${sid}"]`);
  if (vEl) vEl.textContent = fmtE(s.precio * s.qty);
  if (pEl) pEl.textContent = fmtKg(s.pesoKg * s.qty);

  renderKPIs(feria);
  actualizarCeldasSinRep(feria);
  actualizarProgresiones(feria);
  // Re-render paquetes para actualizar maxPerm de los spinners de reparto
  renderPaquetes(feria);
  renderChecklist(feria);
  renderFeriasList();
}

// ─────────────────────────────────────────────
// ACCIONES: Paquetes
// ─────────────────────────────────────────────
function agregarPaquete() {
  const feria = feriaActiva(); if (!feria) return;
  feria.paquetes.push({ id:uid(), tipo:'postal', pesoVacioKg:0, limiteKg:10, asignaciones:{}, open:true });
  guardar();
  renderPaquetes(feria);
  renderChecklist(feria);
  renderFeriasList();
}

// ─────────────────────────────────────────────
// ACCIONES: Catálogo
// ─────────────────────────────────────────────
function agregarProducto() {
  STATE.catalogo.push({ id:uid(), nombre:'', precio:0, pesoKg:0 });
  guardar();
  renderCatalogo();
  setTimeout(() => {
    const rows = document.querySelectorAll('.cat-row');
    rows[rows.length-1]?.querySelector('input[data-field="nombre"]')?.focus();
  }, 30);
}

function actualizarProducto(pid, field, val) {
  const p = STATE.catalogo.find(x => x.id === pid); if (!p) return;
  if (field === 'nombre') p.nombre = val;
  if (field === 'precio') p.precio = Math.max(0, parseFloat(val)||0);
  if (field === 'pesoKg') p.pesoKg = Math.max(0, parseFloat(val)||0);
  // Propagar cambios a ferias que usen este producto
  STATE.ferias.forEach(f => {
    const s = (f.stock||[]).find(x => x.catalogoId === pid);
    if (s) { s.precio = p.precio; s.pesoKg = p.pesoKg; if (field==='nombre') s.nombre = p.nombre; }
  });
  guardar();
}

function eliminarProducto(pid) {
  if (!confirm('¿Eliminar este producto del catálogo?')) return;
  STATE.catalogo = STATE.catalogo.filter(p => p.id !== pid);
  guardar();
  renderCatalogo();
}

// ─────────────────────────────────────────────
// PACKING LIST
// ─────────────────────────────────────────────
function abrirPackingList() {
  const feria = feriaActiva(); if (!feria) return;
  const body  = document.getElementById('packing-body');
  document.getElementById('packing-title').textContent = `Packing list — ${feria.nombre||'Feria'}`;

  const sinA  = stockSinAsignar(feria);
  const total = calcStock(feria);
  const paqsConItems = (feria.paquetes||[]).filter(paq => {
    const asig = paq.asignaciones||{};
    return (feria.stock||[]).some(s => (asig[s.id]||0) > 0);
  });

  let html = `<div class="pl-doc">
    <div class="pl-header">
      <div class="pl-header-title">${esc(feria.nombre)||'Feria'}</div>
      <div class="pl-header-meta">
        <span>${paqsConItems.length} paquete${paqsConItems.length!==1?'s':''}</span>
        <span>·</span><span>${fmtUds(total.uds)}</span>
        <span>·</span><span>${fmtKg(total.pesoKg)} contenido</span>
        ${feria.objetivo?`<span>·</span><span>Objetivo ${fmtE(parseFloat(feria.objetivo))}</span>`:''}
      </div>
    </div>
    <div class="pl-paquetes">`;

  paqsConItems.forEach(paq => {
    const stats  = calcPaquete(feria, paq);
    const limite = parseFloat(paq.limiteKg)||null;
    const over   = limite && stats.pesoTotal > limite;
    const tipo   = TIPOS[paq.tipo]||TIPOS.postal;
    const nombre = nombrePaquete(feria, paq);
    const asig   = paq.asignaciones||{};
    const items  = (feria.stock||[]).filter(s => (asig[s.id]||0) > 0);

    html += `<div class="pl-paquete">
      <div class="pl-paquete-head">
        <div class="pl-paquete-nombre">${nombre}</div>
        <div class="pl-paquete-tipo">${tipo.label}</div>
        <div class="pl-paquete-peso" style="color:${over?'var(--red)':'inherit'}">${fmtKg(stats.pesoTotal)}${limite?' / '+fmtKg(limite):''}</div>
      </div>
      <table class="pl-table">
        <thead><tr>
          <th class="pl-cb"></th>
          <th>Título</th>
          <th class="pl-num">Uds.</th>
          <th class="pl-num">Peso</th>
        </tr></thead>
        <tbody>
          ${items.map(s=>`<tr>
            <td class="pl-cb"><span class="print-checkbox"></span></td>
            <td>${esc(s.nombre)}</td>
            <td class="pl-num">${asig[s.id]||0}</td>
            <td class="pl-num">${fmtKg(s.pesoKg*(asig[s.id]||0))}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr class="pl-subtotal">
            <td class="pl-cb"></td>
            <td>Contenido</td>
            <td class="pl-num">${fmtUds(stats.uds)}</td>
            <td class="pl-num">${fmtKg(stats.pesoContenido)}</td>
          </tr>
          <tr class="pl-total">
            <td class="pl-cb"></td>
            <td>+ Vacío (${fmtKg(parseFloat(paq.pesoVacioKg)||0)}) = <strong>Total bulto</strong></td>
            <td></td>
            <td class="pl-num" style="color:${over?'var(--red)':'var(--green)'}"><strong>${fmtKg(stats.pesoTotal)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
  });

  if (sinA.length) {
    html += `<div class="pl-paquete pl-sin-asignar">
      <div class="pl-paquete-head">
        <div class="pl-paquete-nombre">⚠ Sin asignar</div>
        <div class="pl-paquete-tipo">No aparecerán en ningún paquete</div>
      </div>
      <table class="pl-table">
        <thead><tr><th class="pl-cb"></th><th>Título</th><th class="pl-num">Uds.</th><th class="pl-num">Peso</th></tr></thead>
        <tbody>${sinA.map(s=>`<tr>
          <td class="pl-cb"></td>
          <td>${esc(s.nombre)}</td>
          <td class="pl-num" style="color:var(--orange)">${s.sinAsignar}</td>
          <td class="pl-num">${fmtKg(s.pesoKg*s.sinAsignar)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  html += `</div></div>`;
  body.innerHTML = html;
  document.getElementById('modal-packing').classList.remove('hidden');
}

function exportarPackingCSV() {
  const feria = feriaActiva(); if (!feria) return;
  const rows  = [['Paquete','Tipo','Título','Uds.','Peso contenido (kg)','Peso vacío (kg)','Peso total bulto (kg)','Límite (kg)']];
  (feria.paquetes||[]).forEach(paq => {
    const stats  = calcPaquete(feria, paq);
    const asig   = paq.asignaciones||{};
    const nombre = nombrePaquete(feria, paq);
    const tipo   = TIPOS[paq.tipo]?.label||paq.tipo;
    (feria.stock||[]).filter(s => (asig[s.id]||0) > 0).forEach(s => {
      const q = asig[s.id]||0;
      rows.push([nombre, tipo, s.nombre, q, fmtN(s.pesoKg*q,3), '', '', paq.limiteKg||'']);
    });
    rows.push([nombre, tipo, 'TOTAL', fmtN(stats.uds,0), fmtN(stats.pesoContenido,3), fmtN(parseFloat(paq.pesoVacioKg)||0,3), fmtN(stats.pesoTotal,3), paq.limiteKg||'']);
    rows.push([]);
  });
  stockSinAsignar(feria).forEach(s =>
    rows.push(['Sin asignar','—', s.nombre, s.sinAsignar, fmtN(s.pesoKg*s.sinAsignar,3), '', '', '']));
  descargar(
    '\uFEFF' + rows.map(r => r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n'),
    `packing-${feria.nombre||'feria'}.csv`, 'text/csv;charset=utf-8;');
}

// ─────────────────────────────────────────────
// EXPORT / IMPORT
// ─────────────────────────────────────────────
function descargar(data, nombre, tipo) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([data], {type:tipo})),
    download: nombre,
  });
  a.click();
}

function exportarTodo() {
  descargar(
    JSON.stringify({ catalogo: STATE.catalogo, ferias: STATE.ferias }, null, 2),
    'stock-ferias-backup.json', 'application/json');
}

function importarTodo() {
  const inp = document.getElementById('import-file');
  inp.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.catalogo && data.ferias) {
          if (confirm(`¿Importar ${data.catalogo.length} productos y ${data.ferias.length} ferias? Reemplazará todos los datos actuales.`)) {
            STATE.catalogo = data.catalogo;
            STATE.ferias   = data.ferias;
            STATE.feriaId  = data.ferias.length ? data.ferias[0].id : null;
            guardar();
            renderFeriasList();
            renderDetalle();
          }
        } else if (Array.isArray(data) && data.every(x => x.nombre !== undefined)) {
          if (confirm(`¿Importar ${data.length} productos al catálogo?`)) {
            STATE.catalogo = data; guardar(); renderCatalogo();
          }
        } else {
          alert('Formato no reconocido. Usa un archivo exportado desde esta herramienta.');
        }
      } catch { alert('Error al leer el JSON.'); }
      inp.value = '';
    };
    r.readAsText(file);
  };
  inp.click();
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  cargar();

  // Si no hay ferias, crear una vacía para arrancar directamente
  if (!STATE.ferias.length) {
    const f = { id:uid(), nombre:'', objetivo:null, stock:[], paquetes:[] };
    STATE.ferias.push(f);
    STATE.feriaId = f.id;
    guardar();
  } else if (!STATE.feriaId) {
    STATE.feriaId = STATE.ferias[0].id;
  }

  renderFeriasList();
  renderDetalle();

  // Navegación
  document.querySelectorAll('.nav-btn[data-view]').forEach(b =>
    b.addEventListener('click', () => cambiarVista(b.dataset.view)));

  // Ferias
  document.getElementById('btn-nueva-feria').addEventListener('click', nuevaFeria);
  document.getElementById('btn-borrar-feria').addEventListener('click', borrarFeria);
  document.getElementById('btn-packing-list').addEventListener('click', abrirPackingList);

  document.getElementById('feria-nombre').addEventListener('input', e => {
    const f = feriaActiva(); if (!f) return;
    f.nombre = e.target.value; guardar(); renderFeriasList();
  });
  document.getElementById('feria-objetivo').addEventListener('change', e => {
    const f = feriaActiva(); if (!f) return;
    f.objetivo = parseFloat(e.target.value)||null; guardar(); renderKPIs(f); renderChecklist(f);
  });

  // Stock — select nativo en 1 clic
  document.getElementById('btn-add-stock').addEventListener('click', abrirSelectStock);
  document.getElementById('stock-add-select').addEventListener('change', e => {
    const pid = e.target.value; if (!pid) return;
    const feria = feriaActiva(); if (!feria) return;
    const cat = catById(pid); if (!cat) return;
    feria.stock.push({ id:uid(), catalogoId:cat.id, nombre:cat.nombre, precio:cat.precio, pesoKg:cat.pesoKg, qty:1 });
    guardar();
    e.target.value = '';
    e.target.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0';
    renderStockTabla(feria); renderKPIs(feria); renderPaquetes(feria); renderChecklist(feria); renderFeriasList();
  });
  document.getElementById('stock-add-select').addEventListener('blur', () => {
    setTimeout(() => {
      const sel = document.getElementById('stock-add-select');
      sel.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0';
    }, 200);
  });

  // Paquetes
  document.getElementById('btn-add-contenedor').addEventListener('click', agregarPaquete);

  // Packing
  document.getElementById('modal-packing-close').addEventListener('click', () =>
    document.getElementById('modal-packing').classList.add('hidden'));
  document.getElementById('btn-packing-print').addEventListener('click', () => window.print());
  document.getElementById('btn-packing-csv').addEventListener('click', exportarPackingCSV);

  // Base de datos
  document.getElementById('btn-export-todo').addEventListener('click', exportarTodo);
  document.getElementById('btn-import-todo').addEventListener('click', importarTodo);
  document.getElementById('btn-export-todo-cat').addEventListener('click', exportarTodo);
  document.getElementById('btn-import-todo-cat').addEventListener('click', importarTodo);

  // Catálogo
  document.getElementById('btn-add-catalogo').addEventListener('click', agregarProducto);

  // Cerrar modal
  document.querySelectorAll('.modal-overlay').forEach(o =>
    o.addEventListener('click', e => { if (e.target===o) o.classList.add('hidden'); }));
  document.addEventListener('keydown', e => {
    if (e.key==='Escape')
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
  });
});
