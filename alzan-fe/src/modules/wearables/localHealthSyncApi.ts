import { CONFIG } from '../../constants/environment';
import { supabase } from '../../lib/supabaseClient';
import {
  CloudProviderSyncResult,
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

const parseApiErrorMessage = (responseText: string, fallback: string): string => {
  if (!responseText) return fallback;
  try {
    const payload = JSON.parse(responseText) as { message?: unknown };
    return typeof payload.message === 'string' ? payload.message : responseText;
  } catch {
    return responseText;
  }
};

const getAccessToken = async (forceRefresh = false): Promise<string> => {
  if (forceRefresh) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;
    const refreshedToken = data.session?.access_token;
    if (!refreshedToken) throw new Error('User not authenticated');
    return refreshedToken;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('User not authenticated');
  return token;
};

const requestJson = async <T>(path: string, options: { method?: string; body?: JsonBody } = {}): Promise<T> => {
  const makeRequest = async (forceRefreshToken: boolean): Promise<Response> => {
    const token = await getAccessToken(forceRefreshToken);
    return fetch(`${CONFIG.alzanBeBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  };

  let response = await makeRequest(false);

  if (response.status === 401) {
    console.warn('[wearablesLocalHealthApi] 401 received, refreshing Supabase session and retrying once', { path });
    response = await makeRequest(true);
  }

  const text = await response.text();
  if (!response.ok) {
    const fallback = `Wearables API request failed with ${response.status}`;
    console.error('[wearablesLocalHealthApi] Request failed', {
      path,
      status: response.status,
      responseText: text,
    });
    throw new WearablesApiError(parseApiErrorMessage(text, fallback), response.status, text);
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

  syncPolarActivities: () =>
    requestJson<CloudProviderSyncResult>('/wearables/cloud/polar/sync', {
      method: 'POST',
    }),
};

export { WearablesApiError };
