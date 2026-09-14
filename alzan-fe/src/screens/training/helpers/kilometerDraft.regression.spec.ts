import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import { parseLocalizedDecimal } from '../../../utils/numericInput';
import {
  buildKilometerSections,
  buildAdvancedSessionTimestamps,
  calculateAdvancedTotals,
  deriveKilometerSectionMetrics,
  hasValidKilometerSections,
  serializeAdvancedSections,
  type KilometerSectionDraft,
} from '../../../modules/training/helpers/advancedEnduranceSession.helper';

// Run the actual screen event handlers without loading the native UI or network hooks.
const source = ts.createSourceFile(
  'EnduranceSessionFormScreen.tsx',
  readFileSync(new URL('../EnduranceSessionFormScreen.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const handlerNames = [
  'selectAdvancedEditorMode',
  'handleKilometerDistanceInputChange',
  'commitKilometerDistance',
  'handleSave',
];
const declarations: string[] = [];
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && handlerNames.includes(node.name.text)) {
    declarations.push(`const ${node.getText(source)};`);
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(declarations.length, handlerNames.length);
const handlersJs = ts.transpileModule(declarations.join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function createDraft(simpleDistance: string) {
  const saved: { session: { distance_m: number; duration_s: number }; sections: unknown[] }[] = [];
  const alerts: string[] = [];
  const state = {
    distance: simpleDistance,
    preferences: { distance_unit: 'km' },
    advancedEditorMode: 'free',
    kilometerDistanceInput: '',
    kilometerSections: [] as KilometerSectionDraft[],
    hasInitializedKilometersRef: { current: false },
  };
  const context = {
    ...state,
    parseLocalizedDecimal,
    buildKilometerSections,
    buildAdvancedSessionTimestamps,
    calculateAdvancedTotals,
    deriveKilometerSectionMetrics,
    hasValidKilometerSections,
    serializeAdvancedSections,
    registrationMode: 'advanced',
    advancedAvailable: true,
    advancedSport: 'running',
    sportType: 'running',
    durationHours: '',
    durationMinutes: '',
    durationSeconds: '',
    toDbDistanceFromDisplay: (value: number) => value * 1000,
    get activeAdvancedSectionsWithDerivedMetrics(): KilometerSectionDraft[] {
      return context.kilometerSections;
    },
    get advancedTotals(): ReturnType<typeof calculateAdvancedTotals> {
      return calculateAdvancedTotals(context.kilometerSections);
    },
    Alert: {
      alert: (_title: string, message: string) => {
        alerts.push(message);
      },
    },
    t: (key: string) => key,
    name: 'Run',
    date: '2026-09-14',
    time: '09:00',
    formatDateForStorage: (value: string) => value,
    formatTimeForStorage: (value: string) => value,
    isValidLocalDate: () => true,
    isValidLocalTime: () => true,
    sportSubtype: null,
    modalityOptions: [],
    resolvePersistedSportSubtype: () => null,
    elevation: '',
    hr: '',
    calories: '',
    rpe: '',
    notes: '',
    activeTemplate: null,
    createAdvancedSession: {
      mutateAsync: async (payload: (typeof saved)[number]) => {
        saved.push(payload);
        return null;
      },
    },
    safeParseFloat: (value: string) => parseLocalizedDecimal(value) ?? 0,
    formatNumberForInput: (value: number, decimals: number) => String(Number(value.toFixed(decimals))),
    setAdvancedEditorMode: (value: string) => {
      context.advancedEditorMode = value;
    },
    setKilometerDistanceInput: (value: string) => {
      context.kilometerDistanceInput = value;
    },
    setKilometerSections: (
      value: KilometerSectionDraft[] | ((previous: KilometerSectionDraft[]) => KilometerSectionDraft[]),
    ) => {
      context.kilometerSections = typeof value === 'function' ? value(context.kilometerSections) : value;
    },
  };
  const dispatch = (expression: string) => runInNewContext(`{ ${handlersJs}\n${expression} }`, context);
  return {
    state: context,
    select: (mode: string) => dispatch(`selectAdvancedEditorMode(${JSON.stringify(mode)})`),
    type: (value: string) => dispatch(`handleKilometerDistanceInputChange(${JSON.stringify(value)})`),
    commit: () => dispatch('commitKilometerDistance()'),
    save: () => dispatch('handleSave()'),
    saved,
    alerts,
    fillTimes: () => {
      context.kilometerSections = context.kilometerSections.map(section => ({ ...section, durationS: 300 }));
    },
  };
}

test('backspacing 12,3 through 12, 1, empty and 0 retains all times until confirmation', () => {
  const draft = createDraft('12,3');
  draft.select('kilometers');
  draft.fillTimes();
  const original = draft.state.kilometerSections;
  for (const value of ['12,', '12', '1', '', '0', '8']) {
    draft.type(value);
    assert.strictEqual(draft.state.kilometerSections, original);
  }
  draft.commit();
  assert.deepEqual(
    draft.state.kilometerSections.map(section => section.durationS),
    Array(8).fill(300),
  );
  draft.type('8,3');
  draft.commit();
  assert.deepEqual(
    draft.state.kilometerSections.map(section => section.durationS),
    [...Array(8).fill(300), null],
  );
});

test('save confirms the typed distance even without blur and recomputes persisted totals', async () => {
  const draft = createDraft('12,3');
  draft.select('kilometers');
  draft.fillTimes();
  draft.type('8');
  await draft.save();
  assert.equal(draft.saved.length, 1);
  assert.equal(draft.saved[0].session.distance_m, 8000);
  assert.equal(draft.saved[0].session.duration_s, 2400);
  assert.equal(draft.saved[0].sections.length, 8);
});

for (const [simpleDistance, unit, expectedMeters] of [
  ['0.301', 'km', 301],
  ['5', 'mi', 8047],
] as const) {
  test(`initial kilometer distance and sections agree to the meter (${simpleDistance} ${unit})`, async () => {
    const draft = createDraft(simpleDistance);
    draft.state.preferences.distance_unit = unit;
    draft.select('kilometers');
    draft.fillTimes();
    assert.equal(draft.state.kilometerDistanceInput, String(expectedMeters / 1000));
    await draft.save();
    assert.equal(draft.saved.length, 1);
    assert.equal(draft.saved[0].session.distance_m, expectedMeters);
  });
}

for (const distance of ['', '0', 'invalid', '8,3']) {
  test(`save rejects invalid distance or untimed new sections (${distance || 'empty'})`, async () => {
    const draft = createDraft('8');
    draft.select('kilometers');
    draft.fillTimes();
    draft.type(distance);
    await draft.save();
    assert.equal(draft.saved.length, 0);
    assert.deepEqual(draft.alerts, ['training.kilometerIntervalsIncomplete']);
  });
}

for (const simpleDistance of ['', '14']) {
  test(`switching modes preserves a kilometer draft independently of Simple (${simpleDistance || 'empty'})`, () => {
    const draft = createDraft(simpleDistance);
    draft.select('kilometers');
    draft.type('8');
    draft.commit();
    draft.fillTimes();
    const original = draft.state.kilometerSections;
    for (const mode of ['free', 'template']) {
      draft.select(mode);
      draft.select('kilometers');
      assert.equal(draft.state.kilometerDistanceInput, '8');
      assert.strictEqual(draft.state.kilometerSections, original);
    }
  });
}

test('blur on an empty or invalid distance preserves recoverable times', () => {
  const draft = createDraft('8');
  draft.select('kilometers');
  draft.fillTimes();
  const original = draft.state.kilometerSections;
  for (const value of ['', '0', 'invalid']) {
    draft.type(value);
    draft.commit();
    assert.strictEqual(draft.state.kilometerSections, original);
  }
  draft.type('8');
  draft.commit();
  assert.deepEqual(
    draft.state.kilometerSections.map(section => section.durationS),
    Array(8).fill(300),
  );
});
