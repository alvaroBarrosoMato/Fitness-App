# 🏋️ Iron Log — Fitness App

> Diario de entrenamiento personal con backend en Google Sheets y frontend web mobile-first.

Una aplicación de seguimiento de entrenamientos diseñada como diario de fuerza e hipertrofia. Arquitectura minimalista: los datos viven en Google Sheets, una Apps Script Web App expone una API REST, y un frontend estático (HTML/CSS/JS vanilla) los consume desde GitHub Pages.

**Demo:** https://alvarobarrosomato.github.io/Fitness-App/

---

## ✨ Características

- **📋 Entrenamientos planeados** — Visualización agrupada por día con tarjeta destacada para "Hoy" (o "Día de descanso" si no hay sesión programada).
- **📊 Historial completado** — Timeline inversa de sesiones pasadas con objetivo vs. conseguido para comparar progreso.
- **▶️ Runner full-screen** — Flujo horizontal swipeable para ejecutar un entrenamiento en vivo, pantalla por ejercicio, con guardado automático al pasar de slide.
- **✍️ Captura de pesos conseguidos** — Input grande por ejercicio con el objetivo como placeholder. Si no se toca, asume que se cumplió el objetivo.
- **📝 Notas de sesión** — Slide final de resumen con textarea para observaciones (energía, conexión mente-músculo, etc.).
- **🎨 Diseño editorial oscuro** — Bebas Neue + Fraunces + JetBrains Mono, acento lima sobre negro, textura de grano.
- **📱 Mobile-first** — Viewport con safe-areas, tap targets grandes, swipe nativo, sticky tabs, sin zoom accidental.
- **🐛 Panel de debug embebido** — Log completo accesible tocando la statusbar (útil en móvil sin consola).

---

## 🏗 Arquitectura

```
┌─────────────────────────────────┐
│  Google Sheet (datos)           │
│  "Entrenamientos" tab           │
└────────────┬────────────────────┘
             │ SpreadsheetApp
             ▼
┌─────────────────────────────────┐
│  Apps Script Web App (Code.gs)  │
│  doGet / doPost → JSON REST API │
└────────────┬────────────────────┘
             │ fetch (text/plain para evitar CORS preflight)
             ▼
┌─────────────────────────────────┐
│  Frontend estático              │
│  index.html · styles.css · app.js│
│  Servido desde GitHub Pages     │
└─────────────────────────────────┘
```

### Modelo de datos

La hoja **NO** almacena entrenamientos como entidades. Cada fila es **un ejercicio/serie**. Un "entrenamiento" es la agrupación lógica de todas las filas que comparten la misma combinación `(Día, Rutina)`.

**Columnas de la hoja:**

| Col | Nombre | Tipo | Ejemplo |
|-----|--------|------|---------|
| A | Día | Date | `2026-04-14` |
| B | Rutina | string | `Pecho y Tríceps` |
| C | Ejercicio | string | `Bench Press Barra` |
| D | Series | number | `4` |
| E | Reps | string | `8-10` |
| F | KG/Detalles (Objetivo) | string | `4x60kg` |
| G | Objetivo/Notas | string | `Progresión` |
| H | KG/Detalles (Conseguidos) | string | `4x62.5kg` |
| I | Estado | string | `Planeado` \| `Completado` \| `Fallido` \| `Saltado` |

> ⚠️ **Importante:** Las columnas E, F, H deben estar formateadas como **"Texto sin formato"** en Google Sheets, de lo contrario valores como `8-10` se convierten automáticamente en fechas.

---

## 🔌 API (Apps Script)

**Base URL:** `https://script.google.com/macros/s/.../exec`

Todas las respuestas devuelven JSON:
```json
{ "ok": true,  "data": ... }
{ "ok": false, "error": "mensaje" }
```

### Endpoints de lectura (GET)

| Endpoint | Descripción |
|----------|-------------|
| `?action=ping` | Health check |
| `?action=getExercises&...` | Filas planas con filtros |
| `?action=getWorkouts&...` | Ejercicios agrupados por `(fecha, rutina)` |
| `?action=getWorkout&date=...&routine=...` | Un entrenamiento concreto |
| `?action=getRoutines` | Rutinas únicas |
| `?action=getStats&...` | Totales, desglose por estado y rutina |

**Filtros comunes** (GET, opcionales, combinables con AND):
`date`, `dateFrom`, `dateTo`, `routine`, `routineContains`, `exercise`, `exerciseContains`, `status`, `statusIn`, `limit`, `offset`, `sort=date_asc|date_desc`.

### Endpoints de escritura (POST)

| Endpoint | Body JSON |
|----------|-----------|
| `?action=createWorkout` | `{ date, routine, status?, exercises: [...] }` |
| `?action=createExercise` | `{ date, routine, exercise, sets, reps, targetDetails, notes, achievedDetails, status }` |
| `?action=updateExercise` | `{ match: {rowNumber OR date+routine+exercise}, updates: {...} }` |
| `?action=updateWorkout` | `{ match: {date, routine}, updates: {...} }` |
| `?action=deleteExercise` | `{ match: {rowNumber OR date+routine+exercise} }` |
| `?action=deleteWorkout` | `{ match: {date, routine} }` |

### Estado derivado del entrenamiento

El estado de un entrenamiento completo se deriva del estado de sus ejercicios:
- Todos iguales → ese estado
- Alguno `Fallido` → `Fallido` (prioridad)
- Resto de mezclas → estado mayoritario

---

## 📱 Frontend

### Estructura de ficheros

```
/
├── index.html       # Estructura + viewport + imports
├── styles.css       # Sistema de diseño completo
├── app.js           # Lógica, API, runner, render
├── Code.gs          # Apps Script backend (no se sirve)
└── README.md
```

### Dos pestañas principales

#### 1. **Entrenamientos Planeados** (`getWorkouts?status=Planeado`)

- **Slot "Hoy"** destacado como primer bloque:
  - Si hay entrenamiento hoy → tarjeta con borde lima y glow
  - Si no → tarjeta "Día de descanso" con tipografía grande `REST DAY` de fondo
- **Próximas sesiones** agrupadas por día (orden ascendente)
- Cada tarjeta es expandible: muestra ejercicios con objetivo, series×reps y notas
- **Botones por tarjeta:**
  - `▶ Iniciar` → abre el Runner
  - `Saltar` → marca como `Saltado` (`updateWorkout`)
  - `▶ Continuar sesión` → si el workout está "En Progreso" local

#### 2. **Entrenamientos Pasados** (`getWorkouts?status=Completado`)

- Timeline inversa (más reciente primero)
- Cada ejercicio muestra **Objetivo** (lima) vs **Conseguido** (cian) para comparación visual

### Runner (modo ejecución de entrenamiento)

Al pulsar **▶ Iniciar** se abre un overlay a pantalla completa con:

1. **Cabecera** con nombre de rutina + contador `Ejercicio X/Y` + barra de progreso cian.
2. **Carrusel horizontal swipeable** (`scroll-snap-type: x mandatory`) con una slide por ejercicio:
   - Nombre grande en Bebas Neue
   - Series × Reps destacados
   - Bloque "Objetivo de pesos"
   - Input grande "Conseguido" con placeholder = objetivo
3. **Guardado automático** al avanzar de slide: llama `updateExercise` con el `achievedDetails` introducido.
4. **Slide final de resumen:**
   - Lista de todos los ejercicios con `objetivo → conseguido`
   - Textarea para notas de la sesión
   - Botón `✓ Completar entrenamiento` → marca todos como `Completado` y aplica el fallback "cumplió objetivo" si no se tocó el input
   - Botón `Marcar como fallido` → `updateWorkout status=Fallido`
5. **Navegación:** dots inferiores, botones Anterior/Siguiente, swipe táctil, flechas de teclado, `ESC` para cerrar.

### Estados visuales de tarjeta (barra lateral)

| Estado | Color | Animación |
|--------|-------|-----------|
| Planeado | Amarillo | — |
| En Progreso (UI) | Cian | Pulsante |
| Completado | Lima | — |
| Fallido | Rojo | — |
| Saltado | Gris | — |

> Nota: `En Progreso` es un estado **local UI-only**, no se persiste en el backend.

---

## 🎨 Sistema de diseño

**Estética:** editorial deportiva oscura, inspirada en revistas de fuerza y paneles industriales.

**Tipografía:**
- **Display:** Bebas Neue (títulos, números grandes)
- **Serif:** Fraunces (párrafos, itálicas editoriales)
- **Mono:** JetBrains Mono (datos, labels, métricas)

**Paleta:**
```css
--bg:       #0a0a0a   /* Negro profundo */
--bg-card:  #181818
--ink:      #f5f1e8   /* Crema */
--accent:   #d4ff3a   /* Lima neón (principal) */
--progress: #4af0ff   /* Cian (en progreso) */
--danger:   #ff5544
--warn:     #ffaa00
```

**Detalles:**
- Textura de grano SVG en overlay global
- Gradientes radiales sutiles de fondo
- Barra lateral de color por estado en cada tarjeta
- Sticky tabs con backdrop blur
- Mark rotativo decorativo en el header

---

## 🐛 Debug embebido

La statusbar es clickable — al tocarla se despliega un panel de log desde abajo con:

- Buffer circular de los últimos 300 eventos (API, acciones, errores, renders)
- Timestamps, tags por categoría, stack traces
- Botones **COPIAR** (portapapeles) / **REINTENTAR** (re-fetch) / **OCULTAR**
- Apertura automática ante errores de `loadAll()`

Útil especialmente en móvil donde no hay consola accesible.

---

## 🚀 Deployment

### Backend (Apps Script)

1. Abrir el Google Sheet, menú **Extensiones → Apps Script**
2. Pegar `Code.gs`, guardar
3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copiar la URL `/exec` y ponerla en `app.js` → `API_URL`

> En cada cambio del Code.gs: `Deploy → Manage deployments → Edit → New version → Deploy`. La URL no cambia.

### Frontend (GitHub Pages)

1. Push de `index.html`, `styles.css`, `app.js` a la rama `main`
2. **Settings → Pages → Source: main / (root)**
3. Listo en `https://<user>.github.io/<repo>/`

---

## 📋 Roadmap

- [ ] Crear entrenamientos desde la UI (formulario)
- [ ] Editar entrenamientos planeados
- [ ] Vista de estadísticas y progresión por ejercicio
- [ ] Plantillas de rutinas reutilizables
- [ ] Gráficas de volumen y carga total por sesión
- [ ] PR tracking (personal records)
- [ ] Timer de descanso entre series dentro del runner
- [ ] Export a CSV/PDF
- [ ] Integración con wearables (Apple Health, Garmin)
- [ ] Modo offline con sincronización diferida

---

## 🛠 Tech stack

- **Backend:** Google Apps Script (V8 runtime)
- **Base de datos:** Google Sheets
- **Frontend:** HTML5 + CSS3 + JavaScript vanilla (sin build, sin dependencias)
- **Hosting:** GitHub Pages
- **Tipografías:** Google Fonts (Bebas Neue, Fraunces, JetBrains Mono)

**Sin** React, Vue, bundlers, frameworks CSS, ni dependencias npm. Un único fichero JS de ~1000 líneas, editable desde cualquier sitio.

---

## 📄 Licencia

Proyecto personal. Úsalo como inspiración si te resulta útil.
