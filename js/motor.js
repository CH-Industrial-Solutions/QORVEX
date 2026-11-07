/* =====================================================================
   motor.js — reglas del cruce para llenar la hoja Planes
   Todo se calcula en memoria; nada se escribe hasta que el usuario guarda.
   ===================================================================== */
(function (App) {
  const { normTxt, normKey, normComp, isBlank } = App;
  const N = (...a) => a.map(normTxt);

  /* ---------- Columnas de cada archivo (nombre de encabezado + posición de respaldo) ---------- */
  const SPEC = {
    planes: [
      { k: 'aor', label: 'AOR', names: N('AOR', 'Orden de montaje'), pos: 1, req: true },
      { k: 'job', label: 'JOB', names: N('JOB', 'Job Number'), pos: 2, req: true },
      { k: 'ls', label: 'LS', names: N('LS', 'Lineset', 'Line Set Number'), pos: 3 },
      { k: 'cia', label: 'Cia', names: N('Cia', 'Customer'), pos: 4 },
      { k: 'idArnes', label: 'Arnés', names: N('Arnés', 'ID-Arnés', 'Harness'), pos: 5, req: true },
      { k: 'idBcm', label: 'ID-BCM', names: N('ID-BCM'), pos: 6, req: true },
      { k: 'secBcm', label: 'Sec-BCM', names: N('Sec-BCM'), pos: 7, req: true },
      { k: 'idCluster', label: 'ID-Cluster', names: N('ID-GAUGE', 'ID-Cluster'), pos: 8, req: true },
      { k: 'secCluster', label: 'Sec-Cluster', names: N('Sec-GaugE', 'Sec-Gauge', 'Sec-Cluster'), pos: 9, req: true },
      { k: 'idSwGde', label: 'ID-Switch Gde', names: N('ID-Switch Gde'), pos: 10, req: true },
      { k: 'qy', label: 'QY', names: N('QY'), pos: 11, req: true },
      { k: 'secSwGde', label: 'Sec-Switch Gde', names: N('Sec-Swtch Gde', 'Sec-Switch Gde'), pos: 12, req: true },
      { k: 'idSwCh', label: 'ID-Switch Ch', names: N('ID-Switch Ch'), pos: 13, req: true },
      { k: 'secSwCh', label: 'Sec-Switch Ch', names: N('Sec-Swtch Ch', 'Sec-Switch Ch'), pos: 14, req: true },
      { k: 'idKey', label: 'ID-Key', names: N('ID-KEY', 'ID-Keys'), pos: 15, req: true },
      { k: 'secKey', label: 'Sec-Key', names: N('Sec-Keys', 'Sec-Key'), pos: 16, req: true },
      { k: 'status', label: 'Status', names: N('Status', 'Estatus'), pos: 17, req: true },
      { k: 'start', label: 'Start Date', names: N('Start Date'), pos: 18, req: true },
      { k: 'pull', label: 'Pull', names: N('Pull'), pos: 19, req: true },
      { k: 'estado', label: 'Estado', names: N('Estado'), pos: 20, req: true },
    ],
    captura: [ // Validación y Secuencia (A..L): se usan Job, Contenedor y Componente
      { k: 'job', label: 'Job', names: N('Job'), pos: 5, req: true },
      { k: 'cont', label: 'Contenedor', names: N('Contenedor'), pos: 6, req: true },
      { k: 'comp', label: 'Componente', names: N('Componente'), pos: 7, req: true },
    ],
    pulls: [
      { k: 'job', label: 'Job', names: N('Job'), pos: 1, req: true },
      { k: 'cont', label: 'Contenedor', names: N('Contenedor'), pos: 2, req: true },
      { k: 'com', label: 'Comentario', names: N('Comentario', 'Comentarios'), pos: 3, req: true },
    ],
  };
  const ANCHOR = { planes: N('JOB', 'Job Number'), captura: N('Job'), pulls: N('Job') };
  /** Planes se lee siempre por posición de columna (A=AOR, B=JOB, C=LS, D=Cia … Q=Status, R=Start Date) */
  const PLANES_POS = { byPos: true };

  /* Columnas calculadas de Planes: de dónde salen */
  const CALC = [
    { k: 'idArnes', src: 'val', comp: 'ARNES' },
    { k: 'idBcm', src: 'val', comp: 'BCM' },
    { k: 'secBcm', src: 'seq', comp: 'BCM' },
    { k: 'idCluster', src: 'val', comp: 'CLUSTER' },
    { k: 'secCluster', src: 'seq', comp: 'CLUSTER' },
    { k: 'idSwGde', src: 'val', comp: 'SWGDE' },
    { k: 'qy', src: 'count', comp: 'SWGDE' },
    { k: 'secSwGde', src: 'seq', comp: 'SWGDE' },
    { k: 'idSwCh', src: 'val', comp: 'SWCH' },
    { k: 'secSwCh', src: 'seq', comp: 'SWCH' },
    { k: 'idKey', src: 'val', comp: 'KEY' },
    { k: 'secKey', src: 'seq', comp: 'KEY' },
  ];
  /* Los 6 componentes "on hand" que forman el Estado (solo Validación) */
  const ON_HAND = ['idArnes', 'idBcm', 'idCluster', 'idSwGde', 'idSwCh', 'idKey'];
  const OUT_KEYS = [...CALC.map((c) => c.k), 'status', 'start', 'pull', 'estado'];
  const SHORT = 'SHORTAGE';
  const PEND = 'PENDIENTE';   // hay on hand (validado) pero aún sin contenedor de secuencia

  /** Índice job|componente → contenedores en orden de aparición + total de capturas.
      Acepta una tabla o varias (Validacion.xlsx + Validacion_TAB1.xlsx + …) */
  function indexCaptura(list) {
    const m = new Map(); let bad = 0;
    (Array.isArray(list) ? list : [list]).forEach((t) => t.rows.forEach((row) => {
      const job = normKey(App.xl.val(t, row, 'job')), comp = normComp(App.xl.val(t, row, 'comp')), cont = App.xl.val(t, row, 'cont');
      if (!job || !comp) { bad++; return; }
      const key = `${job}|${comp}`;
      let e = m.get(key); if (!e) { e = { conts: [], seen: new Set(), count: 0, rows: [], label: App.xl.val(t, row, 'comp') }; m.set(key, e); }
      e.count++; e.rows.push(row);
      const ck = String(cont ?? '').trim();
      if (ck && !e.seen.has(ck.toUpperCase())) { e.seen.add(ck.toUpperCase()); e.conts.push(cont); }
    }));
    return { m, bad };
  }

  function indexPulls(list) {
    const m = new Map();
    list.forEach((p) => {
      const job = normKey(p.job); if (!job || isBlank(p.cont)) return;
      let e = m.get(job); if (!e) { e = []; m.set(job, e); }
      if (!e.some((c) => String(c).toUpperCase() === String(p.cont).trim().toUpperCase())) e.push(String(p.cont).trim());
    });
    return m;
  }

  /**
   * Ejecuta el cruce. Devuelve una fila de resultado por cada fila de Planes:
   * { r, base:{aor,job,ls,cia}, out:{k:valor}, alert:{k:texto}, onHand, missAor }
   */
  function run({ planes, val, seq, pulls }) {
    const iv = indexCaptura(val), is = indexCaptura(seq), ip = indexPulls(pulls);
    const rows = planes.rows.map((row) => {
      const g = (k) => App.xl.val(planes, row, k);
      const job = normKey(g('job'));
      const out = {}, alert = {};
      CALC.forEach((c) => {
        const e = (c.src === 'seq' ? is : iv).m.get(`${job}|${c.comp}`);
        if (c.src === 'count') { out[c.k] = e ? e.count : SHORT; return; }
        if (!e || !e.conts.length) {
          // Secuencia sin contenedor: PENDIENTE si ya hay on hand (validado), si no SHORTAGE
          if (c.src === 'seq') { const v = iv.m.get(`${job}|${c.comp}`); out[c.k] = v && v.conts.length ? PEND : SHORT; }
          else out[c.k] = SHORT;
          return;
        }
        out[c.k] = e.conts[0];
        if (e.conts.length > 1) alert[c.k] = `Job en ${e.conts.length} contenedores: ${e.conts.join(', ')}. Debe estar en uno solo.`;
      });
      // Status y Start Date vienen del mismo Planes: se conservan tal cual
      out.status = g('status') ?? '';
      out.start = g('start') ?? '';
      const p = job ? ip.get(job) : null;
      out.pull = p ? p[0] : '';
      if (p && p.length > 1) alert.pull = `Pull capturado en ${p.length} contenedores: ${p.join(', ')}`;
      const onHand = ON_HAND.filter((k) => out[k] !== SHORT).length;
      out.estado = `${onHand}/6`;
      return { r: row.r, base: { aor: g('aor'), job: g('job'), ls: g('ls'), cia: g('cia') }, jobKey: job, out, alert, onHand, noJob: !job };
    });
    return { rows, idx: { val: iv, seq: is }, stats: { badVal: iv.bad, badSeq: is.bad, ran: Date.now() } };
  }

  /** Validaciones previas al guardado de Planes */
  function validate(planesT, result) {
    const errs = [];
    if (!result) errs.push('Primero ejecuta el cruce.');
    else if (result.rows.length !== planesT.rows.length) errs.push('La cantidad de filas cambió desde el cruce; vuelve a ejecutarlo.');
    OUT_KEYS.forEach((k) => { if (planesT.cols[k] == null || planesT.cols[k] < 0) errs.push(`No se ubicó la columna ${k}.`); });
    const used = OUT_KEYS.map((k) => planesT.cols[k]);
    if (new Set(used).size !== used.length) errs.push('Dos columnas calculadas apuntan a la misma columna del Excel; revisa los encabezados.');
    if ([planesT.cols.aor, planesT.cols.job, planesT.cols.ls, planesT.cols.cia].some((c) => used.includes(c))) errs.push('Una columna calculada coincide con AOR/JOB/LS/Cia; revisa los encabezados.');
    return errs;
  }

  /** Escribe los resultados (columnas 5-20) en la hoja de Planes del libro en memoria */
  const ST_SHORT = { fill: { patternType: 'solid', fgColor: { rgb: 'F9D4D4' } }, font: { color: { rgb: '9B2C2C' }, bold: true } };
  const ST_PEND = { fill: { patternType: 'solid', fgColor: { rgb: 'FFE9B8' } }, font: { color: { rgb: '8A5300' }, bold: true } };
  const styleOf = (v) => (v === SHORT ? ST_SHORT : v === PEND ? ST_PEND : null);
  function applyToSheet(ws, planesT, result) {
    result.rows.forEach((res) => {
      OUT_KEYS.forEach((k) => {
        const c = planesT.c0 + planesT.cols[k];
        const v = res.out[k];
        App.xl.setCell(ws, res.r, c, v, styleOf(v), res.alert[k] ? `⚠ ${res.alert[k]}` : null, k === 'start' && typeof v === 'number' ? 'dd/mm/yyyy' : null);
      });
    });
  }

  App.motor = { PEND, styleOf, SPEC, ANCHOR, PLANES_POS, CALC, ON_HAND, OUT_KEYS, SHORT, run, validate, applyToSheet, indexPulls };
})(window.App);
