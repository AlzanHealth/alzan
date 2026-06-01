import { Nullable } from '../types/common.types';
import { Sex, SportType } from '../types/requests.types';

export interface CaloriesInput {
  deporte: SportType;
  distancia_km?: number | null;
  duracion_min?: number | null;
  desnivel_m?: number | null;
  rpe?: number | null;
  peso_kg?: number | null;
  sexo?: Nullable<Sex>;
}

export interface CaloriesOutput {
  kcal: number | null;
  met: number | null;
  reason?: string;
}

export function estimateCalories(input: CaloriesInput): CaloriesOutput {
  const { deporte, distancia_km, duracion_min, desnivel_m, rpe, peso_kg, sexo } = input;

  // 0. Base validations
  const usedWeight = peso_kg || 70; // Fallback to 70kg if no weight provided to ensure calculation runs
  if (!usedWeight || usedWeight <= 0) {
    // Should logically never happen with fallback, but safe check
    return { kcal: null, met: null, reason: 'Invalid weight' };
  }

  // Required fields check per sport group
  const isEndurance = ['running', 'cycling', 'swimming'].includes(deporte);
  const hasDist = distancia_km != null && distancia_km > 0;
  const hasDur = duracion_min != null && duracion_min > 0;

  if (isEndurance) {
    if (!hasDist && !hasDur) {
      return { kcal: null, met: null, reason: 'Missing distance or duration for endurance sport' };
    }
  } else {
    // Other sports require duration
    if (!hasDur) {
      return { kcal: null, met: null, reason: 'Missing duration' };
    }
  }

  let calculatedKcal = 0;
  let usedMet = 0;
  const duracion_h = (duracion_min || 0) / 60;
  const currentRpe = rpe || 5; // Default RPE 5

  // 1. Calculation Logic per Sport

  // === RUNNING ===
  if (deporte === 'running') {
    // Preference: Use speed-based MET if we have both distance and duration
    if (hasDist && hasDur) {
      const velocidad_kmh = (distancia_km || 0) / duracion_h;

      // MET values based on running speed
      if (velocidad_kmh < 8)
        usedMet = 6; // Slow jog
      else if (velocidad_kmh < 10)
        usedMet = 8; // Light run
      else if (velocidad_kmh < 12)
        usedMet = 10; // Moderate run
      else if (velocidad_kmh < 14)
        usedMet = 11.5; // Fast run
      else usedMet = 13; // Very fast run

      // Calculate base calories
      calculatedKcal = usedMet * usedWeight * duracion_h;

      // RPE adjustments
      if (currentRpe >= 8) calculatedKcal *= 1.1;
      if (currentRpe <= 4) calculatedKcal *= 0.9;

      // Elevation adjustment
      if (desnivel_m && desnivel_m > 0) {
        calculatedKcal *= 1 + (desnivel_m / 1000) * 0.05;
      }
    } else if (hasDist) {
      // Only distance available - use simple distance formula
      let kcal = usedWeight * (distancia_km || 0);

      // Adjustments
      if (currentRpe >= 8) kcal *= 1.1;
      if (currentRpe <= 4) kcal *= 0.9;
      if (desnivel_m && desnivel_m > 0) {
        kcal *= 1 + (desnivel_m / 1000) * 0.05;
      }

      calculatedKcal = kcal;
      usedMet = 0; // Can't calculate MET without duration
    } else {
      // No distance, use RPE METs
      if (currentRpe <= 3) usedMet = 6;
      else if (currentRpe <= 6) usedMet = 8;
      else if (currentRpe <= 8) usedMet = 10;
      else usedMet = 12;

      calculatedKcal = usedMet * usedWeight * duracion_h;
    }
  }

  // === CYCLING ===
  else if (deporte === 'cycling') {
    if (hasDist && hasDur) {
      const velocidad_kmh = (distancia_km || 0) / duracion_h;
      if (velocidad_kmh < 16) usedMet = 4;
      else if (velocidad_kmh < 19) usedMet = 6;
      else if (velocidad_kmh < 23) usedMet = 8;
      else if (velocidad_kmh < 26) usedMet = 10;
      else usedMet = 12;

      calculatedKcal = usedMet * usedWeight * duracion_h;
    } else {
      // Use RPE if no speed data available
      // Mapping RPE 4-12 range implicitly ?? Using generic logic or custom?
      // Prompt: "Usar tabla MET según RPE (4-12) y duración"
      // Let's map RPE 1..10 to MET 4..12 roughly
      // RPE 1-3 -> MET 4
      // RPE 4-6 -> MET 6-8
      // RPE 7-8 -> MET 10
      // RPE 9-10 -> MET 12
      if (currentRpe <= 3) usedMet = 4;
      else if (currentRpe <= 5) usedMet = 6;
      else if (currentRpe <= 7) usedMet = 8;
      else if (currentRpe <= 8) usedMet = 10;
      else usedMet = 12;

      calculatedKcal = usedMet * usedWeight * duracion_h;
    }
  }

  // === SWIMMING ===
  else if (deporte === 'swimming') {
    if (currentRpe <= 3) usedMet = 6;
    else if (currentRpe <= 6) usedMet = 8;
    else if (currentRpe <= 8) usedMet = 10;
    else usedMet = 12;

    calculatedKcal = usedMet * usedWeight * duracion_h;
  }

  // === FOOTBALL ===
  else if (deporte === 'football') {
    if (currentRpe <= 3) usedMet = 6;
    else if (currentRpe <= 6) usedMet = 8;
    else if (currentRpe <= 8) usedMet = 10;
    else usedMet = 11;

    calculatedKcal = usedMet * usedWeight * duracion_h;
  }

  // === TENNIS / PADEL ===
  else if (deporte === 'tennis' || deporte === 'padel') {
    if (currentRpe <= 3) usedMet = 5;
    else if (currentRpe <= 6) usedMet = 6;
    else if (currentRpe <= 8) usedMet = 7;
    else usedMet = 8;

    calculatedKcal = usedMet * usedWeight * duracion_h;
  }

  // === HIKING / TRAIL ===
  else if (deporte === 'hiking' || deporte === 'trail') {
    if (hasDist && desnivel_m != null) {
      const pendiente_m_km = desnivel_m / (distancia_km || 1); // avoid div 0
      if (pendiente_m_km < 30)
        usedMet = 3.5; // Average of 3-4
      else if (pendiente_m_km <= 60)
        usedMet = 5.5; // Average of 5-6
      else usedMet = 8; // Average of 7-9
    } else {
      // Use RPE (3-9)
      if (currentRpe <= 3) usedMet = 3;
      else if (currentRpe <= 6) usedMet = 5;
      else if (currentRpe <= 8) usedMet = 7;
      else usedMet = 9;
    }
    calculatedKcal = usedMet * usedWeight * duracion_h;
  }

  // === OTHER ===
  else {
    // Generic RPE mapping
    if (currentRpe <= 3) usedMet = 3.5;
    else if (currentRpe <= 6) usedMet = 6;
    else if (currentRpe <= 8) usedMet = 8.5;
    else usedMet = 10;

    calculatedKcal = usedMet * usedWeight * duracion_h;
  }

  // 2. Gender Adjustment
  if (sexo === 'female') {
    calculatedKcal *= 0.95;
  }

  return {
    kcal: Math.round(calculatedKcal),
    met: Number(usedMet.toFixed(1)),
    reason: 'Calculated successfully',
  };
}
