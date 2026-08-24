import assert from 'node:assert/strict';
import {
  AI_PREFILL_URL_MAX_LENGTH,
  buildTrainingAiLaunchTarget,
  type TrainingAiProvider,
} from './trainingPlanAiProvider';

const shortPrompt = 'Convierte este entrenamiento a JSON.';
const longPrompt = 'x'.repeat(AI_PREFILL_URL_MAX_LENGTH);

const providers: TrainingAiProvider[] = ['chatgpt', 'gemini', 'claude'];
providers.forEach(provider => {
  const target = buildTrainingAiLaunchTarget(provider, shortPrompt);
  assert.ok(target.url.startsWith('https://'), `${provider} must use an HTTPS destination`);
});

const chatGptTarget = buildTrainingAiLaunchTarget('chatgpt', shortPrompt);
assert.equal(chatGptTarget.mode, 'prefilled');
assert.ok(chatGptTarget.url.includes(encodeURIComponent(shortPrompt)));

const longChatGptTarget = buildTrainingAiLaunchTarget('chatgpt', longPrompt);
assert.equal(longChatGptTarget.mode, 'clipboard');
assert.equal(longChatGptTarget.url, 'https://chatgpt.com/');

assert.equal(buildTrainingAiLaunchTarget('gemini', shortPrompt).mode, 'clipboard');
assert.equal(buildTrainingAiLaunchTarget('claude', shortPrompt).mode, 'clipboard');

console.log('trainingPlanAiProvider tests passed');
