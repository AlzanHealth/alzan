export const SUUNTO_DETAIL_PERIODS = ['D', 'W', 'M', '3M', '6M', 'ALL'] as const;

export type SuuntoDetailPeriod = (typeof SUUNTO_DETAIL_PERIODS)[number];
export type SuuntoHealthPeriod = SuuntoDetailPeriod | '2M';
export type SuuntoChartRange = 'D' | 'S' | 'M' | '6M' | 'A';

const periodDays: Record<Exclude<SuuntoHealthPeriod, 'ALL'>, number> = {
  D: 1,
  W: 7,
  M: 30,
  '3M': 90,
  '6M': 180,
  '2M': 56,
};

export const getSuuntoPeriodStart = (period: SuuntoHealthPeriod, referenceDate = new Date()): string | null => {
  if (period === 'ALL') return null;
  return new Date(referenceDate.getTime() - periodDays[period] * 86_400_000).toISOString();
};

export const getSuuntoChartRange = (period: SuuntoDetailPeriod): SuuntoChartRange => {
  if (period === 'D') return 'D';
  if (period === 'W') return 'S';
  if (period === 'M') return 'M';
  if (period === 'ALL') return 'A';
  return '6M';
};

type PageLoader<Row> = (
  offset: number,
  pageSize: number,
) => PromiseLike<{
  data: Row[] | null;
  error: unknown | null;
}>;

export const loadAllSuuntoPages = async <Row>(loadPage: PageLoader<Row>, pageSize = 1000): Promise<Row[]> => {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await loadPage(offset, pageSize);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
};
