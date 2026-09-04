import { randomBytes } from 'crypto';
import axios, { AxiosResponse } from 'axios';
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { WearableProvider } from '../providers.types';
import { CorosMcpClient } from '../../wearables/services/coros-mcp.client';
import { buildCorosMcpAuthorizationUrl } from '../../wearables/services/coros-mcp.protocol';
import {
  buildMcpClientRegistrationPayload,
  buildMcpRefreshTokenRequest,
  buildMcpTokenRequest,
  COROS_MCP_SCOPE,
  createMcpPkcePair,
  CorosMcpAuthorizationServerMetadata,
  parseMcpAuthorizationServerMetadata,
  parseMcpTokenResponse,
  CorosMcpTokenResponse,
} from '../../wearables/services/coros-mcp.oauth';
import { encryptCorosToken, decryptCorosToken, isCorosUserAllowed } from './coros-security';

const DEFAULT_MCP_ENDPOINT = 'https://mcp.coros.com/mcp';
const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600;
const MCP_STATE_TTL_SECONDS = 900;
const MCP_REQUEST_TIMEOUT_MS = 15_000;
const TOKEN_REFRESH_SKEW_MS = 5 * 60_000;

export type CorosMcpOAuthState = {
  userId: string;
  redirectUri?: string;
};

export type CorosMcpAccessToken = {
  connectionId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  clientId: string;
};

type StoredMcpState = {
  userId: string;
  redirectUri: string | null;
  codeVerifier: string;
  clientId: string;
  expiresAt: string;
};

type McpConnectionRow = {
  id: string;
  status: string | null;
  connection_kind: string | null;
  client_id: string | null;
};

type McpTokenRow = {
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
};

@Injectable()
export class CorosMcpOAuthService {
  private readonly logger = new Logger(CorosMcpOAuthService.name);
  private readonly refreshes = new Map<string, Promise<CorosMcpAccessToken>>();

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseAdminService: SupabaseAdminService,
  ) {}

  public isConfigured(): boolean {
    const rolloutMode = this.configService.get<string>('COROS_MCP_ROLLOUT_MODE')?.trim().toLowerCase();
    if (!rolloutMode || rolloutMode === 'disabled') return false;
    const redirectUri = this.redirectUri;
    const encryptionKey = this.configService.get<string>('COROS_TOKEN_ENCRYPTION_KEY_V1');
    if (!redirectUri || !encryptionKey || !this.mcpEndpoint) return false;
    try {
      encryptCorosToken('configuration-check', encryptionKey);
      return true;
    } catch {
      return false;
    }
  }

  public isUserAllowed(userId: string): boolean {
    return isCorosUserAllowed({
      mode:
        this.configService.get<string>('COROS_MCP_ROLLOUT_MODE') ??
        this.configService.get<string>('COROS_ROLLOUT_MODE'),
      pilotUserIds: this.configService.get<string>('COROS_PILOT_USER_IDS'),
      userId,
    });
  }

  public async getAuthorizationUrl(
    userId: string,
    postRedirectUri?: string,
  ): Promise<{ authUrl: string; state: string }> {
    this.assertAvailable(userId);
    const metadata = await this.discoverMetadata();
    const clientId = await this.resolveClientId(metadata);
    const { codeVerifier, codeChallenge } = createMcpPkcePair();
    const state = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + MCP_STATE_TTL_SECONDS * 1000).toISOString();
    const { error } = await this.supabaseAdminService.client.from('provider_oauth_states').insert({
      state,
      user_id: userId,
      provider: WearableProvider.COROS,
      redirect_uri: postRedirectUri ?? null,
      code_verifier: codeVerifier,
      client_id: clientId,
      expires_at: expiresAt,
    });
    if (error) {
      this.logger.error(`Failed to store COROS MCP OAuth state: ${error.message}`);
      throw new InternalServerErrorException('COROS_MCP_OAUTH_STATE_SAVE_FAILED');
    }

    return {
      authUrl: buildCorosMcpAuthorizationUrl({
        authorizationEndpoint: metadata.authorizationEndpoint,
        clientId,
        redirectUri: this.redirectUri,
        resource: this.mcpEndpoint,
        scope: COROS_MCP_SCOPE,
        state,
        codeChallenge,
      }),
      state,
    };
  }

  public async handleCallback(code: string, state: string): Promise<CorosMcpOAuthState> {
    if (!code || !state) throw new BadRequestException('COROS_MCP_OAUTH_PARAMETERS_MISSING');
    const oauthState = await this.consumeState(state);
    const metadata = await this.discoverMetadata();
    const tokenResponse = await this.exchangeCode(metadata, code, oauthState);
    await this.saveConnection(oauthState.userId, tokenResponse, oauthState.clientId);
    this.logger.log(`COROS MCP OAuth callback handled for user ${oauthState.userId}`);
    return {
      userId: oauthState.userId,
      redirectUri: oauthState.redirectUri ?? undefined,
    };
  }

  public async consumeRedirectUriForError(state: string): Promise<string | null> {
    try {
      const stored = await this.consumeState(state);
      return stored.redirectUri;
    } catch {
      return null;
    }
  }

  public async getUsableAccessToken(userId: string): Promise<CorosMcpAccessToken> {
    const token = await this.readAccessToken(userId);
    if (!token.expiresAt || Date.parse(token.expiresAt) > Date.now() + TOKEN_REFRESH_SKEW_MS) return token;
    if (!token.refreshToken) throw new UnauthorizedException('COROS_MCP_REFRESH_TOKEN_MISSING');

    const existingRefresh = this.refreshes.get(userId);
    if (existingRefresh) return existingRefresh;
    const refresh = this.refreshAccessToken(userId, token).finally(() => this.refreshes.delete(userId));
    this.refreshes.set(userId, refresh);
    return refresh;
  }

  public async refreshAccessToken(userId: string, token: CorosMcpAccessToken): Promise<CorosMcpAccessToken> {
    if (!token.refreshToken) throw new UnauthorizedException('COROS_MCP_REFRESH_TOKEN_MISSING');
    const metadata = await this.discoverMetadata();
    const response = await this.postForm(
      metadata.tokenEndpoint,
      buildMcpRefreshTokenRequest(token.clientId, token.refreshToken),
    );
    const tokenResponse = this.parseTokenHttpResponse(response);
    await this.saveTokenRow(token.connectionId, userId, tokenResponse, token.refreshToken);
    const { error: connectionError } = await this.supabaseAdminService.client
      .from('user_connections')
      .update({
        client_id: token.clientId,
        token_expires_at: this.expiresAt(tokenResponse),
        status: 'active',
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', token.connectionId)
      .eq('user_id', userId);
    if (connectionError) throw new InternalServerErrorException('COROS_MCP_CONNECTION_REFRESH_PERSIST_FAILED');
    return {
      connectionId: token.connectionId,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? token.refreshToken,
      expiresAt: this.expiresAt(tokenResponse),
      clientId: token.clientId,
    };
  }

  public async revokeAccessToken(accessToken: string, clientId?: string): Promise<void> {
    const metadata = await this.discoverMetadata();
    if (!metadata.revocationEndpoint) throw new Error('COROS_MCP_REVOCATION_UNSUPPORTED');
    const response = await this.postForm(metadata.revocationEndpoint, {
      client_id: clientId ?? this.clientIdOrThrow(),
      token: accessToken,
      token_type_hint: 'access_token',
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`COROS_MCP_REVOCATION_FAILED_${response.status}`);
    }
  }

  public async isActiveConnection(userId: string): Promise<boolean> {
    const { data, error } = await this.supabaseAdminService.client
      .from('user_connections')
      .select('connection_kind, status')
      .eq('user_id', userId)
      .eq('provider', WearableProvider.COROS)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('COROS_CONNECTION_READ_FAILED');
    // Keep routing by transport even when the connection is in error/revoked
    // state, so a failed MCP connection never falls through to legacy OAuth.
    return data?.connection_kind === 'mcp';
  }

  public async getMcpClient(userId: string): Promise<CorosMcpClient> {
    const token = await this.getUsableAccessToken(userId);
    return new CorosMcpClient(token.accessToken, this.mcpEndpoint);
  }

  public async discoverMetadata(): Promise<CorosMcpAuthorizationServerMetadata> {
    const issuer = this.configService.get<string>('COROS_MCP_ISSUER')?.trim();
    const endpoint = issuer
      ? `${issuer.replace(/\/$/, '')}/.well-known/oauth-authorization-server`
      : `${new URL(this.mcpEndpoint).origin}/.well-known/oauth-authorization-server`;
    const response = await axios.get<unknown>(endpoint, {
      timeout: MCP_REQUEST_TIMEOUT_MS,
      validateStatus: () => true,
      headers: { Accept: 'application/json' },
    });
    if (response.status < 200 || response.status >= 300) {
      throw new ServiceUnavailableException(`COROS_MCP_DISCOVERY_FAILED_${response.status}`);
    }
    try {
      return parseMcpAuthorizationServerMetadata(response.data);
    } catch (error) {
      throw new ServiceUnavailableException(error instanceof Error ? error.message : 'COROS_MCP_DISCOVERY_INVALID');
    }
  }

  private async resolveClientId(metadata: CorosMcpAuthorizationServerMetadata): Promise<string> {
    const configuredClientId = this.configService.get<string>('COROS_MCP_CLIENT_ID')?.trim();
    if (configuredClientId) return configuredClientId;
    if (!metadata.registrationEndpoint) throw new ServiceUnavailableException('COROS_MCP_CLIENT_ID_REQUIRED');
    const response = await axios.post<unknown>(
      metadata.registrationEndpoint,
      buildMcpClientRegistrationPayload(this.redirectUri),
      {
        timeout: MCP_REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      },
    );
    if (response.status < 200 || response.status >= 300 || !isRecord(response.data)) {
      throw new ServiceUnavailableException(`COROS_MCP_CLIENT_REGISTRATION_FAILED_${response.status}`);
    }
    const clientId = readString(response.data.client_id);
    if (!clientId) throw new ServiceUnavailableException('COROS_MCP_CLIENT_REGISTRATION_INVALID');
    return clientId;
  }

  private async consumeState(state: string): Promise<StoredMcpState> {
    const { data, error } = await this.supabaseAdminService.client
      .from('provider_oauth_states')
      .delete()
      .eq('state', state)
      .select('user_id, provider, redirect_uri, code_verifier, client_id, expires_at')
      .maybeSingle();
    if (error) throw new InternalServerErrorException('COROS_MCP_OAUTH_STATE_CONSUME_FAILED');
    if (!data || data.provider !== WearableProvider.COROS) {
      throw new BadRequestException('COROS_MCP_OAUTH_STATE_INVALID');
    }
    if (Date.parse(data.expires_at) <= Date.now()) throw new BadRequestException('COROS_MCP_OAUTH_STATE_EXPIRED');
    if (!data.code_verifier || !data.client_id) throw new BadRequestException('COROS_MCP_OAUTH_STATE_INVALID');
    return {
      userId: data.user_id,
      redirectUri: data.redirect_uri,
      codeVerifier: data.code_verifier,
      clientId: data.client_id,
      expiresAt: data.expires_at,
    };
  }

  private async exchangeCode(
    metadata: CorosMcpAuthorizationServerMetadata,
    code: string,
    state: StoredMcpState,
  ): Promise<CorosMcpTokenResponse> {
    const response = await this.postForm(
      metadata.tokenEndpoint,
      buildMcpTokenRequest({
        clientId: state.clientId,
        code,
        redirectUri: this.redirectUri,
        codeVerifier: state.codeVerifier,
      }),
    );
    return this.parseTokenHttpResponse(response);
  }

  private parseTokenHttpResponse(response: AxiosResponse<unknown>): CorosMcpTokenResponse {
    if (response.status < 200 || response.status >= 300) {
      throw new BadGatewayException(`COROS_MCP_TOKEN_EXCHANGE_FAILED_${response.status}`);
    }
    try {
      return parseMcpTokenResponse(response.data);
    } catch (error) {
      throw new BadGatewayException(error instanceof Error ? error.message : 'COROS_MCP_TOKEN_RESPONSE_INVALID');
    }
  }

  private async postForm(url: string, body: Record<string, string>): Promise<AxiosResponse<unknown>> {
    return axios.post<unknown>(url, new URLSearchParams(body).toString(), {
      timeout: MCP_REQUEST_TIMEOUT_MS,
      validateStatus: () => true,
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }

  private async saveConnection(userId: string, tokenResponse: CorosMcpTokenResponse, clientId: string): Promise<void> {
    const { data: existing, error: readError } = await this.supabaseAdminService.client
      .from('user_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', WearableProvider.COROS)
      .maybeSingle();
    if (readError) throw new InternalServerErrorException('COROS_CONNECTION_READ_FAILED');

    let connectionId = existing?.id as string | undefined;
    let inserted = false;
    if (connectionId) {
      const { error } = await this.supabaseAdminService.client
        .from('user_connections')
        .update({
          access_token: null,
          refresh_token: null,
          client_id: clientId,
          token_expires_at: this.expiresAt(tokenResponse),
          provider_user_id: null,
          provider_username: null,
          scope: tokenResponse.scope ?? COROS_MCP_SCOPE,
          connection_kind: 'mcp',
          status: 'active',
          revoked_at: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId);
      if (error) throw new InternalServerErrorException('COROS_CONNECTION_SAVE_FAILED');
    } else {
      const { data, error } = await this.supabaseAdminService.client
        .from('user_connections')
        .insert({
          user_id: userId,
          provider: WearableProvider.COROS,
          access_token: null,
          refresh_token: null,
          client_id: clientId,
          token_expires_at: this.expiresAt(tokenResponse),
          provider_user_id: null,
          provider_username: null,
          scope: tokenResponse.scope ?? COROS_MCP_SCOPE,
          connection_kind: 'mcp',
          status: 'active',
        })
        .select('id')
        .single();
      if (error || !data?.id) throw new InternalServerErrorException('COROS_CONNECTION_SAVE_FAILED');
      connectionId = data.id as string;
      inserted = true;
    }

    try {
      await this.saveTokenRow(connectionId, userId, tokenResponse);
    } catch (error) {
      if (inserted) {
        await this.supabaseAdminService.client
          .from('provider_connection_tokens')
          .delete()
          .eq('connection_id', connectionId);
        await this.supabaseAdminService.client.from('user_connections').delete().eq('id', connectionId);
      } else {
        await this.supabaseAdminService.client
          .from('user_connections')
          .update({ status: 'error', last_error: 'COROS_MCP_TOKEN_SAVE_FAILED', updated_at: new Date().toISOString() })
          .eq('id', connectionId);
      }
      throw error;
    }
  }

  private async saveTokenRow(
    connectionId: string,
    userId: string,
    tokenResponse: CorosMcpTokenResponse,
    fallbackRefreshToken?: string,
  ): Promise<void> {
    const encryptionKey = this.encryptionKeyOrThrow();
    const { error } = await this.supabaseAdminService.client.from('provider_connection_tokens').upsert(
      {
        connection_id: connectionId,
        user_id: userId,
        provider: WearableProvider.COROS,
        access_token: encryptCorosToken(tokenResponse.access_token, encryptionKey),
        refresh_token: tokenResponse.refresh_token
          ? encryptCorosToken(tokenResponse.refresh_token, encryptionKey)
          : fallbackRefreshToken
            ? encryptCorosToken(fallbackRefreshToken, encryptionKey)
            : null,
        token_type: tokenResponse.token_type ?? 'Bearer',
        token_expires_at: this.expiresAt(tokenResponse),
        scope: tokenResponse.scope ?? COROS_MCP_SCOPE,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'connection_id' },
    );
    if (error) throw new InternalServerErrorException('COROS_MCP_TOKEN_SAVE_FAILED');
  }

  private async readAccessToken(userId: string): Promise<CorosMcpAccessToken> {
    const { data: connection, error: connectionError } = await this.supabaseAdminService.client
      .from('user_connections')
      .select('id, status, connection_kind, client_id')
      .eq('user_id', userId)
      .eq('provider', WearableProvider.COROS)
      .maybeSingle();
    if (connectionError) throw new InternalServerErrorException('COROS_CONNECTION_READ_FAILED');
    const typedConnection = connection as McpConnectionRow | null;
    if (!typedConnection || typedConnection.status !== 'active' || typedConnection.connection_kind !== 'mcp') {
      throw new UnauthorizedException('COROS_MCP_CONNECTION_REQUIRED');
    }
    const { data: token, error: tokenError } = await this.supabaseAdminService.client
      .from('provider_connection_tokens')
      .select('access_token, refresh_token, token_expires_at')
      .eq('connection_id', typedConnection.id)
      .maybeSingle();
    if (tokenError) throw new InternalServerErrorException('COROS_TOKEN_READ_FAILED');
    const typedToken = token as McpTokenRow | null;
    if (!typedToken?.access_token) throw new UnauthorizedException('COROS_MCP_ACCESS_TOKEN_MISSING');
    return {
      connectionId: typedConnection.id,
      accessToken: this.decryptToken(typedToken.access_token),
      refreshToken: typedToken.refresh_token ? this.decryptToken(typedToken.refresh_token) : null,
      expiresAt: typedToken.token_expires_at,
      clientId: readString(typedConnection.client_id) ?? this.clientIdOrThrow(),
    };
  }

  private assertAvailable(userId: string): void {
    if (!this.isConfigured()) throw new ServiceUnavailableException('COROS_MCP_NOT_CONFIGURED');
    if (!this.isUserAllowed(userId)) throw new ForbiddenException('COROS integration is not enabled for this user');
  }

  private get mcpEndpoint(): string {
    return (this.configService.get<string>('COROS_MCP_URL') || DEFAULT_MCP_ENDPOINT).replace(/\/$/, '');
  }

  private get redirectUri(): string {
    const configured = this.configService.get<string>('COROS_MCP_REDIRECT_URI')?.trim();
    const baseUrl = this.configService.get<string>('server.baseUrl') || 'http://localhost:1111';
    return configured || `${baseUrl.replace(/\/$/, '')}/oauth/coros/mcp/callback`;
  }

  private get clientId(): string {
    return this.configService.get<string>('COROS_MCP_CLIENT_ID')?.trim() ?? '';
  }

  private clientIdOrThrow(): string {
    if (!this.clientId) throw new ServiceUnavailableException('COROS_MCP_CLIENT_ID_REQUIRED');
    return this.clientId;
  }

  private get encryptionKey(): string {
    return this.configService.get<string>('COROS_TOKEN_ENCRYPTION_KEY_V1') ?? '';
  }

  private encryptionKeyOrThrow(): string {
    if (!this.encryptionKey) throw new ServiceUnavailableException('COROS_TOKEN_ENCRYPTION_KEY_MISSING');
    return this.encryptionKey;
  }

  private decryptToken(value: string): string {
    try {
      return decryptCorosToken(value, this.encryptionKeyOrThrow());
    } catch {
      throw new InternalServerErrorException('COROS_TOKEN_DECRYPT_FAILED');
    }
  }

  private expiresAt(tokenResponse: CorosMcpTokenResponse): string {
    const lifetime = tokenResponse.expires_in ?? DEFAULT_TOKEN_LIFETIME_SECONDS;
    return new Date(Date.now() + lifetime * 1000).toISOString();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
