import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { WearableProvider } from '../providers.types';
import { AuthenticationMethod, BaseOAuthProvider, ProviderCredentials, ProviderEndpoints } from './base-oauth.provider';

@Injectable()
export class UltrahumanOAuthService extends BaseOAuthProvider {
  constructor(
    supabaseAdmin: SupabaseAdminService,
    private readonly configService: ConfigService,
  ) {
    super(supabaseAdmin, WearableProvider.ULTRAHUMAN, 'https://partner.ultrahuman.com/api');
  }

  get endpoints(): ProviderEndpoints {
    return {
      authorizeUrl: 'https://auth.ultrahuman.com/authorise',
      tokenUrl: 'https://partner.ultrahuman.com/api/partners/oauth/token',
    };
  }

  get credentials(): ProviderCredentials {
    return {
      clientId: this.configService.get<string>('ULTRAHUMAN_CLIENT_ID') || '',
      clientSecret: this.configService.get<string>('ULTRAHUMAN_CLIENT_SECRET') || '',
      redirectUri: this.configService.get<string>('ULTRAHUMAN_REDIRECT_URI') || '',
      defaultScope: this.configService.get<string>('ULTRAHUMAN_DEFAULT_SCOPE') || 'ring_data cgm_data profile',
    };
  }

  public override usePkce = false;
  public override authMethod = AuthenticationMethod.BODY;
}
