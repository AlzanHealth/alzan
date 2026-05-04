import { SwaggerApi } from './swagger-api.enum';

export interface ISwaggerConfiguration {
  endpoint: string;
  title: string;
  description: string;
}

export const SWAGGER_CONFIGURATIONS: Record<SwaggerApi, ISwaggerConfiguration> = {
  [SwaggerApi.USER_API]: {
    endpoint: 'api',
    title: 'Alzan API',
    description: 'Alzan Backend API',
  },

  [SwaggerApi.NOTIFICATION_API]: {
    endpoint: 'notification',
    title: 'Notification API',
    description: 'Notification API',
  },
  [SwaggerApi.PROVIDERS_API]: {
    endpoint: 'providers',
    title: 'Providers API',
    description: 'Providers API',
  },
  [SwaggerApi.ALL_API]: {
    endpoint: 'openapi',
    title: 'Alzan Full API',
    description: 'Unified API for frontend generation',
  },
};

export const getSwaggerConfig = (apiType: SwaggerApi): ISwaggerConfiguration => {
  return SWAGGER_CONFIGURATIONS[apiType];
};
