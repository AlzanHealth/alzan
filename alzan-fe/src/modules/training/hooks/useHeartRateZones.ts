import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../context/AuthContext';
import { useUserProfile } from '../../../hooks/useUserProfile';
import {
  calculateZonesFromMaxHeartRate,
  calculateHeartRateZones,
  calculateHeartRateZonesFromReserve,
  calculateRestingHeartRateBaseline,
  analyzeRecentHeartRateSessions,
  getAgeOnDate,
  parseHeartRateZoneProfile,
  type HeartRateZoneProfile,
  type HeartRateTrainingEvidence,
} from '../helpers/heartRateZones.helper';

const createProfile = (
  maxHeartRate: number,
  zones: HeartRateZoneProfile['zones'],
  method: HeartRateZoneProfile['method'],
  source: HeartRateZoneProfile['source'],
  restingHeartRate?: number,
  restingHeartRateSampleCount?: number,
): HeartRateZoneProfile => ({
  maxHeartRate,
  zones,
  method,
  source,
  ...(restingHeartRate === undefined ? {} : { restingHeartRate }),
  ...(restingHeartRateSampleCount === undefined ? {} : { restingHeartRateSampleCount }),
  updatedAt: new Date().toISOString(),
});

export const useHeartRateZones = () => {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useUserProfile();
  const [zoneProfile, setZoneProfile] = useState<HeartRateZoneProfile | null>(null);
  const [restingHeartRate, setRestingHeartRate] = useState<number | null>(null);
  const [latestRestingHeartRate, setLatestRestingHeartRate] = useState<number | null>(null);
  const [restingHeartRateSamples, setRestingHeartRateSamples] = useState(0);
  const [peakHeartRate, setPeakHeartRate] = useState<number | null>(null);
  const [trainingEvidence, setTrainingEvidence] = useState<HeartRateTrainingEvidence>({
    sessionCount: 0,
    observedPeak: null,
    repeatablePeak: null,
    qualifiesForReview: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setZoneProfile(null);
      setRestingHeartRate(null);
      setLatestRestingHeartRate(null);
      setRestingHeartRateSamples(0);
      setPeakHeartRate(null);
      setTrainingEvidence({ sessionCount: 0, observedPeak: null, repeatablePeak: null, qualifiesForReview: false });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [settingsResult, restingResult, sessionsResult] = await Promise.all([
        supabase.from('user_preferences').select('training_settings').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('resting_hr_logs')
          .select('resting_hr_bpm')
          .eq('user_id', user.id)
          .gte('measured_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
          .order('measured_at', { ascending: false })
          .limit(7),
        supabase
          .from('activity_sessions')
          .select('id, max_heart_rate, start_time, duration_s')
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .not('end_time', 'is', null)
          .gte('start_time', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
          .order('start_time', { ascending: false })
          .limit(100),
      ]);
      if (settingsResult.error) throw settingsResult.error;
      const settings = settingsResult.data?.training_settings;
      if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
        const parsed = parseHeartRateZoneProfile((settings as Record<string, unknown>).heart_rate_zones);
        setZoneProfile(parsed);
      } else {
        setZoneProfile(null);
      }
      const readings = restingResult.error ? [] : (restingResult.data ?? []).map(reading => reading.resting_hr_bpm);
      const validReadings = readings.filter(value => Number.isInteger(value) && value >= 30 && value <= 150);
      const restingBaseline = calculateRestingHeartRateBaseline(validReadings);
      setRestingHeartRate(restingBaseline?.bpm ?? null);
      setRestingHeartRateSamples(restingBaseline?.sampleCount ?? 0);
      setLatestRestingHeartRate(validReadings[0] ?? null);
      if (sessionsResult.error) {
        setPeakHeartRate(null);
        setTrainingEvidence({ sessionCount: 0, observedPeak: null, repeatablePeak: null, qualifiesForReview: false });
      } else {
        const recentSessions = sessionsResult.data ?? [];
        const currentAge = getAgeOnDate(profile?.date_of_birth, new Date());
        const referenceMaximum =
          zoneProfile?.maxHeartRate ??
          (currentAge === null ? null : (calculateHeartRateZones(currentAge)?.maxHeartRate ?? null));
        const candidateSessions = recentSessions
          .filter(
            (session, index) =>
              Number.isFinite(session.duration_s) &&
              Number(session.duration_s) > 0 &&
              (referenceMaximum === null
                ? index < 10
                : session.max_heart_rate === null || session.max_heart_rate >= referenceMaximum - 10),
          )
          .slice(0, 20);
        const streamResults = await Promise.all(
          candidateSessions.map(async session => {
            const result = await supabase
              .from('activity_stream_samples')
              .select('offset_s, value')
              .eq('user_id', user.id)
              .eq('session_id', session.id)
              .eq('stream_type', 'heart_rate')
              .gte('offset_s', 0)
              .lte('offset_s', session.duration_s!)
              .order('value', { ascending: false })
              .limit(20);
            if (result.error) throw result.error;
            return [
              session.id,
              (result.data ?? []).map(sample => ({ value: Number(sample.value), offset: sample.offset_s })),
            ] as const;
          }),
        );
        const samplesBySession = new Map<string, Array<{ value: number; offset: number | null }>>();
        for (const [sessionId, samples] of streamResults) {
          samplesBySession.set(sessionId, samples);
        }
        const evidence = analyzeRecentHeartRateSessions(
          (sessionsResult.data ?? []).map(session => ({
            sessionId: session.id,
            values: (samplesBySession.get(session.id) ?? []).map(sample => sample.value),
            sampleOffsetsSeconds: (samplesBySession.get(session.id) ?? []).map(sample => sample.offset),
            durationSeconds: session.duration_s,
            maxHeartRate: session.max_heart_rate,
          })),
          zoneProfile?.maxHeartRate,
        );
        setPeakHeartRate(evidence.observedPeak);
        setTrainingEvidence(evidence);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load heart-rate zones');
    } finally {
      setLoading(false);
    }
  }, [profile?.date_of_birth, user, zoneProfile?.maxHeartRate]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveProfile = useCallback(
    async (nextProfile: HeartRateZoneProfile) => {
      if (!user) throw new Error('Authentication is required to save heart-rate zones');
      setSaving(true);
      setError(null);
      try {
        const { data: existing, error: readError } = await supabase
          .from('user_preferences')
          .select('training_settings')
          .eq('user_id', user.id)
          .maybeSingle();
        if (readError) throw readError;
        const existingSettings =
          existing?.training_settings &&
          typeof existing.training_settings === 'object' &&
          !Array.isArray(existing.training_settings)
            ? (existing.training_settings as Record<string, unknown>)
            : {};
        const { error: saveError } = existing
          ? await supabase
              .from('user_preferences')
              .update({ training_settings: { ...existingSettings, heart_rate_zones: nextProfile } } as never)
              .eq('user_id', user.id)
          : await supabase
              .from('user_preferences')
              .insert({ user_id: user.id, training_settings: { heart_rate_zones: nextProfile } } as never);
        if (saveError) throw saveError;
        setZoneProfile(nextProfile);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Unable to save heart-rate zones');
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [user],
  );

  const recalculate = useCallback(async () => {
    if (!profile?.date_of_birth) return false;
    const age = getAgeOnDate(profile.date_of_birth, new Date());
    if (age === null) return false;
    const result = calculateHeartRateZones(age);
    if (!result) return false;
    await saveProfile(createProfile(result.maxHeartRate, result.zones, 'tanaka', 'age_estimate'));
    return true;
  }, [profile?.date_of_birth, saveProfile]);

  const recalculateFromReserve = useCallback(async () => {
    if (restingHeartRate === null) return false;
    let maximum = zoneProfile?.maxHeartRate ?? null;
    if (!zoneProfile || zoneProfile.method === 'tanaka' || zoneProfile.method === 'karvonen') {
      if (!profile?.date_of_birth) return false;
      const age = getAgeOnDate(profile.date_of_birth, new Date());
      if (age === null) return false;
      maximum = calculateHeartRateZones(age)?.maxHeartRate ?? null;
    }
    if (maximum === null) return false;
    const result = calculateHeartRateZonesFromReserve(maximum, restingHeartRate);
    if (!result) return false;
    await saveProfile(
      createProfile(
        result.maxHeartRate,
        result.zones,
        'karvonen',
        'age_estimate',
        result.restingHeartRate,
        restingHeartRateSamples,
      ),
    );
    return true;
  }, [profile?.date_of_birth, restingHeartRate, restingHeartRateSamples, saveProfile, zoneProfile]);

  const saveManual = useCallback(
    async (maxHeartRate: number, zones: HeartRateZoneProfile['zones'], measured = false) => {
      await saveProfile(
        createProfile(
          maxHeartRate,
          zones,
          measured ? 'measured' : 'manual',
          measured ? 'measured_thresholds' : 'user_entered',
        ),
      );
    },
    [saveProfile],
  );

  const saveManualMaximum = useCallback(
    async (maxHeartRate: number) => {
      const calculated = calculateZonesFromMaxHeartRate(maxHeartRate);
      if (!calculated) throw new Error('Maximum heart rate must be between 60 and 250 bpm');
      await saveManual(maxHeartRate, calculated.zones);
    },
    [saveManual],
  );

  return {
    zoneProfile,
    restingHeartRate,
    latestRestingHeartRate,
    restingHeartRateSamples,
    peakHeartRate,
    trainingEvidence,
    loading: loading || profileLoading,
    saving,
    error,
    age: getAgeOnDate(profile?.date_of_birth, new Date()),
    reload: load,
    recalculate,
    recalculateFromReserve,
    saveManual,
    saveManualMaximum,
  };
};
