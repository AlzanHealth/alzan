import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { Database, DbClient } from '../../types/database.types';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private supabase!: DbClient;

  constructor(private readonly configService: ConfigService) {}

  public get client() {
    return this.supabase;
  }

  onModuleInit() {
    const supabaseUrl = this.configService.get<string>('supabase.supabaseUrl');
    const supabaseServiceRoleKey = this.configService.get<string>('supabase.supabaseServiceRoleKey');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Supabase URL or Service Role Key is missing in configuration');
    }

    this.supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
}
