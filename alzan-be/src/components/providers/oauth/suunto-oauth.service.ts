import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { BaseOAuthProvider, ProviderCredentials, ProviderEndpoints } from './base-oauth.provider';
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
}
