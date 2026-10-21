export interface PaginatedItems<T> {
  items: T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

export const paginateItems = <T>(
  items: readonly T[],
  requestedPage: number,
  requestedPageSize: number,
): PaginatedItems<T> => {
  const pageSize = Number.isFinite(requestedPageSize) && requestedPageSize > 0 ? Math.floor(requestedPageSize) : 1;
  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(Math.max(1, Math.floor(requestedPage) || 1), totalPages);
  const startIndex = (currentPage - 1) * pageSize;

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    currentPage,
    totalPages,
    totalItems,
  };
};
