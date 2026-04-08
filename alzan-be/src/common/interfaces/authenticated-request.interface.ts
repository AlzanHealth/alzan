import { User } from '@supabase/supabase-js';
import { type Request } from 'express';
import { DbClient } from '../../core/database/supabase.client';

export interface AuthenticatedRequest extends Request {
  user: User;
  token: string;
  supabase: DbClient;
}
