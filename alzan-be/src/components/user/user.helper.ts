import { User } from '../../types/requests.types';

export function makeUserFollowNotificationData(user: User) {
  return {
    follower_id: user.id,
    follower_name: user.display_name || user.email,
    follower_avatar: user.avatar_url,
    follower_username: user.username,
  };
}
