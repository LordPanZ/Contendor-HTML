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

  async function showGate() {
    const gate = $('#gate');
    const form = $('#gate-form');
    const pin = $('#gate-pin');
    const error = $('#gate-error');
    const remember = $('#gate-remember');

    buildKeypad();
    remember.checked = await CH.auth.rememberEnabled();

    if (await CH.auth.isDefaultPin()) {
      $('#gate-foot').textContent = 'PIN inicial: 9441 — puedes cambiarlo desde Ajustes.';
    }

    if (CH.store.mode === 'memory') {
      $('#gate-foot').textContent = 'Aviso: este navegador no permite guardar datos aquí. Abre la app desde un servidor local (mira el README).';
    }

    gate.classList.remove('hidden');
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
  }

  function updateBrandCount() {
    const sub = $('#brand-sub');
    if (!sub) return;
    const n = CH.catalog.state.docs.length;
    sub.textContent = n ? n + (n === 1 ? ' documento guardado' : ' documentos guardados') : 'tu colección local';
  }

  /** Guarda un documento que llega desde un enlace compartido (viewer.html → "Guardar en mi contenedor"). */
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

  async function main() {
    await CH.store.init();
    await CH.auth.init();

    if (CH.store.mode !== 'idb') {
      console.warn('Contenedor HTML: almacenamiento en modo "' + CH.store.mode + '".', CH.store.lastError || '');
    }

    if (CH.auth.sessionOpen()) {
      $('#gate').classList.add('hidden');
      await bootApp();
    } else {
      await showGate();
    }

    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* sin modo sin conexión */ });
    }
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
