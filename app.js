// ============================================================================
// ASISTENTE PERSONAL DE FITNESS - app.js PERSONALIZADO
// Adaptado al formato: Día | Rutina | Ejercicio | Series | Reps | Objetivo
// ============================================================================

// 📌 REEMPLAZA CON TU URL DEL WEB APP
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyTcNRnAbU85clI_0B-nxuRiZ2ZcnPxrd1euz4693fph6_KCj7Cgk60dHGIIXm8b0WSkw/exec';

const cache = {
    planificados: null,
    pasados: null,
    lastUpdate: null
};

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 Fitness App iniciado (Formato Personalizado)');
    setupNavigation();
    loadDashboard();
});

// ============================================================================
// NAVEGACIÓN
// ============================================================================

function setupNavigation() {
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
        case 'planificados':
            loadPlanificados();
            break;
        case 'pasados':
            loadPasados();
            break;
        case 'dashboard':
            loadDashboard();
            break;
    }
}

// ============================================================================
// DASHBOARD - VISTA PRINCIPAL
// ============================================================================

async function loadDashboard() {
    try {
        console.log('📊 Cargando Dashboard...');
        
        const container = document.getElementById('dashboard-content');
        if (!container) {
            console.log('No encontré dashboard-content');
            return;
        }
        
        container.innerHTML = '<p class="loading">Cargando datos...</p>';
        
        const url = `${GAS_WEB_APP_URL}?action=getAll`;
        console.log('Fetching:', url);
        
        const response = await fetch(url);
        const result = await response.json();
        
        console.log('📦 Respuesta:', result);
        
        if (result.status === 'success') {
            // CAMBIO AQUÍ - Acceder a planificados y pasados directamente
            const planificados = result.data.planificados?.entrenamientos || [];
            const pasados = result.data.pasados?.entrenamientos || [];
            
            cache.planificados = planificados;
            cache.pasados = pasados;
            
            let html = '<div class="grid grid--2col">';
            
            // Entrenamientos Planificados (próximos 5)
            html += '<div class="card">';
            html += '<h3>📅 Próximos Entrenamientos</h3>';
            
            if (planificados.length > 0) {
                html += '<ul style="padding-left: 20px;">';
                planificados.slice(0, 5).forEach(ent => {
                    html += `<li>
                        <strong>${ent['Día'] || ent.Día || 'N/A'}</strong> - ${ent['Rutina'] || ent.Rutina || 'N/A'}<br>
                        <small>${ent['Ejercicio'] || ent.Ejercicio || 'N/A'} (${ent['Series'] || ent.Series || '-'} x ${ent['Reps'] || ent.Reps || '-'})</small>
                    </li>`;
                });
                html += '</ul>';
            } else {
                html += '<p style="color: #999;">Sin entrenamientos planificados</p>';
            }
            html += '</div>';
            
            // Últimos Entrenamientos Completados
            html += '<div class="card">';
            html += '<h3>✅ Últimos Completados</h3>';
            
            if (pasados.length > 0) {
                html += '<ul style="padding-left: 20px;">';
                pasados.slice(-5).reverse().forEach(ent => {
                    html += `<li>
                        <strong>${ent['Día'] || ent.Día || 'N/A'}</strong> - ${ent['Rutina'] || ent.Rutina || 'N/A'}<br>
                        <small>${ent['Ejercicio'] || ent.Ejercicio || 'N/A'} (${ent['Series'] || ent.Series || '-'} x ${ent['Reps'] || ent.Reps || '-'} x ${ent['KG / Detalles'] || ent.KG || '-'}kg)</small>
                    </li>`;
                });
                html += '</ul>';
            } else {
                html += '<p style="color: #999;">Sin entrenamientos registrados</p>';
            }
            html += '</div>';
            
            html += '</div>';
            container.innerHTML = html;
            
            console.log('✅ Dashboard cargado exitosamente');
        } else {
            container.innerHTML = '<p style="color: red;">Error: ' + (result.data || 'Desconocido') + '</p>';
            console.error('Error:', result);
        }
    } catch (error) {
        console.error('❌ Error en loadDashboard:', error);
        const container = document.getElementById('dashboard-content');
        if (container) {
            container.innerHTML = '<p style="color: red;">Error: ' + error.message + '</p>';
        }
    }
}

// ============================================================================
// ENTRENAMIENTOS PLANIFICADOS
// ============================================================================

async function loadPlanificados() {
    try {
        console.log('📋 Cargando Planificados...');
        
        const url = `${GAS_WEB_APP_URL}?action=getPlanificados`;
        const response = await fetch(url);
        const result = await response.json();
        
        console.log('Planificados:', result);
        
        if (result.status === 'success') {
            const entrenamientos = result.data.entrenamientos || [];
            renderPlanificados(entrenamientos);
        }
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

function renderPlanificados(entrenamientos) {
    const container = document.getElementById('planificados-list');
    
    if (!container) {
        console.log('No encontré planificados-list');
        return;
    }
    
    if (!entrenamientos || entrenamientos.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center;">Sin entrenamientos planificados</p>';
        return;
    }
    
    // Agrupar por día
    const porDia = {};
    entrenamientos.forEach(ent => {
        const dia = ent['Día'] || ent.Día || 'Sin día';
        if (!porDia[dia]) porDia[dia] = [];
        porDia[dia].push(ent);
    });
    
    let html = '';
    Object.keys(porDia).forEach(dia => {
        html += `<div class="card">`;
        html += `<h4>${dia}</h4>`;
        html += `<table style="width: 100%; font-size: 13px; border-collapse: collapse;">`;
        html += `<tr style="background: #f0f0f0;">
                    <th style="padding: 8px; text-align: left;">Rutina</th>
                    <th style="padding: 8px; text-align: left;">Ejercicio</th>
                    <th style="padding: 8px; text-align: center;">Series</th>
                    <th style="padding: 8px; text-align: center;">Reps</th>
                    <th style="padding: 8px; text-align: left;">Objetivo</th>
                </tr>`;
        
        porDia[dia].forEach(ent => {
            html += `<tr style="border-bottom: 1px solid #ddd;">
                        <td style="padding: 8px;">${ent['Rutina'] || ent.Rutina || '-'}</td>
                        <td style="padding: 8px;">${ent['Ejercicio'] || ent.Ejercicio || '-'}</td>
                        <td style="padding: 8px; text-align: center;">${ent['Series'] || ent.Series || '-'}</td>
                        <td style="padding: 8px; text-align: center;">${ent['Reps'] || ent.Reps || '-'}</td>
                        <td style="padding: 8px;">${ent['Objetivo'] || ent.Objetivo || '-'}</td>
                    </tr>`;
        });
        
        html += `</table>`;
        html += `</div>`;
    });
    
    container.innerHTML = html;
}

// ============================================================================
// ENTRENAMIENTOS PASADOS
// ============================================================================

async function loadPasados() {
    try {
        console.log('📊 Cargando Pasados...');
        
        const url = `${GAS_WEB_APP_URL}?action=getPasados`;
        const response = await fetch(url);
        const result = await response.json();
        
        console.log('Pasados:', result);
        
        if (result.status === 'success') {
            const entrenamientos = result.data.entrenamientos || [];
            renderPasados(entrenamientos);
        }
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

function renderPasados(entrenamientos) {
    const container = document.getElementById('pasados-list');
    
    if (!container) {
        console.log('No encontré pasados-list');
        return;
    }
    
    if (!entrenamientos || entrenamientos.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center;">Sin entrenamientos registrados</p>';
        return;
    }
    
    let html = `<table style="width: 100%; font-size: 13px; border-collapse: collapse;">`;
    html += `<tr style="background: #f0f0f0; position: sticky; top: 0;">
                <th style="padding: 8px; text-align: left;">Día</th>
                <th style="padding: 8px; text-align: left;">Rutina</th>
                <th style="padding: 8px; text-align: left;">Ejercicio</th>
                <th style="padding: 8px; text-align: center;">Series</th>
                <th style="padding: 8px; text-align: center;">Reps</th>
                <th style="padding: 8px; text-align: center;">Kg</th>
                <th style="padding: 8px; text-align: left;">Notas</th>
            </tr>`;
    
    entrenamientos.forEach(ent => {
        html += `<tr style="border-bottom: 1px solid #ddd;">
                    <td style="padding: 8px;">${ent['Día'] || ent.Día || '-'}</td>
                    <td style="padding: 8px;">${ent['Rutina'] || ent.Rutina || '-'}</td>
                    <td style="padding: 8px;">${ent['Ejercicio'] || ent.Ejercicio || '-'}</td>
                    <td style="padding: 8px; text-align: center;">${ent['Series'] || ent.Series || '-'}</td>
                    <td style="padding: 8px; text-align: center;">${ent['Reps'] || ent.Reps || '-'}</td>
                    <td style="padding: 8px; text-align: center;">${ent['KG / Detalles'] || ent.KG || '-'}</td>
                    <td style="padding: 8px;">${ent['Objetivo / Notas'] || ent.Notas || '-'}</td>
                </tr>`;
    });
    
    html += `</table>`;
    container.innerHTML = html;
}
