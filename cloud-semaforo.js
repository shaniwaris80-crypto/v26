/* patches/cloud-semaforo.js
   Semáforo Cloud (🔴🟡🟢) — NO toca tu lógica.
   - Inserta un puntito junto a "Cloud"
   - Click en el semáforo abre el modal/acción de Cloud (btnCloud)
   - Detecta: offline, errores Firebase, último sync (por meta/localStorage/eventos)
*/
(() => {
  'use strict';
  if (window.__FM_CLOUD_SEMAFORO__) return;
  window.__FM_CLOUD_SEMAFORO__ = true;

  const $ = (s, r=document) => r.querySelector(s);

  const KEY_OK  = 'fm_cloud_last_ok';
  const KEY_ERR = 'fm_cloud_last_err';

  function now(){ return Date.now(); }

  function hasCloudScripts(){
    return Array.from(document.scripts || []).some(s => {
      const src = (s.src || '').toLowerCase();
      return src.includes('firebase-cloud') || src.includes('cloud-bridge') || src.includes('firebase');
    });
  }

  function hasCloudMeta(){
    // Compatible con varias versiones: si tienes algo de meta o config, lo tomamos como “Cloud existe”
    return !!(localStorage.getItem('fm_cloud_meta') ||
              localStorage.getItem('fm_cloud_email') ||
              localStorage.getItem('fm_cloud_auto') ||
              localStorage.getItem('fm_cloud_device'));
  }

  function markOK(){
    localStorage.setItem(KEY_OK, String(now()));
  }
  function markERR(msg){
    localStorage.setItem(KEY_ERR, String(now()));
    if (msg) localStorage.setItem('fm_cloud_last_err_msg', String(msg).slice(0,180));
  }

  function getTS(k){
    const v = localStorage.getItem(k);
    const n = v ? Number(v) : 0;
    return Number.isFinite(n) ? n : 0;
  }

  function fmtAgo(ts){
    if (!ts) return 'nunca';
    const s = Math.max(0, Math.floor((now() - ts)/1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s/60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m/60);
    return `${h}h`;
  }

  function ensureStyles(){
    if ($('#fmCloudSemaforoStyle')) return;
    const st = document.createElement('style');
    st.id = 'fmCloudSemaforoStyle';
    st.textContent = `
      .fmSem{display:inline-flex;align-items:center;gap:8px;margin-right:8px;cursor:pointer;user-select:none}
      .fmDot{width:12px;height:12px;border-radius:999px;border:1px solid rgba(0,0,0,.35);box-shadow:0 1px 0 rgba(0,0,0,.06) inset}
      .fmDot[data-s="red"]{background:#dc2626}
      .fmDot[data-s="yel"]{background:#f59e0b}
      .fmDot[data-s="grn"]{background:#16a34a}
      .fmDot[data-s="off"]{background:#9ca3af}
      .fmSemTxt{font:900 12px system-ui;opacity:.75;display:none}
      @media (max-width: 820px){ .fmSemTxt{display:none} } /* solo punto en móvil */
    `;
    document.head.appendChild(st);
  }

  function inject(){
    ensureStyles();

    const host = $('.topbar__right') || document.body;
    if ($('#fmCloudSem')) return;

    const wrap = document.createElement('div');
    wrap.id = 'fmCloudSem';
    wrap.className = 'fmSem';
    wrap.title = 'Estado Cloud';
    wrap.innerHTML = `<span id="fmCloudDot" class="fmDot" data-s="off"></span><span class="fmSemTxt">Cloud</span>`;
    host.insertBefore(wrap, $('#btnCloud') || host.firstChild);

    wrap.addEventListener('click', () => {
      const btn = $('#btnCloud');
      if (btn) btn.click();
    });
  }

  function setState(s, tip){
    const dot = $('#fmCloudDot');
    const wrap = $('#fmCloudSem');
    if (!dot || !wrap) return;
    dot.dataset.s = s;
    wrap.title = tip || 'Estado Cloud';
    wrap.setAttribute('aria-label', wrap.title);
  }

  function compute(){
    const online = navigator.onLine !== false;
    const configured = hasCloudScripts() || hasCloudMeta();

    const lastOk  = getTS(KEY_OK);
    const lastErr = getTS(KEY_ERR);
    const errMsg  = localStorage.getItem('fm_cloud_last_err_msg') || '';

    // 🔴 si no hay internet
    if (!online){
      return { s:'red', tip:'Cloud: sin internet (offline)' };
    }

    // 🔴 si hubo error muy reciente
    if (lastErr && (now() - lastErr) < 2*60*1000){
      return { s:'red', tip:`Cloud: error reciente (${fmtAgo(lastErr)}) ${errMsg ? '· ' + errMsg : ''}`.trim() };
    }

    // 🟡 si cloud no está configurado/cargado
    if (!configured){
      return { s:'yel', tip:'Cloud: no configurado / no cargado' };
    }

    // 🟢 si sync OK muy reciente
    if (lastOk && (now() - lastOk) < 90*1000){
      return { s:'grn', tip:`Cloud: OK (último sync hace ${fmtAgo(lastOk)})` };
    }

    // 🟡 si hay cloud pero no sincroniza hace rato
    if (lastOk){
      return { s:'yel', tip:`Cloud: activo, último sync hace ${fmtAgo(lastOk)}` };
    }

    // 🟡 default
    return { s:'yel', tip:'Cloud: activo, aún sin sync' };
  }

  function render(){
    const st = compute();
    setState(st.s, st.tip);
  }

  // Detectar “sync ok” sin tocar tu app:
  // - si algún script actualiza fm_cloud_meta, marcamos OK
  // - si tu cloud dispara eventos, los escuchamos
  function hookLocalStorage(){
    if (localStorage.setItem.__fmSemWrapped) return;
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(k, v){
      orig(k, v);
      try{
        if (k === 'fm_cloud_meta' || k === 'fm_cloud_last_ok') markOK();
      }catch{}
    };
    localStorage.setItem.__fmSemWrapped = true;
  }

  function hookEvents(){
    // Si tu cloud ya manda eventos, perfecto:
    window.addEventListener('fmcloud:changed', () => { markOK(); render(); });
    window.addEventListener('fmcloud:syncok', () => { markOK(); render(); });
    window.addEventListener('fmcloud:error', (e) => { markERR(e?.detail?.message || 'cloud error'); render(); });

    window.addEventListener('online', render);
    window.addEventListener('offline', render);

    // Captura errores Firebase típicos (solo para semáforo)
    window.addEventListener('error', (e) => {
      const msg = String(e?.message || '');
      if (/FIREBASE|permission_denied|PERMISSION_DENIED|Cannot parse Firebase url|Database URL/i.test(msg)){
        markERR(msg);
        render();
      }
    });
  }

  function boot(){
    inject();
    hookLocalStorage();
    hookEvents();

    // Primer render y refresco suave
    render();
    setInterval(render, 2000);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();
