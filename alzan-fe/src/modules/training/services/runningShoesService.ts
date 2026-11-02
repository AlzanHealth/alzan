import { supabase } from '../../../lib/supabaseClient';
import { RunningShoe, RunningShoeUpdate } from '../../../types/requests.types';

export type RunningShoeMileage = {
  total_distance_m: number;
  sessions_count: number;
};

export type RunningShoeWithMileage = RunningShoe & RunningShoeMileage;

export type RunningShoeInput = Pick<
  RunningShoe,
  'name' | 'brand' | 'model' | 'purchase_date' | 'in_use_since' | 'recommended_max_km'
> & { is_default: boolean; backfill_previous_runs: boolean };

export type RunningShoeUpdateInput = Pick<RunningShoe, 'name' | 'in_use_since'> &
  Partial<Pick<RunningShoeUpdate, 'brand' | 'model' | 'purchase_date' | 'recommended_max_km'>> & {
    backfill_previous_runs: boolean;
  };

export type CreateRunningShoeResult = {
  shoe_id: string;
  assigned_sessions: number;
};

export const getRunningShoes = async (userId: string): Promise<RunningShoeWithMileage[]> => {
  const [shoesResult, mileageResult] = await Promise.all([
    supabase
      .from('running_shoes')
      .select(
        'id, user_id, name, brand, model, purchase_date, in_use_since, recommended_max_km, is_default, created_at, updated_at',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase.rpc('get_running_shoe_mileage'),
  ]);

  if (shoesResult.error) throw new Error(shoesResult.error.message);
  if (mileageResult.error) throw new Error(mileageResult.error.message);

  const mileageByShoeId = new Map(
    (mileageResult.data ?? []).map(item => [
      item.shoe_id,
      {
        total_distance_m: item.total_distance_m,
        sessions_count: item.sessions_count,
      },
    ]),
  );

  return (shoesResult.data ?? []).map(shoe => ({
    ...shoe,
    ...(mileageByShoeId.get(shoe.id) ?? { total_distance_m: 0, sessions_count: 0 }),
  }));
};

export const createRunningShoe = async (input: RunningShoeInput): Promise<CreateRunningShoeResult> => {
  const { data, error } = await supabase.rpc('create_running_shoe_with_backfill', {
    p_name: input.name,
    p_in_use_since: input.in_use_since,
    p_brand: input.brand ?? undefined,
    p_model: input.model ?? undefined,
    p_purchase_date: input.purchase_date ?? undefined,
    p_recommended_max_km: input.recommended_max_km ?? undefined,
    p_is_default: input.is_default,
    p_backfill_previous_runs: input.backfill_previous_runs,
  });

  if (error) throw new Error(error.message);
  const result = data?.[0];
  if (!result) throw new Error('RUNNING_SHOE_CREATE_RESULT_MISSING');
  return result;
};

export const updateRunningShoe = async (shoeId: string, updates: RunningShoeUpdateInput): Promise<number> => {
  const { data, error } = await supabase.rpc('update_running_shoe_with_backfill', {
    p_shoe_id: shoeId,
    p_name: updates.name,
    p_in_use_since: updates.in_use_since,
    p_brand: updates.brand ?? undefined,
    p_model: updates.model ?? undefined,
    p_purchase_date: updates.purchase_date ?? undefined,
    p_recommended_max_km: updates.recommended_max_km ?? undefined,
    p_backfill_previous_runs: updates.backfill_previous_runs,
  });

  if (error) throw new Error(error.message);
  return data ?? 0;
};

export const setDefaultRunningShoe = async (shoeId: string, makeDefault: boolean): Promise<void> => {
  const { error } = await supabase.rpc('set_default_running_shoe', {
    p_shoe_id: shoeId,
    p_make_default: makeDefault,
  });

  if (error) throw new Error(error.message);
};
