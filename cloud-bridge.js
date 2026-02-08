/* =========================================================
   cloud-bridge.js — MANUAL ONLY (NO AUTO RELOAD)
========================================================= */
(() => {
  'use strict';

  const BANNER_ID = 'fmCloudBannerManual';
  let count = 0;
  let lastAt = 0;

  function ensureBanner(){
    let b = document.getElementById(BANNER_ID);
    if (b) return b;

    b = document.createElement('div');
    b.id = BANNER_ID;
    b.style.cssText =
      "position:fixed;left:10px;right:10px;top:10px;z-index:999999;" +
      "border:1px solid #111;background:#fff;border-radius:14px;padding:10px 12px;" +
      "box-shadow:0 12px 26px rgba(0,0,0,.18);display:flex;gap:10px;align-items:center;";

    b.innerHTML = `
      <div style="flex:1;font:900 13px system-ui;color:#111">
        ☁️ Cambios de Cloud listos
        <div id="fmCloudBannerSub" style="font:12px system-ui;font-weight:700;opacity:.75;margin-top:2px"></div>
      </div>
      <button id="fmCloudApply" type="button"
        style="border:1px solid #111;background:#111;color:#fff;border-radius:12px;padding:10px 12px;font:900 13px system-ui">
        Actualizar
      </button>
      <button id="fmCloudDismiss" type="button"
        style="border:1px solid #111;background:#fff;color:#111;border-radius:12px;padding:10px 12px;font:900 13px system-ui">
        Ocultar
      </button>
    `;
    document.body.appendChild(b);

    b.querySelector('#fmCloudApply').addEventListener('click', () => {
      // SOLO manual
      location(window.__fmManualReload__ ? window.__fmManualReload__() : location.reload());
reload();
    });

    b.querySelector('#fmCloudDismiss').addEventListener('click', () => b.remove());
    return b;
  }

  function updateBanner(){
    const b = ensureBanner();
    const sub = b.querySelector('#fmCloudBannerSub');
    const seconds = lastAt ? Math.round((Date.now() - lastAt)/1000) : 0;
    sub.textContent = `Pendientes: ${count} · Último cambio hace ${seconds}s · (NO se recarga solo)`;
  }

  window.addEventListener('fmcloud:changed', () => {
    count++;
    lastAt = Date.now();
    updateBanner();
  });
})();
