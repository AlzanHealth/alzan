import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { Api } from '../../core/swagger/swagger-api.decorator';
import { SwaggerApi } from '../../core/swagger/swagger-api.enum';
import { NotificationService } from './notification/notification.service';

@Api(SwaggerApi.USER_API)
@Module({
  providers: [UserService, NotificationService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
