interface CompositionRequestResult {
  success: boolean;
  reason?: string;
}
interface Failure {
  attempts: number;
  retryAt: number;
  kind: 'conflict' | 'error';
}

export class CompositionRefreshPausedError extends Error {
  constructor(readonly retryAt: number) {
    super('COMPOSITION_REFRESH_PAUSED');
    this.name = 'CompositionRefreshPausedError';
  }
}

export const reportCompositionRefreshFailure = (error: unknown): void => {
  if (!(error instanceof CompositionRefreshPausedError)) {
    // Supabase error details may include personal inputs; never log the payload.
    console.error('[Health] Composition refresh failed');
  }
};

/** Per authenticated user, with no persisted health data or automatic timer. */
export const createCompositionRequestGuard = <T extends CompositionRequestResult = CompositionRequestResult>(
  now: () => number = Date.now,
  timeoutMs = 20_000,
) => {
  const pending = new Map<string, Promise<T>>();
  const failures = new Map<string, Failure>();
  const assertAvailable = (userId: string): void => {
    const failure = failures.get(userId);
    if (failure && now() < failure.retryAt) throw new CompositionRefreshPausedError(failure.retryAt);
  };
  const pause = (userId: string, kind: Failure['kind']): void => {
    const attempts = Math.min(5, (failures.get(userId)?.attempts ?? 0) + 1);
    failures.set(userId, { attempts, kind, retryAt: now() + Math.min(300_000, 30_000 * 2 ** (attempts - 1)) });
  };
  return {
    assertAvailable,
    inputsChanged(userId: string): void {
      // Real edits may resolve a revision conflict, but do not bypass an outage.
      if (failures.get(userId)?.kind === 'conflict') failures.delete(userId);
    },
    async run(userId: string, date: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
      const key = `${userId}:${date}`;
      const existing = pending.get(key);
      if (existing) return existing;
      assertAvailable(userId);
      const failureAtStart = failures.get(userId);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const request = Promise.resolve()
        .then(() => operation(controller.signal))
        .then(
          result => {
            if (result.reason === 'inputs_changed') pause(userId, 'conflict');
            else if (result.success && failures.get(userId) === failureAtStart) failures.delete(userId);
            return result;
          },
          error => {
            pause(userId, 'error');
            throw error;
          },
        )
        .finally(() => {
          clearTimeout(timer);
          pending.delete(key);
        });
      pending.set(key, request);
      return request;
    },
  };
};
