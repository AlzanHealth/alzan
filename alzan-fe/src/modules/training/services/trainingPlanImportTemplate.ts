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
          "modality": "gym",
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

export const TRAINING_PLAN_IMPORT_PROMPT = `Convierte los documentos adjuntos en un JSON alzan-training-plan v1 listo para importar.

ARCHIVOS
- Lee completo el DOCX del plan de entrenamiento, aunque tenga otro nombre.
- Usa el CSV adjunto solo para resolver ejercicios de gimnasio. Si también hay un DOCX de nutrición, ignóralo.
- El CSV puede aparecer como archivo adjunto o como una sección llamada exercises_rows. No inventes ejercicios.

SALIDA
- Devuelve únicamente JSON válido, sin markdown, comentarios ni texto adicional.
- Usa exclusivamente comillas ASCII ("). No uses comillas tipográficas, aunque la interfaz móvil las sugiera.
- No generes el campo notes en ningún objeto.
- La raíz solo contiene format, version, plan_name, start_date, end_date y weeks.
- Cada week solo contiene week_number y sessions. Cada session solo contiene date, weekday, sport, name, template_key, workout_goal, modality, distance_km, duration_min, running_steps y exercises.
- Cada sesión debe incluir modality y workout_goal. Para running usa siempre modality: outdoor (Exterior). Para strength usa modality: gym (Gimnasio), salvo que el documento indique claramente free_weights, machines, calisthenics, core o mobility.
- Usa únicamente objetivos del catálogo: running: endurance, speed, tempo_threshold, long_run, recovery o test; strength: hypertrophy, strength, muscular_endurance, technique, mobility o recovery. Convierte aliases como easy_run→endurance, intervals→speed y tempo→tempo_threshold sin cambiar el entrenamiento.
- Running usa running_steps; strength usa exercises. No mezcles ambos.
- No generes rpe, rir, rir_min ni rir_max en ninguna parte. Si el DOCX contiene RPE o RIR, omítelo: esos campos no deben aparecer en el JSON de importación.
- No escribas duration_s, distance_m, target_type, target_min, target_max, progression_key ni children dentro de exercises de strength. Esas propiedades solo pertenecen a running_steps.
- Fechas YYYY-MM-DD, weekday correcto y rango inclusivo máximo de 45 días.
- Números JSON, nunca texto con unidades. Usa reps o reps_min + reps_max, nunca ambos.

FIDELIDAD
- Copia exactamente fechas, días, sesiones, orden, objetivos, intervalos, recuperaciones, distancias, duraciones, series, repeticiones, pesos y descansos del DOCX.
- No inventes ni modifiques entrenamientos.
- Un día de descanso, paseo o movilidad sin entrenamiento no crea una sesión artificial. Una sesión opcional conserva “Opcional” en name.
- Para rangos de peso, descanso, distancia o duración usa el límite inferior; para repeticiones usa reps_min y reps_max.
- Lee todas las páginas y tablas del DOCX: la tabla de calendario fija fechas y nombres; las tablas de rutinas fijan ejercicios. No conviertas una tabla en sesión.
- Asocia las rutinas de gimnasio del calendario con sus tablas y reutiliza cada una en sus fechas.

RUNNING
- Fases permitidas: warmup, interval, recovery, cooldown y relax.
- Duraciones permitidas: time, distance y lap_button.
- Un calentamiento “10 min” es un único warmup de 600 segundos. Omite movilidad, activación o técnica sin duración/distancia concreta.
- Las series repetidas usan repetitions y children. Los ritmos se expresan en segundos por kilómetro.
- Cada running_step usa solo phase_type, duration_type, duration_s, distance_m, target_type, target_min, target_max, repetitions, progression_key y children.
- No uses target_type: "rpe" ni añadas rpe a los pasos; si el documento prescribe RPE, omite ese dato.

GIMNASIO
- No inventes UUID: Alzan resolverá el UUID al importar usando el exercise_name canónico.
- Usa exercise_name de una fila real de exercises_rows. Busca primero coincidencia exacta normalizada; si no existe, elige solo una alternativa más parecida y de alta confianza usando el mismo patrón de movimiento, músculo principal, equipamiento y agarre/posición.
- Sin alternativa segura, conserva el nombre fuente; frontend lo marcará como pendiente para selección manual. No inventes UUID ni metadatos.
- Para “A o B”/“polea/máquina” elige la mejor opción del CSV; “2+2” son dos filas consecutivas.
- Cada exercise solo puede usar exercise_id, exercise_name, order_index, is_warmup, sets, reps, reps_min, reps_max, weight_kg y rest_seconds.
- Conserva series, repeticiones, pesos, descansos y orden; cambia solo la referencia.

PLANTILLAS Y VALIDACIÓN
- Reutiliza template_key solo cuando la estructura sea la misma; usa otra si cambia la estructura o la progresión.
- En running, progression_key debe ser estable y único dentro de cada sesión.
- Comprueba fechas, weekday, propiedades permitidas, order_index consecutivo y un bloque válido por deporte. Los ejercicios de gimnasio deben proceder del CSV; si una coincidencia no es segura, conserva el nombre fuente para que Alzan lo deje pendiente de selección manual.
- Si los datos del entrenamiento no permiten construir la estructura, devuelve un informe de bloqueo breve; no generes JSON truncado. Si la estructura sí es válida, devuelve solo el JSON:

PLANTILLA
${TRAINING_PLAN_IMPORT_TEMPLATE}`;

export const TRAINING_PLAN_IMPORT_CLIPBOARD_TEXT = `${TRAINING_PLAN_IMPORT_PROMPT}\n`;
