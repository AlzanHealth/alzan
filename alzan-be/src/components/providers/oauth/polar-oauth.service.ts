import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { BaseOAuthProvider, OAuthTokenResponse, ProviderCredentials, ProviderEndpoints } from './base-oauth.provider';
import { WearableProvider } from '../providers.types';

@Injectable()
export class PolarOAuthService extends BaseOAuthProvider {
  constructor(
    supabaseAdmin: SupabaseAdminService,
    private readonly configService: ConfigService,
  ) {
    super(supabaseAdmin, WearableProvider.POLAR, 'https://www.polaraccesslink.com');
  }

  get endpoints(): ProviderEndpoints {
    return {
      authorizeUrl: 'https://flow.polar.com/oauth2/authorization',
      tokenUrl: 'https://polarremote.com/v2/oauth2/token',
    };
  }

  get credentials(): ProviderCredentials {
    return {
      clientId: this.configService.get<string>('POLAR_CLIENT_ID') || '',
      clientSecret: this.configService.get<string>('POLAR_CLIENT_SECRET') || '',
      redirectUri: this.configService.get<string>('POLAR_REDIRECT_URI') || '',
      defaultScope: this.configService.get<string>('POLAR_DEFAULT_SCOPE') || 'accesslink.read_all',
    };
  }

  protected override async getProviderUserInfo(
    tokenResponse: OAuthTokenResponse,
    _userId: string,
  ): Promise<{ userId: string | null; username: string | null; scope?: string | null }> {
    const polarUserId = this.readPolarUserId(tokenResponse);
    if (polarUserId) {
      await this.registerAccessLinkUser(tokenResponse.access_token, polarUserId);
    }
    return {
      userId: polarUserId,
      username: polarUserId,
      scope: this.credentials.defaultScope ?? null,
    };
  }

  private async registerAccessLinkUser(accessToken: string, polarUserId: string): Promise<void> {
    try {
      await axios.post(
        'https://www.polaraccesslink.com/v3/users',
        { 'member-id': polarUserId },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      );
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 409) return;
      throw error;
    }
  }

  private readPolarUserId(tokenResponse: OAuthTokenResponse): string | null {
    const responseWithPolarId = tokenResponse as OAuthTokenResponse & {
      x_user_id?: string | number;
      user_id?: string | number;
    };
    const id = responseWithPolarId.x_user_id ?? responseWithPolarId.user_id;
    if (typeof id === 'string' && id.trim().length > 0) return id.trim();
    if (typeof id === 'number' && Number.isFinite(id)) return String(Math.round(id));
    return null;
  }
}
