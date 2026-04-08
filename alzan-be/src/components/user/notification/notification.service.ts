import { Injectable } from '@nestjs/common';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { Notification } from '../../../types/requests.types';
import { UserFollowNotificationData } from '../../../types/notifications.types';

export type CreateNotificationDto = Omit<Notification, 'id' | 'created_at' | 'read_at'>;

@Injectable()
export class NotificationService {
  constructor(private readonly supabaseAdminService: SupabaseAdminService) {}

  async createFollowRequestNotification(userId: string, data: UserFollowNotificationData) {
    await this.createNotification({
      user_id: userId,
      type: 'USER_FOLLOW_REQUEST',
      data,
    });
  }

  async createFollowRequestAcceptedNotification(userId: string, data: UserFollowNotificationData) {
    await this.createNotification({
      user_id: userId,
      type: 'USER_FOLLOW_REQUEST_ACCEPTED',
      data,
    });
  }

  async createFollowRequestRejectedNotification(userId: string, data: UserFollowNotificationData) {
    await this.createNotification({
      user_id: userId,
      type: 'USER_FOLLOW_REQUEST_REJECTED',
      data,
    });
  }

  private async createNotification(notification: CreateNotificationDto) {
    const { data, error } = await this.supabaseAdminService.client
      .from('notifications')
      .insert([notification])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }
}
