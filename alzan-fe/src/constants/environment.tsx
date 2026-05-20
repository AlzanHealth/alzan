import { Platform } from 'react-native';

const normalizeLocalUrl = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (Platform.OS !== 'android') return trimmed;
  return trimmed.replace('http://127.0.0.1', 'http://10.0.2.2').replace('http://localhost', 'http://10.0.2.2');
};

const localBackendBaseUrl = Platform.OS === 'android' ? 'http://10.0.2.2:1111' : 'http://localhost:1111';

export const CONFIG = {
  supabaseUrl: normalizeLocalUrl(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  nutritionApiBaseUrl: process.env.EXPO_PUBLIC_NUTRITION_API_BASE_URL || 'https://world.openfoodfacts.org',
  baseUrl: process.env.EXPO_PUBLIC_WEBSITE_URL || 'https://alzanhealth.com',
  alzanBeBaseUrl: normalizeLocalUrl(process.env.EXPO_PUBLIC_ALZAN_BACKEND_BASE_URL) ?? localBackendBaseUrl,
};
