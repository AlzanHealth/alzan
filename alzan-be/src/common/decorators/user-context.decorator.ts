import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { DbClient } from '../../core/database/supabase.client';
import { User } from '../../types/requests.types';

export interface UserCtx {
  user: User;
  supabaseUser: SupabaseUser;
  supabase: DbClient;
}

export const UserContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): UserCtx => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return { user: request.user, supabase: request.supabase, supabaseUser: request.supabaseUser };
});
