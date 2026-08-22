import { strict as assert } from 'assert';
import { AuthenticationMethod, OAuthTokenResponse } from './base-oauth.provider';
import { CorosOAuthService } from './coros-oauth.service';

class TestableCorosOAuthService extends CorosOAuthService {
  public providerUserInfo(token: OAuthTokenResponse & { openId?: string }, userId: string) {
    return this.getProviderUserInfo(token, userId);
  }

  public protectToken(token: string): string {
    return this.protectTokenForStorage(token);
  }
}

const insertedStates: Array<Record<string, unknown>> = [];
const supabaseAdmin = {
  client: {
    from: (table: string) => {
      assert.equal(table, 'provider_oauth_states');
      return {
        insert: async (value: Record<string, unknown>) => {
          insertedStates.push(value);
          return { error: null };
        },
      };
    },
  },
};

const encryptionKey = Buffer.alloc(32, 11).toString('base64');
const config = new Map<string, string>([
  ['COROS_API_BASE_URL', 'https://opentest.coros.com/'],
  ['COROS_CLIENT_ID', 'coros-client'],
  ['COROS_CLIENT_SECRET', 'coros-secret'],
  ['COROS_REDIRECT_URI', 'https://api.alzan.health/oauth/coros/callback'],
  ['COROS_ROLLOUT_MODE', 'pilot'],
  ['COROS_PILOT_USER_IDS', 'pilot-user'],
  ['COROS_TOKEN_ENCRYPTION_KEY_V1', encryptionKey],
]);
const configService = { get: (key: string) => config.get(key) };
const service = new TestableCorosOAuthService(supabaseAdmin as never, configService as never);

assert.equal(service.authMethod, AuthenticationMethod.BODY);
assert.deepEqual(service.endpoints, {
  authorizeUrl: 'https://opentest.coros.com/oauth2/authorize',
  tokenUrl: 'https://opentest.coros.com/oauth2/accesstoken',
  refreshUrl: 'https://opentest.coros.com/oauth2/refresh-token',
});
assert.deepEqual(service.credentials, {
  clientId: 'coros-client',
  clientSecret: 'coros-secret',
  redirectUri: 'https://api.alzan.health/oauth/coros/callback',
});

void (async () => {
  assert.throws(() => service.getAuthorizationUrl('not-allowed'));
  assert.equal(insertedStates.length, 0);

  const result = await service.getAuthorizationUrl('pilot-user', 'alzan://oauth/callback');
  const authorizationUrl = new URL(result.authUrl);
  assert.equal(authorizationUrl.origin + authorizationUrl.pathname, 'https://opentest.coros.com/oauth2/authorize');
  assert.equal(authorizationUrl.searchParams.get('response_type'), 'code');
  assert.equal(authorizationUrl.searchParams.get('client_id'), 'coros-client');
  assert.equal(authorizationUrl.searchParams.get('redirect_uri'), 'https://api.alzan.health/oauth/coros/callback');
  assert.equal(authorizationUrl.searchParams.get('scope'), null);
  assert.equal(authorizationUrl.searchParams.get('user_id'), null);
  assert.equal(insertedStates.length, 1);

  assert.deepEqual(
    await service.providerUserInfo(
      { access_token: 'access', refresh_token: 'refresh', expires_in: 2_592_000, openId: 'open-id-123' },
      'pilot-user',
    ),
    { userId: 'open-id-123', username: null },
  );
  assert.match(service.protectToken('access'), /^enc:v1:/);
})().catch((error: unknown) => {
  process.nextTick(() => {
    throw error;
  });
});
