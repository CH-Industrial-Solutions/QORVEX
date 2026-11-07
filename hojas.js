/* =====================================================================
   hojas.js — VALIDATE y SEQUENCE: la hoja de Validación o Secuencia
   completa, tal cual está en el Excel (todas las columnas y filas), con
   búsqueda, filtro por columna, orden y exportación de lo filtrado.
   Solo lectura: aquí no se modifica nada.
   ===================================================================== */
(function (App) {
  const { $, $$, esc, fmtN, toast, normTxt } = App;
  const PAGE = 200;
  const ST = {};     // estado de filtros por hoja: val / seq
  const CACHE = {};  // tabla ya leída por hoja

  const st = (role) => (ST[role] = ST[role] || { q: '', f: {}, sort: null, page: 0, comp: '' });

  /** Lee la hoja completa a partir de la fila de encabezados, con el texto que muestra Excel */
  /** Filas de un archivo: texto como lo muestra Excel (v) + valores crudos (raw) */
  function readRows(L) {
    const ws = L.wb.Sheets[L.sheet];
    if (!ws || !ws['!ref']) return null;
    // blankrows:true para conocer el número de fila real de Excel; las filas vacías se omiten después
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: true, range: L.t.hRow });
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true, range: L.t.hRow });
    const body = [];
    for (let i = 1; i < aoa.length; i++) { const v = aoa[i] || []; if (v.some((x) => String(x).trim() !== '')) body.push({ n: L.t.hRow + i + 1, v, raw: raw[i] || [] }); }
    return { head: (aoa[0] || []).map((h) => String(h ?? '').trim()), body, c0: XLSX.utils.decode_range(ws['!ref']).s.c };
  }

  function data(role) {
    const S = App.S, L = S.L[role]; if (!L) return null;
    const list = App.srcs(role);
    const stamp = list.map((x) => `${x.name}|${x.sheet}|${x.lastModified}`).join('/') + `|${S.edits.length}`;
    if (CACHE[role] && CACHE[role].stamp === stamp) return CACHE[role];
    const P = readRows(L); if (!P) return null;
    const n0 = Math.max(P.head.length, ...P.body.map((r) => r.v.length), 0);
    const heads = Array.from({ length: n0 }, (_, i) => P.head[i] || `Columna ${XLSX.utils.encode_col(P.c0 + i)}`);
    const HN = heads.map(normTxt);
    const multi = list.length > 1;
    const rows = P.body.map((r) => ({ n: r.n, v: Array.from({ length: n0 }, (_, c) => String(r.v[c] ?? '')), raw: Array.from({ length: n0 }, (_, c) => r.raw[c] ?? null), f: L.name }));
    // Bases de las tabletas: columnas acomodadas por nombre de encabezado
    list.slice(1).forEach((X) => {
      const Q = readRows(X); if (!Q) return;
      const map = Q.head.map((h) => HN.indexOf(normTxt(h)));
      Q.body.forEach((r) => { const v = Array(n0).fill(''), raw = Array(n0).fill(null); map.forEach((c, i) => { if (c >= 0) { v[c] = String(r.v[i] ?? ''); raw[c] = r.raw[i] ?? null; } }); rows.push({ n: r.n, v, raw, f: X.name }); });
    });
    if (multi) { heads.push('Archivo'); rows.forEach((r) => { r.v.push(r.f); r.raw.push(r.f); }); }
    // columnas con pocos valores distintos se filtran con lista; las demás con texto
    const opts = heads.map((_, c) => { const s = new Set(); for (const r of rows) { s.add(r.v[c]); if (s.size > 60) return null; } return [...s].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })); });
    const H = heads.map(normTxt);
    const ci = (names) => H.findIndex((h) => names.includes(h));
    const cJob = ci(['job']), cCont = ci(['contenedor']), cComp = ci(['componente']);
    const cFecha = ci(['fecha']);
    CACHE[role] = { stamp, heads, rows, opts, cJob, cCont, cComp, cFecha, name: L.name, sheet: L.sheet, files: list.map((x) => x.name), nHead: n0 };
    return CACHE[role];
  }

  function filtered(D, F) {
    const q = F.q.trim().toUpperCase();
    const fs = Object.entries(F.f).filter(([, v]) => v !== '' && v != null);
    let out = D.rows.filter((r) => {
      if (q && !r.v.some((x) => x.toUpperCase().includes(q))) return false;
      if (F.comp && D.cComp >= 0 && App.normComp(r.v[D.cComp]) !== F.comp) return false;
      for (const [c, v] of fs) {
        const cell = r.v[+c];
        if (D.opts[+c]) { if (cell !== v) return false; } else if (!cell.toUpperCase().includes(String(v).toUpperCase())) return false;
      }
      return true;
    });
    if (F.sort) {
      const { c, d } = F.sort, cmp = (a, b) => a.v[c].localeCompare(b.v[c], 'es', { numeric: true });
      out = out.slice().sort((a, b) => d * cmp(a, b));
    }
    return out;
  }

  function render(m, role) {
    const S = App.S, title = role === 'val' ? ['VALIDATE', 'Validaciones'] : ['SEQUENCE', 'Jobs secuenciados'];
    const D = data(role);
    if (!D) {
      m.innerHTML = `<div class="ptitle"><h1>${title[0]} <small>${title[1]}</small></h1></div>
        <div class="empty">El archivo de ${role === 'val' ? 'Validación' : 'Secuencia'} aún no está cargado.<br><span class="muted small">Ve a <b>Archivos</b> y presiona <b>Cargar archivos</b>.</span></div>`;
      return;
    }
    const F = st(role);
    const comps = D.cComp >= 0 ? [...D.rows.reduce((mm, r) => { const k = App.normComp(r.v[D.cComp]); if (k) mm.set(k, (mm.get(k) || 0) + 1); return mm; }, new Map())] : [];
    const uniq = (c) => (c < 0 ? null : new Set(D.rows.map((r) => r.v[c]).filter((x) => x.trim())).size);
    m.innerHTML = `
      <div class="ptitle"><h1>${title[0]} <small>${title[1]}</small></h1>
        <span class="muted">${D.files.length > 1 ? `${D.files.map(esc).join(' + ')} · ${D.files.length} archivos juntos` : `${esc(D.name)} · hoja <b>${esc(D.sheet)}</b>`} · todas las columnas y filas, tal como están en el Excel</span>
        <span class="sp"></span>${role === 'val' ? '<button class="btn" id="hCompl" title="Agregar validación de otro archivo con las mismas columnas">⇪ Cargar validación complementaria</button><button class="btn" id="hDay">📅 Exportar por fecha</button>' : ''}<button class="btn" id="hExp">Exportar lo filtrado</button></div>
      <div class="kpis">
        <div class="kpi"><span>Filas en la hoja</span><b>${fmtN(D.rows.length)}</b></div>
        <div class="kpi"><span>Mostrando</span><b id="hN">—</b></div>
        <div class="kpi"><span>Columnas</span><b>${fmtN(D.heads.length)}</b></div>
        <div class="kpi"><span>Jobs distintos</span><b>${uniq(D.cJob) == null ? '—' : fmtN(uniq(D.cJob))}</b></div>
        <div class="kpi"><span>Contenedores distintos</span><b>${uniq(D.cCont) == null ? '—' : fmtN(uniq(D.cCont))}</b></div>
      </div>
      <div class="filters">
        <input class="input grow" id="hq" placeholder="Buscar en todas las columnas (job, contenedor, usuario…)" value="${esc(F.q)}">
        ${comps.length ? `<div class="rchips"><span class="rchip ${F.comp ? '' : 'on'}" data-c="">Todos<b>${fmtN(D.rows.length)}</b></span>${comps.map(([k, n]) => `<span class="rchip ${F.comp === k ? 'on' : ''}" data-c="${k}">${App.COMP_N[k] || esc(k)}<b>${fmtN(n)}</b></span>`).join('')}</div>` : ''}
        <span class="sp"></span><button class="btn sm" id="hr">Quitar filtros</button>
      </div>
      <div class="tw hw" id="hw"></div><div class="pager" id="hp"></div>`;
    const draw = () => {
      const rows = filtered(D, F);
      const pages = Math.max(1, Math.ceil(rows.length / PAGE)); F.page = Math.min(F.page, pages - 1);
      const view = rows.slice(F.page * PAGE, (F.page + 1) * PAGE);
      const q = F.q.trim().toUpperCase();
      $('#hN').textContent = fmtN(rows.length);
      const body = view.map((r) => `<tr><td class="rn">${r.n}</td>${r.v.map((x) => `<td class="${q && x.toUpperCase().includes(q) ? 'hit' : ''}">${esc(x)}</td>`).join('')}</tr>`).join('');
      if (!$('#hw .t')) {
        $('#hw').innerHTML = `<table class="t raw"><thead><tr><th>Fila</th>${D.heads.map((h, c) => `<th data-s="${c}">${esc(h)}<span class="so">${F.sort && F.sort.c === c ? (F.sort.d > 0 ? '▲' : '▼') : ''}</span></th>`).join('')}</tr>
          <tr class="fl"><th></th>${D.heads.map((h, c) => D.opts[c]
            ? `<th><select class="input ${F.f[c] ? 'on' : ''}" data-f="${c}"><option value="">Todos</option>${D.opts[c].map((o) => `<option value="${esc(o)}" ${F.f[c] === o ? 'selected' : ''}>${o === '' ? '(vacío)' : esc(o)}</option>`).join('')}</select></th>`
            : `<th><input class="input ${F.f[c] ? 'on' : ''}" data-f="${c}" placeholder="Contiene…" value="${esc(F.f[c] || '')}"></th>`).join('')}</tr></thead><tbody></tbody></table>`;
        bindHead();
      }
      $('#hw tbody').innerHTML = body || `<tr><td colspan="${D.heads.length + 1}" class="muted" style="padding:24px;text-align:center">Ninguna fila coincide con los filtros.</td></tr>`;
      const tot = `${fmtN(rows.length)} de ${fmtN(D.rows.length)} filas`;
      $('#hp').innerHTML = pages > 1 ? `<button class="btn sm" id="hpv" ${F.page ? '' : 'disabled'}>‹</button><span>Hoja ${F.page + 1} de ${pages} · ${tot}</span><button class="btn sm" id="hnx" ${F.page < pages - 1 ? '' : 'disabled'}>›</button>` : `<span>${tot}</span>`;
      if (pages > 1) { $('#hpv').onclick = () => { F.page--; draw(); $('#hw').scrollTop = 0; }; $('#hnx').onclick = () => { F.page++; draw(); $('#hw').scrollTop = 0; }; }
      fit();
    };
    function bindHead() {
      $$('#hw [data-f]').forEach((el) => {
        let t;
        const set = () => { const v = el.value; if (v === '') delete F.f[el.dataset.f]; else F.f[el.dataset.f] = v; el.classList.toggle('on', v !== ''); F.page = 0; draw(); };
        if (el.tagName === 'SELECT') el.onchange = set; else el.oninput = () => { clearTimeout(t); t = setTimeout(set, 200); };
      });
      $$('#hw th[data-s]').forEach((th) => (th.onclick = () => {
        const c = +th.dataset.s;
        F.sort = !F.sort || F.sort.c !== c ? { c, d: 1 } : F.sort.d > 0 ? { c, d: -1 } : null;
        $$('#hw th[data-s] .so').forEach((s, i) => (s.textContent = F.sort && F.sort.c === i ? (F.sort.d > 0 ? '▲' : '▼') : ''));
        F.page = 0; draw();
      }));
    }
    let qt;
    $('#hq').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { F.q = e.target.value; F.page = 0; draw(); }, 200); };
    $$('.rchip').forEach((c) => (c.onclick = () => { F.comp = c.dataset.c; F.page = 0; $$('.rchip').forEach((x) => x.classList.toggle('on', x === c)); draw(); }));
    $('#hr').onclick = () => { Object.assign(F, { q: '', f: {}, sort: null, page: 0, comp: '' }); render(m, role); };
    $('#hExp').onclick = () => exportRows(role);
    if ($('#hDay')) $('#hDay').onclick = () => exportByDate(role);
    if ($('#hCompl')) $('#hCompl').onclick = () => App.integrar.complement();
    draw();
  }

  function fit() {
    const tw = $('#hw'); if (!tw) return;
    const pg = $('#hp'), ft = $('.foot');
    tw.style.height = `${Math.max(240, window.innerHeight - tw.getBoundingClientRect().top - (pg ? pg.offsetHeight : 0) - (ft ? ft.offsetHeight : 0) - 24)}px`;
  }
  window.addEventListener('resize', fit);

  /** Exporta lo filtrado (o todo) a un libro nuevo; el archivo original no se toca */
  /** Exportar la validación de UN día (y opcionalmente de un componente): no descarga todo */
  async function exportByDate(role) {
    const D = data(role); if (!D) return toast('El archivo no está cargado', 'warn');
    if (D.cFecha < 0) return toast('No se encontró la columna Fecha', 'warn');
    const kv = App.integrar.kv;
    const dayKey = (r) => kv('fecha', r.raw[D.cFecha]);
    const days = [...D.rows.reduce((m, r) => { const k = dayKey(r); if (k) m.set(k, (m.get(k) || 0) + 1); return m; }, new Map())];
    const toIso = (k) => { const [d, mo, y] = k.split('/'); return `${y}-${mo}-${d}`; };
    days.sort((a, b) => toIso(b[0]).localeCompare(toIso(a[0])));
    if (!days.length) return toast('No hay fechas en la validación', 'warn');
    const comps = D.cComp >= 0 ? [...new Set(D.rows.map((r) => App.normComp(r.v[D.cComp])).filter(Boolean))] : [];
    const F = await App.modal({ title: 'Exportar validación por fecha', body: `
      <div class="pr-grid">
        <label>Componente<select class="input" id="xdC" style="min-width:180px"><option value="">Todos</option>${comps.map((c) => `<option value="${c}">${App.COMP_N[c] || esc(c)}</option>`).join('')}</select></label>
        <label>Fecha de validación<input class="input" type="date" id="xdD" value="${toIso(days[0][0])}"></label>
      </div>
      <div class="note" id="xdN" style="margin-top:12px"></div>
      <p class="muted small">Fechas con capturas: ${days.slice(0, 8).map(([k, n]) => `${k} (${fmtN(n)})`).join(' · ')}${days.length > 8 ? ' …' : ''}</p>`,
      onOpen: (el) => {
        const upd = () => { const c = $('#xdC', el).value, iso = $('#xdD', el).value; const [y, mo, d] = iso.split('-'); const k = `${d}/${mo}/${y}`; const n = D.rows.filter((r) => dayKey(r) === k && (!c || App.normComp(r.v[D.cComp]) === c)).length; $('#xdN', el).innerHTML = iso ? `<b>${fmtN(n)}</b> filas de ${c ? App.COMP_N[c] || c : 'todos los componentes'} el ${k}` : 'Elige una fecha'; };
        $('#xdC', el).onchange = upd; $('#xdD', el).oninput = upd; upd();
      },
      buttons: [{ t: 'Cancelar', v: null }, { t: 'Exportar', cls: 'primary', fn: (el) => { const iso = $('#xdD', el).value; if (!iso) { toast('Elige una fecha', 'warn'); return false; } const [y, mo, d] = iso.split('-'); return { k: `${d}/${mo}/${y}`, c: $('#xdC', el).value }; } }] });
    if (!F) return;
    const rows = D.rows.filter((r) => dayKey(r) === F.k && (!F.c || App.normComp(r.v[D.cComp]) === F.c));
    if (!rows.length) return toast(`No hay validación ${F.c ? `de ${App.COMP_N[F.c] || F.c} ` : ''}el ${F.k}`, 'warn', 5000);
    return exportRows(role, false, rows.map((r) => ({ v: r.v.slice(0, D.nHead) })), `QORVEX Validacion ${F.c ? `${App.COMP_N[F.c] || F.c} ` : ''}${F.k.replace(/\//g, '-')}.xlsx`);
  }

  async function exportRows(role, all = false, given = null, name = '') {
    const D = data(role); if (!D) return toast('El archivo no está cargado', 'warn');
    const rows = given || (all ? D.rows : filtered(D, st(role)));
    if (!rows.length) return toast('No hay filas para exportar', 'warn');
    const d = new Date(), p2 = App.pad;
    const fname = name || `QORVEX ${role === 'val' ? 'Validacion' : 'Secuencia'} ${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}-${p2(d.getMinutes())}.xlsx`;
    let handle = null;
    if (typeof window.showSaveFilePicker === 'function') {
      try { handle = await window.showSaveFilePicker({ suggestedName: fname, types: [{ description: 'Libro de Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] }); }
      catch (e) { if (e.name === 'AbortError') return; toast(App.fs.explain(e), 'err'); return; }
    }
    const heads = given && name ? D.heads.slice(0, D.nHead) : D.heads;
    const ws = XLSX.utils.aoa_to_sheet([heads, ...rows.map((r) => r.v)]);
    heads.forEach((_, c) => { ws[XLSX.utils.encode_cell({ r: 0, c })].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '0A1A3A' } } }; });
    ws['!cols'] = heads.map((h) => ({ wch: Math.max(10, String(h).length + 2) }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: heads.length - 1 } }) };
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, role === 'val' ? 'Validacion' : 'Secuencia');
    const bytes = App.xl.serialize(wb, 'export.xlsx');
    try {
      if (handle) await App.fs.writeFile(handle, bytes); else XLSX.writeFile(XLSX.read(bytes, { type: 'array' }), fname);
      toast(`Exportadas ${fmtN(rows.length)} filas`, 'ok', 5000);
    } catch (e) { toast(`No se pudo exportar: ${e.message}`, 'err', 6000); }
  }

  App.hojas = { render, exportRows, exportByDate, data };
})(window.App);
