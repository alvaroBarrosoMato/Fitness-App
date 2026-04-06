// ============================================================================
// ASISTENTE PERSONAL DE FITNESS - LÓGICA JAVASCRIPT (app.js)
// ============================================================================
// Este archivo contiene toda la lógica del frontend:
// - Comunicación con el Web App de Google Apps Script
// - Manejo de eventos y navegación
// - Renderizado de datos
// - Validación de formularios
// ============================================================================

// ============================================================================
// 🔧 CONFIGURACIÓN INICIAL - ⚠️ MODIFICA ESTO CON TU URL
// ============================================================================

// 📌 REEMPLAZA ESTO CON TU URL DEL WEB APP DE GOOGLE APPS SCRIPT
const GAS_WEB_APP_URL = 'https://script.google.com/macros/d/AKfycbyTcNRnAbU85clI_0B-nxuRiZ2ZcnPxrd1euz4693fph6_KCj7Cgk60dHGIIXm8b0WSkw/exec';
// Obtén esta URL al hacer Deploy > New deployment > Web app en Apps Script

// Objeto para almacenar datos en caché
const cache = {
    plan: null,
    historicoEntrenamientos: null,
    historicoComidas: null,
    mediciones: null,
    lastUpdate: null
};

// ============================================================================
// 🚀 INICIALIZACIÓN - Se ejecuta cuando carga la página
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 Asistente de Fitness iniciado');
    
    // Configurar navegación de tabs
    setupTabNavigation();
    
    // Configurar eventos de formularios
    setupFormHandlers();
    
    // Cargar datos iniciales
    loadDashboard();
});

// ============================================================================
// 📑 NAVEGACIÓN - Sistema de tabs
// ============================================================================

function setupTabNavigation() {
    const navButtons = document.querySelectorAll('.nav__btn');
    
    navButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const tabName = e.currentTarget.dataset.tab;
            
            // Remover clase activa de todos los botones
            navButtons.forEach(btn => btn.classList.remove('nav__btn--active'));
            
            // Agregar clase activa al botón clickeado
            e.currentTarget.classList.add('nav__btn--active');
            
            // Ocultar todas las tabs
            const allTabs = document.querySelectorAll('.tab-content');
            allTabs.forEach(tab => tab.classList.remove('tab-content--active'));
            
            // Mostrar la tab seleccionada
            const selectedTab = document.getElementById(tabName);
            if (selectedTab) {
                selectedTab.classList.add('tab-content--active');
                
                // Cargar datos específicos de la tab
                loadTabData(tabName);
            }
        });
    });
}

// Cargar datos según la tab activa
function loadTabData(tabName) {
    switch (tabName) {
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
    }
}

// ============================================================================
// 🎯 DASHBOARD - Cargar y mostrar datos principales
// ============================================================================

async function loadDashboard() {
    try {
        // Mostrar loading
        document.getElementById('planEntrenamientos').innerHTML = '<p class="loading">Cargando...</p>';
        document.getElementById('planComidas').innerHTML = '<p class="loading">Cargando...</p>';
        document.getElementById('ultimasMediciones').innerHTML = '<p class="loading">Cargando...</p>';
        
        // Traer datos del servidor
        const response = await fetch(`${GAS_WEB_APP_URL}?action=getAll`);
        const result = await response.json();
        
        if (result.status === 'success') {
            const data = result.data;
            
            // Guardar en caché
            cache.plan = data.plan;
            cache.historicoEntrenamientos = data.historicoEntrenamientos;
            cache.historicoComidas = data.historicoComidas;
            cache.mediciones = data.mediciones;
            cache.lastUpdate = new Date().toLocaleTimeString('es-ES');
            
            // Renderizar vistas
            renderPlanEntrenamientos(data.plan.entrenamientos);
            renderPlanComidas(data.plan.comidas);
            renderUltimasMediciones(data.mediciones);
        } else {
            mostrarError('Error al cargar el dashboard', 'planEntrenamientos');
            console.error('Error en respuesta GAS:', result);
        }
    } catch (error) {
        console.error('❌ Error cargando dashboard:', error);
        mostrarError('No se pudo conectar con el servidor', 'planEntrenamientos');
    }
}

// Renderizar plan de entrenamientos
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

// Renderizar plan de comidas
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

// Renderizar últimas mediciones (últimas 5)
function renderUltimasMediciones(mediciones) {
    const container = document.getElementById('ultimasMediciones');
    
    if (!mediciones || mediciones.length === 0) {
        container.innerHTML = '<p style="color: #999;">No hay mediciones registradas</p>';
        return;
    }
    
    // Tomar últimas 5 mediciones
    const ultimas = mediciones.slice(-5).reverse();
    
    const html = ultimas.map(med => {
        let detalles = [];
        if (med.Peso_kg) detalles.push(`Peso: <strong>${med.Peso_kg} kg</strong>`);
        if (med['Grasa_Corporal (%)']) detalles.push(`Grasa: <strong>${med['Grasa_Corporal (%)']}%</strong>`);
        if (med['Circunferencia_Cintura (cm)']) detalles.push(`Cintura: <strong>${med['Circunferencia_Cintura (cm)']} cm</strong>`);
        
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
// 📊 HISTÓRICOS - Cargar y mostrar tablas detalladas
// ============================================================================

async function loadHistoricoEntrenamientos() {
    try {
        const container = document.getElementById('historicoEntrenamientos');
        container.innerHTML = '<p class="loading">Cargando histórico...</p>';
        
        const response = await fetch(`${GAS_WEB_APP_URL}?action=getHistoricoEntrenamientos`);
        const result = await response.json();
        
        if (result.status === 'success') {
            renderTablaEntrenamientos(result.data.entrenamientos, container);
        } else {
            throw new Error(result.data);
        }
    } catch (error) {
        console.error('❌ Error cargando entrenamientos:', error);
        document.getElementById('historicoEntrenamientos').innerHTML = 
            '<p style="color: red;">Error al cargar el histórico</p>';
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
        } else {
            throw new Error(result.data);
        }
    } catch (error) {
        console.error('❌ Error cargando comidas:', error);
        document.getElementById('historicoComidas').innerHTML = 
            '<p style="color: red;">Error al cargar el histórico</p>';
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
        } else {
            throw new Error(result.data);
        }
    } catch (error) {
        console.error('❌ Error cargando mediciones:', error);
        document.getElementById('mediacionesDetalladas').innerHTML = 
            '<p style="color: red;">Error al cargar las mediciones</p>';
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
// 📝 FORMULARIOS - Setup y manejo de eventos
// ============================================================================

function setupFormHandlers() {
    // Tabs dentro de la sección de registrar
    const formTabBtns = document.querySelectorAll('.form-tab-btn');
    
    formTabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const formId = e.currentTarget.dataset.form;
            
            // Remover clase activa de todos los botones
            formTabBtns.forEach(b => b.classList.remove('form-tab-btn--active'));
            e.currentTarget.classList.add('form-tab-btn--active');
            
            // Ocultar todos los formularios
            const allForms = document.querySelectorAll('.form');
            allForms.forEach(form => form.classList.remove('form--visible'));
            
            // Mostrar el formulario seleccionado
            const selectedForm = document.getElementById(formId);
            if (selectedForm) {
                selectedForm.classList.add('form--visible');
            }
        });
    });
    
    // Listeners para los formularios
    document.getElementById('form-entrenamiento').addEventListener('submit', submitEntrenamiento);
    document.getElementById('form-comida').addEventListener('submit', submitComida);
    document.getElementById('form-medicion').addEventListener('submit', submitMedicion);
    
    // Establecer fecha de hoy por defecto en los inputs
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('ent-fecha').value = hoy;
    document.getElementById('com-fecha').value = hoy;
    document.getElementById('med-fecha').value = hoy;
}

// ============================================================================
// 🏋️ FORMULARIO 1 - REGISTRAR ENTRENAMIENTO
// ============================================================================

async function submitEntrenamiento(e) {
    e.preventDefault();
    
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    const feedback = document.getElementById('form-entrenamiento-feedback');
    
    try {
        btnSubmit.disabled = true;
        btnSubmit.textContent = '⏳ Guardando...';
        
        const payload = {
            fecha: document.getElementById('ent-fecha').value,
            tipo: document.getElementById('ent-tipo').value,
            duracion: parseInt(document.getElementById('ent-duracion').value),
            detalles: document.getElementById('ent-detalles').value,
            notas: document.getElementById('ent-notas').value
        };
        
        // Validación
        if (!payload.fecha || !payload.tipo || !payload.duracion) {
            throw new Error('Por favor completa los campos requeridos');
        }
        
        // POST request
        const response = await fetch(`${GAS_WEB_APP_URL}?type=entrenamientoHistorico`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            // Limpiar formulario
            e.target.reset();
            document.getElementById('ent-fecha').value = new Date().toISOString().split('T')[0];
            
            // Mostrar éxito
            mostrarExito('✅ Entrenamiento guardado correctamente', feedback);
            
            // Recargar datos
            setTimeout(() => loadDashboard(), 1500);
        } else {
            throw new Error(result.data);
        }
    } catch (error) {
        console.error('❌ Error:', error);
        mostrarErrorFeedback(error.message, feedback);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Guardar Entrenamiento';
    }
}

// ============================================================================
// 🍽️ FORMULARIO 2 - REGISTRAR COMIDA
// ============================================================================

async function submitComida(e) {
    e.preventDefault();
    
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    const feedback = document.getElementById('form-comida-feedback');
    
    try {
        btnSubmit.disabled = true;
        btnSubmit.textContent = '⏳ Guardando...';
        
        const payload = {
            fecha: document.getElementById('com-fecha').value,
            tipo_comida: document.getElementById('com-tipo').value,
            calorias: parseInt(document.getElementById('com-calorias').value) || 0,
            macros: document.getElementById('com-macros').value,
            descripcion: document.getElementById('com-descripcion').value
        };
        
        // Validación
        if (!payload.fecha || !payload.tipo_comida) {
            throw new Error('Por favor completa los campos requeridos');
        }
        
        // POST request
        const response = await fetch(`${GAS_WEB_APP_URL}?type=comidaHistorico`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            // Limpiar formulario
            e.target.reset();
            document.getElementById('com-fecha').value = new Date().toISOString().split('T')[0];
            
            // Mostrar éxito
            mostrarExito('✅ Comida registrada correctamente', feedback);
            
            // Recargar datos
            setTimeout(() => loadDashboard(), 1500);
        } else {
            throw new Error(result.data);
        }
    } catch (error) {
        console.error('❌ Error:', error);
        mostrarErrorFeedback(error.message, feedback);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Guardar Comida';
    }
}

// ============================================================================
// ⚖️ FORMULARIO 3 - REGISTRAR MEDICIÓN
// ============================================================================

async function submitMedicion(e) {
    e.preventDefault();
    
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    const feedback = document.getElementById('form-medicion-feedback');
    
    try {
        btnSubmit.disabled = true;
        btnSubmit.textContent = '⏳ Guardando...';
        
        const payload = {
            fecha: document.getElementById('med-fecha').value,
            peso: parseFloat(document.getElementById('med-peso').value) || '',
            grasa_corporal: parseFloat(document.getElementById('med-grasa').value) || '',
            circunferencia_cintura: parseFloat(document.getElementById('med-cintura').value) || '',
            notas: document.getElementById('med-notas').value
        };
        
        // Validación
        if (!payload.fecha) {
            throw new Error('Por favor completa la fecha');
        }
        
        // POST request
        const response = await fetch(`${GAS_WEB_APP_URL}?type=medicion`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            // Limpiar formulario
            e.target.reset();
            document.getElementById('med-fecha').value = new Date().toISOString().split('T')[0];
            
            // Mostrar éxito
            mostrarExito('✅ Medición guardada correctamente', feedback);
            
            // Recargar datos
            setTimeout(() => loadDashboard(), 1500);
        } else {
            throw new Error(result.data);
        }
    } catch (error) {
        console.error('❌ Error:', error);
        mostrarErrorFeedback(error.message, feedback);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Guardar Medición';
    }
}

// ============================================================================
// 💬 UTILIDADES - Mostrar mensajes
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

function mostrarError(mensaje, elementId) {
    const elemento = document.getElementById(elementId);
    if (elemento) {
        elemento.innerHTML = `<p style="color: red; text-align: center;">⚠️ ${mensaje}</p>`;
    }
}

// ============================================================================
// 🔍 ÚTILES - Funciones auxiliares
// ============================================================================

// Formatear fecha al formato español
function formatearFecha(fecha) {
    const date = new Date(fecha);
    return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Log en desarrollo
function log(mensaje, datos = null) {
    console.log(`🔔 ${mensaje}`, datos || '');
}

// ============================================================================
// ⚠️ MANEJO DE ERRORES GLOBALES
// ============================================================================

window.addEventListener('error', (event) => {
    console.error('❌ Error global:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ Promise rechazada:', event.reason);
});
