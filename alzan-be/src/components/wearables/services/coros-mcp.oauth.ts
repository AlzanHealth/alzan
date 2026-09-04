import { createHash, randomBytes } from 'crypto';

export const COROS_MCP_SCOPE = 'openid offline_access mcp.tools';

export type CorosMcpAuthorizationServerMetadata = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint: string | null;
  registrationEndpoint: string | null;
};

export type CorosMcpPkcePair = {
  codeVerifier: string;
  codeChallenge: string;
};

export type CorosMcpTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  id_token?: string;
};

export type CorosMcpTokenRequestInput = {
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
};

export function parseMcpAuthorizationServerMetadata(value: unknown): CorosMcpAuthorizationServerMetadata {
  if (!isRecord(value)) throw new Error('COROS_MCP_DISCOVERY_INVALID');

  const issuer = readHttpsUrl(value.issuer);
  const authorizationEndpoint = readHttpsUrl(value.authorization_endpoint);
  const tokenEndpoint = readHttpsUrl(value.token_endpoint);
  const revocationEndpoint = readOptionalHttpsUrl(value.revocation_endpoint);
  const registrationEndpoint = readOptionalHttpsUrl(value.registration_endpoint);

  if (!issuer || !authorizationEndpoint || !tokenEndpoint) {
    throw new Error('COROS_MCP_DISCOVERY_INVALID');
  }

  return {
    issuer,
    authorizationEndpoint,
    tokenEndpoint,
    revocationEndpoint,
    registrationEndpoint,
  };
}

export function buildMcpClientRegistrationPayload(redirectUri: string): {
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  scope: string;
  token_endpoint_auth_method: 'none';
} {
  assertHttpUrl(redirectUri, 'COROS_MCP_REDIRECT_URI_INVALID');
  return {
    client_name: 'Alzan',
    redirect_uris: [redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: COROS_MCP_SCOPE,
    token_endpoint_auth_method: 'none',
  };
}

export function buildMcpTokenRequest(input: CorosMcpTokenRequestInput): Record<string, string> {
  if (!input.clientId || !input.code || !input.redirectUri || !input.codeVerifier) {
    throw new Error('COROS_MCP_TOKEN_REQUEST_INVALID');
  }
  return {
    grant_type: 'authorization_code',
    client_id: input.clientId,
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  };
}

export function buildMcpRefreshTokenRequest(clientId: string, refreshToken: string): Record<string, string> {
  if (!clientId || !refreshToken) throw new Error('COROS_MCP_REFRESH_REQUEST_INVALID');
  return {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  };
}

export function createMcpPkcePair(): CorosMcpPkcePair {
  const codeVerifier = randomBytes(43).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function parseMcpTokenResponse(value: unknown): CorosMcpTokenResponse {
  if (!isRecord(value) || typeof value.access_token !== 'string' || value.access_token.trim().length === 0) {
    throw new Error('COROS_MCP_TOKEN_RESPONSE_INVALID');
  }
  if (value.refresh_token !== undefined && typeof value.refresh_token !== 'string') {
    throw new Error('COROS_MCP_TOKEN_RESPONSE_INVALID');
  }
  if (
    value.expires_in !== undefined &&
    (typeof value.expires_in !== 'number' || !Number.isFinite(value.expires_in) || value.expires_in < 0)
  ) {
    throw new Error('COROS_MCP_TOKEN_RESPONSE_INVALID');
  }
  return {
    access_token: value.access_token,
    refresh_token: value.refresh_token as string | undefined,
    expires_in: value.expires_in as number | undefined,
    token_type: typeof value.token_type === 'string' ? value.token_type : undefined,
    scope: typeof value.scope === 'string' ? value.scope : undefined,
    id_token: typeof value.id_token === 'string' ? value.id_token : undefined,
  };
}

function assertHttpUrl(value: string, errorCode: string): void {
  if (!readHttpUrl(value)) throw new Error(errorCode);
}

function readHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

function readOptionalHttpsUrl(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return readHttpsUrl(value);
}

function readHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
