/* patches/storage-smoketest.js */
(async () => {
  'use strict';
  if (window.__FM_STORAGE_TEST__) return;
  window.__FM_STORAGE_TEST__ = true;

  const $ = (s, r=document) => r.querySelector(s);

  // Usamos Firebase modular vía CDN (no toca tu core)
  const [
    appMod,
    authMod,
    storageMod
  ] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js"),
  ]);

  const { initializeApp, getApps, getApp } = appMod;
  const { getAuth } = authMod;
  const { getStorage, ref, uploadBytes, getDownloadURL } = storageMod;

  // TU CONFIG (igual que la tuya)
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

  // Reusar app si ya existe
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const storage = getStorage(app);

  function injectBtn(){
    const host = $('.topbar__right') || document.body;
    if ($('#btnTestStorage')) return;

    const b = document.createElement('button');
    b.id = 'btnTestStorage';
    b.className = 'btn btn--ghost';
    b.type = 'button';
    b.title = 'Subir archivo test a Firebase Storage';
    b.textContent = 'TestStorage';
    host.insertBefore(b, $('#btnHelp') || null);

    b.addEventListener('click', async () => {
      const u = auth.currentUser;
      if (!u) {
        alert('❌ No estás logueado en Cloud. Abre Cloud y haz login primero.');
        $('#btnCloud')?.click();
        return;
      }

      try{
        const ts = new Date().toISOString().replace(/[:.]/g,'-');
        const path = `factumiral/${u.uid}/__test__/test-${ts}.txt`;

        const blob = new Blob([`FACTU MIRAL Storage test OK\nuid=${u.uid}\n${new Date().toString()}\n`], {type:'text/plain'});
        const fileRef = ref(storage, path);

        await uploadBytes(fileRef, blob, { contentType: 'text/plain' });
        const url = await getDownloadURL(fileRef);

        // marca semáforo si lo usas
        try{ localStorage.setItem('fm_cloud_last_ok', String(Date.now())); }catch{}

        alert('✅ Storage OK. Archivo subido.\n\nRuta:\n' + path + '\n\nURL:\n' + url);
        console.log('Storage OK:', { path, url });
      }catch(e){
        console.error(e);
        alert('❌ Falló upload a Storage:\n' + (e?.code || e?.message || e));
      }
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', injectBtn, { once:true });
  } else injectBtn();
})();
