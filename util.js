/* =====================================================================
   util.js — utilidades generales (DOM, texto, normalización, avisos)
   Se carga como script clásico: los módulos ES no funcionan al abrir
   index.html con doble clic (file://), por eso todo cuelga de window.App
   ===================================================================== */
window.App = window.App || {};

(function (App) {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');

  /** Texto sin acentos, minúsculas y sin espacios ni signos (para comparar encabezados) */
  const normTxt = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  /** Llave de Job / AOR: si es numérico se compara como número (sin ceros a la izquierda) */
  function normKey(v) {
    if (v == null) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(Math.trunc(v)) : '';
    if (v instanceof Date) return '';
    const s = String(v).trim().replace(/\s+/g, '');
    if (!s) return '';
    if (/^\d+(\.0+)?$/.test(s)) return String(BigInt(s.split('.')[0]));
    return s.toUpperCase();
  }

  /** Componente unificado: ARNES, BCM, CLUSTER (=Gauge), SWGDE, SWCH, KEY (=Llaves) */
  function normComp(v) {
    const n = normTxt(v);
    if (!n) return '';
    if (n.includes('arnes') || n.includes('harness')) return 'ARNES';
    if (n.includes('bcm')) return 'BCM';
    if (n.includes('cluster') || n.includes('gauge')) return 'CLUSTER';
    if (n.includes('llave') || n.includes('key')) return 'KEY';
    if (/(switch|swtch|sw)/.test(n) && /(gde|grande)/.test(n)) return 'SWGDE';
    if (/(switch|swtch|sw)/.test(n) && /(ch|chico)$/.test(n)) return 'SWCH';
    return n.toUpperCase();
  }
  const COMP_N = { ARNES: 'Arnés', BCM: 'BCM', CLUSTER: 'Cluster', SWGDE: 'Switch Gde', SWCH: 'Switch Ch', KEY: 'Key' };

  const isBlank = (v) => v == null || (typeof v === 'string' && v.trim() === '');
  const fDate = (d) => (d instanceof Date && !isNaN(d) ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '');
  const fDT = (ts) => { const d = new Date(ts); return `${fDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; };
  const fmtN = (n) => Number(n || 0).toLocaleString('es-MX');
  const show = (v) => (v instanceof Date ? fDate(v) : v == null ? '' : String(v));
  /** Número de serie de Excel → dd/mm/aaaa (sin zona horaria) */
  const fSerial = (n) => { const d = new Date(Math.round((n - 25569) * 864e5)); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; };

  /* ---------- Avisos breves ---------- */
  function toast(msg, type = 'info', ms = 3800) {
    const box = $('#toasts'); if (!box) return;
    const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg;
    box.append(t); while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => t.remove(), ms);
  }

  /* ---------- Ventana modal reutilizable ----------
     buttons: [{ t, cls, fn(el) → false para no cerrar, o Promise }] */
  function modal({ title, body, buttons = [{ t: 'Cerrar' }], wide = false, onOpen, closable = true }) {
    return new Promise((resolve) => {
      const bg = document.createElement('div'); bg.className = 'm-bg';
      bg.innerHTML = `<div class="m ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="m-h"><h3>${title}</h3>${closable ? '<button class="m-x" aria-label="Cerrar">×</button>' : ''}</div>
        <div class="m-b">${body}</div>
        <div class="m-f">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${b.t}</button>`).join('')}</div></div>`;
      document.body.append(bg);
      const el = $('.m', bg);
      const close = (v) => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape' && closable) close(null); };
      document.addEventListener('keydown', onKey);
      if (closable) $('.m-x', bg).onclick = () => close(null);
      $$('.m-f .btn', bg).forEach((b) => (b.onclick = async () => {
        const def = buttons[+b.dataset.i];
        if (def.fn) {
          b.disabled = true;
          let r; try { r = await def.fn(el); } catch (e) { toast(e.message || String(e), 'err'); r = false; }
          b.disabled = false;
          if (r === false) return;
          return close(r === undefined ? def.v ?? true : r);
        }
        close(def.v ?? null);
      }));
      if (onOpen) onOpen(el, close);
    });
  }
  const confirmBox = (title, html, ok = 'Aceptar', cls = 'primary') =>
    modal({ title, body: html, buttons: [{ t: 'Cancelar', v: false }, { t: ok, cls, v: true }] }).then((v) => v === true);

  /** Pantalla de espera mientras se procesa algo largo */
  async function busy(msg, fn) {
    const o = document.createElement('div'); o.className = 'busy'; o.innerHTML = `<div><i></i><span>${esc(msg)}</span></div>`;
    document.body.append(o);
    await new Promise((r) => setTimeout(r, 30)); // deja pintar la pantalla
    try { return await fn(); } finally { o.remove(); }
  }

  Object.assign(App, { fSerial, $, $$, esc, pad, normTxt, normKey, normComp, COMP_N, isBlank, fDate, fDT, stamp, fmtN, show, toast, modal, confirmBox, busy });
})(window.App);
