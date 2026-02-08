(() => {
  'use strict';
  const $ = (s,r=document)=>r.querySelector(s);

  function activeTab(){
    const b = $('.tabs .tab.is-active');
    return b ? b.getAttribute('data-tab') : '';
  }

  function safeRefresh(tabName){
    const a = activeTab();
    if (a !== tabName) return;
    // si el usuario está escribiendo, no molestamos
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;

    const btn = $(`.tabs .tab[data-tab="${tabName}"]`);
    if (btn) btn.click(); // re-dispara tu render del tab
  }

  window.addEventListener('fmcloud:changed', (e) => {
    const key = e?.detail?.key || '';
    const k = key.toLowerCase();

    if (k.includes('factura'))  safeRefresh('tabFacturas');
    if (k.includes('cliente'))  safeRefresh('tabClientes');
    if (k.includes('producto')) safeRefresh('tabProductos');
    if (k.includes('tara'))     safeRefresh('tabTaras');
    if (k.includes('venta'))    safeRefresh('tabVentas');
  });
})();
