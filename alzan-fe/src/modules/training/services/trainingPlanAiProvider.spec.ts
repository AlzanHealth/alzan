import assert from 'node:assert/strict';
import {
  buildAiClipboardText,
  buildTrainingAiLaunchTarget,
  type TrainingAiLaunchResult,
  type TrainingAiProvider,
} from './trainingPlanAiProvider';

const shortPrompt = 'Convierte este entrenamiento a JSON.';
const longPrompt = 'x'.repeat(20_000);

const providers: TrainingAiProvider[] = ['chatgpt', 'gemini', 'claude'];
const clipboardFailure: TrainingAiLaunchResult = { ok: false, kind: 'clipboard-error' };
assert.equal(clipboardFailure.kind, 'clipboard-error');
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

const longChatGptTarget = buildTrainingAiLaunchTarget('chatgpt', longPrompt);
assert.ok(longChatGptTarget);
assert.equal(longChatGptTarget.mode, 'clipboard');
assert.equal(longChatGptTarget.url, 'https://chatgpt.com/');

const geminiTarget = buildTrainingAiLaunchTarget('gemini', shortPrompt);
assert.ok(geminiTarget);
assert.equal(geminiTarget.mode, 'prefilled');
assert.ok(geminiTarget.url.startsWith('https://gemini.google.com/app?q='));
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

console.log('trainingPlanAiProvider tests passed');
