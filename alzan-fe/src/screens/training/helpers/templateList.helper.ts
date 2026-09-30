export type TemplateListSort = 'name' | 'created' | 'usage';

export const getTemplateMetadataLabel = (...parts: (string | undefined)[]): string =>
  parts
    .map(part => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' • ');

export const getTemplateListContentBottomPadding = (topFromScreenBottom: number, isSelectionMode: boolean): number =>
  Math.max(0, topFromScreenBottom) + 24 + (isSelectionMode ? 100 : 0);

export const getTemplateListHeaderAction = (isSelectionFlow: boolean, isBulkSelectionMode = false): 'back' | 'close' =>
  isSelectionFlow || isBulkSelectionMode ? 'back' : 'close';

export type TemplateListItem = {
  id: string;
  name: string;
  createdAt: string;
  usageCount: number;
};

const compareNames = (left: TemplateListItem, right: TemplateListItem, locale: string): number => {
  const result = left.name.localeCompare(right.name, locale, { sensitivity: 'base', numeric: true });
  if (result !== 0) return result;
  return left.id.localeCompare(right.id);
};

export const sortTemplateList = <T extends TemplateListItem>(
  items: readonly T[],
  sort: TemplateListSort,
  locale: string,
): T[] => {
  return [...items].sort((left, right) => {
    if (sort === 'name') return compareNames(left, right, locale);

    if (sort === 'usage') {
      const usageDifference = right.usageCount - left.usageCount;
      if (usageDifference !== 0) return usageDifference;
    }

    const createdDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (createdDifference !== 0 && Number.isFinite(createdDifference)) return createdDifference;
    return compareNames(left, right, locale);
  });
};

export const getTemplateIdsForBulkDelete = (items: readonly TemplateListItem[]): string[] =>
  items.map(item => item.id).filter((id, index, ids) => id.length > 0 && ids.indexOf(id) === index);

export const toggleTemplateSelection = (selectedIds: ReadonlySet<string>, templateId: string): Set<string> => {
  const nextSelectedIds = new Set(selectedIds);
  if (nextSelectedIds.has(templateId)) nextSelectedIds.delete(templateId);
  else nextSelectedIds.add(templateId);
  return nextSelectedIds;
};

export const getSelectedTemplateIdsForBulkDelete = <T extends TemplateListItem>(
  items: readonly T[],
  selectedIds: ReadonlySet<string>,
): string[] => getTemplateIdsForBulkDelete(items.filter(item => selectedIds.has(item.id)));
