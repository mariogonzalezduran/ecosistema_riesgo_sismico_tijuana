/*
  RMS-ZC-BC | Configuración del visor
  -----------------------------------
  Este es el único archivo que hace falta editar para cambiar los datos,
  los intervalos de la leyenda o los colores de los puntos.
*/
window.RMS_CONFIG = {

  // Ruta del archivo GeoJSON con los puntos de medición.
  // 'data/puntos_tijuana.geojson' = lecturas del proyecto (30 puntos).
  // 'data/puntos_demo.geojson'    = 24 puntos ficticios para pruebas.
  rutaDatos: 'data/puntos_tijuana.geojson',

  // true  = se muestran los avisos de "Datos de demostración".
  // false = se ocultan. Cámbialo SOLO cuando rutaDatos apunte a datos reales autorizados.
  datosDeDemostracion: false,

  // Vista del mapa mientras cargan los datos (o si el archivo está vacío).
  vistaInicial: { centro: [32.49, -116.98], zoom: 12 },

  // Mapa base. OpenStreetMap exige mostrar la atribución.
  teselas: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribucion: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    zoomMaximo: 19
  },

  // El zoom con la rueda del ratón puede estorbar al desplazarse por la página.
  zoomConRueda: true,

  // Nombre de cada propiedad dentro de "properties" en el GeoJSON.
  // La latitud y la longitud se leen de "geometry.coordinates" ([longitud, latitud]).
  campos: {
    id: 'id',
    fecha: 'fecha',              // AAAA-MM-DD se muestra como "4 de marzo de 2025"; otro formato se muestra tal cual
    archivo: 'archivo',
    frecuencia: 'frecuencia_hz',
    periodo: 'periodo_s'
  },

  // Variable con la que se colorean los puntos al abrir la página: 'frecuencia' o 'periodo'.
  variableInicial: 'frecuencia',

  // Intervalos de la leyenda. "cortes" son los límites entre clases, de menor a mayor.
  // Con 4 cortes hay 5 clases; el límite inferior de cada clase está incluido.
  // ESTOS INTERVALOS SON PROVISIONALES: el proyecto debe confirmarlos o cambiarlos.
  // "decimales" es el máximo con que se muestra cada valor (2.867 Hz, 0.092 s);
  // "decimalesLeyenda" es el de los límites de la leyenda.
  variables: {
    frecuencia: { titulo: 'Frecuencia predominante', unidad: 'Hz', decimales: 3, decimalesLeyenda: 1, cortes: [1, 2, 4, 8] },
    periodo: { titulo: 'Periodo predominante', unidad: 's', decimales: 3, decimalesLeyenda: 2, cortes: [0.15, 0.30, 0.60, 1.00] }
  },

  // Un color por clase, del valor más bajo (claro) al más alto (oscuro).
  // Debe haber un color más que el número de cortes.
  rampa: ['#C5F1AE', '#5CC8A9', '#1896AD', '#035E9D', '#0E2C67'],

  // Color de un punto que no tiene dato en la variable elegida.
  colorSinDato: '#9AA5B1',

  // Decimales con que se muestran latitud y longitud.
  decimalesCoordenadas: 5
};
