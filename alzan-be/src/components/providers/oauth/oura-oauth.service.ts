import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { WearableProvider } from '../providers.types';
import { AuthenticationMethod, BaseOAuthProvider, ProviderCredentials, ProviderEndpoints } from './base-oauth.provider';

@Injectable()
export class OuraOAuthService extends BaseOAuthProvider {
  constructor(
    supabaseAdmin: SupabaseAdminService,
    private readonly configService: ConfigService,
  ) {
    super(supabaseAdmin, WearableProvider.OURA, 'https://api.ouraring.com');
  }

  get endpoints(): ProviderEndpoints {
    return {
      authorizeUrl: 'https://cloud.ouraring.com/oauth/authorize',
      tokenUrl: 'https://api.ouraring.com/oauth/token',
    };
  }

  get credentials(): ProviderCredentials {
    return {
      clientId: this.configService.get<string>('OURA_CLIENT_ID') || '',
      clientSecret: this.configService.get<string>('OURA_CLIENT_SECRET') || '',
      redirectUri: this.configService.get<string>('OURA_REDIRECT_URI') || '',
      defaultScope:
        this.configService.get<string>('OURA_DEFAULT_SCOPE') ||
        'personal daily activity heartrate workout session spo2 ring_configuration heart_health',
    };
  }

  public override usePkce = false;
  public override authMethod = AuthenticationMethod.BODY;
}
