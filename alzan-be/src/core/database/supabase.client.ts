import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../types/requests.types';

export type DbClient = SupabaseClient<Database>;
