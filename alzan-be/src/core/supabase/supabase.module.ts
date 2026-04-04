import { Global, Module } from '@nestjs/common';
import { SupabaseAdminService } from './supabase.service';

@Global()
@Module({
  providers: [SupabaseAdminService],
  exports: [SupabaseAdminService],
})
export class SupabaseModule {}
