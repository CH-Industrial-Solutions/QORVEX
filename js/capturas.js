/* =====================================================================
   capturas.js — Validación y Secuencia desde los TXT de la carpeta
   - Cada equipo escribe sus propios archivos, uno por mes:
       Validacion_TAB1_2026-11.txt, Secuencia_TAB2_2026-12.txt, …
       Validacion_MOTOR_2026-11.txt  (lo que el Motor integra)
   - Cada línea trae ID y Movimiento (Alta / Edición / Baja). Al leer se
     toma el ÚLTIMO movimiento de cada ID: una Edición reemplaza al Alta y
     una Baja lo quita. Así los archivos solo crecen y nada se reescribe.
   - Por equipo se arma una tabla en memoria (misma forma que un Excel),
     para que el cruce, las vistas y las exportaciones funcionen igual.
   ===================================================================== */
(function (App) {
  const { normTxt } = App;
  const PRE = { val: 'Validacion', seq: 'Secuencia' };
  const TIPO = { val: 'Validación', seq: 'Secuencia' };
  const MOTOR = 'MOTOR';
  const C = { recs: { val: [], seq: [] }, files: { val: [], seq: [] } };

  const H = App.txt.HEAD, HN = H.map(normTxt);
  const num = (s) => (/^\d+$/.test(String(s).trim()) ? Number(s) : s);

  /** Fecha dd/mm/aaaa + hora → marca de tiempo local */
  function tsOf(f, h) {
    const m = String(f || '').match(/(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})/);
    if (!m) return null;
    let [a, b, c] = m.slice(1).map(Number);
    const d = a > 31 ? new Date(a, b - 1, c) : new Date(c < 100 ? 2000 + c : c, b - 1, a);
    const t = String(h || '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (t) d.setHours(+t[1], +t[2], +(t[3] || 0), 0);
    return d.getTime();
  }

  /** Lee todos los TXT de un tipo y arma una tabla por equipo */
  async function loadRole(role) {
    const S = App.S, dir = S.dir;
    const all = await App.txt.list(dir, App.txt.CAP_RE);
    const mine = all.filter((f) => f.name.match(App.txt.CAP_RE)[1].toLowerCase() === PRE[role].toLowerCase());
    const byDev = new Map();
    mine.forEach((f) => { const m = f.name.match(App.txt.CAP_RE), dev = m[2].toUpperCase(); if (!byDev.has(dev)) byDev.set(dev, []); byDev.get(dev).push({ ...f, ym: `${m[3]}-${m[4]}` }); });
    if (!byDev.has(MOTOR)) byDev.set(MOTOR, []);
    const Ls = [], recs = [], files = [];
    for (const [dev, list] of byDev) {
      list.sort((a, b) => a.ym.localeCompare(b.ym));
      const fold = new Map(); let lm = 0, size = 0, lines = 0;
      for (const f of list) {
        const raw = await App.txt.readText(f.handle);
        lm = Math.max(lm, raw.lastModified); size += raw.size;
        const P = App.txt.parse(raw.text);
        P.rows.forEach((row) => {
          const o = App.txt.objOf(P.head, row), id = String(o.id || '').trim();
          if (!id) return;
          lines++;
          if (normTxt(o.movimiento) === 'baja') fold.delete(id); else { fold.delete(id); fold.set(id, o); } // conserva el orden del último movimiento
        });
        files.push({ name: f.name, dev, ym: f.ym, lastModified: raw.lastModified, size: raw.size, n: P.rows.length });
      }
      const objs = [...fold.values()];
      const aoa = [H, ...objs.map((o) => HN.map((h) => { const v = o[h] ?? ''; return h === 'id' || h === 'lote' ? num(v) : v; }))];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = { SheetNames: ['Captura'], Sheets: { Captura: ws } };
      const t = App.xl.table(ws, App.motor.SPEC.captura, App.motor.ANCHOR.captura);
      const L = { name: `${PRE[role]}_${dev}`, dev, files: list.map((f) => f.name), wb, sheet: 'Captura', t, lastModified: lm || Date.now(), size, lines, extra: true, txt: true, n0: t.rows.length };
      t.rows.forEach((row) => { row._L = L; });
      Ls.push(L);
      objs.forEach((o) => recs.push({ dev, id: o.id, ts: tsOf(o.fecha, o.hora), fecha: o.fecha, hora: o.hora, turno: o.turno, tipo: role, job: o.job, cont: o.contenedor, comp: o.componente, emp: String(o.noempleado || '').toUpperCase(), name: o.nombre, sup: o.supervisor || '' }));
    }
    const motor = Ls.find((L) => L.dev === MOTOR);
    S.L[role] = motor;
    S.X[role] = Ls.filter((L) => L !== motor).sort((a, b) => a.dev.localeCompare(b.dev));
    C.recs[role] = recs; C.files[role] = files;
    S.dirty[role] = false;
  }

  /** Escribe en Validacion_MOTOR_aaaa-mm.txt las filas que el Motor integró (importar / complemento) */
  async function writeNew(role) {
    const L = App.S.L[role];
    const rows = L.t.rows.slice(L.n0);
    if (!rows.length) return { n: 0, name: '' };
    const Hn = L.t.headers.map(normTxt), now = App.txt.nowTxt();
    const lines = rows.map((row) => App.txt.toLine(HN.map((h) => {
      if (h === 'movimiento') return 'Alta';
      if (h === 'registrado') return now;
      if (h === 'tipo') { const i = Hn.indexOf(h), v = i < 0 ? '' : row.v[i]; return v || TIPO[role]; }
      const i = Hn.indexOf(h); const v = i < 0 ? '' : row.v[i];
      return v == null ? '' : h === 'fecha' && typeof v === 'number' ? App.fSerial(v) : v;
    })));
    const name = `${PRE[role]}_${MOTOR}_${App.txt.monthTag()}.txt`;
    if (!(await App.fs.ensurePermission(App.S.dir))) throw new Error('No se autorizó la escritura en la carpeta.');
    await App.txt.append(App.S.dir, name, H, lines);
    L.dirty = false;
    return { n: lines.length, name };
  }

  App.cap = { loadRole, writeNew, PRE, MOTOR, tsOf, get recs() { return C.recs; }, get files() { return C.files; } };
})(window.App);
