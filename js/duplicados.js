/* =====================================================================
   duplicados.js — "Agregar duplicado" (solo QORVEX, modo Editor)
   En QORVEX MOBILE un job no se puede repetir (salvo Switch Ch / Gde hasta
   4 veces). Si un job SÍ llega repetido de verdad, el de QORVEX lo agrega
   aquí con un motivo obligatorio. Se escribe al final de
   Validacion_MOTOR_aaaa-mm.txt / Secuencia_MOTOR_… con Duplicado = Sí.
   ===================================================================== */
(function (App) {
  const { $, esc, toast, normTxt, normKey } = App;
  const COMPS = ['BCM', 'Llaves', 'Cluster', 'Arnés', 'Switch Ch', 'Switch Gde'];
  const P2 = (n) => String(n).padStart(2, '0');

  /** Capturas existentes de ese job/componente/tipo (todas las tabletas + Motor) */
  function existing(role, comp, job) {
    const nc = App.normComp(comp), nj = normKey(job);
    return (App.cap.recs[role] || []).filter((r) => App.normComp(r.comp) === nc && normKey(r.job) === nj);
  }

  async function open(role0) {
    const S = App.S;
    if (!App.lock.need()) return;
    if (!S.L.val || !S.L.seq) return toast('Primero carga los archivos (ARCHIVOS → Cargar archivos)', 'warn');
    const sups = App.cfg.get().supervisors.filter((s) => s.active);
    const r = await App.modal({ title: 'Agregar duplicado', wide: true, body: `
      <p class="muted">Para un job que llegó repetido y es correcto. QORVEX MOBILE no lo permite; aquí queda registrado como <b>Duplicado</b> con su motivo.</p>
      <div class="pr-grid">
        <label>Tipo<select class="input" id="duT"><option value="val" ${role0 !== 'seq' ? 'selected' : ''}>Validación</option><option value="seq" ${role0 === 'seq' ? 'selected' : ''}>Secuencia</option></select></label>
        <label>Componente<select class="input" id="duC">${COMPS.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
        <label>Caja / Rack<input class="input" id="duK" maxlength="20" autocomplete="off"></label>
        <label>Job<input class="input" id="duJ" maxlength="20" autocomplete="off" placeholder="solo números, máx 6"></label>
        <label id="duPl">Placas<input class="input" id="duP" maxlength="20" autocomplete="off"></label>
        <label>Supervisor<select class="input" id="duS"><option value="">—</option>${sups.map((s) => `<option value="${esc(`${s.emp} · ${s.name}`)}">${esc(s.name)}</option>`).join('')}</select></label>
      </div>
      <label class="lbl" style="display:flex;margin-top:10px">Motivo (obligatorio)<input class="input" id="duM" maxlength="200" style="flex:1" placeholder="Ej. retrabajo autorizado por calidad"></label>
      <div id="duInfo" class="note" style="margin-top:10px"></div>`,
      onOpen: (el) => {
        const info = () => {
          const role = $('#duT', el).value, j = String($('#duJ', el).value).replace(/\D/g, '').slice(0, 6);
          $('#duJ', el).value = j; $('#duPl', el).style.display = role === 'val' ? '' : 'none';
          const ex = j ? existing(role, $('#duC', el).value, j) : [];
          $('#duInfo', el).innerHTML = !j ? 'Escribe el job.' : ex.length ? `Este job ya tiene <b>${ex.length}</b> captura(s) en ${role === 'val' ? 'Validación' : 'Secuencia'} · ${esc($('#duC', el).value)}: ${ex.slice(0, 4).map((x) => `${esc(x.dev)} · cont. ${esc(x.cont)} · ${esc(x.fecha)}`).join(' / ')}` : '<b class="pend">Este job aún no está capturado: no es un duplicado. Debe capturarse normal en QORVEX MOBILE.</b>';
        };
        ['#duT', '#duC', '#duJ'].forEach((id) => { $(id, el).oninput = info; $(id, el).onchange = info; });
        info(); $('#duK', el).focus();
      },
      buttons: [{ t: 'Cancelar', v: null }, { t: 'Agregar duplicado', cls: 'primary', fn: (el) => {
        const o = { role: $('#duT', el).value, comp: $('#duC', el).value, cont: $('#duK', el).value.trim().toUpperCase(), job: String($('#duJ', el).value).replace(/\D/g, '').slice(0, 6), plates: $('#duP', el).value.trim().toUpperCase(), sup: $('#duS', el).value, motivo: $('#duM', el).value.trim() };
        if (!o.cont) { toast('Escribe la caja o rack', 'warn'); return false; }
        if (!o.job) { toast('Escribe el job', 'warn'); return false; }
        if (!o.motivo) { toast('El motivo es obligatorio', 'warn'); return false; }
        if (!existing(o.role, o.comp, o.job).length) { toast('Ese job no está capturado: no es un duplicado', 'warn'); return false; }
        return o;
      } }] });
    if (!r) return;
    const d = new Date(), ts = d.getTime();
    const x = App.cfg.shiftAt(ts);
    const row = { fecha: `${P2(d.getDate())}/${P2(d.getMonth() + 1)}/${d.getFullYear()}`, hora: `${P2(d.getHours())}:${P2(d.getMinutes())}:${P2(d.getSeconds())}`, turno: x ? x.n : '', tipo: r.role === 'val' ? 'Validación' : 'Secuencia',
      job: r.job, contenedor: r.cont, componente: r.comp, placas: r.role === 'val' ? r.plates : '', lote: '', noempleado: 'MOTOR', nombre: App.lock.who() || 'QORVEX', supervisor: r.sup, editado: 'No', duplicado: 'Sí', motivo: r.motivo };
    const res = App.integrar.append(r.role, [row], S.L[r.role]);
    if (!res.added) return toast('No se agregó: ya existe un registro idéntico', 'warn');
    S.dirty[r.role] = true; S.edits.push({ role: r.role, kind: 'import', n: 1, dest: res.dest, dup: true });
    await App.save([r.role], false);
    if (S.result && App.ready()) { App.execute(true); App.ui.render(); }
  }

  App.dup = { open, existing };
})(window.App);
