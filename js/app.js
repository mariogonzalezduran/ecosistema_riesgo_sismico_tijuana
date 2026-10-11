(function(){
'use strict';
var $ = function(s){ return document.querySelector(s); };
var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
var num = function(v){ return (v === null || v === undefined || v === '' || !isFinite(+v)) ? null : +v; };
var fx = function(v, d){ return v == null ? '—' : (+v).toFixed(d == null ? 2 : d); };

var VIEWS = [
  {id:'resumen', label:'Resumen'},
  {id:'riesgo', n:1, label:'Riesgo sísmico'},
  {id:'suelo', n:2, label:'Vibración y suelo'},
  {id:'estaciones', n:3, label:'Estaciones'},
  {id:'mapas', n:4, label:'Mapas de aceleración'},
  {id:'inspeccion', n:5, label:'Inspección'},
  {id:'difusion', n:6, label:'Difusión'}
];
var PUBLICO = {ninos:'Niñas y niños', jovenes:'Jóvenes', lideres:'Líderes comunitarios', proteccion_civil:'Protección Civil', general:'Público general'};
var CFG = window.TABLERO_CFG || null;
var nf = function(n){ try { return (+n).toLocaleString('es-MX'); } catch (e) { return String(n); } };
var SOIL = {
  'I':   {name:'Tipo I',    desc:'Suelo duro con intercalación de roca', c:'--zI'},
  'II':  {name:'Tipo II',   desc:'Suelo medianamente duro, consolidado', c:'--zII'},
  'IIIa':{name:'Tipo IIIa', desc:'Aluviones finos jóvenes', c:'--zIIIa'},
  'IIIb':{name:'Tipo IIIb', desc:'Arrastres gruesos jóvenes', c:'--zIIIb'}
};
var STATUS = {operando:'Operando', instalacion:'En instalación', planeada:'Planeada'};
var KIND = {suelo:'Suelo', estructura:'Estructura'};
var USO = {escuela:'Escuela', hospital:'Hospital', albergue:'Albergue', uabc:'UABC', otro:'Otro'};
var LEVEL = {alta:{t:'Alta', ic:'▲', c:'--crit'}, media:{t:'Media', ic:'◆', c:'--warn'}, baja:{t:'Baja', ic:'●', c:'--good'}};
var QUAKES = [
  [1892,7.7,'24 de febrero · límite Baja California–California'],[1915,7.0,'21 de noviembre'],[1934,7.1,'12 de diciembre'],
  [1940,7.1,'19 de mayo'],[1956,6.7,'9 de febrero'],[1979,7.0,'21 de noviembre'],[1980,6.1,'9 de junio'],
  [1987,6.5,'24 de noviembre'],[2010,7.2,'4 de abril · El Mayor-Cucapah'],[2025,5.2,'14 de abril · a 70 km de Tijuana']
];
var META = 20;

var S = {view:'resumen', mode:'loading', canWrite:false, stations:[], events:[], talleres:[], visits:{}, loadErr:false, eventId:null,
  thr:{med:0.05, high:0.10, df:10}, fl:{soil:'all', status:'all', kind:'all'}, form:null, evForm:null, confirm:null, formErr:''};
var db = null, lid = 0;

try { var saved = JSON.parse(localStorage.getItem('est-thr') || 'null'); if (saved && isFinite(saved.med) && isFinite(saved.high) && isFinite(saved.df)) S.thr = saved; } catch (e) {}
var h0 = (location.hash || '').slice(1);
if (VIEWS.some(function(v){ return v.id === h0; })) S.view = h0;

/* ---------- derived data ---------- */
function hasCoord(s){ return num(s.lat) != null && num(s.lon) != null; }
function sortEvents(){ S.events.sort(function(a,b){ return String(b.date||'').localeCompare(String(a.date||'')); }); }
function curEvent(){ if (!S.events.length) return null; return S.events.filter(function(e){ return e.id === S.eventId; })[0] || S.events[0]; }
function pgaOf(ev, s){ return ev && ev.pga ? num(ev.pga[s.id]) : null; }
function points(ev, exceptId){ var out = []; if (!ev) return out; S.stations.forEach(function(s){ var v = pgaOf(ev, s); if (v != null && hasCoord(s) && s.id !== exceptId) out.push({lat:+s.lat, lon:+s.lon, v:v}); }); return out; }
function km(la1, lo1, la2, lo2){ var kx = 111.32 * Math.cos((la1 + la2) / 2 * Math.PI / 180); var dx = (lo1 - lo2) * kx, dy = (la1 - la2) * 110.57; return Math.sqrt(dx*dx + dy*dy); }
function idw(lat, lon, pts){ if (!pts.length) return null; var sw = 0, sv = 0, dm = 1e9; for (var i = 0; i < pts.length; i++){ var d = km(lat, lon, pts[i].lat, pts[i].lon); if (d < dm) dm = d; var w = 1 / (d*d + 0.01); sw += w; sv += w * pts[i].v; } return dm > 6 ? null : sv / sw; }
function estPga(ev, s){ var m = pgaOf(ev, s); if (m != null) return {v:m, src:'medida'}; if (!ev || !hasCoord(s)) return null; var v = idw(+s.lat, +s.lon, points(ev, s.id)); return v == null ? null : {v:v, src:'estimada'}; }
function level(v){ return v == null ? null : (v >= S.thr.high ? 'alta' : (v >= S.thr.med ? 'media' : 'baja')); }
function dfreq(s){ var b = num(s.f0base), l = num(s.f0last); return (b && l != null) ? (l - b) / b * 100 : null; }
function isChar(s){ return num(s.vs30) != null && num(s.f0) != null; }
function structures(){ return S.stations.filter(function(s){ return s.kind === 'estructura'; }); }
function rank(ev){
  var o = {alta:0, media:1, baja:2};
  return structures().map(function(s){ var p = estPga(ev, s); var d = dfreq(s); return {s:s, p:p, lv:p ? level(p.v) : null, d:d, drop:d != null && d <= -S.thr.df}; })
    .sort(function(a,b){ var la = a.lv ? o[a.lv] : 3, lb = b.lv ? o[b.lv] : 3; if (la !== lb) return la - lb; if (a.drop !== b.drop) return a.drop ? -1 : 1; return (b.p ? b.p.v : -1) - (a.p ? a.p.v : -1); });
}
function pillLevel(lv){ if (!lv) return '<span class="pill"><span class="ic na">○</span>Sin dato</span>'; var L = LEVEL[lv]; return '<span class="pill"><span class="ic ' + lv + '">' + L.ic + '</span><b>' + L.t + '</b></span>'; }
function ej(o){ return o && o.ejemplo ? '<span class="ej">EJEMPLO</span>' : ''; }
function loadingOr(html){ return S.mode === 'loading' ? '<p class="hint">Cargando datos…</p>' : html; }

/* ---------- map ---------- */
function bbox(sts){
  var b = {lon0:-117.14, lon1:-116.78, lat0:32.39, lat1:32.57};
  sts.forEach(function(s){ b.lon0 = Math.min(b.lon0, +s.lon - 0.015); b.lon1 = Math.max(b.lon1, +s.lon + 0.015); b.lat0 = Math.min(b.lat0, +s.lat - 0.012); b.lat1 = Math.max(b.lat1, +s.lat + 0.012); });
  var kx = Math.cos((b.lat0 + b.lat1) / 2 * Math.PI / 180), want = 760 / 450;
  var w = (b.lon1 - b.lon0) * kx, hgt = b.lat1 - b.lat0;
  if (w / hgt < want){ var nw = hgt * want / kx, c = (b.lon0 + b.lon1) / 2; b.lon0 = c - nw / 2; b.lon1 = c + nw / 2; }
  else { var nh = w / want, c2 = (b.lat0 + b.lat1) / 2; b.lat0 = c2 - nh / 2; b.lat1 = c2 + nh / 2; }
  return b;
}
function emptyMapHTML(){ return '<div class="empty">' + (S.mode === 'loading' ? '<p>Cargando estaciones…</p>' : '<p><b>Aún no hay estaciones registradas.</b><br>Aquí aparecerán por latitud y longitud, con su tipo de suelo y su estado.</p>' + (S.canWrite ? '<button class="btn" data-act="addSt">Agregar la primera estación</button>' : '')) + '</div>'; }
function mapHTML(o){
  if (window.L){ var lid = 'lm' + (++LM.seq); LM.cfg[lid] = o; return '<div class="mapwrap"><div class="lmap" id="' + lid + '" role="region" aria-label="' + esc(o.aria) + '"></div>' + (o.stations.filter(hasCoord).length ? '' : emptyMapHTML()) + '</div>'; }
  var W = 760, H = 450, sts = o.stations.filter(hasCoord), b = bbox(sts);
  var X = function(lon){ return (lon - b.lon0) / (b.lon1 - b.lon0) * W; }, Y = function(lat){ return (b.lat1 - lat) / (b.lat1 - b.lat0) * H; };
  var g = '', span = b.lon1 - b.lon0, step = span > 1.5 ? 0.5 : (span > 0.6 ? 0.1 : 0.05), dec = step < 0.1 ? 2 : 1, v;
  var coast = [[32.70,-117.19],[32.58,-117.134],[32.5344,-117.1247],[32.50,-117.124],[32.46,-117.110],[32.42,-117.095],[32.36,-117.06],[32.25,-116.98]];
  g += '<path d="M' + coast.map(function(p){ return X(p[1]).toFixed(1) + ' ' + Y(p[0]).toFixed(1); }).join(' L') + ' L' + X(b.lon0 - 1).toFixed(1) + ' ' + Y(32.25).toFixed(1) + ' L' + X(b.lon0 - 1).toFixed(1) + ' ' + Y(32.70).toFixed(1) + ' Z" style="fill:var(--accent-soft);opacity:.55"/>';
  for (v = Math.ceil(b.lon0 / step) * step; v < b.lon1; v += step){ g += '<line x1="' + X(v).toFixed(1) + '" x2="' + X(v).toFixed(1) + '" y1="0" y2="' + H + '" style="stroke:var(--line)" stroke-width="1"/>' + (X(v) < W - 90 ? '<text class="glabel" x="' + (X(v) + 4).toFixed(1) + '" y="' + (H - 6) + '">' + Math.abs(v).toFixed(dec) + '°O</text>' : ''); }
  for (v = Math.ceil(b.lat0 / step) * step; v < b.lat1; v += step){ g += '<line y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" x1="0" x2="' + W + '" style="stroke:var(--line)" stroke-width="1"/><text class="glabel" x="6" y="' + (Y(v) - 4).toFixed(1) + '">' + v.toFixed(dec) + '°N</text>'; }
  var bl = function(lon){ return 32.5344 + 0.0766 * (lon + 117.1247); };
  g += '<line x1="' + X(-117.1247).toFixed(1) + '" y1="' + Y(32.5344).toFixed(1) + '" x2="' + X(b.lon1).toFixed(1) + '" y2="' + Y(bl(b.lon1)).toFixed(1) + '" style="stroke:var(--line-2)" stroke-width="1.5" stroke-dasharray="7 5"/>';
  g += '<text class="glabel" text-anchor="end" x="' + (W - 8) + '" y="' + (Y(bl(b.lon1)) - 6).toFixed(1) + '">Frontera México–EE. UU. (aprox.)</text>';
  g += '<text class="glabel" x="' + Math.max(6, X(-117.135) - 26).toFixed(1) + '" y="' + Y(32.47).toFixed(1) + '">Pacífico</text>';
  var order = {planeada:0, instalacion:1, operando:2};
  sts.slice().sort(function(a,c){ return (order[a.status] || 0) - (order[c.status] || 0); }).forEach(function(s){
    var x = X(+s.lon), y = Y(+s.lat), c = 'var(' + o.color(s) + ')';
    var solid = s.status === 'operando', mid = s.status === 'instalacion';
    var st = 'fill:' + (solid || mid ? c : 'var(--surface)') + ';fill-opacity:' + (mid ? .4 : 1) + ';stroke:' + (solid ? 'var(--surface)' : c) + ';stroke-width:2';
    g += s.kind === 'estructura' ? '<rect x="' + (x - 6.5).toFixed(1) + '" y="' + (y - 6.5).toFixed(1) + '" width="13" height="13" rx="2" style="' + st + '"/>' : '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="7" style="' + st + '"/>';
    var flip = x > W - 90;
    g += '<text class="mlabel" ' + (flip ? 'text-anchor="end" ' : '') + 'x="' + (x + (flip ? -11 : 11)).toFixed(1) + '" y="' + (y + 4).toFixed(1) + '">' + esc(o.label(s)) + '</text>';
    g += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="14" fill="transparent" tabindex="0" data-tip="' + esc(o.tip(s)) + '"/>';
  });
  var empty = '';
  if (!sts.length) empty = '<div class="empty">' + (S.mode === 'loading' ? '<p>Cargando estaciones…</p>' : '<p><b>Aún no hay estaciones registradas.</b><br>Aquí aparecerán por latitud y longitud, con su tipo de suelo y su estado.</p>' + (S.canWrite ? '<button class="btn" data-act="addSt">Agregar la primera estación</button>' : '')) + '</div>';
  return '<div class="mapwrap" data-bbox="' + esc(JSON.stringify(b)) + '">' + (o.field ? '<canvas class="field" width="190" height="112"></canvas>' : '') +
    '<svg viewBox="0 0 760 450" preserveAspectRatio="none" role="img" aria-label="' + esc(o.aria) + '">' + g + '</svg>' + empty + '</div>';
}
function hexRgb(h){ h = String(h).trim().replace('#',''); if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]; }
function drawFields(){
  var cs = getComputedStyle(document.documentElement), ev = curEvent(), pts = points(ev);
  var col = {baja:hexRgb(cs.getPropertyValue('--good')), media:hexRgb(cs.getPropertyValue('--warn')), alta:hexRgb(cs.getPropertyValue('--crit'))};
  document.querySelectorAll('canvas.field').forEach(function(cv){
    var b = JSON.parse(cv.parentNode.getAttribute('data-bbox')), ctx = cv.getContext('2d'), w = cv.width, h = cv.height, img = ctx.createImageData(w, h);
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++){
      var lon = b.lon0 + (i + .5) / w * (b.lon1 - b.lon0), lat = b.lat1 - (j + .5) / h * (b.lat1 - b.lat0), v = idw(lat, lon, pts);
      if (v == null) continue; var c = col[level(v)], k = (j * w + i) * 4; img.data[k] = c[0]; img.data[k+1] = c[1]; img.data[k+2] = c[2]; img.data[k+3] = 92;
    }
    ctx.putImageData(img, 0, 0);
  });
}
function soilLegend(){
  return '<div class="legend"><span><i class="sw" style="background:var(--zI)"></i>Tipo I</span><span><i class="sw" style="background:var(--zII)"></i>Tipo II</span><span><i class="sw" style="background:var(--zIIIa)"></i>Tipo IIIa</span><span><i class="sw" style="background:var(--zIIIb)"></i>Tipo IIIb</span>' +
    '<span><i class="sw" style="background:var(--muted)"></i>Suelo</span><span><i class="sw sq" style="background:var(--muted)"></i>Estructura</span><span>Relleno sólido: operando · tenue: en instalación · hueco: planeada</span></div>';
}
function levelLegend(){
  return '<div class="legend"><span><span class="ic alta">▲</span>Alta: ≥ ' + fx(S.thr.high) + ' g</span><span><span class="ic media">◆</span>Media: ≥ ' + fx(S.thr.med) + ' g</span><span><span class="ic baja">●</span>Baja: menor</span><span>Sin color: a más de 6 km de una estación con registro</span></div>';
}
function shakeMap(ev){
  return mapHTML({stations:S.stations, field:true, aria:'Mapa de aceleración interpolada por estación',
    color:function(s){ var v = pgaOf(ev, s); return v == null ? '--deemph' : LEVEL[level(v)].c; },
    label:function(s){ var v = pgaOf(ev, s); return v == null ? '' : fx(v, 3); },
    ev:ev, tip:function(s){ var v = pgaOf(ev, s); return tipBase(s) + '|PGA: ' + (v == null ? 'sin registro' : fx(v, 3) + ' g · prioridad ' + LEVEL[level(v)].t.toLowerCase()); }});
}
function tipBase(s){ return String(s.name || 'Sin nombre').replace(/\|/g, '/') + '|' + (SOIL[s.soil] ? SOIL[s.soil].name : 'Suelo sin clasificar') + ' · ' + (KIND[s.kind] || '') + (s.kind === 'estructura' && USO[s.uso] ? ' (' + USO[s.uso].toLowerCase() + ')' : '') + '|' + (STATUS[s.status] || ''); }

/* ---------- views ---------- */
function visitsHTML(){ if (!CFG) return ''; var n = S.visits[S.view]; return '<span class="visits" title="Visitas a este componente"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>' + (n == null ? 'Contando visitas…' : '<b>' + nf(n) + '</b> ' + (+n === 1 ? 'visita' : 'visitas')) + '</span>'; }
function head(eb, title, lead){ return '<div class="vhead"><div class="vtop"><span class="eyebrow">' + eb + '</span>' + visitsHTML() + '</div><h2>' + title + '</h2><p>' + lead + '</p></div>'; }
function kpi(lab, n, total, foot){ var pct = Math.max(0, Math.min(100, n / total * 100)); return '<div class="kpi"><span class="lab">' + lab + '</span><span class="val">' + (S.mode === 'loading' ? '…' : n) + ' <small>de ' + total + '</small></span><div class="meter" role="img" aria-label="' + n + ' de ' + total + '"><i style="width:' + pct + '%"></i></div><span class="foot">' + foot + '</span></div>'; }

var V = {};
V.resumen = function(){
  var ev = curEvent(), op = S.stations.filter(function(s){ return s.status === 'operando'; });
  var soils = {}; op.forEach(function(s){ if (SOIL[s.soil]) soils[s.soil] = 1; });
  var r = rank(ev).slice(0, 6), pts = points(ev), mx = pts.reduce(function(m, p){ return Math.max(m, p.v); }, 0);
  var h = head('Resumen', 'Del riesgo regional a la decisión de inspección', 'Seis componentes comparten una sola base de datos: la amenaza justifica caracterizar el suelo, el suelo define dónde van las estaciones, las estaciones producen el mapa de aceleración, el mapa dirige la inspección y la difusión devuelve los resultados a la comunidad.');
  h += '<div class="grid g4">' + kpi('Sitios caracterizados', S.stations.filter(isChar).length, META, 'Con Vs30 y frecuencia fundamental') + kpi('Sensores operando', op.length, META, 'Meta SECIHTI 2026') +
    kpi('Estructuras instrumentadas', op.filter(function(s){ return s.kind === 'estructura'; }).length, META, 'Escuelas, hospitales, albergues') + kpi('Tipos de suelo cubiertos', Object.keys(soils).length, 4, 'NTC-RC-BC, Zona C') + '</div>';
  h += '<div class="grid g2"><div class="card"><header><h2>' + (ev ? 'Último evento: ' + esc(ev.name) + ej(ev) : 'Mapa de aceleración') + '</h2><span class="hint">' + (ev ? esc(ev.date || '') + (num(ev.mag) != null ? ' · M ' + fx(ev.mag, 1) : '') + (pts.length ? ' · PGA máx. ' + fx(mx, 3) + ' g' : '') : 'Sin eventos registrados') + '</span></header>' +
    shakeMap(ev) + levelLegend() + '<div><button class="btn ghost sm" data-act="go" data-id="mapas">Abrir mapas de aceleración</button></div></div>';
  h += '<div class="card"><header><h2>Prioridad de revisión</h2><span class="hint">Estructuras, de mayor a menor</span></header>';
  if (S.mode === 'loading') h += '<p class="hint">Cargando datos…</p>';
  else if (!r.length) h += '<p class="hint">Cuando registres estructuras instrumentadas, aquí se ordenan por la aceleración del último evento y por cambios en su frecuencia.</p>';
  else h += '<div class="scroll"><table><thead><tr><th>Estructura</th><th>Prioridad</th><th class="num">PGA (g)</th></tr></thead><tbody>' + r.map(function(x){ return '<tr><td>' + esc(x.s.name) + (x.drop ? ' <span class="pill"><span class="ic alta">▼</span>frecuencia ' + fx(x.d, 1) + ' %</span>' : '') + '</td><td>' + pillLevel(x.lv) + '</td><td class="num">' + (x.p ? fx(x.p.v, 3) + (x.p.src === 'estimada' ? ' <span class="hint">est.</span>' : '') : '—') + '</td></tr>'; }).join('') + '</tbody></table></div><p class="src">«est.»: PGA interpolada de estaciones a menos de 6 km.</p>';
  h += '<div><button class="btn ghost sm" data-act="go" data-id="inspeccion">Abrir inspección</button></div></div></div>';
  h += '<div class="card"><header><h2>Tiempos objetivo tras un sismo</h2><span class="hint">Propuesta UABC 351/6/C/49/26, fase III</span></header><div class="flow">' +
    '<div><span class="t">t = 0</span><h3>Detección automática</h3><p>STA/LTA de 3 y PGA &gt; 0.1 g en dos estaciones o más.</p></div>' +
    '<div><span class="t">&lt; 5 min</span><h3>Alerta a autoridades</h3><p>SMS o Telegram desde el servidor SeisComP.</p></div>' +
    '<div><span class="t">&lt; 10 min</span><h3>Mapa de aceleración</h3><p>ShakeMap local con PGA, PGV y Sa(T).</p></div>' +
    '<div><span class="t">en línea</span><h3>Publicación abierta</h3><p>Portal UABC, SSN e II-UNAM; envío a Protección Civil.</p></div></div></div>';
  return h;
};

V.riesgo = function(){
  var W = 640, H = 300, l = 36, r = 10, t = 26, bt = 34, band = (W - l - r) / QUAKES.length, y = function(v){ return t + (8 - v) / 8 * (H - t - bt); }, g = '';
  [0,2,4,6,8].forEach(function(v){ g += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + y(v) + '" y2="' + y(v) + '" style="stroke:' + (v ? 'var(--line)' : 'var(--line-2)') + '" stroke-width="1"/><text class="glabel" text-anchor="end" x="' + (l - 6) + '" y="' + (y(v) + 3) + '">' + v + '</text>'; });
  QUAKES.forEach(function(q, i){
    var cx = l + band * (i + .5), top = y(q[1]), base = y(0), c = q[0] === 2010 ? 'var(--s2)' : (q[0] === 2025 ? 'var(--s1)' : 'var(--deemph)');
    g += '<path d="M' + (cx - 11) + ' ' + base + ' V' + (top + 4) + ' Q' + (cx - 11) + ' ' + top + ' ' + (cx - 7) + ' ' + top + ' H' + (cx + 7) + ' Q' + (cx + 11) + ' ' + top + ' ' + (cx + 11) + ' ' + (top + 4) + ' V' + base + ' Z" style="fill:' + c + '"/>';
    g += '<text class="glabel" text-anchor="middle" x="' + cx + '" y="' + (H - 14) + '">' + q[0] + '</text>';
    if (q[0] === 1892 || q[0] === 2010 || q[0] === 2025) g += '<text class="mlabel" text-anchor="middle" x="' + cx + '" y="' + (top - 7) + '">' + q[1].toFixed(1) + '</text>';
    g += '<rect x="' + (cx - band / 2) + '" y="' + t + '" width="' + band + '" height="' + (H - t - bt) + '" fill="transparent" tabindex="0" data-tip="' + q[0] + ' · M ' + q[1].toFixed(1) + '|' + esc(q[2]) + '"/>';
  });
  var h = head('1 · La amenaza', 'Riesgo sísmico', 'Tijuana está rodeada por diez sistemas de fallas activas. Hasta ahora, después de un sismo solo se conoce la magnitud y el epicentro, no qué zonas de la ciudad se movieron más.');
  h += '<div class="grid g4">' + [['8,402','sismos M ≥ 3.0 en la región, 1915–2022'],['M 7.2','El Mayor-Cucapah, 4 de abril de 2010'],['10','sistemas de fallas que controlan la zona'],['> 2 M','habitantes en la zona metropolitana']].map(function(k){ return '<div class="kpi"><span class="val">' + k[0] + '</span><span class="lab">' + k[1] + '</span></div>'; }).join('') + '</div>';
  h += '<div class="grid g2"><div class="card"><header><h2>Sismos destacados, 1892–2025</h2><span class="hint">Magnitud por evento</span></header>' +
    '<div class="scroll"><svg viewBox="0 0 640 300" style="width:100%;min-width:480px;height:auto;display:block" role="img" aria-label="Magnitud de diez sismos destacados entre 1892 y 2025">' + g + '</svg></div>' +
    '<div class="legend"><span><i class="sw sq" style="background:var(--s2)"></i>2010, El Mayor-Cucapah: daños por 3,377 millones de pesos</span><span><i class="sw sq" style="background:var(--s1)"></i>2025, a 70 km de Tijuana: daños y ningún mapa de aceleración</span></div>' +
    '<details><summary>Ver como tabla</summary><div class="scroll"><table><thead><tr><th>Año</th><th class="num">Magnitud</th><th>Fecha y referencia</th></tr></thead><tbody>' + QUAKES.map(function(q){ return '<tr><td>' + q[0] + '</td><td class="num">' + q[1].toFixed(1) + '</td><td>' + esc(q[2]) + '</td></tr>'; }).join('') + '</tbody></table></div></details></div>';
  h += '<div class="card"><h2>Fallas activas</h2><div class="chips">' + ['San Andrés','Elsinore','Imperial','Laguna Salada','Coronado Bank','San Diego','San Clemente','Agua Blanca','Vallecitos','San Miguel'].map(function(f){ return '<span>' + f + '</span>'; }).join('') + '</div>' +
    '<h3>Qué aporta al ecosistema</h3><ul class="plain"><li>Justifica una red urbana densa: las redes del SSN, CICESE y USGS tienen pocas estaciones dentro de la ciudad.</li><li>Define el umbral de interés: sismos locales de Mw &gt; 3.0.</li><li>Da contexto a cada evento que se registre en Mapas de aceleración.</li></ul>' +
    '<p class="src">Fuente: propuesta UABC 351/6/C/49/26, con catálogos del SSN y el USGS. Magnitudes tal como aparecen en la propuesta.</p></div></div>';
  return h;
};

function flSelect(k, label, opts){ return '<label>' + label + ' <select id="fl-' + k + '" data-fl="' + k + '"><option value="all">Todos</option>' + Object.keys(opts).map(function(o){ return '<option value="' + o + '"' + (S.fl[k] === o ? ' selected' : '') + '>' + esc(opts[o].name || opts[o]) + '</option>'; }).join('') + '</select></label>'; }
function filtered(){ return S.stations.filter(function(s){ return (S.fl.soil === 'all' || s.soil === S.fl.soil) && (S.fl.status === 'all' || s.status === S.fl.status) && (S.fl.kind === 'all' || s.kind === S.fl.kind); }); }

V.suelo = function(){
  var h = head('2 · El sitio', 'Vibración ambiental y tipos de suelo', 'La misma demanda regional produce efectos distintos según el suelo. Aquí se integran las lecturas de vibración ambiental del proyecto y la caracterización de cada sitio: ruido ambiental, frecuencia fundamental y Vs30.');
  h += '<div class="grid g4">' + Object.keys(SOIL).map(function(k){ var n = S.stations.filter(function(s){ return s.soil === k; }).length; return '<div class="kpi"><div class="soil"><span class="tag" style="border-color:var(' + SOIL[k].c + ')">' + k + '</span><div><h3>' + SOIL[k].name + '</h3><span class="lab">' + SOIL[k].desc + '</span></div></div><span class="foot">' + (S.mode === 'loading' ? '…' : n + (n === 1 ? ' sitio registrado' : ' sitios registrados')) + '</span></div>'; }).join('') + '</div>';
  var list = filtered();
  h += '<div id="vibSlot"></div>';
  h += '<div class="grid g2"><div class="card"><header><h2>Caracterización por sitio</h2><div class="filters">' + flSelect('soil', 'Tipo de suelo', SOIL) + '</div></header>';
  h += loadingOr(!S.stations.length ? '<p class="hint">Aún no hay sitios. Regístralos en Estaciones con su tipo de suelo, ruido P10, frecuencia fundamental y Vs30.</p>' :
    '<div class="scroll"><table><thead><tr><th>Sitio</th><th>Suelo</th><th class="num">Ruido P10 (dB)</th><th>Criterio</th><th class="num">f0 (Hz)</th><th class="num">Vs30 (m/s)</th></tr></thead><tbody>' + list.map(function(s){ var p = num(s.p10);
      return '<tr><td>' + esc(s.name) + ej(s) + '</td><td>' + esc(s.soil || '—') + '</td><td class="num">' + fx(p, 0) + '</td><td>' + (p == null ? '<span class="pill"><span class="ic na">○</span>Sin medir</span>' : (p < -100 ? '<span class="pill"><span class="ic baja">✓</span><b>Cumple</b></span>' : '<span class="pill"><span class="ic alta">✕</span><b>No cumple</b></span>')) + '</td><td class="num">' + fx(s.f0, 1) + '</td><td class="num">' + fx(s.vs30, 0) + '</td></tr>'; }).join('') + '</tbody></table></div>' + (list.length ? '' : '<p class="hint">Ningún sitio con ese filtro.</p>'));
  h += '</div><div class="card"><h2>Protocolo de ruido ambiental</h2><div class="scroll"><table><tbody>' + [['Registro continuo','72 h por sitio'],['Banda útil','0.1–50 Hz'],['Muestreo','200 Hz'],['Ventanas de análisis','30 min, espectro PSD'],['Criterio de aceptación','P10 < −100 dB en 0.5–5 Hz'],['Variabilidad temporal','< 3 dB']].map(function(r){ return '<tr><td>' + r[0] + '</td><td class="num">' + esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
    '<ul class="plain"><li>La relación espectral H/V da la frecuencia fundamental.</li><li>El penetrómetro PANDA ajusta el Vs30 de cada sitio.</li><li>Meta SECIHTI: 20 sitios caracterizados.</li></ul><p class="src">Fuentes: propuesta UABC 351/6/C/49/26, fase I, y protocolo SECIHTI 2026.</p></div></div>';
  return h;
};

function field(k, label, type, extra){ var d = S.form.d; return '<label' + (k === 'name' ? ' class="w2"' : '') + '>' + label + '<input id="f-' + k + '" data-f="' + k + '" type="' + type + '" value="' + esc(d[k] == null ? '' : d[k]) + '"' + (extra || '') + '></label>'; }
function sel(k, label, opts){ var d = S.form.d; return '<label>' + label + '<select id="f-' + k + '" data-f="' + k + '">' + Object.keys(opts).map(function(o){ return '<option value="' + o + '"' + (d[k] === o ? ' selected' : '') + '>' + esc(opts[o].name || opts[o]) + '</option>'; }).join('') + '</select></label>'; }
function stationForm(){
  if (!S.form) return '';
  return '<div class="card"><h2>' + (S.form.id ? 'Editar estación' : 'Nueva estación') + '</h2><form id="stForm" class="form" novalidate>' +
    field('name', 'Nombre del sitio', 'text', ' maxlength="80"') + sel('kind', 'Instrumenta', KIND) + sel('uso', 'Uso del edificio', USO) + sel('soil', 'Tipo de suelo', SOIL) + sel('status', 'Estado', STATUS) +
    field('lat', 'Latitud (°N)', 'number', ' step="0.0001"') + field('lon', 'Longitud (negativa al oeste)', 'number', ' step="0.0001"') + field('p10', 'Ruido P10 (dB)', 'number', ' step="1"') + field('f0', 'f0 del sitio (Hz)', 'number', ' step="0.1"') + field('vs30', 'Vs30 (m/s)', 'number', ' step="1"') +
    field('f0base', 'Frecuencia base del edificio (Hz)', 'number', ' step="0.01"') + field('f0last', 'Última frecuencia medida (Hz)', 'number', ' step="0.01"') +
    '<div class="actions"><button class="btn" type="submit">Guardar</button><button class="btn ghost" type="button" data-act="cancelForm">Cancelar</button>' + (S.formErr ? '<span class="err">' + esc(S.formErr) + '</span>' : '') + '</div></form></div>';
}

V.estaciones = function(){
  var list = filtered(), by = function(k, v){ return S.stations.filter(function(s){ return s[k] === v; }).length; };
  var h = head('3 · La red', 'Estaciones de monitoreo de bajo costo', 'Acelerómetros MEMS triaxiales (±2 g, 200 Hz) anclados a piso, muro o columna. Solo requieren corriente eléctrica e Internet; transmiten por SeedLink al servidor de la UABC.');
  h += '<div class="filters">' + flSelect('soil', 'Tipo de suelo', SOIL) + flSelect('status', 'Estado', STATUS) + flSelect('kind', 'Instrumenta', KIND) + (S.canWrite && !S.form ? '<button class="btn" data-act="addSt">Agregar estación</button>' : '') + '</div>';
  h += stationForm();
  h += '<div id="shmSlot"></div>';
  h += '<div class="grid g2"><div class="card"><header><h2>Ubicación de la red</h2><span class="hint">' + list.length + ' de ' + S.stations.length + ' estaciones</span></header>' +
    mapHTML({stations:list, aria:'Ubicación de las estaciones por latitud y longitud', color:function(s){ return SOIL[s.soil] ? SOIL[s.soil].c : '--deemph'; }, label:function(s){ return s.soil || ''; }, tip:tipBase}) + soilLegend() + '</div>';
  h += '<div class="card"><h2>Estado de la red</h2><div class="scroll"><table><tbody><tr><td>Operando</td><td class="num">' + by('status','operando') + '</td></tr><tr><td>En instalación</td><td class="num">' + by('status','instalacion') + '</td></tr><tr><td>Planeadas</td><td class="num">' + by('status','planeada') + '</td></tr><tr><td>En suelo</td><td class="num">' + by('kind','suelo') + '</td></tr><tr><td>En estructura</td><td class="num">' + by('kind','estructura') + '</td></tr></tbody></table></div>' +
    '<h3>Inversión inicial de una red</h3><div class="bars"><div><div class="row"><span>Banda ancha convencional</span><span>≥ $1,000,000</span></div><div class="bar" style="width:100%"></div></div><div><div class="row"><span>MEMS de bajo costo, 5 estaciones</span><span>$300,000</span></div><div class="bar hi" style="width:30%"></div></div></div>' +
    '<p class="src">Fuente: propuesta UABC 351/6/C/49/26. El protocolo SECIHTI 2026 parte de 10 estaciones disponibles y suma al menos 20.</p></div></div>';
  h += '<div class="card"><h2>Registro de estaciones</h2>' + loadingOr(!S.stations.length ? '<p class="hint">Sin estaciones todavía.' + (S.canWrite ? ' Usa «Agregar estación» para registrar la primera.' : '') + '</p>' :
    '<div class="scroll"><table><thead><tr><th>Estación</th><th>Instrumenta</th><th>Suelo</th><th>Estado</th><th class="num">Latitud</th><th class="num">Longitud</th>' + (S.canWrite ? '<th></th>' : '') + '</tr></thead><tbody>' + list.map(function(s){
      var act = S.confirm === 'st:' + s.id ? '<button class="btn sm" data-act="delStYes" data-id="' + esc(s.id) + '">Sí, eliminar</button> <button class="btn ghost sm" data-act="confirmNo">No</button>' : '<button class="btn ghost sm" data-act="editSt" data-id="' + esc(s.id) + '">Editar</button> <button class="btn ghost sm" data-act="delSt" data-id="' + esc(s.id) + '">Eliminar</button>';
      return '<tr><td>' + esc(s.name) + ej(s) + '</td><td>' + esc(KIND[s.kind] || '—') + (s.kind === 'estructura' && USO[s.uso] ? ' · ' + USO[s.uso] : '') + '</td><td>' + esc(s.soil || '—') + '</td><td>' + esc(STATUS[s.status] || '—') + '</td><td class="num">' + fx(s.lat, 4) + '</td><td class="num">' + fx(s.lon, 4) + '</td>' + (S.canWrite ? '<td style="white-space:nowrap">' + act + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table></div>') + '</div>';
  return h;
};

function eventForm(){
  if (!S.evForm) return '';
  var d = S.evForm;
  return '<div class="card"><h2>Nuevo evento</h2><form id="evForm" class="form" novalidate><label class="w2">Nombre<input id="e-name" data-ef="name" type="text" maxlength="80" value="' + esc(d.name || '') + '"></label><label>Fecha<input id="e-date" data-ef="date" type="date" value="' + esc(d.date || '') + '"></label><label>Magnitud<input id="e-mag" data-ef="mag" type="number" step="0.1" value="' + esc(d.mag || '') + '"></label>' +
    '<div class="actions"><button class="btn" type="submit">Crear evento</button><button class="btn ghost" type="button" data-act="cancelEv">Cancelar</button>' + (S.formErr ? '<span class="err">' + esc(S.formErr) + '</span>' : '') + '</div></form></div>';
}
function thrInput(k, label, step, unit){ return '<label>' + label + ' <input id="thr-' + k + '" data-thr="' + k + '" type="number" step="' + step + '" min="0" value="' + S.thr[k] + '" style="width:84px"> ' + unit + '</label>'; }

V.mapas = function(){
  var ev = curEvent(), pts = points(ev);
  var h = head('4 · La respuesta', 'Mapas de aceleración', 'Captura la aceleración máxima (PGA) de cada estación para un evento. El mapa interpola entre estaciones y clasifica cada zona con el semáforo de prioridad.');
  h += '<div class="filters">' + (S.events.length ? '<label>Evento <select id="evSel">' + S.events.map(function(e){ return '<option value="' + esc(e.id) + '"' + (ev && e.id === ev.id ? ' selected' : '') + '>' + esc((e.date ? e.date + ' · ' : '') + e.name + (e.ejemplo ? ' (ejemplo)' : '')) + '</option>'; }).join('') + '</select></label>' : '') +
    thrInput('med', 'Media desde', '0.01', 'g') + thrInput('high', 'Alta desde', '0.01', 'g') + (S.canWrite && !S.evForm ? '<button class="btn" data-act="newEv">Nuevo evento</button>' : '') +
    (S.canWrite && ev ? (S.confirm === 'ev:' + ev.id ? '<button class="btn sm" data-act="delEvYes" data-id="' + esc(ev.id) + '">Sí, eliminar evento</button><button class="btn ghost sm" data-act="confirmNo">No</button>' : '<button class="btn ghost" data-act="delEv" data-id="' + esc(ev.id) + '">Eliminar evento</button>') : '') + '</div>';
  h += eventForm();
  if (S.mode !== 'loading' && !ev) h += '<div class="card"><p class="hint"><b>Aún no hay eventos.</b> Crea uno y captura la PGA de cada estación; el mapa y el semáforo se calculan solos.</p></div>';
  h += '<div class="grid g2"><div class="card"><header><h2>' + (ev ? esc(ev.name) + ej(ev) : 'Mapa de aceleración') + '</h2><span class="hint">' + (ev ? esc(ev.date || '') + (num(ev.mag) != null ? ' · M ' + fx(ev.mag, 1) : '') + ' · ' + pts.length + ' estaciones con registro' : '') + '</span></header>' + shakeMap(ev) + levelLegend() +
    '<p class="src">Los umbrales del semáforo son ajustables y están por acordarse con Protección Civil; 0.10 g es el criterio de disparo de alerta de la propuesta. Interpolación por distancia inversa, solo a menos de 6 km de una estación.</p></div>';
  h += '<div class="card"><header><h2>PGA por estación</h2><span class="hint">en g</span></header>';
  if (S.mode === 'loading') h += '<p class="hint">Cargando datos…</p>';
  else if (!ev) h += '<p class="hint">Selecciona o crea un evento.</p>';
  else if (!S.stations.length) h += '<p class="hint">Registra estaciones primero.</p>';
  else h += '<div class="scroll"><table><thead><tr><th>Estación</th><th>Suelo</th><th class="num">PGA (g)</th><th>Prioridad</th></tr></thead><tbody>' + S.stations.slice().sort(function(a,b){ return (pgaOf(ev,b) == null ? -1 : pgaOf(ev,b)) - (pgaOf(ev,a) == null ? -1 : pgaOf(ev,a)); }).map(function(s){ var v = pgaOf(ev, s);
      return '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.soil || '—') + '</td><td class="num">' + (S.canWrite ? '<input class="pga" id="pga-' + esc(s.id) + '" data-pga="' + esc(s.id) + '" type="number" step="0.001" min="0" aria-label="PGA de ' + esc(s.name) + '" value="' + (v == null ? '' : v) + '">' : fx(v, 3)) + '</td><td>' + pillLevel(level(v)) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  h += '</div></div>';
  return h;
};

V.inspeccion = function(){
  var ev = curEvent(), r = rank(ev), rev = (ev && ev.rev) || {};
  var nAlta = r.filter(function(x){ return x.lv === 'alta'; }).length, nDrop = r.filter(function(x){ return x.drop; }).length, nRev = r.filter(function(x){ return rev[x.s.id]; }).length;
  var h = head('5 · La decisión', 'Inspección de infraestructura social', 'Escuelas, hospitales y albergues ordenados por dónde empezar: primero la aceleración del evento en su sitio, después la pérdida de frecuencia, que sugiere degradación de rigidez.');
  h += '<div class="grid g3"><div class="kpi"><span class="lab">Prioridad alta en el evento</span><span class="val">' + nAlta + ' <small>de ' + r.length + '</small></span><span class="foot">' + (ev ? esc(ev.name) : 'Sin evento') + '</span></div>' +
    '<div class="kpi"><span class="lab">Con caída de frecuencia</span><span class="val">' + nDrop + ' <small>de ' + r.length + '</small></span><span class="foot">Caída de ' + fx(S.thr.df, 0) + ' % o más frente a la base</span></div>' +
    '<div class="kpi"><span class="lab">Revisadas tras el evento</span><span class="val">' + nRev + ' <small>de ' + r.length + '</small></span><div class="meter"><i style="width:' + (r.length ? nRev / r.length * 100 : 0) + '%"></i></div></div></div>';
  h += '<div class="filters">' + thrInput('df', 'Marcar caída de frecuencia desde', '1', '%') + '<span class="hint">Valor de trabajo ajustable; el criterio técnico está por definirse.</span></div>';
  h += '<div class="card"><header><h2>Orden de revisión</h2><span class="hint">' + (ev ? 'Evento: ' + esc(ev.name) : '') + '</span></header>' + loadingOr(!r.length ? '<p class="hint">Aún no hay estructuras. Regístralas en Estaciones con «Instrumenta: Estructura», su frecuencia base y la última medida.</p>' :
    '<div class="scroll"><table><thead><tr><th>#</th><th>Estructura</th><th>Uso</th><th>Suelo</th><th>Prioridad</th><th class="num">PGA (g)</th><th class="num">f base (Hz)</th><th class="num">f última (Hz)</th><th class="num">Cambio</th><th>Revisión</th></tr></thead><tbody>' + r.map(function(x, i){ var s = x.s, done = !!rev[s.id];
      return '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(s.name) + ej(s) + '</td><td>' + esc(USO[s.uso] || '—') + '</td><td>' + esc(s.soil || '—') + '</td><td>' + pillLevel(x.lv) + '</td><td class="num">' + (x.p ? fx(x.p.v, 3) + ' <span class="hint">' + x.p.src + '</span>' : '—') + '</td><td class="num">' + fx(s.f0base, 2) + '</td><td class="num">' + fx(s.f0last, 2) + '</td><td class="num">' + (x.d == null ? '—' : (x.drop ? '<span class="ic alta">▼</span> ' : '') + (x.d > 0 ? '+' : '') + fx(x.d, 1) + ' %') + '</td><td>' +
        (S.canWrite && ev ? '<button class="btn ' + (done ? '' : 'ghost ') + 'sm" id="rev-' + esc(s.id) + '" data-act="toggleRev" data-id="' + esc(s.id) + '" aria-pressed="' + done + '">' + (done ? '✓ Revisada' : 'Marcar revisada') + '</button>' : (done ? 'Revisada' : 'Pendiente')) + '</td></tr>'; }).join('') + '</tbody></table></div>') + '</div>';
  h += '<div class="grid g3"><div class="card"><h3>Qué se mide en cada edificio</h3><ul class="plain"><li>Frecuencias naturales y modos de vibrar (análisis modal operacional)</li><li>Amortiguamiento estructural</li><li>Inclinación y asentamiento</li><li>Deformación en elementos críticos</li></ul>' + (window.L ? '<p class="src">Monitoreo continuo de escuelas: <a href="shm/index.html" target="_blank" rel="noopener">panel SHM + P-Alert (simulado)</a>.</p>' : '') + '</div>' +
    '<div class="card"><h3>Qué dispara la revisión</h3><ul class="plain"><li>Mayor aceleración en el mapa del sismo</li><li>Cambio en los modos fundamentales de vibrar</li><li>Deficiencias conocidas: columnas cortas, irregularidad, falta de confinamiento</li></ul></div>' +
    '<div class="card"><h3>Metas</h3><ul class="plain"><li>20 estructuras instrumentadas (SECIHTI 2026)</li><li>Piloto: 2 edificios y 1 sitio de suelo, 6 meses de registro continuo (UABC 351/4390)</li></ul><p class="src">La PGA «estimada» se interpola de estaciones a menos de 6 km.</p></div></div>';
  return h;
};

function semOf(d){ var t = String(d || ''); return t.slice(0, 4) + '-' + (+t.slice(5, 7) <= 6 ? 1 : 2); }
V.difusion = function(){
  var now = new Date(), cur = now.getFullYear() + '-' + (now.getMonth() < 6 ? 1 : 2);
  var list = S.talleres.slice().sort(function(a, b){ return String(b.fecha || '').localeCompare(String(a.fecha || '')); });
  var inSem = list.filter(function(t){ return semOf(t.fecha) === cur; });
  var asist = list.reduce(function(a, t){ return a + (num(t.asistentes) || 0); }, 0);
  var byPub = {}; list.forEach(function(t){ byPub[t.publico] = (byPub[t.publico] || 0) + (num(t.asistentes) || 0); });
  var core = ['ninos','jovenes','lideres','proteccion_civil'].filter(function(k){ return byPub[k] != null; }).length;
  var mx = Object.keys(byPub).reduce(function(m, k){ return Math.max(m, byPub[k]); }, 0);
  var h = head('6 · La comunidad', 'Difusión y divulgación del riesgo sísmico', 'Los resultados de la red regresan a la comunidad: talleres de concientización, portal abierto y capacitación a Protección Civil. La campaña de sensibilización del Cuerpo Académico viene desde 2016.');
  h += '<div class="grid g4">' + kpi('Talleres en el semestre ' + cur, inSem.length, 5, 'Meta: al menos 5 por semestre') +
    '<div class="kpi"><span class="lab">Asistentes registrados</span><span class="val">' + (S.mode === 'loading' ? '…' : nf(asist)) + '</span><span class="foot">En ' + list.length + (list.length === 1 ? ' taller' : ' talleres') + '</span></div>' +
    kpi('Públicos atendidos', core, 4, 'Niños, jóvenes, líderes y Protección Civil') +
    '<div class="kpi"><span class="lab">Costo aproximado por taller</span><span class="val">$2,500</span><span class="foot">Divulgación: $24,000 en dos años</span></div></div>';
  h += '<div class="grid g2"><div class="card"><header><h2>Talleres «Concientización del Riesgo Sísmico»</h2><span class="hint">' + list.length + ' registrados</span></header>' + loadingOr(!list.length ? '<p class="hint">Aún no hay talleres registrados. Aquí aparecerán con fecha, sede, público y asistentes.</p>' :
    '<div class="scroll"><table><thead><tr><th>Fecha</th><th>Sede</th><th>Público</th><th class="num">Asistentes</th><th>Tema</th></tr></thead><tbody>' + list.map(function(t){ return '<tr><td style="white-space:nowrap">' + esc(t.fecha || '—') + '</td><td>' + esc(t.sede) + ej(t) + '</td><td>' + esc(PUBLICO[t.publico] || '—') + '</td><td class="num">' + fx(t.asistentes, 0) + '</td><td>' + esc(t.tema || '—') + '</td></tr>'; }).join('') + '</tbody></table></div>') + '</div>';
  h += '<div class="card"><h2>Asistentes por público</h2>' + (mx ? '<div class="bars">' + Object.keys(PUBLICO).filter(function(k){ return byPub[k] != null; }).map(function(k){ return '<div><div class="row"><span>' + PUBLICO[k] + '</span><span>' + nf(byPub[k]) + '</span></div><div class="bar hi" style="width:' + Math.max(2, byPub[k] / mx * 100) + '%"></div></div>'; }).join('') + '</div>' : '<p class="hint">Sin asistentes registrados.</p>') +
    '<h3>Qué incluye cada taller</h3><ul class="plain"><li>Mitos y realidades de los sismos, con videos y dinámicas</li><li>Cómo funciona la red y para qué sirven sus mapas</li><li>Práctica de protocolos de evacuación</li><li>Mesa vibradora con maquetas de edificios</li></ul></div></div>';
  h += '<div class="grid g3"><div class="card"><h3>Canales de difusión</h3><ul class="plain"><li>Portal abierto con mapas de intensidad y acelerogramas</li><li>Portales del SSN y del II-UNAM</li><li>Redes sociales, con envío automático de los mapas</li></ul></div>' +
    '<div class="card"><h3>Capacitación institucional</h3><ul class="plain"><li>Capacitación permanente a Protección Civil municipal</li><li>Comité UABC–Protección Civil–escuelas para acordar planes de mejora</li><li>Manuales y protocolos de transferencia</li></ul></div>' +
    '<div class="card"><h3>Productos de divulgación</h3><ul class="plain"><li>Al menos 2 artículos en revistas JCR o Scopus</li><li>Materiales de capacitación para usuarios institucionales y comunitarios</li><li>Reportes técnicos por sitio</li></ul><p class="src">Fuentes: propuesta UABC 351/6/C/49/26, fase IV, y protocolo SECIHTI 2026.</p></div></div>';
  return h;
};

/* ---------- vibración ambiental (datos del visor RMS-ZC-BC) ---------- */
var VIB = {base:'vibracion/', feats:null, err:null, map:null, layer:null, v:null, started:false};
var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function vibAvailable(){ return !!(window.L && window.RMS_CONFIG); }
function fechaLarga(f){ var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f || '')); return m ? (+m[3]) + ' de ' + MESES[+m[2] - 1] + ' de ' + m[1] : String(f || 'Sin dato'); }
function vibVal(ft, v){ var C = window.RMS_CONFIG, k = C.campos[v === 'periodo' ? 'periodo' : 'frecuencia'], x = ft.properties ? ft.properties[k] : null; return (x === null || x === undefined || x === '' || !isFinite(+x)) ? null : +x; }
function vibClase(val, v){ if (val == null) return -1; var c = window.RMS_CONFIG.variables[v].cortes, i = 0; while (i < c.length && val >= c[i]) i++; return i; }
function vibColor(val, v){ var i = vibClase(val, v), C = window.RMS_CONFIG; return i < 0 ? C.colorSinDato : C.rampa[i]; }
function vibFmt(x, d){ if (x == null) return 'Sin dato'; var t = (+x).toFixed(d); return String(+t); }
function vibInit(){
  if (VIB.started || !vibAvailable()) return; VIB.started = true;
  var C = window.RMS_CONFIG; VIB.v = C.variableInicial === 'periodo' ? 'periodo' : 'frecuencia';
  VIB.map = L.map('vibMap', {scrollWheelZoom:false}).setView(C.vistaInicial.centro, C.vistaInicial.zoom);
  L.tileLayer(C.teselas.url, {attribution:C.teselas.atribucion, maxZoom:C.teselas.zoomMaximo}).addTo(VIB.map);
  L.control.scale({imperial:false}).addTo(VIB.map);
  VIB.map.createPane('zonas').style.zIndex = 350; VIB.map.createPane('puntos').style.zIndex = 420; VIB.map.createPane('lecturas').style.zIndex = 440;
  VIB.layer = L.layerGroup().addTo(VIB.map);
  vibCapas();
  $('#vibCtl').addEventListener('click', function(e){ var b = e.target.closest('[data-vv]'); if (!b) return; VIB.v = b.getAttribute('data-vv'); vibDraw(false); });
  vibDraw(false);
  fetch(VIB.base + C.rutaDatos).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(g){ VIB.feats = (g && g.features || []).filter(function(f){ return f && f.geometry && f.geometry.type === 'Point'; }); vibDraw(true); })
    .catch(function(e){ VIB.err = e && e.message || 'error'; vibDraw(false); });
}

function vibCapas(){
  var m = VIB.map, B = 'datos/mapas/';
  function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  var zc = {'I':cssVar('--zI'), 'II':cssVar('--zII'), 'IIIa':cssVar('--zIIIa'), 'IIIb':cssVar('--zIIIb'), 'Sin datos':cssVar('--zSD')};
  function get(f){ return fetch(B + f).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).catch(function(){ return null; }); }
  Promise.all([get('zonificacion.geojson'), get('periodos_dominantes.geojson'), get('puntos_sondeo.geojson'), get('escuelas.geojson')]).then(function(d){
    var ctl = L.control.layers(null, null, {collapsed: window.innerWidth < 760, position:'topright'}).addTo(m);
    if (d[0]){ var z = L.geoJSON(d[0], {pane:'zonas', style:function(f){ var c = zc[f.properties.zona] || '#999999'; return {color:c, weight:1, fillColor:c, fillOpacity:.45}; },
        onEachFeature:function(f, l){ l.bindTooltip(el('span', f.properties.zona === 'Sin datos' ? 'Sin datos de zonificación' : 'Suelo tipo ' + f.properties.zona + ' · NTC 2015'), {sticky:true}); }}).addTo(m);
      ctl.addOverlay(z, 'Zonificación por tipo de suelo (NTC 2015)'); VIB.zonas = true; }
    ctl.addOverlay(VIB.layer, 'Lecturas de vibración ambiental (proyecto)');
    function puntos(g, op, tip){ return L.geoJSON(g, {pointToLayer:function(f, ll){ return L.circleMarker(ll, Object.assign({pane:'puntos', weight:1, fillOpacity:1}, op)); }, onEachFeature:function(f, l){ l.bindTooltip(el('span', tip(f.properties))); }}); }
    if (d[1]) ctl.addOverlay(puntos(d[1], {radius:4, color:'#232323', fillColor:'#e77148'}, function(p){ return 'Estudio de periodos dominantes · ' + (p.ident || 's/i') + ' · periodo ' + (p.periodo_s == null ? 'sin dato' : p.periodo_s + ' s'); }), 'Estudio de periodos dominantes del suelo (' + d[1].features.length + ' puntos)');
    if (d[2]) ctl.addOverlay(puntos(d[2], {radius:4, color:'#232323', fillColor:'#7d8b8f'}, function(p){ return 'Punto de sondeo ' + (p.id == null ? '' : p.id); }), 'Puntos de sondeo (' + d[2].features.length + ')');
    if (d[3]) ctl.addOverlay(puntos(d[3], {radius:6, color:'#801119', weight:1.5, fillColor:'#db1e2a'}, function(p){ return p.escuela || 'Escuela'; }), 'Escuelas (' + d[3].features.length + ')');
    vibDraw(false);
  });
}
function el(tag, txt, cls){ var n = document.createElement(tag); if (txt != null) n.textContent = txt; if (cls) n.className = cls; return n; }
function vibDraw(fit){
  var C = window.RMS_CONFIG, v = VIB.v, cfgV = C.variables[v], F = VIB.feats;
  var ctl = $('#vibCtl'); ctl.textContent = '';
  var lab = el('span', 'Colorear por', 'hint'); ctl.appendChild(lab);
  var seg = el('div', null, 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Colorear por');
  ['frecuencia', 'periodo'].forEach(function(k){ var b = el('button', C.variables[k].titulo + ' (' + C.variables[k].unidad + ')'); b.type = 'button'; b.setAttribute('data-vv', k); b.setAttribute('aria-pressed', String(k === v)); seg.appendChild(b); });
  ctl.appendChild(seg);
  var kp = $('#vibKpis'), src = $('#vibSrc'), leg = $('#vibLeg'), tb = $('#vibTabBody'); kp.textContent = ''; leg.textContent = ''; tb.textContent = '';
  if (VIB.err){ src.textContent = 'No se pudo leer ' + VIB.base + C.rutaDatos + ' (' + VIB.err + '). Revisa que la carpeta «vibracion» esté junto a index.html.'; return; }
  if (!F){ src.textContent = 'Cargando lecturas…'; return; }
  var ids = {}, fechas = [], fr = [], pe = [];
  F.forEach(function(f){ var c = f.geometry.coordinates; ids[c[0] + ',' + c[1]] = 1; var p = f.properties || {}; if (p[C.campos.fecha]) fechas.push(String(p[C.campos.fecha])); var a = vibVal(f, 'frecuencia'), b = vibVal(f, 'periodo'); if (a != null) fr.push(a); if (b != null) pe.push(b); });
  fechas.sort();
  var tiles = [['Lecturas', String(F.length)], ['Sitios distintos', String(Object.keys(ids).length)], ['Medición más reciente', fechas.length ? fechaLarga(fechas[fechas.length - 1]) : 'Sin dato'],
    [cfgV.titulo, (v === 'periodo' ? pe : fr).length ? vibFmt(Math.min.apply(null, v === 'periodo' ? pe : fr), cfgV.decimales) + ' – ' + vibFmt(Math.max.apply(null, v === 'periodo' ? pe : fr), cfgV.decimales) + ' ' + cfgV.unidad : 'Sin dato']];
  tiles.forEach(function(t, i){ var d = el('div', null, 'kpi'); d.appendChild(el('span', i === 3 ? 'Intervalo medido de ' + t[0].toLowerCase() : t[0], 'lab')); var val = el('span', t[1], 'val'); if (t[1].length > 12) val.style.fontSize = '20px'; d.appendChild(val); kp.appendChild(d); });
  // marcadores: uno por sitio; las lecturas que comparten coordenadas van juntas en la ventana
  VIB.layer.clearLayers();
  var grupos = {}, orden = [];
  F.forEach(function(f){ var c = f.geometry.coordinates, k = c[0] + ',' + c[1]; if (!grupos[k]){ grupos[k] = []; orden.push(k); } grupos[k].push(f); });
  var bounds = [];
  orden.forEach(function(k){
    var g = grupos[k], c = g[0].geometry.coordinates, val = vibVal(g[0], v), nd = val == null;
    var m = L.circleMarker([c[1], c[0]], {pane:'lecturas', radius:7, color:'#0F2A4A', weight:1.5, dashArray:nd ? '2 3' : null, fillColor:vibColor(val, v), fillOpacity:1});
    var box = el('div');
    g.forEach(function(f, i){ var p = f.properties || {}; if (i) box.appendChild(el('hr'));
      box.appendChild(el('b', 'Punto ' + (p[C.campos.id] || '—')));
      [['Fecha', fechaLarga(p[C.campos.fecha])], ['Archivo', p[C.campos.archivo] || 'Sin dato'], ['Frecuencia', vibFmt(vibVal(f, 'frecuencia'), C.variables.frecuencia.decimales) + (vibVal(f, 'frecuencia') == null ? '' : ' Hz')], ['Periodo', vibFmt(vibVal(f, 'periodo'), C.variables.periodo.decimales) + (vibVal(f, 'periodo') == null ? '' : ' s')],
       ['Latitud, longitud', (+c[1]).toFixed(C.decimalesCoordenadas) + ', ' + (+c[0]).toFixed(C.decimalesCoordenadas)]].forEach(function(r){ box.appendChild(el('div', r[0] + ': ' + r[1])); }); });
    m.bindPopup(box);
    var tt = g.map(function(f){ return (f.properties || {})[C.campos.id]; }).join(', ');
    m.bindTooltip(el('span', 'Punto ' + tt + (g.length > 1 ? ' (mismo sitio)' : '')));
    VIB.layer.addLayer(m); bounds.push([c[1], c[0]]);
  });
  if (fit && bounds.length) VIB.map.fitBounds(bounds, {padding:[24, 24]});
  // leyenda con conteo por clase
  var cuts = cfgV.cortes, dl = cfgV.decimalesLeyenda, cnt = []; for (var i = 0; i <= cuts.length; i++) cnt.push(0); var nnd = 0;
  F.forEach(function(f){ var c = vibClase(vibVal(f, v), v); if (c < 0) nnd++; else cnt[c]++; });
  var lg = el('div', null, 'vleg'); lg.appendChild(el('b', cfgV.titulo + ' (' + cfgV.unidad + ')'));
  cnt.forEach(function(n, i){ var s = el('span'); var sw = el('i', null, 'vsw'); sw.style.background = C.rampa[i]; s.appendChild(sw);
    var r = i === 0 ? '< ' + (+cuts[0]).toFixed(dl) : (i === cuts.length ? '≥ ' + (+cuts[i - 1]).toFixed(dl) : (+cuts[i - 1]).toFixed(dl) + ' – ' + (+cuts[i]).toFixed(dl));
    s.appendChild(document.createTextNode(r + ' · ' + n)); lg.appendChild(s); });
  if (nnd){ var s2 = el('span'); var sw2 = el('i', null, 'vsw nd'); sw2.style.background = C.colorSinDato; s2.appendChild(sw2); s2.appendChild(document.createTextNode('Sin dato · ' + nnd)); lg.appendChild(s2); }
  leg.appendChild(lg);
  if (VIB.zonas){ var lz = el('div', null, 'vleg'); lz.appendChild(el('b', 'Zonificación NTC 2015')); [['I', '--zI', 'Tipo I'], ['II', '--zII', 'Tipo II'], ['IIIa', '--zIIIa', 'Tipo IIIa'], ['IIIb', '--zIIIb', 'Tipo IIIb'], ['SD', '--zSD', 'Sin datos']].forEach(function(z){ var s3 = el('span'), q = el('i', null, 'sw sq'); q.style.background = 'var(' + z[1] + ')'; q.style.opacity = '.75'; s3.appendChild(q); s3.appendChild(document.createTextNode(z[2])); lz.appendChild(s3); }); leg.appendChild(lz); }
  leg.appendChild(el('p', 'Intervalos provisionales del visor; el color no indica riesgo sísmico. Las lecturas que comparten coordenadas se muestran juntas al seleccionar el punto.', 'src'));
  // tabla
  var t = el('table'), th = el('thead'), tr = el('tr');
  ['Punto', 'Fecha', 'Archivo', 'Frecuencia (Hz)', 'Periodo (s)'].forEach(function(x, i){ var c = el('th', x); if (i > 2) c.className = 'num'; tr.appendChild(c); }); th.appendChild(tr); t.appendChild(th);
  var tbd = el('tbody'); F.slice().sort(function(a, b){ return String((a.properties || {})[C.campos.id]).localeCompare(String((b.properties || {})[C.campos.id])); }).forEach(function(f){ var p = f.properties || {}, r = el('tr');
    [p[C.campos.id], p[C.campos.fecha], p[C.campos.archivo], vibFmt(vibVal(f, 'frecuencia'), C.variables.frecuencia.decimales), vibFmt(vibVal(f, 'periodo'), C.variables.periodo.decimales)].forEach(function(x, i){ var c = el('td', x == null || x === '' ? 'Sin dato' : x); if (i > 2) c.className = 'num'; r.appendChild(c); }); tbd.appendChild(r); });
  t.appendChild(tbd); tb.appendChild(t);
  src.textContent = 'Fuentes: lecturas del visor de vibración ambiental RMS-ZC-BC (FCITEC-UABC), medidas del ' + fechaLarga(fechas[0]) + ' al ' + fechaLarga(fechas[fechas.length - 1]) + '. Zonificación, periodos dominantes, sondeos y escuelas: capas del proyecto QGIS «Proyecto Tijuana», sin cambios.';
}

/* ---------- mapas con mapa base de OpenStreetMap (mismo que el visor) ---------- */
var LM = {seq:0, cfg:{}, maps:[]};
function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function tilesCfg(){ var T = window.RMS_CONFIG && window.RMS_CONFIG.teselas; return T || {url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png', atribucion:'&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>', zoomMaximo:19}; }
function fieldOverlay(m, ev){
  var pts = points(ev); if (!pts.length) return;
  var la0 = 1e9, la1 = -1e9, lo0 = 1e9, lo1 = -1e9;
  pts.forEach(function(p){ la0 = Math.min(la0, p.lat); la1 = Math.max(la1, p.lat); lo0 = Math.min(lo0, p.lon); lo1 = Math.max(lo1, p.lon); });
  la0 -= .06; la1 += .06; lo0 -= .07; lo1 += .07;
  var w = 240, h = Math.max(60, Math.round(w * (la1 - la0) / ((lo1 - lo0) * Math.cos((la0 + la1) / 2 * Math.PI / 180))));
  var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  var ctx = cv.getContext('2d'), img = ctx.createImageData(w, h);
  var col = {baja:hexRgb(cssVar('--good')), media:hexRgb(cssVar('--warn')), alta:hexRgb(cssVar('--crit'))};
  for (var j = 0; j < h; j++) for (var i = 0; i < w; i++){
    var lon = lo0 + (i + .5) / w * (lo1 - lo0), lat = la1 - (j + .5) / h * (la1 - la0), v = idw(lat, lon, pts);
    if (v == null) continue; var c = col[level(v)], k = (j * w + i) * 4; img.data[k] = c[0]; img.data[k+1] = c[1]; img.data[k+2] = c[2]; img.data[k+3] = 92;
  }
  ctx.putImageData(img, 0, 0);
  L.imageOverlay(cv.toDataURL(), [[la0, lo0], [la1, lo1]], {interactive:false}).addTo(m);
}
function initMaps(){
  LM.maps.forEach(function(m){ m.remove(); }); LM.maps = [];
  document.querySelectorAll('.lmap').forEach(function(div){
    var o = LM.cfg[div.id]; if (!o) return; delete LM.cfg[div.id];
    var T = tilesCfg(), m = L.map(div, {scrollWheelZoom:false}); LM.maps.push(m);
    L.tileLayer(T.url, {attribution:T.atribucion, maxZoom:T.zoomMaximo}).addTo(m);
    L.control.scale({imperial:false}).addTo(m);
    if (o.field) fieldOverlay(m, o.ev);
    var order = {planeada:0, instalacion:1, operando:2}, b = [];
    o.stations.filter(hasCoord).sort(function(a, c){ return (order[a.status] || 0) - (order[c.status] || 0); }).forEach(function(s){
      var c = cssVar(o.color(s)) || '#888888', solid = s.status === 'operando', mid = s.status === 'instalacion', ll = [+s.lat, +s.lon], mk;
      if (s.kind === 'estructura'){
        var sq = document.createElement('div'); sq.className = 'sq-mk';
        sq.style.background = solid ? c : (mid ? c : 'transparent'); if (mid) sq.style.opacity = '.55'; if (!solid) sq.style.borderColor = c;
        mk = L.marker(ll, {icon:L.divIcon({className:'', html:sq.outerHTML, iconSize:[14, 14]}), title:String(s.name || '')});
      } else mk = L.circleMarker(ll, {radius:7, color:solid ? '#FFFFFF' : c, weight:2, fillColor:c, fillOpacity:solid ? 1 : (mid ? .4 : 0)});
      var lab = o.label(s); if (lab) mk.bindTooltip(el('span', lab), {permanent:true, direction:'right', className:'mk-lab', offset:[8, 0]});
      var box = el('div'); String(o.tip(s)).split('|').forEach(function(t, i){ if (t) box.appendChild(el(i ? 'div' : 'b', t)); });
      mk.bindPopup(box); mk.addTo(m); b.push(ll);
    });
    if (b.length) m.fitBounds(b, {padding:[36, 36], maxZoom:13}); else m.setView([32.49, -116.98], 11);
  });
}

/* ---------- red SHM + P-Alert (panel de monitoreo, simulado) ---------- */
var SHM = {map:null, started:false};
function shmInit(){
  if (SHM.started || !window.L) return; SHM.started = true;
  SHM.map = L.map('shmMap', {scrollWheelZoom:false}).setView([32.47, -116.95], 11);
  var T = window.RMS_CONFIG && window.RMS_CONFIG.teselas;
  L.tileLayer(T ? T.url : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution:T ? T.atribucion : '&copy; colaboradores de OpenStreetMap', maxZoom:19}).addTo(SHM.map);
  L.control.scale({imperial:false}).addTo(SHM.map);
  var kp = $('#shmKpis');
  function tile(lab, val){ var d = el('div', null, 'kpi'); d.appendChild(el('span', lab, 'lab')); var v = el('span', val, 'val'); if (val.length > 12) v.style.fontSize = '20px'; d.appendChild(v); kp.appendChild(d); }
  fetch('shm/planteles_tijuana.json').then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function(d){
    var P = d.planteles || [];
    tile('Planteles COBACH previstos', String(P.length)); tile('Instrumentos previstos', String(P.length * 2)); tile('Unidad SHM', '3 sensores · 150 Hz'); tile('P-Alert', '1 sensor · 100 Hz');
    var b = [], t = el('table'), tb = el('tbody'); var hd = el('thead'), hr = el('tr'); hr.appendChild(el('th', 'Plantel')); hr.appendChild(el('th', 'Instrumentos')); hd.appendChild(hr); t.appendChild(hd);
    P.forEach(function(p){ var m = L.circleMarker([p.lat, p.lon], {radius:7, color:'#0F2A4A', weight:1.5, fillColor:'#0E6B7A', fillOpacity:1});
      m.bindTooltip(el('span', p.nombre)); var box = el('div'); box.appendChild(el('b', p.nombre)); box.appendChild(el('div', 'SHM + P-Alert')); box.appendChild(el('div', (+p.lat).toFixed(5) + ', ' + (+p.lon).toFixed(5))); m.bindPopup(box); m.addTo(SHM.map); b.push([p.lat, p.lon]);
      var r = el('tr'); r.appendChild(el('td', p.nombre)); var c2 = el('td', 'SHM + P-Alert'); c2.style.whiteSpace = 'nowrap'; r.appendChild(c2); tb.appendChild(r); });
    t.appendChild(tb); $('#shmList').appendChild(t);
    if (b.length) SHM.map.fitBounds(b, {padding:[24, 24]});
    $('#shmSrc').textContent = 'Ubicaciones de Google Maps según el repositorio del panel; conviene verificarlas en sitio. El panel también simula 32 edificios en Guerrero (UAGro).';
  }).catch(function(e){ $('#shmSrc').textContent = 'No se pudo leer shm/planteles_tijuana.json (' + (e && e.message) + ').'; });
}
var PANELS = [
  {id:'visor', slot:'vibSlot', ok:function(){ return vibAvailable(); }, init:function(){ vibInit(); }, map:function(){ return VIB.map; }},
  {id:'shmPanel', slot:'shmSlot', ok:function(){ return !!window.L; }, init:function(){ shmInit(); }, map:function(){ return SHM.map; }}
];

/* ---------- render ---------- */
function renderNav(){
  $('#nav').innerHTML = VIEWS.map(function(v, i){ return (i === 1 ? '<span class="sep"></span>' : (i > 1 ? '<span class="arrow" aria-hidden="true">→</span>' : '')) + '<button class="tab" data-act="go" data-id="' + v.id + '"' + (S.view === v.id ? ' aria-current="page"' : '') + '>' + (v.n ? '<span class="n">' + v.n + '</span>' : '') + v.label + '</button>'; }).join('');
  var tot = Object.keys(S.visits).reduce(function(a, k){ return a + (+S.visits[k] || 0); }, 0);
  $('#dstate').textContent = S.mode === 'loading' ? 'Cargando datos…' : S.mode === 'web' ? 'Datos públicos · solo lectura' + (tot ? ' · ' + nf(tot) + (tot === 1 ? ' visita' : ' visitas') + ' en total' : '') : (S.mode === 'db' ? (S.canWrite ? 'Datos compartidos · puedes editar' : 'Datos compartidos · solo lectura') : 'Sin almacén · los cambios no se guardan');
}
function renderBanner(){
  var b = $('#banner'), has = S.stations.some(function(s){ return s.ejemplo; }) || S.events.some(function(e){ return e.ejemplo; }) || S.talleres.some(function(t){ return t.ejemplo; });
  b.hidden = !(has || S.loadErr); if (b.hidden) { b.innerHTML = ''; return; }
  b.className = 'banner';
  if (S.loadErr){ b.innerHTML = '<p><b>No se pudieron cargar los datos.</b> Revisa tu conexión y vuelve a intentar.</p><button class="btn ghost sm" data-act="reload">Reintentar</button>'; return; }
  b.innerHTML = '<p><b>Datos de ejemplo.</b> Las estaciones, coordenadas, aceleraciones y talleres marcados como EJEMPLO son ficticios y solo muestran cómo funciona el tablero. Se sustituirán por los reales.</p>' +
    (S.canWrite ? (S.confirm === 'ex' ? '<button class="btn sm" data-act="clearExYes">Sí, borrar ejemplos</button><button class="btn ghost sm" data-act="confirmNo">No</button>' : '<button class="btn ghost sm" data-act="clearEx">Borrar ejemplos</button>') : '');
}
function render(){
  var a = document.activeElement, view = $('#view'), fid = a && a.id && view.contains(a) ? a.id : null, fval = fid && a.tagName === 'INPUT' ? a.value : null;
  renderNav(); renderBanner();
  PANELS.forEach(function(pn){ $('#hold').appendChild($('#' + pn.id)); });
  view.innerHTML = V[S.view]();
  drawFields();
  if (window.L) initMaps();
  PANELS.forEach(function(pn){ var sec = $('#' + pn.id), slot = document.getElementById(pn.slot);
    if (slot && pn.ok()){ slot.appendChild(sec); sec.hidden = false; pn.init(); var mp = pn.map(); if (mp) setTimeout(function(){ mp.invalidateSize(); }, 0); } else sec.hidden = true; });
  if (fid){ var el = document.getElementById(fid); if (el){ if (fval != null) el.value = fval; try { el.focus({preventScroll:true}); } catch (e) {} } }
}
function toast(msg){ var t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function(){ t.hidden = true; }, 4200); }
function fail(e){ toast('No se pudo guardar' + (e && e.code === 'invalid_argument' ? ': tu acceso es de solo lectura o el dato no es válido.' : (e && e.code === 'quota_exceeded' ? ': el almacén está lleno.' : '. Intenta de nuevo.'))); }

/* ---------- store ---------- */
var store = {
  setStation: function(id, data){ if (db){ var col = db.collection('stations'); return (id ? col.doc(id) : col.doc()).set(data); } if (id){ S.stations = S.stations.map(function(s){ return s.id === id ? Object.assign({id:id}, data) : s; }); } else S.stations.push(Object.assign({id:'l' + (++lid)}, data)); render(); return Promise.resolve(); },
  delStation: function(id){ if (db) return db.collection('stations').doc(id).delete(); S.stations = S.stations.filter(function(s){ return s.id !== id; }); render(); return Promise.resolve(); },
  addEvent: function(data){ if (db){ var ref = db.collection('events').doc(); return ref.set(data).then(function(){ return ref.id; }); } var id = 'e' + (++lid); S.events.push(Object.assign({id:id}, data)); sortEvents(); return Promise.resolve(id); },
  patchEvent: function(id, patch){ if (db) return db.collection('events').doc(id).update(patch); S.events = S.events.map(function(e){ if (e.id !== id) return e; var n = Object.assign({}, e); Object.keys(patch).forEach(function(k){ n[k] = Object.assign({}, e[k], patch[k]); }); return n; }); render(); return Promise.resolve(); },
  delEvent: function(id){ if (db) return db.collection('events').doc(id).delete(); S.events = S.events.filter(function(e){ return e.id !== id; }); render(); return Promise.resolve(); }
};

/* ---------- actions ---------- */
var A = {
  go: function(id){ S.view = id; S.confirm = null; S.formErr = ''; try { history.replaceState(null, '', '#' + id); } catch (e) {} render(); window.scrollTo(0, 0); countVisit(id); },
  reload: function(){ loadWeb(true); },
  addSt: function(){ S.view = 'estaciones'; S.formErr = ''; S.form = {id:null, d:{name:'', kind:'suelo', uso:'escuela', soil:'I', status:'planeada', lat:'', lon:'', p10:'', f0:'', vs30:'', f0base:'', f0last:''}}; render(); var el = $('#f-name'); if (el) el.focus(); },
  editSt: function(id){ var s = S.stations.filter(function(x){ return x.id === id; })[0]; if (!s) return; S.formErr = ''; S.form = {id:id, ejemplo:!!s.ejemplo, d:Object.assign({uso:'escuela'}, s)}; render(); var el = $('#stForm'); if (el) el.scrollIntoView({block:'center'}); },
  cancelForm: function(){ S.form = null; S.formErr = ''; render(); },
  delSt: function(id){ S.confirm = 'st:' + id; render(); },
  delStYes: function(id){ S.confirm = null; store.delStation(id).catch(fail); render(); },
  confirmNo: function(){ S.confirm = null; render(); },
  newEv: function(){ S.formErr = ''; S.evForm = {name:'', date:new Date().toISOString().slice(0, 10), mag:''}; render(); var el = $('#e-name'); if (el) el.focus(); },
  cancelEv: function(){ S.evForm = null; S.formErr = ''; render(); },
  delEv: function(id){ S.confirm = 'ev:' + id; render(); },
  delEvYes: function(id){ S.confirm = null; S.eventId = null; store.delEvent(id).catch(fail); render(); },
  toggleRev: function(id){ var ev = curEvent(); if (!ev) return; var p = {rev:{}}; p.rev[id] = !(ev.rev && ev.rev[id]); store.patchEvent(ev.id, p).catch(fail); },
  clearEx: function(){ S.confirm = 'ex'; render(); },
  clearExYes: function(){ S.confirm = null; var ps = []; S.stations.filter(function(s){ return s.ejemplo; }).forEach(function(s){ ps.push(store.delStation(s.id)); }); S.events.filter(function(e){ return e.ejemplo; }).forEach(function(e){ ps.push(store.delEvent(e.id)); }); Promise.all(ps).then(function(){ toast('Ejemplos borrados'); }).catch(fail); render(); }
};
function submitStation(){
  var d = S.form.d, name = String(d.name || '').trim(), lat = num(d.lat), lon = num(d.lon);
  if (!name){ S.formErr = 'Escribe el nombre del sitio.'; return render(); }
  if (lat == null || lon == null || lat < -90 || lat > 90 || lon < -180 || lon > 180){ S.formErr = 'Latitud y longitud deben ser números en grados decimales (Tijuana: 32.5, −117.0).'; return render(); }
  var data = {name:name, kind:d.kind, uso:d.uso, soil:d.soil, status:d.status, lat:lat, lon:lon, p10:num(d.p10), f0:num(d.f0), vs30:num(d.vs30), f0base:num(d.f0base), f0last:num(d.f0last)};
  if (S.form.ejemplo) data.ejemplo = true;
  var id = S.form.id; S.form = null; S.formErr = '';
  store.setStation(id, data).then(function(){ toast('Estación guardada'); }).catch(fail); render();
}
function submitEvent(){
  var d = S.evForm, name = String(d.name || '').trim();
  if (!name){ S.formErr = 'Ponle nombre al evento.'; return render(); }
  S.evForm = null; S.formErr = '';
  store.addEvent({name:name, date:d.date || '', mag:num(d.mag), pga:{}, rev:{}}).then(function(id){ S.eventId = id; render(); toast('Evento creado: captura la PGA por estación'); }).catch(fail); render();
}
document.addEventListener('click', function(e){ var b = e.target.closest('[data-act]'); if (!b) return; var fn = A[b.getAttribute('data-act')]; if (fn) fn(b.getAttribute('data-id')); });
document.addEventListener('submit', function(e){ e.preventDefault(); if (e.target.id === 'stForm' && S.form) submitStation(); else if (e.target.id === 'evForm' && S.evForm) submitEvent(); });
document.addEventListener('input', function(e){ var el = e.target; if (el.dataset.f && S.form) S.form.d[el.dataset.f] = el.value; if (el.dataset.ef && S.evForm) S.evForm[el.dataset.ef] = el.value; });
document.addEventListener('change', function(e){
  var el = e.target, ev;
  if (el.dataset.pga){ ev = curEvent(); if (!ev) return; var v = num(el.value); if (v != null && v < 0){ toast('La PGA no puede ser negativa.'); return; } var p = {pga:{}}; p.pga[el.dataset.pga] = v; store.patchEvent(ev.id, p).catch(fail); }
  else if (el.id === 'evSel'){ S.eventId = el.value; S.confirm = null; render(); }
  else if (el.dataset.thr){ var t = num(el.value); if (t != null && t >= 0) S.thr[el.dataset.thr] = t; if (S.thr.high < S.thr.med) S.thr.high = S.thr.med; try { localStorage.setItem('est-thr', JSON.stringify(S.thr)); } catch (x) {} render(); }
  else if (el.dataset.fl){ S.fl[el.dataset.fl] = el.value; render(); }
});

/* ---------- tooltip ---------- */
var tip = $('#tip');
function showTip(el, x, y){ var parts = (el.getAttribute('data-tip') || '').split('|'); tip.textContent = ''; parts.forEach(function(p, i){ if (!p) return; var n = document.createElement(i ? 'div' : 'b'); n.textContent = p; tip.appendChild(n); }); tip.hidden = false; var w = tip.offsetWidth, hh = tip.offsetHeight; tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x + 14)) + 'px'; tip.style.top = Math.max(8, y - hh - 12 < 8 ? y + 18 : y - hh - 12) + 'px'; }
document.addEventListener('pointermove', function(e){ var el = e.target.closest ? e.target.closest('[data-tip]') : null; if (el) showTip(el, e.clientX, e.clientY); else tip.hidden = true; });
document.addEventListener('focusin', function(e){ var el = e.target.closest ? e.target.closest('[data-tip]') : null; if (el){ var r = el.getBoundingClientRect(); showTip(el, r.left + r.width / 2, r.top); } });
document.addEventListener('focusout', function(){ tip.hidden = true; });
try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render); } catch (e) {}
try { new MutationObserver(drawFields).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']}); } catch (e) {}

/* ---------- boot ---------- */
function rows(snap){ return snap.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); }); }
function goLocal(){ S.mode = 'local'; S.canWrite = true; render(); }
function sb(path, opts){ var o = opts || {}; o.headers = {apikey:CFG.key, Authorization:'Bearer ' + CFG.key, 'Content-Type':'application/json'}; return fetch(CFG.url + '/rest/v1/' + path, o).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
function loadWeb(first){
  return Promise.all([sb('stations?select=*&order=id'), sb('events?select=*'), sb('talleres?select=*'), sb('visitas?select=componente,total')]).then(function(r){
    var sig = JSON.stringify([r[0], r[1], r[2]]), same = !first && sig === S.sig && !S.loadErr; S.sig = sig;
    r[3].forEach(function(v){ if (S.visits[v.componente] == null || v.total > S.visits[v.componente]) S.visits[v.componente] = v.total; });
    if (same) return paintVisits();
    S.stations = r[0]; S.events = r[1]; sortEvents(); S.talleres = r[2];
    S.mode = 'web'; S.canWrite = false; S.loadErr = false; render();
  }).catch(function(){ if (first){ S.mode = 'web'; S.canWrite = false; S.loadErr = true; render(); } });
}
function countVisit(view){
  if (!CFG) return; var k = 'vis-' + view, seen = false;
  try { seen = sessionStorage.getItem(k) === '1'; } catch (e) {}
  if (seen) return;
  try { sessionStorage.setItem(k, '1'); } catch (e) {}
  sb('rpc/registrar_visita', {method:'POST', body:JSON.stringify({p_componente:view})}).then(function(n){ if (typeof n === 'number'){ S.visits[view] = n; paintVisits(); } }).catch(function(){});
}
function paintVisits(){ var el = document.querySelector('.visits'); if (el) el.outerHTML = visitsHTML(); renderNav(); }
render();
(function boot(){
  if (CFG){ loadWeb(true).then(function(){ countVisit(S.view); }); setInterval(function(){ loadWeb(false); }, 120000); return; }
  var cl = window.claude;
  if (!cl || typeof cl.use !== 'function') return goLocal();
  Promise.all([cl.use('db').catch(function(){ return null; }), cl.use('user').catch(function(){ return null; })]).then(function(r){
    db = r[0]; var user = r[1];
    if (!db) return goLocal();
    var perm = user ? user.can('data.write').then(function(c){ return c === null ? user.canEdit() : c; }).catch(function(){ return true; }) : Promise.resolve(true);
    perm.then(function(c){
      S.canWrite = !!c; var got = 0, done = function(){ if (++got >= 2) S.mode = 'db'; render(); }, first = {st:true, ev:true};
      db.collection('talleres').onSnapshot(function(s){ S.talleres = rows(s); render(); }, function(){});
      var dead = function(){ if (S.mode === 'loading'){ db = null; goLocal(); } };
      db.collection('stations').onSnapshot(function(s){ S.stations = rows(s); if (first.st){ first.st = false; done(); } else render(); }, dead);
      db.collection('events').onSnapshot(function(s){ S.events = rows(s); sortEvents(); if (first.ev){ first.ev = false; done(); } else render(); }, dead);
    });
  });
})();
})();
