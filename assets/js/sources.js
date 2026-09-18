/* Contenedor HTML — orígenes remotos: traer documentos de GitHub y de Netlify */
window.CH = window.CH || {};

CH.sources = (function () {
  'use strict';

  const U = CH.util;
  const ES_HTML = /\.(html?|xhtml|shtml)$/i;

  async function pedirJson(url, cabeceras) {
    let res;
    try {
      res = await fetch(url, { headers: cabeceras || {}, credentials: 'omit' });
    } catch (e) {
      throw new Error('No se pudo conectar. Revisa la conexión o la dirección.');
    }
    if (res.status === 401 || res.status === 403) {
      const restante = res.headers.get('X-RateLimit-Remaining');
      if (restante === '0') {
        throw new Error('GitHub ha cortado por exceso de consultas (60 por hora sin identificarse). Espera un rato o añade un token.');
      }
      throw new Error('Acceso denegado. Si el repositorio o el sitio es privado, necesitas un token.');
    }
    if (res.status === 404) throw new Error('No encontrado. Comprueba el nombre, la rama o el sitio.');
    if (!res.ok) throw new Error('El servidor respondió ' + res.status + '.');
    return res.json();
  }

  /* ======================= GitHub ======================= */

  /** Acepta «usuario/repo», la URL del repositorio o la de una carpeta concreta. */
  function parseRepo(entrada) {
    let texto = String(entrada || '').trim();
    if (!texto) throw new Error('Escribe el repositorio.');

    texto = texto.replace(/^git@github\.com:/, 'https://github.com/');
    let rama = '';
    let carpeta = '';

    if (/^https?:\/\//i.test(texto)) {
      let url;
      try { url = new URL(texto); } catch (e) { throw new Error('Esa dirección no es válida.'); }
      if (!/(^|\.)github\.com$/i.test(url.hostname)) throw new Error('Esa dirección no es de GitHub.');
      const partes = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
      if (partes.length < 2) throw new Error('Falta el nombre del repositorio.');
      const propietario = partes[0];
      const repo = partes[1].replace(/\.git$/i, '');
      // .../tree/<rama>/<carpeta>: la rama puede llevar barras, así que la
      // resolvemos más tarde contra la lista real de ramas.
      const resto = partes.slice(3).join('/');
      if (partes[2] === 'tree' && resto) rama = resto;
      return { propietario: propietario, repo: repo, ramaSugerida: rama, carpeta: carpeta };
    }

    const partes = texto.replace(/^\/+|\/+$/g, '').split('/');
    if (partes.length < 2) throw new Error('Escríbelo como «usuario/repositorio».');
    return {
      propietario: partes[0],
      repo: partes[1].replace(/\.git$/i, ''),
      ramaSugerida: '',
      carpeta: partes.slice(2).join('/')
    };
  }

  const cabecerasGitHub = (token) => {
    const h = { Accept: 'application/vnd.github+json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  };

  /**
   * Devuelve los .html del repositorio.
   * opciones: { entrada, rama, carpeta, token }
   */
  async function listarGitHub(opciones) {
    const ref = parseRepo(opciones.entrada);
    const token = (opciones.token || '').trim();
    const cabeceras = cabecerasGitHub(token);
    const base = 'https://api.github.com/repos/' + encodeURIComponent(ref.propietario) + '/' + encodeURIComponent(ref.repo);

    let rama = (opciones.rama || '').trim();
    let carpeta = (opciones.carpeta || ref.carpeta || '').replace(/^\/+|\/+$/g, '');

    if (!rama) {
      if (ref.ramaSugerida) {
        // «tree/<algo>»: puede ser toda la rama, o rama + carpeta. Probamos por partes.
        const candidato = await resolverRama(base, ref.ramaSugerida, cabeceras);
        rama = candidato.rama;
        if (candidato.carpeta) carpeta = carpeta ? candidato.carpeta + '/' + carpeta : candidato.carpeta;
      } else {
        const info = await pedirJson(base, cabeceras);
        rama = info.default_branch || 'main';
      }
    }

    const arbol = await pedirJson(base + '/git/trees/' + encodeURIComponent(rama) + '?recursive=1', cabeceras);
    const prefijo = carpeta ? carpeta + '/' : '';

    const archivos = (arbol.tree || [])
      .filter((n) => n.type === 'blob' && ES_HTML.test(n.path) && (!prefijo || n.path.indexOf(prefijo) === 0))
      .map((n) => ({
        ruta: n.path,
        nombre: n.path.split('/').pop(),
        tamano: n.size || 0,
        origen: 'github:' + ref.propietario + '/' + ref.repo + '@' + rama + '/' + n.path
      }))
      .sort((a, b) => a.ruta.localeCompare(b.ruta, 'es'));

    return {
      tipo: 'github',
      propietario: ref.propietario,
      repo: ref.repo,
      rama: rama,
      carpeta: carpeta,
      etiqueta: ref.repo.toLowerCase().slice(0, 30),
      truncado: !!arbol.truncated,
      archivos: archivos,
      token: token
    };
  }

  /**
   * «tree/a/b/c» puede ser la rama «a/b/c» o la rama «a» con la carpeta «b/c».
   * Pedimos la lista de ramas una sola vez y nos quedamos con la más larga que
   * encaje: así no hay que ir probando a ciegas.
   */
  async function resolverRama(base, sugerida, cabeceras) {
    let ramas = [];
    try {
      const lista = await pedirJson(base + '/branches?per_page=100', cabeceras);
      ramas = (lista || []).map((b) => b.name).filter(Boolean);
    } catch (e) {
      if (/denegado|consultas/i.test(e.message)) throw e;
    }

    const encaja = ramas
      .filter((n) => sugerida === n || sugerida.indexOf(n + '/') === 0)
      .sort((a, b) => b.length - a.length)[0];

    if (encaja) {
      return { rama: encaja, carpeta: sugerida.slice(encaja.length).replace(/^\/+/, '') };
    }

    // Con más de 100 ramas la lista puede venir cortada: probamos por partes.
    if (ramas.length >= 100) {
      const partes = sugerida.split('/');
      for (let corte = partes.length; corte >= 1; corte--) {
        const rama = partes.slice(0, corte).join('/');
        try {
          await pedirJson(base + '/branches/' + encodeURIComponent(rama), cabeceras);
          return { rama: rama, carpeta: partes.slice(corte).join('/') };
        } catch (e) {
          if (/denegado|consultas/i.test(e.message)) throw e;
        }
      }
    }
    throw new Error('No existe esa rama en el repositorio.');
  }

  async function descargarGitHub(listado, archivo) {
    // Sin token tiramos del CDN de contenido, que no gasta cupo de la API.
    if (!listado.token) {
      // Ojo: aquí la rama va dentro de la ruta, así que sus barras deben
      // quedarse tal cual (ramas como «equipo/funcion» son habituales).
      const rama = listado.rama.split('/').map(encodeURIComponent).join('/');
      const url = 'https://raw.githubusercontent.com/' + encodeURIComponent(listado.propietario) + '/' +
        encodeURIComponent(listado.repo) + '/' + rama + '/' +
        archivo.ruta.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) throw new Error('no se pudo descargar (' + res.status + ')');
      return res.text();
    }
    const url = 'https://api.github.com/repos/' + listado.propietario + '/' + listado.repo + '/contents/' +
      archivo.ruta.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(listado.rama);
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github.raw', Authorization: 'Bearer ' + listado.token },
      credentials: 'omit'
    });
    if (!res.ok) throw new Error('no se pudo descargar (' + res.status + ')');
    return res.text();
  }

  /* ======================= Netlify ======================= */

  /** Acepta el nombre del sitio, su dirección o su identificador. */
  function parseSitio(entrada) {
    const texto = String(entrada || '').trim().replace(/\/+$/, '');
    if (!texto) throw new Error('Escribe el sitio.');
    if (/^https?:\/\//i.test(texto)) {
      try { return new URL(texto).hostname; } catch (e) { throw new Error('Esa dirección no es válida.'); }
    }
    if (/^[0-9a-f-]{30,}$/i.test(texto)) return texto;            // identificador
    if (texto.indexOf('.') !== -1) return texto;                   // ya es un dominio
    return texto + '.netlify.app';
  }

  const API_NETLIFY = 'https://api.netlify.com/api/v1';

  /** opciones: { entrada, token } */
  async function listarNetlify(opciones) {
    const token = (opciones.token || '').trim();
    if (!token) throw new Error('Netlify necesita un token para leer los archivos del sitio.');
    const sitio = parseSitio(opciones.entrada);
    const cabeceras = { Authorization: 'Bearer ' + token };

    const info = await pedirJson(API_NETLIFY + '/sites/' + encodeURIComponent(sitio), cabeceras);
    const listado = await pedirJson(API_NETLIFY + '/sites/' + encodeURIComponent(info.id || sitio) + '/files', cabeceras);

    const archivos = (Array.isArray(listado) ? listado : [])
      .filter((f) => ES_HTML.test(f.path || f.id || ''))
      .map(function (f) {
        const ruta = String(f.path || f.id).replace(/^\/+/, '');
        return {
          ruta: ruta,
          nombre: ruta.split('/').pop() || 'index.html',
          tamano: f.size || 0,
          origen: 'netlify:' + (info.name || sitio) + '/' + ruta
        };
      })
      .sort((a, b) => a.ruta.localeCompare(b.ruta, 'es'));

    return {
      tipo: 'netlify',
      sitioId: info.id || sitio,
      nombre: info.name || sitio,
      url: info.ssl_url || info.url || ('https://' + sitio),
      etiqueta: String(info.name || sitio).toLowerCase().slice(0, 30),
      truncado: false,
      archivos: archivos,
      token: token
    };
  }

  async function descargarNetlify(listado, archivo) {
    const url = API_NETLIFY + '/sites/' + encodeURIComponent(listado.sitioId) + '/files/' +
      archivo.ruta.split('/').map(encodeURIComponent).join('/');
    const res = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + listado.token,
        // Netlify devuelve el contenido en crudo con esta cabecera.
        Accept: 'application/vnd.bitballoon.v1.raw'
      },
      credentials: 'omit'
    });
    if (!res.ok) throw new Error('no se pudo descargar (' + res.status + ')');
    return res.text();
  }

  /* ======================= común ======================= */

  const listar = (tipo, opciones) => (tipo === 'github' ? listarGitHub(opciones) : listarNetlify(opciones));
  const descargar = (listado, archivo) =>
    (listado.tipo === 'github' ? descargarGitHub(listado, archivo) : descargarNetlify(listado, archivo));

  function titulo(listado) {
    if (listado.tipo === 'github') {
      return listado.propietario + '/' + listado.repo + ' · ' + listado.rama + (listado.carpeta ? ' · ' + listado.carpeta : '');
    }
    return listado.nombre;
  }

  return { listar, descargar, titulo, parseRepo, parseSitio, listarGitHub, listarNetlify };
})();
