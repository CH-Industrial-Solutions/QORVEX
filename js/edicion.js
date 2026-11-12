/* =====================================================================
   edicion.js — editar celdas desde la pantalla Planes
   Cada columna sabe de qué archivo sale; el cambio se aplica en memoria a
   ESE archivo y se marca como pendiente. Solo los archivos con cambios se
   escriben al guardar.
     AOR, JOB, LS, Cia ............ Planes
     Arnés / ID-… ................. Validación (job + componente)
     Sec-… ........................ Secuencia (job + componente)
     Status, Start Date ........... Planes (vienen del archivo de Planes)
     Pull ......................... Pulls
     QY y Estado se calculan: no se editan.
   ===================================================================== */
(function (App) {
  const { $, esc, toast, normKey, normTxt, show, pad } = App;
  const FILE_N = { planes: 'Planes', val: 'Validación', seq: 'Secuencia', pulls: 'Pulls' };
  const BASE = ['aor', 'job', 'ls', 'cia'];

  function target(k) {
    if (BASE.includes(k)) return { role: 'planes' };
    const c = App.motor.CALC.find((x) => x.k === k);
    if (c && c.src !== 'count') return { role: c.src, comp: c.comp };
    if (k === 'status' || k === 'start') return { role: 'planes' };
    if (k === 'pull') return { role: 'pulls' };
    return null;
  }
  const editable = (k) => !!target(k);

  /** Cambia un valor en la hoja en memoria y en la tabla leída */
  function setVal(L, row, k, v) {
    const t = L.t, i = t.cols[k];
    if (i == null || i < 0) throw new Error(`No se ubicó la columna “${k}” en ${L.name}`);
    App.xl.setCell(L.wb.Sheets[L.sheet], row.r, t.c0 + i, v, null, null, k === 'start' && typeof v === 'number' ? 'dd/mm/yyyy' : null);
    while (row.v.length <= i) row.v.push(null);
    row.v[i] = v;
  }
  /** Agrega una fila al final de la hoja (para capturas que no existían) */
  function appendRow(L, keys, extra) {
    const t = L.t;
    const r = (t.rows.length ? Math.max(...t.rows.map((x) => x.r)) : t.hRow) + 1;
    const row = { r, v: [] }; t.rows.push(row);
    Object.entries(keys).forEach(([k, v]) => setVal(L, row, k, v));
    const H = t.headers.map((h) => normTxt(h)), used = Object.values(t.cols);
    Object.entries(extra || {}).forEach(([h, v]) => {
      const i = H.indexOf(h);
      if (i >= 0 && !used.includes(i)) { App.xl.setCell(L.wb.Sheets[L.sheet], r, t.c0 + i, v); while (row.v.length <= i) row.v.push(null); row.v[i] = v; }
    });
    return row;
  }
  // Números se guardan como número; contenedores y jobs en mayúsculas; Status, LS y Cia tal como se escriben
  const coerce = (s, k) => { const v = String(s ?? '').trim(); if (!v) return ''; if (/^\d+$/.test(v) && v.length < 15 && !/^0\d/.test(v)) return Number(v); return ['status', 'ls', 'cia'].includes(k) ? v : v.toUpperCase(); };
  const same = (a, b) => String(a ?? '').trim().toUpperCase() === String(b ?? '').trim().toUpperCase();
  const isoOf = (n) => { const d = new Date(Math.round((n - 25569) * 864e5)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
  const serialOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5); };

  /** Texto de lo que va a pasar, para mostrarlo antes de confirmar */
  function plan(x, k) {
    const S = App.S, tg = target(k);
    if (!tg) return null;
    if (tg.role === 'planes') return { tg, msg: `Se cambia en <b>Planes</b> (fila ${x.r + 1}).` };
    if (tg.role === 'val' || tg.role === 'seq') {
      const e = S.result.idx[tg.role].m.get(`${x.jobKey}|${tg.comp}`);
      const name = S.L[tg.role].name;
      if (e && e.rows.length) {
        // dónde vive cada captura del contenedor mostrado: archivo + ID
        const rows = pick(e, tg.role);
        const where = rows.map((rw) => { const L = rw._L || S.L[tg.role], ci = L.t.headers.map(normTxt).indexOf('id'), id = ci >= 0 ? rw.v[ci] : null; return `<b>${esc(L.name)}</b> fila ${rw.r + 1}${id != null && id !== '' ? ` · ID ${esc(show(id))}` : ''}${L.extra ? ` <span class="muted">(captura de tableta: se registra en <b>${App.corr.NAME}</b>, el archivo de la tableta no se toca)</span>` : ''}`; });
        return { tg, e, msg: `Se actualiza el contenedor del job ${esc(show(x.base.job))} · ${App.COMP_N[tg.comp]} en: ${where.join('; ')}.${e.rows.length > rows.length ? ` <span class="muted">(${e.rows.length} capturas en total; solo se cambian las del contenedor mostrado)</span>` : ''}` };
      }
      return { tg, e: null, msg: `No hay captura en <b>${esc(name)}</b>: se agrega una fila nueva con el job ${esc(show(x.base.job))} · ${App.COMP_N[tg.comp]}.` };
    }
    return { tg, msg: `Se cambia en la lista de <b>Pulls</b> (job ${esc(show(x.base.job))}).` };
  }

  /** Filas de captura que se cambian: las del contenedor que se muestra en DATA */
  function pick(e, role) {
    const shownC = e.conts[0];
    let rows = shownC == null ? [e.rows[0]] : e.rows.filter((rw) => same(App.xl.val((rw._L || App.S.L[role]).t, rw, 'cont'), shownC));
    if (!rows.length) rows = [e.rows[0]];
    return rows;
  }

  function open(x, k, label) {
    if (!App.lock.need()) return;
    const S = App.S;
    if (!S.result) return;
    const p = plan(x, k);
    if (!p) return toast(`${label} se calcula; no se edita directamente`, 'info');
    if (p.block) return toast(p.block, 'warn', 5000);
    if (!S.L[p.tg.role]) return toast(`No está cargado el archivo de ${FILE_N[p.tg.role]}`, 'warn');
    const cur = BASE.includes(k) ? x.base[k] : x.out[k];
    const shown = cur === App.motor.SHORT || cur === App.motor.PEND ? '' : cur;
    const isDate = k === 'start';
    App.modal({
      title: `Editar ${esc(label)} · job ${esc(show(x.base.job))}`,
      body: `<div class="ed-now">Valor actual: <b>${isDate && typeof cur === 'number' ? App.fSerial(cur) : esc(show(cur)) || '—'}</b></div>
        ${isDate ? `<input class="input" type="date" id="edv" value="${typeof cur === 'number' ? isoOf(cur) : ''}" style="width:100%">`
          : `<input class="input" id="edv" value="${esc(show(shown))}" style="width:100%" autocomplete="off">`}
        <p class="note" style="margin-top:12px">${p.msg}${['val', 'seq', 'pulls'].includes(p.tg.role) ? '<br>Déjalo vacío para quitar el contenedor.' : ''}</p>`,
      onOpen: (el) => { const i = $('#edv', el); i.focus(); if (i.select) i.select(); i.onkeydown = (e) => { if (e.key === 'Enter') $('.m-f .btn.primary', el).click(); }; },
      buttons: [{ t: 'Cancelar' }, { t: 'Aplicar cambio', cls: 'primary', fn: (el) => {
        const raw = $('#edv', el).value;
        let v = isDate ? (raw ? serialOf(raw) : '') : coerce(raw, k);
        if (BASE.includes(k) && k !== 'cia' && v === '') { toast('Este dato no puede quedar vacío', 'warn'); return false; }
        if (k === 'job' && !normKey(v)) { toast('Job no válido', 'warn'); return false; }
        if (same(v, shown) && !(isDate && v === cur)) { toast('Sin cambios', 'info'); return; }
        apply(x, k, p, v, cur, label);
      } }],
    });
  }

  function apply(x, k, p, v, before, label) {
    const S = App.S, role = p.tg.role;
    if (role === 'planes') {
      const L = S.L.planes, row = L.t.rows.find((rw) => rw.r === x.r);
      setVal(L, row, k, v); S.planesDirty = true;
    } else if (role === 'val' || role === 'seq') {
      const L = S.L[role];
      if (p.e && p.e.rows.length) {
        // cada fila se cambia en SU archivo (principal o el de la tableta)
        // Archivos de tableta (_TAB): NO se escriben desde el Motor; la corrección va a Correcciones_Motor.xlsx
        const files = new Set(), viaCorr = new Set();
        pick(p.e, role).forEach((rw) => {
          const RL = rw._L || L;
          if (RL.extra) { App.corr.add(role, RL, rw, 'cont', v, { job: show(x.base.job), comp: App.COMP_N[p.tg.comp] || p.tg.comp }); viaCorr.add(RL.name); }
          else { setVal(RL, rw, 'cont', v); RL.dirty = true; files.add(RL.name); }
        });
        S.dirty[role] = true;
        if (files.size) S.edits.push({ ts: Date.now(), role, job: show(x.base.job), col: label, before: show(before), after: show(v), file: [...files].join(', ') });
        if (viaCorr.size) S.edits.push({ ts: Date.now(), role, job: show(x.base.job), col: label, before: show(before), after: show(v), file: App.corr.NAME, corr: true });
        App.execute(true);
        const where = [...files, ...(viaCorr.size ? [`${App.corr.NAME} (captura de ${[...viaCorr].join(', ')})`] : [])];
        toast(`Cambio aplicado en ${where.join(', ')} · pendiente de guardar`, 'ok', 5000);
        App.ui.render();
        return;
      } else {
        if (v === '') return toast('No hay captura que quitar', 'info');
        let lbl = App.COMP_N[p.tg.comp];
        for (const [key, e] of S.result.idx[role].m) if (key.endsWith(`|${p.tg.comp}`) && e.label) { lbl = e.label; break; }
        const d = new Date();
        L.dirty = true;
        appendRow(L, { job: x.base.job, cont: v, comp: lbl }, {
          fecha: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`, hora: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
          tipo: role === 'val' ? 'Validación' : 'Secuencia', nombre: 'QORVEX', editado: 'QORVEX',
        });
      }
      S.dirty[role] = true;
    } else if (role === 'pulls') {
      const mine = S.pulls.filter((q) => normKey(q.job) === x.jobKey);
      if (v === '') S.pulls = S.pulls.filter((q) => !mine.includes(q));
      else if (mine.length) mine[0].cont = String(v);
      else S.pulls.push({ id: S.nextPullId++, job: x.base.job, cont: String(v), com: 'Editado en Planes' });
      S.pullsDirty = true;
    }
    S.edits.push({ ts: Date.now(), role, job: show(x.base.job), col: label, before: show(before), after: show(v) });
    App.execute(true);
    toast(`Cambio aplicado en ${FILE_N[role]} · pendiente de guardar`, 'ok');
    App.ui.render();
  }

  App.edit = { open, editable, FILE_N };
})(window.App);
