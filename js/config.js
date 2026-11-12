/* =====================================================================
   config.js — Config_QORVEX.json (en la carpeta Data Base)
   Única fuente de: turnos y horarios, días laborables, festivos, metas
   por turno y tipo (jobs y contenedores), supervisores y usuarios de
   QORVEX MOBILE. Solo el Motor (modo Editor) la escribe; las tabletas
   la leen.
   ===================================================================== */
(function (App) {
  const { $, $$, esc, fmtN, toast, pad } = App;
  const NAME = 'Config_QORVEX.json';
  const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const ROLE_N = { validador: 'Validador', secuenciador: 'Secuenciador', ambos: 'Validador y secuenciador', admin: 'Administrador' };
  const goal0 = () => ({ val: { jobs: 0, cont: 0 }, seq: { jobs: 0, cont: 0 } });
  const DEF = () => ({
    version: 1, updated: '', by: '',
    shifts: [
      { n: 'Día', s: '07:00', e: '15:00', days: [1, 2, 3, 4, 5], goals: goal0() },
      { n: 'Tarde', s: '15:00', e: '22:30', days: [1, 2, 3, 4, 5], goals: goal0() },
      { n: 'Noche', s: '22:30', e: '07:00', days: [1, 2, 3, 4, 5], goals: goal0() },
    ],
    supervisors: [], users: [], holidays: [],
    motor: { idleMin: 30 },
  });
  let CFG = DEF(), META = { loaded: false, lastModified: 0 };

  function normalize(c) {
    const d = DEF(), o = Object.assign(d, c || {});
    o.shifts = (Array.isArray(o.shifts) && o.shifts.length ? o.shifts : d.shifts).map((x) => ({
      n: String(x.n || '').trim() || 'Turno', s: x.s || '00:00', e: x.e || '00:00',
      days: Array.isArray(x.days) ? x.days.map(Number).filter((n) => n >= 0 && n <= 6) : [1, 2, 3, 4, 5],
      goals: { val: { jobs: +(x.goals?.val?.jobs) || 0, cont: +(x.goals?.val?.cont) || 0 }, seq: { jobs: +(x.goals?.seq?.jobs) || 0, cont: +(x.goals?.seq?.cont) || 0 } },
    }));
    o.supervisors = (o.supervisors || []).map((s) => ({ emp: String(s.emp || '').trim().toUpperCase(), name: String(s.name || '').trim(), active: s.active !== false })).filter((s) => s.emp && s.name);
    o.users = (o.users || []).map((u) => ({ emp: String(u.emp || '').trim().toUpperCase(), name: String(u.name || '').trim(), role: ROLE_N[u.role] ? u.role : 'ambos', pw: u.pw || '', pwAt: +u.pwAt || 0, must: !!u.must, active: u.active !== false })).filter((u) => u.emp && u.name);
    o.holidays = (o.holidays || []).filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.d)).map((h) => ({ d: h.d, n: String(h.n || '').trim() })).sort((a, b) => a.d.localeCompare(b.d));
    o.motor = { idleMin: Math.max(5, +(o.motor && o.motor.idleMin) || 30) };
    return o;
  }

  async function load() {
    const S = App.S; if (!S.dir) return CFG;
    try {
      const raw = await App.txt.readOpt(S.dir, NAME);
      CFG = normalize(raw ? JSON.parse(raw.text.replace(/^﻿/, '')) : null);
      META = { loaded: !!raw, lastModified: raw ? raw.lastModified : 0 };
    } catch (e) { toast(`${NAME}: no se pudo leer (${e.message}). Se usan valores por defecto.`, 'warn', 6000); CFG = normalize(null); META = { loaded: false, lastModified: 0 }; }
    return CFG;
  }
  async function save(next) {
    const S = App.S;
    if (App.lock && !App.lock.canEdit()) throw new Error('Modo consulta: no se puede guardar la configuración.');
    const cur = await App.txt.readOpt(S.dir, NAME);
    if (cur && META.loaded && cur.lastModified !== META.lastModified) throw new Error('La configuración cambió en otro equipo después de abrirla. Vuelve a cargarla.');
    const c = normalize(next); c.updated = new Date().toISOString(); c.by = (App.lock && App.lock.who()) || '';
    if (!(await App.fs.ensurePermission(S.dir))) throw new Error('No se autorizó la escritura en la carpeta.');
    if (cur) { try { await App.fs.backup(S.dir, NAME, new TextEncoder().encode(cur.text)); } catch (e) { console.warn(e); } }
    await App.txt.writeWhole(S.dir, NAME, JSON.stringify(c, null, 2));
    await load();
    return CFG;
  }

  /* ---------- Turnos, días y metas ---------- */
  const hm = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const inShift = (x, m) => { const a = hm(x.s), b = hm(x.e); return a === b ? true : a < b ? m >= a && m < b : m >= a || m < b; };
  const shiftAt = (ts) => { const d = new Date(ts), m = d.getHours() * 60 + d.getMinutes(); return CFG.shifts.find((x) => inShift(x, m)) || null; };
  const hours = (x) => { let a = hm(x.s), b = hm(x.e); if (b <= a) b += 1440; return (b - a) / 60; };
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  /** Fecha operativa: lo capturado después de las 00:00 en un turno que cruza la medianoche cuenta para el día en que inició */
  function opDate(ts) { const d = new Date(ts), m = d.getHours() * 60 + d.getMinutes(), x = shiftAt(ts); if (x && hm(x.s) > hm(x.e) && m < hm(x.e)) d.setDate(d.getDate() - 1); return isoDay(d); }
  const holiday = (iso) => CFG.holidays.find((h) => h.d === iso) || null;
  /** ¿Ese turno trabaja ese día con meta? (día laborable y no festivo) */
  function hasGoal(iso, x) { if (!x || holiday(iso)) return false; return x.days.includes(new Date(`${iso}T12:00:00`).getDay()); }

  /* ---------- Contraseña (misma fórmula que QORVEX MOBILE) ---------- */
  async function hashPw(emp, pw) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`vm|${emp}|${pw}`));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  /* =====================================================================
     Pantalla CONFIGURACIÓN
     ===================================================================== */
  let D = null; // borrador en edición
  function render(m) {
    const S = App.S;
    if (!S.dir) { m.innerHTML = '<div class="empty">Primero conecta la carpeta de trabajo (ARCHIVOS).</div>'; return; }
    const ro = App.lock && !App.lock.canEdit();
    if (!D) D = JSON.parse(JSON.stringify(CFG));
    const dis = ro ? 'disabled' : '';
    const cov = (() => { const cnt = new Array(1440).fill(0); D.shifts.forEach((x) => { for (let k = 0; k < 1440; k++) if (inShift(x, k)) cnt[k]++; }); return { gaps: cnt.filter((c) => !c).length, over: cnt.filter((c) => c > 1).length }; })();
    m.innerHTML = `
      <div class="ptitle"><h1>CONFIGURACIÓN <small>Turnos, metas, supervisores y usuarios</small></h1>
        <span class="muted">${META.loaded ? `${esc(NAME)} · ${CFG.updated ? `guardado ${App.fDT(new Date(CFG.updated).getTime())}${CFG.by ? ` por ${esc(CFG.by)}` : ''}` : ''}` : 'Aún no existe Config_QORVEX.json: se crea al guardar'}</span>
        <span class="sp"></span>${ro ? '<span class="pill warn">Modo consulta: solo lectura</span>' : '<button class="btn" id="cfReset">Descartar cambios</button><button class="btn primary" id="cfSave">Guardar configuración</button>'}</div>
      <div class="note">QORVEX MOBILE toma de aquí los turnos, los usuarios y los supervisores cada vez que se conecta a la carpeta.</div>

      <div class="dpanel cfg"><div class="dph"><h3>Turnos, días laborables y metas</h3><span class="sp"></span>${ro ? '' : '<button class="btn sm" id="shAdd">+ Agregar turno</button>'}</div>
        <div class="tw" style="max-height:none"><table class="t cfg-t"><thead><tr><th rowspan="2">Turno</th><th rowspan="2">Inicio</th><th rowspan="2">Fin</th><th rowspan="2">Horas</th><th rowspan="2">Días laborables</th><th colspan="2">Meta Validación</th><th colspan="2">Meta Secuencia</th><th rowspan="2"></th></tr>
          <tr><th>Jobs</th><th>Contenedores</th><th>Jobs</th><th>Contenedores</th></tr></thead><tbody>
          ${D.shifts.map((x, i) => `<tr>
            <td><input class="input" data-sh="${i}" data-k="n" value="${esc(x.n)}" maxlength="20" ${dis}></td>
            <td><input class="input" type="time" data-sh="${i}" data-k="s" value="${esc(x.s)}" ${dis}></td>
            <td><input class="input" type="time" data-sh="${i}" data-k="e" value="${esc(x.e)}" ${dis}></td>
            <td class="num">${hours(x).toFixed(1)}</td>
            <td><div class="days">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label class="${x.days.includes(d) ? 'on' : ''}"><input type="checkbox" data-sh="${i}" data-day="${d}" ${x.days.includes(d) ? 'checked' : ''} ${dis}>${DAYS[d]}</label>`).join('')}</div></td>
            ${['val', 'seq'].map((ty) => ['jobs', 'cont'].map((u) => `<td><input class="input num" type="number" min="0" step="1" data-sh="${i}" data-g="${ty}.${u}" value="${x.goals[ty][u]}" ${dis}></td>`).join('')).join('')}
            <td>${ro || D.shifts.length < 2 ? '' : `<button class="btn sm" data-shdel="${i}" title="Quitar turno">✕</button>`}</td></tr>`).join('')}
          </tbody></table></div>
        ${cov.gaps || cov.over ? `<div class="banner warn">${cov.gaps ? `Hay ${Math.floor(cov.gaps / 60)} h ${cov.gaps % 60} min del día sin turno. ` : ''}${cov.over ? `Hay ${Math.floor(cov.over / 60)} h ${cov.over % 60} min en más de un turno (se toma el primero).` : ''}</div>` : '<div class="muted small">✓ Los turnos cubren las 24 horas sin traslaparse. El turno que cruza la medianoche cuenta para el día en que inicia.</div>'}
        <div class="muted small">La meta es por turno y por día. En días no laborables y festivos las capturas sí cuentan, pero sin meta.</div>
      </div>

      <div class="dgrid cfg2">
        <div class="dpanel cfg"><div class="dph"><h3>Supervisores</h3><span class="muted small">${fmtN(D.supervisors.filter((s) => s.active).length)} activos</span><span class="sp"></span>${ro ? '' : '<button class="btn sm" id="spAdd">+ Agregar</button>'}</div>
          <table class="t mini"><thead><tr><th>No. empleado</th><th>Nombre</th><th>Activo</th><th></th></tr></thead><tbody>
          ${D.supervisors.map((s, i) => `<tr><td><input class="input" data-sp="${i}" data-k="emp" value="${esc(s.emp)}" ${dis}></td><td><input class="input" data-sp="${i}" data-k="name" value="${esc(s.name)}" ${dis}></td>
            <td><input type="checkbox" data-sp="${i}" data-k="active" ${s.active ? 'checked' : ''} ${dis}></td><td>${ro ? '' : `<button class="btn sm" data-spdel="${i}">✕</button>`}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin supervisores. Agrégalos para que el validador elija a su encargado al iniciar sesión.</td></tr>'}
          </tbody></table></div>
        <div class="dpanel cfg"><div class="dph"><h3>Días festivos</h3><span class="sp"></span>${ro ? '' : '<button class="btn sm" id="hoAdd">+ Agregar</button>'}</div>
          <table class="t mini"><thead><tr><th>Fecha</th><th>Descripción</th><th></th></tr></thead><tbody>
          ${D.holidays.map((h, i) => `<tr><td><input class="input" type="date" data-ho="${i}" data-k="d" value="${esc(h.d)}" ${dis}></td><td><input class="input" data-ho="${i}" data-k="n" value="${esc(h.n)}" ${dis}></td><td>${ro ? '' : `<button class="btn sm" data-hodel="${i}">✕</button>`}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Sin festivos.</td></tr>'}
          </tbody></table></div>
      </div>

      <div class="dpanel cfg"><div class="dph"><h3>Usuarios de QORVEX MOBILE</h3><span class="muted small">Validadores y secuenciadores · la contraseña se guarda cifrada</span><span class="sp"></span>${ro ? '' : '<button class="btn sm" id="usAdd">+ Agregar usuario</button>'}</div>
        <table class="t mini"><thead><tr><th>No. empleado</th><th>Nombre</th><th>Puesto</th><th>Contraseña</th><th>Pedir cambio</th><th>Activo</th><th></th></tr></thead><tbody>
        ${D.users.map((u, i) => `<tr><td><input class="input" data-us="${i}" data-k="emp" value="${esc(u.emp)}" ${dis}></td><td><input class="input" data-us="${i}" data-k="name" value="${esc(u.name)}" ${dis}></td>
          <td><select class="input" data-us="${i}" data-k="role" ${dis}>${Object.entries(ROLE_N).map(([k, t]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
          <td>${u.pw ? '<span class="pill ok">asignada</span>' : '<span class="pill warn">sin asignar</span>'} ${ro ? '' : `<button class="btn sm" data-uspw="${i}">${u.pw ? 'Cambiar' : 'Asignar'}</button>`}</td>
          <td><input type="checkbox" data-us="${i}" data-k="must" ${u.must ? 'checked' : ''} ${dis}></td>
          <td><input type="checkbox" data-us="${i}" data-k="active" ${u.active ? 'checked' : ''} ${dis}></td><td>${ro ? '' : `<button class="btn sm" data-usdel="${i}">✕</button>`}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Sin usuarios. Las tabletas siguen usando los usuarios que ya tienen.</td></tr>'}
        </tbody></table>
        <div class="muted small">Sin contraseña asignada, el usuario no puede entrar en una tableta nueva. Un usuario que ya existe en la tableta conserva su contraseña hasta que aquí se le asigne otra.</div></div>

      <div class="dpanel cfg"><div class="dph"><h3>Motor</h3></div>
        <label class="lbl">Cerrar el modo Editor tras <input class="input num" type="number" min="5" step="5" id="idle" value="${D.motor.idleMin}" ${dis}> minutos sin movimiento</label></div>`;
    if (ro) return;
    const redraw = () => render(m);
    $$('[data-sh][data-k]', m).forEach((i) => (i.onchange = () => { D.shifts[+i.dataset.sh][i.dataset.k] = i.value; redraw(); }));
    $$('[data-sh][data-day]', m).forEach((i) => (i.onchange = () => { const x = D.shifts[+i.dataset.sh], d = +i.dataset.day; x.days = i.checked ? [...new Set([...x.days, d])] : x.days.filter((n) => n !== d); redraw(); }));
    $$('[data-sh][data-g]', m).forEach((i) => (i.onchange = () => { const [ty, u] = i.dataset.g.split('.'); D.shifts[+i.dataset.sh].goals[ty][u] = Math.max(0, parseInt(i.value, 10) || 0); }));
    $$('[data-shdel]', m).forEach((b) => (b.onclick = () => { D.shifts.splice(+b.dataset.shdel, 1); redraw(); }));
    $('#shAdd').onclick = () => { D.shifts.push({ n: `Turno ${D.shifts.length + 1}`, s: '00:00', e: '00:00', days: [1, 2, 3, 4, 5], goals: goal0() }); redraw(); };
    const bindList = (key, arr) => {
      $$(`[data-${key}][data-k]`, m).forEach((i) => (i.onchange = () => { const o = arr()[+i.dataset[key]], k = i.dataset.k; o[k] = i.type === 'checkbox' ? i.checked : k === 'emp' ? i.value.trim().toUpperCase() : i.value; }));
      $$(`[data-${key}del]`, m).forEach((b) => (b.onclick = () => { arr().splice(+b.dataset[`${key}del`], 1); redraw(); }));
    };
    bindList('sp', () => D.supervisors); bindList('ho', () => D.holidays); bindList('us', () => D.users);
    $('#spAdd').onclick = () => { D.supervisors.push({ emp: '', name: '', active: true }); redraw(); };
    $('#hoAdd').onclick = () => { D.holidays.push({ d: '', n: '' }); redraw(); };
    $('#usAdd').onclick = () => { D.users.push({ emp: '', name: '', role: 'ambos', pw: '', pwAt: 0, must: true, active: true }); redraw(); };
    $$('[data-uspw]', m).forEach((b) => (b.onclick = async () => {
      const u = D.users[+b.dataset.uspw];
      if (!u.emp) return toast('Primero escribe el No. de empleado', 'warn');
      const pw = await App.modal({ title: `Contraseña de ${esc(u.emp)} · ${esc(u.name)}`, body: '<label class="lbl">Contraseña nueva (mín. 4)<input class="input" type="password" id="pw1" autocomplete="new-password"></label><label class="lbl">Confirmar<input class="input" type="password" id="pw2" autocomplete="new-password"></label>',
        buttons: [{ t: 'Cancelar', v: null }, { t: 'Asignar', cls: 'primary', fn: (el) => { const a = $('#pw1', el).value, c = $('#pw2', el).value; if (a.length < 4) { toast('Mínimo 4 caracteres', 'warn'); return false; } if (a !== c) { toast('No coinciden', 'warn'); return false; } return a; } }] });
      if (!pw) return;
      u.pw = await hashPw(u.emp, pw); u.pwAt = Date.now();
      toast('Contraseña asignada · se aplica al guardar la configuración', 'ok'); redraw();
    }));
    $('#idle').onchange = (e) => { D.motor.idleMin = Math.max(5, parseInt(e.target.value, 10) || 30); };
    $('#cfReset').onclick = () => { D = null; redraw(); };
    $('#cfSave').onclick = async () => {
      const err = [];
      D.shifts.forEach((x) => { x.n = String(x.n || '').trim(); });
      if (D.shifts.some((x) => !x.n)) err.push('Cada turno necesita nombre.');
      if (new Set(D.shifts.map((x) => x.n.toLowerCase())).size !== D.shifts.length) err.push('Hay turnos con el mismo nombre.');
      if (D.shifts.some((x) => !/^\d{2}:\d{2}$/.test(x.s) || !/^\d{2}:\d{2}$/.test(x.e))) err.push('Revisa las horas de inicio y fin.');
      const dupe = (a) => a.length !== new Set(a).size;
      if (D.supervisors.some((s) => !s.emp || !s.name)) err.push('Cada supervisor necesita No. de empleado y nombre.');
      if (dupe(D.supervisors.map((s) => s.emp))) err.push('Hay supervisores con el mismo No. de empleado.');
      if (D.users.some((u) => !u.emp || !u.name)) err.push('Cada usuario necesita No. de empleado y nombre.');
      if (dupe(D.users.map((u) => u.emp))) err.push('Hay usuarios con el mismo No. de empleado.');
      if (D.holidays.some((h) => !/^\d{4}-\d{2}-\d{2}$/.test(h.d))) err.push('Cada festivo necesita fecha.');
      if (err.length) return App.modal({ title: 'Revisa la configuración', body: `<ul class="errs">${err.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` });
      try { await App.busy('Guardando configuración…', () => save(D)); D = null; toast('Configuración guardada. Las tabletas la toman al conectarse.', 'ok', 5000); if (App.S.result) App.ui.render(); else redraw(); }
      catch (e) { toast(e.message, 'err', 7000); }
    };
  }
  const discard = () => { D = null; };

  App.cfg = { NAME, DAYS, ROLE_N, load, save, render, discard, shiftAt, opDate, hours, hasGoal, holiday, isoDay, hm, inShift, hashPw, get: () => CFG, get loaded() { return META.loaded; } };
})(window.App);
