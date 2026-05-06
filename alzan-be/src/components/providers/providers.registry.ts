import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseOAuthProvider } from './oauth/base-oauth.provider';
import { FitbitOAuthService } from './oauth/fitbit-oauth.service';
import { GarminOAuthService } from './oauth/garmin-oauth.service';
import { OuraOAuthService } from './oauth/oura-oauth.service';
import { PolarOAuthService } from './oauth/polar-oauth.service';
import { WearableProvider } from './providers.types';
import { StravaOAuthService } from './oauth/strava-oauth.service';
import { SuuntoOAuthService } from './oauth/suunto-oauth.service';
import { UltrahumanOAuthService } from './oauth/ultrahuman-oauth.service';
import { WhoopOAuthService } from './oauth/whoop-oauth.service';

@Injectable()
export class ProvidersRegistry {
  private readonly oauthProvidersByName: Record<string, BaseOAuthProvider>;
  private readonly allowedProviders = new Set<string>(Object.values(WearableProvider));

  constructor(
    private readonly stravaOAuthService: StravaOAuthService,
    private readonly garminOAuthService: GarminOAuthService,
    private readonly polarOAuthService: PolarOAuthService,
    private readonly suuntoOAuthService: SuuntoOAuthService,
    private readonly whoopOAuthService: WhoopOAuthService,
    private readonly ouraOAuthService: OuraOAuthService,
    private readonly fitbitOAuthService: FitbitOAuthService,
    private readonly ultrahumanOAuthService: UltrahumanOAuthService,
  ) {
    this.oauthProvidersByName = {
      strava: this.stravaOAuthService,
      garmin: this.garminOAuthService,
      polar: this.polarOAuthService,
      suunto: this.suuntoOAuthService,
      whoop: this.whoopOAuthService,
      oura: this.ouraOAuthService,
      fitbit: this.fitbitOAuthService,
      ultrahuman: this.ultrahumanOAuthService,
    };
  }

  public getOAuthProvider(provider: string): BaseOAuthProvider {
    const normalizedProvider = provider.trim().toLowerCase();
    if (!this.allowedProviders.has(normalizedProvider)) {
      throw new BadRequestException(`Unknown provider: ${provider}`);
    }
    const resolved = this.oauthProvidersByName[normalizedProvider];
    if (!resolved) {
      throw new BadRequestException(`Unknown provider: ${provider}`);
    }
    return resolved;
  }
}
