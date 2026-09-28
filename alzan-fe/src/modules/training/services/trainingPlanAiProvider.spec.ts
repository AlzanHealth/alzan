import assert from 'node:assert/strict';
import {
  buildAiClipboardText,
  buildTrainingAiLaunchTarget,
  isAiCatalogReady,
  launchTrainingAiOnWeb,
  type TrainingAiLaunchResult,
  type TrainingAiProvider,
} from './trainingPlanAiProvider';
import { buildTrainingPlanAiPrompt, type TrainingExerciseAiCatalogRow } from './trainingPlanAiPrompt';

const shortPrompt = 'Convierte este entrenamiento a JSON.';
const longPrompt = 'x'.repeat(20_000);

const providers: TrainingAiProvider[] = ['chatgpt', 'gemini', 'claude'];
const clipboardFailure: TrainingAiLaunchResult = { ok: false, kind: 'clipboard-error' };
assert.equal(clipboardFailure.kind, 'clipboard-error');
assert.equal(isAiCatalogReady(0, true), false);
assert.equal(isAiCatalogReady(10, true), false);
assert.equal(isAiCatalogReady(0, false), false);
assert.equal(isAiCatalogReady(10, false), true);
providers.forEach(provider => {
  const target = buildTrainingAiLaunchTarget(provider, shortPrompt);
  assert.ok(target, `${provider} must accept a short prompt`);
  assert.ok(target.url.startsWith('https://'), `${provider} must use an HTTPS destination`);
});

const chatGptTarget = buildTrainingAiLaunchTarget('chatgpt', shortPrompt);
assert.ok(chatGptTarget);
assert.equal(chatGptTarget.mode, 'prefilled');
assert.ok(chatGptTarget.url.startsWith('https://chatgpt.com/?prompt='));
assert.ok(chatGptTarget.url.includes(encodeURIComponent(shortPrompt)));

const realTrainingCatalog: TrainingExerciseAiCatalogRow[] = [
  {
    exercise_id: '1',
    exercise_name_es: 'Sentadilla',
    exercise_name_en: 'Squat',
    exercise_type: 'reps',
    load_type: 'external',
    primary_muscle: 'quadriceps',
    secondary_muscle: 'gluteus',
    equipment: 'barbell',
    is_custom: false,
  },
];
const realTrainingPrompt = buildTrainingPlanAiPrompt(realTrainingCatalog, '2026-09-28');
const realChatGptTarget = buildTrainingAiLaunchTarget('chatgpt', realTrainingPrompt);
assert.ok(realChatGptTarget.url.length <= 12_000);
if (realChatGptTarget.mode === 'prefilled') {
  assert.equal(new URL(realChatGptTarget.url).searchParams.get('prompt'), realTrainingPrompt);
} else {
  const clipboard = buildAiClipboardText(
    realChatGptTarget,
    realTrainingPrompt,
    'ejercicios.csv\nexercises_rows\nSentadilla',
  );
  assert.ok(clipboard.includes(realTrainingPrompt));
  assert.ok(clipboard.includes('exercises_rows\nSentadilla'));
}

const longChatGptTarget = buildTrainingAiLaunchTarget('chatgpt', longPrompt);
assert.ok(longChatGptTarget);
assert.equal(longChatGptTarget.mode, 'clipboard');
assert.equal(longChatGptTarget.url, 'https://chatgpt.com/');

const geminiTarget = buildTrainingAiLaunchTarget('gemini', shortPrompt);
assert.ok(geminiTarget);
assert.equal(geminiTarget.mode, 'prefilled');
assert.ok(geminiTarget.url.startsWith('https://aistudio.google.com/prompts/new_chat?prompt='));
assert.ok(geminiTarget.url.includes(encodeURIComponent(shortPrompt)));

const claudeTarget = buildTrainingAiLaunchTarget('claude', shortPrompt);
assert.ok(claudeTarget);
assert.equal(claudeTarget.mode, 'prefilled');
assert.ok(claudeTarget.url.startsWith('https://claude.ai/new?q='));
assert.ok(claudeTarget.url.includes(encodeURIComponent(shortPrompt)));

const ingredientCatalog = 'ingredientes.csv\ningredients_rows\nname_es\nArroz';
assert.equal(buildAiClipboardText(chatGptTarget, shortPrompt, ingredientCatalog), ingredientCatalog);
assert.equal(buildAiClipboardText(geminiTarget, shortPrompt, ingredientCatalog), ingredientCatalog);
assert.equal(buildAiClipboardText(claudeTarget, shortPrompt, ingredientCatalog), ingredientCatalog);

const testWebLaunchFlow = async (): Promise<void> => {
  {
    const events: string[] = [];
    const result = await launchTrainingAiOnWeb({
      copySync: () => {
        events.push('copy-sync');
        return true;
      },
      copyAsync: async () => {
        events.push('copy-async');
      },
      openInNewTab: () => {
        events.push('open');
        return true;
      },
      redirectCurrentTab: () => {
        events.push('redirect');
      },
    });

    assert.equal(result, 'opened');
    assert.deepEqual(events, ['copy-sync', 'open']);
  }

  {
    const events: string[] = [];
    const result = await launchTrainingAiOnWeb({
      copySync: () => {
        events.push('copy-sync');
        return false;
      },
      copyAsync: async () => {
        events.push('copy-async');
      },
      openInNewTab: () => {
        events.push('open');
        return true;
      },
      redirectCurrentTab: () => {
        events.push('redirect');
      },
    });

    assert.equal(result, 'opened');
    assert.deepEqual(events, ['copy-sync', 'copy-async', 'open']);
  }

  {
    const events: string[] = [];
    const result = await launchTrainingAiOnWeb({
      copySync: () => {
        events.push('copy-sync');
        return false;
      },
      copyAsync: async () => {
        events.push('copy-async');
      },
      openInNewTab: () => {
        events.push('open');
        return false;
      },
      redirectCurrentTab: () => {
        events.push('redirect');
      },
    });

    assert.equal(result, 'redirected');
    assert.deepEqual(events, ['copy-sync', 'copy-async', 'open', 'redirect']);
  }

  {
    const events: string[] = [];
    const result = await launchTrainingAiOnWeb({
      copySync: () => {
        events.push('copy-sync');
        return false;
      },
      copyAsync: async () => {
        events.push('copy-async');
        throw new Error('Modern clipboard denied');
      },
      openInNewTab: () => {
        events.push('open');
        return true;
      },
      redirectCurrentTab: () => {
        events.push('redirect');
      },
      closeOpenedWindow: () => {
        events.push('close');
      },
    });

    assert.equal(result, 'clipboard-error');
    assert.deepEqual(events, ['copy-sync', 'copy-async', 'close']);
  }
};

void testWebLaunchFlow()
  .then(() => {
    console.log('trainingPlanAiProvider tests passed');
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
