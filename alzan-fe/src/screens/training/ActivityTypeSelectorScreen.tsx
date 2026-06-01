import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { TrainingScreenNavigationProp } from '../../types/navigation.types';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { SPORT_COLORS } from '../../theme/sportColors';
import { SportIcon } from '../../components/icons/SportIcon';
import { ChevronLeft, Dumbbell } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { TranslationKey } from '../../i18n/locales/en';

type ActivityType = {
  id: string;
  label: TranslationKey;
  sportType: string;
  color: string;
  isGym?: boolean;
};

const ACTIVITIES: ActivityType[] = [
  { id: 'running', label: 'constants.running', sportType: 'running', color: SPORT_COLORS.running },
  { id: 'cycling', label: 'constants.cycling', sportType: 'cycling', color: SPORT_COLORS.cycling },
  { id: 'swimming', label: 'constants.swimming', sportType: 'swimming', color: SPORT_COLORS.swimming },
  { id: 'football', label: 'constants.football', sportType: 'football', color: SPORT_COLORS.football },
  { id: 'basketball', label: 'constants.basketball', sportType: 'basketball', color: SPORT_COLORS.basketball },
  { id: 'tennis', label: 'constants.tennis', sportType: 'tennis', color: SPORT_COLORS.tennis },
  { id: 'padel', label: 'constants.padel', sportType: 'padel', color: SPORT_COLORS.padel },
  { id: 'hiking', label: 'constants.hiking', sportType: 'hiking', color: SPORT_COLORS.hiking },
  { id: 'trail', label: 'constants.trail', sportType: 'trail', color: SPORT_COLORS.trail },
  {
    id: 'martial_arts',
    label: 'constants.martialArts',
    sportType: 'martial_arts',
    color: SPORT_COLORS.martial_arts,
  },
  { id: 'climbing', label: 'constants.climbing', sportType: 'climbing', color: SPORT_COLORS.climbing },
  { id: 'volleyball', label: 'constants.volleyball', sportType: 'volleyball', color: SPORT_COLORS.volleyball },
  { id: 'surf', label: 'constants.surfTitle', sportType: 'surf', color: SPORT_COLORS.surf },
  { id: 'skiing', label: 'constants.skiingTitle', sportType: 'skiing', color: SPORT_COLORS.skiing },
  { id: 'gym', label: 'constants.gym', sportType: 'gym', color: SPORT_COLORS.gym, isGym: true },
  { id: 'other', label: 'constants.other', sportType: 'other', color: SPORT_COLORS.other },
];

export const ActivityTypeSelectorScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors } = useTrainingStyles();
  const navigation = useNavigation<TrainingScreenNavigationProp>();

  const handleSelectActivity = (activity: ActivityType) => {
    navigation.navigate('EnduranceSessionForm', { sportType: activity.sportType });
  };

  return (
    <LinearGradient
      colors={[themeColors.gradientStart || themeColors.background, themeColors.gradientEnd || themeColors.background]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ChevronLeft size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, dynamicStyles.headerTitle]}>{t('training.chooseSport')}</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.question, dynamicStyles.title]}>{t('training.whatTrainingToday')}</Text>

          <View style={styles.grid}>
            {ACTIVITIES.map(activity => (
              <TouchableOpacity
                key={activity.id}
                style={[styles.activityCard, dynamicStyles.card]}
                onPress={() => handleSelectActivity(activity)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconContainer, { backgroundColor: activity.color }]}>
                  {activity.isGym ? (
                    <Dumbbell size={32} color="#FFFFFF" />
                  ) : (
                    <SportIcon sport={activity.sportType} size={32} color="#FFFFFF" />
                  )}
                </View>
                <Text style={[styles.activityLabel, dynamicStyles.label]}>{t(activity.label)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
  },
  backButton: {
    padding: spacing.s,
  },
  title: {
    ...typography.h3,
    fontWeight: '700',
  },
  placeholder: {
    width: 40,
  },
  content: {
    padding: spacing.m,
    paddingBottom: 100,
    alignItems: 'center',
  },
  question: {
    ...typography.h3,
    fontWeight: 'bold',
    marginBottom: spacing.xl,
    marginTop: spacing.l,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.l,
  },
  activityCard: {
    width: '40%',
    marginVertical: spacing.s,
    alignItems: 'center',
    padding: spacing.m,
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.l,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  activityLabel: {
    ...typography.body,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
});
