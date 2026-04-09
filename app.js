// =====================================================================
// CONFIG
// =====================================================================
const API_URL = 'https://script.google.com/macros/s/AKfycbyKyNW3TfVbTsiY8wvncQdyJeB5bOSCh3J5AcEuau4y5-Ue3sktdS7Tu0X7YX7CtZuM8w/exec';
const VERSION = '1.3.0';

// Chart.js theme palette (matches CSS vars)
const CHART_COLORS = {
  accent:   '#d4ff3a',
  progress: '#4af0ff',
  warn:     '#ffaa00',
  danger:   '#ff5544',
  skipped:  '#6a6863',
  ink:      '#f5f1e8',
  inkDim:   '#8a8680',
  inkFaint: '#4a4843',
  line:     '#262421',
  lineBright: '#363430',
};

// =====================================================================
// LOGGER
// =====================================================================
const LOG_STYLES = {
  boot:   'background:#d4ff3a;color:#000;font-weight:bold;padding:2px 8px;border-radius:2px',
  info:   'color:#4af0ff;font-weight:bold',
  ok:     'color:#d4ff3a;font-weight:bold',
  warn:   'color:#ffaa00;font-weight:bold',
  err:    'background:#ff5544;color:#000;font-weight:bold;padding:2px 8px;border-radius:2px',
  api:    'color:#8a9f1f;font-weight:bold',
  render: 'color:#888;font-style:italic',
  action: 'color:#4af0ff;font-weight:bold',
  runner: 'color:#4af0ff;font-weight:bold;font-style:italic',
  coach:  'color:#d4ff3a;font-weight:bold;font-style:italic',
  dash:   'color:#ffaa00;font-weight:bold',
  cal:    'color:#ffaa00;font-weight:bold;font-style:italic',
  muted:  'color:#666',
};

const LOG_BUFFER = [];
const LOG_MAX = 300;
function pushLog(tag, args) {
  const ts = new Date().toISOString().slice(11, 23);
  let text;
  try {
    text = args.map(a => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object') return JSON.stringify(a);
      return String(a);
    }).join(' ');
  } catch { text = '[unserializable]'; }
  LOG_BUFFER.push({ ts, tag, text });
  if (LOG_BUFFER.length > LOG_MAX) LOG_BUFFER.shift();
  if (typeof renderDebugPanel === 'function') renderDebugPanel();
}

function log(tag, ...args)   {
  console.log('%c[' + tag.toUpperCase() + ']', LOG_STYLES[tag] || LOG_STYLES.info, ...args);
  pushLog(tag, args);
}
function logGroup(tag, label) {
  console.groupCollapsed('%c[' + tag.toUpperCase() + ']', LOG_STYLES[tag] || LOG_STYLES.info, label);
  pushLog(tag, ['▼ ' + label]);
}
function logGroupEnd() { console.groupEnd(); }
function logErr(label, err) {
  console.group('%c[ERROR]', LOG_STYLES.err, label);
  console.error(err);
  if (err && err.stack) console.log('%cStack:', LOG_STYLES.muted, '\n' + err.stack);
  console.groupEnd();
  pushLog('err', [label + ':', (err && err.message) || err, (err && err.stack) ? '\n' + err.stack : '']);
}

window.addEventListener('error', e => {
  logErr('window.onerror', e.error || e.message);
  pushLog('err', ['window.onerror', e.message, 'at', e.filename + ':' + e.lineno + ':' + e.colno]);
});
window.addEventListener('unhandledrejection', e => logErr('unhandledrejection', e.reason));

console.log('%c IRON LOG ', LOG_STYLES.boot, `v${VERSION} · boot @ ${new Date().toISOString()}`);
log('info', 'API URL:', API_URL);
log('info', 'UserAgent:', navigator.userAgent);
log('info', 'Viewport:', window.innerWidth + 'x' + window.innerHeight);

// =====================================================================
// STATE
// =====================================================================
const state = {
  allWorkouts: [],   // full list (all statuses) — source of truth
  planned: [],       // derived: status Planeado
  past: [],          // derived: status Completado
  inProgress: {},
  edits: {},
  runner: null,
  // Mini calendar
  calendarMonth: null,   // Date pointing at first day of current viewed month
  // Dashboard
  dashboard: {
    rendered: false,
    charts: {}, // chartId → Chart instance (for destroy on re-render)
  },
};

// =====================================================================
// API
// =====================================================================
let callCounter = 0;
async function apiCall(action, params = {}, body = null) {
  const callId = ++callCounter;
  const t0 = performance.now();
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });

  logGroup('api', `#${callId} → ${action}`);
  log('api', 'URL:', url.toString());
  log('api', 'Method:', body ? 'POST' : 'GET');
  if (Object.keys(params).length) log('api', 'Query params:', params);
  if (body) log('api', 'Body:', body);

  const opts = body
    ? { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' }
    : { method: 'GET', redirect: 'follow' };

  try {
    let res;
    try {
      res = await fetch(url.toString(), opts);
    } catch (netErr) {
      log('err', 'Network/fetch failed:', netErr.message);
      logGroupEnd();
      throw new Error('Red/CORS: ' + netErr.message);
    }
    const ms = (performance.now() - t0).toFixed(0);
    log('api', `Response: HTTP ${res.status} ${res.statusText} (${ms}ms)`);

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
  } catch (err) {
    const ms = (performance.now() - t0).toFixed(0);
    log('err', `✗ Call #${callId} failed after ${ms}ms:`, err.message);
    logGroupEnd();
    throw err;
  }
}

// =====================================================================
// UTILS
// =====================================================================
const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTHS_ES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const WEEKDAYS_ES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function todayYMD() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
function parseYMD(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
function ymd(date) {
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
}
function formatDay(dateStr) {
  const d = parseYMD(dateStr);
  return {
    num: String(d.getDate()).padStart(2, '0'),
    month: MONTHS_ES[d.getMonth()] + ' ' + d.getFullYear(),
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
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function attrSafe(s) { return encodeURIComponent(String(s ?? '')); }
function attrDecode(s) { return decodeURIComponent(String(s ?? '')); }

function toast(msg, isErr = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('err', isErr);
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2800);
}

function applyInProgressOverlay(list) {
  list.forEach(w => {
    if (state.inProgress[workoutKey(w)]) {
      w.status = 'En Progreso';
      w.exercises.forEach(ex => ex.status = 'En Progreso');
    }
  });
}

// ISO week number (for weekly aggregation)
function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
// Monday of a given date (local)
function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  if (day !== 1) d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

// =====================================================================
// RENDER · PLANNED
// =====================================================================
function renderPlanned() {
  log('render', `renderPlanned() · ${state.planned.length} workouts`);
  document.getElementById('count-planned').textContent = state.planned.length;

  applyInProgressOverlay(state.planned);

  const today = todayYMD();
  const todayWorkouts = state.planned.filter(w => w.date === today);
  const todaySlot = document.getElementById('today-slot');
  const td = formatDay(today);

  if (todayWorkouts.length > 0) {
    todaySlot.innerHTML = `
      <div class="today-block">
        <div class="today-tag">Hoy · ${td.weekday} ${td.num} ${td.month}</div>
        ${todayWorkouts.map(w => renderWorkoutCard(w, 'planned')).join('')}
      </div>
    `;
  } else {
    todaySlot.innerHTML = `
      <div class="today-block">
        <div class="today-tag">Hoy · ${td.weekday} ${td.num} ${td.month}</div>
        <div class="today-rest">
          <div class="icon">Z Z Z</div>
          <h3>Día de descanso</h3>
          <p>Sin sesión programada · Recupera</p>
        </div>
      </div>
    `;
  }

  const list = document.getElementById('list-planned');
  const upcoming = state.planned.filter(w => w.date !== today);

  if (upcoming.length === 0) {
    list.innerHTML = '';
  } else {
    const groups = groupByDate(upcoming);
    groups.sort((a,b) => a.date.localeCompare(b.date));
    list.innerHTML = groups.map(g => {
      const d = formatDay(g.date);
      return `
        <div class="day-group">
          <div class="day-header">
            <div class="day-num">${d.num}</div>
            <div class="day-meta">
              <span class="day-month">${d.month}</span>
              <span class="day-weekday">${d.weekday}</span>
            </div>
          </div>
          ${g.workouts.map(w => renderWorkoutCard(w, 'planned')).join('')}
        </div>
      `;
    }).join('');
  }
}

// =====================================================================
// RENDER · PAST
// =====================================================================
function renderPast() {
  log('render', `renderPast() · ${state.past.length} workouts`);
  const list = document.getElementById('list-past');
  document.getElementById('count-past').textContent = state.past.length;

  if (state.past.length === 0) {
    list.innerHTML = `<div class="empty"><div class="big">00</div><p>Aún no hay entrenamientos completados en el historial.</p></div>`;
    return;
  }

  const groups = groupByDate(state.past);
  list.innerHTML = groups.map(g => {
    const d = formatDay(g.date);
    return `
      <div class="day-group">
        <div class="day-header">
          <div class="day-num">${d.num}</div>
          <div class="day-meta">
            <span class="day-month">${d.month}</span>
            <span class="day-weekday">${d.weekday}</span>
          </div>
        </div>
        ${g.workouts.map(w => renderWorkoutCard(w, 'past')).join('')}
      </div>
    `;
  }).join('');
}

// =====================================================================
// WORKOUT CARD
// =====================================================================
function renderWorkoutCard(w, mode) {
  const key = workoutKey(w);
  const status = w.status || 'Planeado';
  const exCount = w.exerciseCount || w.exercises.length;

  const exercises = w.exercises.map(ex => {
    const achievedHtml = (mode === 'past' && ex.achievedDetails)
      ? `<div class="ex-achieved"><span class="ex-label">Conseguido</span>${escapeHtml(ex.achievedDetails)}</div>`
      : '';
    return `
      <div class="exercise">
        <div class="ex-name">
          <span>${escapeHtml(ex.exercise)}</span>
          <span class="sets-reps">${ex.sets ?? '—'}×${escapeHtml(ex.reps) || '—'}</span>
        </div>
        <div><span class="ex-label">Objetivo</span><span class="ex-target">${escapeHtml(ex.targetDetails) || '—'}</span></div>
        ${achievedHtml}
        ${ex.notes ? `<div class="ex-notes">"${escapeHtml(ex.notes)}"</div>` : ''}
      </div>
    `;
  }).join('');

  let actions = '';
  if (mode === 'planned') {
    if (status === 'En Progreso') {
      actions = `
        <div class="actions">
          <button class="btn primary" data-action="resume" data-key="${attrSafe(key)}">▶ Continuar sesión</button>
        </div>
      `;
    } else {
      actions = `
        <div class="actions">
          <button class="btn primary" data-action="start" data-key="${attrSafe(key)}">▶ Iniciar</button>
          <button class="btn ghost" data-action="skip" data-key="${attrSafe(key)}">Saltar</button>
        </div>
      `;
    }
  }

  return `
    <article class="workout" data-status="${escapeHtml(status)}" data-key="${attrSafe(key)}">
      <div class="workout-head" data-toggle>
        <div>
          <h3>${escapeHtml(w.routine)}</h3>
          <div class="meta">
            <span>${exCount} ejercicios</span>
            <span>${escapeHtml(status)}</span>
          </div>
        </div>
        <div class="chevron">▾</div>
      </div>
      <div class="workout-body">
        <div class="exercises">${exercises}</div>
        ${actions}
      </div>
    </article>
  `;
}

function findWorkoutByKey(key) {
  return state.planned.find(w => workoutKey(w) === key)
      || state.past.find(w => workoutKey(w) === key)
      || state.allWorkouts.find(w => workoutKey(w) === key);
}

// =====================================================================
// GLOBAL HANDLERS
// =====================================================================
function installGlobalHandlers() {
  log('info', 'installGlobalHandlers · delegation listeners attached');

  // -------- TABS --------
  const tabsRoot = document.querySelector('nav.tabs');
  if (tabsRoot) {
    tabsRoot.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-view]');
      if (!btn) return;
      log('info', 'Tab switch →', btn.dataset.view);
      tabsRoot.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      const view = document.getElementById('view-' + btn.dataset.view);
      if (view) view.classList.add('active');

      // Lazy-render dashboard on first entry (and re-render if not yet done)
      if (btn.dataset.view === 'dashboard') {
        renderDashboard();
      }
      // Re-render del calendario al abrir su tab (por si los datos han cambiado)
      if (btn.dataset.view === 'calendar') {
        renderMiniCalendar();
      }
    });
  }

  // -------- RUNNER CONTROLS --------
  if (dom.close) {
    dom.close.addEventListener('click', () => {
      if (confirm('¿Salir de la sesión? Los cambios guardados se mantienen.')) closeRunner();
    });
  }
  if (dom.prev) {
    dom.prev.addEventListener('click', () => {
      if (!state.runner) return;
      goToSlide(state.runner.currentIndex - 1);
    });
  }
  if (dom.next) {
    dom.next.addEventListener('click', () => {
      if (!state.runner) return;
      goToSlide(state.runner.currentIndex + 1);
    });
  }

  document.addEventListener('keydown', (e) => {
    const runner = dom.runner;
    if (!runner || !runner.classList.contains('open')) return;
    if (e.key === 'Escape') closeRunner();
    if (e.key === 'ArrowRight') goToSlide(state.runner.currentIndex + 1);
    if (e.key === 'ArrowLeft') goToSlide(state.runner.currentIndex - 1);
  });

  const statusbar = document.querySelector('.statusbar');
  if (statusbar) {
    statusbar.style.cursor = 'pointer';
    statusbar.addEventListener('click', () => openDebugPanel());
  }

  // -------- MINI CALENDAR NAV --------
  const calPrev = document.getElementById('mini-cal-prev');
  const calNext = document.getElementById('mini-cal-next');
  if (calPrev) calPrev.addEventListener('click', () => {
    state.calendarMonth.setMonth(state.calendarMonth.getMonth() - 1);
    renderMiniCalendar();
  });
  if (calNext) calNext.addEventListener('click', () => {
    state.calendarMonth.setMonth(state.calendarMonth.getMonth() + 1);
    renderMiniCalendar();
  });

  // -------- CARD CLICKS --------
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn[data-action]');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const action = btn.dataset.action;
      const key = attrDecode(btn.dataset.key);
      if (btn.disabled) return;

      const workout = findWorkoutByKey(key);
      if (!workout) {
        toast('No se encuentra el entrenamiento', true);
        return;
      }

      btn.disabled = true;
      try {
        if (action === 'start' || action === 'resume') {
          openRunner(workout);
        } else if (action === 'skip') {
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

    const head = e.target.closest('.workout-head[data-toggle]');
    if (head) {
      const card = head.closest('.workout');
      if (card) card.classList.toggle('open');
      return;
    }

    // Mini-calendar day click → jump to workout tab if that day has a workout
    const calDay = e.target.closest('.mc-day.has-workout');
    if (calDay && calDay.dataset.date) {
      const date = calDay.dataset.date;
      const w = state.allWorkouts.find(w => w.date === date);
      if (w) {
        const targetTab = (w.status === 'Completado') ? 'past' : 'planned';
        const tabBtn = document.querySelector(`nav.tabs button[data-view="${targetTab}"]`);
        if (tabBtn) tabBtn.click();
        setTimeout(() => {
          const card = document.querySelector(`.workout[data-key="${attrSafe(workoutKey(w))}"]`);
          if (card) {
            card.classList.add('open');
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 120);
      }
      return;
    }
  });
}

// =====================================================================
// MARK STATUS
// =====================================================================
async function markWorkoutStatus(w, status) {
  log('action', `markWorkoutStatus: ${w.date} / ${w.routine} → ${status}`);
  await apiCall('updateWorkout', {}, {
    match: { date: w.date, routine: w.routine },
    updates: { status },
  });
  delete state.inProgress[workoutKey(w)];
  toast(`Marcado como ${status}`);
  await loadAll();
}

// =====================================================================
// RUNNER
// =====================================================================
function $(id) {
  const el = document.getElementById(id);
  if (!el) log('warn', `#${id} no existe en el DOM`);
  return el;
}
const dom = {
  get runner()        { return $('runner'); },
  get track()         { return $('runner-track'); },
  get routine()       { return $('runner-routine'); },
  get progress()      { return $('runner-progress'); },
  get barFill()       { return $('runner-bar-fill'); },
  get dots()          { return $('runner-dots'); },
  get prev()          { return $('runner-prev'); },
  get next()          { return $('runner-next'); },
  get close()         { return $('runner-close'); },
};

function openRunner(workout) {
  log('runner', `openRunner: ${workout.date} / ${workout.routine}`);
  const key = workoutKey(workout);
  state.inProgress[key] = true;
  workout.status = 'En Progreso';
  workout.exercises.forEach(ex => ex.status = 'En Progreso');

  state.runner = { workout, currentIndex: 0, notes: '' };

  dom.routine.textContent = workout.routine;
  buildRunnerSlides();
  dom.runner.classList.add('open');
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => {
    dom.track.scrollLeft = 0;
    updateRunnerUI(0);
  });
}

function closeRunner() {
  dom.runner.classList.remove('open');
  document.body.style.overflow = '';
  state.runner = null;
}

function buildRunnerSlides() {
  const { workout } = state.runner;
  const total = workout.exercises.length;

  const exerciseSlides = workout.exercises.map((ex, i) => {
    const editVal = state.edits[ex.rowNumber] ?? ex.achievedDetails ?? '';
    return `
      <div class="slide" data-slide-index="${i}" data-row="${ex.rowNumber}">
        <div class="slide-eyebrow"><b>EJ ${String(i+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}</b> · ${escapeHtml(workout.routine)}</div>
        <h2 class="slide-title">${escapeHtml(ex.exercise)}</h2>

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
  }).join('');

  const summarySlide = `
    <div class="slide summary" data-slide-index="${total}" data-summary>
      <div class="slide-eyebrow"><b>RESUMEN</b> · ${escapeHtml(workout.routine)}</div>
      <h2 class="slide-title">Cierra la sesión</h2>
      <ul class="summary-list" id="summary-list"></ul>

      <div class="summary-notes-block">
        <label for="summary-notes">Notas de la sesión</label>
        <textarea id="summary-notes" placeholder="Cómo te has sentido, energía, conexión mente-músculo, observaciones…">${escapeHtml(state.runner.notes || '')}</textarea>
      </div>

      <div class="summary-actions">
        <button class="btn primary" id="btn-complete-workout">✓ Completar entrenamiento</button>
        <button class="btn danger" id="btn-fail-workout">Marcar como fallido</button>
      </div>
    </div>
  `;

  dom.track.innerHTML = exerciseSlides + summarySlide;

  const totalSlides = total + 1;
  dom.dots.innerHTML = Array.from({length: totalSlides}, (_, i) =>
    `<div class="runner-dot" data-dot="${i}"></div>`
  ).join('');

  dom.track.querySelectorAll('.ex-runner-input').forEach(inp => {
    inp.addEventListener('input', e => {
      const row = e.target.dataset.row;
      state.edits[row] = e.target.value;
    });
  });

  const notesEl = dom.track.querySelector('#summary-notes');
  if (notesEl) {
    notesEl.addEventListener('input', e => {
      state.runner.notes = e.target.value;
    });
  }

  const completeBtn = dom.track.querySelector('#btn-complete-workout');
  if (completeBtn) completeBtn.addEventListener('click', () => completeWorkoutFromRunner());
  const failBtn = dom.track.querySelector('#btn-fail-workout');
  if (failBtn) failBtn.addEventListener('click', () => failWorkoutFromRunner());

  let scrollTimeout = null;
  dom.track.addEventListener('scroll', () => {
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

  if (newIdx > oldIdx && oldIdx < state.runner.workout.exercises.length) {
    const leavingEx = state.runner.workout.exercises[oldIdx];
    persistExercise(leavingEx).catch(err => {
      logErr('persistExercise', err);
      toast('Error guardando: ' + err.message, true);
    });
  }

  state.runner.currentIndex = newIdx;
  updateRunnerUI(newIdx);

  if (newIdx === state.runner.workout.exercises.length) {
    buildSummaryList();
  }
}

async function persistExercise(ex) {
  const achieved = state.edits[ex.rowNumber];
  if (achieved === undefined || achieved === '') return;
  await apiCall('updateExercise', {}, {
    match: { rowNumber: ex.rowNumber },
    updates: { achievedDetails: achieved },
  });
  ex.achievedDetails = achieved;
  toast('✓ Guardado');
}

function updateRunnerUI(idx) {
  const total = state.runner.workout.exercises.length;
  const totalSlides = total + 1;

  if (idx < total) {
    dom.progress.textContent = `Ejercicio ${idx + 1} / ${total}`;
  } else {
    dom.progress.textContent = `Resumen final`;
  }

  const pct = ((idx) / (totalSlides - 1)) * 100;
  dom.barFill.style.width = pct + '%';

  dom.dots.querySelectorAll('.runner-dot').forEach((d, i) => {
    d.classList.toggle('active', i === idx);
    d.classList.toggle('done', i < idx);
  });

  dom.prev.disabled = idx === 0;
  if (idx === totalSlides - 1) {
    dom.next.style.visibility = 'hidden';
  } else {
    dom.next.style.visibility = 'visible';
    dom.next.textContent = (idx === total - 1) ? 'Resumen ›' : 'Siguiente ›';
  }
}

function goToSlide(idx) {
  const total = state.runner.workout.exercises.length;
  const max = total;
  idx = Math.max(0, Math.min(idx, max));
  dom.track.scrollTo({ left: idx * dom.track.clientWidth, behavior: 'smooth' });
}

function buildSummaryList() {
  const { workout } = state.runner;
  const ul = document.getElementById('summary-list');
  if (!ul) return;
  ul.innerHTML = workout.exercises.map(ex => {
    const edited = state.edits[ex.rowNumber];
    const achieved = (edited !== undefined && edited !== '') ? edited : (ex.achievedDetails || '');
    const matchedTarget = !achieved;
    const display = matchedTarget
      ? `<span class="matched">= objetivo</span>`
      : `<span class="target">${escapeHtml(ex.targetDetails) || '—'}</span><span class="achieved">${escapeHtml(achieved)}</span>`;
    return `
      <li class="summary-row">
        <div class="name">${escapeHtml(ex.exercise)}<br><span style="font-family:var(--mono);font-size:10px;color:var(--ink-faint);font-weight:400;">${ex.sets ?? '—'}×${escapeHtml(ex.reps) || '—'}</span></div>
        <div class="vals">${display}</div>
      </li>
    `;
  }).join('');
}

async function completeWorkoutFromRunner() {
  if (!state.runner) return;
  const { workout, notes } = state.runner;

  const completeBtn = document.getElementById('btn-complete-workout');
  const failBtn = document.getElementById('btn-fail-workout');
  if (completeBtn) completeBtn.disabled = true;
  if (failBtn) failBtn.disabled = true;

  toast('Guardando entrenamiento…');

  try {
    let updated = 0;
    for (const ex of workout.exercises) {
      const edited = state.edits[ex.rowNumber];
      const finalAchieved = (edited !== undefined && edited !== '')
        ? edited
        : (ex.achievedDetails || ex.targetDetails || '');

      const updates = {
        achievedDetails: finalAchieved,
        status: 'Completado',
      };
      if (updated === 0 && notes && notes.trim()) {
        updates.notes = ex.notes ? `${ex.notes} | ${notes.trim()}` : notes.trim();
      }

      await apiCall('updateExercise', {}, {
        match: { rowNumber: ex.rowNumber },
        updates,
      });
      delete state.edits[ex.rowNumber];
      updated++;
    }
    delete state.inProgress[workoutKey(workout)];
    toast(`✓ Sesión completada`);
    closeRunner();
    await loadAll();
  } catch (err) {
    logErr('completeWorkoutFromRunner', err);
    toast(err.message, true);
    if (completeBtn) completeBtn.disabled = false;
    if (failBtn) failBtn.disabled = false;
  }
}

async function failWorkoutFromRunner() {
  if (!state.runner) return;
  const { workout } = state.runner;
  const completeBtn = document.getElementById('btn-complete-workout');
  const failBtn = document.getElementById('btn-fail-workout');
  if (completeBtn) completeBtn.disabled = true;
  if (failBtn) failBtn.disabled = true;
  try {
    await markWorkoutStatus(workout, 'Fallido');
    closeRunner();
  } catch (err) {
    if (completeBtn) completeBtn.disabled = false;
    if (failBtn) failBtn.disabled = false;
  }
}

// =====================================================================
// MINI CALENDAR
// =====================================================================
function initMiniCalendar() {
  if (!state.calendarMonth) {
    const now = new Date();
    state.calendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

// Map: date (YMD) → best status to display (priority order)
function buildCalendarStatusMap() {
  const map = {};
  const priority = { 'En Progreso': 5, 'Completado': 4, 'Fallido': 3, 'Planeado': 2, 'Saltado': 1 };
  state.allWorkouts.forEach(w => {
    const key = w.date;
    // apply in-progress overlay
    const status = state.inProgress[workoutKey(w)] ? 'En Progreso' : w.status;
    if (!map[key] || (priority[status] || 0) > (priority[map[key].status] || 0)) {
      map[key] = { status, routine: w.routine };
    }
  });
  return map;
}

function statusCssClass(status) {
  switch (status) {
    case 'Completado':   return 'done';
    case 'Planeado':     return 'planned';
    case 'Fallido':      return 'failed';
    case 'Saltado':      return 'skipped';
    case 'En Progreso':  return 'in-progress';
    default:             return '';
  }
}

function renderMiniCalendar() {
  initMiniCalendar();
  const grid = document.getElementById('mini-cal-grid');
  const monthLabel = document.getElementById('mini-cal-month');
  const yearLabel = document.getElementById('mini-cal-year');
  if (!grid) return;

  const viewed = state.calendarMonth;
  const year = viewed.getFullYear();
  const month = viewed.getMonth();

  monthLabel.textContent = MONTHS_ES_FULL[month];
  yearLabel.textContent = year;

  const statusMap = buildCalendarStatusMap();
  const today = todayYMD();

  // First day of month, aligned to Monday-first week
  const firstDay = new Date(year, month, 1);
  let leadingEmpty = firstDay.getDay() - 1; // 0 = Mon
  if (leadingEmpty < 0) leadingEmpty = 6;   // Sunday → 6

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < leadingEmpty; i++) {
    cells.push(`<div class="mc-day empty"></div>`);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = ymd(new Date(year, month, d));
    const info = statusMap[dateStr];
    const isToday = dateStr === today;
    const isFuture = dateStr > today;
    const cls = [];
    if (info) {
      cls.push('has-workout');
      cls.push(statusCssClass(info.status));
    } else if (isFuture) {
      cls.push('future');
    }
    if (isToday) cls.push('today');
    const title = info ? `${dateStr} · ${info.routine} (${info.status})` : dateStr;
    cells.push(`<div class="mc-day ${cls.join(' ')}" data-date="${dateStr}" title="${escapeHtml(title)}">${d}</div>`);
  }

  // Trailing to complete the last week
  const totalCells = leadingEmpty + daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < trailing; i++) {
    cells.push(`<div class="mc-day empty"></div>`);
  }

  grid.innerHTML = cells.join('');
  log('cal', `renderMiniCalendar · ${MONTHS_ES_FULL[month]} ${year} · ${Object.keys(statusMap).length} días con workout`);
}

// =====================================================================
// DASHBOARD · KPIs + Charts
// =====================================================================
function computeDashboardData() {
  const all = state.allWorkouts;
  const today = todayYMD();

  const past = all.filter(w => w.status === 'Completado');
  const future = all.filter(w => w.status === 'Planeado' && w.date > today);
  const overdue = all.filter(w => w.status === 'Planeado' && w.date <= today);
  const failed = all.filter(w => w.status === 'Fallido');
  const skipped = all.filter(w => w.status === 'Saltado');

  // Adherence rate: completed / (completed + failed + skipped + overdue planned)
  const accountable = past.length + failed.length + skipped.length + overdue.length;
  const rate = accountable > 0 ? Math.round((past.length / accountable) * 100) : 0;

  // Weekly buckets (last 12 weeks, Monday-based, LOCAL time)
  const weeks = [];
  const thisMonday = mondayOf(new Date());
  for (let i = 11; i >= 0; i--) {
    const monday = new Date(thisMonday);
    monday.setDate(monday.getDate() - i * 7);
    const weekKey = ymd(monday);
    weeks.push({
      monday,
      key: weekKey,
      label: `${String(monday.getDate()).padStart(2,'0')} ${MONTHS_ES[monday.getMonth()]}`,
      count: 0,
    });
  }
  past.forEach(w => {
    const d = parseYMD(w.date);
    const wMonday = mondayOf(d);
    const key = ymd(wMonday);
    const bucket = weeks.find(b => b.key === key);
    if (bucket) bucket.count += 1;
  });

  // Current streak: consecutive weeks (up to and including current) with ≥1 completed
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].count > 0) streak++;
    else break;
  }

  // This week count
  const thisWeekKey = ymd(thisMonday);
  const thisWeek = weeks.find(b => b.key === thisWeekKey);
  const thisWeekCount = thisWeek ? thisWeek.count : 0;

  // Average per week over last 12 weeks
  const avg = weeks.reduce((a, b) => a + b.count, 0) / weeks.length;

  // Total exercises across all rows
  const totalExercises = all.reduce((a, w) => a + (w.exercises ? w.exercises.length : 0), 0);

  // By routine (all statuses)
  const byRoutine = {};
  all.forEach(w => {
    if (!byRoutine[w.routine]) byRoutine[w.routine] = 0;
    byRoutine[w.routine] += 1;
  });
  const routinesSorted = Object.entries(byRoutine)
    .sort((a, b) => b[1] - a[1]);

  // By status
  const byStatus = {
    'Completado': past.length,
    'Planeado': overdue.length + future.length,
    'Fallido': failed.length,
    'Saltado': skipped.length,
  };

  return {
    totals: {
      completed: past.length,
      rate,
      streak,
      thisWeekCount,
      totalExercises,
      avg,
    },
    weeks,
    routines: routinesSorted,
    status: byStatus,
  };
}

function renderDashboard() {
  if (typeof Chart === 'undefined') {
    log('warn', 'Chart.js no cargado, reintentando en 250ms');
    setTimeout(renderDashboard, 250);
    return;
  }

  const data = computeDashboardData();
  log('dash', 'renderDashboard · KPIs:', data.totals);

  // ---- KPI cards ----
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('kpi-completed', data.totals.completed);
  setText('kpi-completed-sub', `${data.totals.completed === 1 ? 'sesión completada' : 'sesiones completadas'}`);
  setText('kpi-rate', data.totals.rate + '%');
  setText('kpi-streak', data.totals.streak);
  setText('kpi-streak-sub', data.totals.streak === 1 ? 'semana consecutiva' : 'semanas consecutivas');
  setText('kpi-week', data.totals.thisWeekCount);
  setText('kpi-week-sub', data.totals.thisWeekCount === 1 ? 'entrenamiento' : 'entrenamientos');
  setText('kpi-exercises', data.totals.totalExercises);
  setText('kpi-avg', data.totals.avg.toFixed(1));

  // ---- Charts ----
  const charts = state.dashboard.charts;

  // Shared theme tweaks
  Chart.defaults.color = CHART_COLORS.inkDim;
  Chart.defaults.font.family = "'JetBrains Mono', ui-monospace, monospace";
  Chart.defaults.font.size = 10;
  Chart.defaults.borderColor = CHART_COLORS.line;

  // --- Weekly bars ---
  const weeklyCanvas = document.getElementById('chart-weekly');
  if (weeklyCanvas) {
    if (charts.weekly) charts.weekly.destroy();
    charts.weekly = new Chart(weeklyCanvas, {
      type: 'bar',
      data: {
        labels: data.weeks.map(w => w.label),
        datasets: [{
          label: 'Sesiones',
          data: data.weeks.map(w => w.count),
          backgroundColor: data.weeks.map((w, i) =>
            i === data.weeks.length - 1 ? CHART_COLORS.progress : CHART_COLORS.accent
          ),
          borderRadius: 3,
          borderSkipped: false,
          maxBarThickness: 34,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0a0a0a',
            borderColor: CHART_COLORS.lineBright,
            borderWidth: 1,
            titleColor: CHART_COLORS.ink,
            bodyColor: CHART_COLORS.accent,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: ctx => `${ctx.parsed.y} ${ctx.parsed.y === 1 ? 'sesión' : 'sesiones'}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: CHART_COLORS.inkFaint, maxRotation: 0, autoSkip: true, autoSkipPadding: 8 },
            border: { color: CHART_COLORS.line },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: CHART_COLORS.inkFaint,
              stepSize: 1,
              precision: 0,
            },
            grid: { color: CHART_COLORS.line },
            border: { display: false },
          },
        },
      },
    });
  }

  // --- Routines doughnut ---
  const routinesCanvas = document.getElementById('chart-routines');
  if (routinesCanvas) {
    if (charts.routines) charts.routines.destroy();
    const palette = [
      CHART_COLORS.accent,
      CHART_COLORS.progress,
      CHART_COLORS.warn,
      '#8a9f1f',
      '#6ff5ff',
      '#e08a00',
      CHART_COLORS.danger,
      CHART_COLORS.skipped,
    ];
    charts.routines = new Chart(routinesCanvas, {
      type: 'doughnut',
      data: {
        labels: data.routines.map(r => r[0] || '—'),
        datasets: [{
          data: data.routines.map(r => r[1]),
          backgroundColor: data.routines.map((_, i) => palette[i % palette.length]),
          borderColor: '#0a0a0a',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: CHART_COLORS.inkDim,
              boxWidth: 10,
              boxHeight: 10,
              padding: 10,
              font: { size: 10 },
            },
          },
          tooltip: {
            backgroundColor: '#0a0a0a',
            borderColor: CHART_COLORS.lineBright,
            borderWidth: 1,
            titleColor: CHART_COLORS.ink,
            bodyColor: CHART_COLORS.accent,
            padding: 10,
          },
        },
      },
    });
  }

  // --- Status horizontal bars ---
  const statusCanvas = document.getElementById('chart-status');
  if (statusCanvas) {
    if (charts.status) charts.status.destroy();
    const statusLabels = ['Completado', 'Planeado', 'Fallido', 'Saltado'];
    const statusColors = [CHART_COLORS.accent, CHART_COLORS.warn, CHART_COLORS.danger, CHART_COLORS.skipped];
    charts.status = new Chart(statusCanvas, {
      type: 'bar',
      data: {
        labels: statusLabels,
        datasets: [{
          data: statusLabels.map(l => data.status[l] || 0),
          backgroundColor: statusColors,
          borderRadius: 3,
          borderSkipped: false,
          maxBarThickness: 26,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0a0a0a',
            borderColor: CHART_COLORS.lineBright,
            borderWidth: 1,
            titleColor: CHART_COLORS.ink,
            bodyColor: CHART_COLORS.accent,
            padding: 10,
            displayColors: false,
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { color: CHART_COLORS.inkFaint, stepSize: 1, precision: 0 },
            grid: { color: CHART_COLORS.line },
            border: { display: false },
          },
          y: {
            ticks: { color: CHART_COLORS.ink, font: { size: 11 } },
            grid: { display: false },
            border: { color: CHART_COLORS.line },
          },
        },
      },
    });
  }

  state.dashboard.rendered = true;
}

// =====================================================================
// LOAD
// =====================================================================
async function loadAll() {
  logGroup('info', 'loadAll()');
  const t0 = performance.now();

  document.getElementById('list-planned').innerHTML = `<div class="loading">Cargando planeados</div>`;
  document.getElementById('today-slot').innerHTML = '';
  document.getElementById('list-past').innerHTML = `<div class="loading">Cargando historial</div>`;

  try {
    const dot = document.getElementById('api-dot');
    const st = document.getElementById('api-status');

    // Single source of truth: all workouts, no status filter
    const all = await apiCall('getWorkouts', { sort: 'date_asc' });
    log('ok', `Recibidos ${all.length} workouts (todos los estados)`);

    state.allWorkouts = all;
    // Derived lists
    state.planned = all
      .filter(w => w.status === 'Planeado')
      .sort((a, b) => a.date.localeCompare(b.date));
    state.past = all
      .filter(w => w.status === 'Completado')
      .sort((a, b) => b.date.localeCompare(a.date));

    dot.classList.add('ok');
    dot.classList.remove('err');
    st.textContent = 'Conectado';
    document.getElementById('last-sync').textContent = 'Sync ' + new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});

    renderPlanned();
    renderPast();
    renderMiniCalendar();

    // Re-render dashboard if it was already shown
    if (state.dashboard.rendered) {
      renderDashboard();
    }

    const ms = (performance.now() - t0).toFixed(0);
    log('ok', `loadAll completado en ${ms}ms`);
    logGroupEnd();
  } catch (err) {
    logGroupEnd();
    logErr('loadAll', err);
    const dot = document.getElementById('api-dot');
    const st = document.getElementById('api-status');
    const sync = document.getElementById('last-sync');
    dot.classList.add('err');
    dot.classList.remove('ok');
    st.textContent = 'ERROR';
    if (sync) sync.textContent = (err && err.message ? err.message : String(err)).slice(0, 80);

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

    openDebugPanel();
  }
}

// =====================================================================
// DEBUG PANEL
// =====================================================================
function ensureDebugPanel() {
  let panel = document.getElementById('debug-panel');
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.innerHTML = `
    <div class="dbg-head">
      <span>DEBUG LOG · IRON LOG v${VERSION}</span>
      <div class="dbg-btns">
        <button id="dbg-copy">COPIAR</button>
        <button id="dbg-retry">REINTENTAR</button>
        <button id="dbg-close">OCULTAR</button>
      </div>
    </div>
    <pre id="dbg-body"></pre>
  `;
  document.body.appendChild(panel);
  panel.querySelector('#dbg-close').addEventListener('click', () => panel.classList.remove('open'));
  panel.querySelector('#dbg-retry').addEventListener('click', () => loadAll());
  panel.querySelector('#dbg-copy').addEventListener('click', async () => {
    const txt = LOG_BUFFER.map(l => `[${l.ts}] [${l.tag.toUpperCase()}] ${l.text}`).join('\n');
    try {
      await navigator.clipboard.writeText(txt);
      toast('Log copiado');
    } catch {
      const body = panel.querySelector('#dbg-body');
      const range = document.createRange();
      range.selectNodeContents(body);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      toast('Selecciona y copia manualmente', true);
    }
  });
  return panel;
}

function renderDebugPanel() {
  const panel = document.getElementById('debug-panel');
  if (!panel) return;
  const body = panel.querySelector('#dbg-body');
  if (!body) return;
  body.textContent = LOG_BUFFER.map(l => `[${l.ts}] [${l.tag.toUpperCase()}] ${l.text}`).join('\n');
  body.scrollTop = body.scrollHeight;
}

function openDebugPanel() {
  const panel = ensureDebugPanel();
  renderDebugPanel();
  panel.classList.add('open');
}

// =============================================================
// COACH VIRTUAL
// =============================================================
state.coach = {
  loaded: false,
  messages: [],
  sending: false,
  open: false,
};

function coachDom() {
  return {
    overlay: document.getElementById('coach-overlay'),
    backdrop: document.getElementById('coach-backdrop'),
    fab: document.getElementById('coach-fab'),
    closeBtn: document.getElementById('coach-close'),
    list: document.getElementById('coach-messages'),
    form: document.getElementById('coach-composer'),
    input: document.getElementById('coach-input'),
    send: document.getElementById('coach-send'),
    clear: document.getElementById('coach-clear'),
  };
}

function openCoach() {
  const { overlay, input } = coachDom();
  if (!overlay || state.coach.open) return;
  state.coach.open = true;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('coach-open');

  if (!state.coach.loaded) {
    loadCoachHistory();
  } else {
    requestAnimationFrame(() => {
      const { list } = coachDom();
      if (list) list.scrollTop = list.scrollHeight;
    });
  }

  setTimeout(() => {
    if (input && window.innerWidth > 640) input.focus();
  }, 320);
}

function closeCoach() {
  const { overlay } = coachDom();
  if (!overlay || !state.coach.open) return;
  state.coach.open = false;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('coach-open');
}

function toggleCoach() {
  if (state.coach.open) closeCoach();
  else openCoach();
}

async function loadCoachHistory() {
  if (state.coach.loaded) return;
  const { list } = coachDom();
  if (!list) return;
  list.innerHTML = `<div class="loading">Cargando conversación</div>`;
  try {
    const history = await apiCall('getChatHistory', { limit: 100 });
    state.coach.messages = history || [];
    state.coach.loaded = true;
    renderCoachMessages();
  } catch (err) {
    logErr('loadCoachHistory', err);
    list.innerHTML = `<div class="error-box">Error cargando chat: ${escapeHtml(err.message)}</div>`;
  }
}

function renderCoachMessages() {
  const { list } = coachDom();
  if (!list) return;
  const msgs = state.coach.messages;

  if (!msgs.length) {
    list.innerHTML = `
      <div class="coach-empty">
        <div class="big">01</div>
        <p>Pregunta al coach. Puede consultar tus datos y proponer cambios en la rutina.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = msgs.map((m, idx) => renderMessage(m, idx)).join('');
  requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
  });
}

function renderMessage(m, idx) {
  const isUser = m.author === 'User';
  const label = isUser ? 'Tú' : 'Coach';
  const cls = isUser ? 'user' : 'trainer';
  const text = escapeHtml(m.message || '');

  let proposalsHtml = '';
  if (!isUser && m.metadata && Array.isArray(m.metadata.proposedActions) && m.metadata.proposedActions.length > 0) {
    proposalsHtml = renderProposals(m.metadata, idx, m.rowNumber);
  }

  return `
    <div class="msg ${cls}" data-idx="${idx}">
      <span class="msg-label">${label}</span>
      <div class="msg-text">${text}</div>
      ${proposalsHtml}
    </div>
  `;
}

function renderProposals(metadata, msgIdx, chatRowNumber) {
  const applied = !!metadata.applied;
  const discarded = !!metadata.discarded;
  const stateClass = applied ? 'applied' : (discarded ? 'discarded' : '');

  const items = metadata.proposedActions.map(p => {
    const summary = summarizeProposal(p);
    return `
      <div class="proposal">
        <span class="proposal-type">${summary.type}</span>
        <div class="proposal-summary">${summary.title}</div>
        ${summary.details ? `<ul>${summary.details.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>` : ''}
        ${p.args.reason ? `<div class="proposal-reason">"${escapeHtml(p.args.reason)}"</div>` : ''}
      </div>
    `;
  }).join('');

  const actionsHtml = (applied || discarded) ? '' : `
    <div class="proposal-actions">
      <button class="apply" data-coach-apply="${msgIdx}" data-chat-row="${chatRowNumber || ''}">✓ Aplicar cambios</button>
      <button class="discard" data-coach-discard="${msgIdx}">✗ Descartar</button>
    </div>
  `;

  return `
    <div class="msg-proposals ${stateClass}">
      <div class="msg-proposals-title">Propuestas de cambio (${metadata.proposedActions.length})</div>
      ${items}
      ${actionsHtml}
    </div>
  `;
}

function summarizeProposal(p) {
  const a = p.args || {};
  switch (p.tool) {
    case 'propose_create_workout': {
      const details = (a.exercises || []).map(ex =>
        `${ex.exercise} · ${ex.sets}×${ex.reps} · ${ex.targetDetails || '—'}`
      );
      return {
        type: 'Crear entrenamiento',
        title: `${a.routine || '—'} · ${a.date || '—'}`,
        details,
      };
    }
    case 'propose_update_exercise': {
      const updates = a.updates || {};
      const details = Object.keys(updates).map(k => `${k}: ${updates[k]}`);
      return {
        type: 'Modificar ejercicio',
        title: `Fila ${a.rowNumber}`,
        details,
      };
    }
    case 'propose_update_workout': {
      const updates = a.updates || {};
      const details = Object.keys(updates).map(k => `${k}: ${updates[k]}`);
      return {
        type: 'Modificar entrenamiento',
        title: `${a.routine || '—'} · ${a.date || '—'}`,
        details,
      };
    }
    case 'propose_delete_workout':
      return {
        type: 'Borrar entrenamiento',
        title: `${a.routine || '—'} · ${a.date || '—'}`,
        details: null,
      };
    default:
      return { type: p.tool, title: JSON.stringify(a), details: null };
  }
}

async function sendCoachMessage(text) {
  if (!text || !text.trim() || state.coach.sending) return;
  const msg = text.trim();

  state.coach.sending = true;
  const { input, send, list } = coachDom();
  input.value = '';
  input.style.height = 'auto';
  send.disabled = true;

  state.coach.messages.push({
    author: 'User',
    message: msg,
    timestamp: new Date().toISOString(),
    metadata: null,
  });
  renderCoachMessages();

  const typingEl = document.createElement('div');
  typingEl.className = 'typing';
  typingEl.innerHTML = '<span></span><span></span><span></span>';
  list.appendChild(typingEl);
  list.scrollTop = list.scrollHeight;

  try {
    await apiCall('sendChatMessage', {}, { message: msg });
    await loadCoachHistoryForce();
  } catch (err) {
    logErr('sendCoachMessage', err);
    state.coach.messages.push({
      author: 'Trainer',
      message: 'Error: ' + err.message,
      timestamp: new Date().toISOString(),
      metadata: null,
    });
    renderCoachMessages();
    toast('Error enviando mensaje', true);
  } finally {
    state.coach.sending = false;
    send.disabled = false;
    input.focus();
  }
}

async function loadCoachHistoryForce() {
  state.coach.loaded = false;
  await loadCoachHistory();
}

async function applyProposalAt(msgIdx) {
  const m = state.coach.messages[msgIdx];
  if (!m || !m.metadata || !Array.isArray(m.metadata.proposedActions)) return;
  if (!confirm(`¿Aplicar ${m.metadata.proposedActions.length} cambio(s) a la rutina?`)) return;

  try {
    const res = await apiCall('confirmActions', {}, {
      actions: m.metadata.proposedActions,
      chatRowNumber: m.rowNumber,
    });
    const errors = (res.results || []).filter(r => !r.ok);
    if (errors.length > 0) {
      toast(`${errors.length} error(es) al aplicar`, true);
      errors.forEach(e => log('err', 'Propuesta fallida:', e));
    } else {
      toast(`✓ ${res.executed} cambio(s) aplicado(s)`);
    }
    m.metadata.applied = true;
    renderCoachMessages();
    await loadAll();
  } catch (err) {
    logErr('applyProposalAt', err);
    toast('Error: ' + err.message, true);
  }
}

function discardProposalAt(msgIdx) {
  const m = state.coach.messages[msgIdx];
  if (!m || !m.metadata) return;
  m.metadata.discarded = true;
  renderCoachMessages();
}

async function clearCoachChat() {
  if (!confirm('¿Borrar todo el historial de conversación? Esta acción no se puede deshacer.')) return;
  try {
    await apiCall('clearChat', {}, {});
    state.coach.messages = [];
    state.coach.loaded = true;
    renderCoachMessages();
    toast('Conversación borrada');
  } catch (err) {
    logErr('clearCoachChat', err);
    toast('Error: ' + err.message, true);
  }
}

function installCoachHandlers() {
  const { form, input, clear, fab, closeBtn, backdrop } = coachDom();
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    sendCoachMessage(input.value);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCoachMessage(input.value);
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  });

  if (clear) clear.addEventListener('click', clearCoachChat);

  if (fab) fab.addEventListener('click', () => toggleCoach());
  if (closeBtn) closeBtn.addEventListener('click', () => closeCoach());
  if (backdrop) backdrop.addEventListener('click', () => closeCoach());

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!state.coach.open) return;
    const runner = document.getElementById('runner');
    if (runner && runner.classList.contains('open')) return;
    closeCoach();
  });

  document.addEventListener('click', e => {
    const applyBtn = e.target.closest('[data-coach-apply]');
    if (applyBtn) {
      const idx = parseInt(applyBtn.dataset.coachApply, 10);
      applyProposalAt(idx);
      return;
    }
    const discardBtn = e.target.closest('[data-coach-discard]');
    if (discardBtn) {
      const idx = parseInt(discardBtn.dataset.coachDiscard, 10);
      discardProposalAt(idx);
      return;
    }
  });
}

// =====================================================================
// INIT
// =====================================================================
function bootstrap() {
  try {
    log('info', 'bootstrap()');
    initMiniCalendar();
    installGlobalHandlers();
    installCoachHandlers();
    loadAll();
  } catch (err) {
    logErr('bootstrap', err);
    alert('Error al arrancar Iron Log: ' + err.message + '\nAbre la consola para más detalle.');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
