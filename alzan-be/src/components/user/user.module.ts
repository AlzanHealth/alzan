import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { Api } from '../../core/swagger/swagger-api.decorator';
import { SwaggerApi } from '../../core/swagger/swagger-api.enum';
import { NotificationController } from './notifications/notification.controller';
import { NotificationService } from './notifications/notification.service';

@Api(SwaggerApi.USER_API)
@Module({
  providers: [UserService, NotificationService],
  controllers: [UserController, NotificationController],
  exports: [UserService, NotificationService],
})
export class UserModule {}
