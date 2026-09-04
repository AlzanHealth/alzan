import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { PublicAuth, SupabaseUserAuth } from '../../core/guards/auth.decorator';
import { UserContext, UserCtx } from '../../common/decorators/user-context.decorator';
import { isAllowedOAuthRedirectUri } from './oauth/oauth-redirect.utils';

@ApiTags('Providers')
@SupabaseUserAuth()
@Controller('oauth')
export class ProvidersController {
  constructor(
    private readonly providersRegistry: ProvidersRegistry,
    private readonly configService: ConfigService,
  ) {}

  @Get(':provider/authorize')
  @ApiOkResponse({ type: AuthorizationResponseDto })
  public async getAuthorizationUrl(
    @UserContext() ctx: UserCtx,
    @Param('provider') provider: string,
    @Query() query: GetAuthorizationUrlQueryDto,
  ): Promise<AuthorizationResponseDto> {
    const { user_id: userId, redirect_uri: redirectUri } = query;
    if (!userId) throw new BadRequestException('Missing query parameter: user_id');
    if (ctx.user.id !== userId) throw new BadRequestException('OAuth user_id mismatch');
    if (redirectUri && !this.isAllowedRedirectUri(redirectUri)) {
      throw new BadRequestException('Invalid OAuth redirect_uri');
    }
    const oauthProvider = this.providersRegistry.getOAuthProvider(provider);
    const { authUrl, state } = await oauthProvider.getAuthorizationUrl(userId, redirectUri);
    return { authorization_url: authUrl, state };
  }

  @Get(':provider/callback')
  @PublicAuth()
  public async oauthCallback(
    @Param('provider') provider: string,
    @Res() res: Response,
    @Query() query: OAuthCallbackQueryDto,
  ): Promise<void> {
    // Keep the OAuth popup's window.opener intact across this cross-origin
    // redirect chain so the web client can finish the handshake and auto-close
    // the popup. Helmet defaults COOP to `same-origin`, which would otherwise
    // sever the opener and leave the popup stuck on the callback screen.
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');

    const { code, state, error, error_description: errorDescription } = query;
    const oauthProvider = this.providersRegistry.getOAuthProvider(provider);

    if (error) {
      const message = `${error}: ${errorDescription ?? 'Unknown error'}`;
      const redirectUri = state ? await oauthProvider.consumeRedirectUriForError(state) : null;
      const clientErrorRedirect =
        redirectUri && this.isAllowedRedirectUri(redirectUri)
          ? this.buildOAuthErrorRedirectUrl(redirectUri, message)
          : null;
      if (clientErrorRedirect) {
        res.redirect(303, clientErrorRedirect);
        return;
      }
      const encoded = encodeURIComponent(message);
      res.redirect(303, `/oauth/error?message=${encoded}`);
      return;
    }

    if (!code || !state) {
      res.redirect(303, `/oauth/error?message=${encodeURIComponent('Missing OAuth parameters')}`);
      return;
    }

    const oauthState = await oauthProvider.handleCallback(code, state);

    if (oauthState.redirectUri && this.isAllowedRedirectUri(oauthState.redirectUri)) {
      res.redirect(303, oauthState.redirectUri);
      return;
    }

    res.redirect(
      303,
      `/oauth/success?provider=${encodeURIComponent(provider)}&user_id=${encodeURIComponent(oauthState.userId)}`,
    );
  }

  @Get('success')
  @PublicAuth()
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
  @PublicAuth()
  @ApiOkResponse({ type: OAuthErrorResponseDto })
  public oauthError(@Query() query: OAuthErrorQueryDto): OAuthErrorResponseDto {
    const { message = 'OAuth authentication failed' } = query;
    return {
      success: false,
      message,
    };
  }

  private buildOAuthErrorRedirectUrl(redirectUri: string, message: string): string | null {
    try {
      const url = new URL(redirectUri);
      url.searchParams.set('oauth_error', message);
      return url.toString();
    } catch {
      return null;
    }
  }

  private isAllowedRedirectUri(redirectUri: string): boolean {
    const frontendBaseUrl = this.configService.get<string>('server.frontendBaseUrl') ?? 'http://localhost:3000';
    return isAllowedOAuthRedirectUri(redirectUri, frontendBaseUrl);
  }
}
