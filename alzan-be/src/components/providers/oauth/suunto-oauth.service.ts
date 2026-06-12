import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { BaseOAuthProvider, OAuthTokenResponse, ProviderCredentials, ProviderEndpoints } from './base-oauth.provider';
import { WearableProvider } from '../providers.types';

@Injectable()
export class SuuntoOAuthService extends BaseOAuthProvider {
  constructor(
    supabaseAdmin: SupabaseAdminService,
    private readonly configService: ConfigService,
  ) {
    super(supabaseAdmin, WearableProvider.SUUNTO, 'https://cloudapi.suunto.com');
  }

  get endpoints(): ProviderEndpoints {
    return {
      authorizeUrl: 'https://cloudapi-oauth.suunto.com/oauth/authorize',
      tokenUrl: 'https://cloudapi-oauth.suunto.com/oauth/token',
    };
  }

  get credentials(): ProviderCredentials {
    return {
      clientId: this.configService.get<string>('SUUNTO_CLIENT_ID') || '',
      clientSecret: this.configService.get<string>('SUUNTO_CLIENT_SECRET') || '',
      redirectUri: this.configService.get<string>('SUUNTO_REDIRECT_URI') || '',
      defaultScope: this.configService.get<string>('SUUNTO_DEFAULT_SCOPE') || '',
    };
  }

  // Suunto's access token is a JWT whose `user` claim holds the Suunto username,
  // which is also the `username` sent by Suunto workout webhooks.
  protected override getProviderUserInfo(
    tokenResponse: OAuthTokenResponse,
    _userId: string,
  ): Promise<{ userId: string | null; username: string | null; scope?: string | null }> {
    const username = this.readJwtUserClaim(tokenResponse.access_token);
    return Promise.resolve({ userId: username, username });
  }

  private readJwtUserClaim(accessToken: string): string | null {
    try {
      const payloadSegment = accessToken.split('.')[1];
      if (!payloadSegment) return null;
      const payload: unknown = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'));
      if (typeof payload !== 'object' || payload === null) return null;
      const user = (payload as Record<string, unknown>).user;
      return typeof user === 'string' && user.length > 0 ? user : null;
    } catch (error) {
      this.logger.warn(`Failed to decode Suunto access token payload: ${String(error)}`);
      return null;
    }
  }
}
