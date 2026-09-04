export const COROS_CONNECTION_INFO = {
  dataFlow: 'COROS → Alzan',
  location: 'Ajustes → Integraciones → COROS',
  localCallback: 'http://localhost:1111/oauth/coros/mcp/callback',
  productionCallback: 'https://api.alzanhealth.com/oauth/coros/mcp/callback',
} as const;

export const getCorosConnectionInfo = () => COROS_CONNECTION_INFO;
