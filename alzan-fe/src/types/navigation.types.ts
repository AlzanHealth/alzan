import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { ExerciseWithDetails } from './training';
import { PopulatedEnduranceWorkoutTemplate } from '../screens/training/EnduranceSessionFormScreen';
import { ActivitySession, MealType, MeasurementType, SportType } from './requests.types';
import { MetricType } from '../modules/health/components/HealthInteractiveChart';

// ============================================================================
// Root Stack (Top Level)
// ============================================================================

export type RootStackParamList = {
  // Auth Flow
  Auth: undefined;
  ForgotPassword: undefined;
  SignUpEmail: undefined;
  SignUpPassword: { email: string };
  VerifyEmail: { email: string };
  ResetPassword: undefined;

  // Onboarding Flow
  Onboarding: { initialRoute?: string };

  // Main App
  Main: undefined;

  // Modal Screens
  WeightAdd: { date?: string } | undefined;
  StepsAdd: { date?: string } | undefined;

  // Social Screens
  OtherUserProfile: { userId: string };
};

// ============================================================================
// Auth Stack
// ============================================================================

export type AuthStackParamList = {
  Auth: undefined;
  ForgotPassword: undefined;
  SignUpEmail: undefined;
  SignUpPassword: { email: string };
  VerifyEmail: { email: string };
  ResetPassword: undefined;
};

// ============================================================================
// Onboarding Stack
// ============================================================================

export type OnboardingStackParamList = {
  OnboardingLanguage: undefined;
  OnboardingIdentity: undefined;
  OnboardingMetrics: undefined;
  OnboardingGoal: undefined;
  OnboardingPhysical: undefined;
  OnboardingActivity: undefined;
  OnboardingProfile: undefined;
  OnboardingUnits: undefined;
  OnboardingHealth: undefined;
  OnboardingConsent: undefined;
  OnboardingComplete: undefined;
};

// ============================================================================
// Tab Navigator (Main App)
// ============================================================================

export type TabParamList = {
  Home: undefined;
  Training: { screen?: keyof TrainingStackParamList; params?: unknown } | undefined;
  Nutrition: { screen?: keyof NutritionStackParamList; params?: unknown } | undefined;
  Health: { screen?: keyof HealthStackParamList; params?: unknown } | undefined;
  Settings: { screen?: keyof SettingsStackParamList; params?: unknown } | undefined;
};

// ============================================================================
// Training Stack
// ============================================================================

export type TrainingStackParamList = {
  TrainingHome: undefined;
  TrainingSettings: undefined;

  // Gym
  GymRoutinesList: { assignToDate?: string; selectMode?: boolean; targetDate?: string; routineId?: string } | undefined;
  GymRoutineEditor: { templateId?: string; routineId?: string } | undefined;
  ExerciseSearch: {
    onSelect: (exerciseId: string) => void;
    onExerciseSelected?: (exercise: ExerciseWithDetails) => void;
    fromScreen?: string;
    routineId?: string;
    selectionMode?: 'single' | 'multi';
    replacementExerciseName?: string;
    excludedExerciseIds?: string[];
  };
  StartWorkout: { templateId: string; date?: string; planId?: string };
  ActiveWorkout: { sessionId: string };
  FinishWorkout: { sessionId: string };
  ExerciseDetail: { exerciseId?: string; exercise?: ExerciseWithDetails };
  ExercisePrValues: {
    exerciseId: string;
    metric: 'weight' | 'reps' | 'time';
    loadType?: 'bodyweight' | 'external' | 'assisted' | 'mixed' | null;
    exerciseName?: string;
  };

  // Endurance
  ActivityTypeSelector: undefined;
  EnduranceSessionsList: { selectMode?: boolean; targetDate?: string } | undefined;
  EnduranceSessionForm:
    | {
        template?: PopulatedEnduranceWorkoutTemplate;
        templateId?: string;
        sportType?: string;
        gymSessionData?: {
          sessionId?: string;
          name: string;
          exercisesCount: number;
          setsCount: number;
          volumeLoad?: number;
          startTime: string;
          endTime?: string;
          durationSeconds?: number;
        };
        date?: string;
      }
    | undefined;
  EnduranceSessionDetail: { sessionId?: string; session?: ActivitySession };
  CompleteExercises: { sessionId: string };
  EnduranceWorkoutBuilder: { templateId?: string; sportType?: SportType } | undefined;
  SportTemplatesList: { assignToDate?: string } | undefined;
  WeeklyPlan: { date?: string } | undefined;
  TrainingPlanImport: undefined;

  // Planning & Integrations
  ExternalActivityLinking: undefined;
};

// ============================================================================
// Nutrition Stack
// ============================================================================

export type NutritionStackParamList = {
  NutritionHome: { date?: string } | undefined;
  NutritionSettings: undefined;
  MenuImport: undefined;
  ShoppingList: { date?: string } | undefined;
  RecipeLibrary: { date: string; mealType?: MealType } | undefined;
  MealLogForm: {
    date: string;
    mealItem?: { id?: string; name?: string; mealType?: MealType; [key: string]: unknown };
    isExtra?: boolean;
    presetRecipeId?: string;
    presetRecipeName?: string;
    editRecipeId?: string;
    recipeEditorOnly?: boolean;
  };
};

// ============================================================================
// Health Stack
// ============================================================================

export type HealthStackParamList = {
  HealthHome: undefined;
  HealthStatistics: { defaultRange?: string; metric?: string; label?: string } | undefined;
  WeightList: { metric?: MetricType; label?: string; defaultRange?: string } | undefined;
  WeightAdd: { date?: string } | undefined;
  BodyCompositionDetail: undefined;
  MeasurementsList: undefined;
  MeasurementDetail: {
    measurementType?: MeasurementType;
    type?: MeasurementType;
    label?: string;
    defaultType?: MeasurementType;
  };
  MeasurementAdd: { measurementType?: string; date?: string; defaultType?: MeasurementType } | undefined;
  SleepList: undefined;
  SleepAdd: undefined;
  RestingHRList: undefined;
  StepsStatistics: { fromHome?: boolean } | undefined;
};

// ============================================================================
// Settings Stack
// ============================================================================

export type SettingsStackParamList = {
  SettingsHome: undefined;
  ProfileSettings: undefined;
  ObjectivesSettings: undefined;
  NotificationsSettings: undefined;
  ConnectedApps: undefined;
  PrivacyData: undefined;
  AppearanceSettings: undefined;
  Support: undefined;
  Legal: undefined;
  DataExport: undefined;
  DeleteAccount: undefined;
  TrainingSettings: undefined;
  NutritionSettings: undefined;
  HealthSettings: undefined;
  HomeSettings: undefined;
  HomeCards: undefined;
  StatsGlobal: undefined;
};

export type AlzanStackParamList = {
  AlzanProfile: { userId: string };
};

// ============================================================================
// Navigation Props (Helper Types)
// ============================================================================

// Auth screens can navigate within auth stack
export type AuthScreenNavigationProp = StackNavigationProp<AuthStackParamList>;

export type AlzanScreenNavigationProp = StackNavigationProp<AlzanStackParamList>;

// Onboarding screens can navigate within onboarding stack
export type OnboardingScreenNavigationProp = StackNavigationProp<OnboardingStackParamList>;

// Training screens can navigate within training stack AND to Settings tab
export type TrainingScreenNavigationProp = CompositeNavigationProp<
  StackNavigationProp<TrainingStackParamList>,
  CompositeNavigationProp<BottomTabNavigationProp<TabParamList>, StackNavigationProp<SettingsStackParamList>>
>;

// Nutrition screens can navigate within nutrition stack AND to Settings tab
export type NutritionScreenNavigationProp = CompositeNavigationProp<
  StackNavigationProp<NutritionStackParamList>,
  CompositeNavigationProp<BottomTabNavigationProp<TabParamList>, StackNavigationProp<SettingsStackParamList>>
>;

// Health screens can navigate within health stack AND to Tab Navigator
export type HealthScreenNavigationProp = CompositeNavigationProp<
  StackNavigationProp<HealthStackParamList>,
  CompositeNavigationProp<BottomTabNavigationProp<TabParamList>, StackNavigationProp<RootStackParamList>>
>;

// Settings screens can navigate within settings stack
export type SettingsScreenNavigationProp = StackNavigationProp<SettingsStackParamList>;

// Home screen can navigate to tabs and nested screens
export type HomeScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList>,
  CompositeNavigationProp<
    StackNavigationProp<TrainingStackParamList>,
    CompositeNavigationProp<
      StackNavigationProp<NutritionStackParamList>,
      CompositeNavigationProp<StackNavigationProp<HealthStackParamList>, StackNavigationProp<SettingsStackParamList>>
    >
  >
>;
