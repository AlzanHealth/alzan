export type TemplateListSort = 'name' | 'created' | 'usage';

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
