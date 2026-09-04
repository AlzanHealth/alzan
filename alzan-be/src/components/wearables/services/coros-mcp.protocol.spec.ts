import { strict as assert } from 'assert';
import { buildCorosMcpAuthorizationUrl, extractMcpToolNames, parseMcpToolResult } from './coros-mcp.protocol';

function assertAuthorizationUrlContainsExpectedOAuthParameters(): void {
  const url = buildCorosMcpAuthorizationUrl({
    authorizationEndpoint: 'https://mcpeu.coros.com/oauth2/authorize',
    clientId: 'alzan-client',
    redirectUri: 'https://api.alzanhealth.com/oauth/coros/mcp/callback',
    resource: 'https://mcp.coros.com/mcp',
    scope: 'openid offline_access mcp.tools',
    state: 'state-value',
    codeChallenge: 'challenge-value',
  });
  const params = new URL(url).searchParams;
  assert.equal(params.get('response_type'), 'code');
  assert.equal(params.get('client_id'), 'alzan-client');
  assert.equal(params.get('redirect_uri'), 'https://api.alzanhealth.com/oauth/coros/mcp/callback');
  assert.equal(params.get('resource'), 'https://mcp.coros.com/mcp');
  assert.equal(params.get('code_challenge_method'), 'S256');
  assert.equal(params.get('code_challenge'), 'challenge-value');
  assert.equal(params.get('state'), 'state-value');
}

function assertToolNamesAreReadFromTheLiveCatalog(): void {
  assert.deepEqual(
    extractMcpToolNames({
      result: {
        tools: [{ name: 'querySportRecords' }, { name: 'getActivityDetail' }, { name: 'querySportRecords' }],
      },
    }),
    ['querySportRecords', 'getActivityDetail'],
  );
}

function assertToolResultParsesStructuredTextAndRejectsErrors(): void {
  assert.deepEqual(
    parseMcpToolResult<{ activities: unknown[] }>({
      result: { content: [{ type: 'text', text: '{"activities":[]}' }] },
    }),
    { activities: [] },
  );
  assert.throws(
    () =>
      parseMcpToolResult({
        error: { code: -32602, message: 'invalid arguments' },
      }),
    /COROS_MCP_RPC_ERROR_INVALID_ARGUMENTS/,
  );
}

function assertToolResultParsesStreamableHttpSse(): void {
  assert.deepEqual(
    parseMcpToolResult<{ activities: unknown[] }>(
      'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"activities":[]}}\n\n',
    ),
    { activities: [] },
  );
}

assertAuthorizationUrlContainsExpectedOAuthParameters();
assertToolNamesAreReadFromTheLiveCatalog();
assertToolResultParsesStructuredTextAndRejectsErrors();
assertToolResultParsesStreamableHttpSse();
