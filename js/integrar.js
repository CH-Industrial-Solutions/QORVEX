/* =====================================================================
   integrar.js — "Integrar capturas exportadas" (de QORVEX MOBILE sin carpeta)
   - Lee uno o varios archivos QORVEX_captura_….xlsx (hojas Validacion y/o
     Secuencia, mismas columnas que los Excel de trabajo + ID).
   - AGREGA al final de Validación o Secuencia solo las filas que no
     existen (misma Fecha, Hora, Job, Contenedor, Componente y No. Empleado).
   - Nunca borra ni cambia filas existentes. Se escribe en el Excel al
     presionar "Guardar en Excel", con el guardado seguro de siempre.
   ===================================================================== */
(function (App) {
  const { $, esc, fmtN, toast, normTxt } = App;
  const KEY = ['fecha', 'hora', 'job', 'contenedor', 'componente', 'noempleado'];
  const p2 = (n) => String(n).padStart(2, '0');

  /** Texto comparable: fechas y horas de Excel (número) se pasan a dd/mm/aaaa y hh:mm:ss */
  function kv(h, v) {
    if (v == null) return '';
    if (typeof v === 'number' && h === 'fecha') { const d = new Date(Math.round((v - 25569) * 864e5)); return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; }
    if (typeof v === 'number' && h === 'hora') { const t = Math.round((v % 1) * 86400); return `${p2(Math.floor(t / 3600))}:${p2(Math.floor((t % 3600) / 60))}:${p2(t % 60)}`; }
    let s = String(v).trim().toUpperCase();
    if (h === 'fecha') { const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) s = `${p2(m[1])}/${p2(m[2])}/${m[3]}`; }
    if (h === 'hora') { const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/); if (m) s = `${p2(m[1])}:${m[2]}:${p2(m[3] || 0)}`; }
    if (h === 'job' || h === 'noempleado') { const n = App.normKey(v); if (n) s = n; }
    return s;
  }
  const keyOf = (get) => KEY.map((h) => kv(h, get(h))).join('|');

  /** Lee un archivo exportado: devuelve [{ role, rows:[{normHeader: valor}] }] */
  async function readExport(file) {
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: false });
    const out = [];
    wb.SheetNames.forEach((sn) => {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null });
      const hi = aoa.findIndex((r, i) => i < 15 && (r || []).some((v) => normTxt(v) === 'job'));
      if (hi < 0) return;
      const head = aoa[hi].map(normTxt);
      aoa.slice(hi + 1).forEach((r) => {
        if (!(r || []).some((v) => v != null && String(v).trim() !== '')) return;
        const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i]; });
        const tipo = normTxt(o.tipo), sname = normTxt(sn), fname = normTxt(file.name);
        const role = tipo.startsWith('secu') ? 'seq' : tipo.startsWith('valid') ? 'val' : sname.startsWith('secu') ? 'seq' : sname.startsWith('valid') ? 'val' : fname.includes('secu') ? 'seq' : 'val';
        let g = out.find((x) => x.role === role); if (!g) out.push((g = { role, rows: [] }));
        g.rows.push(o);
      });
    });
    return out;
  }

  /* ---------- IDs: cada archivo agrega en SU rango (Principal 1…, TAB1 1000001…, TAB2 2000001…) ---------- */
  const tabOf = (name) => ((String(name).match(/_(TAB\w*)\.xls/i) || [])[1] || '').toUpperCase();
  function nextIdFor(L) {
    const tab = tabOf(L.name), m = tab.match(/^TAB(\d{1,3})$/), base = m ? Number(m[1]) * 1e6 : 0, top = m ? base + 1e6 : 1e6;
    let max = base;
    // Validación y Secuencia del mismo equipo comparten la numeración
    ['val', 'seq'].forEach((role) => App.srcs(role).filter((X) => tabOf(X.name) === tab).forEach((X) => {
      const ci = X.t.headers.map(normTxt).indexOf('id'); if (ci < 0) return;
      X.t.rows.forEach((row) => { const n = Number(row.v[ci]); if (n > max && n < top) max = n; });
    }));
    return () => ++max;
  }
  /** Selector "Agregar en": archivo destino (principal o el de una tableta) */
  // Solo el archivo PRINCIPAL: los archivos _TAB los escribe únicamente su tableta (evita choques de sincronización)
  const destSel = (role, id) => `<input class="input" id="${id}" value="${esc(App.S.L[role] ? App.S.L[role].name : '')} (principal)" readonly style="min-width:220px">`;
  const destOf = (role) => App.S.L[role];

  /** Agrega filas al final de la hoja del archivo destino (solo en memoria hasta guardar) */
  function append(role, rows, target) {
    const L = target || App.S.L[role], t = L.t, ws = L.wb.Sheets[L.sheet];
    const H = t.headers.map(normTxt);
    // la columna ID se agrega al final si el archivo de trabajo aún no la tiene
    if (!H.includes('id') && rows.some((o) => o.id != null && o.id !== '')) {
      const c = H.length; App.xl.setCell(ws, t.hRow, t.c0 + c, 'ID'); t.headers.push('ID'); H.push('id');
    }
    const at = (row, h) => { const i = H.indexOf(h); return i < 0 ? null : row.v[i]; };
    // no duplicar contra NINGUNA base: Validacion.xlsx ni las de las tabletas
    const have = new Set();
    App.srcs(role).forEach((X) => { const HX = X.t.headers.map(normTxt); X.t.rows.forEach((row) => have.add(keyOf((h) => { const i = HX.indexOf(h); return i < 0 ? null : row.v[i]; }))); });
    let r = Math.max(t.hRow, ...t.rows.map((x) => x.r)), added = 0, dup = 0;
    const nid = H.includes('id') ? nextIdFor(L) : null;
    rows.forEach((o0) => {
      const k = keyOf((h) => o0[h]);
      if (have.has(k)) { dup++; return; }
      const o = nid ? { ...o0, id: nid() } : o0; // ID nuevo en el rango del archivo destino
      r += 1; const v = [];
      H.forEach((h, i) => { const val = o[h] == null ? '' : o[h]; v[i] = val === '' ? null : val; if (val !== '') App.xl.setCell(ws, r, t.c0 + i, val); });
      t.rows.push({ r, v, _L: L }); have.add(k); added++;
    });
    if (added) L.dirty = true;
    return { added, dup, dest: L.name };
  }

  async function open() {
    const S = App.S;
    if (!S.L.val && !S.L.seq) return toast('Primero carga los archivos de Validación y Secuencia', 'warn');
    // ¿En qué archivo se agregan? (si hay tabletas, se elige)
    let dest = { val: S.L.val, seq: S.L.seq };
    if (false) { // los archivos de tableta no reciben importaciones desde el Motor
      const d = await App.modal({ title: 'Integrar capturas exportadas', body: `
        <p>¿En qué archivo se agregan las capturas?</p>
        <div class="pr-grid">${S.L.val ? `<label>Validación → agregar en${destSel('val', 'idV')}</label>` : ''}${S.L.seq ? `<label>Secuencia → agregar en${destSel('seq', 'idS')}</label>` : ''}</div>
        <p class="muted small">Cada fila nueva toma un ID del rango de ese archivo (principal 1…, TAB1 1000001…, TAB2 2000001…).</p>`,
        buttons: [{ t: 'Cancelar', v: null }, { t: 'Elegir archivos…', cls: 'primary', fn: (el) => ({ val: S.L.val && destOf('val', el, 'idV'), seq: S.L.seq && destOf('seq', el, 'idS') }) }] });
      if (!d) return; dest = d;
    }
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.xlsx,.xlsm';
    inp.onchange = async () => {
      const files = [...inp.files]; if (!files.length) return;
      const res = [];
      try {
        await App.busy('Leyendo capturas exportadas…', async () => {
          for (const f of files) {
            const groups = await readExport(f);
            if (!groups.length) { res.push({ f: f.name, msg: 'No tiene una hoja con la columna Job', bad: true }); continue; }
            for (const g of groups) {
              if (!S.L[g.role]) { res.push({ f: f.name, role: g.role, msg: `No está cargado el archivo de ${g.role === 'val' ? 'Validación' : 'Secuencia'}`, bad: true }); continue; }
              const r = append(g.role, g.rows, dest[g.role]);
              if (r.added) { S.dirty[g.role] = true; S.edits.push({ role: g.role, kind: 'import', n: r.added, file: f.name, dest: r.dest }); }
              res.push({ f: f.name, role: g.role, ...r, n: g.rows.length });
            }
          }
        });
      } catch (e) { toast(`No se pudo leer: ${e.message}`, 'err', 6000); return; }
      const tot = res.reduce((a, x) => a + (x.added || 0), 0);
      if (tot && S.result && App.ready()) App.execute(true);
      App.ui.render();
      App.modal({ title: 'Integrar capturas exportadas', wide: true, body: `
        <div class="results">${res.map((x) => `<div class="res ${x.bad ? 'bad' : 'ok'}"><b>${x.bad ? '✗' : '✓'} ${esc(x.f)}${x.role ? ` → ${x.dest ? esc(x.dest) : x.role === 'val' ? 'Validación' : 'Secuencia'}` : ''}</b>
          <span>${x.bad ? esc(x.msg) : `${fmtN(x.added)} filas nuevas agregadas al final · ${fmtN(x.dup)} ya existían (no se duplicaron)`}</span></div>`).join('')}</div>
        ${tot ? '<div class="note">Las filas están listas en memoria. Presiona <b>Guardar en Excel</b> para escribirlas en Validación / Secuencia (con respaldo). No se borra ni se cambia ninguna fila existente.</div>' : '<div class="note">No hubo filas nuevas: todo ya estaba en los Excel.</div>'}`,
        buttons: tot ? [{ t: 'Después' }, { t: 'Guardar en Excel ahora', cls: 'primary', fn: () => { App.ui.saveDialog(); } }] : [{ t: 'Entendido', cls: 'primary' }] });
    };
    inp.click();
  }

  /* ---------- Validación complementaria ----------
     Un Excel extra (otra persona, otro equipo…) que se suma al final de Validación.
     Solo se acepta si las columnas son EXACTAMENTE las de Validación y todas las
     filas son del componente elegido. Si algo no coincide no se agrega nada. */
  const trimTail = (a) => { const o = a.slice(); while (o.length && !o[o.length - 1]) o.pop(); return o; };
  const core = (a) => { const o = trimTail(a); if (o[o.length - 1] === 'id') o.pop(); return o; };
  async function complement() {
    const S = App.S;
    if (!S.L.val) return toast('Primero carga el archivo de Validación', 'warn');
    const L = S.L.val, HP = core(L.t.headers.map(normTxt));
    const CK = ['SWCH', 'SWGDE', 'KEY', 'BCM', 'CLUSTER', 'ARNES'];
    const sel = await App.modal({ title: 'Cargar validación complementaria', wide: true, body: `
      <p>Se agregan al final del archivo principal de Validación las filas que aún no existen (se compara contra todos los archivos de Validación). No se borra ni se cambia nada.</p>
      <div class="pr-grid">
        <label>Componente que trae el archivo<select class="input" id="ccC" style="min-width:200px">${CK.map((c) => `<option value="${c}">${App.COMP_N[c] || c}</option>`).join('')}</select></label>
        <label>Archivo de Excel<input class="input" type="file" id="ccF" accept=".xlsx,.xlsm,.xls"></label>
        <label>Agregar en${destSel('val', 'ccD')}</label>
      </div>
      <div class="note" style="margin-top:12px"><b>Requisitos:</b> mismas columnas que Validación, en el mismo orden (${trimTail(L.t.headers.map((h) => String(h ?? '').trim())).map(esc).join(' · ')}) y todas las filas del componente elegido. Si algo no coincide, el archivo se rechaza completo.</div>`,
      buttons: [{ t: 'Cancelar', v: null }, { t: 'Revisar y agregar', cls: 'primary', fn: (el) => { const f = $('#ccF', el).files[0]; if (!f) { toast('Elige el archivo', 'warn'); return false; } return { c: $('#ccC', el).value, f, L: destOf('val', el, 'ccD') }; } }] });
    if (!sel) return;
    let res;
    try {
      res = await App.busy('Revisando archivo…', async () => {
        const wb = XLSX.read(new Uint8Array(await sel.f.arrayBuffer()), { type: 'array', cellDates: false });
        const rows = [], bad = [];
        let sheets = 0;
        wb.SheetNames.forEach((sn) => {
          const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null });
          const hi = aoa.findIndex((r, i) => i < 15 && (r || []).some((v) => normTxt(v) === 'job'));
          if (hi < 0) return;
          sheets++;
          const head = aoa[hi].map(normTxt), hc = core(head);
          if (hc.join('|') !== HP.join('|')) { bad.push(`Hoja “${sn}”: las columnas no coinciden.<br><small>Validación: ${HP.join(' · ')}<br>Archivo: ${hc.join(' · ') || '(vacío)'}</small>`); return; }
          const body = aoa.slice(hi + 1).filter((r) => (r || []).some((v) => v != null && String(v).trim() !== '')).map((r) => { const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i]; }); return o; });
          const other = body.filter((o) => App.normComp(o.componente) !== sel.c);
          if (other.length) { const ej = [...new Set(other.map((o) => String(o.componente ?? '(vacío)')))].slice(0, 3).join(', '); bad.push(`Hoja “${sn}”: ${fmtN(other.length)} de ${fmtN(body.length)} filas no son ${App.COMP_N[sel.c]} (traen: ${esc(ej)}).`); return; }
          const noJob = body.filter((o) => !App.normKey(o.job)).length;
          if (noJob) { bad.push(`Hoja “${sn}”: ${fmtN(noJob)} filas sin Job.`); return; }
          rows.push(...body);
        });
        if (!sheets) bad.push('El archivo no tiene una hoja con la columna Job.');
        if (bad.length) return { bad };
        const r = append('val', rows, sel.L);
        if (r.added) { S.dirty.val = true; S.edits.push({ role: 'val', kind: 'import', n: r.added, file: sel.f.name, dest: r.dest }); }
        return { ...r, n: rows.length };
      });
    } catch (e) { toast(`No se pudo leer: ${e.message}`, 'err', 6000); return; }
    if (res.bad) return App.modal({ title: 'Archivo rechazado', wide: true, body: `<div class="results">${res.bad.map((b) => `<div class="res bad"><b>✗ ${esc(sel.f.name)}</b><span>${b}</span></div>`).join('')}</div><div class="note">No se agregó ninguna fila. Corrige el archivo y vuelve a intentarlo.</div>` });
    if (res.added && S.result && App.ready()) App.execute(true);
    App.ui.render();
    App.modal({ title: 'Validación complementaria', wide: true, body: `
      <div class="results"><div class="res ok"><b>✓ ${esc(sel.f.name)} → ${esc(res.dest)} · ${App.COMP_N[sel.c]}</b><span>${fmtN(res.added)} filas nuevas agregadas al final · ${fmtN(res.dup)} ya existían (no se duplicaron)</span></div></div>
      ${res.added ? `<div class="note">Las filas están listas en memoria. Presiona <b>Guardar en Excel</b> para escribirlas en ${esc(res.dest)} (con respaldo).</div>` : '<div class="note">No hubo filas nuevas: todo ya estaba en Validación.</div>'}`,
      buttons: res.added ? [{ t: 'Después' }, { t: 'Guardar en Excel ahora', cls: 'primary', fn: () => { App.ui.saveDialog(); } }] : [{ t: 'Entendido', cls: 'primary' }] });
  }

  App.integrar = { open, readExport, append, complement, kv };
})(window.App);
