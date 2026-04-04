import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { NotificationModule } from './notifications/notification.module';

@Module({
  imports: [UserModule, NotificationModule],
})
export class ComponentsModule {}
