import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { WearableProvider } from '../providers.types';
import { AuthenticationMethod, BaseOAuthProvider, ProviderCredentials, ProviderEndpoints } from './base-oauth.provider';

@Injectable()
export class FitbitOAuthService extends BaseOAuthProvider {
  constructor(
    supabaseAdmin: SupabaseAdminService,
    private readonly configService: ConfigService,
  ) {
    super(supabaseAdmin, WearableProvider.FITBIT, 'https://api.fitbit.com');
  }

  get endpoints(): ProviderEndpoints {
    return {
      authorizeUrl: 'https://www.fitbit.com/oauth2/authorize',
      tokenUrl: `${this.apiBaseUrl}/oauth2/token`,
    };
  }

  get credentials(): ProviderCredentials {
    return {
      clientId: this.configService.get<string>('FITBIT_CLIENT_ID') || '',
      clientSecret: this.configService.get<string>('FITBIT_CLIENT_SECRET') || '',
      redirectUri: this.configService.get<string>('FITBIT_REDIRECT_URI') || '',
      defaultScope: this.configService.get<string>('FITBIT_DEFAULT_SCOPE') || 'activity heartrate sleep profile',
    };
  }

  public override usePkce = true;
  public override authMethod = AuthenticationMethod.BASIC_AUTH;
}
