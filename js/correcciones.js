/* =====================================================================
   correcciones.js — Correcciones_Motor.xlsx
   Los archivos de las tabletas (Validacion_TAB1.xlsx, Secuencia_TAB2.xlsx…)
   SOLO los escribe QORVEX MOBILE. Cuando el Motor corrige una captura que
   vive en uno de ellos, NO toca ese archivo: agrega una fila en su propio
   archivo Correcciones_Motor.xlsx (archivo, ID, campo, valor anterior y
   nuevo). Al cargar, el Motor aplica esas correcciones en memoria encima
   de lo que capturaron las tabletas. Así nunca hay dos equipos escribiendo
   el mismo archivo y OneDrive/SharePoint no genera copias en conflicto.
   El archivo solo crece: nunca se borra ni se cambia una corrección.
   ===================================================================== */
(function (App) {
  const { normTxt, pad } = App;
  const NAME = 'Correcciones_Motor.xlsx', SHEET = 'Correcciones';
  const HEAD = ['Fecha', 'Hora', 'Tipo', 'Archivo', 'ID', 'Fila', 'Job', 'Componente', 'Campo', 'Valor anterior', 'Valor nuevo', 'Equipo'];
  const FIELD = { contenedor: 'cont' };            // Campo (texto) → columna de captura
  const TIPO = { val: 'Validación', seq: 'Secuencia' };
  const C = { file: null, rows: [], pending: [] }; // file: { handle, lastModified }

  const roleOf = (tipo) => (normTxt(tipo).startsWith('secu') ? 'seq' : 'val');
  const idCol = (L) => L.t.headers.map(normTxt).indexOf('id');
  const idOf = (L, row) => { const i = idCol(L); return i >= 0 && row.v[i] != null && row.v[i] !== '' ? row.v[i] : ''; };

  /** Lee Correcciones_Motor.xlsx de la carpeta (si existe) */
  async function load() {
    C.rows = []; C.file = null;
    const f = (App.S.files || []).find((x) => x.name.toLowerCase() === NAME.toLowerCase());
    if (!f) return;
    const raw = await App.fs.readFile(f.handle);
    const wb = App.xl.readWorkbook(raw.bytes, f.name);
    const ws = wb.Sheets[SHEET] || wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const H = (aoa[0] || []).map(normTxt), at = (r, h) => r[H.indexOf(normTxt(h))];
    C.rows = aoa.slice(1).filter((r) => (r || []).some((v) => v != null && v !== '')).map((r) => ({
      fecha: at(r, 'Fecha'), hora: at(r, 'Hora'), tipo: at(r, 'Tipo'), file: at(r, 'Archivo'), id: at(r, 'ID'), fila: at(r, 'Fila'),
      job: at(r, 'Job'), comp: at(r, 'Componente'), campo: at(r, 'Campo'), antes: at(r, 'Valor anterior'), despues: at(r, 'Valor nuevo'), equipo: at(r, 'Equipo'),
    }));
    C.file = { handle: f.handle, lastModified: raw.lastModified, aoa };
  }

  /** Aplica en memoria las correcciones guardadas + las pendientes a las filas de las tabletas */
  function applyTo(role) {
    const X = (App.S.X && App.S.X[role]) || [];
    let ok = 0, miss = 0;
    [...C.rows, ...C.pending].filter((c) => roleOf(c.tipo) === role).forEach((c) => {
      const L = X.find((x) => x.name.toLowerCase() === String(c.file || '').toLowerCase());
      const k = FIELD[normTxt(c.campo)];
      if (!L || !k || L.t.cols[k] == null || L.t.cols[k] < 0) { miss++; return; }
      const ci = idCol(L);
      const row = c.id !== '' && c.id != null && ci >= 0 ? L.t.rows.find((r) => String(r.v[ci]) === String(c.id)) : L.t.rows.find((r) => r.r + 1 === Number(c.fila));
      if (!row) { miss++; return; }
      const i = L.t.cols[k];
      while (row.v.length <= i) row.v.push(null);
      row.v[i] = c.despues === '' ? null : c.despues;
      ok++;
    });
    return { ok, miss };
  }

  /** Nueva corrección (queda pendiente hasta "Guardar en Excel") y se refleja de inmediato en memoria */
  function add(role, L, row, k, v, info) {
    const i = L.t.cols[k], d = new Date();
    const antes = row.v[i];
    while (row.v.length <= i) row.v.push(null);
    row.v[i] = v === '' ? null : v;
    C.pending.push({
      fecha: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`, hora: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
      tipo: TIPO[role], file: L.name, id: idOf(L, row), fila: row.r + 1, job: info.job, comp: info.comp, campo: 'Contenedor',
      antes: antes ?? '', despues: v ?? '', equipo: 'QORVEX (Motor)',
    });
  }
  const count = (role) => C.pending.filter((c) => !role || roleOf(c.tipo) === role).length;

  /** Escribe las correcciones pendientes al final de Correcciones_Motor.xlsx (lo crea si no existe) */
  async function save(doBackup) {
    const res = { role: 'corr', name: NAME, ok: false, msg: '', backup: '' };
    if (!C.pending.length) return null;
    const S = App.S;
    try {
      if (C.file) {
        const lm = await App.fs.lastModified(C.file.handle);
        if (lm !== C.file.lastModified) throw new Error('El archivo se modificó fuera de esta página después de cargarlo. Vuelve a cargar los archivos.');
      }
      if (!(await App.fs.ensurePermission(S.dir))) throw new Error('No se autorizó la escritura en la carpeta.');
      const old = C.file ? C.file.aoa.slice(1).filter((r) => (r || []).some((v) => v != null && v !== '')) : [];
      const H0 = C.file && C.file.aoa[0] && C.file.aoa[0].some((v) => v != null) ? C.file.aoa[0] : HEAD;
      const Hn = H0.map(normTxt);
      const line = (c) => { const m = { fecha: c.fecha, hora: c.hora, tipo: c.tipo, archivo: c.file, id: c.id, fila: c.fila, job: c.job, componente: c.comp, campo: c.campo, valoranterior: c.antes, valornuevo: c.despues, equipo: c.equipo }; return Hn.map((h) => (m[h] ?? '')); };
      const ws = XLSX.utils.aoa_to_sheet([H0, ...old, ...C.pending.map(line)]);
      H0.forEach((_, c) => { const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]; if (cell) cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '0A1A3A' } } }; });
      ws['!cols'] = H0.map((h) => ({ wch: Math.max(10, String(h).length + 4) }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, SHEET);
      const bytes = App.xl.serialize(wb, NAME);
      // verificación: lo anterior se conserva completo y se suman solo las nuevas
      const back = XLSX.utils.sheet_to_json(App.xl.readWorkbook(bytes, NAME).Sheets[SHEET], { header: 1, defval: null }).slice(1).filter((r) => (r || []).some((v) => v != null && v !== ''));
      if (back.length !== old.length + C.pending.length) throw new Error(`Verificación: se esperaban ${old.length + C.pending.length} correcciones y el archivo generado tiene ${back.length}.`);
      if (C.file) {
        if (doBackup) { const cur = await App.fs.readFile(C.file.handle); res.backup = await App.fs.backup(S.dir, NAME, cur.bytes); }
        await App.fs.writeFile(C.file.handle, bytes);
      } else await App.fs.createFile(S.dir, NAME, bytes);
      res.ok = true; res.msg = `${App.fmtN(C.pending.length)} corrección(es) agregadas al final · los archivos de las tabletas no se tocaron`;
      C.pending = [];
      await App.refreshList(); await load();
    } catch (e) {
      res.msg = App.fs.explain(e);
      if (res.backup) { await App.fs.removeBackup(S.dir, res.backup); res.backup = ''; }
    }
    return res;
  }

  const reset = () => { C.pending = []; };
  App.corr = { NAME, load, applyTo, add, count, save, reset, get rows() { return C.rows; } };
})(window.App);
