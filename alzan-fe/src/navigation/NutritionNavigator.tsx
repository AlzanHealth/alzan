import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { NutritionHomeScreen } from '../screens/nutrition/NutritionHomeScreen';
import { MealLogFormScreen } from '../screens/nutrition/MealLogFormScreen';
import { RecipeLibraryScreen } from '../screens/nutrition/RecipeLibraryScreen';
import { NutritionStackParamList } from '../types/navigation.types';

const Stack = createStackNavigator<NutritionStackParamList>();

export const NutritionNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: 'transparent', flex: 1 },
      }}
    >
      <Stack.Screen name="NutritionHome" component={NutritionHomeScreen} />

      <Stack.Screen name="RecipeLibrary" component={RecipeLibraryScreen} />

      <Stack.Screen name="MealLogForm" component={MealLogFormScreen} />
    </Stack.Navigator>
  );
};
