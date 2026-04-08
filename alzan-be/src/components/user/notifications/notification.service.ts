import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { UserCtx } from '../../../common/decorators/request-context.decorator';

@Injectable()
export class NotificationService {
  constructor() {}

  async getNotifications(ctx: UserCtx) {
    const { supabase } = ctx;
    const { data, error } = await supabase.from('notifications').select('*').eq('user_id', ctx.user.id);

    if (error) {
      throw new InternalServerErrorException(error.message, { cause: error });
    }

    return data;
  }

  async markAsRead(ctx: UserCtx, notificationId: string) {
    const { supabase } = ctx;

    const { data, error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message, { cause: error });
    }

    return data;
  }
}
