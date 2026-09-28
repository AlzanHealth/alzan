import { TRAINING_PLAN_IMPORT_PROMPT } from './trainingPlanImportTemplate';

export type TrainingExerciseAiCatalogRow = {
  exercise_id: string;
  exercise_name_es: string;
  exercise_name_en: string | null;
  exercise_type: string | null;
  load_type: string | null;
  primary_muscle: string | null;
  secondary_muscle: string | null;
  equipment: string | null;
  is_custom: boolean;
};

const CATALOG_HEADERS = [
  'exercise_id',
  'exercise_name_es',
  'exercise_name_en',
  'exercise_type',
  'load_type',
  'primary_muscle',
  'secondary_muscle',
  'equipment',
  'is_custom',
] as const;

const AI_CLIPBOARD_CATALOG_HEADERS = ['exercise_name_es', 'primary_muscle', 'equipment'] as const;

const normalizeSortValue = (value: string | null): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const sortTrainingExerciseAiCatalog = (
  catalog: TrainingExerciseAiCatalogRow[],
): TrainingExerciseAiCatalogRow[] =>
  [...catalog].sort((left, right) => {
    const nameComparison = normalizeSortValue(left.exercise_name_es).localeCompare(
      normalizeSortValue(right.exercise_name_es),
      'en',
    );
    if (nameComparison !== 0) return nameComparison;
    return left.exercise_id.localeCompare(right.exercise_id);
  });

const escapeCsvCell = (value: string | boolean | null): string => {
  const text = value === null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const serializeTrainingExerciseCatalogCsv = (catalog: TrainingExerciseAiCatalogRow[]): string => {
  const rows = sortTrainingExerciseAiCatalog(catalog).map(exercise =>
    [
      exercise.exercise_id,
      exercise.exercise_name_es,
      exercise.exercise_name_en,
      exercise.exercise_type,
      exercise.load_type,
      exercise.primary_muscle,
      exercise.secondary_muscle,
      exercise.equipment,
      exercise.is_custom,
    ]
      .map(escapeCsvCell)
      .join(','),
  );

  return [CATALOG_HEADERS.join(','), ...rows].join('\n');
};

export const serializeTrainingExerciseAiClipboardCsv = (catalog: TrainingExerciseAiCatalogRow[]): string => {
  const rows = sortTrainingExerciseAiCatalog(catalog).map(exercise =>
    [exercise.exercise_name_es, exercise.primary_muscle, exercise.equipment].map(escapeCsvCell).join(','),
  );

  return ['ejercicios.csv', 'exercises_rows', AI_CLIPBOARD_CATALOG_HEADERS.join(','), ...rows].join('\n');
};

export const buildTrainingPlanAiPrompt = (
  catalog: TrainingExerciseAiCatalogRow[],
  currentDate: string = new Date().toISOString().slice(0, 10),
): string => {
  return `${TRAINING_PLAN_IMPORT_PROMPT.trim()}

ADAPTACIÓN PARA ESTA CONVERSACIÓN
- No necesitas DOCX ni CSV adjuntos. El catálogo se pegará como una sección exercises_rows.
- Puede ser una única sesión escrita, una fotografía o un documento breve; extrae solo lo visible o escrito.
- Si solo hay una sesión y no indica fecha, usa ${currentDate}. Si hay varias sesiones y falta una fecha, devuelve un informe de bloqueo y no inventes fechas.
- En una sesión concreta conserva deporte, bloques, ejercicios, series, cargas, descansos e intervalos; no la conviertas en un plan semanal.
- No inventes datos que no aparezcan en la entrada.
- Cada template_key identifica una familia exacta. Reutilízalo solo si coinciden deporte, workout_goal, modality, jerarquía de pasos o ejercicios, repeticiones, progression_key y todos los objetivos de ritmo o carga.
- Nunca reutilices template_key si cambia el objetivo (por ejemplo recovery/endurance), target_min/target_max, repeticiones, bloques, children, orden de ejercicios o progresión; crea una clave nueva y descriptiva.
- Para ejercicios de strength, selecciona exactamente exercise_name_es de una fila real de exercises_rows usando el nombre, el músculo principal y el equipamiento.
- Omite exercise_id. No inventes UUID: Alzan resolverá el UUID al importar el JSON mediante el nombre canónico seleccionado.
- Si no hay coincidencia segura, conserva el nombre fuente; el frontend pedirá selección y no importará hasta resolverlo.
- Convierte el entrenamiento pegado, sin inventar datos, al JSON alzan-training-plan v1.
- Tras recibir el entrenamiento, responde únicamente con JSON válido.

PASOS PARA EL USUARIO
1. El catálogo completo de ${catalog.length} ejercicios ya está copiado. Pégalo aquí con Ctrl+V o Cmd+V.
2. Debajo del catálogo, pega o escribe tu entrenamiento.
3. Envía el mensaje manualmente.
`;
};
