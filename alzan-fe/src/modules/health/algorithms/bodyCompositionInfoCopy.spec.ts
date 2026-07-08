/**
 * Unit tests for localized body composition info copy.
 *
 * Run with:
 *   pnpm --prefix alzan-fe exec tsx src/modules/health/algorithms/bodyCompositionInfoCopy.spec.ts
 */
import assert from 'node:assert/strict';
import en from '../../../i18n/locales/en';
import es from '../../../i18n/locales/es';
import {
  getBodyFatPrecisionTip,
  getLocalizedCompositionFormula,
  getMusclePrecisionTip,
  getRemainderInfoCopy,
} from './bodyCompositionInfoCopy';

type LocaleTree = typeof en;

let passed = 0;
let failed = 0;

const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err instanceof Error ? err.message : String(err)}`);
  }
};

const makeT =
  (locale: LocaleTree) =>
  (key: string, values?: Record<string, string | number>): string => {
    const parts = key.split('.');
    let current: unknown = locale;
    parts.forEach(part => {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      }
    });

    assert.equal(typeof current, 'string', `Missing translation: ${key}`);

    let text = current as string;
    Object.entries(values ?? {}).forEach(([name, value]) => {
      text = text.replace(new RegExp(`{{\\s*${name}\\s*}}`, 'g'), String(value));
    });
    return text;
  };

const tEs = makeT(es);
const tEn = makeT(en);
const englishTechnicalTokens = /\b(female|male|weightKg|heightCm|abdomenCm|hipsCm|heightM)\b/i;

test('Spanish formulas do not leak English technical tokens', () => {
  const formulas = [
    getLocalizedCompositionFormula({ metric: 'bodyFat', method: 'cun_bae', sex: 'male', t: tEs }),
    getLocalizedCompositionFormula({ metric: 'bodyFat', method: 'rfm', sex: 'male', t: tEs }),
    getLocalizedCompositionFormula({ metric: 'bodyFat', method: 'bai', sex: 'male', t: tEs }),
    getLocalizedCompositionFormula({ metric: 'muscle', method: 'lee_et_al', sex: 'male', t: tEs }),
    getLocalizedCompositionFormula({ metric: 'muscle', method: 'al_gindan', sex: 'male', t: tEs }),
  ];

  formulas.forEach(formula => assert.doesNotMatch(formula, englishTechnicalTokens));
  assert.match(formulas[0], /factor mujer = 0/);
});

test('English formulas keep readable factor notes', () => {
  const formula = getLocalizedCompositionFormula({ metric: 'bodyFat', method: 'cun_bae', sex: 'female', t: tEn });

  assert.match(formula, /female factor = 1/);
  assert.doesNotMatch(formula, /\bfemale\s*\+/i);
});

test('body fat tips recommend abdomen unless RFM is already active', () => {
  const basicTip = getBodyFatPrecisionTip('cun_bae', tEs);
  const baiTip = getBodyFatPrecisionTip('bai', tEs);
  const rfmTip = getBodyFatPrecisionTip('rfm', tEs);

  assert.match(basicTip.body, /Añade abdomen/);
  assert.match(baiTip.body, /Añade abdomen/);
  assert.match(rfmTip.title, /grasa corporal/);
  assert.match(rfmTip.body, /no necesitas cadera/i);
});

test('muscle tips ask for abdomen and hip only until Al-Gindan is active', () => {
  const leeTip = getMusclePrecisionTip('lee_et_al', tEs);
  const alGindanTip = getMusclePrecisionTip('al_gindan', tEs);

  assert.match(leeTip.body, /abdomen y cadera/i);
  assert.match(alGindanTip.title, /músculo estimado/i);
  assert.match(alGindanTip.body, /abdomen y cadera/i);
  assert.doesNotMatch(alGindanTip.body, /pecho.*brazo.*muslo/i);
});

test('remainder copy explains residual formula and components', () => {
  const copy = getRemainderInfoCopy(tEs);

  assert.match(copy.formula, /peso total - masa grasa - masa muscular estimada/i);
  assert.match(copy.components, /agua corporal/i);
  assert.match(copy.components, /huesos/i);
  assert.match(copy.note, /hidratación/i);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`${failed} body composition info copy test(s) failed`);
}
