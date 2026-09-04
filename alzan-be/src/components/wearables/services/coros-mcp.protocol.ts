type JsonRecord = Record<string, unknown>;

export type CorosMcpAuthorizationUrlInput = {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  scope: string;
  state: string;
  codeChallenge: string;
};

type McpTool = {
  name: string;
};

export class CorosMcpRpcError extends Error {
  public readonly rpcCode: number | string | null;

  public constructor(rpcCode: number | string | null, message: string) {
    super(message);
    this.name = 'CorosMcpRpcError';
    this.rpcCode = rpcCode;
  }
}

export function buildCorosMcpAuthorizationUrl(input: CorosMcpAuthorizationUrlInput): string {
  const url = new URL(input.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', input.scope);
  url.searchParams.set('resource', input.resource);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function extractMcpToolNames(value: unknown): string[] {
  const toolRecords = findTools(value);
  const names = toolRecords.map(tool => tool.name);
  return [...new Set(names)];
}

export function parseMcpToolResult<T>(value: unknown): T {
  const payload = parseMcpResponsePayload(value);
  if (!isRecord(payload)) throw new CorosMcpRpcError(null, 'COROS_MCP_RPC_RESPONSE_INVALID');
  const rpcError = readRecord(payload.error);
  if (rpcError) {
    const code = readNumberOrString(rpcError.code);
    const message = readString(rpcError.message) ?? 'COROS_MCP_RPC_ERROR';
    throw new CorosMcpRpcError(code, toMcpErrorCode(code, message));
  }
  const result = readRecord(payload.result);
  if (!result) throw new CorosMcpRpcError(null, 'COROS_MCP_RPC_RESULT_INVALID');
  if (result.isError === true) {
    const message = extractText(result.content) ?? 'COROS_MCP_TOOL_ERROR';
    throw new CorosMcpRpcError(null, `COROS_MCP_TOOL_ERROR_${normaliseErrorText(message)}`);
  }
  const structuredText = extractText(result.content);
  if (structuredText) {
    try {
      return JSON.parse(structuredText) as T;
    } catch {
      return result as T;
    }
  }
  return result as T;
}

function parseMcpResponsePayload(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const body = value.trim();
  if (!body) return value;

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return parseMcpSsePayload(body);
  }
}

function parseMcpSsePayload(body: string): unknown {
  const events = body.split(/\r?\n\r?\n/).reverse();
  for (const event of events) {
    const data = event
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice('data:'.length).trimStart())
      .join('\n')
      .trim();
    if (!data || data === '[DONE]') continue;
    try {
      return JSON.parse(data) as unknown;
    } catch {
      continue;
    }
  }
  return body;
}

function findTools(value: unknown): McpTool[] {
  const candidates: unknown[] = [];
  if (isRecord(value)) {
    candidates.push(value.tools);
    candidates.push(readRecord(value.result)?.tools);
    candidates.push(readRecord(value.result)?.result);
  }
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    return candidate.filter(isMcpTool);
  }
  return [];
}

function isMcpTool(value: unknown): value is McpTool {
  return isRecord(value) && typeof value.name === 'string' && value.name.trim().length > 0;
}

function extractText(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (!isRecord(item) || item.type !== 'text' || typeof item.text !== 'string') continue;
    if (item.text.trim()) return item.text.trim();
  }
  return null;
}

function readRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumberOrString(value: unknown): number | string | null {
  return typeof value === 'number' || typeof value === 'string' ? value : null;
}

function toMcpErrorCode(code: number | string | null, message: string): string {
  if (code === -32602) return 'COROS_MCP_RPC_ERROR_INVALID_ARGUMENTS';
  if (code === -32601) return 'COROS_MCP_RPC_ERROR_METHOD_NOT_FOUND';
  if (code === -32600) return 'COROS_MCP_RPC_ERROR_INVALID_REQUEST';
  return `COROS_MCP_RPC_ERROR_${normaliseErrorText(message)}`;
}

function normaliseErrorText(value: string): string {
  const normalised = value
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return normalised || 'UNKNOWN';
}
