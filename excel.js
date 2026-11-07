/* =====================================================================
   excel.js — lectura y escritura de libros con SheetJS
   Se usa la edición "xlsx-js-style" (SheetJS 0.18.5 + escritura de estilos)
   porque la edición gratuita estándar de SheetJS no escribe colores, y se
   requiere marcar SHORTAGE en rojo pastel.
   LIMITACIÓN: al reescribir un libro se conservan datos, fórmulas (como
   fórmula, sin recalcular) y otras hojas, pero NO se garantiza conservar
   formatos avanzados, formato condicional, validaciones de datos, tablas,
   gráficas, imágenes ni conexiones. Las macros solo se conservan en .xlsm.
   ===================================================================== */
(function (App) {
  const { normTxt, isBlank, $, esc } = App;

  const extOf = (name) => (name.match(/\.(\w+)$/) || [, 'xlsx'])[1].toLowerCase();
  const bookTypeOf = (ext) => (ext === 'xlsm' ? 'xlsm' : ext === 'xls' ? 'biff8' : 'xlsx');

  function readWorkbook(bytes, name) {
    const ext = extOf(name);
    // cellDates:false → las fechas se conservan como número de serie de Excel (evita el desfase de segundos
    // que introduce la conversión de zona horaria al reescribir fechas)
    return XLSX.read(bytes, { type: 'array', cellDates: false, cellStyles: true, cellNF: true, bookVBA: ext === 'xlsm' });
  }

  /** Si el libro tiene varias hojas, pregunta cuál usar (y lo recuerda por archivo) */
  async function pickSheet(wb, fileName, roleLabel, force = false, inSession = '') {
    const names = wb.SheetNames;
    if (names.length === 1) return names[0];
    const memKey = `sheet:${fileName}`;
    const prev = inSession || (await App.store.get(memKey));
    if (!force && prev && names.includes(prev)) return prev; // ya se eligió antes: no volver a preguntar
    const sel = await App.modal({
      title: `Elige la hoja de ${esc(roleLabel)}`,
      body: `<p class="muted">El archivo <b>${esc(fileName)}</b> tiene ${names.length} hojas. ¿Cuál contiene los datos?</p>
        <div class="opt-list">${names.map((n) => `<label class="opt"><input type="radio" name="sh" value="${esc(n)}" ${n === prev ? 'checked' : ''}><span>${esc(n)}</span>
          <small>${rowCount(wb.Sheets[n])} filas</small></label>`).join('')}</div>`,
      buttons: [{ t: 'Cancelar', v: null }, { t: 'Usar esta hoja', cls: 'primary', fn: (el) => {
        const r = $('input[name=sh]:checked', el); if (!r) { App.toast('Elige una hoja', 'warn'); return false; } return r.value;
      } }],
    });
    if (!sel) throw new Error(`No se eligió hoja para ${roleLabel}`);
    await App.store.set(memKey, sel);
    return sel;
  }
  function rowCount(ws) { if (!ws || !ws['!ref']) return 0; const r = XLSX.utils.decode_range(ws['!ref']); return r.e.r - r.s.r + 1; }

  /**
   * Convierte una hoja en tabla localizando columnas por nombre de encabezado.
   * specs: [{ k, names:[...], pos (1-based), req }]
   * Si un encabezado no se encuentra por nombre se usa su posición y se avisa.
   */
  /** ¿Parece un número de job? (para distinguir encabezado de datos cuando se lee por posición) */
  const looksNum = (v) => typeof v === 'number' || /^\s*\d+\s*$/.test(String(v ?? ''));
  function table(ws, specs, anchor, opts = {}) {
    if (!ws || !ws['!ref']) throw new Error('La hoja está vacía');
    const rng = XLSX.utils.decode_range(ws['!ref']);
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    let hIdx = 0;
    if (opts.byPos) {
      // Por posición (no depende del idioma del encabezado): la fila de encabezados es la primera con texto en la columna B
      const cB = 1 - rng.s.c;
      hIdx = -1;
      for (let i = 0; i < Math.min(15, aoa.length); i++) { const v = (aoa[i] || [])[cB]; if (isBlank(v)) continue; hIdx = looksNum(v) ? i - 1 : i; break; }
    } else {
      // Fila de encabezados: la primera (de las 15 primeras) que contenga el encabezado ancla
      for (let i = 0; i < Math.min(15, aoa.length); i++) {
        if ((aoa[i] || []).some((v) => anchor.includes(normTxt(v)))) { hIdx = i; break; }
      }
    }
    const head = (hIdx >= 0 ? aoa[hIdx] || [] : []).map((v) => normTxt(v));
    const cols = {}, warn = [];
    specs.forEach((sp) => {
      if (opts.byPos) { cols[sp.k] = sp.pos - 1 - rng.s.c; return; }
      let i = head.findIndex((h) => h && sp.names.includes(h));
      if (i < 0) {
        i = sp.pos - 1 - rng.s.c;
        const msg = `“${sp.label || sp.k}” no se encontró por nombre; se usa la columna ${XLSX.utils.encode_col(sp.pos - 1)}`;
        if (sp.req) warn.push(msg);
      }
      cols[sp.k] = i;
    });
    const rows = [];
    for (let i = hIdx + 1; i < aoa.length; i++) {
      const v = aoa[i] || [];
      if (v.every(isBlank)) continue;
      rows.push({ r: rng.s.r + i, v });
    }
    return { rng, hRow: rng.s.r + hIdx, headers: (hIdx >= 0 && aoa[hIdx]) || [], cols, warn, rows, c0: rng.s.c };
  }

  /** Valor de una columna de la fila */
  const val = (t, row, k) => { const i = t.cols[k]; return i == null || i < 0 ? null : row.v[i] ?? null; };

  function serialize(wb, name) {
    const ext = extOf(name);
    const out = XLSX.write(wb, { type: 'array', bookType: bookTypeOf(ext), bookVBA: ext === 'xlsm', cellStyles: true, compression: true });
    return new Uint8Array(out);
  }

  /** Celda con valor (y estilo opcional) en coordenadas absolutas; amplía el rango si hace falta */
  function setCell(ws, r, c, v, style, comment, numFmt) {
    const ref = XLSX.utils.encode_cell({ r, c });
    let cell;
    if (isBlank(v)) cell = { t: 'z' };
    else if (v instanceof Date) cell = { t: 'd', v, z: 'dd/mm/yyyy' };
    else if (typeof v === 'number') { cell = { t: 'n', v }; if (numFmt) cell.z = numFmt; }
    else if (typeof v === 'boolean') cell = { t: 'b', v };
    else cell = { t: 's', v: String(v) };
    if (style) cell.s = style;
    if (comment) { cell.c = [{ a: 'QORVEX', t: comment }]; cell.c.hidden = true; }
    if (cell.t === 'z' && !style && !comment) delete ws[ref]; else ws[ref] = cell;
    const rg = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    if (r > rg.e.r) rg.e.r = r; if (c > rg.e.c) rg.e.c = c;
    ws['!ref'] = XLSX.utils.encode_range(rg);
  }

  App.xl = { extOf, readWorkbook, pickSheet, table, val, serialize, setCell, rowCount, looksNum };
})(window.App);
