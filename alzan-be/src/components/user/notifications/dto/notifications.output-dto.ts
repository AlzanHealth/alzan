import { Expose } from 'class-transformer';
import { NotificationType } from '../../../../types/request.types';
import { Json } from '../../../../types/database.types';

export class NotificationDto {
  @Expose()
  id!: string;

  @Expose()
  user_id!: string;

  @Expose()
  type!: NotificationType;

  @Expose()
  data!: Json;

  @Expose()
  created_at!: string;

  @Expose()
  read_at!: string | null;
}
