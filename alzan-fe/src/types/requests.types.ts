/**
 * File copied from the root
 * ONLY EDIT IN THE ROOT!
 */

import { Database as DatabaseGenerated, Json } from './database.types';
export type UserFollowNotificationData = {
  follower_id: string;
  follower_name?: string;
  follower_avatar?: string;
  follower_username?: string;
};

export interface NotificationDataMap {
  USER_FOLLOW_REQUEST: UserFollowNotificationData;
  USER_FOLLOW_REQUEST_ACCEPTED: UserFollowNotificationData;
  USER_FOLLOW_REQUEST_REJECTED: UserFollowNotificationData;
}

export type MergeDeep<S, D> = {
  [K in keyof S | keyof D]: K extends keyof D
    ? K extends keyof S
      ? S[K] extends Record<string, unknown>
        ? D[K] extends Record<string, unknown>
          ? MergeDeep<S[K], D[K]>
          : D[K]
        : D[K]
      : D[K]
    : K extends keyof S
      ? S[K]
      : never;
};

export type RecipeSearchScope = 'source' | 'all' | 'users' | 'saved' | 'favorites';

// 1. Appearance
export interface AppearanceSettingsJson {
  theme: 'light' | 'dark' | 'system';
  accessibility: {
    reduceMotion: boolean;
    largeText: boolean;
  };
  /** Keys of the 4 summary cards shown on the Home screen (see HomeCardKey). */
  home_cards?: string[];
  home_mode?: 'compact' | 'detailed';
  home_primary_action?: 'smart_workout' | 'add_meal' | 'log_weight' | 'open_nutrition';
  home_pdf_section_order?: Array<'health' | 'training' | 'nutrition'>;
}

// 2. Notifications
export interface NotificationSettingsJson {
  meals: {
    breakfast: { enabled: boolean; time: string };
    almuerzo: { enabled: boolean; time: string };
    lunch: { enabled: boolean; time: string };
    merienda: { enabled: boolean; time: string };
    dinner: { enabled: boolean; time: string };
  };
  training: {
    scheduled_reminder: boolean;
    scheduled_reminder_time: string;
    inactivity_days: number | null;
    post_workout_summary: boolean;
  };
  health: {
    weight_reminder: 'weekly' | 'custom' | null;
    weight_time: string;
    weight_days: number[];
    hydration: boolean;
    hydration_time: string;
    sleep: boolean;
    sleep_time: string;
  };
  app: {
    general: boolean;
    news: boolean;
    smart_reminders: boolean;
  };
}

// 3. Privacy
export interface PrivacySettingsJson {
  profile_public: boolean;
  default_workout_visibility: 'private' | 'followers' | 'public';
}

// 4. Nutrition
export interface NutritionSettingsJson {
  enabled_meals: Record<string, boolean>;
  snack_behavior: {
    treat_as_meal: boolean;
    show_only_if_content: boolean;
  };
  macro_display: 'per_meal' | 'daily_total';
  copy_mode: 'none' | 'sequential' | 'alternating' | null;
  default_recipe_visibility?: 'private' | 'public';
  recipe_search_scope?: RecipeSearchScope;
  nutrition_day_rollover_time?: string;
  show_diet_calories_only?: boolean;
  show_training_calories_only?: boolean;
  last_visible_week?: string;
  last_planned_training_week?: string;
}

// --- Ingredients & Imports ---
export interface IngredientSource {
  provider: string;
  retrieved_at: string;
  url?: string;
  original_id?: string;
  [key: string]: unknown;
}

export type RecipeSource = 'system' | 'user';
export type RecipeVisibility = 'private' | 'public';
export type RecipeUsageContext = 'meal_log' | 'planner' | 'quick_add';

type PublicSchema = DatabaseGenerated['public'];
type GeneratedTables = PublicSchema['Tables'];
type WearableProvider = PublicSchema['Enums']['wearable_provider_enum'];
type WearableStreamType = PublicSchema['Enums']['stream_type_enum'];

type ProvenanceRow = {
  source_channel: string | null;
  source_package: string | null;
  source_provider_key: string | null;
  raw_payload_id: string | null;
};

type ProvenanceInsert = {
  source_channel?: string | null;
  source_package?: string | null;
  source_provider_key?: string | null;
  raw_payload_id?: string | null;
};

type SourceRecordRow = {
  source_record_id: string | null;
};

type SourceRecordInsert = {
  source_record_id?: string | null;
};

type SourceUpdatedAtRow = {
  source_updated_at: string | null;
};

type SourceUpdatedAtInsert = {
  source_updated_at?: string | null;
};

type ActivitySessionsOverride = {
  Row: GeneratedTables['activity_sessions']['Row'] & {
    elev_loss_m: number | null;
    recovery_time_s: number | null;
    total_steps: number | null;
    vo2_max: number | null;
  } & ProvenanceRow &
    SourceRecordRow &
    SourceUpdatedAtRow;
  Insert: GeneratedTables['activity_sessions']['Insert'] & {
    elev_loss_m?: number | null;
    recovery_time_s?: number | null;
    total_steps?: number | null;
    vo2_max?: number | null;
  } & ProvenanceInsert &
    SourceRecordInsert &
    SourceUpdatedAtInsert;
  Update: GeneratedTables['activity_sessions']['Update'] & {
    elev_loss_m?: number | null;
    recovery_time_s?: number | null;
    total_steps?: number | null;
    vo2_max?: number | null;
  } & ProvenanceInsert &
    SourceRecordInsert &
    SourceUpdatedAtInsert;
  Relationships: GeneratedTables['activity_sessions']['Relationships'];
};

type ActivityStreamsOverride = {
  Row: GeneratedTables['activity_streams']['Row'] & Omit<ProvenanceRow, 'source_provider_key'> & SourceRecordRow;
  Insert: GeneratedTables['activity_streams']['Insert'] &
    Omit<ProvenanceInsert, 'source_provider_key'> &
    SourceRecordInsert;
  Update: GeneratedTables['activity_streams']['Update'] &
    Omit<ProvenanceInsert, 'source_provider_key'> &
    SourceRecordInsert;
  Relationships: GeneratedTables['activity_streams']['Relationships'];
};

type ActivityHeartRateZonesOverride = {
  Row: {
    id: string;
    session_id: string;
    zone: number;
    duration_s: number;
    percentage: number;
    created_at: string;
  };
  Insert: {
    id?: string;
    session_id: string;
    zone: number;
    duration_s: number;
    percentage: number;
    created_at?: string;
  };
  Update: {
    id?: string;
    session_id?: string;
    zone?: number;
    duration_s?: number;
    percentage?: number;
    created_at?: string;
  };
  Relationships: [
    {
      foreignKeyName: 'activity_heart_rate_zones_session_id_fkey';
      columns: ['session_id'];
      isOneToOne: false;
      referencedRelation: 'activity_sessions';
      referencedColumns: ['id'];
    },
  ];
};

type IngredientsOverride = {
  Row: Omit<GeneratedTables['ingredients']['Row'], 'source_primary' | 'source_secondary'> & {
    source_primary: IngredientSource | null;
    source_secondary: IngredientSource | null;
  };
  Insert: Omit<GeneratedTables['ingredients']['Insert'], 'source_primary' | 'source_secondary'> & {
    source_primary?: IngredientSource | null;
    source_secondary?: IngredientSource | null;
  };
  Update: Omit<GeneratedTables['ingredients']['Update'], 'source_primary' | 'source_secondary'> & {
    source_primary?: IngredientSource | null;
    source_secondary?: IngredientSource | null;
  };
  Relationships: GeneratedTables['ingredients']['Relationships'];
};

type UserPreferencesOverride = {
  Row: Omit<
    GeneratedTables['user_preferences']['Row'],
    'appearance_settings' | 'notification_settings' | 'nutrition_prefs' | 'privacy_settings'
  > & {
    appearance_settings: AppearanceSettingsJson | null;
    notification_settings: NotificationSettingsJson | null;
    nutrition_prefs: NutritionSettingsJson | null;
    privacy_settings: PrivacySettingsJson | null;
  };
  Insert: Omit<
    GeneratedTables['user_preferences']['Insert'],
    'appearance_settings' | 'notification_settings' | 'nutrition_prefs' | 'privacy_settings'
  > & {
    appearance_settings?: AppearanceSettingsJson | null;
    notification_settings?: NotificationSettingsJson | null;
    nutrition_prefs?: NutritionSettingsJson | null;
    privacy_settings?: PrivacySettingsJson | null;
  };
  Update: Omit<
    GeneratedTables['user_preferences']['Update'],
    'appearance_settings' | 'notification_settings' | 'nutrition_prefs' | 'privacy_settings'
  > & {
    appearance_settings?: AppearanceSettingsJson | null;
    notification_settings?: NotificationSettingsJson | null;
    nutrition_prefs?: NutritionSettingsJson | null;
    privacy_settings?: PrivacySettingsJson | null;
  };
  Relationships: GeneratedTables['user_preferences']['Relationships'];
};

type NotificationsOverride = {
  Row: Omit<GeneratedTables['notifications']['Row'], 'type' | 'data'> &
    (
      | {
          type: 'USER_FOLLOW_REQUEST';
          data: NotificationDataMap['USER_FOLLOW_REQUEST'];
        }
      | {
          type: 'USER_FOLLOW_REQUEST_ACCEPTED';
          data: NotificationDataMap['USER_FOLLOW_REQUEST_ACCEPTED'];
        }
      | {
          type: 'USER_FOLLOW_REQUEST_REJECTED';
          data: NotificationDataMap['USER_FOLLOW_REQUEST_REJECTED'];
        }
    );
  Insert: Omit<GeneratedTables['notifications']['Insert'], 'type' | 'data'> &
    (
      | {
          type: 'USER_FOLLOW_REQUEST';
          data: NotificationDataMap['USER_FOLLOW_REQUEST'];
        }
      | {
          type: 'USER_FOLLOW_REQUEST_ACCEPTED';
          data: NotificationDataMap['USER_FOLLOW_REQUEST_ACCEPTED'];
        }
      | {
          type: 'USER_FOLLOW_REQUEST_REJECTED';
          data: NotificationDataMap['USER_FOLLOW_REQUEST_REJECTED'];
        }
    );
  Update: Omit<GeneratedTables['notifications']['Update'], 'type' | 'data'> &
    (
      | {
          type?: 'USER_FOLLOW_REQUEST';
          data?: Partial<NotificationDataMap['USER_FOLLOW_REQUEST']>;
        }
      | {
          type?: 'USER_FOLLOW_REQUEST_ACCEPTED';
          data?: Partial<NotificationDataMap['USER_FOLLOW_REQUEST_ACCEPTED']>;
        }
      | {
          type?: 'USER_FOLLOW_REQUEST_REJECTED';
          data?: Partial<NotificationDataMap['USER_FOLLOW_REQUEST_REJECTED']>;
        }
    );
  Relationships: GeneratedTables['notifications']['Relationships'];
};

type RecipesOverride = {
  Row: Omit<GeneratedTables['recipes']['Row'], 'source' | 'visibility'> & {
    source: RecipeSource;
    visibility: RecipeVisibility;
    published_at: string | null;
    public_slug: string | null;
    origin_recipe_id: string | null;
    uses_total: number;
    uses_30d: number;
    uses_7d: number;
    users_unique_30d: number;
    saves_total: number;
    favorites_total: number;
    popularity_score: number;
  };
  Insert: Omit<GeneratedTables['recipes']['Insert'], 'source' | 'visibility'> & {
    source?: RecipeSource;
    visibility?: RecipeVisibility;
    published_at?: string | null;
    public_slug?: string | null;
    origin_recipe_id?: string | null;
    uses_total?: number;
    uses_30d?: number;
    uses_7d?: number;
    users_unique_30d?: number;
    saves_total?: number;
    favorites_total?: number;
    popularity_score?: number;
  };
  Update: Omit<GeneratedTables['recipes']['Update'], 'source' | 'visibility'> & {
    source?: RecipeSource;
    visibility?: RecipeVisibility;
    published_at?: string | null;
    public_slug?: string | null;
    origin_recipe_id?: string | null;
    uses_total?: number;
    uses_30d?: number;
    uses_7d?: number;
    users_unique_30d?: number;
    saves_total?: number;
    favorites_total?: number;
    popularity_score?: number;
  };
  Relationships: GeneratedTables['recipes']['Relationships'];
};

type RecipeUsageEventsOverride = {
  Row: {
    id: string;
    recipe_id: string;
    user_id: string;
    context: RecipeUsageContext;
    used_at: string;
    event_bucket_10m: string;
    is_public_eligible: boolean;
  };
  Insert: {
    id?: string;
    recipe_id: string;
    user_id: string;
    context: RecipeUsageContext;
    used_at?: string;
    event_bucket_10m: string;
    is_public_eligible?: boolean;
  };
  Update: {
    id?: string;
    recipe_id?: string;
    user_id?: string;
    context?: RecipeUsageContext;
    used_at?: string;
    event_bucket_10m?: string;
    is_public_eligible?: boolean;
  };
  Relationships: [
    {
      foreignKeyName: 'recipe_usage_events_recipe_id_fkey';
      columns: ['recipe_id'];
      isOneToOne: false;
      referencedRelation: 'recipes';
      referencedColumns: ['id'];
    },
    {
      foreignKeyName: 'recipe_usage_events_user_id_fkey';
      columns: ['user_id'];
      isOneToOne: false;
      referencedRelation: 'users';
      referencedColumns: ['id'];
    },
  ];
};

type UserConnectionsOverride = {
  Row: Omit<GeneratedTables['user_connections']['Row'], 'access_token' | 'refresh_token' | 'token_expires_at'> & {
    access_token: string | null;
    refresh_token: string | null;
    token_expires_at: string | null;
    connection_kind: 'oauth' | 'local_sdk' | 'file_import';
    status: 'active' | 'revoked' | 'expired' | 'error' | 'paused';
    revoked_at: string | null;
    last_synced_at: string | null;
    last_error: string | null;
  };
  Insert: Omit<GeneratedTables['user_connections']['Insert'], 'access_token' | 'refresh_token' | 'token_expires_at'> & {
    access_token?: string | null;
    refresh_token?: string | null;
    token_expires_at?: string | null;
    connection_kind?: 'oauth' | 'local_sdk' | 'file_import';
    status?: 'active' | 'revoked' | 'expired' | 'error' | 'paused';
    revoked_at?: string | null;
    last_synced_at?: string | null;
    last_error?: string | null;
  };
  Update: Omit<GeneratedTables['user_connections']['Update'], 'access_token' | 'refresh_token' | 'token_expires_at'> & {
    access_token?: string | null;
    refresh_token?: string | null;
    token_expires_at?: string | null;
    connection_kind?: 'oauth' | 'local_sdk' | 'file_import';
    status?: 'active' | 'revoked' | 'expired' | 'error' | 'paused';
    revoked_at?: string | null;
    last_synced_at?: string | null;
    last_error?: string | null;
  };
  Relationships: GeneratedTables['user_connections']['Relationships'];
};

type DailyStepsOverride = {
  Row: GeneratedTables['daily_steps']['Row'] & ProvenanceRow;
  Insert: GeneratedTables['daily_steps']['Insert'] & ProvenanceInsert;
  Update: GeneratedTables['daily_steps']['Update'] & ProvenanceInsert;
  Relationships: GeneratedTables['daily_steps']['Relationships'];
};

type StepIntervalsOverride = {
  Row: GeneratedTables['step_intervals']['Row'] & ProvenanceRow;
  Insert: GeneratedTables['step_intervals']['Insert'] & ProvenanceInsert;
  Update: GeneratedTables['step_intervals']['Update'] & ProvenanceInsert;
  Relationships: GeneratedTables['step_intervals']['Relationships'];
};

type SleepSessionsOverride = {
  Row: GeneratedTables['sleep_sessions']['Row'] & ProvenanceRow & SourceRecordRow;
  Insert: GeneratedTables['sleep_sessions']['Insert'] & ProvenanceInsert & SourceRecordInsert;
  Update: GeneratedTables['sleep_sessions']['Update'] & ProvenanceInsert & SourceRecordInsert;
  Relationships: GeneratedTables['sleep_sessions']['Relationships'];
};

type SleepStageIntervalsOverride = {
  Row: GeneratedTables['sleep_stage_intervals']['Row'] & Omit<ProvenanceRow, 'source_provider_key'> & SourceRecordRow;
  Insert: GeneratedTables['sleep_stage_intervals']['Insert'] &
    Omit<ProvenanceInsert, 'source_provider_key'> &
    SourceRecordInsert;
  Update: GeneratedTables['sleep_stage_intervals']['Update'] &
    Omit<ProvenanceInsert, 'source_provider_key'> &
    SourceRecordInsert;
  Relationships: GeneratedTables['sleep_stage_intervals']['Relationships'];
};

type SleepBiomarkerSamplesOverride = {
  Row: GeneratedTables['sleep_biomarker_samples']['Row'] & Omit<ProvenanceRow, 'source_provider_key'> & SourceRecordRow;
  Insert: GeneratedTables['sleep_biomarker_samples']['Insert'] &
    Omit<ProvenanceInsert, 'source_provider_key'> &
    SourceRecordInsert;
  Update: GeneratedTables['sleep_biomarker_samples']['Update'] &
    Omit<ProvenanceInsert, 'source_provider_key'> &
    SourceRecordInsert;
  Relationships: GeneratedTables['sleep_biomarker_samples']['Relationships'];
};

type DailyRecoveryOverride = {
  Row: GeneratedTables['daily_recovery']['Row'] & ProvenanceRow;
  Insert: GeneratedTables['daily_recovery']['Insert'] & ProvenanceInsert;
  Update: GeneratedTables['daily_recovery']['Update'] & ProvenanceInsert;
  Relationships: GeneratedTables['daily_recovery']['Relationships'];
};

type WeightLogsOverride = {
  Row: GeneratedTables['weight_logs']['Row'] & ProvenanceRow & SourceRecordRow & SourceUpdatedAtRow;
  Insert: GeneratedTables['weight_logs']['Insert'] & ProvenanceInsert & SourceRecordInsert & SourceUpdatedAtInsert;
  Update: GeneratedTables['weight_logs']['Update'] & ProvenanceInsert & SourceRecordInsert & SourceUpdatedAtInsert;
  Relationships: GeneratedTables['weight_logs']['Relationships'];
};

type RestingHrLogsOverride = {
  Row: GeneratedTables['resting_hr_logs']['Row'] & ProvenanceRow & SourceRecordRow & SourceUpdatedAtRow;
  Insert: GeneratedTables['resting_hr_logs']['Insert'] & ProvenanceInsert & SourceRecordInsert & SourceUpdatedAtInsert;
  Update: GeneratedTables['resting_hr_logs']['Update'] & ProvenanceInsert & SourceRecordInsert & SourceUpdatedAtInsert;
  Relationships: GeneratedTables['resting_hr_logs']['Relationships'];
};

type ProviderConnectionTokensTable = {
  Row: {
    id: string;
    connection_id: string;
    user_id: string;
    provider: WearableProvider;
    access_token: string;
    refresh_token: string | null;
    token_type: string | null;
    token_expires_at: string | null;
    scope: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    connection_id: string;
    user_id: string;
    provider: WearableProvider;
    access_token: string;
    refresh_token?: string | null;
    token_type?: string | null;
    token_expires_at?: string | null;
    scope?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    connection_id?: string;
    user_id?: string;
    provider?: WearableProvider;
    access_token?: string;
    refresh_token?: string | null;
    token_type?: string | null;
    token_expires_at?: string | null;
    scope?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [];
};

type ProviderDataOriginsTable = {
  Row: {
    id: string;
    user_id: string;
    source_channel: string;
    provider: WearableProvider;
    source_package: string | null;
    source_provider_key: string | null;
    display_name: string | null;
    platform: string | null;
    device_id: string | null;
    first_seen_at: string;
    last_seen_at: string;
    raw_payload: Json | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    source_channel: string;
    provider: WearableProvider;
    source_package?: string | null;
    source_provider_key?: string | null;
    display_name?: string | null;
    platform?: string | null;
    device_id?: string | null;
    first_seen_at?: string;
    last_seen_at?: string;
    raw_payload?: Json | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    user_id?: string;
    source_channel?: string;
    provider?: WearableProvider;
    source_package?: string | null;
    source_provider_key?: string | null;
    display_name?: string | null;
    platform?: string | null;
    device_id?: string | null;
    first_seen_at?: string;
    last_seen_at?: string;
    raw_payload?: Json | null;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [];
};

type HealthConnectProviderSelectionTable = {
  Row: {
    user_id: string;
    origin_id: string;
    selected_package_name: string;
    selected_provider_key: string | null;
    selected_at: string;
    updated_at: string;
  };
  Insert: {
    user_id: string;
    origin_id: string;
    selected_package_name: string;
    selected_provider_key?: string | null;
    selected_at?: string;
    updated_at?: string;
  };
  Update: {
    user_id?: string;
    origin_id?: string;
    selected_package_name?: string;
    selected_provider_key?: string | null;
    selected_at?: string;
    updated_at?: string;
  };
  Relationships: [];
};

type IntegrationSyncStateTable = {
  Row: {
    id: string;
    user_id: string;
    provider: WearableProvider;
    source_channel: string;
    source_package: string | null;
    sync_domain: string;
    cursor_token: string | null;
    anchor_token: string | null;
    last_success_at: string | null;
    last_attempt_at: string | null;
    last_record_at: string | null;
    status: 'idle' | 'running' | 'success' | 'error' | 'paused' | 'expired';
    last_error: string | null;
    metadata: Json | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    provider: WearableProvider;
    source_channel: string;
    source_package?: string | null;
    sync_domain: string;
    cursor_token?: string | null;
    anchor_token?: string | null;
    last_success_at?: string | null;
    last_attempt_at?: string | null;
    last_record_at?: string | null;
    status?: 'idle' | 'running' | 'success' | 'error' | 'paused' | 'expired';
    last_error?: string | null;
    metadata?: Json | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    user_id?: string;
    provider?: WearableProvider;
    source_channel?: string;
    source_package?: string | null;
    sync_domain?: string;
    cursor_token?: string | null;
    anchor_token?: string | null;
    last_success_at?: string | null;
    last_attempt_at?: string | null;
    last_record_at?: string | null;
    status?: 'idle' | 'running' | 'success' | 'error' | 'paused' | 'expired';
    last_error?: string | null;
    metadata?: Json | null;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [];
};

type ExternalRawPayloadsV2Table = {
  Row: {
    id: string;
    user_id: string;
    provider: WearableProvider;
    source_channel: string;
    source_package: string | null;
    object_type: string;
    source_record_id: string | null;
    payload_hash: string;
    payload: Json | null;
    storage_bucket: string | null;
    storage_path: string | null;
    size_bytes: number | null;
    trace_id: string | null;
    related_table: string | null;
    related_id: string | null;
    received_at: string;
    processed_at: string | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    provider: WearableProvider;
    source_channel: string;
    source_package?: string | null;
    object_type: string;
    source_record_id?: string | null;
    payload_hash: string;
    payload?: Json | null;
    storage_bucket?: string | null;
    storage_path?: string | null;
    size_bytes?: number | null;
    trace_id?: string | null;
    related_table?: string | null;
    related_id?: string | null;
    received_at?: string;
    processed_at?: string | null;
    created_at?: string;
  };
  Update: {
    id?: string;
    user_id?: string;
    provider?: WearableProvider;
    source_channel?: string;
    source_package?: string | null;
    object_type?: string;
    source_record_id?: string | null;
    payload_hash?: string;
    payload?: Json | null;
    storage_bucket?: string | null;
    storage_path?: string | null;
    size_bytes?: number | null;
    trace_id?: string | null;
    related_table?: string | null;
    related_id?: string | null;
    received_at?: string;
    processed_at?: string | null;
    created_at?: string;
  };
  Relationships: [];
};

type ActivityRoutePointsTable = {
  Row: {
    id: string;
    session_id: string;
    user_id: string;
    point_index: number;
    timestamp: string | null;
    offset_s: number | null;
    lat: number;
    lon: number;
    altitude_m: number | null;
    distance_m: number | null;
    speed_mps: number | null;
    horizontal_accuracy_m: number | null;
    vertical_accuracy_m: number | null;
    source: string | null;
    source_channel: string | null;
    source_package: string | null;
    source_record_id: string | null;
    raw_payload_id: string | null;
    raw_payload: Json | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    session_id: string;
    user_id: string;
    point_index: number;
    timestamp?: string | null;
    offset_s?: number | null;
    lat: number;
    lon: number;
    altitude_m?: number | null;
    distance_m?: number | null;
    speed_mps?: number | null;
    horizontal_accuracy_m?: number | null;
    vertical_accuracy_m?: number | null;
    source?: string | null;
    source_channel?: string | null;
    source_package?: string | null;
    source_record_id?: string | null;
    raw_payload_id?: string | null;
    raw_payload?: Json | null;
    created_at?: string;
  };
  Update: {
    id?: string;
    session_id?: string;
    user_id?: string;
    point_index?: number;
    timestamp?: string | null;
    offset_s?: number | null;
    lat?: number;
    lon?: number;
    altitude_m?: number | null;
    distance_m?: number | null;
    speed_mps?: number | null;
    horizontal_accuracy_m?: number | null;
    vertical_accuracy_m?: number | null;
    source?: string | null;
    source_channel?: string | null;
    source_package?: string | null;
    source_record_id?: string | null;
    raw_payload_id?: string | null;
    raw_payload?: Json | null;
    created_at?: string;
  };
  Relationships: [];
};

type ActivityStreamSamplesTable = {
  Row: {
    id: string;
    session_id: string;
    user_id: string;
    stream_type: WearableStreamType;
    timestamp: string | null;
    offset_s: number | null;
    value: number;
    unit: string | null;
    source: string | null;
    source_channel: string | null;
    source_package: string | null;
    source_record_id: string | null;
    raw_payload_id: string | null;
    raw_payload: Json | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    session_id: string;
    user_id: string;
    stream_type: WearableStreamType;
    timestamp?: string | null;
    offset_s?: number | null;
    value: number;
    unit?: string | null;
    source?: string | null;
    source_channel?: string | null;
    source_package?: string | null;
    source_record_id?: string | null;
    raw_payload_id?: string | null;
    raw_payload?: Json | null;
    created_at?: string;
  };
  Update: {
    id?: string;
    session_id?: string;
    user_id?: string;
    stream_type?: WearableStreamType;
    timestamp?: string | null;
    offset_s?: number | null;
    value?: number;
    unit?: string | null;
    source?: string | null;
    source_channel?: string | null;
    source_package?: string | null;
    source_record_id?: string | null;
    raw_payload_id?: string | null;
    raw_payload?: Json | null;
    created_at?: string;
  };
  Relationships: [];
};

type ActivityProviderFieldsTable = {
  Row: {
    session_id: string;
    user_id: string;
    provider: WearableProvider;
    source_channel: string | null;
    source_package: string | null;
    fields: Json;
    raw_metadata: Json | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    session_id: string;
    user_id: string;
    provider: WearableProvider;
    source_channel?: string | null;
    source_package?: string | null;
    fields?: Json;
    raw_metadata?: Json | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    session_id?: string;
    user_id?: string;
    provider?: WearableProvider;
    source_channel?: string | null;
    source_package?: string | null;
    fields?: Json;
    raw_metadata?: Json | null;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [];
};

type ActivityFilesTable = {
  Row: {
    id: string;
    user_id: string;
    session_id: string | null;
    provider: WearableProvider;
    source_channel: string | null;
    source_package: string | null;
    file_type: string;
    storage_bucket: string | null;
    storage_path: string | null;
    file_hash: string | null;
    size_bytes: number | null;
    raw_payload_id: string | null;
    imported_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    session_id?: string | null;
    provider: WearableProvider;
    source_channel?: string | null;
    source_package?: string | null;
    file_type: string;
    storage_bucket?: string | null;
    storage_path?: string | null;
    file_hash?: string | null;
    size_bytes?: number | null;
    raw_payload_id?: string | null;
    imported_at?: string;
  };
  Update: {
    id?: string;
    user_id?: string;
    session_id?: string | null;
    provider?: WearableProvider;
    source_channel?: string | null;
    source_package?: string | null;
    file_type?: string;
    storage_bucket?: string | null;
    storage_path?: string | null;
    file_hash?: string | null;
    size_bytes?: number | null;
    raw_payload_id?: string | null;
    imported_at?: string;
  };
  Relationships: [];
};

type HealthMetricSamplesTable = {
  Row: {
    id: string;
    user_id: string;
    provider: WearableProvider;
    source_channel: string;
    source_package: string | null;
    source_record_id: string | null;
    metric_type: string;
    recorded_at: string;
    local_date: string | null;
    timezone: string | null;
    value: number;
    unit: string;
    sleep_session_id: string | null;
    activity_session_id: string | null;
    raw_payload_id: string | null;
    raw_payload: Json | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    provider: WearableProvider;
    source_channel: string;
    source_package?: string | null;
    source_record_id?: string | null;
    metric_type: string;
    recorded_at: string;
    local_date?: string | null;
    timezone?: string | null;
    value: number;
    unit: string;
    sleep_session_id?: string | null;
    activity_session_id?: string | null;
    raw_payload_id?: string | null;
    raw_payload?: Json | null;
    created_at?: string;
  };
  Update: {
    id?: string;
    user_id?: string;
    provider?: WearableProvider;
    source_channel?: string;
    source_package?: string | null;
    source_record_id?: string | null;
    metric_type?: string;
    recorded_at?: string;
    local_date?: string | null;
    timezone?: string | null;
    value?: number;
    unit?: string;
    sleep_session_id?: string | null;
    activity_session_id?: string | null;
    raw_payload_id?: string | null;
    raw_payload?: Json | null;
    created_at?: string;
  };
  Relationships: [];
};

type Vo2MaxLogsTable = {
  Row: {
    id: string;
    user_id: string;
    measured_at: string;
    value_ml_kg_min: number;
    provider: WearableProvider;
    source_channel: string | null;
    source_package: string | null;
    source_record_id: string | null;
    activity_session_id: string | null;
    raw_payload_id: string | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    measured_at: string;
    value_ml_kg_min: number;
    provider: WearableProvider;
    source_channel?: string | null;
    source_package?: string | null;
    source_record_id?: string | null;
    activity_session_id?: string | null;
    raw_payload_id?: string | null;
    created_at?: string;
  };
  Update: {
    id?: string;
    user_id?: string;
    measured_at?: string;
    value_ml_kg_min?: number;
    provider?: WearableProvider;
    source_channel?: string | null;
    source_package?: string | null;
    source_record_id?: string | null;
    activity_session_id?: string | null;
    raw_payload_id?: string | null;
    created_at?: string;
  };
  Relationships: [];
};

type TableOverrides = {
  activity_sessions: ActivitySessionsOverride;
  activity_streams: ActivityStreamsOverride;
  activity_heart_rate_zones: ActivityHeartRateZonesOverride;
  activity_route_points: ActivityRoutePointsTable;
  activity_stream_samples: ActivityStreamSamplesTable;
  activity_provider_fields: ActivityProviderFieldsTable;
  activity_files: ActivityFilesTable;
  daily_steps: DailyStepsOverride;
  step_intervals: StepIntervalsOverride;
  sleep_sessions: SleepSessionsOverride;
  sleep_stage_intervals: SleepStageIntervalsOverride;
  sleep_biomarker_samples: SleepBiomarkerSamplesOverride;
  daily_recovery: DailyRecoveryOverride;
  weight_logs: WeightLogsOverride;
  resting_hr_logs: RestingHrLogsOverride;
  provider_connection_tokens: ProviderConnectionTokensTable;
  provider_data_origins: ProviderDataOriginsTable;
  health_connect_provider_selection: HealthConnectProviderSelectionTable;
  integration_sync_state: IntegrationSyncStateTable;
  external_raw_payloads_v2: ExternalRawPayloadsV2Table;
  health_metric_samples: HealthMetricSamplesTable;
  vo2_max_logs: Vo2MaxLogsTable;
  user_connections: UserConnectionsOverride;
  ingredients: IngredientsOverride;
  user_preferences: UserPreferencesOverride;
  notifications: NotificationsOverride;
  recipes: RecipesOverride;
  recipe_usage_events: RecipeUsageEventsOverride;
};

type ExtendedTables = Omit<GeneratedTables, keyof TableOverrides> & TableOverrides;

type GeneratedFunctions = PublicSchema['Functions'];

type FunctionOverrides = {
  log_recipe_usage: {
    Args: { p_recipe_id: string; p_context: RecipeUsageContext };
    Returns: undefined;
  };
  publish_recipe: {
    Args: { p_recipe_id: string };
    Returns: undefined;
  };
  unpublish_recipe: {
    Args: { p_recipe_id: string };
    Returns: undefined;
  };
  duplicate_recipe: {
    Args: { p_recipe_id: string };
    Returns: string;
  };
  refresh_recipe_popularity_aggregates: {
    Args: Record<string, never>;
    Returns: undefined;
  };
  ensure_recipe_public_slug: {
    Args: { p_recipe_id: string };
    Returns: string;
  };
  slugify_recipe_name: {
    Args: { p_name: string };
    Returns: string;
  };
};

type ExtendedFunctions = Omit<GeneratedFunctions, keyof FunctionOverrides> & FunctionOverrides;

export type Database = Omit<DatabaseGenerated, 'public'> & {
  public: Omit<PublicSchema, 'Tables' | 'Functions'> & {
    Tables: ExtendedTables;
    Functions: ExtendedFunctions;
  };
};

// Helper to extract Row type for a specific table
// We use a conditional type to handle cases where the table might be missing from the generated types
export type Row<T extends string> = T extends keyof Database['public']['Tables']
  ? Database['public']['Tables'][T]['Row']
  : unknown;

// Helper to extract Insert type for a specific table
export type Insert<T extends string> = T extends keyof Database['public']['Tables']
  ? Database['public']['Tables'][T]['Insert']
  : unknown;

// Helper to extract Update type for a specific table
export type Update<T extends string> = T extends keyof Database['public']['Tables']
  ? Database['public']['Tables'][T]['Update']
  : unknown;

// --- Activity Stream Types ---
export type ActivityStream = Row<'activity_streams'>;
export type ActivityStreamInsert = Insert<'activity_streams'>;
export type ActivityStreamUpdate = Update<'activity_streams'>;

// --- Activity Laps Types ---
export type ActivityLap = Row<'activity_laps'>;
export type ActivityLapInsert = Insert<'activity_laps'>;
export type ActivityLapUpdate = Update<'activity_laps'>;
export type ActivityHeartRateZone = Row<'activity_heart_rate_zones'>;
export type ActivityHeartRateZoneInsert = Insert<'activity_heart_rate_zones'>;
export type ActivityHeartRateZoneUpdate = Update<'activity_heart_rate_zones'>;

export type ActivitySessionSupersetLink = Row<'activity_session_superset_links'>;
export type ActivitySessionSupersetLinkInsert = Insert<'activity_session_superset_links'>;
export type ActivitySessionSupersetLinkUpdate = Update<'activity_session_superset_links'>;

// --- Activity Session Tags ---
export type ActivitySessionTag = Row<'activity_session_tags'>;
export type ActivitySessionTagInsert = Insert<'activity_session_tags'>;
export type ActivitySessionTagUpdate = Update<'activity_session_tags'>;

// --- Devices ---
export type Device = Row<'devices'>;
export type DeviceInsert = Insert<'devices'>;
export type DeviceUpdate = Update<'devices'>;

// --- Diet Templates & Translations ---
export type DietTemplate = Row<'diet_templates'>;
export type DietTemplateInsert = Insert<'diet_templates'>;
export type DietTemplateUpdate = Update<'diet_templates'>;

export type DietTemplateTranslation = Row<'diet_template_translations'>;
export type DietTemplateTranslationInsert = Insert<'diet_template_translations'>;
export type DietTemplateTranslationUpdate = Update<'diet_template_translations'>;

export type DietTemplateMeal = Row<'diet_template_meals'>;
export type DietTemplateMealInsert = Insert<'diet_template_meals'>;
export type DietTemplateMealUpdate = Update<'diet_template_meals'>;

export type DietTemplateMealTranslation = Row<'diet_template_meal_translations'>;
export type DietTemplateMealTranslationInsert = Insert<'diet_template_meal_translations'>;
export type DietTemplateMealTranslationUpdate = Update<'diet_template_meal_translations'>;

// --- Hydration ---
export type DailyHydration = Row<'daily_hydration'>;
export type DailyHydrationInsert = Insert<'daily_hydration'>;
export type DailyHydrationUpdate = Update<'daily_hydration'>;

// --- Exercises & Translations ---
export type Exercise = Row<'exercises'>;
export type ExerciseInsert = Insert<'exercises'>;
export type ExerciseUpdate = Update<'exercises'>;

export type ExerciseTranslation = Row<'exercise_translations'>;
export type ExerciseTranslationInsert = Insert<'exercise_translations'>;
export type ExerciseTranslationUpdate = Update<'exercise_translations'>;

export type ExerciseType = Row<'exercise_types'>;
export type ExerciseTypeInsert = Insert<'exercise_types'>;
export type ExerciseTypeUpdate = Update<'exercise_types'>;

export type ExerciseMedia = Row<'exercise_media'>;
export type ExerciseMediaInsert = Insert<'exercise_media'>;
export type ExerciseMediaUpdate = Update<'exercise_media'>;

// --- Equipment ---
export type Equipment = Row<'equipment'>;
export type EquipmentInsert = Insert<'equipment'>;
export type EquipmentUpdate = Update<'equipment'>;

export type EquipmentTranslation = Row<'equipment_translations'>;
export type EquipmentTranslationInsert = Insert<'equipment_translations'>;
export type EquipmentTranslationUpdate = Update<'equipment_translations'>;

// --- Muscle Groups ---
export type MuscleGroup = Row<'muscle_groups'>;
export type MuscleGroupInsert = Insert<'muscle_groups'>;
export type MuscleGroupUpdate = Update<'muscle_groups'>;

export type MuscleGroupTranslation = Row<'muscle_group_translations'>;
export type MuscleGroupTranslationInsert = Insert<'muscle_group_translations'>;
export type MuscleGroupTranslationUpdate = Update<'muscle_group_translations'>;

// --- External Accounts & Mapping ---
export type ExternalAccount = Row<'external_accounts'>;
export type ExternalAccountInsert = Insert<'external_accounts'>;
export type ExternalAccountUpdate = Update<'external_accounts'>;

export type ExternalActivityMapping = Row<'external_activity_mappings'>;
export type ExternalActivityMappingInsert = Insert<'external_activity_mappings'>;
export type ExternalActivityMappingUpdate = Update<'external_activity_mappings'>;

export type ExternalRawPayload = Row<'external_raw_payloads'>;
export type ExternalRawPayloadInsert = Insert<'external_raw_payloads'>;
export type ExternalRawPayloadUpdate = Update<'external_raw_payloads'>;

export type DbIngredient = Row<'ingredients'>;
export type IngredientInsert = Insert<'ingredients'>;
export type IngredientUpdate = Update<'ingredients'>;

export type IngredientImportBatch = Row<'ingredient_import_batches'>;
export type IngredientImportBatchInsert = Insert<'ingredient_import_batches'>;
export type IngredientImportBatchUpdate = Update<'ingredient_import_batches'>;

export type IngredientUsdaCache = Row<'ingredient_usda_cache'>;
export type IngredientUsdaCacheInsert = Insert<'ingredient_usda_cache'>;
export type IngredientUsdaCacheUpdate = Update<'ingredient_usda_cache'>;

// --- Meal Logs & Items ---
export type MealLog = Row<'meal_logs'>;
export type MealLogInsert = Insert<'meal_logs'>;
export type MealLogUpdate = Update<'meal_logs'>;

export type MealItem = Row<'meal_items'>;
export type MealItemInsert = Insert<'meal_items'>;
export type MealItemUpdate = Update<'meal_items'>;

// --- Recipes ---
export type Recipe = Row<'recipes'>;
export type RecipeInsert = Insert<'recipes'>;
export type RecipeUpdate = Update<'recipes'>;

export type RecipeItem = Row<'recipe_items'>;
export type RecipeItemInsert = Insert<'recipe_items'>;
export type RecipeItemUpdate = Update<'recipe_items'>;

export type RecipeAlias = Row<'recipe_aliases'>;
export type RecipeAliasInsert = Insert<'recipe_aliases'>;
export type RecipeAliasUpdate = Update<'recipe_aliases'>;
export type RecipeUsageEvent = Row<'recipe_usage_events'>;
export type RecipeUsageEventInsert = Insert<'recipe_usage_events'>;
export type RecipeUsageEventUpdate = Update<'recipe_usage_events'>;

// --- Feedback ---
export type SessionFeedback = Row<'session_feedback'>;
export type SessionFeedbackInsert = Insert<'session_feedback'>;
export type SessionFeedbackUpdate = Update<'session_feedback'>;

// --- Tags ---
export type Tag = Row<'tags'>;
export type TagInsert = Insert<'tags'>;
export type TagUpdate = Update<'tags'>;

// --- Users & Goals ---
export type User = Row<'users'>;
export type UserInsert = Insert<'users'>; // Though usually managed by Auth/Triggers
export type UserUpdate = Update<'users'>;

export type UserGoal = Row<'user_goals'>;
export type UserGoalInsert = Insert<'user_goals'>;
export type UserGoalUpdate = Update<'user_goals'>;

export type UserNutritionSetting = Row<'user_nutrition_settings'>;
export type UserNutritionSettingInsert = Insert<'user_nutrition_settings'>;
export type UserNutritionSettingUpdate = Update<'user_nutrition_settings'>;

export type UserPreference = Row<'user_preferences'>;
export type UserPreferenceInsert = Insert<'user_preferences'>;
export type UserPreferenceUpdate = Update<'user_preferences'>;

// --- Notifications ---
export type Notification = Row<'notifications'>;
export type NotificationInsert = Insert<'notifications'>;
export type NotificationUpdate = Update<'notifications'>;

// --- Biometrics ---
export type BodyMeasurement = Row<'body_measurements'>;
export type BodyMeasurementInsert = Insert<'body_measurements'>;
export type BodyMeasurementUpdate = Update<'body_measurements'>;

export type WeightLog = Row<'weight_logs'>;
export type WeightLogInsert = Insert<'weight_logs'>;
export type WeightLogUpdate = Update<'weight_logs'>;

export type DailySteps = Row<'daily_steps'>;
export type DailyStepsInsert = Insert<'daily_steps'>;
export type DailyStepsUpdate = Update<'daily_steps'>;

export type RestingHRLog = Row<'resting_hr_logs'>;
export type RestingHRLogInsert = Insert<'resting_hr_logs'>;
export type RestingHRLogUpdate = Update<'resting_hr_logs'>;

export type SleepLog = Row<'sleep_logs'>;
export type SleepLogInsert = Insert<'sleep_logs'>;
export type SleepLogUpdate = Update<'sleep_logs'>;

// --- Workouts & Activity ---
// Activity Sessions
export type ActivitySession = Row<'activity_sessions'>;
export type ActivitySessionInsert = Insert<'activity_sessions'>;
export type ActivitySessionUpdate = Update<'activity_sessions'>;

// Workout Templates
export type WorkoutTemplate = Row<'workout_templates'>;
export type WorkoutTemplateInsert = Insert<'workout_templates'>;
export type WorkoutTemplateUpdate = Update<'workout_templates'>;

export type WorkoutTemplateExercise = Row<'workout_template_exercises'>;
export type WorkoutTemplateExerciseInsert = Insert<'workout_template_exercises'>;
export type WorkoutTemplateExerciseUpdate = Update<'workout_template_exercises'>;

export type WorkoutTemplateTranslation = Row<'workout_template_translations'>;
export type WorkoutTemplateTranslationInsert = Insert<'workout_template_translations'>;
export type WorkoutTemplateTranslationUpdate = Update<'workout_template_translations'>;

// Workout Plans
export type WorkoutPlan = Row<'workout_plans'>;
export type WorkoutPlanInsert = Insert<'workout_plans'>;
export type WorkoutPlanUpdate = Update<'workout_plans'>;

// Workout Sets
export type WorkoutSet = Row<'workout_sets'>;
export type WorkoutSetInsert = Insert<'workout_sets'>;
export type WorkoutSetUpdate = Update<'workout_sets'>;

// Endurance Templates
export type EnduranceWorkoutTemplate = Row<'endurance_workout_templates'>;
export type EnduranceWorkoutTemplateInsert = Insert<'endurance_workout_templates'>;
export type EnduranceWorkoutTemplateUpdate = Update<'endurance_workout_templates'>;

export type EnduranceWorkoutStep = Row<'endurance_workout_steps'>;
export type EnduranceWorkoutStepInsert = Insert<'endurance_workout_steps'>;
export type EnduranceWorkoutStepUpdate = Update<'endurance_workout_steps'>;

export type EnduranceWorkoutStepProgression = Row<'endurance_workout_step_progressions'>;
export type EnduranceWorkoutStepProgressionInsert = Insert<'endurance_workout_step_progressions'>;
export type EnduranceWorkoutStepProgressionUpdate = Update<'endurance_workout_step_progressions'>;

// --- Database Enums ---
// Enum objects for easy usage throughout the codebase

export type Enum<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];

// Activity & Sessions
export type ActivitySource = Enum<'activity_source_enum'>;
export type ActivityStatus = Enum<'activity_status_enum'>;
export type LapType = Enum<'lap_type_enum'>;
export type Provider = Enum<'provider_enum'>;
export type SportSubtype = string;
export type SportType = Enum<'sport_type_enum'>;
export type StreamType = Enum<'stream_type_enum'>;
export type Visibility = Enum<'visibility_enum'>;

// Hydration
export type DailyActivity = Enum<'daily_activity_enum'>;
export type DailyHydrationSource = Enum<'daily_hydration_source'>;

// Ingredients & Nutrition
export type IngredientsCategory = Enum<'ingredients_category'>;
export type IngredientsUnitBasis = Enum<'ingredients_unit_basis'>;

// Meal Items & Logs
export type MealItemsDataQuality = Enum<'meal_items_data_quality'>;
export type MealItemsOrigin = Enum<'meal_items_origin'>;
export type MealItemsSource = Enum<'meal_items_source'>;
export type MealLogsDataQuality = Enum<'meal_logs_data_quality'>;
export type MealLogsOrigin = Enum<'meal_logs_origin'>;
export type MealType = Enum<'meal_type_enum'>;

// Recipes
export type RecipeItemsUnit = Enum<'recipe_items_unit'>;

// Workouts & Training
export type DurationType = Enum<'duration_type_enum'>;
export type PhaseType = Enum<'phase_type_enum'>;
export type TargetType = Enum<'target_type_enum'>;
export type TrainingFrequency = Enum<'training_frequency_enum'>;
export type WorkoutGoal = Enum<'workout_goal_enum'>;
export type WorkoutPlansStatus = Enum<'workout_plans_status'>;

// User Settings & Preferences
export type ActivityLevel = Enum<'user_nutrition_settings_activity_level'>;
export type AdjustmentType = Enum<'user_nutrition_settings_adjustment_type'>;
export type GoalMode = Enum<'user_nutrition_settings_goal_mode'>;
export type PrimaryGoalMode = Enum<'user_nutrition_settings_primary_goal_mode'>;
export type DistanceUnit = Enum<'user_preferences_distance_unit'>;
export type EnergyUnit = Enum<'user_preferences_energy_unit'>;
export type PaceUnit = Enum<'user_preferences_pace_unit'>;
export type WeightUnit = Enum<'user_preferences_weight_unit'>;

// Biometrics
export type MeasurementType = Enum<'measurement_type_enum'>;

// Users
export type Sex = Enum<'users_sex'>;
export type MaleOrFemale = Extract<Sex, 'male' | 'female'>;

// Notifications
export type NotificationType = Enum<'notification_type'>;

// Localization
export type LanguageCode = Enum<'language_code_enum'>;
