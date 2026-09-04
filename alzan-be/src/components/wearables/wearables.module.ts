import { Module } from '@nestjs/common';
import { Api } from '../../core/swagger/swagger-api.decorator';
import { SwaggerApi } from '../../core/swagger/swagger-api.enum';
import { SupabaseModule } from '../../core/supabase/supabase.module';
import { ProvidersModule } from '../providers/providers.module';
import { CorosWebhookController } from './controllers/coros-webhook.controller';
import { CorosConnectionController } from './controllers/coros-connection.controller';
import { CloudProviderSyncController } from './controllers/cloud-provider-sync.controller';
import { ImportReviewController } from './controllers/import-review.controller';
import { LocalHealthSyncController } from './controllers/local-health-sync.controller';
import { CanonicalActivityWriterService } from './services/canonical-activity-writer.service';
import { CanonicalHealthWriterService } from './services/canonical-health-writer.service';
import { DedupeService } from './services/dedupe.service';
import { ImportReconciliationService } from './services/import-reconciliation.service';
import { ImportReviewService } from './services/import-review.service';
import { IntegrationSyncStateService } from './services/integration-sync-state.service';
import { LocalHealthSyncService } from './services/local-health-sync.service';
import { PolarAccessLinkService } from './services/polar-access-link.service';
import { ProviderOriginService } from './services/provider-origin.service';
import { RawPayloadService } from './services/raw-payload.service';
import { SuuntoCloudSyncService } from './services/suunto-cloud-sync.service';
import { CorosCloudSyncService } from './services/coros-cloud-sync.service';
import { CorosWebhookService } from './services/coros-webhook.service';
import { CorosConnectionService } from './services/coros-connection.service';
import { CorosMcpSyncService } from './services/coros-mcp-sync.service';
import { WearableImportLifecycleService } from './services/wearable-import-lifecycle.service';

@Api(SwaggerApi.WEARABLES_API)
@Module({
  imports: [SupabaseModule, ProvidersModule],
  controllers: [
    LocalHealthSyncController,
    CloudProviderSyncController,
    ImportReviewController,
    CorosWebhookController,
    CorosConnectionController,
  ],
  providers: [
    RawPayloadService,
    ProviderOriginService,
    IntegrationSyncStateService,
    DedupeService,
    ImportReconciliationService,
    ImportReviewService,
    CanonicalActivityWriterService,
    CanonicalHealthWriterService,
    LocalHealthSyncService,
    PolarAccessLinkService,
    WearableImportLifecycleService,
    SuuntoCloudSyncService,
    CorosCloudSyncService,
    CorosWebhookService,
    CorosConnectionService,
    CorosMcpSyncService,
  ],
  exports: [
    RawPayloadService,
    ProviderOriginService,
    IntegrationSyncStateService,
    CanonicalActivityWriterService,
    CanonicalHealthWriterService,
  ],
})
export class WearablesModule {}
