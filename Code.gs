/**
 * =============================================================================
 *  FITNESS APP — API de Entrenamientos (Google Apps Script)
 * =============================================================================
 *
 *  MODELO DE DATOS
 *  ---------------
 *  La hoja "Entrenamientos" NO almacena entrenamientos como entidades, sino
 *  FILAS de EJERCICIOS/SERIES. Un "entrenamiento" es la agrupación lógica de
 *  todas las filas que comparten la misma combinación (Día + Rutina).
 *
 *  Columnas de la hoja (en este orden exacto):
 *    A  Día                         (Date, YYYY-MM-DD)
 *    B  Rutina                      (string, p.ej. "Pecho y Tríceps")
 *    C  Ejercicio                   (string)
 *    D  Series                      (number)
 *    E  Reps                        (string, p.ej. "8", "6-8")
 *    F  KG / Detalles (Objetivo)    (string, p.ej. "4x60kg, 3x55kg")
 *    G  Objetivo / Notas            (string)
 *    H  KG / Detalles (Conseguidos) (string)
 *    I  Estado                      (string: Planeado | Fallido | Completado | Saltado)
 *
 *  CONCEPTO "ENTRENAMIENTO"
 *  ------------------------
 *  Un entrenamiento = todas las filas con la misma (fecha, rutina).
 *  El endpoint `getWorkouts` devuelve los ejercicios agrupados por entrenamiento.
 *  El endpoint `getExercises` devuelve filas planas (útil para filtros finos).
 *  El estado de un entrenamiento se deriva del estado de sus ejercicios:
 *    - Todos iguales          → ese estado
 *    - Alguno "Fallido"       → "Fallido"   (tiene prioridad: una sesión con algo fallido se marca como fallida)
 *    - Mezcla Planeado + X    → estado mayoritario entre los no-Planeado
 *    - Resto de mezclas       → estado mayoritario
 *
 *  IMPORTANTE PARA CLIENTES DE LA API
 *  ----------------------------------
 *  Al crear/modificar, piensa siempre en términos de FILAS DE EJERCICIOS.
 *  Para crear un entrenamiento completo, envía el array `exercises` al
 *  endpoint `createWorkout` y el script escribirá una fila por ejercicio.
 *
 * =============================================================================
 *  ENDPOINTS (via doGet / doPost con parámetro `action`)
 * =============================================================================
 *
 *  GET  ?action=ping
 *        Health check.
 *
 *  GET  ?action=getExercises&<filtros>
 *        Devuelve filas planas. Filtros soportados (todos opcionales, AND):
 *          - date=YYYY-MM-DD            (fecha exacta)
 *          - dateFrom=YYYY-MM-DD        (rango inicio, inclusive)
 *          - dateTo=YYYY-MM-DD          (rango fin, inclusive)
 *          - routine=Pecho y Tríceps    (match exacto, case-insensitive)
 *          - routineContains=pecho      (substring, case-insensitive)
 *          - exercise=Bench Press Barra (match exacto, case-insensitive)
 *          - exerciseContains=press     (substring, case-insensitive)
 *          - status=Completado          (Planeado|Fallido|Completado|Saltado)
 *          - statusIn=Planeado,Completado   (lista separada por comas)
 *          - limit=50
 *          - offset=0
 *          - sort=date_desc             (date_asc|date_desc, default date_desc)
 *
 *  GET  ?action=getWorkouts&<filtros>
 *        Igual que getExercises pero agrupado por (fecha, rutina).
 *        Devuelve objetos: { date, routine, status, exerciseCount, exercises:[...] }
 *
 *  GET  ?action=getWorkout&date=YYYY-MM-DD&routine=...
 *        Un solo entrenamiento (todas sus filas agrupadas).
 *
 *  GET  ?action=getRoutines
 *        Lista de rutinas únicas existentes en la hoja.
 *
 *  GET  ?action=getStats&<filtros de fecha opcionales>
 *        Totales: nº entrenamientos, nº ejercicios, desglose por estado,
 *        desglose por rutina.
 *
 *  POST ?action=createWorkout
 *        Body JSON:
 *        {
 *          "date": "2026-04-20",
 *          "routine": "Piernas",
 *          "status": "Planeado",              // opcional, default "Planeado"
 *          "exercises": [
 *            {
 *              "exercise": "Sentadilla Barra",
 *              "sets": 4,
 *              "reps": "6-8",
 *              "targetDetails": "4x80kg",
 *              "notes": "Progresión",
 *              "achievedDetails": "",         // opcional
 *              "status": "Planeado"           // opcional, hereda del workout
 *            }
 *          ]
 *        }
 *
 *  POST ?action=createExercise
 *        Añade una sola fila de ejercicio.
 *        Body JSON: { date, routine, exercise, sets, reps, targetDetails,
 *                     notes, achievedDetails, status }
 *
 *  POST ?action=updateExercise
 *        Actualiza una fila existente. Body JSON:
 *        {
 *          "match": { "date":"2026-04-14", "routine":"Espalda y Bíceps",
 *                     "exercise":"Lat Pulldown (Jalón)" },
 *          "updates": { "achievedDetails":"4x72.5kg", "status":"Completado" }
 *        }
 *        El `match` debe identificar UNA sola fila. Si hay varias coincidencias
 *        devuelve error (usa `rowNumber` para ser explícito).
 *        Alternativa: { "match": { "rowNumber": 15 }, "updates": {...} }
 *
 *  POST ?action=updateWorkout
 *        Actualiza TODAS las filas de un entrenamiento.
 *        Body JSON:
 *        {
 *          "match": { "date":"2026-04-14", "routine":"Espalda y Bíceps" },
 *          "updates": { "status":"En Progreso" }           // aplica a todas las filas
 *        }
 *
 *  POST ?action=deleteExercise
 *        Body JSON: { "match": { "rowNumber": 15 } }
 *        o { "match": { "date":..., "routine":..., "exercise":... } }
 *
 *  POST ?action=deleteWorkout
 *        Body JSON: { "match": { "date":"2026-04-14", "routine":"..." } }
 *        Borra todas las filas del entrenamiento.
 *
 *  RESPUESTA
 *  ---------
 *  Todas las respuestas son JSON con esta forma:
 *    { "ok": true,  "data": <...> }
 *    { "ok": false, "error": "mensaje" }
 *
 * =============================================================================
 */

const SHEET_ID = '1q6GywCq5kVC26Qo2C6t2qLqcNj_ywX_s7EGyW50e4YM';
const SHEET_NAME = 'Entrenamientos';

// Índices de columna (1-based, como los usa Sheets)
const COL = {
  DATE: 1,
  ROUTINE: 2,
  EXERCISE: 3,
  SETS: 4,
  REPS: 5,
  TARGET_DETAILS: 6,
  NOTES: 7,
  ACHIEVED_DETAILS: 8,
  STATUS: 9,
};
const NUM_COLS = 9;
const HEADER_ROWS = 1;

const VALID_STATUSES = ['Planeado', 'Fallido', 'Completado', 'Saltado'];

// ============================================================================
//  ENTRY POINTS
// ============================================================================

function doGet(e) {
  return handle_(e, null);
}

function doPost(e) {
  let body = null;
  if (e && e.postData && e.postData.contents) {
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonOut_({ ok: false, error: 'Invalid JSON body: ' + err.message });
    }
  }
  return handle_(e, body);
}

function handle_(e, body) {
  try {
    const params = (e && e.parameter) || {};
    const action = params.action || (body && body.action);
    if (!action) return jsonOut_({ ok: false, error: 'Missing `action` parameter' });

    switch (action) {
      case 'ping':            return jsonOut_({ ok: true, data: { pong: true, time: new Date().toISOString() } });
      case 'getExercises':    return jsonOut_({ ok: true, data: getExercises_(params) });
      case 'getWorkouts':     return jsonOut_({ ok: true, data: getWorkouts_(params) });
      case 'getWorkout':      return jsonOut_({ ok: true, data: getWorkout_(params) });
      case 'getRoutines':     return jsonOut_({ ok: true, data: getRoutines_() });
      case 'getStats':        return jsonOut_({ ok: true, data: getStats_(params) });
      case 'createWorkout':   return jsonOut_({ ok: true, data: createWorkout_(body) });
      case 'createExercise':  return jsonOut_({ ok: true, data: createExercise_(body) });
      case 'updateExercise':  return jsonOut_({ ok: true, data: updateExercise_(body) });
      case 'updateWorkout':   return jsonOut_({ ok: true, data: updateWorkout_(body) });
      case 'deleteExercise':  return jsonOut_({ ok: true, data: deleteExercise_(body) });
      case 'deleteWorkout':   return jsonOut_({ ok: true, data: deleteWorkout_(body) });
      default:
        return jsonOut_({ ok: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message, stack: err.stack });
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
//  SHEET HELPERS
// ============================================================================

function getSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + SHEET_NAME);
  return sheet;
}

/** Lee todas las filas de datos como objetos normalizados + rowNumber. */
function readAllRows_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROWS) return [];
  const range = sheet.getRange(HEADER_ROWS + 1, 1, lastRow - HEADER_ROWS, NUM_COLS);
  const values = range.getValues();
  return values.map((row, idx) => rowToObject_(row, HEADER_ROWS + 1 + idx));
}

function rowToObject_(row, rowNumber) {
  return {
    rowNumber: rowNumber,
    date: formatDate_(row[COL.DATE - 1]),
    routine: String(row[COL.ROUTINE - 1] || ''),
    exercise: String(row[COL.EXERCISE - 1] || ''),
    sets: row[COL.SETS - 1] === '' ? null : Number(row[COL.SETS - 1]),
    reps: String(row[COL.REPS - 1] || ''),
    targetDetails: String(row[COL.TARGET_DETAILS - 1] || ''),
    notes: String(row[COL.NOTES - 1] || ''),
    achievedDetails: String(row[COL.ACHIEVED_DETAILS - 1] || ''),
    status: String(row[COL.STATUS - 1] || ''),
  };
}

function objectToRow_(obj) {
  const row = new Array(NUM_COLS).fill('');
  row[COL.DATE - 1] = obj.date ? parseDate_(obj.date) : '';
  row[COL.ROUTINE - 1] = obj.routine || '';
  row[COL.EXERCISE - 1] = obj.exercise || '';
  row[COL.SETS - 1] = obj.sets == null || obj.sets === '' ? '' : Number(obj.sets);
  row[COL.REPS - 1] = obj.reps == null ? '' : String(obj.reps);
  row[COL.TARGET_DETAILS - 1] = obj.targetDetails || '';
  row[COL.NOTES - 1] = obj.notes || '';
  row[COL.ACHIEVED_DETAILS - 1] = obj.achievedDetails || '';
  row[COL.STATUS - 1] = obj.status || 'Planeado';
  return row;
}

function formatDate_(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const tz = Session.getScriptTimeZone() || 'Europe/Madrid';
    return Utilities.formatDate(val, tz, 'yyyy-MM-dd');
  }
  return String(val);
}

function parseDate_(val) {
  if (val instanceof Date) return val;
  // Espera YYYY-MM-DD
  const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('Invalid date (expected YYYY-MM-DD): ' + val);
  // Crear como fecha local al mediodía para evitar desfases de timezone
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

// ============================================================================
//  FILTROS
// ============================================================================

function applyFilters_(rows, params) {
  let out = rows;

  if (params.date) {
    out = out.filter(r => r.date === params.date);
  }
  if (params.dateFrom) {
    out = out.filter(r => r.date >= params.dateFrom);
  }
  if (params.dateTo) {
    out = out.filter(r => r.date <= params.dateTo);
  }
  if (params.routine) {
    const v = params.routine.toLowerCase();
    out = out.filter(r => r.routine.toLowerCase() === v);
  }
  if (params.routineContains) {
    const v = params.routineContains.toLowerCase();
    out = out.filter(r => r.routine.toLowerCase().indexOf(v) !== -1);
  }
  if (params.exercise) {
    const v = params.exercise.toLowerCase();
    out = out.filter(r => r.exercise.toLowerCase() === v);
  }
  if (params.exerciseContains) {
    const v = params.exerciseContains.toLowerCase();
    out = out.filter(r => r.exercise.toLowerCase().indexOf(v) !== -1);
  }
  if (params.status) {
    out = out.filter(r => r.status === params.status);
  }
  if (params.statusIn) {
    const set = params.statusIn.split(',').map(s => s.trim());
    out = out.filter(r => set.indexOf(r.status) !== -1);
  }

  // Sort
  const sort = params.sort || 'date_desc';
  if (sort === 'date_asc') {
    out.sort((a, b) => a.date.localeCompare(b.date) || a.rowNumber - b.rowNumber);
  } else {
    out.sort((a, b) => b.date.localeCompare(a.date) || a.rowNumber - b.rowNumber);
  }

  // Pagination
  const offset = params.offset ? parseInt(params.offset, 10) : 0;
  const limit = params.limit ? parseInt(params.limit, 10) : 0;
  if (limit > 0) {
    out = out.slice(offset, offset + limit);
  } else if (offset > 0) {
    out = out.slice(offset);
  }

  return out;
}

// ============================================================================
//  READ ENDPOINTS
// ============================================================================

function getExercises_(params) {
  const rows = readAllRows_();
  return applyFilters_(rows, params);
}

function getWorkouts_(params) {
  const rows = applyFilters_(readAllRows_(), params);
  return groupIntoWorkouts_(rows);
}

function getWorkout_(params) {
  if (!params.date || !params.routine) {
    throw new Error('getWorkout requires `date` and `routine` params');
  }
  const rows = readAllRows_().filter(
    r => r.date === params.date && r.routine.toLowerCase() === params.routine.toLowerCase()
  );
  if (rows.length === 0) return null;
  return groupIntoWorkouts_(rows)[0];
}

function groupIntoWorkouts_(rows) {
  const map = {};
  rows.forEach(r => {
    const key = r.date + '||' + r.routine;
    if (!map[key]) {
      map[key] = { date: r.date, routine: r.routine, exercises: [] };
    }
    map[key].exercises.push(r);
  });
  const workouts = Object.keys(map).map(k => {
    const w = map[k];
    w.exerciseCount = w.exercises.length;
    w.status = deriveWorkoutStatus_(w.exercises);
    return w;
  });
  workouts.sort((a, b) => b.date.localeCompare(a.date) || a.routine.localeCompare(b.routine));
  return workouts;
}

function deriveWorkoutStatus_(exercises) {
  if (!exercises.length) return '';
  const statuses = exercises.map(e => e.status);
  const allSame = statuses.every(s => s === statuses[0]);
  if (allSame) return statuses[0];
  // "Fallido" tiene prioridad: si algo falló, el entrenamiento se considera fallido
  if (statuses.indexOf('Fallido') !== -1) return 'Fallido';
  // Estado mayoritario entre el resto
  const counts = {};
  statuses.forEach(s => { counts[s] = (counts[s] || 0) + 1; });
  let best = statuses[0];
  Object.keys(counts).forEach(s => {
    if (counts[s] > counts[best]) best = s;
  });
  return best;
}

function getRoutines_() {
  const rows = readAllRows_();
  const set = {};
  rows.forEach(r => { if (r.routine) set[r.routine] = true; });
  return Object.keys(set).sort();
}

function getStats_(params) {
  const rows = applyFilters_(readAllRows_(), params);
  const workouts = groupIntoWorkouts_(rows);

  const byStatus = {};
  VALID_STATUSES.forEach(s => byStatus[s] = 0);
  rows.forEach(r => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });

  const byRoutine = {};
  rows.forEach(r => {
    if (!byRoutine[r.routine]) byRoutine[r.routine] = { exercises: 0, workouts: 0 };
    byRoutine[r.routine].exercises += 1;
  });
  workouts.forEach(w => {
    if (byRoutine[w.routine]) byRoutine[w.routine].workouts += 1;
  });

  return {
    totalWorkouts: workouts.length,
    totalExercises: rows.length,
    byStatus: byStatus,
    byRoutine: byRoutine,
  };
}

// ============================================================================
//  WRITE ENDPOINTS
// ============================================================================

function validateStatus_(status) {
  if (status && VALID_STATUSES.indexOf(status) === -1) {
    throw new Error('Invalid status. Must be one of: ' + VALID_STATUSES.join(', '));
  }
}

function createWorkout_(body) {
  if (!body) throw new Error('Missing body');
  if (!body.date) throw new Error('`date` is required');
  if (!body.routine) throw new Error('`routine` is required');
  if (!Array.isArray(body.exercises) || body.exercises.length === 0) {
    throw new Error('`exercises` must be a non-empty array');
  }
  const defaultStatus = body.status || 'Planeado';
  validateStatus_(defaultStatus);

  const sheet = getSheet_();
  const rows = body.exercises.map(ex => {
    validateStatus_(ex.status);
    return objectToRow_({
      date: body.date,
      routine: body.routine,
      exercise: ex.exercise,
      sets: ex.sets,
      reps: ex.reps,
      targetDetails: ex.targetDetails,
      notes: ex.notes,
      achievedDetails: ex.achievedDetails,
      status: ex.status || defaultStatus,
    });
  });

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, NUM_COLS).setValues(rows);

  return {
    created: rows.length,
    startRow: startRow,
    endRow: startRow + rows.length - 1,
    workout: { date: body.date, routine: body.routine, exerciseCount: rows.length },
  };
}

function createExercise_(body) {
  if (!body) throw new Error('Missing body');
  if (!body.date || !body.routine || !body.exercise) {
    throw new Error('`date`, `routine` and `exercise` are required');
  }
  validateStatus_(body.status);

  const sheet = getSheet_();
  const row = objectToRow_({
    date: body.date,
    routine: body.routine,
    exercise: body.exercise,
    sets: body.sets,
    reps: body.reps,
    targetDetails: body.targetDetails,
    notes: body.notes,
    achievedDetails: body.achievedDetails,
    status: body.status || 'Planeado',
  });
  const rowNumber = sheet.getLastRow() + 1;
  sheet.getRange(rowNumber, 1, 1, NUM_COLS).setValues([row]);
  return { created: 1, rowNumber: rowNumber };
}

/** Encuentra filas que coinciden con un objeto match. */
function findMatchingRows_(match) {
  if (!match) throw new Error('`match` is required');
  const all = readAllRows_();
  if (match.rowNumber) {
    return all.filter(r => r.rowNumber === Number(match.rowNumber));
  }
  return all.filter(r => {
    if (match.date && r.date !== match.date) return false;
    if (match.routine && r.routine.toLowerCase() !== match.routine.toLowerCase()) return false;
    if (match.exercise && r.exercise.toLowerCase() !== match.exercise.toLowerCase()) return false;
    if (match.status && r.status !== match.status) return false;
    return true;
  });
}

/** Mapeo de claves del API → índice de columna. */
const FIELD_TO_COL = {
  date: COL.DATE,
  routine: COL.ROUTINE,
  exercise: COL.EXERCISE,
  sets: COL.SETS,
  reps: COL.REPS,
  targetDetails: COL.TARGET_DETAILS,
  notes: COL.NOTES,
  achievedDetails: COL.ACHIEVED_DETAILS,
  status: COL.STATUS,
};

function applyUpdatesToRow_(sheet, rowNumber, updates) {
  Object.keys(updates).forEach(key => {
    const colIdx = FIELD_TO_COL[key];
    if (!colIdx) return; // ignora claves desconocidas
    let val = updates[key];
    if (key === 'status') validateStatus_(val);
    if (key === 'date' && val) val = parseDate_(val);
    if (key === 'sets' && val !== '' && val != null) val = Number(val);
    sheet.getRange(rowNumber, colIdx).setValue(val == null ? '' : val);
  });
}

function updateExercise_(body) {
  if (!body || !body.match || !body.updates) {
    throw new Error('Body must include `match` and `updates`');
  }
  const matches = findMatchingRows_(body.match);
  if (matches.length === 0) throw new Error('No rows matched');
  if (matches.length > 1) {
    throw new Error('Match is ambiguous (' + matches.length + ' rows). Use `rowNumber` or narrow the match.');
  }
  const sheet = getSheet_();
  applyUpdatesToRow_(sheet, matches[0].rowNumber, body.updates);
  return { updated: 1, rowNumber: matches[0].rowNumber };
}

function updateWorkout_(body) {
  if (!body || !body.match || !body.updates) {
    throw new Error('Body must include `match` and `updates`');
  }
  if (!body.match.date || !body.match.routine) {
    throw new Error('updateWorkout match requires `date` and `routine`');
  }
  const matches = findMatchingRows_(body.match);
  if (matches.length === 0) throw new Error('No rows matched');
  const sheet = getSheet_();
  matches.forEach(m => applyUpdatesToRow_(sheet, m.rowNumber, body.updates));
  return { updated: matches.length, rowNumbers: matches.map(m => m.rowNumber) };
}

function deleteExercise_(body) {
  if (!body || !body.match) throw new Error('Body must include `match`');
  const matches = findMatchingRows_(body.match);
  if (matches.length === 0) throw new Error('No rows matched');
  if (matches.length > 1) {
    throw new Error('Match is ambiguous (' + matches.length + ' rows). Use `rowNumber`.');
  }
  const sheet = getSheet_();
  sheet.deleteRow(matches[0].rowNumber);
  return { deleted: 1, rowNumber: matches[0].rowNumber };
}

function deleteWorkout_(body) {
  if (!body || !body.match || !body.match.date || !body.match.routine) {
    throw new Error('deleteWorkout requires match.date and match.routine');
  }
  const matches = findMatchingRows_(body.match);
  if (matches.length === 0) throw new Error('No rows matched');
  const sheet = getSheet_();
  // Borrar de abajo a arriba para no desplazar índices
  const rowNumbers = matches.map(m => m.rowNumber).sort((a, b) => b - a);
  rowNumbers.forEach(rn => sheet.deleteRow(rn));
  return { deleted: rowNumbers.length, rowNumbers: rowNumbers.sort((a, b) => a - b) };
}

// ============================================================================
//  TESTS MANUALES (ejecutar desde el editor de Apps Script)
// ============================================================================

function test_getExercises() {
  Logger.log(JSON.stringify(getExercises_({ status: 'Planeado' }), null, 2));
}

function test_getWorkouts() {
  Logger.log(JSON.stringify(getWorkouts_({}), null, 2));
}

function test_getStats() {
  Logger.log(JSON.stringify(getStats_({}), null, 2));
}
