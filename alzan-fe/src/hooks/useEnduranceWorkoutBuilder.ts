import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { propagateTrainingPlans } from '../modules/training/services/trainingCopyService';
import { DurationType, PhaseType, SportType, TargetType } from '../types/requests.types';
import { Database } from '../types/database.types';

export interface BuilderStep {
  id: string; // temp or real id
  phase_type: PhaseType;
  duration_type: DurationType;
  duration_s?: number;
  distance_m?: number;
  target_type: TargetType;
  target_min?: number;
  target_max?: number;
  repetitions: number;
  parent_step_id?: string | null;
  is_group: boolean;
  children?: BuilderStep[];
  hyrox_step_type?: string | null;
  hyrox_station_key?: string | null;
  load_kg?: number | null;
  reps?: number | null;
}

export interface BuilderTemplateData {
  base_name: string;
  description?: string;
  sport_type: SportType;
  workout_goal?: string | null;
  total_duration_s?: number;
  total_distance_m?: number;
  scheduled_day?: number | null; // 0 = Sunday, 1 = Monday, etc.
  environment_type?: string | null;
  surface?: string | null;
  pool_type?: string | null;
  stroke?: string | null;
  football_session_type?: string | null;
  base_load?: string | null;
  contact_level?: string | null;
  boots_used?: string | null;
  racket_used?: string | null;
  climbing_grade?: string | null;
  wetsuit?: string | null;
  board?: string | null;
  rival?: string | null;
  notes?: string | null;
  elev_gain_m?: number | null;
  ski_type?: string | null;
  slope_type?: string | null;
  snowboard_type?: string | null;
  golf_club_focus?: string | null;
  hyrox_station_focus?: string | null;
}

type EnduranceWorkoutTemplateInsertPatch = Database['public']['Tables']['endurance_workout_templates']['Insert'];

type EnduranceWorkoutTemplateUpdatePatch = Database['public']['Tables']['endurance_workout_templates']['Update'];

export const useEnduranceWorkoutBuilder = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const saveWorkout = useMutation({
    mutationFn: async ({
      data,
      steps,
      templateId,
    }: {
      data: BuilderTemplateData;
      steps: BuilderStep[];
      templateId?: string;
    }) => {
      const isEditMode = !!templateId;
      console.log(
        `[useEnduranceWorkoutBuilder.save] ${isEditMode ? 'Actualizando' : 'Creando'} - name:`,
        data.base_name,
        'steps:',
        steps.length,
      );

      try {
        if (!user) throw new Error('No user');

        let finalTemplateId: string;

        if (isEditMode) {
          const updatePayload: EnduranceWorkoutTemplateUpdatePatch = {
            base_name: data.base_name,
            description: data.description,
            sport_type: data.sport_type,
            total_duration_s: data.total_duration_s,
            total_distance_m: data.total_distance_m,
            workout_goal: data.workout_goal,
            scheduled_day: data.scheduled_day,
            environment_type: data.environment_type,
            surface: data.surface,
            pool_type: data.pool_type,
            stroke: data.stroke,
            football_session_type: data.football_session_type,
            base_load: data.base_load,
            contact_level: data.contact_level,
            boots_used: data.boots_used,
            racket_used: data.racket_used,
            climbing_grade: data.climbing_grade,
            wetsuit: data.wetsuit,
            board: data.board,
            ski_type: data.ski_type,
            slope_type: data.slope_type,
            snowboard_type: data.snowboard_type,
            golf_club_focus: data.golf_club_focus,
            hyrox_station_focus: data.hyrox_station_focus,
            rival: data.rival,
            notes: data.notes,
            elev_gain_m: data.elev_gain_m,
            updated_at: new Date().toISOString(),
          };
          // UPDATE existing template
          const { error: updateError } = await supabase
            .from('endurance_workout_templates')
            .update(updatePayload)
            .eq('id', templateId);

          if (updateError) {
            console.error('[useEnduranceWorkoutBuilder.save] Error update:', updateError);
            throw updateError;
          }

          // Delete existing steps
          await supabase.from('endurance_workout_steps').delete().eq('template_id', templateId);

          finalTemplateId = templateId;
          console.log('[useEnduranceWorkoutBuilder.save] Template actualizado - id:', templateId);
        } else {
          const insertPayload: EnduranceWorkoutTemplateInsertPatch = {
            user_id: user.id,
            base_name: data.base_name,
            description: data.description,
            sport_type: data.sport_type,
            total_duration_s: data.total_duration_s,
            total_distance_m: data.total_distance_m,
            workout_goal: data.workout_goal,
            scheduled_day: data.scheduled_day,
            environment_type: data.environment_type,
            surface: data.surface,
            pool_type: data.pool_type,
            stroke: data.stroke,
            football_session_type: data.football_session_type,
            base_load: data.base_load,
            contact_level: data.contact_level,
            boots_used: data.boots_used,
            racket_used: data.racket_used,
            climbing_grade: data.climbing_grade,
            wetsuit: data.wetsuit,
            board: data.board,
            ski_type: data.ski_type,
            slope_type: data.slope_type,
            snowboard_type: data.snowboard_type,
            golf_club_focus: data.golf_club_focus,
            hyrox_station_focus: data.hyrox_station_focus,
            rival: data.rival,
            notes: data.notes,
            elev_gain_m: data.elev_gain_m,
          };
          // INSERT new template
          const { data: template, error: tError } = await supabase
            .from('endurance_workout_templates')
            .insert(insertPayload)
            .select()
            .single();

          if (tError) {
            console.error('[useEnduranceWorkoutBuilder.save] Error template:', tError);
            throw tError;
          }
          finalTemplateId = template.id;
          console.log('[useEnduranceWorkoutBuilder.save] Template creado - id:', template.id);
        }

        // Process Steps (same for both create and update)
        const processSteps = async (list: BuilderStep[], parentId: string | null = null, startIndex: number = 0) => {
          let currentIndex = startIndex;

          for (const step of list) {
            const { data: insertedStep, error: sError } = await supabase
              .from('endurance_workout_steps')
              .insert({
                template_id: finalTemplateId,
                order_index: currentIndex,
                phase_type: step.phase_type,
                duration_type: step.duration_type,
                duration_s: step.duration_s,
                distance_m: step.distance_m,
                target_type: step.target_type,
                target_min: step.target_min,
                target_max: step.target_max,
                repetitions: step.repetitions,
                is_group: step.is_group,
                parent_step_id: parentId,
                hyrox_step_type: step.hyrox_step_type ?? null,
                hyrox_station_key: step.hyrox_station_key ?? null,
                load_kg: step.load_kg ?? null,
                reps: step.reps ?? null,
              })
              .select()
              .single();

            if (sError) {
              console.error('[useEnduranceWorkoutBuilder.save] Error step:', sError);
              throw sError;
            }

            if (step.is_group && step.children && step.children.length > 0) {
              await processSteps(step.children, insertedStep.id, 0);
            }

            currentIndex++;
          }
        };

        await processSteps(steps);
        console.log('[useEnduranceWorkoutBuilder.save] Éxito - todos los pasos insertados');

        return { id: finalTemplateId };
      } catch (err) {
        console.error('[useEnduranceWorkoutBuilder.save] Exception:', err);
        throw err;
      }
    },
    onSuccess: async () => {
      if (user) {
        try {
          await propagateTrainingPlans(user.id);
        } catch (err) {
          console.error('Failed to propagate plans on save:', err);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['enduranceWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['enduranceTemplate'] });

      // Fix keys to match TrainingHomeScreen
      queryClient.invalidateQueries({ queryKey: ['dailyPlans'] });
      queryClient.invalidateQueries({ queryKey: ['weekDots'] });
      queryClient.invalidateQueries({ queryKey: ['scheduledTemplates'] });
    },
  });

  return {
    saveWorkout,
  };
};
