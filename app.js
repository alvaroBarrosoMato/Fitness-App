// ============================================================================
// ASISTENTE PERSONAL DE FITNESS - app.js
// Unified architecture: one "Entrenamientos" sheet, rows grouped by Día+Rutina.
// ============================================================================

const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyTcNRnAbU85clI_0B-nxuRiZ2ZcnPxrd1euz4693fph6_KCj7Cgk60dHGIIXm8b0WSkw/exec';

const state = {
    all: [],          // all exercises
    currentWorkout: null // workout currently open in the modal
};

// ============================================================================
// INIT
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 Fitness App iniciado');
    setupNavigation();
    setupNewWorkoutForm();
    setupModal();
    loadAll();
});

// ============================================================================
// API CLIENT
// ============================================================================

async function apiGet(action, params = {}) {
    const qs = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(`${GAS_WEB_APP_URL}?${qs}`);
    const json = await res.json();
    if (json.status !== 'success') throw new Error(json.data || 'API error');
    return json.data;
}

/**
 * POST helper. Apps Script web apps require avoiding preflight, so we use
 * text/plain and put the JSON in the body.
 */
async function apiPost(action, payload = {}) {
    const body = JSON.stringify({ action, ...payload });
    const res = await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow'
    });
    const json = await res.json();
    if (json.status !== 'success') throw new Error(json.data || 'API error');
    return json.data;
}

// ============================================================================
// NAVIGATION
// ============================================================================

function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav__btn');
    navButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const tabName = e.currentTarget.dataset.tab;
            navButtons.forEach(btn => btn.classList.remove('nav__btn--active'));
            e.currentTarget.classList.add('nav__btn--active');
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('tab-content--active'));
            const selected = document.getElementById(tabName);
            if (selected) selected.classList.add('tab-content--active');
            renderCurrentTab(tabName);
        });
    });
}

function renderCurrentTab(tabName) {
    switch (tabName) {
        case 'dashboard': renderDashboard(); break;
        case 'planificados': renderPlanificados(); break;
        case 'pasados': renderPasados(); break;
        case 'nuevo': /* form is static */ break;
    }
}

// ============================================================================
// LOAD DATA
// ============================================================================

async function loadAll() {
    try {
        const data = await apiGet('getExercises');
        state.all = data.ejercicios || [];
        console.log(`✅ Cargados ${state.all.length} ejercicios`);
        renderDashboard();
        renderPlanificados();
        renderPasados();
    } catch (err) {
        console.error('❌ loadAll error:', err);
        document.getElementById('dashboard-content').innerHTML =
            `<p style="color:red">Error cargando datos: ${escapeHtml(err.message)}</p>`;
    }
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/** Render any value safely as a short string, fixing the Date-in-Reps bug. */
function displayValue(v) {
    if (v === null || v === undefined || v === '') return '-';
    const s = String(v);
    // If a Reps / KG field got corrupted into an ISO date, display YYYY-MM-DD only.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) {
        return s.substring(0, 10) + ' ⚠️';
    }
    return s;
}

/** Format a YYYY-MM-DD into a friendlier Spanish label. */
function formatDiaLabel(dia) {
    if (!dia) return 'Sin fecha';
    const s = String(dia).substring(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return s;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    try {
        return d.toLocaleDateString('es-ES', opts);
    } catch (_) {
        return s;
    }
}

/** Group a flat list of exercises by Día + Rutina. */
function groupByWorkout(exercises) {
    const groups = new Map();
    exercises.forEach(ex => {
        const dia = ex['Día'] || '';
        const rutina = ex['Rutina'] || '';
        const key = `${dia}__${rutina}`;
        if (!groups.has(key)) groups.set(key, { dia, rutina, ejercicios: [] });
        groups.get(key).ejercicios.push(ex);
    });
    return Array.from(groups.values());
}

// ============================================================================
// DASHBOARD
// ============================================================================

function renderDashboard() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    const planeados = state.all.filter(e => e.Estado === 'Planeado');
    const completados = state.all.filter(e => e.Estado === 'Completado');

    const planGroups = groupByWorkout(planeados)
        .sort((a, b) => (a.dia || '').localeCompare(b.dia || ''));
    const doneGroups = groupByWorkout(completados)
        .sort((a, b) => (b.dia || '').localeCompare(a.dia || ''));

    let html = '';

    // Próximos
    html += '<div class="card"><h3>📅 Próximos entrenamientos</h3>';
    if (planGroups.length === 0) {
        html += '<p style="color:#999">Sin entrenamientos planificados</p>';
    } else {
        html += '<ul style="list-style:none">';
        planGroups.slice(0, 5).forEach(g => {
            html += `<li style="padding:10px;margin:6px 0;background:#f9f9f9;border-left:3px solid var(--color-primary);border-radius:4px">
                <strong>${escapeHtml(formatDiaLabel(g.dia))}</strong> — ${escapeHtml(g.rutina)}<br>
                <small>${g.ejercicios.length} ejercicio(s)</small>
                <br><button class="btn btn--primary btn--small" data-start-dia="${escapeHtml(g.dia)}" data-start-rutina="${escapeHtml(g.rutina)}">▶ Comenzar</button>
            </li>`;
        });
        html += '</ul>';
    }
    html += '</div>';

    // Últimos completados
    html += '<div class="card"><h3>✅ Últimos completados</h3>';
    if (doneGroups.length === 0) {
        html += '<p style="color:#999">Sin entrenamientos registrados</p>';
    } else {
        html += '<ul style="list-style:none">';
        doneGroups.slice(0, 5).forEach(g => {
            html += `<li style="padding:10px;margin:6px 0;background:#f9f9f9;border-left:3px solid var(--color-success);border-radius:4px">
                <strong>${escapeHtml(formatDiaLabel(g.dia))}</strong> — ${escapeHtml(g.rutina)}<br>
                <small>${g.ejercicios.length} ejercicio(s)</small>
            </li>`;
        });
        html += '</ul>';
    }
    html += '</div>';

    container.innerHTML = html;

    // Wire the start buttons
    container.querySelectorAll('[data-start-dia]').forEach(btn => {
        btn.addEventListener('click', () => {
            openWorkoutModal(btn.dataset.startDia, btn.dataset.startRutina);
        });
    });
}

// ============================================================================
// PLANIFICADOS
// ============================================================================

function renderPlanificados() {
    const container = document.getElementById('planificados-list');
    if (!container) return;

    const planeados = state.all.filter(e => e.Estado === 'Planeado');
    const groups = groupByWorkout(planeados)
        .sort((a, b) => (a.dia || '').localeCompare(b.dia || ''));

    if (groups.length === 0) {
        container.innerHTML = '<p style="color:#999;text-align:center">Sin entrenamientos planificados</p>';
        return;
    }

    let html = '';
    groups.forEach(g => {
        html += `<div class="card workout-group">
            <div class="workout-group__header">
                <div>
                    <div class="workout-group__title">${escapeHtml(formatDiaLabel(g.dia))}</div>
                    <div class="workout-group__meta">${escapeHtml(g.rutina)} · ${g.ejercicios.length} ejercicio(s)</div>
                </div>
                <button class="btn btn--primary btn--small" data-start-dia="${escapeHtml(g.dia)}" data-start-rutina="${escapeHtml(g.rutina)}">▶ Comenzar</button>
            </div>
            <table>
                <thead><tr>
                    <th>Ejercicio</th><th>Series</th><th>Reps</th><th>Objetivo Kg</th><th>Notas</th>
                </tr></thead>
                <tbody>`;
        g.ejercicios.forEach(ex => {
            html += `<tr>
                <td>${escapeHtml(ex.Ejercicio)}</td>
                <td>${escapeHtml(displayValue(ex.Series))}</td>
                <td>${escapeHtml(displayValue(ex.Reps))}</td>
                <td>${escapeHtml(displayValue(ex['KG / Detalles (Objetivo)']))}</td>
                <td>${escapeHtml(displayValue(ex['Objetivo / Notas']))}</td>
            </tr>`;
        });
        html += '</tbody></table></div>';
    });
    container.innerHTML = html;

    container.querySelectorAll('[data-start-dia]').forEach(btn => {
        btn.addEventListener('click', () => {
            openWorkoutModal(btn.dataset.startDia, btn.dataset.startRutina);
        });
    });
}

// ============================================================================
// PASADOS - grouped by date
// ============================================================================

function renderPasados() {
    const container = document.getElementById('pasados-list');
    if (!container) return;

    // Include both Completado and Fallado, exclude Planeado
    const past = state.all.filter(e => e.Estado === 'Completado' || e.Estado === 'Fallado');
    const groups = groupByWorkout(past)
        .sort((a, b) => (b.dia || '').localeCompare(a.dia || ''));

    if (groups.length === 0) {
        container.innerHTML = '<p style="color:#999;text-align:center">Sin entrenamientos registrados</p>';
        return;
    }

    let html = '';
    groups.forEach(g => {
        const anyFailed = g.ejercicios.some(ex => ex.Estado === 'Fallado');
        const badgeClass = anyFailed ? 'badge--fallado' : 'badge--completado';
        const badgeText = anyFailed ? 'Con fallos' : 'Completado';
        html += `<div class="card workout-group">
            <div class="workout-group__header">
                <div>
                    <div class="workout-group__title">${escapeHtml(formatDiaLabel(g.dia))}</div>
                    <div class="workout-group__meta">${escapeHtml(g.rutina)} · ${g.ejercicios.length} ejercicio(s)</div>
                </div>
                <span class="badge ${badgeClass}">${badgeText}</span>
            </div>
            <table>
                <thead><tr>
                    <th>Ejercicio</th><th>Series</th><th>Reps</th>
                    <th>Objetivo</th><th>Conseguido</th><th>Estado</th><th>Notas</th>
                </tr></thead>
                <tbody>`;
        g.ejercicios.forEach(ex => {
            const estado = ex.Estado || 'Planeado';
            const cls = estado === 'Completado' ? 'badge--completado' :
                        estado === 'Fallado' ? 'badge--fallado' : 'badge--planeado';
            html += `<tr>
                <td>${escapeHtml(ex.Ejercicio)}</td>
                <td>${escapeHtml(displayValue(ex.Series))}</td>
                <td>${escapeHtml(displayValue(ex.Reps))}</td>
                <td>${escapeHtml(displayValue(ex['KG / Detalles (Objetivo)']))}</td>
                <td>${escapeHtml(displayValue(ex['KG / Detalles (Conseguidos)']))}</td>
                <td><span class="badge ${cls}">${escapeHtml(estado)}</span></td>
                <td>${escapeHtml(displayValue(ex['Objetivo / Notas']))}</td>
            </tr>`;
        });
        html += '</tbody></table></div>';
    });
    container.innerHTML = html;
}

// ============================================================================
// NEW WORKOUT FORM
// ============================================================================

function setupNewWorkoutForm() {
    const list = document.getElementById('new-exercises-list');
    const addBtn = document.getElementById('btn-add-exercise');
    const form = document.getElementById('new-workout-form');
    const feedback = document.getElementById('new-workout-feedback');
    if (!list || !addBtn || !form) return;

    addExerciseRow(list);
    addBtn.addEventListener('click', () => addExerciseRow(list));

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        feedback.textContent = 'Guardando...';
        feedback.className = 'feedback';

        const fd = new FormData(form);
        const dia = fd.get('dia');
        const rutina = fd.get('rutina');

        const rows = list.querySelectorAll('.exercise-row');
        const ejercicios = [];
        rows.forEach(r => {
            const inputs = r.querySelectorAll('input');
            const ej = {
                'Ejercicio': inputs[0].value.trim(),
                'Series': inputs[1].value.trim(),
                'Reps': inputs[2].value.trim(),
                'KG / Detalles (Objetivo)': inputs[3].value.trim(),
                'Objetivo / Notas': inputs[4].value.trim(),
                'Estado': 'Planeado'
            };
            if (ej.Ejercicio) ejercicios.push(ej);
        });

        if (ejercicios.length === 0) {
            feedback.textContent = 'Añade al menos un ejercicio.';
            feedback.className = 'feedback feedback--err';
            return;
        }

        try {
            await apiPost('createWorkout', { dia, rutina, ejercicios });
            feedback.textContent = '✅ Entrenamiento guardado';
            feedback.className = 'feedback feedback--ok';
            form.reset();
            list.innerHTML = '';
            addExerciseRow(list);
            await loadAll();
        } catch (err) {
            feedback.textContent = '❌ Error: ' + err.message;
            feedback.className = 'feedback feedback--err';
        }
    });
}

function addExerciseRow(list) {
    const div = document.createElement('div');
    div.className = 'exercise-row';
    div.innerHTML = `
        <input type="text" placeholder="Ejercicio" required>
        <input type="text" placeholder="Series" value="4">
        <input type="text" placeholder="Reps" value="8">
        <input type="text" placeholder="Kg objetivo">
        <input type="text" placeholder="Notas">
        <button type="button" class="exercise-row__remove" title="Eliminar">×</button>
    `;
    div.querySelector('.exercise-row__remove').addEventListener('click', () => div.remove());
    list.appendChild(div);
}

// ============================================================================
// WORKOUT MODAL (Start / Complete)
// ============================================================================

function setupModal() {
    const modal = document.getElementById('workout-modal');
    if (!modal) return;

    modal.querySelectorAll('[data-close-modal]').forEach(el => {
        el.addEventListener('click', closeWorkoutModal);
    });

    document.getElementById('btn-complete-workout').addEventListener('click', completeCurrentWorkout);
}

function openWorkoutModal(dia, rutina) {
    const matching = state.all.filter(e =>
        (e['Día'] || '') === dia && (e['Rutina'] || '') === rutina
    );
    if (matching.length === 0) {
        alert('No se encontraron ejercicios para este entrenamiento.');
        return;
    }
    state.currentWorkout = { dia, rutina, ejercicios: matching };

    document.getElementById('workout-modal-title').textContent = `▶ ${rutina}`;
    document.getElementById('workout-modal-subtitle').textContent = formatDiaLabel(dia);

    const list = document.getElementById('workout-modal-exercises');
    list.innerHTML = '';
    matching.forEach(ex => {
        const row = document.createElement('div');
        row.className = 'modal-exercise';
        row.dataset.rowId = ex.rowId;
        row.innerHTML = `
            <div class="modal-exercise__name">${escapeHtml(ex.Ejercicio)}</div>
            <div class="modal-exercise__goal">
                Objetivo: ${escapeHtml(displayValue(ex.Series))}×${escapeHtml(displayValue(ex.Reps))}
                ${ex['KG / Detalles (Objetivo)'] ? ' @ ' + escapeHtml(ex['KG / Detalles (Objetivo)']) : ''}
                ${ex['Objetivo / Notas'] ? ' · ' + escapeHtml(ex['Objetivo / Notas']) : ''}
            </div>
            <div class="modal-exercise__fields">
                <input type="text" data-field="series" placeholder="Series" value="${escapeHtml(displayValue(ex.Series))}">
                <input type="text" data-field="reps" placeholder="Reps" value="${escapeHtml(displayValue(ex.Reps))}">
                <input type="text" data-field="kg" placeholder="Kg conseguidos" value="${escapeHtml(ex['KG / Detalles (Conseguidos)'] || ex['KG / Detalles (Objetivo)'] || '')}">
                <select data-field="estado">
                    <option value="Completado" selected>Completado</option>
                    <option value="Fallado">Fallado</option>
                    <option value="Planeado">Planeado</option>
                </select>
            </div>
        `;
        list.appendChild(row);
    });

    document.getElementById('workout-modal-feedback').textContent = '';
    document.getElementById('workout-modal').classList.remove('modal--hidden');
}

function closeWorkoutModal() {
    document.getElementById('workout-modal').classList.add('modal--hidden');
    state.currentWorkout = null;
}

async function completeCurrentWorkout() {
    if (!state.currentWorkout) return;
    const feedback = document.getElementById('workout-modal-feedback');
    feedback.textContent = 'Guardando...';
    feedback.className = 'feedback';

    const rows = document.querySelectorAll('#workout-modal-exercises .modal-exercise');
    const exercises = Array.from(rows).map(r => ({
        rowId: Number(r.dataset.rowId),
        series: r.querySelector('[data-field="series"]').value.trim(),
        reps: r.querySelector('[data-field="reps"]').value.trim(),
        kgConseguidos: r.querySelector('[data-field="kg"]').value.trim(),
        estado: r.querySelector('[data-field="estado"]').value
    }));

    try {
        await apiPost('completeWorkout', {
            dia: state.currentWorkout.dia,
            rutina: state.currentWorkout.rutina,
            exercises
        });
        feedback.textContent = '✅ Entrenamiento completado';
        feedback.className = 'feedback feedback--ok';
        await loadAll();
        setTimeout(closeWorkoutModal, 800);
    } catch (err) {
        feedback.textContent = '❌ Error: ' + err.message;
        feedback.className = 'feedback feedback--err';
    }
}
