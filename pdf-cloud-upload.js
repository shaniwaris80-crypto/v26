/* V9PRUEBAS/patches/pdf-cloud-pro.js
   BOTÓN VERDE: "PDF PRO + CLOUD"
   - Genera PDF PRO (jsPDF + AutoTable)
   - Sube a Firebase Storage
   - Abre el PDF (URL de Cloud) en visor modal
   - NO modifica app.js
*/
(async () => {
  'use strict';
  if (window.__FM_PDF_PRO_CLOUD_V1__) return;
  window.__FM_PDF_PRO_CLOUD_V1__ = true;

  const $ = (s, r=document) => r.querySelector(s);
  const log = (...a) => console.log('[PDF PRO + CLOUD]', ...a);

  // ---------- Estilo botón verde (no toca tu CSS) ----------
  const css = `
    .fmBtnGreen{
      background:#26d06a !important;
      color:#000 !important;
      border:1px solid rgba(0,0,0,.25) !important;
      padding:10px 12px !important;
      border-radius:12px !important;
      font-weight:900 !important;
      cursor:pointer !important;
      user-select:none !important;
      white-space:nowrap !important;
    }
    .fmBtnGreen:active{ transform: translateY(1px); }
  `;
  (function injectCss(){
    if ($('#fmPdfProCloudCss')) return;
    const st = document.createElement('style');
    st.id = 'fmPdfProCloudCss';
    st.textContent = css;
    document.head.appendChild(st);
  })();

  // ---------- Firebase (tu config) ----------
  const firebaseConfig = {
    apiKey: "AIzaSyDgBBnuISNIaQF2hluowQESzVaE-pEiUsY",
    authDomain: "factumiral.firebaseapp.com",
    projectId: "factumiral",
    storageBucket: "factumiral.firebasestorage.app",
    messagingSenderId: "576821038417",
    appId: "1:576821038417:web:aba329f36563134bb01770",
    measurementId: "G-HJVL8ET49L",
    databaseURL: "https://factumiral-default-rtdb.europe-west1.firebasedatabase.app"
  };

  // Firebase modular CDN
  const [appMod, authMod, storageMod] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js")
  ]);
  const { initializeApp, getApps, getApp } = appMod;
  const { getAuth } = authMod;
  const { getStorage, ref: sRef, uploadBytes, getDownloadURL } = storageMod;

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const storage = getStorage(app);

  // ---------- Cargar jsPDF + AutoTable ----------
  function loadScript(url){
    return new Promise((res, rej)=>{
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = () => res(true);
      s.onerror = () => rej(new Error('No se pudo cargar: ' + url));
      document.head.appendChild(s);
    });
  }
  async function ensurePdfLibs(){
    if (!window.jspdf?.jsPDF) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    }
    if (!window.jspdf?.jsPDF?.API?.autoTable) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
    }
  }

  // ---------- Helpers ----------
  const firstVal = (sels) => {
    for (const s of sels){
      const el = $(s);
      const v = (el?.value ?? el?.textContent ?? '').toString().trim();
      if (v) return v;
    }
    return '';
  };
  const parseNum = (v) => {
    const s = (v ?? '').toString().trim().replace(/\s/g,'').replace(',','.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };
  const eur = (n) => (Number(n)||0).toFixed(2).replace('.',',') + ' €';
  const sanitize = (s) => (s || `FA-${Date.now()}`).replace(/[^\w\-]+/g,'_').replace(/_+/g,'_').slice(0, 90);

  function readInvoiceFromDom(){
    const num = firstVal(['#numFactura','#facturaNum','#facNum','input[name="numFactura"]']) || `FA-${Date.now()}`;
    const fecha = firstVal(['#fechaFactura','#facFecha','input[name="fechaFactura"]']);

    const prov = {
      nombre: firstVal(['#provNombre','input#provNombre']),
      nif:    firstVal(['#provNif','input#provNif']),
      dir:    firstVal(['#provDir','input#provDir']),
      tel:    firstVal(['#provTel','input#provTel']),
      email:  firstVal(['#provEmail','input#provEmail']),
    };

    const cli = {
      nombre: firstVal(['#cliNombre','#clienteNombre','input#cliNombre','input#clienteNombre']),
      nif:    firstVal(['#cliNif','#clienteNif','input#cliNif','input#clienteNif']),
      dir:    firstVal(['#cliDir','#clienteDir','input#cliDir','input#clienteDir']),
      tel:    firstVal(['#cliTel','#clienteTel','input#cliTel','input#clienteTel']),
      email:  firstVal(['#cliEmail','#clienteEmail','input#cliEmail','input#clienteEmail']),
    };

    const tags = firstVal(['#tags','#facTags','input#tags','input#facTags']);
    const obs  = firstVal(['#observaciones','#obs','#facObs','textarea#observaciones','textarea#obs','textarea#facObs']);

    // líneas (heurística genérica)
    const rows = [];
    const candidates = Array.from(document.querySelectorAll('tr,[data-row],.gridRow,.row,.line'));
    const findInRow = (r, selList) => {
      for (const s of selList){
        const el = r.querySelector(s);
        if (!el) continue;
        const v = (el.value ?? el.textContent ?? '').toString().trim();
        if (v) return v;
      }
      return '';
    };

    for (const r of candidates){
      const producto = findInRow(r, [
        '[data-col="producto"] input','input[data-col="producto"]','input[name*="prod"]','input[id*="prod"]','input[placeholder*="Producto"]'
      ]);
      if (!producto) continue;

      const modo = findInRow(r, [
        '[data-col="modo"] select','select[data-col="modo"]','select[name*="modo"]','select[id*="modo"]'
      ]) || '';

      const cantidad = findInRow(r, [
        '[data-col="cantidad"] input','input[data-col="cantidad"]','input[name*="cant"]','input[id*="cant"]','input[placeholder*="Cantidad"]'
      ]);
      const bruto = findInRow(r, ['[data-col="bruto"] input','input[data-col="bruto"]','input[name*="bruto"]','input[id*="bruto"]']);
      const tara  = findInRow(r, ['[data-col="tara"] input','input[data-col="tara"]','input[name*="tara"]','input[id*="tara"]']);
      const neto  = findInRow(r, ['[data-col="neto"] input','input[data-col="neto"]','input[name*="neto"]','input[id*="neto"]']);
      const precio= findInRow(r, ['[data-col="precio"] input','input[data-col="precio"]','input[name*="precio"]','input[id*="precio"]','input[placeholder*="Precio"]']);
      const origen= findInRow(r, ['[data-col="origen"] input','input[data-col="origen"]','input[name*="origen"]','input[id*="origen"]']);
      const importe=findInRow(r, ['[data-col="importe"] input','input[data-col="importe"]','input[name*="importe"]','input[id*="importe"]','input[placeholder*="Importe"]']);

      rows.push({ producto, modo, cantidad, bruto, tara, neto, precio, origen, importe });
    }

    return { num, fecha, tags, obs, prov, cli, rows };
  }

  async function buildPdfBlob(data){
    await ensurePdfLibs();
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({ unit:'pt', format:'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 40;

    // HEADER
    doc.setFont('helvetica','bold');
    doc.setFontSize(18);
    doc.text('FACTURA', M, 44);
    doc.setDrawColor(0);
    doc.setLineWidth(1);
    doc.line(M, 54, W - M, 54);

    // META BOX (arriba derecha)
    const metaX = W - M - 210;
    const metaY = 22;
    doc.setLineWidth(0.7);
    doc.roundedRect(metaX, metaY, 210, 50, 10, 10);
    doc.setFontSize(10);
    doc.setFont('helvetica','normal');
    doc.text(`Nº: ${data.num}`, metaX + 12, metaY + 20);
    if (data.fecha) doc.text(`Fecha: ${data.fecha}`, metaX + 12, metaY + 36);

    // PROVEEDOR (izq)
    let y = 85;
    doc.setFont('helvetica','bold'); doc.text('Proveedor', M, y); y += 14;
    doc.setFont('helvetica','normal');
    const p = data.prov || {};
    [p.nombre, p.nif ? `NIF: ${p.nif}` : '', p.dir, p.tel ? `Tel: ${p.tel}` : '', p.email ? `Email: ${p.email}` : '']
      .filter(Boolean).forEach(t => { doc.text(t, M, y); y += 13; });

    // CLIENTE (der)
    let y2 = 85;
    const cx = W/2 + 10;
    doc.setFont('helvetica','bold'); doc.text('Cliente', cx, y2); y2 += 14;
    doc.setFont('helvetica','normal');
    const c = data.cli || {};
    [c.nombre, c.nif ? `NIF/CIF: ${c.nif}` : '', c.dir, c.tel ? `Tel: ${c.tel}` : '', c.email ? `Email: ${c.email}` : '']
      .filter(Boolean).forEach(t => { doc.text(t, cx, y2); y2 += 13; });

    // TAGS
    if ((data.tags || '').trim()){
      doc.setFont('helvetica','bold'); doc.text('Tags:', M, 165);
      doc.setFont('helvetica','normal'); doc.text((data.tags||'').trim(), M + 40, 165);
    }

    // TABLA
    const body = (data.rows && data.rows.length)
      ? data.rows.map(r => [
          r.producto || '', r.modo || '', r.cantidad || '', r.bruto || '',
          r.tara || '', r.neto || '', r.precio || '', r.origen || '', r.importe || ''
        ])
      : [['(Sin líneas detectadas en el grid)', '', '', '', '', '', '', '', '']];

    doc.autoTable({
      startY: 185,
      head: [[ 'Producto','Modo','Cant','Bruto','Tara','Neto','Precio','Origen','Importe' ]],
      body,
      margin: { left: M, right: M },
      styles: { font:'helvetica', fontSize:9, cellPadding:5 },
      headStyles: { fillColor:[0,0,0], textColor:[255,255,255] },
      alternateRowStyles: { fillColor:[245,245,245] },
      didDrawPage: () => {
        const page = doc.internal.getCurrentPageInfo().pageNumber;
        doc.setFontSize(9);
        doc.setFont('helvetica','normal');
        doc.text(`Página ${page}`, W - M, H - 18, { align:'right' });
      }
    });

    // TOTAL (desde importes)
    const sum = (data.rows || []).reduce((acc, r) => acc + parseNum(r.importe), 0);
    const after = doc.lastAutoTable.finalY + 16;

    doc.setFont('helvetica','bold');
    doc.text('TOTAL:', W - M - 140, after);
    doc.setFont('helvetica','normal');
    doc.text(eur(sum), W - M, after, { align:'right' });

    // OBS
    if ((data.obs || '').trim()){
      doc.setFont('helvetica','bold');
      doc.text('Observaciones', M, after + 28);
      doc.setFont('helvetica','normal');
      const lines = doc.splitTextToSize((data.obs||'').trim(), W - 2*M);
      doc.text(lines, M, after + 44);
    }

    return doc.output('blob');
  }

  async function uploadPdfToStorage(blob, numFactura){
    const u = auth.currentUser;
    if (!u) throw new Error('NO_AUTH');

    const safeNum = sanitize(numFactura);
    const path = `factumiral/${u.uid}/pdf/${safeNum}.pdf`;

    const r = sRef(storage, path);
    await uploadBytes(r, blob, { contentType:'application/pdf' });
    const url = await getDownloadURL(r);
    return { url, path, safeNum };
  }

  function openPdfModal(url){
    let modal = $('#fmPdfCloudModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'fmPdfCloudModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:12px;';
    modal.innerHTML = `
      <div style="width:min(980px,100%);height:min(92vh,100%);background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35);display:flex;flex-direction:column;">
        <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #eee;">
          <strong>PDF en la nube</strong>
          <button id="fmPdfCloudClose" style="padding:8px 10px;border:1px solid #ddd;background:#f5f5f5;border-radius:10px;cursor:pointer;">Cerrar</button>
        </div>
        <iframe id="fmPdfCloudFrame" style="flex:1;border:0;width:100%;"></iframe>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e)=>{ if (e.target === modal) modal.remove(); });
    $('#fmPdfCloudClose').addEventListener('click', ()=> modal.remove());
    $('#fmPdfCloudFrame').src = url;
  }

  function injectButton(){
    if ($('#btnPdfProCloud')) return;

    const host = document.querySelector('.topbar__right') || document.body;

    const b = document.createElement('button');
    b.id = 'btnPdfProCloud';
    b.type = 'button';
    b.className = 'fmBtnGreen';
    b.textContent = 'PDF PRO + CLOUD';
    b.title = 'Genera PDF profesional y lo sube a Firebase Storage';

    host.appendChild(b);

    b.addEventListener('click', async () => {
      try{
        if (!auth.currentUser){
          alert('Primero entra en Cloud (correo + contraseña) y luego pulsa este botón.');
          // Si tu botón cloud existe, lo abre
          $('#btnCloud')?.click();
          return;
        }

        b.disabled = true;
        b.textContent = 'Generando…';

        const data = readInvoiceFromDom();
        const blob = await buildPdfBlob(data);

        b.textContent = 'Subiendo…';
        const up = await uploadPdfToStorage(blob, data.num);

        b.textContent = '✅ Subido';
        setTimeout(()=>{ b.textContent = 'PDF PRO + CLOUD'; b.disabled = false; }, 900);

        openPdfModal(up.url);
        log('OK', up);

      } catch (e){
        console.error(e);
        b.disabled = false;
        b.textContent = 'PDF PRO + CLOUD';
        alert('❌ Error: ' + (e?.code || e?.message || e));
      }
    });

    log('Botón creado ✅');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton, { once:true });
  } else {
    injectButton();
  }

  log('Patch cargado ✅');
})();
