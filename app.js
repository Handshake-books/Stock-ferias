/* ══════════════════════════════════════════════════════════
   STOCK FERIAS v5 — app.js
══════════════════════════════════════════════════════════ */

const STATE = {
  catalogo: [],
  ferias:   [],
  feriaId:  null,
};

const TIPOS = {
  postal: {
    label: 'Caja postal', nombreBase: 'Caja', limite: 10, headClass: 'postal',
    hint: 'Por debajo de 10 kg accedes a tarifas de paquete estándar en la mayoría de operadores. A partir de ahí el precio puede subir de forma significativa.',
  },
  avion: {
    label: 'Maleta de avión', nombreBase: 'Maleta', limite: 23, headClass: 'avion',
    hint: 'El límite habitual de equipaje facturado es 23 kg. Algunas aerolíneas permiten más con suplemento, pero suele salir más caro que enviar el exceso por paquetería.',
  },
};

// ── Persistencia ──
function guardar() {
  localStorage.setItem('sfv5_catalogo', JSON.stringify(STATE.catalogo));
  localStorage.setItem('sfv5_ferias',   JSON.stringify(STATE.ferias));
}
function cargar() {
  try {
    const c = localStorage.getItem('sfv5_catalogo');
    const f = localStorage.getItem('sfv5_ferias');
    if (c) STATE.catalogo = JSON.parse(c);
    if (f) STATE.ferias   = JSON.parse(f);
  } catch(e) { console.warn(e); }
}

// ── Formato ──
function fmtN(n, dec) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
const fmtE   = n => fmtN(n, 2) + '\u00a0€';
const fmtKg  = n => fmtN(n, 2) + '\u00a0kg';
const fmtUds = n => fmtN(n, 0) + '\u00a0uds.';
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

// ── Cálculos ──
function uid()          { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function feriaActiva()  { return STATE.ferias.find(f => f.id === STATE.feriaId) || null; }
function catById(id)    { return STATE.catalogo.find(p => p.id === id) || null; }

function calcStock(feria) {
  let uds = 0, valor = 0, pesoKg = 0;
  (feria.stock || []).forEach(s => { uds += s.qty; valor += s.precio * s.qty; pesoKg += s.pesoKg * s.qty; });
  return { uds, valor, pesoKg };
}

function totalAsignado(feria, stockId) {
  return (feria.paquetes || []).reduce((sum, p) => sum + ((p.asignaciones||{})[stockId]||0), 0);
}

function calcPaquete(feria, paq) {
  let pesoKg = 0, valor = 0, uds = 0;
  const asig = paq.asignaciones || {};
  (feria.stock || []).forEach(s => {
    const q = asig[s.id] || 0;
    pesoKg += s.pesoKg * q; valor += s.precio * q; uds += q;
  });
  const pesoVacio = parseFloat(paq.pesoVacioKg) || 0;
  return { pesoContenido: pesoKg, pesoTotal: pesoKg + pesoVacio, valor, uds };
}

function stockSinAsignar(feria) {
  return (feria.stock || [])
    .map(s => ({ ...s, sinAsignar: s.qty - totalAsignado(feria, s.id) }))
    .filter(s => s.sinAsignar > 0);
}

function catalogoDisponible(feria) {
  const enStock = new Set((feria.stock || []).map(s => s.catalogoId));
  return STATE.catalogo.filter(p => !enStock.has(p.id));
}

function nombrePaquete(feria, paq) {
  const tipo = TIPOS[paq.tipo] || TIPOS.postal;
  const idx  = (feria.paquetes || []).filter(p => p.tipo === paq.tipo).findIndex(p => p.id === paq.id);
  return `${tipo.nombreBase} ${idx + 1}`;
}

// ── Navegación ──
function cambiarVista(vista) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== `view-${vista}`));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === vista));
  if (vista === 'catalogo') renderCatalogo();
}

// ── RENDER: Lista ferias ──
function renderFeriasList() {
  const list  = document.getElementById('ferias-list');
  const empty = document.getElementById('ferias-empty');
  list.innerHTML = '';
  if (!STATE.ferias.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  [...STATE.ferias].sort((a,b) => b.id.localeCompare(a.id)).forEach(f => {
    const calc   = calcStock(f);
    const hasSt  = f.stock?.length > 0;
    const hasPaq = f.paquetes?.length > 0;
    const sinA   = hasSt ? stockSinAsignar(f) : [];
    const allOk  = hasSt && hasPaq && sinA.length === 0;

    const div = document.createElement('div');
    div.className = 'feria-item' + (f.id === STATE.feriaId ? ' active' : '');
    div.innerHTML = `
      <div class="feria-item-name">${f.nombre || 'Sin nombre'}</div>
      <div class="feria-item-meta">${fmtE(calc.valor)}</div>
      <div class="feria-item-status" title="Stock · Paquetes · Todo asignado">
        <div class="status-dot ${hasSt?'done':''}"></div>
        <div class="status-dot ${hasPaq?'done':''}"></div>
        <div class="status-dot ${allOk?'done':hasPaq?'partial':''}"></div>
      </div>`;
    div.addEventListener('click', () => seleccionarFeria(f.id));
    list.appendChild(div);
  });
}

// ── RENDER: Detalle ──
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
  renderSinAsignar(feria);
  renderPaquetes(feria);
  renderChecklist(feria);
}

// ── RENDER: KPIs ──
function renderKPIs(feria) {
  const c = calcStock(feria);
  document.getElementById('kpi-uds').textContent   = fmtUds(c.uds);
  document.getElementById('kpi-valor').textContent = fmtE(c.valor);
  document.getElementById('kpi-peso').textContent  = fmtKg(c.pesoKg);
  const ratioEl = document.getElementById('kpi-ratio');
  const alerta  = document.getElementById('alerta-ratio');
  const obj     = parseFloat(feria.objetivo);
  if (obj > 0) {
    const r = c.valor / obj;
    ratioEl.textContent = fmtN(r,2) + '×';
    ratioEl.className   = 'kpi-value ' + (r > 2 ? 'red' : r > 1.5 ? 'orange' : 'green');
    if (r > 2) {
      alerta.classList.remove('hidden');
      alerta.textContent = `⚠ El stock (${fmtE(c.valor)}) supera el doble del objetivo de ventas (${fmtE(obj)}). Si no lo vendes todo, tendrás que pagar el envío de vuelta — ese coste puede comerse el margen.`;
    } else { alerta.classList.add('hidden'); }
  } else {
    ratioEl.textContent = '—'; ratioEl.className = 'kpi-value'; alerta.classList.add('hidden');
  }
}

// ── RENDER: Tabla stock ──
function renderStockTabla(feria) {
  const tbody   = document.getElementById('stock-tbody');
  const empty   = document.getElementById('stock-empty');
  const headers = document.getElementById('stock-headers');
  const blocked = document.getElementById('stock-blocked');
  const addBtn  = document.getElementById('btn-add-stock');
  const addRow  = document.getElementById('stock-add-row');
  tbody.innerHTML = '';

  if (!STATE.catalogo.length) {
    blocked.classList.remove('hidden'); headers.style.display = 'none';
    empty.classList.add('hidden'); addBtn.style.display = 'none'; addRow.classList.add('hidden'); return;
  }
  blocked.classList.add('hidden'); addBtn.style.display = '';

  if (!feria.stock?.length) {
    empty.classList.remove('hidden'); headers.style.display = 'none';
  } else {
    empty.classList.add('hidden'); headers.style.display = 'grid';
    feria.stock.forEach(s => {
      const row = document.createElement('div');
      row.className = 'stock-row';
      row.innerHTML = `
        <div class="cell-name" style="cursor:default">
          <span style="font-size:12px;font-weight:600;padding:7px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block">${esc(s.nombre)}</span>
        </div>
        <div class="cell-num-wrap">
          <button class="spin-btn" data-spin="-1" data-sid="${s.id}">−</button>
          <input class="spin-input" type="number" min="0" value="${s.qty}" data-field="qty" data-sid="${s.id}" />
          <button class="spin-btn" data-spin="1" data-sid="${s.id}">+</button>
        </div>
        <div class="cell-readonly" data-calc-valor="${s.id}">${fmtE(s.precio * s.qty)}</div>
        <div class="cell-readonly muted" data-calc-peso="${s.id}">${fmtKg(s.pesoKg * s.qty)}</div>
        <button class="row-remove" data-remove-sid="${s.id}" title="Quitar del stock">✕</button>`;
      tbody.appendChild(row);
    });

    tbody.querySelectorAll('.spin-input').forEach(inp =>
      inp.addEventListener('change', e => actualizarCampoStock(e.target.dataset.sid, 'qty', e.target.value)));

    tbody.querySelectorAll('[data-spin]').forEach(btn =>
      btn.addEventListener('click', e => {
        const sid   = e.currentTarget.dataset.sid;
        const delta = parseInt(e.currentTarget.dataset.spin);
        const inp   = e.currentTarget.closest('.cell-num-wrap').querySelector('.spin-input');
        const val   = Math.max(0, (parseInt(inp.value) || 0) + delta);
        inp.value = val;
        actualizarCampoStock(sid, 'qty', val);
      }));

    tbody.querySelectorAll('[data-remove-sid]').forEach(btn =>
      btn.addEventListener('click', e => quitarStock(e.target.dataset.removeSid)));
  }
  actualizarSelectStock(feria);
}

function actualizarSelectStock(feria) {
  const sel = document.getElementById('stock-add-select'); if (!sel) return;
  const disponibles = catalogoDisponible(feria);
  sel.innerHTML = '';
  if (!disponibles.length) {
    sel.innerHTML = '<option value="">✓ Todos los títulos del catálogo están añadidos</option>';
    return;
  }
  const ph = document.createElement('option');
  ph.value = ''; ph.textContent = '— elige un título —'; sel.appendChild(ph);
  disponibles.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.nombre}  (${fmtN(p.precio,2)} € · ${fmtN(p.pesoKg,3)} kg)`;
    sel.appendChild(opt);
  });
}

// ── RENDER: Sin asignar ──
function renderSinAsignar(feria) {
  const wrap  = document.getElementById('sin-asignar-wrap');
  const rows  = document.getElementById('sin-asignar-rows');
  const count = document.getElementById('sin-asignar-count');
  const sinA  = stockSinAsignar(feria);
  if (!sinA.length || !feria.paquetes?.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  count.textContent = fmtUds(sinA.reduce((s,x) => s + x.sinAsignar, 0)) + ' sin repartir';
  rows.innerHTML = sinA.map(s => `
    <div class="sin-asignar-row">
      <span class="sa-nombre">${esc(s.nombre)}</span>
      <span class="sa-qty">${fmtUds(s.sinAsignar)} de ${fmtUds(s.qty)}</span>
    </div>`).join('');
}

// ── RENDER: Paquetes ──
function renderPaquetes(feria) {
  const wrap    = document.getElementById('contenedores-wrap');
  const blocked = document.getElementById('reparto-blocked');
  const addBtn  = document.getElementById('btn-add-contenedor');
  wrap.innerHTML = '';
  const hasStock = feria.stock?.length > 0;
  blocked.classList.toggle('hidden', hasStock);
  addBtn.style.display = hasStock ? '' : 'none';
  if (!hasStock) return;
  (feria.paquetes || []).forEach(paq => wrap.appendChild(buildPaquete(feria, paq)));
}

function buildPaquete(feria, paq) {
  const tipo   = TIPOS[paq.tipo] || TIPOS.postal;
  const stats  = calcPaquete(feria, paq);
  const limite = parseFloat(paq.limiteKg) || null;
  const over   = limite && stats.pesoTotal > limite;
  const near   = limite && !over && stats.pesoTotal / limite > 0.85;
  const pct    = limite ? Math.min((stats.pesoTotal / limite) * 100, 100) : 0;
  const barC   = over ? 'var(--red)' : near ? 'var(--orange)' : 'var(--green)';
  const isOpen = paq.open !== false;
  const nombre = nombrePaquete(feria, paq);

  let badgeText = '', badgeClass = '';
  if (over)      { badgeText = '⚠ Sobrepeso'; badgeClass = 'over'; }
  else if (near) { badgeText = '⚠ Casi lleno'; badgeClass = 'warn'; }

  // Filas de reparto con spinners
  const repartoRows = (feria.stock || []).map(s => {
    const enEste   = (paq.asignaciones||{})[s.id] || 0;
    const totAsig  = totalAsignado(feria, s.id);
    const overItem = totAsig > s.qty;
    const enOtros  = totAsig - enEste;
    const maxPerm  = s.qty - enOtros;
    const allDone  = totAsig === s.qty && enEste === 0;

    let progClass = 'none';
    if (overItem)                       progClass = 'over';
    else if (totAsig === s.qty && enEste > 0) progClass = 'ok';
    else if (enEste > 0)                progClass = 'warn';

    return `<div class="reparto-row">
      <div class="reparto-name" title="${esc(s.nombre)}">${esc(s.nombre)}</div>
      <div class="cell-num-wrap" style="height:30px">
        <button class="spin-btn" data-rspin="-1" data-paqid="${paq.id}" data-sid="${s.id}" data-max="${maxPerm}">−</button>
        <input class="spin-input" type="number" min="0" max="${maxPerm}" value="${enEste}"
          data-rasig data-paqid="${paq.id}" data-sid="${s.id}" data-max="${maxPerm}" />
        <button class="spin-btn" data-rspin="1" data-paqid="${paq.id}" data-sid="${s.id}" data-max="${maxPerm}">+</button>
      </div>
      <div class="reparto-progress ${progClass}">${enEste}\u00a0/\u00a0${s.qty}${overItem?' ⚠':totAsig===s.qty&&enEste>0?' ✓':''}</div>
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
      <button class="co-head-remove" data-remove-paq="${paq.id}" title="Eliminar paquete">✕</button>
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
            <input type="number" min="0" step="0.1" value="${paq.pesoVacioKg||0}"
              data-field-paq="pesoVacioKg" data-paqid="${paq.id}" />
            <span class="meta-chip-label">kg</span>
          </div>
          <div class="meta-chip">
            <span class="meta-chip-label">Límite de peso</span>
            <input type="number" min="0" step="0.5" value="${paq.limiteKg||''}"
              placeholder="${tipo.limite}" data-field-paq="limiteKg" data-paqid="${paq.id}" />
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
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${barC}"></div></div>
        <div class="co-bar-labels">
          <span>0 kg</span>
          <span>${!over ? fmtKg(limite-stats.pesoTotal)+' restantes':''}</span>
          <span>Límite ${fmtKg(limite)}</span>
        </div>
      </div>` : ''}

      <div class="co-reparto">
        <div class="reparto-col-headers">
          <span>Título</span><span>Uds. en este paquete</span><span>Aquí / total</span>
        </div>
        ${repartoRows}
      </div>
    </div>`;

  // Eventos toggle
  block.querySelector('[data-toggle]').addEventListener('click', () => {
    const f = feriaActiva(); const p = f?.paquetes.find(x => x.id === paq.id); if (!p) return;
    p.open = !p.open; guardar(); renderPaquetes(f); renderChecklist(f);
  });

  // Tipo
  block.querySelectorAll('[data-tipo]').forEach(btn =>
    btn.addEventListener('click', e => {
      const f = feriaActiva(); const p = f?.paquetes.find(x => x.id === e.target.dataset.paqid); if (!p) return;
      p.tipo = e.target.dataset.tipo; p.limiteKg = TIPOS[p.tipo].limite;
      guardar(); renderPaquetes(f); renderChecklist(f); renderFeriasList();
    }));

  // Peso vacío + límite
  block.querySelectorAll('[data-field-paq]').forEach(inp =>
    inp.addEventListener('change', e => {
      const f = feriaActiva(); const p = f?.paquetes.find(x => x.id === e.target.dataset.paqid); if (!p) return;
      const val = parseFloat(e.target.value);
      p[e.target.dataset.fieldPaq] = isNaN(val) ? null : val;
      guardar(); renderPaquetes(f); renderChecklist(f);
    }));

  // Spinners de reparto
  const applyRasig = (paqid, sid, val) => {
    const f  = feriaActiva(); if (!f) return;
    const p  = f.paquetes.find(x => x.id === paqid);
    const s  = f.stock.find(x => x.id === sid);
    if (!p || !s) return;
    if (!p.asignaciones) p.asignaciones = {};
    const enOtros = (f.paquetes||[]).filter(x=>x.id!==p.id).reduce((sum,x)=>sum+((x.asignaciones||{})[sid]||0),0);
    const maxPerm = s.qty - enOtros;
    const finalVal = Math.max(0, Math.min(val, maxPerm));
    p.asignaciones[sid] = finalVal;
    guardar();
    renderKPIs(f); renderSinAsignar(f); renderPaquetes(f); renderChecklist(f); renderFeriasList();
  };

  block.querySelectorAll('[data-rasig]').forEach(inp =>
    inp.addEventListener('change', e => applyRasig(e.target.dataset.paqid, e.target.dataset.sid, parseInt(e.target.value)||0)));

  block.querySelectorAll('[data-rspin]').forEach(btn =>
    btn.addEventListener('click', e => {
      const { paqid, sid, max } = e.currentTarget.dataset;
      const delta  = parseInt(e.currentTarget.dataset.rspin);
      const inp    = e.currentTarget.closest('.cell-num-wrap').querySelector('[data-rasig]');
      const curVal = parseInt(inp?.value) || 0;
      applyRasig(paqid, sid, curVal + delta);
    }));

  // Eliminar paquete desde cabecera
  block.querySelector('[data-remove-paq]').addEventListener('click', e => {
    e.stopPropagation();
    if (!confirm('¿Eliminar este paquete? Las asignaciones se perderán.')) return;
    const f = feriaActiva();
    f.paquetes = f.paquetes.filter(x => x.id !== e.target.dataset.removePaq);
    guardar(); renderPaquetes(f); renderSinAsignar(f); renderChecklist(f); renderFeriasList();
  });

  return block;
}

// ── RENDER: Checklist de estado ──
function renderChecklist(feria) {
  const card = document.getElementById('checklist-card');
  const rows = document.getElementById('checklist-rows');
  if (!feria) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');

  const calc   = calcStock(feria);
  const hasSt  = feria.stock?.length > 0;
  const hasPaq = feria.paquetes?.length > 0;
  const sinA   = stockSinAsignar(feria);
  const obj    = parseFloat(feria.objetivo);
  const ratio  = obj > 0 ? calc.valor / obj : null;
  const overweight = (feria.paquetes||[]).some(p => {
    const lim = parseFloat(p.limiteKg); const st = calcPaquete(feria,p);
    return lim > 0 && st.pesoTotal > lim;
  });

  const items = [];

  // 1. Catálogo
  if (!STATE.catalogo.length) {
    items.push({ status:'idle', icon:'○', label:'Catálogo vacío', detail:'Ve a Catálogo para añadir títulos' });
  } else {
    items.push({ status:'ok', icon:'✓', label:`Catálogo listo`, detail:`${STATE.catalogo.length} títulos` });
  }

  // 2. Stock
  if (!hasSt) {
    items.push({ status:'idle', icon:'○', label:'Sin stock definido', detail:'Añade títulos en la fase 1' });
  } else {
    items.push({ status:'ok', icon:'✓', label:`Stock definido`, detail:`${fmtUds(calc.uds)} · ${fmtE(calc.valor)} · ${fmtKg(calc.pesoKg)}` });
  }

  // 3. Objetivo vs stock
  if (ratio !== null) {
    if (ratio > 2) {
      items.push({ status:'bad', icon:'⚠', label:'Stock muy alto respecto al objetivo', detail:`${fmtN(ratio,2)}× el objetivo` });
    } else if (ratio > 1.5) {
      items.push({ status:'warn', icon:'⚠', label:'Stock algo alto respecto al objetivo', detail:`${fmtN(ratio,2)}× el objetivo` });
    } else {
      items.push({ status:'ok', icon:'✓', label:'Buen equilibrio stock / objetivo', detail:`${fmtN(ratio,2)}× el objetivo` });
    }
  } else {
    items.push({ status:'idle', icon:'○', label:'Sin objetivo de ventas definido', detail:'Opcional' });
  }

  // 4. Paquetes
  if (!hasPaq) {
    items.push({ status:'idle', icon:'○', label:'Sin paquetes creados', detail:'Añade paquetes en la fase 2' });
  } else {
    items.push({ status:'ok', icon:'✓', label:`${feria.paquetes.length} paquete${feria.paquetes.length!==1?'s':''} creados`, detail:'' });
  }

  // 5. Asignación
  if (hasPaq && hasSt) {
    if (sinA.length === 0) {
      items.push({ status:'ok', icon:'✓', label:'Todas las unidades repartidas', detail:'Listo para imprimir' });
    } else {
      const totalSA = sinA.reduce((s,x)=>s+x.sinAsignar,0);
      items.push({ status:'warn', icon:'⚠', label:`${fmtUds(totalSA)} sin asignar a ningún paquete`, detail:sinA.map(s=>`${s.nombre}: ${s.sinAsignar}`).join(' · ') });
    }
  }

  // 6. Sobrepeso
  if (overweight) {
    items.push({ status:'bad', icon:'⚠', label:'Algún paquete supera su límite de peso', detail:'Revisa los paquetes en rojo' });
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

// ── RENDER: Catálogo ──
function renderCatalogo() {
  const rowsEl  = document.getElementById('catalogo-rows');
  const empty   = document.getElementById('catalogo-empty');
  const headers = document.getElementById('cat-headers');
  rowsEl.innerHTML = '';
  if (!STATE.catalogo.length) { empty.classList.remove('hidden'); headers.style.display = 'none'; return; }
  empty.classList.add('hidden'); headers.style.display = 'grid';

  STATE.catalogo.forEach(p => {
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `
      <div class="cell-name">
        <input type="text" value="${esc(p.nombre)}" data-field="nombre" data-pid="${p.id}" placeholder="Nombre del título" />
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
    inp.addEventListener('change', e => actualizarProducto(e.target.dataset.pid, e.target.dataset.field, e.target.value)));
  rowsEl.querySelectorAll('[data-remove-pid]').forEach(btn =>
    btn.addEventListener('click', e => eliminarProducto(e.target.dataset.removePid)));
}

// ── ACCIONES: Ferias ──
function seleccionarFeria(id) { STATE.feriaId = id; renderFeriasList(); renderDetalle(); }

function nuevaFeria() {
  const f = { id: uid(), nombre: '', objetivo: null, stock: [], paquetes: [] };
  STATE.ferias.push(f); guardar(); seleccionarFeria(f.id);
  setTimeout(() => document.getElementById('feria-nombre')?.focus(), 60);
}

function borrarFeria() {
  const f = feriaActiva();
  if (!f || !confirm(`¿Borrar la feria "${f.nombre||'sin nombre'}"?`)) return;
  STATE.ferias = STATE.ferias.filter(x => x.id !== f.id); STATE.feriaId = null;
  guardar(); renderFeriasList(); renderDetalle();
}

// ── ACCIONES: Stock inline ──
function mostrarFilaAddStock() {
  const feria  = feriaActiva(); if (!feria) return;
  const addRow = document.getElementById('stock-add-row');
  const addBtn = document.getElementById('btn-add-stock');
  actualizarSelectStock(feria);
  addRow.classList.remove('hidden');
  addBtn.style.display = 'none';
  document.getElementById('stock-add-select').focus();
}

function ocultarFilaAddStock() {
  document.getElementById('stock-add-row').classList.add('hidden');
  document.getElementById('btn-add-stock').style.display = '';
  document.getElementById('stock-add-select').value = '';
}

function onSelectStock(e) {
  const pid = e.target.value; if (!pid) return;
  const feria = feriaActiva(); if (!feria) return;
  const cat = catById(pid); if (!cat) return;
  feria.stock.push({ id: uid(), catalogoId: cat.id, nombre: cat.nombre, precio: cat.precio, pesoKg: cat.pesoKg, qty: 1 });
  guardar(); ocultarFilaAddStock();
  renderStockTabla(feria); renderKPIs(feria); renderSinAsignar(feria); renderPaquetes(feria); renderChecklist(feria); renderFeriasList();
}

function quitarStock(sid) {
  const feria = feriaActiva(); if (!feria) return;
  feria.stock = feria.stock.filter(s => s.id !== sid);
  (feria.paquetes||[]).forEach(p => { if (p.asignaciones) delete p.asignaciones[sid]; });
  guardar(); renderStockTabla(feria); renderKPIs(feria); renderSinAsignar(feria); renderPaquetes(feria); renderChecklist(feria); renderFeriasList();
}

function actualizarCampoStock(sid, field, val) {
  const feria = feriaActiva(); if (!feria) return;
  const s = feria.stock.find(x => x.id === sid); if (!s) return;
  if (field === 'qty') s.qty = Math.max(0, parseInt(val)||0);
  guardar();
  const vEl = document.querySelector(`[data-calc-valor="${sid}"]`);
  const pEl = document.querySelector(`[data-calc-peso="${sid}"]`);
  if (vEl) vEl.textContent = fmtE(s.precio * s.qty);
  if (pEl) pEl.textContent = fmtKg(s.pesoKg * s.qty);
  renderKPIs(feria); renderSinAsignar(feria); renderPaquetes(feria); renderChecklist(feria); renderFeriasList();
}

// ── ACCIONES: Paquetes ──
function agregarPaquete() {
  const feria = feriaActiva(); if (!feria) return;
  feria.paquetes.push({ id: uid(), tipo: 'postal', pesoVacioKg: 0, limiteKg: 10, asignaciones: {}, open: true });
  guardar(); renderPaquetes(feria); renderChecklist(feria); renderFeriasList();
}

// ── ACCIONES: Catálogo ──
function agregarProducto() {
  STATE.catalogo.push({ id: uid(), nombre: '', precio: 0, pesoKg: 0 }); guardar(); renderCatalogo();
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
  STATE.ferias.forEach(f => {
    const s = f.stock?.find(x => x.catalogoId === pid);
    if (s) { s.precio = p.precio; s.pesoKg = p.pesoKg; if (field==='nombre') s.nombre = p.nombre; }
  });
  guardar();
}

function eliminarProducto(pid) {
  if (!confirm('¿Eliminar este producto del catálogo?')) return;
  STATE.catalogo = STATE.catalogo.filter(p => p.id !== pid); guardar(); renderCatalogo();
}

// ── PACKING LIST ──
function abrirPackingList() {
  const feria = feriaActiva(); if (!feria) return;
  const body  = document.getElementById('packing-body');
  document.getElementById('packing-title').textContent = `Packing list — ${feria.nombre||'Feria'}`;
  const total = calcStock(feria);
  const sinA  = stockSinAsignar(feria);

  let html = `
    <div class="packing-summary">
      <div class="ps-item"><div class="ps-value">${feria.nombre||'—'}</div><div class="ps-label">Feria</div></div>
      <div class="ps-item"><div class="ps-value">${(feria.paquetes||[]).length}</div><div class="ps-label">Paquetes</div></div>
      <div class="ps-item"><div class="ps-value">${fmtUds(total.uds)}</div><div class="ps-label">Unidades</div></div>
      <div class="ps-item"><div class="ps-value">${fmtKg(total.pesoKg)}</div><div class="ps-label">Peso contenido</div></div>
      <div class="ps-item"><div class="ps-value">${fmtE(total.valor)}</div><div class="ps-label">Valor del stock</div></div>
      ${feria.objetivo ? `<div class="ps-item"><div class="ps-value">${fmtE(parseFloat(feria.objetivo))}</div><div class="ps-label">Objetivo ventas</div></div>` : ''}
    </div>
    <div class="packing-contenedores">`;

  (feria.paquetes||[]).forEach(paq => {
    const stats  = calcPaquete(feria, paq);
    const limite = parseFloat(paq.limiteKg)||null;
    const over   = limite && stats.pesoTotal > limite;
    const tipo   = TIPOS[paq.tipo]||TIPOS.postal;
    const nombre = nombrePaquete(feria, paq);
    const asig   = paq.asignaciones||{};
    const items  = (feria.stock||[]).filter(s => (asig[s.id]||0) > 0);
    if (!items.length) return;

    html += `
      <div class="packing-box">
        <div class="packing-box-header ${tipo.headClass}">
          <span class="packing-box-title">${nombre} — ${tipo.label}</span>
          <span class="packing-box-meta">
            <span>${fmtUds(stats.uds)}</span>
            <span>Contenido: ${fmtKg(stats.pesoContenido)}</span>
            <span>Vacío: ${fmtKg(parseFloat(paq.pesoVacioKg)||0)}</span>
            <span style="font-weight:800">Total: ${fmtKg(stats.pesoTotal)}${limite?' / '+fmtKg(limite):''}</span>
          </span>
        </div>
        <table class="packing-box-table">
          <thead><tr><th>Título</th><th class="th-r">Uds.</th><th class="th-r">Peso total</th></tr></thead>
          <tbody>
            ${items.map(s => `<tr><td>${esc(s.nombre)}</td><td class="td-r">${fmtUds(asig[s.id]||0)}</td><td class="td-r">${fmtKg(s.pesoKg*(asig[s.id]||0))}</td></tr>`).join('')}
          </tbody>
          <tfoot>
            <tr><td>Total contenido</td><td class="td-r">${fmtUds(stats.uds)}</td><td class="td-r">${fmtKg(stats.pesoContenido)}</td></tr>
            <tr><td>+ Peso vacío</td><td></td><td class="td-r">${fmtKg(parseFloat(paq.pesoVacioKg)||0)}</td></tr>
            <tr><td><strong>Peso total del bulto</strong></td><td></td><td class="td-r" style="color:${over?'var(--red)':'var(--green)'}"><strong>${fmtKg(stats.pesoTotal)}</strong></td></tr>
          </tfoot>
        </table>
      </div>`;
  });

  if (sinA.length) {
    html += `
      <div class="packing-box">
        <div class="packing-box-header sin-asignar">
          <span class="packing-box-title">⚠ Sin asignar a ningún paquete</span>
        </div>
        <table class="packing-box-table">
          <thead><tr><th>Título</th><th class="th-r">Uds.</th><th class="th-r">Peso</th></tr></thead>
          <tbody>${sinA.map(s=>`<tr><td>${esc(s.nombre)}</td><td class="td-r" style="color:var(--orange)">${fmtUds(s.sinAsignar)}</td><td class="td-r">${fmtKg(s.pesoKg*s.sinAsignar)}</td></tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  html += '</div>';
  body.innerHTML = html;
  document.getElementById('modal-packing').classList.remove('hidden');
}

function exportarPackingCSV() {
  const feria = feriaActiva(); if (!feria) return;
  const rows  = [['Paquete','Tipo','Título','Uds.','Peso contenido (kg)','Peso vacío (kg)','Peso total bulto (kg)','Límite (kg)']];
  (feria.paquetes||[]).forEach(paq => {
    const stats  = calcPaquete(feria,paq);
    const asig   = paq.asignaciones||{};
    const tipo   = TIPOS[paq.tipo]?.label||paq.tipo;
    const nombre = nombrePaquete(feria,paq);
    (feria.stock||[]).filter(s=>(asig[s.id]||0)>0).forEach(s => {
      const q = asig[s.id]||0;
      rows.push([nombre,tipo,s.nombre,q,fmtN(s.pesoKg*q,3),'','',paq.limiteKg||'']);
    });
    rows.push([nombre,tipo,'TOTAL',fmtN(stats.uds,0),fmtN(stats.pesoContenido,3),fmtN(parseFloat(paq.pesoVacioKg)||0,3),fmtN(stats.pesoTotal,3),paq.limiteKg||'']);
    rows.push([]);
  });
  stockSinAsignar(feria).forEach(s =>
    rows.push(['Sin asignar','—',s.nombre,s.sinAsignar,fmtN(s.pesoKg*s.sinAsignar,3),'','','']));
  descargar('\uFEFF'+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n'),
    `packing-${feria.nombre||'feria'}.csv`,'text/csv;charset=utf-8;');
}

// ── EXPORT / IMPORT ──
function descargar(data, nombre, tipo) {
  const a = Object.assign(document.createElement('a'),{
    href: URL.createObjectURL(new Blob([data],{type:tipo})), download: nombre,
  });
  a.click();
}

// Descargar TODO (catálogo + ferias)
function exportarTodo() {
  descargar(JSON.stringify({ catalogo: STATE.catalogo, ferias: STATE.ferias }, null, 2),
    'stock-ferias-backup.json', 'application/json');
}

// Importar TODO
function importarTodo() {
  const inp = document.getElementById('import-file');
  inp.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        // Acepta tanto { catalogo, ferias } como array de catálogo solo
        if (data.catalogo && data.ferias) {
          if (confirm(`¿Importar ${data.catalogo.length} productos y ${data.ferias.length} ferias? Esto reemplazará todos los datos actuales.`)) {
            STATE.catalogo = data.catalogo; STATE.ferias = data.ferias; STATE.feriaId = null;
            guardar(); renderFeriasList(); renderDetalle();
          }
        } else if (Array.isArray(data) && data.every(x => x.nombre !== undefined)) {
          if (confirm(`¿Importar ${data.length} productos al catálogo? Esto reemplazará el catálogo actual.`)) {
            STATE.catalogo = data; guardar(); renderCatalogo();
          }
        } else {
          alert('Formato no reconocido. Usa un archivo exportado desde esta herramienta.');
        }
      } catch { alert('Error al leer el archivo JSON.'); }
      inp.value = '';
    };
    r.readAsText(file);
  };
  inp.click();
}

function exportarCatalogo() {
  descargar(JSON.stringify(STATE.catalogo,null,2),'catalogo-handshake.json','application/json');
}

function importarCatalogo() {
  const inp = document.getElementById('import-file');
  inp.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (Array.isArray(data) && data.every(x => x.nombre !== undefined)) {
          if (confirm(`¿Importar ${data.length} productos? Esto reemplazará el catálogo actual.`)) {
            STATE.catalogo = data; guardar(); renderCatalogo();
          }
        } else alert('Formato no reconocido.');
      } catch { alert('Error al leer el JSON.'); }
      inp.value = '';
    };
    r.readAsText(file);
  };
  inp.click();
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  cargar(); renderFeriasList(); renderDetalle();

  document.querySelectorAll('.nav-btn').forEach(b =>
    b.addEventListener('click', () => cambiarVista(b.dataset.view)));

  document.getElementById('btn-nueva-feria').addEventListener('click', nuevaFeria);
  document.getElementById('btn-borrar-feria').addEventListener('click', borrarFeria);
  document.getElementById('btn-packing-list').addEventListener('click', abrirPackingList);

  document.getElementById('btn-export-todo').addEventListener('click', exportarTodo);
  document.getElementById('btn-import-todo').addEventListener('click', importarTodo);

  document.getElementById('feria-nombre').addEventListener('input', e => {
    const f = feriaActiva(); if (!f) return;
    f.nombre = e.target.value; guardar(); renderFeriasList();
  });
  document.getElementById('feria-objetivo').addEventListener('change', e => {
    const f = feriaActiva(); if (!f) return;
    f.objetivo = parseFloat(e.target.value)||null; guardar(); renderKPIs(f); renderChecklist(f);
  });

  document.getElementById('btn-add-stock').addEventListener('click', mostrarFilaAddStock);
  document.getElementById('btn-stock-add-cancel').addEventListener('click', ocultarFilaAddStock);
  document.getElementById('stock-add-select').addEventListener('change', onSelectStock);

  document.getElementById('btn-add-contenedor').addEventListener('click', agregarPaquete);

  document.getElementById('modal-packing-close').addEventListener('click', () =>
    document.getElementById('modal-packing').classList.add('hidden'));
  document.getElementById('btn-packing-csv').addEventListener('click', exportarPackingCSV);

  document.getElementById('btn-add-catalogo').addEventListener('click', agregarProducto);
  document.getElementById('btn-export-catalogo').addEventListener('click', exportarCatalogo);
  document.getElementById('btn-import-catalogo').addEventListener('click', importarCatalogo);

  document.querySelectorAll('.modal-overlay').forEach(o =>
    o.addEventListener('click', e => { if (e.target===o) o.classList.add('hidden'); }));
  document.addEventListener('keydown', e => {
    if (e.key==='Escape') document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
  });
});
