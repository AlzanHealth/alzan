import { addDays, format, startOfWeek } from 'date-fns';
import type { TrainingExerciseCatalogRow } from './trainingPlanImportExerciseResolver';

export const buildTrainingPlanImportTemplate = (referenceDate: Date = new Date()): string => {
  const startDate = startOfWeek(addDays(referenceDate, 7), { weekStartsOn: 1 });
  const strengthDate = addDays(startDate, 1);
  const endDate = addDays(startDate, 27);

  return `{
  "format": "alzan-training-plan",
  "version": 1,
  "plan_name": "Plan de 4 semanas",
  "start_date": "${format(startDate, 'yyyy-MM-dd')}",
  "end_date": "${format(endDate, 'yyyy-MM-dd')}",
  "weeks": [
    {
      "week_number": 1,
      "sessions": [
        {
          "date": "${format(startDate, 'yyyy-MM-dd')}",
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
            {
              "phase_type": "interval",
              "duration_type": "lap_button",
              "repetitions": 6,
              "progression_key": "series",
              "children": [
                { "phase_type": "interval", "duration_type": "distance", "distance_m": 800, "target_type": "pace", "target_min": 300, "progression_key": "work" },
                { "phase_type": "recovery", "duration_type": "time", "duration_s": 120, "progression_key": "recovery" }
              ]
            },
            { "phase_type": "cooldown", "duration_type": "time", "duration_s": 600 }
          ]
        },
        {
          "date": "${format(strengthDate, 'yyyy-MM-dd')}",
          "weekday": "martes",
          "sport": "strength",
          "name": "Fuerza tren inferior",
          "template_key": "lower-body",
          "workout_goal": "strength",
          "exercises": [
            { "exercise_name": "Sentadilla", "order_index": 0, "sets": 4, "reps": 6, "weight_kg": 80, "rest_seconds": 150 }
          ]
        }
      ]
    }
  ]
}`;
};

export const TRAINING_PLAN_IMPORT_TEMPLATE = buildTrainingPlanImportTemplate();

export const TRAINING_PLAN_IMPORT_PROMPT = `Crea un plan de entrenamiento para importar en Alzan.

Devuelve únicamente un JSON válido, sin markdown ni comentarios, siguiendo exactamente el formato alzan-training-plan v1.

REGLAS DEL CALENDARIO
- Usa una sesión por cada fecha programada, en formato YYYY-MM-DD.
- Incluye weekday en cada sesión: lunes, martes, miércoles, jueves, viernes, sábado o domingo.
- weekday debe coincidir con date; la aplicación rechaza cualquier combinación incorrecta.
- start_date y end_date son obligatorios: usa los límites reales del plan y no añadas sesiones fuera de ellos.
- El formato admite un rango inclusivo de hasta 45 días por documento. Si necesitas más tiempo, divídelo en documentos consecutivos.
- Incluye week_number consecutivos y todas las sesiones del periodo solicitado; no dejes semanas del rango sin representar salvo que sean semanas completas de descanso.
- Usa solo sport: "running" o sport: "strength".
- El importador crea las sesiones exactas de cada fecha y también agrupa plantillas repetibles.

CLAVES DE PLANTILLA Y PROGRESIÓN
- Usa el mismo template_key cuando la estructura del entrenamiento es la misma y solo cambian distancia, duración, ritmo, repeticiones, peso, RPE o descanso.
- Usa una template_key distinta cuando cambien las fases, el tipo de duración o la estructura de ejercicios.
- En running, usa progression_key estable para cada bloque que progrese entre semanas (por ejemplo "main", "work" o "recovery").
- Cada progression_key debe identificar un único paso dentro de la sesión: no repitas la misma clave en un contenedor y en uno de sus children.
- No uses el nombre de la sesión como template_key si el nombre cambia por semana.
- Una misma template_key puede aparecer en varios días de la semana si conserva exactamente la misma estructura; la aplicación importará solo las fechas declaradas.
- Dentro del mismo bloque de 7 días desde start_date, reutiliza una template_key varias veces solo si todos sus objetivos y cantidades son idénticos. Si cambian, usa claves distintas.

RUNNING
- Define running_steps con fases warmup, interval, recovery, cooldown o relax.
- Usa duration_type time, distance o lap_button.
- Para target_type pace, expresa target_min y target_max en segundos por kilómetro (por ejemplo 285 = 4:45/km).
- Representa las recuperaciones como pasos recovery, no como texto ambiguo en notes.
- Para series repetidas, crea un paso contenedor con repetitions y children; dentro incluye al menos el esfuerzo interval y su recovery. No pongas repetitions en un intervalo plano si cada repetición necesita recuperación.
- Usa distance_km y duration_min como resumen aproximado; la sesión ejecutable debe estar en running_steps.
- Mantén la progresión fisiológica del plan: rodaje suave, calidad, controlado y tirada larga no son intercambiables.
- Si el usuario proporciona una distribución semanal, respeta exactamente la distribución semanal, los días de descanso, los dobles entrenamientos y el orden de las sesiones.
- No inventes una distribución por defecto ni traslades sesiones a otros días cuando el texto de origen no lo indique.
- No conviertas un cambio de ritmo o de kilómetros en una plantilla nueva si la estructura sigue siendo la misma.

FUERZA / GIMNASIO
- Usa exclusivamente el catálogo de ejercicios de Alzan que aparece después de la plantilla cuando incluya una sección CATÁLOGO.
- Incluye exercise_id solo si conoces un UUID exacto del catálogo. Si no lo conoces, omítelo y usa exercise_name exacto para que el importador lo resuelva durante el análisis.
- No inventes ejercicios, UUID, nombres alternativos ni variantes que no existan.
- Incluye order_index consecutivo, sets y reps o reps_min/reps_max, además de weight_kg, rpe, rest_seconds e is_warmup cuando estén definidos.
- Conserva las rutinas, ejercicios y orden definidos por el plan original; usa la misma template_key dentro de cada rutina cuando solo progresen cargas, series o repeticiones.
- Si el catálogo no contiene un ejercicio solicitado, elige solo una variante existente y documenta la sustitución en notes; nunca inventes el ejercicio.

VALIDACIÓN FINAL
- Comprueba que todas las fechas son reales y están dentro del rango.
- Se permiten varias sesiones distintas en una misma fecha. Cada combinación date + sport + template_key debe ser única.
- Comprueba que cada weekday coincide con su fecha.
- Comprueba que cada running tiene al menos un running_step y cada strength al menos un exercise.
- Comprueba que no hay claves duplicadas con estructuras incompatibles.
- Devuelve solo el JSON siguiendo esta plantilla:

PLANTILLA JSON
${TRAINING_PLAN_IMPORT_TEMPLATE}`;

export const buildTrainingPlanImportClipboardText = (catalog: TrainingExerciseCatalogRow[] = []): string => {
  if (catalog.length === 0) return `${TRAINING_PLAN_IMPORT_PROMPT}\n`;

  const rows = [...catalog]
    .sort((left, right) =>
      (left.base_name_es ?? left.base_name_en ?? left.id).localeCompare(
        right.base_name_es ?? right.base_name_en ?? right.id,
        'es',
      ),
    )
    .map(exercise => `- ${exercise.id} | ${exercise.base_name_es ?? '-'} | ${exercise.base_name_en ?? '-'}`);

  return `${TRAINING_PLAN_IMPORT_PROMPT}

CATÁLOGO DE EJERCICIOS DE ALZAN
Formato: exercise_id | nombre español | nombre inglés.
Para fuerza, elige únicamente filas de esta lista y copia el UUID y uno de sus nombres exactamente.
${rows.join('\n')}
`;
};

export const TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT = buildTrainingPlanImportClipboardText();
