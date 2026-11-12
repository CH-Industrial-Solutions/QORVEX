/* =====================================================================
   vistas.js — pantallas: Archivos, Planes, Pulls y resultado del guardado
   ===================================================================== */
(function (App) {
  const { $, $$, esc, fmtN, show, toast, normKey, normTxt } = App;
  const PAGE = 100;
  let TAB = 'home';
  // Módulos de QORVEX: [clave, código, descripción, auxiliar]
  const MODS = [   // principales (pestañas)
    ['home', 'INICIO', 'Panel general'],
    ['planes', 'DATA', 'Cruce de información'],
    ['dash', 'DASHBOARD', 'Material disponible'],
    ['pulls', 'PULLS', 'Lista de pulls'],
    ['prod', 'PRODUCTIVIDAD', 'Turnos y personas'],
  ];
  const SEC = [    // secundarios (botones en la barra superior)
    ['val', 'VALIDATE', 'Excel de Validación completo'],
    ['seq', 'SEQUENCE', 'Excel de Secuencia completo'],
    ['files', 'ARCHIVOS', 'Archivos y carpeta de trabajo'],
    ['config', 'CONFIG', 'Turnos, metas, supervisores y usuarios'],
  ];
  /* Íconos (SVG en línea, toman el color del texto) */
  const sv = (d, f) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" ${f ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${d}</svg>`;
  const ICO = {
    home: sv('<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', 1),
    planes: sv('<rect x="4" y="12" width="3.5" height="8" rx=".6"/><rect x="10.2" y="7" width="3.5" height="13" rx=".6"/><rect x="16.5" y="3.5" width="3.5" height="16.5" rx=".6"/>', 1),
    dash: sv('<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.5"/>', 1),
    pulls: sv('<path d="M12 2.8 20.5 7.4v9.2L12 21.2l-8.5-4.6V7.4z"/><path d="M3.8 7.4 12 12l8.2-4.6M12 12v9"/>'),
    save: sv('<path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h7V3M8 21v-7h8v7" fill="#fff" stroke="none" opacity=".9"/>', 1),
    doc: sv('<path d="M6 2h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M8.5 12h7M8.5 15.5h7M8.5 19h4" stroke="#fff" stroke-width="1.8" fill="none"/>', 1),
    check: sv('<circle cx="12" cy="12" r="9.2"/><path d="m7.6 12.3 3 3 5.8-6.3"/>'),
    flow: sv('<rect x="3" y="3" width="7" height="5.5" rx="1.2"/><rect x="14" y="15.5" width="7" height="5.5" rx="1.2"/><rect x="3" y="15.5" width="7" height="5.5" rx="1.2"/><path d="M6.5 8.5v7M10 18.2h4M6.5 12h10.5v3.5" fill="none" stroke="currentColor" stroke-width="2"/>', 1),
    list: sv('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h9" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>', 1),
    case: sv('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12.5h18" stroke="#fff" stroke-width="1.7" fill="none"/>', 1),
    trend: sv('<path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/>'),
    pin: sv('<path d="M12 22s7-6.6 7-12.2A7 7 0 0 0 5 9.8C5 15.4 12 22 12 22z"/><circle cx="12" cy="9.8" r="2.6" fill="#fff"/>', 1),
    bars: sv('<rect x="4" y="11" width="3.3" height="9" rx=".5"/><rect x="10.3" y="6" width="3.3" height="14" rx=".5"/><rect x="16.6" y="3" width="3.3" height="17" rx=".5"/>', 1),
    db: sv('<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" fill="none" stroke="#fff" stroke-width="1.6"/>', 1),
    play: sv('<path d="M7 4.5v15l12.5-7.5z"/>', 1),
    bulb: sv('<path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.8.6 1.3 1.5 1.3 2.5V18h5v-1.2c0-1 .5-1.9 1.3-2.5A6.5 6.5 0 0 0 12 2.5z"/><rect x="9.5" y="19.3" width="5" height="2.2" rx="1"/>', 1),
  };
  ICO.val = ICO.check; ICO.seq = ICO.flow; ICO.cube = ICO.pulls; ICO.prod = ICO.trend;
  const isLight = () => document.documentElement.dataset.theme === 'light';
  function setTheme(th) { document.documentElement.dataset.theme = th; try { localStorage.setItem('qorvex_theme', th); } catch (e) {} }

  const PF = {};   // filtros de Planes (se inicializan en la sección PLANES)
  const LF = { q: '', inPlanes: '', com: '' };                                       // filtros de Pulls

  const COLS = [ // orden de la hoja Planes
    ['aor', 'AOR'], ['job', 'JOB'], ['ls', 'LS'], ['cia', 'Cia'],
    ['idArnes', 'Arnés'], ['idBcm', 'ID-BCM'], ['secBcm', 'Sec-BCM'], ['idCluster', 'ID-Cluster'], ['secCluster', 'Sec-Cluster'],
    ['idSwGde', 'ID-Switch Gde'], ['qy', 'QY'], ['secSwGde', 'Sec-Switch Gde'], ['idSwCh', 'ID-Switch Ch'], ['secSwCh', 'Sec-Switch Ch'],
    ['idKey', 'ID-Key'], ['secKey', 'Sec-Key'], ['status', 'Status'], ['start', 'Start Date'], ['pull', 'Pull'], ['estado', 'Estado'],
  ];
  const BASE = ['aor', 'job', 'ls', 'cia'];

  function go(t) { TAB = t; render(); }

  function render() {
    const S = App.S, root = $('#app');
    if (!App.fs.supported()) {
      root.innerHTML = `<div class="nosupport"><h1>Navegador no compatible</h1>
        <p>Esta herramienta necesita la función <b>File System Access</b> para abrir y guardar los Excel originales.</p>
        <p>Ábrela en <b>Microsoft Edge</b> o <b>Google Chrome</b> actualizado en una computadora con Windows.</p>
        <p class="muted">Firefox y Safari no permiten escribir sobre los archivos originales.</p></div>`;
      return;
    }
    const dirty = S.planesDirty || S.pullsDirty || Object.values(S.dirty || {}).some(Boolean);
    root.innerHTML = `
      <header class="top">
        <div class="brand" id="bHome" style="cursor:pointer" title="Inicio"><img src="img/q-mark-${isLight() ? 'light' : 'dark'}.png" alt=""><div class="bt"><span class="bn">QORVE<i>X</i></span><small>Manufacturing Intelligence Engine</small></div><span class="ver">V 12.00.00</span></div>
        <span class="sp"></span>
        <a class="btn ghost xlink" href="${App.LINKS.mobile}" target="_blank" rel="noopener" title="Abrir QORVEX MOBILE en otra pestaña">QORVEX MOBILE ↗</a>
        <button class="tsw" id="bTheme" title="Cambiar a modo ${isLight() ? 'BLACK' : 'WHITE'}" aria-label="Cambiar tema"><span class="knob"><svg class="moon" viewBox="0 0 32 32" aria-hidden="true"><path d="M19.5 6.5a10 10 0 1 0 6 16.9A11.5 11.5 0 0 1 19.5 6.5z" fill="currentColor"/><path d="M23 7.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor"/><path d="M26.5 14.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" fill="currentColor"/></svg><svg class="sun" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="6.2" fill="currentColor"/><g stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M16 3.5v3.2M16 25.3v3.2M3.5 16h3.2M25.3 16h3.2M7.2 7.2l2.2 2.2M22.6 22.6l2.2 2.2M7.2 24.8l2.2-2.2M22.6 9.4l2.2-2.2"/></g></svg></span></button>
        <div class="secs">${SEC.map(([k, t, d]) => `<button class="sbtn ${TAB === k ? 'on' : ''}" data-t="${k}" title="${d}">${t}</button>`).join('')}</div>
        ${S.dir ? `<div class="chip" title="Carpeta de trabajo">📁 ${esc(S.dir.name)}</div>` : ''}
        ${S.dir ? `<button class="btn ghost" id="bChange" title="Cambiar carpeta de trabajo">Carpeta</button>` : ''}
        ${App.lock.canEdit() || !App.lock.mode() ? `<button class="btn save ${dirty ? 'on' : ''}" id="bSave" ${App.S.L.planes && App.lock.canEdit() ? '' : 'disabled'}>${ICO.save}<span>Guardar${dirty ? ' •' : ''}</span></button>` : ''}
      </header>
      <nav class="tabs">
        ${MODS.map(([k, t, s]) => `<button class="tab ${TAB === k ? 'on' : ''}" data-t="${k}">${ICO[k] || ''}<span class="tl"><b>${t}${k === 'pulls' && S.pullsDirty ? ' •' : ''}${k === 'planes' && S.planesDirty ? ' •' : ''}</b><small>${s}</small></span></button>`).join('')}
        ${App.lock.mode() ? `<span class="tabs-r"><button class="chip mode ${App.lock.canEdit() ? 'ed' : 'ro'}" id="bMode" title="Cambiar de modo (Editor / Consulta)">${App.lock.canEdit() ? `EDITOR · ${esc(App.lock.who())}` : 'CONSULTA · solo lectura'}</button><button class="btn ghost sm" id="bOut" title="Salir y liberar el modo Editor">Salir</button></span>` : ''}
      </nav>
      <main id="main"></main>
      <footer class="foot"><b>QORVEX</b> · CONNECT · VALIDATE · SEQUENCE · OPTIMIZE &nbsp;|&nbsp; © TODOS LOS DERECHOS RESERVADOS · Ing. Carlos Hernandez</footer>
      <div id="toasts"></div>`;
    document.body.classList.toggle('fullview', TAB === 'planes' && PF.view === 'all' && !!S.result);
    $$('.tab,.sbtn').forEach((b) => (b.onclick = () => go(b.dataset.t)));
    if ($('#bChange')) $('#bChange').onclick = () => guardDirty().then((ok) => ok && App.connect(false));
    if ($('#bSave')) $('#bSave').onclick = saveDialog;
    if ($('#bMode')) $('#bMode').onclick = async () => { if (App.lock.canEdit() && (S.planesDirty || S.pullsDirty || Object.values(S.dirty || {}).some(Boolean)) && !(await App.confirmBox('Cambiar de modo', '<p>Hay cambios sin guardar. Si cambias de modo se pierden.</p>', 'Cambiar de todos modos', 'danger'))) return; await App.lock.release(); await App.lock.enter(); };
    if ($('#bOut')) $('#bOut').onclick = async () => { if (App.lock.canEdit() && (S.planesDirty || S.pullsDirty || Object.values(S.dirty || {}).some(Boolean)) && !(await App.confirmBox('Salir', '<p>Hay cambios sin guardar. Si sales se pierden.</p>', 'Salir de todos modos', 'danger'))) return; App.lock.leave('out'); };
    $('#bHome').onclick = () => go('home');
    $('#bTheme').onclick = () => { setTheme(isLight() ? 'dark' : 'light'); render(); };
    ({ home: () => App.mods.home($('#main')), files: vFiles, planes: vPlanes, pulls: vPulls, dash: () => App.dash.render($('#main')),
      val: () => App.hojas.render($('#main'), 'val'), seq: () => App.hojas.render($('#main'), 'seq'),
      prod: () => App.prod.render($('#main')), config: () => App.cfg.render($('#main')) })[TAB]();
  }

  async function guardDirty() {
    const S = App.S;
    if (!S.planesDirty && !S.pullsDirty) return true;
    return App.confirmBox('Cambios sin guardar', '<p>Hay cambios que aún no se guardan en los Excel. Si continúas se perderán.</p>', 'Continuar sin guardar', 'danger');
  }

  /* ===================== ARCHIVOS ===================== */
  function vFiles() {
    const S = App.S, m = $('#main');
    if (!S.dir) {
      m.innerHTML = `<section class="hero">
        <h1>Carpeta de trabajo</h1>
        <p>Elige la carpeta donde están los Excel de <b>Validación</b>, <b>Secuencia</b> y <b>Pulls</b> (y donde se guardará el <b>Planes</b> de trabajo).
           El navegador te pedirá autorización para leerlos y guardarlos.</p>
        <div class="row">${S.savedDir ? `<button class="btn primary big" id="bRe">Reconectar a «${esc(S.savedDir.name)}»</button><button class="btn big" id="bPick">Elegir otra carpeta</button>`
          : '<button class="btn primary big" id="bPick">Seleccionar carpeta</button>'}</div>
        <p class="muted small">Los datos siempre se quedan en tus archivos Excel. Esta página solo los lee, los procesa y escribe los cambios cuando tú lo indicas.</p>
      </section>`;
      if ($('#bRe')) $('#bRe').onclick = () => App.connect(true);
      $('#bPick').onclick = () => App.connect(false);
      return;
    }
    const opts = (sel) => `<option value="">— Sin asignar —</option>${S.files.map((f) => `<option ${f.name === sel ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}`;
    m.innerHTML = `
      <div class="ptitle"><h1>ARCHIVOS <small>Fuentes de datos</small></h1><span class="muted">${fmtN(S.files.length)} archivos Excel en la carpeta</span><span class="sp"></span>
        <button class="btn" id="bRefresh">Actualizar lista</button><button class="btn" id="bInteg" ${S.L.val || S.L.seq ? '' : 'disabled'} title="Agregar a Validación / Secuencia lo exportado desde QORVEX MOBILE sin carpeta">⇪ Integrar capturas exportadas</button><button class="btn" id="bDup" ${S.L.val || S.L.seq ? '' : 'disabled'} title="Agregar un job repetido autorizado (queda marcado como Duplicado)">＋ Agregar duplicado</button><button class="btn primary" id="bLoad">Cargar archivos</button></div>
      <div class="cards">${App.ROLES.map((r) => {
        const L = S.L[r.k];
        if (r.k === 'planes') return `<div class="fcard ${L ? 'ok' : ''}">
          <div class="fh"><b>${r.t}</b><span class="tag w">se actualiza</span></div>
          ${L ? `<div class="fi">✓ <b>${esc(L.name)}</b> · hoja <b>${esc(L.sheet)}</b> · ${fmtN(L.t.rows.length)} jobs · modificado ${App.fDT(L.lastModified)}</div>` : `<div class="fi muted">${S.roleFile.planes ? `${esc(S.roleFile.planes)} · sin cargar` : 'Aún no hay Planes de trabajo en la carpeta'}</div>`}
          <div class="fi muted small">Columnas por posición: A AOR · B Job · C LS · D Cia · … · Q Status · R Start Date</div>
          <div class="frow">${S.planesDirty ? '<span class="pill warn">Cambios sin guardar</span>' : ''}<span class="sp"></span><button class="btn sm primary" data-planes="1">Cargar Planes</button></div>
        </div>`;
        if (r.txt) {
          const devs = L ? [L, ...(S.X[r.k] || [])] : [], fl = (App.cap.files[r.k] || []);
          return `<div class="fcard ${L ? 'ok' : ''}">
          <div class="fh"><b>${r.t}</b><span class="tag w">TXT de las tabletas</span></div>
          <div class="fi muted small">Lee todos los <b>${App.cap.PRE[r.k]}_EQUIPO_aaaa-mm.txt</b> de la carpeta. Cada tableta escribe solo los suyos; el Motor solo agrega en los de MOTOR.</div>
          ${L ? `<table class="t mini"><thead><tr><th>Equipo</th><th>Archivos</th><th>Registros</th><th>Modificado</th></tr></thead><tbody>
            ${devs.filter((x) => x.dev !== App.cap.MOTOR || x.files.length || x.t.rows.length).map((x) => `<tr><td><b>${esc(x.dev)}</b></td><td class="small">${x.files.map((n) => { const f = fl.find((y) => y.name === n); return `${esc(n)}${f ? ` <span class="muted">(${fmtN(f.n)} líneas)</span>` : ''}`; }).join('<br>') || '<span class="muted">—</span>'}</td><td class="num">${fmtN(x.t.rows.length)}${x.dirty ? ' <span class="pill warn">+ sin guardar</span>' : ''}</td><td class="small">${x.files.length ? App.fDT(x.lastModified) : '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Aún no hay capturas en TXT.</td></tr>'}
          </tbody></table>` : '<div class="fi muted">Se leen al presionar <b>Cargar archivos</b>.</div>'}
          <div class="frow">${(S.dirty || {})[r.k] ? '<span class="pill warn">Cambios sin guardar</span>' : ''}<span class="sp"></span><button class="btn sm" data-reload="${r.k}">↻ ${L ? 'Actualizar' : 'Cargar'}</button></div>
        </div>`;
        }
        const X = r.multi ? (S.X[r.k] || []) : [];
        return `<div class="fcard ${L ? 'ok' : ''}">
          <div class="fh"><b>${r.t}</b>${r.write ? '<span class="tag w">se actualiza</span>' : r.multi ? '<span class="tag w">lee varios archivos</span>' : '<span class="tag">solo lectura</span>'}${r.optional ? '<span class="tag">opcional</span>' : ''}</div>
          <select class="input" data-role="${r.k}">${opts(S.roleFile[r.k])}</select>
          ${L ? `<div class="fi">✓ Hoja <b>${esc(L.sheet)}</b>${L.wb.SheetNames.length > 1 ? ` <a href="#" class="chs" data-role="${r.k}">cambiar hoja</a>` : ''} · ${fmtN(L.t.rows.length)} filas · modificado ${App.fDT(L.lastModified)}</div>
            ${L.t.warn.length ? `<div class="warn">${L.t.warn.map(esc).join('<br>')}</div>` : ''}
`
            : `<div class="fi muted">${S.roleFile[r.k] ? 'Sin cargar' : r.k === 'pulls' ? 'Sin archivo de Pulls' : 'Asigna un archivo'}</div>`}
          ${r.multi ? `<div class="xfs">${(S.xFile[r.k] || []).map((n, i) => { const XL = X.find((x) => x.name === n); return `<div class="xf">
              <div class="xl">Archivo ${i + 2}${/_TAB/i.test(n) ? ` · tableta ${esc((n.match(/_(TAB\w*)\./i) || [])[1] || '')}` : ''}</div>
              <div class="frow"><select class="input" data-xrole="${r.k}" data-xi="${i}">${opts(n)}</select><button class="btn sm" data-xr="${r.k}" data-xi="${i}" title="Volver a leer este archivo">↻</button><button class="btn sm" data-xd="${r.k}" data-xi="${i}" title="Quitar de la lista (no borra el archivo)">✕</button></div>
              <div class="fi ${XL ? '' : 'muted'}">${XL ? `✓ Hoja <b>${esc(XL.sheet)}</b> · ${fmtN(XL.t.rows.length)} filas · modificado ${App.fDT(XL.lastModified)}` : L ? 'No se pudo leer' : 'Se lee al cargar los archivos'}</div></div>`; }).join('')}
            <select class="input xadd" data-xadd="${r.k}"><option value="">+ Agregar ${S.xFile[r.k] && S.xFile[r.k].length ? 'otro' : 'segundo'} archivo de ${r.t}…</option>${S.files.filter((f) => f.name !== S.roleFile[r.k] && !(S.xFile[r.k] || []).includes(f.name)).map((f) => `<option>${esc(f.name)}</option>`).join('')}</select></div>` : ''}
          ${r.k === 'pulls' && !S.roleFile.pulls ? '<button class="btn sm" id="bNewPulls">Crear Pulls.xlsx en la carpeta</button>' : ''}
          ${S.roleFile[r.k] ? `<div class="frow">${(S.dirty || {})[r.k] || (r.k === 'pulls' && S.pullsDirty) ? '<span class="pill warn">Cambios sin guardar</span>' : ''}<span class="sp"></span><button class="btn sm" data-reload="${r.k}">↻ ${L ? 'Actualizar' : 'Cargar'} este archivo</button></div>` : ''}
        </div>`;
      }).join('')}</div>
      ${App.ready() ? `<div class="banner ok">Todo listo. Ve a <a href="#" id="toPlanes">DATA</a> para ejecutar el cruce.</div>` : ''}
      <div class="note"><b>Antes de guardar:</b> cierra en Excel los archivos que se van a actualizar (Planes y Pulls). Windows bloquea un archivo abierto y el guardado fallaría sin dañar nada.</div>`;
    $$('select[data-role]').forEach((s) => (s.onchange = () => { S.roleFile[s.dataset.role] = s.value; delete S.L[s.dataset.role]; render(); }));
    $('#bRefresh').onclick = async () => { await App.refreshList(); render(); };
    $('#bLoad').onclick = () => guardDirty().then((ok) => ok && App.loadAll());
    $('#bInteg').onclick = () => App.integrar.open();
    $('#bDup').onclick = () => App.dup.open('val');
    const xDo = async (role, i, name) => { if (!S.L[role]) { const l = S.xFile[role] = S.xFile[role] || []; if (name === null) l.splice(i, 1); else if (i == null) l.push(name); else l[i] = name; render(); return; } try { await App.setExtra(role, i, name); } catch (e) { toast(e.message, 'err', 6000); } render(); };
    $$('select[data-xrole]').forEach((s) => (s.onchange = () => { if (!s.value) return xDo(s.dataset.xrole, +s.dataset.xi, null); xDo(s.dataset.xrole, +s.dataset.xi, s.value); }));
    $$('[data-xr]').forEach((b) => (b.onclick = () => xDo(b.dataset.xr, +b.dataset.xi, S.xFile[b.dataset.xr][+b.dataset.xi])));
    $$('[data-xd]').forEach((b) => (b.onclick = () => xDo(b.dataset.xd, +b.dataset.xi, null)));
    $$('select[data-xadd]').forEach((s) => (s.onchange = () => s.value && xDo(s.dataset.xadd, null, s.value)));
    $$('[data-planes]').forEach((b) => (b.onclick = () => guardDirty().then((ok) => ok && App.planesDialog())));
    if ($('#bNewPulls')) $('#bNewPulls').onclick = App.createPullsFile;
    $$('[data-reload]').forEach((b) => (b.onclick = async () => {
      const role = b.dataset.reload, r = App.ROLES.find((x) => x.k === role);
      const pend = (S.dirty || {})[role] || (role === 'pulls' && S.pullsDirty) || (role === 'planes' && S.planesDirty);
      if (pend && !(await App.confirmBox('Actualizar archivo', `<p>${esc(r.t)} tiene cambios sin guardar. Si lo actualizas desde el disco se perderán.</p>`, 'Actualizar de todos modos', 'danger'))) return;
      try {
        await App.busy(`Leyendo ${S.roleFile[role] || r.t}…`, async () => { await App.refreshList(); await App.loadRole(role); });
        S.edits = S.edits.filter((x) => x.role !== role);
        if (S.result && App.ready()) App.execute(true);
        toast(`${r.t} actualizado desde el disco`, 'ok');
      } catch (e) { toast(e.message, 'err', 6000); }
      render();
    }));
    $$('.chs').forEach((a) => (a.onclick = async (e) => {
      e.preventDefault(); if (!(await guardDirty())) return;
      try { await App.loadRole(a.dataset.role, true); App.S.result = null; toast('Hoja actualizada', 'ok'); } catch (err) { toast(err.message, 'err'); }
      render();
    }));
    if ($('#toPlanes')) $('#toPlanes').onclick = (e) => { e.preventDefault(); go('planes'); };
  }

  /* ===================== PLANES ===================== */
  const PF0 = () => ({ q: '', estado: '', short: '', status: '', cia: '', sd: '', from: '', to: '', alert: false, page: 0 });
  Object.assign(PF, PF0(), { view: 'pages' });

  /** Aplica filtros; el rango de jobs toma las filas entre ambos jobs según el orden de la hoja */
  function filteredPlanes() {
    const R = App.S.result; if (!R) return { rows: [], rangeErr: '' };
    let base = R.rows, rangeErr = '';
    if (PF.from || PF.to) {
      const fi = PF.from ? base.findIndex((x) => x.jobKey === normKey(PF.from)) : 0;
      const ti = PF.to ? base.findIndex((x) => x.jobKey === normKey(PF.to)) : base.length - 1;
      if (fi < 0 || ti < 0) { rangeErr = `El job ${fi < 0 ? PF.from : PF.to} no está en Planes`; base = []; }
      else base = base.slice(Math.min(fi, ti), Math.max(fi, ti) + 1);
    }
    const q = normKey(PF.q) || PF.q.trim().toUpperCase();
    const rows = base.filter((x) => {
      if (q && ![x.base.aor, x.base.job, ...Object.values(x.out)].some((v) => { const s = String(v ?? '').toUpperCase(); return s.includes(q) || normKey(v) === q; })) return false;
      if (PF.cia && String(x.base.cia ?? '').trim() !== PF.cia) return false;
      if (PF.sd === 'none' && typeof x.out.start === 'number') return false;
      if (PF.sd && PF.sd !== 'none' && !(typeof x.out.start === 'number' && Math.floor(x.out.start) === +PF.sd)) return false;
      if (PF.estado === 'full' && x.onHand !== 6) return false;
      if (PF.estado === 'part' && (x.onHand === 6 || x.onHand === 0)) return false;
      if (PF.estado === 'none' && x.onHand !== 0) return false;
      if (PF.short === '*' && !Object.values(x.out).includes(App.motor.SHORT)) return false;
      if (PF.short === '*p' && !Object.values(x.out).includes(App.motor.PEND)) return false;
      if (PF.short && PF.short[0] !== '*' && x.out[PF.short] !== App.motor.SHORT) return false;
      if (PF.status && String(x.out.status ?? '') !== PF.status) return false;
      if (PF.alert && !Object.keys(x.alert).length) return false;
      return true;
    });
    return { rows, rangeErr };
  }

  function vPlanes() {
    const S = App.S, m = $('#main');
    if (!App.ready()) {
      m.innerHTML = `<div class="ptitle"><h1>DATA <small>Cruce de información</small></h1><span class="sp"></span><button class="btn primary" id="bPlanes">Cargar Planes</button></div>
        <div class="empty">${!S.L.planes ? 'Presiona <b>Cargar Planes</b>: puedes <b>reconectar</b> el Planes de trabajo de la carpeta o <b>seleccionar</b> uno nuevo descargado.' : 'Faltan Validación o Secuencia: cárgalos en <b>Archivos</b>.'}</div>`;
      $('#bPlanes').onclick = () => App.planesDialog();
      return;
    }
    const R = S.result;
    const uniqSorted = (a) => [...new Set(a.map((v) => String(v ?? '').trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'es'));
    const statuses = R ? uniqSorted(R.rows.map((x) => x.out.status)) : [];
    const cias = R ? uniqSorted(R.rows.map((x) => x.base.cia)) : [];
    const sdates = R ? [...R.rows.reduce((m, x) => { if (typeof x.out.start === 'number') { const d = Math.floor(x.out.start); m.set(d, (m.get(d) || 0) + 1); } return m; }, new Map())].sort((a, b) => a[0] - b[0]) : [];
    const noDate = R ? R.rows.filter((x) => typeof x.out.start !== 'number').length : 0;
    m.innerHTML = `
      <div class="pfix">
      <div class="ptitle"><h1>DATA <small>Cruce de información</small></h1><span class="muted">${R ? `Cruce ejecutado ${App.fDT(R.stats.ran)}${S.planesDirty ? ' · <b class="pend">sin guardar en Excel</b>' : ' · guardado'}` : 'El cruce aún no se ejecuta'}</span>
        <span class="sp"></span>${R ? `<span class="muted small">Doble clic en una celda para editarla</span>${S.edits.length ? `<span class="pill warn">${fmtN(S.edits.length)} edición(es) sin guardar</span>` : ''}<button class="btn" id="bPrint">🖨 Imprimir hoja de secuencia</button><button class="btn" id="bExp">Exportar a Excel</button>` : ''}<button class="btn" id="bPlanes" title="Reconectar o seleccionar Planes">Cargar Planes</button><button class="btn primary" id="bRun">${R ? 'Volver a ejecutar' : 'Ejecutar cruce'}</button></div>
      ${R ? `<div class="kpis" id="kpis"></div>
      <div class="filters">
        <input class="input grow" id="fq" placeholder="Buscar job, AOR o contenedor" value="${esc(PF.q)}">
        <div class="rng"><span>Jobs</span><input class="input" id="ff" list="jobsL" placeholder="del job" value="${esc(PF.from)}" inputmode="numeric"><span>al</span><input class="input" id="ft" list="jobsL" placeholder="al job" value="${esc(PF.to)}" inputmode="numeric"></div>
        <datalist id="jobsL">${R.rows.map((x) => `<option value="${esc(show(x.base.job))}">`).join('')}</datalist>
        <select class="input" id="fc"><option value="">Cia: todas</option>${cias.map((c) => `<option ${PF.cia === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select class="input" id="fsd" title="Start Date"><option value="">Start Date: todas</option>${sdates.map(([d, n]) => `<option value="${d}" ${String(PF.sd) === String(d) ? 'selected' : ''}>${App.fSerial(d)} (${fmtN(n)})</option>`).join('')}${noDate ? `<option value="none" ${PF.sd === 'none' ? 'selected' : ''}>Sin Start Date (${fmtN(noDate)})</option>` : ''}</select>
        <select class="input" id="fe"><option value="">Estado: todos</option><option value="full" ${PF.estado === 'full' ? 'selected' : ''}>Completos 6/6</option><option value="part" ${PF.estado === 'part' ? 'selected' : ''}>Incompletos</option><option value="none" ${PF.estado === 'none' ? 'selected' : ''}>Sin componentes 0/6</option></select>
        <select class="input" id="fs"><option value="">Shortage: todos</option><option value="*" ${PF.short === '*' ? 'selected' : ''}>Con algún shortage</option><option value="*p" ${PF.short === '*p' ? 'selected' : ''}>Pendientes de secuenciar</option>${COLS.filter(([k]) => App.motor.CALC.some((c) => c.k === k)).map(([k, t]) => `<option value="${k}" ${PF.short === k ? 'selected' : ''}>Shortage en ${t}</option>`).join('')}</select>
        <select class="input" id="fst"><option value="">Status: todos</option>${statuses.map((s) => `<option ${PF.status === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        <label class="chk"><input type="checkbox" id="fa" ${PF.alert ? 'checked' : ''}> Con alerta</label>
        <button class="btn sm" id="fr">Quitar filtros</button>
        <div class="seg" title="Forma de ver la tabla"><button data-v="pages" class="${PF.view === 'pages' ? 'on' : ''}">Por hojas</button><button data-v="list" class="${PF.view === 'list' ? 'on' : ''}">Todas las filas</button><button data-v="all" class="${PF.view === 'all' ? 'on' : ''}">Pantalla completa</button></div>
      </div>` : ''}
      </div>
      ${R ? '<div class="tw fit" id="tw"></div><div class="pager" id="pg"></div>' : `<div class="empty">Presiona <b>Ejecutar cruce</b> para llenar las columnas 5 a 20 con los datos de Validación, Secuencia y Pulls.<br><span class="muted small">Nada se escribe en el Excel hasta que presiones “Guardar en Excel”.</span></div>`}`;
    $('#bRun').onclick = () => { App.execute(); render(); };
    $('#bPlanes').onclick = () => guardDirty().then((ok) => ok && App.planesDialog());
    if (!R) return;
    $('#bExp').onclick = exportDialog;
    $('#bPrint').onclick = () => App.imp.open();
    const all = R.rows;
    $('#kpis').innerHTML = [
      ['Filas', all.length, ''], ['Completos 6/6', all.filter((x) => x.onHand === 6).length, 'ok'],
      ['Con shortage', all.filter((x) => Object.values(x.out).includes(App.motor.SHORT)).length, 'bad'],
      ['Con alerta', all.filter((x) => Object.keys(x.alert).length).length, 'warn'],
      ['Jobs sin Start Date', all.filter((x) => typeof x.out.start !== 'number').length, 'warn'],
    ].map(([t, n, c]) => `<div class="kpi ${c}"><span>${t}</span><b>${fmtN(n)}</b></div>`).join('');
    const draw = () => {
      const { rows, rangeErr } = filteredPlanes();
      const paged = PF.view === 'pages';
      const pages = paged ? Math.max(1, Math.ceil(rows.length / PAGE)) : 1; PF.page = Math.min(PF.page, pages - 1);
      const view = paged ? rows.slice(PF.page * PAGE, (PF.page + 1) * PAGE) : rows;
      $('#tw').innerHTML = rows.length ? `<table class="t"><thead><tr><th>Fila</th>${COLS.map(([, t]) => `<th>${t}</th>`).join('')}</tr></thead><tbody>
        ${view.map((x) => `<tr data-r="${x.r}"><td class="muted">${x.r + 1}</td>${COLS.map(([k]) => cellHtml(x, k).replace('<td', `<td data-k="${k}"${App.edit.editable(k) ? ' data-ed="1"' : ''}`)).join('')}</tr>`).join('')}</tbody></table>`
        : `<div class="empty">${rangeErr ? esc(rangeErr) : 'Ninguna fila coincide con los filtros.'}</div>`;
      $('#tw').scrollTop = PF._scroll || 0; PF._scroll = 0;
      const tot = `${fmtN(rows.length)} de ${fmtN(all.length)} filas`;
      $('#pg').innerHTML = pages > 1 ? `<button class="btn sm" id="pv" ${PF.page ? '' : 'disabled'}>‹</button><span>Hoja ${PF.page + 1} de ${pages} · ${tot}</span><button class="btn sm" id="nx" ${PF.page < pages - 1 ? '' : 'disabled'}>›</button>` : `<span>${tot}</span>`;
      if (pages > 1) { $('#pv').onclick = () => { PF.page--; draw(); }; $('#nx').onclick = () => { PF.page++; draw(); }; }
      fitTable();
    };
    let qt;
    const re = () => { PF.page = 0; draw(); };
    $('#fq').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { PF.q = e.target.value; re(); }, 200); };
    $('#ff').onchange = (e) => { PF.from = e.target.value.trim(); re(); };
    $('#ft').onchange = (e) => { PF.to = e.target.value.trim(); re(); };
    $('#fc').onchange = (e) => { PF.cia = e.target.value; re(); };
    $('#fsd').onchange = (e) => { PF.sd = e.target.value; re(); };
    $('#fe').onchange = (e) => { PF.estado = e.target.value; re(); };
    $('#fs').onchange = (e) => { PF.short = e.target.value; re(); };
    $('#tw').ondblclick = (e) => {
      const td = e.target.closest('td[data-k]'), tr = e.target.closest('tr[data-r]'); if (!td || !tr) return;
      const x = App.S.result.rows.find((q) => q.r === +tr.dataset.r); if (!x) return;
      PF._scroll = $('#tw').scrollTop;
      App.edit.open(x, td.dataset.k, (COLS.find(([k]) => k === td.dataset.k) || [])[1] || td.dataset.k);
    };
    $('#fst').onchange = (e) => { PF.status = e.target.value; re(); };
    $('#fa').onchange = (e) => { PF.alert = e.target.checked; re(); };
    $$('.seg [data-v]').forEach((b) => (b.onclick = () => { PF.view = b.dataset.v; setFull(PF.view === 'all'); render(); }));
    $('#fr').onclick = () => { Object.assign(PF, PF0()); render(); };
    draw();
  }

  /** La tabla ocupa el resto de la pantalla: encabezados, filtros y títulos de columna quedan fijos */
  /** Vista "Completo" = pantalla completa (se sale con "Por hojas" o con Esc) */
  function setFull(on) {
    const d = document;
    if (on && !d.fullscreenElement && d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(() => {});
    if (!on && d.fullscreenElement && d.exitFullscreen) d.exitFullscreen().catch(() => {});
  }
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && PF.view === 'all' && TAB === 'planes') { PF.view = 'pages'; render(); }
    else fitTable();
  });

  function fitTable() {
    const tw = $('#tw.fit'); if (!tw) return;
    const pg = $('#pg');
    const ft = $('.foot');
    const h = window.innerHeight - tw.getBoundingClientRect().top - (pg ? pg.offsetHeight : 0) - (ft ? ft.offsetHeight : 0) - (document.body.classList.contains('fullview') ? 14 : 30);
    tw.style.height = `${Math.max(220, h)}px`;
  }
  window.addEventListener('resize', fitTable);

  /* ===================== EXPORTAR ===================== */
  async function exportDialog() {
    const S = App.S, R = S.result; if (!R) return;
    const { rows } = filteredPlanes();
    const pick = await App.modal({ title: 'Exportar a Excel', body: `
      <p>¿Qué quieres exportar?</p>
      <div class="opt-list">
        <label class="opt"><input type="radio" name="ex" value="f" checked><span>Solo lo filtrado</span><small>${fmtN(rows.length)} filas</small></label>
        <label class="opt"><input type="radio" name="ex" value="a"><span>Todo</span><small>${fmtN(R.rows.length)} filas</small></label>
      </div>
      <p class="muted small">Se abrirá el explorador para elegir dónde guardarlo. Es un archivo nuevo: tu archivo de Planes no se modifica.</p>`,
      buttons: [{ t: 'Cancelar', v: null }, { t: 'Exportar…', cls: 'primary', fn: (el) => $('input[name=ex]:checked', el).value }] });
    if (!pick) return;
    const list = pick === 'f' ? rows : R.rows;
    if (!list.length) return toast('No hay filas para exportar', 'warn');
    const d = new Date(), p2 = App.pad;
    const fname = `Planes generales IP ${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}-${p2(d.getMinutes())}.xlsx`;
    let handle = null;
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        handle = await window.showSaveFilePicker({ suggestedName: fname, startIn: 'documents',
          types: [{ description: 'Libro de Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] });
      } catch (e) { if (e.name === 'AbortError') return; toast(App.fs.explain(e), 'err'); return; }
    }
    try {
      const bytes = buildExport(list);
      if (handle) { await App.fs.writeFile(handle, bytes); toast(`Exportado: ${handle.name} (${fmtN(list.length)} filas)`, 'ok', 5000); }
      else { XLSX.writeFile(XLSX.read(bytes, { type: 'array' }), fname); toast(`Descargado: ${fname}`, 'ok', 5000); }
    } catch (e) { toast(`No se pudo exportar: ${e.message}`, 'err', 6000); }
  }

  /** Libro nuevo con las columnas de Planes (mismos encabezados del archivo) */
  function buildExport(list) {
    const P = App.S.L.planes, SH = App.motor.SHORT;
    const head = COLS.map(([k, t]) => { const h = P.t.headers[P.t.cols[k]]; return h == null || String(h).trim() === '' ? t : h; });
    const ws = XLSX.utils.aoa_to_sheet([head]);
    const red = { fill: { patternType: 'solid', fgColor: { rgb: 'F9D4D4' } }, font: { color: { rgb: '9B2C2C' }, bold: true } };
    head.forEach((_, c) => { ws[XLSX.utils.encode_cell({ r: 0, c })].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '0E2A40' } } }; });
    list.forEach((x, i) => COLS.forEach(([k], c) => {
      const v = BASE.includes(k) ? x.base[k] : x.out[k];
      App.xl.setCell(ws, i + 1, c, v, App.motor.styleOf(v), x.alert[k] ? `⚠ ${x.alert[k]}` : null, k === 'start' && typeof v === 'number' ? 'dd/mm/yyyy' : null);
    }));
    ws['!cols'] = head.map((h) => ({ wch: Math.max(10, String(h).length + 2) }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: list.length, c: head.length - 1 } }) };
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Planes');
    return App.xl.serialize(wb, 'export.xlsx');
  }

  function cellHtml(x, k) {
    if (BASE.includes(k)) return `<td class="${k === 'job' ? 'b' : ''}">${esc(show(x.base[k]))}</td>`;
    const v = x.out[k];
    if (k === 'estado') return `<td><div class="est" title="${x.onHand} de 6 componentes on hand">${[0, 1, 2, 3, 4, 5].map((i) => `<i class="${i < x.onHand ? 'on' : ''}"></i>`).join('')}<span>${x.onHand}/6</span></div></td>`;
    if (v === App.motor.SHORT) return '<td class="short">SHORTAGE</td>';
    if (v === App.motor.PEND) return '<td class="pendc">PENDIENTE</td>';
    if (k === 'start' && typeof v === 'number') return `<td>${App.fSerial(v)}</td>`;
    const al = x.alert[k];
    return `<td>${esc(show(v))}${al ? ` <span class="al" title="${esc(al)}">⚠</span>` : ''}</td>`;
  }

  /* ===================== PULLS ===================== */
  function vPulls() {
    const S = App.S, m = $('#main');
    if (!S.L.pulls) {
      m.innerHTML = `<div class="empty">No hay archivo de Pulls cargado.<br><span class="muted small">Asígnalo en la pestaña <b>Archivos</b> o crea <b>Pulls.xlsx</b> desde ahí.</span></div>`;
      return;
    }
    const planesJobs = new Set(S.result ? S.result.rows.map((x) => x.jobKey) : S.L.planes ? S.L.planes.t.rows.map((row) => normKey(App.xl.val(S.L.planes.t, row, 'job'))) : []);
    m.innerHTML = `
      <div class="ptitle"><h1>PULLS <small>Lista de pulls</small></h1><span class="muted">${esc(S.L.pulls.name)} · hoja ${esc(S.L.pulls.sheet)}${S.pullsDirty ? ' · <b class="pend">cambios sin guardar</b>' : ''}</span></div>
      <div class="panel">
        <div class="addrow">
          <input class="input" id="aj" placeholder="Job" inputmode="numeric">
          <input class="input" id="ac" placeholder="Contenedor">
          <input class="input grow" id="am" placeholder="Comentario (opcional)">
          <button class="btn primary" id="bAdd">Agregar</button>
          <button class="btn" id="bPaste">Pegar lista desde Excel</button>
        </div>
      </div>
      <div class="filters">
        <input class="input grow" id="lq" placeholder="Buscar job, contenedor o comentario" value="${esc(LF.q)}">
        <select class="input" id="li"><option value="">Todos</option><option value="si" ${LF.inPlanes === 'si' ? 'selected' : ''}>Job está en Planes</option><option value="no" ${LF.inPlanes === 'no' ? 'selected' : ''}>Job NO está en Planes</option><option value="dup" ${LF.inPlanes === 'dup' ? 'selected' : ''}>Job repetido</option></select>
        <select class="input" id="lc"><option value="">Comentario: todos</option><option value="con" ${LF.com === 'con' ? 'selected' : ''}>Con comentario</option><option value="sin" ${LF.com === 'sin' ? 'selected' : ''}>Sin comentario</option></select>
        <button class="btn sm" id="lr">Quitar filtros</button>
        <span class="sp"></span><button class="btn danger sm" id="bDelF">Eliminar filtrados</button>
      </div>
      <div class="tw" id="lt"></div>`;
    const counts = new Map(); S.pulls.forEach((p) => { const k = normKey(p.job); counts.set(k, (counts.get(k) || 0) + 1); });
    const filt = () => {
      const q = LF.q.trim().toUpperCase();
      return S.pulls.filter((p) => {
        const k = normKey(p.job);
        if (q && ![p.job, p.cont, p.com].some((v) => String(v ?? '').toUpperCase().includes(q))) return false;
        if (LF.inPlanes === 'si' && !planesJobs.has(k)) return false;
        if (LF.inPlanes === 'no' && planesJobs.has(k)) return false;
        if (LF.inPlanes === 'dup' && counts.get(k) < 2) return false;
        if (LF.com === 'con' && !String(p.com ?? '').trim()) return false;
        if (LF.com === 'sin' && String(p.com ?? '').trim()) return false;
        return true;
      });
    };
    const draw = () => {
      const rows = filt();
      $('#lt').innerHTML = rows.length ? `<table class="t"><thead><tr><th>#</th><th>Job</th><th>Contenedor</th><th>Comentario</th><th>En Planes</th><th></th></tr></thead><tbody>
        ${rows.map((p) => { const k = normKey(p.job); return `<tr data-id="${p.id}">
          <td class="muted">${S.pulls.indexOf(p) + 1}</td>
          <td><input class="cell" data-f="job" value="${esc(show(p.job))}"></td>
          <td><input class="cell" data-f="cont" value="${esc(show(p.cont))}"></td>
          <td><input class="cell wide" data-f="com" value="${esc(show(p.com))}"></td>
          <td>${planesJobs.has(k) ? '<span class="pill ok">Sí</span>' : '<span class="pill">No</span>'}${counts.get(k) > 1 ? ' <span class="al" title="Este job aparece más de una vez en Pulls">⚠ repetido</span>' : ''}</td>
          <td><button class="btn sm danger" data-del="${p.id}">Quitar</button></td></tr>`; }).join('')}</tbody></table>
        <div class="pager"><span>${fmtN(rows.length)} de ${fmtN(S.pulls.length)} pulls</span></div>`
        : `<div class="empty">${S.pulls.length ? 'Ningún pull coincide con los filtros.' : 'Aún no hay pulls. Agrégalos arriba o pégalos desde Excel.'}</div>`;
      $$('#lt input.cell').forEach((inp) => (inp.onchange = () => {
        if (!App.lock.need()) return render();
        const p = S.pulls.find((x) => x.id === +inp.closest('tr').dataset.id), f = inp.dataset.f;
        let v = inp.value.trim();
        if (f === 'job') { const n = normKey(v); if (!n) { toast('El job no puede quedar vacío', 'warn'); inp.value = show(p.job); return; } v = /^\d+$/.test(n) ? Number(n) : v.toUpperCase(); }
        if (f === 'cont') { if (!v) { toast('El contenedor no puede quedar vacío', 'warn'); inp.value = show(p.cont); return; } v = v.toUpperCase(); }
        p[f] = v; App.pullsChanged(); render();
      }));
      $$('[data-del]').forEach((b) => (b.onclick = () => { if (!App.lock.need()) return; S.pulls = S.pulls.filter((x) => x.id !== +b.dataset.del); App.pullsChanged(); render(); }));
    };
    const add = () => {
      if (!App.lock.need()) return;
      const j = $('#aj').value, c = $('#ac').value;
      if (!normKey(j)) return toast('Escribe el job', 'warn'), $('#aj').focus();
      if (!c.trim()) return toast('Escribe el contenedor', 'warn'), $('#ac').focus();
      App.addPulls([{ job: j, cont: c, com: $('#am').value }]);
      render(); $('#aj').focus();
    };
    $('#bAdd').onclick = add;
    ['#aj', '#ac', '#am'].forEach((s, i, a) => ($(s).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); i < 2 ? $(a[i + 1]).focus() : add(); } }));
    $('#bPaste').onclick = () => App.lock.need() && pasteDialog();
    let qt;
    $('#lq').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { LF.q = e.target.value; draw(); }, 200); };
    $('#li').onchange = (e) => { LF.inPlanes = e.target.value; draw(); };
    $('#lc').onchange = (e) => { LF.com = e.target.value; draw(); };
    $('#lr').onclick = () => { Object.assign(LF, { q: '', inPlanes: '', com: '' }); render(); };
    $('#bDelF').onclick = async () => {
      const rows = filt(); if (!rows.length || !App.lock.need()) return;
      if (!(await App.confirmBox('Eliminar pulls', `<p>Se quitarán <b>${rows.length}</b> pulls de la lista (se reflejará en el Excel al guardar).</p>`, 'Eliminar', 'danger'))) return;
      const ids = new Set(rows.map((p) => p.id)); S.pulls = S.pulls.filter((p) => !ids.has(p.id)); App.pullsChanged(); render();
    };
    draw();
  }

  function pasteDialog() {
    App.modal({ title: 'Pegar lista de pulls', wide: true, body: `
      <p class="muted">Copia desde Excel las columnas <b>Job</b>, <b>Contenedor</b> y (opcional) <b>Comentario</b>, y pégalas aquí. Una fila por pull.</p>
      <textarea class="input" id="pt" rows="10" placeholder="123456	CONT01	Comentario"></textarea>
      <div id="pp" class="muted small"></div>`,
      onOpen: (el) => {
        const t = $('#pt', el); t.focus();
        t.oninput = () => { const r = parse(t.value); $('#pp', el).innerHTML = `${r.ok.length} filas válidas${r.bad ? ` · <b class="pend">${r.bad} sin job o contenedor (se omiten)</b>` : ''}`; };
      },
      buttons: [{ t: 'Cancelar' }, { t: 'Agregar', cls: 'primary', fn: (el) => {
        const r = parse($('#pt', el).value); if (!r.ok.length) { toast('No hay filas válidas', 'warn'); return false; }
        const n = App.addPulls(r.ok); toast(`${n} pulls agregados`, 'ok'); render();
      } }],
    });
    function parse(txt) {
      const ok = []; let bad = 0;
      txt.split(/\r?\n/).forEach((line) => {
        if (!line.trim()) return;
        const c = line.split(/\t|;|,/).map((x) => x.trim());
        if (/^job$/i.test(normTxt(c[0]))) return; // encabezado
        if (normKey(c[0]) && c[1]) ok.push({ job: c[0], cont: c[1], com: c.slice(2).join(' ') }); else bad++;
      });
      return { ok, bad };
    }
  }

  /* ===================== GUARDADO ===================== */
  async function saveDialog() {
    const S = App.S;
    const items = [];
    if (S.L.planes) items.push({ k: 'planes', t: `${S.L.planes.name} (Planes)`, on: S.planesDirty, dis: !S.result, why: S.result ? (S.planesDirty ? 'Columnas 5 a 20 con el cruce actual' : 'Sin cambios desde el último guardado') : 'Ejecuta el cruce primero' });
    if (S.L.pulls) items.push({ k: 'pulls', t: `${S.L.pulls.name} (Pulls)`, on: S.pullsDirty, dis: false, why: S.pullsDirty ? `${S.pulls.length} pulls` : 'Sin cambios' });
    ['val', 'seq'].forEach((k) => {
      if (!S.L[k]) return;
      const ed = S.edits.filter((x) => x.role === k), imp = ed.filter((x) => x.kind === 'import').reduce((a, x) => a + x.n, 0), n = ed.length - ed.filter((x) => x.kind === 'import').length, on = !!S.dirty[k];
      const dirtyF = App.srcs(k).filter((L) => L.dirty).map((L) => L.name);
      if (App.corr.count(k)) dirtyF.push(App.corr.NAME);
      items.push({ k, t: `${(dirtyF.length ? dirtyF.map((n) => (/_MOTOR$/.test(n) ? `${n}_${App.txt.monthTag()}.txt` : n)) : [S.L[k].name]).join(' + ')} (${App.edit.FILE_N[k]})`, on, dis: !on, why: on ? [n && `${n} edición(es)`, imp && `${imp} filas integradas`].filter(Boolean).join(' · ') : 'Sin cambios: no se actualiza' });
    });
    const sel = await App.modal({ title: 'Guardar en los archivos originales', body: `
      <p>Planes y Pulls (Excel) se reemplazan con su versión validada. En Validación y Secuencia (TXT) <b>solo se agregan líneas al final</b>: las correcciones van a Correcciones_Motor.txt y lo integrado a los archivos _MOTOR. Si algo falla, el archivo no se toca.</p>
      <div class="opt-list">${items.map((it) => `<label class="opt ${it.dis ? 'dis' : ''}"><input type="checkbox" value="${it.k}" ${it.on && !it.dis ? 'checked' : ''} ${it.dis ? 'disabled' : ''}><span>${App.esc(it.t)}</span><small>${it.why}</small></label>`).join('')}</div>
      <label class="chk big"><input type="checkbox" id="bk" checked> Crear copia de seguridad antes de sobrescribir (en la subcarpeta <b>${App.fs.BACKUP_DIR}</b>)</label>
      <div class="note">Cierra estos archivos en Excel antes de continuar. Se conservan los datos, las fórmulas y las demás hojas; <b>no se garantiza</b> conservar formatos avanzados, formato condicional, validaciones, tablas o gráficas. Las celdas SHORTAGE quedan en rojo pastel.</div>`,
      buttons: [{ t: 'Cancelar', v: null }, { t: 'Guardar', cls: 'primary', fn: (el) => {
        const t = $$('.opt input:checked', el).map((i) => i.value);
        if (!t.length) { toast('Marca al menos un archivo', 'warn'); return false; }
        return { t, bk: $('#bk', el).checked };
      } }],
    });
    if (sel) App.save(sel.t, sel.bk);
  }

  function showResults(results) {
    App.modal({ title: 'Resultado del guardado', body: `<div class="results">${results.map((r) => `
      <div class="res ${r.ok ? 'ok' : 'bad'}"><b>${r.ok ? '✓' : '✗'} ${App.esc(r.name)}</b>
        <span>${App.esc(r.msg)}</span>${r.backup ? `<small>Respaldo: ${App.esc(r.backup)}</small>` : ''}
        ${r.ok ? '' : '<small>El archivo original no se modificó.</small>'}</div>`).join('')}</div>`,
      buttons: [{ t: 'Entendido', cls: 'primary' }] });
  }

  App.ui = { render, go, showResults, exportDialog, saveDialog, cellHtml: (x, k) => cellHtml(x, k), ICO, isLight };
})(window.App);
