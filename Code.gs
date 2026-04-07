/**
 * ============================================================================
 * FITNESS APP - Google Apps Script Backend API
 * ============================================================================
 *
 * Unified architecture: one single sheet "Entrenamientos" stores every
 * exercise row. Each row is one exercise of one workout. Workouts are
 * grouped logically by (Día + Rutina) on the client side.
 *
 * Columns (in order):
 *   A: Día                          (Date, YYYY-MM-DD)
 *   B: Rutina                       (e.g. "Pecho y Tríceps")
 *   C: Ejercicio                    (e.g. "Bench Press Barra")
 *   D: Series                       (number)
 *   E: Reps                         (string, e.g. "8" or "8,8,6,6")
 *   F: KG / Detalles (Objetivo)     (target weight/detail, string)
 *   G: Objetivo / Notas             (notes about goal)
 *   H: KG / Detalles (Conseguidos)  (actual achieved, string)
 *   I: Estado                       ("Planeado" | "Completado" | "Fallado")
 *
 * The API is intentionally generic so it can be consumed from the web UI,
 * AI agents, scripts, etc. All endpoints return JSON with:
 *   { status: "success" | "error", data: ... }
 *
 * Endpoints:
 *   GET  ?action=ping
 *   GET  ?action=getAll
 *   GET  ?action=getExercises&estado=Planeado|Completado|Fallado
 *   GET  ?action=getWorkouts&estado=...
 *   GET  ?action=getWorkout&dia=YYYY-MM-DD&rutina=...
 *   POST action=createExercise       body: { exercise fields }
 *   POST action=createWorkout        body: { dia, rutina, ejercicios: [...] }
 *   POST action=updateExercise       body: { rowId, fields: {...} }
 *   POST action=updateExercisesBatch body: { updates: [{rowId, fields}, ...] }
 *   POST action=deleteExercise       body: { rowId }
 *   POST action=startWorkout         body: { dia, rutina }   (no-op, just fetch)
 *   POST action=completeWorkout      body: { dia, rutina, exercises: [{rowId, kgConseguidos, estado}] }
 *   POST action=setStatus            body: { rowId, estado }
 *
 * rowId is the 1-based sheet row number (header is row 1, first data is row 2).
 * ============================================================================
 */

const SHEET_ID = '1q6GywCq5kVC26Qo2C6t2qLqcNj_ywX_s7EGyW50e4YM';
const SHEET_NAME = 'Entrenamientos';

const COLS = {
  DIA: 0,
  RUTINA: 1,
  EJERCICIO: 2,
  SERIES: 3,
  REPS: 4,
  KG_OBJETIVO: 5,
  NOTAS: 6,
  KG_CONSEGUIDOS: 7,
  ESTADO: 8
};

const HEADERS = [
  'Día',
  'Rutina',
  'Ejercicio',
  'Series',
  'Reps',
  'KG / Detalles (Objetivo)',
  'Objetivo / Notas',
  'KG / Detalles (Conseguidos)',
  'Estado'
];

const ESTADOS = {
  PLANEADO: 'Planeado',
  COMPLETADO: 'Completado',
  FALLADO: 'Fallado'
};

// ============================================================================
// ENTRY POINTS
// ============================================================================

function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    let body = {};

    if (method === 'POST' && e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (err) {
        body = {};
      }
    }

    // Action can come from query string (?action=...) or JSON body
    const action = params.action || body.action;
    if (!action) return respond('error', 'Missing action parameter');

    switch (action) {
      // --- Read endpoints ---
      case 'ping':
        return respond('success', { ok: true, time: new Date().toISOString() });

      case 'getAll':
        return respond('success', getAll());

      case 'getExercises':
        return respond('success', getExercises(params.estado || body.estado));

      case 'getWorkouts':
        return respond('success', getWorkouts(params.estado || body.estado));

      case 'getWorkout':
        return respond('success', getWorkout(
          params.dia || body.dia,
          params.rutina || body.rutina
        ));

      // --- Write endpoints (accept GET for AI-agent friendliness, prefer POST) ---
      case 'createExercise':
        return respond('success', createExercise(mergeParams(params, body)));

      case 'createWorkout':
        return respond('success', createWorkout(mergeParams(params, body)));

      case 'updateExercise':
        return respond('success', updateExercise(
          Number(params.rowId || body.rowId),
          body.fields || parseFieldsFromParams(params)
        ));

      case 'updateExercisesBatch':
        return respond('success', updateExercisesBatch(body.updates || []));

      case 'deleteExercise':
        return respond('success', deleteExercise(Number(params.rowId || body.rowId)));

      case 'startWorkout':
        return respond('success', getWorkout(
          params.dia || body.dia,
          params.rutina || body.rutina
        ));

      case 'completeWorkout':
        return respond('success', completeWorkout(mergeParams(params, body)));

      case 'setStatus':
        return respond('success', setStatus(
          Number(params.rowId || body.rowId),
          params.estado || body.estado
        ));

      default:
        return respond('error', 'Unknown action: ' + action);
    }
  } catch (err) {
    return respond('error', err.toString() + (err.stack ? ('\n' + err.stack) : ''));
  }
}

// ============================================================================
// SHEET HELPERS
// ============================================================================

function getSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Convert any date-like cell value to a YYYY-MM-DD string. */
function toDateString(value) {
  if (value === null || value === undefined || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  // If it's already a YYYY-MM-DD string, keep as-is.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // Try to parse
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return toDateString(parsed);
  }
  return s;
}

/**
 * Normalize potentially-date-corrupted fields back to strings.
 * Google Sheets sometimes turns things like "8-5" into Date objects.
 * For Reps / KG fields we always want the original textual representation.
 */
function toPlainString(value) {
  if (value === null || value === undefined) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    // Sheet wrongly auto-converted a string like "8,5" or "8-5" to a date.
    // Return an ISO-ish fallback — but the frontend will prefer raw strings
    // so the caller should use `.setNumberFormat("@")` on these columns.
    return toDateString(value);
  }
  return String(value);
}

function rowToObject(row, rowIndex) {
  return {
    rowId: rowIndex, // 1-based sheet row number
    'Día': toDateString(row[COLS.DIA]),
    'Rutina': toPlainString(row[COLS.RUTINA]),
    'Ejercicio': toPlainString(row[COLS.EJERCICIO]),
    'Series': toPlainString(row[COLS.SERIES]),
    'Reps': toPlainString(row[COLS.REPS]),
    'KG / Detalles (Objetivo)': toPlainString(row[COLS.KG_OBJETIVO]),
    'Objetivo / Notas': toPlainString(row[COLS.NOTAS]),
    'KG / Detalles (Conseguidos)': toPlainString(row[COLS.KG_CONSEGUIDOS]),
    'Estado': toPlainString(row[COLS.ESTADO]) || ESTADOS.PLANEADO
  };
}

function readAllRows() {
  const sheet = getSheet();
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (values.length < 2) return [];
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    // Skip fully empty rows
    if (row.every(cell => cell === '' || cell === null)) continue;
    out.push(rowToObject(row, i + 1)); // +1 because sheet rows are 1-based
  }
  return out;
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

function getExercises(estadoFilter) {
  const rows = readAllRows();
  if (!estadoFilter) return { ejercicios: rows };
  const filtered = rows.filter(r => r.Estado === estadoFilter);
  return { ejercicios: filtered };
}

/** Group exercises into workouts keyed by Día + Rutina. */
function getWorkouts(estadoFilter) {
  const rows = readAllRows();
  const filtered = estadoFilter ? rows.filter(r => r.Estado === estadoFilter) : rows;
  const groups = {};
  filtered.forEach(ex => {
    const key = `${ex['Día']}__${ex['Rutina']}`;
    if (!groups[key]) {
      groups[key] = {
        dia: ex['Día'],
        rutina: ex['Rutina'],
        ejercicios: [],
        estado: ex['Estado']
      };
    }
    groups[key].ejercicios.push(ex);
  });
  const workouts = Object.values(groups).sort((a, b) => {
    return (b.dia || '').localeCompare(a.dia || '');
  });
  return { workouts };
}

function getWorkout(dia, rutina) {
  if (!dia) throw new Error('dia is required');
  const normalizedDia = toDateString(dia);
  const rows = readAllRows();
  const matches = rows.filter(r => {
    if (r['Día'] !== normalizedDia) return false;
    if (rutina && r['Rutina'] !== rutina) return false;
    return true;
  });
  return {
    dia: normalizedDia,
    rutina: rutina || (matches[0] && matches[0].Rutina) || '',
    ejercicios: matches
  };
}

function getAll() {
  const rows = readAllRows();
  const planeados = rows.filter(r => r.Estado === ESTADOS.PLANEADO);
  const completados = rows.filter(r => r.Estado === ESTADOS.COMPLETADO);
  const fallados = rows.filter(r => r.Estado === ESTADOS.FALLADO);
  return {
    total: rows.length,
    ejercicios: rows,
    planeados: { ejercicios: planeados },
    completados: { ejercicios: completados },
    fallados: { ejercicios: fallados }
  };
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/** Build a row array from a fields object (using Spanish header keys or aliases). */
function fieldsToRow(fields) {
  const get = (keys, fallback) => {
    for (let i = 0; i < keys.length; i++) {
      if (fields[keys[i]] !== undefined && fields[keys[i]] !== null) return fields[keys[i]];
    }
    return fallback;
  };

  return [
    toDateString(get(['Día', 'dia', 'date', 'fecha'], '')),
    get(['Rutina', 'rutina'], ''),
    get(['Ejercicio', 'ejercicio'], ''),
    get(['Series', 'series', 'sets'], ''),
    get(['Reps', 'reps', 'repeticiones'], ''),
    get(['KG / Detalles (Objetivo)', 'kgObjetivo', 'kg_objetivo', 'objetivoKg'], ''),
    get(['Objetivo / Notas', 'notas', 'objetivo', 'notes'], ''),
    get(['KG / Detalles (Conseguidos)', 'kgConseguidos', 'kg_conseguidos'], ''),
    get(['Estado', 'estado', 'status'], ESTADOS.PLANEADO)
  ];
}

/** Force text-format the columns that must stay as strings, to avoid Google Sheets auto-converting things like "8-5" into a Date. */
function ensureTextColumns(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), 2);
  // Series, Reps, KG Objetivo, KG Conseguidos — columns D, E, F, H
  sheet.getRange(2, COLS.SERIES + 1, lastRow, 1).setNumberFormat('@');
  sheet.getRange(2, COLS.REPS + 1, lastRow, 1).setNumberFormat('@');
  sheet.getRange(2, COLS.KG_OBJETIVO + 1, lastRow, 1).setNumberFormat('@');
  sheet.getRange(2, COLS.KG_CONSEGUIDOS + 1, lastRow, 1).setNumberFormat('@');
}

function createExercise(fields) {
  const sheet = getSheet();
  ensureTextColumns(sheet);
  const row = fieldsToRow(fields);
  sheet.appendRow(row);
  const rowId = sheet.getLastRow();
  return { rowId, ejercicio: rowToObject(row, rowId) };
}

function createWorkout(payload) {
  if (!payload || !payload.dia || !payload.rutina) {
    throw new Error('createWorkout requires dia and rutina');
  }
  const ejercicios = payload.ejercicios || [];
  if (!Array.isArray(ejercicios) || ejercicios.length === 0) {
    throw new Error('createWorkout requires at least one ejercicio');
  }
  const sheet = getSheet();
  ensureTextColumns(sheet);
  const rows = ejercicios.map(ex => fieldsToRow(Object.assign({
    'Día': payload.dia,
    'Rutina': payload.rutina,
    'Estado': payload.estado || ESTADOS.PLANEADO
  }, ex)));
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, HEADERS.length).setValues(rows);
  const created = rows.map((r, i) => rowToObject(r, startRow + i));
  return {
    dia: toDateString(payload.dia),
    rutina: payload.rutina,
    ejercicios: created
  };
}

/** Partial update of an exercise row. `fields` may contain any subset of the columns (using Spanish header names or alias keys). */
function updateExercise(rowId, fields) {
  if (!rowId || rowId < 2) throw new Error('Invalid rowId: ' + rowId);
  if (!fields || typeof fields !== 'object') throw new Error('fields object required');

  const sheet = getSheet();
  ensureTextColumns(sheet);
  const range = sheet.getRange(rowId, 1, 1, HEADERS.length);
  const current = range.getValues()[0];

  // Build merged fields using existing values as defaults
  const currentObj = rowToObject(current, rowId);
  const merged = Object.assign({}, currentObj, fields);
  // Normalize alias keys: if caller sent `kgConseguidos`, map it in
  const aliasMap = {
    dia: 'Día', rutina: 'Rutina', ejercicio: 'Ejercicio',
    series: 'Series', reps: 'Reps',
    kgObjetivo: 'KG / Detalles (Objetivo)',
    kg_objetivo: 'KG / Detalles (Objetivo)',
    notas: 'Objetivo / Notas',
    kgConseguidos: 'KG / Detalles (Conseguidos)',
    kg_conseguidos: 'KG / Detalles (Conseguidos)',
    estado: 'Estado', status: 'Estado'
  };
  Object.keys(aliasMap).forEach(k => {
    if (fields[k] !== undefined) merged[aliasMap[k]] = fields[k];
  });

  const newRow = fieldsToRow(merged);
  range.setValues([newRow]);
  return { rowId, ejercicio: rowToObject(newRow, rowId) };
}

function updateExercisesBatch(updates) {
  if (!Array.isArray(updates)) throw new Error('updates must be an array');
  const results = updates.map(u => updateExercise(Number(u.rowId), u.fields || {}));
  return { updated: results.length, ejercicios: results.map(r => r.ejercicio) };
}

function deleteExercise(rowId) {
  if (!rowId || rowId < 2) throw new Error('Invalid rowId: ' + rowId);
  const sheet = getSheet();
  sheet.deleteRow(rowId);
  return { rowId, deleted: true };
}

function setStatus(rowId, estado) {
  if (!estado) throw new Error('estado is required');
  const valid = Object.values(ESTADOS);
  if (valid.indexOf(estado) === -1) {
    throw new Error('Invalid estado. Must be one of: ' + valid.join(', '));
  }
  return updateExercise(rowId, { Estado: estado });
}

/**
 * Complete a workout: update a set of rows with their achieved kg and
 * mark them Completado (or Fallado). Accepts:
 *   { dia, rutina, exercises: [{rowId, kgConseguidos, estado?, notas?}] }
 * If an exercise object lacks rowId but has `ejercicio`, we'll try to
 * match by (dia, rutina, ejercicio).
 */
function completeWorkout(payload) {
  if (!payload) throw new Error('payload required');
  const exercises = payload.exercises || payload.ejercicios || [];
  if (!Array.isArray(exercises) || exercises.length === 0) {
    throw new Error('exercises array required');
  }

  const sheet = getSheet();
  ensureTextColumns(sheet);

  // Build a lookup table if needed
  let lookup = null;
  const needsLookup = exercises.some(e => !e.rowId);
  if (needsLookup) {
    const rows = readAllRows();
    lookup = rows;
  }

  const results = [];
  exercises.forEach(ex => {
    let rowId = Number(ex.rowId);
    if (!rowId && lookup) {
      const dia = toDateString(payload.dia || ex.dia);
      const rutina = payload.rutina || ex.rutina;
      const match = lookup.find(r =>
        r['Día'] === dia &&
        r['Rutina'] === rutina &&
        r['Ejercicio'] === ex.ejercicio
      );
      if (match) rowId = match.rowId;
    }
    if (!rowId) {
      results.push({ error: 'Could not resolve rowId for ' + JSON.stringify(ex) });
      return;
    }
    const fields = {
      'KG / Detalles (Conseguidos)': ex.kgConseguidos !== undefined ? ex.kgConseguidos : (ex['KG / Detalles (Conseguidos)'] || ''),
      'Estado': ex.estado || ESTADOS.COMPLETADO
    };
    if (ex.notas !== undefined) fields['Objetivo / Notas'] = ex.notas;
    if (ex.reps !== undefined) fields['Reps'] = ex.reps;
    if (ex.series !== undefined) fields['Series'] = ex.series;
    results.push(updateExercise(rowId, fields));
  });

  return {
    dia: toDateString(payload.dia),
    rutina: payload.rutina,
    completados: results.filter(r => !r.error).length,
    errores: results.filter(r => r.error),
    ejercicios: results.filter(r => !r.error).map(r => r.ejercicio)
  };
}

// ============================================================================
// UTIL
// ============================================================================

function mergeParams(params, body) {
  // For POST: body wins; for GET: query params form the payload.
  const merged = {};
  Object.keys(params || {}).forEach(k => { merged[k] = params[k]; });
  Object.keys(body || {}).forEach(k => { merged[k] = body[k]; });
  // Parse ejercicios if it came as a string
  if (typeof merged.ejercicios === 'string') {
    try { merged.ejercicios = JSON.parse(merged.ejercicios); } catch (e) {}
  }
  return merged;
}

function parseFieldsFromParams(params) {
  // Convert ?field.Series=4&field.Reps=8 style into { Series: 4, Reps: 8 }
  const out = {};
  Object.keys(params || {}).forEach(k => {
    if (k.indexOf('field.') === 0) out[k.substring(6)] = params[k];
  });
  return out;
}

function respond(status, data) {
  const out = ContentService.createTextOutput(JSON.stringify({ status, data }));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

// ============================================================================
// ONE-OFF MIGRATION / SETUP HELPERS (run manually from the Apps Script editor)
// ============================================================================

/**
 * Ensure the sheet exists with the right headers and text-formatted columns.
 * Run this once after pasting the script.
 */
function setupSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  // Force text format on series/reps/kg columns so Sheets never converts
  // "8-5" or "8,5" into Date objects.
  sheet.getRange(2, COLS.SERIES + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  sheet.getRange(2, COLS.REPS + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  sheet.getRange(2, COLS.KG_OBJETIVO + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  sheet.getRange(2, COLS.KG_CONSEGUIDOS + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  // Día as date
  sheet.getRange(2, COLS.DIA + 1, sheet.getMaxRows(), 1).setNumberFormat('yyyy-mm-dd');
  return 'Setup complete';
}

/**
 * One-off fix for rows that already got corrupted by Sheets auto-parsing
 * things like "8-5" into Date objects in the Reps or KG columns.
 * This re-writes those cells as the formatted YYYY-MM-DD string, which is
 * obviously not the right value — you'll still need to edit them by hand,
 * but at least the column will be text-formatted afterwards so new entries
 * behave.
 */
function fixCorruptedDateCells() {
  const sheet = getSheet();
  ensureTextColumns(sheet);
  const range = sheet.getDataRange();
  const values = range.getValues();
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i].slice();
    if (i > 0) {
      [COLS.SERIES, COLS.REPS, COLS.KG_OBJETIVO, COLS.KG_CONSEGUIDOS].forEach(c => {
        if (Object.prototype.toString.call(row[c]) === '[object Date]') {
          row[c] = toDateString(row[c]);
        }
      });
    }
    out.push(row);
  }
  range.setValues(out);
  return 'Done';
}
