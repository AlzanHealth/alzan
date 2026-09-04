import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '../../core/supabase/supabase.module';
import { FitbitOAuthService } from './oauth/fitbit-oauth.service';
import { GarminOAuthService } from './oauth/garmin-oauth.service';
import { OuraOAuthService } from './oauth/oura-oauth.service';
import { PolarOAuthService } from './oauth/polar-oauth.service';
import { StravaOAuthService } from './oauth/strava-oauth.service';
import { SuuntoOAuthService } from './oauth/suunto-oauth.service';
import { CorosOAuthService } from './oauth/coros-oauth.service';
import { CorosMcpOAuthService } from './oauth/coros-mcp-oauth.service';
import { UltrahumanOAuthService } from './oauth/ultrahuman-oauth.service';
import { WhoopOAuthService } from './oauth/whoop-oauth.service';
import { ProvidersController } from './providers.controller';
import { ProvidersRegistry } from './providers.registry';
import { Api } from '../../core/swagger/swagger-api.decorator';
import { SwaggerApi } from '../../core/swagger/swagger-api.enum';

@Api(SwaggerApi.PROVIDERS_API)
@Module({
  imports: [ConfigModule, SupabaseModule],
  controllers: [ProvidersController],
  providers: [
    StravaOAuthService,
    GarminOAuthService,
    PolarOAuthService,
    SuuntoOAuthService,
    CorosOAuthService,
    CorosMcpOAuthService,
    WhoopOAuthService,
    OuraOAuthService,
    FitbitOAuthService,
    UltrahumanOAuthService,
    ProvidersRegistry,
  ],
  exports: [
    StravaOAuthService,
    GarminOAuthService,
    PolarOAuthService,
    SuuntoOAuthService,
    CorosOAuthService,
    CorosMcpOAuthService,
    WhoopOAuthService,
    OuraOAuthService,
    FitbitOAuthService,
    UltrahumanOAuthService,
    ProvidersRegistry,
  ],
})
export class ProvidersModule {}
