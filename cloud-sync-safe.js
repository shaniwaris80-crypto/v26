/* =========================================================
   PATCH: cloud-sync-safe.js  (NO toca app.js)
   - Botones: Subir local→nube (merge sin duplicar), Bajar nube→local
   - Anti-borrado: un dispositivo vacío NO puede borrar la nube
   - AutoSync seguro (opcional): push + pull sin recargar
========================================================= */
(() => {
  'use strict';
  if (window.__FM_CLOUD_SYNC_SAFE__) return;
  window.__FM_CLOUD_SYNC_SAFE__ = true;

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // ---------- Device ID estable ----------
  const DEVKEY = 'fm_device_id';
  const deviceId = (() => {
    let v = localStorage.getItem(DEVKEY);
    if (!v) { v = 'dev_' + Math.random().toString(16).slice(2) + '_' + Date.now(); localStorage.setItem(DEVKEY, v); }
    return v;
  })();

  // ---------- Firebase config: leer de tus inputs de Ajustes ----------
  function readFbConfigFromUI(){
    const apiKey = $('#fbApiKey')?.value?.trim();
    const authDomain = $('#fbAuthDomain')?.value?.trim();
    const databaseURL = $('#fbDbUrl')?.value?.trim();
    const projectId = $('#fbProjectId')?.value?.trim();
    const appId = $('#fbAppId')?.value?.trim();
    const storageBucket = $('#fbStorage')?.value?.trim();

    // Si no está en UI, intenta de window.FM_FIREBASE_CONFIG (por si lo defines)
    const w = window.FM_FIREBASE_CONFIG || null;

    const cfg = {
      apiKey: apiKey || w?.apiKey,
      authDomain: authDomain || w?.authDomain,
      databaseURL: databaseURL || w?.databaseURL,
      projectId: projectId || w?.projectId,
      appId: appId || w?.appId,
      storageBucket: storageBucket || w?.storageBucket,
      messagingSenderId: w?.messagingSenderId,
      measurementId: w?.measurementId,
    };

    // Realtime necesita databaseURL sí o sí
    if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId || !cfg.databaseURL){
      throw new Error('Falta config Firebase en Ajustes (apiKey/authDomain/databaseURL/projectId/appId).');
    }
    // Normaliza slash final
    cfg.databaseURL = cfg.databaseURL.replace(/\/+$/,'');
    return cfg;
  }

  // ---------- UI mini badge ----------
  function badge(text, color='#111'){
    let b = $('#fmCloudSafeBadge');
    if(!b){
      b = document.createElement('div');
      b.id = 'fmCloudSafeBadge';
      b.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:999999;padding:8px 10px;border-radius:12px;font:12px/1.2 system-ui;color:#fff;opacity:.92;max-width:92vw;';
      document.body.appendChild(b);
    }
    b.style.background = color;
    b.textContent = text;
  }

  // ---------- Helpers normalización ----------
  const norm = (s) => (s ?? '').toString().trim().toUpperCase();
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

  function asArray(col){
    if (!col) return [];
    if (Array.isArray(col)) return col.filter(Boolean);
    if (isObj(col)) return Object.values(col).filter(Boolean);
    return [];
  }

  // Hash simple FNV-1a
  function fnv1a(str){
    let h = 2166136261;
    for (let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  // ---------- Detecta keys en localStorage ----------
  function findLSKeyAny(words){
    const keys = Object.keys(localStorage);
    const low = words.map(w => w.toLowerCase());
    return keys.find(k => low.some(w => k.toLowerCase().includes(w))) || null;
  }

  function getLocalPack(){
    // Intenta detectar nombres típicos
    const kProvider  = findLSKeyAny(['provider','proveedor','prov']);
    const kSettings  = findLSKeyAny(['settings','ajustes']);
    const kClientes  = findLSKeyAny(['clientes','client']);
    const kProductos = findLSKeyAny(['productos','product']);
    const kTaras     = findLSKeyAny(['taras','envase','envases']);
    const kFacturas  = findLSKeyAny(['facturas','factura']);
    const kVentas    = findLSKeyAny(['ventas','venta']);
    const kPricehist = findLSKeyAny(['pricehist','hist','precios','ultimos']);

    function read(k, fallback){
      if(!k) return fallback;
      try { return JSON.parse(localStorage.getItem(k) || '') ?? fallback; }
      catch { return fallback; }
    }

    return {
      __keys: { kProvider, kSettings, kClientes, kProductos, kTaras, kFacturas, kVentas, kPricehist },
      provider:  read(kProvider,  {}),
      settings:  read(kSettings,  {}),
      clientes:  read(kClientes,  []),
      productos: read(kProductos, []),
      taras:     read(kTaras,     []),
      facturas:  read(kFacturas,  []),
      ventas:    read(kVentas,    []),
      pricehist: read(kPricehist, []),
      meta:      { deviceId, pulledAt: 0, pushedAt: 0, rev: Number(localStorage.getItem('fm_cloud_rev')||'0') }
    };
  }

  function saveLocalPack(pack){
    const K = pack.__keys || {};
    function write(k, v){ if(k) localStorage.setItem(k, JSON.stringify(v)); }

    write(K.kProvider,  pack.provider  ?? {});
    write(K.kSettings,  pack.settings  ?? {});
    write(K.kClientes,  pack.clientes  ?? []);
    write(K.kProductos, pack.productos ?? []);
    write(K.kTaras,     pack.taras     ?? []);
    write(K.kFacturas,  pack.facturas  ?? []);
    write(K.kVentas,    pack.ventas    ?? []);
    write(K.kPricehist, pack.pricehist ?? []);

    if (pack?.meta?.rev != null) localStorage.setItem('fm_cloud_rev', String(pack.meta.rev));
  }

  // ---------- Dedup keys ----------
  function keyCliente(c){
    const nif = norm(c?.nif || c?.cif || c?.NIF || c?.CIF || '');
    if (nif) return 'NIF:' + nif;
    const name = norm(c?.nombre || c?.name || '');
    const dir = norm(c?.dir || c?.direccion || '');
    return 'CLI:' + fnv1a(name + '|' + dir);
  }

  function keyProducto(p){
    const name = norm(p?.nombre || p?.name || '');
    return name ? 'PROD:' + name : 'PROD:' + fnv1a(JSON.stringify(p||{}));
  }

  function keyTara(t){
    const name = norm(t?.nombre || t?.name || '');
    const peso = (t?.peso ?? t?.tara ?? t?.kg ?? t?.pesoKg ?? '').toString().trim();
    return 'TARA:' + fnv1a(name + '|' + peso);
  }

  function facturaFingerprint(f){
    const num = (f?.numFactura || f?.numero || f?.num || '').toString().trim();
    const fecha = (f?.fecha || f?.date || f?.facFecha || '').toString().trim();
    const total = (f?.total || f?.importeTotal || f?.tTotal || '').toString().trim();
    const cli = (f?.cliente?.nif || f?.cliNif || f?.clienteNif || f?.cliente || '').toString().trim();
    const lines = JSON.stringify(f?.lineas || f?.items || f?.rows || []);
    return fnv1a([num, fecha, total, cli, lines].join('|'));
  }

  function keyFactura(f){
    const num = (f?.numFactura || f?.numero || f?.num || '').toString().trim();
    if (num) return 'FAC:' + num;
    return 'FAC:' + facturaFingerprint(f);
  }

  function updatedAtOf(x){
    const v = x?.updatedAt ?? x?._updatedAt ?? x?.ts ?? x?.timestamp ?? x?.modifiedAt;
    const n = Number(v || 0);
    return Number.isFinite(n) ? n : 0;
  }

  // Merge seguro: nunca borra, nunca pisa con vacío
  function mergeObjectNoEmpty(base, incoming){
    const out = {...(base||{})};
    const src = incoming || {};
    for (const k of Object.keys(src)){
      const v = src[k];
      if (v === null || v === undefined) continue;
      if (typeof v === 'string' && v.trim() === '') continue;
      out[k] = v;
    }
    return out;
  }

  function mergeArrayByKey(localArr, cloudArr, keyFn, kind){
    const L = asArray(localArr);
    const C = asArray(cloudArr);

    const map = new Map();

    // mete cloud primero
    for (const it of C){
      const k = keyFn(it);
      if (!k) continue;
      map.set(k, it);
    }

    // añade/actualiza local
    for (const it of L){
      const k = keyFn(it);
      if (!k) continue;

      if (kind === 'facturas'){
        // dedupe por huella: si ya existe misma huella, ignora
        const existing = map.get(k);
        if (existing){
          const h1 = existing.__fp || facturaFingerprint(existing);
          const h2 = it.__fp || facturaFingerprint(it);
          existing.__fp = h1;
          it.__fp = h2;

          if (h1 === h2){
            // mismo contenido -> elige el más nuevo
            if (updatedAtOf(it) > updatedAtOf(existing)) map.set(k, it);
            continue;
          }
          // MISMO NÚMERO pero contenido distinto -> NO machacamos.
          // Guardamos ambos creando clave alternativa interna (para no perder datos)
          const alt = k + '__ALT__' + h2.slice(0,8);
          map.set(alt, it);
          continue;
        }
      }

      if (!map.has(k)){
        map.set(k, it);
      } else {
        const prev = map.get(k);
        // elige el más nuevo; si no hay timestamps, gana cloud (más estable)
        const a = updatedAtOf(prev);
        const b = updatedAtOf(it);
        if (b > a) map.set(k, it);
      }
    }

    // output array
    return Array.from(map.values());
  }

  function mergePack(localPack, cloudPack){
    const out = {...(cloudPack||{})};

    // provider/settings: merge sin vacío
    out.provider  = mergeObjectNoEmpty(out.provider, localPack.provider);
    out.settings  = mergeObjectNoEmpty(out.settings, localPack.settings);

    out.clientes  = mergeArrayByKey(localPack.clientes,  out.clientes,  keyCliente, 'clientes');
    out.productos = mergeArrayByKey(localPack.productos, out.productos, keyProducto,'productos');
    out.taras     = mergeArrayByKey(localPack.taras,     out.taras,     keyTara,    'taras');
    out.facturas  = mergeArrayByKey(localPack.facturas,  out.facturas,  keyFactura, 'facturas');
    out.ventas    = mergeArrayByKey(localPack.ventas,    out.ventas,    (v)=>'VEN:'+(v?.fecha||v?.date||fnv1a(JSON.stringify(v))), 'ventas');
    out.pricehist = mergeArrayByKey(localPack.pricehist, out.pricehist, (h)=>'PH:'+(h?.id||fnv1a(JSON.stringify(h))), 'pricehist');

    out.meta = mergeObjectNoEmpty(out.meta, cloudPack?.meta);
    out.meta = mergeObjectNoEmpty(out.meta, {
      updatedAt: Date.now(),
      updatedBy: deviceId,
      schema: 'factumiral_pack_v1'
    });

    return out;
  }

  // ---------- Firebase (imports dinámicos) ----------
  let FB = null;
  async function getFirebase(){
    if (FB) return FB;

    const cfg = readFbConfigFromUI();

    const [appMod, authMod, dbMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js'),
    ]);

    const { initializeApp, getApps, getApp } = appMod;
    const { getAuth, signInWithEmailAndPassword, onAuthStateChanged } = authMod;
    const { getDatabase, ref, get, set, onValue } = dbMod;

    const app = getApps().length ? getApp() : initializeApp(cfg);
    const auth = getAuth(app);
    const db   = getDatabase(app, cfg.databaseURL);

    FB = { cfg, auth, db, ref, get, set, onValue, signInWithEmailAndPassword, onAuthStateChanged };
    return FB;
  }

  async function ensureLogin(){
    const { auth, signInWithEmailAndPassword } = await getFirebase();
    if (auth.currentUser) return auth.currentUser;

    // intenta abrir modal cloud si existe
    $('#btnCloud')?.click();

    const email = prompt('Email Firebase (Cloud):');
    const pass  = prompt('Contraseña:');
    if (!email || !pass) throw new Error('Login cancelado');
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    return cred.user;
  }

  // Detecta ruta correcta según tu DB actual
  async function resolveDataPath(uid){
    const { db, ref, get } = await getFirebase();
    const base = ref(db, `factumiral/${uid}`);
    const snap = await get(base);
    const val = snap.exists() ? snap.val() : null;

    // Si ya tienes kv/ls, usamos kv primero
    if (val && typeof val === 'object'){
      if (val.kv) return `factumiral/${uid}/kv`;
      if (val.ls) return `factumiral/${uid}/ls`;
    }
    // fallback
    return `factumiral/${uid}/kv`;
  }

  // Lee pack nube
  async function readCloudPack(uid){
    const { db, ref, get } = await getFirebase();
    const path = await resolveDataPath(uid);
    const snap = await get(ref(db, path));
    const pack = snap.exists() ? snap.val() : null;

    return { path, pack: pack || { provider:{}, settings:{}, clientes:[], productos:[], taras:[], facturas:[], ventas:[], pricehist:[], meta:{} } };
  }

  // Escribe pack nube
  async function writeCloudPack(path, pack){
    const { db, ref, set } = await getFirebase();
    await set(ref(db, path), pack);
  }

  // Guardas “rev” para evitar bucles
  function bumpLocalRev(){
    const rev = Number(localStorage.getItem('fm_cloud_rev')||'0') + 1;
    localStorage.setItem('fm_cloud_rev', String(rev));
    return rev;
  }

  // ---------- Botones UI ----------
  function mountButtons(){
    const syncBtn = $('#btnCloudSync');
    const host = syncBtn?.closest('.rowActions') || $('#tabAjustes .rowActions') || document.body;
    if (!host || $('#fmBtnMigrate')) return;

    const b1 = document.createElement('button');
    b1.id = 'fmBtnMigrate';
    b1.className = 'btn btn--primary';
    b1.type = 'button';
    b1.textContent = '⬆️ Subir LOCAL → NUBE (merge)';

    const b2 = document.createElement('button');
    b2.id = 'fmBtnPull';
    b2.className = 'btn';
    b2.type = 'button';
    b2.textContent = '⬇️ Bajar NUBE → ESTE dispositivo';

    const b3 = document.createElement('button');
    b3.id = 'fmBtnAuto';
    b3.className = 'btn btn--ghost';
    b3.type = 'button';
    b3.textContent = 'AutoSync: OFF';

    host.appendChild(b1);
    host.appendChild(b2);
    host.appendChild(b3);

    const setAutoLabel = () => {
      const on = localStorage.getItem('fm_autosync') === '1';
      b3.textContent = 'AutoSync: ' + (on ? 'ON' : 'OFF');
    };
    setAutoLabel();

    b1.addEventListener('click', migrateLocalToCloud);
    b2.addEventListener('click', pullCloudToLocal);
    b3.addEventListener('click', () => {
      const on = localStorage.getItem('fm_autosync') === '1';
      localStorage.setItem('fm_autosync', on ? '0' : '1');
      setAutoLabel();
      if (!on) startRealtimePull(); // al activar, empieza pull
    });
  }

  // ---------- Acciones principales ----------
  async function migrateLocalToCloud(){
    try{
      badge('🟡 Preparando merge…', '#a80');

      const user = await ensureLogin();
      const local = getLocalPack();
      const { path, pack: cloud } = await readCloudPack(user.uid);

      // Anti-borrado: si local está vacío y cloud tiene datos -> NO subimos
      const lc = asArray(local.facturas).length + asArray(local.clientes).length + asArray(local.productos).length + asArray(local.taras).length;
      const cc = asArray(cloud.facturas).length + asArray(cloud.clientes).length + asArray(cloud.productos).length + asArray(cloud.taras).length;

      if (lc === 0 && cc > 0){
        badge('🔴 Local vacío: NO subo para no borrar la nube. Usa “Bajar NUBE → este dispositivo”.', '#b00');
        alert('Local está vacío y Cloud tiene datos. Para evitar borrar la nube, NO se sube.\nPulsa “Bajar NUBE → este dispositivo”.');
        return;
      }

      // Merge seguro
      const merged = mergePack(local, cloud);
      merged.meta = merged.meta || {};
      merged.meta.rev = bumpLocalRev();
      merged.meta.pushedAt = Date.now();
      merged.meta.pushedBy = deviceId;

      await writeCloudPack(path, merged);

      // Guarda también local para eliminar duplicados después del merge
      local.meta.rev = merged.meta.rev;
      saveLocalPack({...local, ...merged, __keys: local.__keys });

      badge(`✅ Subido a nube (merge OK). Facturas:${merged.facturas?.length||0}`, '#0a7');

      // refresco suave UI: click a botones “Actualizar” si existen
      $('#btnFacturasRefresh')?.click();
      $('#btnClientesRefresh')?.click?.();
    }catch(e){
      console.error(e);
      badge('🔴 Error: ' + (e?.message || e), '#b00');
      alert('Error: ' + (e?.message || e));
    }
  }

  async function pullCloudToLocal(){
    try{
      badge('🟡 Bajando nube…', '#a80');
      const user = await ensureLogin();
      const local = getLocalPack();
      const { pack: cloud } = await readCloudPack(user.uid);

      const merged = mergePack(local, cloud);
      merged.meta = merged.meta || {};
      merged.meta.pulledAt = Date.now();
      merged.meta.pulledBy = deviceId;

      // No borres local si nube está vacía
      const cc = asArray(cloud.facturas).length + asArray(cloud.clientes).length + asArray(cloud.productos).length + asArray(cloud.taras).length;
      if (cc === 0){
        badge('🟠 Cloud vacío: no borro nada local.', '#a80');
        alert('Cloud está vacío (o sin datos). No se borró nada local.');
        return;
      }

      saveLocalPack({ ...local, ...merged, __keys: local.__keys });

      // guarda rev local si viene
      if (merged.meta?.rev != null) localStorage.setItem('fm_cloud_rev', String(merged.meta.rev));

      badge(`✅ Bajado (merge OK). Facturas:${merged.facturas?.length||0}`, '#0a7');
      $('#btnFacturasRefresh')?.click();
    }catch(e){
      console.error(e);
      badge('🔴 Error: ' + (e?.message || e), '#b00');
      alert('Error: ' + (e?.message || e));
    }
  }

  // ---------- AutoSync (push) con debounce ----------
  let syncing = false;
  let pending = false;
  let tmr = null;

  async function autoPushDebounced(){
    if (localStorage.getItem('fm_autosync') !== '1') return;
    if (tmr) clearTimeout(tmr);
    tmr = setTimeout(async () => {
      if (syncing) { pending = true; return; }
      syncing = true;
      try{
        const user = await ensureLogin();
        const local = getLocalPack();
        const { path, pack: cloud } = await readCloudPack(user.uid);

        // anti-borrado
        const lc = asArray(local.facturas).length + asArray(local.clientes).length + asArray(local.productos).length + asArray(local.taras).length;
        const cc = asArray(cloud.facturas).length + asArray(cloud.clientes).length + asArray(cloud.productos).length + asArray(cloud.taras).length;
        if (lc === 0 && cc > 0) return;

        const merged = mergePack(local, cloud);
        merged.meta = merged.meta || {};
        merged.meta.rev = bumpLocalRev();
        merged.meta.pushedAt = Date.now();
        merged.meta.pushedBy = deviceId;

        await writeCloudPack(path, merged);

        // actualiza local rev
        saveLocalPack({ ...local, ...merged, __keys: local.__keys });
        badge('🟢 AutoSync OK', '#0a7');
      }catch(e){
        console.warn(e);
        badge('🟠 AutoSync error', '#a80');
      }finally{
        syncing = false;
        if (pending){ pending = false; autoPushDebounced(); }
      }
    }, 1200);
  }

  // hook a localStorage.setItem para detectar cambios (sin romper app)
  const _setItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(k, v){
    const r = _setItem(k, v);
    const lk = String(k||'').toLowerCase();
    if (lk.includes('factura') || lk.includes('cliente') || lk.includes('producto') || lk.includes('tara') || lk.includes('venta') || lk.includes('ajuste') || lk.includes('setting')){
      // no molestamos mientras escribe: si hay input enfocado, espera
      const ae = document.activeElement;
      const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
      if (typing) setTimeout(autoPushDebounced, 900);
      else autoPushDebounced();
    }
    return r;
  };

  // ---------- AutoPull realtime (descarga cambios de otros) ----------
  let pullStarted = false;
  function startRealtimePull(){
    if (pullStarted) return;
    pullStarted = true;

    (async () => {
      try{
        const user = await ensureLogin();
        const { db, ref, onValue } = await getFirebase();
        const path = await resolveDataPath(user.uid);

        onValue(ref(db, path), (snap) => {
          if (!snap.exists()) return;
          if (localStorage.getItem('fm_autosync') !== '1') return;

          const cloud = snap.val() || {};
          const cloudRev = Number(cloud?.meta?.rev || 0);
          const localRev = Number(localStorage.getItem('fm_cloud_rev')||'0');

          // si no hay cambios nuevos, nada
          if (cloudRev && cloudRev <= localRev) return;

          // no interrumpir si está escribiendo
          const ae = document.activeElement;
          const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
          if (typing) return;

          const local = getLocalPack();
          const merged = mergePack(local, cloud);

          saveLocalPack({ ...local, ...merged, __keys: local.__keys });
          if (cloudRev) localStorage.setItem('fm_cloud_rev', String(cloudRev));

          badge('🔵 Cambios recibidos de otro dispositivo', '#2563eb');
          // refresco suave
          $('#btnFacturasRefresh')?.click();
        });

        badge('✅ Realtime Pull listo (AutoSync ON)', '#111');
      }catch(e){
        console.warn(e);
      }
    })();
  }

  // ---------- Init ----------
  function init(){
    mountButtons();
    if (localStorage.getItem('fm_autosync') === '1') startRealtimePull();
  }

  document.addEventListener('DOMContentLoaded', init);
  // fallback por si Ajustes carga tarde
  setTimeout(init, 1200);

})();
