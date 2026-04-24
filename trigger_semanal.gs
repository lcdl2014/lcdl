/**
 * LA CUEVA DEL LOBIZÓN — Trigger semanal automático
 * VERSIÓN 2 — Nunca borra datos históricos
 *
 * REGLA DE ORO: Solo se tocan datos de la TEMPORADA ACTUAL.
 * Los datos históricos (2014-2025) son intocables.
 *
 * INSTRUCCIONES:
 * 1. Pegá este código en Apps Script (reemplazando el anterior)
 * 2. Ejecutá "configurarTrigger" UNA VEZ para activar el trigger semanal
 * 3. Para actualizar manualmente: ejecutá "actualizarTodo"
 * 4. Para restaurar stats perdidas: ejecutá "restaurarStatsDesdePartidos" (solo stats de 2014-2025 que estén en PARTIDOS)
 */

var TEMPORADA_ACTUAL = 2026; // Actualizar cada año

// ─── CONFIGURAR TRIGGER ────────────────────────────
function configurarTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'actualizarTodo') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('actualizarTodo')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
  Logger.log('Trigger activado: cada lunes 9am.');
  SpreadsheetApp.getActiveSpreadsheet().toast('Trigger semanal activado. Corre cada lunes a las 9am.', '✅', 5);
}

// ─── FUNCIÓN PRINCIPAL ─────────────────────────────
function actualizarTodo() {
  actualizarResumenTemporadas();       // Recalcula resumen desde PARTIDOS (todas las temporadas)
  actualizarStatsTemporadaActual();    // Solo actualiza stats de la temporada actual
  actualizarPJJugadores();             // Actualiza columnas PJ y GOLES en JUGADORES
  Logger.log('Actualización completa: ' + new Date().toLocaleString());
  SpreadsheetApp.getActiveSpreadsheet().toast('Datos actualizados correctamente.', '✅', 5);
}

// ─── ACTUALIZAR RESUMEN_TEMPORADAS (desde PARTIDOS) ──
// Lee todos los partidos y recalcula el resumen por temporada+categoria
// NO toca STATS_INDIVIDUALES
function actualizarResumenTemporadas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wsPartidos = ss.getSheetByName("PARTIDOS");
  var wsResumen = ss.getSheetByName("RESUMEN_TEMPORADAS");
  var partidos = getSheetData(wsPartidos).filter(function(p) { return p.RIVAL; });
  if (!partidos.length) return;

  var resumen = {};
  partidos.forEach(function(p) {
    if (!p.TEMPORADA || !p.CATEGORIA) return;
    var key = p.TEMPORADA + '|' + p.CATEGORIA;
    if (!resumen[key]) {
      resumen[key] = { temporada: p.TEMPORADA, categoria: p.CATEGORIA,
        divisional: p.DIVISIONAL || '', dt: p.DT || '',
        pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 };
    }
    var r = resumen[key];
    r.pj++;
    r.gf += Number(p.GOLES_LCdL) || 0;
    r.gc += Number(p.GOLES_RIVAL) || 0;
    if (p.RESULTADO === 'G') r.pg++;
    else if (p.RESULTADO === 'E') r.pe++;
    else if (p.RESULTADO === 'P') r.pp++;
    if (p.DT) r.dt = p.DT;
    if (p.DIVISIONAL) r.divisional = p.DIVISIONAL;
  });

  var headers = ["TEMPORADA","CATEGORIA","DIVISIONAL","DT","PJ","PG","PE","PP","PTS","GF","GC","RENDIMIENTO_PCT"];
  var rows = Object.values(resumen).sort(function(a, b) {
    if (Number(a.temporada) !== Number(b.temporada)) return Number(a.temporada) - Number(b.temporada);
    return a.categoria === 'MAYORES' ? -1 : 1;
  }).map(function(r) {
    var pts = r.pg * 3 + r.pe;
    var rend = r.pj > 0 ? Math.round(pts / (r.pj * 3) * 1000) / 10 : 0;
    return [r.temporada, r.categoria, r.divisional, r.dt, r.pj, r.pg, r.pe, r.pp, pts, r.gf, r.gc, rend];
  });

  wsResumen.clearContents();
  wsResumen.getRange(1, 1, 1, headers.length).setValues([headers]);
  wsResumen.getRange(1, 1, 1, headers.length).setBackground("#8B1C1C").setFontColor("#FFFFFF").setFontWeight("bold");
  if (rows.length) wsResumen.getRange(2, 1, rows.length, headers.length).setValues(rows);
  wsResumen.setFrozenRows(1);
  wsResumen.autoResizeColumns(1, headers.length);
  Logger.log('RESUMEN_TEMPORADAS: ' + rows.length + ' temporadas.');
}

// ─── ACTUALIZAR STATS DE LA TEMPORADA ACTUAL ────────
// NUNCA toca datos anteriores a TEMPORADA_ACTUAL
// Lee PARTIDOS del año actual y recalcula estadísticas
function actualizarStatsTemporadaActual() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wsPartidos = ss.getSheetByName("PARTIDOS");
  var wsStats = ss.getSheetByName("STATS_INDIVIDUALES");

  // Leer solo partidos de la temporada actual
  var partidos = getSheetData(wsPartidos).filter(function(p) {
    return Number(p.TEMPORADA) === TEMPORADA_ACTUAL && p.RIVAL;
  });

  if (!partidos.length) {
    Logger.log('No hay partidos de ' + TEMPORADA_ACTUAL + ' en PARTIDOS.');
    return;
  }

  // Calcular stats del año actual
  var stats = {};
  partidos.forEach(function(p) {
    var cat = p.CATEGORIA;
    var res = p.RESULTADO;

    // Titulares
    parseNombres(p.TITULARES).forEach(function(n) {
      acumularStat(n, TEMPORADA_ACTUAL, cat, 'TITULAR', res, stats);
    });
    // Ingresos (de CAMBIOS: "Sale→Entra (min)")
    extraerEntrantes(p.CAMBIOS).forEach(function(n) {
      acumularStat(n, TEMPORADA_ACTUAL, cat, 'INGRESO', res, stats);
    });
    // Suplentes sin ingreso
    parseNombres(p.SUPLENTES_SIN_INGRESO).forEach(function(n) {
      acumularStat(n, TEMPORADA_ACTUAL, cat, 'SUPLENTE', res, stats);
    });
    // Tarjetas rojas
    parseNombres(p.TARJETAS_ROJAS).forEach(function(n) {
      var k = n + '|' + TEMPORADA_ACTUAL + '|' + cat;
      if (stats[k]) stats[k].tr++;
    });
    // MVP
    if (p.MVP && p.MVP.trim()) {
      var mk = p.MVP.trim() + '|' + TEMPORADA_ACTUAL + '|' + cat;
      if (stats[mk]) stats[mk].mvp++;
    }
    // Goles
    parseGoleadores(p.GOLEADORES).forEach(function(g) {
      var k = g.nombre + '|' + TEMPORADA_ACTUAL + '|' + cat;
      if (stats[k]) stats[k].goles += g.cant;
    });
  });

  // Borrar SOLO las filas de la temporada actual en STATS_INDIVIDUALES
  var allStats = getSheetData(wsStats);
  var historicos = allStats.filter(function(r) { return Number(r.TEMPORADA) !== TEMPORADA_ACTUAL; });
  var headers = ["CARNET","NOMBRE","TEMPORADA","CATEGORIA","PJ","PJ_TITULAR","PJ_INGRESO","PJ_SUPLENTE_SIN_INGRESO","GOLES","TARJETAS_ROJAS","MVP_COUNT","PG","PE","PP"];

  var nuevasFilas = Object.values(stats).map(function(s) {
    return ['', s.nombre, s.temporada, s.categoria,
      s.titular + s.ingreso, s.titular, s.ingreso, s.suplente,
      s.goles, s.tr, s.mvp, s.pg, s.pe, s.pp];
  });

  var todasLasFilas = historicos.map(function(r) {
    return [r.CARNET||'', r.NOMBRE, r.TEMPORADA, r.CATEGORIA,
      r.PJ||0, r.PJ_TITULAR||0, r.PJ_INGRESO||0, r.PJ_SUPLENTE_SIN_INGRESO||0,
      r.GOLES||0, r.TARJETAS_ROJAS||0, r.MVP_COUNT||0, r.PG||0, r.PE||0, r.PP||0];
  }).concat(nuevasFilas);

  wsStats.clearContents();
  wsStats.getRange(1, 1, 1, headers.length).setValues([headers]);
  wsStats.getRange(1, 1, 1, headers.length).setBackground("#8B1C1C").setFontColor("#FFFFFF").setFontWeight("bold");
  if (todasLasFilas.length) wsStats.getRange(2, 1, todasLasFilas.length, headers.length).setValues(todasLasFilas);
  wsStats.setFrozenRows(1);
  Logger.log('STATS_INDIVIDUALES: ' + historicos.length + ' históricas + ' + nuevasFilas.length + ' de ' + TEMPORADA_ACTUAL);
}

// ─── ACTUALIZAR PJ Y GOLES EN JUGADORES ─────────────
function actualizarPJJugadores() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wsStats = ss.getSheetByName("STATS_INDIVIDUALES");
  var wsJug = ss.getSheetByName("JUGADORES");
  var statsData = getSheetData(wsStats);
  if (!statsData.length) return;

  // Acumular por NOMBRE_COMPLETO y APODO (para matching flexible)
  var totales = {};
  statsData.forEach(function(s) {
    var nombre = String(s.NOMBRE).trim();
    if (!nombre) return;
    if (!totales[nombre]) totales[nombre] = { pj: 0, pjMay: 0, pjPre: 0, goles: 0 };
    var pj = Number(s.PJ) || 0;
    totales[nombre].pj += pj;
    totales[nombre].goles += Number(s.GOLES) || 0;
    if (s.CATEGORIA === 'MAYORES') totales[nombre].pjMay += pj;
    if (s.CATEGORIA === 'PRESENIOR') totales[nombre].pjPre += pj;
  });

  var headers = wsJug.getRange(1, 1, 1, wsJug.getLastColumn()).getValues()[0];
  var colPJT = headers.indexOf('PJ_TOTAL') + 1;
  var colPJM = headers.indexOf('PJ_MAYORES') + 1;
  var colPJP = headers.indexOf('PJ_PRESENIOR') + 1;
  var colGOL = headers.indexOf('GOLES_TOTAL') + 1;
  var colNOM = headers.indexOf('NOMBRE_COMPLETO') + 1;
  var colAPO = headers.indexOf('APODO') + 1;
  if (!colPJT || !colNOM) return;

  var lastRow = wsJug.getLastRow();
  var updates = [];
  for (var i = 2; i <= lastRow; i++) {
    var nombre = String(wsJug.getRange(i, colNOM).getValue()).trim();
    var apodo = colAPO ? String(wsJug.getRange(i, colAPO).getValue()).trim() : '';
    // Buscar por nombre completo primero, luego por apodo
    var t = totales[nombre] || (apodo ? totales[apodo] : null) || { pj: 0, pjMay: 0, pjPre: 0, goles: 0 };
    if (colPJT) wsJug.getRange(i, colPJT).setValue(t.pj);
    if (colPJM) wsJug.getRange(i, colPJM).setValue(t.pjMay);
    if (colPJP) wsJug.getRange(i, colPJP).setValue(t.pjPre);
    if (colGOL) wsJug.getRange(i, colGOL).setValue(t.goles);
  }
  Logger.log('JUGADORES: columnas PJ y GOLES actualizadas.');
}

// ─── AGREGAR COLUMNAS SI NO EXISTEN ─────────────────
function agregarColumnasJugadores() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName("JUGADORES");
  var headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
  var nuevas = ["PIE_HABIL", "ALTURA_CM", "LUGAR_NACIMIENTO", "NUMERO_CAMISETA"];
  nuevas.forEach(function(col) {
    if (headers.indexOf(col) === -1) {
      var next = ws.getLastColumn() + 1;
      ws.getRange(1, next).setValue(col)
        .setBackground("#8B1C1C").setFontColor("#FFFFFF").setFontWeight("bold");
    }
  });
  SpreadsheetApp.getActiveSpreadsheet().toast('Columnas verificadas en JUGADORES.', '✅', 5);
}

// ─── HELPERS ─────────────────────────────────────────
function getSheetData(ws) {
  var data = ws.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function parseNombres(str) {
  if (!str) return [];
  return String(str).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
}

function parseGoleadores(str) {
  if (!str) return [];
  var result = [];
  String(str).split(',').forEach(function(parte) {
    parte = parte.trim();
    if (!parte) return;
    var match = parte.match(/^(.+?)(?:\s*\((\d+)\))?(?:\s*\(p\))?$/);
    if (!match) return;
    var nombre = match[1].replace(/\s*\(p\)\s*/g, '').trim();
    result.push({ nombre: nombre, cant: parseInt(match[2] || '1') });
  });
  return result;
}

function extraerEntrantes(cambios) {
  if (!cambios) return [];
  var result = [];
  String(cambios).split(',').forEach(function(c) {
    var m = c.match(/[→>]\s*(.+?)\s*(?:\(|$)/);
    if (m) result.push(m[1].trim());
  });
  return result;
}

function acumularStat(nombre, temporada, categoria, tipo, resultado, stats) {
  if (!nombre) return;
  var key = nombre + '|' + temporada + '|' + categoria;
  if (!stats[key]) stats[key] = {
    nombre: nombre, temporada: temporada, categoria: categoria,
    titular: 0, ingreso: 0, suplente: 0, goles: 0, tr: 0, mvp: 0, pg: 0, pe: 0, pp: 0
  };
  var s = stats[key];
  if (tipo === 'SUPLENTE') { s.suplente++; return; }
  if (tipo === 'TITULAR') s.titular++;
  else if (tipo === 'INGRESO') s.ingreso++;
  if (resultado === 'G') s.pg++;
  else if (resultado === 'E') s.pe++;
  else if (resultado === 'P') s.pp++;
}
