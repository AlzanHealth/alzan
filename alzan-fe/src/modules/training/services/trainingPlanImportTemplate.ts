export const TRAINING_PLAN_IMPORT_TEMPLATE = `{
  "format": "alzan-training-plan",
  "version": 1,
  "plan_name": "Plan de 4 semanas",
  "start_date": "2026-08-03",
  "end_date": "2026-08-30",
  "weeks": [
    {
      "week_number": 1,
      "sessions": [
        {
          "date": "2026-08-03",
          "weekday": "lunes",
          "sport": "running",
          "name": "Series 6 x 800 m",
          "template_key": "series-800",
          "workout_goal": "intervals",
          "modality": "outdoor",
          "distance_km": 8.5,
          "duration_min": 50,
          "running_steps": [
            { "phase_type": "warmup", "duration_type": "time", "duration_s": 600 },
            { "phase_type": "interval", "duration_type": "distance", "distance_m": 800, "repetitions": 6, "target_type": "pace", "target_min": 300, "progression_key": "work" },
            { "phase_type": "cooldown", "duration_type": "time", "duration_s": 600 }
          ]
        },
        {
          "date": "2026-08-04",
          "weekday": "martes",
          "sport": "strength",
          "name": "Fuerza tren inferior",
          "template_key": "lower-body",
          "workout_goal": "strength",
          "exercises": [
            { "exercise_id": "REEMPLAZAR_UUID", "exercise_name": "Sentadilla", "order_index": 0, "sets": 4, "reps": 6, "weight_kg": 80, "rest_seconds": 150 }
          ]
        }
      ]
    }
  ]
}`;

export const TRAINING_PLAN_IMPORT_PROMPT = `Crea un plan de entrenamiento semanal para importar en Alzan.

Devuelve únicamente un JSON válido, sin markdown ni comentarios, siguiendo exactamente el formato alzan-training-plan v1.

REGLAS GENERALES
- Usa fechas reales en formato YYYY-MM-DD.
- Incluye weekday en cada sesión usando el nombre en español: lunes, martes, miércoles, jueves, viernes, sábado o domingo.
- weekday debe coincidir exactamente con date; la aplicación lo comprobará antes de importar.
- Organiza todas las sesiones dentro de weeks y añade una sesión por fecha.
- Usa solo sport: "running" o sport: "strength".
- Mantén el mismo template_key cuando la estructura sea la misma y solo cambien ritmos, repeticiones, pesos, RPE o descansos entre semanas.
- Usa progression_key en los pasos de running que cambien entre semanas.

RUNNING
- Define running_steps con fases warmup, interval, recovery, cooldown o relax.
- Usa duration_type time, distance o lap_button.
- Expresa el ritmo de running en target_type pace y segundos por kilómetro cuando corresponda.
- No crees una plantilla diferente solo porque cambien los kilómetros, el ritmo o las repeticiones.

FUERZA / GIMNASIO
- Usa exclusivamente ejercicios que existan en el catálogo de ejercicios de Alzan.
- Reutiliza el exercise_id y el exercise_name exactos del catálogo proporcionado.
- No inventes ejercicios, UUID, nombres alternativos ni variantes que no aparezcan en el catálogo.
- Si no tienes el catálogo, pide primero que te lo proporcione; no generes identificadores ficticios.
- Mantén el mismo template_key para la misma rutina aunque cambien sets, repeticiones, peso, RPE o descanso.

Antes de responder, comprueba que todas las sesiones están dentro de start_date y end_date y que el JSON cumple el esquema de la plantilla siguiente.

PLANTILLA JSON
${TRAINING_PLAN_IMPORT_TEMPLATE}`;

export const TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT = `${TRAINING_PLAN_IMPORT_PROMPT}\n`;
