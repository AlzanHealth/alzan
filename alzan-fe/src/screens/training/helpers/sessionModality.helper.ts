type ModalityOption = {
  option_key: string;
};

export const shouldRenderModalitySelector = (options: readonly ModalityOption[]): boolean => options.length > 0;

export const resolvePersistedSportSubtype = (
  sportSubtype: string | null,
  options: readonly ModalityOption[],
): string | null => {
  if (!sportSubtype || options.length === 0) return null;
  return options.some(option => option.option_key === sportSubtype) ? sportSubtype : null;
};

export const resetSportSubtypeForSportChange = (
  currentSportSubtype: string | null,
  nextOptions: readonly ModalityOption[],
  hasSportChanged = true,
): string | null => {
  if (hasSportChanged) return null;
  return resolvePersistedSportSubtype(currentSportSubtype, nextOptions);
};
