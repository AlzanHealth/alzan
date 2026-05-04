import { INestApplication, Type } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { SwaggerApi } from './swagger-api.enum';
import { SWAGGER_METADATA_KEY } from './swagger-api.decorator';
import { getSwaggerConfig } from './swagger-config';

export const SWAGGER_BEARER_AUTH = 'bearer-auth';

function getModulesForApi(app: INestApplication, apiType: SwaggerApi): Type<unknown>[] {
  const modules = app.get(ModulesContainer);
  return Array.from(modules.values())
    .filter(module => {
      const apiTypesForModule: SwaggerApi[] | undefined = Reflect.getMetadata(SWAGGER_METADATA_KEY, module.metatype) as
        | SwaggerApi[]
        | undefined;

      if (apiType === SwaggerApi.ALL_API) {
        return !!apiTypesForModule && apiTypesForModule.length > 0;
      }

      return (apiTypesForModule ?? []).includes(apiType);
    })
    .map(module => module.metatype);
}

export function setupSwagger(app: INestApplication): void {
  const apiTypes = Object.values(SwaggerApi);

  apiTypes.forEach(apiType => {
    const config = getSwaggerConfig(apiType);

    const options = new DocumentBuilder()
      .setTitle(config.title)
      .setDescription(config.description)
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter a valid Supabase user token',
        },
        SWAGGER_BEARER_AUTH,
      )
      .addSecurityRequirements(SWAGGER_BEARER_AUTH)
      .addTag('Alzan api')
      .build();

    const modules = getModulesForApi(app, apiType);
    const document = SwaggerModule.createDocument(app, options, {
      include: modules,
      operationIdFactory: (_controllerKey, methodKey) => methodKey,
    });

    SwaggerModule.setup(config.endpoint, app, document);
  });
}
