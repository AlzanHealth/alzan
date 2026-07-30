import { buildTemplateFamilyStorageKey } from './templateFamilySignature';

export type UserEditedTemplateIdentity = {
  source: 'user' | 'imported';
  template_family_key: string | null;
};

export const buildUserEditedTemplateIdentity = (
  structuralSignature: string | null | undefined,
  previousSource?: string | null,
  previousFamilyKey?: string | null,
): UserEditedTemplateIdentity => {
  const normalizedSignature = structuralSignature?.trim();
  const signatureKey = normalizedSignature ? buildTemplateFamilyStorageKey(normalizedSignature) : null;
  return {
    source: previousSource === 'imported' ? 'imported' : 'user',
    template_family_key: previousSource === 'imported' ? previousFamilyKey?.trim() || signatureKey : signatureKey,
  };
};
