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
assert.ok(MENU_IMPORT_PROMPT.includes('DOCX'));
assert.ok(MENU_IMPORT_PROMPT.includes('aunque tenga otro nombre'));
assert.ok(!MENU_IMPORT_PROMPT.includes('CSV adjunto de ingredientes'));
assert.ok(!MENU_IMPORT_PROMPT.includes('ingredients_rows'));
assert.ok(MENU_IMPORT_PROMPT.includes('No bloquees por la ausencia de un DOCX de entrenamiento'));
assert.ok(MENU_IMPORT_PROMPT.includes('Procesa todos los días del DOCX'));
assert.ok(MENU_IMPORT_PROMPT.includes('un día completo por fecha'));
assert.ok(MENU_IMPORT_PROMPT.includes('únicamente los bloques del menú que tienen una fecha'));
assert.ok(MENU_IMPORT_PROMPT.includes('referencias de receta'));
assert.ok(MENU_IMPORT_PROMPT.includes('Nunca escribas códigos de receta'));
assert.ok(MENU_IMPORT_PROMPT.includes('nombre real de la comida'));
assert.ok(MENU_IMPORT_PROMPT.includes('Conserva fechas, días, orden'));
assert.ok(MENU_IMPORT_PROMPT.includes('weekday'));
assert.ok(MENU_IMPORT_PROMPT.includes('breakfast, almuerzo, lunch, merienda, dinner y snack'));
assert.ok(MENU_IMPORT_PROMPT.includes('Cada ingredient solo contiene name y quantity_g'));
assert.ok(MENU_IMPORT_PROMPT.includes('No inventes nombres, IDs, calorías'));
assert.ok(MENU_IMPORT_PROMPT.includes('no uses medias, extremos ni estimaciones'));
assert.ok(MENU_IMPORT_PROMPT.includes('fecha y la comida concretas'));
assert.doesNotMatch(MENU_IMPORT_PROMPT, /Adapta el objetivo de proteína/);
assert.doesNotMatch(MENU_IMPORT_PROMPT, /Genera 4–5 comidas/);
assert.doesNotMatch(MENU_IMPORT_PROMPT, /\d+\s*[–-]\s*\d+\s*g\/día/);
assert.ok(MENU_IMPORT_CLIPBOARD_TEXT.includes(MENU_IMPORT_PROMPT));
assert.doesNotMatch(MENU_IMPORT_CLIPBOARD_TEXT, /[“”‘’]/, 'copyable prompt must use ASCII quotes');
assert.equal(
  MENU_IMPORT_TEMPLATE,
  readFileSync(new URL('../../../../../docs/templates/alzan-menu-plan-v1.template.json', import.meta.url), 'utf8'),
);

console.log('menuImportTemplate: all assertions passed');
