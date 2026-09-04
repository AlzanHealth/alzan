import { strict as assert } from 'assert';
import {
  buildMcpClientRegistrationPayload,
  buildMcpTokenRequest,
  parseMcpAuthorizationServerMetadata,
} from './coros-mcp.oauth';

function assertDiscoveryMetadataRequiresAllOAuthEndpoints(): void {
  const metadata = parseMcpAuthorizationServerMetadata({
    issuer: 'https://mcpeu.coros.com',
    authorization_endpoint: 'https://mcpeu.coros.com/oauth2/authorize',
    token_endpoint: 'https://mcpeu.coros.com/oauth2/token',
    revocation_endpoint: 'https://mcpeu.coros.com/oauth2/revoke',
    registration_endpoint: 'https://mcpeu.coros.com/connect/register',
    code_challenge_methods_supported: ['S256'],
  });
  assert.deepEqual(metadata, {
    issuer: 'https://mcpeu.coros.com',
    authorizationEndpoint: 'https://mcpeu.coros.com/oauth2/authorize',
    tokenEndpoint: 'https://mcpeu.coros.com/oauth2/token',
    revocationEndpoint: 'https://mcpeu.coros.com/oauth2/revoke',
    registrationEndpoint: 'https://mcpeu.coros.com/connect/register',
  });
}

function assertRegistrationPayloadUsesPublicPkceClient(): void {
  assert.deepEqual(buildMcpClientRegistrationPayload('https://api.alzanhealth.com/oauth/coros/mcp/callback'), {
    client_name: 'Alzan',
    redirect_uris: ['https://api.alzanhealth.com/oauth/coros/mcp/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'openid offline_access mcp.tools',
    token_endpoint_auth_method: 'none',
  });
}

function assertTokenRequestContainsCodeVerifierAndRedirect(): void {
  assert.deepEqual(
    buildMcpTokenRequest({
      clientId: 'alzan-client',
      code: 'authorization-code',
      redirectUri: 'https://api.alzanhealth.com/oauth/coros/mcp/callback',
      codeVerifier: 'code-verifier',
    }),
    {
      grant_type: 'authorization_code',
      client_id: 'alzan-client',
      code: 'authorization-code',
      redirect_uri: 'https://api.alzanhealth.com/oauth/coros/mcp/callback',
      code_verifier: 'code-verifier',
    },
  );
}

assertDiscoveryMetadataRequiresAllOAuthEndpoints();
assertRegistrationPayloadUsesPublicPkceClient();
assertTokenRequestContainsCodeVerifierAndRedirect();
