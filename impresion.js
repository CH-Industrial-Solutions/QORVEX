/* =====================================================================
   impresion.js — Hoja de secuencia para imprimir (tamaño carta)
   Sale de la lista de DATA (orden de la hoja Planes: AOR, JOB, LS, CIA).
   - Una sola Cia y un solo componente por impresión; rango del job al job.
   - Todos los jobs del rango; sin inventario (ID en SHORTAGE) se marca
     "SIN INVENTARIO".
   - Opcional: incluir jobs ya secuenciados con su contenedor original.
   - Switch Gde: una fila por pieza (QY, máximo 4): 202625 1, 202625 2…
   - 30 filas por hoja; la última hoja lleva el remanente.
   ===================================================================== */
(function (App) {
  const { $, esc, fmtN, show, normKey, toast } = App;
  const PER_PAGE = 30;
  const COMPS = [
    { c: 'BCM', t: 'BCM', id: 'idBcm', sec: 'secBcm' },
    { c: 'CLUSTER', t: 'Cluster', id: 'idCluster', sec: 'secCluster' },
    { c: 'SWGDE', t: 'Switch Gde', id: 'idSwGde', sec: 'secSwGde', qy: true },
    { c: 'SWCH', t: 'Switch Ch', id: 'idSwCh', sec: 'secSwCh' },
    { c: 'KEY', t: 'Key', id: 'idKey', sec: 'secKey' },
  ];
  const P = { cia: '', comp: 'BCM', from: '', to: '', withSeq: true }; // se recuerda en la sesión

  const SH = () => App.motor.SHORT, PE = () => App.motor.PEND;
  const ciaOf = (x) => String(x.base.cia ?? '').trim();
  const isCont = (v) => v != null && v !== '' && v !== SH() && v !== PE();

  /** Jobs de la Cia en el orden de la hoja */
  const ciaRows = (cia) => App.S.result.rows.filter((x) => ciaOf(x) === cia);

  /** Filas a imprimir según la selección */
  function build(sel) {
    const comp = COMPS.find((c) => c.c === sel.comp);
    const list = ciaRows(sel.cia);
    if (!list.length) return { err: 'Esa Cia no tiene jobs en DATA' };
    const fi = sel.from ? list.findIndex((x) => x.jobKey === normKey(sel.from)) : 0;
    const ti = sel.to ? list.findIndex((x) => x.jobKey === normKey(sel.to)) : list.length - 1;
    if (fi < 0) return { err: `El job ${sel.from} no es de la Cia ${sel.cia}` };
    if (ti < 0) return { err: `El job ${sel.to} no es de la Cia ${sel.cia}` };
    let jobs = list.slice(Math.min(fi, ti), Math.max(fi, ti) + 1);
    if (!sel.withSeq) jobs = jobs.filter((x) => !isCont(x.out[comp.sec]));
    const rows = [];
    let nPend = 0, nSeq = 0, nSin = 0;
    jobs.forEach((x) => {
      const id = x.out[comp.id], sec = x.out[comp.sec];
      const sin = id === SH() || id == null || id === '';
      if (sin) nSin++; else if (isCont(sec)) nSeq++; else nPend++;
      let pcs = 1;
      if (comp.qy) { const q = Number(x.out.qy); pcs = Number.isFinite(q) && q >= 1 ? Math.min(4, Math.floor(q)) : 1; }
      for (let i = 1; i <= pcs; i++) rows.push({ x, pc: comp.qy ? i : 0, sin, id, sec });
    });
    return { comp, jobs, rows, nPend, nSeq, nSin };
  }

  function secTxt(r) {
    if (r.sin) return '—';
    if (isCont(r.sec)) return esc(show(r.sec));
    return r.sec === SH() ? 'SHORTAGE' : 'PENDIENTE';
  }

  /** Arma las hojas carta y abre el cuadro de impresión del navegador */
  function print(sel, b) {
    const now = new Date(), p2 = App.pad;
    const fecha = `${p2(now.getDate())}/${p2(now.getMonth() + 1)}/${now.getFullYear()} ${p2(now.getHours())}:${p2(now.getMinutes())}`;
    const first = b.jobs[0], last = b.jobs[b.jobs.length - 1];
    const pages = [];
    for (let i = 0; i < b.rows.length; i += PER_PAGE) pages.push(b.rows.slice(i, i + PER_PAGE));
    const box = '<span class="pbox"></span>';
    const html = pages.map((pg, pi) => `
      <section class="ppage">
        <header class="phead">
          <img class="plogo" src="img/sese-logo.png" alt="Sesé">
          <div class="ptitle"><h1>Hoja de secuencia</h1><div class="pcomp">${esc(b.comp.t)}</div></div>
          <div class="pqv">QORVEX<small>Manufacturing Intelligence Engine</small></div>
        </header>
        <table class="pinfo"><tr>
          <td><span>Fecha de impresión</span><b>${fecha}</b></td>
          <td><span>Componente</span><b>${esc(b.comp.t)}</b></td>
          <td><span>Cia</span><b>${esc(sel.cia)}</b></td>
          <td><span>Jobs</span><b>${esc(show(first.base.job))} → ${esc(show(last.base.job))}</b></td>
          <td><span>Total</span><b>${fmtN(b.jobs.length)} jobs${b.comp.qy ? ` · ${fmtN(b.rows.length)} pzas` : ''}</b></td>
          <td><span>Hoja</span><b>${pi + 1} de ${pages.length}</b></td>
        </tr></table>
        <table class="ptab">
          <colgroup><col style="width:3.5%"><col style="width:10.5%"><col style="width:11.5%"><col style="width:5%"><col style="width:8%"><col style="width:9.5%"><col style="width:11%"><col style="width:10.5%"><col style="width:13.5%"><col style="width:8.5%"><col style="width:8.5%"></colgroup>
          <thead><tr><th>#</th><th>AOR</th><th>JOB</th><th>LS</th><th>CIA</th><th>Componente</th><th>ID-${esc(b.comp.t)}<small>inventario</small></th><th>Sec-${esc(b.comp.t)}</th><th>Contenedor / Rack</th><th>Separado</th><th>Escaneado</th></tr></thead>
          <tbody>${pg.map((r, ri) => `<tr class="${r.sin ? 'sin' : ''}">
            <td class="n">${pi * PER_PAGE + ri + 1}</td>
            <td>${esc(show(r.x.base.aor))}</td>
            <td class="j">${esc(show(r.x.base.job))}${r.pc ? ` <em>${r.pc}</em>` : ''}</td>
            <td>${esc(show(r.x.base.ls))}</td>
            <td class="sm">${esc(show(r.x.base.cia))}</td>
            <td class="sm">${esc(b.comp.t)}</td>
            <td class="${r.sin ? 'si' : ''}">${r.sin ? 'SIN<br>INVENTARIO' : esc(show(r.id))}</td>
            <td class="${isCont(r.sec) ? 'sq' : ''}">${secTxt(r)}</td>
            <td class="w"></td>
            <td class="c">${box}</td><td class="c">${box}</td></tr>`).join('')}</tbody>
        </table>
        <footer class="pfoot">
          <div><span>Separó</span><i></i></div><div><span>Escaneó</span><i></i></div><div><span>Supervisor</span><i></i></div>
          <p>QORVEX · Hoja de secuencia ${esc(b.comp.t)} · Cia ${esc(sel.cia)} · Hoja ${pi + 1} de ${pages.length}</p>
        </footer>
      </section>`).join('');
    let area = $('#printArea');
    if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.append(area); }
    area.innerHTML = html;
    const go = () => { window.print(); };
    // espera a que cargue el logo antes de abrir la impresión
    const img = area.querySelector('img.plogo');
    if (img && !img.complete) { img.onload = go; img.onerror = go; } else setTimeout(go, 50);
  }

  /** Ventana para elegir Cia, componente y rango */
  async function open() {
    const S = App.S; if (!S.result) return toast('Primero ejecuta el cruce', 'warn');
    const cias = [...new Set(S.result.rows.map(ciaOf).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    if (!cias.includes(P.cia)) P.cia = cias[0] || '';
    const sel = await App.modal({ title: 'Imprimir hoja de secuencia', wide: true, body: `
      <div class="pr-grid">
        <label class="lbl">Cia <select class="input" id="prCia">${cias.map((c) => `<option ${c === P.cia ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="lbl">Componente <select class="input" id="prComp">${COMPS.map((c) => `<option value="${c.c}" ${c.c === P.comp ? 'selected' : ''}>${c.t}</option>`).join('')}</select></label>
        <label class="lbl">Del job <input class="input" id="prFrom" list="prJobs" inputmode="numeric" placeholder="primer job"></label>
        <label class="lbl">Al job <input class="input" id="prTo" list="prJobs" inputmode="numeric" placeholder="último job"></label>
        <datalist id="prJobs"></datalist>
      </div>
      <label class="chk big"><input type="checkbox" id="prSeq" ${P.withSeq ? 'checked' : ''}> Incluir jobs ya secuenciados (salen con su contenedor original)</label>
      <div class="pr-sum" id="prSum"></div>
      <p class="muted small">Tamaño carta · ${PER_PAGE} filas por hoja · los jobs sin inventario salen marcados como <b>SIN INVENTARIO</b>${''}.</p>`,
      onOpen: (el) => {
        const cur = () => ({ cia: $('#prCia', el).value, comp: $('#prComp', el).value, from: $('#prFrom', el).value.trim(), to: $('#prTo', el).value.trim(), withSeq: $('#prSeq', el).checked });
        const fillJobs = (reset) => {
          const s = cur(), comp = COMPS.find((c) => c.c === s.comp), list = ciaRows(s.cia);
          $('#prJobs', el).innerHTML = list.map((x) => `<option value="${esc(show(x.base.job))}">`).join('');
          if (reset || !list.some((x) => x.jobKey === normKey($('#prFrom', el).value))) {
            const hasInv = (x) => { const v = x.out[comp.id]; return v != null && v !== '' && v !== SH(); };
            const firstPend = list.find((x) => hasInv(x) && !isCont(x.out[comp.sec])) || list.find((x) => !isCont(x.out[comp.sec])) || list[0];
            $('#prFrom', el).value = firstPend ? show(firstPend.base.job) : '';
            const i = list.indexOf(firstPend);
            const end = list[Math.min(list.length - 1, i + PER_PAGE - 1)];
            $('#prTo', el).value = end ? show(end.base.job) : '';
          }
          sum();
        };
        const sum = () => {
          const b = build(cur());
          $('#prSum', el).innerHTML = b.err ? `<div class="warn">${esc(b.err)}</div>` : !b.rows.length ? '<div class="warn">No hay jobs para imprimir con esa selección.</div>'
            : `<div class="pr-k"><b>${fmtN(b.jobs.length)}</b><span>jobs</span></div>
               ${b.comp.qy ? `<div class="pr-k"><b>${fmtN(b.rows.length)}</b><span>piezas</span></div>` : ''}
               <div class="pr-k"><b>${Math.ceil(b.rows.length / PER_PAGE)}</b><span>hojas</span></div>
               <div class="pr-k pe"><b>${fmtN(b.nPend)}</b><span>pendientes</span></div>
               <div class="pr-k sq"><b>${fmtN(b.nSeq)}</b><span>ya secuenciados</span></div>
               <div class="pr-k si"><b>${fmtN(b.nSin)}</b><span>sin inventario</span></div>`;
        };
        if (P.cia === $('#prCia', el).value && P.from) { $('#prFrom', el).value = P.from; $('#prTo', el).value = P.to; fillJobs(false); } else fillJobs(true);
        $('#prCia', el).onchange = () => fillJobs(true);
        $('#prComp', el).onchange = () => fillJobs(true);
        ['#prFrom', '#prTo'].forEach((s) => ($(s, el).oninput = sum));
        $('#prSeq', el).onchange = sum;
      },
      buttons: [{ t: 'Cancelar', v: null }, { t: 'Imprimir…', cls: 'primary', fn: (el) => {
        const s = { cia: $('#prCia', el).value, comp: $('#prComp', el).value, from: $('#prFrom', el).value.trim(), to: $('#prTo', el).value.trim(), withSeq: $('#prSeq', el).checked };
        const b = build(s);
        if (b.err) { toast(b.err, 'warn'); return false; }
        if (!b.rows.length) { toast('No hay jobs para imprimir', 'warn'); return false; }
        return s;
      } }],
    });
    if (!sel) return;
    Object.assign(P, sel);
    print(sel, build(sel));
  }

  App.imp = { open, build };
})(window.App);
