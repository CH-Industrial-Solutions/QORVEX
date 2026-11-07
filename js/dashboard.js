/* =====================================================================
   dashboard.js — cobertura por Cia según la fecha de producción
   - Fecha de producción de cada job = Start Date (columna R de Planes).
   - Desde la fecha elegida se toman los días de producción en el orden
     de la hoja Planes; medio día = primera mitad de los jobs de ese día.
   - On hand (Validación): meta 1.5 días, job completo = 6/6 componentes.
   - Secuenciado: meta 1 día, job completo = los 5 componentes con Sec.
   ===================================================================== */
(function (App) {
  const { $, $$, esc, fmtN, show, toast } = App;
  const SH = () => App.motor.SHORT;
  const PE = () => App.motor.PEND;
  const bad = (v) => v === App.motor.SHORT || v === App.motor.PEND;
  const ID_OF = { secBcm: 'idBcm', secCluster: 'idCluster', secSwGde: 'idSwGde', secSwCh: 'idSwCh', secKey: 'idKey' };
  const ON = [['idArnes', 'Arnés'], ['idBcm', 'BCM'], ['idCluster', 'Cluster'], ['idSwGde', 'Switch Gde'], ['idSwCh', 'Switch Ch'], ['idKey', 'Key']];
  const SQ = [['secBcm', 'BCM'], ['secCluster', 'Cluster'], ['secSwGde', 'Switch Gde'], ['secSwCh', 'Switch Ch'], ['secKey', 'Key']];
  const D = { date: '', goalOn: 1.5, goalSeq: 1, cia: '', open: '' };

  const toSerial = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5); };
  const toIso = (n) => { const d = new Date(Math.round((n - 25569) * 864e5)); return `${d.getUTCFullYear()}-${App.pad(d.getUTCMonth() + 1)}-${App.pad(d.getUTCDate())}`; };
  const okOn = (x) => ON.every(([k]) => x.out[k] !== SH());
  const okSeq = (x) => SQ.every(([k]) => !bad(x.out[k]));
  const cia = (x) => String(x.base.cia ?? '').trim() || '(sin Cia)';

  /** Jobs por día de producción (en orden de la hoja) desde la fecha elegida */
  function days(rows, fromSerial) {
    const m = new Map();
    rows.forEach((x) => {
      const d = typeof x.out.start === 'number' ? Math.floor(x.out.start) : null;
      if (d == null || d < fromSerial) return;
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(x);
    });
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([d, list]) => ({ d, list: list.sort((a, b) => a.r - b.r) }));
  }
  /** Jobs que forman N días (ej. 1.5 = día 1 completo + primera mitad del día 2) */
  function windowOf(ds, n) {
    const out = []; let left = n;
    for (const day of ds) {
      if (left <= 0) break;
      const take = left >= 1 ? day.list.length : Math.ceil(day.list.length * left);
      out.push(...day.list.slice(0, take)); left -= 1;
    }
    return out;
  }
  /** Días realmente cubiertos: jobs consecutivos completos desde el inicio */
  function covered(ds, ok) {
    let daysC = 0;
    for (const day of ds) {
      const i = day.list.findIndex((x) => !ok(x));
      if (i < 0) { daysC += 1; continue; }
      daysC += i / day.list.length;
      return { days: daysC, stop: day.list[i] };
    }
    return { days: daysC, stop: null };
  }
  /** Bloques consecutivos de la misma Cia, en orden */
  function runs(list) {
    const out = [];
    list.forEach((x) => { const c = cia(x), last = out[out.length - 1]; if (last && last.cia === c) { last.to = x; last.n++; last.list.push(x); } else out.push({ cia: c, from: x, to: x, n: 1, list: [x] }); });
    return out;
  }

  function render(m) {
    const S = App.S;
    if (!S.result) { m.innerHTML = '<div class="empty">Primero ejecuta el cruce en <b>DATA</b>.</div>'; return; }
    const all = S.result.rows;
    const dated = all.filter((x) => typeof x.out.start === 'number');
    if (!dated.length) { m.innerHTML = '<div class="empty">Ningún job tiene Start Date (fecha de producción) en Planes.</div>'; return; }
    const allDates = [...new Set(dated.map((x) => Math.floor(x.out.start)))].sort((a, b) => a - b);
    const t0 = new Date(), today = toSerial(`${t0.getFullYear()}-${App.pad(t0.getMonth() + 1)}-${App.pad(t0.getDate())}`);
    if (!D.date) D.date = toIso(allDates.find((d) => d >= today) ?? allDates[allDates.length - 1]);
    const pool = D.cia ? all.filter((x) => cia(x) === D.cia) : all;
    const ds = days(pool, toSerial(D.date));
    const wOn = windowOf(ds, D.goalOn), wSeq = windowOf(ds, D.goalSeq);
    const cOn = covered(ds, okOn), cSeq = covered(ds, okSeq);
    const cias = [...new Set(all.map(cia))].sort((a, b) => a.localeCompare(b, 'es'));
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    const cls = (p) => (p >= 100 ? 'ok' : p >= 80 ? 'mid' : 'low');
    const jobTxt = (x) => esc(show(x.base.job));
    const nOn = wOn.filter(okOn).length, nSeq = wSeq.filter(okSeq).length;

    const shortTable = (w, comps, title, kind) => {
      const isSeq = kind === 'seq';
      const rows = comps.map(([k, t]) => { const miss = w.filter((x) => bad(x.out[k])); return { k, t, miss, nS: miss.filter((x) => x.out[k] === SH()).length, nP: miss.filter((x) => x.out[k] === PE()).length }; });
      const any = rows.some((r) => r.miss.length);
      return `<div class="dpanel"><div class="dph"><h3>${title}</h3><span class="sp"></span>${any ? `<button class="btn sm primary" data-exp="${kind}">Exportar cortos a Excel</button>` : ''}</div>
        <table class="t mini"><thead><tr><th>Componente</th><th>Shortage</th>${isSeq ? '<th>Pendiente</th>' : ''}<th>Primer job corto</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td><b>${r.t}</b></td><td>${r.nS ? `<span class="short-n">${fmtN(r.nS)}</span>` : '<span class="ok-n">0 ✓</span>'}</td>
          ${isSeq ? `<td>${r.nP ? `<span class="pend-n">${fmtN(r.nP)}</span>` : '<span class="ok-n">0</span>'}</td>` : ''}
          <td>${r.miss.length ? `${jobTxt(r.miss[0])} <span class="muted">(${esc(cia(r.miss[0]))})</span>` : '—'}</td>
          <td>${r.miss.length ? `<button class="btn sm" data-open="${title}|${r.k}">Ver jobs</button>` : ''}</td></tr>
          ${D.open === `${title}|${r.k}` ? `<tr class="det"><td colspan="${isSeq ? 5 : 4}">${r.miss.map((x) => `<span class="jchip ${x.out[r.k] === PE() ? 'p' : ''}" title="${esc(cia(x))} · ${App.fSerial(x.out.start)} · ${x.out[r.k]}">${jobTxt(x)}</span>`).join('')}</td></tr>` : ''}`).join('')}
      </tbody></table></div>`;
    };

    // Resumen por Cia en la ventana on hand (1.5 días), con su parte secuenciada (1 día)
    const seqSet = new Set(wSeq);
    const byCia = [...new Set(wOn.map(cia))].map((c) => {
      const L = wOn.filter((x) => cia(x) === c), Ls = L.filter((x) => seqSet.has(x));
      const shortOn = ON.map(([k, t]) => [t, L.filter((x) => x.out[k] === SH()).length]).filter(([, n]) => n);
      const shortSq = SQ.map(([k, t]) => [t, Ls.filter((x) => bad(x.out[k])).length]).filter(([, n]) => n);
      return { c, L, Ls, on: L.filter(okOn).length, sq: Ls.filter(okSeq).length, shortOn, shortSq };
    });

    m.innerHTML = `
      <div class="ptitle"><h1>DASHBOARD <small>Material disponible</small></h1><span class="muted">Cobertura por fecha de producción (Start Date) y Cia</span></div>
      <div class="filters">
        <label class="lbl">Desde fecha de producción <input class="input" type="date" id="dd" value="${D.date}"></label>
        <label class="lbl">Meta on hand <input class="input num" type="number" step="0.5" min="0.5" id="dgo" value="${D.goalOn}"> días</label>
        <label class="lbl">Meta secuenciado <input class="input num" type="number" step="0.5" min="0.5" id="dgs" value="${D.goalSeq}"> días</label>
        <select class="input" id="dc"><option value="">Todas las Cia</option>${cias.map((c) => `<option ${D.cia === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <span class="sp"></span><span class="muted small">Días de producción: ${ds.slice(0, 4).map((d) => `${App.fSerial(d.d)} (${d.list.length})`).join(' · ') || '—'}</span>
      </div>
      ${!ds.length ? '<div class="empty">No hay jobs con fecha de producción desde esa fecha.</div>' : `
      <div class="dgrid">
        ${gauge('On hand (Validación)', cOn.days, D.goalOn, nOn, wOn.length, cOn.stop)}
        ${gauge('Secuenciado', cSeq.days, D.goalSeq, nSeq, wSeq.length, cSeq.stop)}
      </div>
      <div class="dpanel"><h3>Orden de Cias en ${D.goalOn} días · del job ${jobTxt(wOn[0])} al ${jobTxt(wOn[wOn.length - 1])} · ${fmtN(wOn.length)} jobs</h3>
        <div class="runs">${runs(wOn).map((r) => { const p = pct(r.list.filter(okOn).length, r.n); return `<div class="run ${cls(p)}" title="${p}% on hand">
          <b>${esc(r.cia)}</b><span>${jobTxt(r.from)} → ${jobTxt(r.to)}</span><em>${fmtN(r.n)} jobs · ${p}% on hand</em></div>`; }).join('')}</div>
      </div>
      <div class="dpanel"><h3>Por Cia</h3><table class="t mini"><thead><tr><th>Cia</th><th>Del job</th><th>Al job</th><th>Jobs (${D.goalOn} d)</th><th>On hand completos</th><th>Cortos on hand</th><th>Jobs (${D.goalSeq} d)</th><th>Secuenciados</th><th>Cortos secuencia</th></tr></thead><tbody>
        ${byCia.map((r) => { const p1 = pct(r.on, r.L.length), p2 = pct(r.sq, r.Ls.length); return `<tr>
          <td><b>${esc(r.c)}</b></td><td>${jobTxt(r.L[0])}</td><td>${jobTxt(r.L[r.L.length - 1])}</td><td>${fmtN(r.L.length)}</td>
          <td>${bar(p1)} ${fmtN(r.on)} <span class="muted">(${p1}%)</span></td>
          <td>${r.shortOn.map(([t, n]) => `<span class="sc">${t} ${n}</span>`).join('') || '<span class="ok-n">✓</span>'}</td>
          <td>${fmtN(r.Ls.length)}</td><td>${r.Ls.length ? `${bar(p2)} ${fmtN(r.sq)} <span class="muted">(${p2}%)</span>` : '—'}</td>
          <td>${r.shortSq.map(([t, n]) => `<span class="sc">${t} ${n}</span>`).join('') || (r.Ls.length ? '<span class="ok-n">✓</span>' : '—')}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="dgrid">${shortTable(wOn, ON, `Componentes cortos para ${D.goalOn} días on hand`, 'on')}${shortTable(wSeq, SQ, `Componentes cortos para ${D.goalSeq} día(s) secuenciado`, 'seq')}</div>`}`;

    $('#dd').onchange = (e) => { D.date = e.target.value || D.date; render(m); };
    $('#dgo').onchange = (e) => { const v = parseFloat(e.target.value); if (v > 0) D.goalOn = v; render(m); };
    $('#dgs').onchange = (e) => { const v = parseFloat(e.target.value); if (v > 0) D.goalSeq = v; render(m); };
    $('#dc').onchange = (e) => { D.cia = e.target.value; render(m); };
    $$('[data-exp]', m).forEach((b) => (b.onclick = () => exportShort(b.dataset.exp === 'seq' ? wSeq : wOn, b.dataset.exp)));
    $$('[data-open]', m).forEach((b) => (b.onclick = () => { D.open = D.open === b.dataset.open ? '' : b.dataset.open; render(m); }));

    function gauge(title, got, goal, nOk, nW, stop) {
      const p = Math.min(100, pct(got, goal)), c = cls(pct(got, goal));
      return `<div class="gcard ${c}"><div class="gh"><b>${title}</b><span>Meta ${goal} día${goal === 1 ? '' : 's'}</span></div>
        <div class="gv">${got.toFixed(2)} <small>días cubiertos</small></div>
        ${bar(p, 'big')}
        <div class="gs">${fmtN(nOk)} de ${fmtN(nW)} jobs completos dentro de la meta · ${pct(nOk, nW)}%</div>
        <div class="gs">${stop ? `Se corta en el job <b>${jobTxt(stop)}</b> (${esc(cia(stop))}, ${App.fSerial(stop.out.start)})` : 'Sin cortes en los días disponibles ✓'}</div></div>`;
    }
    function bar(p, k = '') { return `<span class="dbar ${k} ${cls(p)}"><i style="width:${Math.min(100, p)}%"></i></span>`; }
  }

  /** Exporta los jobs cortos: job, contenedor donde está (on hand) y tipo de componente */
  async function exportShort(w, kind) {
    const comps = kind === 'seq' ? SQ : ON;
    const rows = [];
    w.forEach((x) => comps.forEach(([k, t]) => {
      const v = x.out[k]; if (!bad(v)) return;
      const onHand = kind === 'seq' ? x.out[ID_OF[k]] : '';
      rows.push({ Job: x.base.job, Contenedor: onHand && !bad(onHand) ? onHand : '', Componente: t, Estado: v,
        Tipo: kind === 'seq' ? 'Secuencia' : 'On hand', Cia: cia(x), AOR: x.base.aor, 'Fecha de producción': x.out.start });
    }));
    if (!rows.length) return toast('No hay jobs cortos para exportar', 'info');
    const d = new Date(), p2 = App.pad;
    const fname = `Cortos ${kind === 'seq' ? 'secuencia' : 'on hand'} ${D.date.split('-').reverse().join('-')} ${p2(d.getHours())}-${p2(d.getMinutes())}.xlsx`;
    let handle = null;
    if (typeof window.showSaveFilePicker === 'function') {
      try { handle = await window.showSaveFilePicker({ suggestedName: fname, types: [{ description: 'Libro de Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] }); }
      catch (e) { if (e.name === 'AbortError') return; toast(App.fs.explain(e), 'err'); return; }
    }
    const head = Object.keys(rows[0]);
    const ws = XLSX.utils.aoa_to_sheet([head]);
    head.forEach((_, c) => { ws[XLSX.utils.encode_cell({ r: 0, c })].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '0E2A40' } } }; });
    rows.forEach((o, i) => head.forEach((h, c) => App.xl.setCell(ws, i + 1, c, o[h], h === 'Estado' ? App.motor.styleOf(o[h]) : null, null, h === 'Fecha de producción' && typeof o[h] === 'number' ? 'dd/mm/yyyy' : null)));
    ws['!cols'] = head.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: head.length - 1 } }) };
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Cortos');
    const bytes = App.xl.serialize(wb, 'cortos.xlsx');
    try {
      if (handle) await App.fs.writeFile(handle, bytes); else XLSX.writeFile(XLSX.read(bytes, { type: 'array' }), fname);
      toast(`Exportados ${fmtN(rows.length)} cortos`, 'ok', 5000);
    } catch (e) { toast(`No se pudo exportar: ${e.message}`, 'err', 6000); }
  }

  /** Ventanas y cobertura con las metas actuales (lo usan INICIO y REPORTS) */
  function summary() {
    const S = App.S; if (!S.result) return null;
    const all = S.result.rows, dated = all.filter((x) => typeof x.out.start === 'number');
    if (!dated.length) return null;
    const allDates = [...new Set(dated.map((x) => Math.floor(x.out.start)))].sort((a, b) => a - b);
    const t0 = new Date(), today = toSerial(`${t0.getFullYear()}-${App.pad(t0.getMonth() + 1)}-${App.pad(t0.getDate())}`);
    if (!D.date) D.date = toIso(allDates.find((d) => d >= today) ?? allDates[allDates.length - 1]);
    const pool = D.cia ? all.filter((x) => cia(x) === D.cia) : all;
    const ds = days(pool, toSerial(D.date));
    const wOn = windowOf(ds, D.goalOn), wSeq = windowOf(ds, D.goalSeq);
    const perCia = [...new Set(wOn.map(cia))].map((c) => { const L = wOn.filter((x) => cia(x) === c); return { c, n: L.length, ok: L.filter(okOn).length }; });
    return { date: D.date, goalOn: D.goalOn, goalSeq: D.goalSeq, wOn, wSeq, cOn: covered(ds, okOn), cSeq: covered(ds, okSeq), nOn: wOn.filter(okOn).length, nSeq: wSeq.filter(okSeq).length, perCia };
  }
  function exportFor(kind) {
    const s = summary(); if (!s) return toast('Primero ejecuta el cruce (DATA) y verifica que haya Start Date', 'warn');
    return exportShort(kind === 'seq' ? s.wSeq : s.wOn, kind);
  }

  App.dash = { render, summary, exportFor };
})(window.App);
