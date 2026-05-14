import { CONFIG } from '../../constants/environment';
import { supabase } from '../../lib/supabaseClient';
import {
  LocalHealthSyncRequest,
  LocalHealthSyncResult,
  ProviderOrigin,
  ProviderOriginInput,
} from './localHealthSync.types';

type JsonBody = Record<string, unknown> | undefined;

class WearablesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseText: string,
  ) {
    super(message);
    this.name = 'WearablesApiError';
  }
}

const getAccessToken = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('User not authenticated');
  return token;
};

const requestJson = async <T>(path: string, options: { method?: string; body?: JsonBody } = {}): Promise<T> => {
  const token = await getAccessToken();
  const response = await fetch(`${CONFIG.alzanBeBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new WearablesApiError(text || `Wearables API request failed with ${response.status}`, response.status, text);
  }
  return (text ? JSON.parse(text) : null) as T;
};

export const wearablesLocalHealthApi = {
  listHealthConnectOrigins: () => requestJson<ProviderOrigin[]>('/wearables/health-connect/origins'),

  upsertHealthConnectOrigins: (origins: ProviderOriginInput[]) =>
    requestJson<ProviderOrigin[]>('/wearables/health-connect/origins', {
      method: 'POST',
      body: { origins },
    }),

  selectHealthConnectOrigin: (originId: string) =>
    requestJson<ProviderOrigin>('/wearables/health-connect/origins/select', {
      method: 'POST',
      body: { origin_id: originId },
    }),

  getHealthConnectSelection: () => requestJson<ProviderOrigin | null>('/wearables/health-connect/selection'),

  uploadLocalHealthSync: (payload: LocalHealthSyncRequest) =>
    requestJson<LocalHealthSyncResult>('/wearables/local-sync', {
      method: 'POST',
      body: payload,
    }),
};

export { WearablesApiError };
