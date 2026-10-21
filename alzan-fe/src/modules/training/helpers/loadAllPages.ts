export const loadAllPages = async <T>(
  loadPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 1_000,
  maxRows = Number.POSITIVE_INFINITY,
): Promise<T[]> => {
  const rows: T[] = [];
  let rangeStart = 0;

  while (rows.length < maxRows) {
    const requestedPageSize = Math.min(pageSize, maxRows - rows.length);
    const page = await loadPage(rangeStart, rangeStart + requestedPageSize - 1);
    rows.push(...page.slice(0, requestedPageSize));

    if (page.length < requestedPageSize) {
      return rows;
    }

    rangeStart += requestedPageSize;
  }

  return rows;
};
