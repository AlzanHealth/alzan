import { strict as assert } from 'assert';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { CorosMcpOAuthService } from './coros-mcp-oauth.service';

const encryptionKey = Buffer.alloc(32, 5).toString('base64');
const states: Array<Record<string, unknown>> = [];
const configValues: Record<string, string> = {
  COROS_MCP_URL: 'https://mcp.coros.com/mcp',
  COROS_MCP_ROLLOUT_MODE: 'pilot',
  COROS_PILOT_USER_IDS: 'user-1',
  COROS_TOKEN_ENCRYPTION_KEY_V1: encryptionKey,
  COROS_MCP_REDIRECT_URI: 'https://api.alzanhealth.com/oauth/coros/mcp/callback',
};

const config = { get: (key: string) => configValues[key] } as unknown as ConfigService;
const supabaseAdmin = {
  client: {
    from: (table: string) => {
      assert.equal(table, 'provider_oauth_states');
      return {
        insert: async (value: Record<string, unknown>) => {
          states.push(value);
          return { error: null };
        },
      };
    },
  },
} as unknown as SupabaseAdminService;

async function run(): Promise<void> {
  const originalGet = axios.get;
  const originalPost = axios.post;
  axios.get = (async () => ({
    status: 200,
    data: {
      issuer: 'https://mcpeu.coros.com',
      authorization_endpoint: 'https://mcpeu.coros.com/oauth2/authorize',
      token_endpoint: 'https://mcpeu.coros.com/oauth2/token',
      revocation_endpoint: 'https://mcpeu.coros.com/oauth2/revoke',
      registration_endpoint: 'https://mcpeu.coros.com/connect/register',
    },
  })) as typeof axios.get;
  axios.post = (async () => ({ status: 201, data: { client_id: 'dynamic-client' } })) as typeof axios.post;
  try {
    const service = new CorosMcpOAuthService(config, supabaseAdmin);
    const result = await service.getAuthorizationUrl('user-1', 'http://localhost:8082/oauth/coros/success');
    const url = new URL(result.authUrl);
    assert.equal(url.origin + url.pathname, 'https://mcpeu.coros.com/oauth2/authorize');
    assert.equal(url.searchParams.get('client_id'), 'dynamic-client');
    assert.equal(url.searchParams.get('resource'), 'https://mcp.coros.com/mcp');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(states.length, 1);
    assert.equal(states[0].client_id, 'dynamic-client');
    assert.equal(states[0].code_verifier && typeof states[0].code_verifier, 'string');
  } finally {
    axios.get = originalGet;
    axios.post = originalPost;
  }
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
