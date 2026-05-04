# Database Schema

-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.activity_heart_rate_zones (
id uuid NOT NULL DEFAULT gen_random_uuid(),
session_id uuid NOT NULL,
zone smallint NOT NULL CHECK (zone >= 1 AND zone <= 5),
duration_s integer NOT NULL CHECK (duration_s >= 0),
percentage numeric NOT NULL CHECK (percentage >= 0::numeric AND percentage <= 100::numeric),
created_at timestamp with time zone NOT NULL DEFAULT now(),
CONSTRAINT activity_heart_rate_zones_pkey PRIMARY KEY (id),
CONSTRAINT activity_heart_rate_zones_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.activity_sessions(id)
);
CREATE TABLE public.activity_laps (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
session_id uuid NOT NULL,
lap_index integer NOT NULL,
distance_m numeric,
duration_s integer,
avg_heart_rate integer,
max_heart_rate integer,
avg_pace_s_per_km integer,
lap_type USER-DEFINED NOT NULL DEFAULT 'unknown'::lap_type_enum,
start_offset_s integer,
end_offset_s integer,
user_id uuid,
split_group text NOT NULL DEFAULT 'legacy'::text CHECK (split_group = ANY (ARRAY['legacy'::text, 'custom'::text, 'distance'::text])),
split_distance_m integer CHECK (split_distance_m IS NULL OR split_distance_m > 0),
split_group_order integer NOT NULL DEFAULT 0,
CONSTRAINT activity_laps_pkey PRIMARY KEY (id),
CONSTRAINT activity_laps_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.activity_sessions(id),
CONSTRAINT activity_laps_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.activity_session_superset_links (
id uuid NOT NULL DEFAULT gen_random_uuid(),
session_id uuid NOT NULL,
from_exercise_id uuid NOT NULL,
to_exercise_id uuid NOT NULL,
from_order_index integer NOT NULL CHECK (from_order_index >= 0),
to_order_index integer NOT NULL,
created_at timestamp with time zone NOT NULL DEFAULT now(),
CONSTRAINT activity_session_superset_links_pkey PRIMARY KEY (id),
CONSTRAINT activity_session_superset_links_to_exercise_id_fkey FOREIGN KEY (to_exercise_id) REFERENCES public.exercises(id),
CONSTRAINT activity_session_superset_links_from_exercise_id_fkey FOREIGN KEY (from_exercise_id) REFERENCES public.exercises(id),
CONSTRAINT activity_session_superset_links_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.activity_sessions(id)
);
CREATE TABLE public.activity_session_tags (
session_id uuid NOT NULL,
tag_id uuid NOT NULL,
created_at timestamp with time zone NOT NULL DEFAULT now(),
CONSTRAINT activity_session_tags_pkey PRIMARY KEY (session_id, tag_id),
CONSTRAINT activity_session_tags_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.activity_sessions(id),
CONSTRAINT activity_session_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id)
);
CREATE TABLE public.activity_sessions (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
user_id uuid NOT NULL,
sport_type USER-DEFINED NOT NULL,
start_time timestamp with time zone NOT NULL DEFAULT now(),
end_time timestamp with time zone,
duration_s integer,
workout_template_id uuid,
name text,
description text,
distance_m numeric,
elev_gain_m numeric,
avg_heart_rate integer,
max_heart_rate integer,
avg_speed_m_per_s numeric,
calories_kcal numeric,
rpe numeric,
source USER-DEFINED NOT NULL DEFAULT 'manual'::activity_source_enum,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
status USER-DEFINED NOT NULL DEFAULT 'completed'::activity_status_enum,
timezone text,
started_at_local timestamp without time zone,
ended_at_local timestamp without time zone,
provider USER-DEFINED NOT NULL DEFAULT 'manual'::provider_enum,
provider_activity_id text,
device_id uuid,
sport_subtype USER-DEFINED,
visibility USER-DEFINED DEFAULT 'private'::visibility_enum,
total_sets integer,
total_reps integer,
total_volume_kg numeric,
avg_cadence integer,
max_cadence integer,
avg_power_w integer,
max_power_w integer,
avg_temp_c numeric,
max_temp_c numeric,
imported_at timestamp with time zone,
endurance_template_id uuid,
route_polyline text,
recovery_time_s integer CHECK (recovery_time_s IS NULL OR recovery_time_s >= 0),
total_steps integer CHECK (total_steps IS NULL OR total_steps >= 0),
vo2_max numeric CHECK (vo2_max IS NULL OR vo2_max > 0::numeric AND vo2_max <= 100::numeric),
elev_loss_m numeric CHECK (elev_loss_m IS NULL OR elev_loss_m >= 0::numeric),
min_heart_rate numeric,
tss_hr numeric,
epoc numeric,
pte numeric,
CONSTRAINT activity_sessions_pkey PRIMARY KEY (id),
CONSTRAINT activity_sessions_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(id),
CONSTRAINT activity_sessions_endurance_template_id_fkey FOREIGN KEY (endurance_template_id) REFERENCES public.endurance_workout_templates(id),
CONSTRAINT activity_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
CONSTRAINT activity_sessions_workout_template_id_fkey FOREIGN KEY (workout_template_id) REFERENCES public.workout_templates(id)
);
CREATE TABLE public.activity_streams (
id uuid NOT NULL DEFAULT gen_random_uuid(),
session_id uuid NOT NULL,
stream_type USER-DEFINED NOT NULL,
unit text,
data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'::text),
sample_hz numeric,
source text NOT NULL DEFAULT 'manual'::text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
user_id uuid,
CONSTRAINT activity_streams_pkey PRIMARY KEY (id),
CONSTRAINT activity_streams_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.activity_sessions(id),
CONSTRAINT activity_streams_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.body_measurements (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
user_id uuid NOT NULL,
measured_at timestamp with time zone NOT NULL DEFAULT now(),
measurement_type USER-DEFINED NOT NULL,
value_cm numeric NOT NULL,
notes text,
CONSTRAINT body_measurements_pkey PRIMARY KEY (id),
CONSTRAINT body_measurements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.daily_hydration (
user_id uuid NOT NULL,
date date NOT NULL,
total_ml integer NOT NULL DEFAULT 0 CHECK (total_ml >= 0),
source USER-DEFINED NOT NULL DEFAULT 'manual'::daily_hydration_source,
updated_at timestamp with time zone NOT NULL DEFAULT now(),
CONSTRAINT daily_hydration_pkey PRIMARY KEY (user_id, date),
CONSTRAINT daily_hydration_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.devices (
id uuid NOT NULL DEFAULT gen_random_uuid(),
user_id uuid NOT NULL,
provider USER-DEFINED NOT NULL DEFAULT 'other'::provider_enum,
device_name text,
device_model text,
device_serial text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
CONSTRAINT devices_pkey PRIMARY KEY (id),
CONSTRAINT devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.diet_template_meal_translations (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
diet_template_meal_id uuid,
language_code USER-DEFINED,
name text NOT NULL,
notes text,
CONSTRAINT diet_template_meal_translations_pkey PRIMARY KEY (id),
CONSTRAINT diet_template_meal_translations_diet_template_meal_id_fkey FOREIGN KEY (diet_template_meal_id) REFERENCES public.diet_template_meals(id)
);
CREATE TABLE public.diet_template_meals (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
diet_template_id uuid NOT NULL,
day_of_week smallint NOT NULL,
meal_type USER-DEFINED NOT NULL,
base_name text NOT NULL,
notes text,
target_kcal numeric,
target_protein_g numeric,
target_carbs_g numeric,
target_fats_g numeric,
order_index integer NOT NULL DEFAULT 0,
user_id uuid,
CONSTRAINT diet_template_meals_pkey PRIMARY KEY (id),
CONSTRAINT diet_template_meals_diet_template_id_fkey FOREIGN KEY (diet_template_id) REFERENCES public.diet_templates(id),
CONSTRAINT diet_template_meals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.diet_template_translations (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
diet_template_id uuid,
language_code USER-DEFINED,
name text NOT NULL,
description text,
CONSTRAINT diet_template_translations_pkey PRIMARY KEY (id),
CONSTRAINT diet_template_translations_diet_template_id_fkey FOREIGN KEY (diet_template_id) REFERENCES public.diet_templates(id)
);
CREATE TABLE public.diet_templates (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
user_id uuid NOT NULL,
base_name text NOT NULL,
description text,
daily_calorie_target_kcal integer,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
source text NOT NULL DEFAULT 'user'::text,
CONSTRAINT diet_templates_pkey PRIMARY KEY (id),
CONSTRAINT diet_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.endurance_workout_steps (
id uuid NOT NULL DEFAULT gen_random_uuid(),
template_id uuid NOT NULL,
order_index integer NOT NULL,
phase_type USER-DEFINED NOT NULL,
duration_type USER-DEFINED NOT NULL,
duration_s integer,
distance_m integer,
target_type USER-DEFINED NOT NULL DEFAULT 'none'::target_type_enum,
target_min numeric,
target_max numeric,
repetitions integer DEFAULT 1,
parent_step_id uuid,
is_group boolean DEFAULT false,
created_at timestamp with time zone NOT NULL DEFAULT now(),
user_id uuid,
CONSTRAINT endurance_workout_steps_pkey PRIMARY KEY (id),
CONSTRAINT endurance_workout_steps_parent_step_id_fkey FOREIGN KEY (parent_step_id) REFERENCES public.endurance_workout_steps(id),
CONSTRAINT endurance_workout_steps_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.endurance_workout_templates(id),
CONSTRAINT endurance_workout_steps_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.endurance_workout_templates (
id uuid NOT NULL DEFAULT gen_random_uuid(),
user_id uuid NOT NULL,
sport_type USER-DEFINED NOT NULL,
base_name text NOT NULL,
description text,
total_distance_m integer,
total_duration_s integer,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
workout_goal USER-DEFINED,
scheduled_day integer,
CONSTRAINT endurance_workout_templates_pkey PRIMARY KEY (id),
CONSTRAINT endurance_workout_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.equipment (
id smallint NOT NULL DEFAULT nextval('equipment_id_seq'::regclass),
code text NOT NULL UNIQUE,
CONSTRAINT equipment_pkey PRIMARY KEY (id)
);
CREATE TABLE public.equipment_translations (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
equipment_id smallint,
language_code text,
name text NOT NULL,
CONSTRAINT equipment_translations_pkey PRIMARY KEY (id),
CONSTRAINT equipment_translations_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id)
);
CREATE TABLE public.exercise_media (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
exercise_id uuid NOT NULL,
media_type text NOT NULL,
url text NOT NULL,
sort_order integer NOT NULL DEFAULT 0,
CONSTRAINT exercise_media_pkey PRIMARY KEY (id),
CONSTRAINT exercise_media_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id)
);
CREATE TABLE public.exercise_translations (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
exercise_id uuid NOT NULL,
language_code text NOT NULL,
name text NOT NULL,
description text,
CONSTRAINT exercise_translations_pkey PRIMARY KEY (id),
CONSTRAINT exercise_translations_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id)
);
CREATE TABLE public.exercise_types (
id smallint NOT NULL DEFAULT nextval('exercise_types_id_seq'::regclass),
code text NOT NULL UNIQUE,
CONSTRAINT exercise_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.exercises (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
base_name_es text NOT NULL,
primary_muscle_id smallint,
secondary_muscle_id smallint,
equipment_id smallint,
exercise_type_id smallint,
difficulty text,
description_es text,
is_custom boolean NOT NULL DEFAULT false,
owner_user_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
base_name_en text,
description_en text,
load_type USER-DEFINED,
CONSTRAINT exercises_pkey PRIMARY KEY (id),
CONSTRAINT exercises_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id),
CONSTRAINT exercises_exercise_type_id_fkey FOREIGN KEY (exercise_type_id) REFERENCES public.exercise_types(id),
CONSTRAINT exercises_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id),
CONSTRAINT exercises_primary_muscle_id_fkey FOREIGN KEY (primary_muscle_id) REFERENCES public.muscle_groups(id),
CONSTRAINT exercises_secondary_muscle_id_fkey FOREIGN KEY (secondary_muscle_id) REFERENCES public.muscle_groups(id)
);
CREATE TABLE public.external_accounts (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
user_id uuid NOT NULL,
provider text NOT NULL,
external_user_id text NOT NULL,
access_token text,
refresh_token text,
token_expires_at timestamp with time zone,
scopes text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
CONSTRAINT external_accounts_pkey PRIMARY KEY (id),
CONSTRAINT external_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.external_activity_mappings (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
user_id uuid NOT NULL,
external_account_id uuid NOT NULL,
provider text NOT NULL,
external_activity_id text NOT NULL,
activity_session_id uuid NOT NULL,
imported_at timestamp with time zone NOT NULL DEFAULT now(),
CONSTRAINT external_activity_mappings_pkey PRIMARY KEY (id),
CONSTRAINT external_activity_mappings_activity_session_id_fkey FOREIGN KEY (activity_session_id) REFERENCES public.activity_sessions(id),
CONSTRAINT external_activity_mappings_external_account_id_fkey FOREIGN KEY (external_account_id) REFERENCES public.external_accounts(id),
CONSTRAINT external_activity_mappings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.external_raw_payloads (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
external_activity_mapping_id uuid NOT NULL,
received_at timestamp with time zone NOT NULL DEFAULT now(),
payload jsonb NOT NULL,
CONSTRAINT external_raw_payloads_pkey PRIMARY KEY (id),
CONSTRAINT external_raw_payloads_external_activity_mapping_id_fkey FOREIGN KEY (external_activity_mapping_id) REFERENCES public.external_activity_mappings(id)
);
CREATE TABLE public.ingredient_import_batches (
id uuid NOT NULL DEFAULT gen_random_uuid(),
batch_number integer,
payload jsonb NOT NULL,
inserted_count integer NOT NULL DEFAULT 0,
updated_count integer NOT NULL DEFAULT 0,
created_at timestamp with time zone NOT NULL DEFAULT now(),
CONSTRAINT ingredient_import_batches_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ingredient_usda_cache (
id uuid NOT NULL DEFAULT gen_random_uuid(),
user_id uuid NOT NULL,
spanish_input_raw text NOT NULL,
spanish_input_norm text NOT NULL,
resolved_en_query text NOT NULL,
chosen_fdc_id bigint NOT NULL,
chosen_description text NOT NULL,
chosen_data_type text NOT NULL,
confidence_score double precision NOT NULL,
resolver_version text NOT NULL DEFAULT 'v1'::text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
CONSTRAINT ingredient_usda_cache_pkey PRIMARY KEY (id),
CONSTRAINT ingredient_usda_cache_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.ingredients (
id uuid NOT NULL DEFAULT gen_random_uuid(),
name_es text NOT NULL,
name_en text NOT NULL,
name_norm_es text NOT NULL UNIQUE,
category USER-DEFINED NOT NULL,
unit_basis USER-DEFINED NOT NULL DEFAULT 'per_100g'::ingredients_unit_basis,
kcal_100 numeric,
protein_g_100 numeric,
carbs_g_100 numeric,
fat_g_100 numeric,
fiber_g_100 numeric,
sugar_g_100 numeric,
sodium_mg_100 numeric,
salt_g_100 numeric,
source_primary jsonb,
source_secondary jsonb,
quality_score numeric NOT NULL CHECK (quality_score >= 0::numeric AND quality_score <= 1::numeric),
notes_es text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
notes_en text,
CONSTRAINT ingredients_pkey PRIMARY KEY (id)
);
CREATE TABLE public.meal_items (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
meal_log_id uuid NOT NULL,
user_id uuid NOT NULL,
name text NOT NULL,
source USER-DEFINED NOT NULL DEFAULT 'manual'::meal_items_source,
source_ref text,
quantity_g numeric NOT NULL CHECK (quantity_g > 0::numeric),
per_100g_kcal numeric,
per_100g_protein_g numeric,
per_100g_carbs_g numeric,
per_100g_fats_g numeric,
kcal numeric,
protein_g numeric,
carbs_g numeric,
fats_g numeric,
data_quality USER-DEFINED NOT NULL DEFAULT 'manual'::meal_items_data_quality,
created_at timestamp with time zone NOT NULL DEFAULT now(),
origin USER-DEFINED NOT NULL DEFAULT 'user'::meal_items_origin,
confidence numeric,
CONSTRAINT meal_items_pkey PRIMARY KEY (id),
CONSTRAINT meal_items_meal_log_fkey FOREIGN KEY (meal_log_id) REFERENCES public.meal_logs(id),
CONSTRAINT meal_items_meal_log_user_fkey FOREIGN KEY (meal_log_id) REFERENCES public.meal_logs(id),
CONSTRAINT meal_items_meal_log_user_fkey FOREIGN KEY (user_id) REFERENCES public.meal_logs(id),
CONSTRAINT meal_items_meal_log_user_fkey FOREIGN KEY (meal_log_id) REFERENCES public.meal_logs(user_id),
CONSTRAINT meal_items_meal_log_user_fkey FOREIGN KEY (user_id) REFERENCES public.meal_logs(user_id),
CONSTRAINT meal_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.meal_logs (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
user_id uuid NOT NULL,
logged_at timestamp with time zone NOT NULL DEFAULT now(),
date date NOT NULL,
meal_type USER-DEFINED NOT NULL,
name text,
notes text,
kcal numeric,
protein_g numeric,
carbs_g numeric,
fats_g numeric,
diet_template_meal_id uuid,
adherence_status text,
source text NOT NULL DEFAULT 'manual'::text,
data_quality USER-DEFINED NOT NULL DEFAULT 'manual'::meal_logs_data_quality,
calc_version text NOT NULL DEFAULT 'nutrition_v1'::text,
origin USER-DEFINED NOT NULL DEFAULT 'user'::meal_logs_origin,
origin_confidence numeric,
CONSTRAINT meal_logs_pkey PRIMARY KEY (id),
CONSTRAINT meal_logs_diet_template_meal_id_fkey FOREIGN KEY (diet_template_meal_id) REFERENCES public.diet_template_meals(id),
CONSTRAINT meal_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.muscle_group_translations (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
muscle_group_id smallint,
language_code text,
name text NOT NULL,
CONSTRAINT muscle_group_translations_pkey PRIMARY KEY (id),
CONSTRAINT muscle_group_translations_muscle_group_id_fkey FOREIGN KEY (muscle_group_id) REFERENCES public.muscle_groups(id)
);
CREATE TABLE public.muscle_groups (
id smallint NOT NULL DEFAULT nextval('muscle_groups_id_seq'::regclass),
code text NOT NULL UNIQUE,
CONSTRAINT muscle_groups_pkey PRIMARY KEY (id)
);
CREATE TABLE public.notifications (
id uuid NOT NULL DEFAULT gen_random_uuid(),
user_id uuid NOT NULL,
type USER-DEFINED NOT NULL,
data jsonb NOT NULL DEFAULT '{}'::jsonb,
read_at timestamp with time zone,
created_at timestamp with time zone NOT NULL DEFAULT now(),
CONSTRAINT notifications_pkey PRIMARY KEY (id),
CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.recipe_aliases (
id uuid NOT NULL DEFAULT gen_random_uuid(),
recipe_id uuid NOT NULL,
alias_es text NOT NULL,
alias_norm_es text NOT NULL,
created_at timestamp with time zone NOT NULL DEFAULT now(),
CONSTRAINT recipe_aliases_pkey PRIMARY KEY (id),
CONSTRAINT recipe_aliases_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id)
);
CREATE TABLE public.recipe_favorites (
id uuid NOT NULL DEFAULT gen_random_uuid(),
user_id uuid NOT NULL,
recipe_id uuid NOT NULL,
created_at timestamp with time zone NOT NULL DEFAULT now(),
CONSTRAINT recipe_favorites_pkey PRIMARY KEY (id),
CONSTRAINT recipe_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
CONSTRAINT recipe_favorites_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id)
);
CREATE TABLE public.recipe_items (
id uuid NOT NULL DEFAULT gen_random_uuid(),
recipe_id uuid NOT NULL,
ingredient_id uuid NOT NULL,
order_index integer NOT NULL DEFAULT 0,
quantity numeric NOT NULL CHECK (quantity > 0::numeric),
unit USER-DEFINED NOT NULL,
notes text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
CONSTRAINT recipe_items_pkey PRIMARY KEY (id),
CONSTRAINT recipe_items_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id),
CONSTRAINT recipe_items_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id)
);
CREATE TABLE public.recipe_usage_events (
id uuid NOT NULL DEFAULT gen_random_uuid(),
recipe_id uuid NOT NULL,
user_id uuid NOT NULL,
context USER-DEFINED NOT NULL,
used_at timestamp with time zone NOT NULL DEFAULT now(),
event_bucket_10m timestamp with time zone NOT NULL,
is_public_eligible boolean NOT NULL DEFAULT false,
CONSTRAINT recipe_usage_events_pkey PRIMARY KEY (id),
CONSTRAINT recipe_usage_events_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id),
CONSTRAINT recipe_usage_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.recipes (
id uuid NOT NULL DEFAULT gen_random_uuid(),
name_es text NOT NULL,
name_en text,
name_norm_es text NOT NULL,
description_es text,
quality_score numeric NOT NULL DEFAULT 0.7 CHECK (quality_score >= 0::numeric AND quality_score <= 1::numeric),
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
description_en text,
owner_user_id uuid,
source USER-DEFINED NOT NULL DEFAULT 'user'::recipe_source_enum,
visibility USER-DEFINED NOT NULL DEFAULT 'private'::recipe_visibility_enum,
deleted_at timestamp with time zone,
kcal_100 numeric NOT NULL DEFAULT 0,
protein_g_100 numeric NOT NULL DEFAULT 0,
carbs_g_100 numeric NOT NULL DEFAULT 0,
fat_g_100 numeric NOT NULL DEFAULT 0,
published_at timestamp with time zone,
public_slug text,
origin_recipe_id uuid,
uses_total integer NOT NULL DEFAULT 0,
uses_30d integer NOT NULL DEFAULT 0,
uses_7d integer NOT NULL DEFAULT 0,
users_unique_30d integer NOT NULL DEFAULT 0,
saves_total integer NOT NULL DEFAULT 0,
favorites_total integer NOT NULL DEFAULT 0,
popularity_score numeric NOT NULL DEFAULT 0,
CONSTRAINT recipes_pkey PRIMARY KEY (id),
CONSTRAINT recipes_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id),
CONSTRAINT recipes_origin_recipe_id_fkey FOREIGN KEY (origin_recipe_id) REFERENCES public.recipes(id)
);
CREATE TABLE public.resting_hr_logs (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
user_id uuid NOT NULL,
measured_at timestamp with time zone NOT NULL DEFAULT now(),
resting_hr_bpm integer NOT NULL,
source text NOT NULL DEFAULT 'manual'::text,
CONSTRAINT resting_hr_logs_pkey PRIMARY KEY (id),
CONSTRAINT resting_hr_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.session_feedback (
id uuid NOT NULL DEFAULT gen_random_uuid(),
session_id uuid NOT NULL UNIQUE,
user_id uuid NOT NULL,
rpe numeric,
mood smallint CHECK (mood IS NULL OR mood >= 1 AND mood <= 5),
stress smallint CHECK (stress IS NULL OR stress >= 1 AND stress <= 5),
soreness smallint CHECK (soreness IS NULL OR soreness >= 1 AND soreness <= 5),
sleep_quality smallint CHECK (sleep_quality IS NULL OR sleep_quality >= 1 AND sleep_quality <= 5),
notes text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
CONSTRAINT session_feedback_pkey PRIMARY KEY (id),
CONSTRAINT session_feedback_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.activity_sessions(id),
CONSTRAINT session_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.sleep_logs (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
user_id uuid NOT NULL,
sleep_start timestamp with time zone,
sleep_end timestamp with time zone,
duration_min integer,
date date NOT NULL,
quality_score integer,
source text NOT NULL DEFAULT 'manual'::text,
CONSTRAINT sleep_logs_pkey PRIMARY KEY (id),
CONSTRAINT sleep_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.social_follows (
id uuid NOT NULL DEFAULT gen_random_uuid(),
id_follower uuid NOT NULL,
id_followed uuid NOT NULL,
is_accepted boolean DEFAULT false,
created_at timestamp with time zone NOT NULL DEFAULT now(),
CONSTRAINT social_follows_pkey PRIMARY KEY (id_follower, id_followed),
CONSTRAINT social_follows_id_followed_fkey FOREIGN KEY (id_followed) REFERENCES public.users(id),
CONSTRAINT social_follows_id_follower_fkey FOREIGN KEY (id_follower) REFERENCES public.users(id)
);
CREATE TABLE public.tags (
id uuid NOT NULL DEFAULT gen_random_uuid(),
user_id uuid NOT NULL,
name text NOT NULL,
name_norm text NOT NULL,
color text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
CONSTRAINT tags_pkey PRIMARY KEY (id),
CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_goals (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
user_id uuid NOT NULL,
goal_type text NOT NULL,
description text,
target_weight_kg numeric,
target_bodyfat_percent numeric,
target_distance_m numeric,
created_at timestamp with time zone NOT NULL DEFAULT now(),
valid_from date NOT NULL DEFAULT CURRENT_DATE,
valid_to date,
target_time_s integer,
target_power_w integer,
target_calories_kcal integer,
target_protein_g integer,
target_carbs_g integer,
target_fats_g integer,
is_active boolean NOT NULL DEFAULT true,
sport_type text,
CONSTRAINT user_goals_pkey PRIMARY KEY (id),
CONSTRAINT user_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_nutrition_settings (
user_id uuid NOT NULL,
primary_goal USER-DEFINED NOT NULL,
goal_mode USER-DEFINED NOT NULL,
adjustment_type USER-DEFINED NOT NULL,
adjustment_value numeric NOT NULL DEFAULT 0,
activity_level USER-DEFINED NOT NULL,
protein_g_per_kg numeric,
fat_g_per_kg numeric,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
daily_activity USER-DEFINED,
training_frequency USER-DEFINED,
CONSTRAINT user_nutrition_settings_pkey PRIMARY KEY (user_id),
CONSTRAINT user_nutrition_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_preferences (
user_id uuid NOT NULL,
weight_unit USER-DEFINED NOT NULL DEFAULT 'kg'::user_preferences_weight_unit,
distance_unit USER-DEFINED NOT NULL DEFAULT 'km'::user_preferences_distance_unit,
energy_unit USER-DEFINED NOT NULL DEFAULT 'kcal'::user_preferences_energy_unit,
language_code USER-DEFINED NOT NULL DEFAULT 'es'::user_preferences_language_code,
timezone text,
health_data_consent boolean NOT NULL DEFAULT false,
import_health_metrics boolean NOT NULL DEFAULT false,
nutrition_prefs jsonb DEFAULT '{"meal_types": [{"id": "breakfast", "label": "Desayuno", "order": 0, "enabled": true}, {"id": "morning_snack", "label": "Almuerzo", "order": 1, "enabled": true}, {"id": "lunch", "label": "Comida", "order": 2, "enabled": true}, {"id": "afternoon_snack", "label": "Merienda", "order": 3, "enabled": true}, {"id": "dinner", "label": "Cena", "order": 4, "enabled": true}, {"id": "snack", "label": "Snack", "order": 5, "enabled": true}], "snack_behavior": {"treat_as_meal": false, "show_only_if_content": false}}'::jsonb,
pace_unit USER-DEFINED NOT NULL DEFAULT 'min_km'::user_preferences_pace_unit,
temperature_unit text NOT NULL DEFAULT 'celsius'::text,
notification_settings jsonb DEFAULT '{}'::jsonb,
appearance_settings jsonb DEFAULT '{"theme": "system"}'::jsonb,
privacy_settings jsonb DEFAULT '{"profile_public": false, "default_workout_visibility": "private"}'::jsonb,
CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id),
CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
id uuid NOT NULL,
email text NOT NULL UNIQUE,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
date_of_birth date,
sex USER-DEFINED DEFAULT 'male'::users_sex,
height_cm numeric,
display_name text,
avatar_url text,
username text UNIQUE,
onboarding_step integer DEFAULT 0,
CONSTRAINT users_pkey PRIMARY KEY (id),
CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.weight_logs (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
user_id uuid NOT NULL,
measured_at timestamp with time zone NOT NULL DEFAULT now(),
weight_kg numeric NOT NULL,
bodyfat_percent numeric,
muscle_mass_kg numeric,
source text NOT NULL DEFAULT 'manual'::text,
CONSTRAINT weight_logs_pkey PRIMARY KEY (id),
CONSTRAINT weight_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.workout_plans (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
user_id uuid NOT NULL,
planned_date date NOT NULL,
gym_template_id uuid,
endurance_template_id uuid,
status USER-DEFINED NOT NULL DEFAULT 'planned'::workout_plans_status,
notes text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
activity_session_id uuid,
completed_at timestamp with time zone,
CONSTRAINT workout_plans_pkey PRIMARY KEY (id),
CONSTRAINT workout_plans_activity_session_id_fkey FOREIGN KEY (activity_session_id) REFERENCES public.activity_sessions(id),
CONSTRAINT workout_plans_endurance_template_id_fkey FOREIGN KEY (endurance_template_id) REFERENCES public.endurance_workout_templates(id),
CONSTRAINT workout_plans_gym_template_id_fkey FOREIGN KEY (gym_template_id) REFERENCES public.workout_templates(id),
CONSTRAINT workout_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.workout_sets (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
session_id uuid NOT NULL,
user_id uuid NOT NULL,
exercise_id uuid NOT NULL,
set_number integer NOT NULL,
weight_kg numeric NOT NULL DEFAULT 0,
reps integer NOT NULL,
duration_s integer,
rest_s integer,
rpe numeric,
is_warmup boolean NOT NULL DEFAULT false,
is_pr boolean NOT NULL DEFAULT false,
created_at timestamp with time zone NOT NULL DEFAULT now(),
set_type text NOT NULL DEFAULT 'normal'::text,
notes text,
tempo text,
pause_s integer,
distance_m integer,
calories_kcal numeric,
avg_hr_bpm integer,
max_hr_bpm integer,
CONSTRAINT workout_sets_pkey PRIMARY KEY (id),
CONSTRAINT workout_sets_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id),
CONSTRAINT workout_sets_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.activity_sessions(id),
CONSTRAINT workout_sets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.workout_template_exercises (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
workout_template_id uuid NOT NULL,
exercise_id uuid NOT NULL,
order_index integer NOT NULL,
target_sets integer,
target_reps_min integer,
target_reps_max integer,
target_weight_kg numeric,
target_rpe numeric,
notes text,
rest_seconds integer,
user_id uuid,
superset_next_exercise_id uuid,
is_warmup boolean NOT NULL DEFAULT false,
CONSTRAINT workout_template_exercises_pkey PRIMARY KEY (id),
CONSTRAINT workout_template_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id),
CONSTRAINT workout_template_exercises_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
CONSTRAINT workout_template_exercises_workout_template_id_fkey FOREIGN KEY (workout_template_id) REFERENCES public.workout_templates(id),
CONSTRAINT workout_template_exercises_superset_next_same_template_fkey FOREIGN KEY (workout_template_id) REFERENCES public.workout_template_exercises(id),
CONSTRAINT workout_template_exercises_superset_next_same_template_fkey FOREIGN KEY (superset_next_exercise_id) REFERENCES public.workout_template_exercises(id),
CONSTRAINT workout_template_exercises_superset_next_same_template_fkey FOREIGN KEY (workout_template_id) REFERENCES public.workout_template_exercises(workout_template_id),
CONSTRAINT workout_template_exercises_superset_next_same_template_fkey FOREIGN KEY (superset_next_exercise_id) REFERENCES public.workout_template_exercises(workout_template_id)
);
CREATE TABLE public.workout_template_translations (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
workout_template_id uuid,
language_code text,
name text NOT NULL,
description text,
CONSTRAINT workout_template_translations_pkey PRIMARY KEY (id),
CONSTRAINT workout_template_translations_workout_template_id_fkey FOREIGN KEY (workout_template_id) REFERENCES public.workout_templates(id)
);
CREATE TABLE public.workout_templates (
id uuid NOT NULL DEFAULT uuid_generate_v4(),
user_id uuid NOT NULL,
base_name text NOT NULL,
description text,
workout_goal USER-DEFINED,
suggested_day_of_week smallint,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
source text NOT NULL DEFAULT 'user'::text,
CONSTRAINT workout_templates_pkey PRIMARY KEY (id),
CONSTRAINT workout_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
