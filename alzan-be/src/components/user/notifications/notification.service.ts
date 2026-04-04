import { Injectable } from '@nestjs/common';
import { UserCtx } from '../../../common/decorators/request-context.decorator';

@Injectable()
export class NotificationService {
  getNotifications(_ctx: UserCtx) {
    return [];
  }
}
