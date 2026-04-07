# Fitness App 💪

Personal fitness tracking web app with a Google Sheets backend and a Google Apps Script API. Designed to log workouts (planned → in-progress → completed), track weights/sets/reps per exercise, and be fully consumable from the web UI **or** from external clients like AI agents.

---

## Table of contents

1. [Architecture overview](#architecture-overview)
2. [Data model](#data-model)
3. [Google Apps Script API](#google-apps-script-api)
4. [Web interface](#web-interface)
5. [Setup & deployment](#setup--deployment)
6. [Consuming the API from AI agents / external clients](#consuming-the-api-from-ai-agents--external-clients)
7. [Troubleshooting](#troubleshooting)
8. [Roadmap](#roadmap)

---

## Architecture overview

```
┌─────────────────┐        HTTPS        ┌──────────────────────┐        ┌─────────────────┐
│  Web Frontend   │  ─────────────────▶ │  Google Apps Script  │ ─────▶ │  Google Sheets  │
│ (static HTML/JS)│  ◀───────────────── │   (doGet / doPost)   │ ◀───── │ "Entrenamientos"│
└─────────────────┘     JSON responses  └──────────────────────┘        └─────────────────┘
        ▲                                          ▲
        │                                          │
        │                                          │
 Any other client                           AI agents, cron jobs,
 (AI agents, CLI…)                          mobile apps, scripts…
```

- **Frontend**: Plain HTML/CSS/JS (no framework, no build step). Hosted statically anywhere (GitHub Pages, Netlify, local file…).
- **Backend**: A single Google Apps Script Web App acting as a REST-ish API layer over a Google Sheet. Returns JSON for every call.
- **Database**: One Google Sheet (`Entrenamientos`) with one row per **exercise** (not per workout). Workouts are logical groups of rows sharing the same `Día` + `Rutina`.

---

## Data model

### One unified sheet: `Entrenamientos`

Previously the app used two sheets (`Entrenamientos Planificados` and `Entrenamientos Pasados`). This was replaced with a **single table** and a `Estado` column. Clients (web UI, agents) are responsible for grouping and filtering.

| Column | Header                            | Type   | Description                                                 |
|-------:|-----------------------------------|--------|-------------------------------------------------------------|
| A      | `Día`                             | date   | `YYYY-MM-DD`                                                |
| B      | `Rutina`                          | text   | e.g. *Pecho y Tríceps*                                      |
| C      | `Ejercicio`                       | text   | e.g. *Bench Press Barra*                                    |
| D      | `Series`                          | text   | Planned number of sets                                      |
| E      | `Reps`                            | text   | Planned reps (can be composite like `"8,8,6,6"`)            |
| F      | `KG / Detalles (Objetivo)`        | text   | Target weight / notation (e.g. `"4x60kg, 3x55kg"`)          |
| G      | `Objetivo / Notas`                | text   | Goal / subjective notes                                     |
| H      | `KG / Detalles (Conseguidos)`     | text   | Actually achieved (filled on "Complete workout")            |
| I      | `Estado`                          | enum   | `Planeado` \| `Completado` \| `Fallado`                     |

> **Important**: columns D, E, F and H are forced to **text format** (`@`) by the Apps Script setup function. Without this, Google Sheets will auto-parse strings like `"8-5"` or `"8,5"` into `Date` objects, which is what caused the bug where Reps were rendered as ISO timestamps.

### Why one row per exercise?

- Easier to query: filter/update/complete individual exercises.
- Natural fit for progressive-overload tracking.
- Grouping is cheap on the client and keeps the sheet flat and analyzable.

---

## Google Apps Script API

**File**: `Code.gs`
**Base URL**: your deployed Web App URL (`.../exec`)

All endpoints return:

```json
{ "status": "success" | "error", "data": <payload> }
```

`GET` is used for reads and `POST` (with `Content-Type: text/plain` to avoid CORS preflight) is used for writes. For convenience, all write actions also accept `GET` so they can be triggered from AI agents that only support URL-based tools.

### Read endpoints

| Action                   | Params                                      | Returns                                                              |
|--------------------------|---------------------------------------------|----------------------------------------------------------------------|
| `ping`                   | —                                           | `{ ok: true, time }`                                                 |
| `getAll`                 | —                                           | `{ total, ejercicios, planeados, completados, fallados }`            |
| `getExercises`           | `estado?` (`Planeado`/`Completado`/`Fallado`)| `{ ejercicios: [...] }` — flat list                                  |
| `getWorkouts`            | `estado?`                                   | `{ workouts: [{dia, rutina, ejercicios, estado}] }` — grouped        |
| `getWorkout`             | `dia` (required), `rutina?`                 | `{ dia, rutina, ejercicios }`                                        |

Every exercise in the response has a `rowId` field (1-based sheet row number) — this is the handle you pass back to update/delete it.

### Write endpoints

| Action                  | Payload                                                                                             | Description                                          |
|-------------------------|-----------------------------------------------------------------------------------------------------|------------------------------------------------------|
| `createExercise`        | `{ Día, Rutina, Ejercicio, Series, Reps, "KG / Detalles (Objetivo)", "Objetivo / Notas", Estado }` | Append a single exercise row.                        |
| `createWorkout`         | `{ dia, rutina, estado?, ejercicios: [{...}] }`                                                     | Append multiple exercises that share Día + Rutina.   |
| `updateExercise`        | `{ rowId, fields: { ... } }`                                                                        | Partial update; only provided fields are overwritten.|
| `updateExercisesBatch`  | `{ updates: [{rowId, fields}, ...] }`                                                               | Multiple updates in one call.                        |
| `deleteExercise`        | `{ rowId }`                                                                                         | Delete the row.                                      |
| `setStatus`             | `{ rowId, estado }`                                                                                 | Shortcut to change only the `Estado`.                |
| `startWorkout`          | `{ dia, rutina }`                                                                                   | Returns the workout (read-only convenience).         |
| `completeWorkout`       | `{ dia, rutina, exercises: [{rowId, kgConseguidos, estado?, reps?, series?, notas?}] }`             | Writes achieved values + sets status to Completado.  |

### Field aliases

Every write endpoint accepts both the Spanish header names and friendlier aliases — pick whichever is easier for your client:

| Header                          | Aliases                                 |
|---------------------------------|-----------------------------------------|
| `Día`                           | `dia`, `date`, `fecha`                  |
| `Rutina`                        | `rutina`                                |
| `Ejercicio`                     | `ejercicio`                             |
| `Series`                        | `series`, `sets`                        |
| `Reps`                          | `reps`, `repeticiones`                  |
| `KG / Detalles (Objetivo)`      | `kgObjetivo`, `kg_objetivo`             |
| `Objetivo / Notas`              | `notas`, `objetivo`, `notes`            |
| `KG / Detalles (Conseguidos)`   | `kgConseguidos`, `kg_conseguidos`       |
| `Estado`                        | `estado`, `status`                      |

### Example payloads

**Create a full workout (POST):**

```json
{
  "action": "createWorkout",
  "dia": "2026-04-10",
  "rutina": "Pecho y Tríceps",
  "ejercicios": [
    { "ejercicio": "Bench Press Barra", "series": "4", "reps": "8", "kgObjetivo": "60kg", "notas": "Progresar 2.5kg" },
    { "ejercicio": "Banco Inclinado",   "series": "4", "reps": "10", "kgObjetivo": "45kg" }
  ]
}
```

**Complete a workout (POST):**

```json
{
  "action": "completeWorkout",
  "dia": "2026-04-10",
  "rutina": "Pecho y Tríceps",
  "exercises": [
    { "rowId": 12, "kgConseguidos": "4x60kg", "estado": "Completado" },
    { "rowId": 13, "kgConseguidos": "2x45kg, 2x42.5kg", "estado": "Fallado", "notas": "Últimas series fallé" }
  ]
}
```

---

## Web interface

Three main tabs plus a modal:

- **📊 Dashboard** — at-a-glance upcoming workouts + last completed, with a ▶ Comenzar button.
- **📅 Planificados** — planned workouts grouped by day, each with a ▶ Comenzar button.
- **✅ Histórico** — past workouts **grouped by date** (fixing the old flat table view) with per-exercise status badges.
- **➕ Nuevo** — form to create a new planned workout with N exercises inline.
- **Workout modal** — opens when you click ▶ Comenzar. Shows every exercise as an editable row so you can enter what you actually lifted (Series / Reps / Kg / Estado), then submits everything in a single `completeWorkout` call.

### The date-rendering bug

The previous version displayed things like `2026-08-05T22:00:00.000Z` inside the Reps and Kg columns. Two things caused it and both are fixed:

1. **Root cause**: Google Sheets was auto-parsing strings like `"8-5"` (e.g. *series x reps*) in the Reps column into `Date` cells. `Code.gs` now calls `setNumberFormat('@')` on columns D/E/F/H so that new entries stay as text, and exposes a `fixCorruptedDateCells()` one-off for rows already broken.
2. **Frontend defense**: `app.js` has a `displayValue()` helper that, if it still sees an ISO string in a non-date field, truncates it to `YYYY-MM-DD` and flags it with ⚠️ so you can spot and re-enter it manually.

---

## Setup & deployment

### 1. Google Apps Script backend

1. Open your spreadsheet → **Extensions → Apps Script**.
2. Delete any existing code, paste the contents of `Code.gs`.
3. Confirm the `SHEET_ID` constant at the top matches your sheet.
4. Run `setupSheet()` once from the editor — this creates/normalizes the `Entrenamientos` sheet and forces text format on the numeric-looking columns.
5. (Optional) Run `fixCorruptedDateCells()` if you already have rows where Reps/Kg got converted into Date objects.
6. **Deploy → New deployment → Web app**:
   - Execute as: *Me*
   - Who has access: *Anyone* (required for public API access)
7. Copy the `/exec` URL and paste it into `app.js` → `GAS_WEB_APP_URL`.

> Every time you change `Code.gs`, redeploy (or use *Manage deployments → Edit → New version*) to propagate the change to the `/exec` URL.

### 2. Frontend

The frontend is 100% static. Any of the following work:

- Double-click `index.html` to open it locally.
- Serve it with `python3 -m http.server` from the project folder.
- Push to GitHub Pages, Netlify, Vercel, etc.

Make sure `index.html`, `styles.css`, and `app.js` sit next to each other.

---

## Consuming the API from AI agents / external clients

The API is deliberately designed to be agent-friendly:

- **Pure JSON responses** with a uniform `{ status, data }` envelope.
- **Both GET and POST** accepted for every write action, so tools that only do URL-based calls still work.
- **Field aliases** so agents can send `dia`, `series`, `reps`, etc. without having to know the exact Spanish header strings.
- **Row IDs** returned in every read response so an agent can update/delete specific exercises.

### Minimal Python example

```python
import json, urllib.request, urllib.parse

BASE = "https://script.google.com/macros/s/XXXX/exec"

def api_get(action, **params):
    qs = urllib.parse.urlencode({"action": action, **params})
    with urllib.request.urlopen(f"{BASE}?{qs}") as r:
        return json.loads(r.read())

def api_post(action, **payload):
    body = json.dumps({"action": action, **payload}).encode()
    req = urllib.request.Request(BASE, data=body, headers={"Content-Type": "text/plain"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

# List planned workouts
print(api_get("getWorkouts", estado="Planeado"))

# Create a workout
api_post("createWorkout", dia="2026-04-12", rutina="Piernas", ejercicios=[
    {"ejercicio": "Sentadilla", "series": "4", "reps": "6", "kgObjetivo": "100kg"},
    {"ejercicio": "Peso muerto", "series": "3", "reps": "5", "kgObjetivo": "120kg"},
])
```

### curl examples

```bash
# Health check
curl "$BASE?action=ping"

# Get everything
curl "$BASE?action=getAll"

# Start a workout (read-only helper)
curl "$BASE?action=startWorkout&dia=2026-04-10&rutina=Pecho%20y%20Tr%C3%ADceps"

# Complete a workout
curl -X POST "$BASE" \
  -H "Content-Type: text/plain" \
  -d '{"action":"completeWorkout","dia":"2026-04-10","rutina":"Pecho y Tríceps","exercises":[{"rowId":12,"kgConseguidos":"4x60kg","estado":"Completado"}]}'
```

---

## Troubleshooting

| Symptom                                       | Fix                                                                                     |
|-----------------------------------------------|-----------------------------------------------------------------------------------------|
| Reps/Kg appear as `2026-04-04T22:00:00.000Z`  | Run `setupSheet()` and `fixCorruptedDateCells()` from the Apps Script editor.            |
| CORS preflight error in the browser           | Make sure the frontend sends `Content-Type: text/plain` for POSTs (already handled).     |
| `Unknown action` response                     | Check spelling — actions are case-sensitive (`getAll`, not `GetAll`).                    |
| Edits don't show up on the web                | You probably need to redeploy the Apps Script web app after editing `Code.gs`.           |
| 401 / "Authorization required"                | In the Web App deployment, set *Who has access* to *Anyone*.                             |

---

## Roadmap

- Progress charts per exercise (volume, e1RM) using recharts.
- Workout templates (clone a past workout as a new planned one).
- PR detection and history per exercise.
- Rest-day logging and recovery tracking.
- Nutrition integration.
- Multi-user support via Apps Script `Session.getActiveUser()`.

---

*Last updated: 2026-04-07*
