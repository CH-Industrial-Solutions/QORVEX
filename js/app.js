/* =====================================================================
   app.js — estado de la sesión, carga de archivos y guardado seguro
   ===================================================================== */
(function (App) {
  const { toast, normKey, isBlank } = App;

  const ROLES = [
    { k: 'planes', t: 'Planes generales', spec: 'planes', guess: /plan/i, write: true, manual: true },
    { k: 'val', t: 'Validación', spec: 'captura', guess: /valid/i, multi: true, txt: true },
    { k: 'seq', t: 'Secuencia', spec: 'captura', guess: /secu/i, multi: true, txt: true },
    { k: 'pulls', t: 'Pulls', spec: 'pulls', guess: /pull/i, write: true, optional: true },
  ];

  /* Estado en memoria durante la sesión (las referencias a archivos se conservan aquí) */
  const S = {
    dir: null, savedDir: null, files: [], roleFile: {},
    L: {},            // por rol: { name, handle, wb, sheet, t, lastModified }
    pulls: [], pullsDirty: false, nextPullId: 1,
    result: null, planesDirty: false,
    dirty: {}, edits: [],   // cambios pendientes por archivo (val, seq) y bitácora de ediciones
    xFile: { val: [], seq: [] }, xOff: { val: [], seq: [] }, // archivos adicionales elegidos / quitados a mano
    X: { val: [], seq: [] }, // bases de cada tableta (Validacion_TAB1.xlsx, …): solo lectura, se juntan en el cruce
  };
  const TAB_RE = /_TAB\w*\.xls/i;
  /** Validación o Secuencia: archivo principal + bases de las tabletas */
  const srcs = (role) => [S.L[role], ...((S.X && S.X[role]) || [])].filter(Boolean);
  const srcT = (role) => srcs(role).map((L) => L.t);
  const runCruce = () => App.motor.run({ planes: S.L.planes.t, val: srcT('val'), seq: srcT('seq'), pulls: S.pulls });
  App.S = S; App.ROLES = ROLES;

  /* ---------- Carpeta ---------- */
  async function init() {
    if (!App.fs.supported()) return App.ui.render();
    S.savedDir = (await App.store.get('dir')) || null;
    App.ui.render();
  }
  async function connect(useSaved, stay) {
    try {
      let dir;
      if (useSaved && S.savedDir) {
        if (!(await App.fs.ensurePermission(S.savedDir))) return toast('No se autorizó el acceso a la carpeta', 'warn');
        dir = S.savedDir;
      } else dir = await App.fs.pickFolder();
      S.dir = dir; S.savedDir = dir; await App.store.set('dir', dir);
      Object.assign(S, { L: {}, X: { val: [], seq: [] }, xFile: { val: [], seq: [] }, xOff: { val: [], seq: [] }, pulls: [], pullsDirty: false, result: null, planesDirty: false, dirty: {}, edits: [] });
      App.corr.reset();
      await refreshList();
      const mem = (await App.store.get(`roles:${dir.name}`)) || {};
      ROLES.forEach((r) => {
        if (r.txt) { S.roleFile[r.k] = ''; return; } // Validación y Secuencia: TXT de las tabletas (capturas.js)
        const keep = mem[r.k] && S.files.some((f) => f.name === mem[r.k]);
        // Validación/Secuencia: el principal es el que no es de tableta (Validacion.xlsx); los _TAB se suman solos
        const cand = S.files.filter((f) => r.guess.test(f.name) && !/^qorvex/i.test(f.name)).sort((a, b) => a.name.length - b.name.length);
        const guess = cand.find((f) => !(r.multi && TAB_RE.test(f.name))) || cand[0];
        S.roleFile[r.k] = keep ? mem[r.k] : (guess || {}).name || '';
        if (r.multi) {
          // archivos adicionales: los elegidos antes + los _TAB de la carpeta (salvo los que se quitaron a mano)
          const off = ((mem._xoff || {})[r.k] || []).filter((n) => S.files.some((f) => f.name === n));
          const auto = S.files.filter((f) => r.guess.test(f.name) && TAB_RE.test(f.name) && !/^qorvex/i.test(f.name)).map((f) => f.name);
          const list = [...((mem._x || {})[r.k] || []), ...auto].filter((n, i, a) => a.indexOf(n) === i && n !== S.roleFile[r.k] && !off.includes(n) && S.files.some((f) => f.name === n));
          S.xFile[r.k] = list; S.xOff[r.k] = off;
        }
      });
      await App.cfg.load();
      await App.lock.enter();
      // carpeta nueva: se crea Config_QORVEX.json de cero (turnos por defecto, sin supervisores ni usuarios)
      if (!App.cfg.loaded && App.lock.canEdit()) { try { await App.cfg.save(App.cfg.get()); toast('Carpeta nueva: se creó Config_QORVEX.json. Da de alta supervisores, usuarios y metas en CONFIG.', 'ok', 7000); } catch (e) { toast(`No se pudo crear Config_QORVEX.json: ${e.message}`, 'warn', 6000); } }
      if (!stay) App.ui.go('files');
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return; // el usuario cerró el selector
      toast(App.fs.explain(e), 'err');
    }
  }
  async function refreshList() { S.files = await App.fs.listExcel(S.dir); }

  /* ---------- Carga ---------- */
  async function loadRole(role, forceSheet = false) {
    const r = ROLES.find((x) => x.k === role);
    if (r.txt) {
      await App.cap.loadRole(role);
      // correcciones del Motor a capturas de las tabletas (Correcciones_Motor.txt), aplicadas en memoria
      try { await App.corr.load(); App.corr.applyTo(role); } catch (e) { console.warn(e); toast(`${App.corr.NAME}: ${e.message}`, 'warn', 6000); }
      return;
    }
    const name = S.roleFile[role];
    if (!name) { delete S.L[role]; return; }
    const f = S.files.find((x) => x.name === name);
    if (!f) throw new Error(`No se encontró ${name} en la carpeta`);
    const raw = await App.fs.readFile(f.handle);
    let wb;
    try { wb = App.xl.readWorkbook(raw.bytes, name); } catch (e) { throw new Error(`${name}: no se pudo leer como Excel (${e.message})`); }
    const prevSheet = S.L[role] && S.L[role].name === name ? S.L[role].sheet : '';
    const sheet = await App.xl.pickSheet(wb, name, r.t, forceSheet, prevSheet);
    const t = App.xl.table(wb.Sheets[sheet], App.motor.SPEC[r.spec], App.motor.ANCHOR[r.spec], role === 'planes' ? App.motor.PLANES_POS : {});
    S.L[role] = { name, handle: f.handle, wb, sheet, t, lastModified: raw.lastModified, size: raw.size };
    t.rows.forEach((row) => { row._L = S.L[role]; });
    S.dirty[role] = false;
    if (r.multi) {
      await loadExtras(role);
      // correcciones del Motor a capturas de las tabletas (Correcciones_Motor.xlsx), aplicadas en memoria
      try { await App.corr.load(); App.corr.applyTo(role); } catch (e) { console.warn(e); toast(`${App.corr.NAME}: ${e.message}`, 'warn', 6000); }
    }
    if (role === 'pulls') {
      S.pulls = t.rows.map((row) => ({ id: S.nextPullId++, job: App.xl.val(t, row, 'job'), cont: App.xl.val(t, row, 'cont'), com: App.xl.val(t, row, 'com') ?? '' }));
      S.pullsDirty = false;
    }
    if (role === 'planes') { S.result = null; S.planesDirty = false; }
  }

  /** Bases de las tabletas: los demás archivos de Validación/Secuencia de la carpeta (solo lectura) */
  const saveRoles = () => App.store.set(`roles:${S.dir.name}`, { ...S.roleFile, _x: S.xFile, _xoff: S.xOff });
  /** Lee un archivo adicional de Validación/Secuencia (solo lectura) */
  async function readExtra(name) {
    const f = S.files.find((x) => x.name === name);
    if (!f) throw new Error(`No se encontró ${name} en la carpeta`);
    const raw = await App.fs.readFile(f.handle), wb = App.xl.readWorkbook(raw.bytes, f.name);
    const sheet = wb.SheetNames.find((n) => { const a = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, range: 0, defval: null }).slice(0, 15); return a.some((row) => (row || []).some((v) => App.normTxt(v) === 'job')); });
    if (!sheet) throw new Error(`${name}: no tiene una hoja con la columna Job`);
    const t = App.xl.table(wb.Sheets[sheet], App.motor.SPEC.captura, App.motor.ANCHOR.captura);
    const L = { name: f.name, handle: f.handle, wb, sheet, t, lastModified: raw.lastModified, size: raw.size, extra: true };
    t.rows.forEach((row) => { row._L = L; });
    return L;
  }
  /** Archivos adicionales (bases de tabletas): se leen todos y se juntan con el principal */
  async function loadExtras(role) {
    const main = S.roleFile[role], used = Object.entries(S.roleFile).filter(([k]) => k !== role).map(([, n]) => n);
    S.xFile[role] = (S.xFile[role] || []).filter((n, i, a) => n && n !== main && !used.includes(n) && a.indexOf(n) === i);
    const out = [];
    for (const n of S.xFile[role]) { try { out.push(await readExtra(n)); } catch (e) { console.warn(e); toast(e.message, 'warn', 5000); } }
    S.X[role] = out;
  }
  /** Agregar, cambiar, quitar o refrescar UN archivo adicional */
  async function setExtra(role, i, name) {
    const list = S.xFile[role] = S.xFile[role] || [];
    const prev = i == null ? null : list[i];
    if (name === null) { list.splice(i, 1); if (prev && !S.xOff[role].includes(prev)) S.xOff[role].push(prev); }
    else {
      if (name === S.roleFile[role] || (list.includes(name) && list[i] !== name)) return toast('Ese archivo ya está en la lista', 'warn');
      if (i == null) list.push(name); else list[i] = name;
      S.xOff[role] = S.xOff[role].filter((n) => n !== name);
    }
    await App.busy('Leyendo archivo…', async () => { await refreshList(); await loadExtras(role); });
    await saveRoles();
    if (S.result && ready()) execute(true);
  }

  async function loadAll() {
    const miss = ROLES.filter((r) => !r.optional && !r.manual && !r.txt && !S.roleFile[r.k]);
    if (miss.length) return toast(`Asigna el archivo de: ${miss.map((r) => r.t).join(', ')}`, 'warn');
    const names = ROLES.map((r) => S.roleFile[r.k]).filter(Boolean);
    if (new Set(names).size !== names.length) return toast('Un mismo archivo está asignado a dos funciones', 'warn');
    await saveRoles();
    const errs = [];
    await App.busy('Leyendo archivos…', async () => {
      await refreshList(); await App.cfg.load();
      for (const r of ROLES) { if (r.manual) continue; try { await loadRole(r.k); } catch (e) { errs.push(e.message); delete S.L[r.k]; } }
    });
    if (errs.length) await App.modal({ title: 'Algunos archivos no se cargaron', body: `<ul class="errs">${errs.map((e) => `<li>${App.esc(e)}</li>`).join('')}</ul>` });
    else toast('Archivos cargados', 'ok');
    App.ui.render();
    if (!S.L.planes) await planesDialog();
    else if (ready()) { execute(true); App.ui.render(); }
  }

  /* ---------- Planes: Reconectar o Seleccionar ---------- */
  const PLANES_HEAD = ['AOR', 'JOB', 'LS', 'Cia', 'Arnés', 'ID-BCM', 'Sec-BCM', 'ID-Cluster', 'Sec-Cluster', 'ID-Switch Gde', 'QY', 'Sec-Switch Gde', 'ID-Switch Ch', 'Sec-Switch Ch', 'ID-Key', 'Sec-Key', 'Status', 'Start Date', 'Pull', 'Estado'];
  const planesInFolder = () => S.files.find((f) => f.name === S.roleFile.planes) || null;

  /** Pregunta cómo cargar Planes. Devuelve true si quedó cargado */
  async function planesDialog() {
    if (!S.dir) { toast('Primero selecciona la carpeta de trabajo', 'warn'); return false; }
    await refreshList();
    if (S.roleFile.planes && !planesInFolder()) S.roleFile.planes = '';
    if (!S.roleFile.planes) { const g = S.files.find((f) => /plan/i.test(f.name)); if (g) S.roleFile.planes = g.name; }
    const cur = planesInFolder();
    const a = await App.modal({ title: 'Cargar Planes', wide: true, body: `
      <div class="opt-list">
        <label class="opt ${cur ? '' : 'dis'}"><input type="radio" name="pm" value="re" ${cur ? 'checked' : 'disabled'}><span><b>Reconectar Planes</b><br>
          <small>${cur ? `Usa <b>${App.esc(cur.name)}</b> de la carpeta (ya tiene la estructura) y <b>solo actualiza</b> lo que ya tiene inventario y lo que ya está secuenciado.` : 'Aún no hay un Planes de trabajo en la carpeta.'}</small></span></label>
        <label class="opt"><input type="radio" name="pm" value="sel" ${cur ? '' : 'checked'}><span><b>Seleccionar Planes nuevo</b><br>
          <small>Eliges el archivo descargado (puede estar en Descargas). Se lee por posición de columna: <b>A</b> AOR · <b>B</b> Job · <b>C</b> LS · <b>D</b> Cia · <b>E</b> Fecha · <b>F</b> Estatus, sin importar si viene en español o inglés. QORVEX arma la estructura y la guarda en la carpeta de trabajo${cur ? ` (reemplaza a ${App.esc(cur.name)}, con respaldo)` : ''}.</small></span></label>
      </div>`,
      buttons: [{ t: 'Después', v: null }, { t: 'Continuar', cls: 'primary', fn: (el) => { const r = App.$('input[name=pm]:checked', el); return r ? r.value : null; } }] });
    if (a === 're') return reconnectPlanes();
    if (a === 'sel') return selectPlanes();
    return false;
  }

  async function reconnectPlanes() {
    try {
      await App.busy('Leyendo Planes…', async () => { await refreshList(); await loadRole('planes'); });
      await saveRoles();
      if (ready()) execute(true);
      toast(`Planes reconectado: ${App.fmtN(S.L.planes.t.rows.length)} jobs · inventario y secuencia actualizados`, 'ok', 5000);
      App.ui.render(); return true;
    } catch (e) { toast(e.message, 'err', 6000); return false; }
  }

  /** Fecha del archivo descargado → número de serie de Excel (dd/mm/aaaa o aaaa-mm-dd); si no se entiende, se deja como texto */
  function dateCell(v) {
    if (isBlank(v)) return '';
    if (typeof v === 'number') return v;
    const s = String(v).trim(); let m, y, mo, d;
    if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
    else if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else return s;
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(1899, 11, 30)) / 864e5);
  }

  async function selectPlanes() {
    if (!App.lock.need()) return false;
    if (typeof window.showOpenFilePicker !== 'function') { toast('Este navegador no permite elegir archivos sueltos; usa Edge o Chrome', 'err'); return false; }
    let fh;
    try { [fh] = await window.showOpenFilePicker({ id: 'qorvex-planes', startIn: 'downloads', types: [{ description: 'Libro de Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xlsm', '.xls'] } }] }); }
    catch (e) { if (e.name !== 'AbortError') toast(App.fs.explain(e), 'err'); return false; }
    try {
      const raw = await App.fs.readFile(fh), name = raw.name || fh.name;
      const wb = App.xl.readWorkbook(raw.bytes, name);
      const sheet = await App.xl.pickSheet(wb, name, 'Planes (archivo nuevo)', true);
      const ws = wb.Sheets[sheet];
      const t = App.xl.table(ws, [1, 2, 3, 4, 5, 6].map((pos, i) => ({ k: ['aor', 'job', 'ls', 'cia', 'fecha', 'estatus'][i], pos })), [], { byPos: true });
      const H = t.headers.map(App.normTxt);
      if (['arnes', 'idarnes', 'harness'].includes(H[4 - t.c0])) {
        await App.modal({ title: 'Este archivo ya tiene estructura', body: `<p><b>${App.esc(name)}</b> ya tiene las columnas de componentes (Arnés, ID-BCM…). Para ese caso usa <b>Reconectar Planes</b>.</p><p class="muted">“Seleccionar” es para el archivo descargado con AOR, Job, LS, Cia, Fecha y Estatus.</p>` });
        return false;
      }
      const g = (row, k) => App.xl.val(t, row, k);
      const rows = t.rows.filter((row) => normKey(g(row, 'job')));
      if (!rows.length) throw new Error(`No se encontraron jobs en la columna B de la hoja ${sheet}.`);
      const target = S.roleFile.planes && planesInFolder() ? S.roleFile.planes : 'Planes Generales.xlsx';
      const exists = S.files.some((f) => f.name === target);
      const prev = rows.slice(0, 3).map((row) => `<tr>${['aor', 'job', 'ls', 'cia'].map((k) => `<td>${App.esc(App.show(g(row, k)))}</td>`).join('')}<td>${App.esc(typeof dateCell(g(row, 'fecha')) === 'number' ? App.fSerial(dateCell(g(row, 'fecha'))) : App.show(g(row, 'fecha')))}</td><td>${App.esc(App.show(g(row, 'estatus')))}</td></tr>`).join('');
      const ok = await App.confirmBox('Seleccionar Planes nuevo', `
        <p>Se leyeron <b>${App.fmtN(rows.length)} jobs</b> de <b>${App.esc(name)}</b> · hoja ${App.esc(sheet)}.</p>
        <div class="tw" style="max-height:none"><table class="t"><thead><tr><th>AOR (A)</th><th>JOB (B)</th><th>LS (C)</th><th>Cia (D)</th><th>Start Date (E)</th><th>Status (F)</th></tr></thead><tbody>${prev}</tbody></table></div>
        <p class="note" style="margin-top:12px">Se guardará como <b>${App.esc(target)}</b> en la carpeta <b>${App.esc(S.dir.name)}</b> con la estructura completa (componentes, Status y Start Date al final).${exists ? ` <b>Reemplaza el Planes actual</b>; antes se guarda un respaldo en ${App.fs.BACKUP_DIR}.` : ''} Después se ejecuta el cruce.</p>`, 'Crear Planes de trabajo', exists ? 'danger' : 'primary');
      if (!ok) return false;
      // Libro nuevo con la estructura de QORVEX
      const out = rows.map((row) => { const a = Array(PLANES_HEAD.length).fill(''); a[0] = g(row, 'aor') ?? ''; a[1] = g(row, 'job'); a[2] = g(row, 'ls') ?? ''; a[3] = g(row, 'cia') ?? ''; a[16] = g(row, 'estatus') ?? ''; a[17] = dateCell(g(row, 'fecha')); return a; });
      const nws = XLSX.utils.aoa_to_sheet([PLANES_HEAD, ...out]);
      out.forEach((a, i) => { const c = nws[XLSX.utils.encode_cell({ r: i + 1, c: 17 })]; if (c && c.t === 'n') c.z = 'dd/mm/yyyy'; });
      PLANES_HEAD.forEach((_, c) => { const cell = nws[XLSX.utils.encode_cell({ r: 0, c })]; if (cell) cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '0A1A3A' } } }; });
      nws['!cols'] = PLANES_HEAD.map((h) => ({ wch: Math.max(9, h.length + 3) }));
      const nwb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(nwb, nws, 'Planes');
      const bytes = App.xl.serialize(nwb, target);
      const back = App.xl.table(App.xl.readWorkbook(bytes, target).Sheets.Planes, App.motor.SPEC.planes, App.motor.ANCHOR.planes, App.motor.PLANES_POS);
      if (back.rows.length !== rows.length) throw new Error(`Verificación: se esperaban ${rows.length} filas y se generaron ${back.rows.length}. No se guardó nada.`);
      await App.busy('Guardando Planes de trabajo…', async () => {
        if (!(await App.fs.ensurePermission(S.dir))) throw new Error('No se autorizó la escritura en la carpeta.');
        if (exists) {
          const f = S.files.find((x) => x.name === target), cur = await App.fs.readFile(f.handle);
          await App.fs.backup(S.dir, target, cur.bytes);
          await App.fs.writeFile(f.handle, bytes);
        } else await App.fs.createFile(S.dir, target, bytes);
        await refreshList(); S.roleFile.planes = target;
        await saveRoles();
        await App.store.set(`sheet:${target}`, 'Planes');
        await loadRole('planes');
      });
      if (ready()) execute(true);
      toast(`Planes de trabajo creado: ${App.fmtN(rows.length)} jobs. Revisa DATA y presiona “Guardar en Excel” para escribir el cruce.`, 'ok', 7000);
      App.ui.go('planes');
      return true;
    } catch (e) { toast(e.message, 'err', 7000); App.ui.render(); return false; }
  }
  /** Inicio rápido desde INICIO: conecta la carpeta, carga los archivos y ejecuta el cruce */
  async function quickStart(useSaved) {
    if (!S.dir && !(await connect(useSaved, true))) return App.ui.render();
    const miss = ROLES.filter((r) => !r.optional && !r.manual && !r.txt && !S.roleFile[r.k]);
    if (miss.length) { toast(`No se reconoció el archivo de: ${miss.map((r) => r.t).join(', ')}. Asígnalo en Archivos.`, 'warn', 6000); return App.ui.go('files'); }
    if (!S.L.val || !S.L.seq) await loadAll();
    else if (!S.L.planes) await planesDialog();
    if (ready()) execute(true);
    App.ui.go('home');
  }
  const ready = () => ['planes', 'val', 'seq'].every((k) => S.L[k]);

  /* ---------- Cruce ---------- */
  function execute(silent) {
    if (!ready()) return toast(S.L.planes ? 'Primero carga Validación y Secuencia' : 'Primero carga Planes (botón “Cargar Planes” en DATA)', 'warn');
    S.result = runCruce();
    S.planesDirty = true;
    if (!silent) toast(`Cruce ejecutado: ${App.fmtN(S.result.rows.length)} filas`, 'ok');
  }

  /* ---------- Pulls ---------- */
  function pullsChanged() { S.pullsDirty = true; if (S.result) execute(true); }
  function addPulls(list) {
    const added = [];
    list.forEach((p) => {
      const job = String(p.job ?? '').trim(), cont = String(p.cont ?? '').trim();
      if (!job || !cont) return;
      const nj = normKey(job);
      added.push({ id: S.nextPullId++, job: /^\d+$/.test(nj) ? Number(nj) : job.toUpperCase(), cont: cont.toUpperCase(), com: String(p.com ?? '').trim() });
    });
    if (added.length) { S.pulls.push(...added); pullsChanged(); }
    return added.length;
  }

  function pullsWorkbookFresh() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Job', 'Contenedor', 'Comentario']]), 'Pulls');
    return wb;
  }
  async function createPullsFile() {
    if (!App.lock.need()) return;
    if (S.files.some((f) => /^pulls\.xlsx$/i.test(f.name))) return toast('Ya existe Pulls.xlsx en la carpeta; asígnalo en la lista', 'warn');
    try {
      const bytes = App.xl.serialize(pullsWorkbookFresh(), 'Pulls.xlsx');
      await App.fs.createFile(S.dir, 'Pulls.xlsx', bytes);
      await refreshList(); S.roleFile.pulls = 'Pulls.xlsx';
      await saveRoles();
      await loadRole('pulls');
      toast('Se creó Pulls.xlsx en la carpeta', 'ok'); App.ui.render();
    } catch (e) { toast(App.fs.explain(e), 'err'); }
  }

  /* ---------- Preparar bytes de cada archivo (sin tocar el disco) ---------- */
  function buildPlanes() {
    const P = S.L.planes;
    const errs = App.motor.validate(P.t, S.result);
    if (errs.length) throw new Error(errs.join(' '));
    // Se trabaja sobre una copia del libro: si algo falla, el libro en memoria no queda a medias
    // (copia superficial: setCell reemplaza celdas, nunca modifica las originales)
    const wb = { ...P.wb, Sheets: { ...P.wb.Sheets, [P.sheet]: { ...P.wb.Sheets[P.sheet] } } };
    App.motor.applyToSheet(wb.Sheets[P.sheet], P.t, S.result);
    const bytes = App.xl.serialize(wb, P.name);
    // Verificación de integridad: releer lo generado y comparar
    const back = App.xl.readWorkbook(bytes, P.name);
    if (back.SheetNames.join('|') !== P.wb.SheetNames.join('|')) throw new Error('Verificación: cambiaron las hojas del libro.');
    const t2 = App.xl.table(back.Sheets[P.sheet], App.motor.SPEC.planes, App.motor.ANCHOR.planes, App.motor.PLANES_POS);
    if (t2.rows.length !== P.t.rows.length) throw new Error(`Verificación: el libro generado tiene ${t2.rows.length} filas y el original ${P.t.rows.length}.`);
    const bad = P.t.rows.findIndex((row, i) => normKey(App.xl.val(P.t, row, 'job')) !== normKey(App.xl.val(t2, t2.rows[i], 'job')) || normKey(App.xl.val(P.t, row, 'aor')) !== normKey(App.xl.val(t2, t2.rows[i], 'aor')));
    if (bad >= 0) throw new Error(`Verificación: AOR/JOB no coincide en la fila ${t2.rows[bad].r + 1}.`);
    return bytes;
  }

  /** Validación o Secuencia (principal o de tableta) con sus ediciones: se escribe el libro en memoria y se verifica */
  function buildSource(role, L = S.L[role]) {
    const spec = ROLES.find((r) => r.k === role).spec;
    const bytes = App.xl.serialize(L.wb, L.name);
    const back = App.xl.readWorkbook(bytes, L.name);
    if (back.SheetNames.join('|') !== L.wb.SheetNames.join('|')) throw new Error('Verificación: cambiaron las hojas del libro.');
    const t2 = App.xl.table(back.Sheets[L.sheet], App.motor.SPEC[spec], App.motor.ANCHOR[spec]);
    if (t2.rows.length !== L.t.rows.length) throw new Error(`Verificación: se esperaban ${L.t.rows.length} filas y el archivo generado tiene ${t2.rows.length}.`);
    const bad = L.t.rows.findIndex((row, i) => normKey(App.xl.val(L.t, row, 'job')) !== normKey(App.xl.val(t2, t2.rows[i], 'job')));
    if (bad >= 0) throw new Error(`Verificación: el dato clave no coincide en la fila ${t2.rows[bad].r + 1}.`);
    return bytes;
  }

  function buildPulls() {
    const P = S.L.pulls;
    const errs = [];
    S.pulls.forEach((p, i) => {
      if (!normKey(p.job)) errs.push(`Fila ${i + 1}: falta Job`);
      if (isBlank(p.cont)) errs.push(`Fila ${i + 1}: falta Contenedor`);
    });
    if (errs.length) throw new Error(errs.slice(0, 5).join(' · ') + (errs.length > 5 ? ` · y ${errs.length - 5} más` : ''));
    const h = P.t.headers, c = P.t.cols;
    const head = ['job', 'cont', 'com'].map((k, i) => (!isBlank(h[c[k]]) ? h[c[k]] : ['Job', 'Contenedor', 'Comentario'][i]));
    const wb = { ...P.wb, Sheets: { ...P.wb.Sheets } };
    wb.Sheets[P.sheet] = XLSX.utils.aoa_to_sheet([head, ...S.pulls.map((p) => [p.job, p.cont, p.com || ''])]);
    const bytes = App.xl.serialize(wb, P.name);
    const back = App.xl.readWorkbook(bytes, P.name);
    const t2 = App.xl.table(back.Sheets[P.sheet], App.motor.SPEC.pulls, App.motor.ANCHOR.pulls);
    if (t2.rows.length !== S.pulls.length) throw new Error(`Verificación: se esperaban ${S.pulls.length} pulls y el archivo generado tiene ${t2.rows.length}.`);
    return bytes;
  }

  /* ---------- Guardado directo en los originales ---------- */
  async function save(targets, doBackup) {
    if (!App.lock.need()) return [];
    const results = [];
    // Primero las fuentes y al final Planes, para que Planes refleje lo ya guardado
    targets = ['val', 'seq', 'pulls', 'planes'].filter((r) => targets.includes(r));
    await App.busy('Validando y guardando…', async () => {
      // 0) Correcciones a capturas de tabletas → Correcciones_Motor.xlsx (los archivos _TAB no se tocan)
      let corrOk = false;
      if ((targets.includes('val') || targets.includes('seq')) && App.corr.count()) {
        const cr = await App.corr.save(doBackup);
        if (cr) { results.push(cr); corrOk = cr.ok; if (cr.ok) S.edits = S.edits.filter((x) => !x.corr); }
      }
      for (const role of targets) {
       // Validación / Secuencia: se escribe CADA archivo que tenga cambios (el principal o el de una tableta)
       const multi = role === 'val' || role === 'seq';
       let Fs = multi ? srcs(role).filter((L) => L.dirty) : [S.L[role]];
       let reload = false;
       if (multi && !Fs.length) { if (corrOk) reload = true; else if (!S.L[role].txt) Fs = [S.L[role]]; }
       for (const F of Fs) {
        if (F.txt) { // capturas integradas por el Motor → Validacion_MOTOR_aaaa-mm.txt (solo se agregan líneas)
          const res = { role, name: F.name, ok: false, msg: '' };
          try {
            const w = await App.cap.writeNew(role);
            const edR = S.edits.filter((x) => x.role === role && x.kind === 'import');
            S.edits = S.edits.filter((x) => !edR.includes(x));
            res.ok = true; res.name = w.name || F.name; res.msg = `${App.fmtN(w.n)} filas integradas al final`; reload = true;
          } catch (e) { res.msg = App.fs.explain(e); }
          results.push(res); continue;
        }
        const res = { role, name: F.name, ok: false, msg: '', backup: '' };
        try {
          // 1) ¿Alguien modificó el archivo desde que se cargó?
          const lm = await App.fs.lastModified(F.handle);
          if (lm !== F.lastModified) throw new Error('El archivo se modificó fuera de esta página después de cargarlo. Vuelve a cargar los archivos para no perder esos cambios.');
          // 2) Permiso de escritura (el navegador puede pedir autorización)
          if (!(await App.fs.ensurePermission(S.dir))) throw new Error('No se autorizó la escritura en la carpeta.');
          // 3) Construir y verificar el contenido nuevo antes de tocar el disco
          const bytes = role === 'planes' ? buildPlanes() : role === 'pulls' ? buildPulls() : buildSource(role, F);
          // 4) Respaldo opcional del contenido actual del original
          if (doBackup) { const cur = await App.fs.readFile(F.handle); res.backup = await App.fs.backup(S.dir, F.name, cur.bytes); }
          // 5) Reemplazar el original
          await App.fs.writeFile(F.handle, bytes);
          res.written = true; F.dirty = false; reload = true;
          if (multi) { // se relee al terminar todos los archivos de este tipo
            const edR = S.edits.filter((x) => x.role === role && (x.kind === 'import' ? (x.dest ? x.dest === F.name : F === S.L[role]) : (x.file ? x.file === F.name : F === S.L[role])));
            const nImp = edR.filter((x) => x.kind === 'import').reduce((t, x) => t + x.n, 0), nEd = edR.length - edR.filter((x) => x.kind === 'import').length;
            res.ok = true; res.msg = [nEd && `${App.fmtN(nEd)} edición(es) guardadas`, nImp && `${App.fmtN(nImp)} filas integradas al final`].filter(Boolean).join(' · ') || 'Guardado';
            S.edits = S.edits.filter((x) => !edR.includes(x));
            results.push(res); continue;
          }
          // 6) Releer desde disco para dejar la sesión sincronizada
          const keepResult = S.result, keepPulls = S.pulls;
          await loadRole(role);
          if (role === 'pulls') S.pulls = keepPulls;
          if (keepResult) S.result = runCruce();
          if (role === 'planes') S.planesDirty = false;
          const edR = S.edits.filter((x) => x.role === role), nImp = edR.filter((x) => x.kind === 'import').reduce((t, x) => t + x.n, 0), nEd = edR.length - edR.filter((x) => x.kind === 'import').length;
          res.ok = true; res.msg = role === 'planes' ? `${App.fmtN(S.result ? S.result.rows.length : 0)} filas actualizadas` : role === 'pulls' ? `${App.fmtN(S.pulls.length)} pulls guardados` : [nEd && `${App.fmtN(nEd)} edición(es) guardadas`, nImp && `${App.fmtN(nImp)} filas integradas al final`].filter(Boolean).join(' · ') || 'Guardado';
          S.edits = S.edits.filter((x) => x.role !== role);
        } catch (e) {
          if (res.written) { res.ok = true; res.msg = `Guardado, pero no se pudo releer: ${App.fs.explain(e)}. Vuelve a cargar los archivos.`; }
          else {
            res.msg = App.fs.explain(e);
            if (res.backup) { await App.fs.removeBackup(S.dir, res.backup); res.backup = ''; } // no dejar copias innecesarias
          }
        }
        results.push(res);
       }
       // Validación / Secuencia: releer principal + tabletas una sola vez (solo si nada quedó pendiente)
       if (multi && reload) {
         try {
           const keepResult = S.result;
           const left = srcs(role).filter((L) => L.dirty);
           if (!left.length) { await loadRole(role); S.dirty[role] = false; }
           if (keepResult) S.result = runCruce();
         } catch (e) { results.push({ role, name: S.L[role].name, ok: true, msg: `Guardado, pero no se pudo releer: ${App.fs.explain(e)}. Vuelve a cargar los archivos.` }); }
       }
      }
    });
    App.ui.render();
    App.ui.showResults(results);
    return results;
  }

  window.addEventListener('beforeunload', (e) => { if (S.planesDirty || S.pullsDirty || Object.values(S.dirty).some(Boolean)) { e.preventDefault(); e.returnValue = ''; } });

  Object.assign(App, { init, connect, quickStart, loadAll, loadRole, execute, ready, addPulls, pullsChanged, createPullsFile, save, refreshList, planesDialog, srcs, TAB_RE, setExtra });
  document.addEventListener('DOMContentLoaded', init);
})(window.App);
