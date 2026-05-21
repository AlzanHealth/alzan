// WebCrypto polyfill - MUST be first
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/requests.types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../constants/environment';

// const AsyncStorageAdapter = { ... } (Removed unused var)

const requireRuntimeConfig = (value: string | undefined, name: string): string => {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`${name} is required.`);
  }

  return trimmed;
};

const supabaseUrl = requireRuntimeConfig(CONFIG.supabaseUrl, 'EXPO_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = requireRuntimeConfig(CONFIG.supabaseAnonKey, 'EXPO_PUBLIC_SUPABASE_ANON_KEY');

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    storage: {
      getItem: key => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
      removeItem: key => AsyncStorage.removeItem(key),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
