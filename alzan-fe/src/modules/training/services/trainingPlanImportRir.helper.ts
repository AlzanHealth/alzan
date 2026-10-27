export const toImportedRirBySet = (rirBySet: ReadonlyArray<number | null> | undefined): Array<number | null> | null =>
  rirBySet === undefined ? null : [...rirBySet];
