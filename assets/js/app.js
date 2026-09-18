/* Contenedor HTML — arranque: almacenamiento, bloqueo y carga de la colección */
(function () {
  'use strict';

  const U = CH.util;
  const $ = U.$;

  /* ---------------- pantalla de bloqueo ---------------- */

  function buildKeypad() {
    const keys = $('#gate-keys');
    const pin = $('#gate-pin');
    const layout = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', 'C'];

    layout.forEach(function (key) {
      const btn = U.el('button', { type: 'button', class: 'gate__key', text: key });
      btn.addEventListener('click', function () {
        if (key === '←') pin.value = pin.value.slice(0, -1);
        else if (key === 'C') pin.value = '';
        else if (pin.value.length < 32) pin.value += key;
        pin.focus();
      });
      keys.appendChild(btn);
    });
  }

  let gateReady = false;

  async function showGate() {
    const gate = $('#gate');
    const form = $('#gate-form');
    const pin = $('#gate-pin');
    const error = $('#gate-error');
    const remember = $('#gate-remember');

    gate.classList.remove('hidden');
    if (gateReady) {
      setTimeout(() => pin.focus(), 60);
      return;
    }
    gateReady = true;

    buildKeypad();
    remember.checked = await CH.auth.rememberEnabled();

    if (CH.store.mode === 'memory') {
      $('#gate-foot').textContent = 'Aviso: este navegador no permite guardar datos aquí. Abre la app desde un servidor local (mira el README).';
    }

    setTimeout(() => pin.focus(), 60);

    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      error.textContent = '';
      const result = await CH.auth.unlock(pin.value, remember.checked);
      if (!result.ok) {
        error.textContent = result.error;
        pin.value = '';
        pin.focus();
        form.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(0)' }],
          { duration: 220 }
        );
        return;
      }
      await CH.auth.setRememberEnabled(remember.checked);
      pin.value = '';
      gate.classList.add('hidden');
      await bootApp();
    });
  }

  /* ---------------- aplicación ---------------- */

  async function bootApp() {
    await CH.catalog.load();
    $('#app').classList.remove('hidden');
    CH.ui.init();

    if (CH.store.mode === 'idb') CH.store.requestPersistence();

    updateBrandCount();
    CH.catalog.onChange(updateBrandCount);
    await absorbSharedLink();
    applyShortcut();
  }

  /** Accesos directos del icono instalado (manifest → shortcuts). */
  function applyShortcut() {
    let accion = '';
    try { accion = new URLSearchParams(location.search).get('accion') || ''; } catch (e) { return; }
    if (!accion) return;
    history.replaceState(null, '', location.pathname + location.hash);
    if (accion === 'anadir') CH.ui.openImportModal();
    else if (accion === 'favoritos') CH.catalog.setFilter({ favorites: true, category: 'all', tag: '' });
  }

  function updateBrandCount() {
    const sub = $('#brand-sub');
    if (!sub) return;
    const n = CH.catalog.state.docs.length;
    sub.textContent = n ? n + (n === 1 ? ' documento guardado' : ' documentos guardados') : 'tu colección local';
  }

  /** Guarda el documento que llega en un enlace compartido, tras pasar por el PIN. */
  async function absorbSharedLink() {
    const hash = location.hash || '';
    if (hash.indexOf('#guardar=') !== 0) return;
    const packed = hash.slice('#guardar='.length);
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const payload = JSON.parse(await U.unpackText(packed));
      if (!payload || typeof payload.h !== 'string') throw new Error('enlace sin documento');
      const res = await CH.catalog.addDocument({
        html: payload.h,
        title: payload.t,
        description: payload.d,
        tags: ['compartido'],
        source: 'enlace compartido'
      });
      U.toast(res.duplicate ? 'Ese documento ya estaba en tu contenedor' : 'Documento guardado en tu contenedor',
        res.duplicate ? 'warn' : 'ok', 4500);
      CH.ui.openDoc(res.doc.id);
    } catch (e) {
      U.toast('No se pudo guardar el documento compartido: el enlace está incompleto.', 'error', 6000);
    }
  }

  /* ---------------- documento recibido por enlace ---------------- */

  const SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups allow-downloads';

  /** Alguien comparte un documento contigo: se ve sin PIN, porque el enlace ya trae el documento.
      Se muestra aislado (sin acceso a los datos de la aplicación). */
  async function showSharedDocument(packed) {
    const panel = $('#shared');
    // El PIN protege tu colección, no el documento que te acaban de compartir.
    $('#gate').classList.add('hidden');
    panel.classList.remove('hidden');
    $('#shared-continue').addEventListener('click', continueToApp);

    let payload = null;
    try {
      payload = JSON.parse(await U.unpackText(packed));
    } catch (e) { payload = null; }

    if (!payload || typeof payload.h !== 'string') {
      $('#shared-stage').classList.add('hidden');
      $('#shared-error').classList.remove('hidden');
      $('#shared-save').classList.add('hidden');
      $('#shared-download').classList.add('hidden');
      return;
    }

    const title = payload.t || 'Documento compartido';
    document.title = title + ' · Contenedor HTML';
    $('#shared-title').textContent = title;

    const stage = $('#shared-stage');
    const frame = U.el('iframe', { sandbox: SANDBOX, title: title });
    stage.appendChild(frame);
    frame.srcdoc = payload.h;

    $('#shared-download').addEventListener('click', function () {
      U.downloadText(payload.h, U.safeFileName(title, '.html'));
    });

    $('#shared-save').addEventListener('click', function () {
      // El contenedor pedirá el PIN y lo guardará nada más entrar.
      location.hash = '#guardar=' + packed;
      continueToApp();
    });
  }

  function continueToApp() {
    $('#shared').classList.add('hidden');
    document.title = 'Contenedor HTML';
    startNormal();
  }

  async function startNormal() {
    if (CH.auth.sessionOpen()) {
      $('#gate').classList.add('hidden');
      await bootApp();
    } else {
      await showGate();
    }
  }

  async function main() {
    await CH.store.init();
    await CH.auth.init();

    if (CH.store.mode !== 'idb') {
      console.warn('Contenedor HTML: almacenamiento en modo "' + CH.store.mode + '".', CH.store.lastError || '');
    }

    // Dentro de un iframe aislado, leer navigator.serviceWorker lanza excepción
    // (pasa al previsualizar un documento que a su vez es una app instalable).
    try {
      if (!window.CH_ARCHIVO_UNICO && 'serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
        navigator.serviceWorker.register('sw.js').catch(function () { /* sin modo sin conexión */ });
      }
    } catch (e) { /* sin service worker disponible aquí */ }

    const hash = location.hash || '';
    if (hash.indexOf('#d=') === 0) {
      await showSharedDocument(hash.slice(3));
      return;
    }

    await startNormal();
  }

  main().catch(function (err) {
    console.error(err);
    const gate = $('#gate');
    if (gate) {
      gate.classList.remove('hidden');
      $('#gate-error').textContent = 'No se pudo iniciar: ' + (err && err.message ? err.message : err);
    }
  });
})();
