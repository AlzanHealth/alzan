import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { Api } from '../../core/swagger/swagger-api.decorator';
import { SwaggerApi } from '../../core/swagger/swagger-api.enum';
import { NotificationModule } from '../notification/notification.module';

@Api(SwaggerApi.USER_API)
@Module({
  imports: [NotificationModule],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
