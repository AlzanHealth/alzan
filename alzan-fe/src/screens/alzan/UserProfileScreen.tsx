import React, { useState, createContext, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  Settings,
  Play,
  Trophy,
  MapPin,
  Activity,
  Dumbbell,
  Navigation,
  Flame,
  Timer,
  Zap,
  Target,
  TrendingUp,
  Grid3X3,
  UserCheck,
  UserPlus,
  Lock,
  LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useRoute, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AlzanRefreshControl, useRefresh } from '../../components/common/AlzanRefreshControl';
import { useAlzanStyles } from '../../hooks/useAlzanStyles';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { User } from '../../openapi/generated/alzan-be/sdk.gen';
import { UserProfileDto } from '../../openapi/generated/alzan-be/types.gen';
import { RootStackParamList } from '../../types/navigation.types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================================================
// THEME CONTEXT
// ============================================================================

type AlzanThemeContextType = ReturnType<typeof useAlzanStyles>;
const AlzanThemeContext = createContext<AlzanThemeContextType | null>(null);
const useAlzanTheme = () => {
  const ctx = useContext(AlzanThemeContext);
  if (!ctx) throw new Error('useAlzanTheme must be used within AlzanThemeContext');
  return ctx;
};

// ============================================================================
// MOCK DATA (replaced gradually as features ship)
// ============================================================================

const MOCK_WEEKLY_STATS = {
  all: { activities: 12, distance: 42, time: '8h 45m', calories: 3200, avgPace: '5:30', longestRun: '10.5km' },
  running: { activities: 5, distance: 35, time: '4h 10m', calories: 2100, avgPace: '5:15', longestRun: '10.5km' },
  gym: { activities: 4, distance: 0, time: '3h 30m', calories: 800, avgPace: '-', longestRun: '-' },
  cycling: { activities: 3, distance: 7, time: '1h 05m', calories: 300, avgPace: '25.0', longestRun: '7km' },
};

interface Activity {
  id: string;
  type: 'running' | 'gym' | 'challenge';
  distance?: string;
  exercises?: string;
}

const MOCK_ACTIVITIES: Activity[] = [
  { id: '1', type: 'running', distance: '5k' },
  { id: '2', type: 'gym', exercises: '8' },
  { id: '3', type: 'challenge' },
  { id: '4', type: 'running', distance: '3k' },
  { id: '5', type: 'gym', exercises: '6' },
  { id: '6', type: 'running', distance: '12k' },
  { id: '7', type: 'gym', exercises: '7' },
  { id: '8', type: 'running', distance: '4k' },
  { id: '9', type: 'challenge' },
];

const MOCK_PULSES = [
  { id: '1', gradient: ['#FF9A56', '#FF6B9D'] as const, title: 'Racha', value: '7' },
  { id: '2', gradient: ['#E9A73C', '#F5CD87'] as const, title: 'Semana', value: '42' },
  { id: '3', gradient: ['#4A90D9', '#81D4FA'] as const, title: 'Mejor', value: '3:45' },
];

const MOCK_BADGES = [
  { id: '1', unlocked: true, emoji: '🌅' },
  { id: '2', unlocked: true, emoji: '📅' },
  { id: '3', unlocked: true, emoji: '⚡' },
  { id: '4', unlocked: true, emoji: '🏃' },
  { id: '5', unlocked: false, emoji: '💪' },
  { id: '6', unlocked: false, emoji: '🦾' },
];

const MOCK_PRS = [
  { label: 'Mejor 1k', value: '3:45' },
  { label: 'Mejor 5k', value: '21:30' },
  { label: 'Mejor 10k', value: '42:00' },
  { label: 'Sentadilla', value: '120kg' },
];

// ============================================================================
// HEADER
// ============================================================================

const ProfileHeader = ({ isOwnProfile, username }: { isOwnProfile: boolean; username?: string | null }) => {
  const { styles: themeStyles } = useAlzanTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

  return (
    <View style={styles.header}>
      {isOwnProfile ? (
        // Own profile: brand name centred, settings on right
        <>
          <View style={styles.headerSpacer} />
          <Text style={[styles.headerTitle, themeStyles.headerTitle]}>{t('alzan.brandName')}</Text>
          <TouchableOpacity style={[styles.headerIconBtn, { backgroundColor: themeStyles.headerIconBg }]}>
            <Settings size={22} color={themeStyles.headerIconColor} />
          </TouchableOpacity>
        </>
      ) : (
        // Other profile: back button on left, @username centred
        <>
          <TouchableOpacity
            style={[styles.headerIconBtn, { backgroundColor: themeStyles.headerIconBg }]}
            onPress={() => navigation.goBack()}
          >
            <ChevronLeft size={24} color={themeStyles.headerIconColor} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, themeStyles.headerTitle]} numberOfLines={1}>
            {username ? `@${username}` : ''}
          </Text>
          <View style={styles.headerSpacer} />
        </>
      )}
    </View>
  );
};

// ============================================================================
// PROFILE HERO (avatar + name + follow button + stats)
// ============================================================================

const ProfileHero = ({
  profile,
  isOwnProfile,
  userId,
  onWeeklyPress,
  isWeeklyExpanded,
}: {
  profile?: UserProfileDto | null;
  isOwnProfile: boolean;
  userId: string;
  onWeeklyPress: () => void;
  isWeeklyExpanded: boolean;
}) => {
  const { t } = useTranslation();
  const { styles: themeStyles, colors, isDark } = useAlzanTheme();
  const queryClient = useQueryClient();

  const displayName = profile?.display_name ?? profile?.username ?? '—';
  const username = profile?.username ?? '—';
  const avatarUrl = profile?.avatar_url;
  const followersCount = profile?.followers_count ?? 0;
  const followingCount = profile?.following_count ?? 0;
  const isFollowing = profile?.is_following ?? false;

  const followMutation = useMutation({
    mutationFn: () => User.followUser({ path: { userId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-profile', userId] }),
  });

  const unfollowMutation = useMutation({
    mutationFn: () => User.unfollowUser({ path: { userId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-profile', userId] }),
  });

  const isMutating = followMutation.isPending || unfollowMutation.isPending;

  return (
    <View style={styles.heroWrapper}>
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        <View style={[styles.avatarRing, themeStyles.avatarGlow]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: isDark ? '#2C2C2E' : '#E5E5EA' }]}>
              <Text style={styles.avatarInitial}>{displayName[0]?.toUpperCase() ?? '?'}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.displayName, themeStyles.profileName]}>{displayName}</Text>
        <Text style={[styles.usernameText, themeStyles.profileBio]}>@{username}</Text>
      </View>

      {/* Follow / Unfollow — only for other users */}
      {!isOwnProfile && (
        <TouchableOpacity
          style={[
            styles.followBtn,
            isFollowing
              ? { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }
              : { backgroundColor: colors.primary },
          ]}
          onPress={() => (isFollowing ? unfollowMutation.mutate() : followMutation.mutate())}
          disabled={isMutating}
          activeOpacity={0.8}
        >
          {isMutating ? (
            <ActivityIndicator size="small" color={isFollowing ? colors.textPrimary : '#fff'} />
          ) : isFollowing ? (
            <>
              <UserCheck size={18} color={isDark ? '#fff' : '#000'} />
              <Text style={[styles.followBtnText, { color: isDark ? '#fff' : '#000' }]}>{t('alzan.following')}</Text>
            </>
          ) : (
            <>
              <UserPlus size={18} color="#fff" />
              <Text style={[styles.followBtnText, { color: '#fff' }]}>{t('alzan.follow')}</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <TouchableOpacity style={[styles.statCard, themeStyles.statCard]}>
          <Text style={[styles.statValue, themeStyles.statValue]}>{followingCount}</Text>
          <Text style={[styles.statLabel, themeStyles.statLabel]}>{t('alzan.followingCount')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.statCard, themeStyles.statCard]}>
          <Text style={[styles.statValue, themeStyles.statValue]}>{followersCount}</Text>
          <Text style={[styles.statLabel, themeStyles.statLabel]}>{t('alzan.followers')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.statCard,
            themeStyles.statCard,
            isWeeklyExpanded && [styles.statCardActive, themeStyles.statCardActive],
          ]}
          onPress={onWeeklyPress}
        >
          <Text style={[styles.statValue, themeStyles.statValue, isWeeklyExpanded && themeStyles.statValueActive]}>
            {MOCK_WEEKLY_STATS.all.activities}
          </Text>
          <Text style={[styles.statLabel, themeStyles.statLabel, isWeeklyExpanded && themeStyles.statLabelActive]}>
            {t('alzan.thisWeek')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ============================================================================
// WEEKLY SUMMARY
// ============================================================================

const WeeklySummary = () => {
  const { t } = useTranslation();
  const { styles: themeStyles, colors, isDark } = useAlzanTheme();
  const [selected, setSelected] = useState<keyof typeof MOCK_WEEKLY_STATS>('all');
  const { preferences } = useUserPreferences();
  const stats = MOCK_WEEKLY_STATS[selected];

  const Pill = ({
    id,
    label,
    icon: Icon,
  }: {
    id: keyof typeof MOCK_WEEKLY_STATS;
    label: string;
    icon?: LucideIcon;
  }) => (
    <TouchableOpacity
      onPress={() => setSelected(id)}
      style={[
        styles.pill,
        selected === id && {
          backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)',
          borderColor: colors.primary,
        },
      ]}
    >
      {Icon && <Icon size={14} color={selected === id ? colors.primary : colors.textSecondary} />}
      <Text
        style={[
          styles.pillText,
          { color: selected === id ? colors.primary : colors.textSecondary },
          selected === id && { fontWeight: '600' },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.weeklySummaryWrapper}>
      <View style={[styles.weeklySummaryCard, themeStyles.inlineSummaryCard]}>
        <View style={styles.weeklyHeader}>
          <View style={styles.weeklyTitleRow}>
            <TrendingUp size={16} color="#4A90D9" />
            <Text style={[styles.weeklyTitle, themeStyles.inlineSummaryTitle]}>{t('alzan.weeklySummary')}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Pill id="all" label={t('alzan.all')} />
            <Pill id="running" label={t('constants.running')} icon={Activity} />
            <Pill id="gym" label={t('alzan.gym')} icon={Dumbbell} />
            <Pill id="cycling" label={t('alzan.bike')} icon={Zap} />
          </ScrollView>
        </View>
        <View style={styles.weeklyGrid}>
          {[
            { icon: Target, color: '#34C759', value: stats.activities, label: t('alzan.activitiesAbbr') },
            { icon: MapPin, color: '#FF9500', value: stats.distance, label: preferences.distance_unit },
            { icon: Timer, color: '#AF52DE', value: stats.time, label: t('alzan.time') },
            { icon: Flame, color: '#FF3B30', value: stats.calories, label: t('nutrition.kcal') },
          ].map((item, i, arr) => (
            <React.Fragment key={i}>
              <View style={styles.weeklyStat}>
                <item.icon size={16} color={item.color} />
                <Text style={[styles.weeklyStatValue, themeStyles.inlineSummaryValue]}>{item.value}</Text>
                <Text style={[styles.weeklyStatLabel, themeStyles.inlineSummaryLabel]}>{item.label}</Text>
              </View>
              {i < arr.length - 1 && <View style={styles.weeklyDivider} />}
            </React.Fragment>
          ))}
        </View>
        <View style={[styles.weeklyExtra, themeStyles.inlineExtraRow]}>
          <Text style={[styles.weeklyExtraLabel, themeStyles.inlineExtraLabel]}>{t('alzan.avgPace')}</Text>
          <Text style={[styles.weeklyExtraValue, themeStyles.inlineExtraValue]}>
            {stats.avgPace}/{preferences.distance_unit}
          </Text>
        </View>
        <View style={[styles.weeklyExtra, themeStyles.inlineExtraRow]}>
          <Text style={[styles.weeklyExtraLabel, themeStyles.inlineExtraLabel]}>{t('alzan.longestRun')}</Text>
          <Text style={[styles.weeklyExtraValue, themeStyles.inlineExtraValue]}>{stats.longestRun}</Text>
        </View>
      </View>
    </View>
  );
};

// ============================================================================
// TAB SELECTOR
// ============================================================================

type TabType = 'posts' | 'clips' | 'saved';

const TabSelector = ({ active, onChange }: { active: TabType; onChange: (t: TabType) => void }) => {
  const { styles: themeStyles } = useAlzanTheme();
  return (
    <View style={[styles.tabsContainer, { backgroundColor: themeStyles.tabsContainerBg }]}>
      <View style={[styles.tabsBackground, { backgroundColor: themeStyles.tabsBackgroundBg }]}>
        {(['posts', 'clips', 'saved'] as TabType[]).map(tab => {
          const Icon = tab === 'posts' ? Grid3X3 : tab === 'clips' ? Play : Trophy;
          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabBtn,
                active === tab && [styles.tabBtnActive, { backgroundColor: themeStyles.tabButtonActiveBg }],
              ]}
              onPress={() => onChange(tab)}
            >
              <Icon size={18} color={active === tab ? themeStyles.tabIconActiveColor : themeStyles.tabIconColor} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// ============================================================================
// GRID / TABS CONTENT
// ============================================================================

const GridItem = ({ item, index }: { item: (typeof MOCK_ACTIVITIES)[0]; index: number }) => {
  const { t } = useTranslation();
  if (item.type === 'running') {
    return (
      <View style={styles.gridItem}>
        <View style={styles.gridMapBg}>
          <View style={[styles.gridRoute, { transform: [{ rotate: `${index * 45}deg` }] }]} />
          <View style={styles.gridPin}>
            <Navigation size={12} color="#fff" fill="#fff" />
          </View>
        </View>
        <View style={styles.gridTypeIcon}>
          <MapPin size={10} color="#fff" />
        </View>
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={styles.gridOverlay}>
          <Text style={styles.gridOverlayText}>{item.distance}</Text>
        </LinearGradient>
      </View>
    );
  }
  if (item.type === 'gym') {
    return (
      <View style={styles.gridItem}>
        <View style={[styles.gridGymBg, { backgroundColor: index % 2 === 0 ? '#2a2a2a' : '#1a1a2e' }]}>
          <Activity size={32} color="#ffffff50" />
        </View>
        <View style={styles.gridTypeIcon}>
          <Dumbbell size={10} color="#fff" />
        </View>
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={styles.gridOverlay}>
          <Text style={styles.gridOverlayText}>
            {item?.exercises ? `${item.exercises}${t('alzan.previousRecordAbbr')}` : ''}
          </Text>
        </LinearGradient>
      </View>
    );
  }
  return (
    <View style={[styles.gridItem, { backgroundColor: '#000' }]}>
      <Image source={{ uri: `https://picsum.photos/200?random=${index}` }} style={{ width: '100%', height: '100%' }} />
      <View style={styles.challengeBadge}>
        <Text style={styles.challengeBadgeText}>{t('alzan.challengeAllCaps')}</Text>
      </View>
    </View>
  );
};

const PostsGrid = () => (
  <View style={styles.gridContainer}>
    {MOCK_ACTIVITIES.map((item, i) => (
      <GridItem key={item.id} item={item} index={i} />
    ))}
  </View>
);

const ClipsTab = () => {
  const { t } = useTranslation();
  return (
    <View style={styles.emptyTab}>
      <Play size={48} color="#ccc" />
      <Text style={styles.emptyTabText}>{t('alzan.comingSoon')}</Text>
    </View>
  );
};

const LogrosTab = () => {
  const { t } = useTranslation();
  return (
    <View style={styles.logros}>
      <View style={styles.pulseRow}>
        {MOCK_PULSES.map(p => (
          <LinearGradient key={p.id} colors={p.gradient} style={styles.pulseCard}>
            <Text style={styles.pulseValue}>{p.value}</Text>
            <Text style={styles.pulseTitle}>{p.title}</Text>
          </LinearGradient>
        ))}
      </View>
      <Text style={styles.sectionHeader}>{t('alzan.medals')}</Text>
      <View style={styles.badgesRow}>
        {MOCK_BADGES.map(b => (
          <View key={b.id} style={[styles.badgeItem, !b.unlocked && { opacity: 0.3 }]}>
            <Text style={{ fontSize: 24 }}>{b.emoji}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.sectionHeader}>{t('alzan.records')}</Text>
      <View style={styles.prList}>
        {MOCK_PRS.map((pr, i) => (
          <View key={i} style={styles.prRow}>
            <Text style={styles.prLabel}>{pr.label}</Text>
            <Text style={styles.prValue}>{pr.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// ============================================================================
// PRIVATE PROFILE GATE
// ============================================================================

const PrivateGate = ({ displayName }: { displayName: string }) => {
  const { styles: themeStyles, colors } = useAlzanTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.gateContainer}>
      <View style={[styles.gateLockCircle, { backgroundColor: colors.primary + '1A' }]}>
        <Lock size={32} color={colors.primary} />
      </View>
      <Text style={[styles.gateTitle, themeStyles.profileName]}>{t('alzan.privateProfile')}</Text>
      <Text style={[styles.gateSubtitle, themeStyles.profileBio]}>
        {t('alzan.followPrivateProfile', { displayName })}
      </Text>
    </View>
  );
};

// ============================================================================
// MAIN SCREEN
// ============================================================================

export const UserProfileScreen: React.FC = () => {
  const { user: authUser } = useAuth();

  // Read userId from route params (stack push) or fall back to own ID (tab)
  const route = useRoute();
  const routeUserId = (route.params as { userId?: string } | undefined)?.userId;
  const userId = routeUserId ?? authUser?.id ?? '';

  const isOwnProfile = userId === authUser?.id;

  const { refreshing, onRefresh } = useRefresh();
  const alzanTheme = useAlzanStyles();
  const { styles: themeStyles } = alzanTheme;
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [showWeekly, setShowWeekly] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      const res = await User.getUserById({ path: { userId } });
      return res.data ?? null;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });

  // Privacy gate: only block OTHER users whose profile we're not following
  const isLocked = !isOwnProfile && !!profile && !profile.is_following;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'posts':
        return <PostsGrid />;
      case 'clips':
        return <ClipsTab />;
      case 'saved':
        return <LogrosTab />;
    }
  };

  return (
    <AlzanThemeContext.Provider value={alzanTheme}>
      <View style={[styles.container, { backgroundColor: themeStyles.containerBackground }]}>
        {/* Aurora background */}
        <View style={[styles.bg, { backgroundColor: themeStyles.baseBackground }]} />
        <View style={styles.topOrb}>
          <LinearGradient
            colors={themeStyles.topOrbColors}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />
        </View>
        <View style={styles.bottomOrb}>
          <LinearGradient
            colors={themeStyles.bottomOrbColors}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />
        </View>

        <SafeAreaView style={styles.safeArea}>
          <ProfileHeader isOwnProfile={isOwnProfile} username={profile?.username} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            refreshControl={<AlzanRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {isLoading ? (
              <View style={styles.loader}>
                <ActivityIndicator size="large" color={themeStyles.headerIconColor} />
              </View>
            ) : (
              <>
                <ProfileHero
                  profile={profile}
                  isOwnProfile={isOwnProfile}
                  userId={userId}
                  onWeeklyPress={() => setShowWeekly(w => !w)}
                  isWeeklyExpanded={showWeekly}
                />

                {isLocked ? (
                  <PrivateGate displayName={profile?.display_name ?? profile?.username ?? 'este usuario'} />
                ) : (
                  <>
                    {showWeekly && <WeeklySummary />}
                    <TabSelector active={activeTab} onChange={setActiveTab} />
                    <View style={styles.contentArea}>{renderTabContent()}</View>
                  </>
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </AlzanThemeContext.Provider>
  );
};

export default UserProfileScreen;

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject },
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
  safeArea: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 120 },
  loader: { paddingTop: 80, alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', textAlign: 'center', marginHorizontal: 8 },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { width: 40 },

  // Hero
  heroWrapper: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 12 },
  avatarContainer: { alignItems: 'center', marginBottom: 16 },
  avatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    padding: 3,
    backgroundColor: '#fff',
    marginBottom: 12,
    shadowColor: '#4A90D9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 5,
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 50 },
  avatarFallback: { width: '100%', height: '100%', borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 36, fontWeight: '700', color: '#8E8E93' },
  displayName: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  usernameText: { fontSize: 13 },
  followBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 140,
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 4,
  },
  followBtnText: { fontSize: 15, fontWeight: '600' },
  statsRow: { flexDirection: 'row', width: '100%', gap: 12, marginTop: 16 },
  statCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  statCardActive: {},
  statValue: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  statLabel: { fontSize: 11, fontWeight: '500' },

  // Weekly summary
  weeklySummaryWrapper: { paddingHorizontal: 16, marginTop: 16 },
  weeklySummaryCard: {
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  weeklyHeader: { marginBottom: 16, gap: 12 },
  weeklyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weeklyTitle: { fontSize: 15, fontWeight: '700' },
  weeklyGrid: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  weeklyStat: { flex: 1, alignItems: 'center', gap: 4 },
  weeklyStatValue: { fontSize: 16, fontWeight: '700' },
  weeklyStatLabel: { fontSize: 11, fontWeight: '500' },
  weeklyDivider: { width: 1, height: 30, backgroundColor: '#eee' },
  weeklyExtra: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  weeklyExtraLabel: { fontSize: 13 },
  weeklyExtraValue: { fontSize: 13, fontWeight: '600' },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillText: { fontSize: 12, fontWeight: '500' },

  // Tabs
  tabsContainer: { paddingHorizontal: 16, paddingBottom: 16, marginTop: 16 },
  tabsBackground: { flexDirection: 'row', borderRadius: 30, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 24 },
  tabBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  contentArea: { paddingHorizontal: 16, minHeight: 400 },

  // Grid
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: {
    width: (SCREEN_WIDTH - 32 - 24) / 3,
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: '#fff',
    overflow: 'hidden',
    position: 'relative',
  },
  gridMapBg: { flex: 1, backgroundColor: '#A8C8E8', alignItems: 'center', justifyContent: 'center' },
  gridGymBg: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gridRoute: { width: 40, height: 3, backgroundColor: '#fff', borderRadius: 2 },
  gridPin: { position: 'absolute', backgroundColor: '#4A90D9', padding: 4, borderRadius: 10 },
  gridTypeIcon: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, paddingTop: 16 },
  gridOverlayText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  challengeBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: '#4A90D9',
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
  },
  challengeBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  // Logros
  logros: { paddingBottom: 20 },
  pulseRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  pulseCard: { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center' },
  pulseValue: { color: '#fff', fontWeight: '700', fontSize: 16 },
  pulseTitle: { color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600', marginTop: 2 },
  sectionHeader: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', marginBottom: 12 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  badgeItem: {
    width: 50,
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  prList: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  prRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  prLabel: { fontSize: 14, color: '#666' },
  prValue: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },

  // Empty tab
  emptyTab: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyTabText: { color: '#999', marginTop: 8, fontWeight: '500' },

  // Private gate
  gateContainer: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 48, paddingBottom: 24 },
  gateLockCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  gateTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  gateSubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
