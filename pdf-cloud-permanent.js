(() => {
  'use strict';
  if (window.__FM_PDF_CLOUD_PERMANENT__) return;
  window.__FM_PDF_CLOUD_PERMANENT__ = true;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const onReady = (fn) => (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', fn)
    : fn();

  // ===== UI Badge (semaforo simple) =====
  function badge(text, bg = '#111') {
    let b = $('#fmPdfCloudBadge');
    if (!b) {
      b = document.createElement('div');
      b.id = 'fmPdfCloudBadge';
      b.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:999999;padding:8px 10px;border-radius:10px;font:12px/1.2 system-ui;color:#fff;opacity:.92;max-width:92vw;pointer-events:none';
      document.body.appendChild(b);
    }
    b.style.background = bg;
    b.textContent = text;
  }

  // ===== Firebase Config: default > inputs Ajustes > hardcoded =====
  function getFirebaseConfig() {
    // 1) si tienes patches/firebase-default-config.js
    if (window.FM_FIREBASE_DEFAULT_CONFIG && typeof window.FM_FIREBASE_DEFAULT_CONFIG === 'object') {
      return window.FM_FIREBASE_DEFAULT_CONFIG;
    }

    // 2) si está en Ajustes (inputs)
    const apiKey = ($('#fbApiKey')?.value || '').trim();
    const authDomain = ($('#fbAuthDomain')?.value || '').trim();
    const databaseURL = ($('#fbDbUrl')?.value || '').trim();
    const projectId = ($('#fbProjectId')?.value || '').trim();
    const appId = ($('#fbAppId')?.value || '').trim();
    const storageBucket = ($('#fbStorage')?.value || '').trim();

    if (apiKey && authDomain && databaseURL && projectId && appId && storageBucket) {
      return { apiKey, authDomain, databaseURL, projectId, appId, storageBucket };
    }

    // 3) fallback (tuya)
    return {
      apiKey: "AIzaSyDgBBnuISNIaQF2hluowQESzVaE-pEiUsY",
      authDomain: "factumiral.firebaseapp.com",
      projectId: "factumiral",
      storageBucket: "factumiral.firebasestorage.app",
      messagingSenderId: "576821038417",
      appId: "1:576821038417:web:aba329f36563134bb01770",
      measurementId: "G-HJVL8ET49L",
      databaseURL: "https://factumiral-default-rtdb.europe-west1.firebasedatabase.app"
    };
  }

  // ===== Firebase modular (import dinámico) =====
  let FB = null;
  async function getFB() {
    if (FB) return FB;

    const cfg = getFirebaseConfig();

    const [appMod, authMod, storageMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js")
    ]);

    const { initializeApp, getApps, getApp } = appMod;
    const { getAuth, signInWithEmailAndPassword } = authMod;
    const { getStorage, ref: sRef, uploadBytes, getDownloadURL } = storageMod;

    const app = getApps().length ? getApp() : initializeApp(cfg);
    const auth = getAuth(app);
    const storage = getStorage(app);

    FB = { cfg, auth, storage, signInWithEmailAndPassword, sRef, uploadBytes, getDownloadURL };
    return FB;
  }

  async function ensureLogin() {
    const { auth, signInWithEmailAndPassword } = await getFB();
    if (auth.currentUser) return auth.currentUser;

    // intenta abrir tu modal Cloud si existe
    $('#btnCloud')?.click();

    // intenta leer inputs si existen
    const emailGuess = ($('#fmCloudEmail')?.value || $('#fmEmail')?.value || '').trim();
    const passGuess  = ($('#fmCloudPass')?.value || $('#fmPass')?.value || '').trim();

    const email = emailGuess || prompt('Email Firebase (Cloud):');
    const pass  = passGuess  || prompt('Contraseña Firebase:');
    if (!email || !pass) throw new Error('Login cancelado');

    const cred = await signInWithEmailAndPassword(auth, email, pass);
    return cred.user;
  }

  const sanitize = (s) => (s || `FA-${Date.now()}`)
    .toString()
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 90);

  function getFacturaNum() {
    // en tu HTML existe facNumero + facNumeroLabel
    const v = ($('#facNumero')?.value || '').trim();
    if (v) return v;
    const t = ($('#facNumeroLabel')?.textContent || '').trim();
    return t || `FA-${Date.now()}`;
  }

  // ===== LocalStorage: localizar facturas y guardar pdfUrl =====
  function findFacturasKey() {
    // si tu app expone LS.facturas (a veces)
    try {
      if (window.LS && typeof window.LS === 'object') {
        for (const k of Object.values(window.LS)) {
          if (typeof k === 'string' && k.toLowerCase().includes('facturas')) return k;
        }
      }
    } catch {}

    const keys = Object.keys(localStorage);
    // preferimos claves tipo ...facturas...
    const cand = keys.filter(k => k.toLowerCase().includes('facturas'));
    return cand[0] || null;
  }

  function loadJSON(k, fallback) {
    try { return JSON.parse(localStorage.getItem(k) || ''); } catch { return fallback; }
  }
  function saveJSON(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
  }

  function findFacturaInStore(store, num) {
    const norm = String(num).trim();
    const matchNum = (f) => {
      const n = (f?.numFactura ?? f?.numero ?? f?.num ?? f?.n ?? f?.id ?? '').toString().trim();
      return n === norm;
    };

    // array
    if (Array.isArray(store)) {
      const idx = store.findIndex(matchNum);
      return idx >= 0 ? { kind: 'array', idx, ref: store[idx] } : null;
    }

    // object map
    if (store && typeof store === 'object') {
      // if {items:[...]}
      if (Array.isArray(store.items)) {
        const idx = store.items.findIndex(matchNum);
        return idx >= 0 ? { kind: 'items', idx, ref: store.items[idx] } : null;
      }
      // scan values
      for (const [k, v] of Object.entries(store)) {
        if (v && typeof v === 'object' && matchNum(v)) return { kind: 'map', key: k, ref: v };
      }
    }
    return null;
  }

  function setPdfUrlOnFactura(num, url, path) {
    const k = findFacturasKey();
    if (!k) return false;

    const store = loadJSON(k, null);
    if (!store) return false;

    const hit = findFacturaInStore(store, num);
    if (!hit) return false;

    // muta la ref
    hit.ref.pdfUrl = url;
    hit.ref.pdfCloudPath = path;
    hit.ref.pdfUpdatedAt = Date.now();

    saveJSON(k, store);
    return true;
  }

  // ===== Visor PDF interno =====
  function openPdfViewer(url) {
    const modal = $('#pdfModal');
    if (modal) {
      modal.classList.remove('is-hidden');
      const obj = $('#pdfObject');
      const fr  = $('#pdfFrame');
      if (obj) obj.setAttribute('data', url);
      if (fr)  fr.setAttribute('src', url);

      // botón cerrar si existe
      $('#btnPdfCerrar')?.addEventListener('click', () => modal.classList.add('is-hidden'), { once: true });
      modal.querySelector('[data-close="pdf"]')?.addEventListener('click', () => modal.classList.add('is-hidden'), { once: true });
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  // ===== Captura de PDF Blob (solo cuando está ARMED) =====
  let ARMED = false;
  let CAPTURED = null;

  async function isPdfBlob(blob) {
    try {
      if (!(blob instanceof Blob)) return false;
      const head = await blob.slice(0, 5).arrayBuffer();
      const sig = String.fromCharCode(...new Uint8Array(head));
      return sig === '%PDF-';
    } catch { return false; }
  }

  async function capture(blob, source) {
    if (!ARMED) return;
    if (!(blob instanceof Blob)) return;
    if (await isPdfBlob(blob)) {
      CAPTURED = blob;
      window.__fm_last_pdf_blob = blob;
      console.log('✅ PDF capturado:', source, blob);
      badge(`✅ PDF capturado (${source})`, '#0a7');
    }
  }

  // Hook URL.createObjectURL
  const _create = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    try { if (ARMED) capture(obj, 'URL.createObjectURL'); } catch {}
    return _create.call(URL, obj);
  };

  // Hook saveAs si existe
  if (window.saveAs && !window.saveAs.__fmWrapped) {
    const _saveAs = window.saveAs;
    window.saveAs = function (blob, name, opts) {
      try { if (ARMED) capture(blob, 'saveAs'); } catch {}
      return _saveAs.call(this, blob, name, opts);
    };
    window.saveAs.__fmWrapped = true;
  }

  // Hook jsPDF si existe
  function hookJsPdf() {
    try {
      const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
      if (!jsPDF || jsPDF.__fmWrapped) return;

      const proto = jsPDF.prototype;
      if (proto.output && !proto.output.__fmWrapped) {
        const _out = proto.output;
        proto.output = function (type) {
          const out = _out.apply(this, arguments);
          try {
            if (ARMED) {
              if (type === 'blob' && out) capture(out, 'jsPDF.output(blob)');
              if (type === 'arraybuffer' && out instanceof ArrayBuffer) {
                capture(new Blob([out], { type: 'application/pdf' }), 'jsPDF.output(arraybuffer)');
              }
            }
          } catch {}
          return out;
        };
        proto.output.__fmWrapped = true;
      }

      if (proto.save && !proto.save.__fmWrapped) {
        const _save = proto.save;
        proto.save = function () {
          try { if (ARMED) { try { capture(this.output('blob'), 'jsPDF.save->blob'); } catch {} } } catch {}
          return _save.apply(this, arguments);
        };
        proto.save.__fmWrapped = true;
      }

      jsPDF.__fmWrapped = true;
    } catch {}
  }

  // intenta varias veces por si jsPDF carga tarde
  (async () => { for (let i = 0; i < 40; i++) { hookJsPdf(); await sleep(200); } })();

  // ===== Generar + capturar =====
  function findGeneratePdfBtn() {
    // tu botón existe con id btnPdf
    if ($('#btnPdf')) return $('#btnPdf');
    // fallback por texto
    const els = $$('button, a');
    return els.find(el => (el.textContent || '').toLowerCase().includes('generar pdf')) || null;
  }

  async function generateAndCapturePdf() {
    CAPTURED = null;
    ARMED = true;
    badge('🟡 Armado: generando/capturando PDF…', '#a80');

    const b = findGeneratePdfBtn();
    if (b) b.click();
    else alert('Pulsa tu botón "Generar PDF" ahora. Yo lo capturo.');

    const end = Date.now() + 12000;
    while (Date.now() < end && !CAPTURED) await sleep(150);

    ARMED = false;
    return CAPTURED;
  }

  async function uploadPdfBlob(blob, facturaNum) {
    const { auth, storage, sRef, uploadBytes, getDownloadURL } = await getFB();
    const user = await ensureLogin();

    const safe = sanitize(facturaNum);
    // no machacar: añadimos timestamp
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = `factumiral/${user.uid}/pdf/${safe}__${stamp}.pdf`;

    const r = sRef(storage, path);
    await uploadBytes(r, blob, { contentType: 'application/pdf' });
    const url = await getDownloadURL(r);
    return { url, path };
  }

  // API pública para otros parches
  window.fmPdfCloud = {
    openPdfViewer,
    async uploadCurrentInvoicePdf() {
      const num = getFacturaNum();

      // si ya tiene pdfUrl, no duplicar (abre y listo)
      try {
        const k = findFacturasKey();
        if (k) {
          const store = loadJSON(k, null);
          const hit = store ? findFacturaInStore(store, num) : null;
          const existing = hit?.ref?.pdfUrl;
          if (existing) {
            const ok = confirm('Esta factura ya tiene PDF en Cloud.\n¿Quieres abrirlo? (Cancelar = no hacer nada)');
            if (ok) openPdfViewer(existing);
            return { skipped: true, url: existing };
          }
        }
      } catch {}

      const blob = await generateAndCapturePdf();
      if (!blob) {
        badge('🔴 No capturé PDF. Revisa consola si hay error en tu generador.', '#b00');
        throw new Error('No detecté PDF para subir');
      }

      badge('⬆️ Subiendo a Firebase Storage…', '#05a');
      const up = await uploadPdfBlob(blob, num);

      // guardar url dentro de la factura (local)
      const ok = setPdfUrlOnFactura(num, up.url, up.path);
      console.log('pdfUrl guardado en local:', ok, up);

      badge('✅ PDF subido a Cloud', '#0a7');
      openPdfViewer(up.url);
      return up;
    }
  };

  // ===== Montar botón verde y conectar btnPdfNube =====
  function mount() {
    const host = document.querySelector('.topbar__right') || document.querySelector('.panel__actions') || document.body;

    // Botón verde (si ya existe, no duplicar)
    if (!$('#fmBtnPdfCloudGreen')) {
      const b = document.createElement('button');
      b.id = 'fmBtnPdfCloudGreen';
      b.type = 'button';
      b.textContent = 'PDF CLOUD';
      b.title = 'Genera y sube el PDF a Firebase Storage';
      b.style.cssText = 'background:#26d06a;color:#000;border:1px solid rgba(0,0,0,.25);padding:10px 12px;border-radius:12px;font-weight:900;cursor:pointer;white-space:nowrap;margin-left:8px;';
      host.appendChild(b);

      b.addEventListener('click', async () => {
        try {
          b.disabled = true;
          await window.fmPdfCloud.uploadCurrentInvoicePdf();
        } catch (e) {
          console.error(e);
          alert('❌ PDF Cloud: ' + (e?.message || e));
        } finally {
          b.disabled = false;
        }
      });
    }

    // Si existe tu botón PDF + Nube original, lo conectamos a lo mismo
    const btnPdfNube = $('#btnPdfNube');
    if (btnPdfNube && !btnPdfNube.__fmHooked) {
      btnPdfNube.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { await window.fmPdfCloud.uploadCurrentInvoicePdf(); }
        catch (err) { console.error(err); alert('❌ PDF+Nube: ' + (err?.message || err)); }
      }, true);
      btnPdfNube.__fmHooked = true;
    }

    badge('✅ PDF Cloud listo', '#111');
  }

  onReady(() => {
    mount();
    // por si tu app re-renderiza botones después, reintenta un poco
    (async () => { for (let i = 0; i < 30; i++) { mount(); await sleep(500); } })();
  });

})();
