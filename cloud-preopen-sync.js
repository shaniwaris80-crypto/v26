/* patches/cloud-preopen-sync.js
   - No toca app.js
   - Obliga sync antes de abrir pestañas y tras guardar
*/
(() => {
  'use strict';
  if (window.__FM_CLOUD_PREOPEN_SYNC__) return;
  window.__FM_CLOUD_PREOPEN_SYNC__ = true;

  const $ = (s, r=document) => r.querySelector(s);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function cloudEnabled() {
    const on = $('#ajCloudOn');
    if (on) return !!on.checked;
    // fallback: si no existe el checkbox, asumimos que NO
    return false;
  }

  function hasCloudUI() {
    return !!$('#btnCloudSync') && !!$('#btnCloud');
  }

  function diagSavedText() {
    const el = $('#diagSaved');
    return (el?.textContent || '').trim();
  }

  function showBlocker(msg) {
    let o = $('#fmCloudBlocker');
    if (!o) {
      o = document.createElement('div');
      o.id = 'fmCloudBlocker';
      o.style.cssText = `
        position:fixed;inset:0;z-index:999999;
        background:rgba(0,0,0,.35);
        display:flex;align-items:center;justify-content:center;
        padding:16px;
      `;
      o.innerHTML = `
        <div style="background:#fff;border:1px solid #111;border-radius:16px;
          padding:14px 14px;max-width:520px;width:100%;
          box-shadow:0 18px 50px rgba(0,0,0,.25)">
          <div style="font:900 14px system-ui;margin-bottom:6px">Cloud Sync</div>
          <div id="fmCloudBlockerMsg" style="font:13px system-ui;opacity:.85"></div>
          <div style="margin-top:10px;display:flex;gap:10px;justify-content:flex-end">
            <button id="fmCloudBlockerClose" style="padding:9px 12px;border-radius:12px;border:1px solid #111;background:#fff;font:700 13px system-ui;cursor:pointer">Cerrar</button>
          </div>
        </div>`;
      document.body.appendChild(o);
      $('#fmCloudBlockerClose').onclick = () => (o.style.display = 'none');
    }
    $('#fmCloudBlockerMsg').textContent = msg || 'Sincronizando…';
    o.style.display = 'flex';
    return o;
  }

  function hideBlocker() {
    const o = $('#fmCloudBlocker');
    if (o) o.style.display = 'none';
  }

  async function doSync(reason = 'sync') {
    if (!cloudEnabled()) return true;
    if (!hasCloudUI()) return true;

    const btnSync = $('#btnCloudSync');
    const btnCloud = $('#btnCloud');
    const before = diagSavedText();

    // Si no hay login/config, el sync fallará; abrimos el modal Cloud para que lo veas
    // (no pedimos password aquí; solo abrimos tu UI)
    if (!btnSync) return true;

    // Click Sync
    try { btnSync.click(); } catch {}

    // Espera a que cambie el diagnóstico (o timeout)
    const end = Date.now() + 12000;
    while (Date.now() < end) {
      await sleep(220);
      const now = diagSavedText();
      if (now && now !== before) return true;
    }

    // Si no cambió, al menos abrimos Cloud para que veas si falta login
    try { btnCloud?.click(); } catch {}
    return true;
  }

  // ---------- 1) SYNC al guardar ----------
  function hookAutoSyncAfterClick(id, delay = 350) {
    const b = $(id);
    if (!b || b.__fmHooked) return;
    b.__fmHooked = true;

    b.addEventListener('click', () => {
      if (!cloudEnabled()) return;
      // espera a que app.js guarde local primero
      setTimeout(() => { doSync('after-save'); }, delay);
    }, true);
  }

  // ---------- 2) SYNC antes de abrir pestañas ----------
  let bypass = false;
  async function gateTabClick(tabBtn) {
    if (bypass) return;
    if (!cloudEnabled()) return;
    // si entra a ajustes, no hace falta bloquear
    const target = tabBtn?.dataset?.tab || '';
    if (!target) return;

    const blocker = showBlocker('Sincronizando con Cloud antes de abrir…');
    await doSync('preopen');
    hideBlocker();

    bypass = true;
    try {
      tabBtn.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    } finally {
      bypass = false;
    }
  }

  document.addEventListener('click', (e) => {
    const tab = e.target?.closest?.('.tab');
    if (!tab) return;
    if (bypass) return;
    if (!cloudEnabled()) return;

    // Bloquea la apertura normal y la reemplaza por “sync -> abrir”
    e.preventDefault();
    e.stopImmediatePropagation();
    gateTabClick(tab);
  }, true);

  // ---------- 3) Arranque: pull inicial ----------
  async function startupSyncOnce() {
    if (!cloudEnabled()) return;
    if (!hasCloudUI()) return;
    // espera a que la UI esté lista
    await sleep(700);
    await doSync('startup');
  }

  // Init
  document.addEventListener('DOMContentLoaded', () => {
    // Botones principales de guardado
    hookAutoSyncAfterClick('#btnGuardarFactura', 450);
    hookAutoSyncAfterClick('#btnClienteGuardar', 450);
    hookAutoSyncAfterClick('#btnClienteGuardar2', 450);
    hookAutoSyncAfterClick('#btnProdGuardar', 450);
    hookAutoSyncAfterClick('#btnTaraGuardar', 450);
    hookAutoSyncAfterClick('#btnVentasGuardar', 450);
    hookAutoSyncAfterClick('#btnAjustesGuardar', 450);

    startupSyncOnce();
  });

})();
