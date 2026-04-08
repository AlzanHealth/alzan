import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from './database.types';

// Helper to extract Row type for a specific table
// We use a conditional type to handle cases where the table might be missing from the generated types
export type Row<T extends string> = T extends keyof Database['public']['Tables']
  ? Database['public']['Tables'][T]['Row']
  : unknown;

// Helper to extract Insert type for a specific table
export type Insert<T extends string> = T extends keyof Database['public']['Tables']
  ? Database['public']['Tables'][T]['Insert']
  : unknown;

// Helper to extract Update type for a specific table
export type Update<T extends string> = T extends keyof Database['public']['Tables']
  ? Database['public']['Tables'][T]['Update']
  : unknown;

export type DbClient = SupabaseClient<Database>;

export type Enum<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];

export type UserRow = Row<'users'>;

export type NotificationType = Enum<'notification_type'>;
