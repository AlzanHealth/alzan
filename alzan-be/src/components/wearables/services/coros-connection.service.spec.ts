import { strict as assert } from 'assert';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { CorosOAuthService } from '../../providers/oauth/coros-oauth.service';
import { encryptCorosToken } from '../../providers/oauth/coros-security';
import { CorosConnectionService } from './coros-connection.service';

const encryptionKey = Buffer.alloc(32, 7).toString('base64');
const encryptedToken = encryptCorosToken('access-token', encryptionKey);
let localDeletionCalled = false;

const query = {
  select: () => query,
  eq: () => query,
  maybeSingle: async () => ({ data: { id: 'connection-id', access_token: encryptedToken }, error: null }),
  insert: async () => ({ error: { message: 'queue unavailable' } }),
};

const client = {
  from: () => query,
  rpc: async () => {
    localDeletionCalled = true;
    return { error: null };
  },
};

const configService = {
  get: (key: string) => (key === 'COROS_TOKEN_ENCRYPTION_KEY_V1' ? encryptionKey : undefined),
};
const supabaseAdminService = { client };
const corosOAuthService = {
  deregisterUser: async () => {
    throw new Error('COROS unavailable');
  },
};

const service = new CorosConnectionService(
  configService as unknown as ConfigService,
  supabaseAdminService as unknown as SupabaseAdminService,
  corosOAuthService as unknown as CorosOAuthService,
);

async function run(): Promise<void> {
  await assert.rejects(service.disconnect('user-id'), /COROS_DEAUTHORIZATION_RETRY_ENQUEUE_FAILED/);
  assert.equal(localDeletionCalled, false);
}

void run();
