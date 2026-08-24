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

export const buildTrainingPlanAiPrompt = (catalog: TrainingExerciseAiCatalogRow[]): string => {
  const csv = serializeTrainingExerciseCatalogCsv(catalog);

  return `${TRAINING_PLAN_IMPORT_PROMPT.trim()}

ADAPTACIÓN PARA ESTA CONVERSACIÓN
- No necesitas un DOCX ni un CSV adjunto: el catálogo de ejercicios aparece al final de este mensaje.
- El catálogo incluido sustituye al CSV adjunto mencionado en las instrucciones anteriores.
- El usuario pegará ahora el texto de su entrenamiento. Convierte ese entrenamiento, sin inventar datos, al JSON alzan-training-plan v1.
- Si un ejercicio no aparece en el catálogo, no inventes su UUID: devuelve un informe de bloqueo explicando qué ejercicio falta.
- Tras recibir el entrenamiento, responde únicamente con JSON válido o con el informe de bloqueo definido arriba.

Pega ahora el texto de tu entrenamiento después de este documento.

CATÁLOGO DE EJERCICIOS DE ALZAN (CSV ACTUALIZADO)
${csv}
`;
};
