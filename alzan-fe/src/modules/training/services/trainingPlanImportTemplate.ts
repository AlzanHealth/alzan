import { addDays, format, startOfWeek } from 'date-fns';

export const buildTrainingPlanImportTemplate = (referenceDate: Date = new Date()): string => {
  const startDate = startOfWeek(addDays(referenceDate, 7), { weekStartsOn: 1 });
  const strengthDate = addDays(startDate, 1);
  const endDate = addDays(startDate, 6);

  return `{
  "format": "alzan-training-plan",
  "version": 1,
  "plan_name": "Plan de entrenamiento de ejemplo",
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
          "workout_goal": "speed",
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

export const TRAINING_PLAN_IMPORT_PROMPT = `Convierte el documento de entrenamiento adjunto en un JSON para importarlo completo en Alzan.

Si la conversión puede completarse sin bloqueos, devuelve únicamente un JSON válido, sin markdown ni comentarios, siguiendo exactamente el formato alzan-training-plan v1.

ARCHIVOS DE REFERENCIA
- Plan_Entrenamiento.docx (Word) es la única fuente de verdad del entrenamiento. Léelo completo, incluidas sus tablas, semanas, sesiones, bloques y notas.
- El CSV adjunto contiene el catálogo actualizado de ejercicios. Úsalo únicamente para resolver el exercise_id y el nombre canónico exacto de cada ejercicio de fuerza.
- Si también está adjunto Plan_Nutricion(1).docx, ignóralo al construir este JSON: pertenece al importador de nutrición.

PROHIBICIÓN ABSOLUTA DE MODIFICAR EL ENTRENAMIENTO
- Adapta el contenido del Word al esquema JSON; no diseñes, optimices ni reescribas el plan.
- Conserva exactamente todas las fechas, weekdays, semanas, días de descanso, sesiones dobles, orden de sesiones, nombres, calentamientos, fases, intervalos, recuperaciones, distancias, duraciones, ritmos, objetivos, series, repeticiones, pesos, RPE, descansos y notas.
- No cambies cargas, ritmos, kilómetros, tiempos, repeticiones, series, ejercicios o días aunque parezcan incoherentes, difíciles o mejorables.
- No corrijas, sustituyas, fusiones, dividas, resumas, omitas ni añadas entrenamientos. No traslades sesiones de día y no recalcules valores.
- El template_key solo sirve para identificar una estructura repetible; nunca puede utilizarse para borrar una variación que figure en el Word. Si una agrupación hiciera perder información, usa otra clave.
- Si un ejercicio no aparece con una coincidencia única en el CSV, detén la conversión y devuelve un informe de bloqueo con la sesión, el texto original y el motivo. No inventes UUID, nombres alternativos ni sustituciones.
- Si una cifra, fecha, fase o relación de intervalos no puede leerse con seguridad, detén la conversión y pide aclaración. No la completes por intuición.

REGLAS DEL CALENDARIO
- Usa una sesión por cada fecha programada, en formato YYYY-MM-DD.
- Incluye weekday en cada sesión: lunes, martes, miércoles, jueves, viernes, sábado o domingo.
- weekday debe coincidir con date; la aplicación rechaza cualquier combinación incorrecta.
- start_date y end_date son obligatorios: usa los límites reales del plan y no añadas sesiones fuera de ellos.
- El formato admite un rango inclusivo de hasta 45 días por documento. Si el Word supera ese límite, divídelo en documentos consecutivos sin cambiar ninguna sesión.
- Incluye week_number consecutivos y todas las sesiones del periodo solicitado; no dejes semanas del rango sin representar salvo que sean semanas completas de descanso.
- Usa solo sport: "running" o sport: "strength".
- El importador crea las sesiones exactas de cada fecha y también agrupa plantillas repetibles sin alterar sus progresiones.

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
- Mantén literalmente la distribución y la progresión descritas en el Word; rodaje suave, calidad, controlado y tirada larga no son intercambiables.
- Un cambio de ritmo, kilómetros, tiempo, repeticiones o carga es una progresión que debe conservarse en el JSON; no lo conviertas en un valor promedio.

FUERZA / GIMNASIO
- Usa exclusivamente el CSV adjunto como catálogo de ejercicios de fuerza.
- Incluye exercise_id y exercise_name exactamente como aparecen en el CSV. No copies el catálogo dentro del JSON ni en el texto de salida.
- No inventes ejercicios, UUID, nombres alternativos ni variantes que no existan.
- Incluye order_index consecutivo, sets y reps o reps_min/reps_max, además de weight_kg, rpe, rest_seconds e is_warmup cuando estén definidos.
- Conserva las rutinas, ejercicios y orden definidos por el plan original; usa la misma template_key dentro de cada rutina cuando solo progresen cargas, series o repeticiones.
- Si el CSV no contiene un ejercicio solicitado, bloquea la conversión; nunca elijas una variante ni documentes una sustitución como si fuera el entrenamiento original.

VALIDACIÓN FINAL
- Comprueba que todas las fechas son reales y están dentro del rango.
- Se permiten varias sesiones distintas en una misma fecha. Cada combinación date + sport + template_key debe ser única.
- Comprueba que cada weekday coincide con su fecha.
- Comprueba que cada running tiene al menos un running_step y cada strength al menos un exercise.
- Comprueba que no hay claves duplicadas con estructuras incompatibles.
- Verifica el JSON comparándolo de nuevo con el Word: ninguna sesión, fecha, ejercicio, bloque o cifra puede faltar o cambiar.
- Si no hay bloqueos, devuelve solo el JSON siguiendo esta plantilla. Si hay bloqueos, devuelve solo el informe de bloqueos y no un JSON incompleto:

PLANTILLA JSON
${TRAINING_PLAN_IMPORT_TEMPLATE}`;

export const TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT = `${TRAINING_PLAN_IMPORT_PROMPT}\n`;
