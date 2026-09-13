import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CorosCapabilityDto {
  @ApiProperty()
  @Expose()
  enabled!: boolean;

  @ApiProperty({ enum: ['disabled', 'pilot', 'public'] })
  @Expose()
  mode!: 'disabled' | 'pilot' | 'public';

  @ApiProperty({ enum: ['ready', 'not_configured', 'restricted'] })
  @Expose()
  reason!: 'ready' | 'not_configured' | 'restricted';
}

export class CorosDisconnectDto {
  @ApiProperty()
  @Expose()
  disconnected!: boolean;

  @ApiProperty()
  @Expose()
  remote_deauthorization_pending!: boolean;
}
