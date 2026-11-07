/* =====================================================================
   archivos.js — acceso a la carpeta con la API File System Access
   - El usuario elige la carpeta y autoriza (el navegador lo exige).
   - Se conservan las referencias (handles) en memoria durante la sesión.
   - La escritura usa createWritable(): el navegador escribe en un archivo
     de intercambio y solo reemplaza el original al cerrar; si algo falla
     antes, se aborta y el original queda intacto.
   ===================================================================== */
(function (App) {
  const EXT = /\.(xlsx|xlsm|xls)$/i;
  const BACKUP_DIR = 'Respaldos_Motor';

  const supported = () => typeof window.showDirectoryPicker === 'function' && window.isSecureContext;

  /** Pide permiso de lectura/escritura (si el navegador lo requiere, muestra su aviso) */
  async function ensurePermission(handle, ask = true) {
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (!ask) return false;
    return (await handle.requestPermission(opts)) === 'granted';
  }

  async function pickFolder() {
    const dir = await window.showDirectoryPicker({ id: 'motor-planes', mode: 'readwrite' });
    if (!(await ensurePermission(dir))) throw new Error('No se autorizó el acceso a la carpeta');
    return dir;
  }

  /** Archivos Excel de la carpeta (sin entrar a subcarpetas ni a los temporales ~$ de Excel) */
  async function listExcel(dir) {
    const out = [];
    for await (const [name, h] of dir.entries()) {
      if (h.kind === 'file' && EXT.test(name) && !name.startsWith('~$')) out.push({ name, handle: h });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  /** Lee el archivo completo como bytes; guarda su fecha de modificación para detectar cambios externos */
  async function readFile(handle) {
    const f = await handle.getFile();
    return { bytes: new Uint8Array(await f.arrayBuffer()), lastModified: f.lastModified, size: f.size, name: f.name };
  }

  async function lastModified(handle) { return (await handle.getFile()).lastModified; }

  /** Traduce errores del navegador a mensajes claros */
  function explain(e) {
    const n = e && e.name;
    if (n === 'NoModificationAllowedError' || n === 'InvalidStateError' || /lock|in use|being used|uso/i.test(e?.message || ''))
      return 'El archivo está abierto o bloqueado (¿lo tienes abierto en Excel?). Ciérralo y vuelve a guardar.';
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'El navegador no autorizó la escritura. Vuelve a dar permiso a la carpeta.';
    if (n === 'NotFoundError') return 'El archivo ya no existe en la carpeta (¿se movió o renombró?).';
    if (n === 'QuotaExceededError') return 'No hay espacio suficiente en el disco.';
    return e?.message || String(e);
  }

  /** Escribe bytes sobre el archivo ORIGINAL. Si falla, aborta y el original no cambia. */
  async function writeFile(handle, bytes) {
    let w = null;
    try {
      w = await handle.createWritable({ keepExistingData: false });
      await w.write(bytes);
      await w.close();
    } catch (e) {
      if (w) { try { await w.abort(); } catch (_) { /* ya cerrado */ } }
      throw new Error(explain(e));
    }
  }

  /** Copia de seguridad del contenido actual del original dentro de la subcarpeta Respaldos_Motor */
  async function backup(dir, name, bytes) {
    const sub = await dir.getDirectoryHandle(BACKUP_DIR, { create: true });
    const dot = name.lastIndexOf('.');
    const bName = `${name.slice(0, dot)}_respaldo_${App.stamp()}${name.slice(dot)}`;
    const h = await sub.getFileHandle(bName, { create: true });
    try { await writeFile(h, bytes); }
    catch (e) { try { await sub.removeEntry(bName); } catch (_) { /* nada que limpiar */ } throw new Error(`No se pudo crear el respaldo: ${e.message}`); }
    return `${BACKUP_DIR}\\${bName}`;
  }

  /** Quita un respaldo que ya no hace falta (si el guardado del original no se realizó) */
  async function removeBackup(dir, rel) {
    try { const sub = await dir.getDirectoryHandle(BACKUP_DIR); await sub.removeEntry(rel.split('\\').pop()); } catch (_) { /* si no se puede, se deja */ }
  }

  async function createFile(dir, name, bytes) {
    try { await dir.getFileHandle(name); throw new Error(`Ya existe un archivo llamado ${name}`); }
    catch (e) { if (e.name !== 'NotFoundError') throw e; }
    const h = await dir.getFileHandle(name, { create: true });
    await writeFile(h, bytes);
    return h;
  }

  App.fs = { supported, ensurePermission, pickFolder, listExcel, readFile, lastModified, writeFile, backup, removeBackup, createFile, explain, BACKUP_DIR };
})(window.App);
