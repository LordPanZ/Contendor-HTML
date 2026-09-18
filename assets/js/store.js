/* Contenedor HTML — capa de almacenamiento (IndexedDB con reserva en localStorage) */
window.CH = window.CH || {};

CH.store = (function () {
  'use strict';

  const DB_NAME = 'contenedor-html';
  const DB_VERSION = 1;
  const S_DOCS = 'docs';        // metadatos (listados rápidos)
  const S_CONTENT = 'contents'; // el HTML completo, aparte
  const S_KV = 'kv';            // ajustes, categorías, hash del PIN

  let db = null;
  let mode = 'idb'; // 'idb' | 'local' | 'memory'
  let lastError = null;

  /* ---------------- IndexedDB ---------------- */

  function openIDB() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('IndexedDB no disponible'));
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        return reject(e);
      }
      req.onupgradeneeded = function (ev) {
        const database = ev.target.result;
        if (!database.objectStoreNames.contains(S_DOCS)) {
          const s = database.createObjectStore(S_DOCS, { keyPath: 'id' });
          s.createIndex('category', 'category', { unique: false });
          s.createIndex('updatedAt', 'updatedAt', { unique: false });
          s.createIndex('hash', 'hash', { unique: false });
        }
        if (!database.objectStoreNames.contains(S_CONTENT)) {
          database.createObjectStore(S_CONTENT, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(S_KV)) {
          database.createObjectStore(S_KV, { keyPath: 'k' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('No se pudo abrir la base de datos')); };
      req.onblocked = function () { reject(new Error('La base de datos está bloqueada por otra pestaña')); };
    });
  }

  function tx(storeNames, mode_, fn) {
    return new Promise(function (resolve, reject) {
      let t;
      try {
        t = db.transaction(storeNames, mode_);
      } catch (e) { return reject(e); }
      let result;
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error || new Error('Error de transacción'));
      t.onabort = () => reject(t.error || new Error('Transacción cancelada'));
      try {
        result = fn(t);
      } catch (e) {
        try { t.abort(); } catch (e2) { /* ya cancelada */ }
        reject(e);
      }
    });
  }

  function reqAsPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /* ---------------- reserva: localStorage / memoria ---------------- */

  const mem = { docs: {}, contents: {}, kv: {} };
  const LS_PREFIX = 'ch:';

  const localBackend = {
    read: function (bucket, key) {
      try {
        const raw = localStorage.getItem(LS_PREFIX + bucket + ':' + key);
        return raw === null ? undefined : JSON.parse(raw);
      } catch (e) { return mem[bucket][key]; }
    },
    write: function (bucket, key, value) {
      try {
        localStorage.setItem(LS_PREFIX + bucket + ':' + key, JSON.stringify(value));
      } catch (e) {
        mem[bucket][key] = value;
        throw e;
      }
      mem[bucket][key] = value;
    },
    remove: function (bucket, key) {
      try { localStorage.removeItem(LS_PREFIX + bucket + ':' + key); } catch (e) { /* ignorado */ }
      delete mem[bucket][key];
    },
    keys: function (bucket) {
      const prefix = LS_PREFIX + bucket + ':';
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf(prefix) === 0) out.push(k.slice(prefix.length));
        }
      } catch (e) { /* usamos memoria */ }
      Object.keys(mem[bucket]).forEach((k) => { if (out.indexOf(k) === -1) out.push(k); });
      return out;
    }
  };

  function localAvailable() {
    try {
      const probe = LS_PREFIX + 'probe';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- API pública ---------------- */

  async function init() {
    try {
      db = await openIDB();
      mode = 'idb';
    } catch (e) {
      lastError = e;
      db = null;
      mode = localAvailable() ? 'local' : 'memory';
    }
    return mode;
  }

  async function listDocs() {
    if (mode === 'idb') {
      return tx([S_DOCS], 'readonly', (t) => {
        const out = [];
        t.objectStore(S_DOCS).openCursor().onsuccess = function (ev) {
          const cur = ev.target.result;
          if (cur) { out.push(cur.value); cur.continue(); }
        };
        return out;
      });
    }
    return localBackend.keys('docs').map((k) => localBackend.read('docs', k)).filter(Boolean);
  }

  async function getDoc(id) {
    if (mode === 'idb') {
      return new Promise(function (resolve, reject) {
        let t;
        try { t = db.transaction([S_DOCS], 'readonly'); } catch (e) { return reject(e); }
        const r = t.objectStore(S_DOCS).get(id);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }).catch(() => undefined);
    }
    return localBackend.read('docs', id);
  }

  async function getContent(id) {
    if (mode === 'idb') {
      const rec = await new Promise(function (resolve, reject) {
        let t;
        try { t = db.transaction([S_CONTENT], 'readonly'); } catch (e) { return reject(e); }
        const r = t.objectStore(S_CONTENT).get(id);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      return rec ? rec.html : '';
    }
    const rec = localBackend.read('contents', id);
    return rec ? rec.html : '';
  }

  /** Guarda metadatos y contenido de una sola vez. */
  async function putDoc(doc, html) {
    if (mode === 'idb') {
      return tx([S_DOCS, S_CONTENT], 'readwrite', function (t) {
        t.objectStore(S_DOCS).put(doc);
        if (typeof html === 'string') t.objectStore(S_CONTENT).put({ id: doc.id, html: html });
        return doc;
      });
    }
    if (typeof html === 'string') localBackend.write('contents', doc.id, { id: doc.id, html: html });
    localBackend.write('docs', doc.id, doc);
    return doc;
  }

  /** Solo metadatos (renombrar, cambiar categoría, etiquetas...). */
  async function updateDoc(doc) {
    return putDoc(doc, undefined);
  }

  async function deleteDoc(id) {
    if (mode === 'idb') {
      return tx([S_DOCS, S_CONTENT], 'readwrite', function (t) {
        t.objectStore(S_DOCS).delete(id);
        t.objectStore(S_CONTENT).delete(id);
      });
    }
    localBackend.remove('docs', id);
    localBackend.remove('contents', id);
  }

  async function getKV(key, fallback) {
    if (mode === 'idb') {
      const rec = await new Promise(function (resolve, reject) {
        let t;
        try { t = db.transaction([S_KV], 'readonly'); } catch (e) { return reject(e); }
        const r = t.objectStore(S_KV).get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }).catch(() => undefined);
      return rec === undefined || rec === null ? fallback : rec.v;
    }
    const v = localBackend.read('kv', key);
    return v === undefined ? fallback : v;
  }

  async function setKV(key, value) {
    if (mode === 'idb') {
      return tx([S_KV], 'readwrite', (t) => { t.objectStore(S_KV).put({ k: key, v: value }); });
    }
    localBackend.write('kv', key, value);
  }

  async function clearDocuments() {
    if (mode === 'idb') {
      return tx([S_DOCS, S_CONTENT], 'readwrite', function (t) {
        t.objectStore(S_DOCS).clear();
        t.objectStore(S_CONTENT).clear();
      });
    }
    localBackend.keys('docs').forEach((k) => localBackend.remove('docs', k));
    localBackend.keys('contents').forEach((k) => localBackend.remove('contents', k));
  }

  async function estimate() {
    if (navigator.storage && navigator.storage.estimate) {
      try { return await navigator.storage.estimate(); } catch (e) { /* sin datos */ }
    }
    return null;
  }

  async function requestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
      try { return await navigator.storage.persist(); } catch (e) { return false; }
    }
    return false;
  }

  return {
    init, listDocs, getDoc, getContent, putDoc, updateDoc, deleteDoc,
    getKV, setKV, clearDocuments, estimate, requestPersistence, reqAsPromise,
    get mode() { return mode; },
    get lastError() { return lastError; }
  };
})();
