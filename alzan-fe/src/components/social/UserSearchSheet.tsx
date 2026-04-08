import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Search, UserCheck, UserPlus } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { LiquidGlassModal } from '../LiquidGlassModal';
import { useUserSearch } from '../../hooks/useUserSearch';
import { UserProfileDto } from '../../openapi/generated/alzan-be/types.gen';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { User } from '../../openapi/generated/alzan-be/sdk.gen';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { TabParamList } from '../../types/navigation.types';

interface UserSearchSheetProps {
  visible: boolean;
  onClose: () => void;
}

export const UserSearchSheet: React.FC<UserSearchSheetProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const navigation = useNavigation<StackNavigationProp<any>>();

  const { searchResults, isLoading, handleSearch, searchQuery, refetch } = useUserSearch();

  // Mutations for follow/unfollow mapping exactly to the swagger endpoints
  const followMutation = useMutation({
    mutationFn: (userId: string) => User.followUser({ path: { userId } }),
    onSuccess: () => {
      // Invalidate the search cache to naturally refetch the updated relationships
      queryClient.invalidateQueries({ queryKey: ['user-search'] });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: (userId: string) => User.unfollowUser({ path: { userId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-search'] });
    },
  });

  const onFollowToggle = useCallback(
    (user: UserProfileDto) => {
      if (user.is_following) {
        unfollowMutation.mutate(user.id);
      } else {
        followMutation.mutate(user.id);
      }
    },
    [followMutation, unfollowMutation],
  );

  const navigateToProfile = useCallback(
    (user: UserProfileDto) => {
      onClose();
      // Temporarily navigate without modifying profile screen heavily
      navigation.navigate('AlzanProfile', { userId: user.id });
    },
    [navigation, onClose],
  );

  const renderUserItem = (user: UserProfileDto) => {
    return (
      <TouchableOpacity
        key={user.id}
        style={[styles.userItem, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)' }]}
        onPress={() => navigateToProfile(user)}
        activeOpacity={0.7}
      >
        <View style={styles.iconContainer}>
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.defaultAvatar, { backgroundColor: isDark ? '#2C2C2E' : '#E5E5EA' }]}>
              <Text style={styles.initials}>{(user.display_name || user.username || 'A')[0].toUpperCase()}</Text>
            </View>
          )}
        </View>

        <View style={styles.contentContainer}>
          <Text style={[styles.text, { color: colors.textPrimary }]} numberOfLines={1}>
            {user.display_name || user.username}
          </Text>
          <Text style={[styles.usernameText, { color: colors.textSecondary }]} numberOfLines={1}>
            @{user.username} • {user.followers_count} {t('alzan.followers')}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.followBtn,
            user.is_following
              ? { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }
              : { backgroundColor: colors.primary },
          ]}
          onPress={e => {
            e.stopPropagation();
            onFollowToggle(user);
          }}
          disabled={followMutation.isPending || unfollowMutation.isPending}
        >
          {user.is_following ? (
            <UserCheck size={18} color={isDark ? '#FFF' : '#000'} />
          ) : (
            <UserPlus size={18} color="#FFF" />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <LiquidGlassModal visible={visible} onClose={onClose} height="80%">
      <View style={styles.container}>
        {/* Search Bar Input */}
        <View
          style={[styles.searchContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.6)' }]}
        >
          <Search size={20} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder={t('alzan.searchPlaceholder' as any) || 'Buscar usuarios...'}
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={handleSearch}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : searchResults && searchResults.length > 0 ? (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {searchResults.map(renderUserItem)}
          </ScrollView>
        ) : (
          <View style={styles.centerContainer}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {searchQuery.length > 0 ? t('alzan.noUsersFound' as any) : t('alzan.searchPrompt' as any)}
            </Text>
          </View>
        )}
      </View>
    </LiquidGlassModal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 16,
    borderRadius: 16,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
  },
  iconContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  defaultAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    fontSize: 20,
    fontWeight: '600',
    color: '#8E8E93',
  },
  contentContainer: {
    flex: 1,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  usernameText: {
    fontSize: 14,
  },
  followBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
