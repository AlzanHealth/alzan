import { Module } from '@nestjs/common';
import { Api } from '../../core/swagger/swagger-api.decorator';
import { SwaggerApi } from '../../core/swagger/swagger-api.enum';
import { ActivityImportController } from './activity-import.controller';
import { ActivityImportService } from './activity-import.service';

@Api(SwaggerApi.ACTIVITY_IMPORT_API)
@Module({
  controllers: [ActivityImportController],
  providers: [ActivityImportService],
})
export class ActivityImportModule {}
