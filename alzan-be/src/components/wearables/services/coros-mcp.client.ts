import axios from 'axios';
import { CorosMcpRpcError, parseMcpToolResult } from './coros-mcp.protocol';

export type CorosMcpRequestInit = {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
};

export type CorosMcpHttpResponse = {
  status: number;
  headers?: Record<string, string | undefined>;
  json: () => Promise<unknown>;
};

export type CorosMcpHttpClient = (url: string, init: CorosMcpRequestInit) => Promise<CorosMcpHttpResponse>;

export type CorosMcpFileResponse = {
  status: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type CorosMcpFileClient = (url: string, headers: Record<string, string>) => Promise<CorosMcpFileResponse>;

export type CorosMcpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

type JsonRecord = Record<string, unknown>;

const STATELESS_PROTOCOL_VERSION = '2026-07-28';
const LEGACY_PROTOCOL_VERSION = '2025-06-18';
const MAX_FIT_BYTES = 25 * 1024 * 1024;
const STATELESS_UNSUPPORTED_RPC_CODES = new Set([-32020, -32021, -32022]);

export class CorosMcpClient {
  private nextRequestId = 1;
  private transport: 'stateless' | 'legacy' = 'stateless';
  private initialized = false;
  private protocolVersion = LEGACY_PROTOCOL_VERSION;
  private sessionId: string | null = null;

  public constructor(
    private readonly accessToken: string,
    private readonly endpoint: string,
    private readonly httpClient: CorosMcpHttpClient = defaultHttpClient,
    private readonly fileClient: CorosMcpFileClient = defaultFileClient,
  ) {}

  public async listTools(): Promise<CorosMcpTool[]> {
    const result = await this.requestWithTransport<{ tools?: unknown[] }>('tools/list', {});
    if (!Array.isArray(result.tools)) return [];
    return result.tools.filter(isCorosMcpTool);
  }

  public async callTool<T>(name: string, argumentsValue: Record<string, unknown>): Promise<T> {
    const result = await this.requestWithTransport<T>('tools/call', { name, arguments: argumentsValue });
    return result;
  }

  public async downloadFitFile(url: string): Promise<Uint8Array> {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:' || !isCorosHostedUrl(parsedUrl.hostname, new URL(this.endpoint).hostname)) {
      throw new CorosMcpRpcError(null, 'COROS_MCP_FIT_URL_UNTRUSTED');
    }
    const response = await this.fileClient(url, {
      Accept: 'application/octet-stream, application/fit, */*',
      Authorization: `Bearer ${this.accessToken}`,
    });
    if (response.status === 401 || response.status === 403) {
      throw new CorosMcpRpcError(`HTTP_${response.status}`, 'COROS_MCP_ACCESS_TOKEN_REJECTED');
    }
    if (response.status < 200 || response.status >= 300) {
      throw new CorosMcpRpcError(`HTTP_${response.status}`, `COROS_MCP_FIT_DOWNLOAD_FAILED_${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_FIT_BYTES) {
      throw new CorosMcpRpcError(null, 'COROS_MCP_FIT_FILE_TOO_LARGE');
    }
    if (bytes.length === 0) throw new CorosMcpRpcError(null, 'COROS_MCP_FIT_DOWNLOAD_EMPTY');
    return bytes;
  }

  private async requestWithTransport<T>(method: string, params: JsonRecord): Promise<T> {
    if (this.transport === 'legacy') return this.requestLegacy<T>(method, params);
    try {
      return await this.requestStateless<T>(method, params);
    } catch (error) {
      if (!this.isStatelessUnsupported(error)) throw error;
      this.transport = 'legacy';
      this.initialized = false;
      this.sessionId = null;
      return this.requestLegacy<T>(method, params);
    }
  }

  private async requestStateless<T>(method: string, params: JsonRecord): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': STATELESS_PROTOCOL_VERSION,
      'Mcp-Method': method,
    };
    if (method === 'tools/call' && typeof params.name === 'string') headers['Mcp-Name'] = params.name;
    const response = await this.httpClient(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextRequestId++,
        method,
        params: this.withClientMetadata(params),
      }),
    });
    this.assertHttpResponse(response);
    return parseMcpToolResult<T>(await response.json());
  }

  private async requestLegacy<T>(method: string, params: JsonRecord): Promise<T> {
    await this.initializeLegacy();
    let response = await this.sendLegacyRequest(method, params);
    if (response.status === 404 && this.sessionId) {
      this.initialized = false;
      this.sessionId = null;
      await this.initializeLegacy();
      response = await this.sendLegacyRequest(method, params);
    }
    this.assertHttpResponse(response);
    return parseMcpToolResult<T>(await response.json());
  }

  private async initializeLegacy(): Promise<void> {
    if (this.initialized) return;
    this.protocolVersion = LEGACY_PROTOCOL_VERSION;
    const response = await this.httpClient(this.endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextRequestId++,
        method: 'initialize',
        params: {
          protocolVersion: LEGACY_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'Alzan', version: '1.0.0' },
        },
      }),
    });
    this.assertHttpResponse(response);
    const result = await parseMcpToolResult<{ protocolVersion?: unknown }>(await response.json());
    if (typeof result.protocolVersion === 'string' && result.protocolVersion.trim()) {
      this.protocolVersion = result.protocolVersion.trim();
    }
    this.sessionId = this.readHeader(response, 'Mcp-Session-Id');
    await this.notifyLegacy();
    this.initialized = true;
  }

  private async notifyLegacy(): Promise<void> {
    const response = await this.httpClient(this.endpoint, {
      method: 'POST',
      headers: this.legacyHeaders(),
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    this.assertHttpResponse(response);
  }

  private async sendLegacyRequest(method: string, params: JsonRecord): Promise<CorosMcpHttpResponse> {
    return this.httpClient(this.endpoint, {
      method: 'POST',
      headers: this.legacyHeaders(),
      body: JSON.stringify({ jsonrpc: '2.0', id: this.nextRequestId++, method, params }),
    });
  }

  private legacyHeaders(): Record<string, string> {
    return {
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': this.protocolVersion,
      ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
    };
  }

  private withClientMetadata(params: JsonRecord): JsonRecord {
    const existingMeta = isRecord(params._meta) ? params._meta : {};
    return {
      ...params,
      _meta: {
        ...existingMeta,
        'io.modelcontextprotocol/clientInfo': { name: 'Alzan', version: '1.0.0' },
      },
    };
  }

  private assertHttpResponse(response: CorosMcpHttpResponse): void {
    if (response.status === 401 || response.status === 403) {
      throw new CorosMcpRpcError(`HTTP_${response.status}`, 'COROS_MCP_ACCESS_TOKEN_REJECTED');
    }
    if (response.status < 200 || response.status >= 300) {
      throw new CorosMcpRpcError(`HTTP_${response.status}`, `COROS_MCP_HTTP_ERROR_${response.status}`);
    }
  }

  private isStatelessUnsupported(error: unknown): boolean {
    if (!(error instanceof CorosMcpRpcError)) return false;
    if (typeof error.rpcCode === 'number') return STATELESS_UNSUPPORTED_RPC_CODES.has(error.rpcCode);
    return error.rpcCode === 'HTTP_400' || error.rpcCode === 'HTTP_404' || error.rpcCode === 'HTTP_405';
  }

  private readHeader(response: CorosMcpHttpResponse, name: string): string | null {
    const entry = Object.entries(response.headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
    return entry?.[1]?.trim() || null;
  }
}

function isCorosMcpTool(value: unknown): value is CorosMcpTool {
  return isRecord(value) && typeof value.name === 'string';
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const defaultHttpClient: CorosMcpHttpClient = async (url, init) => {
  const response = await axios.post<unknown>(url, init.body, {
    headers: init.headers,
    timeout: 30_000,
    validateStatus: () => true,
  });
  return {
    status: response.status,
    headers: Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, String(value)])),
    json: async () => response.data,
  };
};

const defaultFileClient: CorosMcpFileClient = async (url, headers) => {
  const response = await axios.get<ArrayBuffer>(url, {
    headers,
    responseType: 'arraybuffer',
    timeout: 30_000,
    maxContentLength: MAX_FIT_BYTES,
    maxBodyLength: MAX_FIT_BYTES,
    validateStatus: () => true,
  });
  return {
    status: response.status,
    arrayBuffer: async () => response.data,
  };
};

function isCorosHostedUrl(hostname: string, endpointHostname: string): boolean {
  const normalised = hostname.toLowerCase().replace(/\.$/, '');
  const endpoint = endpointHostname.toLowerCase().replace(/\.$/, '');
  return (
    normalised === endpoint ||
    normalised === 'coros.com' ||
    normalised.endsWith('.coros.com') ||
    normalised === 'coros.cn' ||
    normalised.endsWith('.coros.cn')
  );
}
