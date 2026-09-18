/* Contenedor HTML — interfaz: listados, panel de documento, ventanas y atajos */
window.CH = window.CH || {};

CH.ui = (function () {
  'use strict';

  const U = CH.util;
  const $ = U.$, $$ = U.$$, el = U.el;
  const catalog = CH.catalog;
  const importer = CH.importer;
  const share = CH.share;
  const auth = CH.auth;
  const store = CH.store;

  const ui = {
    currentId: null,
    currentHtml: '',
    selection: new Set(),
    observer: null,
    pendingConfirm: null
  };

  /* ================= tema y arranque ================= */

  function applyTheme() {
    const light = catalog.state.settings.theme === 'light';
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', light ? '#f5f6f9' : '#0e1014');
  }

  function init() {
    applyTheme();
    wireModals();
    wireTopbar();
    wireSidebar();
    wireDrawer();
    wireImportModal();
    wireCategoriesModal();
    wireSettingsModal();
    wireConfirmModal();
    wireGlobalDrop();
    wireShortcuts();
    catalog.onChange(render);
    render();
    refreshStorageBox();
  }

  /* ================= barra superior ================= */

  function wireTopbar() {
    const search = $('#search');
    search.addEventListener('input', U.debounce(function () {
      catalog.setFilter({ query: search.value });
      $('#search-clear').classList.toggle('hidden', !search.value);
    }, 180));

    $('#search-clear').addEventListener('click', function () {
      search.value = '';
      catalog.setFilter({ query: '' });
      $('#search-clear').classList.add('hidden');
      search.focus();
    });

    $('#btn-add').addEventListener('click', openImportModal);
    $('#btn-settings').addEventListener('click', openSettingsModal);
    $('#btn-lock').addEventListener('click', function () {
      auth.lock();
      location.reload();
    });

    $('#btn-sidebar').addEventListener('click', () => toggleSidebar(true));
    $('#scrim').addEventListener('click', () => toggleSidebar(false));

    $('#sort').addEventListener('change', function () { catalog.setSetting('sort', this.value); });
    $('#view-grid').addEventListener('click', () => catalog.setSetting('view', 'grid'));
    $('#view-list').addEventListener('click', () => catalog.setSetting('view', 'list'));
    $('#btn-export-view').addEventListener('click', () => exportZip(null, 'lo que se ve'));
  }

  function toggleSidebar(open) {
    $('#sidebar').classList.toggle('is-open', open);
    $('#scrim').classList.toggle('hidden', !open);
  }

  /* ================= barra lateral ================= */

  function wireSidebar() {
    $('#btn-categories').addEventListener('click', openCategoriesModal);
  }

  function renderSidebar() {
    const f = catalog.state.filter;
    const counts = catalog.countsByCategory();
    const total = catalog.state.docs.length;
    const favs = catalog.state.docs.filter((d) => d.favorite).length;

    const main = $('#nav-main');
    main.textContent = '';
    main.appendChild(navItem('📚', 'Todos los HTML', total,
      f.category === 'all' && !f.favorites && !f.tag,
      () => catalog.setFilter({ category: 'all', favorites: false, tag: '' })));
    main.appendChild(navItem('⭐', 'Favoritos', favs, f.favorites,
      () => catalog.setFilter({ category: 'all', favorites: true, tag: '' })));

    const cats = $('#nav-categories');
    cats.textContent = '';
    catalog.state.categories.forEach(function (c) {
      cats.appendChild(navItem(c.emoji, c.name, counts[c.id] || 0,
        f.category === c.id && !f.favorites,
        () => catalog.setFilter({ category: c.id, favorites: false, tag: '' }), c.color));
    });

    const cloud = $('#tagcloud');
    cloud.textContent = '';
    const tags = catalog.allTags().slice(0, 24);
    if (!tags.length) {
      cloud.appendChild(el('span', { class: 'field__hint', text: 'Aún no hay etiquetas.' }));
    }
    tags.forEach(function (t) {
      cloud.appendChild(el('button', {
        class: 'tagchip' + (f.tag === t.tag ? ' is-active' : ''),
        text: t.tag + ' · ' + t.count,
        onclick: () => catalog.setFilter({ tag: f.tag === t.tag ? '' : t.tag })
      }));
    });
  }

  function navItem(emoji, label, count, active, onClick, color) {
    return el('button', {
      class: 'navitem' + (active ? ' is-active' : ''),
      onclick: onClick,
      style: color ? 'box-shadow:inset 3px 0 0 ' + color : null
    }, [
      el('span', { class: 'navitem__emoji', text: emoji }),
      el('span', { class: 'navitem__label', text: label }),
      el('span', { class: 'navitem__count', text: String(count) })
    ]);
  }

  async function refreshStorageBox() {
    const box = $('#storage-box');
    const stats = catalog.stats();
    const est = await store.estimate();
    box.textContent = '';

    const modeNote = {
      idb: '',
      local: 'Guardado en modo reducido (el navegador no permite la base de datos). Capacidad limitada: exporta copias a menudo.',
      memory: 'Sin almacenamiento permanente: lo que añadas se perderá al cerrar. Abre la app desde un servidor local (ver README).'
    }[store.mode];

    box.appendChild(el('div', { text: stats.total + ' documentos · ' + U.formatBytes(stats.size) }));

    if (est && est.quota) {
      const pct = Math.min(100, Math.round((est.usage / est.quota) * 100));
      box.appendChild(el('div', { class: 'meter' }, [el('div', { class: 'meter__fill', style: 'width:' + Math.max(2, pct) + '%' })]));
      box.appendChild(el('div', { text: U.formatBytes(est.usage) + ' de ' + U.formatBytes(est.quota) + ' usados (' + pct + '%)' }));
    }
    if (modeNote) box.appendChild(el('div', { style: 'margin-top:8px;color:var(--warn)', text: modeNote }));
  }

  /* ================= listado ================= */

  function render() {
    applyTheme();
    renderSidebar();
    renderContent();
    $('#sort').value = catalog.state.settings.sort;
    $('#view-grid').classList.toggle('is-active', catalog.state.settings.view === 'grid');
    $('#view-list').classList.toggle('is-active', catalog.state.settings.view !== 'grid');
  }

  function currentViewTitle() {
    const f = catalog.state.filter;
    if (f.favorites) return 'Favoritos';
    if (f.category !== 'all') return catalog.getCategory(f.category).name;
    return 'Todos los documentos';
  }

  function renderContent() {
    const content = $('#content');
    const docs = catalog.visibleDocs();
    const f = catalog.state.filter;

    $('#view-title').textContent = currentViewTitle() + (f.tag ? ' · #' + f.tag : '');
    $('#view-count').textContent = docs.length
      ? docs.length + (docs.length === 1 ? ' documento' : ' documentos')
      : '';

    if (ui.observer) { ui.observer.disconnect(); ui.observer = null; }
    content.textContent = '';

    if (!docs.length) {
      content.appendChild(renderEmpty());
      return;
    }

    ui.observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        ui.observer.unobserve(entry.target);
        fillPreview(entry.target);
      });
    }, { rootMargin: '250px' });

    const isGrid = catalog.state.settings.view === 'grid';
    const wrap = el('div', { class: isGrid ? 'grid' : 'list' });
    docs.forEach((d) => wrap.appendChild(isGrid ? renderCard(d) : renderRow(d)));
    content.appendChild(wrap);

    if (ui.selection.size) content.appendChild(renderBulkBar());
    content.classList.toggle('is-selecting', ui.selection.size > 0);
  }

  function renderEmpty() {
    const hasDocs = catalog.state.docs.length > 0;
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty__icon', text: hasDocs ? '🔍' : '🗂️' }),
      el('p', { class: 'empty__title', text: hasDocs ? 'Nada coincide con la búsqueda' : 'Tu contenedor está vacío' }),
      el('p', {
        class: 'empty__text',
        text: hasDocs
          ? 'Prueba con otras palabras, quita la etiqueta o cambia de categoría.'
          : 'Añade los HTML que tengas sueltos: archivos, carpetas enteras o código pegado. Se quedan guardados en este navegador.'
      }),
      hasDocs
        ? el('button', {
            class: 'btn', text: 'Quitar filtros', onclick: function () {
              $('#search').value = '';
              $('#search-clear').classList.add('hidden');
              catalog.setFilter({ query: '', category: 'all', favorites: false, tag: '' });
            }
          })
        : el('button', { class: 'btn btn--primary', text: '＋ Añadir mis HTML', onclick: openImportModal })
    ]);
  }

  function renderCard(doc) {
    const cat = catalog.getCategory(doc.category);
    const selected = ui.selection.has(doc.id);

    const preview = el('div', { class: 'card__preview', dataset: { id: doc.id } }, [
      el('div', { class: 'card__preview-fallback', text: cat.emoji })
    ]);

    const card = el('div', {
      class: 'card' + (selected ? ' is-selected' : ''),
      dataset: { id: doc.id },
      onclick: function (ev) {
        if (ev.target.closest('[data-stop]')) return;
        if (ui.selection.size) { toggleSelection(doc.id); return; }
        openDoc(doc.id);
      }
    }, [
      preview,
      el('button', {
        class: 'card__check' + (selected ? ' is-on' : ''), dataset: { stop: '1' },
        title: 'Seleccionar', text: selected ? '✓' : '',
        onclick: (ev) => { ev.stopPropagation(); toggleSelection(doc.id); }
      }),
      el('button', {
        class: 'card__fav' + (doc.favorite ? ' is-on' : ''), dataset: { stop: '1' },
        title: doc.favorite ? 'Quitar de favoritos' : 'Marcar como favorito',
        text: doc.favorite ? '★' : '☆',
        onclick: (ev) => { ev.stopPropagation(); catalog.updateDocument(doc.id, { favorite: !doc.favorite }); }
      }),
      el('div', { class: 'card__body' }, [
        el('h3', { class: 'card__title', text: doc.title }),
        doc.tags && doc.tags.length
          ? el('div', { class: 'card__tags' }, doc.tags.slice(0, 3).map((t) => el('span', { class: 'card__tag', text: '#' + t })))
          : null,
        el('div', { class: 'card__meta' }, [
          el('span', { class: 'card__cat', text: cat.emoji + ' ' + cat.name }),
          el('span', { text: '·' }),
          el('span', { text: U.formatBytes(doc.size) })
        ])
      ])
    ]);

    ui.observer.observe(preview);
    return card;
  }

  function renderRow(doc) {
    const cat = catalog.getCategory(doc.category);
    const selected = ui.selection.has(doc.id);
    return el('div', {
      class: 'listrow' + (selected ? ' is-selected' : ''),
      onclick: function (ev) {
        if (ev.target.closest('[data-stop]')) return;
        if (ui.selection.size) { toggleSelection(doc.id); return; }
        openDoc(doc.id);
      }
    }, [
      el('button', {
        class: 'btn btn--ghost btn--icon', dataset: { stop: '1' }, title: 'Seleccionar',
        text: selected ? '☑' : '☐', onclick: (ev) => { ev.stopPropagation(); toggleSelection(doc.id); }
      }),
      el('span', { class: 'listrow__emoji', text: cat.emoji }),
      el('div', { class: 'listrow__main' }, [
        el('div', { class: 'listrow__title', text: (doc.favorite ? '★ ' : '') + doc.title }),
        el('div', {
          class: 'listrow__sub',
          text: cat.name + (doc.tags && doc.tags.length ? ' · #' + doc.tags.join(' #') : '') + (doc.description ? ' · ' + doc.description : '')
        })
      ]),
      el('div', { class: 'listrow__meta' }, [
        el('div', { text: U.formatBytes(doc.size) }),
        el('div', { text: U.relTime(doc.updatedAt) })
      ]),
      el('div', { class: 'listrow__actions', dataset: { stop: '1' } }, [
        el('button', { class: 'btn btn--ghost btn--icon', title: 'Abrir a pantalla completa', text: '↗', onclick: (ev) => { ev.stopPropagation(); openFullscreen(doc.id); } }),
        el('button', { class: 'btn btn--ghost btn--icon', title: 'Compartir', text: '🔗', onclick: (ev) => { ev.stopPropagation(); openShare(doc.id); } })
      ])
    ]);
  }

  async function fillPreview(node) {
    const id = node.dataset.id;
    const doc = catalog.getDoc(id);
    if (!doc) return;
    let html = '';
    try { html = await catalog.getContent(id); } catch (e) { return; }
    if (!html) return;
    const frame = el('iframe', {
      sandbox: catalog.state.settings.livePreviews ? 'allow-scripts' : '',
      loading: 'lazy',
      title: 'Vista previa de ' + doc.title,
      tabindex: '-1',
      'aria-hidden': 'true'
    });
    node.textContent = '';
    node.appendChild(frame);
    node.appendChild(el('div', { class: 'card__shield' }));
    frame.srcdoc = html;
  }

  /* ================= selección múltiple ================= */

  function toggleSelection(id) {
    if (ui.selection.has(id)) ui.selection.delete(id);
    else ui.selection.add(id);
    renderContent();
  }

  function renderBulkBar() {
    const ids = Array.from(ui.selection);
    const select = el('select', { class: 'select', style: 'width:auto' },
      [el('option', { value: '', text: 'Mover a…' })].concat(
        catalog.state.categories.map((c) => el('option', { value: c.id, text: c.emoji + ' ' + c.name }))
      ));
    select.addEventListener('change', async function () {
      if (!this.value) return;
      for (const id of ids) await catalog.updateDocument(id, { category: this.value });
      U.toast(ids.length + ' documentos movidos', 'ok');
      ui.selection.clear();
      renderContent();
    });

    return el('div', { class: 'bulkbar' }, [
      el('span', { class: 'bulkbar__count', text: ids.length + ' seleccionados' }),
      select,
      el('button', { class: 'btn btn--sm', text: '🏷️ Etiquetar', onclick: () => bulkTag(ids) }),
      el('button', { class: 'btn btn--sm', text: '⭐ Favoritos', onclick: () => bulkFavorite(ids) }),
      el('button', { class: 'btn btn--sm', text: '📦 Exportar ZIP', onclick: () => exportZip(ids, 'la selección') }),
      el('button', { class: 'btn btn--sm btn--danger', text: '🗑️ Eliminar', onclick: () => bulkDelete(ids) }),
      el('button', { class: 'btn btn--ghost btn--sm', text: 'Cancelar', onclick: function () { ui.selection.clear(); renderContent(); } })
    ]);
  }

  async function bulkTag(ids) {
    const input = window.prompt('Etiquetas que quieres añadir (separadas por comas):', '');
    if (!input) return;
    const tags = parseTags(input);
    if (!tags.length) return;
    for (const id of ids) {
      const doc = catalog.getDoc(id);
      const merged = (doc.tags || []).slice();
      tags.forEach((t) => { if (merged.indexOf(t) === -1) merged.push(t); });
      await catalog.updateDocument(id, { tags: merged });
    }
    U.toast('Etiquetas añadidas a ' + ids.length + ' documentos', 'ok');
    ui.selection.clear();
    renderContent();
  }

  async function bulkFavorite(ids) {
    const allFav = ids.every((id) => (catalog.getDoc(id) || {}).favorite);
    for (const id of ids) await catalog.updateDocument(id, { favorite: !allFav });
    ui.selection.clear();
    renderContent();
  }

  async function bulkDelete(ids) {
    const ok = await confirmDialog({
      title: 'Eliminar ' + ids.length + ' documentos',
      text: 'Se borrarán de este navegador y no se pueden recuperar. ¿Continuar?',
      okLabel: 'Eliminar'
    });
    if (!ok) return;
    for (const id of ids) await catalog.removeDocument(id);
    ui.selection.clear();
    U.toast(ids.length + ' documentos eliminados', 'ok');
    refreshStorageBox();
  }

  const parseTags = (value) => String(value || '')
    .split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20);

  /* ================= panel de documento ================= */

  function wireDrawer() {
    $('#drawer-close').addEventListener('click', closeDrawer);
    $('#drawer').addEventListener('mousedown', function (ev) { if (ev.target === this) closeDrawer(); });

    $$('.drawer__tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        $$('.drawer__tab').forEach((t) => t.classList.toggle('is-active', t === tab));
        $$('.drawer__pane').forEach((p) => p.classList.toggle('is-active', p.dataset.pane === tab.dataset.pane));
      });
    });

    $('#drawer-save').addEventListener('click', saveDrawer);
    $('#drawer-delete').addEventListener('click', deleteCurrent);
    $('#drawer-download').addEventListener('click', function () {
      const doc = catalog.getDoc(ui.currentId);
      if (doc) share.download(doc, ui.currentHtml);
    });
    $('#drawer-duplicate').addEventListener('click', duplicateCurrent);
    $('#drawer-share').addEventListener('click', () => openShare(ui.currentId));
    $('#drawer-open').addEventListener('click', () => openFullscreen(ui.currentId));
    $('#drawer-fav').addEventListener('click', async function () {
      const doc = catalog.getDoc(ui.currentId);
      if (!doc) return;
      await catalog.updateDocument(doc.id, { favorite: !doc.favorite });
      $('#drawer-fav').textContent = doc.favorite ? '★' : '☆';
    });
  }

  async function openDoc(id) {
    const doc = catalog.getDoc(id);
    if (!doc) return;
    ui.currentId = id;
    ui.currentHtml = await catalog.getContent(id);

    $('#drawer-title').textContent = doc.title;
    $('#drawer-fav').textContent = doc.favorite ? '★' : '☆';
    $('#edit-title').value = doc.title;
    $('#edit-desc').value = doc.description || '';
    $('#edit-tags').value = (doc.tags || []).join(', ');
    $('#edit-trusted').checked = !!doc.trusted;
    fillCategorySelect($('#edit-category'), doc.category, false);
    $('#code-editor').value = ui.currentHtml;

    const info = $('#edit-info');
    info.textContent = '';
    [
      ['Origen', doc.source || 'creado aquí'],
      ['Tamaño', U.formatBytes(doc.size)],
      ['Añadido', U.formatDate(doc.createdAt)],
      ['Modificado', U.formatDate(doc.updatedAt)],
      ['Aperturas', String(doc.opens || 0)]
    ].forEach(function (pair) {
      info.appendChild(el('dt', { text: pair[0] }));
      info.appendChild(el('dd', { text: pair[1] }));
    });

    const pane = $('#pane-preview');
    pane.textContent = '';
    const sandbox = ['allow-scripts', 'allow-forms', 'allow-modals', 'allow-popups', 'allow-downloads'];
    if (doc.trusted) sandbox.push('allow-same-origin');
    const frame = el('iframe', { class: 'preview-frame', sandbox: sandbox.join(' '), title: 'Vista previa de ' + doc.title });
    pane.appendChild(frame);
    frame.srcdoc = ui.currentHtml;

    showPane('preview');
    $('#drawer').classList.remove('hidden');
    catalog.markOpened(id);
  }

  function closeDrawer() {
    $('#drawer').classList.add('hidden');
    $('#pane-preview').textContent = '';
    ui.currentId = null;
    ui.currentHtml = '';
  }

  async function saveDrawer() {
    const doc = catalog.getDoc(ui.currentId);
    if (!doc) return;
    const newHtml = $('#code-editor').value;
    await catalog.updateDocument(doc.id, {
      title: $('#edit-title').value.trim() || 'Sin título',
      description: $('#edit-desc').value.trim(),
      category: $('#edit-category').value,
      tags: parseTags($('#edit-tags').value),
      trusted: $('#edit-trusted').checked
    });
    if (newHtml !== ui.currentHtml) {
      await catalog.replaceContent(doc.id, newHtml);
      ui.currentHtml = newHtml;
    }
    U.toast('Cambios guardados', 'ok');
    closeDrawer();
    refreshStorageBox();
  }

  async function deleteCurrent() {
    const doc = catalog.getDoc(ui.currentId);
    if (!doc) return;
    const ok = await confirmDialog({
      title: 'Eliminar documento',
      text: '«' + doc.title + '» se borrará de este navegador y no se puede recuperar.',
      okLabel: 'Eliminar'
    });
    if (!ok) return;
    await catalog.removeDocument(doc.id);
    closeDrawer();
    U.toast('Documento eliminado', 'ok');
    refreshStorageBox();
  }

  async function duplicateCurrent() {
    const doc = catalog.getDoc(ui.currentId);
    if (!doc) return;
    const res = await catalog.addDocument({
      html: ui.currentHtml,
      title: doc.title + ' (copia)',
      description: doc.description,
      category: doc.category,
      tags: (doc.tags || []).slice(),
      source: doc.source,
      allowDuplicate: true
    });
    U.toast('Copia creada', 'ok');
    openDoc(res.doc.id);
  }

  async function openFullscreen(id) {
    if (!id) return;
    catalog.markOpened(id);

    // En la versión de un solo archivo no hay visor aparte: se agranda la vista previa.
    if (window.CH_ARCHIVO_UNICO) {
      if (ui.currentId !== id) await openDoc(id);
      showPane('preview');
      const pane = $('#pane-preview');
      if (pane.requestFullscreen) {
        pane.requestFullscreen().catch(() => U.toast('El navegador no ha permitido la pantalla completa', 'warn'));
      } else {
        U.toast('Este navegador no permite la pantalla completa', 'warn');
      }
      return;
    }

    // Sin "noopener" a propósito: así la pestaña nueva hereda la sesión abierta
    // y el visor no vuelve a pedir el PIN. El documento se muestra aislado
    // dentro de un iframe con permisos limitados.
    window.open('viewer.html?id=' + encodeURIComponent(id), '_blank');
  }

  function showPane(name) {
    $$('.drawer__tab').forEach((t) => t.classList.toggle('is-active', t.dataset.pane === name));
    $$('.drawer__pane').forEach((p) => p.classList.toggle('is-active', p.dataset.pane === name));
  }

  function fillCategorySelect(select, value, includeAuto) {
    select.textContent = '';
    if (includeAuto) select.appendChild(el('option', { value: 'auto', text: '✨ Clasificar automáticamente' }));
    catalog.state.categories.forEach(function (c) {
      select.appendChild(el('option', { value: c.id, text: c.emoji + ' ' + c.name }));
    });
    select.value = value || (includeAuto ? 'auto' : 'sin-clasificar');
  }

  /* ================= compartir ================= */

  async function openShare(id) {
    const doc = catalog.getDoc(id);
    if (!doc) return;
    const html = id === ui.currentId && ui.currentHtml ? ui.currentHtml : await catalog.getContent(id);

    $('#share-doc-title').textContent = doc.title;
    const body = $('#share-body');
    body.textContent = '';
    body.appendChild(el('p', { class: 'field__hint', text: 'Generando enlace…' }));
    openModal('#modal-share');

    const link = await share.buildLink(doc, html);
    body.textContent = '';

    // 1) Enlace autocontenido
    const linkInput = el('input', { type: 'text', readonly: true, value: link.url, 'aria-label': 'Enlace para compartir' });
    body.appendChild(el('div', { class: 'field' }, [
      el('label', { class: 'field__label', text: 'Enlace con el documento dentro' }),
      el('div', { class: 'linkbox' }, [
        linkInput,
        el('button', {
          class: 'btn btn--sm btn--primary', text: 'Copiar',
          onclick: async function () {
            const ok = await U.copyToClipboard(link.url);
            U.toast(ok ? 'Enlace copiado' : 'No se pudo copiar: selecciónalo a mano', ok ? 'ok' : 'error');
          }
        })
      ]),
      el('p', { class: 'field__hint', text: 'El HTML viaja comprimido dentro del propio enlace (' + U.formatBytes(link.length) + '). No se sube nada a ningún servidor.' })
    ]));

    if (link.local) {
      body.appendChild(el('div', { class: 'notice notice--warn', text: 'Estás abriendo la app como archivo local (file://), así que este enlace solo funciona en tu equipo. Para que funcione para otras personas, publica la app (por ejemplo en GitHub Pages) y comparte desde ahí.' }));
    }
    if (link.tooLong) {
      body.appendChild(el('div', { class: 'notice notice--danger', text: 'El documento es muy grande para un enlace: se cortará en casi cualquier aplicación. Comparte mejor el archivo .html.' }));
    } else if (link.warn) {
      body.appendChild(el('div', { class: 'notice notice--warn', text: 'El enlace es largo. WhatsApp, Telegram o el correo suelen aguantarlo, pero algunas aplicaciones cortan enlaces muy largos. Si al abrirlo falla, comparte el archivo.' }));
    }

    // 2) Otras formas
    const actions = el('div', { class: 'row row--wrap', style: 'margin-top:8px' });
    if (navigator.share) {
      actions.appendChild(el('button', {
        class: 'btn', text: '📲 Compartir enlace',
        onclick: async function () {
          try { await share.shareLink(doc, link.url); } catch (e) { if (e && e.name !== 'AbortError') U.toast(e.message || 'No se pudo compartir', 'error'); }
        }
      }));
    }
    if (share.canShareFiles(doc, html)) {
      actions.appendChild(el('button', {
        class: 'btn', text: '📎 Compartir archivo',
        onclick: async function () {
          try { await share.shareFile(doc, html); } catch (e) { if (e && e.name !== 'AbortError') U.toast(e.message || 'No se pudo compartir', 'error'); }
        }
      }));
    }
    actions.appendChild(el('button', { class: 'btn', text: '⬇️ Descargar .html', onclick: () => share.download(doc, html) }));
    actions.appendChild(el('button', {
      class: 'btn', text: '📋 Copiar el código',
      onclick: async function () {
        const ok = await U.copyToClipboard(html);
        U.toast(ok ? 'Código copiado' : 'No se pudo copiar', ok ? 'ok' : 'error');
      }
    }));
    body.appendChild(el('div', { class: 'field' }, [
      el('label', { class: 'field__label', text: 'Otras formas' }),
      actions
    ]));
  }

  /* ================= añadir documentos ================= */

  function wireImportModal() {
    const modal = $('#modal-import');

    $$('#import-tabs button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('#import-tabs button').forEach((b) => b.classList.toggle('is-active', b === btn));
        $$('#modal-import .tabpane').forEach((p) => p.classList.toggle('is-active', p.dataset.tab === btn.dataset.tab));
      });
    });

    bindPicker('#drop-files', '#input-files');
    bindPicker('#drop-folder', '#input-folder');
    bindPicker('#drop-backup', '#input-backup');

    $('#input-files').addEventListener('change', function () { handleFiles(this.files); this.value = ''; });
    $('#input-folder').addEventListener('change', function () { handleFiles(this.files); this.value = ''; });
    $('#input-backup').addEventListener('change', function () { handleFiles(this.files); this.value = ''; });

    ['#drop-files', '#drop-folder', '#drop-backup'].forEach(function (sel) {
      const zone = $(sel);
      zone.addEventListener('dragover', function (ev) { ev.preventDefault(); zone.classList.add('is-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
      zone.addEventListener('drop', async function (ev) {
        ev.preventDefault();
        zone.classList.remove('is-over');
        handleFiles(await importer.filesFromDataTransfer(ev.dataTransfer));
      });
    });

    $('#btn-paste-save').addEventListener('click', async function () {
      const html = $('#paste-code').value.trim();
      if (!html) return U.toast('Pega primero algo de HTML', 'warn');
      const category = $('#import-category').value;
      const res = await importer.importFromText(html, {
        title: $('#paste-title').value.trim() || undefined,
        category: category === 'auto' ? undefined : category
      });
      $('#paste-code').value = '';
      $('#paste-title').value = '';
      closeModal(modal);
      U.toast(res.duplicate ? 'Ese documento ya estaba guardado' : 'Documento guardado', res.duplicate ? 'warn' : 'ok');
      refreshStorageBox();
      if (!res.duplicate) openDoc(res.doc.id);
    });

    $('#btn-url-save').addEventListener('click', async function () {
      const url = $('#url-input').value.trim();
      if (!url) return U.toast('Escribe una dirección', 'warn');
      const btn = this;
      btn.disabled = true;
      btn.textContent = 'Descargando…';
      try {
        const category = $('#import-category').value;
        const res = await importer.importFromUrl(url, { category: category === 'auto' ? undefined : category });
        $('#url-input').value = '';
        closeModal(modal);
        U.toast(res.duplicate ? 'Ese documento ya estaba guardado' : 'Documento guardado', res.duplicate ? 'warn' : 'ok');
        refreshStorageBox();
      } catch (e) {
        U.toast(e.message || 'No se pudo descargar', 'error', 6000);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Descargar y guardar';
      }
    });

  }

  function bindPicker(zoneSel, inputSel) {
    $(zoneSel).addEventListener('click', () => $(inputSel).click());
  }

  function openImportModal() {
    fillCategorySelect($('#import-category'), 'auto', true);
    openModal('#modal-import');
  }

  async function handleFiles(files) {
    const list = Array.prototype.slice.call(files || []);
    if (!list.length) return;

    const box = $('#import-progress');
    const fill = $('#import-progress-fill');
    const text = $('#import-progress-text');
    box.classList.remove('hidden');

    const categoryValue = $('#import-category') ? $('#import-category').value : 'auto';
    const result = await importer.importFiles(list, {
      category: categoryValue === 'auto' ? undefined : categoryValue,
      onProgress: function (done, total, name) {
        fill.style.width = Math.round((done / total) * 100) + '%';
        text.textContent = done + ' de ' + total + ' · ' + name;
      }
    });

    box.classList.add('hidden');
    fill.style.width = '0';
    text.textContent = '';
    closeModal($('#modal-import'));

    const parts = [];
    if (result.added) parts.push(result.added + ' añadidos');
    if (result.restored) parts.push(result.restored + ' restaurados');
    if (result.duplicated) parts.push(result.duplicated + ' repetidos (omitidos)');
    if (result.skipped) parts.push(result.skipped + ' descartados');
    U.toast(parts.length ? parts.join(' · ') : 'No se encontró ningún HTML', result.added || result.restored ? 'ok' : 'warn', 5000);
    if (result.errors.length) {
      U.toast(result.errors.slice(0, 3).join(' | ') + (result.errors.length > 3 ? ' …' : ''), 'error', 7000);
    }
    refreshStorageBox();
  }

  /* arrastrar sobre cualquier punto de la ventana */
  function wireGlobalDrop() {
    const veil = $('#dropveil');
    let depth = 0;

    window.addEventListener('dragenter', function (ev) {
      if (!ev.dataTransfer || Array.prototype.indexOf.call(ev.dataTransfer.types || [], 'Files') === -1) return;
      depth++;
      veil.classList.remove('hidden');
    });
    window.addEventListener('dragover', (ev) => ev.preventDefault());
    window.addEventListener('dragleave', function () {
      depth = Math.max(0, depth - 1);
      if (!depth) veil.classList.add('hidden');
    });
    window.addEventListener('drop', async function (ev) {
      ev.preventDefault();
      depth = 0;
      veil.classList.add('hidden');
      if ($('#gate') && !$('#gate').classList.contains('hidden')) return;
      const files = await importer.filesFromDataTransfer(ev.dataTransfer);
      if (!files.length) return;
      if ($('#modal-import').classList.contains('hidden')) openImportModal();
      handleFiles(files);
    });
  }

  /* ================= categorías ================= */

  function wireCategoriesModal() {
    $('#btn-add-category').addEventListener('click', async function () {
      const name = $('#new-cat-name').value.trim();
      if (!name) return U.toast('Ponle un nombre a la categoría', 'warn');
      await catalog.addCategory(name, $('#new-cat-emoji').value.trim() || '🏷️', $('#new-cat-color').value);
      $('#new-cat-name').value = '';
      $('#new-cat-emoji').value = '🏷️';
      renderCategoriesList();
      U.toast('Categoría creada', 'ok');
    });
  }

  function openCategoriesModal() {
    renderCategoriesList();
    openModal('#modal-categories');
  }

  function renderCategoriesList() {
    const host = $('#categories-list');
    const counts = catalog.countsByCategory();
    host.textContent = '';

    catalog.state.categories.forEach(function (cat) {
      const emoji = el('input', { class: 'input emoji', type: 'text', value: cat.emoji, maxlength: '4', 'aria-label': 'Icono' });
      const name = el('input', { class: 'input', type: 'text', value: cat.name, maxlength: '40', 'aria-label': 'Nombre' });
      const color = el('input', { type: 'color', value: cat.color || '#6d8bff', 'aria-label': 'Color' });

      const save = U.debounce(function () {
        catalog.updateCategory(cat.id, { emoji: emoji.value.trim() || '🏷️', name: name.value.trim() || cat.name, color: color.value });
      }, 350);
      [emoji, name, color].forEach((input) => input.addEventListener('input', save));

      host.appendChild(el('div', { class: 'catrow' }, [
        emoji, name, color,
        el('span', { class: 'navitem__count', text: (counts[cat.id] || 0) + ' docs' }),
        cat.id === 'sin-clasificar' ? null : el('button', {
          class: 'btn btn--ghost btn--icon', title: 'Borrar categoría', text: '🗑️',
          onclick: async function () {
            const n = counts[cat.id] || 0;
            const ok = await confirmDialog({
              title: 'Borrar «' + cat.name + '»',
              text: n ? 'Sus ' + n + ' documentos pasarán a «Sin clasificar». No se borra ningún documento.' : 'La categoría está vacía.',
              okLabel: 'Borrar categoría'
            });
            if (!ok) return;
            await catalog.removeCategory(cat.id);
            renderCategoriesList();
            U.toast('Categoría borrada', 'ok');
          }
        })
      ]));
    });
  }

  /* ================= ajustes ================= */

  function wireSettingsModal() {
    const modal = $('#modal-settings');

    $('#set-theme').addEventListener('change', function () {
      catalog.setSetting('theme', this.checked ? 'light' : 'dark');
    });
    $('#set-previews').addEventListener('change', function () {
      catalog.setSetting('livePreviews', this.checked);
    });
    $('#set-searchcontent').addEventListener('change', function () {
      catalog.setSetting('searchContent', this.checked);
    });

    $('#btn-change-pin').addEventListener('click', async function () {
      const current = $('#set-pin-current').value;
      const next = $('#set-pin-new').value;
      try {
        await auth.changePin(current, next);
        $('#set-pin-current').value = '';
        $('#set-pin-new').value = '';
        U.toast('PIN actualizado', 'ok');
      } catch (e) {
        U.toast(e.message || 'No se pudo cambiar el PIN', 'error');
      }
    });

    $('#btn-backup').addEventListener('click', async function () {
      const data = await catalog.exportBackup();
      const name = 'contenedor-html-' + new Date().toISOString().slice(0, 10) + '.json';
      U.downloadText(JSON.stringify(data, null, 2), name, 'application/json');
      U.toast('Copia de seguridad descargada', 'ok');
    });

    $('#btn-export-zip').addEventListener('click', () => exportZip(catalog.state.docs.map((d) => d.id), 'toda la colección'));

    $('#btn-restore').addEventListener('click', function () {
      closeModal(modal);
      openImportModal();
      const tab = $('#import-tabs button[data-tab="backup"]');
      if (tab) tab.click();
    });

    $('#btn-wipe').addEventListener('click', async function () {
      const ok = await confirmDialog({
        title: 'Borrar todos los documentos',
        text: 'Se eliminarán los ' + catalog.state.docs.length + ' documentos guardados en este navegador. Exporta antes una copia si quieres conservarlos.',
        okLabel: 'Borrar todo'
      });
      if (!ok) return;
      await store.clearDocuments();
      catalog.state.docs = [];
      ui.selection.clear();
      catalog.emit();
      closeModal(modal);
      U.toast('Colección vaciada', 'ok');
      refreshStorageBox();
    });
  }

  async function openSettingsModal() {
    const s = catalog.state.settings;
    $('#set-theme').checked = s.theme === 'light';
    $('#set-previews').checked = !!s.livePreviews;
    $('#set-searchcontent').checked = !!s.searchContent;

    const stats = catalog.stats();
    const grid = $('#stats-grid');
    grid.textContent = '';
    [
      [String(stats.total), 'documentos'],
      [U.formatBytes(stats.size), 'ocupados'],
      [String(stats.favorites), 'favoritos'],
      [String(catalog.state.categories.length), 'categorías']
    ].forEach(function (pair) {
      grid.appendChild(el('div', { class: 'stat' }, [
        el('div', { class: 'stat__value', text: pair[0] }),
        el('div', { class: 'stat__label', text: pair[1] })
      ]));
    });

    const est = await store.estimate();
    const modeText = { idb: 'base de datos del navegador', local: 'almacenamiento reducido', memory: 'solo memoria (no permanente)' }[store.mode];
    $('#storage-detail').textContent = 'Todo se guarda en este navegador (' + modeText + ')' +
      (est && est.quota ? ', con ' + U.formatBytes(est.usage) + ' usados de ' + U.formatBytes(est.quota) + '.' : '.') +
      ' Si borras los datos del navegador, se borra la colección: guarda copias de vez en cuando.';

    const isDefault = await auth.isDefaultPin();
    $('#app-version').textContent = 'Contenedor HTML · v1.0' + (isDefault ? ' · PIN por defecto (9441): cámbialo si lo usas en un equipo compartido.' : '');

    openModal('#modal-settings');
  }

  async function exportZip(ids, label) {
    const docs = ids && ids.length ? ids : catalog.visibleDocs().map((d) => d.id);
    if (!docs.length) return U.toast('No hay nada que exportar', 'warn');
    U.toast('Preparando el ZIP…');
    try {
      const blob = await catalog.exportZip(docs);
      U.downloadBlob(blob, 'contenedor-html-' + new Date().toISOString().slice(0, 10) + '.zip');
      U.toast('ZIP con ' + docs.length + ' documentos descargado (' + (label || '') + ')', 'ok');
    } catch (e) {
      U.toast('No se pudo crear el ZIP: ' + (e.message || e), 'error');
    }
  }

  /* ================= ventanas y confirmación ================= */

  /** Cierre común: fondo oscuro o cualquier elemento con data-close. */
  function wireModals() {
    $$('.modal').forEach(function (modal) {
      modal.addEventListener('click', function (ev) {
        if (ev.target !== modal && !ev.target.closest('[data-close]')) return;
        if (modal.id === 'modal-confirm') resolveConfirm(false);
        else closeModal(modal);
      });
    });
  }

  function openModal(sel) {
    const modal = typeof sel === 'string' ? $(sel) : sel;
    modal.classList.remove('hidden');
    const focusable = modal.querySelector('input:not([type=hidden]), textarea, select, button');
    if (focusable) setTimeout(() => focusable.focus(), 30);
  }

  function closeModal(modal) {
    (typeof modal === 'string' ? $(modal) : modal).classList.add('hidden');
  }

  function wireConfirmModal() {
    $('#confirm-ok').addEventListener('click', () => resolveConfirm(true));
  }

  function resolveConfirm(value) {
    closeModal($('#modal-confirm'));
    if (ui.pendingConfirm) {
      ui.pendingConfirm(value);
      ui.pendingConfirm = null;
    }
  }

  function confirmDialog(options) {
    $('#confirm-title').textContent = options.title || '¿Seguro?';
    $('#confirm-text').textContent = options.text || '';
    $('#confirm-ok').textContent = options.okLabel || 'Confirmar';
    openModal('#modal-confirm');
    return new Promise(function (resolve) { ui.pendingConfirm = resolve; });
  }

  /* ================= atajos de teclado ================= */

  function wireShortcuts() {
    document.addEventListener('keydown', function (ev) {
      const typing = /^(input|textarea|select)$/i.test((ev.target.tagName || ''));

      if (ev.key === 'Escape') {
        const openModals = $$('.modal:not(.hidden)');
        if (openModals.length) {
          const top = openModals[openModals.length - 1];
          if (top.id === 'modal-confirm') resolveConfirm(false);
          else closeModal(top);
          return;
        }
        if (!$('#drawer').classList.contains('hidden')) { closeDrawer(); return; }
        if (ui.selection.size) { ui.selection.clear(); renderContent(); return; }
        return;
      }

      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        $('#search').focus();
        $('#search').select();
        return;
      }

      if (typing) return;

      if (ev.key === '/') { ev.preventDefault(); $('#search').focus(); }
      else if (ev.key.toLowerCase() === 'n') { ev.preventDefault(); openImportModal(); }
    });
  }

  return {
    init, render, renderContent, openDoc, openShare, openImportModal,
    refreshStorageBox, confirmDialog, fillCategorySelect, applyTheme
  };
})();
