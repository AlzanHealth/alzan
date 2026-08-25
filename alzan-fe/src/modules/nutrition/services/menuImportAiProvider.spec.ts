import assert from 'node:assert/strict';

import {
  buildMenuImportAiClipboardText,
  buildMenuImportAiLaunchTarget,
  type MenuImportAiProvider,
} from './menuImportAiProvider';

const prompt = 'Convierte esta comida a JSON.';
const ingredientCsv = 'ingredientes.csv\ningredients_rows\nname_es\nArroz';

const expectedClipboardByProvider: Record<MenuImportAiProvider, string> = {
  chatgpt: ingredientCsv,
  gemini: `ingredientes.csv\nAI_INSTRUCTIONS\n${prompt}\n\ningredients_rows\nname_es\nArroz`,
  claude: ingredientCsv,
};

const expectedModeByProvider: Record<MenuImportAiProvider, 'prefilled' | 'clipboard'> = {
  chatgpt: 'prefilled',
  gemini: 'clipboard',
  claude: 'prefilled',
};

(['chatgpt', 'gemini', 'claude'] as const).forEach(provider => {
  const target = buildMenuImportAiLaunchTarget(provider, prompt);
  const clipboardText = buildMenuImportAiClipboardText(target, prompt, ingredientCsv);

  assert.equal(clipboardText, expectedClipboardByProvider[provider]);
  assert.equal(target.mode, expectedModeByProvider[provider]);
  if (provider === 'gemini') assert.equal(target.url, 'https://gemini.google.com/app');
  else assert.ok(target.url.includes(encodeURIComponent(prompt)));
  assert.ok(clipboardText.startsWith('ingredientes.csv\n'));
  assert.ok(clipboardText.includes('\ningredients_rows\n'));
});

console.log('menuImportAiProvider tests passed');
