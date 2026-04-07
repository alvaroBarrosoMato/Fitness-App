
// =====================================================================
// CONFIG
// =====================================================================
const API_URL = 'https://script.google.com/macros/s/AKfycbx7VRBQLHKw–TExrzR58ydchpY516XjZEtD43WQ7LnJn7zo6PaO-1ju6WJhVQzkYcFrw/exec';
const VERSION = '1.1.0';

// =====================================================================
// LOGGER
// =====================================================================
const LOG_STYLES = {
boot:   ‘background:#d4ff3a;color:#000;font-weight:bold;padding:2px 8px;border-radius:2px’,
info:   ‘color:#4af0ff;font-weight:bold’,
ok:     ‘color:#d4ff3a;font-weight:bold’,
warn:   ‘color:#ffaa00;font-weight:bold’,
err:    ‘background:#ff5544;color:#000;font-weight:bold;padding:2px 8px;border-radius:2px’,
api:    ‘color:#8a9f1f;font-weight:bold’,
render: ‘color:#888;font-style:italic’,
action: ‘color:#4af0ff;font-weight:bold’,
runner: ‘color:#4af0ff;font-weight:bold;font-style:italic’,
muted:  ‘color:#666’,
};

// In-memory log ring buffer so we can dump it into an on-screen debug panel
// (useful on mobile where the console is not accessible).
const LOG_BUFFER = [];
const LOG_MAX = 300;
function pushLog(tag, args) {
const ts = new Date().toISOString().slice(11, 23);
let text;
try {
text = args.map(a => {
if (a instanceof Error) return a.stack || a.message;
if (typeof a === ‘object’) return JSON.stringify(a);
return String(a);
}).join(’ ’);
} catch { text = ‘[unserializable]’; }
LOG_BUFFER.push({ ts, tag, text });
if (LOG_BUFFER.length > LOG_MAX) LOG_BUFFER.shift();
// Live update panel if open
if (typeof renderDebugPanel === ‘function’) renderDebugPanel();
}

function log(tag, …args)   {
console.log(’%c[’ + tag.toUpperCase() + ‘]’, LOG_STYLES[tag] || LOG_STYLES.info, …args);
pushLog(tag, args);
}
function logGroup(tag, label) {
console.groupCollapsed(’%c[’ + tag.toUpperCase() + ‘]’, LOG_STYLES[tag] || LOG_STYLES.info, label);
pushLog(tag, [‘▼ ’ + label]);
}
function logGroupEnd() { console.groupEnd(); }
function logErr(label, err) {
console.group(’%c[ERROR]’, LOG_STYLES.err, label);
console.error(err);
if (err && err.stack) console.log(’%cStack:’, LOG_STYLES.muted, ‘\n’ + err.stack);
console.groupEnd();
pushLog(‘err’, [label + ‘:’, (err && err.message) || err, (err && err.stack) ? ‘\n’ + err.stack : ‘’]);
}

window.addEventListener(‘error’, e => {
logErr(‘window.onerror’, e.error || e.message);
pushLog(‘err’, [‘window.onerror’, e.message, ‘at’, e.filename + ‘:’ + e.lineno + ‘:’ + e.colno]);
});
window.addEventListener(‘unhandledrejection’, e => logErr(‘unhandledrejection’, e.reason));

console.log(’%c IRON LOG ’, LOG_STYLES.boot, `v${VERSION} · boot @ ${new Date().toISOString()}`);
log(‘info’, ‘API URL:’, API_URL);
log(‘info’, ‘UserAgent:’, navigator.userAgent);
log(‘info’, ‘Viewport:’, window.innerWidth + ‘x’ + window.innerHeight);

// =====================================================================
// STATE
// =====================================================================
const state = {
planned: [],
past: [],
// Workouts the user has started locally (no backend “En Progreso” status)
// key: `${date}__${routine}` → boolean
inProgress: {},
// Per-row achievedDetails edits made during runner
// key: rowNumber → string
edits: {},
// Currently running workout in the runner overlay
runner: null,
};

// =====================================================================
// API
// =====================================================================
let callCounter = 0;
async function apiCall(action, params = {}, body = null) {
const callId = ++callCounter;
const t0 = performance.now();
const url = new URL(API_URL);
url.searchParams.set(‘action’, action);
Object.entries(params).forEach(([k, v]) => {
if (v !== undefined && v !== null && v !== ‘’) url.searchParams.set(k, v);
});

logGroup(‘api’, `#${callId} → ${action}`);
log(‘api’, ‘URL:’, url.toString());
log(‘api’, ‘Method:’, body ? ‘POST’ : ‘GET’);
if (Object.keys(params).length) log(‘api’, ‘Query params:’, params);
if (body) log(‘api’, ‘Body:’, body);

const opts = body
? { method: ‘POST’, body: JSON.stringify(body), headers: { ‘Content-Type’: ‘text/plain;charset=utf-8’ }, redirect: ‘follow’ }
: { method: ‘GET’, redirect: ‘follow’ };

try {
let res;
try {
res = await fetch(url.toString(), opts);
} catch (netErr) {
log(‘err’, ‘Network/fetch failed:’, netErr.message);
logGroupEnd();
throw new Error(’Red/CORS: ’ + netErr.message);
}
const ms = (performance.now() - t0).toFixed(0);
log(‘api’, `Response: HTTP ${res.status} ${res.statusText} (${ms}ms)`);
log(‘api’, ‘Final URL (after redirects):’, res.url);

```
if (!res.ok) {
  const text = await res.text().catch(() => '(no body)');
  log('err', 'HTTP error body:', text);
  logGroupEnd();
  throw new Error('HTTP ' + res.status + ': ' + res.statusText);
}

const raw = await res.text();
log('api', 'Raw response length:', raw.length, 'chars');
if (raw.length < 2000) log('api', 'Raw response:', raw);

let data;
try {
  data = JSON.parse(raw);
} catch (parseErr) {
  log('err', 'JSON parse failed. Raw:', raw.substring(0, 500));
  logGroupEnd();
  throw new Error('Respuesta no es JSON válido: ' + parseErr.message);
}

if (!data.ok) {
  log('err', 'API returned ok=false:', data.error);
  if (data.stack) log('err', 'Server stack:', data.stack);
  logGroupEnd();
  throw new Error(data.error || 'API error');
}

log('ok', '✓ Success. Data:', data.data);
logGroupEnd();
return data.data;
```

} catch (err) {
const ms = (performance.now() - t0).toFixed(0);
log(‘err’, `✗ Call #${callId} failed after ${ms}ms:`, err.message);
logGroupEnd();
throw err;
}
}

// =====================================================================
// UTILS
// =====================================================================
const MONTHS_ES = [‘Ene’,‘Feb’,‘Mar’,‘Abr’,‘May’,‘Jun’,‘Jul’,‘Ago’,‘Sep’,‘Oct’,‘Nov’,‘Dic’];
const WEEKDAYS_ES = [‘Domingo’,‘Lunes’,‘Martes’,‘Miércoles’,‘Jueves’,‘Viernes’,‘Sábado’];

function todayYMD() {
const d = new Date();
return [d.getFullYear(), String(d.getMonth()+1).padStart(2,‘0’), String(d.getDate()).padStart(2,‘0’)].join(’-’);
}
function parseYMD(s) {
const [y, m, d] = s.split(’-’).map(Number);
return new Date(y, m - 1, d, 12);
}
function formatDay(dateStr) {
const d = parseYMD(dateStr);
return {
num: String(d.getDate()).padStart(2, ‘0’),
month: MONTHS_ES[d.getMonth()] + ’ ’ + d.getFullYear(),
weekday: WEEKDAYS_ES[d.getDay()],
};
}
function workoutKey(w) { return `${w.date}__${w.routine}`; }

function groupByDate(workouts) {
const map = {};
workouts.forEach(w => {
if (!map[w.date]) map[w.date] = [];
map[w.date].push(w);
});
return Object.keys(map).sort().reverse().map(date => ({ date, workouts: map[date] }));
}

function escapeHtml(s) {
return String(s ?? ‘’).replace(/[&<>”’]/g, c => ({
‘&’:’&’,’<’:’<’,’>’:’>’,’”’:’"’,”’”:’'’
}[c]));
}

function attrSafe(s) {
// Encode for use inside data-* attributes
return encodeURIComponent(String(s ?? ‘’));
}
function attrDecode(s) {
return decodeURIComponent(String(s ?? ‘’));
}

function toast(msg, isErr = false) {
const el = document.getElementById(‘toast’);
el.textContent = msg;
el.classList.toggle(‘err’, isErr);
el.classList.add(‘show’);
clearTimeout(toast._t);
toast._t = setTimeout(() => el.classList.remove(‘show’), 2800);
}

// Apply local “En Progreso” overlay onto a workout list
function applyInProgressOverlay(list) {
list.forEach(w => {
if (state.inProgress[workoutKey(w)]) {
w.status = ‘En Progreso’;
w.exercises.forEach(ex => ex.status = ‘En Progreso’);
}
});
}

// =====================================================================
// RENDER · PLANNED
// =====================================================================
function renderPlanned() {
log(‘render’, `renderPlanned() · ${state.planned.length} workouts`);
document.getElementById(‘count-planned’).textContent = state.planned.length;

applyInProgressOverlay(state.planned);

// —– TODAY SLOT —–
const today = todayYMD();
const todayWorkouts = state.planned.filter(w => w.date === today);
const todaySlot = document.getElementById(‘today-slot’);
const td = formatDay(today);

if (todayWorkouts.length > 0) {
log(‘render’, `Hoy (${today}) tiene ${todayWorkouts.length} entrenamiento(s)`);
todaySlot.innerHTML = `<div class="today-block"> <div class="today-tag">Hoy · ${td.weekday} ${td.num} ${td.month}</div> ${todayWorkouts.map(w => renderWorkoutCard(w, 'planned')).join('')} </div>`;
} else {
log(‘render’, `Hoy (${today}) es día de descanso`);
todaySlot.innerHTML = `<div class="today-block"> <div class="today-tag">Hoy · ${td.weekday} ${td.num} ${td.month}</div> <div class="today-rest"> <div class="icon">Z Z Z</div> <h3>Día de descanso</h3> <p>Sin sesión programada · Recupera</p> </div> </div>`;
}

// —– UPCOMING (excluding today) —–
const list = document.getElementById(‘list-planned’);
const upcoming = state.planned.filter(w => w.date !== today);

if (upcoming.length === 0) {
list.innerHTML = ‘’;
} else {
const groups = groupByDate(upcoming);
// Future first, ordered ascending by date
groups.sort((a,b) => a.date.localeCompare(b.date));
list.innerHTML = groups.map(g => {
const d = formatDay(g.date);
return `<div class="day-group"> <div class="day-header"> <div class="day-num">${d.num}</div> <div class="day-meta"> <span class="day-month">${d.month}</span> <span class="day-weekday">${d.weekday}</span> </div> </div> ${g.workouts.map(w => renderWorkoutCard(w, 'planned')).join('')} </div>`;
}).join(’’);
}

attachWorkoutHandlers();
}

// =====================================================================
// RENDER · PAST
// =====================================================================
function renderPast() {
log(‘render’, `renderPast() · ${state.past.length} workouts`);
const list = document.getElementById(‘list-past’);
document.getElementById(‘count-past’).textContent = state.past.length;

if (state.past.length === 0) {
list.innerHTML = `<div class="empty"><div class="big">00</div><p>Aún no hay entrenamientos completados en el historial.</p></div>`;
return;
}

const groups = groupByDate(state.past);
list.innerHTML = groups.map(g => {
const d = formatDay(g.date);
return `<div class="day-group"> <div class="day-header"> <div class="day-num">${d.num}</div> <div class="day-meta"> <span class="day-month">${d.month}</span> <span class="day-weekday">${d.weekday}</span> </div> </div> ${g.workouts.map(w => renderWorkoutCard(w, 'past')).join('')} </div>`;
}).join(’’);

attachWorkoutHandlers();
}

// =====================================================================
// WORKOUT CARD
// =====================================================================
function renderWorkoutCard(w, mode) {
const key = workoutKey(w);
const status = w.status || ‘Planeado’;
const exCount = w.exerciseCount || w.exercises.length;

const exercises = w.exercises.map(ex => {
const achievedHtml = (mode === ‘past’ && ex.achievedDetails)
? `<div class="ex-achieved"><span class="ex-label">Conseguido</span>${escapeHtml(ex.achievedDetails)}</div>`
: ‘’;
return `<div class="exercise"> <div class="ex-name"> <span>${escapeHtml(ex.exercise)}</span> <span class="sets-reps">${ex.sets ?? '—'}×${escapeHtml(ex.reps) || '—'}</span> </div> <div><span class="ex-label">Objetivo</span><span class="ex-target">${escapeHtml(ex.targetDetails) || '—'}</span></div> ${achievedHtml} ${ex.notes ?`<div class="ex-notes">”${escapeHtml(ex.notes)}”</div>`: ''} </div>`;
}).join(’’);

let actions = ‘’;
if (mode === ‘planned’) {
if (status === ‘En Progreso’) {
actions = `<div class="actions"> <button class="btn primary" data-action="resume" data-key="${attrSafe(key)}">▶ Continuar sesión</button> </div>`;
} else {
actions = `<div class="actions"> <button class="btn primary" data-action="start" data-key="${attrSafe(key)}">▶ Iniciar</button> <button class="btn ghost" data-action="skip" data-key="${attrSafe(key)}">Saltar</button> </div>`;
}
}

return `<article class="workout" data-status="${escapeHtml(status)}" data-key="${attrSafe(key)}"> <div class="workout-head" data-toggle> <div> <h3>${escapeHtml(w.routine)}</h3> <div class="meta"> <span>${exCount} ejercicios</span> <span>${escapeHtml(status)}</span> </div> </div> <div class="chevron">▾</div> </div> <div class="workout-body"> <div class="exercises">${exercises}</div> ${actions} </div> </article>`;
}

function findWorkoutByKey(key) {
return state.planned.find(w => workoutKey(w) === key)
|| state.past.find(w => workoutKey(w) === key);
}

// No-op: kept for backwards compatibility with existing render calls.
// Event handling is now done via global delegation — see installGlobalHandlers().
function attachWorkoutHandlers() { /* delegation handles everything */ }

// Install ONCE at startup. Delegates clicks from document root.
// This survives any number of re-renders without duplicate listeners.
function installGlobalHandlers() {
log(‘info’, ‘installGlobalHandlers · delegation listeners attached’);

// –––– TABS (delegated) ––––
const tabsRoot = document.querySelector(‘nav.tabs’);
if (tabsRoot) {
tabsRoot.addEventListener(‘click’, (e) => {
const btn = e.target.closest(‘button[data-view]’);
if (!btn) return;
log(‘info’, ‘Tab switch →’, btn.dataset.view);
tabsRoot.querySelectorAll(‘button’).forEach(b => b.classList.remove(‘active’));
document.querySelectorAll(’.view’).forEach(v => v.classList.remove(‘active’));
btn.classList.add(‘active’);
const view = document.getElementById(‘view-’ + btn.dataset.view);
if (view) view.classList.add(‘active’);
});
} else {
log(‘warn’, ‘nav.tabs no encontrado’);
}

// –––– RUNNER CONTROLS ––––
if (dom.close) {
dom.close.addEventListener(‘click’, () => {
if (confirm(’¿Salir de la sesión? Los cambios guardados se mantienen.’)) closeRunner();
});
}
if (dom.prev) {
dom.prev.addEventListener(‘click’, () => {
if (!state.runner) return;
goToSlide(state.runner.currentIndex - 1);
});
}
if (dom.next) {
dom.next.addEventListener(‘click’, () => {
if (!state.runner) return;
goToSlide(state.runner.currentIndex + 1);
});
}

// –––– KEYBOARD NAVIGATION (runner) ––––
document.addEventListener(‘keydown’, (e) => {
const runner = dom.runner;
if (!runner || !runner.classList.contains(‘open’)) return;
if (e.key === ‘Escape’) closeRunner();
if (e.key === ‘ArrowRight’) goToSlide(state.runner.currentIndex + 1);
if (e.key === ‘ArrowLeft’) goToSlide(state.runner.currentIndex - 1);
});

// –––– STATUSBAR (click para ver log) ––––
const statusbar = document.querySelector(’.statusbar’);
if (statusbar) {
statusbar.style.cursor = ‘pointer’;
statusbar.addEventListener(‘click’, () => openDebugPanel());
}

// –––– CARD CLICKS (delegated at document) ––––
document.addEventListener(‘click’, async (e) => {
// — 1) ACTION BUTTONS (start / resume / skip) —
const btn = e.target.closest(’.btn[data-action]’);
if (btn) {
e.preventDefault();
e.stopPropagation();
const action = btn.dataset.action;
const key = attrDecode(btn.dataset.key);
log(‘action’, `Delegated click: ${action} → ${key}`);
if (btn.disabled) { log(‘warn’, ‘Botón deshabilitado, ignorado’); return; }

```
  const workout = findWorkoutByKey(key);
  if (!workout) {
    log('warn', 'Workout no encontrado para key:', key);
    log('warn', 'Planned keys disponibles:', state.planned.map(workoutKey));
    toast('No se encuentra el entrenamiento', true);
    return;
  }

  btn.disabled = true;
  try {
    if (action === 'start' || action === 'resume') {
      log('action', '→ openRunner()');
      openRunner(workout);
    } else if (action === 'skip') {
      log('action', '→ markWorkoutStatus(Saltado)');
      await markWorkoutStatus(workout, 'Saltado');
    }
  } catch (err) {
    logErr(`action:${action}`, err);
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
  return;
}

// --- 2) WORKOUT HEAD (toggle expand/collapse) ---
const head = e.target.closest('.workout-head[data-toggle]');
if (head) {
  const card = head.closest('.workout');
  if (card) {
    card.classList.toggle('open');
    log('action', `Toggle card: ${card.classList.contains('open') ? 'open' : 'closed'} · ${attrDecode(card.dataset.key || '')}`);
  }
  return;
}
```

});
}

// =====================================================================
// MARK STATUS (Saltado / Fallido)
// =====================================================================
async function markWorkoutStatus(w, status) {
log(‘action’, `markWorkoutStatus: ${w.date} / ${w.routine} → ${status}`);
await apiCall(‘updateWorkout’, {}, {
match: { date: w.date, routine: w.routine },
updates: { status },
});
// Clear local in-progress flag if any
delete state.inProgress[workoutKey(w)];
toast(`Marcado como ${status}`);
await loadAll();
}

// =====================================================================
// RUNNER (Full-screen workout flow with horizontal slides)
// =====================================================================
// Lazy DOM refs — resolved on first access so the script never crashes
// at parse-time if an ID is missing. Fails loudly (not silently) at use.
function $(id) {
const el = document.getElementById(id);
if (!el) log(‘warn’, `#${id} no existe en el DOM`);
return el;
}
const dom = {
get runner()        { return $(‘runner’); },
get track()         { return $(‘runner-track’); },
get routine()       { return $(‘runner-routine’); },
get progress()      { return $(‘runner-progress’); },
get barFill()       { return $(‘runner-bar-fill’); },
get dots()          { return $(‘runner-dots’); },
get prev()          { return $(‘runner-prev’); },
get next()          { return $(‘runner-next’); },
get close()         { return $(‘runner-close’); },
};

function openRunner(workout) {
log(‘runner’, `openRunner: ${workout.date} / ${workout.routine}`);

// Mark as in progress (UI only)
const key = workoutKey(workout);
state.inProgress[key] = true;
workout.status = ‘En Progreso’;
workout.exercises.forEach(ex => ex.status = ‘En Progreso’);

state.runner = {
workout,
currentIndex: 0,
notes: ‘’,
};

dom.routine.textContent = workout.routine;
buildRunnerSlides();
dom.runner.classList.add(‘open’);
document.body.style.overflow = ‘hidden’;

// Reset scroll to first slide after a tick (need DOM laid out)
requestAnimationFrame(() => {
dom.track.scrollLeft = 0;
updateRunnerUI(0);
});
}

function closeRunner() {
log(‘runner’, ‘closeRunner’);
dom.runner.classList.remove(‘open’);
document.body.style.overflow = ‘’;
state.runner = null;
}

function buildRunnerSlides() {
const { workout } = state.runner;
const total = workout.exercises.length;

const exerciseSlides = workout.exercises.map((ex, i) => {
const editVal = state.edits[ex.rowNumber] ?? ex.achievedDetails ?? ‘’;
return `
<div class="slide" data-slide-index="${i}" data-row="${ex.rowNumber}">
<div class="slide-eyebrow"><b>EJ ${String(i+1).padStart(2,‘0’)} / ${String(total).padStart(2,‘0’)}</b> · ${escapeHtml(workout.routine)}</div>
<h2 class="slide-title">${escapeHtml(ex.exercise)}</h2>

```
    <div class="slide-stat-row">
      <div class="slide-stat">
        <span class="label">Series</span>
        <span class="value accent">${ex.sets ?? '—'}</span>
      </div>
      <div class="slide-stat">
        <span class="label">Reps</span>
        <span class="value accent">${escapeHtml(ex.reps) || '—'}</span>
      </div>
    </div>

    <div class="slide-target">
      <span class="label">Objetivo de pesos</span>
      <span class="value">${escapeHtml(ex.targetDetails) || '—'}</span>
    </div>

    <div class="slide-input-block">
      <label for="ex-input-${ex.rowNumber}">Conseguido</label>
      <input
        type="text"
        id="ex-input-${ex.rowNumber}"
        class="ex-runner-input"
        data-row="${ex.rowNumber}"
        placeholder="${escapeHtml(ex.targetDetails) || 'ej: 4x62.5kg'}"
        value="${escapeHtml(editVal)}"
        autocomplete="off"
        inputmode="text" />
      <span class="hint">Si lo dejas vacío se guardará como cumplido al objetivo.</span>
    </div>

    ${ex.notes ? `<div class="slide-notes"><span class="label">Notas</span><span class="text">"${escapeHtml(ex.notes)}"</span></div>` : ''}
  </div>
`;
```

}).join(’’);

// Summary slide (last)
const summarySlide = `
<div class="slide summary" data-slide-index="${total}" data-summary>
<div class="slide-eyebrow"><b>RESUMEN</b> · ${escapeHtml(workout.routine)}</div>
<h2 class="slide-title">Cierra la sesión</h2>
<ul class="summary-list" id="summary-list"></ul>

```
  <div class="summary-notes-block">
    <label for="summary-notes">Notas de la sesión</label>
    <textarea id="summary-notes" placeholder="Cómo te has sentido, energía, conexión mente-músculo, observaciones…">${escapeHtml(state.runner.notes || '')}</textarea>
  </div>

  <div class="summary-actions">
    <button class="btn primary" id="btn-complete-workout">✓ Completar entrenamiento</button>
    <button class="btn danger" id="btn-fail-workout">Marcar como fallido</button>
  </div>
</div>
```

`;

dom.track.innerHTML = exerciseSlides + summarySlide;

// Build dots (one per slide including summary)
const totalSlides = total + 1;
dom.dots.innerHTML = Array.from({length: totalSlides}, (_, i) =>
`<div class="runner-dot" data-dot="${i}"></div>`
).join(’’);

// Listeners on inputs (save edits live)
dom.track.querySelectorAll(’.ex-runner-input’).forEach(inp => {
inp.addEventListener(‘input’, e => {
const row = e.target.dataset.row;
state.edits[row] = e.target.value;
log(‘runner’, `edit row ${row}: "${e.target.value}"`);
});
});

// Notes textarea on summary
const notesEl = dom.track.querySelector(’#summary-notes’);
if (notesEl) {
notesEl.addEventListener(‘input’, e => {
state.runner.notes = e.target.value;
});
}

// Summary buttons
const completeBtn = dom.track.querySelector(’#btn-complete-workout’);
if (completeBtn) completeBtn.addEventListener(‘click’, () => completeWorkoutFromRunner());
const failBtn = dom.track.querySelector(’#btn-fail-workout’);
if (failBtn) failBtn.addEventListener(‘click’, () => failWorkoutFromRunner());

// Track scroll → snap detection
let scrollTimeout = null;
dom.track.addEventListener(‘scroll’, () => {
clearTimeout(scrollTimeout);
scrollTimeout = setTimeout(() => {
const idx = Math.round(dom.track.scrollLeft / dom.track.clientWidth);
if (idx !== state.runner.currentIndex) {
handleSlideChange(idx);
}
}, 80);
});
}

function handleSlideChange(newIdx) {
if (!state.runner) return;
const oldIdx = state.runner.currentIndex;
log(‘runner’, `slide change ${oldIdx} → ${newIdx}`);

// If we are LEAVING an exercise slide (going forward), persist the edit to API
if (newIdx > oldIdx && oldIdx < state.runner.workout.exercises.length) {
const leavingEx = state.runner.workout.exercises[oldIdx];
persistExercise(leavingEx).catch(err => {
logErr(‘persistExercise’, err);
toast(’Error guardando: ’ + err.message, true);
});
}

state.runner.currentIndex = newIdx;
updateRunnerUI(newIdx);

// Build summary if landing on summary slide
if (newIdx === state.runner.workout.exercises.length) {
buildSummaryList();
}
}

async function persistExercise(ex) {
const achieved = state.edits[ex.rowNumber];
// Only call API if user actually entered something different
// (Falsy / unchanged → skip until final completion)
if (achieved === undefined || achieved === ‘’) {
log(‘runner’, `persistExercise skipped (no edit) · row ${ex.rowNumber}`);
return;
}
log(‘runner’, `persistExercise · row ${ex.rowNumber} = "${achieved}"`);
await apiCall(‘updateExercise’, {}, {
match: { rowNumber: ex.rowNumber },
updates: { achievedDetails: achieved },
});
// Update local model so summary reflects it
ex.achievedDetails = achieved;
toast(‘✓ Guardado’);
}

function updateRunnerUI(idx) {
const total = state.runner.workout.exercises.length;
const totalSlides = total + 1;

// Header progress
if (idx < total) {
dom.progress.textContent = `Ejercicio ${idx + 1} / ${total}`;
} else {
dom.progress.textContent = `Resumen final`;
}

// Bar
const pct = ((idx) / (totalSlides - 1)) * 100;
dom.barFill.style.width = pct + ‘%’;

// Dots
dom.dots.querySelectorAll(’.runner-dot’).forEach((d, i) => {
d.classList.toggle(‘active’, i === idx);
d.classList.toggle(‘done’, i < idx);
});

// Nav buttons
dom.prev.disabled = idx === 0;
if (idx === totalSlides - 1) {
dom.next.style.visibility = ‘hidden’;
} else {
dom.next.style.visibility = ‘visible’;
dom.next.textContent = (idx === total - 1) ? ‘Resumen ›’ : ‘Siguiente ›’;
}
}

function goToSlide(idx) {
const total = state.runner.workout.exercises.length;
const max = total; // summary index
idx = Math.max(0, Math.min(idx, max));
log(‘runner’, `goToSlide(${idx})`);
dom.track.scrollTo({ left: idx * dom.track.clientWidth, behavior: ‘smooth’ });
}

function buildSummaryList() {
const { workout } = state.runner;
const ul = document.getElementById(‘summary-list’);
if (!ul) return;
ul.innerHTML = workout.exercises.map(ex => {
const edited = state.edits[ex.rowNumber];
const achieved = (edited !== undefined && edited !== ‘’) ? edited : (ex.achievedDetails || ‘’);
const matchedTarget = !achieved;
const display = matchedTarget
? `<span class="matched">= objetivo</span>`
: `<span class="target">${escapeHtml(ex.targetDetails) || '—'}</span><span class="achieved">${escapeHtml(achieved)}</span>`;
return `<li class="summary-row"> <div class="name">${escapeHtml(ex.exercise)}<br><span style="font-family:var(--mono);font-size:10px;color:var(--ink-faint);font-weight:400;">${ex.sets ?? '—'}×${escapeHtml(ex.reps) || '—'}</span></div> <div class="vals">${display}</div> </li>`;
}).join(’’);
}

async function completeWorkoutFromRunner() {
if (!state.runner) return;
const { workout, notes } = state.runner;
log(‘runner’, `completeWorkoutFromRunner: ${workout.date} / ${workout.routine}`);

const completeBtn = document.getElementById(‘btn-complete-workout’);
const failBtn = document.getElementById(‘btn-fail-workout’);
if (completeBtn) completeBtn.disabled = true;
if (failBtn) failBtn.disabled = true;

toast(‘Guardando entrenamiento…’);

try {
let updated = 0;
for (const ex of workout.exercises) {
const edited = state.edits[ex.rowNumber];
const finalAchieved = (edited !== undefined && edited !== ‘’)
? edited
: (ex.achievedDetails || ex.targetDetails || ‘’);

```
  // If we have notes, append to first exercise's notes field (only on first iter)
  const updates = {
    achievedDetails: finalAchieved,
    status: 'Completado',
  };
  if (updated === 0 && notes && notes.trim()) {
    // Preserve existing notes by prepending
    updates.notes = ex.notes ? `${ex.notes} | ${notes.trim()}` : notes.trim();
  }

  log('runner', `  → row ${ex.rowNumber} (${ex.exercise}): achieved="${finalAchieved}"`);
  await apiCall('updateExercise', {}, {
    match: { rowNumber: ex.rowNumber },
    updates,
  });
  delete state.edits[ex.rowNumber];
  updated++;
}
delete state.inProgress[workoutKey(workout)];
log('ok', `✓ ${updated} ejercicios guardados`);
toast(`✓ Sesión completada`);
closeRunner();
await loadAll();
```

} catch (err) {
logErr(‘completeWorkoutFromRunner’, err);
toast(err.message, true);
if (completeBtn) completeBtn.disabled = false;
if (failBtn) failBtn.disabled = false;
}
}

async function failWorkoutFromRunner() {
if (!state.runner) return;
const { workout } = state.runner;
log(‘runner’, `failWorkoutFromRunner: ${workout.date} / ${workout.routine}`);
const completeBtn = document.getElementById(‘btn-complete-workout’);
const failBtn = document.getElementById(‘btn-fail-workout’);
if (completeBtn) completeBtn.disabled = true;
if (failBtn) failBtn.disabled = true;
try {
await markWorkoutStatus(workout, ‘Fallido’);
closeRunner();
} catch (err) {
if (completeBtn) completeBtn.disabled = false;
if (failBtn) failBtn.disabled = false;
}
}

// Runner controls — moved into installGlobalHandlers() to guarantee
// they run at a known time and never crash the module at parse-time.

// =====================================================================
// LOAD
// =====================================================================
async function loadAll() {
logGroup(‘info’, ‘loadAll()’);
const t0 = performance.now();

document.getElementById(‘list-planned’).innerHTML = `<div class="loading">Cargando planeados</div>`;
document.getElementById(‘today-slot’).innerHTML = ‘’;
document.getElementById(‘list-past’).innerHTML = `<div class="loading">Cargando historial</div>`;

try {
const dot = document.getElementById(‘api-dot’);
const st = document.getElementById(‘api-status’);

```
log('info', 'Lanzando fetch en paralelo: planeados + completados');
const [planned, past] = await Promise.all([
  apiCall('getWorkouts', { status: 'Planeado', sort: 'date_asc' }),
  apiCall('getWorkouts', { status: 'Completado', sort: 'date_desc' }),
]);

log('ok', `Recibidos · planeados: ${planned.length} · pasados: ${past.length}`);

state.planned = planned;
state.past = past;

dot.classList.add('ok');
dot.classList.remove('err');
st.textContent = 'Conectado';
document.getElementById('last-sync').textContent = 'Sync ' + new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});

renderPlanned();
renderPast();

const ms = (performance.now() - t0).toFixed(0);
log('ok', `loadAll completado en ${ms}ms`);
logGroupEnd();
```

} catch (err) {
logGroupEnd();
logErr(‘loadAll’, err);
const dot = document.getElementById(‘api-dot’);
const st = document.getElementById(‘api-status’);
const sync = document.getElementById(‘last-sync’);
dot.classList.add(‘err’);
dot.classList.remove(‘ok’);
st.textContent = ‘ERROR’;
if (sync) sync.textContent = (err && err.message ? err.message : String(err)).slice(0, 80);

```
document.getElementById('list-planned').innerHTML =
  `<div class="error-box">
    <b>ERROR DE CONEXIÓN</b><br><br>
    <b>Mensaje:</b> ${escapeHtml(err.message || String(err))}<br>
    <b>Tipo:</b> ${escapeHtml(err.name || 'Error')}<br><br>
    <button id="show-debug" style="background:#ff5544;color:#000;border:none;padding:10px 16px;font-family:var(--mono);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;cursor:pointer;border-radius:2px;">VER LOG COMPLETO</button>
  </div>`;
document.getElementById('today-slot').innerHTML = '';
document.getElementById('list-past').innerHTML = '';
const btn = document.getElementById('show-debug');
if (btn) btn.addEventListener('click', openDebugPanel);

// Auto-open debug panel on error for mobile visibility
openDebugPanel();
```

}
}

// =====================================================================
// ON-SCREEN DEBUG PANEL (mobile friendly — no console needed)
// =====================================================================
function ensureDebugPanel() {
let panel = document.getElementById(‘debug-panel’);
if (panel) return panel;
panel = document.createElement(‘div’);
panel.id = ‘debug-panel’;
panel.innerHTML = `<div class="dbg-head"> <span>DEBUG LOG · IRON LOG v${VERSION}</span> <div class="dbg-btns"> <button id="dbg-copy">COPIAR</button> <button id="dbg-retry">REINTENTAR</button> <button id="dbg-close">OCULTAR</button> </div> </div> <pre id="dbg-body"></pre>`;
document.body.appendChild(panel);
panel.querySelector(’#dbg-close’).addEventListener(‘click’, () => panel.classList.remove(‘open’));
panel.querySelector(’#dbg-retry’).addEventListener(‘click’, () => loadAll());
panel.querySelector(’#dbg-copy’).addEventListener(‘click’, async () => {
const txt = LOG_BUFFER.map(l => `[${l.ts}] [${l.tag.toUpperCase()}] ${l.text}`).join(’\n’);
try {
await navigator.clipboard.writeText(txt);
toast(‘Log copiado’);
} catch {
// Fallback: select the pre contents
const body = panel.querySelector(’#dbg-body’);
const range = document.createRange();
range.selectNodeContents(body);
const sel = window.getSelection();
sel.removeAllRanges();
sel.addRange(range);
toast(‘Selecciona y copia manualmente’, true);
}
});
return panel;
}

function renderDebugPanel() {
const panel = document.getElementById(‘debug-panel’);
if (!panel) return;
const body = panel.querySelector(’#dbg-body’);
if (!body) return;
body.textContent = LOG_BUFFER.map(l => `[${l.ts}] [${l.tag.toUpperCase()}] ${l.text}`).join(’\n’);
body.scrollTop = body.scrollHeight;
}

function openDebugPanel() {
const panel = ensureDebugPanel();
renderDebugPanel();
panel.classList.add(‘open’);
}

// =====================================================================
// INIT
// =====================================================================
function bootstrap() {
try {
log(‘info’, ‘bootstrap() · installGlobalHandlers + loadAll’);
installGlobalHandlers();
loadAll();
} catch (err) {
logErr(‘bootstrap’, err);
alert(’Error al arrancar Iron Log: ’ + err.message + ‘\nAbre la consola para más detalle.’);
}
}

if (document.readyState === ‘loading’) {
document.addEventListener(‘DOMContentLoaded’, bootstrap);
} else {
bootstrap();
}
