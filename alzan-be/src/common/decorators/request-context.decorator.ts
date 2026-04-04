import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@supabase/supabase-js';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { DbClient } from '../../types/database.types';

export interface RequestContext {
  user: User;
  supabase: DbClient;
}

export const RequestContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestContext => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return { user: request.user, supabase: request.supabase };
});
