/* HTML Container — generador ZIP mínimo (método "store", sin dependencias) */
window.CH = window.CH || {};

CH.zip = (function () {
  'use strict';

  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function dosTime(date) {
    return ((date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2))) & 0xffff;
  }

  function dosDate(date) {
    return (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  }

  function writer(size) {
    const buf = new Uint8Array(size);
    let pos = 0;
    return {
      u16: function (v) { buf[pos++] = v & 0xff; buf[pos++] = (v >>> 8) & 0xff; },
      u32: function (v) {
        buf[pos++] = v & 0xff; buf[pos++] = (v >>> 8) & 0xff;
        buf[pos++] = (v >>> 16) & 0xff; buf[pos++] = (v >>> 24) & 0xff;
      },
      bytes: function (b) { buf.set(b, pos); pos += b.length; },
      get offset() { return pos; },
      buffer: buf
    };
  }

  /**
   * Crea un ZIP a partir de [{ name, data }] donde data es texto o Uint8Array.
   * Los nombres duplicados reciben un sufijo numérico.
   */
  function create(entries) {
    const enc = new TextEncoder();
    const used = Object.create(null);
    const now = new Date();

    const items = entries.map(function (entry) {
      let name = String(entry.name || 'archivo');
      if (used[name.toLowerCase()]) {
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        let n = 2;
        while (used[(base + ' (' + n + ')' + ext).toLowerCase()]) n++;
        name = base + ' (' + n + ')' + ext;
      }
      used[name.toLowerCase()] = true;
      const data = typeof entry.data === 'string' ? enc.encode(entry.data) : entry.data;
      const nameBytes = enc.encode(name);
      return { nameBytes: nameBytes, data: data, crc: crc32(data), date: entry.date || now };
    });

    const localSize = items.reduce((n, it) => n + 30 + it.nameBytes.length + it.data.length, 0);
    const centralSize = items.reduce((n, it) => n + 46 + it.nameBytes.length, 0);
    const w = writer(localSize + centralSize + 22);
    const offsets = [];

    items.forEach(function (it) {
      offsets.push(w.offset);
      w.u32(0x04034b50);      // firma de cabecera local
      w.u16(20);              // versión necesaria
      w.u16(0x0800);          // bit 11: nombre en UTF-8
      w.u16(0);               // método: store
      w.u16(dosTime(it.date));
      w.u16(dosDate(it.date));
      w.u32(it.crc);
      w.u32(it.data.length);
      w.u32(it.data.length);
      w.u16(it.nameBytes.length);
      w.u16(0);               // sin campos extra
      w.bytes(it.nameBytes);
      w.bytes(it.data);
    });

    const centralStart = w.offset;
    items.forEach(function (it, i) {
      w.u32(0x02014b50);      // firma del directorio central
      w.u16(20);              // versión que lo creó
      w.u16(20);              // versión necesaria
      w.u16(0x0800);
      w.u16(0);
      w.u16(dosTime(it.date));
      w.u16(dosDate(it.date));
      w.u32(it.crc);
      w.u32(it.data.length);
      w.u32(it.data.length);
      w.u16(it.nameBytes.length);
      w.u16(0);               // extra
      w.u16(0);               // comentario
      w.u16(0);               // número de disco
      w.u16(0);               // atributos internos
      w.u32(0);               // atributos externos
      w.u32(offsets[i]);
      w.bytes(it.nameBytes);
    });

    const centralEnd = w.offset;
    w.u32(0x06054b50);        // fin del directorio central
    w.u16(0);
    w.u16(0);
    w.u16(items.length);
    w.u16(items.length);
    w.u32(centralEnd - centralStart);
    w.u32(centralStart);
    w.u16(0);

    return new Blob([w.buffer], { type: 'application/zip' });
  }

  return { create: create, crc32: crc32 };
})();
