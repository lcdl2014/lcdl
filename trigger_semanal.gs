/**
 * LA CUEVA DEL LOBIZÓN — Trigger semanal automático
 *
 * Este script recalcula STATS_INDIVIDUALES y RESUMEN_TEMPORADAS
 * leyendo la pestaña PARTIDOS cada vez que se ejecuta.
 *
 * INSTRUCCIONES:
 * 1. Abrí el Sheet → Extensiones → Apps Script
 * 2. Creá un archivo nuevo (botón +) → pegá este código
 * 3. Ejecutá "configurarTrigger" UNA SOLA VEZ para activar el trigger semanal
 * 4. El trigger corre automáticamente cada lunes a las 9am (hora Uruguay)
 * 5. También podés ejecutar "actualizarTodo" manualmente cuando quieras
 */

// ─── CONFIGURAR TRIGGER (ejecutar 1 sola vez) ──────
function configurarTrigger() {
  // Borrar triggers anteriores para no duplicar
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'actualizarTodo') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Crear trigger: cada lunes a las 9am
  ScriptApp.newTrigger('actualizarTodo')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();

  Logger.log('Trigger configurado: actualizarTodo corre cada lunes a las 9am.');
  SpreadsheetApp.getActiveSpreadsheet().toast('Trigger semanal activado. Corre cada lunes a las 9am.', '✅ Listo!', 5);
}

// ─── FUNCIÓN PRINCIPAL ─────────────────────────────
function actualizarTodo() {
  actualizarStatsIndividuales();
  actualizarResumenTemporadas();
  actualizarColumnasPJJugadores();
  Logger.log('Actualización completa: ' + new Date().toLocaleString());
}

// ─── ACTUALIZAR STATS INDIVIDUALES ─────────────────
function actualizarStatsIndividuales() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wsPartidos = ss.getSheetByName("PARTIDOS");
  var wsStats = ss.getSheetByName("STATS_INDIVIDUALES");

  var partidos = getSheetData(wsPartidos);
  if (!partidos.length) return;

  // Acumular stats por jugador+temporada+categoria
  var stats = {}; // key: "NOMBRE|TEMPORADA|CATEGORIA"

  partidos.forEach(function(p) {
    var temporada = p.TEMPORADA;
    var categoria = p.CATEGORIA;
    var resultado = p.RESULTADO;
    var goleadores = p.GOLEADORES || '';

    if (!temporada || !categoria) return;

    // Procesar titulares
    procesarJugadoresEnPartido(p.TITULARES, 'TITULAR', temporada, categoria, resultado, stats);

    // Procesar ingresos (cambios: "Sale→Entra (min)")
    var entrantes = extraerEntrantes(p.CAMBIOS || '');
    entrantes.forEach(function(nombre) {
      acumularStat(nombre, temporada, categoria, 'INGRESO', resultado, stats);
    });

    // Procesar suplentes sin ingreso
    procesarJugadoresEnPartido(p.SUPLENTES_SIN_INGRESO, 'SUPLENTE_SIN_INGRESO', temporada, categoria, null, stats);

    // Procesar tarjetas rojas
    if (p.TARJETAS_ROJAS) {
      p.TARJETAS_ROJAS.split(',').map(function(s) { return s.trim(); }).filter(Boolean).forEach(function(nombre) {
        if (stats[makeKey(nombre, temporada, categoria)]) {
          stats[makeKey(nombre, temporada, categoria)].tr++;
        }
      });
    }

    // Procesar MVP
    if (p.MVP && p.MVP.trim()) {
      var mvpKey = makeKey(p.MVP.trim(), temporada, categoria);
      if (stats[mvpKey]) stats[mvpKey].mvp++;
    }

    // Procesar goles
    if (goleadores) {
      var partes = goleadores.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      partes.forEach(function(parte) {
        var match = parte.match(/^(.+?)(?:\s*\((\d+)\))?(?:\s*\(p\))?$/);
        if (!match) return;
        var nombre = match[1].replace(/\(p\)/g, '').trim();
        var cant = parseInt(match[2] || '1');
        var key = makeKey(nombre, temporada, categoria);
        if (stats[key]) stats[key].goles += cant;
      });
    }
  });

  // Escribir en STATS_INDIVIDUALES
  var headers = ["CARNET","NOMBRE","TEMPORADA","CATEGORIA","PJ","PJ_TITULAR","PJ_INGRESO","PJ_SUPLENTE_SIN_INGRESO","GOLES","TARJETAS_ROJAS","MVP_COUNT","PG","PE","PP"];
  var rows = Object.values(stats).sort(function(a, b) {
    if (a.temporada !== b.temporada) return Number(a.temporada) - Number(b.temporada);
    return a.nombre.localeCompare(b.nombre);
  }).map(function(s) {
    return ["", s.nombre, s.temporada, s.categoria,
      s.titular + s.ingreso, s.titular, s.ingreso, s.suplente,
      s.goles, s.tr, s.mvp, s.pg, s.pe, s.pp];
  });

  wsStats.clearContents();
  wsStats.getRange(1, 1, 1, headers.length).setValues([headers]);
  wsStats.getRange(1, 1, 1, headers.length).setBackground("#8B1C1C").setFontColor("#FFFFFF").setFontWeight("bold");
  if (rows.length > 0) {
    wsStats.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  wsStats.setFrozenRows(1);

  Logger.log('STATS_INDIVIDUALES actualizado: ' + rows.length + ' filas.');
}

// ─── ACTUALIZAR RESUMEN TEMPORADAS ─────────────────
function actualizarResumenTemporadas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wsPartidos = ss.getSheetByName("PARTIDOS");
  var wsResumen = ss.getSheetByName("RESUMEN_TEMPORADAS");
  var wsJugadores = ss.getSheetByName("JUGADORES");

  var partidos = getSheetData(wsPartidos);
  if (!partidos.length) return;

  // Obtener DT actual por temporada+categoria desde partidos
  var dtMap = {};
  partidos.forEach(function(p) {
    var key = p.TEMPORADA + '|' + p.CATEGORIA;
    if (p.DT) dtMap[key] = p.DT;
  });

  // Acumular por temporada+categoria
  var resumen = {};
  partidos.forEach(function(p) {
    if (!p.TEMPORADA || !p.CATEGORIA || !p.RIVAL) return;
    var key = p.TEMPORADA + '|' + p.CATEGORIA;
    if (!resumen[key]) {
      resumen[key] = {
        temporada: p.TEMPORADA, categoria: p.CATEGORIA,
        divisional: p.DIVISIONAL || '', dt: p.DT || '',
        pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0
      };
    }
    var r = resumen[key];
    r.pj++;
    r.gf += Number(p.GOLES_LCdL) || 0;
    r.gc += Number(p.GOLES_RIVAL) || 0;
    if (p.RESULTADO === 'G') r.pg++;
    else if (p.RESULTADO === 'E') r.pe++;
    else if (p.RESULTADO === 'P') r.pp++;
    // Usar último DT registrado
    if (p.DT) r.dt = p.DT;
    if (p.DIVISIONAL) r.divisional = p.DIVISIONAL;
  });

  var headers = ["TEMPORADA","CATEGORIA","DIVISIONAL","DT","PJ","PG","PE","PP","PTS","GF","GC","RENDIMIENTO_PCT"];
  var rows = Object.values(resumen).sort(function(a, b) {
    if (a.temporada !== b.temporada) return Number(a.temporada) - Number(b.temporada);
    return a.categoria === 'MAYORES' ? -1 : 1;
  }).map(function(r) {
    var pts = r.pg * 3 + r.pe;
    var rend = r.pj > 0 ? Math.round(pts / (r.pj * 3) * 1000) / 10 : 0;
    return [r.temporada, r.categoria, r.divisional, r.dt, r.pj, r.pg, r.pe, r.pp, pts, r.gf, r.gc, rend];
  });

  wsResumen.clearContents();
  wsResumen.getRange(1, 1, 1, headers.length).setValues([headers]);
  wsResumen.getRange(1, 1, 1, headers.length).setBackground("#8B1C1C").setFontColor("#FFFFFF").setFontWeight("bold");
  if (rows.length > 0) {
    wsResumen.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  wsResumen.setFrozenRows(1);
  wsResumen.autoResizeColumns(1, headers.length);

  Logger.log('RESUMEN_TEMPORADAS actualizado: ' + rows.length + ' temporadas.');
}

// ─── ACTUALIZAR PJ Y GOLES EN JUGADORES ─────────
function actualizarColumnasPJJugadores() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wsStats = ss.getSheetByName("STATS_INDIVIDUALES");
  var wsJug = ss.getSheetByName("JUGADORES");

  var statsData = getSheetData(wsStats);
  var jugData = getSheetData(wsJug);
  if (!statsData.length || !jugData.length) return;

  // Acumular totales por nombre
  var totales = {};
  statsData.forEach(function(s) {
    var nombre = s.NOMBRE;
    if (!nombre) return;
    if (!totales[nombre]) totales[nombre] = { pj: 0, pjMay: 0, pjPre: 0, goles: 0 };
    var pj = Number(s.PJ) || 0;
    totales[nombre].pj += pj;
    totales[nombre].goles += Number(s.GOLES) || 0;
    if (s.CATEGORIA === 'MAYORES') totales[nombre].pjMay += pj;
    if (s.CATEGORIA === 'PRESENIOR') totales[nombre].pjPre += pj;
  });

  // Encontrar columnas PJ_TOTAL, PJ_MAYORES, PJ_PRESENIOR, GOLES_TOTAL
  var headers = wsJug.getRange(1, 1, 1, wsJug.getLastColumn()).getValues()[0];
  var colPJT = headers.indexOf('PJ_TOTAL') + 1;
  var colPJM = headers.indexOf('PJ_MAYORES') + 1;
  var colPJP = headers.indexOf('PJ_PRESENIOR') + 1;
  var colGOL = headers.indexOf('GOLES_TOTAL') + 1;
  var colNOM = headers.indexOf('NOMBRE_COMPLETO') + 1;

  if (!colPJT || !colNOM) return;

  var lastRow = wsJug.getLastRow();
  for (var i = 2; i <= lastRow; i++) {
    var nombre = wsJug.getRange(i, colNOM).getValue();
    if (!nombre) continue;
    var t = totales[nombre] || { pj: 0, pjMay: 0, pjPre: 0, goles: 0 };
    if (colPJT) wsJug.getRange(i, colPJT).setValue(t.pj);
    if (colPJM) wsJug.getRange(i, colPJM).setValue(t.pjMay);
    if (colPJP) wsJug.getRange(i, colPJP).setValue(t.pjPre);
    if (colGOL) wsJug.getRange(i, colGOL).setValue(t.goles);
  }

  Logger.log('Columnas PJ y GOLES de JUGADORES actualizadas.');
}

// ─── AGREGAR COLUMNAS NUEVAS A JUGADORES ──────────
function agregarColumnasJugadores() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName("JUGADORES");
  var headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];

  var nuevas = ["PIE_HABIL", "ALTURA_CM", "LUGAR_NACIMIENTO", "NUMERO_CAMISETA"];
  nuevas.forEach(function(col) {
    if (headers.indexOf(col) === -1) {
      var nextCol = ws.getLastColumn() + 1;
      ws.getRange(1, nextCol).setValue(col)
        .setBackground("#8B1C1C").setFontColor("#FFFFFF").setFontWeight("bold");
    }
  });

  Logger.log('Columnas nuevas agregadas a JUGADORES: PIE_HABIL, ALTURA_CM, LUGAR_NACIMIENTO, NUMERO_CAMISETA');
  SpreadsheetApp.getActiveSpreadsheet().toast('Columnas agregadas a JUGADORES.', '✅ Listo!', 5);
}

// ─── HELPERS ──────────────────────────────────────
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

function makeKey(nombre, temporada, categoria) {
  return nombre.trim() + '|' + temporada + '|' + categoria;
}

function acumularStat(nombre, temporada, categoria, tipo, resultado, stats) {
  var key = makeKey(nombre, temporada, categoria);
  if (!stats[key]) {
    stats[key] = { nombre: nombre.trim(), temporada: temporada, categoria: categoria,
      titular: 0, ingreso: 0, suplente: 0, goles: 0, tr: 0, mvp: 0, pg: 0, pe: 0, pp: 0 };
  }
  var s = stats[key];
  if (tipo === 'TITULAR') s.titular++;
  else if (tipo === 'INGRESO') s.ingreso++;
  else if (tipo === 'SUPLENTE_SIN_INGRESO') { s.suplente++; return; } // no suma PJ ni resultado
  if (resultado === 'G') s.pg++;
  else if (resultado === 'E') s.pe++;
  else if (resultado === 'P') s.pp++;
}

function procesarJugadoresEnPartido(lista, tipo, temporada, categoria, resultado, stats) {
  if (!lista) return;
  lista.toString().split(',').map(function(s) { return s.trim(); }).filter(Boolean).forEach(function(nombre) {
    acumularStat(nombre, temporada, categoria, tipo, resultado, stats);
  });
}

function extraerEntrantes(cambios) {
  if (!cambios) return [];
  // Formato: "Sale→Entra (55'), Otro→Otro2 (70')"
  var entrantes = [];
  cambios.split(',').forEach(function(c) {
    var match = c.match(/→\s*(.+?)\s*(?:\(|$)/);
    if (match) entrantes.push(match[1].trim());
  });
  return entrantes;
}
