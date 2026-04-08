export type UserFollowNotificationData = {
  follower_id: string;
  follower_name?: string;
  follower_avatar?: string;
  follower_username?: string;
};

export interface NotificationDataMap {
  USER_FOLLOW_REQUEST: UserFollowNotificationData;
  USER_FOLLOW_REQUEST_ACCEPTED: UserFollowNotificationData;
  USER_FOLLOW_REQUEST_REJECTED: UserFollowNotificationData;
}
