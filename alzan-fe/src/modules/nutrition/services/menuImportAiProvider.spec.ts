import assert from 'node:assert/strict';

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

console.log('menuImportAiProvider tests passed');
