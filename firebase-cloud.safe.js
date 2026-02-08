import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, get, update, onChildAdded, onChildChanged, off } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

(() => {
  'use strict';

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

  const $ = (s, r=document) => r.querySelector(s);
  const now = () => Date.now();

  const LS_META = 'fm_cloud_meta';
  const LS_EMAIL = 'fm_cloud_email';
  const LS_DEVICE = 'fm_cloud_device';

  const EXCLUDE_PREFIX = ['firebase:', 'goog:', 'grm_', 'debug_', 'cache', 'session', 'fm_cloud_'];
  const isExcluded = (k) => k === LS_META || k === LS_EMAIL || k === LS_DEVICE || EXCLUDE_PREFIX.some(p => k.startsWith(p));

  const b64url = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

  const safeParse = (raw) => { try { return JSON.parse(raw); } catch { return null; } };
  const safeStringify = (obj) => { try { return JSON.stringify(obj); } catch { return ''; } };

  let meta = {};
  try { meta = JSON.parse(localStorage.getItem(LS_META) || '{}') || {}; } catch { meta = {}; }
  const saveMeta = () => localStorage.setItem(LS_META, JSON.stringify(meta));

  let deviceId = localStorage.getItem(LS_DEVICE);
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(16).slice(2) + '_' + now().toString(16);
    localStorage.setItem(LS_DEVICE, deviceId);
  }

  // ---- Firebase init
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getDatabase(app);

  let uid = null;
  let kvRef = null;
  let listenersOn = false;
  let applyingRemote = false;
  let firstPullDone = false;

  const root = (_uid) => `factumiral/${_uid}`;
  const kvPath = (_uid) => `${root(_uid)}/kv`;
  const metaPath = (_uid) => `${root(_uid)}/meta`;

  // ---- UI minimal (usa tu #btnCloud)
  function ensureCloudUI(){
    if ($('#fmCloudModal')) return;

    const modal = document.createElement('div');
    modal.id = 'fmCloudModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:999999;display:none;background:rgba(0,0,0,.55)';
    modal.innerHTML = `
      <div style="position:absolute;left:12px;right:12px;top:12px;bottom:12px;background:#fff;border:1px solid #111;border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <b style="font:900 14px system-ui">☁️ Cloud · SAFE</b>
          <button id="fmCloudClose" style="border:1px solid #111;background:#fff;border-radius:12px;padding:8px 10px;font:900 13px system-ui">Cerrar</button>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <input id="fmCloudEmail" type="email" autocomplete="email" placeholder="Email" style="flex:1;min-width:220px;border:1px solid rgba(0,0,0,.25);border-radius:12px;padding:10px 12px;font:14px system-ui">
          <input id="fmCloudPass" type="password" autocomplete="current-password" placeholder="Contraseña" style="flex:1;min-width:220px;border:1px solid rgba(0,0,0,.25);border-radius:12px;padding:10px 12px;font:14px system-ui">
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button id="fmCloudLogin" style="border:1px solid #111;background:#111;color:#fff;border-radius:12px;padding:10px 12px;font:900 13px system-ui">Login</button>
          <button id="fmCloudLogout" style="border:1px solid rgba(0,0,0,.25);background:#fff;border-radius:12px;padding:10px 12px;font:900 13px system-ui">Logout</button>
          <button id="fmCloudSync" style="border:1px solid #111;background:#fff;border-radius:12px;padding:10px 12px;font:900 13px system-ui">Sincronizar ahora</button>
        </div>

        <pre id="fmCloudInfo" style="flex:1;overflow:auto;border:1px solid rgba(0,0,0,.18);border-radius:14px;background:#f7f7f7;padding:10px 12px;font:12px ui-monospace,Menlo,Consolas,monospace;margin:0"></pre>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.style.display = 'none';
    modal.addEventListener('click', (e)=>{ if (e.target === modal) close(); });
    $('#fmCloudClose').onclick = close;

    $('#fmCloudEmail').value = localStorage.getItem(LS_EMAIL) || '';

    $('#fmCloudLogin').onclick = async () => {
      const em = ($('#fmCloudEmail').value || '').trim();
      const pw = $('#fmCloudPass').value || '';
      if (!em || !pw) return renderInfo('⚠️ Email/contraseña');
      localStorage.setItem(LS_EMAIL, em);
      try{
        await signInWithEmailAndPassword(auth, em, pw);
        $('#fmCloudPass').value = '';
      }catch(e){
        renderInfo('❌ Login: ' + (e?.code || e?.message || e));
      }
    };

    $('#fmCloudLogout').onclick = async () => { try { await signOut(auth); } catch{} };

    $('#fmCloudSync').onclick = async () => {
      try{ await syncNow(); }
      catch(e){ renderInfo('❌ Sync: ' + (e?.code || e?.message || e)); }
    };

    // botón topbar
    const btn = $('#btnCloud');
    if (btn) {
      btn.addEventListener('click', () => {
        modal.style.display = 'block';
        renderInfo();
      });
    }
  }

  function renderInfo(extra=''){
    const u = auth.currentUser;
    const box = $('#fmCloudInfo');
    if (!box) return;
    box.textContent =
      `auth: ${u ? 'LOGUEADO' : 'NO'}\n` +
      (u ? `email: ${u.email || '-'}\nuid: ${u.uid}\n` : '') +
      `deviceId: ${deviceId}\n` +
      `firstPullDone: ${firstPullDone}\n` +
      `localStorage keys: ${Object.keys(localStorage).length}\n` +
      (extra ? `\n${extra}\n` : '');
  }

  // ---- Merge seguro para LISTAS (evita perder facturas)
  function looksLikeListKey(k){
    const s = k.toLowerCase();
    return s.includes('factura') || s.includes('cliente') || s.includes('producto') || s.includes('tara') || s.includes('venta') || s.includes('pricehist');
  }

  function mergeJsonByKey(localRaw, remoteRaw, storageKey){
    const L = safeParse(localRaw);
    const R = safeParse(remoteRaw);

    // si uno no parsea, preferimos el que sí
    if (L == null && R == null) return (localRaw ?? remoteRaw ?? '');
    if (L == null) return remoteRaw;
    if (R == null) return localRaw;

    // LISTAS (arrays) -> unión por id/num
    if (Array.isArray(L) || Array.isArray(R)) {
      const aL = Array.isArray(L) ? L : [];
      const aR = Array.isArray(R) ? R : [];

      const keyPick = (o) => {
        if (!o || typeof o !== 'object') return null;
        return o.id ?? o.uid ?? o.num ?? o.numero ?? o.n ?? null;
      };
      const score = (o) => {
        // si hay updatedAt/ts, mejor; si no, largo de json como señal
        const t = Number(o?.updatedAt || o?.ts || 0);
        const len = safeStringify(o).length;
        return (t * 1000) + len;
      };

      const map = new Map();
      for (const it of aR) {
        const k = keyPick(it);
        if (k == null) continue;
        map.set(String(k), it);
      }
      for (const it of aL) {
        const k = keyPick(it);
        if (k == null) continue;
        const prev = map.get(String(k));
        if (!prev) map.set(String(k), it);
        else map.set(String(k), score(it) >= score(prev) ? it : prev);
      }

      // además, conservamos items sin key (si los hay)
      const noKey = (arr) => arr.filter(x => keyPick(x) == null);
      const merged = [...map.values(), ...noKey(aR), ...noKey(aL)];
      return safeStringify(merged);
    }

    // OBJETOS -> merge shallow, remote + local
    if (typeof L === 'object' && typeof R === 'object') {
      const merged = { ...R, ...L };
      return safeStringify(merged);
    }

    // primitivos -> local gana
    return localRaw;
  }

  async function pushKey(storageKey){
    if (!uid) throw new Error('no-auth');
    if (isExcluded(storageKey)) return;

    // seguridad: no empujar hasta haber hecho el primer pull
    if (!firstPullDone) return;

    const enc = b64url(storageKey);
    const localRaw = localStorage.getItem(storageKey);
    const localStr = (localRaw ?? '').toString();

    // leer remoto para merge (evita “pisar” y perder facturas)
    const snap = await get(ref(db, `${kvPath(uid)}/${enc}`));
    const remote = snap.exists() ? snap.val() : null;
    const remoteRaw = remote?.raw ?? '';

    const mergedRaw = looksLikeListKey(storageKey)
      ? mergeJsonByKey(localStr, remoteRaw, storageKey)
      : (localStr || remoteRaw); // si local vacío, no borra remoto

    // si mergedRaw vacío y remoto no, evitamos borrar
    if ((!mergedRaw || mergedRaw === '[]' || mergedRaw === '{}') && remoteRaw && remoteRaw.length > 5) {
      // no empujamos borrados “accidentales”
      renderInfo(`⚠️ Bloqueado push vacío para ${storageKey} (protección)`);
      return;
    }

    // mantener local igual al merged (para no divergir)
    localStorage.setItem(storageKey, mergedRaw);

    const ts = now();
    await update(ref(db, kvPath(uid)), {
      [enc]: { k: storageKey, raw: mergedRaw, updatedAt: ts, deviceId }
    });
    await update(ref(db, metaPath(uid)), { lastPush: { ts, deviceId } });

    meta[enc] = ts;
    saveMeta();
    window.dispatchEvent(new CustomEvent('fmcloud:syncok', { detail: { key: storageKey } }));
  }

  async function pullAll(){
    if (!uid) throw new Error('no-auth');
    const snap = await get(ref(db, kvPath(uid)));
    if (!snap.exists()) {
      firstPullDone = true;
      renderInfo('ℹ️ Cloud vacío (kv sin datos)');
      return 0;
    }

    const obj = snap.val() || {};
    let applied = 0;

    applyingRemote = true;
    try{
      for (const enc of Object.keys(obj)){
        const row = obj[enc];
        if (!row || !row.k || typeof row.raw !== 'string') continue;

        // ignorar lo que nosotros mismos acabamos de subir
        if (row.deviceId && row.deviceId === deviceId) {
          meta[enc] = Math.max(Number(meta[enc] || 0), Number(row.updatedAt || 0));
          continue;
        }

        const remoteAt = Number(row.updatedAt || 0);
        const localAt  = Number(meta[enc] || 0);

        if (remoteAt > localAt || localStorage.getItem(row.k) == null) {
          localStorage.setItem(row.k, row.raw);
          meta[enc] = remoteAt;
          applied++;
          window.dispatchEvent(new CustomEvent('fmcloud:changed', { detail: { key: row.k } }));
        }
      }
      saveMeta();
    } finally {
      applyingRemote = false;
    }

    firstPullDone = true;
    await update(ref(db, metaPath(uid)), { lastPull: { ts: now(), deviceId } });
    return applied;
  }

  // ---- Realtime listeners (cuando otro dispositivo sube, este recibe)
  function startRealtime(){
    if (listenersOn || !uid) return;
    listenersOn = true;
    kvRef = ref(db, kvPath(uid));

    const handler = (snap) => {
      const enc = snap.key;
      const row = snap.val();
      if (!enc || !row || !row.k || typeof row.raw !== 'string') return;
      if (row.deviceId && row.deviceId === deviceId) return;

      const remoteAt = Number(row.updatedAt || 0);
      const localAt = Number(meta[enc] || 0);
      if (remoteAt <= localAt) return;

      applyingRemote = true;
      try{
        localStorage.setItem(row.k, row.raw);
        meta[enc] = remoteAt;
        saveMeta();
      } finally {
        applyingRemote = false;
      }

      window.dispatchEvent(new CustomEvent('fmcloud:changed', { detail: { key: row.k } }));
    };

    onChildAdded(kvRef, handler);
    onChildChanged(kvRef, handler);
  }

  function stopRealtime(){
    if (!listenersOn) return;
    try { if (kvRef) off(kvRef); } catch {}
    listenersOn = false;
    kvRef = null;
  }

  // ---- Auto push: al guardar en localStorage, subimos esa key (debounce)
  const pending = new Set();
  let t = null;

  function schedulePush(k){
    if (!uid || !firstPullDone) return;
    if (applyingRemote) return;
    if (isExcluded(k)) return;

    pending.add(k);
    if (t) clearTimeout(t);
    t = setTimeout(async () => {
      t = null;
      const list = Array.from(pending);
      pending.clear();
      for (const key of list) {
        try { await pushKey(key); }
        catch(e){ renderInfo('❌ Push ' + key + ': ' + (e?.code || e?.message || e)); }
      }
      renderInfo('✅ Auto-sync OK');
    }, 450);
  }

  function hookSetItem(){
    if (localStorage.setItem.__fmSafeWrapped) return;
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(k, v){
      orig(k, v);
      try { schedulePush(k); } catch {}
    };
    localStorage.setItem.__fmSafeWrapped = true;
  }

  async function syncNow(){
    if (!uid) return renderInfo('⚠️ Login primero');
    renderInfo('⏳ Pull…');
    const n = await pullAll();
    renderInfo(`✅ Pull OK · applied=${n}\n⏳ Push full…`);

    // push “best effort” de lo importante
    const keys = Object.keys(localStorage).filter(k => !isExcluded(k));
    for (const k of keys) {
      try { await pushKey(k); } catch {}
    }
    renderInfo('✅ Sync total OK');
  }

  // ---- Boot
  ensureCloudUI();

  onAuthStateChanged(auth, async (u) => {
    uid = u?.uid || null;
    if (!uid) {
      stopRealtime();
      firstPullDone = false;
      renderInfo('ℹ️ Cloud OFF');
      return;
    }

    hookSetItem();

    // MUY IMPORTANTE: Pull primero (protege contra móviles vacíos)
    try{
      renderInfo('⏳ Pull inicial…');
      await pullAll();
      startRealtime();
      renderInfo('✅ Cloud ON (safe)');
    }catch(e){
      renderInfo('❌ Pull inicial: ' + (e?.code || e?.message || e));
    }
  });

})();
