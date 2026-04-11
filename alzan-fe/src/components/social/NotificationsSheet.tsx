import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { Bell, CheckSquare, X, UserPlus, CheckCircle, XCircle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { LiquidGlassModal } from '../LiquidGlassModal';
import { useNotifications } from '../../hooks/useNotifications';
import { getDateFnsLocale } from '../../i18n/dateLocale';
import { Notification, NotificationType } from '../../types/requests.types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { User } from '../../openapi/generated/alzan-be/sdk.gen';

interface NotificationsSheetProps {
  visible: boolean;
  onClose: () => void;
}

export const NotificationsSheet: React.FC<NotificationsSheetProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const { notifications, isLoading, markAsRead, markAllAsRead, deleteNotification, unreadCount } = useNotifications();

  const acceptMutation = useMutation({
    mutationFn: (followerId: string) => User.acceptFollowRequest({ path: { userId: followerId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (followerId: string) => User.rejectFollowRequest({ path: { userId: followerId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Mark all as read when opened? Let's leave that to the button or individual taps.
  // The user asked to take into account "mark as read".

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'USER_FOLLOW_REQUEST':
        return <UserPlus size={24} color="#0A84FF" />;
      case 'USER_FOLLOW_REQUEST_ACCEPTED':
        return <CheckCircle size={24} color="#34C759" />;
      case 'USER_FOLLOW_REQUEST_REJECTED':
        return <XCircle size={24} color="#FF3B30" />;
      default:
        return <Bell size={24} color={colors.primary} />;
    }
  };

  const getNotificationText = (notification: Notification) => {
    const data = notification.data;
    const followerName = data?.follower_name || 'Alguien';

    switch (notification.type) {
      case 'USER_FOLLOW_REQUEST':
        return `${followerName} ha solicitado seguirte.`;
      case 'USER_FOLLOW_REQUEST_ACCEPTED':
        return `${followerName} ha aceptado tu solicitud.`;
      case 'USER_FOLLOW_REQUEST_REJECTED':
        return `${followerName} ha rechazado tu solicitud.`;
      default:
        return 'Tienes una nueva notificación.';
    }
  };

  const renderNotification = (notification: Notification) => {
    const isUnread = !notification.read_at;
    const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
      addSuffix: true,
      locale: getDateFnsLocale(),
    });

    const data = notification.data;
    const avatar = data?.follower_avatar;
    const isFollowRequest = notification.type === 'USER_FOLLOW_REQUEST';
    const isMutating = acceptMutation.isPending || rejectMutation.isPending;

    return (
      <TouchableOpacity
        key={notification.id}
        style={[
          styles.notificationItem,
          { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)' },
          isUnread && { backgroundColor: isDark ? 'rgba(10,132,255,0.1)' : 'rgba(10,132,255,0.05)' },
        ]}
        onPress={() => {
          if (isUnread) markAsRead(notification.id);
          // Here we could also navigate to the user profile
        }}
        activeOpacity={0.7}
      >
        <View style={styles.iconContainer}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.defaultAvatar, { backgroundColor: isDark ? '#2C2C2E' : '#E5E5EA' }]}>
              {getNotificationIcon(notification.type)}
            </View>
          )}
          {isUnread && <View style={styles.unreadDot} />}
        </View>

        <View style={styles.contentContainer}>
          <Text style={[styles.text, { color: colors.textPrimary }, isUnread && styles.textUnread]}>
            {getNotificationText(notification)}
          </Text>
          <Text style={[styles.timeText, { color: colors.textSecondary }]}>{timeAgo}</Text>

          {/* Accept / Reject actions for follow requests */}
          {isFollowRequest && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionAccept]}
                disabled={isMutating}
                onPress={e => {
                  e.stopPropagation();
                  const followerId = data?.follower_id;
                  if (followerId) {
                    acceptMutation.mutate(followerId);
                    markAsRead(notification.id);
                  }
                }}
              >
                {acceptMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.actionAcceptText}>Aceptar</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionReject, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}
                disabled={isMutating}
                onPress={e => {
                  e.stopPropagation();
                  const followerId = data?.follower_id;
                  if (followerId) {
                    rejectMutation.mutate(followerId);
                    markAsRead(notification.id);
                  }
                }}
              >
                {rejectMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <Text style={[styles.actionRejectText, { color: colors.textSecondary }]}>Rechazar</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={e => {
            e.stopPropagation();
            deleteNotification(notification.id);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <LiquidGlassModal visible={visible} onClose={onClose} height="85%">
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('navigation.notifications')}</Text>
          <View style={styles.headerActions}>
            {unreadCount > 0 && (
              <TouchableOpacity style={styles.markAllButton} onPress={() => markAllAsRead()}>
                <CheckSquare size={18} color={colors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Content */}
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : notifications.length === 0 ? (
            <View style={styles.centerContainer}>
              <Bell size={48} color={colors.textSecondary} opacity={0.3} style={{ marginBottom: 16 }} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('social.noNotifications')}</Text>
            </View>
          ) : (
            notifications.map(renderNotification)
          )}
        </ScrollView>
      </View>
    </LiquidGlassModal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  markAllButton: {
    padding: 4,
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  centerContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  iconContainer: {
    position: 'relative',
    marginRight: 16,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0A84FF',
    borderWidth: 2,
    borderColor: '#fff',
  },
  contentContainer: {
    flex: 1,
  },
  text: {
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 4,
  },
  textUnread: {
    fontWeight: '600',
  },
  timeText: {
    fontSize: 12,
  },
  deleteButton: {
    marginLeft: 12,
    padding: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionAccept: {
    backgroundColor: '#0A84FF',
  },
  actionAcceptText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  actionReject: {
    // dynamic background applied inline
  },
  actionRejectText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
