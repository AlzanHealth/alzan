import { User } from '@supabase/supabase-js';
import { type Request } from 'express';
import { DbClient } from '../../types/request.types';

export interface AuthenticatedRequest extends Request {
  user: User;
  token: string;
  supabase: DbClient;
}
