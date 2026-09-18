# 🗄️ Contenedor HTML

Una aplicación para **guardar, clasificar, consultar y compartir** todos esos archivos HTML que tienes
sueltos por el disco duro. Funciona entera en el navegador: no hay servidor, ni cuentas, ni nada que
subir a ningún sitio. Los documentos se quedan en tu equipo.

Al entrar pide un **PIN de acceso**, que de fábrica es **9441** (se puede cambiar desde Ajustes).

---

## Descargar la app

En [`descarga/contenedor-html.html`](descarga/contenedor-html.html) tienes la **aplicación entera en un
solo archivo** (unos 140 KB): estilos, código e iconos van dentro. No necesita instalación ni conexión.

- **En el ordenador**: descárgalo y ábrelo con doble clic.
- **En el móvil**: mejor usarla desde una dirección web (ver abajo). Los navegadores móviles restringen
  mucho los archivos HTML abiertos desde la carpeta de descargas y puede que no guarde nada.

Ese archivo se genera a partir del código fuente; para regenerarlo después de cambiar algo:

```bash
node tools/construir-unico.mjs
```

---

## Cómo abrirla

### Opción 1 · En tu ordenador (recomendada)

```bash
./abrir.sh            # usa el puerto 8080
./abrir.sh 3000       # o el puerto que prefieras
```

Luego abre <http://localhost:8080/> en el navegador. El script usa Python o `npx serve`, lo que tengas.

> **¿Por qué un servidor y no doble clic en `index.html`?** Abriendo el archivo a pelo (`file://`) la app
> se ve, y en algunos navegadores incluso guarda; en otros, la base de datos está capada para archivos
> locales y no se guarda nada (si pasa, la app te lo avisa en la pantalla de inicio y en la barra lateral).
> Con el servidor local funciona siempre, se puede instalar como aplicación y los enlaces compartidos
> apuntan a una dirección de verdad. Sigue siendo 100 % local: solo sirve la carpeta a tu propio navegador.

### Opción 2 · Publicarla en internet (para compartir enlaces)

Cualquier hosting estático sirve. Con **GitHub Pages**:

1. En GitHub: *Settings → Pages*.
2. En *Source*, elige la rama (por ejemplo `main`) y la carpeta `/ (root)`.
3. Guarda. En un par de minutos tendrás `https://<tu-usuario>.github.io/Contendor-HTML/`.

Publicar la app **no publica tus documentos**: siguen guardados en el navegador de cada persona. Lo que
se publica es solo el programa. A partir de ahí, los enlaces que generes al compartir sí funcionarán para
los demás.

### Opción 3 · Instalarla como aplicación (lo más cómodo en el móvil)

Servida por `http(s)`, el navegador ofrece *Instalar aplicación*. Queda con su icono, se abre en su propia
ventana y funciona sin conexión.

- **Android (Chrome)**: menú ⋮ → *Añadir a pantalla de inicio* / *Instalar aplicación*.
- **iPhone (Safari)**: botón Compartir → *Añadir a pantalla de inicio*.

Instalada así, la colección se guarda igual que en el ordenador y sigue funcionando sin cobertura.

---

## Qué sabe hacer

### Meter dentro tus HTML

| Forma | Para qué |
|---|---|
| **Archivos** | Selecciona muchos `.html` de golpe |
| **Carpeta** | Recorre una carpeta entera y sus subcarpetas; el nombre de cada carpeta se guarda como etiqueta |
| **Arrastrar y soltar** | Suelta archivos o carpetas en cualquier punto de la ventana |
| **Pegar código** | Pega HTML a mano y guárdalo como documento |
| **Desde una URL** | Descarga una página (si el servidor de origen lo permite) |
| **Restaurar copia** | Recupera un `.json` exportado antes desde la propia app |

Al entrar cada archivo, la app saca el título del `<title>` (o del primer `<h1>`), calcula su tamaño,
**detecta repetidos** por el contenido y **propone una categoría** mirando lo que hay dentro
(un `<canvas>` con puntuación → Juegos; Chart.js y KPI → Paneles e informes; `<article>` y manual →
Documentos, etc.).

### Ordenar y encontrar

- **Categorías** propias: crea, renombra, cambia icono y color. Al borrar una, sus documentos pasan a
  «Sin clasificar» (no se borra nada).
- **Etiquetas** libres y **favoritos**.
- **Buscador** por título, descripción, etiquetas y —si quieres— por el texto de dentro del documento.
- **Vista de cuadrícula** con miniatura real de cada documento, o **vista de lista** compacta.
- **Selección múltiple** para mover de categoría, etiquetar, marcar favoritos, exportar o borrar en bloque.

### Ver y editar

Cada documento se abre en un panel con tres pestañas:

- **Vista previa**: el documento funcionando, dentro de un marco aislado.
- **Datos**: título, descripción, categoría, etiquetas.
- **Código**: editor para retocar el HTML y guardar.

Y con *Abrir* se ve a pantalla completa en una pestaña aparte.

### Compartir

- **Enlace con el documento dentro.** El HTML viaja comprimido (gzip + base64) en el propio enlace, que
  apunta a la misma dirección de la app. Quien lo reciba lo abre y lo ve, sin instalar nada y sin pedirle
  ningún PIN (el PIN protege tu colección, no el documento que compartes); además puede guardarlo en su
  propio contenedor con un botón. No se sube nada a ningún servidor: si la app está publicada, el
  enlace funciona para cualquiera; si la usas en local, solo funcionará en tu equipo (la app te lo avisa).
  Los documentos muy grandes generan enlaces muy largos: ahí es mejor mandar el archivo.
- **Menú de compartir del sistema** (móviles y Safari): manda el enlace o el archivo por WhatsApp, correo…
- **Descargar `.html`** o **copiar el código**.
- **Exportar a ZIP**: un `.zip` con los documentos repartidos en carpetas por categoría, más un
  `catalogo.html` navegable y un `manifiesto.json`.

### Copias de seguridad

Desde Ajustes: **copia completa en `.json`** (con todo el contenido), **ZIP de toda la colección** y
**restauración** de una copia. Conviene hacerlas de vez en cuando: si borras los datos del navegador,
se borra la colección.

---

## El PIN de acceso

- De fábrica es **9441**; se cambia en *Ajustes → PIN de acceso*.
- Tras 5 intentos fallidos hay que esperar 20 segundos.
- «Recordar en este dispositivo» mantiene la sesión 30 días; si no, se pide el PIN en cada sesión nueva
  del navegador. El botón 🔒 de la barra superior bloquea al instante.
- Del PIN solo se guarda su huella (SHA-256 con sal), nunca el número.

**Hasta dónde llega:** es un candado para que nadie abra tu colección sin querer en tu propio equipo.
**No cifra los documentos**: alguien con conocimientos y acceso físico al dispositivo podría leerlos desde
las herramientas del navegador. No lo uses como caja fuerte para material sensible.

**¿Y si olvidas el PIN?** No se pierde nada. Abre la app, pulsa F12 (consola del navegador), pega esto y
recarga: el PIN vuelve a ser 9441 y los documentos siguen ahí.

```js
indexedDB.open('contenedor-html').onsuccess = (e) =>
  e.target.result.transaction('kv', 'readwrite').objectStore('kv').delete('authHash');
```

---

## Dónde se guarda todo

En la **base de datos del navegador** (IndexedDB), en el equipo donde uses la app. Por eso:

- Cada navegador y cada dispositivo tiene su propia colección (para pasarla de uno a otro: exporta e importa la copia `.json`).
- Si borras «datos de navegación» incluyendo los datos de sitios, se borra la colección.
- El espacio disponible lo decide el navegador (suele ser de cientos de MB a varios GB). La barra lateral
  muestra cuánto llevas usado.

Sobre la **vista previa**: los documentos se muestran dentro de un `iframe` aislado, sin acceso a los datos
de la aplicación. Si uno de tus documentos necesita guardar cosas por su cuenta (almacenamiento del
navegador), puedes activarle *Modo de confianza* en su pestaña «Datos»; hazlo solo con documentos tuyos.

---

## Estructura del proyecto

```
index.html                   Aplicación: bloqueo, interfaz y recepción de enlaces compartidos
viewer.html                  Visor a pantalla completa (versión servida)
descarga/contenedor-html.html  La app entera en un archivo (generada)
tools/construir-unico.mjs    Genera ese archivo único
abrir.sh                     Arranca un servidor local
manifest.webmanifest     Datos para instalarla como aplicación
sw.js                    Service worker (funcionamiento sin conexión)
assets/css/app.css       Estilos (tema oscuro y claro)
assets/js/
  util.js                Utilidades: fechas, tamaños, hashes, compresión, descargas, avisos
  store.js               Almacenamiento (IndexedDB, con reserva en localStorage)
  zip.js                 Generador de ZIP propio, sin dependencias
  catalog.js             Catálogo: documentos, categorías, filtros, copias, exportación
  importer.js            Importación desde archivos, carpetas, arrastrar, URL o texto
  share.js               Enlaces autocontenidos y menú de compartir
  auth.js                Bloqueo por PIN
  ui.js                  Interfaz: listados, panel de documento, ventanas, atajos
  app.js                 Arranque
  viewer.js              Lógica del visor
```

Sin dependencias, sin compilación, sin `node_modules`: son archivos estáticos.

---

## Atajos de teclado

| Tecla | Acción |
|---|---|
| `/` o `Ctrl/⌘ + K` | Ir al buscador |
| `N` | Añadir documentos |
| `Esc` | Cerrar ventana, panel o selección |

---

## Compatibilidad

Chrome, Edge, Firefox, Safari y sus versiones móviles, en versiones recientes. Los enlaces comprimidos
usan `CompressionStream`; donde no exista, el enlace se genera igualmente sin comprimir (más largo).
