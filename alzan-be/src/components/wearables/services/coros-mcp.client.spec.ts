import { strict as assert } from 'assert';
import { CorosMcpFileClient, CorosMcpHttpClient, CorosMcpHttpResponse, CorosMcpClient } from './coros-mcp.client';

function createResponse(body: unknown, status = 200, headers?: Record<string, string>): CorosMcpHttpResponse {
  return {
    status,
    headers,
    async json(): Promise<unknown> {
      return body;
    },
  };
}

async function assertClientUsesCurrentStatelessTransport(): Promise<void> {
  const requests: Array<{ body: Record<string, unknown>; headers: Record<string, string> }> = [];
  const httpClient: CorosMcpHttpClient = async (_url, init) => {
    requests.push({ body: JSON.parse(init.body) as Record<string, unknown>, headers: init.headers });
    return createResponse({ jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'querySportRecords' }] } });
  };
  const client = new CorosMcpClient('access-token', 'https://mcp.coros.com/mcp', httpClient);

  const tools = await client.listTools();

  assert.deepEqual(tools, [{ name: 'querySportRecords' }]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.body.method, 'tools/list');
  assert.equal(requests[0]?.headers['MCP-Protocol-Version'], '2026-07-28');
  assert.equal(requests[0]?.headers['Mcp-Method'], 'tools/list');
  assert.equal(requests[0]?.headers['Mcp-Name'], undefined);
  const params = requests[0]?.body.params as Record<string, unknown>;
  assert.deepEqual(params._meta, {
    'io.modelcontextprotocol/clientInfo': { name: 'Alzan', version: '1.0.0' },
  });
}

async function assertStatelessToolCallUsesRoutingHeaders(): Promise<void> {
  const requests: Array<{ body: Record<string, unknown>; headers: Record<string, string> }> = [];
  const httpClient: CorosMcpHttpClient = async (_url, init) => {
    requests.push({ body: JSON.parse(init.body) as Record<string, unknown>, headers: init.headers });
    return createResponse({ jsonrpc: '2.0', id: 1, result: {} });
  };
  const client = new CorosMcpClient('access-token', 'https://mcp.coros.com/mcp', httpClient);

  await client.callTool('querySportRecords', { startDate: '2026-01-01' });

  const capturedRequest = requests[0];
  if (!capturedRequest) throw new Error('Expected an MCP request');
  assert.equal(capturedRequest.headers['MCP-Protocol-Version'], '2026-07-28');
  assert.equal(capturedRequest.headers['Mcp-Method'], 'tools/call');
  assert.equal(capturedRequest.headers['Mcp-Name'], 'querySportRecords');
  assert.equal(capturedRequest.headers['Mcp-Session-Id'], undefined);
  assert.equal(capturedRequest.headers.Authorization, 'Bearer access-token');
  const params = capturedRequest.body.params as Record<string, unknown>;
  assert.deepEqual(params.arguments, { startDate: '2026-01-01' });
}

async function assertFallsBackToLegacyTransport(): Promise<void> {
  const requests: Array<{ body: Record<string, unknown>; headers: Record<string, string> }> = [];
  const responses = [
    createResponse({ jsonrpc: '2.0', id: 1, error: { code: -32022, message: 'UnsupportedProtocolVersion' } }),
    createResponse({ jsonrpc: '2.0', id: 2, result: { protocolVersion: '2025-06-18' } }, 200, {
      'Mcp-Session-Id': 'session-1',
    }),
    createResponse(null, 202),
    createResponse({ jsonrpc: '2.0', id: 3, result: { tools: [{ name: 'querySportRecords' }] } }),
  ];
  const httpClient: CorosMcpHttpClient = async (_url, init) => {
    requests.push({ body: JSON.parse(init.body) as Record<string, unknown>, headers: init.headers });
    return responses.shift() ?? createResponse({}, 500);
  };
  const client = new CorosMcpClient('access-token', 'https://mcp.coros.com/mcp', httpClient);

  const tools = await client.listTools();

  assert.deepEqual(tools, [{ name: 'querySportRecords' }]);
  assert.equal(requests[0]?.headers['MCP-Protocol-Version'], '2026-07-28');
  assert.equal(requests[0]?.headers['Mcp-Method'], 'tools/list');
  assert.equal(requests[1]?.body.method, 'initialize');
  assert.equal(requests[2]?.headers['Mcp-Session-Id'], 'session-1');
  assert.equal(requests[3]?.headers['MCP-Protocol-Version'], '2025-06-18');
  assert.equal(requests[3]?.headers['Mcp-Session-Id'], 'session-1');
}

async function assertFitDownloadUsesBearerAndRejectsUntrustedHosts(): Promise<void> {
  const fileRequests: Array<{ url: string; headers: Record<string, string> }> = [];
  const fileClient: CorosMcpFileClient = async (url, headers) => {
    fileRequests.push({ url, headers });
    return { status: 200, arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer };
  };
  const client = new CorosMcpClient('access-token', 'https://mcp.coros.com/mcp', undefined, fileClient);
  const bytes = await client.downloadFitFile('https://api.coros.com/a.fit');
  assert.deepEqual([...bytes], [1, 2, 3]);
  assert.equal(fileRequests[0]?.headers.Authorization, 'Bearer access-token');
  await assert.rejects(() => client.downloadFitFile('https://example.com/a.fit'), /COROS_MCP_FIT_URL_UNTRUSTED/);
}

async function assertFitDownloadRejectsOversizedFiles(): Promise<void> {
  const fileClient: CorosMcpFileClient = async () => ({
    status: 200,
    arrayBuffer: async () => new Uint8Array(25 * 1024 * 1024 + 1).buffer,
  });
  const client = new CorosMcpClient('access-token', 'https://mcp.coros.com/mcp', undefined, fileClient);
  await assert.rejects(() => client.downloadFitFile('https://api.coros.com/a.fit'), /COROS_MCP_FIT_FILE_TOO_LARGE/);
}

async function run(): Promise<void> {
  await assertClientUsesCurrentStatelessTransport();
  await assertStatelessToolCallUsesRoutingHeaders();
  await assertFallsBackToLegacyTransport();
  await assertFitDownloadUsesBearerAndRejectsUntrustedHosts();
  await assertFitDownloadRejectsOversizedFiles();
  console.log('coros-mcp.client.spec.ts: all assertions passed');
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
