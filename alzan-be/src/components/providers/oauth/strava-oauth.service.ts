import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { WearableProvider } from '../providers.types';
import { AuthenticationMethod, BaseOAuthProvider, ProviderCredentials, ProviderEndpoints } from './base-oauth.provider';

@Injectable()
export class StravaOAuthService extends BaseOAuthProvider {
  constructor(
    supabaseAdmin: SupabaseAdminService,
    private readonly configService: ConfigService,
  ) {
    super(supabaseAdmin, WearableProvider.STRAVA, 'https://www.strava.com/api/v3');
  }

  get endpoints(): ProviderEndpoints {
    return {
      authorizeUrl: 'https://www.strava.com/oauth/authorize',
      tokenUrl: `${this.apiBaseUrl}/oauth/token`,
    };
  }

  get credentials(): ProviderCredentials {
    return {
      clientId: this.configService.get<string>('STRAVA_CLIENT_ID') || '',
      clientSecret: this.configService.get<string>('STRAVA_CLIENT_SECRET') || '',
      redirectUri: this.configService.get<string>('STRAVA_REDIRECT_URI') || '',
      defaultScope: this.configService.get<string>('STRAVA_DEFAULT_SCOPE') || 'read,activity:read_all',
    };
  }

  public override usePkce = false;
  public override authMethod = AuthenticationMethod.BODY;
}
