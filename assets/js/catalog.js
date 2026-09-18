/* HTML Container — catálogo: estado, categorías, filtros, copias de seguridad */
window.CH = window.CH || {};

CH.catalog = (function () {
  'use strict';

  const U = CH.util;
  const store = CH.store;

  const DEFAULT_CATEGORIES = [
    { id: 'sin-clasificar', name: 'Sin clasificar', emoji: '📦', color: '#8b93a7' },
    { id: 'apps', name: 'Apps y herramientas', emoji: '🛠️', color: '#6d8bff' },
    { id: 'dashboards', name: 'Paneles e informes', emoji: '📊', color: '#22c55e' },
    { id: 'juegos', name: 'Juegos', emoji: '🎮', color: '#f97316' },
    { id: 'webs', name: 'Webs y landings', emoji: '🌐', color: '#06b6d4' },
    { id: 'documentos', name: 'Documentos y notas', emoji: '📄', color: '#a855f7' },
    { id: 'presentaciones', name: 'Presentaciones', emoji: '🎬', color: '#ec4899' },
    { id: 'pruebas', name: 'Pruebas y plantillas', emoji: '🧪', color: '#eab308' }
  ];

  const DEFAULT_SETTINGS = {
    theme: 'dark',
    view: 'grid',
    sort: 'updated-desc',
    livePreviews: false,
    searchContent: true
  };

  // Reglas sencillas para proponer categoría al importar.
  const RULES = [
    { id: 'juegos', words: ['<canvas', 'requestanimationframe', 'juego', 'game', 'puntuacion', 'score', 'player', 'sprite', 'nivel ', 'gameover'] },
    { id: 'dashboards', words: ['chart.js', 'chartjs', 'echarts', 'd3.min.js', 'dashboard', 'panel de control', 'kpi', 'informe', 'report', 'grafico', 'gráfico', 'estadistic', 'estadístic'] },
    { id: 'presentaciones', words: ['reveal.js', 'impress.js', 'slide', 'diapositiva', 'presentacion', 'presentación', 'deck'] },
    { id: 'apps', words: ['calculadora', 'conversor', 'generador', 'herramienta', 'localstorage', 'addeventlistener', 'formulario', '<form', 'todo list', 'tareas', 'temporizador', 'cronometro', 'cronómetro'] },
    { id: 'webs', words: ['<nav', '<footer', 'hero', 'landing', 'portfolio', 'portafolio', 'inicio', 'contacto', 'precios', 'pricing'] },
    { id: 'documentos', words: ['<article', 'documentacion', 'documentación', 'manual', 'guia', 'guía', 'apuntes', 'notas', 'readme', 'curriculum', 'currículum', 'factura'] },
    { id: 'pruebas', words: ['lorem ipsum', 'prueba', 'test ', 'ejemplo', 'plantilla', 'template', 'boilerplate'] }
  ];

  const state = {
    docs: [],
    categories: DEFAULT_CATEGORIES.slice(),
    settings: Object.assign({}, DEFAULT_SETTINGS),
    filter: { query: '', category: 'all', tag: '', favorites: false }
  };

  const listeners = [];
  const onChange = (fn) => listeners.push(fn);
  const emit = () => listeners.forEach((fn) => fn(state));

  /* ---------------- carga inicial ---------------- */

  async function load() {
    const [cats, settings, docs] = await Promise.all([
      store.getKV('categories', null),
      store.getKV('settings', null),
      store.listDocs()
    ]);
    state.categories = Array.isArray(cats) && cats.length ? cats : DEFAULT_CATEGORIES.slice();
    state.settings = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    state.docs = (docs || []).map(normalizeDoc);
    return state;
  }

  function normalizeDoc(d) {
    return Object.assign({
      id: U.uid(),
      title: 'Sin título',
      description: '',
      category: 'sin-clasificar',
      tags: [],
      favorite: false,
      trusted: false,
      size: 0,
      hash: '',
      source: '',
      excerpt: '',
      opens: 0,
      openedAt: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }, d, { tags: Array.isArray(d.tags) ? d.tags : [] });
  }

  /* ---------------- categorías ---------------- */

  const getCategory = (id) => state.categories.find((c) => c.id === id) || state.categories[0];

  function slugify(name) {
    return String(name).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'categoria';
  }

  async function saveCategories(cats) {
    state.categories = cats;
    await store.setKV('categories', cats);
    emit();
  }

  async function addCategory(name, emoji, color) {
    let id = slugify(name);
    let n = 2;
    while (state.categories.some((c) => c.id === id)) id = slugify(name) + '-' + n++;
    const cat = { id: id, name: String(name).trim().slice(0, 40), emoji: emoji || '🏷️', color: color || '#6d8bff' };
    await saveCategories(state.categories.concat([cat]));
    return cat;
  }

  async function updateCategory(id, patch) {
    await saveCategories(state.categories.map((c) => (c.id === id ? Object.assign({}, c, patch) : c)));
  }

  /** Borra la categoría y devuelve sus documentos a "Sin clasificar". */
  async function removeCategory(id) {
    if (id === 'sin-clasificar') throw new Error('La categoría por defecto no se puede borrar.');
    const affected = state.docs.filter((d) => d.category === id);
    for (const doc of affected) {
      doc.category = 'sin-clasificar';
      doc.updatedAt = Date.now();
      await store.updateDoc(strip(doc));
    }
    await saveCategories(state.categories.filter((c) => c.id !== id));
    return affected.length;
  }

  /* ---------------- clasificación automática ---------------- */

  function suggestCategory(title, html) {
    const hay = (String(title) + ' ' + String(html).slice(0, 60000)).toLowerCase();
    let best = null, bestScore = 0;
    RULES.forEach(function (rule) {
      if (!state.categories.some((c) => c.id === rule.id)) return;
      let score = 0;
      rule.words.forEach(function (w) { if (hay.indexOf(w) !== -1) score++; });
      if (score > bestScore) { bestScore = score; best = rule.id; }
    });
    return bestScore >= 2 ? best : 'sin-clasificar';
  }

  /* ---------------- documentos ---------------- */

  const strip = (doc) => {
    const copy = Object.assign({}, doc);
    delete copy.html;
    return copy;
  };

  async function addDocument(input) {
    const html = String(input.html || '');
    const hash = await U.sha256Hex(html);
    const existing = state.docs.find((d) => d.hash === hash);
    if (existing && !input.allowDuplicate) return { doc: existing, duplicate: true };

    const title = input.title || U.extractTitle(html, input.source ? input.source.replace(/\.[^.]+$/, '') : 'Sin título');
    const doc = normalizeDoc({
      id: U.uid(),
      title: title,
      description: input.description || '',
      category: input.category || suggestCategory(title, html),
      tags: input.tags || [],
      source: input.source || '',
      size: new Blob([html]).size,
      hash: hash,
      excerpt: U.textExcerpt(html, 4000),
      createdAt: input.createdAt || Date.now(),
      updatedAt: Date.now()
    });
    await store.putDoc(strip(doc), html);
    state.docs.push(doc);
    emit();
    return { doc: doc, duplicate: false };
  }

  async function updateDocument(id, patch) {
    const doc = state.docs.find((d) => d.id === id);
    if (!doc) return null;
    Object.assign(doc, patch, { updatedAt: Date.now() });
    await store.updateDoc(strip(doc));
    emit();
    return doc;
  }

  async function replaceContent(id, html) {
    const doc = state.docs.find((d) => d.id === id);
    if (!doc) return null;
    doc.size = new Blob([html]).size;
    doc.hash = await U.sha256Hex(html);
    doc.excerpt = U.textExcerpt(html, 4000);
    doc.updatedAt = Date.now();
    await store.putDoc(strip(doc), html);
    emit();
    return doc;
  }

  async function removeDocument(id) {
    await store.deleteDoc(id);
    state.docs = state.docs.filter((d) => d.id !== id);
    emit();
  }

  async function markOpened(id) {
    const doc = state.docs.find((d) => d.id === id);
    if (!doc) return;
    doc.opens = (doc.opens || 0) + 1;
    doc.openedAt = Date.now();
    await store.updateDoc(strip(doc));
  }

  const getContent = (id) => store.getContent(id);
  const getDoc = (id) => state.docs.find((d) => d.id === id);

  /* ---------------- filtros y orden ---------------- */

  function allTags() {
    const counts = Object.create(null);
    state.docs.forEach((d) => (d.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }));
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, 'es'))
      .map((t) => ({ tag: t, count: counts[t] }));
  }

  function countsByCategory() {
    const counts = Object.create(null);
    state.docs.forEach((d) => { counts[d.category] = (counts[d.category] || 0) + 1; });
    return counts;
  }

  function normalize(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function visibleDocs() {
    const f = state.filter;
    const q = normalize(f.query.trim());
    const terms = q ? q.split(/\s+/) : [];
    const searchContent = state.settings.searchContent;

    const list = state.docs.filter(function (d) {
      if (f.favorites && !d.favorite) return false;
      if (f.category !== 'all' && d.category !== f.category) return false;
      if (f.tag && (d.tags || []).indexOf(f.tag) === -1) return false;
      if (!terms.length) return true;
      const hay = normalize(
        d.title + ' ' + d.description + ' ' + (d.tags || []).join(' ') + ' ' + d.source +
        (searchContent ? ' ' + d.excerpt : '')
      );
      return terms.every((t) => hay.indexOf(t) !== -1);
    });

    const by = {
      'updated-desc': (a, b) => b.updatedAt - a.updatedAt,
      'updated-asc': (a, b) => a.updatedAt - b.updatedAt,
      'created-desc': (a, b) => b.createdAt - a.createdAt,
      'title-asc': (a, b) => a.title.localeCompare(b.title, 'es'),
      'title-desc': (a, b) => b.title.localeCompare(a.title, 'es'),
      'size-desc': (a, b) => b.size - a.size,
      'opens-desc': (a, b) => (b.opens || 0) - (a.opens || 0)
    };
    return list.sort(by[state.settings.sort] || by['updated-desc']);
  }

  function stats() {
    const total = state.docs.length;
    const size = state.docs.reduce((n, d) => n + (d.size || 0), 0);
    const favorites = state.docs.filter((d) => d.favorite).length;
    const categories = Object.keys(countsByCategory()).length;
    return { total: total, size: size, favorites: favorites, categories: categories };
  }

  /* ---------------- ajustes ---------------- */

  async function setSetting(key, value) {
    state.settings[key] = value;
    await store.setKV('settings', state.settings);
    emit();
  }

  function setFilter(patch) {
    Object.assign(state.filter, patch);
    emit();
  }

  /* ---------------- copia de seguridad y exportación ---------------- */

  async function exportBackup(ids) {
    const docs = ids && ids.length ? state.docs.filter((d) => ids.indexOf(d.id) !== -1) : state.docs;
    const documents = [];
    for (const d of docs) {
      documents.push(Object.assign({}, strip(d), { html: await store.getContent(d.id) }));
    }
    return {
      app: 'contenedor-html',
      version: 1,
      exportedAt: new Date().toISOString(),
      categories: state.categories,
      documents: documents
    };
  }

  async function importBackup(data, options) {
    const opts = options || {};
    if (!data || !Array.isArray(data.documents)) throw new Error('El archivo no tiene el formato esperado.');

    if (Array.isArray(data.categories) && opts.mergeCategories !== false) {
      const merged = state.categories.slice();
      data.categories.forEach(function (c) {
        if (c && c.id && !merged.some((x) => x.id === c.id)) merged.push(c);
      });
      await saveCategories(merged);
    }

    let added = 0, skipped = 0;
    for (const raw of data.documents) {
      if (!raw || typeof raw.html !== 'string') { skipped++; continue; }
      const res = await addDocument({
        html: raw.html,
        title: raw.title,
        description: raw.description,
        category: state.categories.some((c) => c.id === raw.category) ? raw.category : undefined,
        tags: raw.tags,
        source: raw.source,
        createdAt: raw.createdAt
      });
      if (res.duplicate) skipped++; else added++;
      if (res.doc && raw.favorite && !res.duplicate) await updateDocument(res.doc.id, { favorite: true });
    }
    return { added: added, skipped: skipped };
  }

  async function exportZip(ids) {
    const docs = ids && ids.length ? state.docs.filter((d) => ids.indexOf(d.id) !== -1) : visibleDocs();
    const entries = [];
    const manifest = [];

    for (const d of docs) {
      const cat = getCategory(d.category);
      const folder = U.safeFileName(cat.name);
      const name = folder + '/' + U.safeFileName(d.title, '.html');
      entries.push({ name: name, data: await store.getContent(d.id), date: new Date(d.updatedAt || Date.now()) });
      manifest.push({ archivo: name, titulo: d.title, categoria: cat.name, etiquetas: d.tags, creado: new Date(d.createdAt).toISOString() });
    }

    entries.push({ name: 'catalogo.html', data: buildCatalogPage(docs) });
    entries.push({ name: 'manifiesto.json', data: JSON.stringify(manifest, null, 2) });
    return CH.zip.create(entries);
  }

  /** Índice navegable que se incluye dentro del ZIP exportado. */
  function buildCatalogPage(docs) {
    const rows = docs.map(function (d) {
      const cat = getCategory(d.category);
      const href = U.safeFileName(cat.name) + '/' + U.safeFileName(d.title, '.html');
      return '<tr><td><a href="' + U.escapeHtml(encodeURI(href)) + '">' + U.escapeHtml(d.title) + '</a></td>' +
        '<td>' + U.escapeHtml(cat.emoji + ' ' + cat.name) + '</td>' +
        '<td>' + U.escapeHtml((d.tags || []).join(', ')) + '</td>' +
        '<td>' + U.escapeHtml(U.formatBytes(d.size)) + '</td>' +
        '<td>' + U.escapeHtml(U.formatDate(d.createdAt)) + '</td></tr>';
    }).join('\n');

    return '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>Catálogo de HTML</title>\n<style>\n' +
      'body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:32px;background:#0f1115;color:#e7e9ee}\n' +
      'h1{font-size:24px;margin:0 0 4px}p.sub{color:#8b93a7;margin:0 0 24px}\n' +
      'table{border-collapse:collapse;width:100%;max-width:1100px}\n' +
      'th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #232734;font-size:14px}\n' +
      'th{color:#8b93a7;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.06em}\n' +
      'a{color:#8fa7ff;text-decoration:none}a:hover{text-decoration:underline}\n' +
      '@media(prefers-color-scheme:light){body{background:#f6f7f9;color:#1b1e26}th,td{border-color:#e3e6ec}a{color:#3457d5}}\n' +
      '</style>\n</head>\n<body>\n<h1>Catálogo de HTML</h1>\n<p class="sub">' + docs.length +
      ' documentos · exportado el ' + U.escapeHtml(U.formatDate(Date.now())) + '</p>\n' +
      '<table>\n<thead><tr><th>Documento</th><th>Categoría</th><th>Etiquetas</th><th>Tamaño</th><th>Creado</th></tr></thead>\n' +
      '<tbody>\n' + rows + '\n</tbody>\n</table>\n</body>\n</html>';
  }

  return {
    state, load, onChange, emit,
    DEFAULT_CATEGORIES,
    getCategory, addCategory, updateCategory, removeCategory, saveCategories, slugify,
    suggestCategory, addDocument, updateDocument, replaceContent, removeDocument, markOpened,
    getContent, getDoc, allTags, countsByCategory, visibleDocs, stats,
    setSetting, setFilter, exportBackup, importBackup, exportZip, buildCatalogPage
  };
})();
