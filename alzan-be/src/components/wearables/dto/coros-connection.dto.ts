import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CorosCapabilityDto {
  @ApiProperty()
  @Expose()
  enabled!: boolean;

  @ApiProperty({ enum: ['disabled', 'pilot', 'public'] })
  @Expose()
  mode!: 'disabled' | 'pilot' | 'public';
}

export class CorosDisconnectDto {
  @ApiProperty()
  @Expose()
  disconnected!: boolean;

  @ApiProperty()
  @Expose()
  remote_deauthorization_pending!: boolean;
}
