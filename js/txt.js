/* =====================================================================
   txt.js — archivos de texto separados por TABULADOR (UTF-8)
   - Primera línea: encabezados. Cada línea siguiente: un registro.
   - Solo se AGREGAN líneas al final (nunca se reescribe el archivo).
   - Un Tab o salto de línea dentro de un dato se cambia por un espacio.
   ===================================================================== */
(function (App) {
  /* Columnas de los TXT de captura (iguales en QORVEX MOBILE) */
  const HEAD = ['Fecha', 'Hora', 'Turno', 'Tipo', 'Job', 'Contenedor', 'Componente', 'Placas', 'Lote', 'No. Empleado', 'Nombre', 'Supervisor', 'Editado', 'ID', 'Movimiento', 'Registrado', 'Duplicado', 'Motivo'];
  const CAP_RE = /^(Validacion|Secuencia)_([A-Za-z0-9-]+)_(\d{4})-(\d{2})\.txt$/i;
  const clean = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  const toLine = (arr) => arr.map(clean).join('\t');
  const monthTag = (d = new Date()) => `${d.getFullYear()}-${App.pad(d.getMonth() + 1)}`;
  const nowTxt = (d = new Date()) => `${App.pad(d.getDate())}/${App.pad(d.getMonth() + 1)}/${d.getFullYear()} ${App.pad(d.getHours())}:${App.pad(d.getMinutes())}:${App.pad(d.getSeconds())}`;

  /** Texto → { head, rows: [[...], ...] } (ignora líneas vacías) */
  function parse(text) {
    const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
    const head = (lines.shift() || '').split('\t').map((s) => s.trim());
    const rows = [];
    lines.forEach((l) => { if (l.trim() !== '') rows.push(l.split('\t')); });
    return { head, rows };
  }
  /** Fila → objeto por encabezado normalizado */
  const objOf = (head, row) => { const o = {}; head.forEach((h, i) => { o[App.normTxt(h)] = row[i] == null ? '' : row[i]; }); return o; };

  async function readText(handle) {
    const f = await handle.getFile();
    return { text: await f.text(), lastModified: f.lastModified, size: f.size, name: f.name };
  }

  /** Lista los archivos de la carpeta (sin subcarpetas) */
  async function list(dir, re) {
    const out = [];
    for await (const [name, h] of dir.entries()) if (h.kind === 'file' && (!re || re.test(name))) out.push({ name, handle: h });
    return out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  /** Agrega líneas al final de un TXT (lo crea con encabezados si no existe) y verifica */
  async function append(dir, name, head, lines) {
    if (!lines.length) return 0;
    let fh;
    try { fh = await dir.getFileHandle(name); } catch (e) { if (e.name !== 'NotFoundError') throw e; fh = await dir.getFileHandle(name, { create: true }); }
    const f = await fh.getFile();
    let pre = '';
    if (f.size === 0) pre = `﻿${toLine(head)}\r\n`;
    else { const last = new Uint8Array(await f.slice(f.size - 1).arrayBuffer())[0]; if (last !== 10) pre = '\r\n'; }
    const body = lines.join('\r\n') + '\r\n';
    let w = null;
    try {
      w = await fh.createWritable({ keepExistingData: true });
      await w.seek(f.size); await w.write(pre + body); await w.close();
    } catch (e) { if (w) { try { await w.abort(); } catch (_) { /* nada */ } } throw new Error(App.fs.explain(e)); }
    // verificación: el archivo termina con lo que se agregó
    const back = await (await fh.getFile()).text();
    if (!back.endsWith(body)) throw new Error(`Verificación: ${name} no quedó con las líneas nuevas al final.`);
    return lines.length;
  }

  /** Escribe un archivo completo (solo para Config_QORVEX.json y el candado del Motor) */
  async function writeWhole(dir, name, text) {
    const fh = await dir.getFileHandle(name, { create: true });
    let w = null;
    try { w = await fh.createWritable({ keepExistingData: false }); await w.write(text); await w.close(); }
    catch (e) { if (w) { try { await w.abort(); } catch (_) { /* nada */ } } throw new Error(App.fs.explain(e)); }
    return fh;
  }
  async function readOpt(dir, name) {
    try { const fh = await dir.getFileHandle(name); return { fh, ...(await readText(fh)) }; }
    catch (e) { if (e.name === 'NotFoundError' || e.name === 'TypeError') return null; throw e; }
  }

  App.txt = { HEAD, CAP_RE, clean, toLine, monthTag, nowTxt, parse, objOf, readText, list, append, writeWhole, readOpt };
})(window.App);
