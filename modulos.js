/* =====================================================================
   modulos.js — INICIO: panel general con indicadores.
   Si aún no hay datos, ofrece conectar la carpeta, cargar los archivos y
   ejecutar el cruce con un solo botón.
   ===================================================================== */
(function (App) {
  const { $, $$, esc, fmtN } = App;
  const CAPS = [['case', 'Job Management'], ['check', 'Data Validation'], ['cube', 'Material Availability'], ['trend', 'Production Sequencing'], ['pin', 'Operational Tracking'], ['bars', 'Automated Reporting']];
  const MOD_ICO = { planes: 'doc', val: 'check', dash: 'dash', seq: 'flow', pulls: 'list' };
  const DOT = { planes: 'c-blue', val: 'c-green', seq: 'c-purple', pulls: 'c-orange' };

  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const distinct = (role, k) => { const s = new Set(); App.srcs(role).forEach((L) => L.t.rows.forEach((r) => { const v = App.normKey(App.xl.val(L.t, r, k)); if (v) s.add(v); })); return s.size; };
  const nRows = (role) => App.srcs(role).reduce((a, L) => a + L.t.rows.length, 0);

  function home(m) {
    const S = App.S, R = S.result, L = S.L, I = App.ui.ICO, light = App.ui.isLight();
    let sm = null; try { sm = App.dash.summary(); } catch (e) { sm = null; }
    const nJobs = R ? R.rows.length : L.planes ? L.planes.t.rows.length : 0;
    const full = R ? R.rows.filter((x) => x.onHand === 6).length : 0;
    const shortRows = R ? R.rows.filter((x) => Object.values(x.out).includes(App.motor.SHORT)).length : 0;
    const pendRows = R ? R.rows.filter((x) => Object.values(x.out).includes(App.motor.PEND)).length : 0;
    const NONE = '<span class="mv none">Sin datos</span>';
    const num = (n, u) => `<span class="mv">${fmtN(n)}<small>${u}</small></span>`;
    const mods = [
      { k: 'planes', c: 'DATA', t: 'Cruce de información', v: L.planes ? num(nJobs, 'jobs') : NONE,
        s: R ? `Cruce ${App.fDT(R.stats.ran)}${S.planesDirty ? ' · <span class="bad">sin guardar</span>' : ''}` : L.planes ? 'Listo para ejecutar el cruce' : 'Carga los archivos para comenzar' },
      { k: 'val', c: 'VALIDATE', t: 'Validaciones', v: L.val ? num(nRows('val'), 'registros') : NONE,
        s: L.val ? `<b>${fmtN(distinct('val', 'job'))}</b> jobs · <b>${fmtN(distinct('val', 'cont'))}</b> contenedores` : 'Excel de Validación' },
      { k: 'dash', c: 'DASHBOARD', t: 'Material disponible', v: R ? `<span class="mv">${pct(full, nJobs)}%<small>on hand 6/6</small></span>` : NONE,
        s: R ? `<b>${fmtN(full)}</b> jobs completos · <span class="${shortRows ? 'bad' : 'okc'}">${fmtN(shortRows)} con shortage</span>` : 'Se calcula con el cruce' },
      { k: 'seq', c: 'SEQUENCE', t: 'Jobs secuenciados', v: L.seq ? num(distinct('seq', 'job'), 'jobs') : NONE,
        s: L.seq ? `<b>${fmtN(nRows('seq'))}</b> registros${R ? ` · <span class="${pendRows ? 'bad' : 'okc'}">${fmtN(pendRows)} pendientes</span>` : ''}` : 'Excel de Secuencia' },
      { k: 'pulls', c: 'PULLS', t: 'Lista de pulls', v: L.pulls ? num(S.pulls.length, 'pulls') : NONE,
        s: L.pulls ? (S.pullsDirty ? '<span class="bad">Cambios sin guardar</span>' : 'Guardado') : 'Opcional' },
    ];
    const cls = (p) => (p >= 100 ? '' : p >= 80 ? 'mid' : 'low');
    const cov = (lbl, got, goal) => { const p = pct(got, goal); return `<div class="cbar"><span>${lbl}</span><div class="tr"><i class="${cls(p)}" style="width:${Math.max(2, Math.min(100, p))}%"></i></div><span>${got.toFixed(2)} / ${goal} d</span></div>`; };
    // Botón principal según el punto en que esté la sesión
    let cta, hint = '';
    if (!S.dir && S.savedDir) { cta = `<button class="btn primary big" id="hGo" data-saved="1">${I.play}Reconectar «${esc(S.savedDir.name)}» y cargar todo</button><button class="btn big" id="hPick">Elegir otra carpeta</button>`; hint = 'Un clic: conecta la carpeta, lee los Excel y ejecuta el cruce.'; }
    else if (!S.dir) { cta = `<button class="btn primary big" id="hPick">${I.play}Seleccionar carpeta de trabajo</button>`; hint = 'Elige la carpeta con Validación, Secuencia y Pulls. Planes se carga aparte (reconectar o seleccionar).'; }
    else if (!App.ready()) { cta = `<button class="btn primary big" id="hGo">${I.play}Cargar archivos y ejecutar cruce</button>`; hint = `Carpeta conectada: ${esc(S.dir.name)}`; }
    else if (!R) { cta = `<button class="btn primary big" id="hRun">${I.play}Ejecutar cruce</button>`; }
    else cta = '<button class="btn primary big" data-go="planes">' + I.play + 'Ver cruce</button><button class="btn big" data-go="dash">Ver dashboard</button>';

    m.innerHTML = `<div class="home">
      <section class="h-hero">
        <div class="h-photo" style="background-image:url(img/hero-almacen-${light ? 'light' : 'dark'}.jpg)"></div>
        <img class="h-logo" src="img/qorvex-logo-${light ? 'light' : 'dark'}.png" alt="QORVEX">
        <div class="h-txt">
          <span class="h-eye">Advanced Manufacturing Control Platform</span>
          <span class="h-ttl">Manufacturing Intelligence Engine</span>
          <span class="h-tag">CONNECT · VALIDATE · SEQUENCE · OPTIMIZE</span>
          <div class="h-caps">${CAPS.map(([i, c]) => `<span>${I[i]}${c}</span>`).join('')}</div>
          <div class="h-cta">${cta}</div>${hint ? `<span class="h-hint">${I.bulb}${hint}</span>` : ''}
        </div>
      </section>
      <div class="mods">${mods.map((x) => `<button class="mod m-${x.k} ${x.v === NONE ? 'off' : ''}" data-go="${x.k}"><span class="mhead">${I[MOD_ICO[x.k]]}<span><span class="mc">${x.c}</span><span class="mt">${x.t}</span></span></span>${x.v}<span class="ms">${x.s}</span></button>`).join('')}</div>
      <div class="h-row">
        <div class="h-panel hp-cov"><h3>${I.cube}Cobertura de material${sm ? ` · desde ${sm.date.split('-').reverse().join('/')}` : ''}</h3>
          ${sm ? `<div class="cbars">${cov('On hand', sm.cOn.days, sm.goalOn)}${cov('Secuenciado', sm.cSeq.days, sm.goalSeq)}</div>
            <h3 style="margin-top:14px">On hand por Cia · ${sm.goalOn} días</h3>
            <div class="cbars">${sm.perCia.map((r) => { const p = pct(r.ok, r.n); return `<div class="cbar"><span>${esc(r.c)}</span><div class="tr"><i class="${cls(p)}" style="width:${Math.max(2, p)}%"></i></div><span>${p}% · ${fmtN(r.ok)}/${fmtN(r.n)}</span></div>`; }).join('')}</div>`
            : `<div class="h-empty">${I.cube}<span>${R ? 'Ningún job tiene Start Date en Planes.' : 'Aparece aquí en cuanto se ejecuta el cruce.'}</span></div>`}
        </div>
        <div class="h-panel"><h3>${I.db}Fuentes de datos</h3><div class="flist">
          ${App.ROLES.map((r) => `<div><span><i class="dot ${DOT[r.k] || ''} ${L[r.k] ? 'on' : ''}"></i>${r.t}</span><span>${L[r.k] ? `${fmtN(r.multi ? nRows(r.k) : L[r.k].t.rows.length)} filas${r.multi && S.X[r.k].length ? ` · ${S.X[r.k].length + 1} archivos` : ''}` : S.roleFile[r.k] ? 'sin cargar' : 'sin conectar'}</span></div>`).join('')}
          <div><span><i class="dot c-cyan ${S.dir ? 'on' : ''}"></i>Carpeta</span><span>${S.dir ? esc(S.dir.name) : 'sin conectar'}</span></div>
        </div></div>
      </div></div>`;
    $$('[data-go]', m).forEach((b) => (b.onclick = () => App.ui.go(b.dataset.go)));
    if ($('#hGo')) $('#hGo').onclick = () => App.quickStart(!!$('#hGo').dataset.saved);
    if ($('#hPick')) $('#hPick').onclick = () => App.quickStart(false);
    if ($('#hRun')) $('#hRun').onclick = () => { App.execute(); App.ui.render(); };
  }

  App.mods = { home };
})(window.App);
