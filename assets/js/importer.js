/* Contenedor HTML — importación desde archivos, carpetas, arrastrar y soltar, URL o texto */
window.CH = window.CH || {};

CH.importer = (function () {
  'use strict';

  const U = CH.util;
  const catalog = CH.catalog;

  const HTML_EXT = /\.(html?|xhtml|shtml)$/i;
  const MAX_FILE_BYTES = 12 * 1024 * 1024;

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('No se pudo leer ' + file.name));
      reader.readAsText(file, 'utf-8');
    });
  }

  const isBackup = (file) => /\.(json|chtml)$/i.test(file.name);
  const isHtmlFile = (file) => HTML_EXT.test(file.name) || /html/i.test(file.type || '');

  /**
   * Importa una lista de archivos. Devuelve un resumen y avisa del progreso.
   * options: { category, tags, onProgress(done,total,name), allowDuplicate }
   */
  async function importFiles(files, options) {
    const opts = options || {};
    const list = Array.prototype.slice.call(files || []);
    const result = { added: 0, duplicated: 0, skipped: 0, restored: 0, errors: [] };
    let done = 0;

    for (const file of list) {
      done++;
      if (opts.onProgress) opts.onProgress(done, list.length, file.name);
      try {
        if (file.size > MAX_FILE_BYTES) {
          result.errors.push(file.name + ': supera los ' + U.formatBytes(MAX_FILE_BYTES));
          result.skipped++;
          continue;
        }
        if (isBackup(file)) {
          const data = JSON.parse(await readFileAsText(file));
          const res = await catalog.importBackup(data);
          result.restored += res.added;
          result.duplicated += res.skipped;
          continue;
        }
        if (!isHtmlFile(file)) { result.skipped++; continue; }

        const html = await readFileAsText(file);
        if (!html.trim()) { result.skipped++; continue; }

        const relPath = file.webkitRelativePath || file.relativePath || '';
        const res = await catalog.addDocument({
          html: html,
          source: relPath || file.name,
          category: opts.category || undefined,
          tags: (opts.tags || []).concat(folderTags(relPath)),
          createdAt: file.lastModified || Date.now(),
          allowDuplicate: opts.allowDuplicate
        });
        if (res.duplicate) result.duplicated++; else result.added++;
      } catch (err) {
        result.errors.push(file.name + ': ' + (err && err.message ? err.message : 'error al importar'));
      }
    }
    return result;
  }

  /** Usa el nombre de la carpeta contenedora como etiqueta, al importar carpetas enteras. */
  function folderTags(relPath) {
    if (!relPath) return [];
    const parts = relPath.split('/').filter(Boolean);
    parts.pop();
    const folder = parts.pop();
    return folder ? [folder.toLowerCase().slice(0, 30)] : [];
  }

  /** Recorre carpetas arrastradas para sacar todos los archivos. */
  function walkEntry(entry, path, out) {
    return new Promise(function (resolve) {
      if (!entry) return resolve();
      if (entry.isFile) {
        entry.file(function (file) {
          try { file.relativePath = (path || '') + file.name; } catch (e) { /* solo lectura en algunos navegadores */ }
          out.push(file);
          resolve();
        }, resolve);
        return;
      }
      if (entry.isDirectory) {
        const reader = entry.createReader();
        const entries = [];
        const readBatch = function () {
          reader.readEntries(function (batch) {
            if (!batch.length) {
              Promise.all(entries.map((e) => walkEntry(e, (path || '') + entry.name + '/', out))).then(resolve);
              return;
            }
            entries.push.apply(entries, batch);
            readBatch();
          }, resolve);
        };
        readBatch();
        return;
      }
      resolve();
    });
  }

  async function filesFromDataTransfer(dt) {
    const items = dt.items ? Array.prototype.slice.call(dt.items) : [];
    const canWalk = items.length && typeof items[0].webkitGetAsEntry === 'function';
    if (!canWalk) return Array.prototype.slice.call(dt.files || []);

    const entries = items
      .filter((it) => it.kind === 'file')
      .map((it) => it.webkitGetAsEntry())
      .filter(Boolean);
    if (!entries.length) return Array.prototype.slice.call(dt.files || []);

    const out = [];
    await Promise.all(entries.map((e) => walkEntry(e, '', out)));
    return out;
  }

  /** Una descarga suelta puede fallar por la red (móvil, wifi flojo): reintentamos. */
  async function conReintentos(tarea, intentos) {
    const veces = intentos || 3;
    let ultimo = null;
    for (let i = 0; i < veces; i++) {
      try {
        return await tarea();
      } catch (err) {
        ultimo = err;
        if (i < veces - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    throw ultimo;
  }

  /**
   * Importa los archivos elegidos de un origen remoto (GitHub o Netlify).
   * listado: lo que devuelve CH.sources.listar · seleccion: subconjunto de listado.archivos
   * options: { category, tags, onProgress(hechos, total, ruta) }
   */
  async function importFromSource(listado, seleccion, options) {
    const opts = options || {};
    const result = { added: 0, duplicated: 0, skipped: 0, errors: [] };
    let done = 0;

    for (const archivo of seleccion) {
      done++;
      if (opts.onProgress) opts.onProgress(done, seleccion.length, archivo.ruta);
      try {
        if (archivo.tamano > MAX_FILE_BYTES) {
          result.errors.push(archivo.nombre + ': supera los ' + U.formatBytes(MAX_FILE_BYTES));
          result.skipped++;
          continue;
        }
        const html = await conReintentos(() => CH.sources.descargar(listado, archivo));
        if (!html || !html.trim()) { result.skipped++; continue; }

        const etiquetas = (opts.tags || []).slice();
        if (listado.etiqueta && etiquetas.indexOf(listado.etiqueta) === -1) etiquetas.push(listado.etiqueta);

        const res = await catalog.addDocument({
          html: html,
          source: archivo.origen,
          category: opts.category || undefined,
          tags: etiquetas
        });
        if (res.duplicate) result.duplicated++; else result.added++;
      } catch (err) {
        result.errors.push(archivo.nombre + ': ' + (err && err.message ? err.message : 'error al importar'));
      }
    }
    return result;
  }

  async function importFromText(html, meta) {
    const info = meta || {};
    return catalog.addDocument({
      html: html,
      title: info.title,
      description: info.description,
      category: info.category,
      tags: info.tags || [],
      source: info.source || 'pegado a mano',
      allowDuplicate: info.allowDuplicate
    });
  }

  async function importFromUrl(url, options) {
    const opts = options || {};
    let response;
    try {
      response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    } catch (e) {
      throw new Error('No se pudo descargar. Muchas webs bloquean la descarga desde otro sitio (CORS): descarga el archivo y añádelo como archivo.');
    }
    if (!response.ok) throw new Error('El servidor respondió ' + response.status);
    const html = await response.text();
    if (!U.looksLikeHtml(html)) throw new Error('Lo descargado no parece HTML.');
    let name = 'descargado';
    try { name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || 'descargado'); } catch (e) { /* url rara */ }
    return catalog.addDocument({
      html: html,
      source: url,
      title: opts.title || U.extractTitle(html, name.replace(/\.[^.]+$/, '')),
      category: opts.category,
      tags: opts.tags || []
    });
  }

  return {
    importFiles, importFromText, importFromUrl, importFromSource, filesFromDataTransfer,
    readFileAsText, isHtmlFile, isBackup, MAX_FILE_BYTES
  };
})();
