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
assert.ok(MENU_IMPORT_PROMPT.includes('weekday'));
assert.ok(MENU_IMPORT_CLIPBOARD_TEXT.includes(MENU_IMPORT_PROMPT));
assert.equal(
  MENU_IMPORT_TEMPLATE,
  readFileSync(new URL('../../../../../docs/templates/alzan-menu-plan-v1.template.json', import.meta.url), 'utf8'),
);

console.log('menuImportTemplate: all assertions passed');
