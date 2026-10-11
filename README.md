# Ecosistema de riesgo sísmico en la zona metropolitana de Tijuana

Tablero web del proyecto RMS-ZC-BC (FCITEC-UABC). Sitio estático (HTML, CSS y JavaScript sin
compilación). Las estaciones, eventos, talleres y contadores de visitas se leen de Supabase; las
lecturas de vibración ambiental se leen del archivo GeoJSON del visor, incluido en `vibracion/`.

## Contenido

```
index.html                      Página principal del ecosistema
css/styles.css                  Estilos (tema claro y oscuro)
js/config.js                    URL y clave pública de Supabase
js/app.js                       Lógica del tablero: vistas, mapas, vibración ambiental, contador
img/favicon.svg, img/marca.svg  Ícono y trazo de acelerograma
vibracion/                      Visor de vibración ambiental RMS-ZC-BC (versión 0.3, sin cambios)
  index.html                    Visor completo (búsqueda, filtros, detalle por punto)
  js/config.js                  Ruta de datos, intervalos y colores: el ecosistema también lo usa
  data/puntos_tijuana.geojson   30 lecturas del proyecto (las que se muestran)
  vendor/leaflet/               Leaflet 1.9.4
shm/                            Panel de monitoreo de la red SHM + P-Alert (versión SIMULADA, sin cambios)
  index.html, main.js, sim.js   Panel completo y simulador de señales
  planteles_tijuana.json        Planteles COBACH de Tijuana y Rosarito (copiados de sim.js) para el mapa del ecosistema
supabase/001_esquema.sql        Tablas, reglas de acceso y función de visitas
supabase/002_datos_ejemplo.sql  Datos ficticios marcados como EJEMPLO
vercel.json, netlify.toml       Configuración para cada servicio
```

## Componentes

Resumen · 1 Riesgo sísmico · 2 Vibración y suelo · 3 Estaciones · 4 Mapas de aceleración ·
5 Inspección · 6 Difusión. Cada componente muestra su contador de visitas.

«Vibración y suelo» dibuja las lecturas reales sobre un mapa (colores e intervalos tomados de
`vibracion/js/config.js`), con resumen, leyenda con conteos y tabla, y enlaza al visor completo
en `vibracion/index.html`. No interpola ni presenta la frecuencia o el periodo como riesgo.

«Estaciones» incluye la red SHM + P-Alert: mapa de los 9 planteles COBACH previstos, qué hace el
panel y un botón al panel completo en `shm/index.html`. Ese panel es una simulación: ninguna
señal proviene de sensores reales. Si cambian los planteles en `shm/sim.js`, actualiza también
`shm/planteles_tijuana.json`. La versión con datos reales necesita el proxy `api/proxy.js` del
repositorio del panel en la raíz del sitio (solo funciona en Vercel).

## Probar en tu computadora

Los datos se leen con `fetch`, que no funciona abriendo el archivo con doble clic. Desde esta
carpeta: `python -m http.server 5500` y abre `http://localhost:5500` (o usa Live Server en VS Code).

## Publicar

- **Netlify:** entra a app.netlify.com/drop y arrastra esta carpeta.
- **Vercel:** sube esta carpeta a un repositorio y en vercel.com/new elige «Import». Framework
  «Other», sin comando de compilación; `vercel.json` ya indica publicar la raíz.

## Actualizar datos

- **Vibración ambiental:** sigue el procedimiento del visor (CSV → `herramientas/convertir.html` en
  el repositorio del visor) y reemplaza `vibracion/data/puntos_tijuana.geojson`.
- **Estaciones, eventos y talleres:** editor de tablas del proyecto de Supabase
  «ecosistema-sismico-tijuana». Para una base nueva ejecuta los archivos de `supabase/` y
  actualiza `js/config.js`.

## Pendientes antes de publicar

- Autorización del proyecto para difundir las 30 lecturas de vibración ambiental.
- Textos entre corchetes del visor (`vibracion/index.html`) e intervalos provisionales de la leyenda.
- Sustituir los datos de EJEMPLO de estaciones, eventos y talleres por los reales.
