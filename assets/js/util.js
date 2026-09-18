/* Contenedor HTML — utilidades comunes */
window.CH = window.CH || {};

CH.util = (function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'dataset') Object.keys(v).forEach((d) => (node.dataset[d] = v[d]));
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function escapeHtml(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function formatBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function formatDate(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('es-ES', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  function relTime(ts) {
    if (!ts) return '—';
    const min = Math.round((Date.now() - ts) / 60000);
    if (min < 1) return 'ahora mismo';
    if (min < 60) return 'hace ' + min + ' min';
    const h = Math.round(min / 60);
    if (h < 24) return 'hace ' + h + ' h';
    const d = Math.round(h / 24);
    if (d < 31) return 'hace ' + d + ' d';
    return formatDate(ts).split(',')[0];
  }

  function debounce(fn, wait) {
    let t = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), wait || 200);
    };
  }

  /* ---------- huellas ---------- */

  async function sha256Hex(str) {
    const data = new TextEncoder().encode(str);
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      const buf = await crypto.subtle.digest('SHA-256', data);
      return Array.prototype.map.call(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Reserva mínima para contextos sin WebCrypto (por ejemplo file:// en navegadores antiguos)
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < data.length; i++) {
      h1 = (h1 ^ data[i]) >>> 0;
      h1 = (h1 * 16777619) >>> 0;
      h2 = (h2 + data[i] * (i + 7)) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }

  /* ---------- base64url y compresión ---------- */

  function bytesToB64(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  const toB64url = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fromB64url = (s) => {
    const t = s.replace(/-/g, '+').replace(/_/g, '/');
    return t + '==='.slice((t.length + 3) % 4);
  };

  async function gzipBytes(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function gunzipBytes(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede descomprimir el enlace.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Empaqueta texto en una cadena apta para URL. Prefijo "g." comprimido, "r." en crudo. */
  async function packText(text) {
    const raw = new TextEncoder().encode(text);
    const gz = await gzipBytes(raw);
    if (gz && gz.length < raw.length) return 'g.' + toB64url(bytesToB64(gz));
    return 'r.' + toB64url(bytesToB64(raw));
  }

  async function unpackText(packed) {
    const sep = packed.indexOf('.');
    const kind = sep > 0 ? packed.slice(0, sep) : 'r';
    const body = sep > 0 ? packed.slice(sep + 1) : packed;
    const bytes = b64ToBytes(fromB64url(body));
    const out = kind === 'g' ? await gunzipBytes(bytes) : bytes;
    return new TextDecoder().decode(out);
  }

  /* ---------- HTML ---------- */

  function stripTags(html) {
    return String(html).replace(/<[^>]*>/g, ' ');
  }

  function decodeEntities(str) {
    const ta = document.createElement('textarea');
    ta.innerHTML = str;
    return ta.value;
  }

  function extractTitle(html, fallback) {
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (m && m[1].trim()) return decodeEntities(m[1].trim()).replace(/\s+/g, ' ').slice(0, 160);
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    if (h1) {
      const t = decodeEntities(stripTags(h1[1])).replace(/\s+/g, ' ').trim();
      if (t) return t.slice(0, 160);
    }
    return fallback || 'Sin título';
  }

  /** Texto plano reducido: permite buscar dentro del contenido sin cargarlo entero. */
  function textExcerpt(html, max) {
    const cleaned = String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ');
    return decodeEntities(cleaned).replace(/\s+/g, ' ').trim().slice(0, max || 4000);
  }

  function looksLikeHtml(text) {
    return /<\s*(!doctype|html|head|body|div|section|h1|p|script|style|table|canvas|svg)\b/i.test(text || '');
  }

  /* ---------- archivos ---------- */

  function safeFileName(name, ext) {
    let base = String(name || 'documento')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/[^\x20-\x7e\xa0-￿]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    if (!base || base === '.' || base === '..') base = 'documento';
    return ext ? base + ext : base;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function downloadText(text, filename, type) {
    downloadBlob(new Blob([text], { type: type || 'text/html;charset=utf-8' }), filename);
  }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* usamos la reserva de abajo */ }
    const ta = el('textarea', { style: 'position:fixed;top:-1000px;opacity:0' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  /* ---------- avisos ---------- */

  function toast(message, kind, ms) {
    let host = $('#toasts');
    if (!host) {
      host = el('div', { id: 'toasts', class: 'toasts' });
      document.body.appendChild(host);
    }
    const life = ms || 3200;
    const node = el('div', { class: 'toast toast--' + (kind || 'info') }, [
      el('span', { class: 'toast__dot' }),
      el('span', { text: message })
    ]);
    host.appendChild(node);
    setTimeout(() => node.classList.add('is-out'), life - 300);
    setTimeout(() => node.remove(), life);
  }

  return {
    $, $$, el, escapeHtml, uid, formatBytes, formatDate, relTime, debounce,
    sha256Hex, bytesToB64, b64ToBytes, toB64url, fromB64url, packText, unpackText,
    extractTitle, stripTags, textExcerpt, looksLikeHtml, decodeEntities,
    safeFileName, downloadBlob, downloadText, copyToClipboard, toast
  };
})();
