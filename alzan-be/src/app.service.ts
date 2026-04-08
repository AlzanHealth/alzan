import { Inject, Injectable } from '@nestjs/common';
import serverConfig from './config/server.config';
import { ConfigType } from '@nestjs/config';
import { AppOutputDto } from './common/dto/app.output-dto';

@Injectable()
export class AppService {
  constructor(
    @Inject(serverConfig.KEY)
    private readonly serverConfiguration: ConfigType<typeof serverConfig>,
  ) {}

  getHealth(): AppOutputDto {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: this.serverConfiguration.environment!,
      baseUrl: this.serverConfiguration.baseUrl!,
    };
  }
}
