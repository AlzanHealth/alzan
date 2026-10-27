/** Auth startup and SIGNED_IN can fire together or again when the window gains focus. */
export const createAuthMaintenanceRunner = (now: () => number = Date.now) => {
  const pending = new Map<string, Promise<void>>();
  const nextRunAt = new Map<string, number>();
  return {
    async run(userId: string, operation: () => Promise<void>): Promise<void> {
      const existing = pending.get(userId);
      if (existing) return existing;
      if (now() < (nextRunAt.get(userId) ?? 0)) return;
      const request = Promise.resolve()
        .then(operation)
        .finally(() => {
          nextRunAt.set(userId, now() + 60_000);
          pending.delete(userId);
        });
      pending.set(userId, request);
      return request;
    },
  };
};
