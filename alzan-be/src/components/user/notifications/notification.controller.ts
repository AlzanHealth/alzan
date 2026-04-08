import { Controller, Get, Param, Patch } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { UserContext, UserCtx } from '../../../common/decorators/request-context.decorator';
import { NotificationDto } from './dto/notifications.output-dto';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getNotifications(@UserContext() ctx: UserCtx): Promise<NotificationDto[]> {
    return this.notificationService.getNotifications(ctx);
  }

  @Patch('/:notificationId')
  async markAsRead(
    @UserContext() ctx: UserCtx,
    @Param('notificationId') notificationId: string,
  ): Promise<NotificationDto> {
    return this.notificationService.markAsRead(ctx, notificationId);
  }
}
