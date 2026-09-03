import assert from 'node:assert/strict';
import { getAdvancedActivityErrorTranslationKey, normalizeSupabaseError } from './advancedActivityError.helper';

assert.equal(
  getAdvancedActivityErrorTranslationKey({
    code: 'PGRST202',
    message: 'Could not find the function public.create_manual_endurance_activity',
  }),
  'training.advancedActivitySaveSchemaError',
);

assert.equal(
  getAdvancedActivityErrorTranslationKey({ code: '42501', message: 'JWT expired or user is not authenticated' }),
  'training.advancedActivitySaveAuthError',
);

assert.equal(
  getAdvancedActivityErrorTranslationKey({ message: 'MANUAL_ENDURANCE_TEMPLATE_NOT_FOUND' }),
  'training.advancedActivitySaveTemplateError',
);

assert.equal(
  getAdvancedActivityErrorTranslationKey({ message: 'MANUAL_ENDURANCE_INVALID_PAYLOAD' }),
  'training.advancedActivitySavePayloadError',
);

assert.equal(
  getAdvancedActivityErrorTranslationKey({ message: 'MANUAL_ENDURANCE_UNSUPPORTED_SPORT' }),
  'training.advancedActivitySaveSportError',
);

assert.deepEqual(
  normalizeSupabaseError({
    code: '22P02',
    message: 'invalid input syntax',
    details: 'phase_type is invalid',
    hint: 'Use a supported phase',
  }),
  {
    code: '22P02',
    message: 'invalid input syntax',
    details: 'phase_type is invalid',
    hint: 'Use a supported phase',
  },
);
