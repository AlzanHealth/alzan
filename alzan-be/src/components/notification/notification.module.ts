import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { Api } from '../../core/swagger/swagger-api.decorator';
import { SwaggerApi } from '../../core/swagger/swagger-api.enum';

@Api(SwaggerApi.NOTIFICATION_API)
@Module({
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
