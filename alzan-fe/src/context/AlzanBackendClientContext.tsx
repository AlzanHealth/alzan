import React, { createContext, ReactNode } from 'react';
import { client } from '../openapi/generated/alzan-be/client.gen';
import { CONFIG } from '../constants/environment';
import { supabase } from '../lib/supabaseClient';

const AlzanBackendClientContext = createContext(null);
const TOKEN_REFRESH_SKEW_SECONDS = 60;

const getBackendAccessToken = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const session = data.session;
  const expiresAt = session?.expires_at;
  const shouldRefresh = !!expiresAt && expiresAt <= Math.floor(Date.now() / 1000) + TOKEN_REFRESH_SKEW_SECONDS;

  if (!shouldRefresh) return session?.access_token ?? '';

  const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) throw refreshError;
  return refreshedData.session?.access_token ?? '';
};

export const AlzanBackendClientProvider = ({ children }: { children: ReactNode }) => {
  client.setConfig({
    baseUrl: CONFIG.alzanBeBaseUrl,
    auth: getBackendAccessToken,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return <AlzanBackendClientContext.Provider value={null}>{children}</AlzanBackendClientContext.Provider>;
};
