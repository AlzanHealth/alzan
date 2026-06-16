import React, { useRef, useEffect, useState } from 'react';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Image, Dimensions } from 'react-native';
import { Home, Dumbbell, Apple, Heart, PlayCircle, MessageCircle, User } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { LiquidGlassFooter } from '../components/common/LiquidGlassFooter';
import { LinearGradient } from 'expo-linear-gradient';
import { TabBarLayoutProvider, useTabBarLayout } from './tabBarLayout';

import { HomeScreen } from '../screens/home/HomeScreen';
import { TrainingStack } from './TrainingStack';
import { NutritionNavigator } from './NutritionNavigator';
import { HealthNavigator } from './HealthNavigator';
import { SettingsNavigator } from './SettingsNavigator';

// Alzan mode screens
import { AlzanHomeScreen } from '../screens/alzan/AlzanHomeScreen';
import { ClipsScreen } from '../screens/alzan/ClipsScreen';
import { MessagesScreen } from '../screens/alzan/MessagesScreen';
import { UserProfileScreen } from '../screens/alzan/UserProfileScreen';
import IconA from '../../assets/iconA.png';
import { TranslationKey } from '../i18n/locales/en';

export type TabConfig = {
  name: string;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ color: string; size: number }>;
  isAlzanSwitch?: boolean;
};

export type CustomTabBarProps = {
  state: BottomTabBarProps['state'];
  navigation: BottomTabBarProps['navigation'];
  isAlzanMode: boolean;
  setIsAlzanMode: (value: boolean) => void;
};

const Tab = createBottomTabNavigator();

const AlzanIcon = ({ color, size }: { color: string; size: number }) => (
  <Image
    source={IconA}
    style={{
      width: size,
      height: size,
      tintColor: color,
      transform: [{ scale: 1.3 }],
    }}
    resizeMode="contain"
  />
);

// Main tabs configuration (Normal App)
const mainTabsConfig: TabConfig[] = [
  { name: 'Home', labelKey: 'tabs.home', icon: Home },
  { name: 'Training', labelKey: 'tabs.training', icon: Dumbbell },
  { name: 'AlzanToggle', labelKey: 'alzan.name', icon: AlzanIcon, isAlzanSwitch: true },
  { name: 'Nutrition', labelKey: 'tabs.nutrition', icon: Apple },
  { name: 'Health', labelKey: 'tabs.health', icon: Heart },
];

// Alzan tabs configuration (Social Mode)
const socialTabsConfig: TabConfig[] = [
  { name: 'AlzanHome', labelKey: 'alzan.activity', icon: Home },
  { name: 'Clips', labelKey: 'alzan.clips', icon: PlayCircle },
  { name: 'AppToggle', labelKey: 'alzan.name', icon: AlzanIcon, isAlzanSwitch: true },
  { name: 'Messages', labelKey: 'alzan.messages', icon: MessageCircle },
  { name: 'AlzanProfile', labelKey: 'navigation.profile', icon: User },
];

const CustomTabBar = ({ state, navigation, isAlzanMode, setIsAlzanMode }: CustomTabBarProps) => {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { setTopFromScreenBottom } = useTabBarLayout();
  const containerRef = useRef<View>(null);

  // Measure the floating bar's real on-screen position so overlays can sit above
  // it on any device/orientation/platform (no hardcoded height or margin).
  const measureTabBarPosition = () => {
    containerRef.current?.measureInWindow((_x, y, _w, height) => {
      if (height <= 0) return;
      const screenHeight = Dimensions.get('window').height;
      setTopFromScreenBottom(Math.round(screenHeight - y));
    });
  };

  const tabsConfig = isAlzanMode ? socialTabsConfig : mainTabsConfig;
  const totalTabs = tabsConfig.length;

  // State to store accurate width measurements
  const [layoutWidth, setLayoutWidth] = useState(0);
  const tabWidth = layoutWidth > 0 ? layoutWidth / totalTabs : 0;

  // Get current active index based on route name matching config
  const currentRouteName = state.routes[state.index].name;

  // Find the index in the current config that matches the current route
  // Or if it's the toggle button, we need to handle that visually?
  // Actually, the toggle button is a tab in the config.
  // The route "AlzanToggle" or "AppToggle" acts as the Tab.Screen for the switch.
  const activeIndex = tabsConfig.findIndex(tab => tab.name === currentRouteName);

  // Animation for the pill
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Handle slide animation
  useEffect(() => {
    if (tabWidth > 0 && activeIndex !== -1) {
      Animated.spring(slideAnim, {
        toValue: activeIndex * tabWidth,
        useNativeDriver: true,
        tension: 70,
        friction: 10,
      }).start();
    }
  }, [activeIndex, tabWidth, slideAnim]);

  // Dynamic styles based on theme
  const dynamicStyles = {
    pillGradientColors: isDark
      ? (['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.06)'] as const)
      : (['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.5)'] as const),
    pillHighlight: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.7)',
      opacity: isDark ? 0.3 : 0.6,
    },
  };

  const handleTabPress = (tabConfig: TabConfig, _routeKey?: string) => {
    if (tabConfig.isAlzanSwitch) {
      // Toggle Mode
      const newMode = !isAlzanMode;
      setIsAlzanMode(newMode);

      // Force navigation to the new mode's home screen
      // We use setTimeout to allow the Navigator to re-render with the new routes
      setTimeout(() => {
        navigation.navigate(newMode ? 'AlzanHome' : 'Home');
      }, 0);
      return;
    }

    // Normal Navigation
    // We need to find the route key for this tab name in the current state
    // But since we are rebuilding the usage, let's look at `state.routes`
    const route = state.routes.find(r => r.name === tabConfig.name);

    if (route) {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });

      if (!event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    }
  };

  return (
    <View ref={containerRef} style={styles.container} onLayout={measureTabBarPosition}>
      <LiquidGlassFooter borderRadius={40} style={{ ...styles.blurContainer, height: 75 }}>
        <View
          style={styles.contentContainer}
          onLayout={e => {
            const { width } = e.nativeEvent.layout;
            if (Math.abs(width - layoutWidth) > 1) {
              setLayoutWidth(width);
            }
          }}
        >
          {/* The "Liquid" Active Pill */}
          {tabWidth > 0 && activeIndex !== -1 && (
            <Animated.View
              style={[
                styles.activePillContainer,
                {
                  width: tabWidth,
                  transform: [{ translateX: slideAnim }],
                },
              ]}
            >
              <LinearGradient
                colors={dynamicStyles.pillGradientColors}
                style={styles.activePill}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              >
                <View style={[styles.pillHighlight, dynamicStyles.pillHighlight]} />
              </LinearGradient>
            </Animated.View>
          )}

          {/* Tabs */}
          {tabsConfig.map((tabConfig, index) => {
            const isFocused = activeIndex === index;

            const iconColor = tabConfig.isAlzanSwitch
              ? colors.primary
              : isFocused
                ? colors.primary
                : colors.textSecondary;

            const Icon = tabConfig.icon;
            const iconSize = tabConfig.isAlzanSwitch ? 32 : isFocused ? 26 : 24;
            const wrapperStyle = [
              styles.iconWrapper,
              isFocused && !tabConfig.isAlzanSwitch && styles.iconWrapperActive,
            ];

            return (
              <TouchableOpacity
                key={tabConfig.name}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={() => handleTabPress(tabConfig)}
                style={styles.tabButton}
                activeOpacity={0.7}
              >
                <View style={wrapperStyle}>
                  <Icon color={iconColor} size={iconSize} />
                  <Text
                    style={[
                      styles.label,
                      {
                        color: iconColor,
                        opacity: isFocused || tabConfig.isAlzanSwitch ? 1 : 0.6,
                        fontWeight: isFocused ? '700' : '500',
                      },
                    ]}
                  >
                    {t(tabConfig.labelKey)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </LiquidGlassFooter>
    </View>
  );
};

// Dummy component for the toggle tab since it never actually renders a screen
const ModeTogglePlaceholder = () => <View style={{ flex: 1, backgroundColor: 'transparent' }} />;

export const TabNavigator = () => {
  const [isAlzanMode, setIsAlzanMode] = useState(false);

  return (
    <TabBarLayoutProvider>
      <View style={{ flex: 1 }}>
        <Tab.Navigator
          tabBar={props => <CustomTabBar {...props} isAlzanMode={isAlzanMode} setIsAlzanMode={setIsAlzanMode} />}
          screenOptions={{
            headerShown: false,
          }}
        >
          {isAlzanMode ? (
            // === SOCIAL MODE TABS ===
            <>
              <Tab.Screen name="AlzanHome" component={AlzanHomeScreen} />
              <Tab.Screen name="Clips" component={ClipsScreen} />
              <Tab.Screen name="AppToggle" component={ModeTogglePlaceholder} />
              <Tab.Screen name="Messages" component={MessagesScreen} />
              <Tab.Screen name="AlzanProfile" component={UserProfileScreen} />
            </>
          ) : (
            // === NORMAL APP TABS ===
            <>
              <Tab.Screen name="Home" component={HomeScreen} />
              <Tab.Screen name="Training" component={TrainingStack} />
              <Tab.Screen name="AlzanToggle" component={ModeTogglePlaceholder} />
              <Tab.Screen name="Nutrition" component={NutritionNavigator} />
              <Tab.Screen name="Health" component={HealthNavigator} />
            </>
          )}
          {/* Settings always available but hidden from tab bar? 
            Actually, Settings is usually accessed via Profile or separated.
            Legacy code had it. Let's keep it if needed, or maybe it's accessible via Profile now.
            In the user request "Perfil" loads "UserProfileScreen (Self)".
            I'll add Settings back as a hidden tab to be safe for navigation links.
        */}
          <Tab.Screen name="Settings" component={SettingsNavigator} options={{ tabBarButton: () => null }} />
        </Tab.Navigator>
      </View>
    </TabBarLayoutProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    height: 75,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 15,
    borderRadius: 40,
  },
  blurContainer: {
    flex: 1,
    borderRadius: 40,
    overflow: 'hidden',
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  // The "Pill" container
  activePillContainer: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 0,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  activePill: {
    flex: 1,
    width: '100%',
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  pillHighlight: {
    width: '90%',
    height: '45%',
    position: 'absolute',
    top: 2,
    borderRadius: 20,
    opacity: 0.6,
  },
  tabButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    height: '100%',
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ scale: 1 }],
  },
  iconWrapperActive: {
    transform: [{ scale: 1.1 }],
  },
  label: {
    fontSize: 9,
    marginTop: 4,
  },
});
