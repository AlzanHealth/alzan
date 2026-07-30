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

export const TRAINING_PLAN_IMPORT_PROMPT = `Crea un plan de entrenamiento para importar en Alzan.

Devuelve únicamente un JSON válido, sin markdown ni comentarios, siguiendo exactamente el formato alzan-training-plan v1.

REGLAS DEL CALENDARIO
- Usa una sesión por cada fecha programada, en formato YYYY-MM-DD.
- Incluye weekday en cada sesión: lunes, martes, miércoles, jueves, viernes, sábado o domingo.
- weekday debe coincidir con date; la aplicación rechaza cualquier combinación incorrecta.
- Mantén start_date y end_date como los límites reales del plan y no añadas sesiones fuera de ellos.
- El formato admite un rango inclusivo de hasta 45 días por documento. Si necesitas más tiempo, divídelo en documentos consecutivos.
- Usa solo sport: "running" o sport: "strength".
- El importador crea las sesiones exactas de cada fecha y también agrupa plantillas repetibles.

CLAVES DE PLANTILLA Y PROGRESIÓN
- Usa el mismo template_key cuando la estructura del entrenamiento es la misma y solo cambian distancia, duración, ritmo, repeticiones, peso, RPE o descanso.
- Usa una template_key distinta cuando cambien las fases, el tipo de duración o la estructura de ejercicios.
- En running, usa progression_key estable para cada bloque que progrese entre semanas (por ejemplo "main", "work" o "recovery").
- No uses el nombre de la sesión como template_key si el nombre cambia por semana.
- Si una misma template_key aparece en varios días de la semana, sepárala en claves distintas para que el calendario no invente repeticiones.

RUNNING
- Define running_steps con fases warmup, interval, recovery, cooldown o relax.
- Usa duration_type time, distance o lap_button.
- Para target_type pace, expresa target_min y target_max en segundos por kilómetro (por ejemplo 285 = 4:45/km).
- Representa las recuperaciones como pasos recovery, no como texto ambiguo en notes.
- Usa distance_km y duration_min como resumen aproximado; la sesión ejecutable debe estar en running_steps.
- Mantén la progresión fisiológica del plan: rodaje suave, calidad, controlado y tirada larga no son intercambiables.
- En un bloque como el caso real de 23/06 a 02/08, conserva la distribución: lunes suave + Push, martes calidad + Pull, miércoles Leg, jueves controlado, viernes Full torso y sábado tirada larga.
- No conviertas un cambio de ritmo o de kilómetros en una plantilla nueva si la estructura sigue siendo la misma.

FUERZA / GIMNASIO
- Revisa el catálogo de ejercicios existente en Alzan antes de generar la sesión.
- Usa exercise_id y exercise_name exactos del catálogo; si falta un UUID, usa el nombre exacto para que el importador lo resuelva.
- No inventes ejercicios, UUID, nombres alternativos ni variantes que no existan.
- Incluye order_index consecutivo, sets y reps o reps_min/reps_max, además de weight_kg, rpe, rest_seconds e is_warmup cuando estén definidos.
- Mantén la estructura Push, Pull, Leg y Full torso del plan original; usa la misma template_key dentro de cada rutina y deja que progresen sus cargas o repeticiones.
- Si el catálogo no contiene un ejercicio solicitado, elige solo una variante existente y documenta la sustitución en notes; nunca inventes el ejercicio.

VALIDACIÓN FINAL
- Comprueba que todas las fechas son reales, únicas y están dentro del rango.
- Comprueba que cada weekday coincide con su fecha.
- Comprueba que cada running tiene al menos un running_step y cada strength al menos un exercise.
- Comprueba que no hay claves duplicadas con estructuras incompatibles.
- Devuelve solo el JSON siguiendo esta plantilla:

PLANTILLA JSON
${TRAINING_PLAN_IMPORT_TEMPLATE}`;

export const TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT = `${TRAINING_PLAN_IMPORT_PROMPT}\n`;
