import { supabase } from '../../lib/supabaseClient';
import { wearablesLocalHealthApi } from '../../modules/wearables';
import { revokeWearableConnectionsBeforeAccountDeletion } from './accountDeletion.helper';

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const maybeMessage = error['message'];
    if (typeof maybeMessage === 'string' && maybeMessage.length > 0) {
      return maybeMessage;
    }
  }

  return fallback;
};

export const deleteUserAccount = async () => {
  console.log('[gdpr.deleteUserAccount] Iniciando eliminación de cuenta');

  // 1. Verificar sesión local
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('No hay usuario autenticado');
  }

  try {
    // Do not delete the account until COROS has either revoked the token or
    // durably persisted a retry job. Otherwise the authorization can be left
    // active after its only usable credential has disappeared.
    await revokeWearableConnectionsBeforeAccountDeletion(() => wearablesLocalHealthApi.disconnectCoros());

    // 2. Intentar vía RPC (fuente principal de borrado total)
    const { error: rpcError } = await supabase.rpc('delete_user_account');
    if (!rpcError) {
      console.log('[gdpr.deleteUserAccount] Éxito con RPC delete_user_account');
      return true;
    }

    console.warn('[gdpr.deleteUserAccount] RPC falló, intentando Edge Function:', rpcError);

    // 3. Fallback: Edge Function
    const { data, error: functionError } = await supabase.functions.invoke<{ ok?: boolean; message?: string }>(
      'delete-user',
      {
        method: 'POST',
      },
    );

    if (functionError) {
      console.error('[gdpr.deleteUserAccount] Error en fallback Edge Function:', functionError);
      const rpcMessage = getErrorMessage(rpcError, 'RPC delete_user_account failed');
      const functionMessage = getErrorMessage(functionError, 'Edge Function delete-user failed');
      throw new Error(`${rpcMessage} | ${functionMessage}`);
    }

    if (data && data.ok === false) {
      throw new Error(data.message || 'La Edge Function no confirmó la eliminación de cuenta.');
    }

    console.log('[gdpr.deleteUserAccount] Éxito con Edge Function fallback');
    return true;
  } catch (err: unknown) {
    console.error('[gdpr.deleteUserAccount] Exception:', err);
    throw err;
  }
};
