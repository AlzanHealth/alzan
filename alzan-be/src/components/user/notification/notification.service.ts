import { Injectable, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { Notification, NotificationDataMap } from '../../../types/requests.types';

export type CreateNotificationDto = Omit<Notification, 'id' | 'created_at' | 'read_at' | 'data'> & {
  data: NotificationDataMap[Notification['type']];
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly supabaseAdminService: SupabaseAdminService) {}

  async createNotification(notification: CreateNotificationDto) {
    try {
      const { data, error } = await this.supabaseAdminService.client
        .from('notifications')
        .insert([notification])
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      this.logger.warn(error);
      return null;
      // don't throw the error because it's not critical for the app to work
    }
  }
}
