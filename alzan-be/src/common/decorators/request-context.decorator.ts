import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@supabase/supabase-js';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { DbClient } from '../../types/request.types';

export interface UserCtx {
  user: User;
  supabase: DbClient;
}

export const UserContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): UserCtx => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return { user: request.user, supabase: request.supabase };
});
