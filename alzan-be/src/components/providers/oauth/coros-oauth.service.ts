import axios from 'axios';
import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { WearableProvider } from '../providers.types';
import {
  AuthenticationMethod,
  BaseOAuthProvider,
  OAuthTokenResponse,
  ProviderCredentials,
  ProviderEndpoints,
} from './base-oauth.provider';
import { encryptCorosToken, isCorosUserAllowed } from './coros-security';

const DEFAULT_COROS_API_BASE_URL = 'https://opentest.coros.com';

@Injectable()
export class CorosOAuthService extends BaseOAuthProvider {
  public override authMethod = AuthenticationMethod.BODY;

  constructor(
    supabaseAdmin: SupabaseAdminService,
    private readonly configService: ConfigService,
  ) {
    const apiBaseUrl = (configService.get<string>('COROS_API_BASE_URL') || DEFAULT_COROS_API_BASE_URL).replace(
      /\/$/,
      '',
    );
    super(supabaseAdmin, WearableProvider.COROS, apiBaseUrl);
  }

  get endpoints(): ProviderEndpoints {
    return {
      authorizeUrl: `${this.apiBaseUrl}/oauth2/authorize`,
      tokenUrl: `${this.apiBaseUrl}/oauth2/accesstoken`,
      refreshUrl: `${this.apiBaseUrl}/oauth2/refresh-token`,
    };
  }

  get credentials(): ProviderCredentials {
    return {
      clientId: this.configService.get<string>('COROS_CLIENT_ID') || '',
      clientSecret: this.configService.get<string>('COROS_CLIENT_SECRET') || '',
      redirectUri: this.configService.get<string>('COROS_REDIRECT_URI') || '',
    };
  }

  public override getAuthorizationUrl(
    userId: string,
    redirectUri?: string,
  ): Promise<{ authUrl: string; state: string }> {
    this.assertConfigured();
    if (!this.isUserAllowed(userId)) {
      throw new ForbiddenException('COROS integration is not enabled for this user');
    }

    return super.getAuthorizationUrl(userId, redirectUri);
  }

  public isUserAllowed(userId: string): boolean {
    return isCorosUserAllowed({
      mode: this.configService.get<string>('COROS_ROLLOUT_MODE'),
      pilotUserIds: this.configService.get<string>('COROS_PILOT_USER_IDS'),
      userId,
    });
  }

  public isConfigured(): boolean {
    const { clientId, clientSecret, redirectUri } = this.credentials;
    const encryptionKey = this.configService.get<string>('COROS_TOKEN_ENCRYPTION_KEY_V1');
    if (!clientId.trim() || !clientSecret.trim() || !redirectUri.trim() || !encryptionKey?.trim()) return false;
    try {
      const callback = new URL(redirectUri);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname);
      if (callback.protocol !== 'https:' && !(local && callback.protocol === 'http:')) return false;
      if (callback.username || callback.password || callback.hash) return false;
      if (!['https://opentest.coros.com', 'https://open.coros.com'].includes(this.apiBaseUrl)) return false;
      encryptCorosToken('configuration-check', encryptionKey);
      return true;
    } catch {
      return false;
    }
  }

  public override async deregisterUser(accessToken: string): Promise<void> {
    this.assertConfigured();
    const response = await axios.post<{ result?: string; message?: string }>(
      `${this.apiBaseUrl}/oauth2/deauthorize`,
      undefined,
      {
        params: { token: accessToken },
        headers: { token: accessToken },
        timeout: 10_000,
      },
    );
    if (response.data.result !== '0000') {
      throw new Error(`COROS deauthorization failed: ${response.data.message ?? response.data.result ?? 'unknown'}`);
    }
  }

  protected override getProviderUserInfo(
    tokenResponse: OAuthTokenResponse,
    _userId: string,
  ): Promise<{ userId: string | null; username: string | null }> {
    if (!tokenResponse.openId) {
      throw new Error('COROS token response did not include openId');
    }

    return Promise.resolve({ userId: tokenResponse.openId, username: null });
  }

  protected override protectTokenForStorage(token: string): string {
    const encryptionKey = this.configService.get<string>('COROS_TOKEN_ENCRYPTION_KEY_V1');
    if (!encryptionKey) {
      throw new ServiceUnavailableException('COROS token encryption is not configured');
    }
    return encryptCorosToken(token, encryptionKey);
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('COROS integration is not configured');
    }
  }
}
