import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formLayout } from '../../components/common/formLayout';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import { supabase } from '../../lib/supabaseClient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { computeActivityLevel } from '../../hooks/useOnboarding';
import { computeKcalAndMacros } from '../../modules/nutrition/algorithms/nutritionCalculator';
import {
  DailyActivity,
  DistanceUnit,
  Sex,
  TrainingFrequency,
  UserGoalUpdate,
  WeightUnit,
} from '../../types/requests.types';
import { Styles, useSettingsStyles } from '../../hooks/useSettingsStyles';
import { useSettingsProfile } from '../../hooks/settings/useSettingsProfile';
import { usePreferencesContext } from '../../context/PreferencesContext';
import { isValid, parse, format } from 'date-fns';
import { User, Check, ChevronDown } from 'lucide-react-native';
import { getMyAvatarSignedUrl } from '../../services/avatar';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { ThemeColors } from '../../context/ThemeContext';
import { Locale, getValidLocale, getLocaleOptions } from '../../i18n';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { convertLengthToUi, parseLengthToCm } from '../../utils/unitConversionUtils';
import { SettingsStackParamList } from '../../navigation/SettingsNavigator';
import { DECIMAL_INPUT_PROPS } from '../../utils/numericInput';

// --- Helper Components ---

const SectionHeader = ({ title, dynamicStyle }: { title: string; dynamicStyle?: TextStyle }) => (
  <Text style={[styles.sectionHeader, dynamicStyle]}>{title.toUpperCase()}</Text>
);

type ProfileFormSnapshot = {
  displayName: string;
  dob: string;
  height: string;
  sex: Sex;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  languageCode: Locale;
  dailyActivity: DailyActivity;
  trainingFrequency: TrainingFrequency;
};

const snapshotsEqual = (a: ProfileFormSnapshot | null, b: ProfileFormSnapshot): boolean =>
  !!a &&
  a.displayName === b.displayName &&
  a.dob === b.dob &&
  a.height === b.height &&
  a.sex === b.sex &&
  a.weightUnit === b.weightUnit &&
  a.distanceUnit === b.distanceUnit &&
  a.languageCode === b.languageCode &&
  a.dailyActivity === b.dailyActivity &&
  a.trainingFrequency === b.trainingFrequency;

const UnitOption = ({
  label,
  selected,
  onSelect,
  themeColors,
  dynamicStyles,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  themeColors: ThemeColors;
  dynamicStyles: Styles;
}) => (
  <TouchableOpacity
    style={[
      styles.unitOption,
      { backgroundColor: themeColors.background },
      selected && [styles.unitOptionSelected, dynamicStyles.optionSelected],
    ]}
    onPress={onSelect}
  >
    <Text
      style={[
        styles.unitOptionText,
        { color: themeColors.textSecondary },
        selected && [styles.unitOptionTextSelected, { color: themeColors.primary }],
      ]}
    >
      {label}
    </Text>
    {selected && <Check size={16} color={themeColors.primary} />}
  </TouchableOpacity>
);

const UnitRow = <T extends WeightUnit | DistanceUnit>({
  label,
  options,
  value,
  onChange,
  themeColors,
  dynamicStyles,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  themeColors: ThemeColors;
  dynamicStyles: Styles;
}) => (
  <View style={styles.unitRow}>
    <Text style={[styles.unitLabel, { color: themeColors.textPrimary }]}>{label}</Text>
    <View style={styles.unitOptions}>
      {options.map(opt => (
        <UnitOption
          key={opt.value}
          label={opt.label}
          selected={value === opt.value}
          onSelect={() => onChange(opt.value)}
          themeColors={themeColors}
          dynamicStyles={dynamicStyles}
        />
      ))}
    </View>
  </View>
);

const DropdownRow = <T extends string>({
  label,
  options,
  value,
  onChange,
  themeColors,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  themeColors: ThemeColors;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find(opt => opt.value === value);

  return (
    <View style={styles.dropdownContainer}>
      <Text style={[styles.unitLabel, styles.dropdownLabel, { color: themeColors.textPrimary }]}>{label}</Text>
      <View>
        <TouchableOpacity
          style={[styles.dropdownButton, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
          onPress={() => setIsOpen(!isOpen)}
        >
          <Text style={[styles.dropdownButtonText, { color: themeColors.textPrimary }]}>
            {selectedOption?.label || 'Select...'}
          </Text>
          <ChevronDown
            size={20}
            color={themeColors.textSecondary}
            style={[styles.dropdownIcon, isOpen && styles.dropdownIconOpen]}
          />
        </TouchableOpacity>

        {isOpen && (
          <View
            style={[styles.dropdownMenu, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
          >
            {options.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.dropdownMenuItem,
                  value === opt.value && { backgroundColor: themeColors.surfaceHighlight },
                ]}
                onPress={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownMenuItemText,
                    { color: themeColors.textPrimary },
                    value === opt.value && { color: themeColors.primary, fontWeight: '600' },
                  ]}
                >
                  {opt.label}
                </Text>
                {value === opt.value && <Check size={16} color={themeColors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const formatInputNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '';
  }

  return Number.isInteger(value) ? `${value}` : value.toString();
};

const parseInputNumber = (value: string): number | null => {
  const parsed = parseFloat(value.replace(',', '.'));
  return Number.isNaN(parsed) ? null : parsed;
};

const sanitizeNumericInput = (value: string): string => {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const [integerPart, ...decimalParts] = normalized.split('.');
  if (decimalParts.length === 0) {
    return integerPart;
  }

  return `${integerPart}.${decimalParts.join('')}`;
};

const getHeightPrecision = (distanceUnit: DistanceUnit) => (distanceUnit === 'km' ? 0 : 1);

const formatHeightForInput = (heightCm: number | null, distanceUnit: DistanceUnit): string => {
  if (heightCm === null) {
    return '';
  }

  const converted = convertLengthToUi(heightCm, distanceUnit, getHeightPrecision(distanceUnit));
  return formatInputNumber(converted.value);
};

// --- Main Component ---

export default function ProfileSettingsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<StackNavigationProp<SettingsStackParamList, 'ProfileSettings'>>();
  const { user } = useAuth();
  const { styles: dynamicStyles, colors, isDark } = useSettingsStyles();
  const { profile, loading, updating, updateProfile } = useSettingsProfile();
  const {
    preferences: globalPrefs,
    updatePreferences: updateGlobalPrefs,
    updating: updatingGlobal,
  } = usePreferencesContext();
  const queryClient = useQueryClient();

  // Notifications hook for Meal Schedule - Removed
  // const { settings: notifSettings, updateMealReminder, loading: loadingNotifs } = useSettingsNotifications();

  const [displayName, setDisplayName] = useState('');
  const [dob, setDob] = useState('');
  const [height, setHeight] = useState('');
  const [sex, setSex] = useState<Sex>('prefer_not_to_say');

  // Units state - synced with global preferences
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(globalPrefs?.weight_unit || 'kg');
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(globalPrefs?.distance_unit || 'km');
  const [languageCode, setLanguageCode] = useState<Locale>(() => getValidLocale(globalPrefs?.language_code));
  const previousDistanceUnitRef = useRef<DistanceUnit>(distanceUnit);

  // Time Picker State - Removed
  // const [showTimePicker, setShowTimePicker] = useState(false);
  // const [selectedMeal, setSelectedMeal] = useState<keyof NotificationSettings['meals'] | null>(null);
  // const [tempDate, setTempDate] = useState(new Date());

  // Avatar state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Activity Level state (Two-Step)
  const [dailyActivity, setDailyActivity] = useState<DailyActivity>('sedentary');
  const [trainingFrequency, setTrainingFrequency] = useState<TrainingFrequency>('occasional');
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [savedSnapshot, setSavedSnapshot] = useState<ProfileFormSnapshot | null>(null);
  const initialSnapshotCapturedRef = useRef(false);

  const heightUnit = distanceUnit === 'km' ? 'cm' : 'in';
  const heightRange = useMemo(() => {
    const precision = getHeightPrecision(distanceUnit);
    return {
      min: convertLengthToUi(100, distanceUnit, precision).value,
      max: convertLengthToUi(250, distanceUnit, precision).value,
    };
  }, [distanceUnit]);

  const heightPlaceholder = useMemo(
    () => formatInputNumber(convertLengthToUi(175, distanceUnit, getHeightPrecision(distanceUnit)).value),
    [distanceUnit],
  );

  const currentSnapshot = useMemo<ProfileFormSnapshot>(
    () => ({
      displayName,
      dob,
      height,
      sex,
      weightUnit,
      distanceUnit,
      languageCode,
      dailyActivity,
      trainingFrequency,
    }),
    [dailyActivity, displayName, distanceUnit, dob, height, languageCode, sex, trainingFrequency, weightUnit],
  );

  const hasUnsavedChanges = !snapshotsEqual(savedSnapshot, currentSnapshot);

  // Sync avatar when profile loads

  useEffect(() => {
    const loadAvatar = async () => {
      if (profile?.avatar_url) {
        // Check if it's already a full URL (e.g. google auth)
        if (profile.avatar_url.startsWith('http')) {
          setAvatarUrl(profile.avatar_url);
        } else {
          // It's a path, get signed URL
          const signed = await getMyAvatarSignedUrl(profile.avatar_url);
          if (signed) setAvatarUrl(signed);
        }
      }
    };
    loadAvatar();
  }, [profile?.avatar_url]);

  // Sync with global preferences when they change
  useEffect(() => {
    if (globalPrefs) {
      setWeightUnit(globalPrefs.weight_unit);
      setDistanceUnit(globalPrefs.distance_unit);
      setLanguageCode(getValidLocale(globalPrefs.language_code));
    }
  }, [globalPrefs]);

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      // Convert YYYY-MM-DD from DB to DD-MM-YYYY for display
      if (profile.date_of_birth) {
        try {
          const parsed = parse(profile.date_of_birth, 'yyyy-MM-dd', new Date());
          if (isValid(parsed)) {
            setDob(format(parsed, 'dd-MM-yyyy'));
          } else {
            setDob(profile.date_of_birth);
          }
        } catch (_error) {
          setDob(profile.date_of_birth);
        }
      } else {
        setDob('');
      }
      setHeight(formatHeightForInput(profile.height_cm, previousDistanceUnitRef.current));
      setSex(profile.sex || 'prefer_not_to_say');
    }
  }, [profile]);

  useEffect(() => {
    const previousUnit = previousDistanceUnitRef.current;
    if (previousUnit === distanceUnit) {
      return;
    }

    const heightValue = parseInputNumber(height);
    if (heightValue !== null) {
      const heightCm = parseLengthToCm(heightValue, previousUnit);
      setHeight(formatHeightForInput(heightCm, distanceUnit));
    }

    previousDistanceUnitRef.current = distanceUnit;
  }, [distanceUnit, height]);

  // Fetch activity levels from user_nutrition_settings
  useEffect(() => {
    const fetchActivityLevels = async () => {
      try {
        if (!user) return;

        const { data, error } = await supabase
          .from('user_nutrition_settings')
          .select('daily_activity, training_frequency')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!error && data) {
          if (data.daily_activity) setDailyActivity(data.daily_activity as DailyActivity);
          if (data.training_frequency) setTrainingFrequency(data.training_frequency as TrainingFrequency);
        }
      } catch (err) {
        console.error('Error fetching activity levels:', err);
      } finally {
        setLoadingActivity(false);
      }
    };
    fetchActivityLevels();
  }, [user]);

  useEffect(() => {
    if (loading || loadingActivity || !profile || !globalPrefs || initialSnapshotCapturedRef.current) {
      return;
    }

    setSavedSnapshot(currentSnapshot);
    initialSnapshotCapturedRef.current = true;
  }, [currentSnapshot, globalPrefs, loading, loadingActivity, profile]);

  const pickImage = () => {
    Alert.alert(t('settings.changePhotoSoonTitle'), t('settings.changePhotoSoonMessage'));
  };

  const handleSave = useCallback(async () => {
    // Validation
    const parsedHeight = parseInputNumber(height);
    if (height && (parsedHeight === null || parsedHeight < heightRange.min || parsedHeight > heightRange.max)) {
      Alert.alert(
        t('common.error'),
        t('onboarding.validHeightRangeWithUnit', {
          min: heightRange.min,
          max: heightRange.max,
          unit: heightUnit,
        }),
      );
      return;
    }

    let formattedDobForDb = null;
    if (dob) {
      // Parse DD-MM-YYYY input
      const parsedDate = parse(dob, 'dd-MM-yyyy', new Date());
      if (!isValid(parsedDate)) {
        Alert.alert(t('common.error'), t('settings.invalidDateFormatDmy'));
        return;
      }
      if (parsedDate > new Date()) {
        Alert.alert(t('common.error'), t('settings.birthDateFutureError'));
        return;
      }
      // Convert back to YYYY-MM-DD for DB
      formattedDobForDb = format(parsedDate, 'yyyy-MM-dd');
    }

    // Update profile data (name, dob, height, sex)
    await updateProfile({
      display_name: displayName,
      date_of_birth: formattedDobForDb,
      height_cm: parsedHeight !== null ? parseLengthToCm(parsedHeight, distanceUnit) : null,
      sex,
    });

    // Update units and language via global preferences (optimistic, immediate)
    await updateGlobalPrefs({
      weight_unit: weightUnit,
      distance_unit: distanceUnit,
      language_code: languageCode,
    });

    // Calculate combined activity level
    const computedActivityLevel = computeActivityLevel(dailyActivity, trainingFrequency);

    // Update activity levels in user_nutrition_settings
    try {
      if (user) {
        // 6. Update user_nutrition_settings
        const { error: settingsError } = await supabase
          .from('user_nutrition_settings')
          .update({
            activity_level: computedActivityLevel,
            daily_activity: dailyActivity,
            training_frequency: trainingFrequency,
          })
          .eq('user_id', user.id);

        if (settingsError) throw settingsError;

        // --- AUTO-CALCULATION LOGIC START ---
        // Fetch User Profile for Calculation (Height, Sex, DOB)
        const { data: userDataProfile } = await supabase
          .from('users')
          .select('sex, date_of_birth, height_cm')
          .eq('id', user.id)
          .single();

        // Fetch Latest Weight
        const { data: weightData } = await supabase
          .from('weight_logs')
          .select('weight_kg')
          .eq('user_id', user.id)
          .order('measured_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Fetch Current Nutrition Goal Settings (to know the goal mode)
        const { data: nutritionSettings } = await supabase
          .from('user_nutrition_settings')
          .select('goal_mode, adjustment_type, adjustment_value, protein_g_per_kg')
          .eq('user_id', user.id)
          .single();

        if (userDataProfile && weightData && nutritionSettings) {
          const result = computeKcalAndMacros(
            {
              sex: userDataProfile.sex!,
              date_of_birth: userDataProfile.date_of_birth!,
              height_cm: userDataProfile.height_cm!,
              weight_kg: weightData.weight_kg,
            },
            {
              activity_level: computedActivityLevel,
              daily_activity: dailyActivity,
              training_frequency: trainingFrequency,
              goal_mode: nutritionSettings.goal_mode || 'maintain',
              adjustment_type: nutritionSettings.adjustment_type || 'percent',
              adjustment_value: nutritionSettings.adjustment_value || 0,
              protein_g_per_kg: nutritionSettings.protein_g_per_kg,
              fat_g_per_kg: null,
            },
          );

          // Update user_goals with new macros
          const updateData: UserGoalUpdate = {
            target_calories_kcal: result.target_kcal,
            target_protein_g: result.protein_g,
            target_carbs_g: result.carbs_g,
            target_fats_g: result.fat_g,
            // We don't change the description/focus here, just macros
          };

          // Find existing nutrition goal id
          const { data: existingGoal } = await supabase
            .from('user_goals')
            .select('id')
            .eq('user_id', user.id)
            .eq('goal_type', 'nutrition')
            .maybeSingle();

          if (existingGoal) {
            await supabase.from('user_goals').update(updateData).eq('id', existingGoal.id);
          } else {
            await supabase.from('user_goals').insert({
              user_id: user.id,
              goal_type: 'nutrition',
              ...updateData,
            });
          }

          // Invalidate queries to refresh UI
          queryClient.invalidateQueries({ queryKey: ['globalNutritionGoals'] });
        }
        // --- AUTO-CALCULATION LOGIC END ---
      }
    } catch (err) {
      console.error('Error saving activity levels or recalculating macros:', err);
    }

    setSavedSnapshot(currentSnapshot);
  }, [
    currentSnapshot,
    dailyActivity,
    displayName,
    distanceUnit,
    dob,
    height,
    heightRange.max,
    heightRange.min,
    heightUnit,
    languageCode,
    queryClient,
    sex,
    t,
    trainingFrequency,
    updateGlobalPrefs,
    updateProfile,
    user,
    weightUnit,
  ]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        hasUnsavedChanges ? (
          <TouchableOpacity
            style={styles.headerSaveButton}
            onPress={handleSave}
            disabled={updating || updatingGlobal}
            accessibilityRole="button"
            accessibilityLabel={t('common.save')}
          >
            {updating || updatingGlobal ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.headerSaveText, { color: colors.primary }]}>{t('common.save')}</Text>
            )}
          </TouchableOpacity>
        ) : null,
    });
  }, [colors.primary, handleSave, hasUnsavedChanges, navigation, t, updating, updatingGlobal]);

  const handleDateChange = (text: string) => {
    // Allow only numbers and hyphens
    const cleaned = text.replace(/[^0-9]/g, '');
    let formatted = cleaned;

    // Input mask for DD-MM-YYYY
    if (cleaned.length > 2) {
      formatted = cleaned.slice(0, 2) + '-' + cleaned.slice(2);
    }
    if (cleaned.length > 4) {
      formatted = formatted.slice(0, 5) + '-' + formatted.slice(5);
    }
    if (formatted.length > 10) {
      formatted = formatted.slice(0, 10);
    }
    setDob(formatted);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Profile Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>{t('settings.profileAllCaps')}</Text>
            <View style={[styles.card, dynamicStyles.card]}>
              {/* Avatar */}
              <View style={styles.avatarContainer}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <User size={40} color={colors.textSecondary} />
                  </View>
                )}
                <TouchableOpacity style={styles.changeAvatarButton} onPress={pickImage}>
                  <Text style={styles.changeAvatarText}>{t('settings.changePhoto')}</Text>
                </TouchableOpacity>
              </View>

              {/* Name */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, dynamicStyles.label]}>{t('onboarding.displayName')}</Text>
                <TextInput
                  style={[styles.input, dynamicStyles.input]}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder={t('settings.yourName')}
                  placeholderTextColor={dynamicStyles.inputPlaceholder}
                />
              </View>

              {/* Username */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, dynamicStyles.label]}>{t('settings.username')}</Text>
                <TextInput
                  style={[styles.input, dynamicStyles.input, styles.disabledInput]}
                  value={profile?.username ? `@${profile.username}` : ''}
                  placeholder={t('settings.usernamePlaceholder')}
                  placeholderTextColor={dynamicStyles.inputPlaceholder}
                  editable={false}
                />
              </View>

              {/* Email */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, dynamicStyles.label]}>{t('settings.emailReadOnly')}</Text>
                <TextInput
                  style={[styles.input, dynamicStyles.input, styles.disabledInput]}
                  value={profile?.email || ''}
                  placeholderTextColor={dynamicStyles.inputPlaceholder}
                  editable={false}
                />
              </View>
            </View>
          </View>

          {/* Personal Data Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>{t('settings.personalData')}</Text>
            <View style={[styles.card, dynamicStyles.card]}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, dynamicStyles.label]}>{t('onboarding.birthDate')}</Text>
                <TextInput
                  style={[styles.input, dynamicStyles.input]}
                  value={dob}
                  onChangeText={handleDateChange}
                  placeholder="DD-MM-YYYY"
                  placeholderTextColor={dynamicStyles.inputPlaceholder}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, dynamicStyles.label]}>{t('onboarding.sex')}</Text>
                <View style={styles.sexContainer}>
                  {(['male', 'female', 'other', 'prefer_not_to_say'] as const).map(option => (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.sexOption,
                        { backgroundColor: colors.background },
                        sex === option && [styles.sexOptionSelected, { backgroundColor: colors.primary }],
                      ]}
                      onPress={() => setSex(option)}
                    >
                      <Text
                        style={[
                          styles.sexText,
                          { color: colors.textPrimary },
                          sex === option && [styles.sexTextSelected, { color: colors.white }],
                        ]}
                      >
                        {option === 'male'
                          ? t('settings.genderMale')
                          : option === 'female'
                            ? t('settings.genderFemaleAlt')
                            : option === 'other'
                              ? t('constants.other')
                              : t('settings.preferNotToSay')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, dynamicStyles.label]}>
                  {t('onboarding.heightWithUnit', { unit: heightUnit })}
                </Text>
                <TextInput
                  style={[styles.input, dynamicStyles.input]}
                  value={height}
                  onChangeText={value => setHeight(sanitizeNumericInput(value))}
                  placeholder={t('onboarding.exampleValue', { value: heightPlaceholder })}
                  placeholderTextColor={dynamicStyles.inputPlaceholder}
                  {...DECIMAL_INPUT_PROPS}
                />
              </View>
            </View>
          </View>

          {/* Units Section */}
          <View style={styles.section}>
            <SectionHeader title={t('settings.unitsMetrics')} dynamicStyle={dynamicStyles.sectionHeader} />
            <View style={[styles.card, dynamicStyles.card]}>
              <UnitRow
                label={t('settings.weight')}
                value={weightUnit}
                onChange={v => setWeightUnit(v)}
                options={[
                  { value: 'kg', label: t('health.unitKg') },
                  { value: 'lb', label: t('onboarding.unitLb') },
                ]}
                themeColors={colors}
                dynamicStyles={dynamicStyles}
              />
              <View style={[styles.divider, dynamicStyles.divider]} />
              <UnitRow
                label={t('settings.distance')}
                value={distanceUnit}
                onChange={v => setDistanceUnit(v)}
                options={[
                  { value: 'km', label: t('onboarding.unitKm') },
                  { value: 'miles', label: t('onboarding.unitMi') },
                ]}
                themeColors={colors}
                dynamicStyles={dynamicStyles}
              />
            </View>
          </View>

          {/* Language Section */}
          <View style={styles.section}>
            <SectionHeader title={t('settings.language')} dynamicStyle={dynamicStyles.sectionHeader} />
            <View style={[styles.card, dynamicStyles.card]}>
              <DropdownRow
                label={t('settings.appLanguage')}
                value={languageCode}
                onChange={v => setLanguageCode(v)}
                options={getLocaleOptions()}
                themeColors={colors}
              />
            </View>
          </View>

          {/* Daily Activity Section (NEAT) */}
          <View style={styles.section}>
            <SectionHeader title={t('settings.dailyLife')} dynamicStyle={dynamicStyles.sectionHeader} />
            <View style={[styles.card, dynamicStyles.card]}>
              <Text style={[styles.label, dynamicStyles.label, { marginBottom: spacing.s }]}>
                {t('settings.activityLevelQuery')}
              </Text>
              <View style={styles.activityLevelContainer}>
                {(
                  [
                    {
                      value: 'sedentary',
                      label: t('settings.sedentary'),
                      desc: t('settings.sedentaryJobDesc'),
                    },
                    {
                      value: 'active',
                      label: t('settings.activeStanding'),
                      desc: t('settings.activeJobDesc'),
                    },
                    {
                      value: 'physical',
                      label: t('settings.physicalExigent'),
                      desc: t('settings.physicalJobDesc'),
                    },
                  ] as const
                ).map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.activityOption,
                      { backgroundColor: colors.background },
                      dailyActivity === option.value && [
                        styles.activityOptionSelected,
                        {
                          borderColor: colors.primary,
                          backgroundColor: isDark ? colors.surface : '#E8F4FD',
                        },
                      ],
                    ]}
                    onPress={() => setDailyActivity(option.value)}
                  >
                    <Text
                      style={[
                        styles.activityOptionLabel,
                        { color: colors.textPrimary },
                        dailyActivity === option.value && {
                          color: colors.primary,
                          fontWeight: '600',
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text style={[styles.activityOptionDesc, { color: colors.textSecondary }]}>{option.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Training Frequency Section (EAT) */}
          <View style={styles.section}>
            <SectionHeader title={t('settings.yourWorkouts')} dynamicStyle={dynamicStyles.sectionHeader} />
            <View style={[styles.card, dynamicStyles.card]}>
              <Text style={[styles.label, dynamicStyles.label, { marginBottom: spacing.s }]}>
                {t('onboarding.daysTrainingQuestion')}
              </Text>
              <View style={styles.activityLevelContainer}>
                {(
                  [
                    {
                      value: 'none',
                      label: t('settings.noneOrLittle'),
                      desc: t('settings.sedentaryDesc'),
                    },
                    {
                      value: 'occasional',
                      label: t('settings.occasional'),
                      desc: t('settings.occasionalDesc'),
                    },
                    {
                      value: 'frequent',
                      label: t('settings.frequent'),
                      desc: t('settings.frequentDesc'),
                    },
                    {
                      value: 'athlete',
                      label: t('settings.proAthlete'),
                      desc: t('settings.athleteDesc'),
                    },
                  ] as const
                ).map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.activityOption,
                      { backgroundColor: colors.background },
                      trainingFrequency === option.value && [
                        styles.activityOptionSelected,
                        {
                          borderColor: colors.primary,
                          backgroundColor: isDark ? colors.surface : '#E8F4FD',
                        },
                      ],
                    ]}
                    onPress={() => setTrainingFrequency(option.value)}
                  >
                    <Text
                      style={[
                        styles.activityOptionLabel,
                        { color: colors.textPrimary },
                        trainingFrequency === option.value && {
                          color: colors.primary,
                          fontWeight: '600',
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text style={[styles.activityOptionDesc, { color: colors.textSecondary }]}>{option.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Member Since */}
          <Text style={styles.infoText}>
            {t('settings.memberSince')}
            {profile?.created_at ? format(new Date(profile.created_at), 'dd/MM/yyyy') : '-'}
          </Text>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.button, (updating || updatingGlobal) && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={updating || updatingGlobal}
          >
            {updating || updatingGlobal ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>{t('settings.saveChanges')}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    ...formLayout.settings,
    padding: spacing.m,
    paddingBottom: 120,
  },
  section: {
    marginBottom: spacing.l,
  },
  sectionHeader: {
    ...typography.caption,
    marginBottom: spacing.s,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.m,
    padding: spacing.m,
    ...shadows.soft,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: spacing.m,
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.border,
  },
  avatarLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -50,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  changeAvatarButton: {
    marginTop: spacing.s,
  },
  changeAvatarText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: spacing.m,
  },
  label: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.s,
    color: colors.textPrimary,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.s,
    padding: spacing.m,
    fontSize: 16,
    color: colors.textPrimary,
  },
  disabledInput: {
    color: colors.textSecondary,
  },
  sexContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
  },
  sexOption: {
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  sexOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sexText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  sexTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
  unitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s,
  },
  unitLabel: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  unitOptions: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  unitOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    gap: spacing.xs,
  },
  unitOptionSelected: {
    backgroundColor: '#E8F4FD',
  },
  unitOptionText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  unitOptionTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  infoText: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.m,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.m,
    paddingVertical: spacing.m,
    alignItems: 'center',
    ...shadows.soft,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  headerSaveButton: {
    minWidth: 64,
    minHeight: 44,
    paddingHorizontal: spacing.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSaveText: {
    ...typography.body,
    fontWeight: '700',
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  // New styles for Meal Schedule
  mealTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s,
  },
  mealLabel: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.s,
    paddingVertical: 4,
    borderRadius: borderRadius.s,
  },
  timeText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  // Modal & Picker Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: colors.white,
    paddingBottom: 30, // SafeArea
    borderTopLeftRadius: borderRadius.l,
    borderTopRightRadius: borderRadius.l,
    ...shadows.soft,
  },
  iosPickerToolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iosPickerDone: {
    paddingHorizontal: spacing.s,
  },
  iosPickerDoneText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 17,
  },
  iosPicker: {
    height: 200,
    backgroundColor: colors.white,
  },
  // Activity Level styles
  activityLevelContainer: {
    gap: spacing.s,
  },
  activityOption: {
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    borderColor: 'transparent',
    position: 'relative',
  },
  activityOptionSelected: {
    borderWidth: 2,
  },
  activityOptionLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  activityOptionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  // Dropdown styles
  dropdownContainer: {
    paddingVertical: spacing.s,
  },
  dropdownLabel: {
    marginBottom: spacing.xs + 2,
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.s,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  dropdownButtonText: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  dropdownIcon: {
    // Rotation handled inline
  },
  dropdownIconOpen: {
    transform: [{ rotate: '180deg' }],
  },
  dropdownMenu: {
    marginTop: spacing.xs,
    borderRadius: borderRadius.s,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.m,
  },
  dropdownMenuItemText: {
    fontSize: 16,
    color: colors.textPrimary,
  },
});
