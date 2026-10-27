const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Retry transient reads once; SQL/business/permission/rate-limit failures need intervention. */
export const shouldRetryQuery = (failureCount: number, error: unknown): boolean => {
  if (failureCount >= 1) return false;
  if (isRecord(error)) {
    if (typeof error.code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d+)$/u.test(error.code)) return false;
    const status = error.status ?? error.statusCode ?? (isRecord(error.response) ? error.response.status : undefined);
    if (typeof status === 'number') return status >= 500 && status <= 599;
  }
  return error instanceof TypeError && /network|fetch|load failed/iu.test(error.message);
};

/** Focus, remount, explicit refresh or a real edit can resume a failed query. */
export const pollingIntervalAfterError = (error: unknown, interval: number | false): number | false =>
  error ? false : interval;
