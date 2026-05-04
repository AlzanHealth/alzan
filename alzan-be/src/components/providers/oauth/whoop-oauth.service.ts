import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { WearableProvider } from '../providers.types';
import { AuthenticationMethod, BaseOAuthProvider, ProviderCredentials, ProviderEndpoints } from './base-oauth.provider';

@Injectable()
export class WhoopOAuthService extends BaseOAuthProvider {
  constructor(
    supabaseAdmin: SupabaseAdminService,
    private readonly configService: ConfigService,
  ) {
    super(supabaseAdmin, WearableProvider.WHOOP, 'https://api.prod.whoop.com');
  }

  get endpoints(): ProviderEndpoints {
    return {
      authorizeUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
      tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    };
  }

  get credentials(): ProviderCredentials {
    return {
      clientId: this.configService.get<string>('WHOOP_CLIENT_ID') || '',
      clientSecret: this.configService.get<string>('WHOOP_CLIENT_SECRET') || '',
      redirectUri: this.configService.get<string>('WHOOP_REDIRECT_URI') || '',
      defaultScope:
        this.configService.get<string>('WHOOP_DEFAULT_SCOPE') ||
        'offline read:cycles read:sleep read:recovery read:workout',
    };
  }

  public override usePkce = false;
  public override authMethod = AuthenticationMethod.BODY;
}
