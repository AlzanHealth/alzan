import { Expose } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CorosWorkoutPushDto {
  @ApiProperty({ type: 'array', items: { type: 'object' }, maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @IsObject({ each: true })
  sportDataList!: Array<Record<string, unknown>>;
}

export class CorosWebhookResponseDto {
  @ApiProperty({ enum: ['ok'] })
  @Expose()
  message!: 'ok';

  @ApiProperty({ enum: ['0000'] })
  @Expose()
  result!: '0000';
}

export class CorosWebhookStatusDto {
  @ApiProperty({ enum: ['ok'] })
  @Expose()
  status!: 'ok';
}
