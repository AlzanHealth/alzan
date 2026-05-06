import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ProvidersRegistry } from './providers.registry';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthorizationResponseDto, OAuthErrorResponseDto, OAuthSuccessResponseDto } from './dto/provider-output.dto';
import {
  GetAuthorizationUrlQueryDto,
  OAuthCallbackQueryDto,
  OAuthErrorQueryDto,
  OAuthSuccessQueryDto,
} from './dto/provider-input.dto';
import { SupabaseUserAuth } from '../../core/guards/auth.decorator';

@ApiTags('Providers')
@SupabaseUserAuth()
@Controller('oauth')
export class ProvidersController {
  constructor(private readonly providersRegistry: ProvidersRegistry) {}

  @Get(':provider/authorize')
  @ApiOkResponse({ type: AuthorizationResponseDto })
  public async getAuthorizationUrl(
    @Param('provider') provider: string,
    @Query() query: GetAuthorizationUrlQueryDto,
  ): Promise<AuthorizationResponseDto> {
    const { user_id: userId, redirect_uri: redirectUri } = query;
    if (!userId) throw new BadRequestException('Missing query parameter: user_id');
    const oauthProvider = this.providersRegistry.getOAuthProvider(provider);
    const { authUrl, state } = await oauthProvider.getAuthorizationUrl(userId, redirectUri);
    return { authorization_url: authUrl, state };
  }

  @Get(':provider/callback')
  public async oauthCallback(
    @Param('provider') provider: string,
    @Res() res: Response,
    @Query() query: OAuthCallbackQueryDto,
  ): Promise<void> {
    const { code, state, error, error_description: errorDescription } = query;
    if (error) {
      const encoded = encodeURIComponent(`${error}: ${errorDescription ?? 'Unknown error'}`);
      res.redirect(303, `/oauth/error?message=${encoded}`);
      return;
    }

    if (!code || !state) {
      res.redirect(303, `/oauth/error?message=${encodeURIComponent('Missing OAuth parameters')}`);
      return;
    }

    const oauthProvider = this.providersRegistry.getOAuthProvider(provider);
    const oauthState = await oauthProvider.handleCallback(code, state);

    if (oauthState.redirectUri) {
      res.redirect(303, oauthState.redirectUri);
      return;
    }

    res.redirect(
      303,
      `/oauth/success?provider=${encodeURIComponent(provider)}&user_id=${encodeURIComponent(oauthState.userId)}`,
    );
  }

  @Get('success')
  @ApiOkResponse({ type: OAuthSuccessResponseDto })
  public oauthSuccess(@Query() query: OAuthSuccessQueryDto): OAuthSuccessResponseDto {
    const { provider, user_id: userId } = query;
    return {
      success: true,
      message: `Successfully connected to ${provider}`,
      user_id: userId,
      provider,
    };
  }

  @Get('error')
  @ApiOkResponse({ type: OAuthErrorResponseDto })
  public oauthError(@Query() query: OAuthErrorQueryDto): OAuthErrorResponseDto {
    const { message = 'OAuth authentication failed' } = query;
    return {
      success: false,
      message,
    };
  }
}
