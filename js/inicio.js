/* =====================================================================
   inicio.js — bienvenida al abrir: destello breve + saludo según la hora
   (sin usuario ni contraseña). Toca la pantalla para saltarla.
   ===================================================================== */
(function () {
  function welcome() {
    const now = new Date(), h = now.getHours(), pad = (n) => String(n).padStart(2, '0');
    const hi = h >= 5 && h < 12 ? 'Buenos días' : h >= 12 && h < 19 ? 'Buenas tardes' : 'Buenas noches';
    const flash = document.createElement('div'); flash.className = 'w-flash';
    const w = document.createElement('div'); w.className = 'welcome';
    w.innerHTML = `<div class="w-glow g1"></div><div class="w-glow g2"></div>
      <div class="w-card">
        <img class="w-logo" src="img/qorvex-logo.jpg" alt="QORVEX">
        <div class="w-brand">Manufacturing Intelligence Engine</div>
        <div class="w-hi">${hi}</div>
        <div class="w-nm">Bienvenido</div>
        <div class="w-sub">CONNECT · VALIDATE · SEQUENCE · OPTIMIZE</div>
        <div class="w-load"><i></i></div>
      </div>
      <div class="w-foot"><span>${now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${pad(h)}:${pad(now.getMinutes())}</span><span>QORVEX · Ing. Carlos Hernandez</span></div>`;
    document.body.append(w, flash);
    setTimeout(() => flash.remove(), 900);
    let done = false;
    const end = () => { if (done) return; done = true; w.classList.add('out'); setTimeout(() => w.remove(), 350); };
    w.onclick = end; setTimeout(end, 2800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', welcome); else welcome();
})();
