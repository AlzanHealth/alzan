import { Exercise } from './requests.types';

export type ExerciseWithDetails = Exercise & {
  load_type: 'bodyweight' | 'external' | 'assisted' | 'mixed' | null;
  name: string;
  description?: string | null;
  muscle_name?: string;
  secondary_muscle_name?: string;
  equipment_name?: string;
  exercise_type_code?: string | null; // 'Tiempo' for time-based, 'Repeticiones' for reps
  primary_muscle?: {
    id: number;
    code: string;
    name: string;
  } | null;
  secondary_muscle?: {
    id: number;
    code: string;
    name: string;
  } | null;
  equipment?: {
    id: number;
    code: string;
    name: string;
  } | null;
};

export interface PredefinedTemplate {
  id: string; // Internal ID for UI
  name: string;
  description: string;
  days_per_week: number;
  exercises: {
    exercise_id: string;
    target_sets: number;
    target_reps_min: number;
    target_reps_max: number;
    rest_seconds: number;
    notes?: string;
  }[];
}
