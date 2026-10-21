import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { TrainingHomeScreen } from '../screens/training/TrainingHomeScreen';
import { EnduranceSessionsListScreen } from '../screens/training/EnduranceSessionsListScreen';
import { GymRoutinesListScreen } from '../screens/training/GymRoutinesListScreen';
import { GymRoutineEditorScreen } from '../screens/training/GymRoutineEditorScreen';
import { StartWorkoutScreen } from '../screens/training/StartWorkoutScreen';
import { ActiveWorkoutScreen } from '../screens/training/ActiveWorkoutScreen';
import { FinishWorkoutScreen } from '../screens/training/FinishWorkoutScreen';
import { EnduranceSessionFormScreen } from '../screens/training/EnduranceSessionFormScreen';
import { ExternalActivityLinkingScreen } from '../screens/training/ExternalActivityLinkingScreen';
import { EnduranceSessionDetailScreen } from '../screens/training/EnduranceSessionDetailScreen';
import { CompleteExercisesScreen } from '../screens/training/CompleteExercisesScreen';
import { EnduranceWorkoutBuilderScreen } from '../screens/training/EnduranceWorkoutBuilderScreen';
import { WeeklyPlanScreen } from '../screens/training/WeeklyPlanScreen';
import { ExerciseDetailScreen } from '../screens/training/ExerciseDetailScreen';
import { ExercisePrValuesScreen } from '../screens/training/ExercisePrValuesScreen';
import { ExerciseSearchScreen } from '../screens/training/ExerciseSearchScreen';
import { ExerciseCatalogScreen } from '../screens/training/ExerciseCatalogScreen';
import { ExerciseCatalogCreateScreen } from '../screens/training/ExerciseCatalogCreateScreen';
import { SportTemplatesListScreen } from '../screens/training/SportTemplatesListScreen';
import { ActivityTypeSelectorScreen } from '../screens/training/ActivityTypeSelectorScreen';
import { TrainingPlanImportScreen } from '../screens/training/TrainingPlanImportScreen';
import { TrainingStackParamList } from '../types/navigation.types';

const Stack = createStackNavigator<TrainingStackParamList>();

export const TrainingStack = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, cardStyle: { flex: 1 } }}>
      <Stack.Screen name="TrainingHome" component={TrainingHomeScreen} />

      {/* Gym */}
      <Stack.Screen name="GymRoutinesList" component={GymRoutinesListScreen} />
      <Stack.Screen name="GymRoutineEditor" component={GymRoutineEditorScreen} />
      <Stack.Screen name="ExerciseSearch" component={ExerciseSearchScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="ExerciseCatalog" component={ExerciseCatalogScreen} />
      <Stack.Screen name="ExerciseCatalogCreate" component={ExerciseCatalogCreateScreen} />
      <Stack.Screen name="StartWorkout" component={StartWorkoutScreen} />
      <Stack.Screen
        name="ActiveWorkout"
        component={ActiveWorkoutScreen}
        options={{ gestureEnabled: false, headerShown: false }}
      />
      <Stack.Screen name="FinishWorkout" component={FinishWorkoutScreen} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      <Stack.Screen name="ExercisePrValues" component={ExercisePrValuesScreen} />

      {/* Endurance */}
      <Stack.Screen name="ActivityTypeSelector" component={ActivityTypeSelectorScreen} />
      <Stack.Screen name="EnduranceSessionsList" component={EnduranceSessionsListScreen} />
      <Stack.Screen name="EnduranceSessionForm" component={EnduranceSessionFormScreen} />
      <Stack.Screen name="EnduranceSessionDetail" component={EnduranceSessionDetailScreen} />
      <Stack.Screen name="CompleteExercises" component={CompleteExercisesScreen} />
      <Stack.Screen name="EnduranceWorkoutBuilder" component={EnduranceWorkoutBuilderScreen} />
      <Stack.Screen name="SportTemplatesList" component={SportTemplatesListScreen} />
      <Stack.Screen name="WeeklyPlan" component={WeeklyPlanScreen} />
      <Stack.Screen name="TrainingPlanImport" component={TrainingPlanImportScreen} />

      {/* Planning & Integrations */}
      <Stack.Screen name="ExternalActivityLinking" component={ExternalActivityLinkingScreen} />
    </Stack.Navigator>
  );
};
