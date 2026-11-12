/* =====================================================================
   acceso.js — modo EDITOR / CONSULTA del Motor
   - Solo una persona a la vez puede entrar como Editor: al entrar se
     escribe QORVEX_Motor_en_uso.json en la carpeta (quién, desde cuándo y
     un "latido" cada minuto).
   - Si alguien más es Editor, los demás entran en modo Consulta: ven todo
     (DATA, dashboard, productividad…) pero no pueden guardar nada.
   - Sin movimiento por N minutos (Configuración, 30 por defecto) el modo
     Editor se cierra solo y libera el lugar para otra persona.
   - Si el latido tiene más de 3 minutos (por ejemplo, se apagó la PC del
     Editor) el lugar se considera libre.
   ===================================================================== */
(function (App) {
  const { $, esc, toast } = App;
  const FILE = 'QORVEX_Motor_en_uso.json';
  const STALE = 3 * 60e3, BEAT = 60e3;
  const devId = (() => { try { let v = localStorage.getItem('qx_motor_dev'); if (!v) { v = Math.random().toString(36).slice(2, 10); localStorage.setItem('qx_motor_dev', v); } return v; } catch (e) { return 'pc'; } })();
  const M = { mode: '', who: '', since: 0, beatT: null, idleT: null, last: Date.now(), warned: false };

  const canEdit = () => M.mode === 'editor';
  const who = () => M.who;
  const mode = () => M.mode;
  const fTime = (ts) => new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  async function readLock() {
    try { const r = await App.txt.readOpt(App.S.dir, FILE); return r ? JSON.parse(r.text) : null; } catch (e) { return null; }
  }
  const fresh = (l) => l && !l.released && Date.now() - (l.beat || 0) < STALE;
  async function writeLock(released) {
    const l = { who: M.who, dev: devId, since: M.since, beat: Date.now(), released: !!released };
    await App.txt.writeWhole(App.S.dir, FILE, JSON.stringify(l, null, 2));
  }

  /** Pantalla de entrada: Editor o Consulta */
  async function enter() {
    stopTimers();
    const S = App.S, cfg = App.cfg.get();
    const l = await readLock();
    const busy = fresh(l) && l.dev !== devId;
    let last = ''; try { last = localStorage.getItem('qx_motor_who') || ''; } catch (e) {}
    const names = [...cfg.supervisors.filter((s) => s.active).map((s) => s.name), ...cfg.users.filter((u) => u.active && u.role === 'admin').map((u) => u.name)];
    const a = await App.modal({ title: 'Entrar a QORVEX', wide: true, body: `
      ${busy ? `<div class="banner warn"><b>${esc(l.who || 'Otra persona')}</b> está trabajando en QORVEX como <b>Editor</b> desde las ${fTime(l.since)} (última actividad ${fTime(l.beat)}). Puedes entrar en <b>modo Consulta</b> para ver la información y la productividad.</div>` : ''}
      <div class="opt-list">
        <label class="opt ${busy ? 'dis' : ''}"><input type="radio" name="md" value="editor" ${busy ? 'disabled' : 'checked'}><span><b>Editor</b><br>
          <small>Carga Planes, guarda en los archivos, corrige capturas y cambia la configuración. Solo una persona a la vez. Se cierra solo tras ${cfg.motor.idleMin} minutos sin movimiento.</small></span></label>
        <label class="opt"><input type="radio" name="md" value="consulta" ${busy ? 'checked' : ''}><span><b>Consulta</b><br>
          <small>Ve DATA, dashboard, Validación, Secuencia y productividad. No guarda nada.</small></span></label>
      </div>
      <label class="lbl" style="margin-top:12px">Tu nombre <input class="input" id="mdWho" list="mdNames" value="${esc(last)}" placeholder="Nombre de quien entra" style="min-width:280px"></label>
      <datalist id="mdNames">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`,
      buttons: [{ t: 'Entrar', cls: 'primary', fn: (el) => { const md = $('input[name=md]:checked', el).value, w = $('#mdWho', el).value.trim(); if (md === 'editor' && !w) { toast('Escribe tu nombre para entrar como Editor', 'warn'); return false; } return { md, w }; } }] });
    const pick = a || { md: 'consulta', w: last };
    M.who = pick.w; try { localStorage.setItem('qx_motor_who', M.who); } catch (e) {}
    if (pick.md === 'editor') {
      const l2 = await readLock(); // otra revisión justo antes de tomar el lugar
      if (fresh(l2) && l2.dev !== devId) { toast(`${l2.who} acaba de entrar como Editor. Entraste en modo Consulta.`, 'warn', 6000); M.mode = 'consulta'; }
      else {
        try { M.mode = 'editor'; M.since = Date.now(); if (!(await App.fs.ensurePermission(S.dir))) throw new Error('sin permiso de escritura'); await writeLock(false); }
        catch (e) { M.mode = 'consulta'; toast(`No se pudo tomar el modo Editor: ${e.message}`, 'err', 6000); }
      }
    } else M.mode = 'consulta';
    startTimers();
    App.ui.render();
    toast(M.mode === 'editor' ? `Modo Editor · ${M.who}` : 'Modo Consulta: solo lectura', M.mode === 'editor' ? 'ok' : 'info');
  }

  /** Libera el lugar de Editor (al salir o por inactividad) */
  async function release() {
    if (M.mode !== 'editor') return;
    try { const l = await readLock(); if (l && l.dev === devId) await writeLock(true); } catch (e) { console.warn(e); }
  }
  async function leave(reason) {
    await release();
    stopTimers();
    M.mode = '';
    // se descarta lo que no se guardó: la sesión vuelve a empezar desde la carpeta
    Object.assign(App.S, { L: {}, X: { val: [], seq: [] }, pulls: [], pullsDirty: false, result: null, planesDirty: false, dirty: {}, edits: [] });
    App.corr.reset(); App.cfg.discard();
    $('#app').innerHTML = `<div class="nosupport closed"><h1>QORVEX se cerró</h1>
      <p>${reason === 'idle' ? `El modo Editor se cerró después de <b>${App.cfg.get().motor.idleMin} minutos sin movimiento</b> para que otra persona pueda entrar como Editor.` : 'Saliste de QORVEX.'}</p>
      <p class="muted">Lo que no se guardó se descartó. Los archivos de la carpeta no cambiaron.</p>
      <button class="btn primary big" id="bBack">Volver a entrar</button></div>`;
    $('#bBack').onclick = async () => { if (await App.connect(true, true)) App.ui.go('home'); };
  }

  /* ---------- Latido e inactividad ---------- */
  function stopTimers() { clearInterval(M.beatT); clearInterval(M.idleT); M.beatT = M.idleT = null; }
  function startTimers() {
    stopTimers(); M.last = Date.now(); M.warned = false;
    if (M.mode !== 'editor') return;
    M.beatT = setInterval(async () => {
      try {
        const l = await readLock();
        if (l && l.dev !== devId && fresh(l)) { // alguien más tomó el lugar (por ejemplo, el latido se perdió)
          M.mode = 'consulta'; stopTimers(); App.ui.render();
          return App.modal({ title: 'Modo Editor perdido', body: `<p><b>${esc(l.who)}</b> entró como Editor. Pasaste a modo Consulta; lo que no guardaste ya no se puede guardar.</p>` });
        }
        await writeLock(false);
      } catch (e) { console.warn('latido', e); }
    }, BEAT);
    M.idleT = setInterval(() => {
      const lim = App.cfg.get().motor.idleMin * 60e3, idle = Date.now() - M.last;
      if (idle >= lim) return leave('idle');
      if (idle >= lim - 2 * 60e3 && !M.warned) { M.warned = true; toast('Sin movimiento: QORVEX cerrará el modo Editor en 2 minutos. Mueve el mouse o presiona una tecla para seguir.', 'warn', 15000); }
    }, 15e3);
  }
  const touch = () => { M.last = Date.now(); M.warned = false; };
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, touch, { passive: true, capture: true }));
  let mmT = 0; document.addEventListener('mousemove', () => { const n = Date.now(); if (n - mmT > 5000) { mmT = n; touch(); } }, { passive: true });
  window.addEventListener('pagehide', () => { release(); });

  /** Para botones que escriben: avisa y devuelve false en modo Consulta */
  function need() { if (canEdit()) return true; toast(M.mode ? 'Modo Consulta: no se puede guardar ni cambiar nada. Entra como Editor.' : 'Primero entra a QORVEX', 'warn', 5000); return false; }
  /** Para pruebas: tiempo de inactividad simulado */
  const _idle = (ms) => { M.last = Date.now() - ms; };

  App.lock = { FILE, enter, leave, release, canEdit, need, who, mode, readLock, _idle, _tick: () => M.idleT };
})(window.App);
