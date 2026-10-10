import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bodyParser from 'body-parser';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ConfigNamespace, NodeEnvironment } from './common/enum/config.enum';
import { setupSwagger } from './core/swagger/setup-swagger';
import serverConfig from './config/server.config';
import { corosJsonMiddleware } from './components/wearables/coros-json.middleware';

const logger = new Logger('main');
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.enableShutdownHooks();

  app.useLogger(app.get(PinoLogger));

  app.use(helmet());
  app.use('/webhooks/coros/workouts', bodyParser.text({ type: 'application/json', limit: '2mb' }), corosJsonMiddleware);
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: false }));

  const configService = app.get(ConfigService);

  const serverConfiguration = configService.get<ReturnType<typeof serverConfig>>(ConfigNamespace.SERVER);
  const { cors, environment, port, baseUrl } = serverConfiguration!;

  app.enableCors(cors);

  if (environment === NodeEnvironment.LOCAL) {
    setupSwagger(app);
  }

  await app.listen(port);
  logger.log(`Server is running on: ${baseUrl}`);
}
bootstrap()
  .then()
  .catch(err => {
    logger.error('Error while bootstrapping the app', err);
  });
