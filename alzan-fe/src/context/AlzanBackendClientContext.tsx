import React, { createContext, ReactNode } from 'react';
import { client } from '../openapi/generated/alzan-be/client.gen';
import { CONFIG } from '../constants/environment';
import { supabase } from '../lib/supabaseClient';

const AlzanBackendClientContext = createContext(null);
const TOKEN_REFRESH_SKEW_SECONDS = 60;

const refreshBackendAccessToken = async (): Promise<string> => {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  return data.session?.access_token ?? '';
};

const getBackendAccessToken = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const session = data.session;
  const expiresAt = session?.expires_at;
  const shouldRefresh = !!expiresAt && expiresAt <= Math.floor(Date.now() / 1000) + TOKEN_REFRESH_SKEW_SECONDS;

  if (!shouldRefresh) return session?.access_token ?? '';

  return refreshBackendAccessToken();
};

const fetchWithAuthRetry: typeof fetch = async (input, init) => {
  const retryRequest = input instanceof Request ? input.clone() : null;
  const response = await globalThis.fetch(input, init);

  if (response.status !== 401) return response;

  const refreshedToken = await refreshBackendAccessToken();
  if (!refreshedToken) return response;

  const retryHeaders = new Headers(retryRequest?.headers ?? init?.headers);
  retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);

  if (retryRequest) {
    return globalThis.fetch(new Request(retryRequest, { headers: retryHeaders }));
  }

  return globalThis.fetch(input, { ...init, headers: retryHeaders });
};

export const AlzanBackendClientProvider = ({ children }: { children: ReactNode }) => {
  client.setConfig({
    baseUrl: CONFIG.alzanBeBaseUrl,
    auth: getBackendAccessToken,
    fetch: fetchWithAuthRetry,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return <AlzanBackendClientContext.Provider value={null}>{children}</AlzanBackendClientContext.Provider>;
};
