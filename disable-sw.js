/* =========================================================
   disable-sw.js — desregistra SW + borra caches
========================================================= */
(() => {
  'use strict';

  async function run(){
    if (!('serviceWorker' in navigator)) return;

    try{
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) { try { await r.unregister(); } catch {} }
    }catch{}

    try{
      if (window.caches?.keys){
        const keys = await caches.keys();
        for (const k of keys) { try { await caches.delete(k); } catch {} }
      }
    }catch{}
  }

  (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', run, { once:true })
    : run();
})();
