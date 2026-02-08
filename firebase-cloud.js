import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, get, update, onChildAdded, onChildChanged, off } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

(() => {
  'use strict';

  // ====== Firebase config ======
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

  const LS_EMAIL  = 'fm_cloud_email';
  const LS_AUTO   = 'fm_cloud_auto';     // "1" | "0"
  const LS_DEVICE = 'fm_cloud_device';
  const LS_META   = 'fm_cloud_meta';     // { enc: updatedAt }

  const EXCLUDE_PREFIX = ['firebase:', 'grm_', 'goog:', 'debug_', 'cache', 'session', 'fm_cloud_'];
  const EXCLUDE_EXACT  = new Set([LS_EMAIL, LS_AUTO, LS_DEVICE, LS_META]);

  const isExcludedKey = (k) => EXCLUDE_EXACT.has(k) || EXCLUDE_PREFIX.some(p => k.startsWith(p));

  const b64urlEncode = (str) => {
    const b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  };

  const safeJson = (raw) => { try { return JSON.parse(raw); } catch { return null; } };

  // ====== Init Firebase ======
  let app, auth, db;
  let enabled = true, initErr = '';
  try{
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
  }catch(e){
    enabled = false;
    initErr = String(e?.message || e);
  }

  let uid = null;
  let kvRef = null;
  let listenersOn = false;

  let deviceId = localStorage.getItem(LS_DEVICE);
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16);
    localStorage.setItem(LS_DEVICE, deviceId);
  }

  let autoSync = (localStorage.getItem(LS_AUTO) ?? '1') === '1';
  let applyingRemote = false;

  const meta = (() => {
    try { return JSON.parse(localStorage.getItem(LS_META) || '{}') || {}; }
    catch { return {}; }
  })();
  const saveMeta = () => localStorage.setItem(LS_META, JSON.stringify(meta));

  const rootPath = (_uid) => `factumiral/${_uid}`;
  const kvPath   = (_uid) => `${rootPath(_uid)}/kv`;
  const metaPath = (_uid) => `${rootPath(_uid)}/meta`;

  // ====== UI ======
  function injectUI(){
    if ($('#fmCloudFab')) return;

    const st = document.createElement('style');
    st.textContent = `
      .fmFab{position:fixed;right:12px;bottom:12px;z-index:999999;border:1px solid #111;background:#fff;border-radius:14px;padding:10px 12px;font:900 13px system-ui;box-shadow:0 10px 24px rgba(0,0,0,.18)}
      .fmM{position:fixed;inset:0;z-index:9999999;display:none;background:rgba(0,0,0,.55)}
      .fmM.open{display:block}
      .fmC{position:absolute;left:12px;right:12px;top:12px;bottom:12px;background:#fff;border:1px solid #111;border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:10px}
      .fmRow{display:flex;gap:10px;flex-wrap:wrap}
      .fmRow input{flex:1;min-width:220px;border:1px solid rgba(0,0,0,.25);border-radius:12px;padding:10px 12px;font:14px system-ui}
      .fmBtns{display:flex;gap:10px;flex-wrap:wrap}
      .fmBtns button{border:1px solid #111;background:#fff;border-radius:12px;padding:10px 12px;font:900 13px system-ui}
      .fmBtns .p{background:#111;color:#fff}
      .fmInfo{border:1px solid rgba(0,0,0,.18);border-radius:14px;padding:10px 12px;background:#f7f7f7;font:12px ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;flex:1;overflow:auto}
      .fmTog{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .fmTog label{display:flex;gap:8px;align-items:center;border:1px solid rgba(0,0,0,.2);border-radius:999px;padding:8px 10px;font:900 12px system-ui}
    `;
    document.head.appendChild(st);

    const fab = document.createElement('button');
    fab.id = 'fmCloudFab';
    fab.className = 'fmFab';
    fab.type = 'button';
    fab.textContent = '☁️ Cloud';
    document.body.appendChild(fab);

    const modal = document.createElement('div');
    modal.id = 'fmCloudModal';
    modal.className = 'fmM';
    modal.innerHTML = `
      <div class="fmC">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <b style="font:900 14px system-ui">☁️ Cloud · PRO</b>
          <button id="fmClose" style="border:1px solid #111;background:#fff;border-radius:12px;padding:8px 10px;font:900 13px system-ui">Cerrar</button>
        </div>

        <div class="fmRow">
          <input id="fmEmail" type="email" autocomplete="email" placeholder="Email" />
          <input id="fmPass" type="password" autocomplete="current-password" placeholder="Contraseña" />
        </div>

        <div class="fmTog">
          <label><input id="fmAuto" type="checkbox"> Auto-sync</label>
        </div>

        <div class="fmBtns">
          <button id="fmLogin" class="p" type="button">Login</button>
          <button id="fmLogout" type="button">Logout</button>
          <button id="fmSync" class="p" type="button">⚡ Sincronizar</button>
          <button id="fmPull" type="button">⬇️ Recibir</button>
          <button id="fmPush" type="button">⬆️ Enviar</button>
          <button id="fmDiag" type="button">🧪 Diagnóstico</button>
        </div>

        <div class="fmInfo" id="fmInfo">Estado…</div>
      </div>
    `;
    document.body.appendChild(modal);

    fab.onclick = () => { modal.classList.add('open'); render(); };
    $('#fmClose').onclick = () => modal.classList.remove('open');
    modal.addEventListener('click', (e)=>{ if (e.target === modal) modal.classList.remove('open'); });

    $('#fmEmail').value = localStorage.getItem(LS_EMAIL) || '';
    $('#fmAuto').checked = autoSync;
  }

  function render(extra=''){
    const info = $('#fmInfo');
    if (!info) return;
    const u = auth?.currentUser;
    info.textContent =
      `enabled: ${enabled}\n` +
      (enabled ? '' : `initErr: ${initErr}\n`) +
      `auth: ${u ? 'LOGUEADO' : 'NO'}\n` +
      (u ? `email: ${u.email || '-'}\nuid: ${u.uid}\n` : '') +
      `deviceId: ${deviceId}\n` +
      `autoSync: ${autoSync}\n` +
      `localStorage keys: ${Object.keys(localStorage).length}\n` +
      (extra ? `\n${extra}` : '');
  }

  // ====== Core: push/pull ======
  function pickKeys(){
    // sube SOLO JSONs “serios”
    const out = [];
    for (const k of Object.keys(localStorage)){
      if (isExcludedKey(k)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const s = String(raw).trim();
      if (!(s.startsWith('{') || s.startsWith('['))) continue;
      const j = safeJson(s);
      if (!j) continue;
      if (s.length < 30) continue;
      out.push(k);
    }
    // fallback: si tu app guarda como texto raro, sube todo menos excluidos
    if (out.length === 0) {
      for (const k of Object.keys(localStorage)){
        if (!isExcludedKey(k)) out.push(k);
      }
    }
    return Array.from(new Set(out));
  }

  async function pushKeys(keys){
    if (!uid) throw new Error('no-auth');
    const ts = now();
    const up = {};
    for (const k of keys){
      if (isExcludedKey(k)) continue;
      const raw = localStorage.getItem(k);
      if (raw == null) continue;
      const enc = b64urlEncode(k);
      up[enc] = { k, raw, updatedAt: ts, deviceId };
      meta[enc] = ts;
    }
    // ✅ escribimos en /kv (no raíz)
    await update(ref(db, kvPath(uid)), up);
    await update(ref(db, metaPath(uid)), { lastPush: { ts, deviceId } });
    saveMeta();
    render(`✅ Push OK · keys=${keys.length}`);
  }

  async function pullAll(){
    if (!uid) throw new Error('no-auth');
    const snap = await get(ref(db, kvPath(uid)));
    if (!snap.exists()) { render('ℹ️ Pull: vacío'); return 0; }
    const obj = snap.val() || {};
    let applied = 0;
    applyingRemote = true;
    try{
      for (const enc of Object.keys(obj)){
        const row = obj[enc];
        if (!row || !row.k || typeof row.raw !== 'string') continue;
        const remoteAt = Number(row.updatedAt || 0);
        const localAt  = Number(meta[enc] || 0);
        if (remoteAt > localAt){
          localStorage.setItem(row.k, row.raw);
          meta[enc] = remoteAt;
          applied++;
        }
      }
      saveMeta();
    } finally {
      applyingRemote = false;
    }
    await update(ref(db, metaPath(uid)), { lastPull: { ts: now(), deviceId } });
    render(`✅ Pull OK · applied=${applied}`);
    return applied;
  }

  async function syncNow(){
    if (!uid) return render('⚠️ Login primero');
    render('⏳ Sync…');
    await pullAll();
    const keys = pickKeys();
    await pushKeys(keys);
    render('✅ Sync OK (sin recarga)');
  }

  // ====== Realtime listeners (opcional) ======
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
      const localAt  = Number(meta[enc] || 0);
      if (remoteAt <= localAt) return;

      applyingRemote = true;
      try{
        localStorage.setItem(row.k, row.raw);
        meta[enc] = remoteAt;
        saveMeta();
      } finally {
        applyingRemote = false;
      }
      render(`📥 Remoto aplicado: ${row.k}`);
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

  // ====== Auto-sync (debounce) ======
  const pending = new Set();
  let t = null;

  function schedule(k){
    if (!uid) return;
    if (!autoSync) return;
    if (applyingRemote) return;
    if (isExcludedKey(k)) return;

    pending.add(k);
    if (t) clearTimeout(t);
    t = setTimeout(async () => {
      t = null;
      const list = Array.from(pending);
      pending.clear();
      try{ await pushKeys(list); }
      catch(e){ render('⚠️ Auto-sync error: ' + (e?.code || e?.message || e)); }
    }, 600);
  }

  function hookSetItem(){
    if (localStorage.setItem.__fmWrapped) return;
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(k, v){
      orig(k, v);
      try { schedule(k); } catch {}
    };
    localStorage.setItem.__fmWrapped = true;
  }

  // ====== Diagnóstico ======
  function diag(){
    const keys = Object.keys(localStorage);
    const find = (needle) => keys.filter(k => k.toLowerCase().includes(needle));
    const msg =
      `Keys (match):\n` +
      `clientes: ${find('client').concat(find('cliente')).slice(0,10).join(', ') || '-'}\n` +
      `facturas: ${find('fact').slice(0,10).join(', ') || '-'}\n` +
      `productos: ${find('prod').slice(0,10).join(', ') || '-'}\n` +
      `ventas: ${find('venta').slice(0,10).join(', ') || '-'}\n` +
      `\nTotal keys: ${keys.length}`;
    render(msg);
  }

  // ====== Wire UI + Auth ======
  function wire(){
    $('#fmLogin')?.addEventListener('click', async () => {
      if (!enabled) return render('❌ Firebase init: ' + initErr);
      const em = ($('#fmEmail')?.value || '').trim();
      const pw = $('#fmPass')?.value || '';
      if (!em || !pw) return render('⚠️ Pon email/pass');
      localStorage.setItem(LS_EMAIL, em);
      try{
        await signInWithEmailAndPassword(auth, em, pw);
        $('#fmPass').value = '';
        render('✅ Login OK');
      }catch(e){
        render('❌ Login: ' + (e?.code || e?.message || e));
      }
    });

    $('#fmLogout')?.addEventListener('click', async () => {
      try{ await signOut(auth); render('✅ Logout'); }catch(e){ render('❌ ' + e); }
    });

    $('#fmAuto')?.addEventListener('change', (e) => {
      autoSync = !!e.target.checked;
      localStorage.setItem(LS_AUTO, autoSync ? '1' : '0');
      render();
    });

    $('#fmPush')?.addEventListener('click', async () => {
      try{ await pushKeys(pickKeys()); }catch(e){ render('❌ Push: ' + (e?.code || e?.message || e)); }
    });

    $('#fmPull')?.addEventListener('click', async () => {
      try{ await pullAll(); }catch(e){ render('❌ Pull: ' + (e?.code || e?.message || e)); }
    });

    $('#fmSync')?.addEventListener('click', async () => {
      try{ await syncNow(); }catch(e){ render('❌ Sync: ' + (e?.code || e?.message || e)); }
    });

    $('#fmDiag')?.addEventListener('click', diag);
  }

  // boot
  const boot = () => { injectUI(); wire(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();

  if (enabled) {
    onAuthStateChanged(auth, (u) => {
      uid = u?.uid || null;
      if (uid) { hookSetItem(); startRealtime(); render('✅ Realtime ON'); }
      else { stopRealtime(); render('ℹ️ Cloud OFF'); }
    });
  }
})();
