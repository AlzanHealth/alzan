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
  show_diet_calories_only?: boolean;
  show_training_calories_only?: boolean;
  last_visible_week?: string;
  last_planned_training_week?: string;
}
