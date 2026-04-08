import { User as SupabaseUser } from '@supabase/supabase-js';
import { type Request } from 'express';
import { DbClient } from '../../core/database/supabase.client';
import { User } from '../../types/requests.types';

export interface AuthenticatedRequest extends Request {
  user: User;
  supabaseUser: SupabaseUser;
  token: string;
  supabase: DbClient;
}
