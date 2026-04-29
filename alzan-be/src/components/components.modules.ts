import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { NotificationModule } from './notification/notification.module';

@Module({
  imports: [UserModule, NotificationModule],
  exports: [UserModule],
})
export class ComponentsModule {}
