import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { NotificationModule } from './notification/notification.module';
import { ProvidersModule } from './providers/providers.module';
import { ActivityImportModule } from './activity-import/activity-import.module';
import { WearablesModule } from './wearables/wearables.module';

@Module({
  imports: [UserModule, NotificationModule, ProvidersModule, ActivityImportModule, WearablesModule],
  exports: [UserModule],
})
export class ComponentsModule {}
