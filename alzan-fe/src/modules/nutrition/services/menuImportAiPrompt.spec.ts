import assert from 'node:assert/strict';
import { buildMenuImportAiPrompt } from './menuImportAiPrompt';

const prompt = buildMenuImportAiPrompt({ currentDate: '2026-08-24' });

assert.ok(prompt.startsWith('Convierte comidas o menús en un JSON alzan-menu-plan v1 listo para importar.'));
assert.ok(prompt.includes('2026-08-24'));
assert.ok(!prompt.includes('ingredientes.csv'));
assert.ok(!prompt.includes('ingredients_rows'));
assert.ok(!prompt.includes('catálogo'));
assert.ok(prompt.includes('fotografía'));
assert.ok(prompt.includes('estima una cantidad razonable en gramos'));
assert.ok(prompt.includes('meal_type: "unspecified"'));
assert.ok(prompt.includes('exactamente una comida'));
assert.ok(prompt.includes('varias comidas'));
assert.ok(prompt.includes('fecha y una hora o un tipo de comida inequívoco'));
assert.ok(!prompt.includes('Ctrl+V o Cmd+V'));
assert.ok(prompt.includes('adjunta una foto o documento'));
assert.ok(prompt.length < 8_000);

console.log('menuImportAiPrompt tests passed');
