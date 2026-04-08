import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PublicAuth } from './core/guards/auth.decorator';
import { AppOutputDto } from './common/dto/app.output-dto';

@Controller()
@PublicAuth()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Returns the application information
   */
  @Get()
  getHealth(): AppOutputDto {
    return this.appService.getHealth();
  }
}
