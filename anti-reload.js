/* =========================================================
   anti-reload.js — BLOQUEO TOTAL de reload automático
   - Bloquea reload/assign/replace/go(0) si es recarga
========================================================= */
(() => {
  'use strict';

  const sameUrl = (url) => {
    try { return new URL(url, location.href).href === location.href; }
    catch { return String(url||'') === String(location.href||''); }
  };

  // Guardamos el reload real como "manual"
  try {
    const realReload = location.reload.bind(location);
    window.__fmManualReload__ = () => realReload();
  } catch {}

  // Bloquea reload directo
  try{
    const realReload = location.reload.bind(location);
    location.reload = function(){
      // bloqueado siempre (solo manual con window.__fmManualReload__)
      return;
    };
  } catch {}

  // Bloquea assign/replace a misma URL (recarga camuflada)
  try{
    const realAssign = location.assign.bind(location);
    location.assign = function(url){
      if (sameUrl(url)) return; // bloqueado
      return realAssign(url);
    };
  } catch {}

  try{
    const realReplace = location.replace.bind(location);
    location.replace = function(url){
      if (sameUrl(url)) return; // bloqueado
      return realReplace(url);
    };
  } catch {}

  // Bloquea history.go(0)
  try{
    const realGo = history.go.bind(history);
    history.go = function(delta){
      if (delta === 0) return; // bloqueado
      return realGo(delta);
    };
  } catch {}
})();
