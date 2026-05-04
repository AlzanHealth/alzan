import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { BaseOAuthProvider, ProviderCredentials, ProviderEndpoints } from './base-oauth.provider';
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
}
