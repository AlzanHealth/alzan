import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { NotificationModule } from './notification/notification.module';
import { ProvidersModule } from './providers/providers.module';
import { ActivityImportModule } from './activity-import/activity-import.module';

@Module({
  imports: [UserModule, NotificationModule, ProvidersModule, ActivityImportModule],
  exports: [UserModule],
})
export class ComponentsModule {}
