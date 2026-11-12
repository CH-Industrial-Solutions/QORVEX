/* =====================================================================
   correcciones.js — Correcciones_Motor.txt (separado por tabulador)
   Los archivos de las tabletas (Validacion_TAB1_2026-11.txt, Secuencia_TAB2_…)
   SOLO los escribe QORVEX MOBILE. Cuando el Motor corrige una captura que
   vive en uno de ellos, NO toca ese archivo: agrega una fila en su propio
   archivo Correcciones_Motor.txt (archivo, ID, campo, valor anterior y
   nuevo). Al cargar, el Motor aplica esas correcciones en memoria encima
   de lo que capturaron las tabletas. Así nunca hay dos equipos escribiendo
   el mismo archivo y OneDrive/SharePoint no genera copias en conflicto.
   El archivo solo crece: nunca se borra ni se cambia una corrección.
   ===================================================================== */
(function (App) {
  const { normTxt, pad } = App;
  const NAME = 'Correcciones_Motor.txt';
  const HEAD = ['Fecha', 'Hora', 'Tipo', 'Archivo', 'ID', 'Fila', 'Job', 'Componente', 'Campo', 'Valor anterior', 'Valor nuevo', 'Equipo'];
  const FIELD = { contenedor: 'cont' };            // Campo (texto) → columna de captura
  const TIPO = { val: 'Validación', seq: 'Secuencia' };
  const C = { file: null, rows: [], pending: [] }; // file: { handle, lastModified }

  const roleOf = (tipo) => (normTxt(tipo).startsWith('secu') ? 'seq' : 'val');
  const idCol = (L) => L.t.headers.map(normTxt).indexOf('id');
  const idOf = (L, row) => { const i = idCol(L); return i >= 0 && row.v[i] != null && row.v[i] !== '' ? row.v[i] : ''; };

  /** Lee Correcciones_Motor.txt de la carpeta (si existe) */
  async function load() {
    C.rows = []; C.file = null;
    const raw = await App.txt.readOpt(App.S.dir, NAME);
    if (!raw) return;
    const P = App.txt.parse(raw.text);
    C.rows = P.rows.map((r) => { const o = App.txt.objOf(P.head, r); return { fecha: o.fecha, hora: o.hora, tipo: o.tipo, file: o.archivo, id: o.id, fila: o.fila, job: o.job, comp: o.componente, campo: o.campo, antes: o.valoranterior, despues: o.valornuevo, equipo: o.equipo }; });
    C.file = { lastModified: raw.lastModified };
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
      antes: antes ?? '', despues: v ?? '', equipo: `QORVEX (Motor)${App.lock && App.lock.who() ? ' · ' + App.lock.who() : ''}`,
    });
  }
  const count = (role) => C.pending.filter((c) => !role || roleOf(c.tipo) === role).length;

  /** Agrega las correcciones pendientes al final de Correcciones_Motor.txt (lo crea si no existe) */
  async function save() {
    const res = { role: 'corr', name: NAME, ok: false, msg: '', backup: '' };
    if (!C.pending.length) return null;
    try {
      if (!(await App.fs.ensurePermission(App.S.dir))) throw new Error('No se autorizó la escritura en la carpeta.');
      const lines = C.pending.map((c) => App.txt.toLine([c.fecha, c.hora, c.tipo, c.file, c.id, c.fila, c.job, c.comp, c.campo, c.antes, c.despues, c.equipo]));
      await App.txt.append(App.S.dir, NAME, HEAD, lines);
      res.ok = true; res.msg = `${App.fmtN(C.pending.length)} corrección(es) agregadas al final · los archivos de las tabletas no se tocaron`;
      C.pending = [];
      await load();
    } catch (e) { res.msg = App.fs.explain(e); }
    return res;
  }

  const reset = () => { C.pending = []; };
  App.corr = { NAME, load, applyTo, add, count, save, reset, get rows() { return C.rows; } };
})(window.App);
