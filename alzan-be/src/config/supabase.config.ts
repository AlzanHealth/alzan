import { registerAs } from '@nestjs/config';
import { ConfigNamespace } from '../common/enum/config.enum';

export default registerAs(ConfigNamespace.SUPABASE, () => {
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  };
});
