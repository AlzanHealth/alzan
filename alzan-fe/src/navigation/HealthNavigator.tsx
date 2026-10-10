import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { HealthHome } from '../modules/health/screens/HealthHome';
import { WeightList } from '../modules/health/screens/WeightList';

import { MeasurementsList } from '../modules/health/screens/MeasurementsList';
import { MeasurementAdd } from '../modules/health/screens/MeasurementAdd';
import { MeasurementDetail } from '../modules/health/screens/MeasurementDetail';
import { SleepList } from '../modules/health/screens/SleepList';
import { SleepAdd } from '../modules/health/screens/SleepAdd';
import { RestingHRList } from '../modules/health/screens/RestingHRList';
import { HealthStatisticsScreen } from '../modules/health/screens/HealthStatisticsScreen';
import { BodyCompositionDetail } from '../modules/health/screens/BodyCompositionDetail';
import { StepsStatisticsScreen } from '../modules/health/screens/StepsStatisticsScreen';
import { CardioEvolutionScreen } from '../modules/health/screens/CardioEvolutionScreen';
import { HealthStackParamList } from '../types/navigation.types';

const Stack = createStackNavigator<HealthStackParamList>();

export const HealthNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', cardStyle: { flex: 1 } }}>
      <Stack.Screen name="HealthHome" component={HealthHome} />
      <Stack.Screen name="CardioEvolution" component={CardioEvolutionScreen} />
      <Stack.Screen name="HealthStatistics" component={HealthStatisticsScreen} />
      <Stack.Screen name="WeightList" component={WeightList} />

      <Stack.Screen name="BodyCompositionDetail" component={BodyCompositionDetail} />
      <Stack.Screen name="MeasurementsList" component={MeasurementsList} />
      <Stack.Screen name="MeasurementDetail" component={MeasurementDetail} />
      <Stack.Screen
        name="MeasurementAdd"
        component={MeasurementAdd}
        options={{ presentation: 'transparentModal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="SleepList" component={SleepList} />
      <Stack.Screen name="SleepAdd" component={SleepAdd} />
      <Stack.Screen name="RestingHRList" component={RestingHRList} />
      <Stack.Screen name="StepsStatistics" component={StepsStatisticsScreen} />
    </Stack.Navigator>
  );
};
