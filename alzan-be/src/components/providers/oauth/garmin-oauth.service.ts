import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { WearableProvider } from '../providers.types';
import { AuthenticationMethod, BaseOAuthProvider, ProviderCredentials, ProviderEndpoints } from './base-oauth.provider';

@Injectable()
export class GarminOAuthService extends BaseOAuthProvider {
  constructor(
    supabaseAdmin: SupabaseAdminService,
    private readonly configService: ConfigService,
  ) {
    super(supabaseAdmin, WearableProvider.GARMIN, 'https://apis.garmin.com');
  }

  get endpoints(): ProviderEndpoints {
    return {
      authorizeUrl: 'https://connect.garmin.com/oauth2Confirm',
      tokenUrl: 'https://diauth.garmin.com/di-oauth2-service/oauth/token',
    };
  }

  get credentials(): ProviderCredentials {
    return {
      clientId: this.configService.get<string>('GARMIN_CLIENT_ID') || '',
      clientSecret: this.configService.get<string>('GARMIN_CLIENT_SECRET') || '',
      redirectUri: this.configService.get<string>('GARMIN_REDIRECT_URI') || '',
      defaultScope: this.configService.get<string>('GARMIN_DEFAULT_SCOPE') || '',
    };
  }

  public override usePkce = true;
  public override authMethod = AuthenticationMethod.BODY;

  public override async deregisterUser(accessToken: string): Promise<void> {
    await axios.delete(`${this.apiBaseUrl}/partner-gateway/rest/user/registration`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
}
