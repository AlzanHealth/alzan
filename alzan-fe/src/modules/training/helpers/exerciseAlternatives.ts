import { normalizeExerciseCatalogName } from './exerciseCatalogMatching';
import { isTimeBasedGymExerciseType } from './gymExerciseDefaults.helper';
import type { ExerciseWithDetails } from '../../../types/training';

export interface AlternativeCandidate {
  id: string;
  names: readonly string[];
  primaryMuscleId: number | null;
  secondaryMuscleId: number | null;
  equipmentId: number | null;
  loadType: ExerciseWithDetails['load_type'];
  exerciseTypeCode?: string | null;
  archived: boolean;
}
export type AlternativeReason = 'sameMovement' | 'sameMuscle' | 'differentEquipment' | 'sameEquipment' | 'sameLoad';
export interface ExerciseAlternative {
  exerciseId: string;
  reasons: AlternativeReason[];
  score: number;
}

// Conservative name-based families, not a claim of biomechanical equivalence.
// Canonical names only: renaming an Alzan exercise must not change its movement.
const MOVEMENT_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['chestFly', /\b(aperturas?|cruce|fly|flyes|crossover|pec deck)\b/],
  ['uprightRow', /\b(remo al cuello|upright row)\b/],
  ['row', /\b(remo|row|rowing)\b/],
  ['verticalPull', /\b(jalon|jalones|pulldown|pull down|dominada|dominadas|pull up|pull ups|chin up|chin ups)\b/],
  [
    'verticalPress',
    /\b(press militar|press (de )?hombros?|shoulder press|overhead press|press overhead|arnold press|press arnold)\b/,
  ],
  [
    'horizontalPress',
    /\b(press (de )?(banca|pecho)|press (inclinado|declinado)|(?:incline|decline)(?: (?:dumbbell|barbell))? press|(?:dumbbell|barbell) (?:incline|decline) press|bench press|chest press|push up|push ups|pushup|pushups|flexion|flexiones)\b/,
  ],
  ['dip', /\b(fondos|dips|dip)\b/],
  ['splitSquat', /\b(zancadas?|lunge|lunges|split squat|bulgara|bulgarian|step up)\b/],
  [
    'squat',
    /\b(sentadilla|sentadillas|squat|squats|leg press|prensa (de )?piernas?|prensa horizontal|prensa inclinada)\b/,
  ],
  ['hipThrust', /\b(hip thrust|puente (de )?gluteo|glute bridge)\b/],
  ['hipHinge', /\b(peso muerto|deadlift|buenos dias|good morning|hip hinge)\b/],
  ['kneeFlexion', /\b(curl (femoral|de piernas)|leg curl)\b/],
  ['kneeExtension', /\b(extension(es)? (de )?(cuadriceps|piernas)|leg extension)\b/],
  ['hipAbduction', /\b(abduccion|abductor|abductores|hip abduction)\b/],
  ['hipAdduction', /\b(aduccion|aductor|aductores|hip adduction)\b/],
  ['calfRaise', /\b(elevacion(es)? (de )?talon(es)?|calf raise|calves raise|pantorrillas|gemelos)\b/],
  ['elbowExtension', /\b(triceps|press frances|skull crusher|pushdown)\b/],
  ['elbowFlexion', /\b(biceps|hammer curl|curl martillo)\b/],
  ['lateralRaise', /\b(elevacion(es)? lateral(es)?|lateral raise|lateral raises)\b/],
  ['sidePlank', /\b(plancha lateral|side plank)\b/],
  ['plank', /\b(plancha|plank)\b/],
  ['crunch', /\b(crunch|crunches|encogimiento abdominal)\b/],
];
const EXPLOSIVE_PATTERN = /\b(clean|snatch|jerk|swing|burpee|salto|jump|push press|pliometrico|plyometric)\b/;
const COMPOUND_PATTERN =
  /\b(?:a|to|into|with|con|mas|and|y) (?:flexion|flexiones|push up|curl|press|remo|row|squat|sentadilla)\b/;
const SPECIAL_VARIANTS = [
  /\b(bottoms? up|invertid[oa]|inverted)\b/,
  /\b(seesaw|alterno|alterna|alternating)\b/,
  /\b(renegado|renegade|bosu|fitball|stability ball)\b/,
  /\b(balon medicinal|medicine ball)\b/,
  /\b(giro|rotacion|rotating|rotation)\b/,
  /\b(agarre inverso|reverse grip)\b/,
  /\b(pies elevados|feet elevated)\b/,
  /\b(unilateral|a una mano|single arm|one arm)\b/,
];

const normalizedNames = (candidate: AlternativeCandidate) =>
  candidate.names.map(normalizeExerciseCatalogName).join(' ');
const pressAngle = (names: string) => {
  if (/\b(inclinado|inclinada|incline|inclined)\b/.test(names)) return 'incline';
  if (/\b(declinado|declinada|decline|declined)\b/.test(names)) return 'decline';
  return 'flat';
};

export const getExerciseMovementFamily = (names: readonly string[]): string | null => {
  const families = new Set<string>();
  for (const name of names) {
    const normalized = normalizeExerciseCatalogName(name);
    if (EXPLOSIVE_PATTERN.test(normalized) || COMPOUND_PATTERN.test(normalized) || /\bhip dips?\b/.test(normalized))
      return null;
    const matching = new Set(
      MOVEMENT_PATTERNS.filter(([, pattern]) => pattern.test(normalized)).map(([family]) => family),
    );
    // Remove generic patterns only when a specific version describes the same
    // movement. Any other conflicting families make the name ambiguous.
    if (matching.has('uprightRow')) matching.delete('row');
    if (matching.has('splitSquat')) matching.delete('squat');
    if (matching.has('sidePlank')) matching.delete('plank');
    matching.forEach(family => families.add(family));
  }
  return families.size === 1 ? [...families][0] : null;
};

export const toAlternativeCandidate = (exercise: ExerciseWithDetails): AlternativeCandidate => ({
  id: exercise.id,
  names: [
    exercise.canonical_name_es ?? exercise.base_name_es,
    exercise.canonical_name_en ?? exercise.base_name_en ?? '',
  ],
  primaryMuscleId: exercise.primary_muscle_id,
  secondaryMuscleId: exercise.secondary_muscle_id,
  equipmentId: exercise.equipment_id,
  loadType: exercise.load_type,
  exerciseTypeCode: exercise.exercise_type_code,
  archived: !!exercise.archived_at,
});

export const rankExerciseAlternatives = (
  source: AlternativeCandidate,
  candidates: readonly AlternativeCandidate[],
  excludedIds: ReadonlySet<string> = new Set(),
  limit = 12,
): ExerciseAlternative[] => {
  const family = getExerciseMovementFamily(source.names);
  if (!source.primaryMuscleId || source.archived) return [];
  const sourceNames = normalizedNames(source);
  const nameTokens = (names: readonly string[]) =>
    new Set(
      names
        .flatMap(name => normalizeExerciseCatalogName(name).split(' '))
        .filter(token => token.length > 1 && !['demo', 'de', 'del', 'con', 'la', 'el', 'the', 'with'].includes(token)),
    );
  const sourceTokens = nameTokens(source.names);
  const unique = new Map<string, ExerciseAlternative>();
  for (const candidate of candidates) {
    if (
      candidate.id === source.id ||
      excludedIds.has(candidate.id) ||
      candidate.archived ||
      candidate.primaryMuscleId !== source.primaryMuscleId ||
      isTimeBasedGymExerciseType(candidate.exerciseTypeCode) !== isTimeBasedGymExerciseType(source.exerciseTypeCode)
    )
      continue;
    const candidateNames = normalizedNames(candidate);
    const sameMovement =
      family !== null &&
      getExerciseMovementFamily(candidate.names) === family &&
      (family !== 'horizontalPress' || pressAngle(sourceNames) === pressAngle(candidateNames)) &&
      !SPECIAL_VARIANTS.some(pattern => pattern.test(candidateNames) && !pattern.test(sourceNames));
    const reasons: AlternativeReason[] = ['sameMuscle'];
    const tokens = nameTokens(candidate.names);
    const shared = [...tokens].filter(token => sourceTokens.has(token)).length;
    const union = new Set([...tokens, ...sourceTokens]).size;
    let score = (sameMovement ? 100 : 0) + (union > 0 ? (20 * shared) / union : 0);
    if (sameMovement) reasons.push('sameMovement');
    if (source.equipmentId !== null && candidate.equipmentId === source.equipmentId) {
      if (!sameMovement) score += 5;
      reasons.push('sameEquipment');
    }
    if (source.equipmentId !== null && candidate.equipmentId !== null && candidate.equipmentId !== source.equipmentId) {
      if (sameMovement) score += 5;
      reasons.push('differentEquipment');
    }
    if (source.loadType && candidate.loadType === source.loadType) {
      score += 2;
      reasons.push('sameLoad');
    }
    if (source.secondaryMuscleId !== null && source.secondaryMuscleId === candidate.secondaryMuscleId) score += 1;
    unique.set(candidate.id, { exerciseId: candidate.id, reasons, score });
  }
  return [...unique.values()]
    .sort((left, right) => right.score - left.score || left.exerciseId.localeCompare(right.exerciseId))
    .slice(0, Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 12);
};
