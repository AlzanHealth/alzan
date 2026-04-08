import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { DbClient } from '../database/supabase.client';
import { Database } from '../../types/requests.types';

@Injectable()
export class SupabaseAdminService implements OnModuleInit {
  private adminClient!: DbClient;
  private supabaseUrl!: string;
  private supabaseAnonKey!: string;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Returns the service-role admin client.
   * Use ONLY for operations that must bypass RLS (e.g. JWT validation in the auth guard).
   */
  public get client() {
    return this.adminClient;
  }

  /**
   * Creates a lightweight per-request Supabase client scoped to the
   * authenticated user's JWT. All DB queries will run under RLS with
   * `auth.uid()` equal to the token's `sub` claim.
   *
   * @param token - The raw Bearer JWT from the Authorization header.
   */
  public getAuthenticatedClient(token: string): DbClient {
    return createClient<Database>(this.supabaseUrl, this.supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  onModuleInit() {
    const supabaseUrl = this.configService.get<string>('supabase.supabaseUrl');
    const supabaseServiceRoleKey = this.configService.get<string>('supabase.supabaseServiceRoleKey');
    const supabaseAnonKey = this.configService.get<string>('supabase.supabaseAnonKey');

    if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseAnonKey) {
      throw new Error('Supabase URL, Service Role Key, or Anon Key is missing in configuration');
    }

    this.supabaseUrl = supabaseUrl;
    this.supabaseAnonKey = supabaseAnonKey;

    this.adminClient = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
}
