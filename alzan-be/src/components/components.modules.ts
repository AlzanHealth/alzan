import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { NotificationModule } from './notification/notification.module';
import { ProvidersModule } from './providers/providers.module';

@Module({
  imports: [UserModule, NotificationModule, ProvidersModule],
  exports: [UserModule],
})
export class ComponentsModule {}
