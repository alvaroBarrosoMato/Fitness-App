// ============================================================================
// ASISTENTE PERSONAL DE FITNESS - VERSIÓN MEJORADA (app.js)
// ============================================================================
// Características nuevas:
// - Entrada rápida de entrenamientos
// - Selector de entrenamientos de la agenda
// - Editor rápido de series, reps, kg
// - API para generar planes con IA
// ============================================================================

// ============================================================================
// 🔧 CONFIGURACIÓN INICIAL
// ============================================================================

const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyTcNRnAbU85clI_0B-nxuRiZ2ZcnPxrd1euz4693fph6_KCj7Cgk60dHGIIXm8b0WSkw/exec';
const API_ENDPOINT = GAS_WEB_APP_URL; // Tu API de Google Apps Script

const cache = {
    plan: null,
    historicoEntrenamientos: null,
    historicoComidas: null,
    mediciones: null,
    lastUpdate: null
};

// ============================================================================
// 🚀 INICIALIZACIÓN
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 Asistente de Fitness iniciado (v2.0)');
    
    setupTabNavigation();
    setupFormHandlers();
    setupQuickEntryHandlers();
    setupIAPlannerHandlers();
    loadDashboard();
    checkAPIStatus();
});

// ============================================================================
// 📑 NAVEGACIÓN
// ============================================================================

function setupTabNavigation() {
    const navButtons = document.querySelectorAll('.nav__btn');
    
    navButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const tabName = e.currentTarget.dataset.tab;
            
            navButtons.forEach(btn => btn.classList.remove('nav__btn--active'));
            e.currentTarget.classList.add('nav__btn--active');
            
            const allTabs = document.querySelectorAll('.tab-content');
            allTabs.forEach(tab => tab.classList.remove('tab-content--active'));
            
            const selectedTab = document.getElementById(tabName);
            if (selectedTab) {
                selectedTab.classList.add('tab-content--active');
                loadTabData(tabName);
            }
        });
    });
}

function loadTabData(tabName) {
    switch (tabName) {
        case 'entrada-rapida':
            loadQuickEntryData();
            break;
        case 'entrenamientos':
            loadHistoricoEntrenamientos();
            break;
        case 'comidas':
            loadHistoricoComidas();
            break;
        case 'mediciones':
            loadMedicionesDetalladas();
            break;
        case 'dashboard':
            loadDashboard();
            break;
        case 'ia-planner':
            checkAPIStatus();
            break;
    }
}

// ============================================================================
// ⚡ ENTRADA RÁPIDA
// ============================================================================

function setupQuickEntryHandlers() {
    const selectWorkout = document.getElementById('select-workout');
    const btnSaveQuick = document.getElementById('btn-save-quick-workout');
    const btnSaveManual = document.getElementById('btn-save-manual-workout');
    
    if (selectWorkout) {
        selectWorkout.addEventListener('change', () => {
            const selectedDay = selectWorkout.value;
            if (selectedDay) {
                displayWorkoutForEditing(selectedDay);
            } else {
                document.getElementById('workout-details').classList.add('hidden');
            }
        });
    }
    
    if (btnSaveQuick) {
        btnSaveQuick.addEventListener('click', submitQuickWorkout);
    }
    
    if (btnSaveManual) {
        btnSaveManual.addEventListener('click', submitManualWorkout);
    }
}

async function loadQuickEntryData() {
    try {
        const response = await fetch(`${GAS_WEB_APP_URL}?action=getPlan`);
        const result = await response.json();
        
        if (result.status === 'success') {
            const entrenamientos = result.data.entrenamientos;
            const select = document.getElementById('select-workout');
            
            select.innerHTML = '<option value="">-- Selecciona un entrenamiento --</option>';
            
            entrenamientos.forEach(ent => {
                const option = document.createElement('option');
                option.value = ent.Dia_Semana;
                option.textContent = `${ent.Dia_Semana} - ${ent.Rutina}`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('❌ Error cargando datos de entrada rápida:', error);
    }
}

function displayWorkoutForEditing(selectedDay) {
    if (!cache.plan) return;
    
    const workout = cache.plan.entrenamientos.find(e => e.Dia_Semana === selectedDay);
    if (!workout) return;
    
    document.getElementById('detail-rutina').textContent = workout.Rutina || 'N/A';
    document.getElementById('detail-objetivos').textContent = workout.Objetivos || 'N/A';
    
    const exercisesEditor = document.getElementById('exercises-editor');
    
    const exerciseLines = parseExercises(workout.Rutina);
    
    let html = '<div class="exercises-list">';
    exerciseLines.forEach((exercise, idx) => {
        html += `
            <div class="exercise-row">
                <input type="text" class="exercise-name" value="${exercise.name}" placeholder="Nombre del ejercicio">
                <div class="exercise-sets">
                    <input type="number" class="sets" value="${exercise.sets}" placeholder="Series" min="1">
                    <span>x</span>
                    <input type="number" class="reps" value="${exercise.reps}" placeholder="Reps" min="1">
                    <span>x</span>
                    <input type="number" class="weight" value="${exercise.weight}" placeholder="Kg" min="0" step="0.5">
                </div>
                <button class="btn btn--danger btn--sm" onclick="removeExerciseRow(this)">✕</button>
            </div>
        `;
    });
    
    html += `
        <button class="btn btn--secondary btn--sm" onclick="addExerciseRow()">
            + Agregar Ejercicio
        </button>
    </div>
    `;
    
    exercisesEditor.innerHTML = html;
    document.getElementById('workout-details').classList.remove('hidden');
}

function parseExercises(rutineName) {
    return [
        { name: rutineName + ' - Ejercicio 1', sets: 4, reps: 6, weight: 0 },
        { name: rutineName + ' - Ejercicio 2', sets: 3, reps: 8, weight: 0 },
        { name: rutineName + ' - Ejercicio 3', sets: 3, reps: 10, weight: 0 }
    ];
}

function addExerciseRow() {
    const editor = document.getElementById('exercises-editor');
    const newRow = document.createElement('div');
    newRow.className = 'exercise-row';
    newRow.innerHTML = `
        <input type="text" class="exercise-name" placeholder="Nombre del ejercicio">
        <div class="exercise-sets">
            <input type="number" class="sets" placeholder="Series" min="1" value="3">
            <span>x</span>
            <input type="number" class="reps" placeholder="Reps" min="1" value="8">
            <span>x</span>
            <input type="number" class="weight" placeholder="Kg" min="0" step="0.5" value="0">
        </div>
        <button class="btn btn--danger btn--sm" onclick="removeExerciseRow(this)">✕</button>
    `;
    editor.querySelector('.exercises-list').appendChild(newRow);
}

function removeExerciseRow(btn) {
    btn.parentElement.remove();
}

async function submitQuickWorkout(e) {
    e.preventDefault();
    
    const feedback = document.getElementById('quick-entry-feedback');
    const selectedDay = document.getElementById('select-workout').value;
    const btnSubmit = e.target;
    
    try {
        btnSubmit.disabled = true;
        btnSubmit.textContent = '⏳ Guardando...';
        
        const exerciseRows = document.querySelectorAll('.exercise-row');
        let detalles = '';
        
        exerciseRows.forEach(row => {
            const name = row.querySelector('.exercise-name').value;
            const sets = row.querySelector('.sets').value;
            const reps = row.querySelector('.reps').value;
            const weight = row.querySelector('.weight').value;
            
            if (name && sets && reps) {
                detalles += `${name}: ${sets}x${reps}x${weight}kg | `;
            }
        });
        
        const payload = {
            fecha: new Date().toISOString().split('T')[0],
            tipo: selectedDay,
            duracion: parseInt(prompt('Duración del entrenamiento (minutos):') || 90),
            detalles: detalles,
            notas: 'Entrada rápida desde selector'
        };
        
        const response = await fetch(`${GAS_WEB_APP_URL}?type=entrenamientoHistorico`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            mostrarExito('✅ Entrenamiento guardado rápidamente', feedback);
            setTimeout(() => loadDashboard(), 1500);
        } else {
            throw new Error(result.data);
        }
    } catch (error) {
        console.error('❌ Error:', error);
        mostrarErrorFeedback(error.message, feedback);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Guardar Entrenamiento Rápido';
    }
}

async function submitManualWorkout(e) {
    e.preventDefault();
    
    const feedback = document.getElementById('manual-entry-feedback');
    const btnSubmit = e.target;
    
    try {
        btnSubmit.disabled = true;
        btnSubmit.textContent = '⏳ Guardando...';
        
        const payload = {
            fecha: new Date().toISOString().split('T')[0],
            tipo: document.getElementById('quick-tipo').value,
            duracion: parseInt(document.getElementById('quick-duracion').value),
            detalles: document.getElementById('quick-detalles').value,
            notas: document.getElementById('quick-notas').value
        };
        
        if (!payload.tipo || !payload.duracion) {
            throw new Error('Completa tipo y duración');
        }
        
        const response = await fetch(`${GAS_WEB_APP_URL}?type=entrenamientoHistorico`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            document.getElementById('quick-tipo').value = '';
            document.getElementById('quick-duracion').value = '';
            document.getElementById('quick-detalles').value = '';
            document.getElementById('quick-notas').value = '';
            
            mostrarExito('✅ Entrenamiento guardado', feedback);
            setTimeout(() => loadDashboard(), 1500);
        } else {
            throw new Error(result.data);
        }
    } catch (error) {
        console.error('❌ Error:', error);
        mostrarErrorFeedback(error.message, feedback);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Guardar Entrenamiento Manual';
    }
}

// ============================================================================
// 🤖 PLANIFICADOR IA
// ============================================================================

function setupIAPlannerHandlers() {
    const btnGenerate = document.getElementById('btn-generate-plan');
    
    if (btnGenerate) {
        btnGenerate.addEventListener('click', generatePlanWithAI);
    }
}

async function checkAPIStatus() {
    const statusEl = document.getElementById('api-status');
    
    try {
        const response = await fetch(`${GAS_WEB_APP_URL}?action=getAll`, {
            method: 'GET'
        });
        
        if (response.ok) {
            statusEl.textContent = '✅ API conectada y funcionando';
            statusEl.style.color = '#6BCB77';
        } else {
            statusEl.textContent = '⚠️ API respondió con error: ' + response.status;
            statusEl.style.color = '#FFB84D';
        }
    } catch (error) {
        statusEl.textContent = '❌ No se puede conectar con la API. Verifica la URL del Web App.';
        statusEl.style.color = '#FF6B6B';
        console.error('API Status Error:', error);
    }
}

async function generatePlanWithAI(e) {
    e.preventDefault();
    
    const prompt = document.getElementById('ia-prompt').value;
    const feedback = document.getElementById('ia-feedback');
    const btnGenerate = e.target;
    
    if (!prompt.trim()) {
        mostrarErrorFeedback('Por favor describe qué plan necesitas', feedback);
        return;
    }
    
    try {
        btnGenerate.disabled = true;
        btnGenerate.textContent = '🔄 Generando plan...';
        
        const payload = {
            action: 'generatePlanAI',
            prompt: prompt,
            timestamp: new Date().toISOString()
        };
        
        const response = await fetch(`${GAS_WEB_APP_URL}?action=generatePlanAI`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            displayGeneratedPlan(result.data);
            mostrarExito('✅ Plan generado exitosamente', feedback);
        } else {
            throw new Error(result.data || 'Error generando plan');
        }
    } catch (error) {
        console.error('❌ Error en IA Planner:', error);
        mostrarErrorFeedback(
            'Error: ' + error.message + 
            '\n\n💡 Asegúrate de que tu API de IA esté configurada en el backend.',
            feedback
        );
    } finally {
        btnGenerate.disabled = false;
        btnGenerate.textContent = '🚀 Generar Plan con IA';
    }
}

function displayGeneratedPlan(planData) {
    const planSection = document.getElementById('generated-plan');
    
    if (planData.entrenamientos) {
        const workoutsContainer = document.getElementById('generated-workouts');
        let html = '';
        
        planData.entrenamientos.forEach(workout => {
            html += `
                <div class="generated-item">
                    <h6>${workout.Dia_Semana || 'Día'}</h6>
                    <p><strong>${workout.Rutina || 'N/A'}</strong></p>
                    <small>${workout.Objetivos || 'N/A'}</small>
                </div>
            `;
        });
        
        workoutsContainer.innerHTML = html;
    }
    
    if (planData.comidas) {
        const mealsContainer = document.getElementById('generated-meals');
        let html = '';
        
        const mealsByDay = {};
        planData.comidas.forEach(meal => {
            if (!mealsByDay[meal.Dia_Semana]) {
                mealsByDay[meal.Dia_Semana] = [];
            }
            mealsByDay[meal.Dia_Semana].push(meal);
        });
        
        Object.keys(mealsByDay).forEach(day => {
            html += `<div class="generated-item"><strong>${day}</strong>`;
            mealsByDay[day].forEach(meal => {
                html += `<p>• ${meal.Tipo_Comida}: ${meal.Receta_Ingredientes}</p>`;
            });
            html += '</div>';
        });
        
        mealsContainer.innerHTML = html;
    }
    
    planSection.classList.remove('hidden');
    
    document.getElementById('btn-save-generated-workouts').onclick = () => {
        saveGeneratedData('entrenamientos', planData.entrenamientos);
    };
    document.getElementById('btn-save-generated-meals').onclick = () => {
        saveGeneratedData('comidas', planData.comidas);
    };
}

async function saveGeneratedData(type, data) {
    try {
        let sheetName = type === 'entrenamientos' ? 'Entrenamientos_Plan' : 'Comidas_Plan';
        
        const payload = {
            action: 'savePlanData',
            type: type,
            data: data,
            sheetName: sheetName
        };
        
        const response = await fetch(`${GAS_WEB_APP_URL}?action=savePlanData`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            mostrarExito(`✅ ${type} guardados en Google Sheets`, document.getElementById('ia-feedback'));
        } else {
            throw new Error(result.data);
        }
    } catch (error) {
        console.error('❌ Error guardando datos generados:', error);
        mostrarErrorFeedback(error.message, document.getElementById('ia-feedback'));
    }
}

// ============================================================================
// 🎯 DASHBOARD
// ============================================================================

async function loadDashboard() {
    try {
        document.getElementById('planEntrenamientos').innerHTML = '<p class="loading">Cargando...</p>';
        document.getElementById('planComidas').innerHTML = '<p class="loading">Cargando...</p>';
        document.getElementById('ultimasMediciones').innerHTML = '<p class="loading">Cargando...</p>';
        
        const response = await fetch(`${GAS_WEB_APP_URL}?action=getAll`);
        const result = await response.json();
        
        if (result.status === 'success') {
            const data = result.data;
            
            cache.plan = data.plan;
            cache.historicoEntrenamientos = data.historicoEntrenamientos;
            cache.historicoComidas = data.historicoComidas;
            cache.mediciones = data.mediciones;
            cache.lastUpdate = new Date().toLocaleTimeString('es-ES');
            
            renderPlanEntrenamientos(data.plan.entrenamientos);
            renderPlanComidas(data.plan.comidas);
            renderUltimasMediciones(data.mediciones);
        } else {
            console.error('Error en respuesta GAS:', result);
        }
    } catch (error) {
        console.error('❌ Error cargando dashboard:', error);
    }
}

function renderPlanEntrenamientos(entrenamientos) {
    const container = document.getElementById('planEntrenamientos');
    
    if (!entrenamientos || entrenamientos.length === 0) {
        container.innerHTML = '<p style="color: #999;">No hay entrenamientos planificados</p>';
        return;
    }
    
    const html = entrenamientos.map(entrenamiento => `
        <div class="plan-item">
            <strong>${entrenamiento.Dia_Semana || 'N/A'}</strong>
            <p><strong>Rutina:</strong> ${entrenamiento.Rutina || 'N/A'}</p>
            <small><strong>Objetivos:</strong> ${entrenamiento.Objetivos || 'N/A'}</small>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

function renderPlanComidas(comidas) {
    const container = document.getElementById('planComidas');
    
    if (!comidas || comidas.length === 0) {
        container.innerHTML = '<p style="color: #999;">No hay comidas planificadas</p>';
        return;
    }
    
    const html = comidas.map(comida => `
        <div class="plan-item">
            <strong>${comida.Dia_Semana || 'N/A'}</strong>
            <p><strong>Tipo:</strong> ${comida.Tipo_Comida || 'N/A'}</p>
            <small>${comida.Receta_Ingredientes || 'N/A'}</small>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

function renderUltimasMediciones(mediciones) {
    const container = document.getElementById('ultimasMediciones');
    
    if (!mediciones || mediciones.length === 0) {
        container.innerHTML = '<p style="color: #999;">No hay mediciones registradas</p>';
        return;
    }
    
    const ultimas = mediciones.slice(-5).reverse();
    
    const html = ultimas.map(med => {
        let detalles = [];
        if (med['Peso (kg)']) detalles.push(`Peso: <strong>${med['Peso (kg)']} kg</strong>`);
        if (med['Grasa Corporal (%)']) detalles.push(`Grasa: <strong>${med['Grasa Corporal (%)']}%</strong>`);
        if (med['Circunferencia Cintura (cm)']) detalles.push(`Cintura: <strong>${med['Circunferencia Cintura (cm)']} cm</strong>`);
        
        return `
            <div class="medicion-item">
                <strong>${med.Fecha || 'N/A'}</strong>
                <p>${detalles.join(' | ')}</p>
                ${med.Notas ? `<small style="color: #666;">📝 ${med.Notas}</small>` : ''}
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

// ============================================================================
// 📊 HISTÓRICOS
// ============================================================================

async function loadHistoricoEntrenamientos() {
    try {
        const container = document.getElementById('historicoEntrenamientos');
        container.innerHTML = '<p class="loading">Cargando histórico...</p>';
        
        const response = await fetch(`${GAS_WEB_APP_URL}?action=getHistoricoEntrenamientos`);
        const result = await response.json();
        
        if (result.status === 'success') {
            renderTablaEntrenamientos(result.data.entrenamientos, container);
        }
    } catch (error) {
        console.error('❌ Error:', error);
        document.getElementById('historicoEntrenamientos').innerHTML = '<p style="color: red;">Error al cargar</p>';
    }
}

function renderTablaEntrenamientos(entrenamientos, container) {
    if (!entrenamientos || entrenamientos.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center;">No hay entrenamientos registrados</p>';
        return;
    }
    
    const html = `
        <table>
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Duración</th>
                    <th>Detalles</th>
                    <th>Notas</th>
                </tr>
            </thead>
            <tbody>
                ${entrenamientos.map(ent => `
                    <tr>
                        <td>${ent.Fecha || '-'}</td>
                        <td>${ent.Tipo || '-'}</td>
                        <td>${ent['Duración (min)'] || '-'} min</td>
                        <td>${ent['Detalles/Pesos'] || '-'}</td>
                        <td>${ent.Notas || '-'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

async function loadHistoricoComidas() {
    try {
        const container = document.getElementById('historicoComidas');
        container.innerHTML = '<p class="loading">Cargando histórico...</p>';
        
        const response = await fetch(`${GAS_WEB_APP_URL}?action=getHistoricoComidas`);
        const result = await response.json();
        
        if (result.status === 'success') {
            renderTablaComidas(result.data.comidas, container);
        }
    } catch (error) {
        console.error('❌ Error:', error);
        document.getElementById('historicoComidas').innerHTML = '<p style="color: red;">Error al cargar</p>';
    }
}

function renderTablaComidas(comidas, container) {
    if (!comidas || comidas.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center;">No hay comidas registradas</p>';
        return;
    }
    
    const html = `
        <table>
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Tipo Comida</th>
                    <th>Calorías</th>
                    <th>Macros</th>
                    <th>Descripción</th>
                </tr>
            </thead>
            <tbody>
                ${comidas.map(com => `
                    <tr>
                        <td>${com.Fecha || '-'}</td>
                        <td>${com.Tipo_Comida || '-'}</td>
                        <td>${com.Calorías || '-'}</td>
                        <td>${com['Macros (P/C/G)'] || '-'}</td>
                        <td>${com.Descripción || '-'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

async function loadMedicionesDetalladas() {
    try {
        const container = document.getElementById('mediacionesDetalladas');
        container.innerHTML = '<p class="loading">Cargando mediciones...</p>';
        
        const response = await fetch(`${GAS_WEB_APP_URL}?action=getMediciones`);
        const result = await response.json();
        
        if (result.status === 'success') {
            renderTablaMediciones(result.data.mediciones, container);
        }
    } catch (error) {
        console.error('❌ Error:', error);
        document.getElementById('mediacionesDetalladas').innerHTML = '<p style="color: red;">Error al cargar</p>';
    }
}

function renderTablaMediciones(mediciones, container) {
    if (!mediciones || mediciones.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center;">No hay mediciones registradas</p>';
        return;
    }
    
    const html = `
        <table>
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Peso (kg)</th>
                    <th>Grasa (%)</th>
                    <th>Cintura (cm)</th>
                    <th>Notas</th>
                </tr>
            </thead>
            <tbody>
                ${mediciones.map(med => `
                    <tr>
                        <td>${med.Fecha || '-'}</td>
                        <td>${med['Peso (kg)'] || '-'}</td>
                        <td>${med['Grasa Corporal (%)'] || '-'}</td>
                        <td>${med['Circunferencia Cintura (cm)'] || '-'}</td>
                        <td>${med.Notas || '-'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

// ============================================================================
// 📝 FORMULARIOS
// ============================================================================

function setupFormHandlers() {
    const formTabBtns = document.querySelectorAll('.form-tab-btn');
    
    formTabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const formId = e.currentTarget.dataset.form;
            
            formTabBtns.forEach(b => b.classList.remove('form-tab-btn--active'));
            e.currentTarget.classList.add('form-tab-btn--active');
            
            const allForms = document.querySelectorAll('.form');
            allForms.forEach(form => form.classList.remove('form--visible'));
            
            const selectedForm = document.getElementById(formId);
            if (selectedForm) {
                selectedForm.classList.add('form--visible');
            }
        });
    });
}

// ============================================================================
// 💬 UTILIDADES
// ============================================================================

function mostrarExito(mensaje, container) {
    container.className = 'feedback feedback--show feedback--success';
    container.textContent = mensaje;
    
    setTimeout(() => {
        container.classList.remove('feedback--show');
    }, 4000);
}

function mostrarErrorFeedback(mensaje, container) {
    container.className = 'feedback feedback--show feedback--error';
    container.textContent = '❌ Error: ' + mensaje;
}
