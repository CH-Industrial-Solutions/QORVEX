/* =====================================================================
   productividad.js — métricas de productividad (pestaña PRODUCTIVIDAD)
   Fuente: los TXT de Validación y Secuencia (todas las tabletas).
   - Fecha operativa: el turno que cruza la medianoche cuenta para el día
     en que inicia.
   - Meta: por turno y tipo (jobs y contenedores), solo en días laborables
     de ese turno y que no sean festivos. Lo demás cuenta "sin meta".
   - Ritmo por hora: jobs ÷ (turnos trabajados × horas del turno configurado).
   - Contenedores: distintos por componente, turno y día.
   ===================================================================== */
(function (App) {
  const { $, $$, esc, fmtN, toast } = App;
  const F = { from: '', to: '', sh: '', sup: '', emp: '', ty: '', comp: '' };
  const TY = { val: 'Validación', seq: 'Secuencia' };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
  const cls = (p) => (p == null ? '' : p >= 100 ? 'ok' : p >= 80 ? 'mid' : 'low');
  const pctTxt = (p) => (p == null ? '<span class="muted">sin meta</span>' : `<b class="pc ${cls(p)}">${p}%</b>`);
  const fD = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const r1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);

  /** Registros con fecha operativa y turno, ya filtrados */
  function rows() {
    const C = App.cfg, R = App.cap.recs, out = [];
    ['val', 'seq'].forEach((ty) => (R[ty] || []).forEach((r) => {
      if (!r.ts) return;
      const shObj = (r.turno && C.get().shifts.find((s) => s.n === r.turno)) || C.shiftAt(r.ts);
      out.push({ ...r, ty, od: C.opDate(r.ts), sh: shObj ? shObj.n : r.turno || 'Sin turno', compN: App.COMP_N[App.normComp(r.comp)] || r.comp || '—', supN: r.sup || '(sin supervisor)' });
    }));
    return out;
  }
  const apply = (all) => all.filter((x) => x.od >= F.from && x.od <= F.to && (!F.sh || x.sh === F.sh) && (!F.sup || x.supN === F.sup) && (!F.emp || x.emp === F.emp) && (!F.ty || x.ty === F.ty) && (!F.comp || x.compN === F.comp));
  const contN = (list) => new Set(list.map((x) => `${x.ty}|${x.od}|${x.sh}|${x.compN}|${String(x.cont).toUpperCase()}`)).size;
  const shInfo = (n) => App.cfg.get().shifts.find((s) => s.n === n) || null;
  const shHours = (n) => { const s = shInfo(n); return s ? App.cfg.hours(s) : 8; };
  function days(a, b) { const out = []; for (let t = new Date(`${a}T12:00:00`); App.cfg.isoDay(t) <= b; t.setDate(t.getDate() + 1)) out.push(App.cfg.isoDay(t)); return out; }

  /** Meta de un turno-día-tipo (0 si no laborable / festivo) */
  const goalOf = (od, sh, ty, u) => { const s = shInfo(sh); return s && App.cfg.hasGoal(od, s) ? s.goals[ty][u] : 0; };

  function compute(list) {
    const types = F.ty ? [F.ty] : ['val', 'seq'];
    const shifts = F.sh ? [F.sh] : [...new Set([...App.cfg.get().shifts.map((s) => s.n), ...list.map((x) => x.sh)])];
    // turno-día
    const SD = [];
    days(F.from, F.to).forEach((od) => shifts.forEach((sh) => {
      const xs = list.filter((x) => x.od === od && x.sh === sh);
      const s = shInfo(sh), hol = App.cfg.holiday(od), work = s ? App.cfg.hasGoal(od, s) : false;
      const by = {}; types.forEach((ty) => { const t = xs.filter((x) => x.ty === ty); by[ty] = { jobs: t.length, cont: contN(t), gj: goalOf(od, sh, ty, 'jobs'), gc: goalOf(od, sh, ty, 'cont') }; });
      if (!xs.length && !types.some((ty) => by[ty].gj || by[ty].gc)) return;
      SD.push({ od, sh, by, xs, hol, work, sups: [...new Set(xs.map((x) => x.supN))], ppl: new Set(xs.map((x) => x.emp)).size });
    }));
    const tot = {}; types.forEach((ty) => { tot[ty] = { jobs: 0, cont: 0, gj: 0, gc: 0 }; SD.forEach((d) => { const b = d.by[ty]; tot[ty].jobs += b.jobs; tot[ty].cont += b.cont; tot[ty].gj += b.gj; tot[ty].gc += b.gc; }); });
    // supervisores: la meta de cada turno-día se reparte según lo que capturó su equipo
    const sup = new Map();
    SD.forEach((d) => types.forEach((ty) => {
      const t = d.xs.filter((x) => x.ty === ty), T = t.length;
      [...new Set(t.map((x) => x.supN))].forEach((sp) => {
        const mine = t.filter((x) => x.supN === sp);
        if (!sup.has(sp)) sup.set(sp, { n: sp, sd: new Set(), ppl: new Set(), val: { jobs: 0, cont: 0, g: 0 }, seq: { jobs: 0, cont: 0, g: 0 }, hrs: 0 });
        const o = sup.get(sp); const k = `${d.od}|${d.sh}`;
        if (!o.sd.has(k)) { o.sd.add(k); o.hrs += shHours(d.sh); }
        mine.forEach((x) => o.ppl.add(x.emp));
        o[ty].jobs += mine.length; o[ty].cont += contN(mine); o[ty].g += T ? d.by[ty].gj * (mine.length / T) : 0;
      });
    }));
    // personas
    const per = new Map();
    list.forEach((x) => {
      if (!per.has(x.emp)) per.set(x.emp, { emp: x.emp, name: x.name, sd: new Set(), sups: {}, val: 0, seq: 0, items: [], hrs: 0 });
      const o = per.get(x.emp), k = `${x.od}|${x.sh}`;
      if (!o.sd.has(k)) { o.sd.add(k); o.hrs += shHours(x.sh); }
      o[x.ty]++; o.items.push(x); o.sups[x.supN] = (o.sups[x.supN] || 0) + 1; if (x.name) o.name = x.name;
    });
    // componentes
    const comp = new Map();
    list.forEach((x) => { if (!comp.has(x.compN)) comp.set(x.compN, { n: x.compN, val: [], seq: [] }); comp.get(x.compN)[x.ty].push(x); });
    return { types, shifts, SD, tot, sup: [...sup.values()], per: [...per.values()], comp: [...comp.values()] };
  }

  function chart(K) {
    const ds = days(F.from, F.to);
    if (ds.length > 62) return '';
    const data = ds.map((od) => { const o = { od }; K.types.forEach((ty) => { o[ty] = K.SD.filter((d) => d.od === od).reduce((a, d) => a + d.by[ty].jobs, 0); o[`g${ty}`] = K.SD.filter((d) => d.od === od).reduce((a, d) => a + d.by[ty].gj, 0); }); return o; });
    const max = 1.15 * Math.max(1, ...data.flatMap((o) => K.types.flatMap((ty) => [o[ty], o[`g${ty}`]])));
    return `<div class="dpanel"><div class="dph"><h3>Jobs por día</h3><span class="sp"></span>${K.types.map((ty) => `<span class="lg ${ty}"><i></i>${TY[ty]}</span>`).join('')}<span class="lg goal"><i></i>Meta del día</span></div>
      <div class="pchart">${data.map((o) => `<div class="pcol" title="${fD(o.od)}">
        <div class="pbars">${K.types.map((ty) => `<div class="pb ${ty}" style="height:${(o[ty] / max) * 100}%" title="${TY[ty]}: ${fmtN(o[ty])} jobs${o[`g${ty}`] ? ` · meta ${fmtN(o[`g${ty}`])}` : ''}">${o[ty] ? `<span>${fmtN(o[ty])}</span>` : ''}</div>${o[`g${ty}`] ? `<i class="pg ${ty}" style="bottom:${(o[`g${ty}`] / max) * 100}%"></i>` : ''}`).join('')}</div>
        <small>${o.od.slice(8)}/${o.od.slice(5, 7)}</small></div>`).join('')}</div></div>`;
  }

  function render(m) {
    const S = App.S;
    if (!S.dir) { m.innerHTML = '<div class="empty">Primero conecta la carpeta de trabajo (ARCHIVOS).</div>'; return; }
    if (!S.L.val && !S.L.seq) { m.innerHTML = '<div class="empty">Carga los archivos (ARCHIVOS → Cargar archivos) para ver la productividad.</div>'; return; }
    const today = App.cfg.opDate(Date.now());
    if (!F.to) { F.to = today; const t = new Date(`${today}T12:00:00`); t.setDate(t.getDate() - 6); F.from = App.cfg.isoDay(t); }
    if (F.from > F.to) [F.from, F.to] = [F.to, F.from];
    const all = rows(), list = apply(all), K = compute(list), C = App.cfg.get();
    const opt = (arr, cur) => arr.map(([v, t]) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(t)}</option>`).join('');
    const sups = [...new Set(all.map((x) => x.supN))].sort(), emps = [...new Map(all.map((x) => [x.emp, x.name])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const comps = [...new Set(all.map((x) => x.compN))].sort();
    const kpi = (t, v, s, c = '') => `<div class="pk ${c}"><small>${t}</small><b>${v}</b><span>${s}</span></div>`;
    const hrsAll = K.per.reduce((a, p) => a + p.hrs, 0);
    m.innerHTML = `
      <div class="ptitle"><h1>PRODUCTIVIDAD <small>Por turno, fecha, supervisor y persona</small></h1><span class="muted">${fD(F.from)} al ${fD(F.to)} · ${fmtN(list.length)} capturas</span><span class="sp"></span><button class="btn primary" id="pXls">Exportar a Excel</button></div>
      <div class="filters">
        <label class="lbl">Desde <input class="input" type="date" id="pf" value="${F.from}"></label>
        <label class="lbl">Hasta <input class="input" type="date" id="pt" value="${F.to}"></label>
        <button class="btn sm" data-q="0">Hoy</button><button class="btn sm" data-q="1">Ayer</button><button class="btn sm" data-q="7">7 días</button><button class="btn sm" data-q="30">30 días</button>
        <select class="input" id="psh"><option value="">Todos los turnos</option>${opt(C.shifts.map((s) => [s.n, `${s.n} (${s.s}–${s.e})`]), F.sh)}</select>
        <select class="input" id="psu"><option value="">Todos los supervisores</option>${opt(sups.map((s) => [s, s]), F.sup)}</select>
        <select class="input" id="pem"><option value="">Todas las personas</option>${opt(emps.map(([e, n]) => [e, `${n || e} (${e})`]), F.emp)}</select>
        <select class="input" id="pty"><option value="">Validación y Secuencia</option>${opt([['val', 'Validación'], ['seq', 'Secuencia']], F.ty)}</select>
        <select class="input" id="pco"><option value="">Todos los componentes</option>${opt(comps.map((c) => [c, c]), F.comp)}</select>
      </div>
      ${!list.length ? '<div class="empty">Sin capturas con estos filtros.</div>' : ''}
      <div class="pkpis">${K.types.map((ty) => { const t = K.tot[ty], pj = pct(t.jobs, t.gj), pc = pct(t.cont, t.gc); return `
        ${kpi(`Jobs · ${TY[ty]}`, fmtN(t.jobs), t.gj ? `Meta ${fmtN(t.gj)} · ${pj}%` : 'sin meta en el periodo', cls(pj))}
        ${kpi(`Contenedores · ${TY[ty]}`, fmtN(t.cont), t.gc ? `Meta ${fmtN(t.gc)} · ${pc}%` : 'sin meta en el periodo', cls(pc))}`; }).join('')}
        ${kpi('Personas', fmtN(K.per.length), `${fmtN(K.sup.length)} supervisor(es)`)}
        ${kpi('Ritmo promedio', fmtN(r1(list.length / (hrsAll || 1))), 'jobs por hora por persona')}
      </div>
      ${list.length ? chart(K) : ''}
      <div class="dpanel"><div class="dph"><h3>Cumplimiento por día y turno</h3><span class="muted small">Ritmo = jobs ÷ horas del turno</span></div>
        <div class="tw"><table class="t mini ptab"><thead><tr><th>Fecha</th><th>Turno</th><th>Supervisor(es)</th><th>Personas</th>
          ${K.types.map((ty) => `<th>${TY[ty]} jobs</th><th>Meta</th><th>%</th><th>Cont.</th><th>Meta</th><th>%</th>`).join('')}<th>Jobs/h</th></tr></thead><tbody>
          ${K.SD.slice().reverse().map((d) => { const J = K.types.reduce((a, ty) => a + d.by[ty].jobs, 0); return `<tr class="${d.work ? '' : 'nogoal'}"><td>${fD(d.od)}${d.hol ? ` <span class="pill warn" title="${esc(d.hol.n)}">Festivo</span>` : !d.work ? ' <span class="pill">No laborable</span>' : ''}</td><td>${esc(d.sh)}</td><td>${d.sups.map(esc).join(', ') || '—'}</td><td class="num">${fmtN(d.ppl)}</td>
            ${K.types.map((ty) => { const b = d.by[ty]; return `<td class="num"><b>${fmtN(b.jobs)}</b></td><td class="num muted">${b.gj ? fmtN(b.gj) : '—'}</td><td>${pctTxt(pct(b.jobs, b.gj))}</td><td class="num">${fmtN(b.cont)}</td><td class="num muted">${b.gc ? fmtN(b.gc) : '—'}</td><td>${pctTxt(pct(b.cont, b.gc))}</td>`; }).join('')}
            <td class="num">${fmtN(r1(J / shHours(d.sh)))}</td></tr>`; }).join('') || '<tr><td colspan="20" class="muted">Sin turnos en el periodo.</td></tr>'}
          </tbody></table></div></div>
      <div class="dgrid">
        <div class="dpanel"><div class="dph"><h3>Por supervisor</h3><span class="muted small">% = jobs de su equipo contra la meta de los turnos en que trabajó (proporcional)</span></div>
          <div class="tw"><table class="t mini"><thead><tr><th>Supervisor</th><th>Turnos</th><th>Personas</th>${K.types.map((ty) => `<th>${TY[ty]} jobs</th><th>Cont.</th><th>% meta</th>`).join('')}<th>Jobs/h</th></tr></thead><tbody>
          ${K.sup.sort((a, b) => (b.val.jobs + b.seq.jobs) - (a.val.jobs + a.seq.jobs)).map((o) => `<tr><td><b>${esc(o.n)}</b></td><td class="num">${fmtN(o.sd.size)}</td><td class="num">${fmtN(o.ppl.size)}</td>
            ${K.types.map((ty) => `<td class="num">${fmtN(o[ty].jobs)}</td><td class="num">${fmtN(o[ty].cont)}</td><td>${pctTxt(o[ty].g ? Math.round((o[ty].jobs / o[ty].g) * 100) : null)}</td>`).join('')}<td class="num">${fmtN(r1((o.val.jobs + o.seq.jobs) / (o.hrs || 1)))}</td></tr>`).join('') || '<tr><td colspan="12" class="muted">—</td></tr>'}
          </tbody></table></div></div>
        <div class="dpanel"><div class="dph"><h3>Por componente</h3></div>
          <div class="tw"><table class="t mini"><thead><tr><th>Componente</th>${K.types.map((ty) => `<th>${TY[ty]} jobs</th><th>Cont.</th>`).join('')}</tr></thead><tbody>
          ${K.comp.sort((a, b) => a.n.localeCompare(b.n)).map((o) => `<tr><td><b>${esc(o.n)}</b></td>${K.types.map((ty) => `<td class="num">${fmtN(o[ty].length)}</td><td class="num">${fmtN(contN(o[ty]))}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="5" class="muted">—</td></tr>'}
          </tbody></table></div></div>
      </div>
      <div class="dpanel"><div class="dph"><h3>Validadores y secuenciadores</h3><span class="muted small">Ritmo = jobs ÷ (turnos trabajados × horas del turno) · Aporte = % de los jobs de sus turnos</span></div>
        <div class="tw"><table class="t mini"><thead><tr><th>#</th><th>No.</th><th>Nombre</th><th>Supervisor principal</th><th>Turnos</th><th>Validación jobs</th><th>Secuencia jobs</th><th>Contenedores</th><th>Jobs/h</th><th>Aporte</th></tr></thead><tbody>
        ${K.per.map((p) => { const J = p.val + p.seq, tot = K.SD.filter((d) => p.sd.has(`${d.od}|${d.sh}`)).reduce((a, d) => a + K.types.reduce((b, ty) => b + d.by[ty].jobs, 0), 0); return { p, J, rate: J / (p.hrs || 1), share: pct(J, tot) }; })
          .sort((a, b) => b.rate - a.rate).map(({ p, J, rate, share }, i) => `<tr><td class="num">${i + 1}</td><td class="mono">${esc(p.emp)}</td><td><b>${esc(p.name || '')}</b></td><td>${esc(Object.entries(p.sups).sort((a, b) => b[1] - a[1])[0][0])}</td><td class="num">${fmtN(p.sd.size)}</td>
            <td class="num">${fmtN(p.val)}</td><td class="num">${fmtN(p.seq)}</td><td class="num">${fmtN(contN(p.items))}</td><td class="num"><b>${fmtN(r1(rate))}</b></td><td class="num">${share == null ? '—' : `${share}%`}</td></tr>`).join('') || '<tr><td colspan="10" class="muted">—</td></tr>'}
        </tbody></table></div></div>`;
    const re = () => render(m);
    $('#pf').onchange = (e) => { F.from = e.target.value || F.from; re(); };
    $('#pt').onchange = (e) => { F.to = e.target.value || F.to; re(); };
    [['#psh', 'sh'], ['#psu', 'sup'], ['#pem', 'emp'], ['#pty', 'ty'], ['#pco', 'comp']].forEach(([id, k]) => { $(id).onchange = (e) => { F[k] = e.target.value; re(); }; });
    $$('[data-q]', m).forEach((b) => (b.onclick = () => { const q = +b.dataset.q, t = new Date(`${today}T12:00:00`); if (q <= 1) { t.setDate(t.getDate() - q); F.from = F.to = App.cfg.isoDay(t); } else { F.to = today; t.setDate(t.getDate() - (q - 1)); F.from = App.cfg.isoDay(t); } re(); }));
    $('#pXls').onclick = () => exportXls(list, K);
  }

  function exportXls(list, K) {
    if (!list.length && !K.SD.length) return toast('No hay datos con estos filtros', 'warn');
    const wb = XLSX.utils.book_new();
    const add = (name, aoa) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = aoa[0].map((h) => ({ wch: Math.max(10, String(h).length + 3) })); aoa[0].forEach((_, c) => { const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]; if (cell) cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '0A1A3A' } } }; }); XLSX.utils.book_append_sheet(wb, ws, name); };
    const P = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : '');
    add('Filtros', [['Filtro', 'Valor'], ['Desde', fD(F.from)], ['Hasta', fD(F.to)], ['Turno', F.sh || 'Todos'], ['Supervisor', F.sup || 'Todos'], ['Persona', F.emp || 'Todas'], ['Tipo', F.ty ? TY[F.ty] : 'Validación y Secuencia'], ['Componente', F.comp || 'Todos'], ['Generado', new Date().toLocaleString('es-MX')]]);
    add('Por turno', [['Fecha', 'Turno', 'Día', 'Supervisor(es)', 'Personas', ...K.types.flatMap((ty) => [`${TY[ty]} jobs`, 'Meta jobs', '% jobs', `${TY[ty]} contenedores`, 'Meta cont.', '% cont.']), 'Jobs por hora'],
      ...K.SD.map((d) => [fD(d.od), d.sh, d.hol ? `Festivo: ${d.hol.n}` : d.work ? 'Laborable' : 'No laborable', d.sups.join(', '), d.ppl, ...K.types.flatMap((ty) => { const b = d.by[ty]; return [b.jobs, b.gj || '', P(b.jobs, b.gj), b.cont, b.gc || '', P(b.cont, b.gc)]; }), r1(K.types.reduce((a, ty) => a + d.by[ty].jobs, 0) / shHours(d.sh))])]);
    add('Por supervisor', [['Supervisor', 'Turnos', 'Personas', ...K.types.flatMap((ty) => [`${TY[ty]} jobs`, `${TY[ty]} contenedores`, `% meta ${TY[ty]}`]), 'Jobs por hora'],
      ...K.sup.map((o) => [o.n, o.sd.size, o.ppl.size, ...K.types.flatMap((ty) => [o[ty].jobs, o[ty].cont, o[ty].g ? Math.round((o[ty].jobs / o[ty].g) * 1000) / 10 : '']), r1((o.val.jobs + o.seq.jobs) / (o.hrs || 1))])]);
    add('Por persona', [['No. Empleado', 'Nombre', 'Supervisor principal', 'Turnos', 'Validación jobs', 'Secuencia jobs', 'Contenedores', 'Horas de turno', 'Jobs por hora'],
      ...K.per.map((p) => [p.emp, p.name, Object.entries(p.sups).sort((a, b) => b[1] - a[1])[0][0], p.sd.size, p.val, p.seq, contN(p.items), p.hrs, r1((p.val + p.seq) / (p.hrs || 1))])]);
    add('Por componente', [['Componente', ...K.types.flatMap((ty) => [`${TY[ty]} jobs`, `${TY[ty]} contenedores`])], ...K.comp.map((o) => [o.n, ...K.types.flatMap((ty) => [o[ty].length, contN(o[ty])])])]);
    add('Detalle', [['Fecha operativa', 'Fecha', 'Hora', 'Turno', 'Tipo', 'Job', 'Contenedor', 'Componente', 'No. Empleado', 'Nombre', 'Supervisor', 'Equipo', 'ID'],
      ...list.sort((a, b) => a.ts - b.ts).map((x) => [fD(x.od), x.fecha, x.hora, x.sh, TY[x.ty], x.job, x.cont, x.compN, x.emp, x.name, x.sup, x.dev, x.id])]);
    XLSX.writeFile(wb, `QORVEX_Productividad_${F.from}_a_${F.to}.xlsx`, { compression: true });
    toast('Productividad exportada a Excel', 'ok');
  }

  App.prod = { render, F, _rows: rows, _compute: compute };
})(window.App);
