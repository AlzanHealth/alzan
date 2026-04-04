import { NodeEnvironment } from '../common/enum/config.enum';

export interface EnvironmentVariables {
  // server config
  NODE_ENV: NodeEnvironment;
  BASE_URL: string;
  FRONTEND_BASE_URL: string;
  CORS_ORIGIN?: string;
  PORT?: string;

  // supabase config
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
}

type EnvKeys = keyof EnvironmentVariables;

const REQUIRED_KEYS: EnvKeys[] = [
  'PORT',
  'NODE_ENV',
  'BASE_URL',
  'FRONTEND_BASE_URL',

  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
];

const NOT_REQUIRED_IN_LOCAL: EnvKeys[] = ['PORT'];

/**
 * Validates environment variables against the EnvironmentVariables interface
 * Automatically derives required fields from the interface definition
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const missingEnvVariables: string[] = [];
  const isLocal = config.NODE_ENV === NodeEnvironment.LOCAL;

  // Define which variables are optional in local environment
  const optionalInLocal = new Set<keyof EnvironmentVariables>(NOT_REQUIRED_IN_LOCAL);

  // Check for missing required variables
  REQUIRED_KEYS.forEach(variable => {
    if (!config?.[variable]) {
      // Skip if it's optional in local environment and we're in local
      if (isLocal && optionalInLocal.has(variable)) {
        return;
      }

      missingEnvVariables.push(variable);
    }
  });

  if (missingEnvVariables.length) {
    throw new Error(`Missing or empty required environment variables: ${missingEnvVariables.join(', ')}`);
  }

  // Return a properly typed object - we validated the content correctly above making this a safe cast
  return config as unknown as EnvironmentVariables;
}
