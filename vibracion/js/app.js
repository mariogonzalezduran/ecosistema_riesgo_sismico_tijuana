/*
  RMS-ZC-BC | Lógica del visor
  ----------------------------
  1. Crea el mapa con Leaflet.
  2. Carga los puntos desde el GeoJSON indicado en js/config.js.
  3. Dibuja, filtra, colorea y muestra el detalle de cada punto.

  No hay interpolación ni clasificación de riesgo: cada punto muestra
  únicamente los valores que trae el archivo de datos.
*/
(function () {
  'use strict';

  var CFG = window.RMS_CONFIG;
  var $ = function (id) { return document.getElementById(id); };
  var movil = window.matchMedia('(max-width: 959.98px)');
  var pocoMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- Estado ----------
  var puntos = [];          // todos los puntos leídos del GeoJSON
  var visibles = [];        // los que cumplen búsqueda y filtros
  var seleccion = null;     // punto seleccionado (objeto) o null
  var variable = CFG.variables[CFG.variableInicial] ? CFG.variableInicial : 'frecuencia';

  // ---------- Elementos de la página ----------
  var visor = $('visor');
  var entradaBuscar = $('buscar');
  var limites = { fMin: $('f-min'), fMax: $('f-max'), tMin: $('t-min'), tMax: $('t-max') };
  var detalle = $('detalle');

  // Avisos de demostración: se ocultan cuando config.datosDeDemostracion es false.
  if (!CFG.datosDeDemostracion) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-demo]'), function (el) { el.hidden = true; });
  }

  // ---------- Mapa ----------
  var mapa = L.map('mapa', {
    zoomControl: false,
    scrollWheelZoom: CFG.zoomConRueda !== false,
    zoomAnimation: !pocoMovimiento.matches,
    fadeAnimation: !pocoMovimiento.matches
  }).setView(CFG.vistaInicial.centro, CFG.vistaInicial.zoom);

  L.tileLayer(CFG.teselas.url, { maxZoom: CFG.teselas.zoomMaximo, attribution: CFG.teselas.atribucion }).addTo(mapa);
  mapa.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');

  var controlZoom = L.control.zoom({ zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(mapa);
  var controlEscala = L.control.scale({ imperial: false }).addTo(mapa);
  var capaPuntos = L.layerGroup().addTo(mapa);

  // El visor ocupa el alto de la ventana que dejan libre el encabezado y la presentación.
  function medirAlto() {
    document.documentElement.style.setProperty('--alto-superior', Math.round(visor.offsetTop) + 'px');
    mapa.invalidateSize();
  }
  var anchoPrevio = window.innerWidth;
  window.addEventListener('resize', function () {
    if (window.innerWidth !== anchoPrevio) { anchoPrevio = window.innerWidth; medirAlto(); }
  });
  window.addEventListener('load', medirAlto);
  medirAlto();

  // En celular, zoom y escala pasan a la esquina inferior derecha para dejar libre la búsqueda.
  function acomodarControles() {
    controlZoom.setPosition(movil.matches ? 'bottomright' : 'topleft');
    controlEscala.setPosition(movil.matches ? 'bottomright' : 'bottomleft');
    if (!movil.matches) { abrirFiltros(false); }
    mapa.invalidateSize();
  }
  if (movil.addEventListener) { movil.addEventListener('change', acomodarControles); } else { movil.addListener(acomodarControles); }
  acomodarControles();

  // ---------- Utilidades ----------
  function numero(valor) {
    if (valor === null || valor === undefined || valor === '') { return null; }
    var n = Number(valor);
    return isFinite(n) ? n : null;
  }
  // Muestra el valor con un máximo de decimales, sin agregar ceros que el dato no trae.
  function formato(valor, decimales) { return valor === null ? 'Sin dato' : String(Number(valor.toFixed(decimales))); }
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function fechaLarga(texto) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto || '');
    if (!m || +m[2] < 1 || +m[2] > 12) { return texto || 'Sin dato'; }
    return (+m[3]) + ' de ' + MESES[+m[2] - 1] + ' de ' + m[1];
  }
  function valorDe(p, cual) { return cual === 'frecuencia' ? p.f : p.t; }
  function claseDe(valor, cortes) {
    var i = 0;
    while (i < cortes.length && valor >= cortes[i]) { i++; }
    return i;
  }
  function colorDe(p) {
    var v = valorDe(p, variable);
    return v === null ? CFG.colorSinDato : CFG.rampa[claseDe(v, CFG.variables[variable].cortes)];
  }
  function resumen(p) {
    return formato(p.f, CFG.variables.frecuencia.decimales) + (p.f === null ? '' : ' Hz') + ' · ' +
           formato(p.t, CFG.variables.periodo.decimales) + (p.t === null ? '' : ' s');
  }
  function rangos(cfgVar) {
    var c = cfgVar.cortes, d = cfgVar.decimalesLeyenda, lista = [];
    lista.push('< ' + c[0].toFixed(d));
    for (var i = 0; i < c.length - 1; i++) { lista.push(c[i].toFixed(d) + ' – ' + c[i + 1].toFixed(d)); }
    lista.push('≥ ' + c[c.length - 1].toFixed(d));
    return lista;
  }
  function crear(etiqueta, clase, texto) {
    var el = document.createElement(etiqueta);
    if (clase) { el.className = clase; }
    if (texto !== undefined) { el.textContent = texto; }
    return el;
  }

  // ---------- Carga de datos ----------
  function leerPunto(feature, indice) {
    var g = feature && feature.geometry, pr = (feature && feature.properties) || {};
    if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) { return null; }
    var lon = numero(g.coordinates[0]), lat = numero(g.coordinates[1]);
    if (lon === null || lat === null) { return null; }
    var id = pr[CFG.campos.id];
    return {
      id: (id === undefined || id === null || id === '') ? 'Punto ' + (indice + 1) : String(id),
      fecha: pr[CFG.campos.fecha] ? String(pr[CFG.campos.fecha]) : '',
      archivo: pr[CFG.campos.archivo] ? String(pr[CFG.campos.archivo]) : '',
      f: numero(pr[CFG.campos.frecuencia]),
      t: numero(pr[CFG.campos.periodo]),
      lat: lat, lon: lon,
      vecinos: [],
      marcador: null
    };
  }

  function crearMarcador(p) {
    var icono = L.divIcon({ className: 'punto', html: '<span class="punto-forma"></span>', iconSize: [44, 44], iconAnchor: [22, 22] });
    var m = L.marker([p.lat, p.lon], { icon: icono, keyboard: true, title: p.id, riseOnHover: true });
    m.on('click', function () { seleccionar(p); });
    m.on('add', function () {
      var el = m.getElement();
      el.setAttribute('aria-label', p.id + ': ' + resumen(p) + (p.vecinos.length ? '. Hay ' + (p.vecinos.length + 1) + ' mediciones en este sitio' : ''));
      // Teclado: Enter o barra espaciadora seleccionan el punto.
      el.onkeydown = function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); seleccionar(p); }
      };
      pintarMarcador(p);
    });
    return m;
  }

  function cargar() {
    fetch(CFG.rutaDatos)
      .then(function (r) {
        if (!r.ok) { throw new Error('el servidor respondió ' + r.status); }
        return r.json();
      })
      .then(function (geo) {
        var features = geo && geo.type === 'FeatureCollection' && Array.isArray(geo.features) ? geo.features : null;
        if (!features) { throw new Error('el archivo no es una colección GeoJSON (FeatureCollection)'); }
        puntos = features.map(leerPunto).filter(Boolean);
        // Mediciones tomadas exactamente en el mismo sitio: se enlazan entre sí en el detalle.
        var porSitio = {};
        puntos.forEach(function (p) { var k = p.lat + ',' + p.lon; (porSitio[k] = porSitio[k] || []).push(p); });
        puntos.forEach(function (p) {
          p.vecinos = porSitio[p.lat + ',' + p.lon].filter(function (o) { return o !== p; });
          p.marcador = crearMarcador(p);
        });
        var total = $('total-puntos');
        if (total) { total.textContent = puntos.length; }
        var nota = $('actualizacion');
        if (nota) {
          // Última actualización = fecha de la medición más reciente (solo fechas AAAA-MM-DD).
          var ultima = puntos.map(function (p) { return p.fecha; })
            .filter(function (f) { return /^\d{4}-\d{2}-\d{2}$/.test(f); }).sort().pop();
          var cuantos = puntos.length === 1 ? '1 punto de medición' : puntos.length + ' puntos de medición';
          nota.textContent = ultima ? 'Última actualización: ' + fechaLarga(ultima) + ' · ' + cuantos : cuantos;
          nota.hidden = false;
          medirAlto();   // la nota agrega una línea arriba del visor
        }
        actualizar();
        if (puntos.length) {
          encuadrar();
        }
      })
      .catch(function (error) {
        var ayuda = location.protocol === 'file:'
          ? ' Abriste el archivo directamente desde el disco: usa un servidor local, por ejemplo la extensión Live Server de Visual Studio Code.'
          : ' Revisa que el archivo exista y que la ruta en js/config.js sea correcta.';
        $('aviso-carga-texto').textContent = 'No se pudo leer ' + CFG.rutaDatos + ' (' + error.message + ').' + ayuda;
        $('aviso-carga').hidden = false;
      });
  }

  // Encuadra todos los puntos, dejando libres la búsqueda y la leyenda en celular.
  function encuadrar() {
    var limitesMapa = L.latLngBounds(puntos.map(function (p) { return [p.lat, p.lon]; }));
    var opciones = movil.matches
      ? { paddingTopLeft: [28, 116], paddingBottomRight: [28, 116], maxZoom: 15, animate: false }
      : { padding: [48, 48], maxZoom: 15, animate: false };
    mapa.invalidateSize();
    mapa.fitBounds(limitesMapa, opciones);
  }

  // ---------- Filtros ----------
  function leerLimites() {
    return { fMin: numero(limites.fMin.value), fMax: numero(limites.fMax.value), tMin: numero(limites.tMin.value), tMax: numero(limites.tMax.value) };
  }
  function cumple(valor, min, max) {
    if (min === null && max === null) { return true; }
    if (valor === null) { return false; }             // sin dato: no puede cumplir un límite
    return (min === null || valor >= min) && (max === null || valor <= max);
  }
  function filtrar() {
    var termino = entradaBuscar.value.trim().toLowerCase();
    var L0 = leerLimites();
    return puntos.filter(function (p) {
      return (!termino || p.id.toLowerCase().indexOf(termino) !== -1) &&
             cumple(p.f, L0.fMin, L0.fMax) && cumple(p.t, L0.tMin, L0.tMax);
    });
  }

  // ---------- Dibujo ----------
  function pintarMarcador(p) {
    var el = p.marcador && p.marcador.getElement();
    if (!el) { return; }
    el.style.setProperty('--c', colorDe(p));
    el.classList.toggle('sin-dato', valorDe(p, variable) === null);
    el.classList.toggle('activo', seleccion === p);
    p.marcador.setZIndexOffset(seleccion === p ? 1000 : 0);
  }

  function dibujarLeyenda() {
    var cfgVar = CFG.variables[variable];
    var titulo = cfgVar.titulo + ' (' + cfgVar.unidad + ')';
    var etiquetas = rangos(cfgVar);
    var conteos = etiquetas.map(function () { return 0; });
    var sinDato = 0;
    visibles.forEach(function (p) {
      var v = valorDe(p, variable);
      if (v === null) { sinDato++; } else { conteos[claseDe(v, cfgVar.cortes)]++; }
    });

    $('leyenda-titulo').textContent = titulo;
    var lista = $('leyenda-lista');
    lista.textContent = '';
    etiquetas.forEach(function (texto, i) {
      var li = crear('li');
      var muestra = crear('span', 'muestra');
      muestra.style.background = CFG.rampa[i];
      li.appendChild(muestra);
      li.appendChild(crear('span', 'rango', texto));
      li.appendChild(crear('span', 'n', conteos[i]));
      lista.appendChild(li);
    });
    if (sinDato > 0) {
      var li = crear('li');
      var muestra = crear('span', 'muestra sin-dato');
      muestra.style.background = CFG.colorSinDato;
      li.appendChild(muestra);
      li.appendChild(crear('span', 'rango', 'Sin dato'));
      li.appendChild(crear('span', 'n', sinDato));
      lista.appendChild(li);
    }

    // Leyenda compacta (celular): barra con los cortes marcados.
    $('compacta-titulo').textContent = titulo;
    var barra = $('compacta-barra'), marcas = $('compacta-marcas');
    barra.textContent = ''; marcas.textContent = '';
    CFG.rampa.forEach(function (color) { var s = crear('span'); s.style.background = color; barra.appendChild(s); });
    cfgVar.cortes.forEach(function (corte, i) {
      var s = crear('span', '', corte.toFixed(cfgVar.decimalesLeyenda));
      s.style.left = ((i + 1) * 100 / CFG.rampa.length) + '%';
      marcas.appendChild(s);
    });

    Array.prototype.forEach.call(document.querySelectorAll('.segmentado button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-variable') === variable));
    });
  }

  function dibujarLista() {
    var lista = $('lista');
    lista.textContent = '';
    visibles.forEach(function (p) {
      var li = crear('li'), b = crear('button');
      b.type = 'button';
      if (seleccion === p) { b.setAttribute('aria-current', 'true'); }
      b.appendChild(crear('span', '', p.id));
      b.appendChild(crear('span', 'resumen', resumen(p)));
      b.addEventListener('click', function () { seleccionar(p); });
      li.appendChild(b);
      lista.appendChild(li);
    });
    $('lista-vacia').hidden = visibles.length > 0 || puntos.length === 0;
    $('conteo').textContent = visibles.length + ' de ' + puntos.length;
    $('ver-puntos').textContent = visibles.length === 1 ? 'Ver 1 punto' : 'Ver ' + visibles.length + ' puntos';
  }

  function dibujarSinResultados() {
    var vacio = puntos.length > 0 && visibles.length === 0;
    var caja = $('sin-resultados');
    if (vacio) {
      var termino = entradaBuscar.value.trim();
      var L0 = leerLimites();
      var hayLimites = L0.fMin !== null || L0.fMax !== null || L0.tMin !== null || L0.tMax !== null;
      $('sin-resultados-texto').textContent = termino
        ? 'No hay identificadores que contengan «' + termino + '»' + (hayLimites ? ' dentro de los intervalos elegidos.' : '.')
        : 'Ningún punto cumple los intervalos de frecuencia y periodo elegidos.';
    }
    // En celular el mensaje espera a que se cierre la hoja de filtros.
    caja.hidden = !vacio || visor.classList.contains('filtros-abiertos');
  }

  function dibujarDetalle() {
    if (!seleccion) { detalle.hidden = true; return; }
    var p = seleccion, cf = CFG.variables.frecuencia, ct = CFG.variables.periodo;
    $('d-id').textContent = p.id;
    var muestra = $('d-color');
    muestra.style.background = colorDe(p);
    muestra.classList.toggle('sin-dato', valorDe(p, variable) === null);
    $('d-f').textContent = formato(p.f, cf.decimales);
    $('d-f').parentNode.classList.toggle('sin-dato', p.f === null);
    $('d-f-u').hidden = p.f === null;
    $('d-t').textContent = formato(p.t, ct.decimales);
    $('d-t').parentNode.classList.toggle('sin-dato', p.t === null);
    $('d-t-u').hidden = p.t === null;
    $('d-fecha').textContent = fechaLarga(p.fecha);
    $('d-lat').textContent = p.lat.toFixed(CFG.decimalesCoordenadas);
    $('d-lon').textContent = p.lon.toFixed(CFG.decimalesCoordenadas);
    $('d-archivo').textContent = p.archivo || 'Sin dato';
    // Otras mediciones en el mismo sitio (solo las que pasan los filtros).
    var otros = p.vecinos.filter(function (o) { return visibles.indexOf(o) !== -1; });
    var cajaVecinos = $('d-vecinos'), listaVecinos = $('d-vecinos-lista');
    listaVecinos.textContent = '';
    otros.forEach(function (o) {
      var b = crear('button', 'boton boton-secundario boton-chico', o.id);
      b.type = 'button';
      b.setAttribute('aria-label', 'Ver la medición ' + o.id + ', ' + resumen(o));
      b.addEventListener('click', function () { seleccionar(o); });
      listaVecinos.appendChild(b);
    });
    cajaVecinos.hidden = otros.length === 0;
    detalle.hidden = false;
  }

  // Vuelve a calcular qué se ve y lo dibuja todo. Se llama tras cada cambio.
  function actualizar() {
    visibles = filtrar();
    if (seleccion && visibles.indexOf(seleccion) === -1) { seleccion = null; }
    puntos.forEach(function (p) {
      var debe = visibles.indexOf(p) !== -1, esta = capaPuntos.hasLayer(p.marcador);
      if (debe && !esta) { capaPuntos.addLayer(p.marcador); }
      if (!debe && esta) { capaPuntos.removeLayer(p.marcador); }
      pintarMarcador(p);
    });
    dibujarLeyenda();
    dibujarLista();
    dibujarDetalle();
    dibujarSinResultados();
  }

  // ---------- Selección ----------
  function seleccionar(p) {
    seleccion = p;
    abrirFiltros(false);
    actualizar();
    asegurarVisible(p);
  }
  function cerrarDetalle() {
    var anterior = seleccion;
    seleccion = null;
    actualizar();
    if (anterior && anterior.marcador.getElement() && document.activeElement === $('cerrar-detalle')) {
      anterior.marcador.getElement().focus();
    }
  }

  // Si el punto queda fuera de la vista o tapado por el detalle, desplaza el mapa.
  function asegurarVisible(p) {
    var tam = mapa.getSize();
    var pt = mapa.latLngToContainerPoint([p.lat, p.lon]);
    var caja = mapa.getContainer().getBoundingClientRect();
    var tarjeta = detalle.getBoundingClientRect();
    var libre = movil.matches
      ? { x0: 0, y0: 110, x1: tam.x, y1: Math.max(160, tarjeta.top - caja.top) }
      : { x0: 0, y0: 0, x1: Math.max(200, tarjeta.left - caja.left), y1: tam.y };
    // Desplazamiento mínimo para que el punto quede dentro de la zona libre, con margen.
    var margen = 56;
    var limitar = function (v, a, b) { return a > b ? (a + b) / 2 : Math.min(Math.max(v, a), b); };
    var dx = pt.x - limitar(pt.x, libre.x0 + margen, libre.x1 - margen);
    var dy = pt.y - limitar(pt.y, libre.y0 + margen, libre.y1 - margen);
    if (dx !== 0 || dy !== 0) { mapa.panBy([dx, dy], { animate: !pocoMovimiento.matches }); }
  }

  // ---------- Hoja de filtros (celular) ----------
  function abrirFiltros(abrir) {
    visor.classList.toggle('filtros-abiertos', abrir);
    $('abrir-filtros').setAttribute('aria-expanded', String(abrir));
    if (abrir && seleccion) { seleccion = null; actualizar(); } else { dibujarSinResultados(); }
  }
  function restablecer() {
    entradaBuscar.value = '';
    Object.keys(limites).forEach(function (k) { limites[k].value = ''; });
    actualizar();
  }

  // ---------- Eventos ----------
  entradaBuscar.addEventListener('input', actualizar);
  Object.keys(limites).forEach(function (k) { limites[k].addEventListener('input', actualizar); });
  Array.prototype.forEach.call(document.querySelectorAll('.segmentado button'), function (b) {
    b.addEventListener('click', function () { variable = b.getAttribute('data-variable'); actualizar(); });
  });
  $('restablecer').addEventListener('click', restablecer);
  $('restablecer-movil').addEventListener('click', restablecer);
  $('limpiar').addEventListener('click', function () { restablecer(); entradaBuscar.focus(); });
  $('cerrar-detalle').addEventListener('click', cerrarDetalle);
  $('abrir-filtros').addEventListener('click', function () { abrirFiltros(!visor.classList.contains('filtros-abiertos')); });
  $('cerrar-filtros').addEventListener('click', function () { abrirFiltros(false); $('abrir-filtros').focus(); });
  $('ver-puntos').addEventListener('click', function () { abrirFiltros(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') { return; }
    if (visor.classList.contains('filtros-abiertos')) { abrirFiltros(false); $('abrir-filtros').focus(); }
    else if (seleccion) { cerrarDetalle(); }
  });

  // ---------- Menú: marca la sección que se está viendo ----------
  var enlaces = Array.prototype.slice.call(document.querySelectorAll('.navegacion a[href^="#"]'));
  var elegidoPorClic = null;   // al pulsar un enlace se respeta esa elección mientras su sección se vea
  function marcarEnlace(activo) {
    enlaces.forEach(function (a) {
      if (a === activo) { a.setAttribute('aria-current', 'location'); } else { a.removeAttribute('aria-current'); }
    });
  }
  function destinoDe(a) { return document.getElementById(a.getAttribute('href').slice(1)); }
  function seccionActual() {
    if (elegidoPorClic) {
      var c = destinoDe(elegidoPorClic).getBoundingClientRect();
      if (c.top < window.innerHeight && c.bottom > 0) { return elegidoPorClic; }
      elegidoPorClic = null;
    }
    // La última sección cuyo inicio ya pasó el 40 % superior de la ventana
    // (al llegar al final de la página, la última que se alcanza a ver).
    var alFinal = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
    var linea = alFinal ? window.innerHeight : window.innerHeight * 0.4, actual = enlaces[0];
    enlaces.forEach(function (a) {
      var destino = destinoDe(a), caja = destino.getBoundingClientRect();
      // Un bloque que está a un lado del anterior (Contacto junto a Datos en escritorio) no
      // cuenta por separado: se ven juntos y queda marcado el primero.
      var vecino = destino.previousElementSibling;
      var aUnLado = vecino && caja.left >= vecino.getBoundingClientRect().right - 1;
      if (caja.top <= linea && !aUnLado) { actual = a; }
    });
    return actual;
  }
  window.addEventListener('scroll', function () { marcarEnlace(seccionActual()); }, { passive: true });
  enlaces.forEach(function (a) {
    a.addEventListener('click', function () { elegidoPorClic = a; marcarEnlace(a); });
  });
  // Si la persona se desplaza por su cuenta, el menú vuelve a seguir el desplazamiento.
  ['wheel', 'touchstart'].forEach(function (tipo) {
    window.addEventListener(tipo, function () { elegidoPorClic = null; }, { passive: true });
  });

  dibujarLeyenda();
  cargar();
})();
