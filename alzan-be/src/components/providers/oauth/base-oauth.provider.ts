import { randomBytes, createHash } from 'crypto';
import axios from 'axios';
import { BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { WearableProvider } from '../providers.types';

export interface ProviderEndpoints {
  authorizeUrl: string;
  tokenUrl: string;
}

export interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  defaultScope?: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
}

export interface OAuthState {
  userId: string;
  provider: WearableProvider;
  redirectUri?: string;
}

export enum AuthenticationMethod {
  BASIC_AUTH = 'BASIC_AUTH',
  BODY = 'BODY',
}

export abstract class BaseOAuthProvider {
  protected readonly logger = new Logger(this.constructor.name);
  protected readonly stateTtl = 900; // 15 minutes

  constructor(
    protected readonly supabaseAdmin: SupabaseAdminService,
    public readonly providerName: WearableProvider,
    public readonly apiBaseUrl: string,
  ) {}

  abstract get endpoints(): ProviderEndpoints;
  abstract get credentials(): ProviderCredentials;

  public usePkce = false;
  public authMethod: AuthenticationMethod = AuthenticationMethod.BASIC_AUTH;

  /**
   * Generates the provider's authorization URL.
   */
  async getAuthorizationUrl(userId: string, redirectUri?: string): Promise<{ authUrl: string; state: string }> {
    const state = randomBytes(32).toString('base64url');
    const { authUrl, pkceData } = this.buildAuthUrl(state);

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + this.stateTtl);

    const { error } = await this.supabaseAdmin.client.from('provider_oauth_states').insert({
      state,
      user_id: userId,
      provider: this.providerName,
      redirect_uri: redirectUri,
      code_verifier: pkceData?.codeVerifier,
      expires_at: expiresAt.toISOString(),
    });

    if (error) {
      this.logger.error(`Failed to store OAuth state for user ${userId}: ${error.message}`);
      throw new InternalServerErrorException('Failed to initiate OAuth flow');
    }

    this.logger.log(`OAuth authorization URL generated for user ${userId}`);

    return { authUrl, state };
  }

  /**
   * Handles the OAuth callback, exchanges code, and saves the connection.
   */
  async handleCallback(code: string, state: string): Promise<OAuthState> {
    const { oauthState, codeVerifier } = await this.validateState(state);

    if (oauthState.provider !== this.providerName) {
      this.logger.error(`Provider mismatch in state. Expected ${this.providerName}, got ${oauthState.provider}`);
      throw new BadRequestException('Provider mismatch in state');
    }

    const tokenResponse = await this.exchangeToken(code, codeVerifier);
    const userInfo = await this.getProviderUserInfo(tokenResponse, oauthState.userId);

    await this.saveConnection(oauthState.userId, tokenResponse, userInfo);

    this.logger.log(`OAuth callback handled successfully for user ${oauthState.userId}`);
    return oauthState;
  }

  /**
   * Refreshes the access token using the refresh token.
   */
  async refreshAccessToken(userId: string, refreshToken: string): Promise<OAuthTokenResponse> {
    const { data, headers } = this.prepareRefreshRequest(refreshToken);
    const response = await axios.post(this.endpoints.tokenUrl, new URLSearchParams(data).toString(), {
      headers,
    });

    const tokenResponse: OAuthTokenResponse = response.data;

    const { data: connection } = await this.supabaseAdmin.client
      .from('user_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', this.providerName)
      .single();

    if (connection) {
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + tokenResponse.expires_in);

      await this.supabaseAdmin.client
        .from('user_connections')
        .update({
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token || refreshToken,
          token_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id);
    }

    this.logger.log(`OAuth token refreshed successfully for user ${userId}`);
    return tokenResponse;
  }

  private buildAuthUrl(state: string): { authUrl: string; pkceData?: { codeVerifier: string } } {
    let pkceData;
    let extraParams = '';

    if (this.usePkce) {
      const { codeVerifier, codeChallenge } = this.generatePkcePair();
      extraParams = `&code_challenge=${codeChallenge}&code_challenge_method=S256`;
      pkceData = { codeVerifier };
    }

    let authUrl = `${this.endpoints.authorizeUrl}?response_type=code&client_id=${this.credentials.clientId}&redirect_uri=${encodeURIComponent(this.credentials.redirectUri)}&state=${state}${extraParams}`;

    if (this.credentials.defaultScope) {
      authUrl += `&scope=${encodeURIComponent(this.credentials.defaultScope)}`;
    }

    return { authUrl, pkceData };
  }

  private generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = randomBytes(43).toString('base64url');
    const challengeBytes = createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = challengeBytes.toString('base64url');
    return { codeVerifier, codeChallenge };
  }

  private async validateState(state: string): Promise<{ oauthState: OAuthState; codeVerifier?: string }> {
    const { data: stateData, error } = await this.supabaseAdmin.client
      .from('provider_oauth_states')
      .select('*')
      .eq('state', state)
      .single();

    if (error || !stateData) {
      throw new BadRequestException('Invalid or expired state parameter');
    }

    // Delete state immediately (one-time use)
    await this.supabaseAdmin.client.from('provider_oauth_states').delete().eq('state', state);

    if (new Date(stateData.expires_at) < new Date()) {
      throw new BadRequestException('State parameter has expired');
    }

    return {
      oauthState: {
        userId: stateData.user_id,
        provider: stateData.provider as WearableProvider,
        redirectUri: stateData.redirect_uri || undefined,
      },
      codeVerifier: stateData.code_verifier || undefined,
    };
  }

  private async exchangeToken(code: string, codeVerifier?: string): Promise<OAuthTokenResponse> {
    const { data, headers } = this.prepareTokenRequest(code, codeVerifier);
    const response = await axios.post(this.endpoints.tokenUrl, new URLSearchParams(data).toString(), {
      headers,
    });

    return response.data;
  }

  private prepareTokenRequest(
    code: string,
    codeVerifier?: string,
  ): { data: Record<string, string>; headers: Record<string, string> } {
    const data: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.credentials.redirectUri,
    };

    if (this.usePkce && codeVerifier) {
      data.code_verifier = codeVerifier;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (this.authMethod === AuthenticationMethod.BODY) {
      data.client_id = this.credentials.clientId;
      data.client_secret = this.credentials.clientSecret;
    } else {
      const basicAuth = Buffer.from(`${this.credentials.clientId}:${this.credentials.clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${basicAuth}`;
    }

    return { data, headers };
  }

  private prepareRefreshRequest(refreshToken: string): {
    data: Record<string, string>;
    headers: Record<string, string>;
  } {
    const data: Record<string, string> = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (this.authMethod === AuthenticationMethod.BODY) {
      data.client_id = this.credentials.clientId;
      data.client_secret = this.credentials.clientSecret;
    } else {
      const basicAuth = Buffer.from(`${this.credentials.clientId}:${this.credentials.clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${basicAuth}`;
    }

    return { data, headers };
  }

  public async deregisterUser(_accessToken: string): Promise<void> {
    this.logger.warn(`Deregistering not supported for provider ${this.providerName}`);
  }

  protected async getProviderUserInfo(
    _tokenResponse: OAuthTokenResponse,
    _userId: string,
  ): Promise<{ userId: string | null; username: string | null; scope?: string | null }> {
    return { userId: null, username: null };
  }

  private async saveConnection(
    userId: string,
    tokenResponse: OAuthTokenResponse,
    userInfo: { userId: string | null; username: string | null; scope?: string | null },
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenResponse.expires_in);

    const { data: existingConnection } = await this.supabaseAdmin.client
      .from('user_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', this.providerName)
      .single();

    if (existingConnection) {
      const { error } = await this.supabaseAdmin.client
        .from('user_connections')
        .update({
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token,
          token_expires_at: expiresAt.toISOString(),
          provider_user_id: userInfo.userId,
          provider_username: userInfo.username,
          scope: userInfo.scope,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingConnection.id);

      if (error) throw new Error(`Failed to update connection: ${error.message}`);
    } else {
      const { error } = await this.supabaseAdmin.client.from('user_connections').insert({
        user_id: userId,
        provider: this.providerName,
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        provider_user_id: userInfo.userId,
        provider_username: userInfo.username,
        scope: userInfo.scope,
      });

      if (error) throw new Error(`Failed to insert connection: ${error.message}`);
    }
  }
}
