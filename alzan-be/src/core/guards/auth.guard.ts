import { Injectable, CanActivate, UnauthorizedException, ExecutionContext, Logger } from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { Reflector } from '@nestjs/core';
import { Scope, SCOPES_KEY } from './auth.decorator';
import { SupabaseAdminService } from '../supabase/supabase.service';
import { UserService } from '../../components/user/user.service';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly supabaseAdminService: SupabaseAdminService,
    private readonly userService: UserService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const validTokenTypes = this.reflector.getAllAndOverride<Scope[] | undefined>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!validTokenTypes?.length) {
      throw new UnauthorizedException('Unauthorized!');
    }

    if (validTokenTypes.includes('PUBLIC')) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader: string | undefined = request.headers['authorization'];
    const token = authHeader?.split?.('Bearer ')?.[1];

    if (!authHeader || !authHeader.startsWith('Bearer ') || !token) {
      throw new UnauthorizedException('Unauthorized!');
    }

    try {
      // Validate JWT using the admin client (bypasses RLS for auth operations)
      const { data, error } = await this.supabaseAdminService.client.auth.getUser(token);

      if (error || !data.user) {
        throw new UnauthorizedException('Unauthorized!');
      }

      // Attach user, token, and a per-request RLS-scoped client to the request
      request.token = token;
      request.supabase = this.supabaseAdminService.getAuthenticatedClient(token);
      request.supabaseUser = data.user;
      request.user = await this.userService.getUserById(request, data.user.id);

      return true;
    } catch (error) {
      this.logger.warn({
        err: error,
        message: 'Unexpected error occurred getting the user from the token',
      });
      throw new UnauthorizedException('Unauthorized!');
    }
  }
}
