import type { WorkoutTemplateExerciseWithDetails } from '../ActiveWorkoutScreen';
import type { GymSetMode } from './gymSetMode.helper';

export type ActiveWorkoutDraft = {
  version: 1;
  inputs: Record<string, { weight: string; reps: string }>;
  setModes: Record<string, GymSetMode>;
  completedSets: string[];
  extraSets: Record<string, number>;
  adhocExercises: WorkoutTemplateExerciseWithDetails[];
  hiddenExercises: string[];
  exerciseOrder: string[];
  supersetLinks: string[];
  setIds?: Record<string, string>;
};

export const emptyActiveWorkoutDraft = (): ActiveWorkoutDraft => ({
  version: 1,
  inputs: {},
  setModes: {},
  completedSets: [],
  extraSets: {},
  adhocExercises: [],
  hiddenExercises: [],
  exerciseOrder: [],
  supersetLinks: [],
});

export interface ActiveWorkoutDraftStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const nullableNumber = (value: unknown) => value === null || finite(value);
const nullableString = (value: unknown) => value === null || typeof value === 'string';
const exercise = (value: unknown) => {
  if (!record(value)) return false;
  if (
    !['id', 'exercise_id', 'workout_template_id', 'drop_set_mode'].every(key => typeof value[key] === 'string') ||
    typeof value.is_warmup !== 'boolean' ||
    !finite(value.order_index) ||
    !['notes', 'superset_next_exercise_id', 'user_id'].every(key => nullableString(value[key])) ||
    !['rest_seconds', 'target_reps_max', 'target_reps_min', 'target_rpe', 'target_sets', 'target_weight_kg'].every(
      key => nullableNumber(value[key]),
    )
  )
    return false;
  const detail = value.exercise;
  return (
    detail === null ||
    (record(detail) &&
      ['id', 'base_name_es', 'created_at'].every(key => typeof detail[key] === 'string') &&
      typeof detail.is_custom === 'boolean' &&
      ['base_name_en', 'description_en', 'description_es', 'difficulty', 'owner_user_id'].every(key =>
        nullableString(detail[key]),
      ) &&
      ['equipment_id', 'exercise_type_id', 'primary_muscle_id', 'secondary_muscle_id'].every(key =>
        nullableNumber(detail[key]),
      ))
  );
};

export function validateActiveWorkoutDraft(value: unknown): asserts value is ActiveWorkoutDraft {
  if (
    !record(value) ||
    value.version !== 1 ||
    !record(value.inputs) ||
    !Object.values(value.inputs).every(
      item => record(item) && typeof item.weight === 'string' && typeof item.reps === 'string',
    ) ||
    !record(value.setModes) ||
    !Object.values(value.setModes).every(item => ['normal', 'warmup', 'drop_set'].includes(String(item))) ||
    !record(value.extraSets) ||
    !Object.values(value.extraSets).every(item => typeof item === 'number' && Number.isSafeInteger(item)) ||
    (value.setIds !== undefined &&
      (!record(value.setIds) || !Object.values(value.setIds).every(item => typeof item === 'string'))) ||
    !['completedSets', 'hiddenExercises', 'exerciseOrder', 'supersetLinks'].every(key => strings(value[key])) ||
    !Array.isArray(value.adhocExercises) ||
    !value.adhocExercises.every(exercise)
  ) {
    throw new Error('Invalid active workout draft');
  }
}

export const activeWorkoutDraftKey = (userId: string, sessionId: string) =>
  `active_workout_draft_v1:${encodeURIComponent(userId)}:${encodeURIComponent(sessionId)}`;
const legacyFields = [
  'inputs',
  'completed_sets',
  'extra_sets',
  'set_modes',
  'warmup_sets',
  'adhoc',
  'hidden',
  'order',
  'superset_links',
] as const;
const legacyKeys = (sessionId: string) => legacyFields.map(field => `active_session_${field}_${sessionId}`);

async function readDraft(storage: ActiveWorkoutDraftStorage, key: string, sessionId: string, seed: ActiveWorkoutDraft) {
  const stored = await storage.getItem(key);
  if (stored !== null) {
    const value: unknown = JSON.parse(stored);
    validateActiveWorkoutDraft(value);
    return value;
  }
  const values = await Promise.all(
    legacyKeys(sessionId).map(async legacyKey => {
      const raw = await storage.getItem(legacyKey);
      return raw === null ? undefined : (JSON.parse(raw) as unknown);
    }),
  );
  const indexId = (value: unknown): string => {
    if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
      const index = Number(value);
      if (!Number.isSafeInteger(index) || !seed.exerciseOrder[index]) throw new Error('Invalid legacy exercise index');
      return seed.exerciseOrder[index];
    }
    if (typeof value !== 'string') throw new Error('Invalid legacy exercise identity');
    return value;
  };
  const setKey = (key: string) =>
    key.replace(/^(\d+)-(\d+)$/, (_, index: string, number: string) => `${indexId(index)}-${number}`);
  const mapRecord = (value: unknown, sets: boolean) => {
    if (!record(value)) throw new Error('Invalid legacy draft record');
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [sets ? setKey(key) : indexId(key), item]));
  };
  const mapArray = (value: unknown, transform: (item: unknown) => string) => {
    if (!Array.isArray(value)) throw new Error('Invalid legacy draft array');
    return value.map(transform);
  };
  const [inputs, completed, extra, modes, warmups, adhoc, hidden, order, links] = values;
  const migratedAdhoc = Array.isArray(adhoc)
    ? adhoc.map((item, index) =>
        record(item)
          ? {
              workout_template_id: '',
              user_id: null,
              notes: null,
              target_rpe: null,
              superset_next_exercise_id: null,
              order_index: seed.exerciseOrder.length + index,
              ...item,
            }
          : item,
      )
    : adhoc;
  let migratedModes = modes === undefined ? undefined : mapRecord(modes, true);
  if (warmups !== undefined) {
    const parsed = mapRecord(warmups, true);
    if (!Object.values(parsed).every(item => typeof item === 'boolean')) throw new Error('Invalid legacy warmup modes');
    if (modes === undefined)
      migratedModes = Object.fromEntries(
        Object.entries(parsed).map(([key, enabled]) => [key, enabled ? 'warmup' : 'normal']),
      );
  }
  const draft: unknown = {
    ...seed,
    inputs:
      inputs === undefined
        ? seed.inputs
        : {
            ...seed.inputs,
            ...Object.fromEntries(
              Object.entries(mapRecord(inputs, true)).map(([key, item]) => [
                key,
                record(item) ? { weight: '', reps: '', ...item } : item,
              ]),
            ),
          },
    completedSets: completed === undefined ? seed.completedSets : mapArray(completed, item => setKey(indexId(item))),
    extraSets: extra === undefined ? seed.extraSets : mapRecord(extra, false),
    setModes: migratedModes ?? seed.setModes,
    adhocExercises: adhoc === undefined ? seed.adhocExercises : migratedAdhoc,
    hiddenExercises: hidden === undefined ? seed.hiddenExercises : mapArray(hidden, indexId),
    exerciseOrder: order === undefined ? seed.exerciseOrder : mapArray(order, indexId),
    supersetLinks:
      links === undefined
        ? seed.supersetLinks
        : mapArray(links, item => {
            if (typeof item === 'number') return `${indexId(item)}|${indexId(item + 1)}`;
            if (typeof item !== 'string') throw new Error('Invalid legacy superset link');
            return item.split('|').map(indexId).join('|');
          }),
  };
  validateActiveWorkoutDraft(draft);
  return {
    ...draft,
    exerciseOrder: [...new Set([...draft.exerciseOrder, ...draft.adhocExercises.map(item => item.exercise_id)])],
  };
}

type Snapshot = { draft: ActiveWorkoutDraft; ready: boolean; error: unknown };

/** A shared per-key owner keeps queued writes and failed edits alive across mounts. */
class ActiveWorkoutDraftStore {
  private snapshot: Snapshot = { draft: emptyActiveWorkoutDraft(), ready: false, error: null };
  private listeners = new Set<() => void>();
  private tail: Promise<void> = Promise.resolve();
  private hydration: Promise<void> | undefined;
  private seed: ActiveWorkoutDraft | undefined;
  private dirty = false;
  private stopped = false;
  private clearing: Promise<void> | undefined;

  constructor(
    private storage: ActiveWorkoutDraftStorage,
    private key: string,
    private sessionId: string,
  ) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(value: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...value };
    this.listeners.forEach(listener => listener());
  }
  hydrate = (seed: ActiveWorkoutDraft): Promise<void> => {
    if (this.snapshot.ready || this.stopped) return Promise.resolve();
    if (this.hydration) return this.hydration;
    this.seed = seed;
    this.hydration = (async () => {
      try {
        validateActiveWorkoutDraft(seed);
        const draft = await readDraft(this.storage, this.key, this.sessionId, seed);
        if (this.stopped) return;
        this.publish({ draft, ready: true, error: null });
        this.enqueue(draft);
      } catch (error) {
        this.publish({ error });
      }
    })();
    return this.hydration;
  };
  private enqueue(draft: ActiveWorkoutDraft) {
    const serialized = JSON.stringify(draft);
    this.dirty = true;
    this.tail = this.tail.then(async () => {
      if (this.stopped) return;
      try {
        await this.storage.setItem(this.key, serialized);
        if (this.snapshot.draft === draft) this.dirty = false;
        this.publish({ error: null });
      } catch (error) {
        this.publish({ error });
      }
    });
  }
  update = (fn: (prev: ActiveWorkoutDraft) => ActiveWorkoutDraft) => {
    if (!this.snapshot.ready || this.stopped) throw new Error('Active workout draft is not writable');
    const draft = fn(this.snapshot.draft);
    validateActiveWorkoutDraft(draft);
    this.publish({ draft });
    this.enqueue(draft);
  };
  retry = () => {
    if (this.stopped) return;
    if (!this.snapshot.ready && this.seed) {
      this.hydration = undefined;
      void this.hydrate(this.seed);
    } else if (this.dirty) this.enqueue(this.snapshot.draft);
  };
  flush = async () => {
    await this.hydration;
    let pending: Promise<void>;
    do {
      pending = this.tail;
      await pending;
    } while (pending !== this.tail);
    if (this.snapshot.error !== null) throw this.snapshot.error;
    if (!this.snapshot.ready) throw new Error('Active workout draft is not ready');
  };
  /** Call only after the remote finish/cancel operation succeeds. */
  clear = (): Promise<void> => {
    if (this.clearing) return this.clearing;
    this.stopped = true;
    this.clearing = (async () => {
      await this.hydration;
      await this.tail;
      // Keep the atomic copy if legacy cleanup fails, preventing stale migration.
      for (const key of legacyKeys(this.sessionId)) await this.storage.removeItem(key);
      await this.storage.removeItem(this.key);
      this.dirty = false;
      this.publish({ draft: emptyActiveWorkoutDraft(), ready: false, error: null });
    })().catch(error => {
      this.clearing = undefined;
      this.publish({ error });
      throw error;
    });
    return this.clearing;
  };
}

const stores = new WeakMap<ActiveWorkoutDraftStorage, Map<string, ActiveWorkoutDraftStore>>();
export function getActiveWorkoutDraftStore(storage: ActiveWorkoutDraftStorage, userId: string, sessionId: string) {
  let scoped = stores.get(storage);
  if (!scoped) {
    scoped = new Map();
    stores.set(storage, scoped);
  }
  const key = activeWorkoutDraftKey(userId, sessionId);
  let store = scoped.get(key);
  if (!store) {
    store = new ActiveWorkoutDraftStore(storage, key, sessionId);
    scoped.set(key, store);
  }
  return store;
}
