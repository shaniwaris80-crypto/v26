/* =========================================================
   PATCH: firebase-default-config.js
   - Pone la config por defecto en la UI de Ajustes
   - También la deja disponible en window.FM_FIREBASE_CONFIG
   - No pisa si el usuario ya ha escrito algo
========================================================= */
(() => {
  'use strict';
  if (window.__FM_FB_DEFAULT_CFG__) return;
  window.__FM_FB_DEFAULT_CFG__ = true;

  const DEFAULT_CFG = {
    apiKey: "AIzaSyDgBBnuISNIaQF2hluowQESzVaE-pEiUsY",
    authDomain: "factumiral.firebaseapp.com",
    projectId: "factumiral",
    appId: "1:576821038417:web:aba329f36563134bb01770",
    databaseURL: "https://factumiral-default-rtdb.europe-west1.firebasedatabase.app",
    storageBucket: "factumiral.firebasestorage.app",
    messagingSenderId: "576821038417",
    measurementId: "G-HJVL8ET49L",
  };

  // Fallback global (tu patch cloud-sync-safe ya lo usa si falta UI)
  window.FM_FIREBASE_CONFIG = DEFAULT_CFG;

  const $ = (s, r=document) => r.querySelector(s);

  function setIfEmpty(id, val){
    const el = $('#'+id);
    if (!el) return;
    if ((el.value || '').trim() !== '') return; // no pisar si ya hay algo
    el.value = val || '';
    el.dispatchEvent(new Event('input', { bubbles:true }));
    el.dispatchEvent(new Event('change', { bubbles:true }));
  }

  function applyToUI(){
    setIfEmpty('fbApiKey',     DEFAULT_CFG.apiKey);
    setIfEmpty('fbAuthDomain', DEFAULT_CFG.authDomain);
    setIfEmpty('fbDbUrl',      DEFAULT_CFG.databaseURL);
    setIfEmpty('fbProjectId',  DEFAULT_CFG.projectId);
    setIfEmpty('fbAppId',      DEFAULT_CFG.appId);
    setIfEmpty('fbStorage',    DEFAULT_CFG.storageBucket);

    // Opcional: activar el checkbox por defecto (solo si está vacío/no marcado)
    const on = $('#ajCloudOn');
    if (on && on.checked === false) {
      on.checked = true;
      on.dispatchEvent(new Event('change', { bubbles:true }));
    }
  }

  document.addEventListener('DOMContentLoaded', applyToUI);
  // por si Ajustes se pinta tarde:
  setTimeout(applyToUI, 800);
  setTimeout(applyToUI, 1600);
})();
