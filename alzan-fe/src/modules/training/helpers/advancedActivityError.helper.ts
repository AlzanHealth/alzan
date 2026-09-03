export type AdvancedActivityErrorTranslationKey =
  | 'training.advancedActivitySaveError'
  | 'training.advancedActivitySaveSchemaError'
  | 'training.advancedActivitySaveAuthError'
  | 'training.advancedActivitySaveTemplateError'
  | 'training.advancedActivitySavePayloadError'
  | 'training.advancedActivitySaveSportError';

export type NormalizedSupabaseError = {
  code: string | null;
  message: string | null;
  details: string | null;
  hint: string | null;
};

type ErrorRecord = Record<string, unknown>;

function isErrorRecord(error: unknown): error is ErrorRecord {
  return typeof error === 'object' && error !== null;
}

function getString(record: ErrorRecord, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function normalizeSupabaseError(error: unknown): NormalizedSupabaseError {
  if (isErrorRecord(error)) {
    return {
      code: getString(error, 'code'),
      message: getString(error, 'message'),
      details: getString(error, 'details'),
      hint: getString(error, 'hint'),
    };
  }

  return {
    code: null,
    message: error instanceof Error ? error.message : null,
    details: null,
    hint: null,
  };
}

export function getAdvancedActivityErrorTranslationKey(error: unknown): AdvancedActivityErrorTranslationKey {
  const normalized = normalizeSupabaseError(error);
  const code = normalized.code?.toUpperCase() ?? '';
  const text = [normalized.message, normalized.details, normalized.hint].filter(Boolean).join(' ').toUpperCase();

  if (
    ['PGRST202', 'PGRST204', '42883'].includes(code) ||
    text.includes('CREATE_MANUAL_ENDURANCE_ACTIVITY') ||
    text.includes('COULD NOT FIND THE FUNCTION') ||
    text.includes('FUNCTION PUBLIC.') ||
    text.includes('SCHEMA CACHE') ||
    (text.includes('COLUMN') && text.includes('DOES NOT EXIST'))
  ) {
    return 'training.advancedActivitySaveSchemaError';
  }

  if (
    code === '42501' ||
    code === '401' ||
    text.includes('NOT AUTHENTICATED') ||
    text.includes('JWT') ||
    (text.includes('SESSION') && text.includes('EXPIRED'))
  ) {
    return 'training.advancedActivitySaveAuthError';
  }

  if (
    text.includes('MANUAL_ENDURANCE_TEMPLATE_NOT_FOUND') ||
    text.includes('TEMPLATE_NOT_FOUND') ||
    text.includes('TEMPLATE OR STEP') ||
    text.includes('STEP_NOT_FOUND')
  ) {
    return 'training.advancedActivitySaveTemplateError';
  }

  if (text.includes('MANUAL_ENDURANCE_UNSUPPORTED_SPORT') || text.includes('UNSUPPORTED SPORT')) {
    return 'training.advancedActivitySaveSportError';
  }

  if (
    code === '22P02' ||
    code === '23514' ||
    text.includes('MANUAL_ENDURANCE_INVALID_PAYLOAD') ||
    text.includes('INVALID PAYLOAD') ||
    text.includes('SECTION_ID_REQUIRED') ||
    text.includes('DUPLICATE_SECTION_ID') ||
    text.includes('PARENT_SECTION')
  ) {
    return 'training.advancedActivitySavePayloadError';
  }

  return 'training.advancedActivitySaveError';
}

export function logAdvancedActivityError(error: unknown): void {
  const normalized = normalizeSupabaseError(error);
  console.error('[EnduranceSessionForm.advancedSave] Supabase error:', {
    ...normalized,
    stack: error instanceof Error ? error.stack : null,
  });
}
