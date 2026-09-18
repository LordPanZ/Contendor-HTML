/* Construye la versión de un solo archivo del Contenedor HTML.
 *
 *   node tools/construir-unico.mjs
 *
 * Mete los estilos, los scripts y los iconos dentro de index.html y guarda el
 * resultado en descarga/contenedor-html.html: un único archivo que se puede
 * mandar por correo, guardar en el móvil o abrir con doble clic.
 *
 * El archivo generado se versiona en el repositorio: vuelve a ejecutar este
 * script cada vez que cambies algo en assets/ o en index.html.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');
const salida = path.join(raiz, 'descarga', 'contenedor-html.html');

/** Reemplazo literal: evita que $&, $1… dentro del código se interpreten. */
function sustituir(texto, busca, pone) {
  const i = texto.indexOf(busca);
  if (i === -1) throw new Error('No se encontró en index.html: ' + busca);
  return texto.slice(0, i) + pone + texto.slice(i + busca.length);
}

function quitar(texto, busca) {
  const i = texto.indexOf(busca);
  return i === -1 ? texto : texto.slice(0, i) + texto.slice(i + busca.length);
}

const dataUri = (rel, tipo) =>
  'data:' + tipo + ';base64,' + fs.readFileSync(path.join(raiz, rel)).toString('base64');

let html = leer('index.html');

// 1) estilos
html = sustituir(
  html,
  '<link rel="stylesheet" href="assets/css/app.css">',
  '<style>\n' + leer('assets/css/app.css') + '</style>'
);

// 2) iconos como datos incrustados, y fuera el manifiesto (no aplica a un archivo suelto)
html = sustituir(
  html,
  '<link rel="icon" href="assets/icons/icon.svg" type="image/svg+xml">',
  '<link rel="icon" href="' + dataUri('assets/icons/icon.svg', 'image/svg+xml') + '">'
);
html = sustituir(
  html,
  '<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">',
  '<link rel="apple-touch-icon" href="' + dataUri('assets/icons/apple-touch-icon.png', 'image/png') + '">'
);
html = quitar(html, '<link rel="manifest" href="manifest.webmanifest">\n');

// 3) scripts, en el mismo orden en que aparecen
const scripts = Array.from(html.matchAll(/<script src="(assets\/js\/[^"]+)"><\/script>\n?/g));
if (!scripts.length) throw new Error('No se encontró ningún script que incrustar.');

let bloque = '<script>window.CH_ARCHIVO_UNICO = true;</script>\n';
for (const [, ruta] of scripts) {
  bloque += '<script>\n/* ' + ruta + ' */\n' + leer(ruta) + '</script>\n';
}
html = sustituir(html, scripts[0][0], bloque);
for (const [etiqueta] of scripts.slice(1)) html = quitar(html, etiqueta);

// 4) nota de cabecera
html = sustituir(
  html,
  '<!doctype html>\n',
  '<!doctype html>\n<!--\n  Contenedor HTML — versión de un solo archivo.\n' +
  '  Generada automáticamente con tools/construir-unico.mjs. No la edites a mano:\n' +
  '  cambia los archivos de assets/ y vuelve a generarla.\n' +
  '  PIN inicial: 9441 (se cambia desde Ajustes).\n-->\n'
);

fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, html);

const kb = (fs.statSync(salida).size / 1024).toFixed(1);
console.log('Generado ' + path.relative(raiz, salida) + ' (' + kb + ' KB)');
if (/<script src=|<link rel="stylesheet"/.test(html)) {
  console.error('AVISO: han quedado referencias externas dentro del archivo.');
  process.exit(1);
}
