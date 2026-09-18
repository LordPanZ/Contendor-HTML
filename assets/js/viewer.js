/* Contenedor HTML — visor a pantalla completa y receptor de enlaces compartidos */
(function () {
  'use strict';

  const U = CH.util;
  const $ = U.$;

  const SANDBOX_SHARED = 'allow-scripts allow-forms allow-modals allow-popups allow-downloads';

  let current = { title: 'Documento', html: '', shared: false, packed: '' };

  function showMessage(icon, title, text, actionLabel, actionHref) {
    $('#v-stage').classList.add('hidden');
    $('#v-msg').classList.remove('hidden');
    $('#v-msg-icon').textContent = icon;
    $('#v-msg-title').textContent = title;
    $('#v-msg-text').textContent = text;
    const action = $('#v-msg-action');
    if (actionLabel) {
      action.textContent = actionLabel;
      action.href = actionHref || 'index.html';
      action.classList.remove('hidden');
    } else {
      action.classList.add('hidden');
    }
    $('#v-download').classList.add('hidden');
  }

  function renderDocument(title, html, sandbox) {
    document.title = title + ' · Contenedor HTML';
    $('#v-title').textContent = title;
    const stage = $('#v-stage');
    stage.textContent = '';
    stage.classList.remove('hidden');
    $('#v-msg').classList.add('hidden');
    const frame = U.el('iframe', { sandbox: sandbox, title: title });
    stage.appendChild(frame);
    frame.srcdoc = html;
  }

  /* ---------- modo 1: documento compartido dentro del enlace ---------- */

  async function openShared(packed) {
    let payload;
    try {
      payload = JSON.parse(await U.unpackText(packed));
    } catch (e) {
      showMessage('⚠️', 'Enlace no válido',
        'El enlace está incompleto o se ha cortado al copiarlo. Pide que te lo vuelvan a enviar, o que te manden el archivo .html.');
      return;
    }
    if (!payload || typeof payload.h !== 'string') {
      showMessage('⚠️', 'Enlace no válido', 'No se ha encontrado ningún documento dentro del enlace.');
      return;
    }

    current = { title: payload.t || 'Documento compartido', html: payload.h, shared: true, packed: packed };
    $('#v-badge').classList.remove('hidden');
    $('#v-save').classList.remove('hidden');
    renderDocument(current.title, current.html, SANDBOX_SHARED);
  }

  /* ---------- modo 2: documento de la colección ---------- */

  async function openLocal(id) {
    await CH.store.init();
    await CH.auth.init();

    if (!CH.auth.sessionOpen()) {
      showMessage('🔒', 'Contenedor bloqueado',
        'Introduce tu PIN en el contenedor y vuelve a abrir el documento desde ahí.',
        'Abrir el contenedor', 'index.html');
      return;
    }

    const doc = await CH.store.getDoc(id);
    if (!doc) {
      showMessage('🔍', 'Documento no encontrado',
        'Puede que se haya eliminado o que estés en otro navegador: la colección se guarda en cada dispositivo.',
        'Ir al contenedor', 'index.html');
      return;
    }

    const html = await CH.store.getContent(id);
    current = { title: doc.title || 'Documento', html: html, shared: false, packed: '' };

    const sandbox = doc.trusted ? SANDBOX_SHARED + ' allow-same-origin' : SANDBOX_SHARED;
    renderDocument(current.title, html, sandbox);
  }

  /* ---------- acciones de la barra ---------- */

  $('#v-download').addEventListener('click', function () {
    if (!current.html) return;
    U.downloadText(current.html, U.safeFileName(current.title, '.html'));
  });

  $('#v-save').addEventListener('click', function () {
    if (!current.packed) return;
    // El contenedor pedirá el PIN y guardará el documento al entrar.
    location.href = 'index.html#guardar=' + current.packed;
  });

  /* ---------- arranque ---------- */

  (async function start() {
    const hash = location.hash || '';
    const params = new URLSearchParams(location.search);

    if (hash.indexOf('#d=') === 0) {
      await openShared(hash.slice(3));
      return;
    }
    if (params.get('id')) {
      await openLocal(params.get('id'));
      return;
    }
    showMessage('🗄️', 'Nada que mostrar',
      'Abre un documento desde el contenedor, o usa un enlace compartido.',
      'Ir al contenedor', 'index.html');
  })();
})();
