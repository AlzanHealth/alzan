import { Controller, Get } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { UserContext, UserCtx } from '../../../common/decorators/request-context.decorator';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getNotifications(@UserContext() ctx: UserCtx) {
    return this.notificationService.getNotifications(ctx);
  }
}
