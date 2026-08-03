import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

import { MENU_IMPORT_CLIPBOARD_TEXT, MENU_IMPORT_PROMPT, MENU_IMPORT_TEMPLATE } from './menuImportTemplate';

const template = JSON.parse(MENU_IMPORT_TEMPLATE) as Record<string, unknown>;
assert.equal(template.format, 'alzan-menu-plan');
assert.equal(template.version, 1);
assert.ok(Array.isArray(template.days));
assert.equal((template.days as Array<Record<string, unknown>>)[0]?.weekday, 'lunes');
assert.ok(MENU_IMPORT_PROMPT.includes('45 días'));
assert.ok(MENU_IMPORT_PROMPT.includes('1500 entradas de ingredientes'));
assert.ok(MENU_IMPORT_PROMPT.includes('todos los días del periodo solicitado'));
assert.ok(MENU_IMPORT_PROMPT.includes('Plan_Nutricion(1).docx'));
assert.ok(MENU_IMPORT_PROMPT.includes('CSV adjunto'));
assert.ok(MENU_IMPORT_PROMPT.includes('Conserva exactamente las fechas'));
assert.ok(MENU_IMPORT_PROMPT.includes('no sustituyas alimentos'));
assert.ok(MENU_IMPORT_PROMPT.includes('weekday'));
assert.ok(MENU_IMPORT_PROMPT.includes('breakfast, almuerzo, lunch, merienda, dinner y snack'));
assert.ok(MENU_IMPORT_PROMPT.includes('No recalcules ni ajustes las raciones'));
assert.doesNotMatch(MENU_IMPORT_PROMPT, /Adapta el objetivo de proteína/);
assert.doesNotMatch(MENU_IMPORT_PROMPT, /Genera 4–5 comidas/);
assert.ok(MENU_IMPORT_PROMPT.includes('200 nombres de ingredientes distintos'));
assert.doesNotMatch(MENU_IMPORT_PROMPT, /\d+\s*[–-]\s*\d+\s*g\/día/);
assert.ok(MENU_IMPORT_CLIPBOARD_TEXT.includes(MENU_IMPORT_PROMPT));
assert.equal(
  MENU_IMPORT_TEMPLATE,
  readFileSync(new URL('../../../../../docs/templates/alzan-menu-plan-v1.template.json', import.meta.url), 'utf8'),
);

console.log('menuImportTemplate: all assertions passed');
