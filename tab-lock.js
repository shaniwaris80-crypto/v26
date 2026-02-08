/* =========================================================
   tab-lock.js — BLOQUEA CAMBIO DE TAB MIENTRAS ESCRIBES
   - No toca app.js
   - Evita que te mande a "Factura" al escribir
========================================================= */
(() => {
  'use strict';

  const KEY = 'fm_tablock_last_tab_v1';

  let lockOn = false;
  let lockedTab = null;
  let restoring = false;

  let lastFocus = { id:null, selStart:null, selEnd:null };

  function isField(el){
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  // ---- Detectar tab activa (varios estilos posibles)
  function getActiveTabName(){
    const candidates = [
      '[data-tab].is-active',
      '[data-tab].active',
      '[data-tab][aria-selected="true"]',
      '[role="tab"][aria-selected="true"]',
      '.tab.is-active [data-tab]',
      '.tab.active [data-tab]'
    ];
    for (const sel of candidates){
      const el = document.querySelector(sel);
      if (el){
        return el.getAttribute('data-tab') || el.id || el.textContent?.trim() || null;
      }
    }

    // fallback: hash
    if (location.hash && location.hash.length > 1) return location.hash.slice(1);

    // fallback: panel visible (busca el primer panel no oculto)
    const panels = Array.from(document.querySelectorAll('[data-panel], .panel, .tabPanel, section, main, article'));
    for (const p of panels){
      const st = getComputedStyle(p);
      if (st.display !== 'none' && st.visibility !== 'hidden' && p.offsetHeight > 10){
        const id = p.getAttribute('data-panel') || p.id;
        if (id) return id;
      }
    }

    return null;
  }

  // ---- Activar tab por nombre (sin depender de tu app)
  function activateTab(name){
    if (!name) return false;

    // 1) Botón data-tab
    const btn = document.querySelector(`[data-tab="${CSS.escape(name)}"]`);
    if (btn && typeof btn.click === 'function') { btn.click(); return true; }

    // 2) Link hash
    const a = document.querySelector(`a[href="#${CSS.escape(name)}"]`);
    if (a && typeof a.click === 'function') { a.click(); return true; }

    // 3) Role tab por id
    const byId = document.getElementById(name);
    if (byId && typeof byId.click === 'function') { byId.click(); return true; }

    // 4) Hash directo
    try { location.hash = '#' + name; return true; } catch {}

    return false;
  }

  function saveLockedTab(tab){
    if (!tab) return;
    lockedTab = tab;
    try { localStorage.setItem(KEY, tab); } catch {}
  }

  function restoreFocus(){
    if (!lastFocus.id) return;
    const el = document.getElementById(lastFocus.id);
    if (!el) return;
    try{
      el.focus({ preventScroll:true });
      if (typeof el.setSelectionRange === 'function' && lastFocus.selStart != null){
        el.setSelectionRange(lastFocus.selStart, lastFocus.selEnd ?? lastFocus.selStart);
      }
    }catch{}
  }

  function maybeLockFromFocus(){
    const el = document.activeElement;
    lockOn = isField(el);

    if (lockOn){
      // guarda tab actual como “bloqueado”
      const t = getActiveTabName();
      if (t) saveLockedTab(t);

      // guarda foco
      if (el && el.id){
        lastFocus.id = el.id;
        try{
          lastFocus.selStart = el.selectionStart;
          lastFocus.selEnd = el.selectionEnd;
        }catch{
          lastFocus.selStart = lastFocus.selEnd = null;
        }
      }
    }
  }

  // Si cambia tab mientras escribes → revertir
  function enforceLock(){
    if (!lockOn || restoring) return;
    if (!lockedTab) lockedTab = localStorage.getItem(KEY);

    const cur = getActiveTabName();
    if (!lockedTab || !cur) return;

    if (cur !== lockedTab){
      restoring = true;
      // vuelve al tab bloqueado
      activateTab(lockedTab);

      // devuelve foco al input (si existe)
      setTimeout(() => restoreFocus(), 80);

      setTimeout(() => { restoring = false; }, 200);
    }
  }

  // Detectar intención del usuario (si clica un tab, actualiza lock)
  document.addEventListener('click', (e) => {
    const t = e.target?.closest?.('[data-tab],[role="tab"],a[href^="#"]');
    if (!t) return;
    const name = t.getAttribute('data-tab') || t.getAttribute('href')?.replace('#','') || t.id || null;
    if (name) saveLockedTab(name);
  }, true);

  // Lock basado en foco
  document.addEventListener('focusin', () => setTimeout(maybeLockFromFocus, 0), true);
  document.addEventListener('focusout', () => setTimeout(maybeLockFromFocus, 0), true);
  document.addEventListener('input', () => setTimeout(maybeLockFromFocus, 0), true);
  document.addEventListener('keydown', () => setTimeout(maybeLockFromFocus, 0), true);

  // Observa cambios de DOM (cuando tu app cambia pestaña)
  const mo = new MutationObserver(() => enforceLock());

  function boot(){
    maybeLockFromFocus();
    mo.observe(document.documentElement, { subtree:true, attributes:true, attributeFilter:['class','aria-selected','hidden','style'] });
    // chequeo periódico por si no hay mutaciones
    setInterval(enforceLock, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 200), { once:true });
  } else {
    setTimeout(boot, 200);
  }
})();
