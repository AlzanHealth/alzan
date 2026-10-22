import { useQueryClient } from '@tanstack/react-query';
import { bodyCompositionService } from '../../modules/health/services/bodyCompositionService';
import { healthQueryKeys } from '../../modules/health/hooks/healthQueryKeys';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Alert } from '../../components/common/Alert';
import { useAuth } from '../../context/AuthContext';
import { Nullable } from '../../types/common.types';
import { PaceUnit, Sex } from '../../types/requests.types';
import { WeightUnit } from '../../types/requests.types';
import { DistanceUnit } from '../../types/requests.types';
import { EnergyUnit } from '../../types/requests.types';
import { useTranslation } from 'react-i18next';

export interface SettingsProfile {
  // Profile
  id: string;
  avatar_url: string | null;
  display_name: string | null;
  username: string | null;
  email: string;

  // Personal data
  date_of_birth: string | null;
  sex: Nullable<Sex>;
  height_cm: number | null;
  created_at: string;

  // Units
  weight_unit: WeightUnit;
  distance_unit: DistanceUnit;
  energy_unit: EnergyUnit;
  pace_unit: PaceUnit;
  temperature_unit: 'celsius' | 'fahrenheit';
}

export const useSettingsProfile = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [profile, setProfile] = useState<SettingsProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      if (!user) {
        setProfile(null);
        return;
      }

      setLoading(true);

      // Fetch user data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, display_name, username, date_of_birth, sex, height_cm, avatar_url, created_at')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      // Fetch preferences
      const { data: prefsData, error: prefsError } = await supabase
        .from('user_preferences')
        .select('weight_unit, distance_unit, energy_unit, pace_unit, temperature_unit')
        .eq('user_id', user.id)
        .maybeSingle();

      if (prefsError) {
        console.log('No preferences found:', prefsError);
      }

      setProfile({
        id: userData.id,
        avatar_url: userData.avatar_url,
        display_name: userData.display_name,
        username: userData.username,
        email: user.email || '',
        date_of_birth: userData.date_of_birth,
        sex: userData.sex,
        height_cm: userData.height_cm,
        created_at: userData.created_at,
        weight_unit: prefsData?.weight_unit || 'kg',
        distance_unit: prefsData?.distance_unit || 'km',
        energy_unit: prefsData?.energy_unit || 'kcal',
        pace_unit: prefsData?.pace_unit || 'min_km',
        temperature_unit: prefsData?.temperature_unit || 'celsius',
      } as SettingsProfile);
    } catch (err: unknown) {
      console.error('Error fetching settings profile:', err);
      Alert.alert(t('common.error'), t('settings.profileLoadError'));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const updateProfile = async (updates: Partial<SettingsProfile>) => {
    try {
      setUpdating(true);
      if (!user) throw new Error('No authenticated user');

      // 1. User Updates (POJO)
      const userUpdates = {
        display_name: updates.display_name,
        username: updates.username,
        date_of_birth: updates.date_of_birth,
        sex: updates.sex,
        height_cm: updates.height_cm,
        avatar_url: updates.avatar_url,
      };

      // 2. Preference Updates (POJO)
      const prefUpdates = {
        weight_unit: updates.weight_unit,
        distance_unit: updates.distance_unit,
        energy_unit: updates.energy_unit,
        pace_unit: updates.pace_unit,
        temperature_unit: updates.temperature_unit,
      };

      // Execute updates (always calling endpoints as requested)
      // Note: supabase-js ignores undefined values in the body.
      const { error: userError } = await supabase.from('users').update(userUpdates).eq('id', user.id);
      if (userError) throw userError;

      const { error: prefError } = await supabase.from('user_preferences').upsert(
        {
          user_id: user.id,
          ...prefUpdates,
        },
        { onConflict: 'user_id' },
      );
      if (prefError) throw prefError;

      if ('height_cm' in updates || 'sex' in updates || 'date_of_birth' in updates) {
        void bodyCompositionService
          .refreshSnapshots(user.id)
          .then(() => queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user.id) }))
          .catch(error => console.error('[Profile] Background composition refresh failed', error));
        void queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user.id) });
        void queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      }
      await fetchProfile();
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error updating profile:', err);
      Alert.alert(t('common.error'), `${t('settings.profileUpdateError')} ${message}`);
      return false;
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [fetchProfile, user]);

  return {
    profile,
    loading,
    updating,
    updateProfile,
    refetch: fetchProfile,
  };
};
