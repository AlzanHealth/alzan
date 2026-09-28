import assert from 'node:assert/strict';

import { buildMenuImportAiPrompt } from './menuImportAiPrompt';
import { buildMenuImportAiLaunchTarget, type MenuImportAiProvider } from './menuImportAiProvider';

const prompt = 'Convierte esta comida a JSON.';

const expectedModeByProvider: Record<MenuImportAiProvider, 'prefilled' | 'clipboard'> = {
  chatgpt: 'prefilled',
  gemini: 'prefilled',
  claude: 'prefilled',
};

(['chatgpt', 'gemini', 'claude'] as const).forEach(provider => {
  const target = buildMenuImportAiLaunchTarget(provider, prompt);

  assert.equal(target.mode, expectedModeByProvider[provider]);
  if (provider === 'gemini') {
    assert.ok(target.url.startsWith('https://aistudio.google.com/prompts/new_chat?prompt='));
  }
  assert.ok(target.url.includes(encodeURIComponent(prompt)));
});

const realPrompt = buildMenuImportAiPrompt({ currentDate: '2026-08-26' });
(['chatgpt', 'gemini', 'claude'] as const).forEach(provider => {
  const target = buildMenuImportAiLaunchTarget(provider, realPrompt);
  assert.ok(target.url.length <= 12_000);
  if (target.mode === 'prefilled') {
    assert.equal(new URL(target.url).searchParams.get(provider === 'claude' ? 'q' : 'prompt'), realPrompt);
  } else {
    assert.ok(!target.url.includes('?'), 'clipboard mode must open the provider without a truncated prompt');
  }
});

console.log('menuImportAiProvider tests passed');
