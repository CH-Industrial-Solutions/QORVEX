/* =====================================================================
   almacen.js — recuerda la carpeta y las preferencias entre sesiones
   (IndexedDB). Solo guarda la REFERENCIA a la carpeta, nunca los datos:
   los datos siempre viven en los archivos Excel.
   ===================================================================== */
(function (App) {
  const DB = 'motor-planes', ST = 'kv';
  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function get(k) {
    try {
      const db = await open();
      return await new Promise((res, rej) => { const q = db.transaction(ST).objectStore(ST).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    } catch (e) { return undefined; }
  }
  async function set(k, v) {
    try {
      const db = await open();
      await new Promise((res, rej) => { const t = db.transaction(ST, 'readwrite'); t.objectStore(ST).put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); });
    } catch (e) { /* sin memoria persistente: la app sigue funcionando */ }
  }
  App.store = { get, set };
})(window.App);
