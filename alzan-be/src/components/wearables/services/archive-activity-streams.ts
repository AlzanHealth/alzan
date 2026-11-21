import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { Database } from '../../../types/requests.types';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { ActivityStreamArchiveService } from './activity-stream-archive.service';

config({ path: resolve(__dirname, '../../../../.env') });

type Arguments = {
  apply: boolean;
  allowRemote: boolean;
  confirmDelete: boolean;
  before: Date | undefined;
  projectRef: string | undefined;
};

const parseArguments = (args: string[]): Arguments => {
  const allowedFlags = new Set(['--apply', '--allow-remote', '--confirm-delete', '--before', '--project-ref']);
  for (const argument of args) {
    if (argument.startsWith('--') && !allowedFlags.has(argument)) {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  const beforeIndex = args.indexOf('--before');
  const beforeValue = beforeIndex >= 0 ? args[beforeIndex + 1] : undefined;
  if (beforeIndex >= 0 && (!beforeValue || beforeValue.startsWith('--'))) {
    throw new Error('--before requires a date such as 2026-08-01');
  }
  const before = beforeValue ? new Date(beforeValue) : undefined;
  if (before && !Number.isFinite(before.getTime())) throw new Error('--before must be a valid date');

  const projectRefIndex = args.indexOf('--project-ref');
  const projectRef = projectRefIndex >= 0 ? args[projectRefIndex + 1] : undefined;
  if (projectRefIndex >= 0 && (!projectRef || projectRef.startsWith('--'))) {
    throw new Error('--project-ref requires a Supabase project reference');
  }

  return {
    apply: args.includes('--apply'),
    allowRemote: args.includes('--allow-remote'),
    confirmDelete: args.includes('--confirm-delete'),
    before,
    projectRef,
  };
};

const isLocalSupabaseUrl = (url: URL): boolean =>
  ['127.0.0.1', 'localhost', '::1'].includes(url.hostname) || url.hostname.endsWith('.localhost');

const assertMutationTarget = (supabaseUrl: URL, args: Arguments): void => {
  if (!args.apply) return;
  if (!args.confirmDelete) throw new Error('Apply mode requires --confirm-delete');
  if (isLocalSupabaseUrl(supabaseUrl)) return;
  const actualProjectRef = supabaseUrl.hostname.split('.')[0];
  if (!args.allowRemote || !args.projectRef || args.projectRef !== actualProjectRef) {
    throw new Error('Remote apply requires --allow-remote and the matching --project-ref');
  }
};

const run = async (): Promise<void> => {
  const args = parseArguments(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

  const targetUrl = new URL(supabaseUrl);
  assertMutationTarget(targetUrl, args);
  const client = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const archiveService = new ActivityStreamArchiveService({ client } as unknown as SupabaseAdminService);
  const summary = args.apply
    ? await archiveService.archiveBefore(args.before)
    : await archiveService.previewBefore(args.before);

  console.log(args.apply ? 'Archive applied:' : 'Read-only archive preview:');
  console.log(JSON.stringify({ target: targetUrl.hostname, ...summary }, null, 2));
  if (!args.apply) {
    console.log('No database rows or storage objects were changed.');
  }
};

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected archive operation failure';
  console.error(`Activity stream archive stopped: ${message}`);
  process.exitCode = 1;
});
