import assert from 'node:assert/strict';
import { buildUserEditedTemplateIdentity } from './templateEditorIdentity.helper';
import { buildTemplateFamilyStorageKey } from './templateFamilySignature';

const structuralSignature = '{"sport":"running","steps":[]}';

assert.deepEqual(buildUserEditedTemplateIdentity(structuralSignature), {
  source: 'user',
  template_family_key: buildTemplateFamilyStorageKey(structuralSignature),
});

assert.deepEqual(buildUserEditedTemplateIdentity(structuralSignature, 'imported', 'strength:lower_body'), {
  source: 'imported',
  template_family_key: 'strength:lower_body',
});

assert.deepEqual(buildUserEditedTemplateIdentity(null), {
  source: 'user',
  template_family_key: null,
});
