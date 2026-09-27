import { QueryClient } from '@tanstack/react-query';

/** Remove only disposable, unused server responses. Never touch local drafts or auth. */
export function clearTemporaryQueryCache(client: QueryClient): void {
  client.removeQueries({ predicate: query => query.getObserversCount() === 0 && query.state.fetchStatus === 'idle' });
}
