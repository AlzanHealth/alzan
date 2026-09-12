import {
  DEFAULT_ENDURANCE_METRIC_PRIORITY,
  normalizeEnduranceMetricPriority,
  type EnduranceMetricPriority,
} from './enduranceMetricPriority.helper';

export type AdvancedSport = 'running' | 'cycling' | 'swimming';

export type AdvancedPhaseType = 'warmup' | 'interval' | 'recovery' | 'cooldown' | 'relax';
export type AdvancedDurationType = 'time' | 'distance' | 'lap_button';

export type AdvancedSectionDraft = {
  clientId: string;
  parentClientId: string | null;
  sourceTemplateStepId: string | null;
  isGroup: boolean;
  phaseType: AdvancedPhaseType;
  durationType: AdvancedDurationType;
  label: string | null;
  repetitions: number;
  repetitionIndex: number | null;
  distanceM: number | null;
  durationS: number | null;
  paceSPerKm: number | null;
  paceSPer100m: number | null;
  speedMPerS: number | null;
  heartRateAvg: number | null;
  heartRateMax: number | null;
  powerAvgW: number | null;
  powerMaxW: number | null;
  cadenceAvg: number | null;
  elevationGainM: number | null;
  caloriesKcal: number | null;
  rpe: number | null;
  notes: string | null;
};

export type AdvancedTemplateStep = {
  id: string;
  parent_step_id: string | null;
  order_index: number | null;
  is_group: boolean | null;
  phase_type: AdvancedPhaseType;
  duration_type: AdvancedDurationType;
  duration_s: number | null;
  distance_m: number | null;
  repetitions: number | null;
  target_min: number | null;
  target_max: number | null;
  target_type: 'none' | 'pace' | 'heart_rate' | 'power' | 'speed' | 'heart_rate_zone' | 'rpe';
};

export type AdvancedTotals = {
  distanceM: number | null;
  durationS: number | null;
  paceSPerKm: number | null;
  paceSPer100m: number | null;
  speedMPerS: number | null;
};

export type AdvancedSerializedSection = AdvancedSectionDraft & {
  orderIndex: number;
};

export type AdvancedMetricField = 'duration' | 'distance' | 'intensity';

export type KilometerSectionDraft = AdvancedSectionDraft & {
  kilometerIndex: number;
};

type OrderedItem = {
  order_index: number | null | undefined;
};

/**
 * Sorts sibling records without mutating the source array. Records with the
 * same or missing order keep their original relative position.
 */
export function sortByOrderIndex<T extends OrderedItem>(items: T[]): T[] {
  return items
    .map((item, sourceIndex) => ({ item, sourceIndex }))
    .sort((left, right) => {
      const leftOrder = left.item.order_index ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.item.order_index ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.sourceIndex - right.sourceIndex;
    })
    .map(({ item }) => item);
}

/**
 * Materializes template steps in stable pre-order: each parent is followed
 * by all of its ordered descendants before the next sibling is emitted.
 * Orphaned records are appended in their stable database order so data is
 * never silently lost if an old or invalid row is encountered.
 */
type HierarchicalTemplateStep = OrderedItem & {
  id: string;
  parent_step_id: string | null;
};

export function sortAdvancedTemplateSteps<T extends HierarchicalTemplateStep>(steps: T[]): T[] {
  const siblingsByParent = new Map<string | null, T[]>();
  for (const step of steps) {
    const siblings = siblingsByParent.get(step.parent_step_id) ?? [];
    siblings.push(step);
    siblingsByParent.set(step.parent_step_id, siblings);
  }

  for (const [parentId, siblings] of siblingsByParent) {
    siblingsByParent.set(parentId, sortByOrderIndex(siblings));
  }

  const visited = new Set<string>();
  const ordered: T[] = [];
  const visit = (step: T): void => {
    if (visited.has(step.id)) return;
    visited.add(step.id);
    ordered.push(step);
    for (const child of siblingsByParent.get(step.id) ?? []) visit(child);
  };

  for (const step of siblingsByParent.get(null) ?? []) visit(step);
  for (const step of sortByOrderIndex(steps)) visit(step);

  return ordered;
}

const EMPTY_METRICS: Pick<
  AdvancedSectionDraft,
  | 'distanceM'
  | 'durationS'
  | 'paceSPerKm'
  | 'paceSPer100m'
  | 'speedMPerS'
  | 'heartRateAvg'
  | 'heartRateMax'
  | 'powerAvgW'
  | 'powerMaxW'
  | 'cadenceAvg'
  | 'elevationGainM'
  | 'caloriesKcal'
  | 'rpe'
  | 'notes'
> = {
  distanceM: null,
  durationS: null,
  paceSPerKm: null,
  paceSPer100m: null,
  speedMPerS: null,
  heartRateAvg: null,
  heartRateMax: null,
  powerAvgW: null,
  powerMaxW: null,
  cadenceAvg: null,
  elevationGainM: null,
  caloriesKcal: null,
  rpe: null,
  notes: null,
};

export function createEmptyAdvancedSection(
  clientId: string,
  parentClientId: string | null = null,
): AdvancedSectionDraft {
  return {
    clientId,
    parentClientId,
    sourceTemplateStepId: null,
    isGroup: false,
    phaseType: 'interval',
    durationType: 'time',
    label: null,
    repetitions: 1,
    repetitionIndex: null,
    ...EMPTY_METRICS,
  };
}

export function buildKilometerSections(
  distanceM: number | null,
  previousSections: KilometerSectionDraft[] = [],
): KilometerSectionDraft[] {
  const normalizedDistanceM =
    distanceM != null && Number.isFinite(distanceM) && distanceM > 0 ? Math.round(distanceM) : 0;
  if (normalizedDistanceM === 0) return [];

  const sectionDistances = Array.from({ length: Math.ceil(normalizedDistanceM / 1000) }, (_, index) => {
    const remainingM = normalizedDistanceM - index * 1000;
    return Math.min(1000, remainingM);
  });

  return sectionDistances.map((sectionDistanceM, index) => {
    const previous = previousSections[index];
    const draft = createEmptyAdvancedSection(`kilometer-${index + 1}`);
    return {
      ...draft,
      kilometerIndex: index + 1,
      label: `Km ${index + 1}`,
      distanceM: sectionDistanceM,
      durationS: previous?.distanceM === sectionDistanceM ? previous.durationS : null,
      paceSPerKm: previous?.distanceM === sectionDistanceM ? previous.paceSPerKm : null,
      paceSPer100m: previous?.distanceM === sectionDistanceM ? previous.paceSPer100m : null,
      speedMPerS: previous?.distanceM === sectionDistanceM ? previous.speedMPerS : null,
    };
  });
}

export function deriveKilometerSectionMetrics(
  section: KilometerSectionDraft,
  sport: AdvancedSport,
): KilometerSectionDraft {
  const durationS = positiveValue(section.durationS);
  if (!durationS || !section.distanceM || section.distanceM <= 0) {
    return {
      ...section,
      paceSPerKm: null,
      paceSPer100m: null,
      speedMPerS: null,
    };
  }

  const distanceM = section.distanceM;
  if (sport === 'running') {
    return { ...section, paceSPerKm: (durationS / distanceM) * 1000 };
  }
  if (sport === 'swimming') {
    return { ...section, paceSPer100m: (durationS / distanceM) * 100 };
  }
  return { ...section, speedMPerS: distanceM / durationS };
}

export function hasValidKilometerSections(sections: KilometerSectionDraft[]): boolean {
  return (
    sections.length > 0 &&
    sections.every(
      section =>
        section.distanceM != null && section.distanceM > 0 && section.durationS != null && section.durationS > 0,
    )
  );
}

function toDraft(step: AdvancedTemplateStep, parentClientId: string | null): AdvancedSectionDraft {
  const target = step.target_min ?? step.target_max;
  return {
    clientId: step.id,
    parentClientId,
    sourceTemplateStepId: step.id,
    isGroup: Boolean(step.is_group),
    phaseType: step.phase_type,
    durationType: step.duration_type,
    label: null,
    repetitions: Math.max(1, step.repetitions ?? 1),
    repetitionIndex: null,
    ...EMPTY_METRICS,
    distanceM: step.distance_m,
    durationS: step.duration_s,
    paceSPerKm: step.target_type === 'pace' ? target : null,
    paceSPer100m: null,
    speedMPerS: step.target_type === 'speed' ? target : null,
  };
}

export function materializeTemplateSections(steps: AdvancedTemplateStep[]): AdvancedSectionDraft[] {
  return sortAdvancedTemplateSteps(steps).map(step => toDraft(step, step.parent_step_id));
}

export function addAdvancedSection(
  sections: AdvancedSectionDraft[],
  clientId: string,
  parentClientId: string | null = null,
): AdvancedSectionDraft[] {
  return [...sections, createEmptyAdvancedSection(clientId, parentClientId)];
}

export function addAdvancedGroup(
  sections: AdvancedSectionDraft[],
  groupId: string,
  childId: string,
): AdvancedSectionDraft[] {
  const group: AdvancedSectionDraft = {
    ...createEmptyAdvancedSection(groupId),
    isGroup: true,
    phaseType: 'interval',
    durationType: 'lap_button',
    repetitions: 2,
  };
  const child = createEmptyAdvancedSection(childId, groupId);
  return [...sections, group, child];
}

export function insertAdvancedSectionsAfterSubtree(
  sections: AdvancedSectionDraft[],
  parentClientId: string,
  additions: AdvancedSectionDraft[],
): AdvancedSectionDraft[] {
  const descendantIds = new Set<string>([parentClientId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const section of sections) {
      if (section.parentClientId && descendantIds.has(section.parentClientId) && !descendantIds.has(section.clientId)) {
        descendantIds.add(section.clientId);
        changed = true;
      }
    }
  }

  const parentIndex = sections.findIndex(section => section.clientId === parentClientId);
  if (parentIndex < 0) return sections;
  const lastDescendantIndex = sections.reduce(
    (lastIndex, section, index) => (descendantIds.has(section.clientId) ? Math.max(lastIndex, index) : lastIndex),
    parentIndex,
  );

  return [...sections.slice(0, lastDescendantIndex + 1), ...additions, ...sections.slice(lastDescendantIndex + 1)];
}

export function removeAdvancedSection(sections: AdvancedSectionDraft[], clientId: string): AdvancedSectionDraft[] {
  const removed = new Set<string>([clientId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const section of sections) {
      if (section.parentClientId && removed.has(section.parentClientId) && !removed.has(section.clientId)) {
        removed.add(section.clientId);
        changed = true;
      }
    }
  }
  return sections.filter(section => !removed.has(section.clientId));
}

export function expandGroupRepetitions(sections: AdvancedSectionDraft[], groupId: string): AdvancedSectionDraft[] {
  const group = sections.find(section => section.clientId === groupId && section.isGroup);
  if (!group || group.repetitions <= 1) return sections;

  const children = sections.filter(section => section.parentClientId === groupId && section.repetitionIndex == null);
  if (children.length === 0) return sections;

  const expandedChildren = Array.from({ length: group.repetitions }, (_, repetitionIndex) =>
    children.map(child => ({
      ...child,
      clientId: `${child.clientId}-rep-${repetitionIndex + 1}`,
      repetitionIndex: repetitionIndex + 1,
    })),
  ).flat();
  const firstChildIndex = sections.findIndex(
    section => section.parentClientId === groupId && section.repetitionIndex == null,
  );
  if (firstChildIndex < 0) return sections;

  const commonChildIds = new Set(children.map(child => child.clientId));
  return sections.flatMap((section, index) => {
    if (index === firstChildIndex) return expandedChildren;
    if (commonChildIds.has(section.clientId)) return [];
    return [section];
  });
}

export function collapseGroupRepetitions(sections: AdvancedSectionDraft[], groupId: string): AdvancedSectionDraft[] {
  const group = sections.find(section => section.clientId === groupId && section.isGroup);
  if (!group) return sections;

  const repeatedChildren = sections.filter(
    section => section.parentClientId === groupId && section.repetitionIndex != null,
  );
  if (repeatedChildren.length === 0) return sections;

  const firstRepetition = repeatedChildren.filter(section => section.repetitionIndex === 1);
  const commonChildren = firstRepetition.map(child => ({
    ...child,
    clientId: child.clientId.replace(/-rep-1$/, ''),
    repetitionIndex: null,
  }));

  const firstRepeatedChildIndex = sections.findIndex(
    section => section.parentClientId === groupId && section.repetitionIndex != null,
  );
  if (firstRepeatedChildIndex < 0) return sections;

  return sections.flatMap((section, index) => {
    if (index === firstRepeatedChildIndex) return commonChildren;
    if (section.parentClientId === groupId && section.repetitionIndex != null) return [];
    return [section];
  });
}

function positiveValue(value: number | null): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

function getIntensityKey(sport: AdvancedSport): 'paceSPerKm' | 'paceSPer100m' | 'speedMPerS' {
  return sport === 'running' ? 'paceSPerKm' : sport === 'swimming' ? 'paceSPer100m' : 'speedMPerS';
}

/**
 * Keeps the configured highest-priority metrics and recalculates the
 * lowest-priority metric whenever one of the other metrics changes. The
 * default priority is pace/speed, time, distance.
 */
export function deriveAdvancedSectionMetrics(
  section: AdvancedSectionDraft,
  sport: AdvancedSport,
  changedField?: AdvancedMetricField,
  priority: EnduranceMetricPriority = DEFAULT_ENDURANCE_METRIC_PRIORITY,
): AdvancedSectionDraft {
  if (section.isGroup) return section;

  const normalizedPriority = normalizeEnduranceMetricPriority(priority);

  const intensityKey = getIntensityKey(sport);
  const durationS = positiveValue(section.durationS);
  const distanceM = positiveValue(section.distanceM);
  const intensity = positiveValue(section[intensityKey]);
  const next = { ...section };

  const calculateDistance = (duration: number, value: number) =>
    sport === 'swimming'
      ? (duration / value) * 100
      : sport === 'running'
        ? (duration / value) * 1000
        : duration * value;
  const calculateDuration = (distance: number, value: number) =>
    sport === 'swimming'
      ? (distance / 100) * value
      : sport === 'running'
        ? (distance / 1000) * value
        : distance / value;
  const calculateRoundedDuration = (distance: number, value: number) =>
    Math.max(1, Math.round(calculateDuration(distance, value)));
  const calculateIntensity = (duration: number, distance: number) =>
    sport === 'swimming'
      ? duration / (distance / 100)
      : sport === 'running'
        ? duration / (distance / 1000)
        : distance / duration;

  const deriveField = (field: AdvancedMetricField): boolean => {
    if (field === 'distance' && durationS != null && intensity != null) {
      next.distanceM = calculateDistance(durationS, intensity);
      return true;
    }
    if (field === 'duration' && distanceM != null && intensity != null) {
      next.durationS = calculateRoundedDuration(distanceM, intensity);
      return true;
    }
    if (field === 'intensity' && distanceM != null && durationS != null) {
      next[intensityKey] = calculateIntensity(durationS, distanceM);
      return true;
    }
    return false;
  };

  if (changedField != null) {
    const targetField = changedField === normalizedPriority[2] ? normalizedPriority[1] : normalizedPriority[2];
    if (deriveField(targetField)) return next;
  }

  if (changedField === 'duration' && durationS != null) {
    if (distanceM != null) next[intensityKey] = calculateIntensity(durationS, distanceM);
    else if (intensity != null) next.distanceM = calculateDistance(durationS, intensity);
    return next;
  }

  if (changedField === 'distance') {
    if (distanceM != null) {
      if (durationS != null) next[intensityKey] = calculateIntensity(durationS, distanceM);
      else if (intensity != null) next.durationS = calculateRoundedDuration(distanceM, intensity);
    } else if (durationS != null && intensity != null) {
      next.distanceM = calculateDistance(durationS, intensity);
    }
    return next;
  }

  if (changedField === 'intensity' && intensity != null) {
    if (distanceM != null) next.durationS = calculateRoundedDuration(distanceM, intensity);
    else if (durationS != null) next.distanceM = calculateDistance(durationS, intensity);
    return next;
  }

  if (durationS != null && distanceM != null && intensity == null) {
    next[intensityKey] = calculateIntensity(durationS, distanceM);
  } else if (durationS != null && intensity != null && distanceM == null) {
    next.distanceM = calculateDistance(durationS, intensity);
  } else if (distanceM != null && intensity != null && durationS == null) {
    next.durationS = calculateRoundedDuration(distanceM, intensity);
  }

  return next;
}

export function calculateAdvancedTotals(sections: AdvancedSectionDraft[]): AdvancedTotals {
  const groupRepetitions = new Map(
    sections.filter(section => section.isGroup).map(section => [section.clientId, Math.max(1, section.repetitions)]),
  );
  const leaves = sections.filter(section => !section.isGroup);
  const distanceValues = leaves
    .map(section => {
      const multiplier =
        section.parentClientId && section.repetitionIndex == null
          ? (groupRepetitions.get(section.parentClientId) ?? 1)
          : 1;
      return section.distanceM == null ? null : section.distanceM * multiplier;
    })
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  const durationValues = leaves
    .map(section => {
      const multiplier =
        section.parentClientId && section.repetitionIndex == null
          ? (groupRepetitions.get(section.parentClientId) ?? 1)
          : 1;
      return section.durationS == null ? null : section.durationS * multiplier;
    })
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  const distanceM = distanceValues.length > 0 ? distanceValues.reduce((sum, value) => sum + value, 0) : null;
  const durationS = durationValues.length > 0 ? durationValues.reduce((sum, value) => sum + value, 0) : null;

  return {
    distanceM,
    durationS,
    paceSPerKm: distanceM && durationS ? durationS / (distanceM / 1000) : null,
    paceSPer100m: distanceM && durationS ? durationS / (distanceM / 100) : null,
    speedMPerS: distanceM && durationS ? distanceM / durationS : null,
  };
}

function formatLocalDateTime(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  const seconds = String(value.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

export function buildAdvancedSessionTimestamps(
  localDate: string,
  localTime: string,
  durationSeconds: number,
): { startTime: string; endTime: string; startedAtLocal: string; endedAtLocal: string } {
  const startedAtLocal = `${localDate}T${localTime}:00`;
  const start = new Date(startedAtLocal);
  const safeDurationSeconds = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  const end = new Date(start.getTime() + safeDurationSeconds * 1000);
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    startedAtLocal,
    endedAtLocal: formatLocalDateTime(end),
  };
}

export function hasValidAdvancedSection(sections: AdvancedSectionDraft[]): boolean {
  return sections.some(
    section =>
      !section.isGroup &&
      ((section.distanceM != null && Number.isFinite(section.distanceM) && section.distanceM > 0) ||
        (section.durationS != null && Number.isFinite(section.durationS) && section.durationS > 0)),
  );
}

export function serializeAdvancedSections(sections: AdvancedSectionDraft[]): AdvancedSerializedSection[] {
  return sections.map((section, orderIndex) => ({ ...section, orderIndex }));
}
