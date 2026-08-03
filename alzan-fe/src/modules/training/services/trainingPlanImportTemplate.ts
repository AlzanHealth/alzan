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

export const TRAINING_PLAN_IMPORT_PROMPT = `Convierte el documento de entrenamiento adjunto en un JSON para importarlo completo en Alzan.

Si la conversión puede completarse sin bloqueos, devuelve únicamente un JSON válido, sin markdown ni comentarios, siguiendo exactamente el formato alzan-training-plan v1.

CONTRATO JSON AUTÓNOMO (NO NECESITAS CONOCER LA APP)
- La raíz solo puede contener format, version, plan_name, start_date, end_date y weeks. Usa exactamente format "alzan-training-plan" y version 1.
- Cada week solo puede contener week_number y sessions. Cada session solo puede usar date, weekday, sport, name, template_key, workout_goal, modality, notes, distance_km, duration_min, running_steps y exercises.
- Una sesión running usa running_steps y no exercises. Una sesión strength usa exercises y no running_steps. No mezcles ambos bloques ni añadas propiedades fuera del contrato.
- date, start_date y end_date son fechas reales YYYY-MM-DD; weekday usa exactamente lunes, martes, miércoles, jueves, viernes, sábado o domingo y debe coincidir con date.
- Todos los números son números JSON (nunca texto con unidades): week_number 1–104, distance_km 0–1000, duration_min 0–1440, duration_s 0–86400, distance_m 0–500000, repetitions 1–1000, order_index 0–1000, sets 1–100, reps/reps_min/reps_max 1–1000, weight_kg 0–1000, rpe 1–10 y rest_seconds 0–3600.
- No incluyas comentarios, markdown, trailing commas ni texto fuera del JSON. No inventes UUID: si no hay coincidencia segura en el CSV, devuelve un informe de bloqueo y no un JSON parcial.

ARCHIVOS DE REFERENCIA
- El documento Word adjunto que contiene el plan de entrenamiento es la única fuente de verdad (normalmente se llama Plan_Entrenamiento.docx, pero el nombre puede variar). Identifícalo por su contenido y léelo completo, incluidas sus tablas, semanas, sesiones, bloques y notas.
- El CSV adjunto contiene el catálogo actualizado de ejercicios. Úsalo únicamente para resolver el exercise_id y el nombre canónico exacto de cada ejercicio de fuerza.
- Si también hay un documento con un plan de nutrición, ignóralo al construir este JSON: pertenece al importador de nutrición.

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

CATÁLOGO ESTÁTICO Y VALORES DE PRODUCCIÓN
- El CSV adjunto es la autoridad del catálogo actual de ejercicios (aproximadamente 2005 ejercicios, con sus exercise_id y exercise_name). No necesitas conocer la base de datos: busca ahí cada ejercicio y copia exactamente ambos valores.
- Los únicos sport válidos son running y strength.
- Los valores catalogados de running son workout_goal: endurance, speed, tempo_threshold, long_run, recovery, test; modality: outdoor o treadmill; terrain: asphalt, track, dirt, grass o treadmill (terrain no es un campo del JSON, consérvalo solo si aparece en notes).
- Los valores catalogados de strength son workout_goal: hypertrophy, strength, muscular_endurance, technique, mobility, recovery; modality: gym, free_weights, machines, calisthenics, core o mobility. No uses terrain para strength.
- workout_goal y modality son cadenas y el Word es la fuente de verdad: conserva literalmente cualquier valor que figure en el Word, aunque no esté en el catálogo (por ejemplo, "intervals"); nunca lo sustituyas por otro objetivo ni lo traduzcas. Usa las claves anteriores solo cuando el documento las use o cuando su equivalencia sea inequívoca.
- El CSV puede incluir traducciones, equipamiento, grupos musculares y otros metadatos del ejercicio; solo exercise_id y exercise_name se copian al JSON. No añadas esos metadatos como propiedades nuevas.
- No copies el catálogo completo dentro del JSON; el CSV solo sirve para resolver referencias.

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
- phase_type solo puede ser warmup, interval, recovery, cooldown o relax; duration_type solo time, distance o lap_button; target_type solo pace, speed, heart_rate, heart_rate_zone, power, rpe o none.
- Un paso time sin children exige duration_s; un paso distance sin children exige distance_m. Si target_type no es none, exige target_min y target_max es opcional; target_min no puede superar target_max.
- Los ritmos pace se expresan en segundos por kilómetro (285 = 4:45/km). No pongas "4:45/km" dentro de target_min/target_max.

FUERZA / GIMNASIO
- Usa exclusivamente el CSV adjunto como catálogo de ejercicios de fuerza.
- Incluye exercise_id y exercise_name exactamente como aparecen en el CSV. No copies el catálogo dentro del JSON ni en el texto de salida.
- No inventes ejercicios, UUID, nombres alternativos ni variantes que no existan.
- Incluye order_index consecutivo, sets y reps o reps_min/reps_max, además de weight_kg, rpe, rest_seconds e is_warmup cuando estén definidos.
- Conserva las rutinas, ejercicios y orden definidos por el plan original; usa la misma template_key dentro de cada rutina cuando solo progresen cargas, series o repeticiones.
- Si el CSV no contiene un ejercicio solicitado, bloquea la conversión; nunca elijas una variante ni documentes una sustitución como si fuera el entrenamiento original.
- Cada ejercicio debe tener order_index consecutivo desde 0 y sets. Usa reps o reps_min + reps_max, nunca ambos. No escribas rangos como texto ("8-10").
- exercise_id debe ser un UUID válido del CSV y exercise_name debe ser su nombre canónico exacto; no generes UUID ficticios.

VALIDACIÓN FINAL
- Comprueba que todas las fechas son reales y están dentro del rango.
- Se permiten varias sesiones distintas en una misma fecha. Cada combinación date + sport + template_key debe ser única.
- Comprueba que cada weekday coincide con su fecha.
- Comprueba que cada running tiene al menos un running_step y cada strength al menos un exercise.
- Comprueba que no hay claves duplicadas con estructuras incompatibles.
- Comprueba que todas las propiedades pertenecen al contrato y que los ejercicios se resolvieron contra el CSV sin coincidencias ambiguas.
- Verifica el JSON comparándolo de nuevo con el Word: ninguna sesión, fecha, ejercicio, bloque o cifra puede faltar o cambiar.
- Si no hay bloqueos, devuelve solo el JSON siguiendo esta plantilla. Si hay bloqueos, devuelve solo el informe de bloqueos y no un JSON incompleto:

PLANTILLA JSON
${TRAINING_PLAN_IMPORT_TEMPLATE}`;

export const TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT = `${TRAINING_PLAN_IMPORT_PROMPT}\n`;
