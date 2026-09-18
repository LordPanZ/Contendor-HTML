/* HTML Container — compartir: enlace autocontenido, archivo suelto o menú del sistema */
window.CH = window.CH || {};

CH.share = (function () {
  'use strict';

  const U = CH.util;

  // Los enlaces muy largos los recortan algunos chats y clientes de correo.
  const LINK_WARN = 12000;
  const LINK_MAX = 60000;

  const isLocalFile = () => location.protocol === 'file:';

  /** La propia página recibe los enlaces compartidos, así que el enlace apunta a ella misma.
      Así funciona igual servida en la web que como archivo único descargado. */
  function appBase() {
    return location.href.split('#')[0].split('?')[0];
  }

  /** Empaqueta el documento dentro del propio enlace: no hace falta servidor ni base de datos. */
  async function buildLink(doc, html) {
    const payload = JSON.stringify({
      v: 1,
      t: doc.title || 'Documento',
      d: doc.description || '',
      h: html
    });
    const packed = await U.packText(payload);
    const url = appBase() + '#d=' + packed;
    return {
      url: url,
      length: url.length,
      warn: url.length > LINK_WARN,
      tooLong: url.length > LINK_MAX,
      local: isLocalFile()
    };
  }

  function fileFor(doc, html) {
    const name = U.safeFileName(doc.title, '.html');
    return new File([html], name, { type: 'text/html' });
  }

  function canShareFiles(doc, html) {
    if (!navigator.canShare || !navigator.share || typeof File === 'undefined') return false;
    try { return navigator.canShare({ files: [fileFor(doc, html)] }); } catch (e) { return false; }
  }

  /** Abre el menú de compartir del sistema con el archivo adjunto. */
  async function shareFile(doc, html) {
    if (!canShareFiles(doc, html)) throw new Error('Este navegador no permite compartir archivos directamente.');
    await navigator.share({ files: [fileFor(doc, html)], title: doc.title, text: doc.description || '' });
  }

  async function shareLink(doc, url) {
    if (!navigator.share) throw new Error('Este navegador no tiene menú de compartir.');
    await navigator.share({ title: doc.title, text: doc.description || doc.title, url: url });
  }

  function download(doc, html) {
    U.downloadText(html, U.safeFileName(doc.title, '.html'));
  }

  return { buildLink, shareFile, shareLink, canShareFiles, download, isLocalFile, LINK_WARN, LINK_MAX };
})();
