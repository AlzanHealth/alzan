import type { CorosCapability } from './localHealthSync.types';

export function corosAvailability(input: { loading: boolean; error: boolean; capability?: CorosCapability }) {
  if (input.loading) return 'loading';
  if (input.error || !input.capability) return 'error';
  if (input.capability.enabled) return 'ready';
  if (input.capability.reason === 'not_configured') return 'not_configured';
  return input.capability.reason === 'restricted' ? 'restricted' : 'unavailable';
}
