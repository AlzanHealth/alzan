import React, { useState, createContext, useContext, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Search, Plus, Flame } from 'lucide-react-native';
import { PulseCard } from '../../components/social/PulseCard';
import {
  RunnerIcon,
  LifterIcon,
  CyclistIcon,
  SwimmerIcon,
  HikerIcon,
  FootballPlayerIcon,
  BasketballPlayerIcon,
  TennisPlayerIcon,
} from '../../components/icons/SportIcons';
import { SPORT_COLORS } from '../../theme/sportColors';
import { AlzanRefreshControl, useRefresh } from '../../components/common/AlzanRefreshControl';
import { AlzanFeedCard } from '../../components/social/AlzanFeedCard';
import { useAlzanStyles } from '../../hooks/useAlzanStyles';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { TabParamList } from '../../types/navigation.types';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react-native';
import { NotificationsSheet } from '../../components/social/NotificationsSheet';
import { UserSearchSheet } from '../../components/social/UserSearchSheet';
import { useNotifications } from '../../hooks/useNotifications';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================================================
// MOCK DATA - Solo para diseño, sin funcionalidad
// ============================================================================

const MOCK_USER = {
  id: '1',
  name: 'Josep',
  avatar: 'https://i.pravatar.cc/150?img=3',
};

const MOCK_PULSES = [
  {
    id: '1',
    isOwn: true,
    userName: 'Yo',
    avatar: 'https://i.pravatar.cc/150?img=3',
    achievement: 'Racha',
    value: '7 Días',
    gradient: ['#FF9A56', '#FF6B9D'], // Fire gradient for Streak
    icon: <Flame size={80} color="white" strokeWidth={1.5} />,
  },
  {
    id: '2',
    isOwn: true,
    userName: 'Yo',
    avatar: 'https://i.pravatar.cc/150?img=3',
    achievement: 'Running',
    value: '5km',
    gradient: [SPORT_COLORS.running || '#E9A73C', '#F5CD87'],
    icon: <RunnerIcon size={80} color="white" strokeWidth={1.5} />,
  },
  {
    id: '3',
    isOwn: false,
    userName: 'Ana',
    avatar: 'https://i.pravatar.cc/150?img=5',
    achievement: 'Nuevo PR',
    value: '10km',
    gradient: [SPORT_COLORS.cycling || '#E56353', '#F29B8F'],
    icon: <CyclistIcon size={80} color="white" strokeWidth={1.5} />,
  },
  {
    id: '4',
    isOwn: false,
    userName: 'Carlos',
    avatar: 'https://i.pravatar.cc/150?img=8',
    achievement: 'Gym',
    value: '2h',
    gradient: [SPORT_COLORS.gym || '#007AFF', '#5AC8FA'],
    icon: <LifterIcon size={80} color="white" strokeWidth={1.5} />,
  },
  {
    id: '5',
    isOwn: false,
    userName: 'Sofía',
    avatar: 'https://i.pravatar.cc/150?img=9',
    achievement: 'Piscina',
    value: '1.5km',
    gradient: [SPORT_COLORS.swimming || '#34AADC', '#81D4FA'],
    icon: <SwimmerIcon size={80} color="white" strokeWidth={1.5} />,
  },
  {
    id: '6',
    isOwn: false,
    userName: 'Marc',
    avatar: 'https://i.pravatar.cc/150?img=11',
    achievement: 'Ruta',
    value: '12km',
    gradient: [SPORT_COLORS.hiking || '#A9825A', '#D7BFA6'],
    icon: <HikerIcon size={80} color="white" strokeWidth={1.5} />,
  },
  {
    id: '7',
    isOwn: false,
    userName: 'Laura',
    avatar: 'https://i.pravatar.cc/150?img=12',
    achievement: 'Partido',
    value: 'Gol!',
    gradient: [SPORT_COLORS.football || '#2E7D32', '#66BB6A'],
    icon: <FootballPlayerIcon size={80} color="white" strokeWidth={1.5} />,
  },
  {
    id: '8',
    isOwn: false,
    userName: 'David',
    avatar: 'https://i.pravatar.cc/150?img=15',
    achievement: 'Basket',
    value: '22pts',
    gradient: [SPORT_COLORS.basketball || '#FF9500', '#FFCC80'],
    icon: <BasketballPlayerIcon size={80} color="white" strokeWidth={1.5} />,
  },
  {
    id: '9',
    isOwn: false,
    userName: 'Elena',
    avatar: 'https://i.pravatar.cc/150?img=20',
    achievement: 'Tenis',
    value: 'Set',
    gradient: [SPORT_COLORS.tennis || '#F2D648', '#FFF176'],
    icon: <TennisPlayerIcon size={80} color="white" strokeWidth={1.5} />,
  },
];

const MOCK_FEED_POSTS = [
  {
    id: '1',
    user: {
      name: 'Ana García',
      avatar: 'https://i.pravatar.cc/150?img=5',
      isFollowing: false,
    },
    timestamp: 'Ayer, 18:30',
    workoutTitle: 'Rodaje suave',
    sportName: 'Running',
    description: 'Rodaje suave por el parque. ¡Día perfecto para correr! 🏃‍♀️',
    type: 'cardio',
    stats: {
      distance: '10.5',
      distanceUnit: 'km',
      pace: '5:30',
      paceUnit: '/km',
      time: '58m',
      timeUnit: '10s',
    },
    kudos: 24,
    comments: 5,
  },
  {
    id: '2',
    user: {
      name: 'Carlos Ruiz',
      avatar: 'https://i.pravatar.cc/150?img=8',
      isFollowing: true,
    },
    timestamp: 'Hoy, 09:15',
    workoutTitle: 'Push Day',
    sportName: 'Gym',
    description: 'Sesión intensa de pecho y hombros 💪',
    type: 'gym',
    stats: {
      time: '1h',
      timeUnit: '15m',
      calories: '450',
      caloriesUnit: 'kcal',
      exercises: '12',
      exercisesUnit: 'Ejercicios',
    },
    muscles: ['Pecho', 'Hombro', 'Tríceps', 'Core'],
    kudos: 18,
    comments: 3,
  },
  {
    id: '3',
    user: {
      name: 'Laura Martín',
      avatar: 'https://i.pravatar.cc/150?img=9',
    },
    workoutName: 'Ciclismo - Ruta montaña',
    timestamp: 'Hace 2 días',
    type: 'cardio',
    stats: {
      distance: '45.2',
      distanceUnit: 'km',
      pace: '28.5',
      paceUnit: 'km/h',
      time: '1h',
      timeUnit: '35m',
    },
    kudos: 56,
    comments: 12,
  },
];

// ============================================================================
// COMPONENTES
// ============================================================================

// Alzan Theme Context for child components
type AlzanThemeContextType = ReturnType<typeof useAlzanStyles>;
const AlzanThemeContext = createContext<AlzanThemeContextType | null>(null);
const useAlzanTheme = () => {
  const context = useContext(AlzanThemeContext);
  if (!context) throw new Error('useAlzanTheme must be used within AlzanThemeContext');
  return context;
};

// Header con Avatar, Toggle y Acciones
const Header = ({
  onOpenNotifications,
  onOpenSearch,
}: {
  onOpenNotifications: () => void;
  onOpenSearch: () => void;
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'siguiendo' | 'global'>('siguiendo');
  const { styles: themeStyles, isDark } = useAlzanTheme();
  const { unreadCount } = useNotifications();

  return (
    <View style={styles.header}>
      {/* Avatar izquierda */}
      <TouchableOpacity style={styles.avatarContainer}>
        <Image source={{ uri: MOCK_USER.avatar }} style={styles.headerAvatar} />
      </TouchableOpacity>

      {/* Toggle Central */}
      <View style={styles.toggleContainer}>
        <BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={styles.toggleBlur}>
          <View
            style={[
              styles.toggleInner,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)' },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.toggleButton,
                activeTab === 'siguiendo' && [
                  styles.toggleButtonActive,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)' },
                ],
              ]}
              onPress={() => setActiveTab('siguiendo')}
            >
              <Text
                style={[
                  styles.toggleText,
                  themeStyles.headerTitle,
                  activeTab === 'siguiendo' && styles.toggleTextActive,
                ]}
              >
                {t('alzan.following')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                activeTab === 'global' && [
                  styles.toggleButtonActive,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)' },
                ],
              ]}
              onPress={() => setActiveTab('global')}
            >
              <Text
                style={[styles.toggleText, themeStyles.headerTitle, activeTab === 'global' && styles.toggleTextActive]}
              >
                {t('alzan.global')}
              </Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </View>

      {/* Iconos derecha */}
      <View style={styles.headerActions}>
        <TouchableOpacity
          style={[styles.headerIcon, { backgroundColor: themeStyles.headerIconBg }]}
          onPress={onOpenSearch}
        >
          <Search size={22} color={themeStyles.headerIconColor} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerIcon, { backgroundColor: themeStyles.headerIconBg }]}
          onPress={onOpenNotifications}
        >
          <Bell size={22} color={themeStyles.headerIconColor} />
          {unreadCount > 0 && (
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Sección de Pulses
const PulseSection = () => {
  const { t } = useTranslation();
  // El primer Pulse siempre es del usuario actual
  const hasOwnPulse = MOCK_PULSES.some(p => p.isOwn);
  const otherPulses = MOCK_PULSES.filter(p => !p.isOwn);
  const ownPulses = MOCK_PULSES.filter(p => p.isOwn);

  return (
    <View style={styles.pulseSection}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pulseScrollContent}>
        {/* Tu Pulse siempre primero - si no tienes ninguno, muestra el botón para crear */}
        {hasOwnPulse ? (
          // Mostrar tu primer pulse
          <PulseCard
            avatar={MOCK_USER.avatar}
            achievement={ownPulses[0]?.achievement || t('alzan.pulse')}
            value={ownPulses[0]?.value || ''}
            gradient={(ownPulses[0]?.gradient as [string, string]) || ['#8E8E93', '#AEAEB2']}
            icon={ownPulses[0]?.icon}
          />
        ) : (
          // Si no tienes pulses, mostrar tu avatar con botón de crear
          <TouchableOpacity style={styles.pulseCardOwn} activeOpacity={0.8}>
            <LinearGradient
              colors={['#8E8E93', '#AEAEB2']}
              style={styles.pulseOwnGradient}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
            >
              <View style={styles.ownAvatarBorder}>
                <Image source={{ uri: MOCK_USER.avatar }} style={styles.ownAvatar} />
              </View>
              <View style={styles.createPulseButton}>
                <Plus size={16} color="#fff" strokeWidth={2.5} />
              </View>
              <Text style={styles.createPulseText}>{t('alzan.create')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Otros pulses propios (si hay más de uno) */}
        {ownPulses.slice(1).map(pulse => (
          <PulseCard
            key={pulse.id}
            avatar={pulse.avatar}
            achievement={pulse.achievement}
            value={pulse.value}
            gradient={pulse.gradient as [string, string]}
            icon={pulse.icon}
          />
        ))}

        {/* Pulses de otros usuarios */}
        {otherPulses.map(pulse => (
          <PulseCard
            key={pulse.id}
            avatar={pulse.avatar}
            achievement={pulse.achievement}
            value={pulse.value}
            gradient={pulse.gradient as [string, string]}
            icon={pulse.icon}
          />
        ))}
      </ScrollView>
    </View>
  );
};

// Feed Section
const FeedSection = () => {
  return (
    <View style={styles.feedSection}>
      {MOCK_FEED_POSTS.map(post => (
        <AlzanFeedCard key={post.id} post={post} />
      ))}
    </View>
  );
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export const AlzanHomeScreen = () => {
  const { refreshing, onRefresh } = useRefresh();
  const alzanTheme = useAlzanStyles();
  const { styles: themeStyles } = alzanTheme;
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const scrollViewRef = useRef<ScrollView>(null);
  const [isNotificationsVisible, setIsNotificationsVisible] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      });
    });

    return unsubscribe;
  }, [navigation]);

  return (
    <AlzanThemeContext.Provider value={alzanTheme}>
      <View style={[styles.container, { backgroundColor: themeStyles.containerBackground }]}>
        {/* Aurora Background */}
        <View style={[styles.baseBackground, { backgroundColor: themeStyles.baseBackground }]} />

        {/* Top Orb (Blue Light) */}
        <View style={styles.topOrb}>
          <LinearGradient
            colors={themeStyles.topOrbColors}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />
        </View>

        {/* Bottom Orb (Violet Depth) */}
        <View style={styles.bottomOrb}>
          <LinearGradient
            colors={themeStyles.bottomOrbColors}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />
        </View>

        <SafeAreaView style={styles.safeArea}>
          {/* Fixed Header */}
          <Header
            onOpenNotifications={() => setIsNotificationsVisible(true)}
            onOpenSearch={() => setIsSearchVisible(true)}
          />

          {/* Scrollable Content with Pull-to-Refresh */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<AlzanRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            <PulseSection />
            <FeedSection />
          </ScrollView>

          <NotificationsSheet visible={isNotificationsVisible} onClose={() => setIsNotificationsVisible(false)} />
          <UserSearchSheet visible={isSearchVisible} onClose={() => setIsSearchVisible(false)} />
        </SafeAreaView>
      </View>
    </AlzanThemeContext.Provider>
  );
};

// ============================================================================
// ESTILOS
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  baseBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F5F7FA',
  },
  topOrb: {
    position: 'absolute',
    top: -100,
    left: -50,
    width: SCREEN_WIDTH * 1.5,
    height: 400,
    borderRadius: SCREEN_WIDTH,
    transform: [{ rotate: '-20deg' }],
    overflow: 'hidden',
  },
  bottomOrb: {
    position: 'absolute',
    bottom: -100,
    right: -50,
    width: SCREEN_WIDTH * 1.5,
    height: 500,
    borderRadius: SCREEN_WIDTH,
    transform: [{ rotate: '20deg' }],
    overflow: 'hidden',
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  headerAvatar: {
    width: '100%',
    height: '100%',
  },
  toggleContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  toggleBlur: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  toggleInner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 20,
    padding: 4,
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  toggleButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(26,26,46,0.5)',
  },
  toggleTextActive: {
    color: '#1a1a2e',
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeContainer: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F5F7FA',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },

  // Section Title
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 12,
    paddingHorizontal: 16,
  },

  // Pulse Section
  pulseSection: {
    marginTop: 20,
  },
  pulseScrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  // Tu Pulse propio
  ownPulseContainer: {
    position: 'relative',
  },
  addPulseButton: {
    position: 'absolute',
    bottom: 8,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  pulseCardOwn: {
    width: 75,
    height: 110,
    borderRadius: 38,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  pulseOwnGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  ownAvatarBorder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  ownAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  createPulseButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  createPulseText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
    textTransform: 'uppercase',
  },

  feedSection: {
    marginTop: 28,
  },
});

export default AlzanHomeScreen;
