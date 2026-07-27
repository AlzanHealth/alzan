import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

import { MENU_IMPORT_TEMPLATE } from './menuImportTemplate';

const template = JSON.parse(MENU_IMPORT_TEMPLATE) as Record<string, unknown>;
assert.equal(template.format, 'alzan-menu-plan');
assert.equal(template.version, 1);
assert.ok(Array.isArray(template.days));
assert.equal(
  MENU_IMPORT_TEMPLATE,
  readFileSync(new URL('../../../../../docs/templates/alzan-menu-plan-v1.template.json', import.meta.url), 'utf8'),
);

console.log('menuImportTemplate: all assertions passed');
