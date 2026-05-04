/** @type {import('@hey-api/openapi-ts').UserConfig & import('scripts/fetch-openapi').Config} */
export default {
  client: '@hey-api/client-fetch',
  input: 'src/openapi/alzan-be.json',
  output: 'src/openapi/generated/alzan-be',
  plugins: [
    '@hey-api/typescript',
    '@hey-api/schemas',
    {
      name: '@hey-api/sdk',
      asClass: true,
    },
    {
      name: '@tanstack/react-query',
      queryOptions: true,
    },
  ],

  // fetch from localhost in local development
  fetchers: [
    {
      input: 'http://localhost:1111/openapi-json',
      output: 'src/openapi/alzan-be.json',
    },
  ],
};
