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
  const topLevel = steps.filter(step => step.parent_step_id == null);
  const result: AdvancedSectionDraft[] = [];

  for (const step of topLevel) {
    result.push(toDraft(step, null));
    for (const child of steps.filter(candidate => candidate.parent_step_id === step.id)) {
      result.push(toDraft(child, step.id));
    }
  }

  return result;
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

  const withoutCommonChildren = sections.filter(
    section => !(section.parentClientId === groupId && section.repetitionIndex == null),
  );
  const expandedChildren = Array.from({ length: group.repetitions }, (_, repetitionIndex) =>
    children.map(child => ({
      ...child,
      clientId: `${child.clientId}-rep-${repetitionIndex + 1}`,
      repetitionIndex: repetitionIndex + 1,
    })),
  ).flat();

  return [...withoutCommonChildren, ...expandedChildren];
}

export function collapseGroupRepetitions(sections: AdvancedSectionDraft[], groupId: string): AdvancedSectionDraft[] {
  const group = sections.find(section => section.clientId === groupId && section.isGroup);
  if (!group) return sections;

  const repeatedChildren = sections.filter(
    section => section.parentClientId === groupId && section.repetitionIndex != null,
  );
  if (repeatedChildren.length === 0) return sections;

  const firstRepetition = repeatedChildren.filter(section => section.repetitionIndex === 1);
  const withoutRepeatedChildren = sections.filter(section => section.parentClientId !== groupId);
  const commonChildren = firstRepetition.map(child => ({
    ...child,
    clientId: child.clientId.replace(/-rep-1$/, ''),
    repetitionIndex: null,
  }));

  return [...withoutRepeatedChildren, ...commonChildren];
}

export function calculateAdvancedTotals(sections: AdvancedSectionDraft[]): AdvancedTotals {
  const leaves = sections.filter(section => !section.isGroup);
  const distanceValues = leaves
    .map(section => section.distanceM)
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  const durationValues = leaves
    .map(section => section.durationS)
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
