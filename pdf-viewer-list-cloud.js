(() => {
  'use strict';
  if (window.__FM_PDF_LIST_CLOUD__) return;
  window.__FM_PDF_LIST_CLOUD__ = true;

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const sleep = (ms) => new Promise(r=>setTimeout(r, ms));

  function findFacturasKey(){
    try{
      if (window.LS && typeof window.LS === 'object'){
        for (const k of Object.values(window.LS)){
          if (typeof k === 'string' && k.toLowerCase().includes('facturas')) return k;
        }
      }
    }catch{}
    const keys = Object.keys(localStorage);
    return keys.find(k => k.toLowerCase().includes('facturas')) || null;
  }

  function loadJSON(k, fallback){
    try { return JSON.parse(localStorage.getItem(k) || ''); } catch { return fallback; }
  }

  function findFacturaByNum(store, num){
    const norm = String(num).trim();
    const matchNum = (f) => {
      const n = (f?.numFactura ?? f?.numero ?? f?.num ?? f?.n ?? f?.id ?? '').toString().trim();
      return n === norm;
    };

    if (Array.isArray(store)) return store.find(matchNum) || null;
    if (store && typeof store === 'object'){
      if (Array.isArray(store.items)) return store.items.find(matchNum) || null;
      for (const v of Object.values(store)) if (v && typeof v === 'object' && matchNum(v)) return v;
    }
    return null;
  }

  function extractFacturaNumFromText(el){
    const t = (el.textContent || '');
    // tu formato suele ser FA-YYYYMMDDHHMM... (adaptable)
    const m = t.match(/FA-[A-Za-z0-9\-]{6,}/);
    return m ? m[0] : null;
  }

  function ensureButtonsOnListItem(itemEl){
    if (!itemEl || itemEl.__fmPdfButtons) return;
    const num = extractFacturaNumFromText(itemEl);
    if (!num) return;

    const k = findFacturasKey();
    const store = k ? loadJSON(k, null) : null;
    const fac = store ? findFacturaByNum(store, num) : null;
    const url = fac?.pdfUrl;

    // container
    let bar = itemEl.querySelector('.fmPdfBar');
    if (!bar){
      bar = document.createElement('div');
      bar.className = 'fmPdfBar';
      bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;';
      itemEl.appendChild(bar);
    } else {
      bar.innerHTML = '';
    }

    // Ver PDF (si existe)
    if (url){
      const bView = document.createElement('button');
      bView.type = 'button';
      bView.textContent = 'Ver PDF';
      bView.style.cssText = 'padding:8px 10px;border:1px solid #111;background:#fff;border-radius:10px;font-weight:800;cursor:pointer;';
      bView.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        (window.fmPdfCloud?.openPdfViewer ? window.fmPdfCloud.openPdfViewer(url) : window.open(url,'_blank'));
      });
      bar.appendChild(bView);

      const tag = document.createElement('span');
      tag.textContent = '✓ Cloud';
      tag.style.cssText = 'padding:8px 10px;border:1px solid #0a7;background:#eafff3;border-radius:10px;font-weight:900;';
      bar.appendChild(tag);
    } else {
      // Subir (abre la factura y usa el botón cloud)
      const bUp = document.createElement('button');
      bUp.type = 'button';
      bUp.textContent = 'Subir PDF Cloud';
      bUp.style.cssText = 'padding:8px 10px;border:1px solid rgba(0,0,0,.25);background:#26d06a;color:#000;border-radius:10px;font-weight:900;cursor:pointer;';
      bUp.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();

        // intentar abrir la factura clicando el item
        try { itemEl.click(); } catch {}
        // dar tiempo a que cargue en pestaña Factura
        await sleep(350);

        if (!window.fmPdfCloud?.uploadCurrentInvoicePdf){
          alert('No está cargado el módulo de PDF Cloud. Revisa que pdf-cloud-permanent.js no esté en 404.');
          return;
        }

        try{
          await window.fmPdfCloud.uploadCurrentInvoicePdf();
          // refresca botones de este item
          await sleep(200);
          ensureButtonsOnListItem(itemEl);
        }catch(err){
          console.error(err);
          alert('❌ Subida PDF Cloud: ' + (err?.message || err));
        }
      });

      bar.appendChild(bUp);
    }

    itemEl.__fmPdfButtons = true;
  }

  async function run(){
    // esperar contenedor lista
    for (let i=0;i<80;i++){
      const list = $('#facturasList');
      if (list){
        // observar cambios
        const obs = new MutationObserver(() => {
          const items = $$('#facturasList > *');
          items.forEach(ensureButtonsOnListItem);
        });
        obs.observe(list, { childList:true, subtree:false });

        // primera pasada
        const items = $$('#facturasList > *');
        items.forEach(ensureButtonsOnListItem);
        return;
      }
      await sleep(200);
    }
  }

  run();
})();
